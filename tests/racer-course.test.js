// tests/racer-course.test.js
/* global describe, test, expect */
'use strict';

const geolib = require('geolib');
const {courseReview, signedDegrees} = require('../course');

const ORIGIN = {latitude: -33.85, longitude: 151.25};
// A point the given metres north and east of the origin.
const at = (north, east) => geolib.computeDestinationPoint(
    geolib.computeDestinationPoint(ORIGIN, north, 0), east, 90);

// Start, a windward mark 1000m north, a leeward mark back at the start, a finish 500m east.
const points = [
    {name: 'Start', position: at(0, 0)},
    {name: 'Windward', position: at(1000, 0)},
    {name: 'Leeward', position: at(0, 0)},
    {name: 'Finish', position: at(0, 500)},
];
const DEG = Math.PI / 180;

describe('course review', () => {
    test('leg headings and lengths from the previous point', () => {
        const {rows} = courseReview({points});
        expect(rows.map(r => r.name)).toEqual(['Start', 'Windward', 'Leeward', 'Finish']);
        expect(rows[0].legHeading).toBeNull();
        expect(rows[1].legHeading).toBeCloseTo(0, 0);
        expect(rows[1].legLength).toBeCloseTo(1000, -1);
        expect(rows[2].legHeading).toBeCloseTo(180, 0);
        expect(rows[3].legHeading).toBeCloseTo(90, 0);
        expect(rows[3].legLength).toBeCloseTo(500, -1);
        // Not the active route: no status, and no position, no BTW/DTW.
        expect(rows[1].status).toBeNull();
        expect(rows[1].btw).toBeNull();
    });

    test('the TWA on each leg in the current wind, positive with the wind to starboard', () => {
        // A northerly with a little east in it.
        const {rows} = courseReview({points, twd: 10 * DEG});
        expect(rows[1].legTwa).toBeCloseTo(10, 0);   // beating, starboard tack
        expect(rows[2].legTwa).toBeCloseTo(-170, 0); // running, port gybe
        expect(rows[3].legTwa).toBeCloseTo(-80, 0);  // reaching, port tack
    });

    test('the active route: status, BTW/DTW and distance remaining', () => {
        const position = at(500, 0);
        const {rows, remaining} = courseReview({points, pointIndex: 1, position, twd: 0});
        expect(rows.map(r => r.status)).toEqual(['passed', 'next', 'ahead', 'ahead']);
        expect(rows[1].btw).toBeCloseTo(0, 0);
        expect(rows[1].dtw).toBeCloseTo(500, -1);
        expect(rows[1].btwTwa).toBeCloseTo(0, 0);
        // 500 to the windward mark, 1000 back down, 500 to the finish.
        expect(remaining).toBeCloseTo(2000, -1);
    });

    test('a reversed route is sailed from its last point', () => {
        const {rows} = courseReview({points, reverse: true, pointIndex: 1, position: at(0, 0)});
        expect(rows.map(r => r.name)).toEqual(['Finish', 'Leeward', 'Windward', 'Start']);
        expect(rows[1].legHeading).toBeCloseTo(270, 0);
    });

    test('signed degrees', () => {
        expect(signedDegrees(190)).toBeCloseTo(-170);
        expect(signedDegrees(-190)).toBeCloseTo(170);
        expect(signedDegrees(360)).toBeCloseTo(0);
    });
});

describe('course review endpoint', () => {
    const waypoint = (name, {latitude, longitude}) =>
        ({name, feature: {geometry: {type: 'Point', coordinates: [longitude, latitude]}}});

    function startPlugin(selfPaths, server = {}) {
        const waypoints = {
            w0: waypoint('Start', points[0].position),
            // Moved 100m east since the route was made.
            w1: waypoint('Windward', at(1000, 100)),
        };
        const route = {
            name: 'Course 1',
            feature: {
                geometry: {type: 'LineString', coordinates: points.map(p => [p.position.longitude, p.position.latitude])},
                properties: {coordinatesMeta: [
                    {href: '/resources/waypoints/w0'},
                    {href: '/resources/waypoints/w1'},
                    {name: 'Bottom'},
                    {},
                ]},
            },
        };
        const app = {
            selfId: 'test',
            debug: () => {},
            error: () => {},
            setPluginStatus: () => {},
            getSelfPath: (path) => selfPaths[path],
            registerPutHandler: () => {},
            subscriptionmanager: {subscribe: () => {}},
            resourcesApi: {
                listResources: (type) => Promise.resolve(type === 'routes' ? {r1: route} : {}),
                getResource: (type, id) => type === 'routes'
                    ? (id === 'r1' ? Promise.resolve(route) : Promise.reject(new Error('no route')))
                    : Promise.resolve(waypoints[id]),
                setResource: () => Promise.resolve(),
            },
            handleMessage: () => {},
            ...server,
        };
        const plugin = require('../index')(app);
        plugin.start({startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300, lines: []});
        let handler;
        plugin.registerWithRouter({get: (path, h) => { if (path === '/course') handler = h; }});
        const get = (query = {}) => new Promise((resolve) => handler({query}, {
            json: resolve,
            status: () => ({json: resolve}),
        }));
        return {plugin, get};
    }

    test('reports the active route with names, moved waypoints and the published next point', async () => {
        const {plugin, get} = startPlugin({
            'navigation.course.activeRoute': {value: {href: '/resources/routes/r1', pointIndex: 1, pointTotal: 4, reverse: false}},
            'navigation.position': {value: at(500, 0)},
            'environment.wind.directionTrue': {value: 0},
            'navigation.courseGreatCircle.nextPoint.bearingTrue': {value: 0.01, $source: 'n2k.3'},
            'navigation.courseGreatCircle.nextPoint.distance': {value: 498, $source: 'n2k.3'},
        });
        const body = await get();
        expect(body.routeId).toBe('r1');
        expect(body.routes).toEqual([{id: 'r1', name: 'Course 1'}]);
        expect(body.route.active).toBe(true);
        expect(body.route.rows.map(r => r.name)).toEqual(['Start', 'Windward', 'Bottom', null]);
        expect(body.route.rows[1].status).toBe('next');
        expect(body.route.rows[1].moved).toBeCloseTo(100, -1);
        expect(body.route.rows[0].moved).toBeNull();
        expect(body.nextPoint).toEqual([{label: 'Great circle', bearing: 0.01, distance: 498, source: 'n2k.3'}]);
        expect(body.nextLeg).toEqual({heading: null, twa: null});
        plugin.stop();
    });

    test("finds the active route from the server's Course API", async () => {
        const {plugin, get} = startPlugin({'navigation.position': {value: at(500, 0)}}, {
            getCourse: () => Promise.resolve({activeRoute: {href: '/resources/routes/r1', pointIndex: 2, pointTotal: 4, reverse: false}}),
        });
        const body = await get();
        expect(body.activeId).toBe('r1');
        expect(body.route.active).toBe(true);
        expect(body.route.rows[2].status).toBe('next');
        plugin.stop();
    });

    test('reports the current, as the spec object or as separate paths', async () => {
        const object = startPlugin({'environment.current': {value: {setTrue: 1, drift: 0.5}, $source: 'sim'}});
        expect((await object.get()).current).toEqual({set: 1, drift: 0.5, source: 'sim'});
        object.plugin.stop();
        const paths = startPlugin({
            'environment.current': {drift: {value: 0.3}},
            'environment.current.drift': {value: 0.3, $source: 'derived-data'},
            'environment.current.setMagnetic': {value: 1},
            'navigation.magneticVariation': {value: 0.2},
        });
        const body = await paths.get();
        expect(body.current.set).toBeCloseTo(1.2, 6);
        expect(body.current.drift).toBe(0.3);
        expect(body.current.source).toBe('derived-data');
        paths.plugin.stop();
        const none = startPlugin({});
        expect((await none.get()).current).toBeNull();
        none.plugin.stop();
    });

    test('reviews another route without status, and works with no route at all', async () => {
        const {plugin, get} = startPlugin({'navigation.position': {value: at(0, 0)}});
        const other = await get({route: 'r1'});
        expect(other.route.active).toBe(false);
        expect(other.route.rows[1].status).toBeNull();
        expect(other.route.rows[1].dtw).toBeCloseTo(1000, -1);
        const none = await get();
        expect(none.route).toBeNull();
        expect(none.nextPoint).toEqual([]);
        plugin.stop();
    });
});

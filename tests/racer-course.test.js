// tests/racer-course.test.js
/* global describe, test, expect */
'use strict';

const geolib = require('geolib');
const {courseReview, legSailing, sailingTotals, signedDegrees} = require('../course');

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

    test('works out the TWAs for a wind set on the page instead of the live wind', async () => {
        const {plugin, get} = startPlugin({
            'navigation.course.activeRoute': {value: {href: '/resources/routes/r1', pointIndex: 1, pointTotal: 4, reverse: false}},
            'navigation.position': {value: at(500, 0)},
            'environment.wind.directionTrue': {value: 0},
            'environment.wind.speedTrue': {value: 5},
        });
        const live = await get();
        expect(live).toMatchObject({twd: 0, tws: 5, liveTwd: 0, liveTws: 5});
        const set = await get({twd: String(Math.PI / 2), tws: '3'});
        expect(set).toMatchObject({twd: Math.PI / 2, tws: 3, liveTwd: 0, liveTws: 5});
        // Every leg's TWA turns with the wind.
        live.route.rows.forEach((row, i) => {
            if (row.legTwa == null) return expect(set.route.rows[i].legTwa).toBeNull();
            const turned = ((row.legTwa + 90) % 360 + 540) % 360 - 180;
            expect(set.route.rows[i].legTwa).toBeCloseTo(turned, 6);
        });
        // A wind that is not a number is ignored.
        expect(await get({twd: 'x', tws: '3'})).toMatchObject({twd: 0, tws: 5});
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

describe('legSailing', () => {
    const angles = {beatAngle: 40, gybeAngle: 145};

    test('classifies by the tack and gybe angles', () => {
        expect(legSailing(30, 1000, angles).kind).toBe('beat');
        expect(legSailing(-39, 1000, angles).kind).toBe('beat');
        expect(legSailing(41, 1000, angles).kind).toBe('reach');
        expect(legSailing(-144, 1000, angles).kind).toBe('reach');
        expect(legSailing(146, 1000, angles).kind).toBe('run');
        expect(legSailing(-180, 1000, angles).kind).toBe('run');
    });

    test('without the angles, tacking and gybing through 90°', () => {
        expect(legSailing(44, 1000).kind).toBe('beat');
        expect(legSailing(-46, 1000)).toMatchObject({kind: 'reach', side: 'P', port: 1000});
        expect(legSailing(134, 1000).kind).toBe('reach');
        expect(legSailing(-136, 1000).kind).toBe('run');
        const beat = legSailing(0, 1000);
        expect(beat.starboard + beat.port).toBeCloseTo(1000 * Math.SQRT2, 6);
    });

    test('splits a beat between tacks to make good the leg', () => {
        const dead = legSailing(0, 1000, angles);
        expect(dead.starboard).toBeCloseTo(dead.port, 6);
        expect(dead.balance).toBeCloseTo(0, 6);
        expect(dead.starboard + dead.port).toBeCloseTo(1000 / Math.cos(40 * Math.PI / 180), 6);
        const lifted = legSailing(30, 1000, angles);
        expect(lifted.side).toBe('S');
        expect(lifted.starboard).toBeGreaterThan(lifted.port);
        // The tacks add up to the leg.
        const d = (deg) => deg * Math.PI / 180;
        const x = lifted.starboard * Math.cos(d(40)) + lifted.port * Math.cos(d(40));
        const y = lifted.starboard * Math.sin(d(40)) - lifted.port * Math.sin(d(40));
        expect(x).toBeCloseTo(1000 * Math.cos(d(30)), 6);
        expect(y).toBeCloseTo(1000 * Math.sin(d(30)), 6);
    });

    test('splits a run between gybes, and a reach is on one tack', () => {
        const run = legSailing(-170, 1000, angles);
        expect(run).toMatchObject({kind: 'run', side: 'P'});
        expect(run.port).toBeGreaterThan(run.starboard);
        expect(legSailing(-90, 1000, angles)).toMatchObject({kind: 'reach', side: 'P', port: 1000, starboard: 0, balance: 1});
    });

    test('times at the polar speed at the angle sailed', () => {
        const speedAt = (twa) => twa < Math.PI / 2 ? 2 : 4;
        const beat = legSailing(0, 1000, {...angles, speedAt});
        expect(beat.timed).toBe(true);
        expect(beat.starboardTime).toBeCloseTo(beat.starboard / 2, 6);
        expect(legSailing(90, 1000, {...angles, speedAt}).starboardTime).toBeCloseTo(250, 6);
    });

    test('works out the VMG, STW and apparent wind at the polar speed', () => {
        const beat = legSailing(30, 1000, {...angles, speedAt: () => 3, tws: 5});
        expect(beat.stw).toBe(3);
        expect(beat.time).toBeCloseTo((beat.starboard + beat.port) / 3, 6);
        expect(beat.vmg).toBeCloseTo(1000 / beat.time, 6);
        expect(beat.vmg).toBeLessThan(3);
        // Sailed close hauled on starboard, the tack sailed most.
        expect(beat.sailedTwa).toBe(40);
        const t = 40 * Math.PI / 180;
        expect(beat.aws).toBeCloseTo(Math.hypot(5 * Math.cos(t) + 3, 5 * Math.sin(t)), 6);
        expect(beat.awa).toBeGreaterThan(0);
        expect(beat.awa).toBeLessThan(40);
        // A reach is sailed at its own TWA, the apparent wind forward of the true wind.
        const reach = legSailing(-90, 1000, {...angles, speedAt: () => 4, tws: 5});
        expect(reach).toMatchObject({sailedTwa: -90, vmg: 4, stw: 4, time: 250});
        expect(reach.awa).toBeCloseTo(-Math.atan2(5, 4) * 180 / Math.PI, 6);
        // Without a polar or TWS, none of these.
        expect(legSailing(30, 1000, angles)).toMatchObject({time: null, vmg: null, stw: null, awa: null, aws: null});
        expect(legSailing(30, 1000, {...angles, speedAt: () => 3})).toMatchObject({awa: null, aws: null});
    });

    test('totals the fractions of the time on each kind of leg and tack', () => {
        const speedAt = () => 2;
        const totals = sailingTotals([
            legSailing(0, 1000, {...angles, speedAt}),
            legSailing(90, 1000, {...angles, speedAt}),
            legSailing(-90, 1000, {...angles, speedAt}),
        ]);
        expect(totals.beat + totals.reach + totals.run).toBeCloseTo(1, 6);
        expect(totals.port + totals.starboard).toBeCloseTo(1, 6);
        expect(totals.port).toBeCloseTo(0.5, 6);
        expect(totals.run).toBe(0);
        expect(totals.timed).toBe(true);
        expect(totals.time).toBeCloseTo((1000 / Math.cos(40 * Math.PI / 180) + 2000) / 2, 6);
        expect(sailingTotals([])).toBeNull();
    });

    test('uses the polar for the angles when they are not published', () => {
        const points = [{name: 'A', position: at(0, 0)}, {name: 'B', position: at(1000, 0)}];
        const D = Math.PI / 180;
        const given = courseReview({points, twd: 0, polarAngles: {beatAngle: 41 * D, gybeAngle: 148 * D}});
        expect(given.angles).toMatchObject({source: 'polar'});
        expect(given.angles.beatAngle).toBeCloseTo(41, 6);
        expect(given.angles.gybeAngle).toBeCloseTo(148, 6);
        // Searched for with the polar's speeds when it does not give them.
        // A speed of sqrt(sin TWA) has its best VMG at atan(1/sqrt 2) off the wind.
        const speedAt = (twa) => 3 * Math.sqrt(Math.sin(twa));
        const searched = courseReview({points, twd: 0, speedAt});
        const best = Math.atan(Math.SQRT1_2) / D;
        expect(searched.angles.source).toBe('polar');
        expect(Math.abs(searched.angles.beatAngle - best)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(searched.angles.gybeAngle - (180 - best))).toBeLessThanOrEqual(0.5);
        // Published angles come first, and without a polar the defaults.
        expect(courseReview({points, twd: 0, beatAngle: 0.7, gybeAngle: 2.5, speedAt}).angles.source).toBe('published');
        expect(courseReview({points, twd: 0}).angles).toEqual({beatAngle: 45, gybeAngle: 135, source: 'default'});
    });

    test('the course review totals the course still to sail', () => {
        const points = [{name: 'A', position: at(0, 0)}, {name: 'B', position: at(1000, 0)}, {name: 'C', position: at(1000, 1000)}];
        const all = courseReview({points, twd: 0, beatAngle: 0.7, gybeAngle: -2.5});
        expect(all.rows[1].legSailing.kind).toBe('beat');
        expect(all.rows[2].legSailing.kind).toBe('reach');
        expect(all.totals.reach).toBeGreaterThan(0);
        const rest = courseReview({points, twd: 0, beatAngle: 0.7, gybeAngle: 2.5, pointIndex: 2, position: at(1000, 500)});
        expect(rest.rows[2].btwSailing.kind).toBe('reach');
        expect(rest.totals).toMatchObject({beat: 0, reach: 1, run: 0, starboard: 0, port: 1});
        expect(courseReview({points}).totals).toBeNull();
    });
});

describe('tackAngles', () => {
    const {tackAngles} = require('../course');
    const rad = (deg) => deg * Math.PI / 180;

    test('published angles are used, whatever their sign', () => {
        const angles = tackAngles({beatAngle: rad(-40), gybeAngle: rad(150)});
        expect(angles.beatAngle).toBeCloseTo(40);
        expect(angles.gybeAngle).toBeCloseTo(150);
        expect(angles.source).toBe('published');
    });

    test('without published angles, the polar targets', () => {
        expect(tackAngles({polarAngles: {beatAngle: rad(38), gybeAngle: rad(148)}}))
            .toEqual({beatAngle: 38, gybeAngle: 148, source: 'polar'});
    });

    test('a missing published angle is filled from the polar', () => {
        const angles = tackAngles({beatAngle: rad(42), polarAngles: {beatAngle: rad(38), gybeAngle: rad(148)}});
        expect(angles).toEqual({beatAngle: 42, gybeAngle: 148, source: 'published and polar'});
    });

    test('otherwise 45 and 135', () => {
        expect(tackAngles()).toEqual({beatAngle: 45, gybeAngle: 135, source: 'default'});
    });
});

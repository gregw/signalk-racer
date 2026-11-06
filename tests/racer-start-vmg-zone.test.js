// tests/racer-start-vmg-zone.test.js
/* global describe, test, expect */
'use strict';

const {startVmgZoneAngles, polarTackGybeAngles, toRadians} = require('../racer');

// A line running west (starboard end east, pin west), so the course side is north and the
// wind is given as the direction it blows from, in degrees true.
const LINE = 270;
const A = {beat: toRadians(40), gybe: toRadians(140)};   // tacks and gybes through 80
const B = {beat: toRadians(55), gybe: toRadians(150)};   // tacks through 110, gybes through 60
const zone = (twd, boat, cap = 35) => startVmgZoneAngles(LINE, toRadians(twd), boat.beat, boat.gybe, cap);

describe('start VMG zone angles', () => {
    test('square beat: the lay lines, capped', () => {
        expect(zone(0, A)).toEqual({port: 50, stb: 50});
        expect(zone(0, B)).toEqual({port: 35, stb: 35});
        // The cap is configurable: at 45, B's 35 degree lay lines are held at 45.
        expect(zone(0, B, 45)).toEqual({port: 45, stb: 45});
    });

    test('a biased beat: the knocked tack runs flat, to the cap', () => {
        // Veered 30 degrees: port tack, laying the pin, is knocked.
        const a = zone(30, A);
        expect(a.port).toBeCloseTo(35, 6);
        expect(a.stb).toBeCloseTo(80, 6);
        const b = zone(30, B);
        expect(b.port).toBeCloseTo(35, 6);
        expect(b.stb).toBeCloseTo(65, 6);
    });

    test('square run: the gybe angles', () => {
        expect(zone(180, A)).toEqual({port: 50, stb: 50});
        const b = zone(180, B);
        expect(b.port).toBeCloseTo(60, 6);
        expect(b.stb).toBeCloseTo(60, 6);
    });

    test('reach: close hauled to the pin, at the gybe angle to the committee boat', () => {
        // Wind from the east, along the line from the committee boat.
        const a = zone(90, A);
        expect(a.port).toBeCloseTo(40, 6);
        expect(a.stb).toBeCloseTo(40, 6);
        const b = zone(90, B);
        expect(b.port).toBeCloseTo(55, 6);
        expect(b.stb).toBeCloseTo(35, 6);
    });

    test('broad reach: straight up where it can be sailed', () => {
        const b = zone(145, B);
        expect(b.port).toBe(90);
        expect(b.stb).toBeCloseTo(35, 6);
    });

    test('no angles without the inputs', () => {
        expect(startVmgZoneAngles(LINE, null, A.beat, A.gybe)).toBeNull();
        expect(startVmgZoneAngles(LINE, 0, null, A.gybe)).toBeNull();
        expect(startVmgZoneAngles(LINE, 0, A.gybe, A.beat)).toBeNull();
    });
});

describe('tack and gybe angles from a polar', () => {
    test('the angles of the best VMG upwind and downwind', () => {
        // Speed sin(twa): the best VMG upwind is at 45 degrees, downwind at 135.
        const angles = polarTackGybeAngles((tws, twa) => Math.sin(twa), 5);
        expect(angles.beat).toBeCloseTo(toRadians(45), 6);
        expect(angles.gybe).toBeCloseTo(toRadians(135), 6);
    });

    test('none from an empty polar', () => {
        expect(polarTackGybeAngles(() => null, 5)).toBeNull();
    });
});

describe('start VMG zone published by the plugin', () => {
    const PIN = {latitude: -33.85, longitude: 151.25};
    const BOAT = {latitude: -33.85, longitude: 151.252};
    const waypoint = (name, p) => ({name, feature: {type: 'Feature', geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]}}});
    const settle = () => new Promise(resolve => setImmediate(resolve));

    function startPlugin(selfPaths, options = {}) {
        const published = {};
        const subscriptions = {};
        const app = {
            selfId: 'test',
            debug: () => {},
            error: () => {},
            setPluginStatus: () => {},
            getSelfPath: (path) => selfPaths[path],
            registerPutHandler: () => {},
            subscriptionmanager: {
                subscribe: (subscription, unsubscribes, onError, onDelta) => {
                    for (const s of subscription.subscribe) subscriptions[s.path] = onDelta;
                },
            },
            resourcesApi: {
                listResources: () => Promise.resolve({a: waypoint('startPin', PIN), b: waypoint('startBoat', BOAT)}),
                setResource: () => Promise.resolve(),
            },
            handleMessage: (id, delta) => {
                for (const u of delta.updates)
                    for (const v of (u.values || [])) {
                        published[v.path] = v.value;
                        selfPaths[v.path] = {value: v.value};
                    }
            },
        };
        const plugin = require('../index')(app);
        plugin.start({startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300, lines: [], ...options});
        const moveTo = async (position) => {
            selfPaths['navigation.position'] = {value: position};
            subscriptions['navigation.position']({updates: [{values: [{path: 'navigation.position', value: position}]}]});
            await settle();
        };
        return {plugin, published, moveTo};
    }

    const deg = (rad) => rad * 180 / Math.PI;
    const PRESTART = {latitude: -33.851, longitude: 151.251};

    test('the transition line angles from the published tack and gybe angles', async () => {
        const {plugin, published, moveTo} = startPlugin({
            'environment.wind.directionTrue': {value: 0},
            'performance.beatAngle': {value: B.beat},
            'performance.gybeAngle': {value: B.gybe},
            'design.length': {value: {overall: 12}},
        });
        await moveTo(PRESTART);
        expect(deg(published['navigation.racing.startVmgZone.portAngle'])).toBeCloseTo(35, 1);
        expect(deg(published['navigation.racing.startVmgZone.stbAngle'])).toBeCloseTo(35, 1);
        expect(published['navigation.racing.startVmgZone.ocsClearance']).toBeCloseTo(36, 6);
        plugin.stop();
    });

    test('the default fixed 45 degrees when the angles are turned off, or not available', async () => {
        const off = startPlugin({
            'environment.wind.directionTrue': {value: 0},
            'performance.beatAngle': {value: B.beat},
            'performance.gybeAngle': {value: B.gybe},
        }, {useTackGybeAngles: false, ocsClearance: 2});
        await off.moveTo(PRESTART);
        expect(deg(off.published['navigation.racing.startVmgZone.portAngle'])).toBeCloseTo(45, 1);
        // No boat length: 10m a length.
        expect(off.published['navigation.racing.startVmgZone.ocsClearance']).toBeCloseTo(20, 6);
        off.plugin.stop();

        const none = startPlugin({'environment.wind.directionTrue': {value: 0}});
        await none.moveTo(PRESTART);
        expect(deg(none.published['navigation.racing.startVmgZone.stbAngle'])).toBeCloseTo(45, 1);
        none.plugin.stop();
    });

    test('an OCS boat is charged the three legs back to the line', async () => {
        const {plugin, published, moveTo} = startPlugin({'environment.wind.directionTrue': {value: 0}});
        // About 55m north of the line, the course side, within its span.
        await moveTo({latitude: -33.8495, longitude: 151.251});
        expect(published['navigation.racing.distanceStartline']).toBeLessThan(0);
        expect(published['navigation.racing.effectiveVmg.awayFromLine']).toBeGreaterThan(0);
        // At the floor VMG (0.5 kn) both ways: (55 + 30) away and 30 back.
        const floor = 0.5 * 0.514444;
        const over = -published['navigation.racing.distanceStartline'];
        expect(published['navigation.racing.timeToLine']).toBeCloseTo((over + 30) / floor + 30 / floor, 0);
        plugin.stop();
    });
});

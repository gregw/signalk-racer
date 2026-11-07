// tests/racer-start-vmg-zone.test.js
/* global describe, test, expect */
'use strict';

const {startZoneDistances, computeTimeToLine, resetVmgSamples, _vmgState} = require('../racer');

// A boat `overshoot` metres beyond the closest end of the line (negative within its span)
// and `across` metres off it (negative is OCS), as the (toEnd, angle) startZoneDistances
// takes.
function boat(overshoot, across) {
    const toEnd = Math.hypot(overshoot, across);
    const angle = (across < 0 ? -1 : 1) * (180 - Math.atan2(Math.abs(across), overshoot) * 180 / Math.PI);
    return {toEnd, angle};
}

function collect(name, value) {
    for (let i = 0; i < 3; i++) _vmgState[name].sorted.push({value, cog: 0, sog: value});
}

const CLEARANCE = 30;

// The time to line at a position, with a different VMG for each leg so that a jump in
// any one of them shows.
function ttlAt(overshoot, across, theta = 60) {
    const {toEnd, angle} = boat(overshoot, across);
    const d = startZoneDistances(toEnd, angle, CLEARANCE, theta);
    const ttl = computeTimeToLine(null, null, 270, d.toZoneVz, d.perpToLineVx, d.ocs, 'stb', 0, d.depth);
    return {d, ttl};
}

describe('start VMG zone continuity', () => {
    const STEP = 0.5;
    // The steepest the legs can change in a step: near an end the back leg and the up leg
    // both grow by tan(theta) a metre along the line, which at 1/2 + 1/4 s/m is
    // 0.75 tan(theta) s/m. A real jump is clearance sized: tens of metres and seconds.
    const slope = (theta) => Math.tan(theta * Math.PI / 180);
    const maxDist = (theta) => (1 + 2 * slope(theta)) * STEP + 0.1;
    const maxTime = (theta) => (1 + slope(theta)) * STEP + 0.1;

    beforeAll(() => {
        resetVmgSamples();
        collect('vmgFromCourseSide', 2);
        collect('vmgToCourseSide', 4);
        collect('vmgToPortEnd', 5);
    });

    test.each([45, 60, 75])('no jumps anywhere behind the line, at %i degrees', (theta) => {
        const jumps = [];
        for (let c = STEP; c <= 150; c += STEP) {
            for (let o = -60; o <= 200; o += STEP) {
                const here = ttlAt(o, c, theta);
                for (const [next, what] of [[ttlAt(o + STEP, c, theta), 'along'], [ttlAt(o, c + STEP, theta), 'down']]) {
                    const dDist = Math.abs(next.d.toLine - here.d.toLine);
                    const dTime = Math.abs(next.ttl - here.ttl);
                    if (dDist > maxDist(theta) || dTime > maxTime(theta))
                        jumps.push(`${what} at (${o}, ${c}): ${dDist.toFixed(1)}m ${dTime.toFixed(1)}s`);
                }
            }
        }
        expect(jumps).toEqual([]);
    });

    test.each([45, 60, 75])('no jumps anywhere on the course side, at %i degrees', (theta) => {
        const jumps = [];
        for (let c = -150; c < -STEP; c += STEP) {
            for (let o = -60; o <= 200; o += STEP) {
                const here = ttlAt(o, c, theta);
                for (const next of [ttlAt(o + STEP, c, theta), ttlAt(o, c + STEP, theta)]) {
                    if (Math.abs(next.ttl - here.ttl) > maxTime(theta))
                        jumps.push(`(${o}, ${c}): ${here.ttl.toFixed(1)}s -> ${next.ttl.toFixed(1)}s`);
                }
            }
        }
        expect(jumps).toEqual([]);
    });

    test.each([45, 60, 75])('no jump crossing the line, or its extension, anywhere, at %i degrees', (theta) => {
        for (let o = -60; o <= 200; o += 0.5) {
            const ocs = ttlAt(o, -0.01, theta), behind = ttlAt(o, 0.01, theta);
            expect(Math.abs(ocs.ttl - behind.ttl)).toBeLessThan(0.1);
            // toLine is rounded to 0.1m.
            expect(Math.abs(ocs.d.toLine - behind.d.toLine)).toBeLessThan(0.15);
        }
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
    const OCS_IN_SPAN = {latitude: -33.8495, longitude: 151.251};

    test('the clearance is two boat lengths by default', async () => {
        const {plugin, published, moveTo} = startPlugin({'design.length': {value: {overall: 12}}});
        await moveTo(PRESTART);
        expect(published['navigation.racing.startVmgZone.clearance']).toBeCloseTo(24, 6);
        plugin.stop();
    });

    test('the zone angle is published, 60 degrees by default, and configurable', async () => {
        const def = startPlugin({});
        await def.moveTo(PRESTART);
        expect(def.published['navigation.racing.startVmgZone.angle']).toBeCloseTo(Math.PI / 3, 3);
        def.plugin.stop();
        const set = startPlugin({}, {startVmgZoneAngle: 45});
        await set.moveTo(PRESTART);
        expect(set.published['navigation.racing.startVmgZone.angle']).toBeCloseTo(Math.PI / 4, 3);
        set.plugin.stop();
    });

    test('the clearance is configurable, at 10m a length when the length is not known', async () => {
        const {plugin, published, moveTo} = startPlugin({}, {clearance: 3});
        await moveTo(PRESTART);
        expect(published['navigation.racing.startVmgZone.clearance']).toBeCloseTo(30, 6);
        plugin.stop();
    });

    test('an OCS boat within the line is charged just getting back behind it', async () => {
        const {plugin, published, moveTo} = startPlugin({});
        // About 55m north of the line, the course side, within its span.
        await moveTo(OCS_IN_SPAN);
        expect(published['navigation.racing.distanceStartline']).toBeLessThan(0);
        expect(published['navigation.racing.effectiveVmg.awayFromLine']).toBeGreaterThan(0);
        // At the floor VMG (0.5 kn): back over the line, and nothing more.
        const floor = 0.5 * 0.514444;
        const over = -published['navigation.racing.distanceStartline'];
        expect(published['navigation.racing.timeToLine']).toBeCloseTo(over / floor, 0);
        plugin.stop();
    });
});

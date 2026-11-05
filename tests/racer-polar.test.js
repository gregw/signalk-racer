// tests/racer-polar.test.js
/* global describe, test, expect, beforeEach */
'use strict';

const {
    initRacer,
    resetVmgSamples,
    collectVmgSamples,
    setPolar,
    polarVmg,
    polarVmgs,
    getBestVmg,
    getBestVmgOverrides,
    getTunedFactors,
    setBestVmg,
    swapVmgEnds,
    _speedRatios,
    _setClock,
} = require('../racer');

const DEG = Math.PI / 180;

// A polar that sails at 5 m/s from 45 degrees off the wind, and not at all closer.
const simplePolar = (tws, twa) => twa >= 45 * DEG - 1e-9 ? 5 : 0;

const vmgAll = (v) => ({toCourseSide: v, fromCourseSide: v, toPortEnd: v, toStbEnd: v});

describe('polar VMG in a direction', () => {
    test('a direction that can be sailed directly is the polar speed', () => {
        // Wind from the north, direction east: a beam reach.
        expect(polarVmg(simplePolar, 5, 0, 90 * DEG)).toBeCloseTo(5, 6);
    });

    test('a direction into the wind is the tangent at the beat angle', () => {
        // Straight upwind: best is at 45 degrees either side.
        expect(polarVmg(simplePolar, 5, 0, 0)).toBeCloseTo(5 * Math.cos(45 * DEG), 6);
    });

    test('no polar data gives null', () => {
        expect(polarVmg(() => null, 5, 0, 0)).toBeNull();
    });

    test('the four directions are taken from the line bearing', () => {
        // Line bearing 270 (the pin west of the committee boat), wind from the north: the
        // course side is to windward, back from it is downwind, along the line is a reach.
        const vmg = polarVmgs(simplePolar, 5, 0, 270);
        expect(vmg.toCourseSide).toBeCloseTo(5 * Math.cos(45 * DEG), 6); // 0: upwind
        expect(vmg.fromCourseSide).toBeCloseTo(5, 6);    // 180: running
        expect(vmg.toPortEnd).toBeCloseTo(5, 6);         // 270: reach
        expect(vmg.toStbEnd).toBeCloseTo(5, 6);          // 90: reach
    });
});

describe('tuned performance factor', () => {
    beforeEach(() => {
        // minSamples is 20% of maxSamples: 2 here.
        initRacer({maxSamples: 10, percentile: 0.9, minSog: 0, minVmg: 0.01, maxDistance: 2000});
        resetVmgSamples({pool: true});
        setPolar(null);
    });

    test('with no samples, the polar VMG times the performance factor', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(3.2, 6);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.8, 6);
    });

    test('without a polar, the samples alone, as before', () => {
        // Sailing straight to the course side at 3 m/s, line bearing 0.
        collectVmgSamples(90 * DEG, 3, 0, 0, 100);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(3, 6);
        expect(getTunedFactors().toCourseSide).toBeNull();
    });

    test('the pooled speed ratios blend in from the performance factor', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        // One speed ratio of 1.0 is half of minSamples: half way to it.
        collectVmgSamples(0, 0, 0, 0, 100, {vmg: {}, speedRatio: 1.0});
        expect(_speedRatios.sorted.length).toBe(1);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.9, 6);
        // Two is minSamples: all the way.
        collectVmgSamples(0, 0, 0, 0, 100, {vmg: {}, speedRatio: 1.0});
        expect(getTunedFactors().toCourseSide).toBeCloseTo(1.0, 6);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(4, 6);
    });

    test("a direction's own ratios blend in from the pooled factor", () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        // Straight to the course side at 2 m/s, against a polar VMG of 4: ratio 0.5.
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.5 * 0.5 + 0.5 * 0.8, 6);
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.5, 6);
        // The other directions are untouched.
        expect(getTunedFactors().toPortEnd).toBeCloseTo(0.8, 6);
    });

    test('the tuned factor follows a change of wind', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 1});
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(2, 6);
        // The wind builds and the polar VMG doubles: so does the best VMG.
        setPolar({vmg: vmgAll(8), performanceFactor: 1});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(4, 6);
    });

    test('ratios are kept above 1, up to 120%', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 1});
        collectVmgSamples(90 * DEG, 4.4, 0, 0, 100, {vmg: vmgAll(4)});
        collectVmgSamples(90 * DEG, 4.4, 0, 0, 100, {vmg: vmgAll(4)});
        expect(getTunedFactors().toCourseSide).toBeCloseTo(1.1, 6);
    });

    test('a sample over 120% of the polar is discarded entirely, as motoring', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 1});
        // Over the polar VMG in its direction.
        collectVmgSamples(90 * DEG, 5, 0, 0, 100, {vmg: vmgAll(4), speedRatio: 1.0});
        // Over the polar speed for the angle sailed.
        collectVmgSamples(90 * DEG, 3, 0, 0, 100, {vmg: vmgAll(4), speedRatio: 1.3});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(4, 6);
        expect(_speedRatios.sorted.length).toBe(0);
        collectVmgSamples(90 * DEG, 3, 0, 0, 100, {vmg: vmgAll(4), speedRatio: 1.2});
        expect(_speedRatios.sorted.length).toBe(1);
    });

    test('samples and ratios age out after maxSampleAge', () => {
        let now = 0;
        _setClock(() => now);
        initRacer({maxSampleAge: 600});
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        // Sailing fast long before the start...
        collectVmgSamples(90 * DEG, 4.4, 0, 0, 100, {vmg: vmgAll(4), speedRatio: 1.1});
        collectVmgSamples(90 * DEG, 4.4, 0, 0, 100, {vmg: vmgAll(4), speedRatio: 1.1});
        expect(getTunedFactors().toCourseSide).toBeCloseTo(1.1, 6);
        // ...is forgotten ten minutes later.
        now = 601 * 1000;
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.8, 6);
        expect(_speedRatios.sorted.length).toBe(0);
        setPolar(null);
        expect(getBestVmg('toCourseSide')).toBe(0);
        _setClock(null);
    });

    test('ratios swap with the ends of the line', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 1});
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        collectVmgSamples(90 * DEG, 2, 0, 0, 100, {vmg: vmgAll(4)});
        swapVmgEnds();
        expect(getTunedFactors().fromCourseSide).toBeCloseTo(0.5, 6);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(1, 6);
    });

    test('the pool is kept when the line moves, and cleared on request', () => {
        collectVmgSamples(0, 0, 0, 0, 100, {vmg: {}, speedRatio: 1.0});
        resetVmgSamples();
        expect(_speedRatios.sorted.length).toBe(1);
        resetVmgSamples({pool: true});
        expect(_speedRatios.sorted.length).toBe(0);
    });
});

describe('adjustments with a polar', () => {
    beforeEach(() => {
        initRacer({maxSamples: 10, percentile: 0.9, minSog: 0, minVmg: 0.01, maxDistance: 2000});
        resetVmgSamples({pool: true});
        setPolar(null);
    });

    test('an adjustment becomes a factor that follows the wind', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        expect(setBestVmg('toCourseSide', {value: 3})).toBeCloseTo(3, 6);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(3, 6);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.75, 6);

        setPolar({vmg: vmgAll(8), performanceFactor: 0.8});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(6, 6);
        expect(getBestVmgOverrides().toCourseSide).toBeCloseTo(6, 6);
    });

    test('a delta applies to the best VMG from the polar', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        expect(setBestVmg('toCourseSide', {delta: 0.4})).toBeCloseTo(3.6, 6);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.9, 6);
    });

    test('an adjustment stays a speed when the polar goes', () => {
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        setBestVmg('toCourseSide', {value: 3});
        setPolar(null);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(3, 6);
    });

    test('an adjustment made without a polar stays a speed when one arrives', () => {
        setBestVmg('toCourseSide', {value: 3});
        setPolar({vmg: vmgAll(4), performanceFactor: 0.8});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(3, 6);
        expect(getTunedFactors().toCourseSide).toBeCloseTo(0.75, 6);
    });
});

describe('polar management service', () => {
    // A minimal service as announced by signalk-polar-management 1.5.
    function polarService(factor = 0.8) {
        const handle = {speedAt: ({twa}) => ({value: simplePolar(5, twa)})};
        return {
            apiVersion: 1,
            available: true,
            activePolar: () => ({
                describe: () => ({available: true, id: 'boat', sailplanId: null, performanceFactor: factor,
                    twsAxis: [2, 4, 6, 8, 10]}),
            }),
            polar: (id, options) => {
                expect(id).toBe('boat');
                expect(options).toEqual({});
                return handle;
            },
        };
    }

    function startPlugin(selfPaths, service) {
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
                subscribe: (spec, unsubscribes, onError, onDelta) => {
                    subscriptions[spec.subscribe[0].path] = onDelta;
                },
            },
            resourcesApi: {listResources: () => Promise.resolve(WAYPOINTS), setResource: () => Promise.resolve()},
            onPropertyValues: (name, callback) => {
                expect(name).toBe('polarManagement');
                callback([undefined, {setter: 'signalk-polar-management', value: service}]);
                return () => {};
            },
            handleMessage: (id, delta) => {
                for (const u of delta.updates)
                    for (const v of (u.values || []))
                        published[v.path] = v.value;
            },
        };
        const plugin = require('../index')(app);
        plugin.start({startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300, lines: [],
            updateStartLineWaypoint: false, createStartLineWaypoint: false});
        const position = async (value) => {
            await new Promise(resolve => setImmediate(resolve));
            subscriptions['navigation.position']({updates: [{values: [{path: 'navigation.position', value}]}]});
        };
        return {plugin, published, position};
    }

    // A 200m line running west from the starboard end to the pin, square to a northerly,
    // with the boat 100m south of it on the pre-start side.
    const STB = {latitude: -33.85, longitude: 151.25};
    const PORT = {latitude: -33.85, longitude: 151.24784};
    const BOAT = {latitude: -33.8509, longitude: 151.24892};
    const waypoint = (name, {latitude, longitude}) =>
        ({name, feature: {geometry: {type: 'Point', coordinates: [longitude, latitude]}}});
    const WAYPOINTS = {a: waypoint('startBoat', STB), b: waypoint('startPin', PORT)};

    function boat(extra = {}) {
        return {
            'navigation.racing.startLineStb': {value: STB},
            'navigation.racing.startLinePort': {value: PORT},
            'navigation.position': {value: BOAT},
            'navigation.courseOverGroundTrue': {value: 0},
            'navigation.speedOverGround': {value: 4},
            'environment.wind.directionTrue': {value: 0},
            'environment.wind.speedTrue': {value: 5},
            ...extra,
        };
    }

    test('publishes the polar VMGs and tuned factors from the active polar', async () => {
        const {plugin, published, position} = startPlugin(boat(), polarService(0.8));
        await position(BOAT);
        // Wind from the north: the course side is dead upwind, along the line a reach.
        expect(published['navigation.racing.polarVmg.toCourseSide']).toBeCloseTo(5 * Math.cos(45 * DEG), 2);
        expect(published['navigation.racing.polarVmg.toPortEnd']).toBeCloseTo(5, 2);
        expect(published['navigation.racing.tunedPerformanceFactor.toPortEnd']).toBeCloseTo(0.8, 2);
        plugin.stop();
    });

    test('the VMG detail endpoint reports every component', async () => {
        const {plugin, position} = startPlugin(boat(), polarService(0.8));
        await position(BOAT);
        let handler;
        plugin.registerWithRouter({get: (path, h) => { expect(path).toBe('/vmg'); handler = h; }});
        let body;
        handler({}, {json: (b) => { body = b; }});
        expect(body.polar).toBe(true);
        expect(body.performanceFactor).toBeCloseTo(0.8, 6);
        expect(body.legs.toLine).toBe('toCourseSide');
        expect(body.inputs.speedSource).toBe('ground');
        const up = body.directions.toCourseSide;
        expect(up.source).toBe('polar');
        expect(up.polarVmg).toBeCloseTo(5 * Math.cos(45 * DEG), 2);
        // Heading straight up at 4 m/s: VMG now 4, against the polar's 3.54.
        expect(up.currentVmg).toBeCloseTo(4, 6);
        expect(up.currentRatio).toBeCloseTo(4 / (5 * Math.cos(45 * DEG)), 2);
        // One sample from the lookup of the line at start, and one from the position.
        expect(up.samples).toBeGreaterThan(0);
        expect(up.ratios).toBe(up.samples);
        plugin.stop();
    });

    test('outside the wind range of the polar, it is used but no ratios are taken', async () => {
        const {plugin, position} = startPlugin(
            boat({'environment.wind.speedTrue': {value: 1}}), polarService());
        await position(BOAT);
        let body;
        plugin.registerWithRouter({get: (path, h) => h({}, {json: (b) => { body = b; }})});
        expect(body.polar).toBe(true);
        expect(body.inputs.ratiosTaken).toBe(false);
        expect(body.directions.toCourseSide.samples).toBeGreaterThan(0);
        expect(body.directions.toCourseSide.ratios).toBe(0);
        expect(body.pool.ratios).toBe(0);
        plugin.stop();
    });

    test('without wind, no polar is used', async () => {
        const {plugin, published, position} = startPlugin(
            boat({'environment.wind.speedTrue': {value: null}}), polarService());
        await position(BOAT);
        expect(published['navigation.racing.polarVmg.toCourseSide'] ?? null).toBeNull();
        expect(published['navigation.racing.tunedPerformanceFactor.toCourseSide'] ?? null).toBeNull();
        plugin.stop();
    });

    test('an unavailable service is ignored', async () => {
        const {plugin, published, position} = startPlugin(boat(), {apiVersion: 1, available: false});
        await position(BOAT);
        expect(published['navigation.racing.polarVmg.toCourseSide'] ?? null).toBeNull();
        expect(published['navigation.racing.distanceStartline']).toBeDefined();
        plugin.stop();
    });
});

// tests/racer-line-active.test.js
/* global describe, test, expect */
'use strict';

// Deactivating the line through setStartLineName, and getting it back again.

const PIN = {latitude: -33.85, longitude: 151.25};
const BOAT = {latitude: -33.85, longitude: 151.252};
const CLUB_PIN = {latitude: -33.86, longitude: 151.26};
const CLUB_BOAT = {latitude: -33.86, longitude: 151.262};
const POSITION = {latitude: -33.851, longitude: 151.251};

function waypoint(name, position) {
    return {name, feature: {type: 'Feature', geometry: {type: 'Point', coordinates: [position.longitude, position.latitude]}}};
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function startPlugin({position = POSITION, withWaypoints = true} = {}) {
    const selfPaths = position ? {'navigation.position': {value: position}} : {};
    const published = {};
    const waypoints = {};
    const addWaypoints = () => Object.assign(waypoints, {
        a: waypoint('startPin', PIN),
        b: waypoint('startBoat', BOAT),
        c: waypoint('clubPin', CLUB_PIN),
        d: waypoint('clubBoat', CLUB_BOAT),
    });
    if (withWaypoints)
        addWaypoints();
    const subscriptions = {};
    let listed = 0;
    const app = {
        selfId: 'test',
        putHandlers: {},
        debug: () => {},
        error: () => {},
        setPluginStatus: () => {},
        getSelfPath: (path) => selfPaths[path],
        registerPutHandler: (context, path, handler) => { app.putHandlers[path] = handler; },
        subscriptionmanager: {
            subscribe: (subscription, unsubscribes, onError, onDelta) => {
                for (const s of subscription.subscribe)
                    subscriptions[s.path] = onDelta;
            },
        },
        resourcesApi: {
            listResources: () => { listed++; return Promise.resolve({...waypoints}); },
            setResource: (type, id, resource) => { waypoints[id] = resource; return Promise.resolve(); },
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
    plugin.start({
        startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300,
        updateStartLineWaypoint: true, createStartLineWaypoint: true,
        lines: [{startLineName: 'club', startLinePort: 'clubPin', startLineStb: 'clubBoat'}],
    });
    const put = (path, value) => app.putHandlers[`navigation.racing.${path}`]('vessels.self', `navigation.racing.${path}`, value);
    const moved = async () => {
        subscriptions['navigation.position']({updates: [{values: [{path: 'navigation.position', value: POSITION}]}]});
        await settle();
    };
    // The server announces the waypoint racer has just written, as it would any change.
    const waypointsChanged = async () => {
        subscriptions['resources.waypoints.*']({updates: [{values: []}]});
        await settle();
    };
    return {plugin, published, put, moved, waypointsChanged, addWaypoints, listed: () => listed};
}

describe('racer line at start', () => {
    test('the line is published from its waypoints without a position', async () => {
        const {plugin, published} = startPlugin({position: null});
        await settle();
        expect(published['navigation.racing.startLinePort']).toEqual(PIN);
        expect(published['navigation.racing.startLineStb']).toEqual(BOAT);
        expect(published['navigation.racing.startLineLength']).toEqual(expect.any(Number));
        expect(published['navigation.racing.startLineBearing']).toEqual(expect.any(Number));
        expect(published['navigation.racing.distanceStartline']).toBeUndefined();
        plugin.stop();
    });

    test('selecting the line in use while it has no ends looks for them again', async () => {
        const {plugin, published, put, addWaypoints, listed} = startPlugin({position: null, withWaypoints: false});
        await settle();
        expect(published['navigation.racing.startLinePort']).toBeNull();
        addWaypoints();
        const before = listed();
        await put('setStartLineName', {startLineName: null});
        await settle();
        expect(listed()).toBe(before + 1);
        expect(published['navigation.racing.startLinePort']).toEqual(PIN);
        plugin.stop();
    });

    test('selecting the line in use while it has its ends does not look again', async () => {
        const {plugin, put, listed} = startPlugin({position: null});
        await settle();
        const before = listed();
        await put('setStartLineName', {startLineName: null});
        await settle();
        expect(listed()).toBe(before);
        plugin.stop();
    });
});

describe('racer line deactivation', () => {
    test('the line is active when the plugin starts', async () => {
        const {plugin, published, moved} = startPlugin();
        await moved();
        expect(published['navigation.racing.lines'].active).toBe(true);
        expect(published['navigation.racing.startLinePort']).toEqual(PIN);
        expect(published['navigation.racing.distanceStartline']).toEqual(expect.any(Number));
        plugin.stop();
    });

    test('active false clears the line and everything worked out from it', async () => {
        const {plugin, published, put, moved} = startPlugin();
        await moved();
        expect((await put('setStartLineName', {active: false})).statusCode).toBe(200);
        expect(published['navigation.racing.lines'].active).toBe(false);
        for (const path of ['startLinePort', 'startLineStb', 'startLineLength', 'startLineBearing',
            'distanceStartline', 'timeToLine', 'timeToBurn', 'stbLineBias'])
            expect(published[`navigation.racing.${path}`]).toBeNull();
        plugin.stop();
    });

    test('a deactivated line is not looked for again as the boat moves', async () => {
        const {plugin, published, put, moved, listed} = startPlugin();
        await moved();
        await put('setStartLineName', {active: false});
        const before = listed();
        await moved();
        await moved();
        expect(listed()).toBe(before);
        expect(published['navigation.racing.startLinePort']).toBeNull();
        expect(published['navigation.racing.distanceStartline']).toBeNull();
        plugin.stop();
    });

    test('selecting a line makes it active again', async () => {
        const {plugin, published, put, moved} = startPlugin();
        await moved();
        await put('setStartLineName', {active: false});
        await put('setStartLineName', {startLineName: 'club'});
        await settle();
        expect(published['navigation.racing.lines']).toMatchObject({startLineName: 'club', active: true});
        expect(published['navigation.racing.startLinePort']).toEqual(CLUB_PIN);
        plugin.stop();
    });

    test('selecting the default line makes it active again', async () => {
        const {plugin, published, put, moved} = startPlugin();
        await moved();
        await put('setStartLineName', {active: false});
        await put('setStartLineName', {startLineName: null});
        await settle();
        expect(published['navigation.racing.lines']).toMatchObject({startLineName: null, active: true});
        expect(published['navigation.racing.startLinePort']).toEqual(PIN);
        plugin.stop();
    });

    test('active true without a name brings back the line that was selected', async () => {
        const {plugin, published, put, moved} = startPlugin();
        await put('setStartLineName', {startLineName: 'club'});
        await moved();
        await put('setStartLineName', {active: false});
        expect(published['navigation.racing.lines']).toMatchObject({startLineName: 'club', active: false});
        await put('setStartLineName', {active: true});
        await settle();
        expect(published['navigation.racing.lines']).toMatchObject({startLineName: 'club', active: true});
        expect(published['navigation.racing.startLinePort']).toEqual(CLUB_PIN);
        plugin.stop();
    });

    test('setting an end of the line makes it active again', async () => {
        const {plugin, published, put, moved, waypointsChanged} = startPlugin();
        await moved();
        await put('setStartLineName', {active: false});
        const pin = {latitude: -33.849, longitude: 151.25};
        expect((await put('startLinePort', pin)).statusCode).toBe(200);
        await waypointsChanged();
        expect(published['navigation.racing.lines'].active).toBe(true);
        expect(published['navigation.racing.startLinePort']).toEqual(pin);
        expect(published['navigation.racing.startLineStb']).toEqual(BOAT);
        plugin.stop();
    });

    test('a non-boolean active is rejected', async () => {
        const {plugin, put} = startPlugin();
        expect((await put('setStartLineName', {active: 'no'})).statusCode).toBe(400);
        plugin.stop();
    });
});

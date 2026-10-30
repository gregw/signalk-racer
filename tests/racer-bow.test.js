// tests/racer-bow.test.js
/* global describe, test, expect */
'use strict';

// Pings a line end through the plugin, which places it at the bow worked out from
// navigation.position and the offsets published by the server.

const geolib = require('geolib');

const POSITION = {latitude: -33.85, longitude: 151.25};

function startPlugin(selfPaths) {
    const published = {};
    const app = {
        selfId: 'test',
        putHandlers: {},
        debug: () => {},
        error: () => {},
        setPluginStatus: () => {},
        getSelfPath: (path) => selfPaths[path],
        registerPutHandler: (context, path, handler) => { app.putHandlers[path] = handler; },
        subscriptionmanager: { subscribe: () => {} },
        resourcesApi: { listResources: () => Promise.resolve({}), setResource: () => Promise.resolve() },
        handleMessage: (id, delta) => {
            for (const u of delta.updates)
                for (const v of (u.values || []))
                    published[v.path] = v.value;
        },
    };
    const plugin = require('../index')(app);
    plugin.start({ startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300, lines: [] });
    const ping = async () => {
        await app.putHandlers['navigation.racing.setStartLine']('vessels.self', 'navigation.racing.setStartLine', { end: 'port' });
        return published['navigation.racing.startLinePort'];
    };
    return { plugin, ping };
}

// Heading north, so forward is north and starboard is east.
function boat(extra = {}) {
    return {
        'navigation.position': { value: POSITION },
        'navigation.headingTrue': { value: 0 },
        ...extra,
    };
}

// Metres north and east of POSITION.
function offset(pinged) {
    const north = geolib.getDistance(POSITION, {latitude: pinged.latitude, longitude: POSITION.longitude}, 0.01);
    const east = geolib.getDistance(POSITION, {latitude: POSITION.latitude, longitude: pinged.longitude}, 0.01);
    return {
        north: Math.sign(pinged.latitude - POSITION.latitude) * north,
        east: Math.sign(pinged.longitude - POSITION.longitude) * east,
    };
}

describe('racer bow position', () => {
    test('published fromBow: moves forward to the bow', async () => {
        const { plugin, ping } = startPlugin(boat({
            'sensors.gps.fromBow': { value: 6 },
            'design.length': { value: { overall: 20 } },
        }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(6, 1);
        expect(o.east).toBeCloseTo(0, 1);
        plugin.stop();
    });

    test('published fromCenter: moves to port from a starboard antenna', async () => {
        const { plugin, ping } = startPlugin(boat({
            'sensors.gps.fromBow': { value: 4 },
            'sensors.gps.fromCenter': { value: 1.5 },
        }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(4, 1);
        expect(o.east).toBeCloseTo(-1.5, 1);
        plugin.stop();
    });

    test('published fromCenter: moves to starboard from a port antenna', async () => {
        const { plugin, ping } = startPlugin(boat({
            'sensors.gps.fromCenter': { value: -1 },
        }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(0, 1);
        expect(o.east).toBeCloseTo(1, 1);
        plugin.stop();
    });

    test('no fromBow: defaults to half the boat length', async () => {
        const { plugin, ping } = startPlugin(boat({
            'design.length': { value: { overall: 12 } },
        }));
        expect(offset(await ping()).north).toBeCloseTo(6, 1);
        plugin.stop();
    });

    test('null fromBow, as published for several antennas: defaults to half the boat length', async () => {
        const { plugin, ping } = startPlugin(boat({
            'sensors.gps.fromBow': { value: null },
            'sensors.gps.fromCenter': { value: null },
            'design.length': { value: { overall: 9.4 } },
        }));
        expect(offset(await ping()).north).toBeCloseTo(4.7, 1);
        plugin.stop();
    });

    test('no fromBow or length: the position is used as the bow', async () => {
        const { plugin, ping } = startPlugin(boat());
        expect(await ping()).toEqual(POSITION);
        plugin.stop();
    });

    test('offsets published after the plugin starts are used', async () => {
        const selfPaths = boat();
        const { plugin, ping } = startPlugin(selfPaths);
        selfPaths['sensors.gps.fromBow'] = { value: 3 };
        expect(offset(await ping()).north).toBeCloseTo(3, 1);
        plugin.stop();
    });
});

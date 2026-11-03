// tests/racer-bow.test.js
/* global describe, test, expect */
'use strict';

// Pings a line end through the plugin, which places it at the bow worked out from
// navigation.position and the offsets published by the server.

const geolib = require('geolib');

const POSITION = {latitude: -33.85, longitude: 151.25};

function startPlugin(selfPaths, server = {}) {
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
        ...server,
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
function boat(extra = {}, source = 'n2k.0') {
    return {
        'navigation.position': { value: POSITION, $source: source },
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

    // A server with GNSS correction (2.31+), with a GPS antenna 1.5m from the bow and
    // 0.45m to starboard, on an N2K source referenced either by address or by CAN name.
    function gnssServer({ version = '2.35.1', mode = 'replace', active = true, fromCenter = 0.45 } = {}) {
        return {
            config: {
                version,
                settings: {
                    gnssCorrection: mode,
                    gnssSensors: [
                        { sensorId: 'Gps', $source: 'n2k.c07891001cb84fb3', fromBow: 1.5, fromCenter },
                        { sensorId: 'Vhf', $source: 'n183.AI', fromBow: 4.2, fromCenter: 0.9 },
                    ],
                },
            },
            deltaCache: { canonicaliseSourceRef: (ref) => ref === 'n2k.0' ? 'n2k.c07891001cb84fb3' : ref },
            gnssOffsetCorrector: { getStatus: () => ({ mode, active }) },
        };
    }

    // Stale offsets from the vessel settings, as servers before 2.35 leave them.
    const stale = {
        'sensors.gps.fromBow': { value: 2 },
        'sensors.gps.fromCenter': { value: 0.2 },
        'design.length': { value: { overall: 9.54 } },
    };

    test('replace active: a configured antenna position is at the CCRP, whatever the stale offsets', async () => {
        const { plugin, ping } = startPlugin(boat(stale), gnssServer({ version: '2.33.0', fromCenter: -0.45 }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(4.77, 1);
        expect(o.east).toBeCloseTo(0, 1);
        plugin.stop();
    });

    test('both: a .ccrp position is at the CCRP', async () => {
        const { plugin, ping } = startPlugin(boat(stale, 'Gps.ccrp'), gnssServer({ mode: 'both' }));
        expect(offset(await ping()).north).toBeCloseTo(4.77, 1);
        plugin.stop();
    });

    test('both: an uncorrected antenna position is at that antenna', async () => {
        const { plugin, ping } = startPlugin(boat(stale), gnssServer({ mode: 'both' }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(1.5, 1);
        expect(o.east).toBeCloseTo(-0.45, 1);
        plugin.stop();
    });

    test('replace blocked: a configured antenna position is at that antenna', async () => {
        const { plugin, ping } = startPlugin(boat({
            'sensors.gps.fromBow': { value: null },
            'design.length': { value: { overall: 9.54 } },
        }), gnssServer({ active: false }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(1.5, 1);
        expect(o.east).toBeCloseTo(-0.45, 1);
        plugin.stop();
    });

    test('before 2.34: an antenna fromCenter is positive to port', async () => {
        const { plugin, ping } = startPlugin(boat(stale), gnssServer({ version: '2.33.0', mode: 'off', fromCenter: -0.45 }));
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(1.5, 1);
        expect(o.east).toBeCloseTo(-0.45, 1);
        plugin.stop();
    });

    test('an unconfigured source falls back to the published offsets', async () => {
        const { plugin, ping } = startPlugin(boat(stale, 'n183.GP'), gnssServer());
        const o = offset(await ping());
        expect(o.north).toBeCloseTo(2, 1);
        expect(o.east).toBeCloseTo(-0.2, 1);
        plugin.stop();
    });
});

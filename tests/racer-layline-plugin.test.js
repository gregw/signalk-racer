// tests/racer-layline-plugin.test.js
/* global describe, test, expect */
'use strict';

// The plugin publishing the distance and time to the lay lines into the point being sailed to.

const MARK = {latitude: -33.84, longitude: 151.25};
// 1000m due south of the mark.
const BOAT = {latitude: -33.84 - 1000 / 111195, longitude: 151.25};

const settle = () => new Promise(resolve => setTimeout(resolve, 5));

function startPlugin({nextPoint = MARK, beatAngle = 45} = {}) {
    const rad = (deg) => deg * Math.PI / 180;
    const selfPaths = {
        'navigation.position': {value: BOAT},
        'navigation.courseOverGroundTrue': {value: rad(315)},
        'navigation.speedOverGround': {value: 5},
        'environment.wind.directionTrue': {value: 0},
        'performance.beatAngle': {value: rad(beatAngle)},
        'performance.gybeAngle': {value: rad(135)},
    };
    const published = {};
    const subscriptions = {};
    const app = {
        selfId: 'test',
        debug: () => {},
        error: () => {},
        setPluginStatus: () => {},
        getSelfPath: (path) => selfPaths[path],
        getCourse: () => Promise.resolve({activeRoute: null, nextPoint: nextPoint ? {position: nextPoint} : null}),
        registerPutHandler: () => {},
        subscriptionmanager: {
            subscribe: (subscription, unsubscribes, onError, onDelta) => {
                for (const s of subscription.subscribe)
                    subscriptions[s.path] = onDelta;
            },
        },
        resourcesApi: {listResources: () => Promise.resolve({})},
        handleMessage: (id, delta) => {
            for (const u of delta.updates)
                for (const v of (u.values || [])) {
                    published[v.path] = v.value;
                    selfPaths[v.path] = {value: v.value};
                }
        },
    };
    const plugin = require('../index')(app);
    plugin.start({startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300});
    const moved = async () => {
        await settle();
        subscriptions['navigation.position']({updates: [{values: [{path: 'navigation.position', value: BOAT}]}]});
        await settle();
    };
    return {plugin, published, moved};
}

describe('racer lay lines', () => {
    test('a square beat to the next point is published on the spec paths', async () => {
        const {plugin, published, moved} = startPlugin();
        // The first position fetches the course; the next one uses it.
        await moved();
        await moved();
        expect(published['navigation.racing.layline.distance']).toBeCloseTo(707, -1);
        expect(published['navigation.racing.layline.time']).toBeCloseTo(141, -1);
        expect(published['navigation.racing.oppositeLayline.distance']).toBeCloseTo(707, -1);
        expect(published['navigation.racing.oppositeLayline.time']).toBeCloseTo(141, -1);
        plugin.stop();
    });

    test('nothing is published without a point to sail to', async () => {
        const {plugin, published, moved} = startPlugin({nextPoint: null});
        await moved();
        await moved();
        expect(published['navigation.racing.layline.distance']).toBeUndefined();
        plugin.stop();
    });
});

// tests/racer-timer.test.js
/* global describe, test, expect, beforeEach, afterEach, jest */
'use strict';

// Drives the start timer through the plugin itself, with a mock Signal K app and fake timers.

function mockApp(selfPaths = {}) {
    const app = {
        selfId: 'test',
        putHandlers: {},
        published: {},
        debug: () => {},
        error: () => {},
        setPluginStatus: () => {},
        getSelfPath: (path) => selfPaths[path],
        registerPutHandler: (context, path, handler) => { app.putHandlers[path] = handler; },
        subscriptionmanager: { subscribe: () => {} },
        resourcesApi: { listResources: () => Promise.resolve({}) },
        handleMessage: (id, delta) => {
            for (const u of delta.updates)
                for (const v of (u.values || []))
                    app.published[v.path] = v.value;
        },
    };
    return app;
}

function startPlugin(selfPaths) {
    const app = mockApp(selfPaths);
    const plugin = require('../index')(app);
    plugin.start({ startLinePort: 'startPin', startLineStb: 'startBoat', timer: 300 });
    const timer = (args) => app.putHandlers['navigation.racing.setStartTime']('vessels.self', 'navigation.racing.setStartTime', args);
    return { app, plugin, timer };
}

// Seconds still to go until the published startTime, as a whole-second countdown shows it.
function expectedTimeToStart(app) {
    return Math.max(0, Math.ceil((Date.parse(app.published['navigation.racing.startTime']) - Date.now()) / 1000));
}

// Run the timers for a number of seconds, with each tick firing `lag` ms late, as
// happens on a loaded host when the event loop is busy.
function runLate(seconds, lag) {
    for (let i = 0; i < seconds; i++) {
        jest.setSystemTime(Date.now() + lag);
        jest.advanceTimersByTime(1000);
    }
}

describe('racer start timer', () => {
    let plugin;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-30T10:00:00.000Z'));
    });

    afterEach(() => {
        plugin?.stop();
        plugin = null;
        jest.useRealTimers();
    });

    test('start: counts down to zero at startTime', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        expect((await timer({ command: 'start' })).statusCode).toBe(200);
        expect(app.published['navigation.racing.startTime']).toBe('2026-10-30T10:05:00.000Z');
        expect(app.published['navigation.racing.timeToStart']).toBe(300);

        jest.advanceTimersByTime(100 * 1000);
        expect(app.published['navigation.racing.timeToStart']).toBe(200);

        jest.advanceTimersByTime(200 * 1000);
        expect(app.published['navigation.racing.timeToStart']).toBe(0);
    });

    test('late ticks: timeToStart does not drift behind startTime', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        await timer({ command: 'start' });

        runLate(200, 50);
        expect(app.published['navigation.racing.timeToStart']).toBe(expectedTimeToStart(app));
    });

    test('late ticks: reaches zero no later than startTime', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        await timer({ command: 'start' });
        const startTime = Date.parse(app.published['navigation.racing.startTime']);

        while (Date.now() < startTime)
            runLate(1, 50);
        jest.advanceTimersByTime(100);
        expect(app.published['navigation.racing.timeToStart']).toBe(0);
    });

    test('set: ticks on the whole seconds of startTime', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        // 120.5s away: shows 121 until 0.5s has passed, then 120.
        await timer({ command: 'set', startTime: '2026-10-30T10:02:00.500Z' });
        expect(app.published['navigation.racing.timeToStart']).toBe(121);

        jest.advanceTimersByTime(400);
        expect(app.published['navigation.racing.timeToStart']).toBe(121);
        jest.advanceTimersByTime(200);
        expect(app.published['navigation.racing.timeToStart']).toBe(120);
        jest.advanceTimersByTime(119 * 1000);
        expect(app.published['navigation.racing.timeToStart']).toBe(1);
        jest.advanceTimersByTime(1000);
        expect(app.published['navigation.racing.timeToStart']).toBe(0);
    });

    test('adjust: shifts the existing startTime by delta', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        await timer({ command: 'set', startTime: '2026-10-30T10:05:00.500Z' });
        jest.advanceTimersByTime(10 * 1000);

        expect((await timer({ command: 'adjust', delta: 60 })).statusCode).toBe(200);
        expect(app.published['navigation.racing.startTime']).toBe('2026-10-30T10:06:00.500Z');
        expect(app.published['navigation.racing.timeToStart']).toBe(expectedTimeToStart(app));

        await timer({ command: 'adjust', delta: -1 });
        expect(app.published['navigation.racing.startTime']).toBe('2026-10-30T10:05:59.500Z');
        jest.advanceTimersByTime(5000);
        expect(app.published['navigation.racing.timeToStart']).toBe(expectedTimeToStart(app));
    });

    test('restart: a running countdown keeps counting', async () => {
        let app;
        ({ app, plugin } = startPlugin({ 'navigation.racing.startTime': { value: '2026-10-30T10:01:00.000Z' } }));
        expect(app.published['navigation.racing.timeToStart']).toBe(60);

        jest.advanceTimersByTime(10 * 1000);
        expect(app.published['navigation.racing.timeToStart']).toBe(50);
    });

    test('stop: no more ticks after the plugin is stopped', async () => {
        let app, timer;
        ({ app, plugin, timer } = startPlugin());
        await timer({ command: 'start' });
        jest.advanceTimersByTime(10 * 1000);
        plugin.stop();
        plugin = null;

        app.published = {};
        jest.advanceTimersByTime(10 * 1000);
        expect(app.published).toEqual({});
    });
});

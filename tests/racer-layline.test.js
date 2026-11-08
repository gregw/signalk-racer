// tests/racer-layline.test.js
/* global describe, test, expect */
'use strict';

const {laylines} = require('../layline');

const rad = (deg) => deg * Math.PI / 180;
const base = {twd: 0, beatAngle: rad(45), gybeAngle: rad(135), sog: 5};

describe('laylines', () => {
    test('a square beat: half way to each lay line on each tack', () => {
        const result = laylines({...base, bearing: 0, distance: 1000, cog: rad(315)});
        expect(result.leg).toBe('beat');
        expect(result.layline.distance).toBeCloseTo(707.1, 1);
        expect(result.layline.time).toBeCloseTo(141.4, 1);
        expect(result.oppositeLayline.distance).toBeCloseTo(707.1, 1);
    });

    test('port tack too, and a published angle signed by tack', () => {
        const result = laylines({...base, beatAngle: rad(-45), bearing: 0, distance: 1000, cog: rad(45)});
        expect(result.layline.distance).toBeCloseTo(707.1, 1);
        expect(result.oppositeLayline.distance).toBeCloseTo(707.1, 1);
    });

    test('nearly laying the mark on starboard: the port lay line is far, the starboard one close', () => {
        // The mark 40 degrees to port of the wind is 5 degrees short of the starboard lay line.
        const result = laylines({...base, bearing: rad(320), distance: 1000, cog: rad(315)});
        expect(result.layline.distance).toBeGreaterThan(900);
        expect(result.oppositeLayline.distance).toBeGreaterThan(0);
        expect(result.oppositeLayline.distance).toBeLessThan(150);
    });

    test('on starboard beyond the port lay line: overstood, negative', () => {
        // The mark at 060 is 15 degrees beyond the port lay line (045). Sailing on at 315,
        // the port lay line was crossed 258.8m back.
        const result = laylines({...base, bearing: rad(60), distance: 1000, cog: rad(315)});
        expect(result.leg).toBe('beat');
        expect(result.layline.distance).toBeCloseTo(-258.8, 1);
        expect(result.layline.time).toBeCloseTo(-51.8, 1);
        // Tacking onto port now passes upwind of the mark: no starboard lay line to reach.
        expect(result.oppositeLayline.distance).toBeNull();
    });

    test('on port beyond the starboard lay line: overstood, negative', () => {
        const result = laylines({...base, bearing: rad(300), distance: 1000, cog: rad(45)});
        expect(result.layline.distance).toBeCloseTo(-258.8, 1);
        expect(result.oppositeLayline.distance).toBeNull();
    });

    test('tacking onto a lay line already overstood: negative', () => {
        // On port, the mark at 060: tacking onto starboard (315) puts the boat further past
        // the port lay line, which it crossed 258.8m back along 315.
        const result = laylines({...base, bearing: rad(60), distance: 1000, cog: rad(45)});
        expect(result.oppositeLayline.distance).toBeCloseTo(-258.8, 1);
        // Sailing on at 045 parallel to the starboard lay line... never reaches it.
        expect(result.layline.distance).toBeNull();
    });

    test('a run: gybe angle lay lines', () => {
        // Wind from the south, the mark downwind to the north.
        const result = laylines({...base, twd: Math.PI, bearing: 0, distance: 1000, cog: rad(45)});
        expect(result.leg).toBe('run');
        expect(result.layline.distance).toBeCloseTo(707.1, 1);
        expect(result.oppositeLayline.distance).toBeCloseTo(707.1, 1);
    });

    test('a run: gybing now onto a lay line, or past it', () => {
        // Wind from the south, the mark 015 downwind, on starboard gybe (heading 315).
        const near = laylines({...base, twd: Math.PI, bearing: rad(15), distance: 1000, cog: rad(315)});
        expect(near.leg).toBe('run');
        // Gybing onto port (045) reaches the starboard gybe lay line ahead.
        expect(near.oppositeLayline.distance).toBeGreaterThan(0);
        // The mark at 060 is beyond the port gybe lay line (045): overstood.
        const past = laylines({...base, twd: Math.PI, bearing: rad(60), distance: 1000, cog: rad(315)});
        expect(past.layline.distance).toBeCloseTo(-258.8, 1);
    });

    test('heading away from the lay line is null', () => {
        const result = laylines({...base, bearing: 0, distance: 1000, cog: rad(135)});
        expect(result.layline.distance).toBeNull();
        expect(result.layline.time).toBeNull();
    });

    test('none without the wind', () => {
        expect(laylines({...base, twd: null, bearing: 0, distance: 1000, cog: 0})).toBeNull();
    });

    test('no time when stopped', () => {
        const result = laylines({...base, sog: 0, bearing: 0, distance: 1000, cog: rad(315)});
        expect(result.layline.distance).toBeCloseTo(707.1, 1);
        expect(result.layline.time).toBeNull();
    });
});

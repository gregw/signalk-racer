// tests/racer-zone.test.js
/* global describe, test, expect */
'use strict';

const { startZoneDistances } = require('../racer');

// A boat lying `overshoot` metres beyond the closest end of the line and `across` metres
// off it, expressed as the (toEnd, angle) pair startZoneDistances takes. A positive
// `across` is the pre-start side; negative is OCS.
function boat(overshoot, across) {
    const toEnd = Math.hypot(overshoot, across);
    // Angle at the end between the line (towards the other end) and the boat. The boat is
    // beyond the end, so it opens past 90 degrees.
    const angle = Math.sign(across || 1) * (180 - Math.atan2(Math.abs(across), overshoot) * 180 / Math.PI);
    return { toEnd, angle };
}

describe('start zone distances', () => {
    test('inside the zone only the perpendicular distance counts', () => {
        // Abeam the line, 50m off it: no along-line leg at all.
        const { toEnd, angle } = boat(-30, 50);
        const d = startZoneDistances(toEnd, angle);
        expect(d.inStartZone).toBe(true);
        expect(d.toZoneVz).toBe(0);
        expect(d.perpToLineVx).toBeCloseTo(50, 6);
        expect(d.toLine).toBeCloseTo(50, 1);
    });

    test('outside the zone the along leg reaches the 45 degree wedge', () => {
        // 120m past the end, 90m off the line: the wedge stands 90m past the end at that
        // offset, so the along leg is 120 - 90.
        const { toEnd, angle } = boat(120, 90);
        const d = startZoneDistances(toEnd, angle);
        expect(d.inStartZone).toBe(false);
        expect(d.toZoneVz).toBeCloseTo(30, 6);
        expect(d.perpToLineVx).toBeCloseTo(90, 6);
        // The length of the L, which is what the visualisation draws.
        expect(d.toLine).toBeCloseTo(120, 1);
    });

    test('the along leg vanishes exactly at the wedge', () => {
        // On the 45: overshoot equals the offset, so the corner is the boat itself.
        const { toEnd, angle } = boat(70, 70);
        const d = startZoneDistances(toEnd, angle);
        expect(Math.abs(angle)).toBeCloseTo(135, 6);
        expect(d.toZoneVz).toBeCloseTo(0, 6);
        expect(d.toLine).toBeCloseTo(70, 1);
    });

    test('distance to line is continuous across the zone boundary', () => {
        // The old geometry tested the boundary at 45 degrees but measured the along leg
        // against a 54.7 degree one, so toLine jumped by 0.29 * across on the way out.
        const inside = boat(69.99, 70), outside = boat(70.01, 70);
        const before = startZoneDistances(inside.toEnd, inside.angle);
        const after = startZoneDistances(outside.toEnd, outside.angle);
        expect(before.inStartZone).toBe(true);
        expect(after.inStartZone).toBe(false);
        // The old geometry jumped 0.29 * 70 = 20.5m here.
        expect(Math.abs(after.toLine - before.toLine)).toBeLessThan(0.2);
    });

    test('the along leg grows one for one once past the wedge', () => {
        const near = startZoneDistances(boat(100, 60).toEnd, boat(100, 60).angle);
        const far = startZoneDistances(boat(140, 60).toEnd, boat(140, 60).angle);
        expect(near.toZoneVz).toBeCloseTo(40, 6);
        expect(far.toZoneVz).toBeCloseTo(80, 6);
        expect(far.toLine - near.toLine).toBeCloseTo(40, 1);
    });

    test('a boat on the course side reports a negative distance', () => {
        const d = startZoneDistances(boat(-20, -35).toEnd, boat(-20, -35).angle);
        expect(d.ocs).toBe(true);
        expect(d.perpToLineVx).toBeCloseTo(35, 6);
        expect(d.distanceToLine).toBeCloseTo(-35, 1);
    });

    test('OCS outside the zone keeps the L and the sign', () => {
        const d = startZoneDistances(boat(150, -60).toEnd, boat(150, -60).angle);
        expect(d.ocs).toBe(true);
        expect(d.inStartZone).toBe(false);
        expect(d.toZoneVz).toBeCloseTo(90, 6);
        expect(d.perpToLineVx).toBeCloseTo(60, 6);
        expect(d.distanceToLine).toBeCloseTo(-150, 1);
    });
});

describe('effective vmg', () => {
    const { effectiveVmg, resetVmgSamples, toRadians, _vmgState } = require('../racer');

    function collect(name, value) {
        for (let i = 0; i < 3; i++) _vmgState[name].sorted.push({ value, cog: 0, sog: value });
    }

    test('uses the collected best when the boat is doing worse', () => {
        resetVmgSamples();
        collect('vmgToCourseSide', 4);
        // Line bearing 270, boat crawling: the history stands.
        const e = effectiveVmg(toRadians(0), 0.5, 270, 0, false, 'stb');
        expect(e.toLine).toBeCloseTo(4, 6);
        expect(e.alongLine).toBe(0); // inside the zone, no along leg
    });

    test('the boat beating its history wins', () => {
        resetVmgSamples();
        collect('vmgToCourseSide', 4);
        // Sailing straight at the line at 10 m/s beats a collected 4.
        const e = effectiveVmg(toRadians(0), 10, 270, 0, false, 'stb');
        expect(e.toLine).toBeCloseTo(10, 6);
    });

    test('the along leg is zero inside the zone and live outside it', () => {
        resetVmgSamples();
        collect('vmgToPortEnd', 3);
        expect(effectiveVmg(null, null, 270, 0, false, 'stb').alongLine).toBe(0);
        expect(effectiveVmg(null, null, 270, 50, false, 'stb').alongLine).toBeCloseTo(3, 6);
    });

    test('OCS takes the VMG back across the line', () => {
        resetVmgSamples();
        collect('vmgToCourseSide', 4);
        collect('vmgFromCourseSide', 2);
        expect(effectiveVmg(null, null, 270, 0, true, 'stb').toLine).toBeCloseTo(2, 6);
        expect(effectiveVmg(null, null, 270, 0, false, 'stb').toLine).toBeCloseTo(4, 6);
    });

    test('matches what computeTimeToLine divides by', () => {
        const { computeTimeToLine } = require('../racer');
        resetVmgSamples();
        collect('vmgToCourseSide', 5);
        collect('vmgToPortEnd', 2);
        const e = effectiveVmg(null, null, 270, 60, false, 'stb');
        const ttl = computeTimeToLine(null, null, 270, 60, 100, false, 'stb');
        expect(ttl).toBeCloseTo(60 / e.alongLine + 100 / e.toLine, 6);
    });
});

describe('minimum effective vmg', () => {
    const { effectiveVmg, resetVmgSamples, computeTimeToLine } = require('../racer');
    const KNOT = 0.514444;

    test('a direction with nothing collected still gets one knot', () => {
        resetVmgSamples();
        const e = effectiveVmg(null, null, 270, 100, false, 'stb');
        expect(e.toLine).toBeCloseTo(KNOT, 6);
        expect(e.alongLine).toBeCloseTo(KNOT, 6);
    });

    test('the floor never pulls a real VMG down', () => {
        resetVmgSamples();
        const { _vmgState } = require('../racer');
        for (let i = 0; i < 3; i++) {
            _vmgState.vmgToCourseSide.sorted.push({ value: 4, cog: 0, sog: 4 });
        }
        expect(effectiveVmg(null, null, 270, 0, false, 'stb').toLine).toBeCloseTo(4, 6);
    });

    test('no along leg means no floor on it', () => {
        resetVmgSamples();
        // Inside the zone there is nothing to sail along the line, so inventing a VMG
        // there would invent a time with it.
        expect(effectiveVmg(null, null, 270, 0, false, 'stb').alongLine).toBe(0);
    });

    test('time to line stays finite with no samples at all', () => {
        resetVmgSamples();
        const ttl = computeTimeToLine(null, null, 270, 0, 100, false, 'stb');
        expect(ttl).toBeCloseTo(100 / KNOT, 3);
        expect(Number.isFinite(ttl)).toBe(true);
    });
});

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

describe('start VMG zone distances', () => {
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

    test('OCS beyond the end: back to the clearance, then along into the zone', () => {
        // 150m beyond the end, 60m on the course side, back to 30m behind the line: the
        // 45 degree zone stands 30m beyond the end at that depth.
        const d = startZoneDistances(boat(150, -60).toEnd, boat(150, -60).angle, 45, 30);
        expect(d.ocs).toBe(true);
        expect(d.inStartZone).toBe(false);
        expect(d.perpToLineVx).toBeCloseTo(60, 6);
        expect(d.toZoneVz).toBeCloseTo(120, 6);
        expect(d.clearance).toBe(30);
        expect(d.distanceToLine).toBeCloseTo(-60, 1);
    });

    test('the zone edge follows the transition line angle', () => {
        const {toEnd, angle} = boat(120, 90);
        // At 35 degrees the zone stands 128m beyond the end at 90m off: inside it.
        expect(startZoneDistances(toEnd, angle, 35).toZoneVz).toBe(0);
        // At 60 degrees, 52m: 68m to sail along the line.
        expect(startZoneDistances(toEnd, angle, 60).toZoneVz).toBeCloseTo(120 - 90 / Math.tan(Math.PI / 3), 6);
        // At 90 degrees the zone is just the line's span.
        expect(startZoneDistances(toEnd, angle, 90).toZoneVz).toBeCloseTo(120, 6);
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

    test('OCS: away from the line on fromCourseSide, back to it on toCourseSide', () => {
        resetVmgSamples();
        collect('vmgToCourseSide', 4);
        collect('vmgFromCourseSide', 2);
        const ocs = effectiveVmg(null, null, 270, 0, true, 'stb');
        expect(ocs.awayFromLine).toBeCloseTo(2, 6);
        expect(ocs.toLine).toBeCloseTo(4, 6);
        const behind = effectiveVmg(null, null, 270, 0, false, 'stb');
        expect(behind.awayFromLine).toBe(0);
        expect(behind.toLine).toBeCloseTo(4, 6);
    });

    test('OCS time to line: away to the clearance, along into the zone, then back to the line', () => {
        const { computeTimeToLine } = require('../racer');
        resetVmgSamples();
        collect('vmgToCourseSide', 4);
        collect('vmgFromCourseSide', 2);
        collect('vmgToPortEnd', 5);
        // 20m over, 30m clearance: 50m at 2; 100m along at 5; 30m back at 4.
        const ttl = computeTimeToLine(null, null, 270, 100, 20, true, 'stb', 0, 30);
        expect(ttl).toBeCloseTo(50 / 2 + 100 / 5 + 30 / 4, 6);
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
    const { effectiveVmg, resetVmgSamples, computeTimeToLine, initRacer } = require('../racer');
    const KNOT = 0.514444;
    // The configured default: half a knot.
    const MIN = 0.5 * KNOT;

    test('a direction with nothing collected still gets the minimum', () => {
        resetVmgSamples();
        const e = effectiveVmg(null, null, 270, 100, false, 'stb');
        expect(e.toLine).toBeCloseTo(MIN, 6);
        expect(e.alongLine).toBeCloseTo(MIN, 6);
    });

    test('the minimum is configurable', () => {
        resetVmgSamples();
        initRacer({minEffectiveVmg: 2 * KNOT});
        try {
            const e = effectiveVmg(null, null, 270, 100, false, 'stb');
            expect(e.toLine).toBeCloseTo(2 * KNOT, 6);
            expect(e.alongLine).toBeCloseTo(2 * KNOT, 6);
        } finally {
            initRacer({minEffectiveVmg: MIN});
        }
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
        expect(ttl).toBeCloseTo(100 / MIN, 3);
        expect(Number.isFinite(ttl)).toBe(true);
    });
});

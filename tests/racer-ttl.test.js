// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toRadians,
    computeTimeToLine,
    resetVmgSamples,
    _vmgState
} = require('../racer');


describe('racer ttl', () => {
    test('timeToLineNoVMG: no VMG', () => {
        resetVmgSamples();
        expect(computeTimeToLine(toRadians(0), 10, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        // With no samples the along leg falls back to the minimum effective VMG (1kn),
        // so it still yields a time rather than nothing: 100m at 0.514 m/s.
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, false, 'stb', 300))
            .toBeCloseTo(100 / 0.514444, 3);
        // Only with no distance at all is there nothing to compute, and the supplied
        // timeToStart stands in.
        expect(computeTimeToLine(toRadians(0), 10, 270, 0, 0, false, 'stb', 300)).toBe(300);
        // Default timeToStart parameter is 0.
        expect(computeTimeToLine(toRadians(0), 10, 270, 0, 0, false, 'stb')).toBe(0);
    });

    test('timeToLineSmallVmg: small VMG', () => {
        resetVmgSamples();
        _vmgState.vmgToCourseSide.sorted.push({value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1});
        _vmgState.vmgFromCourseSide.sorted.push({value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2});
        _vmgState.vmgToPortEnd.sorted.push({value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1});
        _vmgState.vmgToStbEnd.sorted.push({value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2});

        expect(computeTimeToLine(toRadians(-1), 10, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(1), 10, 270, 100, 100, false, 'stb')).toBeCloseTo(110);

        expect(computeTimeToLine(toRadians(89), 10, 270, 0, 100, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(90), 10, 270, 100, 0, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(91), 10, 270, 100, 100, false, 'stb')).toBeCloseTo(200);

        expect(computeTimeToLine(toRadians(179), 10, 270, 0, 100, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(180), 10, 270, 100, 0, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(181), 10, 270, 100, 100, false, 'stb')).toBeCloseTo(200);

        expect(computeTimeToLine(toRadians(271), 10, 270, 0, 100, false, 'stb')).toBeCloseTo(100);
        expect(computeTimeToLine(toRadians(269), 10, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(270), 10, 270, 100, 100, false, 'stb')).toBeCloseTo(110);

        expect(computeTimeToLine(toRadians(359), 10, 270, 0, 100, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(1), 10, 270, 100, 100, true, 'port')).toBeCloseTo(100);

        expect(computeTimeToLine(toRadians(89), 10, 270, 0, 100, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(90), 10, 270, 100, 0, true, 'port')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(91), 10, 270, 100, 100, true, 'port')).toBeCloseTo(60);

        expect(computeTimeToLine(toRadians(179), 10, 270, 0, 100, true, 'port')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(180), 10, 270, 100, 0, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(181), 10, 270, 100, 100, true, 'port')).toBeCloseTo(60);

        expect(computeTimeToLine(toRadians(271), 10, 270, 0, 100, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(269), 10, 270, 100, 0, true, 'port')).toBeCloseTo(50);
        expect(computeTimeToLine(toRadians(270), 10, 270, 100, 100, true, 'port')).toBeCloseTo(100);
    });

    test('timeToLineSmallInstant: small instant', () => {
        resetVmgSamples();
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 15, cog: 0, sog: 15});
        _vmgState.vmgFromCourseSide.sorted.push({value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 25, cog: 0, sog: 25});
        _vmgState.vmgToPortEnd.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 15, cog: 0, sog: 15});
        _vmgState.vmgToStbEnd.sorted.push({value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 20, cog: 0, sog: 20}, {value: 25, cog: 0, sog: 25});

        expect(computeTimeToLine(toRadians(-1), 1, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(0), 1, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(1), 1, 270, 100, 100, false, 'stb')).toBeCloseTo(20);

        expect(computeTimeToLine(toRadians(89), 1, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(90), 1, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(91), 1, 270, 100, 100, false, 'stb')).toBeCloseTo(20);

        expect(computeTimeToLine(toRadians(179), 1, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(180), 1, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(181), 1, 270, 100, 100, false, 'stb')).toBeCloseTo(20);

        expect(computeTimeToLine(toRadians(271), 1, 270, 0, 100, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(269), 1, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
        expect(computeTimeToLine(toRadians(270), 1, 270, 100, 100, false, 'stb')).toBeCloseTo(20);

        expect(computeTimeToLine(toRadians(359), 1, 270, 0, 100, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(0), 1, 270, 100, 0, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(1), 1, 270, 100, 100, true, 'port')).toBeCloseTo(10);

        expect(computeTimeToLine(toRadians(89), 1, 270, 0, 100, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(90), 1, 270, 100, 0, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(91), 1, 270, 100, 100, true, 'port')).toBeCloseTo(10);

        expect(computeTimeToLine(toRadians(179), 1, 270, 0, 100, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(180), 1, 270, 100, 0, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(181), 1, 270, 100, 100, true, 'port')).toBeCloseTo(10);

        expect(computeTimeToLine(toRadians(271), 1, 270, 0, 100, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(269), 1, 270, 100, 0, true, 'port')).toBeCloseTo(5);
        expect(computeTimeToLine(toRadians(270), 1, 270, 100, 100, true, 'port')).toBeCloseTo(10);
    });

});

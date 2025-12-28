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
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, false, 'stb')).toBeUndefined();
    });

    test('timeToLineSmallVmg: small VMG', () => {
        resetVmgSamples();
        _vmgState.vmgToLinePos.push(1, 1, 1);
        _vmgState.vmgToLineNeg.push(2, 2, 2);
        _vmgState.vmgToZonePort.push(1, 1, 1);
        _vmgState.vmgToZoneStb.push(2, 2, 2);

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
        _vmgState.vmgToLinePos.push(10, 10, 10, 10, 10, 10, 10, 10, 10, 15);
        _vmgState.vmgToLineNeg.push(20, 20, 20, 20, 20, 20, 20, 20, 20, 25);
        _vmgState.vmgToZonePort.push(10, 10, 10, 10, 10, 10, 10, 10, 10, 15);
        _vmgState.vmgToZoneStb.push(20, 20, 20, 20, 20, 20, 20, 20, 20, 25);

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

// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toRadians,
    collectVmgSamples,
    resetVmgSamples,
    _vmgState
} = require('../racer');

describe('racer vmg', () => {
    test('resetVmgSamples: test arrays are cleared', () => {
        _vmgState.vmgToLinePos.push(1, 2, 3);
        _vmgState.vmgToLineNeg.push(4, 5, 6);
        _vmgState.vmgToZonePort.push(7, 8, 9);
        _vmgState.vmgToZoneStb.push(10, 11, 12);
        expect(_vmgState.vmgToLinePos.length).toBe(3);
        expect(_vmgState.vmgToLineNeg.length).toBe(3);
        expect(_vmgState.vmgToZonePort.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        resetVmgSamples();
        expect(_vmgState.vmgToLinePos.length).toBe(0);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(0);
    });


    test('collectVmgSamplesEastWestNarrow: test east west line, with perpendicular and narrow approaches', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(1);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(19.7);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(0);

        collectVmgSamples(toRadians(8.21), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(19.5);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(19.7);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(1);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(2.81);
    });


    test('collectVmgSamplesEastWest: test east west line with circle', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(1);
        expect(_vmgState.vmgToLinePos[0]).toBe(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(0);

        collectVmgSamples(toRadians(36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBe(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(1);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);

        collectVmgSamples(toRadians(90), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(0);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(2);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(5);

        collectVmgSamples(toRadians(90 + 36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(1);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(180), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(2);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(180 + 53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(3);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.length).toBe(1);
        expect(_vmgState.vmgToZonePort[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(270), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(2);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(3);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.length).toBe(2);
        expect(_vmgState.vmgToZonePort[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb[2]).toBeCloseTo(5);

        collectVmgSamples(-toRadians(53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(3);
        expect(_vmgState.vmgToLinePos[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLinePos[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.length).toBe(3);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.length).toBe(3);
        expect(_vmgState.vmgToZonePort[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZoneStb.length).toBe(3);
        expect(_vmgState.vmgToZoneStb[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb[2]).toBeCloseTo(5);

    });

    test('collectVmgSamplesNW2SE: test NW to SE line approached obliquely', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 8.21, 0, 0);
        expect(_vmgState.vmgToLinePos.length).toBe(0);
        expect(_vmgState.vmgToLineNeg.length).toBe(1);
        expect(_vmgState.vmgToLineNeg[0]).toBeCloseTo(2.81);
        expect(_vmgState.vmgToZonePort.length).toBe(1);
        expect(_vmgState.vmgToZonePort[0]).toBeCloseTo(19.5);
        expect(_vmgState.vmgToZoneStb.length).toBe(0);
    });
});

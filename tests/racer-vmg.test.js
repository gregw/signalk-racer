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
        _vmgState.vmgToLinePos.sorted.push(1, 2, 3);
        _vmgState.vmgToLinePos.queue.push(1, 2, 3);
        _vmgState.vmgToLineNeg.sorted.push(4, 5, 6);
        _vmgState.vmgToLineNeg.queue.push(4, 5, 6);
        _vmgState.vmgToZonePort.sorted.push(7, 8, 9);
        _vmgState.vmgToZonePort.queue.push(7, 8, 9);
        _vmgState.vmgToZoneStb.sorted.push(10, 11, 12);
        _vmgState.vmgToZoneStb.queue.push(10, 11, 12);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(3);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(3);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        resetVmgSamples();
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(0);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(0);
    });


    test('collectVmgSamplesEastWestNarrow: test east west line, with perpendicular and narrow approaches', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(1);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(19.7);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(0);

        collectVmgSamples(toRadians(8.21), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(19.5);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(19.7);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(1);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(2.81);
    });


    test('collectVmgSamplesEastWest: test east west line with circle', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(1);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBe(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(0);

        collectVmgSamples(toRadians(36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBe(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(1);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);

        collectVmgSamples(toRadians(90), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(0);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(2);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(5);

        collectVmgSamples(toRadians(90 + 36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(1);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(180), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(2);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(0);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(180 + 53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(3);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(1);
        expect(_vmgState.vmgToZonePort.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted[2]).toBeCloseTo(5);

        collectVmgSamples(toRadians(270), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(2);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(3);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(2);
        expect(_vmgState.vmgToZonePort.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort.sorted[1]).toBeCloseTo(5);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted[2]).toBeCloseTo(5);

        collectVmgSamples(-toRadians(53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(3);
        expect(_vmgState.vmgToLinePos.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLinePos.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToLinePos.sorted[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(3);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[1]).toBeCloseTo(3);
        expect(_vmgState.vmgToLineNeg.sorted[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(3);
        expect(_vmgState.vmgToZonePort.sorted[0]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZonePort.sorted[2]).toBeCloseTo(5);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(3);
        expect(_vmgState.vmgToZoneStb.sorted[0]).toBeCloseTo(3);
        expect(_vmgState.vmgToZoneStb.sorted[1]).toBeCloseTo(4);
        expect(_vmgState.vmgToZoneStb.sorted[2]).toBeCloseTo(5);

    });

    test('collectVmgSamplesNW2SE: test NW to SE line approached obliquely', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 8.21, 0, 0);
        expect(_vmgState.vmgToLinePos.sorted.length).toBe(0);
        expect(_vmgState.vmgToLineNeg.sorted.length).toBe(1);
        expect(_vmgState.vmgToLineNeg.sorted[0]).toBeCloseTo(2.81);
        expect(_vmgState.vmgToZonePort.sorted.length).toBe(1);
        expect(_vmgState.vmgToZonePort.sorted[0]).toBeCloseTo(19.5);
        expect(_vmgState.vmgToZoneStb.sorted.length).toBe(0);
    });
});

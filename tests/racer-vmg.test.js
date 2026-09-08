// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toRadians,
    initRacer,
    collectVmgSamples,
    resetVmgSamples,
    _vmgState
} = require('../racer');

describe('racer vmg', () => {
    test('resetVmgSamples: test arrays are cleared', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 1, cog: 0, sog: 1}, {value: 2, cog: 0, sog: 2}, {value: 3, cog: 0, sog: 3});
        _vmgState.vmgToCourseSide.queue.push({value: 1, cog: 0, sog: 1}, {value: 2, cog: 0, sog: 2}, {value: 3, cog: 0, sog: 3});
        _vmgState.vmgFromCourseSide.sorted.push({value: 4, cog: 0, sog: 4}, {value: 5, cog: 0, sog: 5}, {value: 6, cog: 0, sog: 6});
        _vmgState.vmgFromCourseSide.queue.push({value: 4, cog: 0, sog: 4}, {value: 5, cog: 0, sog: 5}, {value: 6, cog: 0, sog: 6});
        _vmgState.vmgToPortEnd.sorted.push({value: 7, cog: 0, sog: 7}, {value: 8, cog: 0, sog: 8}, {value: 9, cog: 0, sog: 9});
        _vmgState.vmgToPortEnd.queue.push({value: 7, cog: 0, sog: 7}, {value: 8, cog: 0, sog: 8}, {value: 9, cog: 0, sog: 9});
        _vmgState.vmgToStbEnd.sorted.push({value: 10, cog: 0, sog: 10}, {value: 11, cog: 0, sog: 11}, {value: 12, cog: 0, sog: 12});
        _vmgState.vmgToStbEnd.queue.push({value: 10, cog: 0, sog: 10}, {value: 11, cog: 0, sog: 11}, {value: 12, cog: 0, sog: 12});
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        resetVmgSamples();
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);
    });


    test('collectVmgSamplesEastWestNarrow: test east west line, with perpendicular and narrow approaches', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(19.7);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);

        collectVmgSamples(toRadians(8.21), 19.7, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(19.5);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(19.7);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(1);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(2.81);
    });


    test('collectVmgSamplesEastWest: test east west line with circle', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBe(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);

        collectVmgSamples(toRadians(36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBe(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(1);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);

        collectVmgSamples(toRadians(90), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(2);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(5);

        collectVmgSamples(toRadians(90 + 36.87), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted[2].value).toBeCloseTo(5);

        collectVmgSamples(toRadians(180), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted[2].value).toBeCloseTo(5);

        collectVmgSamples(toRadians(180 + 53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[1].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[2].value).toBeCloseTo(5);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(1);
        expect(_vmgState.vmgToPortEnd.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted[2].value).toBeCloseTo(5);

        collectVmgSamples(toRadians(270), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(2);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[1].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[2].value).toBeCloseTo(5);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(2);
        expect(_vmgState.vmgToPortEnd.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToPortEnd.sorted[1].value).toBeCloseTo(5);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted[2].value).toBeCloseTo(5);

        collectVmgSamples(-toRadians(53.13), 5, 270, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToCourseSide.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToCourseSide.sorted[2].value).toBeCloseTo(5);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(3);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[1].value).toBeCloseTo(3);
        expect(_vmgState.vmgFromCourseSide.sorted[2].value).toBeCloseTo(5);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToPortEnd.sorted[0].value).toBeCloseTo(4);
        expect(_vmgState.vmgToPortEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToPortEnd.sorted[2].value).toBeCloseTo(5);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(3);
        expect(_vmgState.vmgToStbEnd.sorted[0].value).toBeCloseTo(3);
        expect(_vmgState.vmgToStbEnd.sorted[1].value).toBeCloseTo(4);
        expect(_vmgState.vmgToStbEnd.sorted[2].value).toBeCloseTo(5);

    });

    test('collectVmgSamplesDiagonal: a diagonal approach feeds both a normal and a tangential VMG', () => {
        resetVmgSamples();
        // Line bearing 113 (stb -> port), boat making 1.4 m/s at 155 degrees: mostly along
        // the line towards the pin, but with a small component across it. Both must be kept.
        collectVmgSamples(toRadians(155), 1.4, 113, 0, 0);

        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(1);
        expect(_vmgState.vmgToPortEnd.sorted[0].value).toBeCloseTo(1.040, 2);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);

        // The across-line component is under 1 m/s, the old floor, and must still be kept.
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(0.937, 2);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
    });

    test('collectVmgSamplesSquare: a perpendicular approach feeds one VMG only', () => {
        resetVmgSamples();
        // Square to the line: no tangential component at all, so nothing along the line.
        collectVmgSamples(toRadians(113 + 90), 1.4, 113, 0, 0);

        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgToCourseSide.sorted[0].value).toBeCloseTo(1.4);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(0);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);
    });

    test('collectVmgSamplesNW2SE: test NW to SE line approached obliquely', () => {
        resetVmgSamples();
        collectVmgSamples(toRadians(0), 19.7, 8.21, 0, 0);
        expect(_vmgState.vmgToCourseSide.sorted.length).toBe(0);
        expect(_vmgState.vmgFromCourseSide.sorted.length).toBe(1);
        expect(_vmgState.vmgFromCourseSide.sorted[0].value).toBeCloseTo(2.81);
        expect(_vmgState.vmgToPortEnd.sorted.length).toBe(1);
        expect(_vmgState.vmgToPortEnd.sorted[0].value).toBeCloseTo(19.5);
        expect(_vmgState.vmgToStbEnd.sorted.length).toBe(0);
    });

    test('insertSample: eviction keeps sorted and queue holding the same samples', () => {
        initRacer({maxSamples: 3});
        resetVmgSamples();

        // Four samples of identical VMG - the same angle off four different line
        // bearings - so nothing but object identity tells them apart. Eviction must drop
        // the oldest sample itself, not merely some sample of equal value, or the sorted
        // array keeps one the queue has already let go.
        collectVmgSamples(toRadians(10), 5, 280, 0, 0);
        const vmg = _vmgState.vmgToCourseSide;
        const oldest = vmg.queue[0];
        collectVmgSamples(toRadians(20), 5, 290, 0, 0);
        collectVmgSamples(toRadians(30), 5, 300, 0, 0);
        collectVmgSamples(toRadians(40), 5, 310, 0, 0);

        expect(vmg.queue.length).toBe(3);
        expect(vmg.sorted.length).toBe(3);
        // The first sample in is the one that aged out, gone from both arrays.
        expect(vmg.queue).not.toContain(oldest);
        expect(vmg.sorted).not.toContain(oldest);
        // And the two hold the very same objects, in whatever order.
        expect(vmg.sorted.every(sample => vmg.queue.includes(sample))).toBe(true);
        expect(vmg.queue.every(sample => vmg.sorted.includes(sample))).toBe(true);

        initRacer({maxSamples: 600});
    });

});

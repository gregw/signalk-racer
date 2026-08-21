// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toRadians,
    initRacer,
    collectVmgSamples,
    resetVmgSamples,
    getBestApproach,
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

    test('getBestApproach: recovers the course that achieved the percentile VMG', () => {
        resetVmgSamples();
        // Three distinct courses onto an east-west line, chosen so each yields a
        // different VMG and every sample is identifiable by its cog and sog.
        collectVmgSamples(toRadians(0), 4, 270, 0, 0);   // square on  => vmg 4.0
        collectVmgSamples(toRadians(30), 6, 270, 0, 0);  // 60 off     => vmg 5.196
        collectVmgSamples(toRadians(60), 10, 270, 0, 0); // 30 off     => vmg 5.0

        // Percentile 0.9 of three samples is index floor(0.9 * 2) = 1, the middle
        // value 5.0, which came from the fast but wide course - not the best VMG,
        // and not the fastest boat speed, so only the stored pair can produce it.
        const approach = getBestApproach(false);
        expect(approach.vmg).toBeCloseTo(5.0);
        expect(approach.sog).toBeCloseTo(10);
        expect(approach.cog).toBeCloseTo(toRadians(60));

        // When OCS the fromCourseSide samples are used instead.
        collectVmgSamples(toRadians(180), 4, 270, 0, 0);
        const ocsApproach = getBestApproach(true);
        expect(ocsApproach.sog).toBeCloseTo(4);
        expect(ocsApproach.cog).toBeCloseTo(toRadians(180));
    });

    test('getBestApproach: reports nothing when there are no samples', () => {
        resetVmgSamples();
        expect(getBestApproach(false)).toBeNull();
        expect(getBestApproach(true)).toBeNull();
    });

    test('insertSample: eviction keeps sorted and queue holding the same samples', () => {
        initRacer({maxSamples: 3});
        resetVmgSamples();

        // Four samples of identical VMG but different courses: eviction must drop the
        // oldest sample itself, not merely some sample of equal value.
        collectVmgSamples(toRadians(10), 5, 280, 0, 0);
        collectVmgSamples(toRadians(20), 5, 290, 0, 0);
        collectVmgSamples(toRadians(30), 5, 300, 0, 0);
        collectVmgSamples(toRadians(40), 5, 310, 0, 0);

        const vmg = _vmgState.vmgToCourseSide;
        expect(vmg.queue.length).toBe(3);
        expect(vmg.sorted.length).toBe(3);
        // Same objects in both, so no stale course can survive in the sorted array.
        const byCog = (a, b) => a.cog - b.cog;
        expect([...vmg.sorted].sort(byCog)).toEqual([...vmg.queue].sort(byCog));
        expect(vmg.sorted.every(s => vmg.queue.includes(s))).toBe(true);
        // The first course sailed is the one that aged out.
        expect(vmg.queue.map(s => Math.round(s.cog * 180 / Math.PI))).toEqual([20, 30, 40]);

        initRacer({maxSamples: 600});
    });

    test('getBestApproach: outside the start zone the along-line samples govern', () => {
        resetVmgSamples();
        // An east-west line (bearing 270, stb -> port). Build one clearly identifiable
        // sample in each of the four directions.
        collectVmgSamples(toRadians(0), 4, 270, 0, 0);    // square on   => toCourseSide
        collectVmgSamples(toRadians(180), 5, 270, 0, 0);  // square back => fromCourseSide
        collectVmgSamples(toRadians(270), 6, 270, 0, 0);  // along west  => toPortEnd
        collectVmgSamples(toRadians(90), 7, 270, 0, 0);   // along east  => toStbEnd

        // Inside the zone (toZoneVz 0) the across-line samples are used.
        expect(getBestApproach(false, 0, 'port').direction).toBe('toCourseSide');
        expect(getBestApproach(false, 0, 'port').sog).toBeCloseTo(4);
        expect(getBestApproach(true, 0, 'port').direction).toBe('fromCourseSide');
        expect(getBestApproach(true, 0, 'port').sog).toBeCloseTo(5);

        // Outside the zone the boat must run along the line first, in the direction
        // away from the end it is beyond: past the pin (port) it sails towards stb.
        expect(getBestApproach(false, 100, 'port').direction).toBe('toStbEnd');
        expect(getBestApproach(false, 100, 'port').sog).toBeCloseTo(7);
        expect(getBestApproach(false, 100, 'stb').direction).toBe('toPortEnd');
        expect(getBestApproach(false, 100, 'stb').sog).toBeCloseTo(6);

        // Being OCS does not change the along-line choice.
        expect(getBestApproach(true, 100, 'port').direction).toBe('toStbEnd');
    });
});

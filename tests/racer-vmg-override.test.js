// tests/racer-vmg-override.test.js
/* global describe, test, expect, beforeEach */
'use strict';

const {
    toRadians,
    computeTimeToLine,
    resetVmgSamples,
    getBestVmg,
    getAllBestVmg,
    getBestVmgOverrides,
    setBestVmg,
    clearBestVmgOverrides,
    swapVmgEnds,
    _vmgState
} = require('../racer');

describe('racer vmg overrides', () => {
    beforeEach(() => {
        resetVmgSamples();
    });

    test('setBestVmg: an override stands in for the collected percentile', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});
        expect(getBestVmg('toCourseSide')).toBeCloseTo(10);

        expect(setBestVmg('toCourseSide', {value: 5})).toBeCloseTo(5);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(5);

        // Adjusting up works just as well as adjusting down.
        expect(setBestVmg('toCourseSide', {value: 25})).toBeCloseTo(25);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(25);

        // The samples are untouched, so clearing reverts to them.
        clearBestVmgOverrides('toCourseSide');
        expect(getBestVmg('toCourseSide')).toBeCloseTo(10);
    });

    test('setBestVmg: a delta applies to the current best VMG', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});

        // With no override, the delta applies to the collected percentile.
        expect(setBestVmg('toCourseSide', {delta: 0.5})).toBeCloseTo(10.5);
        // With an override set, it applies to the override.
        expect(setBestVmg('toCourseSide', {delta: 0.5})).toBeCloseTo(11);
        expect(setBestVmg('toCourseSide', {delta: -0.5})).toBeCloseTo(10.5);
        expect(getBestVmg('toCourseSide')).toBeCloseTo(10.5);
    });

    test('setBestVmg: zero is not an override, so it cannot blank out the samples', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});

        // Adjusting below zero clamps to zero...
        expect(setBestVmg('toCourseSide', {delta: -100})).toBe(0);
        // ...which reads as "no override", not as "best VMG is zero".
        expect(getBestVmg('toCourseSide')).toBeCloseTo(10);
        expect(getBestVmgOverrides().toCourseSide).toBeNull();
    });

    test('setBestVmg: rejects unknown names and missing values', () => {
        expect(setBestVmg('sideways', {value: 5})).toBeNull();
        expect(setBestVmg('toCourseSide', {})).toBeNull();
        expect(setBestVmg('toCourseSide', {value: 'fast'})).toBeNull();
        expect(setBestVmg('toCourseSide', {delta: NaN})).toBeNull();
        expect(getBestVmg('sideways')).toBeNull();
        expect(clearBestVmgOverrides('sideways')).toBe(false);
    });

    test('getAllBestVmg/getBestVmgOverrides: report all four directions', () => {
        _vmgState.vmgFromCourseSide.sorted.push({value: 4, cog: 0, sog: 4}, {value: 4, cog: 0, sog: 4}, {value: 4, cog: 0, sog: 4});
        setBestVmg('toCourseSide', {value: 5});
        setBestVmg('toStbEnd', {value: 3});

        expect(getAllBestVmg()).toEqual({toCourseSide: 5, fromCourseSide: 4, toPortEnd: 0, toStbEnd: 3});
        expect(getBestVmgOverrides()).toEqual({toCourseSide: 5, fromCourseSide: null, toPortEnd: null, toStbEnd: 3});
    });

    test('clearBestVmgOverrides: clears one or all', () => {
        setBestVmg('toCourseSide', {value: 5});
        setBestVmg('toStbEnd', {value: 3});

        expect(clearBestVmgOverrides('toCourseSide')).toBe(true);
        expect(getBestVmgOverrides()).toEqual({toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: 3});

        expect(clearBestVmgOverrides()).toBe(true);
        expect(getBestVmgOverrides()).toEqual({toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: null});
    });

    test('resetVmgSamples: clears overrides as well as samples', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});
        setBestVmg('toCourseSide', {value: 5});

        resetVmgSamples();

        expect(getBestVmgOverrides().toCourseSide).toBeNull();
        expect(getBestVmg('toCourseSide')).toBe(0);
    });

    test('computeTimeToLine: a lowered override slows the estimate, unless the boat is actually faster', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});

        // 100m off the line, stationary: the collected 10 m/s gives 10s.
        expect(computeTimeToLine(toRadians(270), 0, 270, 0, 100, false, 'stb')).toBeCloseTo(10);

        // Adjusted down to 5 m/s, the same 100m now takes 20s.
        setBestVmg('toCourseSide', {value: 5});
        expect(computeTimeToLine(toRadians(270), 0, 270, 0, 100, false, 'stb')).toBeCloseTo(20);

        // But a boat genuinely making 20 m/s towards the line always wins over the override.
        expect(computeTimeToLine(toRadians(0), 20, 270, 0, 100, false, 'stb')).toBeCloseTo(5);
    });

    test('computeTimeToLine: a raised override beats both the samples and the instantaneous VMG', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});
        setBestVmg('toCourseSide', {value: 25});

        // max(override 25, instantaneous 20) => 100m in 4s.
        expect(computeTimeToLine(toRadians(0), 20, 270, 0, 100, false, 'stb')).toBeCloseTo(4);
    });

    test('computeTimeToLine: when OCS the fromCourseSide override is used', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});
        _vmgState.vmgFromCourseSide.sorted.push({value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10}, {value: 10, cog: 0, sog: 10});
        setBestVmg('fromCourseSide', {value: 4});

        // Sailing towards the line while OCS: the instantaneous VMG is in the wrong
        // direction, so the override governs. 100m at 4 m/s = 25s.
        expect(computeTimeToLine(toRadians(0), 10, 270, 0, 100, true, 'port')).toBeCloseTo(25);

        // The toCourseSide override is not consulted when OCS.
        setBestVmg('toCourseSide', {value: 100});
        expect(computeTimeToLine(toRadians(0), 10, 270, 0, 100, true, 'port')).toBeCloseTo(25);
    });

    test('computeTimeToLine: the along-line overrides are picked by closest end', () => {
        _vmgState.vmgToPortEnd.sorted.push({value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1});
        _vmgState.vmgToStbEnd.sorted.push({value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1});
        setBestVmg('toPortEnd', {value: 10});
        setBestVmg('toStbEnd', {value: 5});

        // 100m along the line to the zone, no perpendicular distance, no tangential
        // motion (cog 0 against a 270 line is square to it).
        // Closest end port => sailing towards stb => the toStbEnd override.
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, false, 'port')).toBeCloseTo(20);
        // Closest end stb => sailing towards port => the toPortEnd override.
        expect(computeTimeToLine(toRadians(0), 10, 270, 100, 0, false, 'stb')).toBeCloseTo(10);
    });

    test('swapVmgEnds: exchanges both sample pairs and their overrides', () => {
        _vmgState.vmgToCourseSide.sorted.push({value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1}, {value: 1, cog: 0, sog: 1});
        _vmgState.vmgFromCourseSide.sorted.push({value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2}, {value: 2, cog: 0, sog: 2});
        _vmgState.vmgToPortEnd.sorted.push({value: 3, cog: 0, sog: 3}, {value: 3, cog: 0, sog: 3}, {value: 3, cog: 0, sog: 3});
        _vmgState.vmgToStbEnd.sorted.push({value: 4, cog: 0, sog: 4}, {value: 4, cog: 0, sog: 4}, {value: 4, cog: 0, sog: 4});
        setBestVmg('toCourseSide', {value: 11});
        setBestVmg('toPortEnd', {value: 33});

        swapVmgEnds();

        // Reversing the line bearing flips the sign of both VMG components, so
        // every sample is still valid - just relabelled.
        expect(_vmgState.vmgToCourseSide.sorted.map(s => s.value)).toEqual([2, 2, 2]);
        expect(_vmgState.vmgFromCourseSide.sorted.map(s => s.value)).toEqual([1, 1, 1]);
        expect(_vmgState.vmgToPortEnd.sorted.map(s => s.value)).toEqual([4, 4, 4]);
        expect(_vmgState.vmgToStbEnd.sorted.map(s => s.value)).toEqual([3, 3, 3]);

        expect(getBestVmgOverrides()).toEqual({toCourseSide: null, fromCourseSide: 11, toPortEnd: null, toStbEnd: 33});
        expect(getAllBestVmg()).toEqual({toCourseSide: 2, fromCourseSide: 11, toPortEnd: 4, toStbEnd: 33});
    });
});

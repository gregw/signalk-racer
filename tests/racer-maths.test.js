// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toDegrees,
    toRadians,
    _percentile,
} = require('../racer');

describe('racer math', () => {
    test('toDegrees: test maths', () => {
        expect(toDegrees(Math.PI)).toBeCloseTo(180);
        expect(toDegrees(Math.PI / 2)).toBeCloseTo(90);
        expect(toDegrees(0)).toBeCloseTo(0);
        expect(toDegrees(null)).toBeNull();
        expect(toDegrees(undefined)).toBeNull();
    });
    test('toRadians: test maths', () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI);
        expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
        expect(toRadians(0)).toBeCloseTo(0);
        expect(toRadians(null)).toBeNull();
        expect(toRadians(undefined)).toBeNull();
    });
    test('percentile: test maths', () => {
        expect(_percentile([], 0.5)).toBe(0);
        expect(_percentile([10], 0.5)).toBe(10);
        expect(_percentile([10, 20, 30], 0)).toBe(10);
        expect(_percentile([10, 20, 30], 0.5)).toBe(20);
        expect(_percentile([10, 20, 30], 0.9)).toBe(20);
        expect(_percentile([10, 20, 30], 1)).toBe(30);
        expect(_percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.75)).toBe(7);
    })
});

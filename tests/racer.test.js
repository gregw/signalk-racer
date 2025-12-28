// tests/racerMath.test.js
/* global describe, test, expect */
'use strict';

const {
    toDegrees,
    toRadians,
    percentileFromSorted
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
});

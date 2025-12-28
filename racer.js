// lib/racerMath.js
'use strict';


function toDegrees(rad) {
    if (rad === null || rad === undefined) return null;
    return rad * (180 / Math.PI);
}

function toRadians(deg) {
    if (deg === null || deg === undefined) return null;
    return deg * (Math.PI / 180);
}

function percentile(sortedArray, p) {
    if (!sortedArray || !sortedArray.length) return 0;
    const idx = Math.floor(p * (sortedArray.length - 1));
    return sortedArray[idx];
}

module.exports = {
    toDegrees,
    toRadians,
    percentileFromSorted: percentile
};

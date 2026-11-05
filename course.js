// course.js: the course review, a row for every point of a route in the order it is sailed.
'use strict';

const geolib = require('geolib');

const toDegrees = (rad) => rad * 180 / Math.PI;

// An angle in degrees, normalised to -180..180.
function signedDegrees(deg) {
    return ((deg % 360) + 540) % 360 - 180;
}

/**
 * Build the course review for a route.
 *
 * @param {object} args
 * @param {Array<{name: ?string, position: {latitude: number, longitude: number}}>} args.points
 *   The route's points in the route's own order.
 * @param {boolean} [args.reverse] Whether the route is being sailed in reverse.
 * @param {?number} [args.pointIndex] The index, in sailing order, of the point being sailed
 *   to, when this is the active route.
 * @param {?{latitude: number, longitude: number}} [args.position] The boat's position.
 * @param {?number} [args.twd] True wind direction, radians, assumed to hold for every leg.
 * @returns {{rows: Array<object>, remaining: ?number}} A row for each point in sailing
 *   order. Bearings in degrees true, distances in metres. `legTwa` is signed: positive with
 *   the wind on the starboard side.
 */
function courseReview({points, reverse = false, pointIndex = null, position = null, twd = null}) {
    const ordered = reverse ? [...points].reverse() : points;
    const twdDeg = Number.isFinite(twd) ? toDegrees(twd) : null;
    const active = Number.isInteger(pointIndex);

    let remaining = active && position ? 0 : null;
    const rows = ordered.map((point, i) => {
        const row = {
            index: i,
            name: point.name ?? null,
            position: point.position,
            status: !active ? null : i < pointIndex ? 'passed' : i === pointIndex ? 'next' : 'ahead',
            btw: null,
            dtw: null,
            legHeading: null,
            legLength: null,
            legTwa: null,
        };
        if (position) {
            row.btw = geolib.getRhumbLineBearing(position, point.position);
            row.dtw = geolib.getPreciseDistance(position, point.position, 0.1);
        }
        if (i > 0) {
            const from = ordered[i - 1].position;
            row.legHeading = geolib.getRhumbLineBearing(from, point.position);
            row.legLength = geolib.getPreciseDistance(from, point.position, 0.1);
            if (twdDeg !== null)
                row.legTwa = signedDegrees(twdDeg - row.legHeading);
        }
        // Still to sail: to the next point from here, then each leg after it.
        if (remaining !== null) {
            if (i === pointIndex)
                remaining += row.dtw;
            else if (i > pointIndex)
                remaining += row.legLength;
        }
        return row;
    });

    // Sailing from here to the next point is a leg too, so give it a TWA as well.
    if (active && position && twdDeg !== null && rows[pointIndex])
        rows[pointIndex].btwTwa = signedDegrees(twdDeg - rows[pointIndex].btw);

    return {rows, remaining};
}

module.exports = {courseReview, signedDegrees};

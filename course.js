// course.js: the course review, a row for every point of a route in the order it is sailed.
'use strict';

const geolib = require('geolib');

const toDegrees = (rad) => rad * 180 / Math.PI;
const toRadians = (deg) => deg * Math.PI / 180;

// Without published tack and gybe angles: tacking through 90°, and gybing through 90°.
const DEFAULT_BEAT = 45;
const DEFAULT_GYBE = 135;

// An angle in degrees, normalised to -180..180.
function signedDegrees(deg) {
    return ((deg % 360) + 540) % 360 - 180;
}

/**
 * How a leg is sailed in a steady wind: a beat when its TWA is within the tack (beat) angle,
 * a run when beyond the gybe angle, otherwise a reach. A beat or run is sailed as two tacks
 * (or gybes) at those angles, split so that together they make good the leg; a reach is one.
 *
 * @param {number} twa The leg's signed TWA, degrees, positive with the wind to starboard.
 * @param {number} length The leg's length, metres.
 * @param {object} [options]
 * @param {?number} [options.beatAngle] Tack angle, degrees off the wind.
 * @param {?number} [options.gybeAngle] Gybe angle, degrees off the wind.
 * @param {?function(number): ?number} [options.speedAt] Boat speed, m/s, at a TWA in radians.
 * @param {?number} [options.tws] True wind speed, m/s, for the apparent wind.
 * @returns {{kind: string, side: ?string, balance: number, starboard: number, port: number,
 *   starboardTime: number, portTime: number, timed: boolean, time: ?number, vmg: ?number,
 *   stw: ?number, sailedTwa: number, awa: ?number, aws: ?number}} `side` is the favoured tack,
 *   `balance` how much it is favoured: 1 on one tack only, 0 when even. Distances sailed in
 *   metres; times in seconds at the polar speed, or in metres sailed when `timed` is false.
 *   With a polar speed: `time` for the leg, `vmg` along it and `stw` sailing it, m/s. The
 *   signed TWA sailed on the favoured tack, and the apparent wind there (degrees and m/s,
 *   needing the TWS).
 */
function legSailing(twa, length, {beatAngle = null, gybeAngle = null, speedAt = null, tws = null} = {}) {
    const off = Math.abs(twa);
    const beat = Number.isFinite(beatAngle) ? beatAngle : DEFAULT_BEAT;
    const gybe = Number.isFinite(gybeAngle) ? gybeAngle : DEFAULT_GYBE;
    const kind = off < beat ? 'beat' : off > gybe ? 'run' : 'reach';
    const side = twa > 0 ? 'S' : twa < 0 ? 'P' : null;

    let sailed = kind === 'beat' ? beat : kind === 'run' ? gybe : off;
    let starboard = twa >= 0 ? length : 0;
    let port = length - starboard;
    if (kind !== 'reach') {
        // Make good the leg on the two tacks: L(cos t, sin t) = s(cos A, sin A) + p(cos A, -sin A).
        const t = toRadians(twa), a = toRadians(sailed);
        const along = length * Math.cos(t) / Math.cos(a), across = length * Math.sin(t) / Math.sin(a);
        const s = (along + across) / 2, p = (along - across) / 2;
        if (s > 0 && p > 0) {
            starboard = s;
            port = p;
        } else {
            // Laid on one tack: sailed straight.
            sailed = off;
        }
    }
    const speed = speedAt ? speedAt(toRadians(sailed)) : null;
    const timed = Number.isFinite(speed) && speed > 0;
    const total = starboard + port;
    const time = timed ? total / speed : null;
    // The TWA sailed on the tack sailed most, and the apparent wind there.
    const sailedTwa = (twa < 0 || (twa === 0 && port > starboard) ? -1 : 1) * sailed;
    let awa = null, aws = null;
    if (timed && Number.isFinite(tws) && tws >= 0) {
        const t = toRadians(sailedTwa);
        const x = tws * Math.cos(t) + speed, y = tws * Math.sin(t);
        aws = Math.hypot(x, y);
        awa = aws > 0 ? toDegrees(Math.atan2(y, x)) : 0;
    }
    return {
        kind,
        side,
        balance: total > 0 ? Math.abs(starboard - port) / total : 0,
        starboard,
        port,
        starboardTime: timed ? starboard / speed : starboard,
        portTime: timed ? port / speed : port,
        timed,
        time,
        vmg: time > 0 ? length / time : null,
        stw: timed ? speed : null,
        sailedTwa,
        awa,
        aws,
    };
}

/**
 * The tack and gybe angles from a polar: the TWAs of the best VMG upwind and downwind.
 *
 * @param {?function(number): ?number} speedAt Boat speed, m/s, at a TWA in radians, in the
 *   wind being reviewed.
 * @returns {?{beatAngle: number, gybeAngle: number}} Degrees off the wind, or null when the
 *   polar gives no speeds.
 */
function polarAngles(speedAt) {
    if (!speedAt) return null;
    let beat = null, gybe = null;
    for (let deg = 20; deg <= 180; deg += 0.5) {
        const speed = speedAt(toRadians(deg));
        if (!Number.isFinite(speed) || speed <= 0) continue;
        const vmg = speed * Math.cos(toRadians(deg));
        if (deg < 90 && (!beat || vmg > beat.vmg)) beat = {deg, vmg};
        if (deg > 90 && (!gybe || -vmg > gybe.vmg)) gybe = {deg, vmg: -vmg};
    }
    return beat && gybe ? {beatAngle: beat.deg, gybeAngle: gybe.deg} : null;
}

/**
 * The time to be spent beating, reaching and running, and on each tack, as fractions of the
 * whole, from the legs' sailing.
 */
function sailingTotals(legs) {
    const sums = {beat: 0, reach: 0, run: 0, port: 0, starboard: 0};
    let timed = legs.length > 0;
    for (const leg of legs) {
        const time = leg.starboardTime + leg.portTime;
        sums[leg.kind] += time;
        sums.starboard += leg.starboardTime;
        sums.port += leg.portTime;
        timed = timed && leg.timed;
    }
    const total = sums.starboard + sums.port;
    if (!(total > 0)) return null;
    const fraction = (v) => v / total;
    return {
        beat: fraction(sums.beat), reach: fraction(sums.reach), run: fraction(sums.run),
        port: fraction(sums.port), starboard: fraction(sums.starboard),
        // Time at the polar speeds, or, without a polar, the distance sailed.
        timed,
        // The time to sail it all, seconds, at the polar speeds.
        time: timed ? total : null,
    };
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
 * @param {?number} [args.beatAngle] Tack angle, radians off the wind, either sign.
 * @param {?number} [args.gybeAngle] Gybe angle, radians off the wind, either sign.
 * @param {?function(number): ?number} [args.speedAt] Boat speed, m/s, at a TWA in radians.
 * @param {?number} [args.tws] True wind speed, m/s, for the apparent wind on each leg.
 * @param {?{beatAngle: number, gybeAngle: number}} [args.polarAngles] The polar's best VMG
 *   angles, radians, when the polar provides them; otherwise they are searched for with speedAt.
 *   The tack and gybe angles are the ones given, else the polar's best VMG angles, else 45°
 *   and 135°; `angles` says which, in degrees.
 * @returns {{rows: Array<object>, remaining: ?number, totals: ?object, angles: object}} A row for each point
 *   in sailing order. Bearings in degrees true, distances in metres. `legTwa` is signed:
 *   positive with the wind on the starboard side; `legSailing` is how the leg is sailed (see
 *   legSailing), and `btwSailing` the same from here to the point being sailed to. `totals`
 *   are for the course still to sail (all of it when the route is not active).
 */
function courseReview({points, reverse = false, pointIndex = null, position = null, twd = null,
                          beatAngle = null, gybeAngle = null, speedAt = null, tws = null, polarAngles: given = null}) {
    const ordered = reverse ? [...points].reverse() : points;
    const twdDeg = Number.isFinite(twd) ? toDegrees(twd) : null;
    const active = Number.isInteger(pointIndex);
    const angle = (v) => Number.isFinite(v) && v !== 0 ? Math.abs(toDegrees(v)) : null;
    let angles = {beatAngle: angle(beatAngle), gybeAngle: angle(gybeAngle), source: 'published'};
    if (angles.beatAngle === null || angles.gybeAngle === null) {
        const polar = given && angle(given.beatAngle) !== null && angle(given.gybeAngle) !== null
            ? {beatAngle: angle(given.beatAngle), gybeAngle: angle(given.gybeAngle)}
            : polarAngles(speedAt);
        angles = polar
            ? {beatAngle: angles.beatAngle ?? polar.beatAngle, gybeAngle: angles.gybeAngle ?? polar.gybeAngle,
                source: angles.beatAngle === null && angles.gybeAngle === null ? 'polar' : 'published and polar'}
            : {beatAngle: angles.beatAngle ?? DEFAULT_BEAT, gybeAngle: angles.gybeAngle ?? DEFAULT_GYBE,
                source: angles.beatAngle === null && angles.gybeAngle === null ? 'default' : 'published and default'};
    }
    const options = {beatAngle: angles.beatAngle, gybeAngle: angles.gybeAngle, speedAt, tws};

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
            if (twdDeg !== null) {
                row.legTwa = signedDegrees(twdDeg - row.legHeading);
                row.legSailing = legSailing(row.legTwa, row.legLength, options);
            }
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
    const next = active && position && twdDeg !== null ? rows[pointIndex] : null;
    if (next) {
        next.btwTwa = signedDegrees(twdDeg - next.btw);
        next.btwSailing = legSailing(next.btwTwa, next.dtw, options);
    }

    // The course still to sail: from here to the point being sailed to, then on from it.
    const legs = active
        ? (next ? [next.btwSailing] : []).concat(rows.filter(r => r.index > pointIndex && r.legSailing).map(r => r.legSailing))
        : rows.filter(r => r.legSailing).map(r => r.legSailing);
    const totals = twdDeg !== null && (!active || next) ? sailingTotals(legs) : null;

    return {rows, remaining, totals, angles};
}

module.exports = {courseReview, legSailing, polarAngles, sailingTotals, signedDegrees};

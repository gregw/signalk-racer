// layline.js: the distance and time to the lay lines into the mark being sailed to.
'use strict';

/**
 * The lay lines into a mark, as the Signal K spec has them:
 * - `layline`: the lay line crossing the current course, i.e. the one on the other tack,
 *   reached by sailing on at the current COG and SOG;
 * - `oppositeLayline`: the lay line parallel to the current course, i.e. the one on this
 *   tack, reached by tacking (or gybing) now and sailing the other tack at the current SOG.
 *
 * The lay lines are close hauled when the mark is upwind of abeam, and at the gybe angle
 * when it is downwind of abeam. Inside them, the mark is within the beat (or gybe) angle of
 * the wind; beyond them, the boat has overstood one of them. Each runs back from the mark,
 * the way a boat on that heading comes from. The tack is the one the COG is on.
 *
 * A distance is along the course sailed to the lay line: negative when the boat is already
 * past it (overstood), by the distance back along that course. Null when the course never
 * reaches it (heading away, or parallel), or reaches it only beyond the mark, where it is no
 * longer a lay line. A time is the distance at the SOG, null below 0.1 m/s.
 *
 * @param {object} options All angles in radians true, distances in metres, speeds m/s.
 * @param {number} options.bearing Bearing from the boat to the mark.
 * @param {number} options.distance Distance from the boat to the mark.
 * @param {number} options.cog
 * @param {number} options.sog
 * @param {number} options.twd
 * @param {number} options.beatAngle Off the wind, only its size counts.
 * @param {number} options.gybeAngle Off the wind, only its size counts.
 * @returns {?{leg: string, layline: {distance: ?number, time: ?number},
 *   oppositeLayline: {distance: ?number, time: ?number}}} `leg` is 'beat' or 'run'. Null
 *   without all the inputs.
 */
function laylines({bearing, distance, cog, sog, twd, beatAngle, gybeAngle}) {
    if (![bearing, distance, cog, sog, twd, beatAngle, gybeAngle].every(Number.isFinite))
        return null;
    const signed = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const offMark = Math.abs(signed(twd - bearing));
    const beat = Math.abs(beatAngle), gybe = Math.abs(gybeAngle);
    const leg = offMark <= Math.PI / 2 ? 'beat' : 'run';
    const angle = leg === 'beat' ? beat : gybe;

    // East/north, the boat at the origin.
    const unit = (h) => ({x: Math.sin(h), y: Math.cos(h)});
    const cross = (a, b) => a.x * b.y - a.y * b.x;
    const mark = {x: distance * Math.sin(bearing), y: distance * Math.cos(bearing)};
    // The wind on the starboard side: starboard tack, sailing twd - angle.
    const starboard = signed(twd - cog) >= 0;
    const thisTack = unit(starboard ? twd - angle : twd + angle);
    const otherTack = unit(starboard ? twd + angle : twd - angle);

    // From the boat along a course to the lay line made by boats arriving at the mark on
    // the heading `lay`, which lies on the side of it that `inside` (a direction back from
    // the mark) points to.
    const toLay = (course, lay, inside) => {
        const across = cross(course, lay);
        if (Math.abs(across) < 1e-9)
            return null;
        const along = cross(mark, lay) / across;
        // Where on the lay line: back from the mark is negative.
        const at = cross(mark, course) / across;
        const side = Math.sign(cross(lay, {x: -mark.x, y: -mark.y}));
        const within = side === 0 || side === Math.sign(cross(lay, inside));
        if (within)
            return along >= 0 && at <= 0 ? along : null;
        // Overstood: by how far back along the course it was crossed.
        return at <= 0 ? -Math.abs(along) : null;
    };
    const back = (v) => ({x: -v.x, y: -v.y});
    const result = (d) => ({
        distance: d,
        time: d !== null && sog >= 0.1 ? d / sog : null,
    });
    return {
        leg,
        // Sailing on, to the lay line on the other tack, from inside the lay lines.
        layline: result(toLay(unit(cog), otherTack, back(thisTack))),
        // Tacking now and sailing the other tack, to the lay line on this one.
        oppositeLayline: result(toLay(otherTack, thisTack, back(otherTack))),
    };
}

module.exports = {laylines};

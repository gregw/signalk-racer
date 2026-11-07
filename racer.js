// lib/racerMath.js
'use strict';

let cfg = {
    minSog: 1.0,
    minVmg: 0.01,
    // Floor under each effective VMG, in m/s. Without one, a boat that has collected no
    // samples in a direction - or is drifting - reports no VMG at all and the time to
    // line becomes meaningless. Half a knot is a speed almost any boat can make good.
    minEffectiveVmg: 0.257222,
    maxDistance: 2000,
    maxSamples: 600,
    // Samples older than this, in seconds, are discarded, so speeds from before the boat
    // started sailing the pre-start (motoring, say) age out.
    maxSampleAge: 600,
    // A sample more than this far above the polar is discarded entirely, as the boat is
    // probably motoring. Ratios above 1 up to this are kept, as they are what the boat did.
    maxPolarRatio: 1.2,
    percentile: 0.9
};

let clock = () => Date.now();

let log = {
    debug: () => {
    }
};

function initRacer(config = {}, logger = null) {
    cfg = {...cfg, ...config};
    if (logger?.debug) log = logger;
}

// VMG sample state is kept private to this module.
// Each entry has a `sorted` array (ascending, for O(1) percentile) and a `queue` array
// (insertion-order FIFO, for correct oldest-first eviction) of the raw VMG samples, and a
// `ratios` window of the same shape holding each sample's polar ratio (its VMG over the
// raw polar VMG in that direction, for the wind at the time), when there was a polar.
// `override` (0 == none) is a speed manually set by the operator, which stands in for the
// collected estimate until it is cleared. When it was set with a polar, `overrideFactor`
// holds it as a factor of the polar VMG at the time, so the adjustment follows the wind.
function newVmgEntry() {
    return {sorted: [], queue: [], ratios: {sorted: [], queue: []}, override: 0, overrideFactor: null};
}

const vmgState = {
    vmgToCourseSide: newVmgEntry(),   // Across the line towards the course side (starting)
    vmgFromCourseSide: newVmgEntry(), // Across the line away from the course side (returning when OCS)
    vmgToPortEnd: newVmgEntry(),      // Along the line towards the PORT end (pin)
    vmgToStbEnd: newVmgEntry(),       // Along the line towards the STARBOARD end (boat)
};

// A pool of direction-free speed ratios: the boat's speed against the polar speed at the
// angle it was sailing, so an unsailed direction can use how the boat is sailing generally.
const speedRatios = {sorted: [], queue: []};

// The polar for the current wind, or null when there is none (no polar, or no wind):
// {vmg: {toCourseSide, fromCourseSide, toPortEnd, toStbEnd} raw polar VMGs in m/s,
//  performanceFactor}.
let polarNow = null;

// Public names for each of the collected VMGs, as published under
// navigation.racing.bestVmg.* and used by the set/clear API.
const vmgNames = {
    toCourseSide: 'vmgToCourseSide',
    fromCourseSide: 'vmgFromCourseSide',
    toPortEnd: 'vmgToPortEnd',
    toStbEnd: 'vmgToStbEnd'
};

function vmgEntry(name) {
    const key = vmgNames[name];
    return key ? vmgState[key] : null;
}

function clearWindow(window) {
    window.sorted.length = 0;
    window.queue.length = 0;
}

// Discard the samples and adjustments for each direction. The pool of speed ratios is
// about the boat rather than the line, so it is kept when the line moves, and only
// discarded when `pool` is set.
function resetVmgSamples({pool = false} = {}) {
    for (const vmg of Object.values(vmgState)) {
        clearWindow(vmg);
        clearWindow(vmg.ratios);
        vmg.override = 0;
        vmg.overrideFactor = null;
    }
    if (pool)
        clearWindow(speedRatios);
}

// Set the polar for the current wind, as {vmg: {<name>: m/s}, performanceFactor}, or
// null when there is no polar or no wind.
function setPolar(polar) {
    polarNow = polar ?? null;
}

// The raw polar VMG for a direction now, or null without a usable one.
function polarVmgNow(name) {
    const v = polarNow?.vmg?.[name];
    return Number.isFinite(v) && v > 0 ? v : null;
}

function minSamples() {
    return Math.max(1, Math.round(0.2 * cfg.maxSamples));
}

/**
 * The tuned performance factor for a direction: polar management's performance factor,
 * tuned by the polar ratios collected. The pooled speed ratios are blended in from the
 * performance factor, then this direction's own ratios from that, each by
 * min(n / minSamples, 1), so the estimate moves smoothly as samples arrive.
 */
function tunedFactor(name) {
    const vmg = vmgEntry(name);
    if (!vmg || !polarNow) return null;
    const factor = Number.isFinite(polarNow.performanceFactor) ? polarNow.performanceFactor : 1;
    const min = minSamples();

    const np = count(speedRatios);
    const wp = Math.min(np / min, 1);
    const pooled = wp > 0 ? wp * percentile(speedRatios, cfg.percentile) + (1 - wp) * factor : factor;

    const nd = count(vmg.ratios);
    const wd = Math.min(nd / min, 1);
    return wd > 0 ? wd * percentile(vmg.ratios, cfg.percentile) + (1 - wd) * pooled : pooled;
}

/**
 * The polar VMG in a direction: the best progress in that direction over all headings,
 * which is where a line at right angles to the direction just touches the polar curve.
 * Headings are searched a degree at a time within 90 degrees of the direction.
 *
 * @param {function(number, number): ?number} speedAt Polar speed (m/s) for a TWS (m/s)
 *   and an unsigned TWA (radians), or null when unknown.
 * @param {number} tws True wind speed, m/s.
 * @param {number} twd True wind direction, radians.
 * @param {number} direction True bearing to make progress in, radians.
 * @returns {?number} m/s, or null when the polar gives nothing.
 */
function polarVmg(speedAt, tws, twd, direction) {
    let best = null;
    for (let deg = -90; deg <= 90; deg++) {
        const offset = toRadians(deg);
        const heading = direction + offset;
        const speed = speedAt(tws, Math.abs(normaliseAngle(heading - twd)));
        if (!Number.isFinite(speed)) continue;
        const vmg = speed * Math.cos(offset);
        if (best === null || vmg > best) best = vmg;
    }
    return best;
}

// The raw polar VMG for each of the four directions, given the line bearing in degrees.
function polarVmgs(speedAt, tws, twd, lineBearing) {
    const bearing = toRadians(lineBearing);
    return {
        toCourseSide: polarVmg(speedAt, tws, twd, bearing + Math.PI / 2),
        fromCourseSide: polarVmg(speedAt, tws, twd, bearing - Math.PI / 2),
        toPortEnd: polarVmg(speedAt, tws, twd, bearing),
        toStbEnd: polarVmg(speedAt, tws, twd, bearing + Math.PI),
    };
}

// An angle in radians, normalised to -PI..PI.
function normaliseAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
}

function toDegrees(rad) {
    if (rad === null || rad === undefined) return null;
    return rad * (180 / Math.PI);
}

function toRadians(deg) {
    if (deg === null || deg === undefined) return null;
    return deg * (Math.PI / 180);
}

// The sample at the given percentile.
function percentileSample(vmg, p) {
    expireWindow(vmg);
    if (!vmg.sorted.length) return null;
    const idx = Math.floor(p * (vmg.sorted.length - 1));
    return vmg.sorted[idx];
}

function percentile(vmg, p) {
    const sample = percentileSample(vmg, p);
    return sample ? sample.value : 0;
}

// The name of a vmgState entry.
function nameOf(vmg) {
    return Object.keys(vmgNames).find(name => vmgState[vmgNames[name]] === vmg);
}

// The manual adjustment for a direction as a speed in the current wind, or 0 for none.
function overrideNow(vmg, polar) {
    if (polar !== null && vmg.overrideFactor !== null)
        return polar * vmg.overrideFactor;
    return vmg.override > 0 ? vmg.override : 0;
}

// The best VMG for a direction. With a polar for the current wind, it is the polar VMG
// times the tuned performance factor (or the adjustment's factor); without one, a manual
// override if one is set, otherwise the collected percentile. This is the *collected*
// estimate only; the instantaneous VMG the boat is actually achieving is applied on top
// of this in computeTimeToLine, and always wins if it is better.
function bestVmg(vmg) {
    const name = nameOf(vmg);
    const polar = polarVmgNow(name);
    const override = overrideNow(vmg, polar);
    if (override > 0) return override;
    if (polar !== null) return polar * tunedFactor(name);
    return percentile(vmg, cfg.percentile);
}

function getBestVmg(name) {
    const vmg = vmgEntry(name);
    return vmg ? bestVmg(vmg) : null;
}

function getAllBestVmg() {
    const all = {};
    for (const name of Object.keys(vmgNames)) {
        all[name] = bestVmg(vmgState[vmgNames[name]]);
    }
    return all;
}

// Overrides as published for display, as speeds in the current wind, with 0 reported as
// null (no override).
function getBestVmgOverrides() {
    const overrides = {};
    for (const name of Object.keys(vmgNames)) {
        const override = overrideNow(vmgState[vmgNames[name]], polarVmgNow(name));
        overrides[name] = override > 0 ? override : null;
    }
    return overrides;
}

// The raw polar VMGs for the current wind, null for each without a polar.
function getPolarVmgs() {
    const all = {};
    for (const name of Object.keys(vmgNames))
        all[name] = polarVmgNow(name);
    return all;
}

// The tuned performance factor in use for each direction (an adjustment's factor when
// one is set), null for each without a polar.
function getTunedFactors() {
    const all = {};
    for (const name of Object.keys(vmgNames)) {
        const vmg = vmgState[vmgNames[name]];
        const polar = polarVmgNow(name);
        if (polar === null)
            all[name] = null;
        else if (vmg.overrideFactor !== null)
            all[name] = vmg.overrideFactor;
        else if (vmg.override > 0)
            all[name] = vmg.override / polar;
        else
            all[name] = tunedFactor(name);
    }
    return all;
}

// Set an override, either absolutely (`value`) or relative to the current best
// VMG (`delta`). Returns the new override, or null if the request was invalid.
function setBestVmg(name, {value, delta} = {}) {
    const vmg = vmgEntry(name);
    if (!vmg) return null;

    let next;
    if (typeof value === 'number' && isFinite(value))
        next = value;
    else if (typeof delta === 'number' && isFinite(delta))
        next = bestVmg(vmg) + delta;
    else
        return null;

    // A zero override means "no override", so it can never blank out the samples.
    vmg.override = Math.max(0, next);
    // With a polar, keep it as a factor of the polar VMG, so it follows the wind.
    const polar = polarVmgNow(name);
    vmg.overrideFactor = polar !== null && vmg.override > 0 ? vmg.override / polar : null;
    log.debug(`setBestVmg ${name} = ${vmg.override} (factor ${vmg.overrideFactor})`);
    return vmg.override;
}

// Clear one override, or all of them when no name is given.
function clearBestVmgOverrides(name) {
    if (name === undefined || name === null) {
        for (const vmg of Object.values(vmgState)) {
            vmg.override = 0;
            vmg.overrideFactor = null;
        }
        return true;
    }
    const vmg = vmgEntry(name);
    if (!vmg) return false;
    vmg.override = 0;
    vmg.overrideFactor = null;
    return true;
}

// Swapping the ends of the line reverses its bearing by 180°, which flips the
// sign of both VMG components in collectVmgSamples. Every collected sample is
// therefore still valid, just relabelled, so exchange the entries (samples and
// overrides) rather than discarding them.
function swapVmgEnds() {
    const toCourseSide = vmgState.vmgToCourseSide;
    vmgState.vmgToCourseSide = vmgState.vmgFromCourseSide;
    vmgState.vmgFromCourseSide = toCourseSide;

    const toPortEnd = vmgState.vmgToPortEnd;
    vmgState.vmgToPortEnd = vmgState.vmgToStbEnd;
    vmgState.vmgToStbEnd = toPortEnd;
}

/**
 * Collect a VMG sample in each direction the boat is making progress in.
 *
 * @param {object} [polar] The polar at the time of the sample, when there is one:
 *   `vmg` the raw polar VMG for each direction (as from polarVmgs), and `speedRatio` the
 *   boat's speed over the polar speed at the angle it was sailing.
 */
function collectVmgSamples(cog, sog, lineBearing, toZoneVz, perpToLineVx, polar = null) {
    if (sog < cfg.minSog) return;   // ignore drifting / tacking stalls
    if (toZoneVz > cfg.maxDistance || perpToLineVx > cfg.maxDistance) return; // to far away from the line

    // Compute angle boatDir-relative to line bearing
    let angleRad = cog - toRadians(lineBearing);

    // VMG components
    const vmgNormal = sog * Math.sin(angleRad);  // +ve = towards the course side, -ve = away from it
    const vmgTangent = sog * Math.cos(angleRad); // +ve = towards the port end, -ve = towards the stb end

    const components = {
        toCourseSide: vmgNormal,
        fromCourseSide: -vmgNormal,
        toPortEnd: vmgTangent,
        toStbEnd: -vmgTangent,
    };

    // Well above the polar, the boat is probably motoring: discard the whole sample.
    const speedRatio = polar?.speedRatio;
    if (Number.isFinite(speedRatio) && speedRatio > cfg.maxPolarRatio) {
        log.debug(`VMG sample discarded: speed ratio ${speedRatio.toFixed(2)}, motoring?`);
        return;
    }
    for (const name of Object.keys(components)) {
        const polarVmg = polar?.vmg?.[name];
        if (Number.isFinite(polarVmg) && polarVmg > 0 && components[name] / polarVmg > cfg.maxPolarRatio) {
            log.debug(`VMG sample discarded: ${name} ratio ${(components[name] / polarVmg).toFixed(2)}, motoring?`);
            return;
        }
    }

    for (const name of Object.keys(components))
        insertSample(vmgState[vmgNames[name]], components[name], polar?.vmg?.[name]);

    if (Number.isFinite(speedRatio) && speedRatio > 0)
        insertWindow(speedRatios, speedRatio, 4 * cfg.maxSamples);
}

function insertSample(vmg, value, polarVmg) {
    // Reject only samples that make no progress in this direction. Every sample is
    // decomposed into a normal and a tangential component, so a boat approaching the
    // line diagonally contributes to two VMGs; an absolute floor here would discard
    // the smaller component and leave that direction reading zero. The default is
    // just above floating point noise, so a perfectly parallel or perpendicular
    // approach still contributes to one direction only.
    if (value <= cfg.minVmg)
        return;

    insertWindow(vmg, value, cfg.maxSamples);
    // Its polar ratio, against the raw polar VMG in this direction for the wind now.
    if (Number.isFinite(polarVmg) && polarVmg > 0)
        insertWindow(vmg.ratios, value / polarVmg, cfg.maxSamples);
}

// Insert a value into a window of at most `max` values, evicting the oldest.
function insertWindow(vmg, value, max) {
    expireWindow(vmg);
    const sample = {value, time: clock()};

    if (vmg.queue.length >= max)
        removeSorted(vmg, vmg.queue.shift()); // evict oldest from FIFO

    // insert sample into sorted (binary search)
    let lo = 0, hi = vmg.sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (vmg.sorted[mid].value < value)
            lo = mid + 1;
        else
            hi = mid;
    }
    vmg.sorted.splice(lo, 0, sample);
    vmg.queue.push(sample);
}

// Remove a sample from the sorted array of its window.
function removeSorted(vmg, sample) {
    // binary search to the run of equal values
    let lo = 0, hi = vmg.sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (vmg.sorted[mid].value < sample.value)
            lo = mid + 1;
        else
            hi = mid;
    }
    // Walk that run to the sample itself: sorted and queue must keep hold of the
    // very same objects, equal values being indistinguishable otherwise.
    while (lo < vmg.sorted.length && vmg.sorted[lo] !== sample)
        lo++;
    if (lo < vmg.sorted.length)
        vmg.sorted.splice(lo, 1);
}

// Discard the samples in a window older than maxSampleAge.
function expireWindow(vmg) {
    if (!vmg.queue?.length) return;
    const oldest = clock() - cfg.maxSampleAge * 1000;
    while (vmg.queue.length && vmg.queue[0].time < oldest)
        removeSorted(vmg, vmg.queue.shift());
}

// The number of samples in a window that have not aged out.
function count(vmg) {
    expireWindow(vmg);
    return vmg.sorted.length;
}

// The VMG being sailed right now in each direction, from the course and speed over ground.
function currentVmgs(cog, sog, lineBearing) {
    if (!Number.isFinite(cog) || !Number.isFinite(sog) || !Number.isFinite(lineBearing))
        return null;
    const angle = cog - toRadians(lineBearing);
    const normal = sog * Math.sin(angle);
    const tangent = sog * Math.cos(angle);
    return {toCourseSide: normal, fromCourseSide: -normal, toPortEnd: tangent, toStbEnd: -tangent};
}

/**
 * Everything behind the best VMGs, for the webapp's VMG detail page: for each direction
 * the samples and polar ratios collected, the polar VMG, the adjustment, the tuned factor,
 * the best VMG and the effective VMG, and the pool of speed ratios they share. Speeds in m/s.
 */
function getVmgDetail(cog, sog, lineBearing) {
    const min = minSamples();
    const current = currentVmgs(cog, sog, lineBearing);
    const factor = polarNow && Number.isFinite(polarNow.performanceFactor) ? polarNow.performanceFactor : null;

    const np = count(speedRatios);
    const wp = Math.min(np / min, 1);
    const poolPercentile = np ? percentile(speedRatios, cfg.percentile) : null;
    const pooledFactor = polarNow
        ? (wp > 0 ? wp * poolPercentile + (1 - wp) * factor : factor)
        : null;

    const directions = {};
    for (const name of Object.keys(vmgNames)) {
        const vmg = vmgState[vmgNames[name]];
        const polar = polarVmgNow(name);
        const nd = count(vmg.ratios);
        const best = bestVmg(vmg);
        const now = current ? current[name] : null;
        const override = overrideNow(vmg, polar);
        directions[name] = {
            samples: count(vmg),
            samplePercentile: count(vmg) ? percentile(vmg, cfg.percentile) : null,
            ratios: nd,
            ratioPercentile: nd ? percentile(vmg.ratios, cfg.percentile) : null,
            ratioWeight: Math.min(nd / min, 1),
            polarVmg: polar,
            tunedFactor: getTunedFactors()[name],
            override: override > 0 ? override : null,
            overrideFactor: vmg.overrideFactor,
            source: override > 0 ? 'override' : polar !== null ? 'polar' : 'samples',
            bestVmg: best,
            currentVmg: now,
            effectiveVmg: Math.max(best || 0, now || 0, cfg.minEffectiveVmg),
        };
    }

    return {
        config: {maxSamples: cfg.maxSamples, minSamples: min, percentile: cfg.percentile,
            minEffectiveVmg: cfg.minEffectiveVmg, maxSampleAge: cfg.maxSampleAge, maxPolarRatio: cfg.maxPolarRatio},
        polar: polarNow !== null,
        performanceFactor: factor,
        pool: {ratios: np, percentile: poolPercentile, weight: wp, pooledFactor},
        directions,
    };
}

/**
 * Resolve a boat's position relative to the start line into the distances the time to
 * line is built from.
 *
 * The start VMG zone lies below the line, between a line off each end at `theta` degrees
 * below the line's extension. Inside it the boat sails its best VMG to the line, so the only
 * distance that counts is the perpendicular one.
 *
 * Outside it the boat first gets to the depth it approaches the zone at, `depth`: the
 * clearance behind the line, or its own depth if it is already deeper. It sails along
 * the line at that depth into the zone, then up to the line. Near an end the depth is no
 * more than the zone's own depth at the boat's distance beyond the end, so the retreat
 * shrinks to nothing at the zone's edge and the distances never jump there.
 *
 * There is no zone on the course side. A boat on the course side of the line, or of its
 * extension, gets back behind it the same way: to the clearance, or only as far as the
 * zone's edge near an end, which within the line's span is the line itself. So nothing
 * jumps as a boat crosses the line either.
 *
 * The legs are distances to be made good, not the track a boat sails.
 *
 * @param {number} toEnd Distance from the boat to the closest end of the line, in metres.
 * @param {number} angle Signed angle at that end, in degrees, between the line (towards
 *   the other end) and the boat. Negative when the boat is on the course side (OCS).
 * @param {number} [clearance=0] How far behind the line a boat outside the zone, or OCS,
 *   approaches from, in metres.
 * @param {number} [theta=60] The zone's edges, in degrees below the line's extension.
 * @returns {{ocs: boolean, inStartZone: boolean, perpToLineVx: number, retreat: number,
 *   toZoneVz: number, depth: number, clearance: number, toLine: number,
 *   distanceToLine: number}} `perpToLineVx` is the boat's distance from the line (or its
 *   extension), on whichever side; `retreat` the leg away from the line, out to `depth`;
 *   `toZoneVz` the leg along the line at `depth`; `depth` also the final leg up to the line.
 */
function startZoneDistances(toEnd, angle, clearance = 0, theta = 60) {
    const anglePBV = Math.abs(angle);
    const ocs = angle < 0;
    const angleVBx = 180 - anglePBV;

    // Perpendicular distance to the line, or to its extension past the end.
    const perpToLineVx = toEnd * Math.sin(toRadians(angleVBx));
    // Distance beyond the end along the line's extension: negative inside the line's span.
    const overshoot = toEnd * Math.cos(toRadians(angleVBx));
    // How deep the zone's edge is at the boat's distance beyond the end, and how far
    // beyond the end it stands at a given depth.
    const slope = Math.tan(toRadians(Math.min(90, Math.max(1, theta))));
    const edgeDepth = Math.max(0, overshoot) * slope;
    const edgeAt = (depth) => theta >= 90 ? 0 : depth / slope;

    // Signed: negative on the course side.
    const across = ocs ? -perpToLineVx : perpToLineVx;
    const depth = Math.max(across, Math.min(clearance, edgeDepth));
    const retreat = depth - across;
    const toZoneVz = Math.max(0, overshoot - edgeAt(depth));
    // The total of the legs, which is what the visualisation draws.
    const legs = Math.round(10 * (retreat + toZoneVz + depth)) / 10;
    return {
        ocs,
        inStartZone: !ocs && retreat === 0 && toZoneVz === 0,
        perpToLineVx,
        retreat,
        toZoneVz,
        depth,
        clearance,
        toLine: legs,
        // Signed: when OCS, how far over the line the boat is.
        distanceToLine: ocs ? -Math.round(10 * perpToLineVx) / 10 : legs,
    };
}

/**
 * The VMGs the time to line is actually divided by: the collected best for each
 * direction, or whatever the boat is achieving right now if that is better.
 *
 * An adjustment or a collected sample stands in for what the boat can do, but the boat
 * beating that estimate right now is hard evidence, so the instantaneous value wins when
 * it is larger. Published as `navigation.racing.effectiveVmg.*` so a client can show the
 * same legs the time to line was built from without re-deriving this.
 *
 * @param {boolean} [retreat=ocs] Whether there is a leg back away from the line.
 * @returns {{toLine: number, alongLine: number, awayFromLine: number}} All in m/s.
 *   `toLine` is towards the course side; `alongLine` is 0 when there is no along leg to
 *   sail; `awayFromLine` is 0 unless there is a leg back away from the line, out to the
 *   clearance.
 */
function effectiveVmg(cog, sog, lineBearing, toZoneVz, ocs, closestEnd, retreat = ocs) {
    let vmgNormalSigned = 0;
    let vmgTangentSigned = 0;

    if (cog != null && sog != null) {
        const lineBearingRad = toRadians(lineBearing);
        if (lineBearingRad !== null) {
            // Angle between boat COG and line bearing.
            const angleRad = cog - lineBearingRad;
            vmgNormalSigned = sog * Math.sin(angleRad);  // normal to the line
            vmgTangentSigned = sog * Math.cos(angleRad); // along it (stb->port is +)
        }
    }

    // Across the line, towards the course side. After a retreat this is the last leg, back
    // up to the line from the clearance, so what the boat is doing right now does not count.
    const histNormal = bestVmg(vmgState.vmgToCourseSide);
    const toLine = Math.max(histNormal || 0, retreat ? 0 : (vmgNormalSigned || 0), cfg.minEffectiveVmg);

    // The first leg, when there is one: back away from the line, out to the clearance.
    const awayFromLine = retreat
        ? Math.max(bestVmg(vmgState.vmgFromCourseSide) || 0, -vmgNormalSigned || 0, cfg.minEffectiveVmg)
        : 0;

    // Along the line, towards the zone entry - and only when there is a leg to sail.
    let histParallel = 0;
    let instParallel = 0;
    if (toZoneVz > 0) {
        if (closestEnd === 'port') {
            // Coming from the pin end, we sail from PORT towards STB.
            histParallel = bestVmg(vmgState.vmgToStbEnd);
            if (vmgTangentSigned < 0) instParallel = -vmgTangentSigned;
        } else {
            // Coming from the boat end, we sail from STB towards PORT.
            histParallel = bestVmg(vmgState.vmgToPortEnd);
            if (vmgTangentSigned > 0) instParallel = vmgTangentSigned;
        }
    }
    // Floored only when there is a leg to sail: inside the zone there is none, and a
    // floor there would invent an along-line time out of nothing.
    const alongLine = toZoneVz > 0
        ? Math.max(histParallel || 0, instParallel || 0, cfg.minEffectiveVmg)
        : Math.max(histParallel || 0, instParallel || 0);

    return {toLine, alongLine, awayFromLine};
}

/**
 * Time to reach the start line, over the legs that startZoneDistances resolves, each at
 * its own effective VMG: back away from the line out to the approach depth (when there is
 * a retreat), along the line at that depth into the zone, then up to the line.
 *
 * @param {number} perpToLineVx The boat's distance from the line, on whichever side.
 * @param {number} [depth] The depth the along leg and the final leg are sailed from:
 *   by default the boat's own depth, or the line itself when OCS.
 */
function computeTimeToLine(cog, sog, lineBearing, toZoneVz, perpToLineVx, ocs, closestEnd,
                           timeToStart = 0, depth = ocs ? 0 : perpToLineVx) {
    if (cog != null && sog != null && toRadians(lineBearing) === null) {
        return 0;
    }

    const retreat = ocs ? perpToLineVx + depth : Math.max(0, depth - perpToLineVx);
    const {toLine, alongLine, awayFromLine} =
        effectiveVmg(cog, sog, lineBearing, toZoneVz, ocs, closestEnd, retreat > 0);

    let ttl = 0;

    // Back away from the line (across it, when OCS), out to the approach depth.
    if (retreat > 0 && awayFromLine > 0) {
        ttl += retreat / awayFromLine;
    }

    // Outside the start VMG zone: along the line into the zone.
    if (toZoneVz > 0 && alongLine > 0) {
        ttl += toZoneVz / alongLine;
    }

    // Then up to the line itself.
    if (depth > 0 && toLine > 0) {
        ttl += depth / toLine;
    }

    // If we still somehow have zero (no speed or distances), just return time to start so TTB logic doesn't explode.
    return ttl <= 0 ? timeToStart : ttl;
}

module.exports = {
    initRacer,
    toDegrees,
    toRadians,
    resetVmgSamples,
    collectVmgSamples,
    setPolar,
    polarVmg,
    polarVmgs,
    getPolarVmgs,
    getTunedFactors,
    getVmgDetail,
    computeTimeToLine,
    startZoneDistances,
    effectiveVmg,
    vmgNames,
    getBestVmg,
    getAllBestVmg,
    getBestVmgOverrides,
    setBestVmg,
    clearBestVmgOverrides,
    swapVmgEnds,

    _percentile: percentile, // for testing purposes only
    _vmgState: vmgState, // for testing purposes only
    _speedRatios: speedRatios, // for testing purposes only
    _setClock: (fn) => { clock = fn || (() => Date.now()); } // for testing purposes only

};

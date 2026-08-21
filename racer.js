// lib/racerMath.js
'use strict';

let cfg = {
    minSog: 1.0,
    minVmg: 0.01,
    maxDistance: 2000,
    maxSamples: 600,
    percentile: 0.9
};

let log = {
    debug: () => {
    }
};

function initRacer(config = {}, logger = null) {
    cfg = {...cfg, ...config};
    if (logger?.debug) log = logger;
}

// VMG sample state is kept private to this module.
// Each entry has a `sorted` array (ascending, for O(1) percentile), a
// `queue` array (insertion-order FIFO, for correct oldest-first eviction) and
// an `override` (0 == none) manually set by the operator, which stands in for
// the collected percentile until it is cleared.
const vmgState = {
    vmgToCourseSide: {sorted: [], queue: [], override: 0},   // Across the line towards the course side (starting)
    vmgFromCourseSide: {sorted: [], queue: [], override: 0}, // Across the line away from the course side (returning when OCS)
    vmgToPortEnd: {sorted: [], queue: [], override: 0},      // Along the line towards the PORT end (pin)
    vmgToStbEnd: {sorted: [], queue: [], override: 0},       // Along the line towards the STARBOARD end (boat)
};

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

function resetVmgSamples() {
    for (const vmg of Object.values(vmgState)) {
        vmg.sorted.length = 0;
        vmg.queue.length = 0;
        vmg.override = 0;
    }
}

function toDegrees(rad) {
    if (rad === null || rad === undefined) return null;
    return rad * (180 / Math.PI);
}

function toRadians(deg) {
    if (deg === null || deg === undefined) return null;
    return deg * (Math.PI / 180);
}

// The sample at the given percentile: {value, cog, sog}, carrying the course that
// actually achieved that VMG.
function percentileSample(vmg, p) {
    if (!vmg.sorted.length) return null;
    const idx = Math.floor(p * (vmg.sorted.length - 1));
    return vmg.sorted[idx];
}

function percentile(vmg, p) {
    const sample = percentileSample(vmg, p);
    return sample ? sample.value : 0;
}

// The best VMG for a direction: a manual override if one is set, otherwise the
// collected percentile. This is the *collected* estimate only; the instantaneous
// VMG the boat is actually achieving is applied on top of this in
// computeTimeToLine, and always wins if it is better.
function bestVmg(vmg) {
    return vmg.override > 0 ? vmg.override : percentile(vmg, cfg.percentile);
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

// Overrides as published for display, with 0 reported as null (no override).
function getBestVmgOverrides() {
    const overrides = {};
    for (const name of Object.keys(vmgNames)) {
        const override = vmgState[vmgNames[name]].override;
        overrides[name] = override > 0 ? override : null;
    }
    return overrides;
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
    log.debug(`setBestVmg ${name} = ${vmg.override}`);
    return vmg.override;
}

// Clear one override, or all of them when no name is given.
function clearBestVmgOverrides(name) {
    if (name === undefined || name === null) {
        for (const vmg of Object.values(vmgState)) {
            vmg.override = 0;
        }
        return true;
    }
    const vmg = vmgEntry(name);
    if (!vmg) return false;
    vmg.override = 0;
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

function collectVmgSamples(cog, sog, lineBearing, toZoneVz, perpToLineVx) {
    if (sog < cfg.minSog) return;   // ignore drifting / tacking stalls
    if (toZoneVz > cfg.maxDistance || perpToLineVx > cfg.maxDistance) return; // to far away from the line

    // Compute angle boatDir-relative to line bearing
    let angleRad = cog - toRadians(lineBearing);

    // VMG components
    const vmgNormal = sog * Math.sin(angleRad);  // +ve = towards the course side, -ve = away from it
    const vmgTangent = sog * Math.cos(angleRad); // +ve = towards the port end, -ve = towards the stb end

    // Insert vmg arrays, each sample carrying the course that produced it so the
    // actual cog/sog behind a best VMG can be recovered later.
    insertSample(vmgState.vmgToCourseSide, vmgNormal, cog, sog);
    insertSample(vmgState.vmgFromCourseSide, -vmgNormal, cog, sog);
    insertSample(vmgState.vmgToPortEnd, vmgTangent, cog, sog);
    insertSample(vmgState.vmgToStbEnd, -vmgTangent, cog, sog);
}

// The course that achieved the best VMG towards the line: the cog/sog attached to the
// percentile sample. The direction is chosen exactly as computeTimeToLine chooses its
// legs, so the course shown is the one the time to line is actually built on.
function getBestApproach(ocs, toZoneVz = 0, closestEnd = null) {
    let direction;
    if (toZoneVz > 0 && closestEnd) {
        // Outside the start zone - beyond the 45 degree wedge off an end - the boat must
        // first run along the line to reach it, so the along-line samples govern. Note
        // the direction is away from the closest end: past the pin the boat is beyond the
        // port end and has to travel towards the stb end to get back to the line.
        direction = closestEnd === 'port' ? 'toStbEnd' : 'toPortEnd';
    } else {
        // Inside the zone the line is closed across, and when OCS that is from the
        // course side back towards the pre-start side.
        direction = ocs ? 'fromCourseSide' : 'toCourseSide';
    }

    const sample = percentileSample(vmgState[vmgNames[direction]], cfg.percentile);
    if (!sample) return null;
    return {cog: sample.cog, sog: sample.sog, vmg: sample.value, direction};
}

function insertSample(vmg, value, cog, sog) {
    // Reject only samples that make no progress in this direction. Every sample is
    // decomposed into a normal and a tangential component, so a boat approaching the
    // line diagonally contributes to two VMGs; an absolute floor here would discard
    // the smaller component and leave that direction reading zero. The default is
    // just above floating point noise, so a perfectly parallel or perpendicular
    // approach still contributes to one direction only.
    if (value <= cfg.minVmg)
        return;

    const sample = {value, cog, sog};

    if (vmg.queue.length >= cfg.maxSamples) {
        const oldest = vmg.queue.shift(); // evict oldest from FIFO
        // remove oldest from sorted (binary search to the run of equal values)
        let lo = 0, hi = vmg.sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (vmg.sorted[mid].value < oldest.value)
                lo = mid + 1;
            else
                hi = mid;
        }
        // Walk that run to the sample itself: equal VMGs may carry different courses,
        // so sorted and queue must keep hold of the very same objects.
        while (lo < vmg.sorted.length && vmg.sorted[lo] !== oldest)
            lo++;
        if (lo < vmg.sorted.length)
            vmg.sorted.splice(lo, 1);
    }
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

function computeTimeToLine(cog, sog, lineBearing, toZoneVz, perpToLineVx, ocs, closestEnd, timeToStart = 0) {
    let vmgNormalSigned = 0;
    let vmgTangentSigned = 0;

    if (cog != null && sog != null) {
        const lineBearingRad = toRadians(lineBearing);
        if (lineBearingRad === null) {
            return 0;
        }

        // Angle between boat COG and line bearing
        const angleRad = cog - lineBearingRad;

        // Signed VMG components from *current* COG/SOG
        vmgNormalSigned = sog * Math.sin(angleRad); // normal to line
        vmgTangentSigned = sog * Math.cos(angleRad); // along line (stb->port is +)
    }

    // 1. Effective VMG normal (perpendicular to line)
    //
    // History (or override):
    //  - if OCS, use vmgFromCourseSide (away from line => back towards line in this case)
    //  - otherwise, use vmgToCourseSide
    const histNormal = bestVmg(ocs ? vmgState.vmgFromCourseSide : vmgState.vmgToCourseSide);

    // Instantaneous VMG in the *required* direction
    // if we are OCS, then the required direction is the opposite of the effective direction
    let vmgInstNormal = ocs ? -vmgNormalSigned : vmgNormalSigned;
    const vmgEffNormal = Math.max(histNormal || 0, vmgInstNormal || 0);

    // 2. Effective VMG along the line (towards the chosen zone entry)
    let vmgHistParallel = 0;
    let vmgInstParallel = 0;

    if (toZoneVz > 0) {
        if (closestEnd === 'port') {
            // Coming from the pin end, we will sail from PORT towards STB
            // => use STB-direction samples.
            vmgHistParallel = bestVmg(vmgState.vmgToStbEnd);
            if (vmgTangentSigned < 0) {
                vmgInstParallel = -vmgTangentSigned; // towards stb
            }
        } else {
            // Coming from the boat end, we will sail from STB towards PORT
            // => use PORT-direction samples.
            vmgHistParallel = bestVmg(vmgState.vmgToPortEnd);
            if (vmgTangentSigned > 0) {
                vmgInstParallel = vmgTangentSigned; // towards port
            }
        }
    }

    const vmgEffectParallel = Math.max(vmgHistParallel || 0, vmgInstParallel || 0);

    // 3. Combine legs: along to zone, then perpendicular to line
    let ttl = 0;

    // Outside the start zone: first go along the line (or zone boundary)
    if (toZoneVz > 0 && vmgEffectParallel > 0) {
        ttl += toZoneVz / vmgEffectParallel;
    }

    // Then go perpendicular to the line to actually hit it
    if (perpToLineVx > 0 && vmgEffNormal > 0) {
        ttl += perpToLineVx / vmgEffNormal;
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
    computeTimeToLine,
    vmgNames,
    getBestVmg,
    getAllBestVmg,
    getBestVmgOverrides,
    setBestVmg,
    clearBestVmgOverrides,
    swapVmgEnds,
    getBestApproach,

    _percentile: percentile, // for testing purposes only
    _vmgState: vmgState // for testing purposes only

};

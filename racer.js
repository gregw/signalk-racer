// lib/racerMath.js
'use strict';

let cfg = {
    minSog: 1.0,
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
// Each entry has a `sorted` array (ascending, for O(1) percentile) and a
// `queue` array (insertion-order FIFO, for correct oldest-first eviction).
const vmgState = {
    vmgToLinePos: {sorted: [], queue: []},  // VMG towards the line (not OCS to line)
    vmgToLineNeg: {sorted: [], queue: []},  // VMG away from the line (OCS to line)
    vmgToZonePort: {sorted: [], queue: []}, // Motion along the line towards the PORT end (pin)
    vmgToZoneStb: {sorted: [], queue: []}, // Motion along the line towards the STARBOARD end (boat)
};

function resetVmgSamples() {
    for (const vmg of Object.values(vmgState)) {
        vmg.sorted.length = 0;
        vmg.queue.length = 0;
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

function percentile(vmg, p) {
    if (!vmg.sorted.length) return 0;
    const idx = Math.floor(p * (vmg.sorted.length - 1));
    return vmg.sorted[idx];
}

function collectVmgSamples(cog, sog, lineBearing, toZoneVz, perpToLineVx) {
    if (sog < cfg.minSog) return;   // ignore drifting / tacking stalls
    if (toZoneVz > cfg.maxDistance || perpToLineVx > cfg.maxDistance) return; // to far away from the line

    // Compute angle boatDir-relative to line bearing
    let angleRad = cog - toRadians(lineBearing);

    // VMG components
    const vmgNormal = sog * Math.sin(angleRad);  // +ve = towards line, -ve = away
    const vmgTangent = sog * Math.cos(angleRad); // +ve = towards pin, -ve = towards stb

    // Insert vmg arrays
    insertSample(vmgState.vmgToLinePos, vmgNormal);
    insertSample(vmgState.vmgToLineNeg, -vmgNormal);
    insertSample(vmgState.vmgToZonePort, vmgTangent);
    insertSample(vmgState.vmgToZoneStb, -vmgTangent);
}

function insertSample(vmg, value) {
    if (value <= 1.0)
        return; // reject low VMGs
    if (vmg.queue.length >= cfg.maxSamples) {
        const oldest = vmg.queue.shift(); // evict oldest from FIFO
        // remove oldest from sorted (binary search)
        let lo = 0, hi = vmg.sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (vmg.sorted[mid] < oldest)
                lo = mid + 1;
            else
                hi = mid;
        }
        vmg.sorted.splice(lo, 1);
    }
    // insert value into sorted (binary search)
    let lo = 0, hi = vmg.sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (vmg.sorted[mid] < value)
            lo = mid + 1;
        else
            hi = mid;
    }
    vmg.sorted.splice(lo, 0, value);
    vmg.queue.push(value);
}

function computeTimeToLine(cog, sog, lineBearing, toZoneVz, perpToLineVx, ocs, closestEnd) {
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
    // History:
    //  - if OCS, use vmgToLineNeg (away from line => back towards line in this case)
    //  - otherwise, use vmgToLinePos
    const histNormal = percentile(ocs ? vmgState.vmgToLineNeg : vmgState.vmgToLinePos, cfg.percentile);

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
            vmgHistParallel = percentile(vmgState.vmgToZoneStb, cfg.percentile);
            if (vmgTangentSigned < 0) {
                vmgInstParallel = -vmgTangentSigned; // towards stb
            }
        } else {
            // Coming from the boat end, we will sail from STB towards PORT
            // => use PORT-direction samples.
            vmgHistParallel = percentile(vmgState.vmgToZonePort, cfg.percentile);
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
    return ttl <= 0 ? vmgState.timeToStart : ttl;
}

module.exports = {
    initRacer,
    toDegrees,
    toRadians,
    resetVmgSamples,
    collectVmgSamples,
    computeTimeToLine,

    _percentile: percentile, // for testing purposes only
    _vmgState: vmgState // for testing purposes only

};

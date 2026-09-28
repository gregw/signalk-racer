/*
 * The start line drawing, shared in substance with the Skip racer-line-view widget.
 *
 * Ported by hand from the watching screen of the Angular component in Skip
 * (widget-racer-line-view/racer-line-view), so the webapp and the widget show the same
 * picture of the same numbers. The widget's editing screens and in-drawing controls are
 * not ported: the webapp has its own buttons for those. Kept as plain browser JS with no
 * build step, matching the rest of this webapp.
 *
 * The line is drawn "line up": always horizontal, port (pin) end to the left and
 * starboard (committee boat) end to the right, so the course side is always the upper
 * half and the heading sailed to cross the line always points straight up.
 */
(function (global) {
    'use strict';

    const EARTH_RADIUS = 6371000;
    // Drawing coordinate system. The height is fixed so font sizes scale with the box;
    // the width tracks its aspect so the drawing fills it undistorted.
    const VB_HEIGHT = 260;
    const TOP_BAND = 26;        // kept clear at the top, as the widget keeps it for its title
    const BOTTOM_MARGIN = 26;   // the line never enters the bottom 10%
    const MARGIN = 28;
    const LABEL_FONT = 28.8;
    const LABEL_HEADROOM = 56;  // room above the line for its label
    const LEG_FONT = 22.5;      // the approach legs' dimension labels
    const END_METRES = 10;      // both ends are taken to be 10m objects...
    const END_EXAGGERATION = 2; // ...drawn at this multiple so they stay legible
    const END_SIZE_MAX = 40;
    const DEFAULT_BOAT_METRES = 10;
    const HULL_BEAM_RATIO = 0.36;
    const MIN_HULL_DISPLAY_UNITS = 20;
    // Boat lengths of line the fit keeps in frame before it will zoom in any further.
    const LINE_IN_FRAME_LENGTHS = 10;
    const MIN_EFFECTIVE_VMG = 0.514444;  // one knot, as the plugin floors it
    const VIEW_SMOOTHING = 25;  // percent of the height the view may drift before re-fitting
    // How old the last fix may be and still judge the gun, when the position is lost by then.
    const LAST_FIX_AT_GUN_MS = 15000;

    const LEGEND_CURRENT = 'Current cog/sog to start';
    const LEGEND_STUB = 'Current course over ground (no timer running)';

    const COLOUR = {
        line: '#999', port: '#f88', stb: '#8f8', boat: '#6cf', ocs: '#fc0',
        lineOcs: '#f33', lineStarted: '#3c3',
        dimension: '#FC0FC0', zoneLeg: '#b070ff', guide: '#999', label: '#999',
        wind: '#ddd', halo: '#000'
    };

    /** Offset of a point from an origin, in metres east/north. */
    function offsetFrom(origin, point) {
        const lat0 = origin.latitude * Math.PI / 180;
        return {
            e: (point.longitude - origin.longitude) * Math.PI / 180 * Math.cos(lat0) * EARTH_RADIUS,
            n: (point.latitude - origin.latitude) * Math.PI / 180 * EARTH_RADIUS
        };
    }

    /**
     * Resolve the line into the drawing's coordinates:
     *   a = along the line from the starboard end towards the port end
     *   c = across it, positive on the pre-start side (negative is OCS)
     */
    function lineGeometry(port, stb, position) {
        if (!port || !stb) return null;
        const v = offsetFrom(stb, port);
        const length = Math.hypot(v.e, v.n);
        if (!(length > 0)) return null;

        const u = {e: v.e / length, n: v.n / length};
        // The pre-start side lies 90 degrees anticlockwise of the line bearing.
        const across = {e: -u.n, n: u.e};
        const bearing = (Math.atan2(u.e, u.n) * 180 / Math.PI + 360) % 360;

        let boat = null;
        if (position && typeof position.latitude === 'number') {
            const p = offsetFrom(stb, position);
            boat = {a: p.e * u.e + p.n * u.n, c: p.e * across.e + p.n * across.n};
        }
        return {length: length, bearing: bearing, boat: boat};
    }

    /** A compass bearing as a screen vector, given the line's own bearing in degrees. */
    function screenVector(bearing, lineBearing) {
        const t = bearing - lineBearing * Math.PI / 180;
        return {x: -Math.cos(t), y: -Math.sin(t)};
    }

    function esc(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function formatKnots(metresPerSecond) {
        return metresPerSecond == null ? '--' : (metresPerSecond / 0.514444).toFixed(1) + 'kn';
    }

    function formatBearing(radians) {
        if (radians == null) return '--';
        const degrees = ((radians * 180 / Math.PI) % 360 + 360) % 360;
        return degrees.toFixed(0).padStart(3, '0') + '°T';
    }

    /**
     * Create a renderer bound to one <svg> element. The view frame it fits is held
     * between renders: re-fitting on every position update makes the line slide about
     * under a boat that appears to stand still.
     */
    function create(svg) {
        let frame = null;
        let frameKey = null;
        // The exact fit the held frame was made from. Drift is measured against this,
        // since a frame that had to grow is held deliberately larger than its own fit.
        let frameIdeal = null;

        // Whether the countdown reached zero with the boat behind the line. Latched,
        // because by the time it is worth showing nothing in the live data says so any
        // more; only the next countdown ends it. See the Skip widget for the full story.
        let startedClean = false;
        let lastStartTime = null;
        let countdownSeen = false;
        let lastBoatSide = null;

        /** How far the drawn boat reaches from its fix, in metres: the fix is the bow. */
        function boatReach(nav) {
            return nav.boatLength || DEFAULT_BOAT_METRES;
        }

        function bandTop() { return TOP_BAND + LABEL_HEADROOM; }
        function bandBottom() { return VB_HEIGHT - BOTTOM_MARGIN; }

        /** The end of the line the boat is nearer to, as a distance along the line. */
        function nearestEnd(geo, a) {
            return Math.abs(a) <= Math.abs(a - geo.length) ? 0 : geo.length;
        }

        /**
         * Fit the boat and the nearer end of the line, with the boat's drawn size allowed
         * for. The far end is let go when holding it would cost scale, but a run of at
         * least LINE_IN_FRAME_LENGTHS boat lengths of line is always kept, and any width
         * the scale leaves spare is spent reaching towards the far end.
         */
        function fitFrame(nav, geo, W) {
            const yMin = bandTop(), yMax = bandBottom();
            const boat = geo.boat;
            const pad = boat ? boatReach(nav) : 0;

            const ends = boat ? [nearestEnd(geo, boat.a)] : [0, geo.length];
            let minA = Math.min.apply(null, ends.concat([boat ? boat.a - pad : 0]));
            let maxA = Math.max.apply(null, ends.concat([boat ? boat.a + pad : geo.length]));
            const minC = Math.min(0, boat ? boat.c - pad : 0);
            const maxC = Math.max(0, boat ? boat.c + pad : 0);

            // Keep a usable run of the line itself in frame, measured on the line.
            const wanted = Math.min(LINE_IN_FRAME_LENGTHS * boatReach(nav), geo.length);
            const visibleLo = Math.max(minA, 0), visibleHi = Math.min(maxA, geo.length);
            if (visibleHi - visibleLo < wanted) {
                const middle = (visibleLo + visibleHi) / 2;
                let lo = middle - wanted / 2, hi = middle + wanted / 2;
                if (lo < 0) { hi -= lo; lo = 0; }
                if (hi > geo.length) { lo = Math.max(0, lo - (hi - geo.length)); hi = geo.length; }
                minA = Math.min(minA, lo);
                maxA = Math.max(maxA, hi);
            }

            // Keeps the across axis from collapsing when the boat sits on the line.
            const spanA = Math.max(maxA - minA, 1);
            const spanC = Math.max(maxC - minC, spanA * 0.35);
            const scale = Math.min((W - 2 * MARGIN) / spanA, (yMax - yMin) / spanC);

            // Spend the width the chosen scale left over on the line, towards the far end.
            // The scale is not recomputed: this is room already bought and standing empty.
            if (boat) {
                const spare = (W - 2 * MARGIN) / scale - (maxA - minA);
                if (spare > 0) {
                    const far = nearestEnd(geo, boat.a) === 0 ? geo.length : 0;
                    if (far > maxA) maxA = Math.min(far, maxA + spare);
                    else if (far < minA) minA = Math.max(far, minA - spare);
                }
            }

            return {scale: scale, midA: (minA + maxA) / 2, midC: (minC + maxC) / 2};
        }

        function place(f, W, a, c) {
            return {
                x: W / 2 - (a - f.midA) * f.scale,
                y: (bandTop() + bandBottom()) / 2 + (c - f.midC) * f.scale
            };
        }

        /**
         * How far re-fitting would shift the drawing, as a fraction of its height,
         * measured at the end being kept in frame and at the boat.
         */
        function frameDrift(held, ideal, geo, W) {
            const marks = geo.boat ? [nearestEnd(geo, geo.boat.a), geo.boat.a] : [0, geo.length];
            let worst = 0;
            marks.forEach(function (a) {
                const from = place(held, W, a, 0), to = place(ideal, W, a, 0);
                worst = Math.max(worst, Math.hypot(from.x - to.x, from.y - to.y));
            });
            return worst / Math.max(bandBottom() - bandTop(), 1);
        }

        function boatFitsIn(nav, f, geo, W) {
            const boat = geo.boat;
            if (!boat) return true;
            const p = place(f, W, boat.a, boat.c);
            const r = boatReach(nav) * f.scale;
            return p.x - r >= 2 && p.x + r <= W - 2
                && p.y - r >= TOP_BAND && p.y + r <= bandBottom();
        }

        /** The line must stay clear of the bottom, however long the frame is held. */
        function lineFitsIn(f) {
            const lineY = (bandTop() + bandBottom()) / 2 - f.midC * f.scale;
            return lineY >= bandTop() && lineY <= bandBottom();
        }

        function updateFrame(nav, geo, W) {
            const key = W + '|' + geo.length.toFixed(1);
            const tolerance = VIEW_SMOOTHING / 100;
            // A lost fix takes the boat away, not the line: hold the frame it was last
            // seen in rather than zooming out to the line and straight back in.
            if (!geo.boat && frame && key === frameKey) return frame;

            const ideal = fitFrame(nav, geo, W);
            if (!frame || key !== frameKey
                || frameDrift(frameIdeal || frame, ideal, geo, W) > tolerance
                || !lineFitsIn(frame)
                || !boatFitsIn(nav, frame, geo, W)) {
                // Overshoot a growth by the tolerance, so an approach does not stutter
                // through a re-fit on every other update. Shrinking is not overshot.
                const grow = frame && ideal.scale < frame.scale;
                frame = grow
                    ? {scale: ideal.scale / (1 + tolerance), midA: ideal.midA, midC: ideal.midC}
                    : ideal;
                frameIdeal = ideal;
                frameKey = key;
            }
            return frame;
        }

        /**
         * Watch the countdown through zero, latching a clean start when the gun finds the
         * boat behind the line. Any new start time, or time to start with time still to
         * run, ends the latch.
         */
        function watchGun(nav, geo) {
            const startTime = nav.startTime || null;
            const tts = nav.timeToStart;
            const running = startTime != null;
            const armed = running && startTime !== lastStartTime;
            lastStartTime = startTime;
            if (armed) countdownSeen = false;
            if (tts != null && tts > 0) countdownSeen = true;
            if (!geo) lastBoatSide = null;
            else if (geo.boat) lastBoatSide = {c: geo.boat.c, at: Date.now()};

            if (startedClean) {
                if (armed || (tts != null && tts > 0)) startedClean = false;
                return;
            }
            if (!running || !countdownSeen) return;
            if (tts != null && tts <= 0) {
                let side = geo && geo.boat ? geo.boat.c : null;
                if (side == null && lastBoatSide && Date.now() - lastBoatSide.at <= LAST_FIX_AT_GUN_MS)
                    side = lastBoatSide.c;
                startedClean = side != null && side >= 0;
            }
        }

        /**
         * The VMG the plugin divides a leg by: what it publishes if it does, otherwise
         * the collected best or whatever the boat is achieving now, whichever is larger,
         * floored the way the plugin floors it.
         */
        function effectiveVmg(nav, published, name, lineBearing) {
            if (published != null) return published;
            let best = nav.bestVmg && nav.bestVmg[name] != null ? nav.bestVmg[name] : 0;
            if (nav.cog != null && nav.sog != null) {
                const angle = nav.cog - lineBearing * Math.PI / 180;
                const normal = nav.sog * Math.sin(angle);
                const tangent = nav.sog * Math.cos(angle);
                const instant = name === 'toCourseSide' ? normal
                    : name === 'fromCourseSide' ? -normal
                        : name === 'toPortEnd' ? tangent : -tangent;
                if (instant > 0) best = Math.max(best, instant);
            }
            return Math.max(best, MIN_EFFECTIVE_VMG);
        }

        /** One closed hull outline of the given length, pointing along the boat. */
        function hullPath(at, length) {
            const h = length / 2, b = length * HULL_BEAM_RATIO / 2;
            return 'M' + at(h, 0) + ' C' + at(h * 0.55, b * 0.42) + ' ' + at(-h * 0.15, b)
                + ' ' + at(-h, b * 0.55) + ' L' + at(-h, -b * 0.55) + ' C' + at(-h * 0.15, -b)
                + ' ' + at(h * 0.55, -b * 0.42) + ' ' + at(h, 0) + ' Z';
        }

        /** Whether a leg this long has room for its label in a break in the rule. */
        function legRoomy(length, label) {
            return length > label.length * LEG_FONT * 0.6 + 16;
        }

        /**
         * One leg of the approach, as a dimension line with end ticks and a label.
         *
         * @param side Which side of the rule the label goes: horizontal -1 above, 1 below;
         *   vertical -1 left, 1 right. Left out, a horizontal label goes above a roomy leg
         *   and below a short one, and a vertical label to the right.
         */
        function buildLeg(x1, y1, x2, y2, horizontal, label, title, W, side) {
            const tick = 5;
            const ticks = horizontal
                ? 'M' + x1 + ',' + (y1 - tick) + ' L' + x1 + ',' + (y1 + tick)
                  + ' M' + x2 + ',' + (y2 - tick) + ' L' + x2 + ',' + (y2 + tick)
                : 'M' + (x1 - tick) + ',' + y1 + ' L' + (x1 + tick) + ',' + y1
                  + ' M' + (x2 - tick) + ',' + y2 + ' L' + (x2 + tick) + ',' + y2;

            const F = LEG_FONT;
            const roomy = legRoomy(Math.hypot(x2 - x1, y2 - y1), label);
            let labelX, labelY, anchor;
            if (horizontal) {
                const below = (side != null ? side : (roomy ? -1 : 1)) > 0;
                labelY = (y1 + y2) / 2 + (below ? F * 1.13 : -F * 0.4);
                if (roomy) { labelX = (x1 + x2) / 2; anchor = 'middle'; }
                else {
                    // Out past the corner: the boat sits on this leg's other end.
                    labelX = x1 < x2 ? x2 + F * 0.53 : x2 - F * 0.53;
                    anchor = x1 < x2 ? 'start' : 'end';
                }
            } else {
                const right = (side != null ? side : 1) > 0;
                labelX = right ? x1 + F * 0.53 : x1 - F * 0.53;
                anchor = right ? 'start' : 'end';
                labelY = roomy ? (y1 + y2) / 2 + F * 0.33
                    : (y1 < y2 ? y1 - F * 0.53 : y1 + F * 0.93);
            }
            // Held inside the drawing: a label pushed outside a short leg can run off it.
            const width = label.length * F * 0.6;
            const lead = anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0;
            const trail = anchor === 'start' ? width : anchor === 'middle' ? width / 2 : 0;
            labelX = Math.min(Math.max(labelX, lead + 3), Math.max(W - trail - 3, lead + 3));

            return {x1: x1, y1: y1, x2: x2, y2: y2, ticks: ticks, label: label, title: title,
                labelX: labelX, labelY: labelY, anchor: anchor, leading: false};
        }

        function legLabelBox(leg) {
            const width = leg.label.length * LEG_FONT * 0.6;
            const left = leg.anchor === 'start' ? leg.labelX
                : leg.anchor === 'end' ? leg.labelX - width : leg.labelX - width / 2;
            return {left: left, right: left + width,
                top: leg.labelY - LEG_FONT * 0.75, bottom: leg.labelY + LEG_FONT * 0.25};
        }

        /**
         * The last word on the two labels not overlapping: when holding a label inside the
         * drawing has pushed it back across the other, the across label slides on along
         * its own leg, towards the line, until it is clear.
         */
        function separateLegLabels(zone, across, towardsLine) {
            const a = legLabelBox(zone), b = legLabelBox(across);
            const gap = 2;
            if (a.right + gap <= b.left || b.right + gap <= a.left
                || a.bottom + gap <= b.top || b.bottom + gap <= a.top) return;
            const shift = towardsLine < 0 ? b.bottom - a.top + gap : a.bottom - b.top + gap;
            across.labelY += (towardsLine < 0 ? -1 : 1) * shift;
        }

        function drawLeg(parts, leg) {
            const colour = leg.leading ? COLOUR.zoneLeg : COLOUR.dimension;
            parts.push('<g><title>' + esc(leg.title) + '</title>'
                + '<line x1="' + leg.x1 + '" y1="' + leg.y1 + '" x2="' + leg.x2 + '" y2="' + leg.y2
                + '" stroke="' + colour + '" stroke-width="1.5" stroke-opacity="0.9"/>'
                + '<path d="' + leg.ticks + '" stroke="' + colour + '" stroke-width="1.5" fill="none"/>'
                + '<text x="' + leg.labelX + '" y="' + leg.labelY + '" text-anchor="' + leg.anchor
                + '" font-size="' + LEG_FONT + '" font-weight="bold" fill="' + colour
                + '" stroke="' + COLOUR.halo + '" stroke-width="4" paint-order="stroke">'
                + esc(leg.label) + '</text></g>');
        }

        /**
         * The approach the time to line is computed over: along the line into the start
         * zone, then across to the line, as dimension lines - a distance to be made good,
         * not a course to steer - plus where the boat reaches along them at the gun.
         */
        function buildApproach(nav, geo, sx, sy, scale, W) {
            const boat = geo.boat;
            const L = geo.length, a = boat.a, c = boat.c;
            const ocs = c < 0, across = Math.abs(c);

            // How far past an end the boat lies, and which way it must run to get back.
            let overshoot = 0, beyondPort = false;
            if (a > L) { overshoot = a - L; beyondPort = true; }
            else if (a < 0) { overshoot = -a; }
            // Inside the 45 degree wedge the zone leg vanishes: the boat closes straight
            // across. Outside it, the corner sits on the wedge.
            const toZone = Math.max(0, overshoot - across);
            const cornerA = toZone > 0 ? (beyondPort ? L + across : -across) : a;

            const parallelName = beyondPort ? 'toStbEnd' : 'toPortEnd';
            const normalName = ocs ? 'fromCourseSide' : 'toCourseSide';
            const parallel = effectiveVmg(nav, nav.effVmgAlongLine, parallelName, geo.bearing);
            const normal = effectiveVmg(nav, nav.effVmgToLine, normalName, geo.bearing);

            // The two labels meet at the corner, so each goes on the side of its own leg
            // facing away from the other. When both legs are short both labels want the
            // same outside quarter, so the zone label moves round to the line's side.
            const zoneLabel = Math.round(toZone) + 'm';
            const acrossLabel = Math.round(across) + 'm';
            const towardsBoat = toZone > 0 ? Math.sign(sx(a) - sx(cornerA)) : 0;
            const towardsLine = across > 0 ? Math.sign(sy(0) - sy(c)) : 0;
            const zoneShort = !legRoomy(Math.abs(sx(a) - sx(cornerA)), zoneLabel);
            const acrossShort = !legRoomy(Math.abs(sy(0) - sy(c)), acrossLabel);
            const zoneSide = towardsLine === 0 ? undefined
                : zoneShort && acrossShort ? towardsLine : -towardsLine;
            const acrossSide = towardsBoat === 0 ? undefined : -towardsBoat;

            const legs = [];
            if (toZone > 0) {
                legs.push(buildLeg(sx(a), sy(c), sx(cornerA), sy(c), true, zoneLabel,
                    'Along the line to the start zone', W, zoneSide));
            }
            // Only a leg with another after it leads; it is drawn in its own shade.
            if (toZone > 0 && across > 0) legs[0].leading = true;
            if (across > 0) {
                legs.push(buildLeg(sx(cornerA), sy(c), sx(cornerA), sy(0), false, acrossLabel,
                    'Across to the line', W, acrossSide));
            }
            if (legs.length === 2) separateLegLabels(legs[0], legs[1], towardsLine);

            // Where the boat reaches at the gun, walking those legs at those VMGs.
            // A leg with no VMG behind it costs no time, as computeTimeToLine has it.
            let gun = null;
            const tts = nav.timeToStart;
            if (nav.timerRunning && tts != null && tts > 0) {
                const alongTime = parallel > 0 ? toZone / parallel : 0;
                let gunA, gunC, ok = true;
                if (tts <= alongTime) {
                    const run = parallel * tts;
                    gunA = beyondPort ? a - run : a + run;
                    gunC = c;
                } else if (normal > 0) {
                    const run = Math.min(normal * (tts - alongTime),
                        across + 400 / Math.max(scale, 1e-6));
                    gunA = cornerA;
                    gunC = ocs ? c + run : c - run;
                } else { ok = false; }
                if (ok) gun = {x: sx(gunA), y: sy(gunC)};
            }
            return {legs: legs, gun: gun};
        }

        function render(nav) {
            if (!svg) return;
            const box = svg.getBoundingClientRect();
            const aspect = box.height > 0 ? box.width / box.height : 400 / VB_HEIGHT;
            // Clamped so an extreme aspect cannot squash the drawing into a sliver.
            const W = Math.round(VB_HEIGHT * Math.min(Math.max(aspect, 0.6), 4));
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + VB_HEIGHT);

            // The plugin nulls the length when the line is lost, while the end positions
            // keep their last values, so the length is what says there is a line.
            const geo = nav.lineLength == null ? null
                : lineGeometry(nav.port, nav.stb, nav.position);
            watchGun(nav, geo);
            if (!geo) {
                frame = frameKey = frameIdeal = null;
                svg.innerHTML = '<text x="' + (W / 2) + '" y="' + (VB_HEIGHT / 2)
                    + '" text-anchor="middle" fill="' + COLOUR.guide
                    + '" font-size="16">No start line set</text>';
                return;
            }

            const f = updateFrame(nav, geo, W);
            const scale = f.scale;
            const sx = function (a) { return W / 2 - (a - f.midA) * scale; };
            const sy = function (c) { return (bandTop() + bandBottom()) / 2 + (c - f.midC) * scale; };
            const portX = sx(geo.length), stbX = sx(0), lineY = sy(0);
            const boat = geo.boat;
            const parts = [];

            // The wind, against the line's own orientation: with the line drawn flat, the
            // arrow's angle is its angle to the line.
            if (nav.twd != null) {
                const d = screenVector(nav.twd + Math.PI, geo.bearing);
                const cx = W - 40, cy = 38, p = {x: -d.y, y: d.x};
                const at = function (fwd, side) {
                    return (cx + d.x * fwd + p.x * side).toFixed(1) + ','
                        + (cy + d.y * fwd + p.y * side).toFixed(1);
                };
                const degrees = ((nav.twd * 180 / Math.PI) % 360 + 360) % 360;
                const off = (((nav.twd * 180 / Math.PI) - geo.bearing) % 360 + 360) % 360;
                parts.push('<polygon points="' + [at(30, 0), at(4, 16), at(4, 6), at(-30, 6),
                    at(-30, -6), at(4, -6), at(4, -16)].join(' ') + '" fill="' + COLOUR.wind
                    + '" fill-opacity="0.65"><title>Wind from '
                    + degrees.toFixed(0).padStart(3, '0') + '°T, '
                    + (off > 180 ? 360 - off : off).toFixed(0) + '° to the line</title></polygon>');
            }

            // The length and heading label first of all: it is context for the line, not
            // part of the approach, so anything that overlaps it wins.
            const length = geo.length;
            const lineBearing = nav.lineBearing != null
                ? (nav.lineBearing * 180 / Math.PI + 360) % 360 : geo.bearing;
            // The heading worth reporting is the one sailed to cross the line: ninety
            // degrees clockwise of the line bearing, always straight up in this view -
            // which the trailing arrow says, so no separate arrowhead is needed.
            const startBearing = (lineBearing + 90) % 360;
            const label = Math.round(length) + 'm · '
                + startBearing.toFixed(0).padStart(3, '0') + '°T↑';
            const font = Math.min(LABEL_FONT, (W - 8) / (label.length * 0.51));
            const half = label.length * font * 0.51 / 2;
            // Centred on the line but held inside the drawing: the line can sit well off
            // centre, and the label is often wider than the line itself.
            const labelX = Math.min(Math.max((portX + stbX) / 2, half + 4), W - half - 4);
            parts.push('<text x="' + labelX + '" y="' + (lineY - font * 0.5) + '" text-anchor="middle"'
                + ' font-size="' + font + '" fill="' + COLOUR.label + '" stroke="' + COLOUR.halo
                + '" stroke-width="8" paint-order="stroke">' + esc(label) + '</text>');

            let approach = null;
            if (boat) {
                // The start zone: the line's extensions and the 45 degree wedge off each
                // end. They decide where the approach turns, so they sit under it.
                const reach = (W + VB_HEIGHT) / Math.max(scale, 1e-6);
                const guide = function (a1, c1, a2, c2) {
                    parts.push('<line x1="' + sx(a1) + '" y1="' + sy(c1) + '" x2="' + sx(a2)
                        + '" y2="' + sy(c2) + '" stroke="' + COLOUR.guide
                        + '" stroke-width="1.2" stroke-opacity="0.6" stroke-dasharray="4 5"/>');
                };
                guide(0, 0, -reach, 0);
                guide(geo.length, 0, geo.length + reach, 0);
                guide(0, 0, -reach, reach);
                guide(0, 0, -reach, -reach);
                guide(geo.length, 0, geo.length + reach, reach);
                guide(geo.length, 0, geo.length + reach, -reach);

                approach = buildApproach(nav, geo, sx, sy, scale, W);

                const bx = sx(boat.a), by = sy(boat.c);
                const ocs = boat.c < 0;

                // The current course, run out to where the boat gets to at the gun.
                let courseLabel = null;
                if (nav.cog != null) {
                    const v = screenVector(nav.cog, geo.bearing);
                    const running = nav.timerRunning && nav.timeToStart > 0;
                    let len = null;
                    if (running) {
                        if (nav.sog != null) {
                            // Clamped past the corner of the viewBox: a long countdown
                            // runs well off the drawing and is clipped there anyway.
                            len = Math.min(nav.sog * nav.timeToStart * scale, 600);
                            courseLabel = LEGEND_CURRENT;
                        }
                    } else {
                        len = 40;
                        courseLabel = LEGEND_STUB;
                    }
                    if (len != null) {
                        parts.push('<line x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1)
                            + '" x2="' + (bx + v.x * len).toFixed(1) + '" y2="' + (by + v.y * len).toFixed(1)
                            + '" stroke="' + COLOUR.boat + '" stroke-width="6" stroke-opacity="0.55"'
                            + ' stroke-linecap="round"><title>' + esc(courseLabel) + '</title></line>');
                    }
                }

                // The hull, solid at true scale with a minimum size, hung aft of the fix:
                // the fix is the bow, which is what decides whether you are over.
                const heading = nav.headingTrue != null ? nav.headingTrue : nav.cog;
                const hv = heading != null ? screenVector(heading, geo.bearing) : {x: 0, y: -1};
                const px = -hv.y, py = hv.x;
                const hull = Math.max(boatReach(nav) * scale, MIN_HULL_DISPLAY_UNITS);
                const cx = bx - hv.x * hull / 2, cy = by - hv.y * hull / 2;
                const at = function (fwd, stbd) {
                    return (cx + hv.x * fwd + px * stbd).toFixed(1) + ','
                        + (cy + hv.y * fwd + py * stbd).toFixed(1);
                };
                const tip = ['SOG ' + formatKnots(nav.sog) + '  COG ' + formatBearing(nav.cog)];
                if (courseLabel) tip.push(courseLabel);
                parts.push('<path d="' + hullPath(at, hull) + '" fill="'
                    + (ocs ? COLOUR.ocs : COLOUR.boat) + '">'
                    + '<title>' + esc(tip.join('\n')) + '</title></path>');
            }

            // The line itself, over everything closing on it: red when over, green once a
            // clean start has been made.
            const lineColour = startedClean ? COLOUR.lineStarted
                : boat && boat.c < 0 ? COLOUR.lineOcs : COLOUR.line;
            parts.push('<line x1="' + portX + '" y1="' + lineY + '" x2="' + stbX + '" y2="' + lineY
                + '" stroke="' + lineColour + '" stroke-width="4" stroke-dasharray="10 8"/>');

            // Both ends stand for a 10m object, exaggerated so they stay legible.
            const endSize = Math.min(Math.max(END_METRES * scale * END_EXAGGERATION, 12), END_SIZE_MAX);
            const k = endSize / 24;
            parts.push('<circle cx="' + portX + '" cy="' + lineY + '" r="' + (endSize * 0.29)
                + '" fill="' + COLOUR.port + '" stroke="' + COLOUR.halo + '"/>');
            parts.push('<polygon points="' + (stbX - 13 * k) + ',' + (lineY - 4 * k) + ' '
                + (stbX + 11 * k) + ',' + (lineY - 4 * k) + ' ' + (stbX + 9 * k) + ',' + (lineY + 4 * k)
                + ' ' + (stbX - 7 * k) + ',' + (lineY + 4 * k) + '" fill="' + COLOUR.stb
                + '" stroke="' + COLOUR.halo + '"/>');
            parts.push('<rect x="' + (stbX - 3 * k) + '" y="' + (lineY - 10 * k) + '" width="' + (9 * k)
                + '" height="' + (6 * k) + '" fill="' + COLOUR.stb + '" stroke="' + COLOUR.halo + '"/>');

            // The approach legs and the gun mark last, so the distances stay readable over
            // the boat, which is exactly where they run as it closes on the line.
            if (approach) {
                approach.legs.forEach(function (leg) { drawLeg(parts, leg); });
                if (approach.gun) {
                    parts.push('<circle cx="' + approach.gun.x.toFixed(1) + '" cy="'
                        + approach.gun.y.toFixed(1) + '" r="5" fill="' + COLOUR.halo
                        + '" stroke="' + COLOUR.dimension + '" stroke-width="2.5"><title>Where you'
                        + ' reach at the gun, sailing these legs at these VMGs</title></circle>');
                }
            }

            svg.innerHTML = parts.join('');
        }

        return {render: render};
    }

    global.RacerLineView = {create: create};
})(window);

/*
 * The start line drawing, shared in substance with the KIP racer widgets.
 *
 * Ported by hand from the Angular component in KIP (racer-line-view), so the webapp and
 * the widgets show the same picture of the same numbers. Kept as plain browser JS with
 * no build step, matching the rest of this webapp.
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
    const TOP_BAND = 26;        // kept clear for the title
    const BOTTOM_MARGIN = 26;   // the line never enters the bottom 10%
    const MARGIN = 28;
    const LABEL_FONT = 36;
    const LABEL_HEADROOM = 56;  // room above the line for its label
    const END_METRES = 10;      // both ends are taken to be 10m objects...
    const END_EXAGGERATION = 2; // ...drawn at this multiple so they stay legible
    const DEFAULT_BOAT_METRES = 10;
    const HULL_BEAM_RATIO = 0.36;
    const MIN_EFFECTIVE_VMG = 0.514444;  // one knot, as the plugin floors it
    const VIEW_SMOOTHING = 10;  // percent of the height the view may drift before re-fitting

    const COLOUR = {
        line: '#999', port: '#f88', stb: '#8f8', boat: '#6cf', ocs: '#fc0',
        dimension: '#FC0FC0', guide: '#888', label: '#ddd', halo: '#111'
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

        /** Half the boat's drawn length in metres - a model quantity, so scale-free. */
        function boatHalfExtent(nav, c) {
            const metres = nav.boatLength || DEFAULT_BOAT_METRES;
            return (metres + Math.abs(c) / 5) / 2;
        }

        function bandTop() { return TOP_BAND + LABEL_HEADROOM; }
        function bandBottom() { return VB_HEIGHT - BOTTOM_MARGIN; }

        /** Fit the line and the boat, with the boat's drawn size allowed for. */
        function fitFrame(nav, geo, W) {
            const yMin = bandTop(), yMax = bandBottom();
            const boat = geo.boat;
            const pad = boat ? boatHalfExtent(nav, boat.c) : 0;
            const minA = Math.min(0, boat ? boat.a - pad : 0);
            const maxA = Math.max(geo.length, boat ? boat.a + pad : geo.length);
            const minC = Math.min(0, boat ? boat.c - pad : 0);
            const maxC = Math.max(0, boat ? boat.c + pad : 0);
            const spanA = Math.max(maxA - minA, 1);
            // Keeps the across axis from collapsing when the boat sits on the line.
            const spanC = Math.max(maxC - minC, spanA * 0.35);
            return {
                scale: Math.min((W - 2 * MARGIN) / spanA, (yMax - yMin) / spanC),
                midA: (minA + maxA) / 2,
                midC: (minC + maxC) / 2
            };
        }

        function place(f, W, a, c) {
            return {
                x: W / 2 - (a - f.midA) * f.scale,
                y: (bandTop() + bandBottom()) / 2 + (c - f.midC) * f.scale
            };
        }

        /** How far re-fitting would shift the drawing, as a fraction of its height. */
        function frameDrift(held, ideal, geo, W) {
            let worst = 0;
            [0, geo.length].forEach(function (a) {
                const from = place(held, W, a, 0), to = place(ideal, W, a, 0);
                worst = Math.max(worst, Math.hypot(from.x - to.x, from.y - to.y));
            });
            return worst / Math.max(bandBottom() - bandTop(), 1);
        }

        function boatFitsIn(nav, f, geo, W) {
            const boat = geo.boat;
            if (!boat) return true;
            const p = place(f, W, boat.a, boat.c);
            const r = boatHalfExtent(nav, boat.c) * f.scale;
            return p.x - r >= 2 && p.x + r <= W - 2
                && p.y - r >= TOP_BAND && p.y + r <= VB_HEIGHT - 2;
        }

        /** The line must stay clear of the bottom, however long the frame is held. */
        function lineFitsIn(f) {
            const lineY = (bandTop() + bandBottom()) / 2 - f.midC * f.scale;
            return lineY >= bandTop() && lineY <= bandBottom();
        }

        function updateFrame(nav, geo, W) {
            const key = W + '|' + geo.length.toFixed(1);
            const ideal = fitFrame(nav, geo, W);
            if (!frame || key !== frameKey
                || frameDrift(frame, ideal, geo, W) > VIEW_SMOOTHING / 100
                || !lineFitsIn(frame)
                || !boatFitsIn(nav, frame, geo, W)) {
                frame = ideal;
                frameKey = key;
            }
            return frame;
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

        /** One leg of the approach, as a dimension line with end ticks and a label. */
        function dimension(parts, x1, y1, x2, y2, horizontal, label, title, W) {
            const tick = 5;
            const ticks = horizontal
                ? 'M' + x1 + ',' + (y1 - tick) + ' L' + x1 + ',' + (y1 + tick)
                  + ' M' + x2 + ',' + (y2 - tick) + ' L' + x2 + ',' + (y2 + tick)
                : 'M' + (x1 - tick) + ',' + y1 + ' L' + (x1 + tick) + ',' + y1
                  + ' M' + (x2 - tick) + ',' + y2 + ' L' + (x2 + tick) + ',' + y2;

            // A dimension's value sits in a break in the rule, but a short leg has no room
            // for one - and the along-line leg is often very short.
            const length = Math.hypot(x2 - x1, y2 - y1);
            const roomy = length > label.length * 9 + 16;
            let lx, ly, anchor;
            if (horizontal) {
                if (roomy) { lx = (x1 + x2) / 2; ly = (y1 + y2) / 2 - 6; anchor = 'middle'; }
                else {
                    // Out past the corner and below the rule: the boat is on this leg's
                    // other end and the across leg runs up from the corner.
                    lx = x1 < x2 ? x2 + 8 : x2 - 8;
                    ly = (y1 + y2) / 2 + 17;
                    anchor = x1 < x2 ? 'start' : 'end';
                }
            } else {
                lx = x1 + 8; anchor = 'start';
                ly = roomy ? (y1 + y2) / 2 + 5 : (y1 < y2 ? y1 - 8 : y1 + 14);
            }
            const width = label.length * 9;
            const lead = anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0;
            const trail = anchor === 'start' ? width : anchor === 'middle' ? width / 2 : 0;
            lx = Math.min(Math.max(lx, lead + 3), Math.max(W - trail - 3, lead + 3));

            parts.push('<g><title>' + esc(title) + '</title>'
                + '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2
                + '" stroke="' + COLOUR.dimension + '" stroke-width="1.5" stroke-opacity="0.9"/>'
                + '<path d="' + ticks + '" stroke="' + COLOUR.dimension + '" stroke-width="1.5" fill="none"/>'
                + '<text x="' + lx + '" y="' + ly + '" text-anchor="' + anchor + '" font-size="15"'
                + ' font-weight="bold" fill="' + COLOUR.dimension + '" stroke="' + COLOUR.halo
                + '" stroke-width="4" paint-order="stroke">' + esc(label) + '</text></g>');
        }

        function render(nav) {
            if (!svg) return;
            const box = svg.getBoundingClientRect();
            const aspect = box.height > 0 ? box.width / box.height : 400 / VB_HEIGHT;
            const W = Math.round(VB_HEIGHT * Math.min(Math.max(aspect, 0.6), 4));
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + VB_HEIGHT);

            const geo = lineGeometry(nav.port, nav.stb, nav.position);
            if (!geo) {
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
                    at(-30, -6), at(4, -6), at(4, -16)].join(' ') + '" fill="' + COLOUR.label
                    + '" fill-opacity="0.65"><title>Wind from '
                    + degrees.toFixed(0).padStart(3, '0') + '°T, '
                    + (off > 180 ? 360 - off : off).toFixed(0) + '° to the line</title></polygon>');
            }

            // The start zone: the line's extensions and the 45 degree wedge off each end.
            // They decide where the approach turns, so they sit under it.
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

            const boat = geo.boat;
            if (boat) {
                const bx = sx(boat.a), by = sy(boat.c);
                const ocs = boat.c < 0;
                const L = geo.length, a = boat.a, c = boat.c, across = Math.abs(c);

                // How far past an end the boat lies, and which way it must run to get back.
                let overshoot = 0, beyondPort = false;
                if (a > L) { overshoot = a - L; beyondPort = true; }
                else if (a < 0) { overshoot = -a; }
                // Inside the 45 degree wedge the zone leg vanishes: the boat closes
                // straight across. Outside it, the corner sits on the wedge.
                const toZone = Math.max(0, overshoot - across);
                const cornerA = toZone > 0 ? (beyondPort ? L + across : -across) : a;

                const parallelName = beyondPort ? 'toStbEnd' : 'toPortEnd';
                const normalName = ocs ? 'fromCourseSide' : 'toCourseSide';
                const parallel = effectiveVmg(nav, nav.effVmgAlongLine, parallelName, geo.bearing);
                const normal = effectiveVmg(nav, nav.effVmgToLine, normalName, geo.bearing);

                // The approach the time to line is computed over. Nobody sails parallel to
                // the line then turns ninety degrees, so it is drawn as dimension lines:
                // a distance to be made good, not a course to steer.
                if (toZone > 0) {
                    dimension(parts, sx(a), sy(c), sx(cornerA), sy(c), true,
                        Math.round(toZone) + 'm', 'Along the line to the start zone', W);
                }
                if (across > 0) {
                    dimension(parts, sx(cornerA), sy(c), sx(cornerA), sy(0), false,
                        Math.round(across) + 'm', 'Across to the line', W);
                }

                // Where the boat reaches at the gun, walking those legs at those VMGs.
                // A leg with no VMG behind it costs no time, as computeTimeToLine has it.
                if (nav.timerRunning && nav.timeToStart > 0) {
                    const alongTime = parallel > 0 ? toZone / parallel : 0;
                    let gunA, gunC, ok = true;
                    if (nav.timeToStart <= alongTime) {
                        const run = parallel * nav.timeToStart;
                        gunA = beyondPort ? a - run : a + run;
                        gunC = c;
                    } else if (normal > 0) {
                        const run = Math.min(normal * (nav.timeToStart - alongTime),
                            across + 400 / Math.max(scale, 1e-6));
                        gunA = cornerA;
                        gunC = ocs ? c + run : c - run;
                    } else { ok = false; }
                    if (ok) {
                        parts.push('<circle cx="' + sx(gunA).toFixed(1) + '" cy="' + sy(gunC).toFixed(1)
                            + '" r="5" fill="' + COLOUR.halo + '" stroke="' + COLOUR.dimension
                            + '" stroke-width="2.5"><title>Where you reach at the gun,'
                            + ' sailing these legs at these VMGs</title></circle>');
                    }
                }

                // The current course, run out to where the boat gets to at the gun.
                let courseLabel = null;
                if (nav.cog != null) {
                    const v = screenVector(nav.cog, geo.bearing);
                    const running = nav.timerRunning && nav.timeToStart > 0;
                    let len = 40;
                    if (running && nav.sog != null) {
                        // Clamped past the corner of the viewBox: a long countdown runs
                        // well off the drawing and is clipped there anyway.
                        len = Math.min(nav.sog * nav.timeToStart * scale, 600);
                        courseLabel = 'Current cog/sog to start';
                    } else {
                        courseLabel = 'Current course over ground (no timer running)';
                    }
                    parts.push('<line x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1)
                        + '" x2="' + (bx + v.x * len).toFixed(1) + '" y2="' + (by + v.y * len).toFixed(1)
                        + '" stroke="' + COLOUR.boat + '" stroke-width="6" stroke-opacity="0.55"'
                        + ' stroke-linecap="round"><title>' + esc(courseLabel) + '</title></line>');
                }

                // The hull at true scale, so it can be measured against the line, banded
                // out to a scaled-up copy so it stays visible when the drawing zooms out:
                // twice the hull at five boat lengths off.
                const heading = nav.headingTrue != null ? nav.headingTrue : nav.cog;
                const hv = heading != null ? screenVector(heading, geo.bearing) : {x: 0, y: -1};
                const px = -hv.y, py = hv.x;
                const at = function (fwd, stbd) {
                    return (bx + hv.x * fwd + px * stbd).toFixed(1) + ','
                        + (by + hv.y * fwd + py * stbd).toFixed(1);
                };
                const hull = Math.min(Math.max((nav.boatLength || DEFAULT_BOAT_METRES) * scale, 6), 200);
                const outer = Math.max(hull + Math.abs(by - lineY) / 5, hull + 9);
                const tip = ['SOG ' + formatKnots(nav.sog) + '  COG ' + formatBearing(nav.cog)];
                if (courseLabel) tip.push(courseLabel);
                parts.push('<path d="' + hullPath(at, outer) + ' ' + hullPath(at, hull)
                    + '" fill="' + (ocs ? COLOUR.ocs : COLOUR.boat) + '" fill-rule="evenodd">'
                    + '<title>' + esc(tip.join('\n')) + '</title></path>');
            }

            // The line, its label and its ends last, so nothing closing on it breaks it up.
            parts.push('<line x1="' + portX + '" y1="' + lineY + '" x2="' + stbX + '" y2="' + lineY
                + '" stroke="' + COLOUR.line + '" stroke-width="4" stroke-dasharray="10 8"/>');

            const length = nav.lineLength != null ? nav.lineLength : geo.length;
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

            // Both ends stand for a 10m object, exaggerated so they stay legible.
            const endSize = Math.min(Math.max(END_METRES * scale * END_EXAGGERATION, 12), 40);
            const k = endSize / 24;
            parts.push('<circle cx="' + portX + '" cy="' + lineY + '" r="' + (endSize * 0.29)
                + '" fill="' + COLOUR.port + '" stroke="' + COLOUR.halo + '"/>');
            parts.push('<polygon points="' + (stbX - 13 * k) + ',' + (lineY - 4 * k) + ' '
                + (stbX + 11 * k) + ',' + (lineY - 4 * k) + ' ' + (stbX + 9 * k) + ',' + (lineY + 4 * k)
                + ' ' + (stbX - 7 * k) + ',' + (lineY + 4 * k) + '" fill="' + COLOUR.stb
                + '" stroke="' + COLOUR.halo + '"/>');
            parts.push('<rect x="' + (stbX - 3 * k) + '" y="' + (lineY - 10 * k) + '" width="' + (9 * k)
                + '" height="' + (6 * k) + '" fill="' + COLOUR.stb + '" stroke="' + COLOUR.halo + '"/>');

            svg.innerHTML = parts.join('');
        }

        return {render: render};
    }

    global.RacerLineView = {create: create};
})(window);

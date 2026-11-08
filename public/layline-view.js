/*
 * The lay lines drawing: the waypoint being sailed to, its lay lines, a wind ladder, and the
 * boat with its course over ground and track. Needs racer-draw.js loaded first.
 *
 * The view is framed with the waypoint at the top middle and the boat in the bottom third,
 * the bearing to the waypoint straight up. The frame is held while the boat stays in the
 * bottom third, and is rotated and rescaled to put it back in the middle of it when it
 * leaves. Close to the waypoint the scale stops growing and the rotation is held, so the
 * view does not spin as the boat closes on it or rounds it.
 */
(function (global) {
    'use strict';

    const EARTH_RADIUS = 6371000;
    const VB_HEIGHT = 600;          // fixed, so font and arrow sizes scale with the box
    const MARK_Y = 0.2;             // the waypoint, as a fraction of the height down
    const BOAT_Y = 0.8;             // where a re-frame puts the boat
    const BAND_TOP = 2 / 3;         // the bottom third the boat is kept in
    const EDGE = 20;                // kept clear at the sides and the bottom
    const DEFAULT_BOAT_METRES = 10;
    const ZONE_LENGTHS = 3;         // the zone circle's radius, in boat lengths
    const MIN_SPAN_LENGTHS = 10;    // boat lengths from the boat to the waypoint at the closest zoom
    const MIN_HULL = 14;
    const COG_SECONDS = 60;         // the COG arrow is a minute's sailing
    const RUNGS = 8;                // wind ladder rungs over the height, roughly

    // The dark theme's colours; each render takes the theme's own (racer-theme.css).
    const BASE_COLOUR = {
        mark: '#fa0', zone: '#fa0', port: '#f88', stb: '#8f8', boat: '#6cf', track: '#6cf',
        ladder: '#888', guide: '#999', halo: '#000'
    };
    let COLOUR = BASE_COLOUR;

    /** Offset of a point from an origin, in metres east/north. */
    function offsetFrom(origin, point) {
        const lat0 = origin.latitude * Math.PI / 180;
        return {
            e: (point.longitude - origin.longitude) * Math.PI / 180 * Math.cos(lat0) * EARTH_RADIUS,
            n: (point.latitude - origin.latitude) * Math.PI / 180 * EARTH_RADIUS
        };
    }

    function isPosition(p) {
        return p && RacerDraw.finite(p.latitude) && RacerDraw.finite(p.longitude);
    }

    /** The rhumb line bearing (rad true) and distance (m) from one position to another. */
    function rhumb(from, to) {
        const f1 = from.latitude * Math.PI / 180, f2 = to.latitude * Math.PI / 180;
        let dl = (to.longitude - from.longitude) * Math.PI / 180;
        if (Math.abs(dl) > Math.PI) dl = dl > 0 ? dl - 2 * Math.PI : dl + 2 * Math.PI;
        const dpsi = Math.log(Math.tan(Math.PI / 4 + f2 / 2) / Math.tan(Math.PI / 4 + f1 / 2));
        const q = Math.abs(dpsi) > 1e-12 ? (f2 - f1) / dpsi : Math.cos(f1);
        const distance = Math.hypot(f2 - f1, q * dl) * EARTH_RADIUS;
        const bearing = (Math.atan2(dl, dpsi) + 2 * Math.PI) % (2 * Math.PI);
        return {bearing: bearing, distance: distance};
    }

    /** A round step for the wind ladder: 1, 2 or 5 times a power of ten metres. */
    function niceStep(metres) {
        const power = Math.pow(10, Math.floor(Math.log10(Math.max(metres, 1e-3))));
        const f = metres / power;
        return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
    }

    function formatMetres(m) {
        return m >= 1852 ? (m / 1852).toFixed(m >= 18520 ? 0 : 1) + 'nm' : Math.round(m) + 'm';
    }

    function create(svg) {
        let frame = null;

        function boatLength(nav) {
            return nav.boatLength > 0 ? nav.boatLength : DEFAULT_BOAT_METRES;
        }

        /**
         * The frame to draw in: held while the boat is in the bottom third, otherwise turned
         * so the waypoint is straight up from the boat and scaled to put the boat back in
         * the middle of the bottom third.
         */
        function updateFrame(nav, W, boat) {
            const H = VB_HEIGHT, markY = MARK_Y * H;
            const key = W + '|' + nav.mark.latitude + ',' + nav.mark.longitude + '|' + boatLength(nav);
            const minSpan = MIN_SPAN_LENGTHS * boatLength(nav);
            const closest = (BOAT_Y * H - markY) / minSpan;
            const held = frame && frame.key === key;
            if (!boat) {
                if (!held) frame = {key: key, rot: RacerDraw.finite(nav.twd) ? nav.twd : 0, scale: closest};
                return frame;
            }
            if (held) {
                const p = toView(frame, W, boat);
                if (p.y >= BAND_TOP * H && p.y <= H - EDGE && p.x >= EDGE && p.x <= W - EDGE)
                    return frame;
            }
            const d = Math.hypot(boat.e, boat.n);
            const bearing = Math.atan2(-boat.e, -boat.n);
            let rot = bearing, scale = closest;
            if (d >= minSpan) {
                scale = (BOAT_Y * H - markY) / d;
            } else if (held) {
                // Close in: hold the rotation, unless that has lost the boat off the side.
                const kept = {key: key, rot: frame.rot, scale: scale};
                const p = toView(kept, W, boat);
                if (p.x >= EDGE && p.x <= W - EDGE && p.y >= EDGE && p.y <= H - EDGE) rot = frame.rot;
            }
            frame = {key: key, rot: rot, scale: scale};
            return frame;
        }

        /** A point east/north of the waypoint, in the drawing. */
        function toView(f, W, o) {
            const c = Math.cos(f.rot), s = Math.sin(f.rot);
            return {
                x: W / 2 + (o.e * c - o.n * s) * f.scale,
                y: MARK_Y * VB_HEIGHT - (o.e * s + o.n * c) * f.scale
            };
        }

        function render(nav) {
            if (!svg) return;
            COLOUR = RacerDraw.themed(BASE_COLOUR);
            const box = svg.getBoundingClientRect();
            const aspect = box.height > 0 ? box.width / box.height : 0.75;
            const W = Math.round(VB_HEIGHT * Math.min(Math.max(aspect, 0.45), 3));
            const H = VB_HEIGHT;
            svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

            if (!isPosition(nav.mark)) {
                frame = null;
                svg.innerHTML = '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" fill="'
                    + COLOUR.guide + '" font-size="24">No waypoint being sailed to</text>';
                return;
            }

            const boat = isPosition(nav.position) ? offsetFrom(nav.mark, nav.position) : null;
            const f = updateFrame(nav, W, boat);
            const toScreen = function (bearing) {
                return {x: Math.sin(bearing - f.rot), y: -Math.cos(bearing - f.rot)};
            };
            const mark = {x: W / 2, y: MARK_Y * H};
            const far = 2 * (W + H);
            const parts = [];
            const line = function (x1, y1, x2, y2, colour, width, opacity, dash) {
                parts.push('<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1)
                    + '" y2="' + y2.toFixed(1) + '" stroke="' + colour + '" stroke-width="' + width
                    + '" stroke-opacity="' + opacity + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
            };

            // The wind ladder: rungs square to the wind, one through the waypoint, a round
            // distance apart. Each one is a step nearer to or further from the waypoint upwind.
            let step = null;
            if (RacerDraw.finite(nav.twd)) {
                step = niceStep(H / RUNGS / f.scale);
                const up = toScreen(nav.twd), across = {x: -up.y, y: up.x};
                const unit = step * f.scale;
                const along = [[0, 0], [W, 0], [0, H], [W, H]].map(function (c) {
                    return ((c[0] - mark.x) * up.x + (c[1] - mark.y) * up.y) / unit;
                });
                const lo = Math.floor(Math.min.apply(null, along)), hi = Math.ceil(Math.max.apply(null, along));
                for (let k = Math.max(lo, -100); k <= Math.min(hi, 100); k++) {
                    const cx = mark.x + up.x * k * unit, cy = mark.y + up.y * k * unit;
                    line(cx - across.x * far, cy - across.y * far, cx + across.x * far, cy + across.y * far,
                        COLOUR.ladder, k === 0 ? 1.2 : 1, k === 0 ? 0.4 : 0.25);
                }
            }

            // The lay lines into the waypoint: close hauled when it is upwind, at the gybe
            // angle when it is downwind. Starboard tack green, port red.
            if (RacerDraw.finite(nav.twd)) {
                const angles = RacerDraw.layAngles(nav);
                const towards = boat ? Math.atan2(-boat.e, -boat.n) : f.rot;
                const off = Math.abs(Math.atan2(Math.sin(nav.twd - towards), Math.cos(nav.twd - towards)));
                const angle = off <= Math.PI / 2 ? angles.beat : angles.gybe;
                [{h: nav.twd - angle, colour: COLOUR.stb, tack: 'Starboard'},
                    {h: nav.twd + angle, colour: COLOUR.port, tack: 'Port'}].forEach(function (lay) {
                    // Back from the waypoint, the way a boat on this heading comes from.
                    const d = toScreen(lay.h);
                    parts.push('<g><title>' + lay.tack + ' tack lay line, heading '
                        + RacerDraw.bearingText(lay.h) + '</title>');
                    line(mark.x, mark.y, mark.x - d.x * far, mark.y - d.y * far, lay.colour, 2, 0.7, '12 7');
                    parts.push('</g>');
                });
            }

            // The zone around the waypoint, and the waypoint itself.
            const zone = ZONE_LENGTHS * boatLength(nav) * f.scale;
            if (zone >= 3) {
                parts.push('<circle cx="' + mark.x + '" cy="' + mark.y + '" r="' + zone.toFixed(1)
                    + '" fill="none" stroke="' + COLOUR.zone + '" stroke-width="1.5" stroke-opacity="0.6"'
                    + ' stroke-dasharray="6 5"><title>' + ZONE_LENGTHS + ' boat length zone</title></circle>');
            }
            parts.push('<circle cx="' + mark.x + '" cy="' + mark.y + '" r="7" fill="' + COLOUR.mark
                + '" stroke="' + COLOUR.halo + '" stroke-width="2"><title>'
                + RacerDraw.esc(nav.markName || 'Waypoint') + '</title></circle>');
            if (nav.markName) {
                parts.push('<text x="' + (mark.x + 12) + '" y="' + (mark.y - 10)
                    + '" text-anchor="start" font-size="22" fill="' + COLOUR.mark + '" stroke="' + COLOUR.halo
                    + '" stroke-width="5" paint-order="stroke">' + RacerDraw.esc(nav.markName) + '</text>');
            }

            // The track, then the boat over it.
            if (nav.track && nav.track.length > 1) {
                const points = nav.track.map(function (p) {
                    const v = toView(f, W, offsetFrom(nav.mark, p));
                    return v.x.toFixed(1) + ',' + v.y.toFixed(1);
                });
                parts.push('<polyline points="' + points.join(' ') + '" fill="none" stroke="' + COLOUR.track
                    + '" stroke-width="2" stroke-opacity="0.4" stroke-linejoin="round"/>');
            }

            if (boat) {
                const b = toView(f, W, boat);
                if (RacerDraw.finite(nav.cog)) {
                    const d = toScreen(nav.cog);
                    const length = Math.min(Math.max((nav.sog || 0) * COG_SECONDS * f.scale, 30), H);
                    const tx = b.x + d.x * length, ty = b.y + d.y * length, p = {x: -d.y, y: d.x};
                    parts.push('<g><title>COG ' + RacerDraw.bearingText(nav.cog) + (RacerDraw.finite(nav.sog)
                        ? ', SOG ' + (nav.sog / 0.514444).toFixed(1) + ' kn: a minute\'s sailing' : '') + '</title>');
                    line(b.x, b.y, tx - d.x * 10, ty - d.y * 10, COLOUR.boat, 3, 0.8);
                    parts.push('<polygon points="' + tx.toFixed(1) + ',' + ty.toFixed(1) + ' '
                        + (tx - d.x * 14 + p.x * 7).toFixed(1) + ',' + (ty - d.y * 14 + p.y * 7).toFixed(1) + ' '
                        + (tx - d.x * 14 - p.x * 7).toFixed(1) + ',' + (ty - d.y * 14 - p.y * 7).toFixed(1)
                        + '" fill="' + COLOUR.boat + '" fill-opacity="0.8"/></g>');
                }
                // The hull at true scale, with a minimum size, centred on the fix.
                const heading = RacerDraw.finite(nav.headingTrue) ? nav.headingTrue : nav.cog;
                const hv = RacerDraw.finite(heading) ? toScreen(heading) : {x: 0, y: -1};
                const px = -hv.y, py = hv.x;
                const hull = Math.max(boatLength(nav) * f.scale, MIN_HULL);
                const at = function (fwd, stbd) {
                    return (b.x + hv.x * fwd + px * stbd).toFixed(1) + ',' + (b.y + hv.y * fwd + py * stbd).toFixed(1);
                };
                parts.push('<path d="' + RacerDraw.hullPath(at, hull) + '" fill="' + COLOUR.boat
                    + '" stroke="' + COLOUR.halo + '" stroke-width="1"/>');
            }

            // North top left; the wind and the current top right; the ladder's step bottom left.
            parts.push(RacerDraw.northArrow(42, 48, toScreen));
            parts.push(RacerDraw.windArrow(W - 40, 40, nav.twd, toScreen, nav.tws));
            parts.push(RacerDraw.setArrow(W - 105, 40, nav.current, toScreen));
            if (step) {
                parts.push('<text x="' + EDGE + '" y="' + (H - 10) + '" font-size="18" fill="' + COLOUR.ladder
                    + '">rungs ' + formatMetres(step) + ' apart</text>');
            }

            svg.innerHTML = parts.join('');
        }

        return {render: render};
    }

    global.RacerLaylineView = {create: create, rhumb: rhumb, formatMetres: formatMetres};
})(window);

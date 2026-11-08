/*
 * Drawing pieces and data handling shared by the webapp's drawings: the start line view
 * (line-view.js) and the lay lines view (layline-view.js). Plain browser JS, no build step.
 */
(function (global) {
    'use strict';

    const BASE_COLOUR = {wind: '#ddd', set: '#39f', north: '#ccc', halo: '#000'};

    /**
     * The colours for the theme in use: each key's --draw-<key> token (camelCase keys as
     * kebab-case), from racer-theme.css, or the colour given when there is none.
     */
    function themed(colours) {
        const style = global.getComputedStyle ? global.getComputedStyle(document.documentElement) : null;
        const result = {};
        Object.keys(colours).forEach(function (key) {
            const token = style ? style.getPropertyValue('--draw-' + key.replace(/[A-Z]/g, function (c) {
                return '-' + c.toLowerCase();
            })).trim() : '';
            result[key] = token || colours[key];
        });
        return result;
    }
    const DEFAULT_BEAT = Math.PI / 4;
    const DEFAULT_GYBE = 3 * Math.PI / 4;

    function esc(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function finite(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function degrees(radians) {
        return ((radians * 180 / Math.PI) % 360 + 360) % 360;
    }

    function bearingText(radians) {
        return degrees(radians).toFixed(0).padStart(3, '0') + '°T';
    }

    /**
     * A broad arrow centred on (cx, cy), pointing along the screen unit vector d, in the
     * shape of the wind arrow: 60 units long at size 1.
     */
    function arrow(cx, cy, d, fill, title, size) {
        const k = size || 1;
        const p = {x: -d.y, y: d.x};
        const at = function (fwd, side) {
            return (cx + (d.x * fwd + p.x * side) * k).toFixed(1) + ','
                + (cy + (d.y * fwd + p.y * side) * k).toFixed(1);
        };
        return '<polygon points="' + [at(30, 0), at(4, 16), at(4, 6), at(-30, 6),
            at(-30, -6), at(4, -6), at(4, -16)].join(' ') + '" fill="' + fill
            + '" fill-opacity="0.65"><title>' + esc(title) + '</title></polygon>';
    }

    /**
     * The wind arrow, blowing the way the wind goes.
     * @param toScreen A compass bearing (rad) as a screen unit vector.
     * @param extra More for the tooltip, e.g. the angle to the line.
     */
    function windArrow(cx, cy, twd, toScreen, tws, extra) {
        if (!finite(twd)) return '';
        const title = 'Wind from ' + bearingText(twd)
            + (finite(tws) ? ' at ' + (tws / 0.514444).toFixed(1) + ' kn' : '')
            + (extra ? ', ' + extra : '');
        return arrow(cx, cy, toScreen(twd + Math.PI), themed(BASE_COLOUR).wind, title);
    }

    /** The current, as a blue arrow the way it flows (its set), when it is known. */
    function setArrow(cx, cy, current, toScreen) {
        if (!current || !finite(current.set) || !finite(current.drift)) return '';
        const title = 'Set ' + bearingText(current.set) + ', drift '
            + (current.drift / 0.514444).toFixed(1) + ' kn';
        return arrow(cx, cy, toScreen(current.set), themed(BASE_COLOUR).set, title, 0.8);
    }

    /** A north arrow: a pointer with an N at its head. */
    function northArrow(cx, cy, toScreen) {
        const COLOUR = themed(BASE_COLOUR);
        const d = toScreen(0), p = {x: -d.y, y: d.x};
        const at = function (fwd, side) {
            return (cx + d.x * fwd + p.x * side).toFixed(1) + ',' + (cy + d.y * fwd + p.y * side).toFixed(1);
        };
        return '<g><title>North</title><polygon points="' + [at(22, 0), at(-14, 10), at(-6, 0), at(-14, -10)].join(' ')
            + '" fill="' + COLOUR.north + '" fill-opacity="0.65"/>'
            + '<text x="' + (cx + d.x * 36).toFixed(1) + '" y="' + (cy + d.y * 36 + 7).toFixed(1)
            + '" text-anchor="middle" font-size="20" font-weight="bold" fill="' + COLOUR.north
            + '">N</text></g>';
    }

    /** One closed hull outline of the given length, pointing along the boat. */
    function hullPath(at, length, beamRatio) {
        const h = length / 2, b = length * (beamRatio || 0.36) / 2;
        return 'M' + at(h, 0) + ' C' + at(h * 0.55, b * 0.42) + ' ' + at(-h * 0.15, b)
            + ' ' + at(-h, b * 0.55) + ' L' + at(-h, -b * 0.55) + ' C' + at(-h * 0.15, -b)
            + ' ' + at(h * 0.55, -b * 0.42) + ' ' + at(h, 0) + ' Z';
    }

    /**
     * The tack and gybe angles (rad off the wind) to draw lay lines with: as published
     * (nav.beatAngle, nav.gybeAngle), else as the plugin resolved them (nav.angles, from the
     * polar), else 45° and 135°. Some plugins sign the angles by tack: only the size counts.
     */
    function layAngles(nav) {
        const angle = function (v, lo, hi) {
            const a = finite(v) ? Math.abs(v) : NaN;
            return a > lo && a < hi ? a : null;
        };
        const resolved = nav.angles || {};
        const beat = angle(nav.beatAngle, 0, Math.PI / 2);
        const gybe = angle(nav.gybeAngle, Math.PI / 2, Math.PI);
        return {
            beat: beat != null ? beat : angle(resolved.beatAngle, 0, Math.PI / 2) || DEFAULT_BEAT,
            gybe: gybe != null ? gybe : angle(resolved.gybeAngle, Math.PI / 2, Math.PI) || DEFAULT_GYBE,
        };
    }

    /**
     * Fetch the angles as the plugin resolves them (published, else the polar's, else the
     * defaults) into nav.angles, then call back. Without access (e.g. not logged in), the
     * published angles or the defaults are used.
     */
    function loadAngles(nav, done) {
        fetch(global.location.origin + '/plugins/signalk-racer/angles', {credentials: 'same-origin'})
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (angles) { if (angles) nav.angles = angles; })
            .catch(function () {})
            .then(function () { if (done) done(); });
    }

    /** The Signal K paths the current may be published on, to subscribe to. */
    const CURRENT_PATHS = ['environment.current', 'environment.current.setTrue', 'environment.current.drift'];

    /**
     * Fold a delta value into nav.current ({set, drift}, set the way it flows, rad true, drift
     * m/s), either as the spec's environment.current object or the separate set and drift
     * paths of e.g. signalk-derived-data. Returns whether the path was a current one.
     */
    function takeCurrent(nav, path, value) {
        const parts = nav.currentParts || (nav.currentParts = {set: null, drift: null});
        if (path === 'environment.current') {
            if (value && typeof value === 'object') {
                parts.set = finite(value.setTrue) ? value.setTrue : null;
                parts.drift = finite(value.drift) ? value.drift : null;
            } else {
                parts.set = parts.drift = null;
            }
        } else if (path === 'environment.current.setTrue') {
            parts.set = finite(value) ? value : null;
        } else if (path === 'environment.current.drift') {
            parts.drift = finite(value) ? value : null;
        } else {
            return false;
        }
        nav.current = parts.set != null && parts.drift != null ? {set: parts.set, drift: parts.drift} : null;
        return true;
    }

    /** The same from a REST tree of vessels/self/environment. */
    function currentFromTree(nav, environment) {
        const node = environment && environment.current;
        if (!node) return;
        if (node.value && typeof node.value === 'object') takeCurrent(nav, 'environment.current', node.value);
        else {
            if (node.setTrue) takeCurrent(nav, 'environment.current.setTrue', node.setTrue.value);
            if (node.drift) takeCurrent(nav, 'environment.current.drift', node.drift.value);
        }
    }

    global.RacerDraw = {
        CURRENT_PATHS: CURRENT_PATHS, themed: themed,
        esc: esc, finite: finite, bearingText: bearingText,
        arrow: arrow, windArrow: windArrow, setArrow: setArrow, northArrow: northArrow, hullPath: hullPath,
        layAngles: layAngles, loadAngles: loadAngles, takeCurrent: takeCurrent, currentFromTree: currentFromTree,
    };
})(window);

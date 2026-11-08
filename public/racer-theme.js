/*
 * The webapp's theme: Auto, Dark, Light or Night, chosen on the menu page and remembered in
 * the browser. Auto is night when the vessel's environment.mode is night, and otherwise the
 * device's own light or dark. Loaded in each page's <head>, so the page never flashes the
 * wrong colours. Pages with drawings redraw on the 'racer-theme' event.
 */
(function (global) {
    'use strict';

    const KEY = 'racer.theme';
    const CHOICES = ['auto', 'dark', 'light', 'night'];
    const root = document.documentElement;
    let mode = null; // environment.mode, as last read
    let timer = null;

    function choice() {
        try {
            const value = localStorage.getItem(KEY);
            return CHOICES.includes(value) ? value : 'auto';
        } catch (e) {
            return 'auto';
        }
    }

    function deviceLight() {
        return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches);
    }

    function resolved() {
        const c = choice();
        if (c !== 'auto') return c;
        if (mode === 'night') return 'night';
        return deviceLight() ? 'light' : 'dark';
    }

    function apply() {
        const theme = resolved();
        if (root.dataset.theme !== theme) {
            root.dataset.theme = theme;
            global.dispatchEvent(new CustomEvent('racer-theme', {detail: {theme: theme, choice: choice()}}));
        }
    }

    // environment.mode, only read while on Auto.
    function readMode() {
        fetch(global.location.origin + '/signalk/v1/api/vessels/self/environment/mode')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (node) {
                const value = node && typeof node === 'object' ? node.value : node;
                mode = typeof value === 'string' ? value : null;
            })
            .catch(function () { mode = null; })
            .then(apply);
    }

    function follow() {
        clearInterval(timer);
        timer = null;
        if (choice() === 'auto') {
            readMode();
            timer = setInterval(readMode, 30000);
        }
        apply();
    }

    function set(value) {
        try { localStorage.setItem(KEY, CHOICES.includes(value) ? value : 'auto'); } catch (e) { /* not kept */ }
        follow();
    }

    apply();
    follow();
    if (global.matchMedia)
        global.matchMedia('(prefers-color-scheme: light)').addEventListener('change', apply);
    // A theme chosen in another tab.
    global.addEventListener('storage', function (event) { if (event.key === KEY) follow(); });

    global.RacerTheme = {choice: choice, theme: resolved, set: set, CHOICES: CHOICES};
})(window);

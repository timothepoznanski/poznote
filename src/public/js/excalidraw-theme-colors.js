/**
 * Excalidraw previews in a dark theme (issue #1578).
 *
 * A diagram keeps Excalidraw's own palette everywhere. Its preview is stored
 * with the colours Excalidraw authors on a light ground, and a dark theme
 * shows it the way Excalidraw's dark mode does: every colour goes through
 * invert(93%) hue-rotate(180deg).
 *
 * css/tokens.css does that with a filter on the whole <img>, which also takes
 * the photos a diagram embeds. Here the same arithmetic is applied to the
 * colours of the file instead: the SVG is read, its strokes and fills are
 * replaced, and the result is handed back to the same <img> through a
 * stylesheet rule, so a photo is left alone and the note's markup is never
 * touched (it is serialized on every save). It needs no re-save of an
 * existing diagram and no support from the browser beyond content: url().
 *
 * Without this script (or before it has run) the filter of css/tokens.css
 * stands in. A light theme shows the file as it is and needs nothing.
 */
(function () {
    'use strict';

    // Colours already worked out, they repeat a lot within one file.
    var inverted = {};

    function clamp(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    function toHex(rgb) {
        var out = '#';
        for (var i = 0; i < 3; i++) {
            out += (clamp(rgb[i]) + 256).toString(16).slice(1);
        }
        return out;
    }

    function parseHex(value) {
        var hex = value.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            hex = hex.replace(/./g, '$&$&');
        }
        if (!/^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
            return null;
        }
        return {
            rgb: [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)],
            alpha: hex.slice(6)
        };
    }

    // invert(93%) hue-rotate(180deg), Excalidraw's dark-mode filter, as
    // arithmetic: what a colour becomes on a dark ground.
    function darkInvert(rgb) {
        var r = 0.93 - 0.86 * (rgb[0] / 255);
        var g = 0.93 - 0.86 * (rgb[1] / 255);
        var b = 0.93 - 0.86 * (rgb[2] / 255);
        return [
            (-0.574 * r + 1.43 * g + 0.144 * b) * 255,
            (0.426 * r + 0.43 * g + 0.144 * b) * 255,
            (0.426 * r + 1.43 * g - 0.856 * b) * 255
        ];
    }

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    /** What a stored colour is drawn as on a dark ground. */
    function invertColor(value) {
        var key = value.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(inverted, key)) {
            var hex = parseHex(key);
            inverted[key] = hex ? toHex(darkInvert(hex.rgb)) + hex.alpha : value;
        }
        return inverted[key];
    }

    // ------------------------------------------------------------------
    // The previews in a note
    // ------------------------------------------------------------------

    var PREVIEW_SELECTOR = 'img.excalidraw-image-neutral';
    var sources = {};      // src -> { text: the SVG as stored, url: the themed copy }
    var styleElement = null;
    var refreshTimer = null;
    var dark = false;

    function themeSvg(svg) {
        return svg.replace(/\b(stroke|fill)="(#[0-9a-fA-F]{3,8})"/g, function (match, attribute, color) {
            return attribute + '="' + invertColor(color) + '"';
        });
    }

    function writeRules() {
        var css = '';
        for (var src in sources) {
            if (!sources[src].url) continue;
            // The themed copy replaces what the <img> paints, so the filter
            // and the scheme that the stored file relies on are switched off.
            css += PREVIEW_SELECTOR + '[src="' + src.replace(/["\\]/g, '\\$&') + '"]'
                + '{content:url("' + sources[src].url + '");filter:none;color-scheme:light}\n';
        }
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'excalidraw-preview-theme';
            document.head.appendChild(styleElement);
        }
        if (styleElement.textContent !== css) {
            styleElement.textContent = css;
        }
    }

    function paint(src) {
        var entry = sources[src];
        if (!entry || typeof entry.text !== 'string') return;
        var previous = entry.url;
        entry.url = URL.createObjectURL(new Blob([themeSvg(entry.text)], { type: 'image/svg+xml' }));
        writeRules();
        if (previous) {
            // Left alive for a moment: the rule above has only just stopped
            // pointing at it.
            setTimeout(function () { URL.revokeObjectURL(previous); }, 5000);
        }
    }

    function load(src) {
        sources[src] = { text: null, url: null };
        fetch(src, { credentials: 'same-origin' }).then(function (response) {
            var type = response.headers.get('Content-Type') || '';
            // A diagram saved before previews were SVG still shows a PNG.
            if (!response.ok || type.indexOf('image/svg') === -1) return null;
            return response.text();
        }).then(function (text) {
            if (text === null || !sources[src]) return;
            sources[src].text = text;
            paint(src);
        }).catch(function (error) {
            console.debug('excalidraw-theme-colors: preview not themed:', error);
        });
    }

    function scan() {
        // A light theme shows the stored file: nothing to read or replace.
        var images = dark ? document.querySelectorAll(PREVIEW_SELECTOR) : [];
        var seen = {};
        var i;
        for (i = 0; i < images.length; i++) {
            var src = images[i].getAttribute('src');
            if (!src) continue;
            seen[src] = true;
            if (!sources[src]) load(src);
        }
        // A preview no longer on the page gives its copy back.
        var dropped = false;
        for (var known in sources) {
            if (seen[known]) continue;
            if (sources[known].url) URL.revokeObjectURL(sources[known].url);
            delete sources[known];
            dropped = true;
        }
        if (dropped) writeRules();
    }

    function scheduleScan() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(function () {
            refreshTimer = null;
            scan();
        }, 60);
    }

    function followTheme() {
        if (dark === isDarkTheme()) return;
        dark = !dark;
        scan();
    }

    function watchPreviews() {
        dark = isDarkTheme();
        scan();

        new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var mutation = mutations[i];
                if (mutation.type === 'attributes') {
                    if (mutation.target.matches && mutation.target.matches(PREVIEW_SELECTOR)) return scheduleScan();
                    continue;
                }
                if (mutation.addedNodes.length || mutation.removedNodes.length) return scheduleScan();
            }
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

        new MutationObserver(followTheme).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    function start() {
        if (!window.fetch || !window.MutationObserver || !window.URL || !URL.createObjectURL) return;
        watchPreviews();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

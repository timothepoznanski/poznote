/**
 * View controls for the dashboard / diary boards, next to the filter bar:
 * - a single view toggle cycling grid small -> medium -> large -> wide ->
 *   list, showing the grid icon plus the size letter in grid layout and the
 *   list icon in list layout (wide: the width beyond large at the medium
 *   height)
 * Settings persist in localStorage (separate ViewLayout / ViewSize keys, so
 * older stored preferences keep working), namespaced by the controls'
 * data-view-prefix so each page keeps its own preferences. Size and layout
 * are applied as view-size-* / view-layout-* classes on .dashboard-container;
 * all visual differences live in dashboard.css.
 *
 * There is no column setting, like Google Keep: --dash-col-max (on the same
 * element) is the number of cards of the current size (--dash-col-min wide)
 * that fit the container, recomputed whenever the container is resized or
 * the size changes.
 */
(function () {
    'use strict';

    var SIZES = ['small', 'medium', 'large', 'wide'];
    var LAYOUTS = ['grid', 'list'];
    // The single toggle walks through every view: the four grid sizes, then list.
    var VIEWS = ['small', 'medium', 'large', 'wide', 'list'];

    function initControls(root) {
        var prefix = root.getAttribute('data-view-prefix') || 'board';
        var viewBtn = root.querySelector('.board-view-layout-toggle');
        var container = document.querySelector('.dashboard-container');
        if (!viewBtn || !container) return;

        function readSetting(key, allowed, fallback) {
            var value = null;
            try { value = localStorage.getItem(prefix + key); } catch (e) { /* storage unavailable */ }
            return allowed.indexOf(value) !== -1 ? value : fallback;
        }

        var size = readSetting('ViewSize', SIZES, 'medium');
        var layout = readSetting('ViewLayout', LAYOUTS, 'grid');

        // As many cards as fit side by side: N cards take N widths plus N-1
        // gaps. The width and gap come from the view-size-* rules of
        // dashboard.css (the fallbacks are the medium size's).
        function fitColumns() {
            var style = getComputedStyle(container);
            var card = parseFloat(style.getPropertyValue('--dash-col-min')) || 190;
            var gap = parseFloat(style.getPropertyValue('--dash-col-gap')) || 14;
            var width = container.clientWidth -
                (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
            var fit = String(Math.max(1, Math.floor((width + gap) / (card + gap))));
            if (container.style.getPropertyValue('--dash-col-max') !== fit) {
                container.style.setProperty('--dash-col-max', fit);
            }
        }

        function apply() {
            SIZES.forEach(function (s) {
                container.classList.toggle('view-size-' + s, s === size);
            });
            LAYOUTS.forEach(function (l) {
                container.classList.toggle('view-layout-' + l, l === layout);
            });
            // is-list swaps the toggle icon (CSS)
            root.classList.toggle('is-list', layout === 'list');
            var sizeLabel = viewBtn.getAttribute('data-label-' + size) || size;
            var letter = viewBtn.querySelector('.board-view-size-letter');
            if (letter) letter.textContent = sizeLabel.charAt(0).toUpperCase();
            // The toggle advertises the current view
            viewBtn.title = layout === 'list'
                ? (viewBtn.getAttribute('data-label-list') || '')
                : (viewBtn.getAttribute('data-label-grid') || '') + ' (' + sizeLabel + ')';
        }

        apply();
        fitColumns();

        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(fitColumns).observe(container);
        } else {
            window.addEventListener('resize', fitColumns);
        }

        viewBtn.addEventListener('click', function () {
            var current = layout === 'list' ? 'list' : size;
            var next = VIEWS[(VIEWS.indexOf(current) + 1) % VIEWS.length];
            if (next === 'list') {
                layout = 'list';
            } else {
                layout = 'grid';
                size = next;
            }
            try {
                localStorage.setItem(prefix + 'ViewLayout', layout);
                localStorage.setItem(prefix + 'ViewSize', size);
            } catch (e) { /* storage unavailable */ }
            apply();
            // A new size is a new card width, so a new column count
            fitColumns();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.board-view-controls').forEach(initControls);
    });
})();

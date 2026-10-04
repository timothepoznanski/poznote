/**
 * View controls for the dashboard / diary boards, next to the filter bar:
 * - a single view toggle cycling grid small -> medium -> large -> wide ->
 *   list (large -> wide -> list on a phone with full height on), showing the
 *   grid icon plus the size letter in grid layout and the list icon in list
 *   layout (wide: the width beyond large at the medium height)
 * - a full-height toggle: in grid layout each card takes the height of its
 *   own content instead of being cut at the row height, and the cards pack
 *   under one another like a masonry wall (see watchCardHeights)
 * Settings persist in localStorage (separate ViewLayout / ViewSize /
 * ViewFullHeight keys, so older stored preferences keep working), namespaced
 * by the controls' data-view-prefix so each page keeps its own preferences.
 * Size, layout and full height are applied as view-size-* / view-layout-* /
 * view-full-height classes on .dashboard-container; all visual differences
 * live in dashboard.css.
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
    // On a phone (the 800px breakpoint of dashboard.css) with full-height
    // cards, small and medium are left out: the toggle only offers large
    // (one column), wide and list.
    var MOBILE_FULL_HEIGHT_VIEWS = ['large', 'wide', 'list'];
    var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;
    // Height of the grid rows in full-height mode (grid-auto-rows in
    // dashboard.css): a card spans as many of them as its content needs.
    var MASONRY_ROW = 2;

    /**
     * Full-height cards. The grid rows are MASONRY_ROW px tall with no row
     * gap, and every card spans the rows its own height (plus the gap) takes:
     * the grid's auto-placement then drops each card into the first free
     * slot, so a short card no longer waits for its tall neighbour. The cards
     * keep their natural height (align-items: start), which a ResizeObserver
     * reports whenever a card is added, re-wrapped by a new width or edited.
     */
    function watchCardHeights(container) {
        if (typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') {
            return { set: function () {} };
        }
        var active = false;

        var sizes = new ResizeObserver(function (entries) {
            var gaps = new Map();
            entries.forEach(function (entry) {
                var card = entry.target;
                var grid = card.parentElement;
                if (!active || !grid || !card.isConnected) return;
                if (!gaps.has(grid)) gaps.set(grid, parseFloat(getComputedStyle(grid).columnGap) || 0);
                var box = entry.borderBoxSize && entry.borderBoxSize[0];
                var height = box ? box.blockSize : card.getBoundingClientRect().height;
                card.style.gridRowEnd = height > 0
                    ? 'span ' + Math.ceil((height + gaps.get(grid)) / MASONRY_ROW)
                    : '';
            });
        });

        function cards() {
            return container.querySelectorAll('.dashboard-grid-container > .dash-card');
        }

        // observe() on a card already watched is a no-op
        function observeCards() {
            cards().forEach(function (card) { sizes.observe(card); });
        }

        var additions = new MutationObserver(observeCards);

        return {
            set: function (on) {
                if (on === active) return;
                active = on;
                if (on) {
                    observeCards();
                    additions.observe(container, { childList: true, subtree: true });
                } else {
                    additions.disconnect();
                    sizes.disconnect();
                    cards().forEach(function (card) { card.style.gridRowEnd = ''; });
                }
            }
        };
    }

    function initControls(root) {
        var prefix = root.getAttribute('data-view-prefix') || 'board';
        var viewBtn = root.querySelector('.board-view-layout-toggle');
        var fullHeightBtn = root.querySelector('.board-view-full-height-toggle');
        var container = document.querySelector('.dashboard-container');
        if (!viewBtn || !container) return;
        var cardHeights = watchCardHeights(container);

        function readSetting(key, allowed, fallback) {
            var value = null;
            try { value = localStorage.getItem(prefix + key); } catch (e) { /* storage unavailable */ }
            return allowed.indexOf(value) !== -1 ? value : fallback;
        }

        var size = readSetting('ViewSize', SIZES, 'medium');
        var layout = readSetting('ViewLayout', LAYOUTS, 'grid');
        var fullHeight = readSetting('ViewFullHeight', ['0', '1'], '0') === '1';

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

        function views() {
            return fullHeight && mobileQuery && mobileQuery.matches ? MOBILE_FULL_HEIGHT_VIEWS : VIEWS;
        }

        // A small or medium preference shows as wide where those two are left
        // out, its closest look there. The stored preference is left alone,
        // so it comes back once full height is off or the window grows.
        function shownSize() {
            return views().indexOf(size) !== -1 ? size : 'wide';
        }

        function apply() {
            var shown = shownSize();
            SIZES.forEach(function (s) {
                container.classList.toggle('view-size-' + s, s === shown);
            });
            LAYOUTS.forEach(function (l) {
                container.classList.toggle('view-layout-' + l, l === layout);
            });
            // List rows are one line each: full height only acts on the grid
            container.classList.toggle('view-full-height', fullHeight);
            cardHeights.set(fullHeight && layout === 'grid');
            if (fullHeightBtn) {
                fullHeightBtn.classList.toggle('active', fullHeight);
                fullHeightBtn.setAttribute('aria-pressed', fullHeight ? 'true' : 'false');
                fullHeightBtn.disabled = layout === 'list';
            }
            // is-list swaps the toggle icon (CSS)
            root.classList.toggle('is-list', layout === 'list');
            var sizeLabel = viewBtn.getAttribute('data-label-' + shown) || shown;
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
            var available = views();
            var current = layout === 'list' ? 'list' : shownSize();
            var next = available[(available.indexOf(current) + 1) % available.length];
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

        if (mobileQuery && mobileQuery.addEventListener) {
            mobileQuery.addEventListener('change', function () {
                apply();
                fitColumns();
            });
        }

        if (fullHeightBtn) {
            fullHeightBtn.addEventListener('click', function () {
                fullHeight = !fullHeight;
                try {
                    localStorage.setItem(prefix + 'ViewFullHeight', fullHeight ? '1' : '0');
                } catch (e) { /* storage unavailable */ }
                apply();
                // On a phone the shown size may have just changed
                fitColumns();
            });
        }
    }

    // The pages load this script below the controls and before the one that
    // draws the cards: the size is applied as the script runs, so the cards
    // are laid out once, in their final columns. Waiting for DOMContentLoaded
    // measured the container with every card already in it, at the default
    // column count, and the board then jumped to the real one.
    var controls = document.querySelectorAll('.board-view-controls');
    if (controls.length || document.readyState !== 'loading') {
        controls.forEach(initControls);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            document.querySelectorAll('.board-view-controls').forEach(initControls);
        });
    }
})();

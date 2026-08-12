/**
 * View controls for the dashboard / diary boards, next to the filter bar:
 * - a single view toggle cycling grid small -> medium -> large -> list,
 *   showing the grid icon plus the size letter in grid layout and the list
 *   icon in list layout
 * - a column button cycling 1..8, capping how many columns the grid splits
 *   the width into, hidden in list layout
 * Settings persist in localStorage (separate ViewLayout / ViewSize keys, so
 * older stored preferences keep working), namespaced by the controls'
 * data-view-prefix so each page keeps its own preferences. Size and layout
 * are applied as view-size-* / view-layout-* classes on .dashboard-container,
 * the column cap as a --dash-col-max custom property on the same element;
 * all visual differences live in dashboard.css.
 */
(function () {
    'use strict';

    var SIZES = ['small', 'medium', 'large'];
    var LAYOUTS = ['grid', 'list'];
    // The single toggle walks through every view: the three grid sizes, then list.
    var VIEWS = ['small', 'medium', 'large', 'list'];
    // Maximum columns: the grid still drops to fewer when the width can't fit
    // that many, so cards keep their width instead of being squeezed.
    var COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    var DEFAULT_COLUMNS = '4';

    function initControls(root) {
        var prefix = root.getAttribute('data-view-prefix') || 'board';
        var viewBtn = root.querySelector('.board-view-layout-toggle');
        var columnsBtn = root.querySelector('.board-view-columns-btn');
        var container = document.querySelector('.dashboard-container');
        if (!viewBtn || !container) return;

        function readSetting(key, allowed, fallback) {
            var value = null;
            try { value = localStorage.getItem(prefix + key); } catch (e) { /* storage unavailable */ }
            return allowed.indexOf(value) !== -1 ? value : fallback;
        }

        var size = readSetting('ViewSize', SIZES, 'medium');
        var layout = readSetting('ViewLayout', LAYOUTS, 'grid');
        // A previously stored 'auto' is not in COLUMNS any more, so it falls
        // back to the default like any other invalid value.
        var columns = readSetting('ViewColumns', COLUMNS, DEFAULT_COLUMNS);

        function applyColumns() {
            // Desktop-only: the mobile breakpoint ignores this and keeps its
            // own fixed 2-column layout.
            container.style.setProperty('--dash-col-max', columns);
            if (!columnsBtn) return;
            var title = columnsBtn.getAttribute('data-label-columns') || 'Maximum columns';
            columnsBtn.title = title + ': ' + columns;
            var value = columnsBtn.querySelector('.board-view-columns-value');
            if (value) value.textContent = columns;
        }

        function apply() {
            SIZES.forEach(function (s) {
                container.classList.toggle('view-size-' + s, s === size);
            });
            LAYOUTS.forEach(function (l) {
                container.classList.toggle('view-layout-' + l, l === layout);
            });
            // is-list swaps the toggle icon and hides the columns button (CSS)
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
        applyColumns();

        if (columnsBtn) {
            columnsBtn.addEventListener('click', function () {
                columns = COLUMNS[(COLUMNS.indexOf(columns) + 1) % COLUMNS.length];
                try { localStorage.setItem(prefix + 'ViewColumns', columns); } catch (e) { /* storage unavailable */ }
                applyColumns();
            });
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
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.board-view-controls').forEach(initControls);
    });
})();

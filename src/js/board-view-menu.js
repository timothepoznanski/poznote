/**
 * View controls for the dashboard / diary boards, next to the filter bar:
 * - a layout toggle button (grid <-> list)
 * - a card size button cycling small -> medium -> large, hidden in list layout
 * - a column button cycling auto -> 1..8, capping how many columns the grid
 *   splits the width into (auto = as many as fit), hidden in list layout
 * Settings persist in localStorage, namespaced by the controls'
 * data-view-prefix so each page keeps its own preferences. Size and layout are
 * applied as view-size-* / view-layout-* classes on .dashboard-container, the
 * column cap as a --dash-col-max custom property on the same element; all
 * visual differences live in dashboard.css.
 */
(function () {
    'use strict';

    var SIZES = ['small', 'medium', 'large'];
    var LAYOUTS = ['grid', 'list'];
    // Maximum columns: the grid still drops to fewer when the width can't fit
    // that many, so cards keep their width instead of being squeezed.
    var COLUMNS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    var DEFAULT_COLUMNS = '4';

    function initControls(root) {
        var prefix = root.getAttribute('data-view-prefix') || 'board';
        var layoutBtn = root.querySelector('.board-view-layout-toggle');
        var sizeBtn = root.querySelector('.board-view-size-btn');
        var columnsBtn = root.querySelector('.board-view-columns-btn');
        var container = document.querySelector('.dashboard-container');
        if (!layoutBtn || !sizeBtn || !container) return;

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
            // is-list swaps the toggle icon and hides the size button (CSS)
            root.classList.toggle('is-list', layout === 'list');
            // The toggle advertises the layout a click switches TO
            layoutBtn.title = layoutBtn.getAttribute(layout === 'grid' ? 'data-label-list' : 'data-label-grid') || '';
            var sizeLabel = sizeBtn.getAttribute('data-label-' + size) || size;
            sizeBtn.title = sizeLabel;
            var letter = sizeBtn.querySelector('.board-view-size-letter');
            if (letter) letter.textContent = sizeLabel.charAt(0).toUpperCase();
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

        layoutBtn.addEventListener('click', function () {
            layout = layout === 'grid' ? 'list' : 'grid';
            try { localStorage.setItem(prefix + 'ViewLayout', layout); } catch (e) { /* storage unavailable */ }
            apply();
        });

        sizeBtn.addEventListener('click', function () {
            size = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length];
            try { localStorage.setItem(prefix + 'ViewSize', size); } catch (e) { /* storage unavailable */ }
            apply();
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.querySelectorAll('.board-view-controls').forEach(initControls);
    });
})();

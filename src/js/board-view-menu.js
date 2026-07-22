/**
 * View controls for the dashboard / diary boards, next to the filter bar:
 * - a layout toggle button (grid <-> list)
 * - a card size button cycling small -> medium -> large, hidden in list layout
 * Settings persist in localStorage, namespaced by the controls'
 * data-view-prefix so each page keeps its own preferences. The chosen values
 * are applied as view-size-* / view-layout-* classes on .dashboard-container;
 * all visual differences live in dashboard.css.
 */
(function () {
    'use strict';

    var SIZES = ['small', 'medium', 'large'];
    var LAYOUTS = ['grid', 'list'];

    function initControls(root) {
        var prefix = root.getAttribute('data-view-prefix') || 'board';
        var layoutBtn = root.querySelector('.board-view-layout-toggle');
        var sizeBtn = root.querySelector('.board-view-size-btn');
        var container = document.querySelector('.dashboard-container');
        if (!layoutBtn || !sizeBtn || !container) return;

        function readSetting(key, allowed, fallback) {
            var value = null;
            try { value = localStorage.getItem(prefix + key); } catch (e) { /* storage unavailable */ }
            return allowed.indexOf(value) !== -1 ? value : fallback;
        }

        var size = readSetting('ViewSize', SIZES, 'medium');
        var layout = readSetting('ViewLayout', LAYOUTS, 'grid');

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

/**
 * Collapse / expand the notes page icon rail.
 *
 * Mirrors the left column toggle in js/resize-column.js: a body class drives
 * the CSS, and the state is persisted in localStorage.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'iconSidebarCollapsed';
    var COLLAPSED_CLASS = 'icon-sidebar-collapsed';

    function readStoredState() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }

    function persistState(collapsed) {
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
        } catch (error) {
            // Private browsing: the toggle still works for this page view.
        }
    }

    function syncButton(collapsed) {
        var button = document.getElementById('iconSidebarToggle');
        if (button) {
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
    }

    function applyState(collapsed) {
        document.body.classList.toggle(COLLAPSED_CLASS, collapsed);
        syncButton(collapsed);
    }

    function init() {
        var button = document.getElementById('iconSidebarToggle');
        if (!button) return;

        applyState(readStoredState());

        button.addEventListener('click', function () {
            var collapsed = !document.body.classList.contains(COLLAPSED_CLASS);
            applyState(collapsed);
            persistState(collapsed);
            button.blur();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

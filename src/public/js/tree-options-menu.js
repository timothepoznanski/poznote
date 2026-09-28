// ============================================================================
// View options menu of the notes tree
// ============================================================================
// The three-dot toggle at the right end of the rule after Favorites
// (#sidebarTreeOptionsBtn, notes_list.php) opens #tree-options-menu, rendered
// by index.php: the sort mode, "Expand all folders" and the offline dots.
//
// This file only opens, places and closes the menu. Each item keeps the
// data-action its former button had, handled where it was:
//   set-note-sort       js/note-sort-cycle.js
//   toggle-all-folders  js/index-events.js (label kept by utils-folder-tree.js)
//   toggle-offline-dots js/offline-marks.js
//
// Both the toggle and the menu are rendered inside #left_col, so a sidebar
// refresh replaces them: they are looked up on every use.

(function () {
    'use strict';

    function getMenu() {
        return document.getElementById('tree-options-menu');
    }

    function getToggle() {
        return document.querySelector('[data-action="toggle-tree-options-menu"]');
    }

    function closeOtherMenus() {
        if (typeof closeFolderActionsMenu === 'function') closeFolderActionsMenu();
        if (typeof closeNoteActionsMenu === 'function') closeNoteActionsMenu();
        if (typeof window.closeCreateMenu === 'function') window.closeCreateMenu();
        if (typeof window.closeFavoritesMenu === 'function') window.closeFavoritesMenu();
    }

    function isOpen() {
        var menu = getMenu();
        return !!(menu && menu.classList.contains('show'));
    }

    function markToggle(open) {
        var toggle = getToggle();
        if (!toggle) return;
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function close() {
        var menu = getMenu();
        if (menu) menu.classList.remove('show');
        markToggle(false);
    }

    function open(toggle) {
        var menu = getMenu();
        if (!menu || typeof adjustMenuPosition !== 'function') return;
        closeOtherMenus();
        // The label and icon of "Expand all folders" follow the folders
        // opened or closed one by one since the last refresh
        if (typeof window.updateToggleAllFoldersButton === 'function') window.updateToggleAllFoldersButton();
        if (typeof syncActionsMenuSeparators === 'function') syncActionsMenuSeparators(menu);
        menu.classList.add('show');
        markToggle(true);
        adjustMenuPosition(menu, toggle);
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var toggle = target.closest('[data-action="toggle-tree-options-menu"]');
        if (toggle) {
            event.preventDefault();
            event.stopPropagation();
            if (isOpen()) {
                close();
            } else {
                open(toggle);
            }
            return;
        }

        // An item closes the menu, then its click carries on to the listener
        // of its data-action
        if (target.closest('#tree-options-menu [data-action]')) {
            close();
            return;
        }

        // Outside click, including on the toggle of another menu
        if (isOpen() && !target.closest('#tree-options-menu')) close();
    }, true);

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isOpen()) close();
    });

    window.closeTreeOptionsMenu = close;
})();

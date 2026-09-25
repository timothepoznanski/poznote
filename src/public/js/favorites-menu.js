// ============================================================================
// Favorites menu
// ============================================================================
// The menu of the Favorites section of the notes tree, opened by a right-click
// on its row (js/notes-list-events.js) or by its three-dot toggle. Favorites
// has no folder behind it, so the folder actions menu does not apply: this one
// sets the section's own order and star colour (the favorites_sort and
// favorites_icon_color settings, read by index.php) and empties it.
//
// The markup (#favorites-actions-menu) is rendered by notes_list.php inside
// #left_col, so a sidebar refresh replaces it: it is looked up on every use,
// and the current order comes back already marked by the server.
//
// Closing on an outside click is done by the listener js/utils-menus.js keeps
// for every .folder-actions-menu.

(function () {
    'use strict';

    function tr(key, fallback, params) {
        return (typeof window.t === 'function') ? window.t(key, params || null, fallback) : fallback;
    }

    function getMenu() {
        return document.getElementById('favorites-actions-menu');
    }

    function getToggle() {
        return document.querySelector('[data-action="toggle-favorites-menu"]');
    }

    function closeOtherMenus() {
        if (typeof closeFolderActionsMenu === 'function') closeFolderActionsMenu();
        if (typeof closeNoteActionsMenu === 'function') closeNoteActionsMenu();
        if (typeof window.closeCreateMenu === 'function') window.closeCreateMenu();
    }

    function isOpen() {
        var menu = getMenu();
        return !!(menu && menu.classList.contains('show'));
    }

    function close() {
        var menu = getMenu();
        if (menu) menu.classList.remove('show');
        var toggle = getToggle();
        if (toggle) toggle.classList.remove('open');
    }

    // Returns false when the menu is not on the page (no Favorites section)
    function openAtPoint(x, y) {
        var menu = getMenu();
        if (!menu || typeof positionMenuAtPoint !== 'function') return false;
        closeOtherMenus();
        menu.classList.add('show');
        positionMenuAtPoint(menu, x, y);
        return true;
    }

    function openFromToggle(toggle) {
        var menu = getMenu();
        if (!menu || typeof adjustMenuPosition !== 'function') return;
        if (isOpen()) {
            close();
            return;
        }
        closeOtherMenus();
        menu.classList.add('show');
        // Kept visible while its menu is open, like the folder toggles
        toggle.classList.add('open');
        adjustMenuPosition(menu, toggle);
    }

    function saveSetting(key, value) {
        return fetch('/api/v1/settings/' + key, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ value: value })
        }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        });
    }

    function showError() {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(tr('notes_list.favorites_menu.error', 'Could not update Favorites'), 'error');
        }
    }

    // The tree is built server side: the new order comes from a rebuild of the
    // sidebar, folder states kept (same as js/note-sort-cycle.js)
    function refreshTree() {
        if (typeof window.refreshNotesListAfterFolderAction === 'function') {
            var result = window.refreshNotesListAfterFolderAction();
            if (result && typeof result.catch === 'function') {
                result.catch(function () { window.location.reload(); });
            }
            return;
        }
        window.location.reload();
    }

    function setSort(mode) {
        saveSetting('favorites_sort', mode).then(refreshTree).catch(function (error) {
            console.error('favorites-menu: saving the order failed', error);
            showError();
        });
    }

    function paintStar(color) {
        var star = document.querySelector('.folder-header[data-folder="Favorites"] > .folder-toggle .folder-icon');
        if (!star) return;
        var css = color && typeof window.poznoteIconColorCss === 'function' ? window.poznoteIconColorCss(color) : '';
        if (css) {
            star.style.setProperty('color', css, 'important');
        } else {
            star.style.removeProperty('color');
        }
    }

    function changeColor(menu) {
        var modal = window.PoznoteIconColorModal;
        if (!modal) return;
        modal.open({
            color: menu.getAttribute('data-icon-color') || '',
            icon: 'lucide-star',
            label: tr('notes_list.system_folders.favorites', 'Favorites'),
            onApply: function (color) {
                saveSetting('favorites_icon_color', color || '').then(function () {
                    var current = getMenu();
                    if (current) current.setAttribute('data-icon-color', color || '');
                    paintStar(color || '');
                }).catch(function (error) {
                    console.error('favorites-menu: saving the star colour failed', error);
                    showError();
                });
            }
        });
    }

    function clearAll(menu) {
        var workspace = menu.getAttribute('data-workspace') || '';
        var run = function () {
            fetch('/api/v1/notes/favorites/clear?workspace=' + encodeURIComponent(workspace), {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ workspace: workspace })
            }).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                // A reload, as after any favorite toggle: the star of the open
                // note's toolbar has to follow too
                window.location.reload();
            }).catch(function (error) {
                console.error('favorites-menu: clearing Favorites failed', error);
                showError();
            });
        };

        if (typeof window.showConfirmModal !== 'function') {
            run();
            return;
        }
        window.showConfirmModal(
            tr('notes_list.favorites_menu.clear_confirm_title', 'Remove all from favorites?'),
            tr('notes_list.favorites_menu.clear_confirm_message', 'Every note and folder of this workspace leaves Favorites. The notes and folders themselves are kept.'),
            run,
            { confirmText: tr('notes_list.favorites_menu.clear_button', 'Remove all'), danger: true, hideSaveAndExit: true }
        );
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var toggle = target.closest('[data-action="toggle-favorites-menu"]');
        if (toggle) {
            // The toggle sits in the Favorites row, which folds on click
            event.preventDefault();
            event.stopPropagation();
            openFromToggle(toggle);
            return;
        }

        var item = target.closest('#favorites-actions-menu [data-favorites-action]');
        if (item) {
            var menu = getMenu();
            var action = item.getAttribute('data-favorites-action');
            close();
            if (action === 'sort') {
                if (!item.classList.contains('favorites-sort-active')) setSort(item.getAttribute('data-sort-mode'));
            } else if (action === 'color') {
                changeColor(menu);
            } else if (action === 'clear') {
                clearAll(menu);
            }
            return;
        }

        // Outside click: js/utils-menus.js hides the menu, the toggle follows
        if (!target.closest('#favorites-actions-menu')) {
            var openToggle = getToggle();
            if (openToggle) openToggle.classList.remove('open');
        }
    }, true);

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isOpen()) close();
    });

    window.openFavoritesMenuAtPoint = openAtPoint;
    window.closeFavoritesMenu = close;
})();

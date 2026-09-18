/**
 * Sidebar tree: multi-selection of notes and folders (issue #1421)
 *
 *   Ctrl+Click    add a row to the selection, or take it out
 *   Shift+Click   select every visible row from the anchor to this one
 *   Esc           clear the selection
 *
 * The anchor is the last row clicked without Shift, falling back to the open
 * note. Ctrl+Click never pulls the open note in by itself: a plain click opens
 * a note here rather than selecting it, and a Del on "B and C" must not trash
 * the note being read. Only tinted rows are selected. On macOS the Command key
 * replaces Ctrl.
 *
 * A plain click anywhere in the tree clears the selection and then does what
 * it always did (open the note, fold the folder). Right-click on a selected
 * row while several are selected opens a small menu for the whole set; on any
 * other row it clears the selection and the row's own menu opens.
 *
 * This file only owns the selection. What acts on it lives in
 * js/tree-undo-clipboard.js: Del, Ctrl+C / X / V, and the undo of those, which
 * read the set through window.PoznoteTreeSelection.items(). Dragging a
 * selected row drags the whole selection (js/events-drag-drop.js); dragging
 * a row outside it moves that row alone and clears the selection. Every one
 * of those actions reloads the page, which is what clears the selection
 * afterwards.
 *
 * Rows are keyed "note:<id>" / "folder:<id>". A favorited note has a second
 * row in the Favorites section and a favorite folder a shortcut row there;
 * both rows light up together and count once. System folders (Favorites,
 * Tags, Trash, Public) and the read-only "Other accounts" block never join.
 */
(function () {
    'use strict';

    var isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

    var selectedKeys = [];
    var anchorKey = null;
    var menuEl = null;

    function tr(key, fallback, vars) {
        return (typeof window.t === 'function') ? window.t(key, vars || null, fallback) : fallback;
    }

    function isReadOnly() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    function hasModifier(e) {
        return isMacPlatform ? e.metaKey : (e.ctrlKey || e.metaKey);
    }

    // ============================================
    // Rows
    // ============================================

    function parseKey(key) {
        var index = key.indexOf(':');
        return { type: key.slice(0, index), id: key.slice(index + 1) };
    }

    /** The row under an event target, or null for anything that is not a selectable row */
    function rowFromTarget(target) {
        if (!target || !target.closest) return null;
        var leftCol = document.getElementById('left_col');
        if (!leftCol || !leftCol.contains(target)) return null;
        if (target.closest('.other-accounts, .note-actions, .folder-actions, .tree-inline-input, .tree-row-editing, .note-actions-menu, .folder-actions-menu, .create-menu')) {
            return null;
        }

        var item = target.closest('.note-list-item');
        if (item) return rowFromNoteItem(item);

        var toggle = target.closest('.folder-toggle');
        return toggle ? rowFromFolderToggle(toggle) : null;
    }

    function rowFromNoteItem(item) {
        var link = item.querySelector('a.links_arbo_left');
        if (!link) return null;
        if (link.classList.contains('favorite-folder-link')) {
            var favoriteFolderId = link.getAttribute('data-folder-id');
            return favoriteFolderId ? { key: 'folder:' + favoriteFolderId, element: item } : null;
        }
        var noteId = link.getAttribute('data-note-db-id');
        return noteId ? { key: 'note:' + noteId, element: item } : null;
    }

    function rowFromFolderToggle(toggle) {
        var header = toggle.parentElement;
        if (!header || !header.classList.contains('folder-header') || header.classList.contains('system-folder')) return null;
        var folderId = header.getAttribute('data-folder-id');
        return folderId ? { key: 'folder:' + folderId, element: toggle } : null;
    }

    /** Every selectable row on screen, in tree order (a row inside a closed folder is not on screen) */
    function visibleRows() {
        var rows = [];
        document.querySelectorAll('#left_col .note-list-item, #left_col .folder-toggle').forEach(function (element) {
            if (element.closest('.other-accounts') || !element.getClientRects().length) return;
            var row = element.classList.contains('folder-toggle') ? rowFromFolderToggle(element) : rowFromNoteItem(element);
            if (row) rows.push(row);
        });
        return rows;
    }

    function rowElementsForKey(key) {
        var parsed = parseKey(key);
        var elements = [];
        if (parsed.type === 'note') {
            document.querySelectorAll('#left_col .links_arbo_left[data-note-db-id="' + parsed.id + '"]').forEach(function (link) {
                var item = link.closest('.note-list-item');
                if (item && !item.closest('.other-accounts')) elements.push(item);
            });
        } else {
            var header = document.querySelector('#left_col .folder-header[data-folder-id="' + parsed.id + '"]:not(.system-folder)');
            var toggle = header ? header.querySelector(':scope > .folder-toggle') : null;
            if (toggle) elements.push(toggle);
            document.querySelectorAll('#left_col a.favorite-folder-link[data-folder-id="' + parsed.id + '"]').forEach(function (link) {
                var item = link.closest('.note-list-item');
                if (item) elements.push(item);
            });
        }
        return elements;
    }

    function openNoteKey() {
        var selected = document.querySelector('#left_col .links_arbo_left.selected-note[data-note-db-id]');
        return selected ? 'note:' + selected.getAttribute('data-note-db-id') : null;
    }

    function anchorOrOpenNote() {
        if (anchorKey && rowElementsForKey(anchorKey).length) return anchorKey;
        return openNoteKey();
    }

    // ============================================
    // Selection state
    // ============================================

    function render() {
        document.querySelectorAll('.tree-multi-selected').forEach(function (el) {
            el.classList.remove('tree-multi-selected');
        });
        selectedKeys.forEach(function (key) {
            rowElementsForKey(key).forEach(function (el) {
                el.classList.add('tree-multi-selected');
            });
        });
    }

    function setSelection(keys) {
        var unique = [];
        keys.forEach(function (key) {
            if (key && unique.indexOf(key) === -1) unique.push(key);
        });
        selectedKeys = unique;
        render();
    }

    function clearSelection() {
        closeMenu();
        if (!selectedKeys.length) return;
        selectedKeys = [];
        render();
    }

    function toggleRow(key) {
        var keys = selectedKeys.slice();
        var index = keys.indexOf(key);
        if (index === -1) {
            keys.push(key);
        } else {
            keys.splice(index, 1);
        }
        anchorKey = key;
        setSelection(keys);
    }

    function selectRange(key, additive) {
        var rows = visibleRows();
        var order = [];
        rows.forEach(function (row) {
            if (order.indexOf(row.key) === -1) order.push(row.key);
        });

        var from = order.indexOf(anchorOrOpenNote());
        var to = order.indexOf(key);
        if (to === -1) return;
        if (from === -1) {
            from = to;
            anchorKey = key;
        }

        var range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelection(additive ? selectedKeys.concat(range) : range);
    }

    /** Selected rows in tree order, as {type, id} */
    function items() {
        var order = [];
        visibleRows().forEach(function (row) {
            if (order.indexOf(row.key) === -1) order.push(row.key);
        });
        // A selected row may have been folded away since: it still counts, after the visible ones
        var sorted = selectedKeys.slice().sort(function (a, b) {
            var ia = order.indexOf(a);
            var ib = order.indexOf(b);
            return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
        });
        return sorted.map(parseKey);
    }

    // The tree is swapped wholesale by refreshNotesListAfterFolderAction():
    // rows that did not come back leave the selection
    function pruneSelection() {
        var kept = selectedKeys.filter(function (key) { return rowElementsForKey(key).length > 0; });
        if (kept.length !== selectedKeys.length) {
            selectedKeys = kept;
        }
        render();
    }

    // ============================================
    // Pointer handling
    // ============================================

    // Stop Shift+Click from selecting text and Ctrl+Click from starting a drag.
    // Cancelling the mousedown also keeps focus where it was, so an editor
    // that had it is blurred by hand: otherwise the Del that follows would
    // erase a character in the note instead of reaching the tree.
    function handleMouseDown(e) {
        if (e.button !== 0 || isReadOnly()) return;
        if (!(e.shiftKey || hasModifier(e)) || e.altKey) return;
        if (!rowFromTarget(e.target)) return;
        e.preventDefault();
        var active = document.activeElement;
        if (active && active !== document.body && typeof active.blur === 'function' && !active.closest('#left_col')) {
            active.blur();
        }
    }

    function handleClick(e) {
        if (e.button !== 0 || isReadOnly()) return;
        var target = e.target;
        if (!target || !target.closest || !target.closest('#left_col')) return;
        if (menuEl && menuEl.contains(target)) return;

        var modifier = hasModifier(e);
        var row = rowFromTarget(target);

        if (row && (modifier || e.shiftKey) && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) {
                selectRange(row.key, modifier);
            } else {
                toggleRow(row.key);
            }
            return;
        }

        // Clicks inside a row menu, on a row's own ⋮ or outside the tree
        // itself (search bar, column header) leave the selection alone
        if (!target.closest('.notes-list-scrollable-content')) return;
        if (target.closest('.note-actions-menu, .folder-actions-menu, .create-menu, .note-actions, .folder-actions')) return;

        clearSelection();
        if (row) anchorKey = row.key;
    }

    // Two quick modifier clicks are also a dblclick, which would open the note in a new tab
    function handleDblClick(e) {
        if (isReadOnly() || !(e.shiftKey || hasModifier(e)) || e.altKey) return;
        if (!rowFromTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }

    function handleContextMenu(e) {
        closeMenu();
        if (isReadOnly()) return;
        var row = rowFromTarget(e.target);
        if (!row) return;

        if (selectedKeys.length > 1 && selectedKeys.indexOf(row.key) !== -1) {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY);
            return;
        }
        clearSelection();
        anchorKey = row.key;
    }

    // ============================================
    // Menu for the whole selection
    // ============================================

    function menuItem(action, icon, label, shortcut, danger) {
        var item = document.createElement('div');
        item.className = 'note-actions-menu-item' + (danger ? ' danger' : '');
        item.setAttribute('data-selection-action', action);
        var i = document.createElement('i');
        i.className = 'lucide ' + icon;
        var span = document.createElement('span');
        span.textContent = label;
        item.appendChild(i);
        item.appendChild(span);
        if (shortcut) {
            var hint = document.createElement('span');
            hint.className = 'actions-menu-shortcut';
            hint.textContent = isMacPlatform ? shortcut.replace(/Ctrl\+/g, '⌘') : shortcut;
            item.appendChild(hint);
        }
        return item;
    }

    function openMenu(x, y) {
        if (typeof window.closeNoteActionsMenu === 'function') window.closeNoteActionsMenu();
        if (typeof window.closeFolderActionsMenu === 'function') window.closeFolderActionsMenu();

        if (!menuEl) {
            menuEl = document.createElement('div');
            menuEl.className = 'note-actions-menu tree-selection-menu';
            menuEl.addEventListener('click', handleMenuClick);
            document.body.appendChild(menuEl);
        }

        menuEl.textContent = '';
        var header = document.createElement('div');
        header.className = 'tree-selection-menu-count';
        header.textContent = tr('tree_selection.count', '{{count}} selected', { count: selectedKeys.length });
        menuEl.appendChild(header);
        menuEl.appendChild(menuItem('copy', 'lucide-clipboard-copy', tr('notes_list.note_actions.copy_note', 'Copy'), 'Ctrl+C'));
        menuEl.appendChild(menuItem('cut', 'lucide-scissors', tr('notes_list.note_actions.cut_note', 'Cut'), 'Ctrl+X'));
        var separator = document.createElement('div');
        separator.className = 'note-actions-menu-separator';
        menuEl.appendChild(separator);
        menuEl.appendChild(menuItem('delete', 'lucide-trash-2', tr('common.delete', 'Delete'), isMacPlatform ? '⌘⌫' : 'Del', true));

        menuEl.classList.add('show');
        if (typeof window.positionMenuAtPoint === 'function') {
            window.positionMenuAtPoint(menuEl, x, y);
        } else {
            menuEl.style.top = y + 'px';
            menuEl.style.left = x + 'px';
        }
    }

    function closeMenu() {
        if (menuEl) menuEl.classList.remove('show');
    }

    function handleMenuClick(e) {
        var item = e.target.closest('[data-selection-action]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        closeMenu();

        var clipboard = window.PoznoteTreeClipboard;
        if (!clipboard) return;
        var action = item.getAttribute('data-selection-action');
        if (action === 'delete') {
            clipboard.deleteItems(items());
        } else {
            clipboard.copyItems(items(), action === 'cut' ? 'cut' : 'copy');
        }
    }

    function handleOutsidePointer(e) {
        if (menuEl && menuEl.classList.contains('show') && !menuEl.contains(e.target)) closeMenu();
    }

    // ============================================
    // Keyboard
    // ============================================

    // Esc on an open dialog (the delete confirmation) only closes the dialog
    function isModalOpen() {
        var modals = document.querySelectorAll('.modal, .modal-overlay');
        for (var i = 0; i < modals.length; i++) {
            if (window.getComputedStyle(modals[i]).display !== 'none') return true;
        }
        return false;
    }

    function handleKeydown(e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        if (menuEl && menuEl.classList.contains('show')) {
            closeMenu();
            e.preventDefault();
            return;
        }
        if (!selectedKeys.length || isModalOpen()) return;
        var target = e.target;
        if (target && target.closest && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')) return;
        clearSelection();
    }

    // ============================================
    // Wiring
    // ============================================

    function init() {
        var leftCol = document.getElementById('left_col');
        if (!leftCol) return;

        // Capture phase: a modifier click must reach neither the note loader
        // nor the folder toggle
        document.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('dblclick', handleDblClick, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        document.addEventListener('mousedown', handleOutsidePointer, true);
        // Capture phase: runs before the dialog's own Esc handler closes it
        window.addEventListener('keydown', handleKeydown, true);
        window.addEventListener('blur', closeMenu);
        leftCol.addEventListener('scroll', closeMenu, true);

        if (window.MutationObserver) {
            new MutationObserver(function () { pruneSelection(); }).observe(leftCol, { childList: true });
        }
    }

    window.PoznoteTreeSelection = {
        items: items,
        count: function () { return selectedKeys.length; },
        clear: clearSelection
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

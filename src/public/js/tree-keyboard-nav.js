/**
 * Sidebar tree: moving through it with the arrow keys (issue #1443)
 *
 *   Up / Down     move to the row above or below
 *   Left          close an open folder, otherwise go up to the folder holding
 *                 the row
 *   Right         open a closed folder, otherwise step into it
 *
 * The arrows used to scroll the tree. They now move the selection built by
 * Ctrl+Click and Shift+Click (js/tree-selection.js), so a row reached with the
 * keyboard is copied, cut or trashed by the shortcuts of
 * js/tree-undo-clipboard.js exactly like a clicked one, and the tree scrolls
 * only far enough to keep the row that was reached in sight.
 *
 * Like the other tree shortcuts they only answer while the tree owns the
 * keyboard (js/pane-focus.js): the same keys move the caret in the note. They
 * also stay out of text fields and leave an open dialog or row menu alone.
 *
 * Where the arrows start from: the row the selection points at, which is the
 * row of the last move while they are being used, and the row that was
 * clicked as soon as one is (js/tree-selection.js sets its anchor there),
 * falling back to the note that is open. The row of the last move is also
 * held as the element rather than as its key, because a favorited note and a
 * favorite folder have a second row in the Favorites section and both rows
 * answer to the same key; it is dropped as soon as the anchor names another
 * row, and once the tree has been drawn again the key is what is left to find
 * a row back.
 *
 * While the arrows drive the tree the row tint is the only mark of where the
 * keyboard is. The link that was clicked would otherwise get the browser's
 * focus ring on the first key press (:focus-visible switches on with the
 * keyboard), so the focus is dropped, and the mouse pointer is hidden with
 * the row hovers muted (css/folders/actions-menu.css), like the slash menu
 * and the date picker do, until the mouse is used again.
 *
 * Only rows that can be selected are stepped through, which leaves out the
 * system folders (Favorites, Tags, Trash, Public) and the read-only "Other
 * accounts" block, exactly like the selection itself. Their contents are
 * reached all the same: what is on screen inside an open one is stepped
 * through with the rest.
 */
(function () {
    'use strict';

    var STEPS = {
        ArrowUp: -1,
        ArrowDown: 1,
        Up: -1,
        Down: 1
    };

    // The row the arrows move from, kept as the element that was reached,
    // next to the selection anchor and the open note as they were then: what
    // moves either of those has moved the tree more recently than the arrows
    var cursorElement = null;
    var cursorAnchorKey = null;
    var lastOpenNoteKey = null;

    function selection() {
        return window.PoznoteTreeSelection;
    }

    function hasTree() {
        return !!document.getElementById('left_col');
    }

    function isReadOnly() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    /**
     * The note has the same keys, so the tree only answers while it owns the
     * keyboard (js/pane-focus.js). Without that module the tree answers only
     * for a key pressed inside it, never for one meant for the note.
     */
    function treeOwnsKeyboard(target) {
        var paneFocus = window.PoznotePaneFocus;
        if (paneFocus) return paneFocus.isTree();
        return !!(target && target.closest && target.closest('#left_col'));
    }

    function isTextEditingContext(target) {
        return !!(target && target.closest && target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
            '.CodeMirror, .cm-editor, .excalidraw, .excalidraw-container, canvas'
        ));
    }

    function isModalOpen() {
        var modals = document.querySelectorAll('.modal, .modal-overlay');
        for (var i = 0; i < modals.length; i++) {
            if (window.getComputedStyle(modals[i]).display !== 'none') return true;
        }
        return false;
    }

    // A row menu takes the arrows for itself, or at least must not have the
    // tree move underneath it
    function isRowMenuOpen() {
        return !!document.querySelector('.note-actions-menu.show, .folder-actions-menu.show, .create-menu.show');
    }

    // ============================================
    // Rows
    // ============================================

    function parseKey(key) {
        var index = key.indexOf(':');
        return { type: key.slice(0, index), id: key.slice(index + 1) };
    }

    /** Selectable rows on screen, in tree order (js/tree-selection.js owns the list) */
    function rows() {
        var sel = selection();
        return (sel && typeof sel.rows === 'function') ? sel.rows() : [];
    }

    function indexOfElement(list, element) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].element === element) return i;
        }
        return -1;
    }

    function indexOfKey(list, key) {
        var shortcut = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].key !== key) continue;
            // The row in the tree proper is the one meant: the second row a
            // favorited note and a favorite folder have in the Favorites
            // section only stands in for it
            if (!list[i].element.closest('.folder-header[data-folder="Favorites"]')) return i;
            if (shortcut === -1) shortcut = i;
        }
        return shortcut;
    }

    function anchorKey() {
        var sel = selection();
        return (sel && typeof sel.current === 'function') ? sel.current() : null;
    }

    /** The note open in the right pane, as the row that carries it in the tree */
    function openNoteKey() {
        var open = document.querySelector('#left_col .links_arbo_left.selected-note[data-note-db-id]');
        return open ? 'note:' + open.getAttribute('data-note-db-id') : null;
    }

    function setCursor(element) {
        cursorElement = element;
        cursorAnchorKey = anchorKey();
    }

    /**
     * Where the arrows start from, or -1 when nothing points into the tree yet.
     *
     * Whatever moved the tree last is where they go on from. A note opened
     * since the last press comes first: clicking its row in the tree opens it
     * and anchors the selection there, and a note opened from a tab, a link or
     * the search still moves the blue row the tree shows. The row of the last
     * move only holds while the anchor has not moved, so a click on a folder
     * header, a Ctrl+Click or a Shift+Click takes the arrows there instead.
     */
    function cursorIndex(list) {
        var key = anchorKey();

        var openKey = openNoteKey();
        if (openKey !== lastOpenNoteKey) {
            lastOpenNoteKey = openKey;
            var opened = openKey ? indexOfKey(list, openKey) : -1;
            if (opened !== -1) {
                setCursor(list[opened].element);
                return opened;
            }
        }

        if (cursorElement && key === cursorAnchorKey) {
            var found = indexOfElement(list, cursorElement);
            if (found !== -1) return found;
        }
        cursorElement = null;
        return key ? indexOfKey(list, key) : -1;
    }

    /** Make this row the one selected, the one the arrows continue from, and show it */
    function moveTo(row) {
        var item = parseKey(row.key);
        var sel = selection();
        if (sel && typeof sel.select === 'function') sel.select([item]);
        // After select(), so the anchor kept alongside is the one it just set
        setCursor(row.element);

        // Paste goes where the cursor is, the way it goes where the last click was
        var clipboard = window.PoznoteTreeClipboard;
        if (clipboard && typeof clipboard.setFocus === 'function') clipboard.setFocus(item);

        scrollRowIntoView(row.element);
    }

    // ============================================
    // Folders
    // ============================================

    /** The content a folder row holds, or null for a note and for a favorite folder shortcut */
    function folderContentOf(element) {
        if (!element.classList.contains('folder-toggle')) return null;
        var domId = element.getAttribute('data-folder-dom-id');
        return domId ? document.getElementById(domId) : null;
    }

    function isFolderOpen(content) {
        if (typeof window.isFolderContentOpen === 'function') return window.isFolderContentOpen(content);
        var display = content.style.display || window.getComputedStyle(content).display;
        return display !== 'none';
    }

    function toggleFolderRow(element) {
        var domId = element.getAttribute('data-folder-dom-id');
        if (domId && typeof window.toggleFolder === 'function') window.toggleFolder(domId);
    }

    /** The row of the folder this one sits in, or null at the root and under a system folder */
    function parentRow(list, element) {
        // A folder's own content is its sibling, not its ancestor, so this
        // walks up to the folder holding it either way
        var content = element.closest('.folder-content');
        var header = content ? content.parentElement : null;
        var toggle = (header && header.classList.contains('folder-header'))
            ? header.querySelector(':scope > .folder-toggle')
            : null;
        if (!toggle) return null;
        var index = indexOfElement(list, toggle);
        return index === -1 ? null : list[index];
    }

    // ============================================
    // Moves
    // ============================================

    function moveVertical(list, step) {
        var index = cursorIndex(list);
        if (index === -1) {
            moveTo(step > 0 ? list[0] : list[list.length - 1]);
            return;
        }
        var next = index + step;
        // The ends of the list hold, they do not wrap around
        if (next >= 0 && next < list.length) moveTo(list[next]);
    }

    function moveRight(list) {
        var index = cursorIndex(list);
        if (index === -1) {
            moveTo(list[0]);
            return;
        }

        var row = list[index];
        var content = folderContentOf(row.element);
        if (!content) return;

        if (!isFolderOpen(content)) {
            moveTo(row);
            toggleFolderRow(row.element);
            return;
        }
        // Open already: step into it, unless nothing selectable is in there
        var first = list[index + 1];
        if (first && content.contains(first.element)) moveTo(first);
    }

    function moveLeft(list) {
        var index = cursorIndex(list);
        if (index === -1) {
            moveTo(list[0]);
            return;
        }

        var row = list[index];
        var content = folderContentOf(row.element);
        if (content && isFolderOpen(content)) {
            moveTo(row);
            toggleFolderRow(row.element);
            return;
        }

        var parent = parentRow(list, row.element);
        if (parent) moveTo(parent);
    }

    // ============================================
    // Scrolling
    // ============================================

    /**
     * The scroller the tree rows sit in: the list itself on a wide screen, the
     * whole column on mobile. The walk stops at #left_col because <body> is
     * the sideways scroller of the mobile two-pane layout (css/index-mobile.css)
     * and scrolling it would slide the note in.
     */
    function scrollerOf(element) {
        var node = element.parentElement;
        while (node) {
            var overflowY = window.getComputedStyle(node).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
                return node;
            }
            if (node.id === 'left_col') return null;
            node = node.parentElement;
        }
        return null;
    }

    // A little air above and below so the row that was reached does not sit
    // flush against the edge of the list
    var SCROLL_MARGIN = 8;

    function scrollRowIntoView(element) {
        var scroller = scrollerOf(element);
        if (!scroller) return;

        var row = element.getBoundingClientRect();
        var box = scroller.getBoundingClientRect();

        if (row.top < box.top + SCROLL_MARGIN) {
            scroller.scrollTop -= (box.top + SCROLL_MARGIN) - row.top;
        } else if (row.bottom > box.bottom - SCROLL_MARGIN) {
            scroller.scrollTop += row.bottom - (box.bottom - SCROLL_MARGIN);
        }
    }

    // ============================================
    // Focus ring and mouse pointer
    // ============================================

    /**
     * A clicked note link or folder row keeps the focus, and the browser draws
     * its focus ring there as soon as a key is pressed, as a dark frame on the
     * row the arrows are leaving. The tint says where the keyboard is, so the
     * focus goes. The keys still arrive (the handler is on the document) and
     * the tree still owns them (js/pane-focus.js only follows focusin).
     */
    function dropTreeFocus() {
        var active = document.activeElement;
        if (!active || active === document.body || typeof active.blur !== 'function') return;
        if (active.closest && active.closest('#left_col')) active.blur();
    }

    var MOUSE_HIDDEN_CLASS = 'tree-keyboard-mouse-hidden';
    var mouseHidden = false;

    function handleMouseBack(e) {
        // Chromium fires mousemove without movement when what sits under a
        // resting pointer is drawn again: only a real move counts
        if (e.type === 'mousemove' && !(e.movementX || e.movementY)) return;
        setMouseHidden(false);
    }

    /**
     * Hide the pointer and mute the row hovers while the arrows are in use: the
     * mouse rests where it last clicked, and that row would keep its hover
     * look next to the one the keyboard is on. A move, a click (a tap on a
     * trackpad moves nothing) or the wheel brings the mouse back.
     */
    function setMouseHidden(hidden) {
        if (hidden === mouseHidden) return;
        mouseHidden = hidden;
        document.documentElement.classList.toggle(MOUSE_HIDDEN_CLASS, hidden);

        var listen = hidden ? 'addEventListener' : 'removeEventListener';
        document[listen]('mousemove', handleMouseBack, true);
        document[listen]('mousedown', handleMouseBack, true);
        document[listen]('wheel', handleMouseBack, true);
        window[listen]('blur', handleMouseBack);
    }

    // ============================================
    // Wiring
    // ============================================

    function handleKeydown(e) {
        if (e.defaultPrevented) return;
        // Alt+Up / Alt+Down switch notes (js/keyboard-shortcuts.js), and a
        // modifier arrow is never a plain move through the tree
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

        var key = e.key;
        var isHorizontal = (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Left' || key === 'Right');
        if (!isHorizontal && !Object.prototype.hasOwnProperty.call(STEPS, key)) return;

        if (!hasTree() || isReadOnly() || !treeOwnsKeyboard(e.target)) return;
        if (isTextEditingContext(e.target) || isModalOpen() || isRowMenuOpen()) return;

        // One sweep of the tree per key press, shared by the move and by the
        // look for the row the cursor is on
        var list = rows();
        if (!list.length) return;

        // Answered even when the move goes nowhere (first or last row, a note
        // under Right): the arrows belong to the tree, they no longer scroll it
        e.preventDefault();
        dropTreeFocus();
        setMouseHidden(true);

        if (key === 'ArrowLeft' || key === 'Left') {
            moveLeft(list);
        } else if (key === 'ArrowRight' || key === 'Right') {
            moveRight(list);
        } else {
            moveVertical(list, STEPS[key]);
        }
    }

    function init() {
        if (!hasTree()) return;
        // Only a note opened later counts as a move of the tree, not the one
        // the page was drawn with
        lastOpenNoteKey = openNoteKey();
        document.addEventListener('keydown', handleKeydown);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

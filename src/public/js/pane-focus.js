/**
 * Which pane owns the keyboard: the tree or the note (issue #1440)
 *
 * The sidebar tree and the note are two separate systems with their own
 * shortcuts, and both listen on the document: Ctrl+Z, Ctrl+C / X / V and Del
 * organize notes and folders (js/tree-undo-clipboard.js) while the same keys
 * edit text in the note. Only the pane being worked in should answer them, so
 * the last pointer or focus event decides who owns the keyboard:
 *
 *   click or focus in #left_col     the tree owns it
 *   click or focus in #right_pane   the note owns it
 *
 * Everything else (the icon rail, the outline and AI panels, a dialog, the
 * page menus) leaves the owner as it was: a dialog opened from a tree row is
 * still the tree at work, and an alert raised while typing is still the note.
 *
 * Every tree action reloads the page, and the Ctrl+Z that takes it back comes
 * after that reload, so the owner lives in sessionStorage next to the history
 * itself and record() (js/tree-undo-clipboard.js) hands the tree the keyboard
 * for exactly that reason.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'poznote_pane_focus';
    var TREE = 'tree';
    var EDITOR = 'editor';

    function readStored() {
        try {
            var stored = sessionStorage.getItem(STORAGE_KEY);
            return (stored === TREE || stored === EDITOR) ? stored : null;
        } catch (e) {
            return null;
        }
    }

    var owner = readStored();

    function set(value) {
        if (value !== TREE && value !== EDITOR) return;
        if (value === owner) return;
        owner = value;
        try {
            sessionStorage.setItem(STORAGE_KEY, value);
        } catch (e) { /* storage unavailable: the owner is lost on reload, nothing else */ }
    }

    function ownerFromTarget(target) {
        if (!target || !target.closest) return null;
        if (target.closest('#left_col')) return TREE;
        if (target.closest('#right_pane')) return EDITOR;
        return null;
    }

    function track(event) {
        set(ownerFromTarget(event.target));
    }

    // Capture phase: a handler that stops the event must not hide the move
    document.addEventListener('pointerdown', track, true);
    document.addEventListener('focusin', track, true);

    window.PoznotePaneFocus = {
        get: function () { return owner; },
        set: set,
        isTree: function () { return owner === TREE; },
        isEditor: function () { return owner === EDITOR; }
    };
})();

/**
 * Mobile editor bar (discussion #1465).
 *
 * A row of editing buttons pinned above the on-screen keyboard while the body
 * of a note is being edited or has text selected: slash menu, audio
 * recording, undo/redo, every formatting button of the note toolbar, lists
 * and indentation, none of which a touch keyboard can reach by shortcut. On a
 * phone the note toolbar no longer switches to its formatting buttons on a
 * selection (js/events-text-selection.js): they are all here.
 *
 * Markup: mobile_editor_bar.php. Styles: css/index-mobile.css.
 *
 * The keyboard state comes from js/events-text-selection.js, which sets
 * body.mobile-keyboard-open and the --mobile-visual-viewport-* variables the
 * CSS positions the bar with. This module only decides whether the bar shows
 * (body.mobile-editor-bar-visible) and runs the buttons that have no
 * data-action of the note toolbar to reuse.
 *
 * The Insert button opens the slash menu whatever the mobile "Command menu
 * shortcut" setting says, so a typed "/" can be turned off on a phone
 * (slash_menu_trigger_mobile, read by js/slash-command.js).
 */
(function () {
    'use strict';

    var bar = null;

    function isMobileViewport() {
        try {
            return window.matchMedia('(max-width: 800px)').matches;
        } catch (e) {
            return window.innerWidth <= 800;
        }
    }

    function getCodeMirrorApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    // The note body holding the focus: a CodeMirror host, or the contenteditable
    // of an HTML note. Titles, tags and task inputs get no bar.
    function getActiveNoteEditor() {
        var active = document.activeElement;
        if (active && active.closest) {
            var markdownEditor = active.closest('.markdown-editor');
            if (markdownEditor) return markdownEditor;

            if (active.isContentEditable && active.closest('.noteentry')) return active;
        }

        // Text selected with the keyboard closed (a long press closes it on
        // many phones): the note holding the selection
        if (!document.body.classList.contains('mobile-formatting-toolbar-active')) return null;
        var selection = window.getSelection ? window.getSelection() : null;
        var node = selection && selection.rangeCount > 0 ? selection.anchorNode : null;
        var element = node && node.nodeType === 3 ? node.parentElement : node;
        if (!element || !element.closest) return null;
        var selectionMarkdown = element.closest('.markdown-editor');
        if (selectionMarkdown) return selectionMarkdown;
        var selectionEditable = element.closest('.noteentry [contenteditable="true"], .noteentry[contenteditable="true"]');
        return selectionEditable || null;
    }

    // The formatting buttons of the bar are those of the note toolbar, which
    // the server renders for the note type (note_display.php): a button whose
    // twin is not in the toolbar of the note being edited is left out. With
    // text selected, the rule set by js/events-text-selection.js leaves out
    // the ones the selection does not take (code block, whole list items,
    // checkboxes), as the classic toolbar does.
    var selectionRule = null;

    window.setMobileEditorBarSelectionRule = function (rule) {
        selectionRule = typeof rule === 'function' ? rule : null;
        syncButtons();
    };

    function syncButtons() {
        if (!bar) return;
        var editor = getActiveNoteEditor();
        var noteCard = editor && editor.closest ? editor.closest('.notecard') : null;
        var toolbar = noteCard ? noteCard.querySelector('.note-edit-toolbar') : null;
        if (!toolbar) return;

        bar.querySelectorAll('.mobile-editor-bar-btn[data-action]:not([data-mobile-bar-action])').forEach(function (button) {
            var twin = toolbar.querySelector('.text-format-btn[data-action="' + button.getAttribute('data-action') + '"]');
            var available = !!twin && (!selectionRule || selectionRule(twin));
            button.classList.toggle('mobile-editor-bar-unavailable', !available);
        });

        // A separator only between two groups that still have a button
        var scroll = bar.querySelector('.mobile-editor-bar-scroll');
        var items = scroll ? Array.prototype.slice.call(scroll.children) : [];
        var shownBefore = false;
        var pendingSeparator = null;
        items.forEach(function (item) {
            if (item.classList.contains('mobile-editor-bar-sep')) {
                item.classList.add('is-redundant');
                if (shownBefore) pendingSeparator = item;
                return;
            }
            if (getComputedStyle(item).display === 'none') return;
            if (pendingSeparator) {
                pendingSeparator.classList.remove('is-redundant');
                pendingSeparator = null;
            }
            shownBefore = true;
        });
    }

    function isCodeMirrorEditor(editor) {
        var api = getCodeMirrorApi();
        return !!(api && editor && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(editor));
    }

    // A dialog over the note (dictation, audio recorder, ...) is not a place
    // to edit the note: the bar would sit on top of it.
    function isDialogOpen() {
        var modals = document.querySelectorAll('.modal');
        for (var i = 0; i < modals.length; i++) {
            if (modals[i].getClientRects().length > 0) return true;
        }
        return false;
    }

    function syncVisibility() {
        if (!bar || !document.body) return;

        // Up while typing, and while text is selected in the note: the bar
        // holds the formatting buttons on a phone (the note toolbar keeps its
        // actions, js/events-text-selection.js)
        var editor = getActiveNoteEditor();
        var visible = isMobileViewport()
            && (document.body.classList.contains('mobile-keyboard-open')
                || document.body.classList.contains('mobile-formatting-toolbar-active'))
            && !!editor
            && !isDialogOpen();

        if (visible) syncButtons();

        if (visible === document.body.classList.contains('mobile-editor-bar-visible')) return;
        document.body.classList.toggle('mobile-editor-bar-visible', visible);

        // The pane just lost (or got back) the height of the bar: keep the
        // caret out from under it.
        if (visible) revealCaret();
    }

    function revealCaret() {
        setTimeout(function () {
            if (!document.body.classList.contains('mobile-editor-bar-visible')) return;

            var selection = window.getSelection ? window.getSelection() : null;
            if (!selection || selection.rangeCount === 0) return;

            var rect = selection.getRangeAt(0).getBoundingClientRect();
            var barRect = bar.getBoundingClientRect();
            if (!rect || (!rect.height && !rect.top) || !barRect.height) return;

            var overlap = rect.bottom - (barRect.top - 8);
            var scroller = document.getElementById('right_col');
            if (overlap > 0 && scroller) scroller.scrollTop += overlap;
        }, 60);
    }

    function runHistory(editor, isRedo) {
        if (isCodeMirrorEditor(editor)) {
            var api = getCodeMirrorApi();
            var command = isRedo ? api.redo : api.undo;
            if (typeof command === 'function') command(editor);
            return;
        }
        document.execCommand(isRedo ? 'redo' : 'undo');
    }

    function runIndent(editor, less) {
        if (isCodeMirrorEditor(editor)) {
            var api = getCodeMirrorApi();
            if (typeof api.indent === 'function') api.indent(editor, less);
            return;
        }

        // Outside a list Tab inserts spaces whatever the Shift state, which is
        // not what an outdent button is expected to do.
        if (less) {
            var selection = window.getSelection ? window.getSelection() : null;
            var node = selection && selection.anchorNode;
            var element = node && node.nodeType === 3 ? node.parentElement : node;
            if (!element || !element.closest || !element.closest('li, .checklist-text')) return;
        }

        // Lists, checklists and plain text each own a Tab handler listening for
        // the key (bulletlist.js, checklist.js, events-rte-notes.js): send them
        // the key the touch keyboard does not have.
        editor.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Tab',
            code: 'Tab',
            keyCode: 9,
            which: 9,
            shiftKey: !!less,
            bubbles: true,
            cancelable: true
        }));
    }

    function hideKeyboard() {
        var active = document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
    }

    // The note the bar edits, for the actions that name it (search and replace)
    function getActiveNoteId() {
        var editor = getActiveNoteEditor();
        var noteCard = editor && editor.closest ? editor.closest('.notecard') : null;
        var match = noteCard && noteCard.id ? noteCard.id.match(/^note(\d+)$/) : null;
        return match ? match[1] : '';
    }

    // A popup opened from the bar (colour, title, alignment) goes above it,
    // not under the button where the keyboard is. Called by the popups once
    // they are placed (js/toolbar-popups.js, js/toolbar-format.js).
    window.placePopupAboveMobileEditorBar = function (popup, trigger) {
        if (!popup || !trigger || !trigger.closest || !bar || !bar.contains(trigger)) return false;

        var margin = 8;
        var viewport = window.visualViewport;
        var viewportTop = viewport ? viewport.offsetTop : 0;
        var viewportLeft = viewport ? viewport.offsetLeft : 0;
        var viewportWidth = viewport ? viewport.width : window.innerWidth;
        var barTop = bar.getBoundingClientRect().top;
        var buttonRect = trigger.getBoundingClientRect();
        var popupRect = popup.getBoundingClientRect();

        var room = Math.max(0, barTop - margin - (viewportTop + margin));
        if (popupRect.height > room) {
            popup.style.maxHeight = room + 'px';
            popup.style.overflowY = 'auto';
        }
        var height = Math.min(popupRect.height, room);
        var left = buttonRect.left + (buttonRect.width / 2) - (popupRect.width / 2);
        left = Math.max(viewportLeft + margin, Math.min(left, viewportLeft + viewportWidth - popupRect.width - margin));

        popup.style.position = 'fixed';
        popup.style.top = Math.round(barTop - margin - height) + 'px';
        popup.style.left = Math.round(left) + 'px';
        popup.style.setProperty('--caret-x', Math.max(8, Math.min(buttonRect.left + (buttonRect.width / 2) - left, popupRect.width - 8)) + 'px');
        return true;
    };

    function handleClick(e) {
        // Before the document handler reads it (js/index-events.js)
        var noteButton = e.target.closest ? e.target.closest('[data-mobile-bar-note-id]') : null;
        if (noteButton && bar.contains(noteButton)) {
            noteButton.setAttribute('data-note-id', getActiveNoteId());
            return;
        }

        var button = e.target.closest ? e.target.closest('[data-mobile-bar-action]') : null;
        if (!button || !bar.contains(button)) return;

        var editor = getActiveNoteEditor();
        var action = button.getAttribute('data-mobile-bar-action');

        if (action === 'hide-keyboard') {
            hideKeyboard();
            return;
        }
        if (action === 'customize') {
            // The button also carries data-action="toggle-ui-customization-panel"
            // and data-ui-section, which js/ui-customization-panel.js reads once
            // this click reaches the document. The panel covers the page on a
            // phone: close the keyboard and drop the bar first.
            hideKeyboard();
            syncVisibility();
            return;
        }
        if (!editor) return;

        switch (action) {
            case 'slash-menu':
                if (typeof window.openSlashMenuAtCaret === 'function') {
                    window.openSlashMenuAtCaret(document.activeElement);
                }
                break;
            case 'record-audio':
                // js/speech-to-text.js reads the caret, then closes the keyboard
                // for the dialog and keeps it closed when the result goes in
                if (typeof window.openAudioRecorder === 'function') window.openAudioRecorder();
                // Gone at once, not after the keyboard has finished closing
                syncVisibility();
                break;
            case 'undo':
                runHistory(editor, false);
                break;
            case 'redo':
                runHistory(editor, true);
                break;
            case 'indent':
                runIndent(editor, false);
                break;
            case 'outdent':
                runIndent(editor, true);
                break;
        }
    }

    function init() {
        bar = document.getElementById('mobileEditorBar');
        if (!bar) return;

        // A tap must not take the focus away from the note: the keyboard would
        // close and the caret the buttons act on would be lost.
        bar.addEventListener('mousedown', function (e) {
            e.preventDefault();
        });
        bar.addEventListener('click', handleClick);

        new MutationObserver(syncVisibility).observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
        document.addEventListener('focusin', syncVisibility);
        document.addEventListener('focusout', function () {
            setTimeout(syncVisibility, 150);
        });
        window.addEventListener('resize', syncVisibility);

        syncVisibility();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

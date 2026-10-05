/**
 * Global keyboard shortcuts
 * - Ctrl+S / Cmd+S: save the current note
 * - Ctrl+Alt+S / Cmd+Alt+S: take a snapshot of the current note
 * - Ctrl+Shift+F / Cmd+Shift+F: open the note's search and replace bar
 *   (plain Ctrl+F / Cmd+F does the same from the Markdown editor)
 * - Alt+ArrowUp / Alt+ArrowDown: switch between notes in the current folder
 * - Ctrl+ArrowUp / Ctrl+ArrowDown: scroll the note without moving the caret
 * All are always on; the former opt-in settings were removed.
 */

(function () {
    'use strict';

    var isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

    function isTextEditingContext(target) {
        return !!(target && target.closest &&
            target.closest('input, textarea, select, [contenteditable="true"], .CodeMirror, .cm-editor'));
    }

    function isMarkdownEditorTarget(target) {
        return !!(target && target.closest && target.closest('.markdown-editor .cm-editor'));
    }

    function getVisibleNoteLinks() {
        var allNotes = Array.from(document.querySelectorAll('[data-action="load-note"]'));
        var seen = new Map();
        allNotes.forEach(function (el) {
            var id = el.getAttribute('data-note-id');
            if (!id) return;
            var hidden = el.classList.contains('search-hidden') || !!el.closest('.search-hidden') ||
                (el.offsetWidth === 0 && el.offsetHeight === 0);
            if (!seen.has(id) || (!hidden && seen.get(id).hidden)) {
                seen.set(id, { el: el, hidden: hidden });
            }
        });
        return Array.from(seen.values()).filter(function (entry) { return !entry.hidden; }).map(function (entry) { return entry.el; });
    }

    function navigateToSiblingNote(direction) {
        var notes = getVisibleNoteLinks();
        if (!notes.length) return;

        var currentEl = document.querySelector('.selected-note[data-action="load-note"]');
        var currentId = currentEl ? currentEl.getAttribute('data-note-id') : null;

        // Stay within the current note's folder
        if (currentEl) {
            var folderId = currentEl.getAttribute('data-folder-id') || '';
            notes = notes.filter(function (el) {
                return (el.getAttribute('data-folder-id') || '') === folderId;
            });
        }
        if (!notes.length) return;

        var currentIndex = notes.findIndex(function (el) { return el.getAttribute('data-note-id') === currentId; });
        var target;
        if (currentIndex === -1) {
            target = direction > 0 ? notes[0] : notes[notes.length - 1];
        } else {
            target = notes[(currentIndex + direction + notes.length) % notes.length];
        }
        if (target) {
            target.click();
        }
    }

    // One press of Ctrl+ArrowUp/ArrowDown, the distance of a browser's own arrow key
    var NOTE_SCROLL_STEP_PX = 40;

    // The element that scrolls the open note: #right_col, or in the Markdown
    // split view the pane the key was pressed in (the editor's by default)
    function getNoteScrollElement(target) {
        var noteEntry = document.querySelector('#right_col .noteentry');
        if (noteEntry && noteEntry.classList.contains('markdown-split-mode')) {
            var preview = noteEntry.querySelector('.markdown-preview');
            if (preview && target && target.closest && target.closest('.markdown-preview') === preview) {
                return preview;
            }
            var editorEl = noteEntry.querySelector('.markdown-editor');
            return (editorEl && editorEl.querySelector('.cm-scroller')) || editorEl || preview;
        }
        return document.getElementById('right_col');
    }

    function scrollNoteByStep(target, direction) {
        var scroller = getNoteScrollElement(target);
        if (!scroller) return false;
        scroller.scrollTop += direction * NOTE_SCROLL_STEP_PX;
        return true;
    }

    var savedToastTimeoutId = null;

    function showSavedToast() {
        var existing = document.querySelector('.save-notification[data-ctrl-s-toast]');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        if (savedToastTimeoutId) {
            clearTimeout(savedToastTimeoutId);
        }

        var notification = document.createElement('div');
        notification.className = 'save-notification';
        notification.setAttribute('data-ctrl-s-toast', 'true');
        notification.innerHTML =
            '<div class="save-notification-inner">' +
                '<div class="save-notification-check">✓</div>' +
                '<span></span>' +
            '</div>';
        notification.querySelector('span').textContent =
            (typeof window.t === 'function') ? window.t('autosave.notification.saved', null, 'Saved!') : 'Saved!';

        (window.poznoteToastStack ? window.poznoteToastStack() : document.body).appendChild(notification);
        savedToastTimeoutId = setTimeout(function () {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 1500);
    }

    // Also shown by the toolbar's save button (js/index-events.js)
    window.showSavedToast = showSavedToast;

    function handleShortcutKeydown(e) {
        if (e.defaultPrevented) return;
        // The Latin letter even on a Cyrillic or Greek layout (js/shortcut-key.js)
        var key = window.poznoteShortcutKey ? window.poznoteShortcutKey(e) : (e.key || '').toLowerCase();

        // Ctrl+Alt+S / Cmd+Alt+S takes a snapshot of the current note. Keyed on
        // e.key so a layout where AltGr+S types a letter (Polish "ś") is left
        // alone; on a Mac, Option+S reports "ß", hence the physical key check.
        if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey
            && (key === 's' || (e.metaKey && e.code === 'KeyS'))) {
            if (typeof window.takeSnapshotShortcut !== 'function') return;
            if (window.takeSnapshotShortcut()) {
                e.preventDefault();
            }
            return;
        }

        // Ctrl+S / Cmd+S saves the current note (Ctrl+Shift+S stays strikethrough)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 's') {
            e.preventDefault();
            if (typeof window.saveNoteImmediately === 'function') {
                // The toast only once the server confirmed the save
                window.saveNoteImmediately({ onSaved: showSavedToast });
            }
            return;
        }

        // Ctrl+Shift+F / Cmd+Shift+F opens the note's search and replace bar
        // (#1548). Ctrl+F stays the browser's own find, except with the caret
        // in the Markdown editor: CodeMirror only keeps the lines around the
        // viewport in the DOM, so the browser finds nothing further down a
        // long note (#1549). Ctrl+F again from the bar reaches the browser's.
        if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'f'
            && (e.shiftKey || isMarkdownEditorTarget(e.target))) {
            if (typeof window.openSearchReplaceShortcut !== 'function') return;
            if (window.openSearchReplaceShortcut()) {
                e.preventDefault();
            }
            return;
        }

        // Alt+ArrowUp/ArrowDown navigates to the previous/next note in the current folder
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            // On macOS, Option+Arrow is native text navigation inside editable fields
            if (isMacPlatform && isTextEditingContext(e.target)) return;
            e.preventDefault();
            navigateToSiblingNote(e.key === 'ArrowDown' ? 1 : -1);
            return;
        }

        // Ctrl+ArrowUp/ArrowDown scrolls the note and leaves the caret where
        // it is (discussion 1564). Ctrl on a Mac too: Cmd+Arrow jumps to the
        // start or the end of the text there.
        if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            // A field outside the note, a menu or a window keeps its own keys
            if (e.target && e.target.closest) {
                if (e.target.closest('textarea, select, .modal, [role="dialog"], [role="menu"]')) return;
                if (e.target.closest('input') && !e.target.closest('#right_col')) return;
            }
            if (scrollNoteByStep(e.target, e.key === 'ArrowDown' ? 1 : -1)) {
                e.preventDefault();
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('keydown', handleShortcutKeydown);
    });
})();

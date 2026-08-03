/**
 * Global keyboard shortcuts
 * - Ctrl+S / Cmd+S: save the current note (setting: ctrl_s_save_enabled)
 * - Alt+ArrowUp / Alt+ArrowDown: switch between notes in the current folder (setting: note_nav_shortcuts_enabled)
 */

(function () {
    'use strict';

    function isShortcutSettingEnabled(key) {
        try {
            if (typeof window.getPoznoteInitialSetting === 'function') {
                var value = window.getPoznoteInitialSetting(key);
                return value === '1' || value === 'true' || value === true;
            }
        } catch (e) { }
        return false;
    }

    var isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

    function isTextEditingContext(target) {
        return !!(target && target.closest &&
            target.closest('input, textarea, select, [contenteditable="true"], .CodeMirror, .cm-editor'));
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

        document.body.appendChild(notification);
        savedToastTimeoutId = setTimeout(function () {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 1500);
    }

    function handleShortcutKeydown(e) {
        if (e.defaultPrevented) return;

        // Ctrl+S / Cmd+S saves the current note (Ctrl+Shift+S stays strikethrough)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key && e.key.toLowerCase() === 's') {
            if (!isShortcutSettingEnabled('ctrl_s_save_enabled')) return;
            e.preventDefault();
            if (typeof window.saveNoteImmediately === 'function') {
                window.saveNoteImmediately();
                showSavedToast();
            }
            return;
        }

        // Alt+ArrowUp/ArrowDown navigates to the previous/next note in the current folder
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
            (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            if (!isShortcutSettingEnabled('note_nav_shortcuts_enabled')) return;
            // On macOS, Option+Arrow is native text navigation inside editable fields
            if (isMacPlatform && isTextEditingContext(e.target)) return;
            e.preventDefault();
            navigateToSiblingNote(e.key === 'ArrowDown' ? 1 : -1);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('keydown', handleShortcutKeydown);
    });
})();

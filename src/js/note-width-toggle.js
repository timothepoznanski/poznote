/**
 * Note content width toggle (index page toolbar).
 *
 * Cycles the opened note through a few width presets, as percentages of the
 * note column, and stores the choice on that note only
 * (entries.content_width). This overrides the global center_note_content
 * setting from settings.php for this note. One step of the ring is
 * "default": the override is cleared and the note follows the global
 * setting again.
 */
(function () {
    'use strict';

    // Ring of states: null = follow the global setting, 100 = full width.
    var WIDTH_RING = [null, 50, 60, 70, 85, 100];
    var FULL_WIDTH = 100;
    var TOAST_DURATION = 1200;
    var SAVE_DEBOUNCE = 400;

    var saveTimeout = null;
    var toastTimeout = null;

    function getNoteCard(noteId) {
        return document.getElementById('note' + noteId);
    }

    // Width the global setting renders (settings.php). `percent` is null for
    // a legacy pixel value, which no step of the ring can equal.
    function readGlobalWidth() {
        if (!document.body || !document.body.classList.contains('center-note-content')) {
            return { percent: FULL_WIDTH, label: pxOrPercentLabel(FULL_WIDTH, '%') };
        }

        var raw = window.getComputedStyle(document.documentElement).getPropertyValue('--note-max-width').trim();
        var match = /^(\d+(?:\.\d+)?)(%|px)$/.exec(raw);
        if (!match) {
            return { percent: FULL_WIDTH, label: pxOrPercentLabel(FULL_WIDTH, '%') };
        }

        var value = Math.round(parseFloat(match[1]));
        return {
            percent: match[2] === '%' ? value : null,
            label: pxOrPercentLabel(value, match[2])
        };
    }

    // Override stored on the note card; null when the note has none.
    function readNoteOverride(card) {
        if (!card || !card.hasAttribute('data-content-width')) {
            return null;
        }

        var parsed = parseInt(card.getAttribute('data-content-width'), 10);

        return isNaN(parsed) ? null : Math.min(FULL_WIDTH, Math.max(10, parsed));
    }

    // Next state on the ring. A step that renders exactly like the global
    // setting is skipped: "default" already covers that look. A custom value
    // set through the API resumes at the first wider step.
    function nextOverride(current, globalPercent) {
        var index = WIDTH_RING.indexOf(current);

        if (index === -1) {
            index = WIDTH_RING.length - 1;
            for (var i = 1; i < WIDTH_RING.length; i++) {
                if (WIDTH_RING[i] > current) {
                    index = i - 1;
                    break;
                }
            }
        }

        var next = WIDTH_RING[(index + 1) % WIDTH_RING.length];
        if (next !== null && next === globalPercent) {
            next = WIDTH_RING[(index + 2) % WIDTH_RING.length];
        }

        return next;
    }

    function pxOrPercentLabel(value, unit) {
        if (unit === '%' && value >= FULL_WIDTH) {
            return (typeof window.t === 'function')
                ? window.t('modals.note_width.full_width', null, 'Full width')
                : 'Full width';
        }

        return value + (unit === '%' ? ' %' : ' px');
    }

    function stateLabel(override, globalWidth) {
        if (override !== null) {
            return pxOrPercentLabel(override, '%');
        }

        return (typeof window.t === 'function')
            ? window.t('index.toolbar.note_width_default', { width: globalWidth.label }, 'Default ({{width}})')
            : 'Default (' + globalWidth.label + ')';
    }

    function updateButton(card, override, globalWidth) {
        var current = stateLabel(override, globalWidth);
        var label = (typeof window.t === 'function')
            ? window.t('index.toolbar.note_width_current', { width: current }, 'Note width: {{width}}')
            : 'Note width: ' + current;
        var buttons = card ? card.querySelectorAll('.btn-note-width') : [];

        for (var i = 0; i < buttons.length; i++) {
            buttons[i].setAttribute('title', label);
            buttons[i].setAttribute('aria-label', label);
        }
    }

    // Mirrors what note_display.php renders.
    function applyOverride(card, override) {
        if (override === null) {
            card.removeAttribute('data-content-width');
            card.style.removeProperty('--note-content-width');
            return;
        }

        card.setAttribute('data-content-width', String(override));
        card.style.setProperty('--note-content-width', override + '%');
    }

    // Short-lived label: the reflow alone does not say which step you landed on.
    function showWidthToast(text) {
        var toast = document.getElementById('note-width-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'note-width-toast';
            document.body.appendChild(toast);
        }

        toast.textContent = text;
        toast.classList.remove('note-width-toast--hidden');
        toast.classList.add('note-width-toast--visible');

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(function () {
            toast.classList.remove('note-width-toast--visible');
            toast.classList.add('note-width-toast--hidden');
        }, TOAST_DURATION);
    }

    // Debounced: cycling through several steps must not fire one PUT per click.
    function persistOverride(noteId, override) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function () {
            fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/content-width', {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content_width: override })
            }).catch(function (error) {
                console.error('Error saving note width:', error);
            });
        }, SAVE_DEBOUNCE);
    }

    function cycleNoteWidth(noteId) {
        var card = getNoteCard(noteId);
        if (!card) return;

        var globalWidth = readGlobalWidth();
        var override = nextOverride(readNoteOverride(card), globalWidth.percent);

        applyOverride(card, override);
        updateButton(card, override, globalWidth);
        showWidthToast(stateLabel(override, globalWidth));
        persistOverride(noteId, override);
    }

    window.cycleNoteWidth = cycleNoteWidth;

    function refreshButtonLabels() {
        var globalWidth = readGlobalWidth();
        var buttons = document.querySelectorAll('.btn-note-width[data-note-id]');

        for (var i = 0; i < buttons.length; i++) {
            var card = getNoteCard(buttons[i].getAttribute('data-note-id'));
            updateButton(card, readNoteOverride(card), globalWidth);
        }
    }

    document.addEventListener('DOMContentLoaded', refreshButtonLabels);
    // Translations arrive after the first paint, so relabel once they land.
    document.addEventListener('poznote:i18n:loaded', refreshButtonLabels);
})();

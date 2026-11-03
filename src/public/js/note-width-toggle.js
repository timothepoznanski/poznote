/**
 * Note content width slider ("..." menu of the floating stack,
 * ui_customization_panel.php).
 *
 * Sets the width of the opened note, as a percentage of the note column, and
 * stores it on that note only (entries.content_width). This overrides the
 * global center_note_content setting from settings.php for this note; the
 * reset button clears the override and the note follows the global setting
 * again. While the dual pane view is open the same slider moves the seam
 * between the two panes instead (js/markdown-split-resize.js).
 */
(function () {
    'use strict';

    var MIN_WIDTH = 10;
    var FULL_WIDTH = 100;
    var WIDTH_STEP = 5;
    var TOAST_DURATION = 1200;
    var SAVE_DEBOUNCE = 400;

    var saveTimeout = null;
    var toastTimeout = null;

    function getNoteCard(noteId) {
        return document.getElementById('note' + noteId);
    }

    // Width the global setting renders (settings.php). `percent` is null for
    // a legacy pixel value, which no position of the slider can equal.
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

        return isNaN(parsed) ? null : Math.min(FULL_WIDTH, Math.max(MIN_WIDTH, parsed));
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

    // What the slider shows for the note: its own width, or "Default (80 %)"
    // with the thumb on the global width while the note follows it. While the
    // dual pane view is open, where the seam is instead: the note keeps the
    // full column there, and it is the two panes that share a width.
    function sliderState(noteId) {
        var split = (typeof window.getMarkdownSplitRatioState === 'function')
            ? window.getMarkdownSplitRatioState(noteId)
            : null;
        if (split) {
            return {
                split: true,
                min: split.min,
                max: split.max,
                step: 1,
                value: Math.round(split.value),
                label: split.label,
                canReset: Math.round(split.value) !== split.defaultValue
            };
        }

        var card = getNoteCard(noteId);
        if (!card) return null;

        var globalWidth = readGlobalWidth();
        var override = readNoteOverride(card);
        var fallback = globalWidth.percent !== null ? globalWidth.percent : FULL_WIDTH;

        return {
            split: false,
            min: MIN_WIDTH,
            max: FULL_WIDTH,
            step: WIDTH_STEP,
            value: override !== null ? override : fallback,
            label: stateLabel(override, globalWidth),
            canReset: override !== null
        };
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

    // Short-lived label for js/markdown-split-resize.js, whose handle is
    // dragged on the note itself, away from any value shown.
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

    // Debounced: dragging the slider must not fire one PUT per step.
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

    function getRow() {
        return document.getElementById('edgeMenuNoteWidth');
    }

    /**
     * Point the slider at `noteId` and show where it is. Called by
     * syncNoteControls() (js/ui-customization-panel.js) when a note loads,
     * when the menu opens and when the view of the note changes.
     */
    function syncNoteWidthSlider(noteId) {
        var row = getRow();
        if (!row) return;

        row.setAttribute('data-note-id', noteId || '');
        var state = noteId ? sliderState(noteId) : null;
        if (!state) return;

        var label = row.querySelector('.page-more-menu-label');
        var input = row.querySelector('.page-more-menu-slider-input');
        var output = row.querySelector('.page-more-menu-slider-value');
        var reset = row.querySelector('.page-more-menu-slider-reset');

        if (label) {
            label.textContent = row.getAttribute(state.split ? 'data-label-split' : 'data-label') || label.textContent;
        }
        // The bounds before the value, which the browser clamps to them
        input.min = String(state.min);
        input.max = String(state.max);
        input.step = String(state.step);
        input.value = String(state.value);
        input.setAttribute('aria-valuetext', state.label);
        output.textContent = state.label;
        reset.hidden = !state.canReset;
    }

    function setNoteWidth(noteId, value) {
        if (typeof window.setMarkdownSplitRatio === 'function'
            && window.setMarkdownSplitRatio(noteId, value)) {
            return;
        }

        var card = getNoteCard(noteId);
        if (!card) return;

        applyOverride(card, value);
        persistOverride(noteId, value);
    }

    function resetNoteWidth(noteId) {
        var split = (typeof window.getMarkdownSplitRatioState === 'function')
            ? window.getMarkdownSplitRatioState(noteId)
            : null;
        if (split) {
            window.setMarkdownSplitRatio(noteId, split.defaultValue);
            return;
        }

        var card = getNoteCard(noteId);
        if (!card) return;

        applyOverride(card, null);
        persistOverride(noteId, null);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var row = getRow();
        if (!row) return;

        var input = row.querySelector('.page-more-menu-slider-input');
        var reset = row.querySelector('.page-more-menu-slider-reset');

        // The note follows the thumb as it moves
        input.addEventListener('input', function () {
            var noteId = row.getAttribute('data-note-id');
            if (!noteId) return;

            setNoteWidth(noteId, parseInt(input.value, 10));
            syncNoteWidthSlider(noteId);
        });

        reset.addEventListener('click', function () {
            var noteId = row.getAttribute('data-note-id');
            if (!noteId) return;

            resetNoteWidth(noteId);
            syncNoteWidthSlider(noteId);
            // The button hides with nothing left to reset
            input.focus();
        });
    });

    window.syncNoteWidthSlider = syncNoteWidthSlider;
    // Shared with js/markdown-split-resize.js
    window.showNoteWidthToast = showWidthToast;
})();

/**
 * Ratio of the Markdown dual pane view (discussion #1483).
 *
 * The split lays the editor and the preview out as flex items of the note
 * entry; the seam between them is --markdown-split-left, a percentage of the
 * note column (css/markdown.css). This module owns that value: a handle
 * between the panes drags it, the arrow keys nudge it, the "..." menu cycles
 * it through three presets while the split is open (js/note-width-toggle.js
 * delegates here), and the choice is remembered in this browser for every
 * note, like the width of the left column.
 *
 * It is a layout preference, not a property of the note: nothing is written to
 * the note, so a note another session holds the lock on resizes like any
 * other.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'markdownSplitLeft';
    var DEFAULT_RATIO = 50;
    var MIN_RATIO = 20;
    var MAX_RATIO = 80;
    var KEYBOARD_STEP = 2;

    // The ring the menu entry cycles, as discussion 1483 asked: halves first,
    // so one more click from either lopsided step lands back on balance.
    var PRESETS = [50, 40, 60];

    function clampRatio(value) {
        if (typeof value !== 'number' || isNaN(value)) {
            return DEFAULT_RATIO;
        }

        // Tenths: the drag reads a pixel position, and a 0.1% step is finer
        // than one pixel of any pane this view is allowed on.
        var rounded = Math.round(value * 10) / 10;
        return Math.min(MAX_RATIO, Math.max(MIN_RATIO, rounded));
    }

    function readStoredRatio() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw === null ? DEFAULT_RATIO : clampRatio(parseFloat(raw));
        } catch (e) {
            return DEFAULT_RATIO;
        }
    }

    function storeRatio(ratio) {
        try {
            localStorage.setItem(STORAGE_KEY, String(ratio));
        } catch (e) {
            // Private window or storage full: the ratio just does not outlive
            // the note that is open.
        }
    }

    // The note entry of `noteId`, only while its split view is open.
    function getSplitNoteEntry(noteId) {
        var noteEntry = document.getElementById('entry' + noteId);
        if (!noteEntry || !noteEntry.classList.contains('markdown-split-mode')) {
            return null;
        }

        return noteEntry;
    }

    function getHandle(noteEntry) {
        return noteEntry ? noteEntry.querySelector('.markdown-split-resizer') : null;
    }

    // Where the seam is now: the value this module last wrote on the note, and
    // the remembered one for a note whose split has just opened.
    function currentRatio(noteEntry) {
        var inline = parseFloat(noteEntry.style.getPropertyValue('--markdown-split-left'));
        return isNaN(inline) ? readStoredRatio() : clampRatio(inline);
    }

    function applyRatio(noteEntry, ratio) {
        noteEntry.style.setProperty('--markdown-split-left', ratio + '%');

        var handle = getHandle(noteEntry);
        if (handle) {
            handle.setAttribute('aria-valuenow', String(Math.round(ratio)));
            handle.setAttribute('aria-valuetext', ratioLabel(ratio));
        }
    }

    function commitRatio(noteEntry, ratio) {
        applyRatio(noteEntry, ratio);
        storeRatio(ratio);
    }

    // "60 % / 40 %", for the menu entry and the toast. Percentages are spaced
    // like the note width's own steps (js/note-width-toggle.js).
    function ratioLabel(ratio) {
        var left = Math.round(ratio);
        return left + ' % / ' + (100 - left) + ' %';
    }

    function handleLabel() {
        return (typeof window.t === 'function')
            ? window.t('index.toolbar.split_resize', null, 'Drag to resize the panes')
            : 'Drag to resize the panes';
    }

    // --- Drag ---------------------------------------------------------------

    var drag = null;

    // Percentages resolve against the content box, so the padding of the note
    // entry (the framed split view has some) comes off both ends: without it
    // the seam would not follow the pointer exactly.
    function measure(noteEntry) {
        var rect = noteEntry.getBoundingClientRect();
        var style = window.getComputedStyle(noteEntry);
        var padLeft = parseFloat(style.paddingLeft) || 0;
        var padRight = parseFloat(style.paddingRight) || 0;
        var inner = rect.width - padLeft - padRight;

        return inner > 0 ? { left: rect.left + padLeft, inner: inner } : null;
    }

    function onPointerDown(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') {
            return;
        }

        var handle = e.currentTarget;
        var noteEntry = handle.parentNode;
        if (!noteEntry || !noteEntry.classList.contains('markdown-split-mode')) {
            return;
        }

        var box = measure(noteEntry);
        if (!box) {
            return;
        }

        e.preventDefault();

        drag = {
            noteEntry: noteEntry,
            handle: handle,
            box: box,
            ratio: currentRatio(noteEntry),
            frame: null,
            clientX: e.clientX
        };

        handle.classList.add('is-dragging');
        document.body.classList.add('markdown-split-resizing');

        try {
            handle.setPointerCapture(e.pointerId);
        } catch (err) {
            // No capture: the document listeners below still follow the pointer.
        }

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    }

    function onPointerMove(e) {
        if (!drag) {
            return;
        }

        e.preventDefault();
        drag.clientX = e.clientX;

        // One write per frame: a pointermove fires far more often than the
        // panes can reflow, and the panes are the expensive part.
        if (drag.frame !== null) {
            return;
        }

        drag.frame = window.requestAnimationFrame(function () {
            if (!drag) {
                return;
            }

            drag.frame = null;
            drag.ratio = clampRatio(((drag.clientX - drag.box.left) / drag.box.inner) * 100);
            applyRatio(drag.noteEntry, drag.ratio);
        });
    }

    function endDrag() {
        if (!drag) {
            return;
        }

        if (drag.frame !== null) {
            window.cancelAnimationFrame(drag.frame);
        }

        drag.handle.classList.remove('is-dragging');
        document.body.classList.remove('markdown-split-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', endDrag);
        document.removeEventListener('pointercancel', endDrag);

        commitRatio(drag.noteEntry, drag.ratio);
        drag = null;
    }

    // --- Keyboard and double click ------------------------------------------

    function onKeyDown(e) {
        var noteEntry = e.currentTarget.parentNode;
        if (!noteEntry || !noteEntry.classList.contains('markdown-split-mode')) {
            return;
        }

        var ratio = currentRatio(noteEntry);
        var next = null;

        // The separator keys of the window splitter pattern, plus Enter and
        // Space for the reset the double click also does.
        if (e.key === 'ArrowLeft') {
            next = ratio - KEYBOARD_STEP;
        } else if (e.key === 'ArrowRight') {
            next = ratio + KEYBOARD_STEP;
        } else if (e.key === 'Home') {
            next = MIN_RATIO;
        } else if (e.key === 'End') {
            next = MAX_RATIO;
        } else if (e.key === 'Enter' || e.key === ' ') {
            next = DEFAULT_RATIO;
        } else {
            return;
        }

        e.preventDefault();
        commitRatio(noteEntry, clampRatio(next));
        showRatioToast(clampRatio(next));
    }

    // Back to halves, the gesture every splitter answers to.
    function onDoubleClick(e) {
        var noteEntry = e.currentTarget.parentNode;
        if (!noteEntry || !noteEntry.classList.contains('markdown-split-mode')) {
            return;
        }

        e.preventDefault();
        commitRatio(noteEntry, DEFAULT_RATIO);
        showRatioToast(DEFAULT_RATIO);
    }

    // The toast of the note width, which says the same kind of thing
    // (js/note-width-toggle.js).
    function showRatioToast(ratio) {
        if (typeof window.showNoteWidthToast === 'function') {
            window.showNoteWidthToast(ratioLabel(ratio));
        }
    }

    // --- Setup --------------------------------------------------------------

    /**
     * Put the handle between the panes and the remembered ratio on the note.
     * Called every time a split opens: initializeMarkdownNote() rebuilds the
     * note entry from scratch, so the handle of the previous note is gone.
     */
    function setupMarkdownSplitResizer(noteEntryOrId) {
        var noteEntry = (noteEntryOrId && noteEntryOrId.nodeType === 1)
            ? noteEntryOrId
            : document.getElementById('entry' + noteEntryOrId);

        if (!noteEntry) {
            return;
        }

        var previewDiv = noteEntry.querySelector('.markdown-preview');
        if (!previewDiv || previewDiv.parentNode !== noteEntry) {
            return;
        }

        var handle = getHandle(noteEntry);
        if (!handle) {
            handle = document.createElement('div');
            handle.className = 'markdown-split-resizer';
            handle.setAttribute('role', 'separator');
            handle.setAttribute('aria-orientation', 'vertical');
            handle.setAttribute('aria-valuemin', String(MIN_RATIO));
            handle.setAttribute('aria-valuemax', String(MAX_RATIO));
            handle.setAttribute('tabindex', '0');
            handle.title = handleLabel();
            handle.setAttribute('aria-label', handleLabel());
            handle.addEventListener('pointerdown', onPointerDown);
            handle.addEventListener('keydown', onKeyDown);
            handle.addEventListener('dblclick', onDoubleClick);
        }

        // Before the preview, whatever else has been appended since.
        noteEntry.insertBefore(handle, previewDiv);
        applyRatio(noteEntry, currentRatio(noteEntry));
    }

    /**
     * Next preset, for the "Note width" entry of the "..." menu while the
     * split is open (js/note-width-toggle.js). Returns false when this note is
     * not split, so the caller cycles the note width as usual.
     */
    function cycleMarkdownSplitRatio(noteId) {
        var noteEntry = getSplitNoteEntry(noteId);
        if (!noteEntry) {
            return false;
        }

        // A dragged ratio is on no step of the ring: indexOf() gives -1 and the
        // ring starts again at halves.
        var index = PRESETS.indexOf(Math.round(currentRatio(noteEntry)));
        var next = PRESETS[(index + 1) % PRESETS.length];

        commitRatio(noteEntry, next);
        showRatioToast(next);

        return true;
    }

    /**
     * The step the menu entry shows while the split is open, empty otherwise.
     */
    function describeMarkdownSplitRatio(noteId) {
        var noteEntry = getSplitNoteEntry(noteId);
        return noteEntry ? ratioLabel(currentRatio(noteEntry)) : '';
    }

    // Translations load after the handle may have been created.
    document.addEventListener('poznote:i18n:loaded', function () {
        var handles = document.querySelectorAll('.markdown-split-resizer');
        for (var i = 0; i < handles.length; i++) {
            handles[i].title = handleLabel();
            handles[i].setAttribute('aria-label', handleLabel());
        }
    });

    window.setupMarkdownSplitResizer = setupMarkdownSplitResizer;
    window.cycleMarkdownSplitRatio = cycleMarkdownSplitRatio;
    window.describeMarkdownSplitRatio = describeMarkdownSplitRatio;
})();

/**
 * "Insert Markdown" modal for HTML notes.
 *
 * The mirror of paste-markdown-modal.js: a Markdown note can take pasted
 * HTML through a converter, so an HTML note takes pasted (or typed) Markdown
 * the same way. Markdown is plain text, so a textarea is enough to capture
 * it. The source goes to /api/v1/convert-markdown, which runs the same PHP
 * parser used for whole-note conversion, so there is only one conversion
 * implementation to maintain. The HTML that comes back is previewed, then
 * inserted at the caret of the rich-text editor.
 */

(function () {
    'use strict';

    var MODAL_ID = 'insertMarkdownModal';
    // Typing converts on the fly; the delay keeps one request per pause
    // rather than one per keystroke.
    var CONVERT_DEBOUNCE_MS = 250;

    var noteIdForInsert = null;
    var convertedHtml = '';
    var conversionToken = 0;
    var convertTimer = null;

    // Caret to insert at. The modal steals focus, and clicking the toolbar
    // menu may already have collapsed the selection, so the last caret seen
    // inside an editable note is tracked continuously rather than read when
    // the modal opens.
    var lastNoteRange = null;

    function el(id) { return document.getElementById(id); }

    function translate(key, fallback) {
        return (typeof window.t === 'function') ? window.t(key, null, fallback) : fallback;
    }

    function setError(message) {
        var errorEl = el('insertMarkdownError');
        if (!errorEl) return;
        errorEl.textContent = message || '';
        errorEl.style.display = message ? 'block' : '';
    }

    function setInsertEnabled(enabled) {
        var btn = el('insertMarkdownInsertBtn');
        if (btn) btn.disabled = !enabled;
    }

    function showPreview(html) {
        var wrapper = el('insertMarkdownPreviewWrapper');
        var preview = el('insertMarkdownPreview');
        if (preview) preview.innerHTML = html;
        if (wrapper) wrapper.classList.toggle('is-hidden', !html);
    }

    function clearConversion() {
        convertedHtml = '';
        // Invalidate any conversion still in flight.
        conversionToken++;
        if (convertTimer) {
            clearTimeout(convertTimer);
            convertTimer = null;
        }
        showPreview('');
        setError('');
        setInsertEnabled(false);
    }

    function resetModal() {
        var source = el('insertMarkdownSource');
        if (source) source.value = '';
        clearConversion();
    }

    /**
     * Send the Markdown to the server and show the HTML it returns.
     */
    function convertMarkdown(markdown) {
        var token = ++conversionToken;
        setError(translate('modals.insert_markdown.converting', 'Converting...'));
        setInsertEnabled(false);

        fetch('/api/v1/convert-markdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: markdown })
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                // A newer edit replaced this one while the request was open.
                if (token !== conversionToken) return;

                if (!result.ok || !result.data || result.data.success === false) {
                    var message = (result.data && result.data.error)
                        ? result.data.error
                        : translate('modals.insert_markdown.error', 'Conversion failed. Please try again.');
                    setError(message);
                    return;
                }

                convertedHtml = String(result.data.html || '');
                setError('');
                showPreview(convertedHtml);
                setInsertEnabled(convertedHtml.trim() !== '');
            })
            .catch(function (err) {
                if (token !== conversionToken) return;
                console.error('Insert Markdown conversion error:', err);
                setError(translate('modals.insert_markdown.error', 'Conversion failed. Please try again.'));
            });
    }

    function scheduleConversion() {
        var source = el('insertMarkdownSource');
        var markdown = source ? source.value : '';

        if (convertTimer) clearTimeout(convertTimer);
        // Emptying the box must not leave a stale preview or Insert clickable.
        if (markdown.trim() === '') {
            clearConversion();
            return;
        }

        convertTimer = setTimeout(function () {
            convertTimer = null;
            convertMarkdown(markdown);
        }, CONVERT_DEBOUNCE_MS);
    }

    /**
     * Remember the caret whenever it sits inside an editable note.
     */
    function trackSelection() {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        var range = sel.getRangeAt(0);
        var container = range.commonAncestorContainer;
        var element = (container && container.nodeType === 3) ? container.parentNode : container;
        if (!element || typeof element.closest !== 'function') return;
        if (!element.closest('.noteentry[contenteditable="true"]')) return;

        lastNoteRange = range.cloneRange();
    }

    function findTargetNote() {
        var note = noteIdForInsert
            ? document.querySelector('.noteentry[data-note-id="' + noteIdForInsert + '"]')
            : null;
        if (!note) note = document.querySelector('.noteentry[data-note-type="note"][contenteditable="true"]');
        return note;
    }

    function rangeInsideNote(range, note) {
        if (!range || !note) return false;
        var container = range.commonAncestorContainer;
        if (!container || !container.isConnected) return false;
        return note.contains(container);
    }

    /**
     * Insert the converted HTML at the cursor in the note's editor.
     */
    function insertHtml() {
        var html = convertedHtml;
        if (!html) return;

        var note = findTargetNote();
        if (!note || note.getAttribute('contenteditable') !== 'true') {
            setError(translate('modals.insert_markdown.no_note', 'No note is open.'));
            return;
        }

        // Closed first so focus can go back to the note.
        closeModal();
        try { note.focus({ preventScroll: true }); } catch (e) { note.focus(); }

        // With no live caret in this note fall back to the end of the note
        // rather than silently dropping the content.
        var range = rangeInsideNote(lastNoteRange, note) ? lastNoteRange : null;
        if (!range) {
            range = document.createRange();
            range.selectNodeContents(note);
            range.collapse(false);
        }
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // execCommand keeps the insertion in the browser's undo stack and
        // fires the input event the autosave listens to, like a paste does.
        var inserted = false;
        try {
            inserted = document.execCommand('insertHTML', false, html);
        } catch (e) {
            inserted = false;
        }
        if (!inserted) {
            note.insertAdjacentHTML('beforeend', html);
            note.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (typeof window.markNoteAsModified === 'function') window.markNoteAsModified();
    }

    function closeModal() {
        if (typeof window.closeModal === 'function') {
            window.closeModal(MODAL_ID);
        } else {
            var modal = el(MODAL_ID);
            if (modal) modal.style.display = 'none';
        }
        resetModal();
    }

    /**
     * Open the modal for a note and focus the Markdown box.
     */
    function showInsertMarkdownModal(noteId) {
        var modal = el(MODAL_ID);
        if (!modal) return;

        noteIdForInsert = noteId || null;
        // The caret may not have moved since the note was focused, in which
        // case no selectionchange fired yet.
        trackSelection();
        resetModal();
        modal.style.display = 'block';

        var source = el('insertMarkdownSource');
        if (source) {
            // Focused so Ctrl+V lands in the box without an extra click.
            setTimeout(function () { source.focus(); }, 50);
        }
    }

    function setupModal() {
        var source = el('insertMarkdownSource');
        if (!source || source.dataset.initialized === 'true') return;
        source.dataset.initialized = 'true';

        source.addEventListener('input', scheduleConversion);

        // Ctrl+Enter inserts, once a conversion has come back.
        source.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            var btn = el('insertMarkdownInsertBtn');
            if (btn && !btn.disabled) insertHtml();
        });

        var insertBtn = el('insertMarkdownInsertBtn');
        if (insertBtn) insertBtn.addEventListener('click', insertHtml);

        document.addEventListener('selectionchange', trackSelection);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupModal);
    } else {
        setupModal();
    }

    window.showInsertMarkdownModal = showInsertMarkdownModal;
})();

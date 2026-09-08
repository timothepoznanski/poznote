/**
 * "Paste as Markdown" modal for Markdown notes.
 *
 * Pasting a snippet copied from a website straight into a Markdown note drops
 * every bit of formatting: the editor is plain text, so headings, links, lists
 * and tables arrive flattened. This modal gives that content somewhere to land
 * with its markup intact.
 *
 * The clipboard's text/html flavour is only readable during a real paste event
 * (navigator.clipboard.read() prompts for permission and Firefox does not
 * support it), which is why the user pastes into the modal rather than the app
 * reading the clipboard itself. The captured HTML goes to /api/v1/convert-html,
 * which runs the same PHP converter used for whole-note conversion, so there is
 * only one conversion implementation to maintain.
 */

(function () {
    'use strict';

    var MODAL_ID = 'pasteMarkdownModal';
    var noteIdForPaste = null;
    var convertedMarkdown = '';
    var conversionToken = 0;

    function el(id) { return document.getElementById(id); }

    function translate(key, fallback) {
        return (typeof window.t === 'function') ? window.t(key, null, fallback) : fallback;
    }

    function setError(message) {
        var errorEl = el('pasteMarkdownError');
        if (!errorEl) return;
        errorEl.textContent = message || '';
        errorEl.style.display = message ? 'block' : '';
    }

    function setInsertEnabled(enabled) {
        var btn = el('pasteMarkdownInsertBtn');
        if (btn) btn.disabled = !enabled;
    }

    function showPreview(markdown) {
        var wrapper = el('pasteMarkdownPreviewWrapper');
        var preview = el('pasteMarkdownPreview');
        if (preview) preview.value = markdown;
        if (wrapper) wrapper.classList.toggle('is-hidden', !markdown);
    }

    function resetModal() {
        var dropzone = el('pasteMarkdownDropzone');
        if (dropzone) dropzone.innerHTML = '';
        convertedMarkdown = '';
        // Invalidate any conversion still in flight from a previous paste.
        conversionToken++;
        showPreview('');
        setError('');
        setInsertEnabled(false);
    }

    /**
     * Send the pasted markup to the server and show the Markdown it returns.
     */
    function convertHtml(html) {
        var token = ++conversionToken;
        setError(translate('modals.paste_markdown.converting', 'Converting...'));
        setInsertEnabled(false);

        fetch('/api/v1/convert-html', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html: html })
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                // A newer paste replaced this one while the request was open.
                if (token !== conversionToken) return;

                if (!result.ok || !result.data || result.data.success === false) {
                    var message = (result.data && result.data.error)
                        ? result.data.error
                        : translate('modals.paste_markdown.error', 'Conversion failed. Please try again.');
                    setError(message);
                    return;
                }

                convertedMarkdown = String(result.data.markdown || '');
                setError('');
                showPreview(convertedMarkdown);
                setInsertEnabled(convertedMarkdown !== '');
            })
            .catch(function (err) {
                if (token !== conversionToken) return;
                console.error('Paste as Markdown conversion error:', err);
                setError(translate('modals.paste_markdown.error', 'Conversion failed. Please try again.'));
            });
    }

    /**
     * Insert the converted Markdown at the cursor in the note's editor.
     */
    function insertMarkdown() {
        // The preview is editable, so take what the user actually sees.
        var preview = el('pasteMarkdownPreview');
        var markdown = preview ? preview.value : convertedMarkdown;
        if (!markdown) return;

        var note = noteIdForPaste
            ? document.querySelector('.noteentry[data-note-id="' + noteIdForPaste + '"]')
            : null;
        if (!note) note = document.querySelector('.noteentry[data-note-type="markdown"]');
        if (!note) {
            setError(translate('modals.paste_markdown.no_note', 'No note is open.'));
            return;
        }

        var editorDiv = note.querySelector('.markdown-editor') || note;
        var api = (typeof window.PoznoteMarkdownCodeMirror !== 'undefined')
            ? window.PoznoteMarkdownCodeMirror
            : null;

        if (api && typeof api.getSelectionOffsets === 'function' && typeof api.replaceRange === 'function') {
            var offsets = api.getSelectionOffsets(editorDiv);
            // With no live cursor (the modal took focus) fall back to the end
            // of the document rather than silently dropping the paste.
            if (!offsets) {
                var length = (typeof api.getValue === 'function')
                    ? String(api.getValue(editorDiv) || '').length : 0;
                offsets = { start: length, end: length };
            }
            var from = Math.min(offsets.start, offsets.end);
            var to = Math.max(offsets.start, offsets.end);
            // replaceRange dispatches with userEvent 'input', so autosave fires.
            api.replaceRange(editorDiv, from, to, markdown);
            closeModal();
            return;
        }

        // Legacy contenteditable editor: insert as text so the Markdown source
        // stays literal instead of being parsed as HTML.
        editorDiv.focus();
        if (document.execCommand('insertText', false, markdown)) {
            if (typeof window.markNoteAsModified === 'function') window.markNoteAsModified();
            closeModal();
            return;
        }

        setError(translate('modals.paste_markdown.error', 'Conversion failed. Please try again.'));
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
     * Open the modal for a note and focus the paste area.
     */
    function showPasteMarkdownModal(noteId) {
        var modal = el(MODAL_ID);
        if (!modal) return;

        noteIdForPaste = noteId || null;
        resetModal();
        modal.style.display = 'block';

        var dropzone = el('pasteMarkdownDropzone');
        if (dropzone) {
            // Focused so Ctrl+V lands in the paste area without an extra click.
            setTimeout(function () { dropzone.focus(); }, 50);
        }
    }

    function setupModal() {
        var dropzone = el('pasteMarkdownDropzone');
        if (!dropzone || dropzone.dataset.initialized === 'true') return;
        dropzone.dataset.initialized = 'true';

        dropzone.addEventListener('paste', function (e) {
            if (!e.clipboardData) return;

            var html = e.clipboardData.getData('text/html');
            var plain = e.clipboardData.getData('text/plain');

            // Always take over: letting the browser drop rich markup into the
            // dropzone would leave styling that the converter never sees.
            e.preventDefault();

            if (html && html.trim() !== '') {
                // Show the pasted content so the user sees what was captured.
                dropzone.innerHTML = html;
                convertHtml(html);
                return;
            }

            if (plain && plain.trim() !== '') {
                // No markup to convert: plain text is already valid Markdown.
                dropzone.textContent = plain;
                convertedMarkdown = plain;
                showPreview(plain);
                setError('');
                setInsertEnabled(true);
                return;
            }

            setError(translate('modals.paste_markdown.empty', 'The clipboard is empty.'));
        });

        var insertBtn = el('pasteMarkdownInsertBtn');
        if (insertBtn) insertBtn.addEventListener('click', insertMarkdown);

        var preview = el('pasteMarkdownPreview');
        if (preview) {
            // Editing the preview to nothing must not leave Insert clickable.
            preview.addEventListener('input', function () {
                setInsertEnabled(preview.value.trim() !== '');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupModal);
    } else {
        setupModal();
    }

    window.showPasteMarkdownModal = showPasteMarkdownModal;
})();

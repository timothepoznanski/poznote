/**
 * Public Note Editing
 * Lets visitors edit the text of a publicly shared HTML/markdown note when the
 * share's access mode is 'edit'. Loaded only on editable shares.
 * CSP-compliant external script.
 */
(function () {
    'use strict';

    function getPublicConfig() {
        const configElement = document.getElementById('public-note-config');
        if (!configElement) return null;
        try {
            return JSON.parse(configElement.textContent);
        } catch (err) {
            console.error('Failed to parse config', err);
            return null;
        }
    }

    const config = getPublicConfig();
    if (!config || !config.noteEditable || typeof config.editableContent !== 'string') return;

    const contentDiv = document.querySelector('.public-note .content');
    const editBtn = document.getElementById('publicEditToggle');
    const saveBtn = document.getElementById('publicEditSave');
    const cancelBtn = document.getElementById('publicEditCancel');
    if (!contentDiv || !editBtn || !saveBtn || !cancelBtn) return;

    const isMarkdown = config.noteType === 'markdown';
    let editorEl = null;
    let editing = false;
    let saving = false;

    function i18n(key, fallback) {
        return (config.i18n && config.i18n[key]) ? config.i18n[key] : fallback;
    }

    function getEditorValue() {
        if (!editorEl) return '';
        return isMarkdown ? editorEl.value : editorEl.innerHTML;
    }

    function isDirty() {
        return editing && getEditorValue() !== config.editableContent;
    }

    function buildEditor() {
        if (editorEl) return editorEl;

        if (isMarkdown) {
            editorEl = document.createElement('textarea');
            editorEl.className = 'public-note-editor public-note-editor-markdown';
            editorEl.value = config.editableContent;
            editorEl.setAttribute('spellcheck', 'false');
        } else {
            editorEl = document.createElement('div');
            editorEl.className = 'public-note-editor public-note-editor-html content';
            // Server-sanitized HTML (sanitizePublicNoteHtml) - safe to inject.
            editorEl.innerHTML = config.editableContent;
            editorEl.setAttribute('contenteditable', 'true');
        }

        contentDiv.parentNode.insertBefore(editorEl, contentDiv.nextSibling);
        return editorEl;
    }

    function enterEdit() {
        if (editing) return;
        editing = true;
        buildEditor();
        contentDiv.hidden = true;
        editorEl.hidden = false;
        editBtn.hidden = true;
        saveBtn.hidden = false;
        cancelBtn.hidden = false;
        editorEl.focus();
    }

    function exitEdit() {
        editing = false;
        if (editorEl) {
            editorEl.hidden = true;
            // Reset discarded changes so re-entering edit mode starts clean.
            if (isMarkdown) {
                editorEl.value = config.editableContent;
            } else {
                editorEl.innerHTML = config.editableContent;
            }
        }
        contentDiv.hidden = false;
        editBtn.hidden = false;
        saveBtn.hidden = true;
        cancelBtn.hidden = true;
    }

    function cancelEdit() {
        if (saving) return;
        if (!isDirty()) {
            exitEdit();
            return;
        }
        const message = i18n('discardConfirm', 'Discard your changes?');
        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(message, i18n('confirm', 'Confirm')).then(function (confirmed) {
                if (confirmed) exitEdit();
            });
        } else if (window.confirm(message)) {
            exitEdit();
        }
    }

    function save() {
        if (!editing || saving) return;
        saving = true;
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        saveBtn.classList.add('is-saving');

        const apiBaseUrl = config.apiBaseUrl || 'api/v1';
        fetch(`${apiBaseUrl}/public/notes/content?token=${encodeURIComponent(config.token)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: getEditorValue() })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reload so the server re-renders the sanitized content
                    // (markdown parsing, attachment URLs, math, mermaid, ...).
                    editing = false; // disarm the beforeunload guard
                    location.reload();
                } else {
                    throw new Error(data.error || 'Unknown error');
                }
            })
            .catch(err => {
                console.error('Failed to save note', err);
                saving = false;
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
                saveBtn.classList.remove('is-saving');
                const message = i18n('saveFailed', 'Failed to save changes') + ': ' + err.message;
                if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
                    window.modalAlert.alert(message);
                } else {
                    alert(message);
                }
            });
    }

    editBtn.addEventListener('click', enterEdit);
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancelEdit);

    document.addEventListener('keydown', function (e) {
        if (!editing) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save();
        } else if (e.key === 'Escape' && editorEl && document.activeElement === editorEl) {
            cancelEdit();
        }
    });

    window.addEventListener('beforeunload', function (e) {
        if (isDirty() && !saving) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
})();

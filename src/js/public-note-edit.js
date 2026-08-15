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
    const LOCK_HEARTBEAT_INTERVAL_MS = 20000;
    const LOCK_SESSION_STORAGE_KEY = 'poznote_public_editor_session_id';
    let editorEl = null;
    let editing = false;
    let saving = false;
    let acquiringLock = false;
    let lockHeartbeatTimer = null;
    let lockLostWarned = false;

    function i18n(key, fallback) {
        return (config.i18n && config.i18n[key]) ? config.i18n[key] : fallback;
    }

    function showAlert(message) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message);
        } else {
            alert(message);
        }
    }

    // Per-tab identifier of this editor, mirroring the in-app edit lock: two
    // tabs (or two visitors) are two competing editors.
    function getEditorSessionId() {
        try {
            const existing = sessionStorage.getItem(LOCK_SESSION_STORAGE_KEY);
            if (existing) return existing;
            const created = 'public-editor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem(LOCK_SESSION_STORAGE_KEY, created);
            return created;
        } catch (err) {
            if (!window.__poznotePublicEditorSessionId) {
                window.__poznotePublicEditorSessionId = 'public-editor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            }
            return window.__poznotePublicEditorSessionId;
        }
    }

    function postLock(action, keepalive) {
        const apiBaseUrl = config.apiBaseUrl || 'api/v1';
        const suffix = action ? '/' + action : '';
        return fetch(`${apiBaseUrl}/public/notes/lock${suffix}?token=${encodeURIComponent(config.token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ editor_session_id: getEditorSessionId() }),
            keepalive: !!keepalive
        });
    }

    function stopLockHeartbeat() {
        if (lockHeartbeatTimer) {
            clearInterval(lockHeartbeatTimer);
            lockHeartbeatTimer = null;
        }
    }

    function startLockHeartbeat() {
        stopLockHeartbeat();
        lockHeartbeatTimer = setInterval(function () {
            if (!editing) return;
            postLock('heartbeat').then(function (response) {
                if (response.ok) {
                    lockLostWarned = false;
                    return;
                }
                // Only possible after the lock expired (long offline period)
                // and someone else grabbed it: saving would now fail, warn once.
                if (response.status === 423 && !lockLostWarned) {
                    lockLostWarned = true;
                    showAlert(i18n('lockLost', 'Someone else is now editing this note. Your latest changes cannot be saved.'));
                }
            }).catch(function () { /* transient network error, retry next tick */ });
        }, LOCK_HEARTBEAT_INTERVAL_MS);
    }

    function releaseLock(keepalive) {
        stopLockHeartbeat();
        postLock('release', keepalive).catch(function () { /* best effort */ });
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
        if (editing || acquiringLock) return;
        acquiringLock = true;
        editBtn.disabled = true;

        // Take the note's exclusive edit lock first: only one person at a
        // time may edit, whether through this public page or inside the app.
        postLock('').then(function (response) {
            acquiringLock = false;
            editBtn.disabled = false;
            if (!response.ok) {
                showAlert(i18n('editLocked', 'Someone else is currently editing this note. Please try again later.'));
                return;
            }

            editing = true;
            lockLostWarned = false;
            buildEditor();
            contentDiv.hidden = true;
            editorEl.hidden = false;
            editBtn.hidden = true;
            saveBtn.hidden = false;
            cancelBtn.hidden = false;
            editorEl.focus();
            startLockHeartbeat();
        }).catch(function () {
            acquiringLock = false;
            editBtn.disabled = false;
            showAlert(i18n('editLocked', 'Someone else is currently editing this note. Please try again later.'));
        });
    }

    function exitEdit() {
        if (editing) {
            releaseLock(false);
        }
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
            body: JSON.stringify({ content: getEditorValue(), editor_session_id: getEditorSessionId() })
        })
            .then(response => response.json().then(data => ({ status: response.status, data })))
            .then(({ status, data }) => {
                if (data.success) {
                    // Reload so the server re-renders the sanitized content
                    // (markdown parsing, attachment URLs, math, mermaid, ...).
                    editing = false; // disarm the beforeunload guard
                    releaseLock(true);
                    location.reload();
                } else if (status === 423) {
                    throw new Error(i18n('editLocked', 'Someone else is currently editing this note. Please try again later.'));
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

    // Free the lock as soon as the tab actually goes away; otherwise the
    // note would stay locked for other editors until the lock expires.
    window.addEventListener('pagehide', function () {
        if (editing) {
            releaseLock(true);
        }
    });
})();

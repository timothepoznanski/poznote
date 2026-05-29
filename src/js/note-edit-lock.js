(function () {
    var HEARTBEAT_INTERVAL_MS = 20000;
    var SESSION_STORAGE_KEY = 'poznote_editor_session_id';
    var activeNoteId = null;
    var heartbeatTimer = null;
    var acquireRequestId = 0;
    var noteStates = Object.create(null);

    function ensureStyles() {
        if (document.getElementById('note-edit-lock-styles')) {
            return;
        }

        var style = document.createElement('style');
        style.id = 'note-edit-lock-styles';
        style.textContent = [
            '.note-edit-lock-banner {',
            '    margin: 12px 0;',
            '    padding: 10px 14px;',
            '    border: 1px solid rgba(180, 122, 0, 0.28);',
            '    border-radius: 10px;',
            '    background: #fff6dd;',
            '    color: #7a5a00;',
            '    font-size: 14px;',
            '    line-height: 1.45;',
            '}',
            '.note-lock-disabled {',
            '    opacity: 0.45;',
            '    pointer-events: none !important;',
            '}',
            '.note-lock-readonly {',
            '    cursor: not-allowed;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    function t(key, vars, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, vars || {}, fallback);
        }

        var text = fallback || key;
        Object.keys(vars || {}).forEach(function (name) {
            text = text.split('{{' + name + '}}').join(vars[name]);
        });
        return text;
    }

    function normalizeNoteId(noteId) {
        if (noteId === null || noteId === undefined) {
            return '';
        }

        noteId = String(noteId).trim();
        if (!noteId || noteId === 'search' || noteId === '-1') {
            return '';
        }

        return noteId;
    }

    function getCurrentDomNoteId() {
        var entry = document.querySelector('.noteentry[data-note-id]');
        return entry ? normalizeNoteId(entry.getAttribute('data-note-id')) : '';
    }

    function getEditorSessionId() {
        try {
            var existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (existing) {
                return existing;
            }

            var created = 'editor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem(SESSION_STORAGE_KEY, created);
            return created;
        } catch (e) {
            if (!window.__poznoteFallbackEditorSessionId) {
                window.__poznoteFallbackEditorSessionId = 'editor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            }
            return window.__poznoteFallbackEditorSessionId;
        }
    }

    function isReadonlyWorkspace() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    function parseResponse(response) {
        return response.json().catch(function () {
            return {};
        }).then(function (data) {
            return {
                ok: response.ok,
                status: response.status,
                data: data || {}
            };
        });
    }

    function postJson(url, payload, keepalive) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload || {}),
            keepalive: !!keepalive
        });
    }

    function setTemporarilyDisabled(element, disabled) {
        if (!element) {
            return;
        }

        if (!element.dataset.noteLockManaged) {
            element.dataset.noteLockManaged = '1';
            if ('disabled' in element) {
                element.dataset.noteLockPrevDisabled = element.disabled ? '1' : '0';
            }
            element.dataset.noteLockPrevPointerEvents = element.style.pointerEvents || '';
            element.dataset.noteLockPrevOpacity = element.style.opacity || '';
        }

        if ('disabled' in element) {
            element.disabled = !!disabled;
        }

        if (disabled) {
            element.style.pointerEvents = 'none';
            element.style.opacity = '0.45';
            element.classList.add('note-lock-disabled');
            element.setAttribute('aria-disabled', 'true');
        } else {
            if (element.dataset.noteLockPrevDisabled !== '1' && 'disabled' in element) {
                element.disabled = false;
            }
            element.style.pointerEvents = element.dataset.noteLockPrevPointerEvents || '';
            element.style.opacity = element.dataset.noteLockPrevOpacity || '';
            element.classList.remove('note-lock-disabled');
            element.removeAttribute('aria-disabled');
            delete element.dataset.noteLockManaged;
            delete element.dataset.noteLockPrevDisabled;
            delete element.dataset.noteLockPrevPointerEvents;
            delete element.dataset.noteLockPrevOpacity;
        }
    }

    function setContentEditableState(element, editable) {
        if (!element) {
            return;
        }

        if (editable) {
            var previous = element.dataset.noteLockPrevContenteditable;
            if (previous !== undefined) {
                if (previous === '') {
                    element.removeAttribute('contenteditable');
                } else {
                    element.setAttribute('contenteditable', previous);
                }
                delete element.dataset.noteLockPrevContenteditable;
            }
            element.classList.remove('note-lock-readonly');
            return;
        }

        if (element.dataset.noteLockPrevContenteditable === undefined) {
            element.dataset.noteLockPrevContenteditable = element.getAttribute('contenteditable') || '';
        }
        element.setAttribute('contenteditable', 'false');
        element.classList.add('note-lock-readonly');
    }

    function updateToolbarState(noteCard, locked) {
        if (!noteCard) {
            return;
        }

        var allowToolbarClasses = ['btn-home', 'btn-history-nav', 'btn-download', 'btn-info', 'btn-open-new-tab', 'btn-share'];
        noteCard.querySelectorAll('.note-edit-toolbar .toolbar-btn').forEach(function (button) {
            var keepEnabled = allowToolbarClasses.some(function (className) {
                return button.classList.contains(className);
            });

            if (!keepEnabled) {
                setTemporarilyDisabled(button, locked);
            }
        });

        noteCard.querySelectorAll('.note-tags-row [data-action], .note-attachments-row [data-action="show-attachment-dialog"], .search-replace-bar input, .search-replace-bar button').forEach(function (element) {
            setTemporarilyDisabled(element, locked);
        });

        noteCard.querySelectorAll('.mobile-toolbar-menu [data-action]').forEach(function (element) {
            var selector = element.getAttribute('data-selector') || '';
            var keepEnabled = element.getAttribute('data-action') === 'open-markdown-syntax'
                || selector === '.btn-download'
                || selector === '.btn-info';
            if (!keepEnabled) {
                setTemporarilyDisabled(element, locked);
            }
        });
    }

    function getLockBannerMessage(lock) {
        if (lock && lock.holder_is_current_user) {
            return t('note_lock.current_user_other_tab', {}, 'Read only: this note is already being edited in another tab.');
        }

        var holder = (lock && lock.holder_username) ? lock.holder_username : t('note_lock.another_user', {}, 'another user');
        return t('note_lock.banner', { user: holder }, 'Read only: {{user}} is currently editing this note.');
    }

    function getLockConflictMessage(lock, fallbackMessage, reason) {
        if (reason === 'acquire') {
            return lock ? getLockBannerMessage(lock) : fallbackMessage;
        }

        if (lock && lock.holder_is_current_user) {
            return t('note_lock.lost_to_other_tab', {}, 'You no longer hold the edit lock for this note. It is now being edited in another tab.');
        }

        if (lock) {
            var holder = lock.holder_username ? lock.holder_username : t('note_lock.another_user', {}, 'another user');
            return t('note_lock.lost_to_user', { user: holder }, 'You no longer hold the edit lock for this note. {{user}} is now editing it.');
        }

        return fallbackMessage;
    }

    function showLockConflictNotification(message) {
        if (!message) {
            return;
        }

        var title = t('note_lock.popup_title', {}, 'Attention');

        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'warning', title);
            return;
        }

        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup(message, 'warning');
        }
    }

    function ensureLockBanner(noteCard, message) {
        if (!noteCard) {
            return;
        }

        var banner = noteCard.querySelector('.note-edit-lock-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'note-edit-lock-banner';
            var noteHeader = noteCard.querySelector('.note-header');
            if (noteHeader && noteHeader.parentNode) {
                noteHeader.parentNode.insertBefore(banner, noteHeader.nextSibling);
            } else {
                noteCard.insertBefore(banner, noteCard.firstChild);
            }
        }

        banner.textContent = message;
    }

    function clearLockBanner(noteCard) {
        if (!noteCard) {
            return;
        }

        var banner = noteCard.querySelector('.note-edit-lock-banner');
        if (banner && banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
    }

    function setNoteLockedState(noteId, lock) {
        noteId = normalizeNoteId(noteId);
        if (!noteId) {
            return;
        }

        var noteCard = document.getElementById('note' + noteId);
        var titleInput = document.getElementById('inp' + noteId);
        var entry = document.getElementById('entry' + noteId);

        noteStates[noteId] = {
            editable: false,
            lock: lock || null
        };

        if (noteCard) {
            noteCard.classList.add('note-edit-locked');
            ensureLockBanner(noteCard, getLockBannerMessage(lock || null));
            updateToolbarState(noteCard, true);
        }

        if (titleInput) {
            titleInput.readOnly = true;
            titleInput.classList.add('note-lock-readonly');
            if (document.activeElement === titleInput) {
                titleInput.blur();
            }
        }

        if (entry) {
            setContentEditableState(entry, false);
            entry.querySelectorAll('[contenteditable="true"]').forEach(function (element) {
                setContentEditableState(element, false);
            });
            entry.querySelectorAll('input, textarea, select, button').forEach(function (element) {
                setTemporarilyDisabled(element, true);
            });

            if (document.activeElement && entry.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        }
    }

    function clearNoteLockedState(noteId) {
        noteId = normalizeNoteId(noteId);
        if (!noteId) {
            return;
        }

        var noteCard = document.getElementById('note' + noteId);
        var titleInput = document.getElementById('inp' + noteId);
        var entry = document.getElementById('entry' + noteId);

        noteStates[noteId] = {
            editable: true,
            lock: noteStates[noteId] ? noteStates[noteId].lock : null
        };

        if (noteCard) {
            noteCard.classList.remove('note-edit-locked');
            clearLockBanner(noteCard);
            updateToolbarState(noteCard, false);
        }

        if (titleInput) {
            titleInput.readOnly = false;
            titleInput.classList.remove('note-lock-readonly');
        }

        if (entry) {
            setContentEditableState(entry, true);
            entry.querySelectorAll('[data-note-lock-prev-contenteditable]').forEach(function (element) {
                setContentEditableState(element, true);
            });
            entry.querySelectorAll('[data-note-lock-managed]').forEach(function (element) {
                setTemporarilyDisabled(element, false);
            });
        }
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            window.clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    function startHeartbeat(noteId) {
        stopHeartbeat();
        heartbeatTimer = window.setInterval(function () {
            refreshLock(noteId);
        }, HEARTBEAT_INTERVAL_MS);
    }

    function releaseLock(noteId) {
        noteId = normalizeNoteId(noteId);
        if (!noteId || isReadonlyWorkspace()) {
            return;
        }

        postJson('/api/v1/notes/' + encodeURIComponent(noteId) + '/lock/release', {
            editor_session_id: getEditorSessionId()
        }, true).catch(function () {
            return null;
        });
    }

    function handleLockConflict(noteId, lock, message, reason) {
        stopHeartbeat();
        setNoteLockedState(noteId, lock || null);

        if ((reason || 'lost') === 'acquire') {
            return;
        }

        var popupMessage = getLockConflictMessage(lock || null, message, reason || 'lost');
        if (popupMessage) {
            showLockConflictNotification(popupMessage);
        }
    }

    function refreshLock(noteId) {
        noteId = normalizeNoteId(noteId);
        if (!noteId || String(activeNoteId) !== noteId || isReadonlyWorkspace()) {
            return;
        }

        postJson('/api/v1/notes/' + encodeURIComponent(noteId) + '/lock/heartbeat', {
            editor_session_id: getEditorSessionId()
        }).then(parseResponse).then(function (result) {
            if (String(activeNoteId) !== noteId) {
                return;
            }

            if (result.ok && result.data && result.data.success) {
                noteStates[noteId] = {
                    editable: true,
                    lock: result.data.lock || null
                };
                return;
            }

            if (result.status === 423 || (result.data && result.data.lock)) {
                handleLockConflict(noteId, result.data.lock || null, result.data.error || 'This note is currently locked for editing.', 'lost');
            }
        }).catch(function () {
            return null;
        });
    }

    function acquireLock(noteId) {
        noteId = normalizeNoteId(noteId);
        if (!noteId || isReadonlyWorkspace()) {
            return;
        }

        var previousNoteId = normalizeNoteId(activeNoteId);
        if (previousNoteId && previousNoteId !== noteId) {
            releaseLock(previousNoteId);
            delete noteStates[previousNoteId];
        }

        stopHeartbeat();
        activeNoteId = noteId;
        acquireRequestId += 1;
        var requestId = acquireRequestId;

        postJson('/api/v1/notes/' + encodeURIComponent(noteId) + '/lock', {
            editor_session_id: getEditorSessionId()
        }).then(parseResponse).then(function (result) {
            if (requestId !== acquireRequestId || String(activeNoteId) !== noteId) {
                return;
            }

            if (result.ok && result.data && result.data.success) {
                noteStates[noteId] = {
                    editable: true,
                    lock: result.data.lock || null
                };
                clearNoteLockedState(noteId);
                startHeartbeat(noteId);
                return;
            }

            if (result.status === 423 || (result.data && result.data.lock)) {
                handleLockConflict(noteId, result.data.lock || null, result.data.error || 'This note is currently locked for editing.', 'acquire');
                return;
            }

            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(result.data.error || 'Unable to acquire the edit lock for this note.', 'error');
            }
        }).catch(function () {
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup('Unable to acquire the edit lock for this note.', 'error');
            }
        });
    }

    function handleCurrentNoteLoaded(noteId) {
        noteId = normalizeNoteId(noteId || window.noteid || getCurrentDomNoteId());
        if (!noteId) {
            stopHeartbeat();
            activeNoteId = null;
            return;
        }

        ensureStyles();
        acquireLock(noteId);
    }

    window.getCurrentEditorSessionId = getEditorSessionId;
    window.isNoteEditingLocked = function (noteId) {
        noteId = normalizeNoteId(noteId || activeNoteId);
        return !!(noteId && noteStates[noteId] && noteStates[noteId].editable === false);
    };
    window.handleNoteEditLockConflict = function (noteId, lock, message, reason) {
        handleLockConflict(noteId, lock, message, reason || 'lost');
    };
    window.acquireNoteEditLockForCurrentNote = handleCurrentNoteLoaded;

    document.addEventListener('DOMContentLoaded', function () {
        ensureStyles();
        handleCurrentNoteLoaded();
    });

    document.addEventListener('noteLoaded', function (event) {
        var detail = event && event.detail ? event.detail : {};
        handleCurrentNoteLoaded(detail.noteId || null);
    });
})();
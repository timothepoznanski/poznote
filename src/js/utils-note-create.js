// Note creation flow for Poznote.
// 
// Remembering the last opened workspace, the "open the note I just created" hand-off
// across the page load that follows creation, the creation loading indicator, and the
// per-note actions reachable from the tree (download, info, favourite, duplicate).

/**
 * Save the last opened workspace to the database
 * This replaces localStorage for workspace persistence
 * @param {string} workspaceName - The workspace name to save
 */
function saveLastOpenedWorkspace(workspaceName) {
    if (!workspaceName) return;

    fetch('/api/v1/settings/last_opened_workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ value: workspaceName })
    })
        .then(function (r) { return r.json(); })
        .catch(function (e) {
            // Silently fail - this is a best-effort save
            console.debug && console.debug('Failed to save last opened workspace:', e);
        });
}

// Expose globally
window.saveLastOpenedWorkspace = saveLastOpenedWorkspace;

var PENDING_CREATED_NOTE_OPEN_KEY = 'poznote_pending_created_note_open';

function getDefaultCreatedNoteTitle() {
    return window.t ? window.t('index.note.new_note', null, 'New note') : 'New note';
}

function normalizeCreatedNoteWorkspace(workspaceName) {
    return typeof workspaceName === 'string' ? workspaceName : '';
}

function buildIndexNoteUrl(noteId, workspaceName) {
    var params = [];
    var workspace = normalizeCreatedNoteWorkspace(workspaceName);

    if (workspace) {
        params.push('workspace=' + encodeURIComponent(workspace));
    }

    if (noteId) {
        params.push('note=' + encodeURIComponent(noteId));
    }

    return 'index.php' + (params.length ? '?' + params.join('&') : '');
}

function getStoredActiveTabNoteId(workspaceName) {
    var workspace = workspaceName || 'default';

    try {
        var raw = localStorage.getItem(window.__poznoteTabsStorageKey(workspace));
        if (!raw) {
            return null;
        }

        var parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.tabs) || !parsed.activeTabId) {
            return null;
        }

        for (var i = 0; i < parsed.tabs.length; i++) {
            var tab = parsed.tabs[i];
            if (tab && tab.id === parsed.activeTabId && tab.noteId) {
                return String(tab.noteId);
            }
        }
    } catch (error) {
        // Ignore storage errors and fall back to normal navigation.
        console.debug('utils-note-create: getStoredActiveTabNoteId() failed:', error);
    }

    return null;
}

function storePendingCreatedNoteOpen(noteId, noteTitle, workspaceName, folderId) {
    try {
        sessionStorage.setItem(PENDING_CREATED_NOTE_OPEN_KEY, JSON.stringify({
            noteId: String(noteId),
            noteTitle: noteTitle || getDefaultCreatedNoteTitle(),
            workspace: normalizeCreatedNoteWorkspace(workspaceName),
            folderId: folderId !== null && folderId !== undefined && folderId !== '' ? String(folderId) : null
        }));
    } catch (error) {
        // Ignore storage errors and fall back to normal navigation.
        console.debug('utils-note-create: storePendingCreatedNoteOpen() failed:', error);
    }
}

function consumePendingCreatedNoteOpen() {
    try {
        var raw = sessionStorage.getItem(PENDING_CREATED_NOTE_OPEN_KEY);
        if (!raw) {
            return null;
        }

        sessionStorage.removeItem(PENDING_CREATED_NOTE_OPEN_KEY);
        return JSON.parse(raw);
    } catch (error) {
        try {
            sessionStorage.removeItem(PENDING_CREATED_NOTE_OPEN_KEY);
        } catch (cleanupError) {
            // Ignore cleanup errors.
            console.debug('utils-note-create: consumePendingCreatedNoteOpen() failed:', cleanupError);
        }
        return null;
    }
}

function rememberFolderStatesForCreatedNote(folderId) {
    try {
        if (typeof persistFolderStatesFromDOM === 'function') {
            persistFolderStatesFromDOM();
        }

        if (folderId !== null && folderId !== undefined && folderId !== '') {
            var folderDomId = 'folder-' + String(folderId);
            localStorage.setItem('folder_' + folderDomId, 'open');

            try {
                var pendingCreateFolders = JSON.parse(sessionStorage.getItem('poznote_create_open_folders') || '[]');
                if (!Array.isArray(pendingCreateFolders)) {
                    pendingCreateFolders = [];
                }
                if (pendingCreateFolders.indexOf(folderDomId) === -1) {
                    pendingCreateFolders.push(folderDomId);
                }
                sessionStorage.setItem('poznote_create_open_folders', JSON.stringify(pendingCreateFolders));
            } catch (storageError) {
                // Ignore storage errors and keep the creation flow moving.
                console.debug('utils-note-create: rememberFolderStatesForCreatedNote() failed:', storageError);
            }
        }
    } catch (error) {
        // Ignore storage errors and keep the creation flow moving.
        console.debug('utils-note-create: rememberFolderStatesForCreatedNote() failed:', error);
    }
}

window.rememberFolderStatesForCreatedNote = rememberFolderStatesForCreatedNote;

function openCreatedNoteWithInternalTabs(noteId, noteTitle, folderId) {
    if (!window.tabManager || window.innerWidth <= 800) {
        return Promise.resolve(false);
    }

    var finalTitle = noteTitle || getDefaultCreatedNoteTitle();

    return Promise.resolve(
        typeof window.refreshNotesListAfterFolderAction === 'function'
            ? window.refreshNotesListAfterFolderAction(folderId)
            : null
    ).catch(function (error) {
        console.error('Error refreshing notes list before opening created note:', error);
    }).then(function () {
        window.tabManager.openInNewTab(noteId, finalTitle, { isNewNote: true });
        return true;
    });
}

function navigateToCreatedNoteInInternalTab(noteId, noteTitle, workspaceName, folderId) {
    if (!noteId) {
        return Promise.resolve(false);
    }

    rememberFolderStatesForCreatedNote(folderId);

    var workspace = normalizeCreatedNoteWorkspace(workspaceName);

    if (window.tabManager && window.innerWidth > 800) {
        return openCreatedNoteWithInternalTabs(noteId, noteTitle, folderId);
    }

    if (window.innerWidth > 800) {
        var activeNoteId = getStoredActiveTabNoteId(workspace);
        if (activeNoteId) {
            storePendingCreatedNoteOpen(noteId, noteTitle, workspace, folderId);
            window.location.href = buildIndexNoteUrl(activeNoteId, workspace);
            return Promise.resolve(true);
        }
    }

    window.location.href = buildIndexNoteUrl(noteId, workspace);
    return Promise.resolve(true);
}

window.navigateToCreatedNoteInInternalTab = navigateToCreatedNoteInInternalTab;

var NOTE_CREATION_PENDING_KEY = 'poznote_create_page_loading';

function getNoteCreationLoadingText() {
    return window.t ? window.t('common.loading', null, 'Loading...') : 'Loading...';
}

function isCreatePageLoadingContext() {
    var path = (window.location && window.location.pathname) ? window.location.pathname : '';
    return /(?:^|\/)create\.php$/.test(path);
}

function hasPendingNoteCreationLoading() {
    try {
        return window.sessionStorage && sessionStorage.getItem(NOTE_CREATION_PENDING_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function setPendingNoteCreationLoading() {
    try {
        if (window.sessionStorage) {
            sessionStorage.setItem(NOTE_CREATION_PENDING_KEY, '1');
        }
    } catch (error) {
        // Ignore storage errors; the modal still works until the current page unloads.
        console.debug('utils-note-create: setPendingNoteCreationLoading() failed:', error);
    }
}

function clearPendingNoteCreationLoading() {
    try {
        if (window.sessionStorage) {
            sessionStorage.removeItem(NOTE_CREATION_PENDING_KEY);
        }
    } catch (error) {
        // Ignore storage errors.
        console.debug('utils-note-create: clearPendingNoteCreationLoading() failed:', error);
    }
}

function createNoteCreationLoadingElement() {
    var content = document.createElement('div');
    content.className = 'note-creation-loading-content';
    content.setAttribute('role', 'status');
    content.setAttribute('aria-live', 'polite');

    var icon = document.createElement('i');
    icon.className = 'lucide lucide-loader-2 lucide-spin';
    icon.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.textContent = getNoteCreationLoadingText();

    content.appendChild(icon);
    content.appendChild(label);

    return content;
}

function setNoteCreationTriggerLoading(triggerElement) {
    if (window.noteCreationLoadingTrigger && window.noteCreationLoadingTrigger !== triggerElement) {
        clearNoteCreationTriggerLoading();
    }

    if (!triggerElement || !triggerElement.classList) return;

    window.noteCreationLoadingTrigger = triggerElement;
    triggerElement.classList.add('is-creating');
    triggerElement.setAttribute('aria-busy', 'true');
    triggerElement.setAttribute('aria-disabled', 'true');
}

function clearNoteCreationTriggerLoading() {
    var triggerElement = window.noteCreationLoadingTrigger;
    if (triggerElement && triggerElement.classList) {
        triggerElement.classList.remove('is-creating');
        triggerElement.removeAttribute('aria-busy');
        triggerElement.removeAttribute('aria-disabled');
    }
    window.noteCreationLoadingTrigger = null;
}

function showNoteCreationLoadingModal() {
    if (!document.body || document.getElementById('note-creation-loading-modal')) {
        return;
    }

    var modal = document.createElement('div');
    modal.id = 'note-creation-loading-modal';
    modal.className = 'note-creation-loading-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', getNoteCreationLoadingText());

    var dialog = document.createElement('div');
    dialog.className = 'note-creation-loading-dialog';
    dialog.appendChild(createNoteCreationLoadingElement());

    modal.appendChild(dialog);
    document.body.appendChild(modal);
}

function showNoteCreationLoading(triggerElement) {
    var isCreatePage = isCreatePageLoadingContext();
    if (!isCreatePage && !hasPendingNoteCreationLoading()) {
        return;
    }

    if (isCreatePage) {
        setPendingNoteCreationLoading();
    }

    var trigger = triggerElement || window.noteCreationTriggerElement || window.noteCreationLoadingTrigger || null;
    window.isNoteCreationLoading = true;

    if (document.body) {
        document.body.classList.add('note-creation-is-loading');
    }

    setNoteCreationTriggerLoading(trigger);
    showNoteCreationLoadingModal();

    var rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.scrollTop = 0;
    }
}

function hideNoteCreationLoading() {
    window.isNoteCreationLoading = false;
    clearPendingNoteCreationLoading();

    if (document.body) {
        document.body.classList.remove('note-creation-is-loading');
    }

    var modal = document.getElementById('note-creation-loading-modal');
    if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
    }

    var overlay = document.getElementById('note-creation-loading-overlay');
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }

    var rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.classList.remove('is-note-creation-loading');
    }

    clearNoteCreationTriggerLoading();
}

window.createNoteCreationLoadingElement = createNoteCreationLoadingElement;
window.showNoteCreationLoading = showNoteCreationLoading;
window.hideNoteCreationLoading = hideNoteCreationLoading;

(function initializePendingNoteCreationLoading() {
    if (!hasPendingNoteCreationLoading()) {
        return;
    }

    function showPendingModal() {
        if (!hasPendingNoteCreationLoading()) {
            return;
        }

        window.isNoteCreationLoading = true;
        if (document.body) {
            document.body.classList.add('note-creation-is-loading');
        }
        showNoteCreationLoadingModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showPendingModal, { once: true });
    } else {
        showPendingModal();
    }

    window.addEventListener('load', function () {
        if (hasPendingNoteCreationLoading()) {
            window.setTimeout(hideNoteCreationLoading, 120);
        }
    }, { once: true });
})();

function consumePendingCreatedNoteOpenOnLoad(retryCount) {
    if (window.innerWidth <= 800) {
        return;
    }

    var attempts = typeof retryCount === 'number' ? retryCount : 0;
    if (!window.tabManager) {
        if (attempts < 20) {
            window.setTimeout(function () {
                consumePendingCreatedNoteOpenOnLoad(attempts + 1);
            }, 50);
        }
        return;
    }

    var pendingRequest = consumePendingCreatedNoteOpen();
    if (!pendingRequest || !pendingRequest.noteId) {
        return;
    }

    openCreatedNoteWithInternalTabs(pendingRequest.noteId, pendingRequest.noteTitle, pendingRequest.folderId);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', consumePendingCreatedNoteOpenOnLoad);
} else {
    consumePendingCreatedNoteOpenOnLoad();
}

function startDownload() {
    window.location = 'api_export_entries.php';
}

function showNoteInfo(noteId, created, updated, folder, favorite, tags, attachmentsCount) {
    if (!noteId) {
        window.showError('Aucun ID de note fourni', 'Erreur');
        return;
    }

    try {
        // Get current workspace using robust method
        const urlParams = new URLSearchParams(window.location.search);
        const currentWorkspace = urlParams.get('workspace') ||
            (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : null) ||
            (typeof window.selectedWorkspace !== 'undefined' ? window.selectedWorkspace : null) ||
            '';

        var wsParam = currentWorkspace ? ('&workspace=' + encodeURIComponent(currentWorkspace)) : '';
        var url = 'info.php?note_id=' + encodeURIComponent(noteId) + wsParam;
        window.location.href = url;
    } catch (error) {
        window.showError('Erreur lors de l\'affichage des informations: ' + error.message, 'Erreur');
    }
}

function toggleFavorite(noteId) {
    // Auto-save handles any pending changes automatically
    performFavoriteToggle(noteId);
}

function performFavoriteToggle(noteId) {
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var wsParam = workspace ? '?workspace=' + encodeURIComponent(workspace) : '';

    fetch('/api/v1/notes/' + noteId + '/favorite' + wsParam, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            workspace: workspace
        })
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Mark note for auto-push since we toggled favorite (if auto-push enabled)
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                
                // If note was added to favorites (is_favorite = 1), open the Favorites folder
                if (data.is_favorite === 1) {
                    localStorage.setItem('folder_folder-favorites', 'open');
                }
                setTimeout(function () {
                    window.location.reload();
                }, 50);
            } else {
                showNotificationPopup('Error: ' + (data.message || 'Unknown error'), 'error');
            }
        })
        .catch(function (error) {
            showNotificationPopup('Error updating favorites', 'error');
            console.error('Favorite toggle error:', error);
        });
}

// Mark/unmark a folder as favorite. The desired state is derived from the
// folder's three-dot toggle (data-favorite) and sent explicitly, matching the
// PUT /folders/{id}/favorite contract.
function toggleFolderFavorite(folderId) {
    var toggle = document.querySelector('.folder-actions-toggle[data-folder-id="' + folderId + '"]');
    var isFavorite = toggle && toggle.getAttribute('data-favorite') === '1';

    fetch('/api/v1/folders/' + encodeURIComponent(folderId) + '/favorite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ favorite: !isFavorite })
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                window.location.reload();
            } else {
                showNotificationPopup('Error: ' + (data.message || 'Unknown error'), 'error');
            }
        })
        .catch(function (error) {
            showNotificationPopup('Error updating favorites', 'error');
            console.error('Folder favorite toggle error:', error);
        });
}

function duplicateNote(noteId) {
    fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success && data.id) {
                // Mark note for auto-push since we duplicated a note (if auto-push enabled)
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                
                // Update shared count if note was auto-shared
                if (data.share_delta && typeof updateSharedCount === 'function') {
                    updateSharedCount(data.share_delta);
                }
                // Stay on current note - just reload the page to refresh the list
                window.location.reload();
            } else {
                // Fallback: reload the page
                window.location.reload();
            }
        })
        .catch(function (error) {
            // Silent error handling - reload the page
            window.location.reload();
        });
}

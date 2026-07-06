// Utility and miscellaneous functions

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
        var raw = localStorage.getItem('poznote_tabs_' + workspace);
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
            }
        }
    } catch (error) {
        // Ignore storage errors and keep the creation flow moving.
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
    }
}

function clearPendingNoteCreationLoading() {
    try {
        if (window.sessionStorage) {
            sessionStorage.removeItem(NOTE_CREATION_PENDING_KEY);
        }
    } catch (error) {
        // Ignore storage errors.
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

// Folder management
var currentFolderToDelete = { id: null, name: null };

function newFolder() {
    showInputModal(
        (window.t ? window.t('modals.folder.new_title', null, 'New Folder') : 'New Folder'),
        (window.t ? window.t('modals.folder.new_placeholder', null, 'New folder name') : 'New folder name'),
        '',
        function (folderName) {
            if (!folderName) return;

            var data = {
                folder_name: folderName,
                workspace: selectedWorkspace || getSelectedWorkspace()
            };

            if (typeof window.showNoteCreationLoading === 'function') {
                window.showNoteCreationLoading();
            }

            fetch('/api/v1/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data)
            })
                .then(function (response) {
                    if (!response.ok) {
                        return response.json().then(function (errorData) {
                            throw new Error(errorData.error || errorData.message || 'Unknown error');
                        });
                    }
                    return response.json();
                })
                .then(function (data) {
                    if (data.success && data.folder_id) {
                        // Folder created successfully with ID
                        if (window.location.pathname.endsWith('create.php')) {
                            var ws = selectedWorkspace || getSelectedWorkspace();
                            window.location.href = 'index.php' + (ws ? '?workspace=' + encodeURIComponent(ws) : '');
                        } else {
                            window.location.reload();
                        }
                    } else if (data.success) {
                        // Fallback si pas d'ID retourné
                        if (window.location.pathname.endsWith('create.php')) {
                            var ws = selectedWorkspace || getSelectedWorkspace();
                            window.location.href = 'index.php' + (ws ? '?workspace=' + encodeURIComponent(ws) : '');
                        } else {
                            window.location.reload();
                        }
                    } else {
                        if (typeof window.hideNoteCreationLoading === 'function') {
                            window.hideNoteCreationLoading();
                        }
                        // Use modal alert instead of notification popup
                        if (typeof window.showError === 'function') {
                            window.showError(
                                data.message || data.error || 'Unknown error',
                                (window.t ? window.t('folders.errors.create_title', null, 'Error Creating Folder') : 'Error Creating Folder')
                            );
                        } else {
                            showNotificationPopup(
                                (window.t
                                    ? window.t('folders.errors.create_prefix', { error: (data.message || data.error) }, 'Error creating folder: {{error}}')
                                    : ('Error creating folder: ' + (data.message || data.error))),
                                'error'
                            );
                        }
                    }
                })
                .catch(function (error) {
                    if (typeof window.hideNoteCreationLoading === 'function') {
                        window.hideNoteCreationLoading();
                    }
                    // Use modal alert instead of notification popup
                    if (typeof window.showError === 'function') {
                        window.showError(
                            error.message,
                            (window.t ? window.t('folders.errors.create_title', null, 'Error Creating Folder') : 'Error Creating Folder')
                        );
                    } else {
                        showNotificationPopup(
                            (window.t
                                ? window.t('folders.errors.create_prefix', { error: error.message }, 'Error creating folder: {{error}}')
                                : ('Error creating folder: ' + error.message)),
                            'error'
                        );
                    }
                });
        }
    );
}

function deleteFolder(folderId, folderName) {
    // First, check how many notes sont dans ce dossier
    var params = new URLSearchParams({
        action: 'count_notes_in_folder',
        folder_id: folderId
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);

    fetch('/api/v1/folders/' + folderId + '/notes?workspace=' + encodeURIComponent(ws || ''), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                var noteCount = data.count || 0;
                var subfolderCount = data.subfolder_count || 0;

                // If the folder is empty and has no subfolders, delete without confirmation
                if (noteCount === 0 && subfolderCount === 0) {
                    executeDeleteFolderOperation(folderId, folderName);
                    return;
                }

                // Update modal content
                var mainMessage = document.getElementById('deleteFolderMainMessage');
                var detailsList = document.getElementById('deleteFolderDetails');
                var noteElement = document.getElementById('deleteFolderNote');

                if (mainMessage) {
                    mainMessage.textContent = window.t
                        ? window.t('folders.delete.confirm_main', { folder: folderName }, 'Are you sure you want to delete the folder "{{folder}}"?')
                        : ('Are you sure you want to delete the folder "' + folderName + '"?');
                }

                if (detailsList) {
                    detailsList.innerHTML = '';

                    if (subfolderCount > 0) {
                        var subfolderLi = document.createElement('li');
                        subfolderLi.style.marginBottom = '5px';
                        if (window.t) {
                            subfolderLi.innerHTML = (subfolderCount > 1)
                                ? window.t('folders.delete.details.subfolder_plural_html', { count: subfolderCount }, '<strong>• {{count}}</strong> subfolders will also be deleted')
                                : window.t('folders.delete.details.subfolder_singular_html', { count: subfolderCount }, '<strong>• {{count}}</strong> subfolder will also be deleted');
                        } else {
                            subfolderLi.innerHTML = '<strong>• ' + subfolderCount + '</strong> subfolder' + (subfolderCount > 1 ? 's' : '') + ' will also be deleted';
                        }
                        detailsList.appendChild(subfolderLi);
                    }

                    if (noteCount > 0) {
                        var noteLi = document.createElement('li');
                        noteLi.style.marginBottom = '5px';
                        if (window.t) {
                            noteLi.innerHTML = (noteCount > 1)
                                ? window.t('folders.delete.details.note_plural_html', { count: noteCount }, '<strong>• {{count}}</strong> notes will be moved to trash')
                                : window.t('folders.delete.details.note_singular_html', { count: noteCount }, '<strong>• {{count}}</strong> note will be moved to trash');
                        } else {
                            noteLi.innerHTML = '<strong>• ' + noteCount + '</strong> note' + (noteCount > 1 ? 's' : '') + ' will be moved to trash';
                        }
                        detailsList.appendChild(noteLi);
                    }
                }

                if (noteElement) {
                    noteElement.textContent = '';
                }

                showDeleteFolderModal(folderId, folderName, null);
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.check_content_prefix', { error: data.error }, 'Error checking folder content: {{error}}') : ('Error checking folder content: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.check_content_prefix', { error: String(error) }, 'Error checking folder content: {{error}}') : ('Error checking folder content: ' + error)),
                'error'
            );
        });
}

function showDeleteFolderModal(folderId, folderName, message) {
    currentFolderToDelete = { id: folderId, name: folderName };
    var modal = document.getElementById('deleteFolderModal');

    if (modal) {
        modal.style.display = 'flex';
    }
}

function executeDeleteFolder() {
    if (currentFolderToDelete && currentFolderToDelete.id) {
        executeDeleteFolderOperation(currentFolderToDelete.id, currentFolderToDelete.name);
    }

    closeModal('deleteFolderModal');
    currentFolderToDelete = { id: null, name: null };
}

function executeDeleteFolderOperation(folderId, folderName) {
    var ws = getSelectedWorkspace();

    fetch('/api/v1/folders/' + folderId + '?workspace=' + encodeURIComponent(ws || ''), {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                // Folder deleted successfully - remove any localStorage state for this folder
                try {
                    // Find the folder header matching the deleted folder name and remove the stored open/closed state
                    var headers = document.querySelectorAll('.folder-header');
                    for (var i = 0; i < headers.length; i++) {
                        var h = headers[i];
                        try {
                            var df = h.getAttribute('data-folder');
                            if (df === folderName) {
                                var content = h.querySelector('.folder-content');
                                if (content && content.id) {
                                    try {
                                        localStorage.removeItem('folder_' + content.id);
                                    } catch (e) { /* ignore storage errors */ }
                                }
                                break;
                            }
                        } catch (e) {
                            // ignore per-header errors
                        }
                    }
                    // Also remove any saved folder search/filter state for this folder name

                } catch (e) {
                    // ignore any errors while trying to clean localStorage
                }

                // Reload to update UI
                window.location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.delete_prefix', { error: String(error) }, 'Error deleting folder: {{error}}') : ('Error deleting folder: ' + error)),
                'error'
            );
        });
}

function selectFolder(folderId, folderName, element) {
    selectedFolderId = folderId;
    selectedFolder = folderName;

    // Update interface
    var folderLinks = document.querySelectorAll('.folder-link');
    for (var i = 0; i < folderLinks.length; i++) {
        folderLinks[i].classList.remove('selected');
    }

    if (element) {
        element.classList.add('selected');
    }
}

function downloadFolder(folderId, folderName) {
    // Close the folder actions menu
    closeFolderActionsMenu(folderId);

    // Create download URL
    var url = 'api_export_folder.php?folder_id=' + encodeURIComponent(folderId);

    // Create a temporary link and click it to trigger download
    var link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Remove the link after a short delay
    setTimeout(function () {
        document.body.removeChild(link);
    }, 100);
}

// Workspace management (creation/deletion)
function showNewWorkspacePrompt() {
    var name = prompt('Nom du nouveau workspace:');
    if (!name) return;

    // Validate allowed characters
    if (!/^[\p{L}0-9 _-]+$/u.test(name)) {
        showNotificationPopup('Invalid workspace name: use letters, numbers, spaces, hyphens or underscores', 'error');
        return;
    }

    fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: name }),
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (res) {
            if (res.success) {
                var sel = document.getElementById('workspaceSelector');
                if (sel) {
                    var exists = false;
                    for (var i = 0; i < sel.options.length; i++) {
                        if (sel.options[i].value === name) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists) {
                        var option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        sel.appendChild(option);
                    }
                    sel.value = name;
                    selectedWorkspace = name;
                    // Save to database
                    if (typeof saveLastOpenedWorkspace === 'function') {
                        saveLastOpenedWorkspace(name);
                    }

                    refreshLeftColumnForWorkspace(name);
                    // Workspace created and selected - no notification needed
                } else {
                    // Fallback: reload the page
                    var url = new URL(window.location.href);
                    url.searchParams.set('workspace', name);
                    window.location.href = url.toString();
                }
            } else {
                showNotificationPopup(
                    (window.t ? window.t('workspaces.alerts.error_prefix', { error: (res.message || window.t('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}') : ('Error: ' + (res.message || 'Unknown error'))),
                    'error'
                );
            }
        })
        .catch(function (err) {
            showNotificationPopup(window.t ? window.t('ui.alerts.network_error', {}, 'Network error') : 'Network error', 'error');
        });
}

function deleteCurrentWorkspace() {
    var sel = document.getElementById('workspaceSelector');
    if (!sel) return;

    var name = sel.value;
    if (!name) {
        showNotificationPopup(window.t ? window.t('workspaces.errors.no_workspace_selected', {}, 'No workspace selected') : 'No workspace selected', 'error');
        return;
    }

    window.modalAlert.confirm(
        (window.t ? window.t('workspaces.confirm_delete.message', { workspace: name }, 'Delete workspace "{{workspace}}"? Notes will be moved to the default workspace.') : ('Delete workspace "' + name + '"? Notes will be moved to the default workspace.')),
        (window.t ? window.t('workspaces.confirm_delete.title', {}, 'Confirm delete workspace') : 'Confirm delete workspace')
    )
        .then(function (confirmed) {
            if (confirmed) {
                fetch('/api/v1/workspaces/' + encodeURIComponent(name), {
                    method: 'DELETE',
                    headers: { 'Accept': 'application/json' },
                    credentials: 'same-origin'
                })
                    .then(function (response) { return response.json(); })
                    .then(function (res) {
                        if (res.success) {
                            // Get the first remaining workspace from the selector
                            var firstWorkspace = sel.options.length > 0 ? sel.options[0].value : '';
                            selectedWorkspace = firstWorkspace;
                            // Save to database
                            if (typeof saveLastOpenedWorkspace === 'function') {
                                saveLastOpenedWorkspace(firstWorkspace);
                            }

                            // Clean up localStorage entries related to folders that belonged to the deleted workspace
                            try {
                                // Remove per-folder open/closed state and folder-specific search keys
                                var headers = document.querySelectorAll('.folder-header');
                                var foldersToRemove = [];
                                for (var i = 0; i < headers.length; i++) {
                                    try {
                                        var df = headers[i].getAttribute('data-folder');
                                        // If the folder header is tied to the workspace being deleted, collect it
                                        if (df) {
                                            foldersToRemove.push(df);
                                            var content = headers[i].querySelector('.folder-content');
                                            if (content && content.id) {
                                                try { localStorage.removeItem('folder_' + content.id); } catch (e) { }
                                            }

                                        }
                                    } catch (e) { }
                                }


                            } catch (e) { }

                            // Remove option from selector
                            for (var i = 0; i < sel.options.length; i++) {
                                if (sel.options[i].value === name) {
                                    sel.removeChild(sel.options[i]);
                                    break;
                                }
                            }
                            // Select the first remaining workspace
                            var newFirstWorkspace = sel.options.length > 0 ? sel.options[0].value : '';
                            sel.value = newFirstWorkspace;

                            // Aggressive cleanup: remove any localStorage keys related to folders
                            try {
                                var keysToDelete = [];
                                try {
                                    try { console.debug && console.debug('workspace delete: starting aggressive localStorage scan'); } catch (e) { }
                                    for (var i = 0; i < localStorage.length; i++) {
                                        var key = localStorage.key(i);
                                        if (!key) continue;
                                        if (key.indexOf('folder_') === 0) {
                                            keysToDelete.push(key);
                                        }
                                    }
                                    try { console.debug && console.debug('workspace delete: keys to delete', keysToDelete); } catch (e) { }
                                } catch (e) { keysToDelete = []; }

                                for (var k = 0; k < keysToDelete.length; k++) {
                                    try { localStorage.removeItem(keysToDelete[k]); } catch (e) { }
                                }
                                try { console.debug && console.debug('workspace delete: aggressive localStorage cleanup done'); } catch (e) { }
                            } catch (e) { }

                            var url = new URL(window.location.href);
                            url.searchParams.set('workspace', newFirstWorkspace || sel.value);
                            window.location.href = url.toString();
                        } else {
                            showNotificationPopup('Error deleting workspace: ' + (res.message || 'unknown'), 'error');
                        }
                    })
                    .catch(function (err) {
                        showNotificationPopup('Network error', 'error');
                    });
            }
        });
}

function createFolder() {
    newFolder();
}

// Update management
function checkForUpdates() {
    // Close settings menus
    closeSettingsMenus();

    // Remove update badge since user is checking manually
    hideUpdateBadge();

    // User has manually checked, so clear the update available flag and reset the check time
    // This prevents the badge from reappearing until the next automatic check (24h later)
    localStorage.removeItem('poznote_update_available');
    localStorage.setItem('poznote_last_update_check', Date.now().toString());

    // Show checking modal
    showUpdateCheckModal();

    fetch('api/v1/system/updates')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP Error: ' + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            if (data.error) {
                const versionInfo = data.current_version ? '\nCurrent version: ' + data.current_version : '';
                showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + data.error + versionInfo, 'error');
            } else if (data.has_updates) {
                // Store version information for the modal
                closeUpdateCheckModal();
                showUpdateInstructions(true);
            } else {
                // No updates available
                closeUpdateCheckModal();
                showUpdateInstructions(false);
            }
        })
        .catch(function (error) {
            console.error('Failed to check for updates:', error);
            showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + error.message, 'error');
        });
}

// Check for updates automatically (silent, once per day)
function checkForUpdatesAutomatic() {
    // Only check for updates if user is admin
    // Check if badge exists in DOM (PHP only renders it for admins) as fallback
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }

    const now = Date.now();
    const lastCheck = localStorage.getItem('poznote_last_update_check');
    const lastCheckTime = lastCheck ? parseInt(lastCheck) : 0;

    // Check only once per day (24 hours = 24 * 60 * 60 * 1000 ms)
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastCheckTime < oneDayMs) {
        // Already checked today, restore badge if update was available
        restoreUpdateBadge();
        return;
    }

    // Store current time as last check
    localStorage.setItem('poznote_last_update_check', now.toString());

    // Perform silent check (no modals, only badge if update available)
    fetch('api/v1/system/updates')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP Error: ' + response.status);
            }
            return response.json();
        })
        .then(function (data) {
            if (data.has_updates && !data.error) {
                // Store update availability and version information
                localStorage.setItem('poznote_update_available', 'true');
                showUpdateBadge();
            } else {
                // Clear update availability flag and hide badge
                localStorage.removeItem('poznote_update_available');
                hideUpdateBadge();
            }
        })
        .catch(function (error) {
            // Silent failure - no user notification for automatic checks
        });
}

// Expose functions globally
window.showUpdateBadge = showUpdateBadge;
window.hideUpdateBadge = hideUpdateBadge;
window.restoreUpdateBadge = restoreUpdateBadge;

function showUpdateInstructions(hasUpdate = false) {
    var modal = document.getElementById('updateModal');
    if (modal) {
        var titleEl = modal.querySelector('h3');
        var messageEl = modal.querySelector('#updateMessage');
        var releaseNotesLink = document.getElementById('releaseNotesLink');
        var backupWarning = document.getElementById('updateBackupWarning');
        var howToUpdate = document.getElementById('updateHowToUpdate');

        if (releaseNotesLink) releaseNotesLink.style.display = 'block';

        if (hasUpdate) {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.new_available', null, 'New update available') : 'New update available';
            if (messageEl) {
                messageEl.innerHTML = window.t ? window.t('update.new_version_available', null, 'To update, follow the instructions on GitHub <a href="https://github.com/timothepoznanski/poznote#update-application" target="_blank">here</a>.') : 'To update, follow the instructions on GitHub <a href="https://github.com/timothepoznanski/poznote#update-application" target="_blank">here</a>.';
                messageEl.style.display = '';
            }
        } else {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.up_to_date', null, 'Poznote is up to date') : 'Poznote is up to date';
            if (messageEl) messageEl.style.display = 'none';
        }

        // Fill version information
        var currentVersionEl = document.getElementById('currentVersion');
        var availableVersionEl = document.getElementById('availableVersion');

        // Always fetch version information
        if (currentVersionEl) currentVersionEl.textContent = 'Loading...';
        if (availableVersionEl) availableVersionEl.textContent = 'Loading...';

        // Fetch update information
        fetch('api/v1/system/updates')
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP Error: ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                if (!data.error) {
                    // Update modal
                    if (currentVersionEl) {
                        currentVersionEl.textContent = data.current_version || 'unknown';
                    }
                    if (availableVersionEl) {
                        availableVersionEl.textContent = data.remote_version || 'unknown';
                    }
                    // Always link to the releases list instead of a specific tag.
                    var releaseNotesHref = document.getElementById('releaseNotesHref');
                    if (releaseNotesHref) {
                        releaseNotesHref.href = 'https://github.com/timothepoznanski/poznote/releases';
                    }
                } else {
                    // Error
                    if (currentVersionEl) currentVersionEl.textContent = data.current_version || 'unknown';
                    if (availableVersionEl) availableVersionEl.textContent = window.t ? window.t('update.error_loading_version', null, 'Error loading version') : 'Error loading version';
                }
            })
            .catch(function (error) {
                if (currentVersionEl) currentVersionEl.textContent = window.t ? window.t('update.error_loading_version', null, 'Error loading version') : 'Error loading version';
                if (availableVersionEl) availableVersionEl.textContent = window.t ? window.t('update.error_loading_version', null, 'Error loading version') : 'Error loading version';
            });

        modal.style.display = 'flex';
    }
}

function closeUpdateModal() {
    var modal = document.getElementById('updateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function goToSelfHostedUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote#update-application', '_blank');
}

function goToCloudUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote/blob/main/docs/POZNOTE-CLOUD.md', '_blank');
}

function showUpdateCheckModal() {
    var modal = document.getElementById('updateCheckModal');
    var statusElement = document.getElementById('updateCheckStatus');
    var buttonsElement = document.getElementById('updateCheckButtons');

    if (!modal) {
        console.error('updateCheckModal modal not found');
        return;
    }

    // Reset modal state
    var titleElement = modal.querySelector('h3');
    if (titleElement) {
        titleElement.textContent = 'Checking for updates...';
        titleElement.style.color = '';
    }

    if (statusElement) {
        statusElement.textContent = 'Please wait while we check for updates...';
        statusElement.style.color = '';
    }

    if (buttonsElement) {
        buttonsElement.style.display = 'none';
    }

    modal.style.display = 'flex';
}

function closeUpdateCheckModal() {
    var modal = document.getElementById('updateCheckModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showUpdateCheckResult(title, message, type) {
    var modal = document.getElementById('updateCheckModal');
    if (!modal) {
        console.error('updateCheckModal modal not found');
        return;
    }

    var titleElement = modal.querySelector('h3');
    var statusElement = document.getElementById('updateCheckStatus');
    var buttonsElement = document.getElementById('updateCheckButtons');

    // Update content
    if (titleElement) {
        titleElement.textContent = title;
    }
    if (statusElement) {
        statusElement.textContent = message;
        if (type === 'error' && message.indexOf('Invalid response from update server') !== -1) {
            statusElement.textContent += ' This may also be caused by GitHub rate limiting/quota.';
        }
    }

    // Update colors based on type
    if (type === 'error') {
        if (titleElement) titleElement.style.color = '#e53935';
        if (statusElement) statusElement.style.color = '#e53935';
    } else if (type === 'success') {
        if (titleElement) titleElement.style.color = '#007DB8';
        if (statusElement) statusElement.style.color = '#007DB8';
    }

    // Always show close button
    if (buttonsElement) buttonsElement.style.display = 'flex';
}

function hideUpdateBadge() {
    var badges = document.querySelectorAll('.update-badge');
    for (var i = 0; i < badges.length; i++) {
        badges[i].classList.add('update-badge-hidden');
        badges[i].style.display = '';
    }
}

function showUpdateBadge() {
    // Only show badge for admin users
    // Check if badge exists in DOM (PHP only renders it for admins) as fallback
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }
    for (var i = 0; i < badges.length; i++) {
        badges[i].classList.remove('update-badge-hidden');
        badges[i].style.display = 'inline-block';
    }
}

function restoreUpdateBadge() {
    // Only restore badge for admin users
    // Check if badge exists (PHP only renders it for admins) as fallback for window.isAdmin
    var badges = document.querySelectorAll('.update-badge');
    if (!badges.length) {
        return; // No badge in DOM means user is not admin
    }
    if (typeof window.isAdmin !== 'undefined' && !window.isAdmin) {
        return;
    }
    const updateAvailable = localStorage.getItem('poznote_update_available');
    if (updateAvailable === 'true') {
        showUpdateBadge();
    }
}

function showMoveFolderFilesDialog(sourceFolderId, sourceFolderName) {
    document.getElementById('sourceFolderName').textContent = sourceFolderName;
    document.getElementById('sourceFolderName').dataset.folderId = sourceFolderId;

    // Get count of files in source folder using RESTful API
    fetch('/api/v1/notes?folder=' + encodeURIComponent(sourceFolderName) + '&workspace=' + encodeURIComponent(selectedWorkspace))
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                var filesCount = data.notes.length;
                var filesText;
                if (window.t) {
                    filesText = (filesCount === 1)
                        ? window.t('folders.move_all.files_count_singular', { count: filesCount }, '1 file will be moved')
                        : window.t('folders.move_all.files_count_plural', { count: filesCount }, '{{count}} files will be moved');
                } else {
                    filesText = filesCount === 1 ? '1 file will be moved' : filesCount + ' files will be moved';
                }
                document.getElementById('filesCountText').textContent = filesText;

                // If folder is empty, show message and disable move button
                if (filesCount === 0) {
                    document.getElementById('filesCountText').textContent = window.t
                        ? window.t('folders.move_all.empty_folder', null, 'This folder is empty')
                        : 'This folder is empty';
                    document.querySelector('#moveFolderFilesModal .btn-primary').disabled = true;
                } else {
                    document.querySelector('#moveFolderFilesModal .btn-primary').disabled = false;
                }
            }
        })
        .catch(function (error) {
            document.getElementById('filesCountText').textContent = window.t
                ? window.t('folders.move_all.unable_to_count_files', null, 'Unable to count files')
                : 'Unable to count files';
        });

    // Populate target folder dropdown
    populateTargetFolderDropdown(sourceFolderId, sourceFolderName);

    // Show modal
    document.getElementById('moveFolderFilesModal').style.display = 'block';
}

function populateTargetFolderDropdown(excludeFolderId, excludeFolderName, selectId, preselectFolderId) {
    // selectId allows populating different modals' select elements
    // preselectFolderId (optional) selects that folder once options are loaded (e.g. a freshly created folder)
    selectId = selectId || 'moveFolderFilesTargetSelect';
    var select = document.getElementById(selectId);
    if (!select) return;
    var workspace = isMoveNoteTargetSelect(selectId) ? getMoveModalWorkspace() : getMoveFallbackWorkspace();
    if (isMoveNoteTargetSelect(selectId)) {
        clearMoveNoteRecentFolders();
    }
    select.innerHTML = '';
    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = window.t ? window.t('modals.folder.no_folder', null, 'No folder') : 'No folder';
    select.appendChild(defaultOption);

    // Get all folders using RESTful API
    fetch('/api/v1/notes?get_folders=1&workspace=' + encodeURIComponent(workspace))
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success && data.folders) {
                for (var folderId in data.folders) {
                    if (!data.folders.hasOwnProperty(folderId)) continue;
                    var folderData = data.folders[folderId];

                    // Don't include the source folder or Favorites in target options
                    if (folderId != excludeFolderId && folderId !== 'favorites') {
                        var option = document.createElement('option');
                        option.value = folderId;
                        // Use full path if available, fallback to name
                        option.textContent = folderData.path || folderData.name;
                        select.appendChild(option);
                    }
                }
                // Don't auto-select any folder - leave "No folder" selected by default
                if (preselectFolderId != null && findSelectOptionByValue(select, preselectFolderId)) {
                    select.value = String(preselectFolderId);
                    try {
                        updateMoveButton(select.value, true);
                    } catch (e) { }
                }
                loadMoveNoteRecentFolders(excludeFolderId, selectId, workspace);
            }
        })
        .catch(function (error) {
            if (isMoveNoteTargetSelect(selectId)) {
                clearMoveNoteRecentFolders();
            }
            showNotificationPopup(
                (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error)),
                'error'
            );
        });

    // If this dropdown is used for the 'move note' modal, wire change handler to enable the Move button
    try {
        select.onchange = function () {
            // Always treat selection as exact match (including "No folder" with empty value)
            // The user explicitly selected an option, so enable Move button
            updateMoveButton(this.value || 'no-folder', true);
            if (isMoveNoteTargetSelect(selectId)) {
                syncMoveNoteRecentSelection(this.value);
            }
        };

        // Initialize button state - "No folder" is pre-selected
        updateMoveButton(select.value || 'no-folder', true);
    } catch (e) {
        // ignore if updateMoveButton is not available in this context
    }
}

function isMoveNoteTargetSelect(selectId) {
    return selectId === 'moveNoteTargetSelect';
}

function getMoveModalWorkspace() {
    var workspaceSelect = document.getElementById('workspaceSelect');
    if (workspaceSelect && workspaceSelect.value !== undefined) {
        return workspaceSelect.value || '';
    }

    return getMoveFallbackWorkspace();
}

function getMoveFallbackWorkspace() {
    try {
        if (typeof getSelectedWorkspace === 'function') {
            return getSelectedWorkspace() || '';
        }
    } catch (e) { }

    return (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace : '';
}

function clearMoveNoteRecentFolders() {
    var container = document.getElementById('moveNoteRecentFolders');
    var list = document.getElementById('moveNoteRecentFoldersList');
    if (list) {
        list.innerHTML = '';
    }
    if (container) {
        container.classList.add('initially-hidden');
    }
}

function findSelectOptionByValue(select, value) {
    if (!select) return null;
    value = String(value);
    for (var i = 0; i < select.options.length; i += 1) {
        if (String(select.options[i].value) === value) {
            return select.options[i];
        }
    }
    return null;
}

function syncMoveNoteRecentSelection(selectedValue) {
    var list = document.getElementById('moveNoteRecentFoldersList');
    if (!list) return;
    selectedValue = String(selectedValue || '');
    list.querySelectorAll('.move-note-recent-folder').forEach(function (button) {
        var isSelected = selectedValue !== '' && button.dataset.folderId === selectedValue;
        button.classList.toggle('is-selected', isSelected);
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
}

function loadMoveNoteRecentFolders(excludeFolderId, selectId, workspace) {
    if (!isMoveNoteTargetSelect(selectId)) {
        return;
    }

    var url = '/api/v1/folders/suggested';
    if (workspace) {
        url += '?workspace=' + encodeURIComponent(workspace);
    }

    fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (!data || !data.success || !Array.isArray(data.folders)) {
                clearMoveNoteRecentFolders();
                return;
            }
            renderMoveNoteRecentFolders(data.folders, excludeFolderId);
        })
        .catch(function (error) {
            console.warn('Error loading recent folders:', error);
            clearMoveNoteRecentFolders();
        });
}

function renderMoveNoteRecentFolders(folders, excludeFolderId) {
    var container = document.getElementById('moveNoteRecentFolders');
    var list = document.getElementById('moveNoteRecentFoldersList');
    var select = document.getElementById('moveNoteTargetSelect');
    if (!container || !list || !select) return;

    list.innerHTML = '';
    var excluded = excludeFolderId == null ? '' : String(excludeFolderId);
    var seen = {};

    folders.forEach(function (folder) {
        var folderId = folder && (folder.id !== undefined ? folder.id : folder.folder_id);
        if (folderId === undefined || folderId === null) return;

        folderId = String(folderId);
        if (!folderId || folderId === excluded || seen[folderId]) return;

        var matchingOption = findSelectOptionByValue(select, folderId);
        if (!matchingOption) return;

        seen[folderId] = true;

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'move-note-recent-folder';
        button.dataset.folderId = folderId;
        button.title = matchingOption.textContent || folder.name || '';
        button.setAttribute('aria-pressed', 'false');

        var icon = document.createElement('i');
        icon.className = 'lucide lucide-folder';

        var text = document.createElement('span');
        text.textContent = matchingOption.textContent || folder.path || folder.name || '';

        button.appendChild(icon);
        button.appendChild(text);
        button.addEventListener('click', function () {
            select.value = folderId;
            updateMoveButton(folderId, true);
            syncMoveNoteRecentSelection(folderId);
        });

        list.appendChild(button);
    });

    container.classList.toggle('initially-hidden', list.children.length === 0);
    syncMoveNoteRecentSelection(select.value);
}

function executeMoveAllFiles() {
    var sourceFolderElement = document.getElementById('sourceFolderName');
    var sourceFolderId = sourceFolderElement.dataset.folderId;
    var targetFolderId = document.getElementById('moveFolderFilesTargetSelect').value;

    // Allow empty value for "No folder" (value will be "" or "0")
    // Only check if source and target are the same
    if (sourceFolderId == targetFolderId && targetFolderId !== '' && targetFolderId !== '0') {
        showNotificationPopup(
            (window.t ? window.t('folders.move_all.same_source_target', null, 'Source and target folders cannot be the same') : 'Source and target folders cannot be the same'),
            'error'
        );
        return;
    }

    // Disable the move button during operation
    var moveButton = document.querySelector('#moveFolderFilesModal .btn-primary');
    var originalText = moveButton.textContent;
    moveButton.disabled = true;
    moveButton.textContent = window.t ? window.t('folders.move_all.moving', null, 'Moving...') : 'Moving...';

    // Move all files
    // Use "0" for "No folder" if targetFolderId is empty
    var targetId = targetFolderId === '' ? '0' : targetFolderId;

    fetch('/api/v1/folders/move-files', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            source_folder_id: parseInt(sourceFolderId),
            target_folder_id: parseInt(targetId),
            workspace: selectedWorkspace
        })
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            // Check if response is actually JSON
            var contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                return response.text().then(function (text) {
                    throw new Error('Expected JSON but received: ' + text.substring(0, 200));
                });
            }

            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Update shared count if notes were shared/unshared
                if (data.share_delta && typeof updateSharedCount === 'function') {
                    updateSharedCount(data.share_delta);
                }
                // Successfully moved files - no notification needed
                closeModal('moveFolderFilesModal');
                // Refresh the page to reflect changes
                location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.move_files_prefix', { error: data.error }, 'Error moving files: {{error}}') : ('Error moving files: ' + data.error)),
                    'error'
                );
                // Re-enable button on error
                moveButton.disabled = false;
                moveButton.textContent = originalText;
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.move_files_prefix', { error: error.message }, 'Error moving files: {{error}}') : ('Error moving files: ' + error.message)),
                'error'
            );
            // Re-enable button on error
            moveButton.disabled = false;
            moveButton.textContent = originalText;
        });
}

function showMoveEntireFolderDialog(folderId, folderName) {
    // Show modal first
    document.getElementById('moveFolderModal').style.display = 'block';

    // Then populate elements
    document.getElementById('moveFolderSourceName').textContent = folderName;
    document.getElementById('moveFolderSourceName').dataset.folderId = folderId;

    // Populate target elements
    var wsSelect = document.getElementById('moveFolderWorkspaceSelect');
    var folderSelect = document.getElementById('moveFolderTargetSelect');
    if (!wsSelect || !folderSelect) {
        console.error('Workspace or folder select element not found');
        return;
    }

    wsSelect.innerHTML = '';
    folderSelect.innerHTML = '';

    // Function to populate folders based on workspace
    var populateFolders = function (workspace, currentFolderId) {
        folderSelect.innerHTML = '';

        // Add "Root" option
        var rootOption = document.createElement('option');
        rootOption.value = '';
        rootOption.textContent = window.t ? window.t('modals.move_folder.root', null, 'Root (Top Level)') : 'Root (Top Level)';
        folderSelect.appendChild(rootOption);

        // Get folders for the selected workspace
        fetch('/api/v1/notes?get_folders=1&workspace=' + encodeURIComponent(workspace))
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success && data.folders) {
                    for (var targetFolderId in data.folders) {
                        if (!data.folders.hasOwnProperty(targetFolderId)) continue;
                        var folderData = data.folders[targetFolderId];

                        // Don't include the source folder itself or Favorites
                        // In cross-workspace move, we can include folders with same ID if they are in different workspaces,
                        // but since IDs are global (auto-increment), sourceFolderId is safe to exclude.
                        if (targetFolderId != currentFolderId && targetFolderId !== 'favorites') {
                            var option = document.createElement('option');
                            option.value = targetFolderId;
                            // Use full path if available, fallback to name
                            option.textContent = folderData.path || folderData.name;
                            folderSelect.appendChild(option);
                        }
                    }
                }
            })
            .catch(function (error) {
                console.error('Error loading folders:', error);
            });
    };

    // Populate workspaces
    fetch('/api/v1/workspaces')
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success && data.workspaces) {
                data.workspaces.forEach(function (ws) {
                    var option = document.createElement('option');
                    option.value = ws.name;
                    option.textContent = ws.name;
                    if (ws.name === selectedWorkspace) {
                        option.selected = true;
                    }
                    wsSelect.appendChild(option);
                });

                // Initial folders population for current workspace
                populateFolders(wsSelect.value, folderId);
            }
        })
        .catch(function (error) {
            console.error('Error loading workspaces:', error);
        });

    // Update folders when workspace changes
    wsSelect.onchange = function () {
        populateFolders(wsSelect.value, folderId);
    };
}

function executeMoveFolderToSubfolder() {
    var sourceFolderElement = document.getElementById('moveFolderSourceName');
    var sourceFolderId = sourceFolderElement.dataset.folderId;
    var sourceFolderName = sourceFolderElement.textContent;
    var targetFolderId = document.getElementById('moveFolderTargetSelect').value;
    var targetWorkspace = document.getElementById('moveFolderWorkspaceSelect').value;

    // Empty value means move to root
    var targetParentId = targetFolderId === '' ? null : parseInt(targetFolderId);

    // Disable the move button during operation
    var moveButton = document.querySelector('#moveFolderModal .btn-primary');
    var originalText = moveButton.textContent;
    moveButton.disabled = true;
    moveButton.textContent = window.t ? window.t('folders.move.moving', null, 'Moving...') : 'Moving...';

    // Prepare the request data
    var requestData = {
        folder_id: parseInt(sourceFolderId),
        workspace: selectedWorkspace,
        target_workspace: targetWorkspace
    };

    // Only add new_parent_folder_id if not moving to root
    if (targetParentId !== null) {
        requestData.new_parent_folder_id = targetParentId;
    } else {
        requestData.new_parent_folder_id = null;
    }

    fetch('/api/v1/folders/' + sourceFolderId + '/move', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) {
            if (!response.ok) {
                return response.json().then(function (data) {
                    throw new Error(data.error || 'HTTP error! status: ' + response.status);
                });
            }
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Successfully moved folder
                showNotificationPopup(
                    (window.t ? window.t('folders.move.success', { folder: sourceFolderName }, 'Folder "{{folder}}" moved successfully') : ('Folder "' + sourceFolderName + '" moved successfully')),
                    'success'
                );
                closeModal('moveFolderModal');
                // Refresh the page to reflect changes
                location.reload();
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.move_folder_prefix', { error: error.message }, 'Error moving folder: {{error}}') : ('Error moving folder: ' + error.message)),
                'error'
            );
            // Re-enable button on error
            moveButton.disabled = false;
            moveButton.textContent = originalText;
        });
}

function editFolderName(folderId, oldName) {
    // Prevent renaming system folders
    if (oldName === 'Favorites' || oldName === 'Tags' || oldName === 'Trash') {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.cannot_rename_system_folders', null, 'Cannot rename system folders') : 'Cannot rename system folders'),
            'error'
        );
        return;
    }

    document.getElementById('editFolderModal').style.display = 'flex';
    document.getElementById('editFolderName').value = oldName;
    document.getElementById('editFolderName').dataset.oldName = oldName;
    document.getElementById('editFolderName').dataset.folderId = folderId;
    document.getElementById('editFolderName').focus();
}

function saveFolderName() {
    var newName = document.getElementById('editFolderName').value.trim();
    var oldName = document.getElementById('editFolderName').dataset.oldName;
    var folderId = document.getElementById('editFolderName').dataset.folderId;

    if (!newName) {
        showNotificationPopup(
            (window.t ? window.t('folders.validation.enter_folder_name', null, 'Please enter a folder name') : 'Please enter a folder name'),
            'error'
        );
        return;
    }

    if (newName === oldName) {
        closeModal('editFolderModal');
        return;
    }

    var ws = getSelectedWorkspace();
    var requestData = {
        name: newName
    };
    if (ws) requestData.workspace = ws;

    fetch('/api/v1/folders/' + folderId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                closeModal('editFolderModal');
                // Folder renamed successfully - no notification needed
                location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.rename_prefix', { error: String(error) }, 'Error renaming folder: {{error}}') : ('Error renaming folder: ' + error)),
                'error'
            );
        });
}

function getFolderContentElements() {
    return Array.prototype.slice.call(document.querySelectorAll('#left_col .folder-content[id]')).filter(function (content) {
        var folderHeader = content.closest('.folder-header');
        return !folderHeader || folderHeader.getAttribute('data-folder') !== 'Favorites';
    });
}

function isFolderContentOpen(content) {
    if (!content) return false;
    var display = content.style.display || window.getComputedStyle(content).display;
    return display !== 'none';
}

function setFolderOpenState(folderId, isOpen) {
    var content = document.getElementById(folderId);
    if (!content) return;

    // Find the corresponding folder header/icon by folder DOM id (e.g. "folder-123")
    var folderNameEl = document.querySelector('.folder-name[data-folder-dom-id="' + folderId + '"]');
    var folderToggle = folderNameEl ? folderNameEl.closest('.folder-toggle') : null;
    var icon = folderToggle ? folderToggle.querySelector('.folder-icon') : null;
    // Determine folder name to avoid changing icon for the Favorites pseudo-folder
    var folderHeader = folderNameEl ? folderNameEl.closest('.folder-header') : null;
    var folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
    var isFavoritesFolder = folderKey === 'Favorites';

    // Check if icon is custom (don't toggle if custom)
    var isCustomIcon = icon && icon.getAttribute('data-custom-icon') === 'true';

    if (isOpen) {
        content.style.display = 'block';
        // show open folder icon (only if not custom and not favorites)
        if (icon && !isFavoritesFolder && !isCustomIcon) {
            icon.classList.remove('lucide-folder');
            icon.classList.add('lucide-folder-open');
        }
        localStorage.setItem('folder_' + folderId, 'open');
    } else {
        content.style.display = 'none';
        // show closed folder icon (only if not custom and not favorites)
        if (icon && !isFavoritesFolder && !isCustomIcon) {
            icon.classList.remove('lucide-folder-open');
            icon.classList.add('lucide-folder');
        }
        localStorage.setItem('folder_' + folderId, 'closed');
    }
}

function getShouldExpandAllFolders() {
    var folderContents = getFolderContentElements();
    if (folderContents.length === 0) return false;

    return folderContents.some(function (content) {
        return !isFolderContentOpen(content);
    });
}

function updateToggleAllFoldersButton() {
    var button = document.querySelector('[data-action="toggle-all-folders"]');
    if (!button) return;

    var folderContents = getFolderContentElements();
    var hasFolders = folderContents.length > 0;
    var shouldExpand = !hasFolders || getShouldExpandAllFolders();
    var icon = button.querySelector('.lucide');
    var title = shouldExpand
        ? (window.t ? window.t('sidebar.expand_all_folders', null, 'Expand all folders') : 'Expand all folders')
        : (window.t ? window.t('sidebar.collapse_all_folders', null, 'Collapse all folders') : 'Collapse all folders');

    button.disabled = !hasFolders;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-expanded', shouldExpand ? 'false' : 'true');

    if (icon) {
        icon.classList.toggle('lucide-chevron-down', shouldExpand);
        icon.classList.toggle('lucide-chevron-up', !shouldExpand);
    }
}

function toggleAllFolders() {
    var folderContents = getFolderContentElements();
    if (folderContents.length === 0) return;

    var shouldOpen = getShouldExpandAllFolders();
    folderContents.forEach(function (content) {
        setFolderOpenState(content.id, shouldOpen);
    });
    updateToggleAllFoldersButton();
}

// Folder management function (open/closed folder icon)
function toggleFolder(folderId) {
    var content = document.getElementById(folderId);
    if (!content) return;

    setFolderOpenState(folderId, !isFolderContentOpen(content));
    updateToggleAllFoldersButton();
}

/**
 * Reveal a folder in the left folder list: expand it and all of its
 * ancestor folders, then scroll to its header and highlight it briefly.
 * Used by the folder breadcrumb segments in the note header.
 * @param {string|number} folderId - The folder database ID
 */
function revealFolderInTree(folderId) {
    var content = document.getElementById('folder-' + folderId);
    var header = document.querySelector(".folder-header[data-folder-key='folder_" + folderId + "']");
    // Folder may be absent from the list (search mode, folder filter)
    if (!content || !header) return;

    // Expand the folder itself and every ancestor folder
    var node = content;
    while (node) {
        if (node.classList.contains('folder-content')) {
            var isHidden = node.style.display === 'none' || window.getComputedStyle(node).display === 'none';
            if (isHidden) toggleFolder(node.id);
        }
        node = node.parentElement ? node.parentElement.closest('.folder-content') : null;
    }

    // On mobile the note view hides the list: switch back to the left column first
    if (window.innerWidth <= 800 && typeof window.scrollToLeftColumn === 'function') {
        window.scrollToLeftColumn();
    }

    header.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    header.classList.add('folder-reveal-highlight');
    setTimeout(function () {
        header.classList.remove('folder-reveal-highlight');
    }, 1600);
}

/**
 * Persist current folder open/closed states to localStorage
 * Useful before actions that reload the page (e.g., drag & drop moves)
 */
function persistFolderStatesFromDOM() {
    const folderToggles = document.querySelectorAll('.folder-name[data-folder-dom-id]');
    let pendingCreateOpenFolders = [];

    try {
        pendingCreateOpenFolders = JSON.parse(sessionStorage.getItem('poznote_create_open_folders') || '[]');
        if (!Array.isArray(pendingCreateOpenFolders)) {
            pendingCreateOpenFolders = [];
        }
    } catch (error) {
        pendingCreateOpenFolders = [];
    }

    folderToggles.forEach(function (toggleElement) {
        const folderDomId = toggleElement.getAttribute('data-folder-dom-id');
        const folderContent = folderDomId ? document.getElementById(folderDomId) : null;
        if (!folderDomId || !folderContent) return;

        const inlineDisplay = folderContent.style.display;
        const isOpen = pendingCreateOpenFolders.indexOf(folderDomId) !== -1
            || (inlineDisplay ? inlineDisplay !== 'none' : window.getComputedStyle(folderContent).display !== 'none');
        localStorage.setItem('folder_' + folderDomId, isOpen ? 'open' : 'closed');
    });
}

/**
 * Restore folder states from localStorage on page load
 * This preserves user preferences for which folders should stay open/closed
 */
function restoreFolderStates() {
    // Get all folder name elements that control toggling
    const folderToggles = document.querySelectorAll('.folder-name[data-folder-dom-id]');

    folderToggles.forEach(function (toggleElement) {
        const folderDomId = toggleElement.getAttribute('data-folder-dom-id');
        const folderContent = folderDomId ? document.getElementById(folderDomId) : null;
        const folderToggle = toggleElement.closest('.folder-toggle');
        const icon = folderToggle ? folderToggle.querySelector('.folder-icon') : null;

        if (!folderContent || !folderDomId) return;

        // Get the folder name to check if it's Favorites
        const folderHeader = toggleElement.closest('.folder-header');
        const folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
        const isFavoritesFolder = folderKey === 'Favorites';

        // Check if icon is custom
        const isCustomIcon = icon && icon.getAttribute('data-custom-icon') === 'true';

        // Check localStorage for this folder's state
        const savedState = localStorage.getItem('folder_' + folderDomId);

        // Only override the PHP-determined state if user has explicitly set a preference
        if (savedState === 'open') {
            // User explicitly opened this folder - keep it open
            folderContent.style.display = 'block';
            if (icon && !isFavoritesFolder && !isCustomIcon) {
                icon.classList.remove('lucide-folder');
                icon.classList.add('lucide-folder-open');
            }
        } else if (savedState === 'closed') {
            // User explicitly closed this folder - keep it closed
            folderContent.style.display = 'none';
            if (icon && !isFavoritesFolder && !isCustomIcon) {
                icon.classList.remove('lucide-folder-open');
                icon.classList.add('lucide-folder');
            }
        }
        // If no saved state exists, leave the folder as it was set by PHP logic
        // This preserves the smart PHP logic for determining initial folder states
    });

    // Favorites are always visible; the old separator toggle is no longer rendered.
    var favoritesHeader = document.querySelector('[data-folder="Favorites"]');
    if (favoritesHeader) {
        favoritesHeader.classList.remove('favorites-collapsed');
        localStorage.removeItem('favorites_collapsed');
    }

    updateToggleAllFoldersButton();
}

function emptyFolder(folderId, folderName) {
    showConfirmModal(
        (window.t ? window.t('folders.empty.title', null, 'Empty Folder') : 'Empty Folder'),
        (window.t
            ? window.t('folders.empty.confirm_message', { folder: folderName }, 'Are you sure you want to move all notes from "{{folder}}" to trash?')
            : ('Are you sure you want to move all notes from "' + folderName + '" to trash?')),
        function () {
            executeEmptyFolder(folderId, folderName);
        },
        {
            danger: true,
            confirmText: (window.t ? window.t('folders.empty.confirm_button', null, 'Send notes to trash') : 'Send notes to trash'),
            hideSaveAndExit: true
        }
    );
}

function executeEmptyFolder(folderId, folderName) {
    var ws = getSelectedWorkspace();
    var requestData = {};
    if (ws) requestData.workspace = ws;

    fetch('/api/v1/folders/' + folderId + '/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                showNotificationPopup(
                    (window.t
                        ? window.t('folders.empty.success_moved_to_trash', { folder: folderName }, 'All notes moved to trash from folder: {{folder}}')
                        : ('All notes moved to trash from folder: ' + folderName))
                );
                location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.empty_folder_prefix', { error: String(error) }, 'Error emptying folder: {{error}}') : ('Error emptying folder: ' + error)),
                'error'
            );
        });
}

// Functions for moving individual notes individuelles vers des dossiers

function showMoveFolderDialog(noteId, forcedFolderId, forcedFolderName) {
    // Check if a valid note is selected
    if (!noteId || noteId == -1 || noteId == '' || noteId == null || noteId === undefined) {
        showNotificationPopup(
            (window.t ? window.t('folders.move_note.select_note_first', null, 'Please select a note first before moving it to a folder.') : 'Please select a note first before moving it to a folder.')
        );
        return;
    }

    noteid = noteId; // Set the current note ID

    // Store noteId in the modal dataset for later use
    var modal = document.getElementById('moveNoteFolderModal');
    if (modal) modal.dataset.noteId = noteId;

    // Get current folder of the note
    // Try provided arguments first, then data attributes from the triggering element (if available), then fallback to hidden inputs
    var currentFolderId = forcedFolderId;
    var currentFolder = forcedFolderName;

    if (currentFolderId === undefined || currentFolderId === null) {
        // Fallback to data attributes if event target is available
        var target = event && event.target ? event.target.closest('[data-action]') : null;
        if (target) {
            currentFolderId = target.dataset.folderId;
            currentFolder = target.dataset.folder;
        }
    }

    if (currentFolderId === undefined || currentFolderId === null) {
        // Final fallback to hidden inputs in the main column (original behavior)
        var folderIdEl = document.getElementById('folderId' + noteId);
        var folderEl = document.getElementById('folder' + noteId);
        currentFolderId = folderIdEl ? folderIdEl.value : '';
        currentFolder = folderEl ? folderEl.value : '';
    }

    // Remember the note's current folder so the dropdown can be rebuilt later
    // (e.g. after creating a folder from within the modal) with the same exclusion
    if (modal) {
        modal.dataset.currentFolderId = (currentFolderId === undefined || currentFolderId === null) ? '' : String(currentFolderId);
        modal.dataset.currentFolderName = currentFolder || '';
    }

    // Load workspaces first
    loadWorkspacesForMoveModal(function () {
        // Load folders after workspaces are loaded
        loadFoldersForMoveModal(currentFolderId, currentFolder);
    });
}

function loadWorkspacesForMoveModal(callback) {
    fetch('/api/v1/workspaces', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                var workspaceSelect = document.getElementById('workspaceSelect');
                workspaceSelect.innerHTML = '';

                // Add current workspace as selected
                var currentWorkspace = getSelectedWorkspace();

                // Add all workspaces
                data.workspaces.forEach(function (workspace) {
                    var option = document.createElement('option');
                    option.value = workspace.name;
                    option.textContent = workspace.name;
                    if (workspace.name === currentWorkspace) {
                        option.selected = true;
                    }
                    workspaceSelect.appendChild(option);
                });

                if (callback) callback();
            }
        })
        .catch(function (error) {
            console.error('Error loading workspaces:', error);
            if (callback) callback();
        });
}

function loadFoldersForMoveModal(currentFolderId, currentFolderName) {
    // Load folders
    var ws = '';
    try {
        ws = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : '';
    } catch (e) { }

    fetch('/api/v1/folders?workspace=' + encodeURIComponent(ws || ''), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            return response.text().then(function (text) {
                if (!text || !text.trim()) {
                    throw new Error('Empty response (HTTP ' + response.status + ')');
                }
                try {
                    return JSON.parse(text);
                } catch (e) {
                    var snippet = text.trim().slice(0, 300);
                    throw new Error('Invalid JSON (HTTP ' + response.status + '): ' + snippet);
                }
            });
        })
        .then(function (data) {
            if (data.success) {
                // Store all folders (excluding current folder)
                allFolders = [];
                if (Array.isArray(data.folders)) {
                    data.folders.forEach(function (folder) {
                        if (folder.id != currentFolderId) {
                            allFolders.push(folder);
                        }
                    });
                }



                // Reset the interface: clear move button state, errors and inline create rows
                updateMoveButton('');
                hideMoveFolderError();
                resetMoveModalCreateRows();

                // Populate and show the modal; focus the select if present
                document.getElementById('moveNoteFolderModal').style.display = 'flex';
                // Populate the specific select inside move-note-folder modal
                populateTargetFolderDropdown(currentFolderId, currentFolderName, 'moveNoteTargetSelect');
                setTimeout(function () {
                    var select = document.getElementById('moveNoteTargetSelect');
                    if (select) select.focus();
                }, 100);
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error))
            );
        });
}

function onWorkspaceChange() {
    // When workspace changes, reload folders for the new workspace
    var newWorkspace = document.getElementById('workspaceSelect').value;

    // Reload workspace background if function exists
    if (typeof window.reloadWorkspaceBackground === 'function') {
        window.reloadWorkspaceBackground();
    }

    // Clear the move modal state
    updateMoveButton('');
    hideMoveFolderError();

    // Load folders for the selected workspace
    fetch('/api/v1/folders?workspace=' + encodeURIComponent(newWorkspace || ''), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) {
            return response.text().then(function (text) {
                if (!text || !text.trim()) {
                    throw new Error('Empty response (HTTP ' + response.status + ')');
                }
                try {
                    return JSON.parse(text);
                } catch (e) {
                    var snippet = text.trim().slice(0, 300);
                    throw new Error('Invalid JSON (HTTP ' + response.status + '): ' + snippet);
                }
            });
        })
        .then(function (data) {
            if (data.success) {
                // Store all folders for the new workspace
                allFolders = data.folders || [];

                // Update the target folder dropdown with folders from the new workspace
                var select = document.getElementById('moveNoteTargetSelect');
                if (select) {
                    clearMoveNoteRecentFolders();
                    select.innerHTML = '<option value="">' + (window.t ? window.t('modals.folder.no_folder', null, 'No folder') : 'No folder') + '</option>';

                    // Populate with folders from the new workspace
                    if (Array.isArray(allFolders)) {
                        allFolders.forEach(function (folder) {
                            // Don't include Favorites in target options
                            if (folder.name !== 'Favorites') {
                                var option = document.createElement('option');
                                option.value = folder.id;
                                option.textContent = folder.name;
                                select.appendChild(option);
                            }
                        });
                    }

                    // Leave "No folder" selected by default (index 0)
                    // Update button state to enable Move button with "No folder" selected
                    updateMoveButton('no-folder', true);
                    loadMoveNoteRecentFolders(null, 'moveNoteTargetSelect', newWorkspace || '');
                }
            }
        })
        .catch(function (error) {
            console.error('Error loading folders for workspace:', error);
            showNotificationPopup(
                (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error))
            );
        });
}

function updateMoveButton(searchTerm, exactMatch) {
    if (exactMatch === undefined) exactMatch = false;
    var button = document.getElementById('moveActionButton');

    if (!searchTerm) {
        button.textContent = window.t ? window.t('common.move', null, 'Move') : 'Move';
        button.disabled = true;
    } else if (exactMatch) {
        button.textContent = window.t ? window.t('common.move', null, 'Move') : 'Move';
        button.disabled = false;
    } else {
        button.textContent = window.t ? window.t('folders.move_note.create_and_move', null, 'Create & Move') : 'Create & Move';
        button.disabled = false;
    }
}

function moveNoteToFolder() {
    var noteId = document.getElementById('moveNoteFolderModal').dataset.noteId;
    // Prefer explicit select dropdown if present (from move files modal). Fallback to old input if still present.
    var select = document.getElementById('moveNoteTargetSelect');
    var targetFolderId = '';
    if (select) {
        // Accept empty value (for "No folder" option)
        targetFolderId = select.value;
    } else {
        // No select available — require explicit selection
        showMoveFolderError(
            window.t ? window.t('folders.move_note.select_target_folder', null, 'Please select a target folder') : 'Please select a target folder'
        );
        return;
    }

    // Get the selected workspace
    var workspaceSelect = document.getElementById('workspaceSelect');
    var targetWorkspace = workspaceSelect ? workspaceSelect.value : (selectedWorkspace || getSelectedWorkspace());

    var requestData = {
        folder_id: targetFolderId,
        workspace: targetWorkspace
    };

    fetch('/api/v1/notes/' + noteId + '/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data && data.success) {
                // Mark note for auto-push since we moved a note (if auto-push enabled)
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                
                // Update shared count if notes were shared/unshared
                if (data.share_delta && typeof updateSharedCount === 'function') {
                    updateSharedCount(data.share_delta);
                }
                try { closeModal('moveNoteFolderModal'); } catch (e) { }
                location.reload();
            } else {
                var err = (data && (data.error || data.message)) ? (data.error || data.message) : 'Unknown error';
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: err }, 'Error: {{error}}') : ('Error: ' + err)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.move_note.errors.move_prefix', { error: String(error) }, 'Error moving note: {{error}}') : ('Error moving note: ' + error)),
                'error'
            );
        });
}

function showMoveFolderError(message) {
    var errorElement = document.getElementById('moveFolderErrorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideMoveFolderError() {
    var errorElement = document.getElementById('moveFolderErrorMessage');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

// --- Inline creation of folders/workspaces from the move note modal ---

function toggleMoveModalCreateRow(rowId, forceShow) {
    var row = document.getElementById(rowId);
    if (!row) return;
    var show = forceShow !== undefined ? forceShow : row.classList.contains('initially-hidden');
    row.classList.toggle('initially-hidden', !show);
    var input = row.querySelector('input');
    if (input) {
        input.value = '';
        if (show) {
            setTimeout(function () { input.focus(); }, 50);
        }
    }
    if (show) hideMoveFolderError();
}

function resetMoveModalCreateRows() {
    toggleMoveModalCreateRow('moveCreateWorkspaceRow', false);
    toggleMoveModalCreateRow('moveCreateFolderRow', false);
}

function toggleMoveCreateWorkspace() {
    toggleMoveModalCreateRow('moveCreateWorkspaceRow');
}

function toggleMoveCreateFolder() {
    toggleMoveModalCreateRow('moveCreateFolderRow');
}

function selectMoveModalWorkspace(name) {
    var workspaceSelect = document.getElementById('workspaceSelect');
    if (!workspaceSelect) return;
    if (!findSelectOptionByValue(workspaceSelect, name)) {
        var option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        workspaceSelect.appendChild(option);
    }
    workspaceSelect.value = name;
    // Reload the folder list for the newly selected workspace
    onWorkspaceChange();
}

function createWorkspaceFromMoveModal() {
    var input = document.getElementById('moveCreateWorkspaceName');
    var name = input ? input.value.trim() : '';
    if (!name) {
        showMoveFolderError(
            window.t ? window.t('modals.move_note_folder.enter_workspace_name', null, 'Please enter a workspace name') : 'Please enter a workspace name'
        );
        return;
    }

    fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: name })
    })
        .then(function (response) {
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            var data = result.data || {};
            if (data.success || result.status === 409) {
                // Created — or it already exists, in which case just switch to it
                hideMoveFolderError();
                toggleMoveModalCreateRow('moveCreateWorkspaceRow', false);
                selectMoveModalWorkspace(data.name || name);
            } else {
                showMoveFolderError(data.message || data.error || 'Error creating workspace');
            }
        })
        .catch(function (error) {
            showMoveFolderError(
                window.t ? window.t('folders.errors.generic_prefix', { error: String(error) }, 'Error: {{error}}') : ('Error: ' + String(error))
            );
        });
}

function createFolderFromMoveModal() {
    var input = document.getElementById('moveCreateFolderName');
    var path = input ? input.value.trim().replace(/^\/+|\/+$/g, '') : '';
    if (!path) {
        showMoveFolderError(
            window.t ? window.t('modals.move_note_folder.enter_folder_name', null, 'Please enter a folder name') : 'Please enter a folder name'
        );
        return;
    }

    var workspace = getMoveModalWorkspace();
    var modal = document.getElementById('moveNoteFolderModal');
    var currentFolderId = modal ? (modal.dataset.currentFolderId || '') : '';
    var currentFolderName = modal ? (modal.dataset.currentFolderName || '') : '';

    fetch('/api/v1/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ workspace: workspace, folder_path: path, create_parents: true })
    })
        .then(function (response) {
            return response.json().then(function (data) {
                return { status: response.status, data: data };
            });
        })
        .then(function (result) {
            var data = result.data || {};
            var folderId = data.folder_id || (data.folder && data.folder.id);
            if (data.success || (result.status === 409 && folderId)) {
                // Created — or it already exists, in which case just select it
                hideMoveFolderError();
                toggleMoveModalCreateRow('moveCreateFolderRow', false);
                // Rebuild the dropdown so the new folder (and any created parents)
                // appear with their full path, then preselect it
                populateTargetFolderDropdown(currentFolderId, currentFolderName, 'moveNoteTargetSelect', folderId);
            } else {
                showMoveFolderError(data.error || data.message || 'Error creating folder');
            }
        })
        .catch(function (error) {
            showMoveFolderError(
                window.t ? window.t('folders.errors.generic_prefix', { error: String(error) }, 'Error: {{error}}') : ('Error: ' + String(error))
            );
        });
}

// executeFolderAction removed


// Function to download a note (handles markdown and HTML)
// Store current export note info
var currentExportNoteId = null;
var currentExportNoteType = null;
var currentExportFilename = null;

// Show export modal
function showExportModal(noteId, filename, title, noteType) {
    currentExportNoteId = noteId;
    currentExportNoteType = noteType;
    currentExportFilename = filename;

    var modal = document.getElementById('exportModal');
    if (modal) {
        // Show/hide options based on note type
        var markdownOption = modal.querySelector('.export-option-markdown');
        var htmlOption = modal.querySelector('.export-option-html');
        var htmlEmbeddedOption = modal.querySelector('.export-option-html-embedded');
        var jsonOption = modal.querySelector('.export-option-json');

        if (noteType === 'markdown') {
            // For markdown notes: allow MD export and HTML export
            if (markdownOption) markdownOption.style.display = 'flex';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'none';
        } else if (noteType === 'tasklist') {
            // For tasklist notes: allow MD export (checkbox format), HTML export and JSON export
            if (markdownOption) markdownOption.style.display = 'flex';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'flex';
        } else {
            // For other notes: show HTML options, hide MD and JSON options
            if (markdownOption) markdownOption.style.display = 'none';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'none';
        }

        modal.style.display = 'flex';
    }
}

// Select export type and execute
function selectExportType(type) {
    closeModal('exportModal');

    exportNoteAsFormat(currentExportNoteId, type, currentExportNoteType);
}

// Unified export function for HTML, Markdown, JSON formats
function exportNoteAsFormat(noteId, format, noteType) {
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) +
        '&type=' + encodeURIComponent(noteType) +
        '&format=' + encodeURIComponent(format);

    var link = document.createElement('a');
    link.href = apiUrl;
    link.download = '';  // Let the server set the filename via Content-Disposition
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Legacy wrappers for backward compatibility
function exportNoteAsHTML(noteId, url, filename, noteType) { exportNoteAsFormat(noteId, 'html', noteType); }
function exportNoteAsMarkdown(noteId, filename, noteType) { exportNoteAsFormat(noteId, 'markdown', noteType); }
function exportNoteAsJSON(noteId, noteType) { exportNoteAsFormat(noteId, 'json', noteType); }

// Export note using browser's native print dialog
function exportNoteToPrint(noteId, noteType) {
    // Open the export URL directly so relative assets resolve correctly,
    // and the printed content matches exactly what the HTML export generates.
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) +
        '&type=' + encodeURIComponent(noteType) +
        '&format=html' +
        '&disposition=inline';

    var printWindow = window.open(apiUrl, '_blank', 'width=800,height=600');
    if (!printWindow) {
        alert('Please allow pop-ups to use the print feature.');
        return;
    }

    printWindow.onload = function () {
        setTimeout(function () {
            printWindow.print();
        }, 250);
    };
}

// Legacy function for backward compatibility
function downloadNote(noteId, url, filename, noteType) {
    showExportModal(noteId, filename, null, noteType);
}

// Unified create functionality
var selectedCreateType = null;
var targetFolderId = null;
var targetFolderName = null;
var isCreatingInFolder = false;

function showCreateModal(folderId = null, folderName = null) {
    targetFolderId = folderId;
    targetFolderName = folderName;
    selectedCreateType = null;
    isCreatingInFolder = !!(folderId || folderName);

    // Update modal title and sections visibility
    var modalTitle = document.getElementById('createModalTitle');
    var otherSection = document.getElementById('otherSection');
    var subfolderOption = document.getElementById('subfolderOption');
    var templateOption = document.querySelector('.create-note-option[data-type="template"]');

    if (isCreatingInFolder) {
        if (window.t) {
            modalTitle.textContent = window.t(
                'modals.create.title_in_folder',
                { folder: (folderName || window.t('modals.create.folder_fallback', null, 'folder')) },
                'Create in {{folder}}'
            );
        } else {
            modalTitle.textContent = 'Create in ' + (folderName || 'folder');
        }
        if (otherSection) otherSection.style.display = 'none';
        // Hide template option when creating in folder
        if (templateOption) templateOption.style.display = 'none';
        // Allow subfolder creation for all folders
        if (subfolderOption) {
            subfolderOption.style.display = 'flex';
        }
    } else {
        modalTitle.textContent = window.t ? window.t('common.create', null, 'Create') : 'Create';
        if (otherSection) otherSection.style.display = 'block';
        if (templateOption) templateOption.style.display = 'flex';
        if (subfolderOption) subfolderOption.style.display = 'none';
    }

    // Reset selection
    var options = document.querySelectorAll('.create-note-option');
    options.forEach(function (option) {
        option.classList.remove('selected');
    });

    // Show modal
    var modal = document.getElementById('createModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Legacy function for backwards compatibility
function showCreateNoteInFolderModal(folderId, folderName) {
    showCreateModal(folderId, folderName);
}

function selectCreateType(createType) {
    selectedCreateType = createType;

    // Close modal immediately
    closeModal('createModal');

    // Create the selected item
    executeCreateAction();
}

// Legacy function for backwards compatibility
function selectNoteType(noteType) {
    selectCreateType(noteType);
}

function executeCreateAction() {
    if (!selectedCreateType) {
        return;
    }

    // Handle different creation types
    switch (selectedCreateType) {
        case 'html':
            createHtmlNote();
            break;
        case 'markdown':
            createMarkdownNoteInUtils();
            break;
        case 'list':
            createTaskListNoteInUtils();
            break;
        case 'folder':
            newFolder();
            break;
        case 'workspace':
            createWorkspace();
            break;
        case 'kanban':
            showKanbanStructureModal();
            break;
        case 'template':
            if (typeof openTemplateNoteSelectorModal === 'function') {
                openTemplateNoteSelectorModal();
            } else {
                console.error('openTemplateNoteSelectorModal function not found');
            }
            break;
        case 'linked':
            if (typeof openLinkedNoteSelectorModal === 'function') {
                openLinkedNoteSelectorModal();
            } else {
                console.error('openLinkedNoteSelectorModal function not found');
            }
            break;
        case 'subfolder':
            if (targetFolderId) {
                var folderKey = 'folder_' + targetFolderId;
                if (typeof createSubfolder === 'function') {
                    createSubfolder(folderKey);
                } else {
                    console.error('createSubfolder function not found');
                }
            } else {
                console.error('No target folder ID for subfolder creation');
            }
            break;
        default:
            console.error('Unknown create type:', selectedCreateType);
    }
}

/**
 * Unified note creation function.
 * @param {string} noteType - The note type for the API ('note', 'tasklist', 'markdown').
 * @param {string[]} globalFnNames - Ordered list of global function names to try before falling back to the API.
 */
function createNoteOfType(noteType, globalFnNames) {
    if (typeof window.showNoteCreationLoading === 'function') {
        window.showNoteCreationLoading();
    }

    if (isCreatingInFolder && targetFolderId) {
        // Mark folder as open in localStorage to keep it open after page reload
        var folderDomId = 'folder-' + targetFolderId;
        localStorage.setItem('folder_' + folderDomId, 'open');

        var originalSelectedFolderId = selectedFolderId;
        var originalSelectedFolder = selectedFolder;
        selectedFolderId = targetFolderId;
        selectedFolder = targetFolderName;

        var created = false;
        for (var i = 0; i < globalFnNames.length; i++) {
            if (typeof window[globalFnNames[i]] === 'function') {
                window[globalFnNames[i]]();
                created = true;
                break;
            }
        }
        if (!created) {
            // Fallback to RESTful API
            fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: targetFolderId, workspace: selectedWorkspace, type: noteType })
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.success && data.note) {
                    // Mark note for auto-push since we created a note (if auto-push enabled)
                    if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }
                    if (typeof window.navigateToCreatedNoteInInternalTab === 'function') {
                        window.navigateToCreatedNoteInInternalTab(
                            data.note.id,
                            data.note.heading,
                            data.note.workspace || selectedWorkspace,
                            data.note.folder_id || targetFolderId
                        );
                    } else {
                        window.location.href = 'index.php?note=' + data.note.id;
                    }
                } else {
                    if (typeof window.hideNoteCreationLoading === 'function') {
                        window.hideNoteCreationLoading();
                    }
                    showNotificationPopup(data.error || data.message || 'Error creating note', 'error');
                }
            }).catch(function (error) {
                if (typeof window.hideNoteCreationLoading === 'function') {
                    window.hideNoteCreationLoading();
                }
                showNotificationPopup('Network error: ' + error.message, 'error');
            });
        }

        // Restore original folder
        selectedFolderId = originalSelectedFolderId;
        selectedFolder = originalSelectedFolder;
    } else {
        // Regular creation (not in specific folder)
        var created = false;
        for (var i = 0; i < globalFnNames.length; i++) {
            if (typeof window[globalFnNames[i]] === 'function') {
                window[globalFnNames[i]]();
                created = true;
                break;
            }
        }
        if (!created) {
            fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspace: selectedWorkspace, type: noteType })
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.success && data.note) {
                    // Mark note for auto-push since we created a note (if auto-push enabled)
                    if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }
                    if (typeof window.navigateToCreatedNoteInInternalTab === 'function') {
                        window.navigateToCreatedNoteInInternalTab(
                            data.note.id,
                            data.note.heading,
                            data.note.workspace || selectedWorkspace,
                            data.note.folder_id || null
                        );
                    } else {
                        window.location.href = 'index.php?note=' + data.note.id;
                    }
                } else {
                    if (typeof window.hideNoteCreationLoading === 'function') {
                        window.hideNoteCreationLoading();
                    }
                    showNotificationPopup(data.error || data.message || 'Error creating note', 'error');
                }
            }).catch(function (error) {
                if (typeof window.hideNoteCreationLoading === 'function') {
                    window.hideNoteCreationLoading();
                }
                showNotificationPopup('Network error: ' + error.message, 'error');
            });
        }
    }
}

function createHtmlNote() {
    createNoteOfType('note', ['newnote', 'createNewNote']);
}

function createTaskListNoteInUtils() {
    createNoteOfType('tasklist', ['createTaskListNote']);
}

function createMarkdownNoteInUtils() {
    createNoteOfType('markdown', ['createMarkdownNote']);
}

function createWorkspace() {
    if (typeof window.showNoteCreationLoading === 'function') {
        window.showNoteCreationLoading();
    }

    // Navigate to the workspaces management page
    window.location = 'workspaces.php';
}

// Legacy function for backwards compatibility
function createNoteInFolder() {
    executeCreateAction();
}

// Folder actions menu toggle functions
//
// A single shared dropdown (#folder-actions-menu, rendered once by
// folders_display.php) serves every folder's three-dot toggle. On open it is
// populated from the toggle's data attributes (folder id/name, note count,
// shared state, current sort) and positioned next to the toggle.

function populateFolderActionsMenu(menu, toggle) {
    var folderId = toggle.getAttribute('data-folder-id') || '';
    var folderName = toggle.getAttribute('data-folder-name') || '';
    var noteCount = parseInt(toggle.getAttribute('data-note-count'), 10) || 0;
    var isShared = toggle.getAttribute('data-shared') === '1';
    var currentSort = toggle.getAttribute('data-current-sort') || '';

    menu.setAttribute('data-folder-id', folderId);

    // Copy folder identity onto every action item (handlers read it there)
    menu.querySelectorAll('[data-action]').forEach(function (item) {
        item.setAttribute('data-folder-id', folderId);
        item.setAttribute('data-folder-name', folderName);
    });

    // Items only relevant when the folder contains notes
    menu.querySelectorAll('.requires-notes').forEach(function (item) {
        item.style.display = noteCount > 0 ? '' : 'none';
    });

    // Share item: show the variant matching the folder's shared state
    menu.querySelectorAll('.share-state-shared').forEach(function (item) {
        item.style.display = isShared ? '' : 'none';
    });
    menu.querySelectorAll('.share-state-not-shared').forEach(function (item) {
        item.style.display = isShared ? 'none' : '';
    });

    // Sort options: highlight the active one and reflect it in the header label
    var activeLabel = null;
    menu.querySelectorAll('[data-action="sort-folder"]').forEach(function (item) {
        var isActive = currentSort && item.getAttribute('data-sort-type') === currentSort;
        item.classList.toggle('active', !!isActive);
        if (isActive) {
            var optionLabel = item.querySelector('.sort-option-label');
            if (optionLabel) activeLabel = optionLabel.textContent;
        }
    });
    var headerLabel = menu.querySelector('.sort-header-label');
    if (headerLabel) {
        headerLabel.textContent = activeLabel || headerLabel.getAttribute('data-default-label') || headerLabel.textContent;
    }

    // Start with the sort submenu collapsed
    menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
        submenu.style.display = 'none';
    });
    menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
        chevron.style.transform = 'rotate(0deg)';
    });
}

function toggleFolderActionsMenu(folderId) {
    var menu = document.getElementById('folder-actions-menu');
    if (!menu) return;

    var toggle = document.querySelector('.folder-actions-toggle[data-folder-id="' + folderId + '"]');
    if (!toggle) return;

    // Clicking the toggle of the folder whose menu is already open closes it;
    // any other toggle re-populates and moves the menu
    var isOpenForFolder = menu.classList.contains('show') &&
        menu.getAttribute('data-folder-id') === String(folderId);

    if (isOpenForFolder) {
        closeFolderActionsMenu(folderId);
        return;
    }

    populateFolderActionsMenu(menu, toggle);
    menu.classList.add('show');
    adjustMenuPosition(menu, toggle);
}

function adjustMenuPosition(menu, toggleButton) {
    // Reset any previous adjustments
    menu.style.bottom = '';
    menu.style.top = '';
    menu.style.marginTop = '';
    menu.style.marginBottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';

    // Position relative to the toggle button (passed for the shared folder
    // menu; falls back to the previous sibling for legacy inline menus)
    toggleButton = toggleButton || menu.previousElementSibling;
    if (!toggleButton) {
        return;
    }

    var toggleRect = toggleButton.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    var viewportWidth = window.innerWidth;

    // Position menu below the toggle button by default (fixed positioning)
    var topPosition = toggleRect.bottom + 4;
    var leftPosition = toggleRect.left;

    menu.style.top = topPosition + 'px';
    menu.style.left = leftPosition + 'px';

    // Now get the menu's dimensions after positioning
    var rect = menu.getBoundingClientRect();

    // Check vertical overflow
    if (rect.bottom > viewportHeight) {
        // Try positioning above instead
        var topAltPosition = toggleRect.top - rect.height - 4;

        if (topAltPosition >= 0) {
            // Fits above
            menu.style.top = topAltPosition + 'px';
            rect = menu.getBoundingClientRect();
        } else {
            // Doesn't fit above either, constrain height below
            var availableHeight = viewportHeight - topPosition - 10;
            menu.style.maxHeight = Math.max(100, availableHeight) + 'px';
            menu.style.overflowY = 'auto';
            rect = menu.getBoundingClientRect();
        }
    }

    // Check horizontal overflow
    var leftCol = document.getElementById('left_col');
    if (leftCol) {
        var leftColRect = leftCol.getBoundingClientRect();

        // If menu overflows right edge of left column, align to right edge of toggle button
        if (rect.right > leftColRect.right) {
            leftPosition = toggleRect.right - rect.width;
            menu.style.left = Math.max(leftColRect.left, leftPosition) + 'px';
        }
    }

    // Also check viewport overflow
    rect = menu.getBoundingClientRect();
    if (rect.right > viewportWidth) {
        leftPosition = viewportWidth - rect.width - 10;
        menu.style.left = Math.max(0, leftPosition) + 'px';
    }
    if (rect.left < 0) {
        menu.style.left = '10px';
    }
}

function closeFolderActionsMenu(folderId) {
    // Single shared menu: folderId is accepted for backwards compatibility
    // but closing is unconditional
    var menu = document.getElementById('folder-actions-menu');
    if (menu) {
        menu.classList.remove('show');
        // Unexpand sort submenus
        menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
            submenu.style.display = 'none';
        });
        menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
            chevron.style.transform = 'rotate(0deg)';
        });
    }
}

// Close folder menus when clicking outside
document.addEventListener('click', function (event) {
    // If click is neither on a folder-actions toggle nor inside the shared
    // dropdown (which lives outside .folder-actions), close all menus
    if (!event.target.closest('.folder-actions') && !event.target.closest('.folder-actions-menu')) {
        document.querySelectorAll('.folder-actions-menu.show').forEach(function (menu) {
            menu.classList.remove('show');
            // Unexpand sort submenus
            menu.querySelectorAll('.sort-submenu').forEach(function (submenu) {
                submenu.style.display = 'none';
            });
            menu.querySelectorAll('.sort-chevron').forEach(function (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            });
        });
    }
});

// ============================================
// Note Conversion Functions
// ============================================

var convertNoteId = null;
var convertNoteTarget = null;

/**
 * Show the convert note confirmation modal
 * @param {string} noteId - The note ID to convert
 * @param {string} target - Target type: 'html' or 'markdown'
 */
function showConvertNoteModal(noteId, target) {
    convertNoteId = noteId;
    convertNoteTarget = target;

    var modal = document.getElementById('convertNoteModal');
    var titleEl = document.getElementById('convertNoteTitle');
    var messageEl = document.getElementById('convertNoteMessage');
    var warningEl = document.getElementById('convertNoteWarning');
    var confirmBtn = document.getElementById('confirmConvertBtn');
    var duplicateBtn = document.getElementById('duplicateBeforeConvertBtn');

    if (!modal) return;

    if (target === 'html') {
        titleEl.textContent = window.t ? window.t('modals.convert.to_html_title', null, 'Convert to HTML') : 'Convert to HTML';
        messageEl.textContent = window.t ? window.t('modals.convert.to_html_message', null, 'This will convert your Markdown note to HTML format.') : 'This will convert your Markdown note to HTML format.';
        warningEl.textContent = window.t ? window.t('modals.convert.to_html_warning', null, 'Before converting this note, you may want to duplicate it to keep a copy in case the conversion doesn\'t meet your expectations.') : 'Before converting this note, you may want to duplicate it to keep a copy in case the conversion doesn\'t meet your expectations.';
    } else {
        titleEl.textContent = window.t ? window.t('modals.convert.to_markdown_title', null, 'Convert to Markdown') : 'Convert to Markdown';
        messageEl.textContent = window.t ? window.t('modals.convert.to_markdown_message', null, 'This will convert your HTML note to Markdown format. Embedded images will be saved as attachments.') : 'This will convert your HTML note to Markdown format. Embedded images will be saved as attachments.';
        warningEl.textContent = window.t ? window.t('modals.convert.to_markdown_warning', null, 'Some complex HTML formatting may not convert perfectly to Markdown.') : 'Some complex HTML formatting may not convert perfectly to Markdown.';
    }

    // Reset duplicate button state
    if (warningEl) warningEl.style.display = '';
    if (duplicateBtn) {
        duplicateBtn.disabled = false;
        duplicateBtn.style.opacity = '';
        duplicateBtn.style.cursor = '';
    }

    confirmBtn.onclick = function () {
        executeNoteConversion();
    };

    if (duplicateBtn) {
        duplicateBtn.onclick = function () {
            // Duplicate the note without reloading the page
            fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin'
            })
                .then(function (response) {
                    return response.json();
                })
                .then(function (data) {
                    if (data.success) {
                        // Update shared count if note was auto-shared
                        if (data.share_delta && typeof updateSharedCount === 'function') {
                            updateSharedCount(data.share_delta);
                        }
                        // Hide the warning message and disable the duplicate button
                        if (warningEl) warningEl.style.display = 'none';
                        duplicateBtn.disabled = true;
                        duplicateBtn.style.opacity = '0.5';
                        duplicateBtn.style.cursor = 'not-allowed';
                    }
                })
                .catch(function (error) {
                    console.error('Duplicate error:', error);
                });
        };
    }

    modal.style.display = 'flex';
}

/**
 * Execute the note conversion
 */
function executeNoteConversion() {
    if (!convertNoteId || !convertNoteTarget) return;

    closeModal('convertNoteModal');

    fetch('/api/v1/notes/' + encodeURIComponent(convertNoteId) + '/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ target: convertNoteTarget })
    })
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            if (data.success) {
                // Reload the page to show the converted note
                window.location.reload();
            } else {
                showNotificationPopup(data.error || (window.t ? window.t('modals.convert.error', null, 'Failed to convert note') : 'Failed to convert note'), 'error');
            }
        })
        .catch(function (error) {
            console.error('Convert error:', error);
            showNotificationPopup(window.t ? window.t('modals.convert.error', null, 'Failed to convert note') : 'Failed to convert note', 'error');
        });

    // Reset
    convertNoteId = null;
    convertNoteTarget = null;
}

// ============================================
// Kanban View Functions
// ============================================

function setRightColumnContentPreservingTabs(html) {
    var rightCol = document.getElementById('right_col');
    if (!rightCol) {
        console.error('right_col element not found');
        return;
    }
    if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
        window.destroyMarkdownCodeMirrorEditorsWithin(rightCol);
    }
    rightCol.innerHTML = html;
}

function resetKanbanViewState() {
    window._isKanbanViewActive = false;
    window._kanbanFolderId = null;
    window._originalRightColContent = null;
    document.body.classList.remove('kanban-active');

    var isMobileClose = window.innerWidth <= 800;
    if (isMobileClose) {
        if (window._outlineWasMobileOpen) {
            document.body.classList.add('outline-mobile-open');
        }
        window._outlineWasMobileOpen = null;
    } else {
        if (window._outlineWasCollapsed === false) {
            document.documentElement.classList.remove('outline-collapsed');
            document.body.classList.remove('outline-collapsed');
        }
        window._outlineWasCollapsed = null;
    }
}

function activateKanbanViewState(folderId) {
    var wasKanbanActive = !!window._isKanbanViewActive;

    window._isKanbanViewActive = true;
    window._kanbanFolderId = folderId;
    document.body.classList.add('kanban-active');

    var isMobileKanban = window.innerWidth <= 800;
    if (isMobileKanban) {
        if (!wasKanbanActive) {
            window._outlineWasMobileOpen = document.body.classList.contains('outline-mobile-open');
        }
        document.body.classList.remove('outline-mobile-open');
    } else {
        if (!wasKanbanActive) {
            window._outlineWasCollapsed = document.body.classList.contains('outline-collapsed');
        }
        document.documentElement.classList.add('outline-collapsed');
        document.body.classList.add('outline-collapsed');
    }
}

function buildKanbanUrl(folderId, workspace) {
    var newUrl = 'index.php?kanban=' + encodeURIComponent(folderId);
    if (workspace) {
        newUrl += '&workspace=' + encodeURIComponent(workspace);
    }
    return newUrl;
}

function getKanbanLoadingHtml() {
    return '<div class="kanban-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><i class="lucide lucide-loader-2 lucide-spin" style="font-size: 2rem; margin-right: 12px;"></i> ' +
        (window.t ? window.t('common.loading', null, 'Loading...') : 'Loading...') + '</div>';
}

function getKanbanErrorHtml() {
    return '<div class="kanban-error" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">' +
        '<i class="lucide lucide-alert-triangle" style="font-size: 3rem; margin-bottom: 16px; color: #f59e0b;"></i>' +
        '<p>' + (window.t ? window.t('common.error', null, 'Error') : 'Error') + '</p>' +
        '<button onclick="closeKanbanView()" class="btn btn-primary" style="margin-top: 16px;">' +
        (window.t ? window.t('common.back_to_notes', null, 'Notes') : 'Notes') + '</button></div>';
}

/**
 * Open Kanban view for a folder (inline in right column)
 * @param {number} folderId - The folder ID
 * @param {string} folderName - The folder name
 */
function loadKanbanViewInline(folderId, folderName, options) {
    options = options || {};
    var workspace = getSelectedWorkspace();
    var rightCol = document.getElementById('right_col');

    if (!rightCol) {
        console.error('right_col element not found');
        return;
    }

    if (typeof window.releaseCurrentNoteEditLock === 'function') {
        window.releaseCurrentNoteEditLock();
    }
    if (typeof window.noteid !== 'undefined') {
        window.noteid = -1;
    }

    // Store original content for restoration
    if (!options.fromTabManager && !window._originalRightColContent) {
        window._originalRightColContent = rightCol.innerHTML;
    }

    // Show loading state
    setRightColumnContentPreservingTabs(getKanbanLoadingHtml());

    // Build AJAX URL
    var url = 'kanban_content.php?ajax=1&folder_id=' + folderId;
    if (workspace) {
        url += '&workspace=' + encodeURIComponent(workspace);
    }

    // Fetch Kanban content
    return fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'text/html' }
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.text();
        })
        .then(function (html) {
            setRightColumnContentPreservingTabs(html);

            if (typeof window.bindKanbanScrollButtons === 'function') {
                window.bindKanbanScrollButtons();
            }

            activateKanbanViewState(folderId);

            // Remove selection from any notes in the sidebar
            document.querySelectorAll('.links_arbo_left.selected-note').forEach(function (el) {
                el.classList.remove('selected-note');
            });

            // Update URL
            var newUrl = buildKanbanUrl(folderId, workspace);

            // If we are already on this kanban view (e.g. page refresh), use replaceState
            var urlParams = new URLSearchParams(window.location.search);
            if (options.replaceHistory || urlParams.get('kanban') == folderId) {
                history.replaceState({ kanban: folderId }, '', newUrl);
            } else {
                history.pushState({ kanban: folderId }, '', newUrl);
            }

            // On mobile, scroll to right column
            if (window.innerWidth <= 800 && typeof window.scrollToRightColumn === 'function') {
                window.scrollToRightColumn();
            }
        })
        .catch(function (error) {
            console.error('Failed to load Kanban view:', error);
            setRightColumnContentPreservingTabs(getKanbanErrorHtml());
        });
}

function openKanbanView(folderId, folderName, options) {
    options = options || {};

    var tabManagerReady = window.tabManager &&
        typeof window.tabManager.openKanbanTab === 'function' &&
        (typeof window.tabManager.isInitialized !== 'function' || window.tabManager.isInitialized());

    if (!options.skipTabManager && tabManagerReady && window.innerWidth > 800) {
        window.tabManager.openKanbanTab(folderId, folderName);
        return;
    }

    return loadKanbanViewInline(folderId, folderName, options);
}

/**
 * Refresh the current Kanban view if it's active
 */
function refreshKanbanView() {
    if (window._isKanbanViewActive && window._kanbanFolderId) {
        loadKanbanViewInline(window._kanbanFolderId, null, { skipTabManager: true, fromTabManager: true, replaceHistory: true });
    }
}

/**
 * Close Kanban view and restore normal content
 */
function closeKanbanView() {
    var rightCol = document.getElementById('right_col');

    if (window.tabManager && window.innerWidth > 800 && typeof window.tabManager.getActiveTabType === 'function' && window.tabManager.getActiveTabType() === 'kanban') {
        if (typeof window.tabManager.closeActiveTab === 'function' && window.tabManager.closeActiveTab(false)) {
            return;
        }
        if (typeof window.tabManager.closeActiveTab === 'function' && window.tabManager.closeActiveTab(true)) {
            setRightColumnContentPreservingTabs('');
        }
    }

    if (window._originalRightColContent && rightCol) {
        rightCol.innerHTML = window._originalRightColContent;
        window._originalRightColContent = null;
    }

    resetKanbanViewState();

    // Update URL back to normal
    var workspace = getSelectedWorkspace();
    var newUrl = 'index.php';
    if (workspace) {
        newUrl += '?workspace=' + encodeURIComponent(workspace);
    }
    history.pushState({}, '', newUrl);
}

// Expose closeKanbanView globally
window.closeKanbanView = closeKanbanView;
window.resetKanbanViewState = resetKanbanViewState;


/**
 * Show the Kanban structure modal
 */
function showKanbanStructureModal() {
    var modal = document.getElementById('kanbanStructureModal');
    if (modal) {
        // Reset form
        var folderNameInput = document.getElementById('kanbanFolderName');
        var columnsInput = document.getElementById('kanbanColumnsCount');
        if (folderNameInput) folderNameInput.value = '';
        if (columnsInput) columnsInput.value = '3';

        modal.style.display = 'flex';
    }
}

/**
 * Create a Kanban structure
 */
function createKanbanStructure() {
    var folderNameInput = document.getElementById('kanbanFolderName');
    var columnsInput = document.getElementById('kanbanColumnsCount');

    if (!folderNameInput || !columnsInput) {
        console.error('Kanban structure inputs not found');
        return;
    }

    var folderName = folderNameInput.value.trim();
    var columns = parseInt(columnsInput.value, 10);

    // If no folder name is provided, use the placeholder value
    if (!folderName) {
        folderName = folderNameInput.placeholder || (window.t ? window.t('modals.kanban_structure.folder_name_placeholder', null, 'My Kanban Board') : 'My Kanban Board');
    }

    if (isNaN(columns) || columns < 1 || columns > 9) {
        showNotificationPopup(
            window.t ? window.t('modals.kanban_structure.error_columns_range', null, 'Number of columns must be between 1 and 9') : 'Number of columns must be between 1 and 9',
            'error'
        );
        return;
    }

    // Get current language from document
    var language = document.documentElement.lang || 'en';

    // Close modal
    closeModal('kanbanStructureModal');

    if (typeof window.showNoteCreationLoading === 'function') {
        window.showNoteCreationLoading();
    }

    // Create the structure via API
    var data = {
        folder_name: folderName,
        columns: columns,
        workspace: selectedWorkspace || getSelectedWorkspace(),
        language: language
    };

    fetch('/api/v1/folders/kanban-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
    })
        .then(function (response) {
            if (!response.ok) {
                return response.json().then(function (errorData) {
                    throw new Error(errorData.error || errorData.message || 'Unknown error');
                });
            }
            return response.json();
        })
        .then(function (data) {
            if (data.success && data.folder_id) {
                // Success - close modal and open Kanban inline view
                closeModal('kanbanStructureModal');

                // If on create.php, redirect to index.php with kanban parameter
                if (window.location.pathname.endsWith('create.php')) {
                    var ws = selectedWorkspace || getSelectedWorkspace();
                    var wsStr = ws ? '&workspace=' + encodeURIComponent(ws) : '';
                    window.location.href = 'index.php?kanban=' + data.folder_id + wsStr;
                } else {
                    if (typeof window.refreshNotesListAfterFolderAction === 'function') {
                        window.refreshNotesListAfterFolderAction();
                    }
                    // Delay slightly to let sidebar refresh, then open Kanban
                    setTimeout(function () {
                        if (typeof openKanbanView === 'function') {
                            openKanbanView(data.folder_id);
                        }
                    }, 300);
                }
            } else {
                if (typeof window.hideNoteCreationLoading === 'function') {
                    window.hideNoteCreationLoading();
                }
                showNotificationPopup(
                    data.error || (window.t ? window.t('modals.kanban_structure.error_create', null, 'Failed to create Kanban structure') : 'Failed to create Kanban structure'),
                    'error'
                );
            }
        })
        .catch(function (error) {
            if (typeof window.hideNoteCreationLoading === 'function') {
                window.hideNoteCreationLoading();
            }
            showNotificationPopup(
                window.t ? window.t('modals.kanban_structure.error_create_prefix', { error: error.message }, 'Error creating Kanban structure: {{error}}') : ('Error creating Kanban structure: ' + error.message),
                'error'
            );
        });
}

/**
 * Shows a simple information modal
 * @param {string} title 
 * @param {string} message 
 * @param {boolean} reloadAfter 
 */
function showInfoModal(title, message, reloadAfter = false) {
    const modal = document.getElementById('infoModal');
    const titleEl = document.getElementById('infoModalTitle');
    const messageEl = document.getElementById('infoModalMessage');

    if (!modal || !titleEl || !messageEl) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    window.reloadAfterInfoModal = reloadAfter;

    modal.style.display = 'flex';
}

/**
 * Open all notes in a folder in separate tabs
 * @param {number} folderId - The folder ID
 * @param {string} folderName - The folder name
 */
function openAllFolderNotesInTabs(folderId, folderName) {
    // Check if tabs are enabled
    if (!window.tabManager || !window.tabManager.openInNewTab) {
        console.error('Tab manager not available');
        showInfoModal(
            window.t ? window.t('common.error', null, 'Error') : 'Error',
            window.t ? window.t('notes_list.folder_actions.tabs_not_available', null, 'Tabs are not available on mobile devices') : 'Tabs are not available on mobile devices'
        );
        return;
    }

    // Find all notes in the folder
    // Notes have class 'links_arbo_left' and data-folder-id attribute
    var noteLinks = document.querySelectorAll('.links_arbo_left[data-folder-id="' + folderId + '"]');

    if (noteLinks.length === 0) {
        showInfoModal(
            window.t ? window.t('notes_list.folder_actions.no_notes_title', null, 'No notes') : 'No notes',
            window.t ? window.t('notes_list.folder_actions.no_notes_in_folder', null, 'This folder contains no notes') : 'This folder contains no notes'
        );
        return;
    }

    // Limit the number of tabs to avoid overwhelming the browser
    var maxTabs = 20;
    if (noteLinks.length > maxTabs) {
        var message = window.t
            ? window.t('notes_list.folder_actions.too_many_notes', {count: noteLinks.length, max: maxTabs}, 'This folder contains {count} notes. Only the first {max} will be opened to avoid overwhelming your browser.')
            : 'This folder contains ' + noteLinks.length + ' notes. Only the first ' + maxTabs + ' will be opened to avoid overwhelming your browser.';

        if (!confirm(message)) {
            return;
        }
    }

    // Open each note in a new tab
    var notesToOpen = Array.from(noteLinks).slice(0, maxTabs);
    notesToOpen.forEach(function(noteLink, index) {
        var noteId = noteLink.getAttribute('data-note-id');
        var noteTitleElement = noteLink.querySelector('.note-title');
        var noteTitle = noteTitleElement ? noteTitleElement.textContent.trim() : noteLink.textContent.trim();

        if (noteId) {
            // Add a small delay between opening tabs to avoid overwhelming the browser
            setTimeout(function() {
                window.tabManager.openInNewTab(noteId, noteTitle);
            }, index * 100); // 100ms delay between each tab
        }
    });
}

// Export to window
window.openKanbanView = openKanbanView;
window.openAllFolderNotesInTabs = openAllFolderNotesInTabs;
window.showInfoModal = showInfoModal;

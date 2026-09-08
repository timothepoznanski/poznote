// Folder and workspace management for Poznote.
// 
// Creating, renaming, deleting, duplicating and downloading folders, plus creating and
// deleting workspaces. The folder tree's open/closed state lives in utils-folder-tree.js.

// Folder management
var currentFolderToDelete = { id: null, name: null };

/**
 * New root folder. The name is typed into a draft row in the tree; the modal
 * is only used where there is no tree, i.e. create.php.
 */
function newFolder() {
    if (window.PoznoteInlineTreeEdit && window.PoznoteInlineTreeEdit.createFolder(null)) {
        return;
    }
    newFolderViaModal();
}

function newFolderViaModal() {
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
                // Undo support (js/tree-undo-clipboard.js): the snapshot
                // rebuilds the folder tree and untrashes its notes
                if (window.PoznoteTreeHistory && data.restore_snapshot) {
                    window.PoznoteTreeHistory.record({
                        type: 'folder-delete',
                        folderId: String(folderId),
                        snapshot: data.restore_snapshot
                    });
                }

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
                            console.debug('utils-folders: executeDeleteFolderOperation() failed:', e);
                        }
                    }
                    // Also remove any saved folder search/filter state for this folder name

                } catch (e) {
                    // ignore any errors while trying to clean localStorage
                    console.debug('utils-folders: executeDeleteFolderOperation() failed:', e);
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

/**
 * Duplicate a folder with all its notes and subfolders.
 *
 * The copy lands next to the original under a unique name; the page reloads
 * so the tree picks it up, like the other folder actions.
 */
function duplicateFolder(folderId, folderName) {
    var ws = typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '';

    fetch('/api/v1/folders/' + encodeURIComponent(folderId) + '/duplicate?workspace=' + encodeURIComponent(ws || ''), {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: '{}'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                // New notes were created: mark for auto-push (if enabled)
                if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }
                window.location.reload();
            } else {
                var message = data.error || data.message || 'Unknown error';
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: message }, 'Error: {{error}}') : ('Error: ' + message)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.duplicate_prefix', { error: String(error) }, 'Error duplicating folder: {{error}}') : ('Error duplicating folder: ' + error)),
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
                                                try { localStorage.removeItem('folder_' + content.id); } catch (e) {
                                                    console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                                }
                                            }

                                        }
                                    } catch (e) {
                                        console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                    }
                                }


                            } catch (e) {
                                console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                            }

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
                                    try { console.debug && console.debug('workspace delete: starting aggressive localStorage scan'); } catch (e) {
                                        console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                    }
                                    for (var i = 0; i < localStorage.length; i++) {
                                        var key = localStorage.key(i);
                                        if (!key) continue;
                                        if (key.indexOf('folder_') === 0) {
                                            keysToDelete.push(key);
                                        }
                                    }
                                    try { console.debug && console.debug('workspace delete: keys to delete', keysToDelete); } catch (e) {
                                        console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                    }
                                } catch (e) { keysToDelete = []; }

                                for (var k = 0; k < keysToDelete.length; k++) {
                                    try { localStorage.removeItem(keysToDelete[k]); } catch (e) {
                                        console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                    }
                                }
                                try { console.debug && console.debug('workspace delete: aggressive localStorage cleanup done'); } catch (e) {
                                    console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                                }
                            } catch (e) {
                                console.debug('utils-folders: deleteCurrentWorkspace() failed:', e);
                            }

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

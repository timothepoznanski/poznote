// Moving a single note in Poznote.
// 
// The move-note modal: picking a target workspace and folder, creating either one from
// inside the modal, and performing the move.

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

    var noteBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.noteState(noteId) : null;

    fetch('/api/v1/notes/' + noteId + '/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data && data.success) {
                // Undo support (js/tree-undo-clipboard.js)
                if (window.PoznoteTreeHistory && noteBefore) {
                    window.PoznoteTreeHistory.record({
                        type: 'note-move',
                        noteId: String(noteId),
                        from: { folderId: noteBefore.folderId, workspace: noteBefore.workspace },
                        to: { folderId: targetFolderId ? String(targetFolderId) : null, workspace: targetWorkspace }
                    });
                }

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

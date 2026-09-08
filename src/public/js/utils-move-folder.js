// Moving a folder's contents in Poznote.
// 
// The "move all notes from this folder" and "move this folder into another" dialogs,
// including the target-folder dropdown and the recently-used folder shortcuts.

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
                    } catch (e) {
                        console.debug('utils-move-folder: populateTargetFolderDropdown() failed:', e);
                    }
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
        console.debug('utils-move-folder: populateTargetFolderDropdown() failed:', e);
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
    } catch (e) {
        console.debug('utils-move-folder: getMoveFallbackWorkspace() failed:', e);
    }

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
                // Prefer the message the server sent over a bare status code:
                // the API answers 4xx with {"error": "..."} and that text is what
                // the user needs to see.
                return response.json()
                    .catch(function () { return {}; })
                    .then(function (data) {
                        throw new Error(data.error || data.message || ('HTTP error! status: ' + response.status));
                    });
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

    var folderBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.folderState(sourceFolderId) : null;

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
                // Undo support (js/tree-undo-clipboard.js)
                if (window.PoznoteTreeHistory && folderBefore) {
                    window.PoznoteTreeHistory.record({
                        type: 'folder-move',
                        folderId: String(sourceFolderId),
                        from: {
                            parentId: folderBefore.parentId,
                            workspace: folderBefore.workspace,
                            prevSiblingId: folderBefore.prevSiblingId,
                            nextSiblingId: folderBefore.nextSiblingId
                        },
                        to: { parentId: targetParentId !== null ? String(targetParentId) : null, workspace: targetWorkspace }
                    });
                }

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

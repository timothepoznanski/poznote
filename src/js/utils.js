// Utility and miscellaneous functions

function startDownload() {
    window.location = 'export_entries.php';
}

function showNoteInfo(noteId, created, updated, folder, favorite, tags, attachmentsCount) {
    if (!noteId) {
        alert('Error: No note ID provided');
        return;
    }
    
    try {
        var wsParam = selectedWorkspace ? ('&workspace=' + encodeURIComponent(selectedWorkspace)) : '';
        var url = 'info.php?note_id=' + encodeURIComponent(noteId) + wsParam;
        window.location.href = url;
    } catch (error) {
        alert('Error displaying information: ' + error.message);
    }
}

function toggleFavorite(noteId) {
    // Check if there are unsaved modifications and save them first
    if (editedButNotSaved === 1 && updateNoteEnCours === 0 && noteid && noteid == noteId) {
        var entryElement = document.getElementById('inp' + noteId);
        var tagsElement = document.getElementById('tags' + noteId);
        var folderElement = document.getElementById('folder' + noteId);
        var contentElement = document.getElementById('entry' + noteId);
        
        if (entryElement && tagsElement && folderElement && contentElement) {
            displaySavingInProgress();
            
            var ent = cleanSearchHighlightsFromElement(contentElement);
            ent = ent.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
            
            var entcontent = getTextContentFromElement(contentElement);
            
            var params = new URLSearchParams({
                id: noteId,
                heading: entryElement.value,
                entry: ent,
                tags: tagsElement.value,
                folder: folderElement.value,
                workspace: selectedWorkspace || 'Poznote',
                entrycontent: entcontent,
                now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60
            });
            
            fetch("update_note.php", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString()
            })
            .then(function(response) { return response.text(); })
            .then(function(data) {
                try {
                    var jsonData = JSON.parse(data);
                    if (jsonData.status === 'error') {
                        showNotificationPopup('Save error: ' + jsonData.message, 'error');
                        editedButNotSaved = 1;
                        updateNoteEnCours = 0;
                        setSaveButtonRed(true);
                    } else {
                        editedButNotSaved = 0;
                        updateNoteEnCours = 0;
                        setSaveButtonRed(false);
                        performFavoriteToggle(noteId);
                    }
                } catch(e) {
                    editedButNotSaved = 0;
                    var lastUpdatedElem = document.getElementById('lastupdated' + noteid);
                    if (lastUpdatedElem) {
                        lastUpdatedElem.innerHTML = data == '1' ? 'Saved today' : data;
                    }
                    updateNoteEnCours = 0;
                    setSaveButtonRed(false);
                    performFavoriteToggle(noteId);
                }
            })
            .catch(function(error) {
                showNotificationPopup('Network error while saving: ' + error.message, 'error');
                editedButNotSaved = 1;
                updateNoteEnCours = 0;
                setSaveButtonRed(true);
            });
        } else {
            performFavoriteToggle(noteId);
        }
    } else {
        performFavoriteToggle(noteId);
    }
}

function performFavoriteToggle(noteId) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'api_favorites.php', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                var response = JSON.parse(xhr.responseText);
                if (response.success) {
                    var starIcon = document.querySelector('button[onclick*="toggleFavorite(\'' + noteId + '\')"] i');                    
                    editedButNotSaved = 0;
                    updateNoteEnCours = 0;
                    
                    setTimeout(function() {
                        window.location.reload();
                    }, 50);
                } else {
                    showNotificationPopup('Error: ' + response.message);
                }
            } catch (e) {
                showNotificationPopup('Error updating favorites');
            }
        }
    };
    
    xhr.send('action=toggle_favorite&note_id=' + encodeURIComponent(noteId) + '&workspace=' + encodeURIComponent(selectedWorkspace || 'Poznote'));
}

function duplicateNote(noteId) {
    fetch('api_duplicate_note.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ note_id: noteId })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success && data.id) {
            // Stay on current note - just reload the page to refresh the list
            window.location.reload();
        } else {
            // Fallback: reload the page
            window.location.reload();
        }
    })
    .catch(function(error) {
        // Silent error handling - reload the page
        window.location.reload();
    });
}

// Folder management
var currentFolderToDelete = null;

function newFolder() {
    showInputModal('New Folder', 'New folder name', '', function(folderName) {
        if (!folderName) return;
        
        var data = {
            folder_name: folderName,
            workspace: selectedWorkspace || 'Poznote'
        };
        
        fetch('api_create_folder.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(data)
        })
        .then(function(response) {
            if (!response.ok) {
                return response.json().then(function(errorData) {
                    throw new Error(errorData.error || errorData.message || 'Unknown error');
                });
            }
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                // Folder created successfully - no notification needed
                window.location.reload();
            } else {
                showNotificationPopup('Error creating folder: ' + (data.message || data.error), 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup('Error creating folder: ' + error.message, 'error');
        });
    });
}function deleteFolder(folderName) {
    // First, check how many notes sont dans ce dossier
    var params = new URLSearchParams({
        action: 'count_notes_in_folder',
        folder_name: folderName
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);

    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var noteCount = data.count || 0;
            
            // If the folder is empty, delete without confirmation
            if (noteCount === 0) {
                executeDeleteFolderOperation(folderName);
                return;
            }
            
            // For folders with notes, show a confirmation
            var confirmMessage = 'Are you sure you want to delete the folder "' + folderName + '"?\n' + noteCount + ' note' + (noteCount > 1 ? 's' : '') + ' will be moved to "' + getDefaultFolderName() + '".\n\nIf you want to delete all notes in this folder, you can move them to "' + getDefaultFolderName() + '" then empty this folder.';
            
            showDeleteFolderModal(folderName, confirmMessage);
        } else {
            showNotificationPopup('Error checking folder content: ' + data.error, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error checking folder content: ' + error, 'error');
    });
}

function showDeleteFolderModal(folderName, message) {
    currentFolderToDelete = folderName;
    var messageElement = document.getElementById('deleteFolderMessage');
    var modal = document.getElementById('deleteFolderModal');
    
    if (messageElement) {
        messageElement.textContent = message;
    }
    if (modal) {
        modal.style.display = 'flex';
    }
}

function executeDeleteFolder() {
    if (currentFolderToDelete) {
        executeDeleteFolderOperation(currentFolderToDelete);
    }
    
    closeModal('deleteFolderModal');
    currentFolderToDelete = null;
}

function executeDeleteFolderOperation(folderName) {
    var deleteParams = new URLSearchParams({
        action: 'delete',
        folder_name: folderName
    });
    var ws = getSelectedWorkspace();
    if (ws) deleteParams.append('workspace', ws);
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: deleteParams.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
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
                                    try { console.debug && console.debug('localStorage: removed folder_' + content.id); } catch(e){}
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
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error deleting folder: ' + error, 'error');
    });
}

function selectFolder(folderName, element) {
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

// Workspace management (creation/deletion)
function showNewWorkspacePrompt() {
    var name = prompt('Nom du nouveau workspace:');
    if (!name) return;
    
    // Validate allowed characters
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        showNotificationPopup('Invalid workspace name: use only letters, numbers, hyphens or underscores (no spaces)', 'error');
        return;
    }
    
    var params = new URLSearchParams({ action: 'create', name: name });
    
    fetch('api_workspaces.php', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
        body: params.toString() 
    })
    .then(function(response) { return response.json(); })
    .then(function(res) {
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
                try { 
                    localStorage.setItem('poznote_selected_workspace', name); 
                } catch(e) {}
                
                refreshLeftColumnForWorkspace(name);
                // Workspace created and selected - no notification needed
            } else {
                // Fallback: reload the page
                var url = new URL(window.location.href);
                url.searchParams.set('workspace', name);
                window.location.href = url.toString();
            }
        } else {
            showNotificationPopup('Error creating workspace: ' + (res.message || 'unknown'), 'error');
        }
    })
    .catch(function(err) { 
        showNotificationPopup('Network error', 'error'); 
    });
}

function deleteCurrentWorkspace() {
    var sel = document.getElementById('workspaceSelector');
    if (!sel) return;
    
    var name = sel.value;
    if (!name || name === 'Poznote') { 
        showNotificationPopup('Cannot delete default workspace', 'error'); 
        return; 
    }
    
    if (confirm('Delete workspace "' + name + '"? Notes will be moved to the default workspace.')) {
        var params = new URLSearchParams({ action: 'delete', name: name });
        
        fetch('api_workspaces.php', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
            body: params.toString() 
        })
        .then(function(response) { return response.json(); })
        .then(function(res) {
            if (res.success) {
                selectedWorkspace = 'Poznote';
                try { 
                    localStorage.setItem('poznote_selected_workspace', 'Poznote'); 
                } catch(e) {}
                
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
                                    try { localStorage.removeItem('folder_' + content.id); } catch(e) {}
                                }
                                
                            }
                        } catch(e) {}
                    }

                    
                } catch(e) {}

                // Remove option from selector
                for (var i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === name) {
                        sel.removeChild(sel.options[i]);
                        break;
                    }
                }
                sel.value = 'Poznote';
                
                // Aggressive cleanup: remove any localStorage keys related to folders
                try {
                    var keysToDelete = [];
                    try {
                        try { console.debug && console.debug('workspace delete: starting aggressive localStorage scan'); } catch(e){}
                        for (var i = 0; i < localStorage.length; i++) {
                            var key = localStorage.key(i);
                            if (!key) continue;
                            if (key.indexOf('folder_') === 0) {
                                keysToDelete.push(key);
                            }
                        }
                        try { console.debug && console.debug('workspace delete: keys to delete', keysToDelete); } catch(e){}
                    } catch(e) { keysToDelete = []; }

                    for (var k = 0; k < keysToDelete.length; k++) {
                        try { localStorage.removeItem(keysToDelete[k]); } catch(e) {}
                    }
                    try { console.debug && console.debug('workspace delete: aggressive localStorage cleanup done'); } catch(e){}
                } catch(e) {}

                var url = new URL(window.location.href);
                url.searchParams.set('workspace', 'Poznote');
                window.location.href = url.toString();
            } else {
                showNotificationPopup('Error deleting workspace: ' + (res.message || 'unknown'), 'error');
            }
        })
        .catch(function(err) { 
            showNotificationPopup('Network error', 'error'); 
        });
    }
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
    
    // Show checking modal
    showUpdateCheckModal();
    
    fetch('check_updates.php')
        .then(function(response) { 
            if (!response.ok) {
                throw new Error('HTTP Error: ' + response.status);
            }
            return response.json(); 
        })
        .then(function(data) {
            if (data.error) {
                const versionInfo = data.current_version ? '\nCurrent version: ' + data.current_version : '';
                showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + data.error + versionInfo, 'error');
            } else if (data.has_updates) {
                // Store version information for the modal
                localStorage.setItem('poznote_current_version', data.current_version || 'unknown');
                localStorage.setItem('poznote_remote_version', data.remote_version || 'unknown');
                closeUpdateCheckModal();
                showUpdateInstructions();
            } else {
                // No updates available, clear the flag
                localStorage.removeItem('poznote_update_available');
                showUpdateCheckResult('✅ You are up to date!', 'Current version: ' + (data.current_version || 'unknown'), 'success');
            }
        })
        .catch(function(error) {
            console.error('Failed to check for updates:', error);
            showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + error.message, 'error');
        });
}

// Check for updates automatically (silent, once per day)
function checkForUpdatesAutomatic() {
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
    fetch('check_updates.php')
        .then(function(response) { 
            if (!response.ok) {
                throw new Error('HTTP Error: ' + response.status);
            }
            return response.json(); 
        })
        .then(function(data) {
            if (data.has_updates && !data.error) {
                // Store update availability and version information
                localStorage.setItem('poznote_update_available', 'true');
                localStorage.setItem('poznote_current_version', data.current_version || 'unknown');
                localStorage.setItem('poznote_remote_version', data.remote_version || 'unknown');
                showUpdateBadge();
            } else {
                // Clear update availability flag
                localStorage.removeItem('poznote_update_available');
            }
        })
        .catch(function(error) {
            // Silent failure - no user notification for automatic checks
        });
}

// Force automatic update check (bypasses 24h limit - for testing)
function forceCheckForUpdatesAutomatic() {
    localStorage.removeItem('poznote_last_update_check');
    checkForUpdatesAutomatic();
}

// Test function to directly show the badge (for testing)
function testUpdateBadge() {
    showUpdateBadge();
}

// Simulate update available (for testing)
function simulateUpdateAvailable() {
    showUpdateBadge();
}

// Expose functions globally for console access
window.forceCheckForUpdatesAutomatic = forceCheckForUpdatesAutomatic;
window.showUpdateBadge = showUpdateBadge;
window.hideUpdateBadge = hideUpdateBadge;
window.testUpdateBadge = testUpdateBadge;
window.simulateUpdateAvailable = simulateUpdateAvailable;
window.restoreUpdateBadge = restoreUpdateBadge;

function showUpdateInstructions() {
    var modal = document.getElementById('updateModal');
    if (modal) {
        // Fill version information
        var currentVersionEl = document.getElementById('currentVersion');
        var availableVersionEl = document.getElementById('availableVersion');
        
        var currentVersion = localStorage.getItem('poznote_current_version');
        var remoteVersion = localStorage.getItem('poznote_remote_version');
        
        // If versions are not available, fetch them
        if (!currentVersion || !remoteVersion) {
            if (currentVersionEl) currentVersionEl.textContent = 'Loading...';
            if (availableVersionEl) availableVersionEl.textContent = 'Loading...';
            
            // Fetch update information
            fetch('check_updates.php')
                .then(function(response) { 
                    if (!response.ok) {
                        throw new Error('HTTP Error: ' + response.status);
                    }
                    return response.json(); 
                })
                .then(function(data) {
                    if (data.has_updates && !data.error) {
                        // Store version information
                        localStorage.setItem('poznote_current_version', data.current_version || 'unknown');
                        localStorage.setItem('poznote_remote_version', data.remote_version || 'unknown');
                        
                        // Update modal
                        if (currentVersionEl) {
                            currentVersionEl.textContent = data.current_version || 'unknown';
                        }
                        if (availableVersionEl) {
                            availableVersionEl.textContent = data.remote_version || 'unknown';
                        }
                    } else {
                        // No updates or error
                        if (currentVersionEl) currentVersionEl.textContent = data.current_version || 'unknown';
                        if (availableVersionEl) availableVersionEl.textContent = 'No update available';
                    }
                })
                .catch(function(error) {
                    if (currentVersionEl) currentVersionEl.textContent = 'Error loading version';
                    if (availableVersionEl) availableVersionEl.textContent = 'Error loading version';
                });
        } else {
            // Use cached versions
            if (currentVersionEl) {
                currentVersionEl.textContent = currentVersion;
            }
            if (availableVersionEl) {
                availableVersionEl.textContent = remoteVersion;
            }
        }
        
        modal.style.display = 'flex';
    }
}

function closeUpdateModal() {
    var modal = document.getElementById('updateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function goToUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote?tab=readme-ov-file#update-application-to-the-latest-version', '_blank');
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
        titleElement.style.color = '#555';
    }
    
    if (statusElement) {
        statusElement.textContent = 'Please wait while we check for updates...';
        statusElement.style.color = '#555';
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
        badges[i].style.display = 'none';
    }
}

function showUpdateBadge() {
    var badges = document.querySelectorAll('.update-badge');
    for (var i = 0; i < badges.length; i++) {
        badges[i].style.display = 'inline-block';
    }
}

function restoreUpdateBadge() {
    const updateAvailable = localStorage.getItem('poznote_update_available');
    if (updateAvailable === 'true') {
        showUpdateBadge();
    }
}

 

function showMoveFolderFilesDialog(sourceFolderName) {
    document.getElementById('sourceFolderName').textContent = sourceFolderName;
    
    // Get count of files in source folder
    fetch('api_list_notes.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'folder=' + encodeURIComponent(sourceFolderName) + '&workspace=' + encodeURIComponent(selectedWorkspace)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var filesCount = data.notes.length;
            var filesText = filesCount === 1 ? '1 file will be moved' : filesCount + ' files will be moved';
            document.getElementById('filesCountText').textContent = filesText;
            
            // If folder is empty, show message and disable move button
            if (filesCount === 0) {
                document.getElementById('filesCountText').textContent = 'This folder is empty';
                document.querySelector('#moveFolderFilesModal .btn-primary').disabled = true;
            } else {
                document.querySelector('#moveFolderFilesModal .btn-primary').disabled = false;
            }
        }
    })
    .catch(function(error) {
        document.getElementById('filesCountText').textContent = 'Unable to count files';
    });
    
    // Populate target folder dropdown
    populateTargetFolderDropdown(sourceFolderName);
    
    // Show modal
    document.getElementById('moveFolderFilesModal').style.display = 'block';
}

function populateTargetFolderDropdown(excludeFolderName, selectId) {
    // selectId allows populating different modals' select elements
    selectId = selectId || 'moveFolderFilesTargetSelect';
    var select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">Select target folder...</option>';
    
    // Get all folders
    fetch('api_list_notes.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'get_folders=1&workspace=' + encodeURIComponent(selectedWorkspace)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success && data.folders) {
            for (var i = 0; i < data.folders.length; i++) {
                var folder = data.folders[i];
                // Don't include the source folder or Favorites in target options
                if (folder !== excludeFolderName && folder !== 'Favorites') {
                    var option = document.createElement('option');
                    option.value = folder;
                    option.textContent = folder;
                    select.appendChild(option);
                }
            }
            // After populating options, if there is at least one real option, select the first one
            try {
                var firstRealIndex = null;
                for (var oi = 0; oi < select.options.length; oi++) {
                    if (select.options[oi].value && select.options[oi].value !== '') { firstRealIndex = oi; break; }
                }
                if (firstRealIndex !== null) {
                    select.selectedIndex = firstRealIndex;
                    // Trigger change so any handlers (e.g., enabling Move button) run
                    select.dispatchEvent(new Event('change'));
                }
            } catch (e) {}
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error loading folders: ' + error, 'error');
    });

    // If this dropdown is used for the 'move note' modal, wire change handler to enable the Move button
    try {
        select.addEventListener('change', function() {
            // When a selection exists, treat as exact match and enable Move
            updateMoveButton(this.value || '', !!this.value);
        });

        // Initialize button state based on any pre-selected value (most likely none)
        updateMoveButton(select.value || '', !!select.value);
    } catch (e) {
        // ignore if updateMoveButton is not available in this context
    }
}

function executeMoveAllFiles() {
    var sourceFolderName = document.getElementById('sourceFolderName').textContent;
    var targetFolderName = document.getElementById('moveFolderFilesTargetSelect').value;
    
    if (!targetFolderName) {
        showNotificationPopup('Please select a target folder', 'error');
        return;
    }
    
    if (sourceFolderName === targetFolderName) {
        showNotificationPopup('Source and target folders cannot be the same', 'error');
        return;
    }
    
    // Disable the move button during operation
    var moveButton = document.querySelector('#moveFolderFilesModal .btn-primary');
    var originalText = moveButton.textContent;
    moveButton.disabled = true;
    moveButton.textContent = 'Moving...';
    
    // Move all files
    fetch('api_move_folder_files.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'source_folder=' + encodeURIComponent(sourceFolderName) + 
              '&target_folder=' + encodeURIComponent(targetFolderName) + 
              '&workspace=' + encodeURIComponent(selectedWorkspace)
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
        }
        
        // Check if response is actually JSON
        var contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return response.text().then(function(text) {
                throw new Error('Expected JSON but received: ' + text.substring(0, 200));
            });
        }
        
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            // Successfully moved files - no notification needed
            closeModal('moveFolderFilesModal');
            // Refresh the page to reflect changes
            location.reload();
        } else {
            showNotificationPopup('Error moving files: ' + data.error, 'error');
            // Re-enable button on error
            moveButton.disabled = false;
            moveButton.textContent = originalText;
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error moving files: ' + error.message, 'error');
        // Re-enable button on error
        moveButton.disabled = false;
        moveButton.textContent = originalText;
    });
}

function editFolderName(oldName) {
    // Prevent renaming system folders
    if (oldName === 'Favorites' || oldName === 'Tags' || oldName === 'Trash') {
        showNotificationPopup('Cannot rename system folders', 'error');
        return;
    }
    
    document.getElementById('editFolderModal').style.display = 'flex';
    document.getElementById('editFolderName').value = oldName;
    document.getElementById('editFolderName').dataset.oldName = oldName;
    document.getElementById('editFolderName').focus();
}

function saveFolderName() {
    var newName = document.getElementById('editFolderName').value.trim();
    var oldName = document.getElementById('editFolderName').dataset.oldName;
    
    if (!newName) {
        showNotificationPopup('Please enter a folder name', 'error');
        return;
    }
    
    if (newName === oldName) {
        closeModal('editFolderModal');
        return;
    }
    
    var params = new URLSearchParams({
        action: 'rename',
        old_name: oldName,
        new_name: newName
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);

    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            // Clean localStorage entries for the old folder name
            cleanupRenamedFolderInLocalStorage(oldName, newName);
            closeModal('editFolderModal');
            // Folder renamed successfully - no notification needed
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error renaming folder: ' + error, 'error');
    });
}

function cleanupRenamedFolderInLocalStorage(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    
    
}

 

// Fonction de gestion des dossiers (icône dossier ouvert/fermé)
function toggleFolder(folderId) {
    var content = document.getElementById(folderId);
    var icon = document.querySelector('[data-folder-id="' + folderId + '"] .folder-icon');
    // Determine folder name to avoid changing icon for the Favorites pseudo-folder
    var folderHeader = document.querySelector('[data-folder-id="' + folderId + '"]').parentElement;
    var folderNameElem = folderHeader ? folderHeader.querySelector('.folder-name') : null;
    var folderNameText = folderNameElem ? folderNameElem.textContent.trim() : '';
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        // show open folder icon
        if (icon && folderNameText !== 'Favorites') {
            icon.classList.remove('fa-folder');
            icon.classList.add('fa-folder-open');
        }
        localStorage.setItem('folder_' + folderId, 'open');
    } else {
        content.style.display = 'none';
        // show closed folder icon
        if (icon && folderNameText !== 'Favorites') {
            icon.classList.remove('fa-folder-open');
            icon.classList.add('fa-folder');
        }
        localStorage.setItem('folder_' + folderId, 'closed');
    }
}

function emptyFolder(folderName) {
    showConfirmModal(
        'Empty Folder',
        'Are you sure you want to move all notes from "' + folderName + '" to trash?',
        function() {
            executeEmptyFolder(folderName);
        },
        { danger: true }
    );
}

function executeEmptyFolder(folderName) {
    var params = new URLSearchParams({
        action: 'empty_folder',
        folder_name: folderName
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            showNotificationPopup('All notes moved to trash from folder: ' + folderName);
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error emptying folder: ' + error, 'error');
    });
}

// Functions for moving individual notes individuelles vers des dossiers

function showMoveFolderDialog(noteId) {
    // Check if a valid note is selected
    if (!noteId || noteId == -1 || noteId == '' || noteId == null || noteId === undefined) {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    noteid = noteId; // Set the current note ID
    
    // Store noteId in the modal dataset for later use
    document.getElementById('moveNoteFolderModal').dataset.noteId = noteId;
    
    // Get current folder of the note
    var currentFolder = document.getElementById('folder' + noteId).value;
    
    // Load workspaces first
    loadWorkspacesForMoveModal(function() {
        // Load folders after workspaces are loaded
        loadFoldersForMoveModal(currentFolder);
    });
}

function loadWorkspacesForMoveModal(callback) {
    fetch("api_workspaces.php?action=list", {
        method: "GET",
        headers: { "Accept": "application/json" }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var workspaceSelect = document.getElementById('workspaceSelect');
            workspaceSelect.innerHTML = '';
            
            // Add current workspace as selected
            var currentWorkspace = getSelectedWorkspace();
            
            // Add all workspaces
            data.workspaces.forEach(function(workspace) {
                var option = document.createElement('option');
                option.value = workspace.name;
                option.textContent = workspace.name;
                if (workspace.name === currentWorkspace) {
                    option.selected = true;
                }
                workspaceSelect.appendChild(option);
            });
            
            // Add default workspace if not in list
            if (!data.workspaces.find(function(w) { return w.name === 'Poznote'; })) {
                var defaultOption = document.createElement('option');
                defaultOption.value = 'Poznote';
                defaultOption.textContent = 'Poznote';
                if ('Poznote' === currentWorkspace) {
                    defaultOption.selected = true;
                }
                workspaceSelect.appendChild(defaultOption);
            }
            
            if (callback) callback();
        }
    })
    .catch(function(error) {
        console.error('Error loading workspaces:', error);
        if (callback) callback();
    });
}

function loadFoldersForMoveModal(currentFolder) {
    // Load folders
    var params = new URLSearchParams({
        action: 'list'
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            // Store all folders (excluding current folder)
            allFolders = [];
            for (var i = 0; i < data.folders.length; i++) {
                if (data.folders[i] !== currentFolder) {
                    allFolders.push(data.folders[i]);
                }
            }
            
            
            
            // Reset the interface: clear move button state and errors
            updateMoveButton('');
            hideMoveFolderError();
            
            // Populate and show the modal; focus the select if present
            document.getElementById('moveNoteFolderModal').style.display = 'flex';
            // Populate the specific select inside move-note-folder modal
            populateTargetFolderDropdown(currentFolder, 'moveNoteTargetSelect');
            setTimeout(function() {
                var select = document.getElementById('moveNoteTargetSelect');
                if (select) select.focus();
            }, 100);
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error loading folders: ' + error);
    });
}

function onWorkspaceChange() {
    // When workspace changes, reload folders for the new workspace
    var selectedWorkspace = document.getElementById('workspaceSelect').value;
    var currentFolder = null; // We don't exclude any folder when changing workspace
    
    // Clear the move modal state
    updateMoveButton('');
    hideMoveFolderError();
    
    // Load folders for the selected workspace
    var params = new URLSearchParams({
        action: 'list',
        workspace: selectedWorkspace
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            // Store all folders for the new workspace
            allFolders = data.folders || [];
            
            
            
            console.log('Loaded ' + allFolders.length + ' folders for workspace: ' + selectedWorkspace);
        }
    })
    .catch(function(error) {
        console.error('Error loading folders for workspace:', error);
    });
}

 

function updateMoveButton(searchTerm, exactMatch) {
    if (exactMatch === undefined) exactMatch = false;
    var button = document.getElementById('moveActionButton');
    
    if (!searchTerm) {
        button.textContent = 'Move';
        button.disabled = true;
    } else if (exactMatch) {
        button.textContent = 'Move';
        button.disabled = false;
    } else {
        button.textContent = 'Create & Move';
        button.disabled = false;
    }
}

function moveNoteToFolder() {
    var noteId = document.getElementById('moveNoteFolderModal').dataset.noteId;
    // Prefer explicit select dropdown if present (from move files modal). Fallback to old input if still present.
    var select = document.getElementById('moveNoteTargetSelect');
    var targetFolder = '';
    if (select && select.value) {
        targetFolder = select.value;
    } else {
        // No select available or no value selected — require explicit selection
        showMoveFolderError('Please select a target folder');
        return;
    }

    var params = new URLSearchParams({
        action: 'move_to',
        note_id: noteId,
        folder: targetFolder
    });

    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            try { closeModal('moveNoteFolderModal'); } catch(e) {}
            location.reload();
        } else {
            var err = (data && (data.error || data.message)) ? (data.error || data.message) : 'Unknown error';
            showNotificationPopup('Error: ' + err, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error moving note: ' + error, 'error');
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

 

// executeFolderAction removed


// Function to download a file
function downloadFile(url, filename) {
    // Ensure the filename has .html extension
    if (filename && !filename.toLowerCase().endsWith('.html') && !filename.toLowerCase().endsWith('.htm')) {
        filename = filename + '.html';
    }
    
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

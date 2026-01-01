// Utility and miscellaneous functions

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
    fetch('api_favorites.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            action: 'toggle_favorite',
            note_id: noteId,
            workspace: selectedWorkspace || getSelectedWorkspace()
        })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            // If note was added to favorites (is_favorite = 1), open the Favorites folder
            if (data.is_favorite === 1) {
                localStorage.setItem('folder_folder-favorites', 'open');
            }
            setTimeout(function() {
                window.location.reload();
            }, 50);
        } else {
            showNotificationPopup('Error: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error updating favorites');
        console.error('Favorite toggle error:', error);
    });
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
var currentFolderToDelete = {id: null, name: null};

function newFolder() {
    showInputModal(
        (window.t ? window.t('modals.folder.new_title', null, 'New Folder') : 'New Folder'),
        (window.t ? window.t('modals.folder.new_placeholder', null, 'New folder name') : 'New folder name'),
        '',
        function(folderName) {
        if (!folderName) return;
        
        var data = {
            folder_name: folderName,
            workspace: selectedWorkspace || getSelectedWorkspace()
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
            if (data.success && data.folder_id) {
                // Folder created successfully with ID
                window.location.reload();
            } else if (data.success) {
                // Fallback si pas d'ID retourné
                window.location.reload();
            } else {
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
        .catch(function(error) {
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

    fetch("api_folders.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
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
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.check_content_prefix', { error: String(error) }, 'Error checking folder content: {{error}}') : ('Error checking folder content: ' + error)),
            'error'
        );
    });
}

function showDeleteFolderModal(folderId, folderName, message) {
    currentFolderToDelete = {id: folderId, name: folderName};
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
    currentFolderToDelete = {id: null, name: null};
}

function executeDeleteFolderOperation(folderId, folderName) {
    var deleteParams = new URLSearchParams({
        action: 'delete',
        folder_id: folderId
    });
    var ws = getSelectedWorkspace();
    if (ws) deleteParams.append('workspace', ws);
    
    fetch("api_folders.php", {
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
    .catch(function(error) {
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
    setTimeout(function() {
        document.body.removeChild(link);
    }, 100);
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
            showNotificationPopup(
                (window.t ? window.t('workspaces.alerts.error_prefix', { error: (res.message || window.t('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}') : ('Error: ' + (res.message || 'Unknown error'))),
                'error'
            );
        }
    })
    .catch(function(err) { 
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
        .then(function(confirmed) {
            if (confirmed) {
                var params = new URLSearchParams({ action: 'delete', name: name });
                
                fetch('api_workspaces.php', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
                    body: params.toString() 
                })
        .then(function(response) { return response.json(); })
        .then(function(res) {
            if (res.success) {
                // Get the first remaining workspace from the selector
                var firstWorkspace = sel.options.length > 0 ? sel.options[0].value : '';
                selectedWorkspace = firstWorkspace;
                try { 
                    localStorage.setItem('poznote_selected_workspace', firstWorkspace); 
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
                // Select the first remaining workspace
                var newFirstWorkspace = sel.options.length > 0 ? sel.options[0].value : '';
                sel.value = newFirstWorkspace;
                
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
                url.searchParams.set('workspace', newFirstWorkspace || sel.value);
                window.location.href = url.toString();
            } else {
                showNotificationPopup('Error deleting workspace: ' + (res.message || 'unknown'), 'error');
            }
        })
        .catch(function(err) { 
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
    
    // Show checking modal
    showUpdateCheckModal();
    
    fetch('api_check_updates.php')
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
                closeUpdateCheckModal();
                showUpdateInstructions(true);
            } else {
                // No updates available, but still show version info in update modal
                localStorage.removeItem('poznote_update_available');
                closeUpdateCheckModal();
                showUpdateInstructions(false);
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
    fetch('api_check_updates.php')
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

function showUpdateInstructions(hasUpdate = false) {
    var modal = document.getElementById('updateModal');
    if (modal) {
        // Update modal title and content based on whether there's an update
        var titleEl = modal.querySelector('h3');
        var messageEl = modal.querySelector('#updateMessage');
        var updateButtonsContainer = modal.querySelector('.update-instructions-buttons');
        var backupWarning = document.getElementById('updateBackupWarning');
        
        if (hasUpdate) {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.new_available', null, '🎉 New Update Available!') : '🎉 New Update Available!';
            if (messageEl) messageEl.textContent = window.t ? window.t('update.description', null, 'A new version of Poznote is available. Your data will be preserved during the update.') : 'A new version of Poznote is available. Your data will be preserved during the update.';
            if (updateButtonsContainer) {
                updateButtonsContainer.style.display = 'flex';
            }
            if (backupWarning) {
                backupWarning.style.display = 'block';
            }
            // Show release notes link
            var releaseNotesLink = document.getElementById('releaseNotesLink');
            if (releaseNotesLink) {
                releaseNotesLink.style.display = 'block';
            }
        } else {
            if (titleEl) titleEl.textContent = window.t ? window.t('update.up_to_date', null, '✅ Poznote is Up to date') : '✅ Poznote is Up to date';
            if (messageEl) messageEl.textContent = '';
            if (updateButtonsContainer) {
                updateButtonsContainer.style.display = 'none';
            }
            if (backupWarning) {
                backupWarning.style.display = 'none';
            }
            // Hide release notes link
            var releaseNotesLink = document.getElementById('releaseNotesLink');
            if (releaseNotesLink) {
                releaseNotesLink.style.display = 'none';
            }
        }
        
        // Fill version information
        var currentVersionEl = document.getElementById('currentVersion');
        var availableVersionEl = document.getElementById('availableVersion');
        
        // Always fetch version information
        if (currentVersionEl) currentVersionEl.textContent = 'Loading...';
        if (availableVersionEl) availableVersionEl.textContent = 'Loading...';
        
        // Fetch update information
        fetch('api_check_updates.php')
            .then(function(response) { 
                if (!response.ok) {
                    throw new Error('HTTP Error: ' + response.status);
                }
                return response.json(); 
            })
            .then(function(data) {
                if (!data.error) {
                    // Update modal
                    if (currentVersionEl) {
                        currentVersionEl.textContent = data.current_version || 'unknown';
                    }
                    if (availableVersionEl) {
                        availableVersionEl.textContent = data.remote_version || 'unknown';
                    }
                    // Set release notes link if update available
                    if (hasUpdate && data.remote_version) {
                        var releaseNotesHref = document.getElementById('releaseNotesHref');
                        if (releaseNotesHref) {
                            releaseNotesHref.href = 'https://github.com/timothepoznanski/poznote/releases/tag/' + data.remote_version;
                        }
                    }
                } else {
                    // Error
                    if (currentVersionEl) currentVersionEl.textContent = data.current_version || 'unknown';
                    if (availableVersionEl) availableVersionEl.textContent = window.t ? window.t('update.error_loading_version', null, 'Error loading version') : 'Error loading version';
                }
            })
            .catch(function(error) {
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
    window.open('https://github.com/timothepoznanski/poznote/blob/main/README.md#update-to-the-latest-version', '_blank');
}

function goToCloudUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote/blob/main/POZNOTE-CLOUD.md', '_blank');
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

 

function showMoveFolderFilesDialog(sourceFolderId, sourceFolderName) {
    document.getElementById('sourceFolderName').textContent = sourceFolderName;
    document.getElementById('sourceFolderName').dataset.folderId = sourceFolderId;
    
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
    .catch(function(error) {
        document.getElementById('filesCountText').textContent = window.t
            ? window.t('folders.move_all.unable_to_count_files', null, 'Unable to count files')
            : 'Unable to count files';
    });
    
    // Populate target folder dropdown
    populateTargetFolderDropdown(sourceFolderId, sourceFolderName);
    
    // Show modal
    document.getElementById('moveFolderFilesModal').style.display = 'block';
}

function populateTargetFolderDropdown(excludeFolderId, excludeFolderName, selectId) {
    // selectId allows populating different modals' select elements
    selectId = selectId || 'moveFolderFilesTargetSelect';
    var select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    var defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = window.t ? window.t('modals.folder.no_folder', null, 'No folder') : 'No folder';
    select.appendChild(defaultOption);
    
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
        }
    })
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error)),
            'error'
        );
    });

    // If this dropdown is used for the 'move note' modal, wire change handler to enable the Move button
    try {
        select.addEventListener('change', function() {
            // Always treat selection as exact match (including "No folder" with empty value)
            // The user explicitly selected an option, so enable Move button
            updateMoveButton(this.value || 'no-folder', true);
        });

        // Initialize button state - "No folder" is pre-selected
        updateMoveButton(select.value || 'no-folder', true);
    } catch (e) {
        // ignore if updateMoveButton is not available in this context
    }
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
    
    fetch('api_move_folder_files.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'source_folder_id=' + encodeURIComponent(sourceFolderId) + 
              '&target_folder_id=' + encodeURIComponent(targetId) + 
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
            showNotificationPopup(
                (window.t ? window.t('folders.errors.move_files_prefix', { error: data.error }, 'Error moving files: {{error}}') : ('Error moving files: ' + data.error)),
                'error'
            );
            // Re-enable button on error
            moveButton.disabled = false;
            moveButton.textContent = originalText;
        }
    })
    .catch(function(error) {
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
    
    // Populate target folder dropdown
    var select = document.getElementById('moveFolderTargetSelect');
    if (!select) {
        console.error('moveFolderTargetSelect element not found');
        return;
    }
    
    select.innerHTML = '';
    
    // Add "Root" option
    var rootOption = document.createElement('option');
    rootOption.value = '';
    rootOption.textContent = window.t ? window.t('modals.move_folder.root', null, 'Root (Top Level)') : 'Root (Top Level)';
    select.appendChild(rootOption);
    
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
            for (var targetFolderId in data.folders) {
                if (!data.folders.hasOwnProperty(targetFolderId)) continue;
                var folderData = data.folders[targetFolderId];
                
                // Don't include the source folder itself or Favorites
                if (targetFolderId != folderId && targetFolderId !== 'favorites') {
                    var option = document.createElement('option');
                    option.value = targetFolderId;
                    // Use full path if available, fallback to name
                    option.textContent = folderData.path || folderData.name;
                    select.appendChild(option);
                }
            }
        }
    })
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error)),
            'error'
        );
    });
}

function executeMoveFolderToSubfolder() {
    var sourceFolderElement = document.getElementById('moveFolderSourceName');
    var sourceFolderId = sourceFolderElement.dataset.folderId;
    var sourceFolderName = sourceFolderElement.textContent;
    var targetFolderId = document.getElementById('moveFolderTargetSelect').value;
    
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
        workspace: selectedWorkspace
    };
    
    // Only add new_parent_folder_id if not moving to root
    if (targetParentId !== null) {
        requestData.new_parent_folder_id = targetParentId;
    } else {
        requestData.new_parent_folder_id = null;
    }
    
    fetch('api_move_folder.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
    .then(function(response) {
        if (!response.ok) {
            return response.json().then(function(data) {
                throw new Error(data.error || 'HTTP error! status: ' + response.status);
            });
        }
        return response.json();
    })
    .then(function(data) {
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
    .catch(function(error) {
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
    
    var params = new URLSearchParams({
        action: 'rename',
        folder_id: folderId,
        old_name: oldName,
        new_name: newName
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);

    fetch("api_folders.php", {
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
            showNotificationPopup(
                (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                'error'
            );
        }
    })
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.rename_prefix', { error: String(error) }, 'Error renaming folder: {{error}}') : ('Error renaming folder: ' + error)),
            'error'
        );
    });
}

function cleanupRenamedFolderInLocalStorage(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    
    
}

 

// Folder management function (open/closed folder icon)
function toggleFolder(folderId) {
    var content = document.getElementById(folderId);
    var icon = document.querySelector('[data-folder-id="' + folderId + '"] .folder-icon');
    // Determine folder name to avoid changing icon for the Favorites pseudo-folder
    var folderHeader = document.querySelector('[data-folder-id="' + folderId + '"]').parentElement;
    var folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
    var isFavoritesFolder = folderKey === 'Favorites';
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        // show open folder icon
        if (icon && !isFavoritesFolder) {
            icon.classList.remove('fa-folder');
            icon.classList.add('fa-folder-open');
        }
        localStorage.setItem('folder_' + folderId, 'open');
    } else {
        content.style.display = 'none';
        // show closed folder icon
        if (icon && !isFavoritesFolder) {
            icon.classList.remove('fa-folder-open');
            icon.classList.add('fa-folder');
        }
        localStorage.setItem('folder_' + folderId, 'closed');
    }
}

/**
 * Restore folder states from localStorage on page load
 * This preserves user preferences for which folders should stay open/closed
 */
function restoreFolderStates() {
    // Get all folder toggle elements
    const folderToggles = document.querySelectorAll('[data-folder-id]');
    
    folderToggles.forEach(function(toggleElement) {
        const folderId = toggleElement.getAttribute('data-folder-id');
        const folderContent = document.getElementById(folderId);
        const icon = toggleElement.querySelector('.folder-icon');
        
        if (!folderContent || !folderId) return;
        
        // Get the folder name to check if it's Favorites
        const folderHeader = toggleElement.closest('.folder-header');
        const folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
        const isFavoritesFolder = folderKey === 'Favorites';
        
        // Check localStorage for this folder's state
        const savedState = localStorage.getItem('folder_' + folderId);
        
        // Only override the PHP-determined state if user has explicitly set a preference
        if (savedState === 'open') {
            // User explicitly opened this folder - keep it open
            folderContent.style.display = 'block';
            if (icon && !isFavoritesFolder) {
                icon.classList.remove('fa-folder');
                icon.classList.add('fa-folder-open');
            }
        } else if (savedState === 'closed') {
            // User explicitly closed this folder - keep it closed
            folderContent.style.display = 'none';
            if (icon && !isFavoritesFolder) {
                icon.classList.remove('fa-folder-open');
                icon.classList.add('fa-folder');
            }
        }
        // If no saved state exists, leave the folder as it was set by PHP logic
        // This preserves the smart PHP logic for determining initial folder states
    });
}

function emptyFolder(folderId, folderName) {
    showConfirmModal(
        (window.t ? window.t('folders.empty.title', null, 'Empty Folder') : 'Empty Folder'),
        (window.t
            ? window.t('folders.empty.confirm_message', { folder: folderName }, 'Are you sure you want to move all notes from "{{folder}}" to trash?')
            : ('Are you sure you want to move all notes from "' + folderName + '" to trash?')),
        function() {
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
    var params = new URLSearchParams({
        action: 'empty_folder',
        folder_id: folderId
    });
    var ws = getSelectedWorkspace();
    if (ws) params.append('workspace', ws);
    
    fetch("api_folders.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
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
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.empty_folder_prefix', { error: String(error) }, 'Error emptying folder: {{error}}') : ('Error emptying folder: ' + error)),
            'error'
        );
    });
}

// Functions for moving individual notes individuelles vers des dossiers

function showMoveFolderDialog(noteId) {
    // Check if a valid note is selected
    if (!noteId || noteId == -1 || noteId == '' || noteId == null || noteId === undefined) {
        showNotificationPopup(
            (window.t ? window.t('folders.move_note.select_note_first', null, 'Please select a note first before moving it to a folder.') : 'Please select a note first before moving it to a folder.')
        );
        return;
    }
    
    noteid = noteId; // Set the current note ID
    
    // Store noteId in the modal dataset for later use
    document.getElementById('moveNoteFolderModal').dataset.noteId = noteId;
    
    // Get current folder of the note
    var currentFolderId = document.getElementById('folderId' + noteId).value;
    var currentFolder = document.getElementById('folder' + noteId).value;
    
    // Load workspaces first
    loadWorkspacesForMoveModal(function() {
        // Load folders after workspaces are loaded
        loadFoldersForMoveModal(currentFolderId, currentFolder);
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
            
            if (callback) callback();
        }
    })
    .catch(function(error) {
        console.error('Error loading workspaces:', error);
        if (callback) callback();
    });
}

function loadFoldersForMoveModal(currentFolderId, currentFolderName) {
    // Load folders
    var params = new URLSearchParams({
        action: 'list'
    });
    try {
        var ws = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : null;
        if (ws) {
            params.append('workspace', ws);
        }
    } catch (e) {}
    
    fetch("api_folders.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) {
        return response.text().then(function(text) {
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
    .then(function(data) {
        if (data.success) {
            // Store all folders (excluding current folder)
            allFolders = [];
            if (Array.isArray(data.folders)) {
                data.folders.forEach(function(folder) {
                    if (folder.id != currentFolderId) {
                        allFolders.push(folder);
                    }
                });
            }
            
            
            
            // Reset the interface: clear move button state and errors
            updateMoveButton('');
            hideMoveFolderError();
            
            // Populate and show the modal; focus the select if present
            document.getElementById('moveNoteFolderModal').style.display = 'flex';
            // Populate the specific select inside move-note-folder modal
            populateTargetFolderDropdown(currentFolderId, currentFolderName, 'moveNoteTargetSelect');
            setTimeout(function() {
                var select = document.getElementById('moveNoteTargetSelect');
                if (select) select.focus();
            }, 100);
        }
    })
    .catch(function(error) {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.load_prefix', { error: String(error) }, 'Error loading folders: {{error}}') : ('Error loading folders: ' + error))
        );
    });
}

function onWorkspaceChange() {
    // When workspace changes, reload folders for the new workspace
    var newWorkspace = document.getElementById('workspaceSelect').value;
    
    // Clear the move modal state
    updateMoveButton('');
    hideMoveFolderError();
    
    // Load folders for the selected workspace
    var params = new URLSearchParams({
        action: 'list',
        workspace: newWorkspace
    });
    
    fetch("api_folders.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) {
        return response.text().then(function(text) {
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
    .then(function(data) {
        if (data.success) {
            // Store all folders for the new workspace
            allFolders = data.folders || [];
            
            // Update the target folder dropdown with folders from the new workspace
            var select = document.getElementById('moveNoteTargetSelect');
            if (select) {
                select.innerHTML = '<option value="">' + (window.t ? window.t('modals.folder.no_folder', null, 'No folder') : 'No folder') + '</option>';
                
                // Populate with folders from the new workspace
                if (Array.isArray(allFolders)) {
                    allFolders.forEach(function(folder) {
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
            }
        }
    })
    .catch(function(error) {
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

    var params = new URLSearchParams({
        action: 'move_to',
        note_id: noteId,
        folder_id: targetFolderId,
        workspace: targetWorkspace
    });

    fetch("api_folders.php", {
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
            showNotificationPopup(
                (window.t ? window.t('folders.errors.generic_prefix', { error: err }, 'Error: {{error}}') : ('Error: ' + err)),
                'error'
            );
        }
    })
    .catch(function(error) {
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
        var jsonOption = modal.querySelector('.export-option-json');
        
        if (noteType === 'markdown') {
            // For markdown notes: allow both MD and HTML exports + PDF (print)
            if (markdownOption) markdownOption.style.display = 'flex';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'none';
        } else {
            // For other notes: show HTML and PDF options, hide MD option
            if (markdownOption) markdownOption.style.display = 'none';
            if (htmlOption) htmlOption.style.display = 'flex';

            // Only tasklist notes support JSON export
            if (jsonOption) jsonOption.style.display = (noteType === 'tasklist') ? 'flex' : 'none';
        }
        
        modal.style.display = 'flex';
    }
}

// Select export type and execute
function selectExportType(type) {
    closeModal('exportModal');
    
    if (type === 'markdown') {
        exportNoteAsMarkdown(currentExportNoteId, currentExportFilename, currentExportNoteType);
    } else if (type === 'html') {
        exportNoteAsHTML(currentExportNoteId, null, currentExportFilename, currentExportNoteType);
    } else if (type === 'json') {
        exportNoteAsJSON(currentExportNoteId, currentExportNoteType);
    } else if (type === 'print') {
        exportNoteToPrint(currentExportNoteId, currentExportNoteType);
    }
}

// Export note as HTML
function exportNoteAsHTML(noteId, url, filename, noteType) {
    // Use the unified export API endpoint
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) + 
                 '&type=' + encodeURIComponent(noteType) + 
                 '&format=html';
    
    var link = document.createElement('a');
    link.href = apiUrl;
    link.download = '';  // Let the server set the filename via Content-Disposition
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export note as Markdown
function exportNoteAsMarkdown(noteId, filename, noteType) {
    // Use the export API endpoint with markdown format
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) + 
                 '&type=' + encodeURIComponent(noteType) + 
                 '&format=markdown';
    
    var link = document.createElement('a');
    link.href = apiUrl;
    link.download = '';  // Let the server set the filename via Content-Disposition
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export tasklist note as JSON
function exportNoteAsJSON(noteId, noteType) {
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) +
                 '&type=' + encodeURIComponent(noteType) +
                 '&format=json';

    var link = document.createElement('a');
    link.href = apiUrl;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

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

    printWindow.onload = function() {
        setTimeout(function() {
            printWindow.print();
        }, 250);
    };
}

// Legacy function for backward compatibility
function downloadNote(noteId, url, filename, noteType) {
    showExportModal(noteId, filename, null, noteType);
}

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
        // Allow subfolder creation for all folders
        if (subfolderOption) {
            subfolderOption.style.display = 'flex';
        }
    } else {
        modalTitle.textContent = window.t ? window.t('common.create', null, 'Create') : 'Create';
        if (otherSection) otherSection.style.display = 'block';
        if (subfolderOption) subfolderOption.style.display = 'none';
    }
    
    // Reset selection
    var options = document.querySelectorAll('.create-note-option');
    options.forEach(function(option) {
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
    switch(selectedCreateType) {
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

function createHtmlNote() {
    if (isCreatingInFolder && targetFolderId) {
        // Mark folder as open in localStorage to keep it open after page reload
        var folderDomId = 'folder-' + targetFolderId;
        localStorage.setItem('folder_' + folderDomId, 'open');
        
        // Set the selected folder temporarily so the existing functions use it
        var originalSelectedFolderId = selectedFolderId;
        var originalSelectedFolder = selectedFolder;
        selectedFolderId = targetFolderId;
        selectedFolder = targetFolderName;
        
        // Call the note creation function
        if (typeof newnote === 'function') {
            newnote();
        } else if (typeof createNewNote === 'function') {
            createNewNote();
        } else {
            // Fallback to basic creation
            window.open('api_insert_new.php?folder_id=' + encodeURIComponent(targetFolderId), '_blank');
        }
        
        // Restore original folder
        selectedFolderId = originalSelectedFolderId;
        selectedFolder = originalSelectedFolder;
    } else {
        // Regular creation (not in specific folder)
        if (typeof newnote === 'function') {
            newnote();
        } else if (typeof createNewNote === 'function') {
            createNewNote();
        } else {
            window.open('api_insert_new.php', '_blank');
        }
    }
}

function createTaskListNoteInUtils() {
    if (isCreatingInFolder && targetFolderId) {
        // Mark folder as open in localStorage to keep it open after page reload
        var folderDomId = 'folder-' + targetFolderId;
        localStorage.setItem('folder_' + folderDomId, 'open');
        
        var originalSelectedFolderId = selectedFolderId;
        var originalSelectedFolder = selectedFolder;
        selectedFolderId = targetFolderId;
        selectedFolder = targetFolderName;
        
        // Call the real createTaskListNote function from notes.js
        if (typeof window.createTaskListNote === 'function') {
            window.createTaskListNote();
        } else {
            // Fallback
            window.location.href = 'api_insert_new.php?folder_id=' + encodeURIComponent(targetFolderId) + '&type=tasklist';
        }
        
        // Restore original folder
        selectedFolderId = originalSelectedFolderId;
        selectedFolder = originalSelectedFolder;
    } else {
        // Regular creation (not in specific folder)
        if (typeof window.createTaskListNote === 'function') {
            window.createTaskListNote();
        } else {
            // Fallback
            window.location.href = 'api_insert_new.php?type=tasklist';
        }
    }
}

function createMarkdownNoteInUtils() {
    if (isCreatingInFolder && targetFolderId) {
        // Mark folder as open in localStorage to keep it open after page reload
        var folderDomId = 'folder-' + targetFolderId;
        localStorage.setItem('folder_' + folderDomId, 'open');
        
        var originalSelectedFolderId = selectedFolderId;
        var originalSelectedFolder = selectedFolder;
        selectedFolderId = targetFolderId;
        selectedFolder = targetFolderName;
        
        if (typeof window.createMarkdownNote === 'function') {
            window.createMarkdownNote();
        } else {
            // Fallback to basic markdown creation
            window.open('api_insert_new.php?folder_id=' + encodeURIComponent(targetFolderId) + '&type=markdown', '_blank');
        }
        
        // Restore original folder
        selectedFolderId = originalSelectedFolderId;
        selectedFolder = originalSelectedFolder;
    } else {
        // Regular creation (not in specific folder)
        if (typeof window.createMarkdownNote === 'function') {
            window.createMarkdownNote();
        } else {
            window.open('api_insert_new.php?type=markdown', '_blank');
        }
    }
}

function createWorkspace() {
    // Navigate to the workspaces management page
    window.location = 'workspaces.php';
}

// Legacy function for backwards compatibility
function createNoteInFolder() {
    executeCreateAction();
}

// Folder actions menu toggle functions
function toggleFolderActionsMenu(folderId) {
    // Close all other folder menus first
    document.querySelectorAll('.folder-actions-menu.show').forEach(function(menu) {
        if (menu.id !== 'folder-actions-menu-' + folderId) {
            menu.classList.remove('show');
        }
    });
    
    // Toggle the current menu
    var menu = document.getElementById('folder-actions-menu-' + folderId);
    if (menu) {
        var isShowing = menu.classList.toggle('show');
        
        // If showing, check if menu would overflow viewport and adjust position
        if (isShowing) {
            adjustMenuPosition(menu);
        }
    }
}

function adjustMenuPosition(menu) {
    // Reset any previous adjustments
    menu.style.bottom = '';
    menu.style.top = '';
    
    // Get menu position and dimensions
    var rect = menu.getBoundingClientRect();
    var viewportHeight = window.innerHeight;
    
    // Check if menu overflows bottom of viewport
    if (rect.bottom > viewportHeight) {
        // Position menu above the toggle button instead
        menu.style.top = 'auto';
        menu.style.bottom = '100%';
        menu.style.marginTop = '0';
        menu.style.marginBottom = '4px';
    }
}

function closeFolderActionsMenu(folderId) {
    var menu = document.getElementById('folder-actions-menu-' + folderId);
    if (menu) {
        menu.classList.remove('show');
    }
}

// Close folder menus when clicking outside
document.addEventListener('click', function(event) {
    // If click is not inside a folder-actions element, close all menus
    if (!event.target.closest('.folder-actions')) {
        document.querySelectorAll('.folder-actions-menu.show').forEach(function(menu) {
            menu.classList.remove('show');
        });
    }
});

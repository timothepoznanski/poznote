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
        var url = 'note_info.php?note_id=' + encodeURIComponent(noteId) + wsParam;
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
                    if (starIcon) {
                        if (starIcon.classList.contains('fas')) {
                            starIcon.classList.remove('fas');
                            starIcon.classList.add('far');
                        } else {
                            starIcon.classList.remove('far');
                            starIcon.classList.add('fas');
                        }
                    }
                    
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
            // Folder deleted successfully - no notification needed
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
                
                // Remove option from selector
                for (var i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === name) {
                        sel.removeChild(sel.options[i]);
                        break;
                    }
                }
                sel.value = 'Poznote';
                
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

// Compatibility functions (legacy)
function toggleToolbarMenu(noteId) {
    // Use the new function
    toggleNoteMenu(noteId);
}

function createFolder() {
    newFolder();
}

function confirmDeleteAttachment(callback) {
    if (confirm('Do you really want to delete this attachment?')) {
        callback();
    }
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
                closeUpdateCheckModal();
                showUpdateInstructions();
            } else {
                showUpdateCheckResult('✅ You are up to date!', 'Current version: ' + (data.current_version || 'unknown'), 'success');
            }
        })
        .catch(function(error) {
            console.error('Failed to check for updates:', error);
            
            // Try to get current version even when network fails
            fetch('version.txt')
                .then(function(response) {
                    if (response.ok) {
                        return response.text();
                    }
                    throw new Error('Cannot read version file');
                })
                .then(function(version) {
                    const currentVersion = version.trim();
                    showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + error.message + '\nCurrent version: ' + currentVersion, 'error');
                })
                .catch(function(versionError) {
                    showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection. Error: ' + error.message, 'error');
                });
        });
}

function showUpdateInstructions() {
    var modal = document.getElementById('updateModal');
    if (modal) {
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
    window.open('https://github.com/timothepoznanski/poznote?tab=readme-ov-file#update-application', '_blank');
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
        // Show buttons for errors
        if (buttonsElement) buttonsElement.style.display = 'flex';
    } else if (type === 'success') {
        if (titleElement) titleElement.style.color = '#007DB8';
        if (statusElement) statusElement.style.color = '#007DB8';
        // Hide buttons for success
        if (buttonsElement) buttonsElement.style.display = 'none';
        
        // Auto-close after 3 seconds for success
        setTimeout(function() {
            closeUpdateCheckModal();
        }, 3000);
    }
}

function hideUpdateBadge() {
    var badges = document.querySelectorAll('.update-badge');
    for (var i = 0; i < badges.length; i++) {
        badges[i].style.display = 'none';
    }
}

// Advanced folder management functions

function initializeFolderSearchFilters() {
    var folderSearchBtns = document.querySelectorAll('.folder-search-btn');
    if (folderSearchBtns.length === 0) {
        // If buttons are not yet in DOM, try again later
        setTimeout(function() {
            initializeFolderSearchFilters();
        }, 100);
        return;
    }
    
    for (var i = 0; i < folderSearchBtns.length; i++) {
        var btn = folderSearchBtns[i];
        var folderName = btn.getAttribute('data-folder');
        var isExcluded = getFolderSearchState(folderName) === 'excluded';
        
        if (isExcluded) {
            btn.classList.add('excluded');
            btn.title = 'Include in search (currently excluded)';
        } else {
            btn.classList.remove('excluded');
            btn.title = 'Exclude from search (currently included)';
        }
    }
}

function toggleFolderSearchFilter(folderName) {
    var btn = document.querySelector('.folder-search-btn[data-folder="' + folderName + '"]');
    if (!btn) return;
    
    var isCurrentlyExcluded = btn.classList.contains('excluded');
    
    if (isCurrentlyExcluded) {
        // Switch to included (blue)
        btn.classList.remove('excluded');
        btn.title = 'Exclude from search (currently included)';
        setFolderSearchState(folderName, 'included');
    } else {
        // Switch to excluded (red)
        btn.classList.add('excluded');
        btn.title = 'Include in search (currently excluded)';
        setFolderSearchState(folderName, 'excluded');
    }
    
    // If we're currently in search mode, refresh search results
    var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
    var currentSearch = searchInput ? searchInput.value.trim() : '';
    
    if (currentSearch) {
        // Trigger a new search to apply the filter
        setTimeout(function() {
            performFilteredSearch();
        }, 100);
    }
}

function getFolderSearchState(folderName) {
    var key = 'folder_search_' + folderName;
    return localStorage.getItem(key) || 'included'; // Default to included
}

function setFolderSearchState(folderName, state) {
    var key = 'folder_search_' + folderName;
    localStorage.setItem(key, state);
}

function performFilteredSearch() {
    var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
    if (!searchInput || !searchInput.value.trim()) return;
    
    // Simply trigger the form submission - the excluded folders will be added by the unified search system
    var form = document.getElementById('unified-search-form') || document.getElementById('unified-search-form-mobile');
    if (form) {
        // Create a fake submit event to trigger the unified search handler
        var submitEvent = new Event('submit', {
            bubbles: true,
            cancelable: true
        });
        form.dispatchEvent(submitEvent);
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

function populateTargetFolderDropdown(excludeFolderName) {
    var select = document.getElementById('targetFolderSelect');
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
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error loading folders: ' + error, 'error');
    });
}

function executeMoveAllFiles() {
    var sourceFolderName = document.getElementById('sourceFolderName').textContent;
    var targetFolderName = document.getElementById('targetFolderSelect').value;
    
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
            // Clean localStorage entries for the old folder name and update recent folders
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
    
    // Update folder search filter key
    var oldSearchKey = 'folder_search_' + oldName;
    var newSearchKey = 'folder_search_' + newName;
    var searchState = localStorage.getItem(oldSearchKey);
    if (searchState !== null) {
        localStorage.setItem(newSearchKey, searchState);
        localStorage.removeItem(oldSearchKey);
    }
    
    // Update recent folders
    var recentFolders = getRecentFolders();
    var updatedRecentFolders = [];
    for (var i = 0; i < recentFolders.length; i++) {
        if (recentFolders[i] === oldName) {
            updatedRecentFolders.push(newName);
        } else {
            updatedRecentFolders.push(recentFolders[i]);
        }
    }
    localStorage.setItem('poznote_recent_folders', JSON.stringify(updatedRecentFolders));
}

function getRecentFolders() {
    try {
        return JSON.parse(localStorage.getItem('poznote_recent_folders') || '[]');
    } catch (e) {
        return [];
    }
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
            
            // Load recent folders
            loadRecentFolders(currentFolder);
            
            // Reset the interface
            var input = document.getElementById('folderSearchInput');
            var dropdown = document.getElementById('folderDropdown');
            
            input.value = '';
            dropdown.classList.remove('show');
            dropdown.innerHTML = '';
            
            selectedFolderOption = null;
            highlightedIndex = -1;
            
            updateMoveButton('');
            hideMoveFolderError();
            
            // Show the modal and focus on input
            document.getElementById('moveNoteFolderModal').style.display = 'flex';
            setTimeout(function() {
                input.focus();
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
    
    // Clear the current folder search
    var input = document.getElementById('folderSearchInput');
    var dropdown = document.getElementById('folderDropdown');
    
    input.value = '';
    dropdown.classList.remove('show');
    dropdown.innerHTML = '';
    
    selectedFolderOption = null;
    highlightedIndex = -1;
    
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
            
            // Clear and reload recent folders section for the new workspace
            var recentFoldersList = document.getElementById('recentFoldersList');
            var recentFoldersSection = document.getElementById('recentFoldersSection');
            
            // Get recent folders (this function should work across workspaces)
            loadRecentFolders(currentFolder);
            
            console.log('Loaded ' + allFolders.length + ' folders for workspace: ' + selectedWorkspace);
        }
    })
    .catch(function(error) {
        console.error('Error loading folders for workspace:', error);
    });
}

function loadRecentFolders(currentFolder) {
    var recentFolders = getRecentFolders();
    var recentFoldersList = document.getElementById('recentFoldersList');
    var recentFoldersSection = document.getElementById('recentFoldersSection');
    
    // Filter out the current folder
    var availableRecent = [];
    for (var i = 0; i < recentFolders.length; i++) {
        if (recentFolders[i] !== currentFolder) {
            availableRecent.push(recentFolders[i]);
        }
    }
    
    if (availableRecent.length === 0) {
        recentFoldersSection.style.display = 'none';
        return;
    }
    
    recentFoldersSection.style.display = 'block';
    recentFoldersList.innerHTML = '';
    
    for (var i = 0; i < availableRecent.length; i++) {
        var folder = availableRecent[i];
        var folderItem = document.createElement('div');
        folderItem.className = 'recent-folder-item';
        folderItem.innerHTML = '<span class="recent-folder-icon">📁</span><span>' + folder + '</span>';
        folderItem.onclick = (function(folderName) {
            return function() { selectRecentFolder(folderName); };
        })(folder);
        recentFoldersList.appendChild(folderItem);
    }
}

function selectRecentFolder(folderName) {
    var input = document.getElementById('folderSearchInput');
    var dropdown = document.getElementById('folderDropdown');
    
    input.value = folderName;
    selectedFolderOption = folderName;
    dropdown.classList.remove('show');
    updateMoveButton(folderName, true);
    hideMoveFolderError();
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

function selectFolderForMove(folderName) {
    var input = document.getElementById('folderSearchInput');
    var dropdown = document.getElementById('folderDropdown');
    
    input.value = folderName;
    selectedFolderOption = folderName;
    dropdown.classList.remove('show');
    updateMoveButton(folderName, true);
    hideMoveFolderError();
}

function selectCreateFolder(folderName) {
    selectedFolderOption = folderName;
    document.getElementById('folderDropdown').classList.remove('show');
    updateMoveButton(folderName, false);
    hideMoveFolderError();
}

function moveNoteToFolder() {
    var noteId = document.getElementById('moveNoteFolderModal').dataset.noteId;
    var targetFolder = selectedFolderOption || document.getElementById('folderSearchInput').value;
    
    if (!targetFolder) {
        showMoveFolderError('Please select or enter a folder name');
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

function handleFolderSearch() {
    var input = document.getElementById('folderSearchInput');
    var dropdown = document.getElementById('folderDropdown');
    var searchTerm = input.value.trim();
    
    if (searchTerm.length === 0) {
        dropdown.classList.remove('show');
        updateMoveButton('');
        return;
    }
    
    // Filter folders that match the search term
    var matchingFolders = [];
    for (var i = 0; i < allFolders.length; i++) {
        if (allFolders[i].toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1) {
            matchingFolders.push(allFolders[i]);
        }
    }
    
    // Update dropdown content
    updateDropdown(matchingFolders, searchTerm);
    
    // Update button text based on exact match
    var exactMatch = null;
    for (var i = 0; i < allFolders.length; i++) {
        if (allFolders[i].toLowerCase() === searchTerm.toLowerCase()) {
            exactMatch = allFolders[i];
            break;
        }
    }
    
    updateMoveButton(searchTerm, exactMatch ? true : false);
    
    // Show dropdown if there are matches or if we want to show create option
    dropdown.classList.add('show');
}

function updateDropdown(matchingFolders, searchTerm) {
    var dropdown = document.getElementById('folderDropdown');
    dropdown.innerHTML = '';
    highlightedIndex = -1;
    selectedFolderOption = null;
    
    // Show matching folders
    for (var i = 0; i < matchingFolders.length; i++) {
        var folder = matchingFolders[i];
        var option = document.createElement('div');
        option.className = 'folder-option';
        option.textContent = folder;
        option.onclick = (function(folderName) {
            return function() { selectFolderForMove(folderName); };
        })(folder);
        dropdown.appendChild(option);
    }
    
    // Show create option if no exact match
    var hasExactMatch = false;
    for (var i = 0; i < matchingFolders.length; i++) {
        if (matchingFolders[i].toLowerCase() === searchTerm.toLowerCase()) {
            hasExactMatch = true;
            break;
        }
    }
    
    if (!hasExactMatch && searchTerm.length > 0) {
        var createOption = document.createElement('div');
        createOption.className = 'folder-option create-option';
        createOption.innerHTML = '<i class="fas fa-plus"></i> Create "' + searchTerm + '"';
        createOption.onclick = function() { selectCreateFolder(searchTerm); };
        dropdown.appendChild(createOption);
    }
}

function addToRecentFolders(folderName) {
    var recentFolders = getRecentFolders();
    
    // Remove if already exists
    var filtered = [];
    for (var i = 0; i < recentFolders.length; i++) {
        if (recentFolders[i] !== folderName) {
            filtered.push(recentFolders[i]);
        }
    }
    
    // Add to beginning
    filtered.unshift(folderName);
    
    // Keep only last 2
    if (filtered.length > 2) {
        filtered = filtered.slice(0, 2);
    }
    
    // Save to localStorage
    localStorage.setItem('poznote_recent_folders', JSON.stringify(filtered));
}

function executeFolderAction() {
    // Check if a valid note is selected
    if (!noteid || noteid == -1 || noteid == '' || noteid == null || noteid === undefined) {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    var searchTerm = document.getElementById('folderSearchInput').value.trim();
    
    if (!searchTerm) {
        showMoveFolderError('Please enter a folder name');
        return;
    }
    
    var folderToMoveTo = selectedFolderOption || searchTerm;
    var selectedWorkspace = document.getElementById('workspaceSelect').value;
    
    var params = new URLSearchParams({
        action: 'move_to',
        note_id: noteid,
        folder: folderToMoveTo,
        workspace: selectedWorkspace
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: params.toString()
    })
    .then(function(response) { 
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response.text(); // Get text first to debug if needed
    })
    .then(function(text) {
        try {
            var data = JSON.parse(text);
            if (data && data.success) {
                // Add to recent folders
                addToRecentFolders(folderToMoveTo);
                
                try { closeModal('moveNoteFolderModal'); } catch(e) {}
                try { closeModal('moveNoteModal'); } catch(e) {}
                
                // If moved to different workspace, redirect to that workspace
                if (data.old_workspace !== data.new_workspace) {
                    // Update the global workspace variable and interface immediately
                    selectedWorkspace = selectedWorkspace;
                    updateWorkspaceNameInHeaders(selectedWorkspace);
                    try { 
                        localStorage.setItem('poznote_selected_workspace', selectedWorkspace); 
                    } catch(e) {}
                    
                    setTimeout(function() {
                        var wsRedirect = 'index.php?workspace=' + encodeURIComponent(selectedWorkspace);
                        window.location.href = wsRedirect;
                    }, 200);
                } else {
                    location.reload();
                }
            } else {
                var err = (data && (data.error || data.message)) ? (data.error || data.message) : 'Unknown error';
                showNotificationPopup('Error: ' + err, 'error');
            }
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Response text:', text);
            showNotificationPopup('Error: Invalid server response', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error moving note: ' + error, 'error');
    });
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

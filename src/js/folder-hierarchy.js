/**
 * Folder Hierarchy Management
 * Handles creating and displaying hierarchical folders
 */

// Global variables for folder hierarchy

/**
 * Close the create dropdown menu
 */
function closeCreateDropdown() {
    var dropdown = document.getElementById('create-dropdown-menu');
    if (dropdown) {
        dropdown.remove();
    }
    document.removeEventListener('click', closeCreateDropdown);
}

/**
 * Create a subfolder within a parent folder
 * @param {string} parentFolderKey - The parent folder key (e.g., 'folder_123')
 */
function createSubfolder(parentFolderKey) {
    // Draft the subfolder inside its parent in the tree; the modal below is
    // the fallback for pages without one (create.php).
    if (window.PoznoteInlineTreeEdit && window.PoznoteInlineTreeEdit.createFolder(parentFolderKey)) {
        return;
    }

    // Get display name from the folder header
    var displayName = '';
    if (parentFolderKey && parentFolderKey.startsWith('folder_')) {
        var folderHeader = document.querySelector('[data-folder-key="' + parentFolderKey + '"]');
        if (folderHeader) {
            var nameElem = folderHeader.querySelector('.folder-name');
            if (nameElem) {
                displayName = nameElem.textContent.trim();
            }
        }
    }

    const modalTitle = window.t ? window.t('folders.subfolder.modal_title', {}, 'New Subfolder') : 'New Subfolder';
    const modalMessage = window.t ? window.t('folders.subfolder.modal_message', { parent: displayName }, 'Enter subfolder name (within {{parent}})') : 'Enter subfolder name (within ' + displayName + ')';

    showInputModal(modalTitle, modalMessage, '', function (folderName) {
        if (!folderName) return;

        var ws = getSelectedWorkspace();
        var requestData = {
            folder_name: folderName,
            parent_folder_key: parentFolderKey
        };
        if (ws) requestData.workspace = ws;

        fetch('/api/v1/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success) {
                    // Extract folder ID from parentFolderKey (e.g., 'folder_123' -> '123')
                    var parentFolderId = parentFolderKey.replace('folder_', '');
                    var folderDomId = 'folder-' + parentFolderId;

                    // Mark parent folder as open in localStorage before reload
                    localStorage.setItem('folder_' + folderDomId, 'open');

                    // Reload the page
                    if (window.location.pathname.endsWith('create.php')) {
                        var wsStr = ws ? '?workspace=' + encodeURIComponent(ws) : '';
                        window.location.href = 'index.php' + wsStr;
                    } else {
                        window.location.reload();
                    }
                } else {
                    // Use modal alert instead of notification popup
                    if (typeof window.showError === 'function') {
                        window.showError(data.error || data.message || 'Unknown error', 'Error Creating Subfolder');
                    } else {
                        showNotificationPopup('Error creating subfolder: ' + (data.error || 'Unknown error'), 'error');
                    }
                }
            })
            .catch(function (error) {
                // Use modal alert instead of notification popup
                if (typeof window.showError === 'function') {
                    window.showError(error.message, 'Error Creating Subfolder');
                } else {
                    showNotificationPopup('Error creating subfolder: ' + error.message, 'error');
                }
            });
    });
}

/**
 * Get folder path (breadcrumb)
 */
function getFolderPath(folderId, callback) {
    var ws = getSelectedWorkspace();
    var url = '/api/v1/folders/' + folderId + '/path';
    if (ws) url += '?workspace=' + encodeURIComponent(ws);

    fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success && callback) {
                callback(data.path, data.depth);
            }
        })
        .catch(function (error) {
            console.error('Error getting folder path:', error);
        });
}

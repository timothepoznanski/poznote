/**
 * Folder Hierarchy Management
 * Handles creating and displaying hierarchical folders
 */

// Global variables for folder hierarchy
var folderHierarchyData = null;

/**
 * Show dropdown menu for create button
 * @param {number} folderId - The parent folder ID
 * @param {string} folderName - The parent folder name
 * @param {Event} event - The click event
 */
function showCreateDropdown(folderId, folderName, event) {
    event.stopPropagation();

    // Remove existing dropdown
    var existing = document.getElementById('create-dropdown-menu');
    if (existing) {
        existing.remove();
        return; // Toggle behavior
    }

    // Create dropdown menu
    var dropdown = document.createElement('div');
    dropdown.id = 'create-dropdown-menu';
    dropdown.className = 'dropdown-menu';

    var folderKey = 'folder_' + folderId;

    var html = '';
    html += '<div class="dropdown-item" onclick="showCreateNoteInFolderModal(' + folderId + ', \'' + escapeForJs(folderName) + '\'); closeCreateDropdown();">';
    html += '<i class="fa fa-file"></i> Note';
    html += '</div>';
    // Allow subfolder creation for all folders
    html += '<div class="dropdown-item" onclick="createSubfolder(\'' + folderKey + '\'); closeCreateDropdown();">';
    html += '<i class="fa fa-folder"></i> Subfolder';
    html += '</div>';

    dropdown.innerHTML = html;

    // Position the dropdown
    var button = event.currentTarget;
    var rect = button.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
    dropdown.style.left = (rect.left + window.scrollX) + 'px';
    dropdown.style.zIndex = '10000';

    document.body.appendChild(dropdown);

    // Close dropdown when clicking outside
    setTimeout(function () {
        document.addEventListener('click', closeCreateDropdown);
    }, 10);
}

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
 * Escape string for use in JavaScript
 */
function escapeForJs(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Create a subfolder within a parent folder
 * @param {string} parentFolderKey - The parent folder key (e.g., 'folder_123')
 */
function createSubfolder(parentFolderKey) {
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

/**
 * Display folder breadcrumb
 */
function displayFolderBreadcrumb(folderId) {
    getFolderPath(folderId, function (path, depth) {
        var breadcrumbDiv = document.getElementById('folderBreadcrumb');
        if (!breadcrumbDiv) return;

        if (depth === 0) {
            breadcrumbDiv.innerHTML = '';
            breadcrumbDiv.style.display = 'none';
            return;
        }

        var parts = path.split('/');
        var html = '<i class="fa fa-folder-open"></i> ';

        parts.forEach(function (part, index) {
            if (index > 0) {
                html += ' <i class="fa fa-chevron-right"></i> ';
            }
            html += '<span class="breadcrumb-item">' + escapeHtml(part) + '</span>';
        });

        breadcrumbDiv.innerHTML = html;
        breadcrumbDiv.style.display = 'block';
    });
}

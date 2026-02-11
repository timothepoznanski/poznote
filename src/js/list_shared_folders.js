/**
 * List Shared Folders - Client-side functionality
 * 
 * This module manages the shared folders page including:
 * - Filtering and searching folders
 * - Managing folder sharing settings (indexable, password, tokens)
 * - Revoking folder shares
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    
    /**
     * Get configuration from body data attributes
     * These attributes are set server-side for i18n support
     */
    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtIndexable: body.getAttribute('data-txt-indexable') || 'Indexable',
            txtPasswordProtected: body.getAttribute('data-txt-password-protected') || 'Password protected',
            txtAddPasswordTitle: body.getAttribute('data-txt-add-password-title') || 'Add password protection',
            txtChangePasswordTitle: body.getAttribute('data-txt-change-password-title') || 'Change Password',
            txtPasswordRemoveHint: body.getAttribute('data-txt-password-remove-hint') || 'Leave empty to remove password protection.',
            txtEnterNewPassword: body.getAttribute('data-txt-enter-new-password') || 'Enter new password',
            txtCancel: body.getAttribute('data-txt-cancel') || 'Cancel',
            txtSave: body.getAttribute('data-txt-save') || 'Save',
            txtConfirmRevoke: body.getAttribute('data-txt-confirm-revoke') || 'Are you sure you want to revoke sharing for this folder?'
        };
    }

    var config = getConfig();

    // ============================================
    // DOM ELEMENT REFERENCES
    // ============================================
    
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const filterStats = document.getElementById('filterStats');
    const foldersList = document.getElementById('sharedFoldersList');
    const backBtn = document.getElementById('backToNotesBtn');
    const backHomeBtn = document.getElementById('backToHomeBtn');
    const publicNotesBtn = document.getElementById('publicNotesBtn');

    // ============================================
    // EVENT LISTENERS - NAVIGATION
    // ============================================
    
    // Navigate back to notes list
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'index.php';
        });
    }

    // Navigate back to home page
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', function() {
            if (typeof window.goBackToHome === 'function') {
                window.goBackToHome();
            } else {
                window.location.href = 'home.php';
            }
        });
    }

    // Navigate to public notes page
    if (publicNotesBtn) {
        publicNotesBtn.addEventListener('click', function() {
            window.location.href = 'shared.php';
        });
    }

    // ============================================
    // EVENT LISTENERS - SEARCH/FILTER
    // ============================================
    
    // Filter folders by name or token
    if (filterInput && foldersList) {
        filterInput.addEventListener('input', function() {
            const filterText = this.value.toLowerCase().trim();
            const folderItems = foldersList.querySelectorAll('.shared-folder-row');

            folderItems.forEach(function(item) {
                const folderName = item.getAttribute('data-folder-name').toLowerCase();
                const tokenText = item.querySelector('.folder-token')?.textContent.toLowerCase() || '';
                
                const matches = folderName.includes(filterText) || tokenText.includes(filterText);
                
                if (matches) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });

            updateClearButton();
            updateFilterStats();
        });

        // Apply initial filter from URL parameter if present
        var urlParams = new URLSearchParams(window.location.search);
        var initialFilter = urlParams.get('filter');
        if (initialFilter) {
            filterInput.value = initialFilter;
            filterInput.dispatchEvent(new Event('input'));
        }
    }

    // Clear the search filter
    if (clearFilterBtn && filterInput) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input'));
            filterInput.focus();
        });
    }

    // ============================================
    // EVENT LISTENERS - FOLDER ACTIONS
    // ============================================
    
    // Open folder in new tab
    document.querySelectorAll('.btn-open').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-url');
            window.open(url, '_blank');
        });
    });

    // Toggle indexable status for folders
    document.querySelectorAll('.indexable-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
            var folderId = this.getAttribute('data-folder-id');
            var isIndexable = this.checked;
            toggleIndexable(folderId, isIndexable, this);
        });
    });

    // Manage password protection for folders
    document.querySelectorAll('.btn-password').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var folderId = this.getAttribute('data-folder-id');
            var hasPassword = this.getAttribute('data-has-password') === '1';
            showPasswordModal(folderId, hasPassword);
        });
    });

    // Revoke folder sharing
    document.querySelectorAll('.btn-revoke').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var folderId = this.getAttribute('data-folder-id');
            revokeShare(folderId);
        });
    });

    // Edit folder share tokens (inline editing)
    document.querySelectorAll('.folder-token[contenteditable="true"]').forEach(function(tokenSpan) {
        // Save token changes when focus is lost
        tokenSpan.addEventListener('blur', function() {
            var newToken = this.textContent.trim();
            var originalToken = this.getAttribute('data-original-token');
            var folderId = this.getAttribute('data-folder-id');
            updateToken(this, newToken, originalToken, folderId);
        });

        // Handle keyboard shortcuts
        tokenSpan.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur(); // Save changes
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.textContent = this.getAttribute('data-original-token'); // Cancel changes
                this.blur();
            }
        });
    });

    // ============================================
    // API FUNCTIONS
    // ============================================
    
    /**
     * Update the share token for a folder
     * @param {HTMLElement} element - The token span element
     * @param {string} newToken - The new token value
     * @param {string} originalToken - The original token value
     * @param {string} folderId - The folder ID
     */
    function updateToken(element, newToken, originalToken, folderId) {
        // No change, do nothing
        if (newToken === originalToken) {
            return;
        }

        // Validate token length
        if (!newToken || newToken.length < 4) {
            alert(config.txtError + ': Token must be at least 4 characters');
            element.textContent = originalToken;
            return;
        }

        // Send update request to server
        fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                custom_token: newToken
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                throw new Error(data.error);
            }
            
            // Update the original token data attribute
            element.setAttribute('data-original-token', newToken);
            
            // Update the Open button URL with new token
            var row = element.closest('.shared-folder-row');
            if (row) {
                var openBtn = row.querySelector('.btn-open');
                if (openBtn) {
                    var newUrl = '/folder/' + encodeURIComponent(newToken);
                    openBtn.setAttribute('data-url', newUrl);
                }
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
            element.textContent = originalToken; // Revert on error
        });
    }

    /**
     * Toggle the indexable status for a folder
     * Indexable folders can be indexed by search engines
     * @param {string} folderId - The folder ID
     * @param {boolean} isIndexable - Whether the folder should be indexable
     * @param {HTMLElement} checkbox - The checkbox element (for reverting on error)
     */
    function toggleIndexable(folderId, isIndexable, checkbox) {
        fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                indexable: isIndexable ? 1 : 0
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                throw new Error(data.error);
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
            // Revert checkbox state on error
            if (checkbox) {
                checkbox.checked = !isIndexable;
            }
        });
    }

    /**
     * Update or remove password protection for a folder
     * @param {string} folderId - The folder ID
     * @param {string} password - The new password (empty string to remove protection)
     * @returns {Promise} - Promise that resolves when password is updated
     */
    function updatePassword(folderId, password) {
        return fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                password: password
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                throw new Error(data.error);
            }
            // Reload page to reflect password status in UI
            window.location.reload();
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
        });
    }

    /**
     * Revoke sharing for a folder
     * Removes public access and deletes the share token
     * @param {string} folderId - The folder ID
     */
    function revokeShare(folderId) {
        // Ask for confirmation before revoking
        if (!confirm(config.txtConfirmRevoke)) {
            return;
        }

        fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) {
                throw new Error(data.error);
            }
            
            if (data.revoked) {
                // Remove the folder row from the list
                var item = document.querySelector('.shared-folder-row[data-folder-id="' + folderId + '"]');
                if (item) {
                    item.remove();
                }
                
                // Check if no folders remain and show empty message
                var remainingItems = document.querySelectorAll('.shared-folder-row');
                if (remainingItems.length === 0) {
                    var container = document.getElementById('sharedFoldersList');
                    if (container) {
                        container.innerHTML = '<div class="empty-message"><p>No shared folders found.</p></div>';
                    }
                }
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
        });
    }

    /**
     * Show modal to add or change password protection
     * @param {string} folderId - The folder ID
     * @param {boolean} hasPassword - Whether folder currently has a password
     */
    function showPasswordModal(folderId, hasPassword) {
        // Create modal container
        var modal = document.createElement('div');
        modal.id = 'passwordModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        
        // Create modal content wrapper
        var content = document.createElement('div');
        content.className = 'modal-content';
        
        // Create modal header
        var header = document.createElement('div');
        header.className = 'modal-header';
        var h3 = document.createElement('h3');
        h3.textContent = hasPassword ? config.txtChangePasswordTitle : config.txtAddPasswordTitle;
        header.appendChild(h3);
        content.appendChild(header);
        
        // Create modal body
        var body = document.createElement('div');
        body.className = 'modal-body';
        
        // Show hint about removing password if one exists
        if (hasPassword) {
            var removeInfo = document.createElement('p');
            removeInfo.textContent = config.txtPasswordRemoveHint;
            removeInfo.style.marginBottom = '15px';
            removeInfo.style.fontSize = '13px';
            removeInfo.style.color = '#666';
            body.appendChild(removeInfo);
        }
        
        // Create password input field
        var passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'modalPasswordInput';
        passwordInput.placeholder = config.txtEnterNewPassword;
        passwordInput.className = 'modal-password-input';
        passwordInput.style.width = '100%';
        passwordInput.style.padding = '8px 10px';
        passwordInput.style.borderRadius = '6px';
        passwordInput.style.border = '1px solid #ddd';
        passwordInput.style.boxSizing = 'border-box';
        body.appendChild(passwordInput);
        
        content.appendChild(body);
        
        // Create modal footer with action buttons
        var footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        // Cancel button
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = config.txtCancel;
        cancelBtn.addEventListener('click', function() {
            document.body.removeChild(modal);
        });
        
        // Save button
        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = config.txtSave;
        saveBtn.addEventListener('click', function() {
            var password = passwordInput.value.trim();
            updatePassword(folderId, password);
            document.body.removeChild(modal);
        });
        
        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        content.appendChild(footer);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Auto-focus password input
        passwordInput.focus();
        
        // Allow clicking outside modal to close it
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    // ============================================
    // UI HELPER FUNCTIONS
    // ============================================
    
    /**
     * Update visibility of the clear filter button
     * Shows button only when filter has text
     */
    function updateClearButton() {
        if (!clearFilterBtn || !filterInput) return;
        
        if (filterInput.value.trim() !== '') {
            clearFilterBtn.classList.remove('initially-hidden');
        } else {
            clearFilterBtn.classList.add('initially-hidden');
        }
    }

    /**
     * Update filter statistics display
     * Shows count of visible folders vs total when filtering
     */
    function updateFilterStats() {
        if (!filterStats || !foldersList) return;

        const allItems = foldersList.querySelectorAll('.shared-folder-row');
        const visibleItems = foldersList.querySelectorAll('.shared-folder-row:not(.hidden)');
        const totalCount = allItems.length;
        const visibleCount = visibleItems.length;

        // Only show stats when actively filtering
        if (filterInput.value.trim() !== '') {
            filterStats.textContent = `${visibleCount} / ${totalCount}`;
            filterStats.style.display = 'block';
        } else {
            filterStats.textContent = '';
            filterStats.style.display = 'none';
        }
    }

})();

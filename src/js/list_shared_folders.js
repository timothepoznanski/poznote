/**
 * List Shared Folders - Client-side functionality
 */

(function() {
    'use strict';

    // Get configuration from body data attributes
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

    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const filterStats = document.getElementById('filterStats');
    const foldersList = document.getElementById('sharedFoldersList');
    const backBtn = document.getElementById('backToNotesBtn');
    const publicNotesBtn = document.getElementById('publicNotesBtn');

    // Back to notes button
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'index.php';
        });
    }

    // Public notes button
    if (publicNotesBtn) {
        publicNotesBtn.addEventListener('click', function() {
            window.location.href = 'shared.php';
        });
    }

    // Search/filter functionality
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

            // Update clear button and stats
            updateClearButton();
            updateFilterStats();
        });

        // Check for initial filter from URL (after listener is attached)
        var urlParams = new URLSearchParams(window.location.search);
        var initialFilter = urlParams.get('filter');
        if (initialFilter) {
            filterInput.value = initialFilter;
            filterInput.dispatchEvent(new Event('input'));
        }
    }

    // Clear filter button
    if (clearFilterBtn && filterInput) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input'));
            filterInput.focus();
        });
    }

    // Open buttons
    document.querySelectorAll('.btn-open').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const url = this.getAttribute('data-url');
            window.open(url, '_blank');
        });
    });

    // Indexable checkboxes
    document.querySelectorAll('.indexable-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function() {
            var folderId = this.getAttribute('data-folder-id');
            var isIndexable = this.checked;
            toggleIndexable(folderId, isIndexable, this);
        });
    });

    // Password buttons
    document.querySelectorAll('.btn-password').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var folderId = this.getAttribute('data-folder-id');
            var hasPassword = this.getAttribute('data-has-password') === '1';
            showPasswordModal(folderId, hasPassword);
        });
    });

    // Revoke buttons
    document.querySelectorAll('.btn-revoke').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var folderId = this.getAttribute('data-folder-id');
            revokeShare(folderId);
        });
    });

    // Editable tokens
    document.querySelectorAll('.folder-token[contenteditable="true"]').forEach(function(tokenSpan) {
        tokenSpan.addEventListener('blur', function() {
            var newToken = this.textContent.trim();
            var originalToken = this.getAttribute('data-original-token');
            var folderId = this.getAttribute('data-folder-id');
            updateToken(this, newToken, originalToken, folderId);
        });

        tokenSpan.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.textContent = this.getAttribute('data-original-token');
                this.blur();
            }
        });
    });

    /**
     * Update token for a folder
     */
    function updateToken(element, newToken, originalToken, folderId) {
        if (newToken === originalToken) {
            return;
        }

        if (!newToken || newToken.length < 4) {
            alert(config.txtError + ': Token must be at least 4 characters');
            element.textContent = originalToken;
            return;
        }

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
            // Update the data attribute
            element.setAttribute('data-original-token', newToken);
            
            // Update the Open button URL
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
            element.textContent = originalToken;
        });
    }

    /**
     * Toggle indexable status for a folder
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
            // Revert checkbox
            if (checkbox) {
                checkbox.checked = !isIndexable;
            }
        });
    }

    /**
     * Update password for a folder
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
            // Reload page to update UI
            window.location.reload();
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
        });
    }

    /**
     * Revoke share for a folder
     */
    function revokeShare(folderId) {
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
                var item = document.querySelector('.shared-folder-row[data-folder-id="' + folderId + '"]');
                if (item) {
                    item.remove();
                }
                
                // Check if list is empty
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
     * Show password modal
     */
    function showPasswordModal(folderId, hasPassword) {
        var modal = document.createElement('div');
        modal.id = 'passwordModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        
        var content = document.createElement('div');
        content.className = 'modal-content';
        
        var header = document.createElement('div');
        header.className = 'modal-header';
        var h3 = document.createElement('h3');
        h3.textContent = hasPassword ? config.txtChangePasswordTitle : config.txtAddPasswordTitle;
        header.appendChild(h3);
        content.appendChild(header);
        
        var body = document.createElement('div');
        body.className = 'modal-body';
        
        if (hasPassword) {
            var removeInfo = document.createElement('p');
            removeInfo.textContent = config.txtPasswordRemoveHint;
            removeInfo.style.marginBottom = '15px';
            removeInfo.style.fontSize = '13px';
            removeInfo.style.color = '#666';
            body.appendChild(removeInfo);
        }
        
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
        
        var footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = config.txtCancel;
        cancelBtn.addEventListener('click', function() {
            document.body.removeChild(modal);
        });
        
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
        
        passwordInput.focus();
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    /**
     * Update clear button visibility
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
     * Update filter stats
     */
    function updateFilterStats() {
        if (!filterStats || !foldersList) return;

        const allItems = foldersList.querySelectorAll('.shared-folder-row');
        const visibleItems = foldersList.querySelectorAll('.shared-folder-row:not(.hidden)');
        const totalCount = allItems.length;
        const visibleCount = visibleItems.length;

        if (filterInput.value.trim() !== '') {
            filterStats.textContent = `${visibleCount} / ${totalCount}`;
            filterStats.style.display = 'block';
        } else {
            filterStats.textContent = '';
            filterStats.style.display = 'none';
        }
    }

})();

// JavaScript for shared.php page
// Handles public/shared notes management

(function() {
    'use strict';
    
    // Get configuration from body data attributes
    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtUntitled: body.getAttribute('data-txt-untitled') || 'Untitled',
            txtEditToken: body.getAttribute('data-txt-edit-token') || 'Click to edit token',
            txtTokenUpdateFailed: body.getAttribute('data-txt-token-update-failed') || 'Failed to update token',
            txtNetworkError: body.getAttribute('data-txt-network-error') || 'Network error',
            txtIndexable: body.getAttribute('data-txt-indexable') || 'Indexable',
            txtPasswordProtected: body.getAttribute('data-txt-password-protected') || 'Password protected',
            txtAddPasswordTitle: body.getAttribute('data-txt-add-password-title') || 'Add password protection',
            txtChangePasswordTitle: body.getAttribute('data-txt-change-password-title') || 'Change Password',
            txtPasswordRemoveHint: body.getAttribute('data-txt-password-remove-hint') || 'Leave empty to remove password protection.',
            txtEnterNewPassword: body.getAttribute('data-txt-enter-new-password') || 'Enter new password',
            txtOpen: body.getAttribute('data-txt-open') || 'Open public view',
            txtRevoke: body.getAttribute('data-txt-revoke') || 'Revoke',
            txtNoFilterResults: body.getAttribute('data-txt-no-filter-results') || 'No notes match your search.',
            txtToday: body.getAttribute('data-txt-today') || 'Today',
            txtYesterday: body.getAttribute('data-txt-yesterday') || 'Yesterday',
            txtDaysAgo: body.getAttribute('data-txt-days-ago') || 'days ago',
            txtCancel: body.getAttribute('data-txt-cancel') || 'Cancel',
            txtSave: body.getAttribute('data-txt-save') || 'Save',
            txtViaFolder: body.getAttribute('data-txt-via-folder') || 'Shared via folder'
        };
    }
    
    var config = getConfig();
    var sharedNotes = [];
    var filteredNotes = [];
    var filterText = '';
    
    // ========== Navigation ==========
    
    function goBackToNotes() {
        var params = new URLSearchParams();
        if (config.workspace) {
            params.append('workspace', config.workspace);
        }
        window.location.href = 'index.php' + (params.toString() ? '?' + params.toString() : '');
    }
    
    // ========== Filter Functions ==========
    
    function updateClearButton() {
        var clearBtn = document.getElementById('clearFilterBtn');
        if (clearBtn) {
            clearBtn.style.display = filterText ? 'flex' : 'none';
        }
    }
    
    function applyFilter() {
        if (!filterText) {
            filteredNotes = sharedNotes.slice();
        } else {
            filteredNotes = sharedNotes.filter(function(note) {
                var heading = (note.heading || '').toLowerCase();
                var token = (note.token || '').toLowerCase();
                var folderName = (note.shared_folder_name || '').toLowerCase();
                var folderPath = (note.folder_path || '').toLowerCase();
                return heading.includes(filterText) || token.includes(filterText) || folderName.includes(filterText) || folderPath.includes(filterText);
            });
        }
        renderSharedNotes();
        updateFilterStats();
    }
    
    function updateFilterStats() {
        var statsDiv = document.getElementById('filterStats');
        if (statsDiv) {
            if (filterText && filteredNotes.length < sharedNotes.length) {
                statsDiv.textContent = filteredNotes.length + ' / ' + sharedNotes.length;
                statsDiv.style.display = 'block';
            } else {
                statsDiv.style.display = 'none';
            }
        }
    }
    
    // ========== API Functions ==========
    
    function loadSharedNotes() {
        var spinner = document.getElementById('loadingSpinner');
        var container = document.getElementById('sharedNotesContainer');
        var emptyMessage = document.getElementById('emptyMessage');
        
        if (spinner) spinner.style.display = 'block';
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'none';
        
        var params = new URLSearchParams();
        if (config.workspace) {
            params.append('workspace', config.workspace);
        }
        
        fetch('api/v1/shared?' + params.toString())
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                if (data.error) {
                    throw new Error(data.error);
                }
                
                sharedNotes = data.shared_notes || [];
                
                if (spinner) spinner.style.display = 'none';
                
                if (sharedNotes.length === 0) {
                    if (emptyMessage) emptyMessage.style.display = 'block';
                    return;
                }
                
                applyFilter();
            })
            .catch(function(error) {
                if (spinner) spinner.style.display = 'none';
                if (container) {
                    var errDiv = document.createElement('div');
                    errDiv.className = 'error-message';
                    errDiv.textContent = config.txtError + ': ' + error.message;
                    container.innerHTML = '';
                    container.appendChild(errDiv);
                }
            });
    }
    
    function revokeShare(noteId) {
        fetch('/api/v1/notes/' + noteId + '/share', {
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
                var item = document.querySelector('.shared-note-item[data-note-id="' + noteId + '"]');
                if (item) {
                    item.remove();
                }
                
                sharedNotes = sharedNotes.filter(function(note) { return note.note_id !== noteId; });
                applyFilter();
                
                if (sharedNotes.length === 0) {
                    var container = document.getElementById('sharedNotesContainer');
                    var emptyMessage = document.getElementById('emptyMessage');
                    if (container) container.innerHTML = '';
                    if (emptyMessage) emptyMessage.style.display = 'block';
                }
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
        });
    }
    
    function toggleIndexable(noteId, isIndexable) {
        fetch('/api/v1/notes/' + noteId + '/share', {
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
            
            var note = sharedNotes.find(function(n) { return n.note_id === noteId; });
            if (note) {
                note.indexable = isIndexable ? 1 : 0;
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
            var checkbox = document.querySelector('.shared-note-item[data-note-id="' + noteId + '"] .indexable-checkbox');
            if (checkbox) {
                checkbox.checked = !isIndexable;
            }
        });
    }
    
    function updatePassword(noteId, password) {
        return fetch('/api/v1/notes/' + noteId + '/share', {
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
            
            var note = sharedNotes.find(function(n) { return n.note_id === noteId; });
            if (note) {
                note.hasPassword = data.hasPassword ? 1 : 0;
                loadSharedNotes();
            }
        })
        .catch(function(error) {
            alert(config.txtError + ': ' + error.message);
        });
    }
    
    function updateToken(tokenSpan, newToken, originalToken, noteId) {
        if (newToken === originalToken || newToken === '') {
            tokenSpan.textContent = originalToken;
            return;
        }
        
        fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ 
                custom_token: newToken
            })
        })
        .then(function(resp) {
            if (resp.ok) {
                return resp.json();
            } else {
                return resp.json().then(function(errorData) {
                    throw new Error(errorData.error || config.txtTokenUpdateFailed);
                });
            }
        })
        .then(function(data) {
            if (data.url) {
                var noteIndex = sharedNotes.findIndex(function(n) { return n.note_id == noteId; });
                if (noteIndex !== -1) {
                    sharedNotes[noteIndex].token = newToken;
                    sharedNotes[noteIndex].url = data.url;
                }
                tokenSpan.dataset.originalToken = newToken;
                loadSharedNotes();
            } else {
                tokenSpan.textContent = originalToken;
                alert(config.txtTokenUpdateFailed);
            }
        })
        .catch(function(err) {
            tokenSpan.textContent = originalToken;
            alert(err.message || config.txtNetworkError);
        });
    }
    
    // ========== UI Functions ==========
    
    function formatDate(dateString) {
        if (!dateString) return '';
        var date = new Date(dateString);
        var now = new Date();
        var diffMs = now - date;
        var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return config.txtToday;
        } else if (diffDays === 1) {
            return config.txtYesterday;
        } else if (diffDays < 7) {
            return diffDays + ' ' + config.txtDaysAgo;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    function copyUrl(url, button) {
        navigator.clipboard.writeText(url)
            .then(function() {
                var originalHTML = button.innerHTML;
                button.innerHTML = '<i class="fa-check"></i>';
                button.classList.add('copied');
                setTimeout(function() {
                    button.innerHTML = originalHTML;
                    button.classList.remove('copied');
                }, 2000);
            })
            .catch(function() {
                // Fallback for older browsers
                var input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                
                var originalHTML = button.innerHTML;
                button.innerHTML = '<i class="fa-check"></i>';
                setTimeout(function() {
                    button.innerHTML = originalHTML;
                }, 2000);
            });
    }
    
    function showPasswordModal(noteId, hasPassword) {
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
            updatePassword(noteId, password);
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
    
    function renderSharedNotes() {
        var container = document.getElementById('sharedNotesContainer');
        var emptyMessage = document.getElementById('emptyMessage');
        
        if (!container) return;
        container.innerHTML = '';
        
        if (filteredNotes.length === 0) {
            if (filterText) {
                var noResultsDiv = document.createElement('div');
                noResultsDiv.className = 'empty-message';
                noResultsDiv.innerHTML = '<p>' + config.txtNoFilterResults + '</p>';
                container.appendChild(noResultsDiv);
            } else if (emptyMessage) {
                emptyMessage.style.display = 'block';
            }
            return;
        }
        
        if (emptyMessage) emptyMessage.style.display = 'none';
        
        var list = document.createElement('div');
        list.className = 'shared-notes-list';
        
        filteredNotes.forEach(function(note) {
            var item = document.createElement('div');
            item.className = 'shared-note-item';
            item.dataset.noteId = note.note_id;
            
            // Note name container (for name + folder badge)
            var noteNameContainer = document.createElement('div');
            noteNameContainer.className = 'note-name-container';
            
            // Note name (clickable)
            var noteLink = document.createElement('a');
            noteLink.href = 'index.php?note=' + note.note_id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
            noteLink.textContent = note.heading || config.txtUntitled;
            noteLink.className = 'note-name';
            noteNameContainer.appendChild(noteLink);

            // Folder badge / path (AFTER title)
            if (note.folder_path && note.folder_path !== 'Default') {
                var folderBadge = document.createElement('a');
                folderBadge.className = 'folder-badge';
                if (note.shared_via_folder) {
                    folderBadge.href = note.shared_folder_url || '#';
                    folderBadge.target = '_blank';
                    folderBadge.title = config.txtViaFolder + ': ' + (note.folder_path || '');
                } else {
                    folderBadge.style.cursor = 'default';
                    folderBadge.title = note.folder_path;
                }
                
                var pathIcon = document.createElement('i');
                pathIcon.className = 'fas fa-folder';
                pathIcon.style.marginRight = '4px';
                folderBadge.appendChild(pathIcon);
                
                var pathText = document.createTextNode(note.folder_path);
                folderBadge.appendChild(pathText);
                
                noteNameContainer.appendChild(folderBadge);
            }
            
            item.appendChild(noteNameContainer);
            
            // Token (editable if explicitly shared)
            var tokenSpan = document.createElement('span');
            tokenSpan.className = 'note-token';
            if (!note.share_id) {
                tokenSpan.classList.add('read-only');
                tokenSpan.textContent = note.shared_via_folder ? '(' + config.txtViaFolder + ')' : '';
                tokenSpan.title = note.shared_via_folder ? config.txtViaFolder : '';
                tokenSpan.style.fontStyle = 'italic';
            } else {
                tokenSpan.contentEditable = 'true';
                tokenSpan.textContent = note.token;
                tokenSpan.title = config.txtEditToken;
                tokenSpan.dataset.originalToken = note.token;
                tokenSpan.dataset.noteId = note.note_id;
                
                tokenSpan.addEventListener('blur', function() {
                    var newToken = this.textContent.trim();
                    var originalToken = this.dataset.originalToken;
                    var nId = this.dataset.noteId;
                    updateToken(this, newToken, originalToken, nId);
                });
                
                tokenSpan.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.blur();
                    }
                });
            }
            
            item.appendChild(tokenSpan);
            
            // Actions
            var actionsDiv = document.createElement('div');
            actionsDiv.className = 'note-actions';
            
            // Password button (Only if explicitly shared)
            if (note.share_id) {
                var passwordBtn = document.createElement('button');
                passwordBtn.className = 'btn btn-sm btn-password';
                if (note.hasPassword) {
                    passwordBtn.innerHTML = '<i class="fa-lock"></i>';
                    passwordBtn.title = config.txtPasswordProtected;
                } else {
                    passwordBtn.innerHTML = '<i class="fa-lock-open"></i>';
                    passwordBtn.title = config.txtAddPasswordTitle;
                }
                (function(nId, hasPwd) {
                    passwordBtn.addEventListener('click', function() {
                        showPasswordModal(nId, hasPwd);
                    });
                })(note.note_id, note.hasPassword);
                actionsDiv.appendChild(passwordBtn);
            }
            
            var openBtn = document.createElement('button');
            openBtn.className = 'btn btn-sm btn-secondary';
            openBtn.innerHTML = '<i class="fa-external-link"></i>';
            openBtn.title = config.txtOpen;
            if (note.url) {
                (function(url) {
                    openBtn.addEventListener('click', function() {
                        window.open(url, '_blank');
                    });
                })(note.url);
            } else {
                openBtn.disabled = true;
                openBtn.style.opacity = '0.5';
            }
            actionsDiv.appendChild(openBtn);

            if (note.share_id) {
                var revokeBtn = document.createElement('button');
                revokeBtn.className = 'btn btn-sm btn-danger';
                revokeBtn.innerHTML = '<i class="fa-ban"></i>';
                revokeBtn.title = config.txtRevoke;
                (function(nId) {
                    revokeBtn.addEventListener('click', function() {
                        revokeShare(nId);
                    });
                })(note.note_id);
                actionsDiv.appendChild(revokeBtn);
            }
            
            item.appendChild(actionsDiv);
            
            list.appendChild(item);
        });
        
        container.appendChild(list);
    }
    
    // ========== Initialization ==========
    
    document.addEventListener('DOMContentLoaded', function() {
        // Back to home button
        var backHomeBtn = document.getElementById('backToHomeBtn');
        if (backHomeBtn) {
            backHomeBtn.addEventListener('click', function() {
                if (typeof window.goBackToHome === 'function') {
                    window.goBackToHome();
                } else {
                    window.location.href = 'home.php';
                }
            });
        }

        // Back button
        var backBtn = document.getElementById('backToNotesBtn');
        if (backBtn) {
            backBtn.addEventListener('click', goBackToNotes);
        }
        
        // Shared folders button
        var sharedFoldersBtn = document.getElementById('sharedFoldersBtn');
        if (sharedFoldersBtn) {
            sharedFoldersBtn.addEventListener('click', function() {
                var params = new URLSearchParams();
                if (config.workspace) {
                    params.append('workspace', config.workspace);
                }
                window.location.href = 'list_shared_folders.php' + (params.toString() ? '?' + params.toString() : '');
            });
        }
        
        // Filter input
        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');
        
        // Check for initial filter from URL
        var urlParams = new URLSearchParams(window.location.search);
        var initialFilter = urlParams.get('filter');
        if (initialFilter && filterInput) {
            filterInput.value = initialFilter;
            filterText = initialFilter.trim().toLowerCase();
            updateClearButton();
        }
        
        if (filterInput) {
            filterInput.addEventListener('input', function() {
                filterText = this.value.trim().toLowerCase();
                applyFilter();
                updateClearButton();
            });
            
            filterInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    filterText = '';
                    applyFilter();
                    updateClearButton();
                }
            });
        }
        
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                if (filterInput) {
                    filterInput.value = '';
                    filterText = '';
                    applyFilter();
                    updateClearButton();
                    filterInput.focus();
                }
            });
        }
        
        // Load shared notes
        loadSharedNotes();
    });
    
    // Expose functions for potential external use
    window.loadSharedNotes = loadSharedNotes;
    window.goBackToNotes = goBackToNotes;
    
})();

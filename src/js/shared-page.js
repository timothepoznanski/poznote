// Unified shared page - handles both shared notes and shared folders
// with type filtering (all / notes / folders)

(function() {
    'use strict';

    // ========== Configuration ==========

    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            currentUserId: parseInt(body.getAttribute('data-current-user-id') || '0', 10),
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtUntitled: body.getAttribute('data-txt-untitled') || 'Untitled',
            txtEditToken: body.getAttribute('data-txt-edit-token') || 'Click to edit token',
            txtTokenUpdateFailed: body.getAttribute('data-txt-token-update-failed') || 'Failed to update token',
            txtCustomToken: body.getAttribute('data-txt-custom-token') || 'Custom token (optional)',
            txtCustomTokenPlaceholder: body.getAttribute('data-txt-custom-token-placeholder') || 'my_custom_token-1',
            txtUseHttps: body.getAttribute('data-txt-use-https') || 'HTTPS',
            txtSearchIndexable: body.getAttribute('data-txt-search-indexable') || 'Allow indexing by search engines',
            txtPasswordLabel: body.getAttribute('data-txt-password-label') || 'Password',
            txtPasswordPlaceholder: body.getAttribute('data-txt-password-placeholder') || 'Enter a password',
            txtShowPassword: body.getAttribute('data-txt-show-password') || 'Show password',
            txtHidePassword: body.getAttribute('data-txt-hide-password') || 'Hide password',
            txtNetworkError: body.getAttribute('data-txt-network-error') || 'Network error',
            txtIndexable: body.getAttribute('data-txt-indexable') || 'Indexable',
            txtPasswordProtected: body.getAttribute('data-txt-password-protected') || 'Password protected',
            txtAddPasswordTitle: body.getAttribute('data-txt-add-password-title') || 'Add password protection',
            txtChangePasswordTitle: body.getAttribute('data-txt-change-password-title') || 'Change Password',
            txtPasswordRemoveHint: body.getAttribute('data-txt-password-remove-hint') || 'Leave empty to remove password protection.',
            txtEnterNewPassword: body.getAttribute('data-txt-enter-new-password') || 'Enter new password',
            txtCopy: body.getAttribute('data-txt-copy') || 'Copy',
            txtRenew: body.getAttribute('data-txt-renew') || 'Renew',
            txtOpen: body.getAttribute('data-txt-open') || 'Open public view',
            txtRevoke: body.getAttribute('data-txt-revoke') || 'Revoke',
            txtTaskPermissions: body.getAttribute('data-txt-task-permissions') || 'Task list permissions',
            txtTaskReadOnly: body.getAttribute('data-txt-task-read-only') || 'Read only',
            txtTaskCheckOnly: body.getAttribute('data-txt-task-check-only') || 'Check or uncheck only',
            txtTaskFull: body.getAttribute('data-txt-task-full') || 'Full edit',
            txtDirectShare: body.getAttribute('data-txt-direct-share') || 'Shared directly',
            txtNoteSharedThroughFolder: body.getAttribute('data-txt-note-shared-through-folder') || 'Note shared through folder',
            txtFolderSharedThroughParent: body.getAttribute('data-txt-folder-shared-through-parent') || 'Folder shared through parent folder',
            txtNoFilterResults: body.getAttribute('data-txt-no-filter-results') || 'No items match your search.',
            txtTableName: body.getAttribute('data-txt-table-name') || 'Name',
            txtTableNote: body.getAttribute('data-txt-table-note') || 'Note',
            txtTableFolder: body.getAttribute('data-txt-table-folder') || 'Folder',
            txtTableToken: body.getAttribute('data-txt-table-token') || 'Token',
            txtUrlLabel: body.getAttribute('data-txt-url-label') || 'Shared URL',
            txtTokenHelp: body.getAttribute('data-txt-token-help') || 'The token is the unique identifier used in a public share URL. Example: https://your-domain.example/public_note.php?token=my-note-share',
            txtTableActions: body.getAttribute('data-txt-table-actions') || 'Actions',
            txtToday: body.getAttribute('data-txt-today') || 'Today',
            txtYesterday: body.getAttribute('data-txt-yesterday') || 'Yesterday',
            txtDaysAgo: body.getAttribute('data-txt-days-ago') || 'days ago',
            txtCancel: body.getAttribute('data-txt-cancel') || 'Cancel',
            txtSave: body.getAttribute('data-txt-save') || 'Save',
            txtViaFolder: body.getAttribute('data-txt-via-folder') || 'Shared via folder',
            txtConfirmRevokeFolder: body.getAttribute('data-txt-confirm-revoke-folder') || 'Are you sure you want to revoke sharing for this folder?',
            txtNoShares: body.getAttribute('data-txt-no-shares') || 'No shares yet.',
            txtNoSharesHint: body.getAttribute('data-txt-no-shares-hint') || 'Share a note or folder by clicking the cloud button in the toolbar.',
            txtRestrictUsers: body.getAttribute('data-txt-restrict-users') || 'Restrict to specific users',
            txtRestrictUsersPlaceholder: body.getAttribute('data-txt-restrict-users-placeholder') || 'Select users...',
            txtRestrictedBadge: body.getAttribute('data-txt-restricted-badge') || 'Restricted',
            txtRestrictedHelp: body.getAttribute('data-txt-restricted-help') || 'When restricted, only the listed users can access this share after logging in.',
            txtNoUsersFound: body.getAttribute('data-txt-no-users-found') || 'No other users found',
            txtUsersLoading: body.getAttribute('data-txt-users-loading') || 'Loading users...',
            txtSharedWithMe: body.getAttribute('data-txt-shared-with-me') || 'Shared with me',
            txtSharedBy: body.getAttribute('data-txt-shared-by') || 'Shared by',
            txtNoSharedWithMe: body.getAttribute('data-txt-no-shared-with-me') || 'Nothing has been shared with you yet.'
        };
    }

    var config = getConfig();

    // ========== State ==========

    var sharedNotes = [];
    var sharedFolders = [];
    var sharedWithMe = [];
    var allItems = [];
    var filteredItems = [];
    var filterText = '';
    var filterType = 'all';
    var sharePasswordCache = {};
    var pendingEditorRequest = null;
    var pendingEditorHandled = false;
    var SHARE_PASSWORD_STORAGE_KEY = 'poznote-share-password-cache';

    function loadSharePasswordCache() {
        try {
            var rawValue = window.localStorage.getItem(SHARE_PASSWORD_STORAGE_KEY);
            if (!rawValue) {
                return {};
            }

            var parsedValue = JSON.parse(rawValue);
            return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
        } catch (error) {
            return {};
        }
    }

    function persistSharePasswordCache() {
        try {
            window.localStorage.setItem(SHARE_PASSWORD_STORAGE_KEY, JSON.stringify(sharePasswordCache));
        } catch (error) {
            // Ignore storage errors to avoid blocking the edit flow.
        }
    }

    sharePasswordCache = loadSharePasswordCache();

    function getSharePasswordCacheKey(itemType, itemId) {
        return String(itemType || '') + ':' + String(itemId || '');
    }

    function getCachedSharePassword(itemType, itemId) {
        return sharePasswordCache[getSharePasswordCacheKey(itemType, itemId)] || '';
    }

    function setCachedSharePassword(itemType, itemId, password) {
        var cacheKey = getSharePasswordCacheKey(itemType, itemId);
        var nextPassword = password || '';

        if (nextPassword) {
            sharePasswordCache[cacheKey] = nextPassword;
        } else {
            delete sharePasswordCache[cacheKey];
        }

        persistSharePasswordCache();
    }

    function buildEditModalOptions(item) {
        if (!item) return null;

        if (item._type === 'note') {
            var noteHasPassword = !!Number(item.hasPassword);
            if (!noteHasPassword) {
                setCachedSharePassword('note', item.note_id, '');
            }

            return {
                itemId: item.note_id,
                token: item.token,
                itemType: 'note',
                noteType: item.type,
                protocol: getPreferredPublicUrlProtocol(),
                accessMode: item.access_mode || 'full',
                indexable: !!Number(item.indexable),
                hasPassword: noteHasPassword,
                passwordValue: noteHasPassword ? getCachedSharePassword('note', item.note_id) : '',
                allowedUsers: item.allowed_users || null,
                onSave: function(updates) {
                    return updateNoteShareSettings(item.note_id, updates);
                }
            };
        }

        if (item._type === 'folder') {
            var folderHasPassword = !!Number(item.password);
            if (!folderHasPassword) {
                setCachedSharePassword('folder', item.folder_id, '');
            }

            return {
                itemId: item.folder_id,
                token: item.token,
                itemType: 'folder',
                protocol: getPreferredPublicUrlProtocol(),
                accessMode: item.access_mode || 'full',
                indexable: !!Number(item.indexable),
                hasPassword: folderHasPassword,
                passwordValue: folderHasPassword ? getCachedSharePassword('folder', item.folder_id) : '',
                allowedUsers: item.allowed_users || null,
                onSave: function(updates) {
                    return updateFolderShareSettings(item.folder_id, updates);
                }
            };
        }

        return null;
    }

    function openEditModalForItem(item) {
        var modalOptions = buildEditModalOptions(item);
        if (modalOptions) {
            showEditTokenModal(modalOptions);
        }
    }

    function clearPendingEditorRequestFromUrl() {
        if (!window.history || typeof window.history.replaceState !== 'function') {
            return;
        }

        var nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('auto_edit');
        nextUrl.searchParams.delete('item_type');
        nextUrl.searchParams.delete('item_id');
        window.history.replaceState({}, '', nextUrl.toString());
    }

    function maybeOpenRequestedShareEditor() {
        if (!pendingEditorRequest || pendingEditorHandled) {
            return;
        }

        var targetItem = allItems.find(function(item) {
            if (item._type !== pendingEditorRequest.itemType) {
                return false;
            }

            if (pendingEditorRequest.itemType === 'note') {
                return String(item.note_id) === pendingEditorRequest.itemId;
            }

            return String(item.folder_id) === pendingEditorRequest.itemId;
        });

        if (!targetItem) {
            return;
        }

        pendingEditorHandled = true;
        openEditModalForItem(targetItem);
        clearPendingEditorRequestFromUrl();
    }

    // ========== Navigation ==========

    function goBackToNotes() {
        var params = new URLSearchParams();
        if (config.workspace) params.append('workspace', config.workspace);
        window.location.href = 'index.php' + (params.toString() ? '?' + params.toString() : '');
    }

    // ========== Filter ==========

    function updateClearButton() {
        var clearBtn = document.getElementById('clearFilterBtn');
        if (clearBtn) {
            clearBtn.style.display = filterText ? 'flex' : 'none';
        }
    }

    function syncFilterWithUpdatedToken(oldToken, newToken) {
        if (!oldToken || !newToken) return false;

        var currentFilter = (filterText || '').trim().toLowerCase();
        if (currentFilter !== String(oldToken).trim().toLowerCase()) return false;

        filterText = newToken.trim().toLowerCase();

        var filterInput = document.getElementById('filterInput');
        if (filterInput) {
            filterInput.value = newToken;
        }

        updateClearButton();
        return true;
    }

    function applyFilter() {
        filteredItems = allItems.filter(function(item) {
            if (filterType === 'notes' && item._type !== 'note') return false;
            if (filterType === 'folders' && item._type !== 'folder') return false;
            if (filterType === 'shared_with_me' && item._type !== 'shared_with_me_note' && item._type !== 'shared_with_me_folder') return false;
            if (!filterText) return true;
            if (item._type === 'shared_with_me_note') {
                return (item.heading || '').toLowerCase().includes(filterText) || (item.owner_name || '').toLowerCase().includes(filterText) || (item.token || '').toLowerCase().includes(filterText);
            }
            if (item._type === 'shared_with_me_folder') {
                return (item.folder_name || '').toLowerCase().includes(filterText) || (item.owner_name || '').toLowerCase().includes(filterText) || (item.token || '').toLowerCase().includes(filterText);
            }
            if (item._type === 'note') {
                var heading = (item.heading || '').toLowerCase();
                var token = (item.token || '').toLowerCase();
                var folderName = (item.shared_folder_name || '').toLowerCase();
                var folderPath = (item.folder_path || '').toLowerCase();
                return heading.includes(filterText) || token.includes(filterText) || folderName.includes(filterText) || folderPath.includes(filterText);
            } else {
                var name = (item.folder_name || '').toLowerCase();
                var path = (item.folder_path || '').toLowerCase();
                var tok = (item.token || '').toLowerCase();
                return name.includes(filterText) || path.includes(filterText) || tok.includes(filterText);
            }
        });
        renderItems();
        updateFilterStats();
    }

    function updateFilterStats() {
        var statsDiv = document.getElementById('filterStats');
        if (statsDiv) {
            if (allItems.length > 0) {
                statsDiv.textContent = filteredItems.length + ' / ' + allItems.length;
                statsDiv.style.display = 'block';
            } else {
                statsDiv.style.display = 'none';
            }
        }
    }

    // ========== Data loading ==========

    function mergeItems() {
        allItems = [];
        sharedFolders.forEach(function(folder) {
            folder.public_url = normalizePublicUrl(folder.public_url || buildFolderPublicUrl(folder.token || ''));
        });
        sharedNotes.forEach(function(note) { note._type = 'note'; allItems.push(note); });
        sharedFolders.forEach(function(folder) { folder._type = 'folder'; allItems.push(folder); });
        sharedWithMe.forEach(function(item) { allItems.push(item); });
    }

    function loadSharedNotes() {
        var spinner = document.getElementById('loadingSpinner');
        var container = document.getElementById('sharedItemsContainer');
        var emptyMessage = document.getElementById('emptyMessage');

        if (spinner) spinner.style.display = 'block';
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'none';

        sharedFolders = window.__sharedFoldersData || [];

        var params = new URLSearchParams();
        if (config.workspace) params.append('workspace', config.workspace);

        fetch('api/v1/shared?' + params.toString())
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
                return response.json();
            })
            .then(function(data) {
                if (data.error) throw new Error(data.error);
                sharedNotes = data.shared_notes || [];
                return fetch('api/v1/shared/with-me');
            })
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
                return response.json();
            })
            .then(function(data) {
                sharedWithMe = data.items || [];
                if (spinner) spinner.style.display = 'none';
                mergeItems();
                if (allItems.length === 0) {
                    if (emptyMessage) emptyMessage.style.display = 'block';
                    return;
                }
                applyFilter();
                maybeOpenRequestedShareEditor();
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

    // ========== Note API actions ==========

    function revokeNoteShare(noteId) {
        fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            if (data.revoked) {
                sharedNotes = sharedNotes.filter(function(n) { return n.note_id !== noteId; });
                mergeItems();
                applyFilter();
                checkEmpty();
            }
        })
        .catch(function(error) { alert(config.txtError + ': ' + error.message); });
    }

    function updateNotePassword(noteId, password) {
        return fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password: password })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            var note = sharedNotes.find(function(n) { return n.note_id === noteId; });
            if (note) note.hasPassword = data.hasPassword ? 1 : 0;
            mergeItems();
            applyFilter();
        })
        .catch(function(error) { alert(config.txtError + ': ' + error.message); });
    }

    function updateNoteAccessMode(noteId, accessMode) {
        return fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ access_mode: accessMode })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            var note = sharedNotes.find(function(n) { return n.note_id === noteId; });
            if (note) note.access_mode = data.accessMode || accessMode;
        });
    }

    function updateNoteShareSettings(noteId, updates) {
        var payload = {};
        if (Object.prototype.hasOwnProperty.call(updates, 'custom_token') && updates.custom_token) {
            payload.custom_token = updates.custom_token;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'access_mode')) {
            payload.access_mode = updates.access_mode;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
            payload.indexable = updates.indexable ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'password')) {
            payload.password = updates.password;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users')) {
            payload.allowed_users = updates.allowed_users;
        }

        if (Object.keys(payload).length === 0) {
            return Promise.resolve({ success: true });
        }

        return fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function(resp) {
            if (resp.ok) return resp.json();
            return resp.json().then(function(e) { throw new Error(e.error || config.txtTokenUpdateFailed); });
        })
        .then(function(data) {
            var idx = sharedNotes.findIndex(function(n) { return n.note_id == noteId; });
            if (idx !== -1) {
                if (Object.prototype.hasOwnProperty.call(updates, 'custom_token') && updates.custom_token) {
                    sharedNotes[idx].token = updates.custom_token;
                    sharedNotes[idx].url = buildNotePublicUrl(updates.custom_token);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
                    sharedNotes[idx].indexable = updates.indexable ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'access_mode')) {
                    sharedNotes[idx].access_mode = updates.access_mode;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'password')) {
                    sharedNotes[idx].hasPassword = updates.password ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users') && updates.allowed_users !== undefined) {
                    sharedNotes[idx].allowed_users = updates.allowed_users;
                }
            }
            mergeItems();
            applyFilter();
            return data;
        })
        .catch(function(err) {
            throw err;
        });
    }

    // ========== Folder API actions ==========

    function revokeFolderShare(folderId) {
        if (!confirm(config.txtConfirmRevokeFolder)) return;
        fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'DELETE',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            if (data.revoked) {
                sharedFolders = sharedFolders.filter(function(f) { return f.folder_id != folderId; });
                mergeItems();
                applyFilter();
                checkEmpty();
            }
        })
        .catch(function(error) { alert(config.txtError + ': ' + error.message); });
    }

    function updateFolderPassword(folderId, password) {
        return fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ password: password })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            window.location.reload();
        })
        .catch(function(error) { alert(config.txtError + ': ' + error.message); });
    }

    function updateFolderShareSettings(folderId, updates) {
        var payload = {};
        if (Object.prototype.hasOwnProperty.call(updates, 'custom_token')) {
            if (!updates.custom_token || updates.custom_token.length < 4) {
                return Promise.reject(new Error('Token must be at least 4 characters'));
            }
            payload.custom_token = updates.custom_token;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
            payload.indexable = updates.indexable ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'password')) {
            payload.password = updates.password;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users')) {
            payload.allowed_users = updates.allowed_users;
        }

        if (Object.keys(payload).length === 0) {
            return Promise.resolve({ success: true });
        }

        return fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            var folder = sharedFolders.find(function(f) { return f.folder_id == folderId; });
            if (folder) {
                if (Object.prototype.hasOwnProperty.call(updates, 'custom_token')) {
                    folder.token = updates.custom_token;
                    folder.public_url = buildFolderPublicUrl(updates.custom_token);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
                    folder.indexable = updates.indexable ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'password')) {
                    folder.password = updates.password ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users') && updates.allowed_users !== undefined) {
                    folder.allowed_users = updates.allowed_users;
                }
            }
            mergeItems();
            applyFilter();
            return data;
        })
        .catch(function(error) { throw error; });
    }

    // ========== UI Helpers ==========

    function checkEmpty() {
        var emptyMessage = document.getElementById('emptyMessage');
        var container = document.getElementById('sharedItemsContainer');
        if (allItems.length === 0) {
            if (container) container.innerHTML = '';
            if (emptyMessage) emptyMessage.style.display = 'block';
        }
    }

    function buildNotePublicUrl(token) {
        return new URL(encodeURIComponent(token), window.location.origin + '/').href;
    }

    function buildFolderPublicUrl(token) {
        return new URL('folder/' + encodeURIComponent(token), window.location.origin + '/').href;
    }

    function getPreferredPublicUrlProtocol() {
        try {
            var protocol = localStorage.getItem('poznote-public-url-protocol');
            if (protocol === 'http' || protocol === 'https') {
                return protocol;
            }
        } catch (error) {
            // Ignore storage errors.
        }
        return 'https';
    }

    function setPreferredPublicUrlProtocol(protocol) {
        try {
            if (protocol === 'http' || protocol === 'https') {
                localStorage.setItem('poznote-public-url-protocol', protocol);
            }
        } catch (error) {
            // Ignore storage errors.
        }
    }

    function applyProtocolToPublicUrl(url, protocol) {
        if (!url) return url;
        if (protocol !== 'http' && protocol !== 'https') return url;

        if (/^https?:\/\//i.test(url)) {
            return protocol + '://' + url.replace(/^https?:\/\//i, '');
        }
        if (/^\/\//.test(url)) {
            return protocol + ':' + url;
        }
        return url;
    }

    function normalizePublicUrl(url) {
        if (!url) return '';
        try {
            return new URL(url, window.location.origin + '/').href;
        } catch (error) {
            return url;
        }
    }

    function generateRandomToken() {
        var bytes = new Uint8Array(16);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var index = 0; index < bytes.length; index++) {
                bytes[index] = Math.floor(Math.random() * 256);
            }
        }

        var parts = [];
        for (var i = 0; i < bytes.length; i++) {
            parts.push(bytes[i].toString(16).padStart(2, '0'));
        }
        return parts.join('');
    }

    function copyTextToClipboard(text) {
        if (!text) return Promise.reject(new Error(config.txtError));

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).catch(function() {
                return fallbackCopyText(text);
            });
        }

        return fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        return new Promise(function(resolve, reject) {
            try {
                var textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', 'readonly');
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);

                var success = document.execCommand('copy');
                document.body.removeChild(textarea);

                if (success) {
                    resolve();
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            window.prompt('Copy this URL', text);
            resolve();
        });
    }

    function copyItemUrl(url) {
        return copyTextToClipboard(url).catch(function() {
            window.prompt('Copy this URL', url);
        });
    }

    function renderTokenCell(token, fallbackText) {
        var wrapper = document.createElement('div');
        wrapper.className = 'note-token-wrap read-only';

        var content = document.createElement('span');
        content.className = 'note-token' + (token ? '' : ' read-only');

        if (token) {
            content.textContent = token;
            content.title = token;
        } else {
            content.textContent = fallbackText || '';
            content.title = fallbackText || '';
            content.style.fontStyle = 'italic';
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    function buildPreviewUrlForModal(options, token, protocol) {
        var nextToken = token || options.token || '';
        var nextProtocol = protocol || options.protocol || getPreferredPublicUrlProtocol();
        var rawUrl = options.itemType === 'folder'
            ? buildFolderPublicUrl(nextToken)
            : buildNotePublicUrl(nextToken);

        return applyProtocolToPublicUrl(normalizePublicUrl(rawUrl), nextProtocol);
    }

    function showEditTokenModal(options) {
        var modal = document.createElement('div');
        modal.className = 'modal shared-edit-token-modal';
        modal.style.display = 'flex';
        var initialPasswordValue = options.passwordValue || '';
        var passwordDirty = false;

        var content = document.createElement('div');
        content.className = 'modal-content shared-edit-token-modal-content';

        var header = document.createElement('div');
        header.className = 'modal-header';
        var title = document.createElement('h3');
        var titleText = document.createElement('span');
        titleText.className = 'shared-edit-token-modal-title-link';
        title.appendChild(titleText);
        header.appendChild(title);
        content.appendChild(header);

        var body = document.createElement('div');
        body.className = 'modal-body';

        var tokenRow = document.createElement('div');
        tokenRow.className = 'shared-edit-token-field-row';

        var tokenLabel = document.createElement('label');
        tokenLabel.className = 'shared-edit-token-field-label';
        tokenLabel.textContent = config.txtCustomToken;
        tokenRow.appendChild(tokenLabel);

        var tokenValue = document.createElement('div');
        tokenValue.className = 'shared-edit-token-field-value';

        var tokenFieldGroup = document.createElement('div');
        tokenFieldGroup.className = 'shared-edit-token-inline-group';

        var input = document.createElement('input');
        input.type = 'text';
        input.value = options.token || '';
        input.placeholder = config.txtCustomTokenPlaceholder;
        input.className = 'modal-password-input';
        input.style.width = '100%';
        input.style.padding = '8px 10px';
        input.style.borderRadius = '6px';
        input.style.border = '1px solid #ddd';
        input.style.boxSizing = 'border-box';
        input.style.margin = '0';

        var renewBtn = document.createElement('button');
        renewBtn.type = 'button';
        renewBtn.className = 'btn btn-secondary shared-edit-token-inline-renew';
        renewBtn.title = config.txtRenew;
        renewBtn.setAttribute('aria-label', config.txtRenew);
        renewBtn.innerHTML = '<i class="lucide lucide-refresh-cw"></i>';

        tokenFieldGroup.appendChild(input);
        tokenFieldGroup.appendChild(renewBtn);
        tokenValue.appendChild(tokenFieldGroup);
        tokenRow.appendChild(tokenValue);
        body.appendChild(tokenRow);

        var passwordRow = document.createElement('div');
        passwordRow.className = 'shared-edit-token-field-row';

        var passwordLabel = document.createElement('label');
        passwordLabel.className = 'shared-edit-token-field-label';
        passwordLabel.textContent = config.txtPasswordLabel;
        passwordRow.appendChild(passwordLabel);

        var passwordValue = document.createElement('div');
        passwordValue.className = 'shared-edit-token-field-value';

        var passwordFieldGroup = document.createElement('div');
        passwordFieldGroup.className = 'shared-edit-token-inline-group';

        var passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.value = initialPasswordValue;
        passwordInput.placeholder = config.txtPasswordPlaceholder;
        passwordInput.className = 'modal-password-input';
        passwordInput.style.width = '100%';
        passwordInput.style.padding = '8px 10px';
        passwordInput.style.borderRadius = '6px';
        passwordInput.style.border = '1px solid #ddd';
        passwordInput.style.boxSizing = 'border-box';
        passwordInput.style.margin = '0';

        var togglePasswordBtn = document.createElement('button');
        togglePasswordBtn.type = 'button';
        togglePasswordBtn.className = 'btn btn-secondary shared-edit-token-password-toggle';
        togglePasswordBtn.title = config.txtShowPassword;
        togglePasswordBtn.setAttribute('aria-label', config.txtShowPassword);
        togglePasswordBtn.innerHTML = '<i class="lucide lucide-eye"></i>';

        function updatePasswordToggleState() {
            var isVisible = passwordInput.type === 'text';
            togglePasswordBtn.title = isVisible ? config.txtHidePassword : config.txtShowPassword;
            togglePasswordBtn.setAttribute('aria-label', isVisible ? config.txtHidePassword : config.txtShowPassword);
            togglePasswordBtn.innerHTML = isVisible
                ? '<i class="lucide lucide-eye-off"></i>'
                : '<i class="lucide lucide-eye"></i>';
        }

        togglePasswordBtn.addEventListener('click', function() {
            passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
            updatePasswordToggleState();
            passwordInput.focus();
            var valueLength = passwordInput.value.length;
            if (typeof passwordInput.setSelectionRange === 'function') {
                passwordInput.setSelectionRange(valueLength, valueLength);
            }
        });

        passwordInput.addEventListener('input', function() {
            passwordDirty = true;
        });

        passwordFieldGroup.appendChild(passwordInput);
        passwordFieldGroup.appendChild(togglePasswordBtn);
        passwordValue.appendChild(passwordFieldGroup);
        passwordRow.appendChild(passwordValue);
        body.appendChild(passwordRow);

        var permissionsSelect = null;
        if (options.itemType === 'note' && options.noteType === 'tasklist') {
            var permissionsRow = document.createElement('div');
            permissionsRow.className = 'shared-edit-token-field-row';

            var permissionsLabel = document.createElement('label');
            permissionsLabel.className = 'shared-edit-token-field-label';
            permissionsLabel.textContent = config.txtTaskPermissions;
            permissionsRow.appendChild(permissionsLabel);

            var permissionsValue = document.createElement('div');
            permissionsValue.className = 'shared-edit-token-field-value';

            permissionsSelect = document.createElement('select');
            permissionsSelect.className = 'modal-password-input';
            permissionsSelect.style.width = '100%';
            permissionsSelect.style.padding = '8px 10px';
            permissionsSelect.style.borderRadius = '6px';
            permissionsSelect.style.border = '1px solid #ddd';
            permissionsSelect.style.boxSizing = 'border-box';
            permissionsSelect.style.margin = '0';

            [
                { value: 'read_only', label: config.txtTaskReadOnly },
                { value: 'check_only', label: config.txtTaskCheckOnly },
                { value: 'full', label: config.txtTaskFull }
            ].forEach(function(option) {
                var selectOption = document.createElement('option');
                selectOption.value = option.value;
                selectOption.textContent = option.label;
                permissionsSelect.appendChild(selectOption);
            });

            permissionsSelect.value = options.accessMode || 'full';
            permissionsValue.appendChild(permissionsSelect);
            permissionsRow.appendChild(permissionsValue);
            body.appendChild(permissionsRow);
        }

        var protocolWrap = document.createElement('div');
        protocolWrap.className = 'share-protocol-wrap';
        protocolWrap.style.marginTop = '14px';

        var protocolLabel = document.createElement('label');
        protocolLabel.className = 'share-indexable-label';
        protocolLabel.style.display = 'flex';
        protocolLabel.style.alignItems = 'center';
        protocolLabel.style.justifyContent = 'space-between';
        protocolLabel.style.width = '100%';

        var protocolText = document.createElement('span');
        protocolText.className = 'indexable-label-text';
        protocolText.textContent = config.txtUseHttps;

        var protocolToggle = document.createElement('label');
        protocolToggle.className = 'toggle-switch';
        var protocolCheckbox = document.createElement('input');
        protocolCheckbox.type = 'checkbox';
        protocolCheckbox.checked = (options.protocol || getPreferredPublicUrlProtocol()) === 'https';
        var protocolSlider = document.createElement('span');
        protocolSlider.className = 'toggle-slider';
        protocolToggle.appendChild(protocolCheckbox);
        protocolToggle.appendChild(protocolSlider);
        protocolLabel.appendChild(protocolText);
        protocolLabel.appendChild(protocolToggle);
        protocolWrap.appendChild(protocolLabel);
        body.appendChild(protocolWrap);

        var indexableWrap = document.createElement('div');
        indexableWrap.className = 'share-indexable-wrap';
        indexableWrap.style.marginTop = '14px';

        var indexableLabel = document.createElement('label');
        indexableLabel.className = 'share-indexable-label';
        indexableLabel.style.display = 'flex';
        indexableLabel.style.alignItems = 'center';
        indexableLabel.style.justifyContent = 'space-between';
        indexableLabel.style.width = '100%';

        var indexableText = document.createElement('span');
        indexableText.className = 'indexable-label-text';
        indexableText.textContent = config.txtSearchIndexable;

        var indexableToggle = document.createElement('label');
        indexableToggle.className = 'toggle-switch';
        var indexableCheckbox = document.createElement('input');
        indexableCheckbox.type = 'checkbox';
        indexableCheckbox.checked = !!options.indexable;
        var indexableSlider = document.createElement('span');
        indexableSlider.className = 'toggle-slider';
        indexableToggle.appendChild(indexableCheckbox);
        indexableToggle.appendChild(indexableSlider);
        indexableLabel.appendChild(indexableText);
        indexableLabel.appendChild(indexableToggle);
        indexableWrap.appendChild(indexableLabel);
        body.appendChild(indexableWrap);

        // ---- User restriction section ----
        var restrictUsersWrap = document.createElement('div');
        restrictUsersWrap.className = 'share-restrict-users-wrap';
        restrictUsersWrap.style.marginTop = '14px';

        var restrictToggleLabel = document.createElement('label');
        restrictToggleLabel.className = 'share-indexable-label';
        restrictToggleLabel.style.display = 'flex';
        restrictToggleLabel.style.alignItems = 'center';
        restrictToggleLabel.style.justifyContent = 'space-between';
        restrictToggleLabel.style.width = '100%';

        var restrictText = document.createElement('span');
        restrictText.className = 'indexable-label-text';
        restrictText.textContent = config.txtRestrictUsers;

        var restrictToggle = document.createElement('label');
        restrictToggle.className = 'toggle-switch';
        var restrictCheckbox = document.createElement('input');
        restrictCheckbox.type = 'checkbox';
        restrictCheckbox.checked = !!(options.allowedUsers && options.allowedUsers.length > 0);
        var restrictSlider = document.createElement('span');
        restrictSlider.className = 'toggle-slider';
        restrictToggle.appendChild(restrictCheckbox);
        restrictToggle.appendChild(restrictSlider);
        restrictToggleLabel.appendChild(restrictText);
        restrictToggleLabel.appendChild(restrictToggle);
        restrictUsersWrap.appendChild(restrictToggleLabel);

        var userListContainer = document.createElement('div');
        userListContainer.className = 'share-user-list-container';
        userListContainer.style.marginTop = '10px';
        userListContainer.style.display = restrictCheckbox.checked ? 'block' : 'none';

        var userListLoading = document.createElement('div');
        userListLoading.textContent = config.txtUsersLoading;
        userListLoading.style.fontSize = '13px';
        userListLoading.style.color = '#888';
        userListContainer.appendChild(userListLoading);

        restrictUsersWrap.appendChild(userListContainer);
        body.appendChild(restrictUsersWrap);

        var availableUsers = [];
        var selectedUserIds = (options.allowedUsers && Array.isArray(options.allowedUsers))
            ? options.allowedUsers.map(function(id) { return parseInt(id, 10); })
            : [];

        function renderUserCheckboxes() {
            userListContainer.innerHTML = '';
            if (availableUsers.length === 0) {
                var noUsers = document.createElement('div');
                noUsers.textContent = config.txtNoUsersFound;
                noUsers.style.fontSize = '13px';
                noUsers.style.color = '#888';
                noUsers.style.padding = '6px 0';
                userListContainer.appendChild(noUsers);
                return;
            }

            availableUsers.forEach(function(user) {
                var row = document.createElement('label');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';
                row.style.padding = '4px 0';
                row.style.cursor = 'pointer';
                row.style.fontSize = '14px';

                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = user.id;
                cb.checked = selectedUserIds.indexOf(user.id) !== -1;
                cb.addEventListener('change', function() {
                    if (cb.checked) {
                        if (selectedUserIds.indexOf(user.id) === -1) {
                            selectedUserIds.push(user.id);
                        }
                    } else {
                        selectedUserIds = selectedUserIds.filter(function(id) { return id !== user.id; });
                    }
                });

                var displayName = document.createElement('span');
                displayName.textContent = user.username + (user.email ? ' (' + user.email + ')' : '');

                row.appendChild(cb);
                row.appendChild(displayName);
                userListContainer.appendChild(row);
            });
        }

        function loadAvailableUsers() {
            fetch('/api/v1/users/profiles', {
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
            })
            .then(function(resp) { return resp.json(); })
            .then(function(users) {
                availableUsers = (users || []).filter(function(u) {
                    return parseInt(u.id, 10) !== config.currentUserId;
                }).map(function(u) {
                    return { id: parseInt(u.id, 10), username: u.username, email: u.email };
                });
                renderUserCheckboxes();
            })
            .catch(function() {
                userListContainer.innerHTML = '';
                var errMsg = document.createElement('div');
                errMsg.textContent = config.txtError;
                errMsg.style.fontSize = '13px';
                errMsg.style.color = '#c00';
                userListContainer.appendChild(errMsg);
            });
        }

        restrictCheckbox.addEventListener('change', function() {
            userListContainer.style.display = restrictCheckbox.checked ? 'block' : 'none';
            if (restrictCheckbox.checked && availableUsers.length === 0) {
                loadAvailableUsers();
            }
            if (!restrictCheckbox.checked) {
                selectedUserIds = [];
            }
        });

        if (restrictCheckbox.checked) {
            loadAvailableUsers();
        }
        // ---- End user restriction section ----

        content.appendChild(body);

        var footer = document.createElement('div');
        footer.className = 'modal-footer shared-edit-token-modal-footer';
        footer.style.display = 'flex';
        footer.style.flexWrap = 'nowrap';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '8px';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.textContent = config.txtCancel;

        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = config.txtSave;

        function closeModal() {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }

        function updatePreviewUrl() {
            var previewUrl = buildPreviewUrlForModal(options, input.value.trim() || options.token, protocolCheckbox.checked ? 'https' : 'http');
            titleText.textContent = previewUrl;
            titleText.title = previewUrl;
        }

        cancelBtn.addEventListener('click', closeModal);
        renewBtn.addEventListener('click', function() {
            input.value = generateRandomToken();
            updatePreviewUrl();
            input.focus();
        });
        protocolCheckbox.addEventListener('change', updatePreviewUrl);
        input.addEventListener('input', updatePreviewUrl);
        saveBtn.addEventListener('click', function() {
            var nextToken = input.value.trim();
            var nextProtocol = protocolCheckbox.checked ? 'https' : 'http';
            var nextIndexable = !!indexableCheckbox.checked;
            var nextPassword = passwordInput.value.trim();
            var nextAccessMode = permissionsSelect ? permissionsSelect.value : undefined;
            var tokenChanged = !!nextToken && nextToken !== options.token;
            var protocolChanged = nextProtocol !== (options.protocol || getPreferredPublicUrlProtocol());
            var indexableChanged = nextIndexable !== !!options.indexable;
            var accessModeChanged = !!permissionsSelect && nextAccessMode !== (options.accessMode || 'full');
            var passwordShouldBeSaved = passwordDirty;

            // Determine allowed_users change
            var nextAllowedUsers = restrictCheckbox.checked ? selectedUserIds.slice() : null;
            var prevAllowedUsers = options.allowedUsers || null;
            var allowedUsersChanged = JSON.stringify(nextAllowedUsers) !== JSON.stringify(prevAllowedUsers);

            if ((!nextToken || !tokenChanged) && !protocolChanged && !indexableChanged && !accessModeChanged && !passwordShouldBeSaved && !allowedUsersChanged) {
                closeModal();
                return;
            }

            saveBtn.disabled = true;
            options.onSave({
                custom_token: tokenChanged ? nextToken : undefined,
                access_mode: accessModeChanged ? nextAccessMode : undefined,
                indexable: nextIndexable,
                password: passwordShouldBeSaved ? nextPassword : undefined,
                protocol: nextProtocol,
                allowed_users: allowedUsersChanged ? nextAllowedUsers : undefined
            })
                .then(function() {
                    if (passwordShouldBeSaved) {
                        setCachedSharePassword(options.itemType, options.itemId, nextPassword);
                    }
                    setPreferredPublicUrlProtocol(nextProtocol);
                    if (tokenChanged && syncFilterWithUpdatedToken(options.token, nextToken)) {
                        applyFilter();
                    } else if (protocolChanged || indexableChanged || accessModeChanged || passwordShouldBeSaved) {
                        mergeItems();
                        applyFilter();
                    }
                    closeModal();
                })
                .catch(function(error) {
                    alert(config.txtError + ': ' + (error.message || config.txtTokenUpdateFailed));
                    saveBtn.disabled = false;
                });
        });

        input.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveBtn.click();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);
        updatePasswordToggleState();
        updatePreviewUrl();

        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

    function showPasswordModal(id, hasPassword, isFolder) {
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
        cancelBtn.addEventListener('click', function() { document.body.removeChild(modal); });

        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = config.txtSave;
        saveBtn.addEventListener('click', function() {
            var pw = passwordInput.value.trim();
            if (isFolder) {
                updateFolderPassword(id, pw);
            } else {
                updateNotePassword(id, pw);
            }
            document.body.removeChild(modal);
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        content.appendChild(footer);
        modal.appendChild(content);
        document.body.appendChild(modal);
        passwordInput.focus();

        modal.addEventListener('click', function(e) {
            if (e.target === modal) document.body.removeChild(modal);
        });
    }

    // ========== Rendering ==========

    function renderItems() {
        var container = document.getElementById('sharedItemsContainer');
        var emptyMessage = document.getElementById('emptyMessage');
        if (!container) return;
        container.innerHTML = '';

        if (filteredItems.length === 0) {
            if (filterType === 'shared_with_me' && !filterText) {
                var noSharedDiv = document.createElement('div');
                noSharedDiv.className = 'empty-message';
                noSharedDiv.innerHTML = '<p>' + config.txtNoSharedWithMe + '</p>';
                container.appendChild(noSharedDiv);
            } else if (filterText || filterType !== 'all') {
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

        var header = document.createElement('div');
        header.className = 'shared-notes-header';

        var headerName = document.createElement('div');
        headerName.className = 'shared-notes-header-cell shared-notes-header-note';
        headerName.textContent = config.txtTableName;
        header.appendChild(headerName);

        var headerFolder = document.createElement('div');
        headerFolder.className = 'shared-notes-header-cell shared-notes-header-folder';
        headerFolder.textContent = config.txtTableFolder;
        header.appendChild(headerFolder);

        var headerUrl = document.createElement('div');
        headerUrl.className = 'shared-notes-header-cell shared-notes-header-token';

        var headerTokenLabel = document.createElement('span');
        headerTokenLabel.textContent = config.txtTableToken;
        headerUrl.appendChild(headerTokenLabel);

        var tokenHelp = document.createElement('span');
        tokenHelp.className = 'shared-header-help';
        tokenHelp.tabIndex = 0;
        tokenHelp.setAttribute('role', 'button');
        tokenHelp.setAttribute('aria-label', config.txtTokenHelp);
        tokenHelp.innerHTML = '<i class="lucide lucide-help-circle"></i>';

        var tokenHelpTooltip = document.createElement('span');
        tokenHelpTooltip.className = 'shared-header-help-tooltip';
        tokenHelpTooltip.textContent = config.txtTokenHelp;
        tokenHelp.appendChild(tokenHelpTooltip);

        headerUrl.appendChild(tokenHelp);
        header.appendChild(headerUrl);

        var headerRestricted = document.createElement('div');
        headerRestricted.className = 'shared-notes-header-cell shared-notes-header-restricted';

        var headerRestrictedLabel = document.createElement('span');
        headerRestrictedLabel.textContent = config.txtRestrictedBadge;
        headerRestricted.appendChild(headerRestrictedLabel);

        var restrictedHelp = document.createElement('span');
        restrictedHelp.className = 'shared-header-help';
        restrictedHelp.tabIndex = 0;
        restrictedHelp.setAttribute('role', 'button');
        restrictedHelp.setAttribute('aria-label', config.txtRestrictedHelp);
        restrictedHelp.innerHTML = '<i class="lucide lucide-help-circle"></i>';

        var restrictedHelpTooltip = document.createElement('span');
        restrictedHelpTooltip.className = 'shared-header-help-tooltip';
        restrictedHelpTooltip.textContent = config.txtRestrictedHelp;
        restrictedHelp.appendChild(restrictedHelpTooltip);
        headerRestricted.appendChild(restrictedHelp);

        header.appendChild(headerRestricted);

        var headerActions = document.createElement('div');
        headerActions.className = 'shared-notes-header-cell shared-notes-header-actions';
        headerActions.textContent = config.txtTableActions;
        header.appendChild(headerActions);

        list.appendChild(header);

        filteredItems.forEach(function(item) {
            if (item._type === 'note') {
                list.appendChild(renderNoteItem(item));
            } else if (item._type === 'shared_with_me_note' || item._type === 'shared_with_me_folder') {
                list.appendChild(renderSharedWithMeItem(item));
            } else {
                list.appendChild(renderFolderItem(item));
            }
        });

        container.appendChild(list);
    }

    function buildRestrictedCell(isRestricted) {
        var cell = document.createElement('div');
        cell.className = 'note-restricted-cell';
        if (isRestricted) {
            cell.innerHTML = '<i class="lucide lucide-check-circle" title="' + config.txtRestrictedBadge + '"></i>';
        }
        return cell;
    }

    function renderNoteItem(note) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item';
        item.dataset.noteId = note.note_id;
        item.dataset.itemType = 'note';

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var typeIcon = document.createElement('i');
        typeIcon.className = 'lucide lucide-sticky-note shared-type-icon';
        nameContainer.appendChild(typeIcon);

        var noteLink = document.createElement('a');
        noteLink.href = 'index.php?note=' + note.note_id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
        noteLink.textContent = note.heading || config.txtUntitled;
        noteLink.className = 'note-name';
        nameContainer.appendChild(noteLink);

        item.appendChild(nameContainer);

        var folderContainer = document.createElement('div');
        folderContainer.className = 'note-folder-container';

        if (note.folder_path && note.folder_path !== 'Default') {
            var folderPath = document.createElement('span');
            folderPath.className = 'folder-badge';
            folderPath.title = note.shared_via_folder ? (config.txtViaFolder + ': ' + note.folder_path) : note.folder_path;
            folderPath.textContent = note.folder_path;
            folderContainer.appendChild(folderPath);
        } else {
            folderContainer.classList.add('is-empty');
            folderContainer.setAttribute('aria-hidden', 'true');
            folderContainer.innerHTML = '&nbsp;';
        }
        item.appendChild(folderContainer);

        item.appendChild(renderTokenCell(note.token, note.shared_via_folder ? config.txtViaFolder : ''));

        item.appendChild(buildRestrictedCell(Array.isArray(note.allowed_users) && note.allowed_users.length > 0));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        if (note.share_id) {
            var editTokenBtn = document.createElement('button');
            editTokenBtn.className = 'btn btn-sm btn-secondary';
            editTokenBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
            editTokenBtn.title = config.txtEditToken;
            (function(noteRef) {
                editTokenBtn.addEventListener('click', function() {
                    openEditModalForItem(noteRef);
                });
            })(note);
            actionsDiv.appendChild(editTokenBtn);

            var openBtn = document.createElement('button');
            openBtn.className = 'btn btn-sm btn-primary';
            openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
            openBtn.title = config.txtOpen;
            (function(noteUrl) {
                openBtn.addEventListener('click', function() {
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(noteUrl), getPreferredPublicUrlProtocol());
                    window.open(normalizedUrl, '_blank', 'noopener');
                });
            })(note.url);
            actionsDiv.appendChild(openBtn);
        }

        if (note.share_id) {
            var revokeBtn = document.createElement('button');
            revokeBtn.className = 'btn btn-sm btn-danger';
            revokeBtn.innerHTML = '<i class="lucide lucide-ban"></i>';
            revokeBtn.title = config.txtRevoke;
            (function(nId) {
                revokeBtn.addEventListener('click', function() { revokeNoteShare(nId); });
            })(note.note_id);
            actionsDiv.appendChild(revokeBtn);
        } else if (note.shared_via_folder) {
            var viaFolderText = document.createElement('span');
            viaFolderText.className = 'note-actions-placeholder';
            viaFolderText.textContent = config.txtNoteSharedThroughFolder;
            actionsDiv.appendChild(viaFolderText);
        }

        item.appendChild(actionsDiv);
        return item;
    }

    function renderFolderItem(folder) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item shared-folder-row';
        item.dataset.folderId = folder.folder_id;
        item.dataset.folderName = folder.folder_name;
        item.dataset.itemType = 'folder';
        item.dataset.hasPassword = folder.password ? '1' : '0';
        if (!folder.is_direct) item.classList.add('shared-via-parent');

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var typeIcon = document.createElement('i');
        typeIcon.className = 'lucide lucide-folder shared-type-icon';
        nameContainer.appendChild(typeIcon);

        var folderLink = document.createElement('a');
        folderLink.href = 'index.php?kanban=' + folder.folder_id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
        folderLink.className = 'folder-name-path note-name';
        folderLink.title = folder.folder_path;
        folderLink.textContent = folder.folder_name + ' (' + folder.note_count + ')';
        nameContainer.appendChild(folderLink);

        item.appendChild(nameContainer);

        var folderContainer = document.createElement('div');
        folderContainer.className = 'note-folder-container';

        var folderPath = document.createElement('span');
        folderPath.className = 'folder-badge';
        folderPath.title = folder.folder_path;
        folderPath.textContent = folder.folder_path;
        folderContainer.appendChild(folderPath);

        item.appendChild(folderContainer);

        item.appendChild(renderTokenCell(folder.token, !folder.is_direct ? config.txtViaFolder : ''));

        item.appendChild(buildRestrictedCell(Array.isArray(folder.allowed_users) && folder.allowed_users.length > 0));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        if (folder.is_direct) {
            var editTokenBtn = document.createElement('button');
            editTokenBtn.className = 'btn btn-sm btn-secondary';
            editTokenBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
            editTokenBtn.title = config.txtEditToken;
            (function(folderRef) {
                editTokenBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openEditModalForItem(folderRef);
                });
            })(folder);
            actionsDiv.appendChild(editTokenBtn);

            var openBtn = document.createElement('button');
            openBtn.className = 'btn btn-sm btn-primary';
            openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
            openBtn.title = config.txtOpen;
            (function(folderUrl) {
                openBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(folderUrl), getPreferredPublicUrlProtocol());
                    window.open(normalizedUrl, '_blank', 'noopener');
                });
            })(folder.public_url);
            actionsDiv.appendChild(openBtn);
        }

        if (folder.is_direct) {
            var revokeBtn = document.createElement('button');
            revokeBtn.className = 'btn btn-sm btn-danger btn-revoke';
            revokeBtn.innerHTML = '<i class="lucide lucide-ban"></i>';
            revokeBtn.title = config.txtRevoke;
            (function(fId) {
                revokeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    revokeFolderShare(fId);
                });
            })(folder.folder_id);
            actionsDiv.appendChild(revokeBtn);
        } else {
            var viaParentText = document.createElement('span');
            viaParentText.className = 'note-actions-placeholder';
            viaParentText.textContent = config.txtFolderSharedThroughParent;
            actionsDiv.appendChild(viaParentText);
        }

        item.appendChild(actionsDiv);
        return item;
    }

    function renderSharedWithMeItem(sharedItem) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item shared-with-me-row';
        item.dataset.itemType = sharedItem._type;

        var isFolder = sharedItem._type === 'shared_with_me_folder';

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var typeIcon = document.createElement('i');
        typeIcon.className = 'lucide ' + (isFolder ? 'lucide-folder' : 'lucide-sticky-note') + ' shared-type-icon';
        nameContainer.appendChild(typeIcon);

        var nameEl = document.createElement('a');
        nameEl.href = sharedItem.url || '#';
        nameEl.target = '_blank';
        nameEl.rel = 'noopener';
        nameEl.className = 'note-name';
        nameEl.textContent = isFolder ? (sharedItem.folder_name || config.txtUntitled) : (sharedItem.heading || config.txtUntitled);
        nameContainer.appendChild(nameEl);

        item.appendChild(nameContainer);

        var ownerContainer = document.createElement('div');
        ownerContainer.className = 'note-folder-container';
        var ownerBadge = document.createElement('span');
        ownerBadge.className = 'folder-badge';
        var ownerLabel = config.txtSharedBy + ' ' + (sharedItem.owner_name || '');
        ownerBadge.title = ownerLabel;
        ownerBadge.textContent = ownerLabel;
        ownerContainer.appendChild(ownerBadge);
        item.appendChild(ownerContainer);

        // Token cell — show the actual token (read-only)
        item.appendChild(renderTokenCell(sharedItem.token || '', ''));

        item.appendChild(buildRestrictedCell(true));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        var openBtn = document.createElement('button');
        openBtn.className = 'btn btn-sm btn-primary';
        openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
        openBtn.title = config.txtOpen;
        (function(url) {
            openBtn.addEventListener('click', function() {
                window.open(url, '_blank', 'noopener');
            });
        })(sharedItem.url);
        actionsDiv.appendChild(openBtn);

        item.appendChild(actionsDiv);
        return item;
    }

    // ========== Initialization ==========

    document.addEventListener('DOMContentLoaded', function() {
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

        var backBtn = document.getElementById('backToNotesBtn');
        if (backBtn) {
            backBtn.addEventListener('click', goBackToNotes);
        }

        // Type filter buttons
        var filterBtns = document.querySelectorAll('.filter-type-btn');
        filterBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                filterBtns.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                filterType = this.getAttribute('data-filter');
                applyFilter();
                syncUrl();
            });
        });

        function syncUrl() {
            var params = new URLSearchParams(window.location.search);
            if (filterText) {
                params.set('filter', filterText);
            } else {
                params.delete('filter');
            }
            if (filterType && filterType !== 'all') {
                params.set('type', filterType);
            } else {
                params.delete('type');
            }
            // Keep non-filter params (workspace, auto_edit, etc.) intact
            var newSearch = params.toString();
            var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
            window.history.replaceState(null, '', newUrl);
        }

        // Text filter
        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');

        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('auto_edit') === '1') {
            var requestedItemType = urlParams.get('item_type');
            var requestedItemId = urlParams.get('item_id');
            if ((requestedItemType === 'note' || requestedItemType === 'folder') && requestedItemId) {
                pendingEditorRequest = {
                    itemType: requestedItemType,
                    itemId: String(requestedItemId)
                };
            }
        }

        var initialFilter = urlParams.get('filter');
        if (initialFilter && filterInput) {
            filterInput.value = initialFilter;
            filterText = initialFilter.trim().toLowerCase();
            updateClearButton();
        }

        var initialType = urlParams.get('type');
        if (initialType && ['all', 'notes', 'folders'].indexOf(initialType) !== -1) {
            filterType = initialType;
            filterBtns.forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
            });
        }

        if (filterInput) {
            filterInput.addEventListener('input', function() {
                filterText = this.value.trim().toLowerCase();
                applyFilter();
                updateClearButton();
                syncUrl();
            });
            filterInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    filterText = '';
                    applyFilter();
                    updateClearButton();
                    syncUrl();
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
                    syncUrl();
                    filterInput.focus();
                }
            });
        }

        loadSharedNotes();
    });

    window.loadSharedNotes = loadSharedNotes;
    window.goBackToNotes = goBackToNotes;

})();

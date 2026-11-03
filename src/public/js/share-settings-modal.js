// Share settings dialog of a note or a folder: link, password, permissions,
// indexing and user restriction. Opens over the page it is called from (the
// note itself, the folders page, the Shares page), labels come from
// share_settings_config.php.

window.PoznoteShareSettings = (function() {
    'use strict';

    function getConfig() {
        var el = document.getElementById('shareSettingsConfig') || document.createElement('div');
        return {
            currentUserId: parseInt(el.getAttribute('data-current-user-id') || '0', 10),
            txtRevokeModalTitle: el.getAttribute('data-txt-revoke-modal-title') || 'Revoke share',
            txtRevokeModalText: el.getAttribute('data-txt-revoke-modal-text') || 'You can permanently delete this share, or keep it and make it inaccessible until you enable it again.',
            txtRevokeModalTextDisabled: el.getAttribute('data-txt-revoke-modal-text-disabled') || 'This share is currently inaccessible. You can make it accessible again, or permanently delete it.',
            txtOk: el.getAttribute('data-txt-ok') || 'OK',
            txtRevokeDelete: el.getAttribute('data-txt-revoke-delete') || 'Delete permanently',
            txtRevokeDisable: el.getAttribute('data-txt-revoke-disable') || 'Make inaccessible',
            txtRevokeEnable: el.getAttribute('data-txt-revoke-enable') || 'Make accessible again',
            txtRevoke: el.getAttribute('data-txt-revoke') || 'Revoke',
            txtShareDisabledBadge: el.getAttribute('data-txt-share-disabled-badge') || 'Inaccessible',
            hideProtocolToggle: el.getAttribute('data-hide-protocol-toggle') === '1',
            hideRestrictUsers: el.getAttribute('data-hide-restrict-users') === '1',
            txtCancel: el.getAttribute('data-txt-cancel') || 'Cancel',
            txtCopyUrl: el.getAttribute('data-txt-copy-url') || 'Copy URL',
            txtCustomToken: el.getAttribute('data-txt-custom-token') || 'Custom token (optional)',
            txtCustomTokenPlaceholder: el.getAttribute('data-txt-custom-token-placeholder') || 'my_custom_token-1',
            txtError: el.getAttribute('data-txt-error') || 'Error',
            txtFolderEditable: el.getAttribute('data-txt-folder-editable') || 'Allow note editing',
            txtHidePassword: el.getAttribute('data-txt-hide-password') || 'Hide password',
            txtNoUsersFound: el.getAttribute('data-txt-no-users-found') || 'No other users found',
            txtNoteEditable: el.getAttribute('data-txt-note-editable') || 'Allow text editing',
            txtOpen: el.getAttribute('data-txt-open') || 'Open public view',
            txtPasswordLabel: el.getAttribute('data-txt-password-label') || 'Password',
            txtPasswordPlaceholder: el.getAttribute('data-txt-password-placeholder') || 'Enter a password',
            txtRenew: el.getAttribute('data-txt-renew') || 'Renew',
            txtRestrictUsers: el.getAttribute('data-txt-restrict-users') || 'Restrict to specific users',
            txtRestrictUsersMobile: el.getAttribute('data-txt-restrict-users-mobile') || 'Restrict',
            txtSave: el.getAttribute('data-txt-save') || 'Save',
            txtShareLinkCopied: el.getAttribute('data-txt-share-link-copied') || 'Share link copied to clipboard!',
            txtSearchIndexable: el.getAttribute('data-txt-search-indexable') || 'Allow indexing by search engines',
            txtSearchIndexableMobile: el.getAttribute('data-txt-search-indexable-mobile') || 'Allow indexing',
            txtShowPassword: el.getAttribute('data-txt-show-password') || 'Show password',
            txtTaskCheckOnly: el.getAttribute('data-txt-task-check-only') || 'Check or uncheck only',
            txtTaskFull: el.getAttribute('data-txt-task-full') || 'Full edit',
            txtTaskPermissions: el.getAttribute('data-txt-task-permissions') || 'Permissions',
            txtTaskReadOnly: el.getAttribute('data-txt-task-read-only') || 'Read only',
            txtTokenHelp: el.getAttribute('data-txt-token-help') || 'The token is the unique part you choose in the public link. For example, using project-2026 gives https://your-domain.example/project-2026 for a note, or https://your-domain.example/folder/project-2026 for a folder.',
            txtTokenUpdateFailed: el.getAttribute('data-txt-token-update-failed') || 'Failed to update token',
            txtUseHttps: el.getAttribute('data-txt-use-https') || 'HTTPS',
            txtUsersLoading: el.getAttribute('data-txt-users-loading') || 'Loading users...'
        };
    }

    function isMobileShareModalView() {
        return !!(window.matchMedia && window.matchMedia('(max-width: 680px)').matches);
    }

    function getShareModalLabel(desktopText, mobileText) {
        return isMobileShareModalView() && mobileText ? mobileText : desktopText;
    }

    function showErrorToast(message, parentEl) {
        var container = parentEl || document.querySelector('.shared-content') || document.body;
        var existing = container.querySelector('.share-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'share-toast alert alert-danger';
        toast.style.position = parentEl ? 'relative' : 'fixed';
        if (!parentEl) {
            toast.style.top = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.zIndex = '10001';
            toast.style.maxWidth = '400px';
            toast.style.minWidth = '200px';
            toast.style.textAlign = 'center';
            toast.style.boxShadow = '0 4px 16px rgba(220, 53, 69, 0.2)';
        }
        toast.textContent = message;
        if (parentEl) {
            container.insertBefore(toast, container.firstChild);
        } else {
            document.body.appendChild(toast);
        }
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 5000);
    }

    function buildNotePublicUrl(token) {
        return new URL(encodeURIComponent(token), window.location.origin + '/').href;
    }

    function buildFolderPublicUrl(token) {
        return new URL('folder/' + encodeURIComponent(token), window.location.origin + '/').href;
    }

    // The API builds absolute URLs from the Host header, which loses the port
    // behind a proxy that forwards the host without it (#1628). Public pages
    // live on the same origin as this page, so keep the server's path and take
    // the scheme, host and port the browser is on, as the share dialog does.
    function normalizePublicUrl(url) {
        if (!url) return '';
        try {
            var parsed = new URL(url, window.location.origin + '/');
            return new URL(parsed.pathname + parsed.search + parsed.hash, window.location.origin + '/').href;
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
        if (!text) return Promise.reject(new Error(getConfig().txtError));

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

    // Same confirmation wording as the workspace share flow
    function copyShareLink(url) {
        return copyTextToClipboard(url).then(function() {
            showCopyToast(getConfig().txtShareLinkCopied);
        }).catch(function() {
            window.prompt('Copy this URL', url);
        });
    }

    function showCopyToast(message) {
        var existing = document.getElementById('shared-copy-toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.id = 'shared-copy-toast';
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#2d3748;color:#e2e8f0;padding:10px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;font-weight:500;opacity:0;transition:opacity 160ms ease-in-out,transform 160ms ease-in-out;transform:translateY(-6px);pointer-events:none;border:1px solid rgba(255,255,255,0.1);';
        document.body.appendChild(toast);
        toast.offsetHeight;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-6px)';
            setTimeout(function() { try { toast.remove(); } catch (e) {
                console.debug('share-settings: showCopyToast() failed:', e);
            } }, 220);
        }, 1800);
    }

    function patchShare(url, updates) {
        var config = getConfig();
        var payload = {};
        if (Object.prototype.hasOwnProperty.call(updates, 'custom_token') && updates.custom_token) {
            payload.custom_token = updates.custom_token;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'access_mode') && updates.access_mode !== undefined) {
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

        return fetch(url, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function(response) {
            return response.json()
                .catch(function() { return {}; })
                .then(function(data) {
                    if (!response.ok || data.error) {
                        throw new Error(data.error || config.txtTokenUpdateFailed);
                    }
                    return data;
                });
        });
    }

    // Revoke flow: the user chooses between deleting the share for good and
    // keeping it but toggling its public accessibility.
    function showRevokeModal(options) {
        var config = getConfig();
        var modal = document.createElement('div');
        modal.className = 'modal shared-revoke-modal';
        modal.style.display = 'flex';

        var content = document.createElement('div');
        content.className = 'modal-content shared-revoke-modal-content';

        var title = document.createElement('h3');
        title.textContent = config.txtRevokeModalTitle;
        content.appendChild(title);

        var text = document.createElement('p');
        text.className = 'shared-revoke-modal-text';
        text.textContent = options.text
            || (options.isDisabled ? config.txtRevokeModalTextDisabled : config.txtRevokeModalText);
        content.appendChild(text);

        var actions = document.createElement('div');
        actions.className = 'shared-revoke-modal-actions';

        function closeModal() {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }

        // With no action to offer the modal is purely informational: a single
        // OK button replaces Cancel.
        var isInformational = !options.onToggle && !options.onDelete;
        var cancelBtn = document.createElement('button');
        cancelBtn.className = isInformational ? 'btn btn-primary' : 'btn btn-secondary';
        cancelBtn.textContent = isInformational ? (config.txtOk || 'OK') : config.txtCancel;
        cancelBtn.addEventListener('click', closeModal);

        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-primary';
        toggleBtn.innerHTML = '<i class="lucide ' + (options.isDisabled ? 'lucide-eye' : 'lucide-eye-off') + '" style="margin-right: 6px;"></i>';
        toggleBtn.appendChild(document.createTextNode(options.isDisabled ? config.txtRevokeEnable : config.txtRevokeDisable));
        toggleBtn.addEventListener('click', function() {
            closeModal();
            if (options.onToggle) options.onToggle(!options.isDisabled);
        });

        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.innerHTML = '<i class="lucide lucide-trash-2" style="margin-right: 6px;"></i>';
        deleteBtn.appendChild(document.createTextNode(config.txtRevokeDelete));
        deleteBtn.addEventListener('click', function() {
            closeModal();
            if (options.onDelete) options.onDelete();
        });

        // One action per line, Cancel last.
        if (options.onToggle) {
            actions.appendChild(toggleBtn);
        }
        if (options.onDelete) {
            actions.appendChild(deleteBtn);
        }
        actions.appendChild(cancelBtn);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function(event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function(event) {
            if (event.target === modal && pressedOnBackdrop) {
                closeModal();
            }
            pressedOnBackdrop = false;
        });
    }

    function shareRequest(itemType, itemId, method, body) {
        var folderOrNote = itemType === 'folder' ? 'folders' : 'notes';
        var init = {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        };
        if (body) {
            init.body = JSON.stringify(body);
        }
        return fetch('/api/v1/' + folderOrNote + '/' + itemId + '/share', init)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.error) throw new Error(data.error);
            return data;
        });
    }

    function deleteShare(itemType, itemId) {
        return shareRequest(itemType, itemId, 'DELETE');
    }

    function setShareDisabled(itemType, itemId, disabled) {
        return shareRequest(itemType, itemId, 'PATCH', { disabled: disabled ? 1 : 0 });
    }

    function patchNoteShare(noteId, updates) {
        return patchShare('/api/v1/notes/' + noteId + '/share', updates);
    }

    function patchFolderShare(folderId, updates) {
        if (updates.custom_token && updates.custom_token.length < 4) {
            return Promise.reject(new Error('Token must be at least 4 characters'));
        }
        return patchShare('/api/v1/folders/' + folderId + '/share', updates);
    }

    function buildPreviewUrlForModal(options, token, protocol) {
        var nextToken = token || options.token || '';
        var nextProtocol = protocol || options.protocol || getPreferredPublicUrlProtocol();
        var rawUrl = options.itemType === 'folder'
            ? buildFolderPublicUrl(nextToken)
            : buildNotePublicUrl(nextToken);

        return applyProtocolToPublicUrl(normalizePublicUrl(rawUrl), nextProtocol);
    }

    function show(options) {
        var config = getConfig();
        var modal = document.createElement('div');
        modal.className = 'modal shared-edit-token-modal share-settings-modal';
        modal.style.display = 'flex';
        var initialPasswordValue = options.passwordValue || '';
        var passwordDirty = false;

        var content = document.createElement('div');
        content.className = 'modal-content shared-edit-token-modal-content';

        var titleBlock = document.createElement('div');
        titleBlock.className = 'shared-edit-token-modal-title';
        var title = document.createElement('h3');
        var titleText = document.createElement('span');
        titleText.className = 'shared-edit-token-modal-title-link';
        title.appendChild(titleText);
        titleBlock.appendChild(title);

        var titleCopyBtn = document.createElement('button');
        titleCopyBtn.type = 'button';
        titleCopyBtn.className = 'btn btn-secondary shared-edit-token-url-copy';
        titleCopyBtn.title = config.txtCopyUrl;
        titleCopyBtn.setAttribute('aria-label', config.txtCopyUrl);
        titleCopyBtn.innerHTML = '<i class="lucide lucide-copy"></i>';
        titleCopyBtn.addEventListener('click', function() {
            copyShareLink(titleText.textContent);
        });

        var titleOpenBtn = document.createElement('button');
        titleOpenBtn.type = 'button';
        titleOpenBtn.className = 'btn btn-secondary shared-edit-token-url-copy';
        titleOpenBtn.title = config.txtOpen;
        titleOpenBtn.setAttribute('aria-label', config.txtOpen);
        titleOpenBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
        titleOpenBtn.addEventListener('click', function() {
            // The saved token: the one being typed does not exist yet
            window.open(buildPreviewUrlForModal(options), '_blank', 'noopener');
        });
        titleBlock.appendChild(titleOpenBtn);
        titleBlock.appendChild(titleCopyBtn);

        content.appendChild(titleBlock);

        var tokenRow = document.createElement('div');
        tokenRow.className = 'shared-edit-token-field-row';

        var tokenLabel = document.createElement('div');
        tokenLabel.className = 'shared-edit-token-field-label shared-edit-token-label-with-help';

        var tokenLabelText = document.createElement('span');
        tokenLabelText.className = 'shared-edit-token-label-text';
        tokenLabelText.textContent = config.txtCustomToken;

        var tokenHelp = document.createElement('span');
        tokenHelp.className = 'shared-header-help';
        tokenHelp.tabIndex = 0;
        tokenHelp.setAttribute('aria-label', config.txtTokenHelp);
        tokenHelp.innerHTML = '<i class="lucide lucide-help-circle"></i>';

        var tokenHelpTooltip = document.createElement('span');
        tokenHelpTooltip.className = 'shared-header-help-tooltip';
        tokenHelpTooltip.textContent = config.txtTokenHelp;
        tokenHelp.appendChild(tokenHelpTooltip);

        tokenLabel.appendChild(tokenLabelText);
        tokenLabel.appendChild(tokenHelp);
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
        content.appendChild(tokenRow);

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
        passwordInput.type = 'text';
        passwordInput.value = initialPasswordValue;
        passwordInput.placeholder = config.txtPasswordPlaceholder;
        passwordInput.className = 'modal-password-input';
        passwordInput.style.width = '100%';
        passwordInput.style.padding = '8px 10px';
        passwordInput.style.borderRadius = '6px';
        passwordInput.style.boxSizing = 'border-box';
        passwordInput.style.margin = '0';

        var togglePasswordBtn = document.createElement('button');
        togglePasswordBtn.type = 'button';
        togglePasswordBtn.className = 'btn btn-secondary shared-edit-token-password-toggle';
        togglePasswordBtn.title = config.txtHidePassword;
        togglePasswordBtn.setAttribute('aria-label', config.txtHidePassword);
        togglePasswordBtn.innerHTML = '<i class="lucide lucide-eye-off"></i>';

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
        updatePasswordToggleState();

        passwordFieldGroup.appendChild(passwordInput);
        passwordFieldGroup.appendChild(togglePasswordBtn);
        passwordValue.appendChild(passwordFieldGroup);
        passwordRow.appendChild(passwordValue);
        content.appendChild(passwordRow);

        var permissionsSelect = null;
        var permissionOptions = null;
        if (options.itemType === 'note' && options.noteType === 'tasklist') {
            permissionOptions = [
                { value: 'read_only', label: config.txtTaskReadOnly },
                { value: 'check_only', label: config.txtTaskCheckOnly },
                { value: 'full', label: config.txtTaskFull }
            ];
            options.accessMode = options.accessMode || 'full';
        } else if (options.itemType === 'note' && (options.noteType === 'markdown' || options.noteType === 'note' || !options.noteType)) {
            // HTML/markdown notes: read-only by default, or public text editing.
            permissionOptions = [
                { value: 'read_only', label: config.txtTaskReadOnly },
                { value: 'edit', label: config.txtNoteEditable }
            ];
            options.accessMode = options.accessMode === 'edit' ? 'edit' : 'read_only';
        } else if (options.itemType === 'folder') {
            // Folder shares: read-only by default, or let visitors edit the
            // notes the folder contains (like single-note edit shares).
            permissionOptions = [
                { value: 'read_only', label: config.txtTaskReadOnly },
                { value: 'edit', label: config.txtFolderEditable }
            ];
            options.accessMode = options.accessMode === 'edit' ? 'edit' : 'read_only';
        }

        if (permissionOptions) {
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
            permissionsSelect.style.boxSizing = 'border-box';
            permissionsSelect.style.margin = '0';

            permissionOptions.forEach(function(option) {
                var selectOption = document.createElement('option');
                selectOption.value = option.value;
                selectOption.textContent = option.label;
                permissionsSelect.appendChild(selectOption);
            });

            permissionsSelect.value = options.accessMode;
            permissionsValue.appendChild(permissionsSelect);
            permissionsRow.appendChild(permissionsValue);
            content.appendChild(permissionsRow);
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
        if (!config.hideProtocolToggle) {
            content.appendChild(protocolWrap);
        }

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
        indexableText.textContent = getShareModalLabel(config.txtSearchIndexable, config.txtSearchIndexableMobile);

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
        content.appendChild(indexableWrap);

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
        restrictText.textContent = getShareModalLabel(config.txtRestrictUsers, config.txtRestrictUsersMobile);

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
        userListContainer.style.display = restrictCheckbox.checked ? 'block' : 'none';

        var userListLoading = document.createElement('div');
        userListLoading.className = 'share-user-list-message';
        userListLoading.textContent = config.txtUsersLoading;
        userListContainer.appendChild(userListLoading);

        restrictUsersWrap.appendChild(userListContainer);
        if (!config.hideRestrictUsers) {
            content.appendChild(restrictUsersWrap);
        }

        var availableUsers = [];
        var selectedUserIds = (options.allowedUsers && Array.isArray(options.allowedUsers))
            ? options.allowedUsers.map(function(id) { return parseInt(id, 10); })
            : [];

        function renderUserCheckboxes() {
            userListContainer.innerHTML = '';
            if (availableUsers.length === 0) {
                var noUsers = document.createElement('div');
                noUsers.className = 'share-user-list-message';
                noUsers.textContent = config.txtNoUsersFound;
                userListContainer.appendChild(noUsers);
                return;
            }

            availableUsers.forEach(function(user) {
                var row = document.createElement('label');
                row.className = 'share-user-list-row';

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
                displayName.className = 'share-user-list-name';
                displayName.textContent = user.username;

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
                    return { id: parseInt(u.id, 10), username: u.username };
                });
                renderUserCheckboxes();
            })
            .catch(function() {
                userListContainer.innerHTML = '';
                var errMsg = document.createElement('div');
                errMsg.className = 'share-user-list-message is-error';
                errMsg.textContent = config.txtError;
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

        if (restrictCheckbox.checked && !config.hideRestrictUsers) {
            loadAvailableUsers();
        }
        // ---- End user restriction section ----

        var actions = document.createElement('div');
        actions.className = 'shared-edit-token-modal-actions';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = config.txtCancel;

        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = config.txtSave;

        function closeModal() {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        }

        // Shows the state of the share: making it inaccessible keeps the dialog
        // open, as nothing else on a note's page tells it happened.
        function buildRevokeButton() {
            var revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';

            function refresh() {
                var isDisabled = options.revoke.isDisabled;
                revokeBtn.className = 'btn ' + (isDisabled ? 'btn-share-disabled' : 'btn-danger');
                revokeBtn.textContent = isDisabled ? config.txtShareDisabledBadge : config.txtRevoke;
            }

            function showError(error) {
                showErrorToast(config.txtError + ': ' + error.message, content);
            }

            revokeBtn.addEventListener('click', function() {
                showRevokeModal({
                    isDisabled: options.revoke.isDisabled,
                    onDelete: function() {
                        deleteShare(options.itemType, options.itemId)
                            .then(function() {
                                closeModal();
                                options.revoke.onDeleted();
                            })
                            .catch(showError);
                    },
                    onToggle: function(nextDisabled) {
                        setShareDisabled(options.itemType, options.itemId, nextDisabled)
                            .then(function() {
                                options.revoke.isDisabled = nextDisabled;
                                refresh();
                                options.revoke.onToggled();
                            })
                            .catch(showError);
                    }
                });
            });

            refresh();
            return revokeBtn;
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
            var allowedUsersChanged = !config.hideRestrictUsers && JSON.stringify(nextAllowedUsers) !== JSON.stringify(prevAllowedUsers);

            // Saving always hands the user the link they just configured
            var savedUrl = buildPreviewUrlForModal(options, nextToken || options.token, nextProtocol);

            if ((!nextToken || !tokenChanged) && !protocolChanged && !indexableChanged && !accessModeChanged && !passwordShouldBeSaved && !allowedUsersChanged) {
                copyShareLink(savedUrl);
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
                    setPreferredPublicUrlProtocol(nextProtocol);
                    copyShareLink(savedUrl);
                    if (tokenChanged && options.onTokenChanged) {
                        options.onTokenChanged(options.token, nextToken);
                    }
                    closeModal();
                })
                .catch(function(error) {
                    showErrorToast(config.txtError + ': ' + (error.message || config.txtTokenUpdateFailed), content);
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

        actions.appendChild(cancelBtn);
        if (options.revoke) {
            actions.appendChild(buildRevokeButton());
        }
        actions.appendChild(saveBtn);
        content.appendChild(actions);
        modal.appendChild(content);
        document.body.appendChild(modal);
        updatePasswordToggleState();
        updatePreviewUrl();

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function(event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function(event) {
            if (event.target === modal && pressedOnBackdrop) {
                closeModal();
            }
            pressedOnBackdrop = false;
        });
    }

    return {
        show: show,
        showRevokeModal: showRevokeModal,
        deleteShare: deleteShare,
        setShareDisabled: setShareDisabled,
        patchNoteShare: patchNoteShare,
        patchFolderShare: patchFolderShare,
        showErrorToast: showErrorToast,
        showCopyToast: showCopyToast,
        copyTextToClipboard: copyTextToClipboard,
        normalizePublicUrl: normalizePublicUrl,
        buildNotePublicUrl: buildNotePublicUrl,
        buildFolderPublicUrl: buildFolderPublicUrl
    };
})();

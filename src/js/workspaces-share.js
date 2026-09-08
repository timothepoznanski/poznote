// Workspace sharing.
// 
// Sharing a workspace with other users, the read-only public share link, and the
// workspace info panel that shows both.

function getWorkspaceShareText(attributeName, fallback) {
    if (!document.body) return fallback;
    return document.body.getAttribute('data-txt-' + attributeName) || fallback;
}

function getWorkspaceShareConfirmTitle() {
    return wsTr('workspaces.share.confirm.title', {}, 'Share workspace');
}

function getWorkspaceShareConfirmMessage(workspaceName) {
    return wsTr(
        'workspaces.share.confirm.message',
        { workspace: workspaceName },
        'Anyone with the URL for workspace "{{workspace}}" will have access to all notes and folders in this workspace.\n\nThey will not be able to modify anything. They will only be able to view the content.'
    );
}

function getWorkspaceShareConfirmButtonText() {
    return wsTr('workspaces.share.confirm.confirm_button', {}, 'Share');
}

function parseWorkspaceShareAllowedUsers(button) {
    if (!button) return [];
    try {
        var parsed = JSON.parse(button.getAttribute('data-allowed-users') || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.map(function (id) { return parseInt(id, 10); }).filter(function (id) { return id > 0; });
    } catch (e) {
        return [];
    }
}

function getCurrentWorkspaceUserId() {
    var raw = document.body ? document.body.getAttribute('data-current-user-id') : '0';
    var parsed = parseInt(raw || '0', 10);
    return isNaN(parsed) ? 0 : parsed;
}

function updateWorkspaceShareToggleButton(button, isShared, shareState) {
    if (!button) return;

    button.setAttribute('data-action', 'upsert_readonly_share');
    button.setAttribute('data-shared', isShared ? '1' : '0');
    // Icon button: the state shows through its tooltip and the is-shared tint
    var shareLabel = isShared
        ? getWorkspaceShareText('workspace-share-edit-btn', 'Edit share')
        : getWorkspaceShareText('workspace-share-enable-btn', 'Share');
    button.title = shareLabel;
    button.setAttribute('aria-label', shareLabel);
    button.classList.toggle('is-shared', isShared);

    if (shareState && Object.prototype.hasOwnProperty.call(shareState, 'url')) {
        button.setAttribute('data-url', isShared ? (shareState.url || '') : '');
    } else if (!isShared) {
        button.setAttribute('data-url', '');
    }

    if (shareState) {
        button.setAttribute('data-has-password', shareState.hasPassword ? '1' : '0');
        button.setAttribute('data-password-value', shareState.hasPassword ? (shareState.passwordValue || '') : '');
        button.setAttribute('data-login-required', shareState.loginRequired ? '1' : '0');
        button.setAttribute('data-allowed-users', JSON.stringify(shareState.allowed_users || []));
    }

    if (!isShared) {
        button.setAttribute('data-password-value', '');
    }
}

function showWorkspaceShareError(message) {
    if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
        window.modalAlert.alert(
            message,
            'error',
            wsTr('common.error', {}, 'Error')
        );
        return;
    }

    window.alert(message);
}

function showWorkspaceShareToast(message, type) {
    if (!document.body) return;

    var existing = document.getElementById('workspaceShareToast');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }

    var toast = document.createElement('div');
    toast.id = 'workspaceShareToast';
    toast.className = 'alert ' + (type === 'danger' || type === 'error' ? 'alert-danger' : 'alert-success');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', type === 'danger' || type === 'error' ? 'assertive' : 'polite');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.right = '20px';
    toast.style.bottom = '20px';
    toast.style.zIndex = '10050';
    toast.style.minWidth = '220px';
    toast.style.maxWidth = '360px';
    toast.style.margin = '0';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.18)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 160ms ease, transform 160ms ease';

    document.body.appendChild(toast);

    requestAnimationFrame(function () {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(function () {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(function () {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 180);
    }, 2600);
}

function showWorkspaceShareOptionsModal(button) {
    var workspaceName = button.getAttribute('data-ws') || '';
    var isExistingShare = button.getAttribute('data-shared') === '1';
    var currentShareUrl = button.getAttribute('data-url') || '';
    var previewShareUrl = currentShareUrl || button.getAttribute('data-preview-url') || '';
    var currentPasswordValue = button.getAttribute('data-password-value') || '';
    var selectedUserIds = parseWorkspaceShareAllowedUsers(button);
    var hideRestrictUsers = document.body && document.body.getAttribute('data-hide-restrict-users') === '1';
    var availableUsers = [];
    var usersLoaded = false;
    var initialLoginRequired = button.getAttribute('data-login-required') === '1' || selectedUserIds.length > 0;
    var passwordDirty = false;

    var modal = document.createElement('div');
    modal.className = 'modal shared-edit-token-modal';
    modal.style.display = 'flex';

    var content = document.createElement('div');
    content.className = 'modal-content shared-edit-token-modal-content';

    var title = document.createElement('h3');
    title.textContent = getWorkspaceShareConfirmTitle();
    content.appendChild(title);

    var message = document.createElement('p');
    message.textContent = getWorkspaceShareConfirmMessage(workspaceName);
    message.style.whiteSpace = 'pre-line';
    content.appendChild(message);

    var shareUrlRow = null;
    var shareUrlInlineGroup = null;
    var shareUrlValueWrap = null;
    var shareUrlCopyBtn = null;

    function ensureShareUrlRow() {
        if (shareUrlRow) {
            return;
        }

        shareUrlRow = document.createElement('div');
        shareUrlRow.className = 'shared-edit-token-field-row workspace-share-modal-url-row';

        shareUrlInlineGroup = document.createElement('div');
        shareUrlInlineGroup.className = 'workspace-share-modal-url-inline-group';

        shareUrlValueWrap = document.createElement('div');
        shareUrlValueWrap.className = 'workspace-share-modal-url-value';
        shareUrlInlineGroup.appendChild(shareUrlValueWrap);

        shareUrlRow.appendChild(shareUrlInlineGroup);
        content.appendChild(shareUrlRow);
    }

    function createShareUrlCopyButton() {
        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-secondary shared-edit-token-password-toggle workspace-share-modal-copy-btn';
        copyBtn.innerHTML = '<i class="lucide lucide-copy"></i>';
        copyBtn.title = getWorkspaceShareText('workspace-share-copy-btn', 'Copy share link');
        copyBtn.setAttribute('aria-label', getWorkspaceShareText('workspace-share-copy-btn', 'Copy share link'));
        copyBtn.addEventListener('click', function () {
            if (!currentShareUrl) {
                return;
            }

            copyBtn.disabled = true;
            copyWorkspaceShareUrl(currentShareUrl)
                .then(function () {
                    showWorkspaceShareToast(
                        getWorkspaceShareText('workspace-share-copy-success', 'Share link copied to clipboard!'),
                        'success'
                    );
                })
                .catch(function (err) {
                    console.error('Error copying workspace share URL from modal:', err);
                    showWorkspaceShareToast(
                        getWorkspaceShareText('workspace-share-copy-failed', 'Failed to copy share link'),
                        'danger'
                    );
                })
                .finally(function () {
                    copyBtn.disabled = false;
                });
        });

        return copyBtn;
    }

    function renderShareUrlValue() {
        var displayUrl = currentShareUrl || previewShareUrl;

        if (!displayUrl) {
            if (shareUrlRow && shareUrlRow.parentNode) {
                shareUrlRow.parentNode.removeChild(shareUrlRow);
            }
            shareUrlRow = null;
            shareUrlInlineGroup = null;
            shareUrlValueWrap = null;
            shareUrlCopyBtn = null;
            return;
        }

        ensureShareUrlRow();
        shareUrlValueWrap.innerHTML = '';

        var urlNode = currentShareUrl ? document.createElement('a') : document.createElement('span');
        urlNode.className = 'workspace-share-modal-url' + (currentShareUrl ? '' : ' is-preview');
        urlNode.textContent = displayUrl;

        if (currentShareUrl) {
            urlNode.href = currentShareUrl;
            urlNode.target = '_blank';
            urlNode.rel = 'noopener noreferrer';
        }

        shareUrlValueWrap.appendChild(urlNode);

        if (currentShareUrl) {
            if (!shareUrlCopyBtn) {
                shareUrlCopyBtn = createShareUrlCopyButton();
                shareUrlInlineGroup.appendChild(shareUrlCopyBtn);
            }
        } else if (shareUrlCopyBtn && shareUrlCopyBtn.parentNode) {
            shareUrlCopyBtn.parentNode.removeChild(shareUrlCopyBtn);
            shareUrlCopyBtn = null;
        }
    }

    renderShareUrlValue();

    var passwordRow = document.createElement('div');
    passwordRow.className = 'shared-edit-token-field-row';

    var passwordValue = document.createElement('div');
    passwordValue.className = 'shared-edit-token-field-value';

    var passwordGroup = document.createElement('div');
    passwordGroup.className = 'shared-edit-token-inline-group';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.value = currentPasswordValue;
    passwordInput.placeholder = getWorkspaceShareText('workspace-share-password-label', 'Password (optional)');
    passwordInput.className = 'modal-password-input';
    passwordInput.autocomplete = 'new-password';

    var togglePasswordBtn = document.createElement('button');
    togglePasswordBtn.type = 'button';
    togglePasswordBtn.className = 'btn btn-secondary shared-edit-token-password-toggle';
    togglePasswordBtn.innerHTML = '<i class="lucide lucide-eye-off"></i>';

    function updatePasswordToggleState() {
        var isVisible = passwordInput.type === 'text';
        var label = isVisible
            ? getWorkspaceShareText('hide-password', 'Hide password')
            : getWorkspaceShareText('show-password', 'Show password');
        togglePasswordBtn.title = label;
        togglePasswordBtn.setAttribute('aria-label', label);
        togglePasswordBtn.innerHTML = isVisible
            ? '<i class="lucide lucide-eye-off"></i>'
            : '<i class="lucide lucide-eye"></i>';
    }

    togglePasswordBtn.addEventListener('click', function () {
        passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
        updatePasswordToggleState();
        passwordInput.focus();
        var valueLength = passwordInput.value.length;
        if (typeof passwordInput.setSelectionRange === 'function') {
            passwordInput.setSelectionRange(valueLength, valueLength);
        }
    });

    passwordInput.addEventListener('input', function () {
        passwordDirty = true;
    });
    updatePasswordToggleState();

    passwordGroup.appendChild(passwordInput);
    passwordGroup.appendChild(togglePasswordBtn);
    passwordValue.appendChild(passwordGroup);
    passwordRow.appendChild(passwordValue);
    content.appendChild(passwordRow);

    var loginWrap = document.createElement('div');
    loginWrap.className = 'share-indexable-wrap';
    loginWrap.style.marginTop = '14px';

    var loginLabel = document.createElement('label');
    loginLabel.className = 'share-indexable-label';
    loginLabel.style.display = 'flex';
    loginLabel.style.alignItems = 'center';
    loginLabel.style.justifyContent = 'space-between';
    loginLabel.style.width = '100%';

    var loginText = document.createElement('span');
    loginText.className = 'indexable-label-text';
    loginText.textContent = getWorkspaceShareText('workspace-share-require-login', 'Require Poznote login');

    var loginToggle = document.createElement('label');
    loginToggle.className = 'toggle-switch';
    var loginCheckbox = document.createElement('input');
    loginCheckbox.type = 'checkbox';
    loginCheckbox.checked = initialLoginRequired;
    var loginSlider = document.createElement('span');
    loginSlider.className = 'toggle-slider';
    loginToggle.appendChild(loginCheckbox);
    loginToggle.appendChild(loginSlider);
    loginLabel.appendChild(loginText);
    loginLabel.appendChild(loginToggle);
    loginWrap.appendChild(loginLabel);
    content.appendChild(loginWrap);

    var specificUsersWrap = document.createElement('div');
    specificUsersWrap.className = 'share-restrict-users-wrap';
    specificUsersWrap.style.marginTop = '14px';
    specificUsersWrap.style.display = loginCheckbox.checked ? 'block' : 'none';

    var specificUsersLabel = document.createElement('label');
    specificUsersLabel.className = 'share-indexable-label';
    specificUsersLabel.style.display = 'flex';
    specificUsersLabel.style.alignItems = 'center';
    specificUsersLabel.style.justifyContent = 'space-between';
    specificUsersLabel.style.width = '100%';

    var specificUsersText = document.createElement('span');
    specificUsersText.className = 'indexable-label-text';
    specificUsersText.textContent = getWorkspaceShareText('workspace-share-restrict-users', 'Restrict to specific users');

    var specificUsersToggle = document.createElement('label');
    specificUsersToggle.className = 'toggle-switch';
    var specificUsersCheckbox = document.createElement('input');
    specificUsersCheckbox.type = 'checkbox';
    specificUsersCheckbox.checked = selectedUserIds.length > 0;
    var specificUsersSlider = document.createElement('span');
    specificUsersSlider.className = 'toggle-slider';
    specificUsersToggle.appendChild(specificUsersCheckbox);
    specificUsersToggle.appendChild(specificUsersSlider);
    specificUsersLabel.appendChild(specificUsersText);
    specificUsersLabel.appendChild(specificUsersToggle);
    specificUsersWrap.appendChild(specificUsersLabel);

    var userListContainer = document.createElement('div');
    userListContainer.className = 'share-user-list-container';
    userListContainer.style.display = specificUsersCheckbox.checked ? 'block' : 'none';
    specificUsersWrap.appendChild(userListContainer);
    if (!hideRestrictUsers) {
        content.appendChild(specificUsersWrap);
    }

    function renderUserCheckboxes() {
        userListContainer.innerHTML = '';
        if (availableUsers.length === 0) {
            var noUsers = document.createElement('div');
            noUsers.className = 'share-user-list-message';
            noUsers.textContent = getWorkspaceShareText('workspace-share-no-users', 'No other users found');
            userListContainer.appendChild(noUsers);
            return;
        }

        availableUsers.forEach(function (user) {
            var row = document.createElement('label');
            row.className = 'share-user-list-row';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = user.id;
            checkbox.checked = selectedUserIds.indexOf(user.id) !== -1;
            checkbox.addEventListener('change', function () {
                if (checkbox.checked) {
                    if (selectedUserIds.indexOf(user.id) === -1) selectedUserIds.push(user.id);
                } else {
                    selectedUserIds = selectedUserIds.filter(function (id) { return id !== user.id; });
                }
            });

            var displayName = document.createElement('span');
            displayName.className = 'share-user-list-name';
            displayName.textContent = user.username;

            row.appendChild(checkbox);
            row.appendChild(displayName);
            userListContainer.appendChild(row);
        });
    }

    function loadAvailableUsers() {
        userListContainer.innerHTML = '';
        var loading = document.createElement('div');
        loading.className = 'share-user-list-message';
        loading.textContent = getWorkspaceShareText('workspace-share-users-loading', 'Loading users...');
        userListContainer.appendChild(loading);

        fetch('/api/v1/users/profiles', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (resp) { return resp.json(); })
            .then(function (users) {
                var currentUserId = getCurrentWorkspaceUserId();
                availableUsers = (users || []).filter(function (user) {
                    return parseInt(user.id, 10) !== currentUserId;
                }).map(function (user) {
                    return {
                        id: parseInt(user.id, 10),
                        username: user.username || ''
                    };
                });
                usersLoaded = true;
                renderUserCheckboxes();
            })
            .catch(function () {
                userListContainer.innerHTML = '';
                var error = document.createElement('div');
                error.className = 'share-user-list-message is-error';
                error.textContent = wsTr('common.error', {}, 'Error');
                userListContainer.appendChild(error);
            });
    }

    function updateUserRestrictionVisibility() {
        if (hideRestrictUsers) return;
        specificUsersWrap.style.display = loginCheckbox.checked ? 'block' : 'none';
        userListContainer.style.display = loginCheckbox.checked && specificUsersCheckbox.checked ? 'block' : 'none';
        if (loginCheckbox.checked && specificUsersCheckbox.checked && !usersLoaded) {
            loadAvailableUsers();
        }
        if (!loginCheckbox.checked || !specificUsersCheckbox.checked) {
            selectedUserIds = [];
        }
    }

    loginCheckbox.addEventListener('change', updateUserRestrictionVisibility);
    specificUsersCheckbox.addEventListener('change', updateUserRestrictionVisibility);
    if (loginCheckbox.checked && specificUsersCheckbox.checked && !hideRestrictUsers) {
        loadAvailableUsers();
    }

    var actions = document.createElement('div');
    actions.className = 'shared-edit-token-modal-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = getWorkspaceShareText('workspace-share-cancel', 'Cancel');

    var unshareBtn = null;
    if (isExistingShare) {
        unshareBtn = document.createElement('button');
        unshareBtn.type = 'button';
        unshareBtn.className = 'btn btn-danger';
        unshareBtn.textContent = getWorkspaceShareText('workspace-share-disable-btn', 'Unshare');
    }

    var shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'btn btn-primary';
    shareBtn.textContent = isExistingShare
        ? wsTr('common.save', {}, 'Save')
        : getWorkspaceShareConfirmButtonText();

    function syncModalShareState(shareState) {
        isExistingShare = true;
        currentShareUrl = (shareState && shareState.url) || currentShareUrl;
        previewShareUrl = currentShareUrl || previewShareUrl;
        renderShareUrlValue();

        if (passwordDirty) {
            currentPasswordValue = passwordInput.value.trim();
        }

        shareBtn.textContent = wsTr('common.save', {}, 'Save');

        if (!unshareBtn) {
            unshareBtn = document.createElement('button');
            unshareBtn.type = 'button';
            unshareBtn.className = 'btn btn-danger';
            unshareBtn.textContent = getWorkspaceShareText('workspace-share-disable-btn', 'Unshare');
            unshareBtn.addEventListener('click', function () {
                unshareBtn.disabled = true;
                shareBtn.disabled = true;
                submitWorkspaceShareToggle(button, { action: 'disable_readonly_share' })
                    .then(closeModal)
                    .catch(function () {
                        unshareBtn.disabled = false;
                        shareBtn.disabled = false;
                    });
            });
            actions.insertBefore(unshareBtn, shareBtn);
        }
    }

    function closeModal() {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    cancelBtn.addEventListener('click', closeModal);
    if (unshareBtn) {
        unshareBtn.addEventListener('click', function () {
            unshareBtn.disabled = true;
            shareBtn.disabled = true;
            submitWorkspaceShareToggle(button, { action: 'disable_readonly_share' })
                .then(closeModal)
                .catch(function () {
                    unshareBtn.disabled = false;
                    shareBtn.disabled = false;
                });
        });
    }

    shareBtn.addEventListener('click', function () {
        var passwordValue = passwordDirty ? passwordInput.value.trim() : undefined;

        shareBtn.disabled = true;
        submitWorkspaceShareToggle(button, {
            password: passwordValue,
            login_required: loginCheckbox.checked,
            allowed_users: loginCheckbox.checked && specificUsersCheckbox.checked ? selectedUserIds.slice() : []
        }).then(function (json) {
            if (passwordDirty) {
                button.setAttribute('data-password-value', passwordValue || '');
            }
            syncModalShareState(json || {});
            shareBtn.disabled = false;
            if (unshareBtn) {
                unshareBtn.disabled = false;
            }
            if (!currentShareUrl) {
                closeModal();
                return json;
            }

            return copyWorkspaceShareUrl(currentShareUrl)
                .then(function () {
                    showWorkspaceShareToast(
                        getWorkspaceShareText('workspace-share-copy-success', 'Share link copied to clipboard!'),
                        'success'
                    );
                    closeModal();
                    return json;
                })
                .catch(function (err) {
                    console.error('Error copying workspace share URL after save:', err);
                    showWorkspaceShareToast(
                        getWorkspaceShareText('workspace-share-copy-failed', 'Failed to copy share link'),
                        'danger'
                    );
                    closeModal();
                    return json;
                });
        }).catch(function () {
            shareBtn.disabled = false;
            if (unshareBtn) {
                unshareBtn.disabled = false;
            }
        });
    });

    modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal();
    });

    modal.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeModal();
    });

    actions.appendChild(cancelBtn);
    if (unshareBtn) {
        actions.appendChild(unshareBtn);
    }
    actions.appendChild(shareBtn);
    content.appendChild(actions);
    modal.appendChild(content);
    document.body.appendChild(modal);
    shareBtn.focus();
}

function submitWorkspaceShareToggle(button, options) {
    var wsName = button.getAttribute('data-ws');
    var action = (options && options.action) || button.getAttribute('data-action');
    if (!wsName || !action || button.disabled) return Promise.resolve();

    button.disabled = true;

    var params = new URLSearchParams({
        action: action,
        name: wsName
    });

    if (options && Object.prototype.hasOwnProperty.call(options, 'password') && options.password !== undefined) {
        params.set('password', options.password || '');
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'login_required')) {
        params.set('login_required', options.login_required ? '1' : '0');
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'allowed_users')) {
        params.set('allowed_users', JSON.stringify(options.allowed_users || []));
    }

    return fetch('workspaces.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        body: params.toString()
    })
    .then(function (resp) { return resp.json(); })
    .then(function (json) {
        button.disabled = false;
        if (json && json.success) {
            var isShared = action === 'upsert_readonly_share';
            updateWorkspaceShareToggleButton(button, isShared, json);
            return json;
        } else {
            var message = wsTr(
                'workspaces.alerts.error_prefix',
                { error: (json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error') },
                'Error: {{error}}'
            );
            showWorkspaceShareError(message);
            throw new Error(message);
        }
    })
    .catch(function (err) {
        button.disabled = false;
        console.error('Error toggling workspace share:', err);
        if (!err || !err.message || err.message.indexOf('Error:') !== 0) {
            showWorkspaceShareError(wsTr('workspaces.alerts.share_error', {}, 'Error updating sharing status'));
        }
        throw err;
    });
}

function handleWorkspaceShareToggleClick(e) {
    if (e.target && e.target.closest && e.target.closest('.btn-share-toggle')) {
        var btn = e.target.closest('.btn-share-toggle');
        var action = btn.getAttribute('data-action');
        if (!action || btn.disabled) return;

        if (action !== 'upsert_readonly_share') {
            submitWorkspaceShareToggle(btn).catch(function () {});
            return;
        }

        showWorkspaceShareOptionsModal(btn);
    }
}

function handleWorkspaceShareToggleSubmit(event) {
    var form = event.target;
    if (!form || !form.classList || !form.classList.contains('workspace-share-toggle-form')) {
        return;
    }

    if (form.getAttribute('data-confirmed-submit') === '1') {
        form.removeAttribute('data-confirmed-submit');
        return;
    }

    var actionInput = form.querySelector('input[name="action"]');
    if (!actionInput || actionInput.value !== 'upsert_readonly_share') {
        return;
    }

    event.preventDefault();

    var workspaceInput = form.querySelector('input[name="name"]');
    var workspaceName = workspaceInput ? workspaceInput.value : '';
    var title = getWorkspaceShareConfirmTitle();
    var message = getWorkspaceShareConfirmMessage(workspaceName);
    var confirmText = getWorkspaceShareConfirmButtonText();

    if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
        window.modalAlert.confirm(message, title, {
            alertType: 'info',
            confirmText: confirmText
        }).then(function (confirmed) {
            if (!confirmed) return;
            form.setAttribute('data-confirmed-submit', '1');
            form.submit();
        });
        return;
    }

    if (window.confirm(message)) {
        form.setAttribute('data-confirmed-submit', '1');
        form.submit();
    }
}

function handleWorkspaceInfoButtonClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('.workspace-info-action') : null;
    var modal = document.getElementById('workspaceInfoModal');
    if (!button || !modal) return;

    var tags = [];
    var sharedWith = [];
    try {
        tags = JSON.parse(button.getAttribute('data-tags') || '[]');
        sharedWith = JSON.parse(button.getAttribute('data-shared-with') || '[]');
    } catch (error) {
        tags = [];
        sharedWith = [];
    }

    document.getElementById('workspaceInfoTitle').textContent = button.getAttribute('data-ws') || '';
    document.getElementById('workspaceInfoNotes').textContent = button.getAttribute('data-notes-count') || '0';
    document.getElementById('workspaceInfoFolders').textContent = button.getAttribute('data-folders-count') || '0';
    document.getElementById('workspaceInfoTags').textContent = tags.length ? tags.join(', ') : 'None';

    var isShared = button.getAttribute('data-shared') === '1';
    document.getElementById('workspaceInfoShared').textContent = isShared ? 'Yes' : 'No';
    document.getElementById('workspaceInfoSharedWith').textContent = !isShared
        ? 'Not shared'
        : (sharedWith.length ? sharedWith.join(', ') : 'Anyone with the link');

    modal.style.display = 'flex';
}

function closeWorkspaceInfoModal() {
    var modal = document.getElementById('workspaceInfoModal');
    if (modal) modal.style.display = 'none';
}

function handleWorkspaceInfoCloseButtonClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-action="close-workspace-info-modal"]') : null;
    if (!button) return;
    event.preventDefault();
    closeWorkspaceInfoModal();
}

function setWorkspaceShareVisibility(element, visible) {
    if (!element) return;
    if (visible) {
        element.classList.remove('initially-hidden');
    } else {
        element.classList.add('initially-hidden');
    }
}

function updateWorkspaceSharePanel(panel, shareState) {
    if (!panel) return;

    var isPublic = !!shareState.public;
    var badge = panel.querySelector('.workspace-share-badge');
    var saveButton = panel.querySelector('.btn-save-readonly-share');
    var openLink = panel.querySelector('.btn-open-readonly-share');
    var copyButton = panel.querySelector('.btn-copy-readonly-share');
    var disableButton = panel.querySelector('.btn-disable-readonly-share');
    var publicLink = panel.querySelector('.workspace-share-link');

    panel.setAttribute('data-public-active', isPublic ? '1' : '0');

    if (badge) {
        badge.textContent = isPublic
            ? getWorkspaceShareText('workspace-share-enabled', 'Public read-only enabled')
            : getWorkspaceShareText('workspace-share-disabled', 'Not shared publicly');
        badge.classList.toggle('is-enabled', isPublic);
        badge.classList.toggle('is-disabled', !isPublic);
    }

    setWorkspaceShareVisibility(saveButton, !isPublic);

    if (openLink) {
        if (isPublic && shareState.url) {
            openLink.setAttribute('href', shareState.url);
        } else {
            openLink.setAttribute('href', '#');
        }
        setWorkspaceShareVisibility(openLink, isPublic && !!shareState.url);
    }

    if (copyButton) {
        copyButton.setAttribute('data-url', isPublic ? (shareState.url || '') : '');
        setWorkspaceShareVisibility(copyButton, isPublic && !!shareState.url);
    }

    if (disableButton) {
        setWorkspaceShareVisibility(disableButton, isPublic);
    }

    if (publicLink) {
        publicLink.textContent = isPublic ? (shareState.url || '') : '';
        publicLink.setAttribute('href', isPublic ? (shareState.url || '#') : '#');
        setWorkspaceShareVisibility(publicLink, isPublic && !!shareState.url);
    }
}

function copyWorkspaceShareUrl(url) {
    if (!url) {
        return Promise.reject(new Error('Missing URL'));
    }

    var clipboardUrl = url;
    try {
        var parsedUrl = new URL(url, window.location.href);
        parsedUrl.searchParams.delete('public_workspace');
        clipboardUrl = parsedUrl.toString();
    } catch (e) {
        clipboardUrl = url.replace(/([?&])public_workspace=1(&|$)/, function (match, prefix, suffix) {
            return prefix === '?' && suffix ? '?' : (prefix === '?' ? '' : prefix);
        });
    }

    function fallbackCopy() {
        return new Promise(function (resolve, reject) {
            var input = document.createElement('input');
            input.type = 'text';
            input.value = clipboardUrl;
            document.body.appendChild(input);
            input.select();
            input.setSelectionRange(0, input.value.length);

            try {
                var copied = document.execCommand('copy');
                document.body.removeChild(input);
                if (copied) {
                    resolve();
                } else {
                    reject(new Error('Copy command failed'));
                }
            } catch (err) {
                document.body.removeChild(input);
                reject(err);
            }
        });
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(clipboardUrl).catch(function () {
            return fallbackCopy();
        });
    }

    return fallbackCopy();
}

function handleWorkspaceReadonlyShareSave(e) {
    var button = e.target.closest ? e.target.closest('.btn-save-readonly-share') : null;
    if (!button) return false;

    var panel = button.closest('.workspace-share-panel');
    if (!panel) return true;

    var workspaceName = button.getAttribute('data-ws') || panel.getAttribute('data-ws') || '';

    button.disabled = true;

    var params = new URLSearchParams({
        action: 'upsert_readonly_share',
        name: workspaceName
    });

    fetch('workspaces.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        body: params.toString()
    })
        .then(function (resp) { return resp.json(); })
        .then(function (json) {
            button.disabled = false;
            if (json && json.success) {
                updateWorkspaceSharePanel(panel, {
                    public: true,
                    url: json.url || ''
                });
                showAjaxAlert(json.message || getWorkspaceShareText('workspace-share-enabled', 'Public read-only enabled'), 'success');
            } else {
                showAjaxAlert((json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error'), 'danger');
            }
        })
        .catch(function (err) {
            button.disabled = false;
            console.error('Error saving workspace share:', err);
            showAjaxAlert(wsTr('workspaces.share.errors.save_failed', {}, 'Failed to save read-only workspace link'), 'danger');
        });

    return true;
}

function handleWorkspaceReadonlyShareDisable(e) {
    var button = e.target.closest ? e.target.closest('.btn-disable-readonly-share') : null;
    if (!button) return false;

    var panel = button.closest('.workspace-share-panel');
    if (!panel) return true;

    var workspaceName = button.getAttribute('data-ws') || panel.getAttribute('data-ws') || '';
    button.disabled = true;

    var params = new URLSearchParams({
        action: 'disable_readonly_share',
        name: workspaceName
    });

    fetch('workspaces.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        body: params.toString()
    })
        .then(function (resp) { return resp.json(); })
        .then(function (json) {
            button.disabled = false;
            if (json && json.success) {
                updateWorkspaceSharePanel(panel, { public: false, token: '', url: '' });
                showAjaxAlert(json.message || getWorkspaceShareText('workspace-share-disabled', 'Not shared publicly'), 'success');
            } else {
                showAjaxAlert((json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error'), 'danger');
            }
        })
        .catch(function (err) {
            button.disabled = false;
            console.error('Error disabling workspace share:', err);
            showAjaxAlert(wsTr('workspaces.share.errors.disable_failed', {}, 'Failed to disable read-only workspace link'), 'danger');
        });

    return true;
}

function handleWorkspaceReadonlyShareCopy(e) {
    var button = e.target.closest ? e.target.closest('.btn-copy-readonly-share') : null;
    if (!button) return false;

    var url = button.getAttribute('data-url') || '';
    copyWorkspaceShareUrl(url)
        .then(function () {
            showWorkspaceShareToast(getWorkspaceShareText('workspace-share-copy-success', 'Share link copied to clipboard!'), 'success');
        })
        .catch(function (err) {
            console.error('Error copying workspace share URL:', err);
            showWorkspaceShareToast(getWorkspaceShareText('workspace-share-copy-failed', 'Failed to copy share link'), 'danger');
        });

    return true;
}

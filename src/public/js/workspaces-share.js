// Workspace sharing.
//
// A workspace is shared with named accounts of the instance (workspaces.php >
// Share): the modal below lists the accounts, and the ones picked find the
// workspace under "Shared with me" in their workspace menu and edit it, as
// the owner would. Also the workspace info panel, which shows who a
// workspace is shared with.

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
        'Pick the users who can open workspace "{{workspace}}". They will find it in their workspace menu and can edit its notes and folders.'
    );
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

// Reflect a saved share on the row: the share button (tooltip, tint and the
// label the mobile actions menu prints next to the icon) and the info
// button, which reads the same attributes.
function updateWorkspaceShareToggleButton(button, shareState) {
    if (!button) return;

    var isShared = !!(shareState && shareState.shared);
    var allowedUsers = (shareState && Array.isArray(shareState.allowed_users)) ? shareState.allowed_users : [];
    var sharedWith = (shareState && Array.isArray(shareState.shared_with)) ? shareState.shared_with : [];

    button.setAttribute('data-shared', isShared ? '1' : '0');
    button.setAttribute('data-allowed-users', JSON.stringify(allowedUsers));
    button.setAttribute('data-shared-with', JSON.stringify(sharedWith));
    var shareLabel = isShared
        ? getWorkspaceShareText('workspace-share-edit-btn', 'Edit share')
        : getWorkspaceShareText('workspace-share-enable-btn', 'Share');
    button.title = shareLabel;
    button.setAttribute('aria-label', shareLabel);
    var shareLabelEl = button.querySelector('.ws-icon-btn-text');
    if (shareLabelEl) shareLabelEl.textContent = shareLabel;
    button.classList.toggle('is-shared', isShared);

    var row = button.closest ? button.closest('.ws-row') : null;
    var infoButton = row ? row.querySelector('.workspace-info-action') : null;
    if (infoButton) {
        infoButton.setAttribute('data-shared', isShared ? '1' : '0');
        infoButton.setAttribute('data-shared-with', JSON.stringify(sharedWith));
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

// The share modal: the accounts of the instance as a checkbox list (the
// owner's own left out), Save writes the picked ones, Unshare clears them.
function showWorkspaceShareOptionsModal(button) {
    var workspaceName = button.getAttribute('data-ws') || '';
    var isExistingShare = button.getAttribute('data-shared') === '1';
    var selectedUserIds = parseWorkspaceShareAllowedUsers(button);
    var availableUsers = [];

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

    var userListContainer = document.createElement('div');
    userListContainer.className = 'share-user-list-container';
    userListContainer.style.marginTop = '14px';
    content.appendChild(userListContainer);

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

    loadAvailableUsers();

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
    shareBtn.textContent = wsTr('common.save', {}, 'Save');

    function closeModal() {
        if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    function setBusy(busy) {
        shareBtn.disabled = busy;
        if (unshareBtn) unshareBtn.disabled = busy;
    }

    cancelBtn.addEventListener('click', closeModal);
    if (unshareBtn) {
        unshareBtn.addEventListener('click', function () {
            setBusy(true);
            submitWorkspaceShare(button, { action: 'unshare_workspace' })
                .then(function (json) {
                    showWorkspaceShareToast(json && json.message ? json.message : '', 'success');
                    closeModal();
                })
                .catch(function () { setBusy(false); });
        });
    }

    shareBtn.addEventListener('click', function () {
        setBusy(true);
        submitWorkspaceShare(button, { action: 'share_workspace', allowed_users: selectedUserIds.slice() })
            .then(function (json) {
                showWorkspaceShareToast(json && json.message ? json.message : '', 'success');
                closeModal();
            })
            .catch(function () { setBusy(false); });
    });

    var pressedOnBackdrop = false;
    modal.addEventListener('mousedown', function (event) {
        pressedOnBackdrop = (event.target === modal);
    });
    modal.addEventListener('click', function (event) {
        if (event.target === modal && pressedOnBackdrop) closeModal();
        pressedOnBackdrop = false;
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

function submitWorkspaceShare(button, options) {
    var wsName = button.getAttribute('data-ws');
    var action = options && options.action;
    if (!wsName || !action || button.disabled) return Promise.resolve();

    button.disabled = true;

    var params = new URLSearchParams({
        action: action,
        name: wsName
    });
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
            updateWorkspaceShareToggleButton(button, json);
            return json;
        }
        var message = wsTr(
            'workspaces.alerts.error_prefix',
            { error: (json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error') },
            'Error: {{error}}'
        );
        showWorkspaceShareError(message);
        throw new Error(message);
    })
    .catch(function (err) {
        button.disabled = false;
        console.error('Error updating workspace share:', err);
        if (!err || !err.message || err.message.indexOf('Error:') !== 0) {
            showWorkspaceShareError(wsTr('workspaces.share.errors.save_failed', {}, 'Failed to update workspace sharing'));
        }
        throw err;
    });
}

function handleWorkspaceShareToggleClick(e) {
    if (e.target && e.target.closest && e.target.closest('.btn-share-toggle')) {
        var btn = e.target.closest('.btn-share-toggle');
        if (btn.disabled) return;
        showWorkspaceShareOptionsModal(btn);
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
    document.getElementById('workspaceInfoTags').textContent = tags.length ? tags.join(', ') : getWorkspaceShareText('none', 'None');

    var isShared = button.getAttribute('data-shared') === '1' && sharedWith.length > 0;
    document.getElementById('workspaceInfoShared').textContent = isShared
        ? getWorkspaceShareText('yes', 'Yes')
        : getWorkspaceShareText('no', 'No');
    document.getElementById('workspaceInfoSharedWith').textContent = isShared
        ? sharedWith.join(', ')
        : getWorkspaceShareText('workspace-info-not-shared', 'Not shared');

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

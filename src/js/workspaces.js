// ========== WORKSPACE MANAGEMENT ==========
// This file handles workspace switching and management

// Global workspace state
var selectedWorkspace = '';

// Use global translation function from globals.js
var wsTr = window.t || function (key, vars, fallback) {
    return fallback || key;
};

function initializeWorkspaces() {
    var wsSelector = document.getElementById('workspaceSelector');

    // Use window.selectedWorkspace (set by PHP from URL or database settings)
    // This ensures the workspace selector matches the actual page workspace
    if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
        selectedWorkspace = window.selectedWorkspace;
    }

    // Validate that workspace exists in selector
    if (wsSelector) {
        var existsInSelect = false;
        for (var i = 0; i < wsSelector.options.length; i++) {
            if (wsSelector.options[i].value === selectedWorkspace) {
                existsInSelect = true;
                break;
            }
        }

        if (!existsInSelect) {
            // Workspace not found, select the first available one
            if (wsSelector.options.length > 0) {
                selectedWorkspace = wsSelector.options[0].value;
            } else {
                selectedWorkspace = '';
            }
            // Save to database
            if (typeof saveLastOpenedWorkspace === 'function') {
                saveLastOpenedWorkspace(selectedWorkspace);
            }
        }

        wsSelector.value = selectedWorkspace;
        wsSelector.addEventListener('change', onWorkspaceChange);
    }
}

// Helper function to get current search type for workspace navigation
function getCurrentSearchType() {
    var currentSearchType = 'notes'; // default
    if (window.searchManager) {
        // Try to get active search type from desktop first, then mobile
        var desktopActiveType = window.searchManager.getActiveSearchType(false);
        var mobileActiveType = window.searchManager.getActiveSearchType(true);

        // Use non-default type if available
        if (desktopActiveType !== 'notes') {
            currentSearchType = desktopActiveType;
        } else if (mobileActiveType !== 'notes') {
            currentSearchType = mobileActiveType;
        } else {
            currentSearchType = desktopActiveType; // fallback to desktop
        }
    }
    return currentSearchType;
}

function onWorkspaceChange() {
    var wsSelector = document.getElementById('workspaceSelector');
    if (!wsSelector) return;

    var val = wsSelector.value;
    selectedWorkspace = val;

    // Save last opened workspace to database
    if (typeof saveLastOpenedWorkspace === 'function') {
        saveLastOpenedWorkspace(val);
    }

    // Reload workspace background if function exists
    if (typeof window.reloadWorkspaceBackground === 'function') {
        window.reloadWorkspaceBackground();
    }

    // Reload the page with the new workspace
    var url = new URL(window.location.href);
    var currentSearchType = getCurrentSearchType();

    // Clear existing preserve parameters
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');

    // Set appropriate preserve parameter based on current search type
    if (currentSearchType === 'tags') {
        url.searchParams.set('preserve_tags', '1');
    } else {
        url.searchParams.set('preserve_notes', '1');
    }

    url.searchParams.set('workspace', val);
    window.location.href = url.toString();
}

function toggleWorkspaceMenu(event) {
    event.stopPropagation();

    // Try both mobile and desktop menus to ensure it works
    var mobileMenu = document.getElementById('workspaceMenuMobile');
    var desktopMenu = document.getElementById('workspaceMenu');

    // Use a more flexible mobile detection
    // Determine mobile/compact layout purely from the CSS breakpoint.
    var isMobile = isMobileDevice();
    var preferredMenu = isMobile ? mobileMenu : desktopMenu;
    var menu = preferredMenu || mobileMenu || desktopMenu;

    if (!menu) {
        return;
    }

    // Close the other menu if it exists
    var otherMenu = (menu === mobileMenu) ? desktopMenu : mobileMenu;
    if (otherMenu) {
        otherMenu.style.display = 'none';
    }

    if (menu.style.display === 'none' || menu.style.display === '') {
        loadAndShowWorkspaceMenu(menu);
    } else {
        menu.style.display = 'none';
    }
}

function loadAndShowWorkspaceMenu(menu) {
    menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-loader-2 lucide-spin"></i>' + wsTr('workspaces.menu.loading', {}, 'Loading workspaces...') + '</div>';
    menu.style.display = 'block';

    fetch('/api/v1/workspaces', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                displayWorkspaceMenu(menu, data.workspaces, data.username, data.acting_as);
            } else {
                menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-alert-triangle"></i>' + wsTr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
            }
        })
        .catch(function (error) {
            menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-alert-triangle"></i>' + wsTr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
        });
}

function displayWorkspaceMenu(menu, workspaces, username, actingAs) {
    // Use window.selectedWorkspace first (set by PHP), then fall back to selectedWorkspace variable
    var currentWorkspace = (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : (selectedWorkspace || '');
    var menuHtml = '';

    // Add username at the top if available
    if (username) {
        var displayText = username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        if (actingAs) {
            var safeActingAs = String(actingAs).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            var actingText = wsTr('workspace_menu.acting_as', { user: safeActingAs }, ' (acting as {{user}})');
            displayText += actingText;
        }

        menuHtml += '<div class="workspace-menu-item workspace-menu-username" data-action="user-settings">';
        menuHtml += '<i class="lucide lucide-user"></i>';
        menuHtml += '<span>' + displayText + '</span>';
        menuHtml += '</div>';
        menuHtml += '<div class="workspace-menu-divider"></div>';
    }

    // Check if current workspace exists in the list
    var workspaceExists = false;
    for (var i = 0; i < workspaces.length; i++) {
        if (workspaces[i].name === currentWorkspace) {
            workspaceExists = true;
            break;
        }
    }

    // If current workspace doesn't exist, select first one
    if (!workspaceExists && workspaces.length > 0) {
        currentWorkspace = workspaces[0].name;
    }

    // Sort workspaces alphabetically
    workspaces.sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    // Create menu elements
    for (var i = 0; i < workspaces.length; i++) {
        var workspace = workspaces[i];
        var isCurrent = workspace.name === currentWorkspace;
        var currentClass = isCurrent ? ' current-workspace' : '';
        var icon = isCurrent ? 'lucide-check-circle' : 'lucide-layers';
        var safeName = workspace.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        menuHtml += '<div class="workspace-menu-item' + currentClass + '" data-workspace-name="' + safeName + '">';
        menuHtml += '<i class="' + icon + '"></i>';
        menuHtml += '<span>' + safeName + '</span>';
        menuHtml += '</div>';
    }

    // Add divider before action items
    menuHtml += '<div class="workspace-menu-divider"></div>';

    // Add "Workspaces" menu item
    menuHtml += '<div class="workspace-menu-item" data-action="goto-workspaces">';
    menuHtml += '<i class="lucide lucide-settings"></i>';
    menuHtml += '<span>' + wsTr('workspace_menu.workspaces', {}, 'Workspaces') + '</span>';
    menuHtml += '</div>';

    // Add "Logout" menu item
    menuHtml += '<div class="workspace-menu-item" data-action="logout">';
    menuHtml += '<i class="lucide lucide-log-out"></i>';
    menuHtml += '<span>' + wsTr('workspace_menu.logout', {}, 'Logout') + '</span>';
    menuHtml += '</div>';

    menu.innerHTML = menuHtml;

    // Add event listeners using delegation
    menu.querySelectorAll('.workspace-menu-item[data-workspace-name]').forEach(function (item) {
        item.addEventListener('click', function () {
            switchToWorkspace(this.getAttribute('data-workspace-name'));
        });
    });

    // Add event listener for username click
    var usernameItem = menu.querySelector('.workspace-menu-username');
    if (usernameItem) {
        usernameItem.addEventListener('click', handleUsernameClick);
    }

    // Add event listener for Workspaces item
    var workspacesItem = menu.querySelector('[data-action="goto-workspaces"]');
    if (workspacesItem) {
        workspacesItem.addEventListener('click', function () {
            window.location.href = 'workspaces.php';
        });
    }

    // Add event listener for Logout item
    var logoutItem = menu.querySelector('[data-action="logout"]');
    if (logoutItem) {
        logoutItem.addEventListener('click', function () {
            window.location.href = 'logout.php';
        });
    }
}

function switchToWorkspace(workspaceName) {
    if (workspaceName === selectedWorkspace) {
        closeWorkspaceMenus();
        return;
    }

    closeWorkspaceMenus();
    updateWorkspaceNameInHeaders(workspaceName);

    // Remember the old workspace for tab saving
    var oldWorkspace = selectedWorkspace;
    selectedWorkspace = workspaceName;

    // Save last opened workspace to database
    if (typeof saveLastOpenedWorkspace === 'function') {
        saveLastOpenedWorkspace(workspaceName);
    }

    // Reload workspace background if function exists
    if (typeof window.reloadWorkspaceBackground === 'function') {
        window.reloadWorkspaceBackground();
    }

    // Clear the right column when switching workspace
    clearRightColumn();

    // Switch tabs: save old workspace's tabs, load new workspace's tabs
    if (window.tabManager && typeof window.tabManager.switchWorkspace === 'function') {
        window.tabManager.switchWorkspace(oldWorkspace);
    }

    var url = new URL(window.location.href);
    url.searchParams.delete('note');
    var currentSearchType = getCurrentSearchType();

    // Clear existing preserve parameters
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');

    // Set appropriate preserve parameter based on current search type
    if (currentSearchType === 'tags') {
        url.searchParams.set('preserve_tags', '1');
    } else {
        url.searchParams.set('preserve_notes', '1');
    }

    url.searchParams.set('workspace', workspaceName);

    history.pushState({ workspace: workspaceName }, '', url.toString());
    refreshLeftColumnForWorkspace(workspaceName);
}

function handleUsernameClick() {
    closeWorkspaceMenus();

    // Check if user is admin (from page config)
    var isAdmin = false;
    try {
        var configData = document.getElementById('page-config-data');
        if (configData) {
            var config = JSON.parse(configData.textContent);
            isAdmin = config.isAdmin || false;
        }
    } catch (e) {
        console.error('Error reading page config:', e);
    }

    if (isAdmin) {
        // Redirect to users.php for admin
        window.location.href = 'admin/users.php';
    } else {
        // Show modal for non-admin users
        var modal = document.getElementById('userSettingsInfoModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }
}

function closeWorkspaceMenus() {
    var menu1 = document.getElementById('workspaceMenu');
    var menu2 = document.getElementById('workspaceMenuMobile');
    if (menu1) menu1.style.display = 'none';
    if (menu2) menu2.style.display = 'none';
}

function updateWorkspaceNameInHeaders(workspaceName) {
    var desktopElement = document.getElementById('workspaceNameDesktop');
    var mobileElement = document.getElementById('workspaceNameMobile');

    if (desktopElement) {
        desktopElement.textContent = workspaceName;
    }
    if (mobileElement) {
        mobileElement.textContent = workspaceName;
    }
}

function refreshLeftColumnForWorkspace(workspaceName) {
    var url = new URL(window.location.href);
    url.searchParams.delete('note');
    url.searchParams.set('workspace', workspaceName);

    fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (response) { return response.text(); })
        .then(function (html) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');
            var newLeftCol = doc.getElementById('left_col');
            var currentLeftCol = document.getElementById('left_col');

            if (newLeftCol && currentLeftCol) {
                currentLeftCol.innerHTML = newLeftCol.innerHTML;

                // Reinitialize components after workspace change
                try {
                    // Reinitialize workspace menus
                    if (typeof initializeWorkspaceMenu === 'function') {
                        initializeWorkspaceMenu();
                    }

                    // Reinitialize search manager
                    if (window.searchManager) {
                        window.searchManager.initializeSearch();
                        // Ensure at least one button is active
                        window.searchManager.ensureAtLeastOneButtonActive();
                    }

                    // Reinitialize other components that might depend on left column content
                    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
                        reinitializeClickableTagsAfterAjax();
                    }

                    // Reinitialize note click handlers for mobile scroll functionality
                    if (typeof window.initializeNoteClickHandlers === 'function') {
                        window.initializeNoteClickHandlers();
                    }

                    // Reinitialize calendar
                    if (window.MiniCalendar) {
                        window.miniCalendar = new window.MiniCalendar();
                    }
                } catch (error) {
                    console.error('Error reinitializing after workspace change:', error);
                }

                // Re-highlight the currently active note in the sidebar
                // (after a short delay to ensure DOM is fully ready)
                var selectActiveNote = function () {
                    var activeNoteId = null;
                    // Try to get the active note from tab manager
                    if (window.tabManager && typeof window.tabManager.getActiveNoteId === 'function') {
                        activeNoteId = window.tabManager.getActiveNoteId();
                    }
                    // Fallback to global noteid
                    if (!activeNoteId && typeof noteid !== 'undefined' && noteid > 0) {
                        activeNoteId = String(noteid);
                    }
                    if (activeNoteId) {
                        var noteLink = document.querySelector('a.links_arbo_left[data-note-id="' + activeNoteId + '"]');
                        if (noteLink && typeof updateSelectedNote === 'function') {
                            updateSelectedNote(noteLink);
                        }
                    }
                };
                // Run immediately and with delays to handle async note loading
                setTimeout(selectActiveNote, 100);
                setTimeout(selectActiveNote, 500);
            }
        })
        .catch(function (err) {
            console.log('Error during refresh:', err);
        });
}

function clearRightColumn() {
    var rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.innerHTML = '';
    }

    // Reset global note ID variable
    if (typeof noteid !== 'undefined') {
        noteid = -1;
    }
}

// ========== MODAL MANAGEMENT ==========
// Functions to open/close workspace-related modals
function closeMoveModal() {
    document.getElementById('moveNotesModal').style.display = 'none';
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    document.getElementById('confirmDeleteInput').value = '';
    document.getElementById('confirmDeleteBtn').disabled = true;
}

// ========== ALERT & VALIDATION UTILITIES ==========

function showAjaxAlert(msg, type) {
    // Use showTopAlert for consistency if available
    if (typeof showTopAlert === 'function') {
        showTopAlert(msg, type === 'success' ? 'success' : 'danger');
        return;
    }
    var el = document.getElementById('ajaxAlert');
    if (!el) return;
    el.style.display = 'block';
    el.className = 'alert alert-' + (type === 'success' ? 'success' : 'danger');
    el.textContent = msg;
    setTimeout(function () { el.style.display = 'none'; }, 4000);
}

function showTopAlert(message, type) {
    var el = document.getElementById('topAlert');
    if (!el) {
        showAjaxAlert(message, type === 'danger' || type === 'error' ? 'danger' : 'success');
        return;
    }
    el.style.display = 'block';
    el.className = 'alert ' + (type === 'danger' || type === 'Error' ? 'alert-danger' : 'alert-success');
    el.innerHTML = message;
    // Auto-hide success messages after 3s
    if (type !== 'danger' && type !== 'Error') {
        setTimeout(function () { el.style.display = 'none'; }, 3000);
    }
}

function scrollToTopAlert() {
    var el = document.getElementById('topAlert');
    if (el) {
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            console.error('Error scrolling to alert:', e);
        }
    }
}

// Workspace name validation: only allow letters (including accented), digits, spaces, dash and underscore
function isValidWorkspaceName(name) {
    return /^[\p{L}0-9 _-]+$/u.test(name);
}

function validateCreateWorkspaceForm() {
    var el = document.getElementById('workspace-name');
    if (!el) return true;
    var v = el.value.trim();
    if (v === '') {
        showTopAlert(wsTr('workspaces.validation.enter_name', {}, 'Enter a workspace name'), 'danger');
        scrollToTopAlert();
        return false;
    }
    if (!isValidWorkspaceName(v)) {
        showTopAlert(wsTr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, spaces, dash or underscore only'), 'danger');
        scrollToTopAlert();
        return false;
    }
    return true;
}

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
    button.textContent = isShared
        ? getWorkspaceShareText('workspace-share-edit-btn', 'Edit share')
        : getWorkspaceShareText('workspace-share-enable-btn', 'Share');
    button.classList.toggle('btn-orange', isShared);
    button.classList.toggle('btn-success', !isShared);
    button.classList.remove('btn-danger');
    button.classList.remove('btn-warning');
    button.classList.remove('btn-primary');

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
    content.appendChild(specificUsersWrap);

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
            displayName.textContent = user.username + (user.email ? ' (' + user.email + ')' : '');

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
                        username: user.username || '',
                        email: user.email || ''
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
    if (loginCheckbox.checked && specificUsersCheckbox.checked) {
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

// ========== WORKSPACE ACTION HANDLERS ==========
// Event handlers for rename, select, delete, and move operations
function handleRenameButtonClick(e) {
    var button = e.target && e.target.closest ? e.target.closest('.workspace-rename-action, .btn-rename') : null;
    if (button) {
        e.preventDefault();
        e.stopPropagation();

        var currentName = button.getAttribute('data-ws');
        if (!currentName || button.disabled) return;

        // Populate modal with current name
        document.getElementById('renameSource').textContent = currentName;
        document.getElementById('renameNewName').value = currentName;

        // Show modal
        document.getElementById('renameModal').style.display = 'flex';

        // Set up confirm button handler
        document.getElementById('confirmRenameBtn').onclick = function () {
            var newName = document.getElementById('renameNewName').value.trim();
            if (!newName) {
                showTopAlert(wsTr('workspaces.validation.enter_new_name', {}, 'Please enter a new name'), 'danger');
                return;
            }
            if (!isValidWorkspaceName(newName)) {
                showTopAlert(wsTr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, spaces, dash or underscore only'), 'danger');
                return;
            }
            if (newName === currentName) {
                showTopAlert(wsTr('workspaces.validation.new_name_must_differ', {}, 'New name must be different from current name'), 'danger');
                return;
            }

            // Disable button to prevent double clicks
            try { document.getElementById('confirmRenameBtn').disabled = true; } catch (e) { }

            var params = new URLSearchParams({
                action: 'rename',
                name: currentName,
                new_name: newName
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
                    // Re-enable button
                    document.getElementById('confirmRenameBtn').disabled = false;

                    if (json && json.success) {
                        showAjaxAlert(wsTr('workspaces.alerts.renamed_success', {}, 'Workspace renamed successfully'), 'success');
                        closeRenameModal();

                        // Update last opened workspace if the renamed workspace was the current one
                        if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace === currentName) {
                            if (typeof saveLastOpenedWorkspace === 'function') {
                                saveLastOpenedWorkspace(newName);
                            }
                        }

                        // Reload page to show updated workspace name
                        setTimeout(function () {
                            window.location.reload();
                        }, 1000);
                    } else {
                        showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json.error || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                    }
                })
                .catch(function (err) {
                    document.getElementById('confirmRenameBtn').disabled = false;
                    console.error('Error renaming workspace:', err);
                    showAjaxAlert(wsTr('workspaces.alerts.rename_error', {}, 'Error renaming workspace'), 'danger');
                });
        };
    }
}

// Handle select button clicks
function handleSelectButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-select')) {
        var name = e.target.getAttribute('data-ws');
        if (!name) return;
        // Save to database
        if (typeof saveLastOpenedWorkspace === 'function') {
            saveLastOpenedWorkspace(name);
        }
        // Navigate to main notes page with workspace filter
        window.location = 'index.php?workspace=' + encodeURIComponent(name);
    }
}

// Handle delete button clicks
function handleDeleteButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-delete')) {
        var workspaceName = e.target.getAttribute('data-ws');
        if (!workspaceName || e.target.disabled) return;

        // Populate modal with workspace name
        document.getElementById('deleteWorkspaceName').textContent = workspaceName;
        document.getElementById('confirmDeleteInput').value = '';

        // Show modal
        document.getElementById('deleteModal').style.display = 'flex';

        // Set up input validation
        var inputEl = document.getElementById('confirmDeleteInput');
        var confirmBtn = document.getElementById('confirmDeleteBtn');

        function checkInput() {
            confirmBtn.disabled = inputEl.value.trim() !== workspaceName;
        }

        inputEl.addEventListener('input', checkInput);
        checkInput(); // initial check

        // Set up confirm button handler
        confirmBtn.onclick = function () {
            if (inputEl.value.trim() !== workspaceName) return;

            // Disable button to prevent double clicks
            confirmBtn.disabled = true;

            var params = new URLSearchParams({
                action: 'delete',
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
                    if (json && json.success) {
                        showAjaxAlert(wsTr('workspaces.alerts.deleted_success', {}, 'Workspace deleted successfully'), 'success');
                        closeDeleteModal();

                        // If the deleted workspace was the current one, find another workspace and save it
                        if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace === workspaceName) {
                            var newWorkspace = null;
                            var items = document.querySelectorAll('.workspace-name-item');
                            for (var i = 0; i < items.length; i++) {
                                var wsName = items[i].textContent.trim();
                                if (wsName !== workspaceName) {
                                    newWorkspace = wsName;
                                    break;
                                }
                            }
                            if (newWorkspace && typeof saveLastOpenedWorkspace === 'function') {
                                saveLastOpenedWorkspace(newWorkspace);
                            }
                        }

                        // Update the default workspace dropdown if needed
                        if (typeof window.loadDefaultWorkspaceSetting === 'function') {
                            window.loadDefaultWorkspaceSetting();
                        }

                        // Reload page to show updated workspace list
                        setTimeout(function () {
                            window.location.reload();
                        }, 1000);
                    } else {
                        showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json.error || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                        confirmBtn.disabled = false; // re-enable on error
                    }
                })
                .catch(function () {
                    confirmBtn.disabled = false;
                    console.error('Error deleting workspace:', err);
                    showAjaxAlert(wsTr('workspaces.alerts.delete_error', {}, 'Error deleting workspace'), 'danger');
                });
        };
    }
}

// ========== WORKSPACES MANAGEMENT PAGE ==========
// Functions specific to workspaces.php (creation, moving notes, etc.)

function formatNotesCount(num) {
    if (num === 0) return wsTr('workspaces.count.notes_0', {}, '0 notes');
    if (num === 1) return wsTr('workspaces.count.notes_1', {}, '1 note');
    return wsTr('workspaces.count.notes_n', { count: num }, '{{count}} notes');
}

// Handle workspace creation with AJAX
function handleCreateWorkspace(event) {
    event.preventDefault();

    var nameInput = document.getElementById('workspace-name');
    var name = nameInput.value.trim();

    // Validate
    if (name === '') {
        showTopAlert(wsTr('workspaces.validation.enter_name', {}, 'Enter a workspace name'), 'danger');
        scrollToTopAlert();
        return false;
    }
    if (!isValidWorkspaceName(name)) {
        showTopAlert(wsTr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, spaces, dash or underscore only'), 'danger');
        scrollToTopAlert();
        return false;
    }

    // Disable button to prevent double clicks
    var createBtn = document.getElementById('createWorkspaceBtn');
    if (createBtn) createBtn.disabled = true;

    var params = new URLSearchParams({
        action: 'create',
        name: name
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
            // Re-enable button
            if (createBtn) createBtn.disabled = false;

            if (json && json.success) {
                showAjaxAlert(wsTr('workspaces.messages.created', {}, 'Workspace created'), 'success');

                // Clear input
                nameInput.value = '';

                // Reload page to show the new workspace in the list
                setTimeout(function () {
                    window.location.reload();
                }, 1000);
            } else {
                showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json.error || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
            }
        })
        .catch(function (err) {
            if (createBtn) createBtn.disabled = false;
            console.error('Error creating workspace:', err);
            showAjaxAlert(wsTr('workspaces.alerts.create_error', {}, 'Error creating workspace'), 'danger');
        });

    return false;
}

// Handle move button clicks
function handleMoveButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-move')) {
        // Prevent action if button is disabled
        if (e.target.disabled) {
            return;
        }

        var source = e.target.getAttribute('data-ws');
        if (!source) return;

        document.getElementById('moveSourceName').textContent = source;

        // Populate targets from data attribute on body
        var sel = document.getElementById('moveTargetSelect');
        sel.innerHTML = '';

        var workspacesList = [];
        try {
            workspacesList = JSON.parse(document.body.getAttribute('data-workspaces') || '[]');
        } catch (e) {
            workspacesList = [];
        }

        workspacesList.forEach(function (w) {
            if (w !== source) {
                var opt = document.createElement('option');
                opt.value = w;
                opt.text = w;
                sel.appendChild(opt);
            }
        });

        document.getElementById('moveNotesModal').style.display = 'flex';

        // confirm handler
        document.getElementById('confirmMoveBtn').onclick = function () {
            var target = sel.value;
            if (!target) {
                alert(wsTr('workspaces.move.choose_target', {}, 'Choose a target'));
                return;
            }

            // disable to prevent double clicks
            var confirmBtn = document.getElementById('confirmMoveBtn');
            try { confirmBtn.disabled = true; } catch (e) { }

            var params = new URLSearchParams({
                action: 'move_notes',
                name: source,
                target: target
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
                .then(function (resp) {
                    if (!resp.ok) {
                        throw new Error('HTTP error ' + resp.status);
                    }
                    return resp.json();
                })
                .then(function (json) {
                    confirmBtn.disabled = false;
                    if (json && json.success) {
                        showAjaxAlert(wsTr('workspaces.move.moved_to', { count: (json.moved || 0), target: json.target }, 'Moved {{count}} notes to {{target}}'), 'success');

                        // Update counts in the displayed workspace list
                        updateWorkspaceNoteCounts(source, json.target, parseInt(json.moved || 0, 10));
                        // Persist the selected workspace so returning to notes shows destination
                        if (typeof saveLastOpenedWorkspace === 'function') {
                            saveLastOpenedWorkspace(json.target);
                        }

                        // Update Back to Notes links to include the workspace param
                        updateBackToNotesLinks(json.target);
                        closeMoveModal();
                    } else {
                        showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json.error || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                    }
                }).catch(function (err) {
                    confirmBtn.disabled = false;
                    console.error('Error moving notes:', err);
                    showAjaxAlert(wsTr('workspaces.move.error_moving_notes', { error: (err.message || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error moving notes: {{error}}'), 'danger');
                });
        };
    }
}

// Helper function to update workspace note counts in UI
function updateWorkspaceNoteCounts(sourceWorkspace, targetWorkspace, movedCount) {
    if (!movedCount) return;

    function adjustCountFor(name, delta) {
        var rows = document.querySelectorAll('.ws-name-row');
        for (var i = 0; i < rows.length; i++) {
            var nEl = rows[i].querySelector('.workspace-name-item');
            var cEl = rows[i].querySelector('.workspace-count');
            if (!nEl || !cEl) continue;
            if (nEl.textContent.trim() === name) {
                var text = cEl.textContent.trim();
                var num = parseInt(text, 10);
                if (isNaN(num)) {
                    var m = text.match(/(\d+)/);
                    num = m ? parseInt(m[1], 10) : 0;
                }
                num = Math.max(0, num + delta);
                cEl.textContent = formatNotesCount(num);
                break;
            }
        }
    }

    adjustCountFor(sourceWorkspace.trim(), -movedCount);
    adjustCountFor(targetWorkspace.trim(), movedCount);
}

// Helper function to update Back to Notes links
function updateBackToNotesLinks(workspaceName) {
    var backLinks = document.querySelectorAll('a.btn.btn-secondary');
    for (var i = 0; i < backLinks.length; i++) {
        var href = backLinks[i].getAttribute('href') || '';
        if (href.indexOf('index.php') !== -1) {
            backLinks[i].setAttribute('href', 'index.php?workspace=' + encodeURIComponent(workspaceName));
        }
    }
}

// ========== DEFAULT WORKSPACE SETTINGS ==========
// Manage default workspace selection
function loadDefaultWorkspaceSetting() {
    var select = document.getElementById('defaultWorkspaceSelect');
    if (!select) return;

    var lastOpenedLabel = document.body.getAttribute('data-txt-last-opened') || 'Last workspace opened';

    // Populate select with workspaces from data attribute
    select.innerHTML = '';

    // Add special option for last workspace opened
    var optLast = document.createElement('option');
    optLast.value = '__last_opened__';
    optLast.textContent = lastOpenedLabel;
    select.appendChild(optLast);

    var workspacesList = [];
    try {
        workspacesList = JSON.parse(document.body.getAttribute('data-workspaces') || '[]');
    } catch (e) {
        workspacesList = [];
    }

    workspacesList.forEach(function (w) {
        var opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w;
        select.appendChild(opt);
    });

    // Load current default workspace setting
    fetch('/api/v1/settings/default_workspace', {
        method: 'GET',
        credentials: 'same-origin'
    })
        .then(function (r) { return r.json(); })
        .then(function (j) {
            if (j && j.success && j.value) {
                select.value = j.value;
            } else {
                // Default to "Last workspace opened" if not set
                select.value = '__last_opened__';
            }
        })
        .catch(function (err) {
            console.error('Error loading default workspace setting:', err);
            select.value = '__last_opened__';
        });
}

function saveDefaultWorkspaceSetting() {
    var select = document.getElementById('defaultWorkspaceSelect');
    var status = document.getElementById('defaultWorkspaceStatus');
    if (!select) return;

    var lastOpenedLabel = document.body.getAttribute('data-txt-last-opened') || 'Last workspace opened';
    var selectedWorkspace = select.value;

    fetch('/api/v1/settings/default_workspace', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: selectedWorkspace })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result && result.success) {
                if (status) {
                    var displayText = selectedWorkspace === '__last_opened__'
                        ? lastOpenedLabel
                        : selectedWorkspace;
                    status.textContent = wsTr('workspaces.default.status_set_to', { workspace: displayText }, '✓ Default workspace set to: {{workspace}}');
                    status.style.display = 'block';
                    setTimeout(function () {
                        status.style.display = 'none';
                    }, 3000);
                }
            } else {
                alert(wsTr('workspaces.default.error_saving', {}, 'Error saving default workspace'));
            }
        })
        .catch(function (err) {
            console.error('Error saving default workspace setting:', err);
            alert(wsTr('workspaces.default.error_saving', {}, 'Error saving default workspace'));
        });
}

// ========== PAGE INITIALIZATION ==========

function initializeWorkspacesPage() {
    // Only run on workspaces.php page
    if (!document.getElementById('create-workspace-form')) return;

    // Back to home link (preserve workspace)
    var homeLink = document.getElementById('backToHomeLink');
    if (homeLink && typeof window.goBackToHome === 'function') {
        homeLink.addEventListener('click', function (e) {
            e.preventDefault();
            window.goBackToHome();
        });
    }

    // Handle clear workspace redirect (when workspace was deleted and need to redirect)
    var clearWs = document.body.getAttribute('data-clear-workspace');
    if (clearWs) {
        var firstWs = JSON.parse(clearWs);
        if (typeof saveLastOpenedWorkspace === 'function') {
            saveLastOpenedWorkspace(firstWs);
        }
        window.location = 'index.php?workspace=' + encodeURIComponent(firstWs);
        return;
    }

    // Add event listeners for buttons
    document.addEventListener('click', handleRenameButtonClick);
    document.addEventListener('click', handleSelectButtonClick);
    document.addEventListener('click', handleDeleteButtonClick);
    document.addEventListener('click', handleMoveButtonClick);
    document.addEventListener('click', handleWorkspaceShareToggleClick);
    
    // Toggle dropdowns
    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('.dropdown-toggle-btn');
        if (toggle) {
            var menu = toggle.nextElementSibling;
            var isShown = menu.classList.contains('show');
            
            // Close all other dropdowns
            document.querySelectorAll('.dropdown-menu.show').forEach(function (m) {
                m.classList.remove('show');
            });
            
            if (!isShown) {
                menu.classList.add('show');
            }
            return;
        }

        // Close dropdowns when clicking outside
        if (!e.target.closest('.ws-action-dropdown')) {
            document.querySelectorAll('.dropdown-menu.show').forEach(function (m) {
                m.classList.remove('show');
            });
        }
    });

    document.addEventListener('submit', handleWorkspaceShareToggleSubmit, true);
    document.addEventListener('click', function (event) {
        if (handleWorkspaceReadonlyShareSave(event)) return;
        if (handleWorkspaceReadonlyShareDisable(event)) return;
        if (handleWorkspaceReadonlyShareCopy(event)) return;
    });

    // Create workspace form
    var createForm = document.getElementById('create-workspace-form');
    if (createForm) {
        createForm.addEventListener('submit', handleCreateWorkspace);
    }

    // Update back link with current workspace from PHP
    var backLink = document.getElementById('backToNotesLink');
    var ws = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : (window.selectedWorkspace || document.body.getAttribute('data-workspace') || '');
    if (backLink && ws) {
        backLink.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(ws));
    }

    // Initialize default workspace dropdown
    loadDefaultWorkspaceSetting();

    // Attach save button handler
    var saveBtn = document.getElementById('saveDefaultWorkspaceBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveDefaultWorkspaceSetting);
    }
}

// Expose functions globally
window.loadDefaultWorkspaceSetting = loadDefaultWorkspaceSetting;
window.handleCreateWorkspace = handleCreateWorkspace;

// Auto-initialize workspaces page on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeWorkspacesPage);
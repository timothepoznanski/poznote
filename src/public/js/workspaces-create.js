// Workspace creation, modals and alerts.
// 
// The in-place create-workspace modal, the shared modal close helpers, and the alert
// and name-validation utilities the other workspace modules use.

// ========== CREATE WORKSPACE MODAL ==========
// A workspace is just a name, so it is created in place rather than by sending
// the user to workspaces.php. That page is still the fallback on any page that
// does not include modals.php.

function showCreateWorkspaceError(message) {
    var box = document.getElementById('createWorkspaceError');
    if (!box) return;
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
}

function openCreateWorkspaceModal() {
    var modal = document.getElementById('createWorkspaceModal');
    var input = document.getElementById('createWorkspaceInput');
    var confirmBtn = document.getElementById('confirmCreateWorkspaceBtn');
    if (!modal || !input || !confirmBtn) {
        window.location.href = 'workspaces.php?new=1';
        return;
    }

    input.value = '';
    confirmBtn.disabled = false;
    showCreateWorkspaceError('');
    modal.style.display = 'flex';
    input.focus();

    confirmBtn.onclick = submitCreateWorkspaceModal;
    input.onkeydown = function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitCreateWorkspaceModal();
        }
    };
}

function submitCreateWorkspaceModal() {
    var input = document.getElementById('createWorkspaceInput');
    var confirmBtn = document.getElementById('confirmCreateWorkspaceBtn');
    if (!input) return;

    var name = input.value.trim();
    if (name === '') {
        showCreateWorkspaceError(wsTr('workspaces.validation.enter_name', {}, 'Enter a workspace name'));
        return;
    }
    if (!isValidWorkspaceName(name)) {
        showCreateWorkspaceError(wsTr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, spaces, dash or underscore only'));
        return;
    }
    if (knownWorkspaceNames.indexOf(name) !== -1) {
        showCreateWorkspaceError(wsTr('workspaces.errors.already_exists', {}, 'A workspace with this name already exists'));
        return;
    }

    showCreateWorkspaceError('');
    if (confirmBtn) confirmBtn.disabled = true;

    fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: name })
    })
        .then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                return { status: response.status, data: data || {} };
            });
        })
        .then(function (result) {
            if (confirmBtn) confirmBtn.disabled = false;

            if (result.data.success) {
                if (typeof closeModal === 'function') {
                    closeModal('createWorkspaceModal');
                } else {
                    document.getElementById('createWorkspaceModal').style.display = 'none';
                }
                // Land in the new workspace: the sidebar switching over is the
                // confirmation that it was created. The in-place switch only
                // works where the note sidebar is rendered (index.php); the
                // create menu also lives on pages without it.
                var created = result.data.name || name;
                if (document.getElementById('left_col')) {
                    switchToWorkspace(created);
                } else {
                    window.location.href = 'index.php?workspace=' + encodeURIComponent(created);
                }
                return;
            }

            if (result.status === 409) {
                showCreateWorkspaceError(wsTr('workspaces.errors.already_exists', {}, 'A workspace with this name already exists'));
                return;
            }
            showCreateWorkspaceError(result.data.message || wsTr('workspaces.alerts.create_error', {}, 'Error creating workspace'));
        })
        .catch(function (error) {
            if (confirmBtn) confirmBtn.disabled = false;
            console.error('Error creating workspace:', error);
            showCreateWorkspaceError(wsTr('workspaces.alerts.create_error', {}, 'Error creating workspace'));
        });
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
    // Keep the body attribute in sync for scripts that read it instead of
    // the JS variable (the page is not reloaded on this path)
    if (document.body && document.body.dataset) {
        document.body.dataset.workspace = workspaceName;
    }

    // The icon rail is rendered outside #left_col, so the partial refresh at
    // the end of this function never touches it: re-point its links by hand or
    // they keep carrying the previous workspace, and an explicit ?workspace=
    // wins over the last-opened setting server-side
    // (js/icon-sidebar-toggle.js).
    if (typeof window.updateIconSidebarWorkspace === 'function') {
        window.updateIconSidebarWorkspace(workspaceName);
    }

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

    // The AI chat is scoped to the workspace: swap its conversation too
    if (window.AIChat && typeof window.AIChat.switchWorkspace === 'function') {
        window.AIChat.switchWorkspace(oldWorkspace);
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
        if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
            window.destroyMarkdownCodeMirrorEditorsWithin(rightCol);
        }
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

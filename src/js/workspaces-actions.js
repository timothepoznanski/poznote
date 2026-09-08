// Workspace action handlers.
// 
// Rename, tags, colour, select and delete, driven from the workspace menu and from
// workspaces.php.

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
            try { document.getElementById('confirmRenameBtn').disabled = true; } catch (e) {
                console.debug('workspaces-actions: handleRenameButtonClick() failed:', e);
            }

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

// Workspace tags modal ("Tags" entry of the Actions menu). Same list as the
// note "Manage tags" modal: one row per tag, editable in place, a cross to
// remove it, an input to add one. The whole list is sent on Save.
var workspaceTagsState = { name: '', tags: [] };

function closeWorkspaceTagsModal() {
    var modal = document.getElementById('workspaceTagsModal');
    if (modal) modal.style.display = 'none';
}

function parseWorkspaceTagInput(value) {
    return String(value || '').split(',').map(function (tag) {
        return tag.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
}

function workspaceTagIndex(tag) {
    var key = tag.toLowerCase();
    for (var i = 0; i < workspaceTagsState.tags.length; i++) {
        if (workspaceTagsState.tags[i].toLowerCase() === key) return i;
    }
    return -1;
}

function addWorkspaceTags(value) {
    parseWorkspaceTagInput(value).forEach(function (tag) {
        if (workspaceTagIndex(tag) === -1 && workspaceTagsState.tags.length < 20) {
            workspaceTagsState.tags.push(tag.substring(0, 50));
        }
    });
    renderWorkspaceTagsList();
}

function renderWorkspaceTagsList() {
    var container = document.getElementById('workspaceTagsList');
    if (!container) return;
    container.innerHTML = '';

    if (!workspaceTagsState.tags.length) {
        var empty = document.createElement('div');
        empty.className = 'tags-modal-empty';
        empty.textContent = wsTr('workspaces.tags.empty', {}, 'No tags yet.');
        empty.style.textAlign = 'center';
        empty.style.padding = '10px';
        empty.style.color = '#94a3b8';
        container.appendChild(empty);
        return;
    }

    workspaceTagsState.tags.forEach(function (tag, index) {
        var item = document.createElement('div');
        item.className = 'tags-modal-item';

        var name = document.createElement('span');
        name.className = 'tags-modal-item-name';
        name.textContent = tag;
        name.contentEditable = 'true';
        name.spellcheck = false;

        name.onkeydown = function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                name.blur();
            } else if (e.key === 'Escape') {
                name.textContent = workspaceTagsState.tags[index];
                name.blur();
            }
        };
        name.onblur = function () {
            var newValue = parseWorkspaceTagInput(name.textContent)[0] || '';
            var current = workspaceTagsState.tags[index];
            var duplicate = workspaceTagIndex(newValue);
            if (newValue && newValue !== current && (duplicate === -1 || duplicate === index)) {
                workspaceTagsState.tags[index] = newValue.substring(0, 50);
            }
            renderWorkspaceTagsList();
        };

        var delBtn = document.createElement('span');
        delBtn.className = 'tags-modal-item-delete lucide lucide-x';
        delBtn.title = wsTr('common.delete', {}, 'Delete');
        delBtn.onclick = function () {
            workspaceTagsState.tags.splice(index, 1);
            renderWorkspaceTagsList();
        };

        item.appendChild(name);
        item.appendChild(delBtn);
        container.appendChild(item);
    });
}

function handleWorkspaceTagsButtonClick(e) {
    var closeBtn = e.target && e.target.closest ? e.target.closest('[data-action="close-workspace-tags-modal"]') : null;
    if (closeBtn) {
        e.preventDefault();
        closeWorkspaceTagsModal();
        return;
    }

    var button = e.target && e.target.closest ? e.target.closest('.workspace-tags-action') : null;
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();

    var workspaceName = button.getAttribute('data-ws');
    var modal = document.getElementById('workspaceTagsModal');
    var input = document.getElementById('workspaceTagsInput');
    var confirmBtn = document.getElementById('confirmWorkspaceTagsBtn');
    if (!workspaceName || !modal || !input || !confirmBtn) return;

    workspaceTagsState = {
        name: workspaceName,
        tags: parseWorkspaceTagInput(button.getAttribute('data-tags') || '')
    };

    var source = document.getElementById('workspaceTagsSource');
    if (source) source.textContent = workspaceName;
    input.value = '';
    renderWorkspaceTagsList();

    modal.style.display = 'flex';
    setTimeout(function () { input.focus(); }, 100);

    // Enter or a comma adds what was typed; Escape closes
    input.onkeydown = function (event) {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            if (input.value.trim()) {
                addWorkspaceTags(input.value);
                input.value = '';
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeWorkspaceTagsModal();
        }
    };

    confirmBtn.onclick = function () {
        // A tag still sitting in the input counts too
        if (input.value.trim()) {
            addWorkspaceTags(input.value);
            input.value = '';
        }
        confirmBtn.disabled = true;

        var params = new URLSearchParams({
            action: 'set_tags',
            name: workspaceTagsState.name,
            tags: workspaceTagsState.tags.join(',')
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
                confirmBtn.disabled = false;
                if (json && json.success) {
                    closeWorkspaceTagsModal();
                    showAjaxAlert(wsTr('workspaces.tags.saved', {}, 'Tags updated'), 'success');
                    // Reload so the row chips and the Actions entry reflect the new list
                    setTimeout(function () { window.location.reload(); }, 600);
                } else {
                    showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error') }, 'Error: {{error}}'), 'danger');
                }
            })
            .catch(function () {
                confirmBtn.disabled = false;
                showAjaxAlert(wsTr('workspaces.tags.save_error', {}, 'Could not update the tags'), 'danger');
            });
    };
}

// Workspace color modal ("Color" action): one swatch per entry of the note
// color palette plus a custom color. Saved like the tags (set_color POST to
// workspaces.php); the dot marks the workspace's cards on multi-workspace
// dashboard views.
var workspaceColorState = { name: '', color: '' };

function closeWorkspaceColorModal() {
    var modal = document.getElementById('workspaceColorModal');
    if (modal) modal.style.display = 'none';
}

function isWorkspaceColorHex(value) {
    return /^#[0-9a-f]{6}$/i.test(value || '');
}

// Highlight the swatch matching the pending value: a palette entry by id (or
// by its hex), else the custom swatch, tinted with the value
function renderWorkspaceColorSelection() {
    var grid = document.getElementById('workspaceColorGrid');
    if (!grid) return;
    var value = (workspaceColorState.color || '').toLowerCase();
    var matchedPalette = false;
    Array.prototype.forEach.call(grid.querySelectorAll('.ws-color-option[data-color]'), function (option) {
        var isSelected = value !== '' && (
            option.getAttribute('data-color') === value ||
            (option.getAttribute('data-hex') || '').toLowerCase() === value
        );
        option.classList.toggle('selected', isSelected);
        option.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        if (isSelected) matchedPalette = true;
    });
    var isCustom = !matchedPalette && isWorkspaceColorHex(value);
    var custom = grid.querySelector('.ws-color-option-custom');
    var customSwatch = grid.querySelector('.ws-color-swatch-custom');
    var customInput = document.getElementById('workspaceColorCustom');
    if (custom) custom.classList.toggle('selected', isCustom);
    if (customSwatch) customSwatch.style.background = isCustom ? value : '';
    if (customInput && isCustom) customInput.value = value;
}

function saveWorkspaceColor(color, buttons) {
    buttons.forEach(function (button) { button.disabled = true; });
    var params = new URLSearchParams({
        action: 'set_color',
        name: workspaceColorState.name,
        color: color || ''
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
            buttons.forEach(function (button) { button.disabled = false; });
            if (json && json.success) {
                closeWorkspaceColorModal();
                showAjaxAlert(wsTr('workspaces.color.saved', {}, 'Color updated'), 'success');
                // Reload so the row dot and the action's data-color follow
                setTimeout(function () { window.location.reload(); }, 600);
            } else {
                showAjaxAlert(wsTr('workspaces.alerts.error_prefix', { error: (json && json.error) || wsTr('workspaces.alerts.unknown_error', {}, 'Unknown error') }, 'Error: {{error}}'), 'danger');
            }
        })
        .catch(function () {
            buttons.forEach(function (button) { button.disabled = false; });
            showAjaxAlert(wsTr('workspaces.color.save_error', {}, 'Could not update the color'), 'danger');
        });
}

function handleWorkspaceColorButtonClick(e) {
    var closeBtn = e.target && e.target.closest ? e.target.closest('[data-action="close-workspace-color-modal"]') : null;
    if (closeBtn) {
        e.preventDefault();
        closeWorkspaceColorModal();
        return;
    }

    // A palette swatch: select it (the custom swatch is a label around the
    // native color input, which opens on its own)
    var option = e.target && e.target.closest ? e.target.closest('#workspaceColorGrid .ws-color-option[data-color]') : null;
    if (option) {
        e.preventDefault();
        workspaceColorState.color = (option.getAttribute('data-color') || '').toLowerCase();
        renderWorkspaceColorSelection();
        return;
    }

    var button = e.target && e.target.closest ? e.target.closest('.workspace-color-action') : null;
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();

    var workspaceName = button.getAttribute('data-ws');
    var modal = document.getElementById('workspaceColorModal');
    var confirmBtn = document.getElementById('confirmWorkspaceColorBtn');
    var clearBtn = document.getElementById('workspaceColorClearBtn');
    var customInput = document.getElementById('workspaceColorCustom');
    if (!workspaceName || !modal || !confirmBtn || !clearBtn) return;

    workspaceColorState = {
        name: workspaceName,
        color: (button.getAttribute('data-color') || '').toLowerCase()
    };

    var source = document.getElementById('workspaceColorSource');
    if (source) source.textContent = workspaceName;
    if (customInput) {
        customInput.value = isWorkspaceColorHex(workspaceColorState.color) ? workspaceColorState.color : '#94a3b8';
        customInput.oninput = function () {
            workspaceColorState.color = (customInput.value || '').toLowerCase();
            renderWorkspaceColorSelection();
        };
    }
    renderWorkspaceColorSelection();
    modal.style.display = 'flex';

    confirmBtn.onclick = function () { saveWorkspaceColor(workspaceColorState.color, [confirmBtn, clearBtn]); };
    clearBtn.onclick = function () { saveWorkspaceColor('', [confirmBtn, clearBtn]); };
}

// The workspace name is the link that opens it (a plain click; modified
// clicks keep the browser's open-in-new-tab behaviour)
function handleSelectButtonClick(e) {
    var link = e.target && e.target.closest ? e.target.closest('.workspace-name-link') : null;
    if (!link) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

    var name = link.getAttribute('data-ws');
    if (!name) return;
    e.preventDefault();

    // Save to database
    if (typeof saveLastOpenedWorkspace === 'function') {
        saveLastOpenedWorkspace(name);
    }
    // Navigate to main notes page with workspace filter
    window.location = 'index.php?workspace=' + encodeURIComponent(name);
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

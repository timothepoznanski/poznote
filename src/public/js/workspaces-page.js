// The workspaces management page.
// 
// Everything specific to workspaces.php: note counts, moving notes between
// workspaces, the default-workspace setting, and the page's own initialisation.

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
    var tagsInput = document.getElementById('workspace-tags');
    if (tagsInput) {
        params.set('tags', tagsInput.value.trim());
    }

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
                // The row only appears once the page has reloaded, just below,
                // so the banner says the creation is under way rather than done.
                showAjaxAlert(wsTr('workspaces.messages.creating', {}, 'Creating workspace...'), 'success');

                // Clear inputs
                nameInput.value = '';
                if (tagsInput) tagsInput.value = '';

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
            try { confirmBtn.disabled = true; } catch (e) {
                console.debug('workspaces-page: handleMoveButtonClick() failed:', e);
            }

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
                        // Prefer the message the server sent over a bare status code:
                        // the API answers 4xx with {"error": "..."} and that text is what
                        // the user needs to see.
                        return resp.json()
                            .catch(function () { return {}; })
                            .then(function (data) {
                                throw new Error(data.error || data.message || ('HTTP error ' + resp.status));
                            });
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

// ========== ROW ACTIONS OVERFLOW ==========

// A workspace row keeps its name (and tags) on the left and its action icons on
// the right. On a narrow screen the icons stop fitting, so the ones that would
// squeeze the name below the width it actually needs are moved, in reverse
// order, into the kebab menu at the end of the strip. They are moved rather
// than duplicated, so the delegated handlers above keep firing from either
// place.
var WS_ACTIONS_NARROW_QUERY = '(max-width: 800px)';

// Floor and ceiling for the space the name column keeps for itself: never less
// than a couple of characters, never more than this share of the row, so a long
// name or a pile of tags still leaves the kebab somewhere to sit.
var WS_NAME_MIN_RESERVE = 60;
var WS_NAME_MAX_SHARE = 0.55;

function closeWorkspaceActionsMenus(except) {
    var open = document.querySelectorAll('.ws-col-actions.is-open');
    Array.prototype.forEach.call(open, function (col) {
        if (col === except) return;
        col.classList.remove('is-open');
        var toggle = col.querySelector('.ws-actions-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
}

function layoutWorkspaceRowActions() {
    var isNarrow = window.matchMedia(WS_ACTIONS_NARROW_QUERY).matches;
    var columns = document.querySelectorAll('.ws-col-actions');

    Array.prototype.forEach.call(columns, function (col) {
        var strip = col.querySelector('.ws-icon-actions');
        var menu = col.querySelector('.ws-actions-menu');
        var toggle = col.querySelector('.ws-actions-toggle');
        var row = col.parentElement;
        if (!strip || !menu || !toggle || !row) return;

        // Always start from every icon back on the row, then trim.
        while (menu.firstChild) {
            strip.appendChild(menu.firstChild);
        }
        col.classList.remove('is-open', 'has-overflow');
        toggle.setAttribute('aria-expanded', 'false');

        var nameCol = row.querySelector('.ws-col-name');
        if (!isNarrow) {
            if (nameCol) nameCol.style.removeProperty('--ws-name-reserve');
            return;
        }
        if (nameCol) {
            nameCol.style.setProperty('--ws-name-reserve', measureWorkspaceNameReserve(row, nameCol) + 'px');
        }

        // One pass per icon, plus one for the kebab appearing.
        var guard = strip.children.length + 2;
        while (guard-- > 0 && workspaceRowActionsOverflow(row, col)) {
            if (!col.classList.contains('has-overflow')) {
                // The kebab takes room of its own, so measure again with it.
                col.classList.add('has-overflow');
                continue;
            }
            if (!strip.lastElementChild) break;
            menu.insertBefore(strip.lastElementChild, menu.firstChild);
        }

        if (!menu.firstChild) {
            col.classList.remove('has-overflow');
        }
    });
}

// What the name and its tags need to sit on one line, clamped to the floor and
// ceiling above. Neutralising the reserve and pinning the column to its
// max-content width is what makes the column report that natural width instead
// of the width the flex line happens to give it.
function measureWorkspaceNameReserve(row, nameCol) {
    nameCol.style.setProperty('--ws-name-reserve', '0px');
    nameCol.style.setProperty('flex', '0 0 max-content', 'important');
    var needed = nameCol.getBoundingClientRect().width;
    nameCol.style.removeProperty('flex');

    var reserve = Math.max(needed, WS_NAME_MIN_RESERVE);
    var rowWidth = row.clientWidth;
    if (rowWidth > 0) {
        reserve = Math.min(reserve, rowWidth * WS_NAME_MAX_SHARE);
    }
    return Math.round(reserve);
}

// The action column runs past the right edge of the row: whatever is in it no
// longer fits on the line.
function workspaceRowActionsOverflow(row, col) {
    var rowRect = row.getBoundingClientRect();
    var colRect = col.getBoundingClientRect();
    if (!rowRect.width || !colRect.width) return false;
    return colRect.right > rowRect.right + 1;
}

function scheduleWorkspaceRowActionsLayout() {
    if (scheduleWorkspaceRowActionsLayout.pending) return;
    scheduleWorkspaceRowActionsLayout.pending = true;
    window.requestAnimationFrame(function () {
        scheduleWorkspaceRowActionsLayout.pending = false;
        layoutWorkspaceRowActions();
    });
}

function handleWorkspaceActionsToggleClick(event) {
    var target = (event.target && event.target.closest) ? event.target : null;
    if (!target) return;

    var toggle = target.closest('.ws-actions-toggle');
    if (toggle) {
        var col = toggle.closest('.ws-col-actions');
        if (!col) return;
        var willOpen = !col.classList.contains('is-open');
        closeWorkspaceActionsMenus(col);
        col.classList.toggle('is-open', willOpen);
        toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        return;
    }

    // Picking an action runs it (its own delegated handler) and closes the
    // menu; a click anywhere outside an open menu just closes it.
    if (target.closest('.ws-icon-btn') || !target.closest('.ws-col-actions.is-open')) {
        closeWorkspaceActionsMenus(null);
    }
}

function handleWorkspaceActionsMenuKeydown(event) {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    closeWorkspaceActionsMenus(null);
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
    document.addEventListener('click', handleWorkspaceActionsToggleClick);
    document.addEventListener('keydown', handleWorkspaceActionsMenuKeydown);
    window.addEventListener('resize', scheduleWorkspaceRowActionsLayout);
    document.addEventListener('click', handleRenameButtonClick);
    document.addEventListener('click', handleWorkspaceTagsButtonClick);
    document.addEventListener('click', handleWorkspaceColorButtonClick);
    document.addEventListener('keydown', handleWorkspaceOrderKeydown);
    document.addEventListener('click', handleSelectButtonClick);
    document.addEventListener('click', handleDeleteButtonClick);
    document.addEventListener('click', handleMoveButtonClick);
    document.addEventListener('click', handleWorkspaceShareToggleClick);
    document.addEventListener('click', handleWorkspaceInfoButtonClick);
    document.addEventListener('click', handleWorkspaceInfoCloseButtonClick);
    
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

    // Arriving from the sidebar's "New workspace" entry: put the caret in the
    // creation field straight away instead of leaving the user to find it.
    if (new URLSearchParams(window.location.search).get('new') === '1') {
        var nameInput = document.getElementById('workspace-name');
        if (nameInput) {
            nameInput.focus();
        }
    }

    // Update back link with current workspace from PHP
    var backLink = document.getElementById('backToNotesLink');
    var ws = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() : (window.selectedWorkspace || document.body.getAttribute('data-workspace') || '');
    if (backLink && ws) {
        backLink.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(ws));
    }

    // Split the row actions between the line and the kebab menu, then again
    // once the webfont has settled since it changes how wide the names are.
    layoutWorkspaceRowActions();
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(scheduleWorkspaceRowActionsLayout).catch(function () {});
    }

    // Dragging the rows by their handle to reorder the workspaces
    initWorkspaceOrderSortable();

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
window.openCreateWorkspaceModal = openCreateWorkspaceModal;

// Auto-initialize workspaces page on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeWorkspacesPage);

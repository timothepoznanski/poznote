// The workspace list of Settings > Workspaces (workspaces_section.php).
// 
// Everything specific to that list: moving notes between workspaces, the row
// menus, the filter, and the list's own initialisation. The actions are
// posted to workspaces.php.

// ========== WORKSPACE LIST ==========

// Handle move button clicks
function handleMoveButtonClick(e) {
    var moveButton = e.target && e.target.closest ? e.target.closest('.workspace-list .btn-move') : null;
    if (moveButton) {
        // Prevent action if button is disabled
        if (moveButton.disabled) {
            return;
        }

        var source = moveButton.getAttribute('data-ws');
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

                        // Persist the selected workspace so returning to notes shows destination
                        if (typeof saveLastOpenedWorkspace === 'function') {
                            saveLastOpenedWorkspace(json.target);
                        }
                        closeMoveModal();

                        // The rows carry the note counts (Information, and
                        // whether "Move notes" has anything to move): redraw
                        // them once the message has been read
                        setTimeout(function () {
                            window.location.reload();
                        }, 1000);
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

// ========== ROW ACTIONS MENU ==========

// Share stays on the row; the other actions sit in the "..." menu next to it
// (workspaces_section.php). The buttons carry the same classes in either place, so the
// delegated handlers above fire from the menu too.

function closeWorkspaceActionsMenus(except) {
    var open = document.querySelectorAll('.ws-col-actions.is-open');
    Array.prototype.forEach.call(open, function (col) {
        if (col === except) return;
        col.classList.remove('is-open');
        var toggle = col.querySelector('.ws-actions-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
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

// ========== LIST FILTER ==========

// Lower case, accents dropped: "ecole" finds "École".
function normalizeWorkspaceFilterText(text) {
    var value = String(text || '').toLowerCase();
    if (typeof value.normalize === 'function') {
        value = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return value;
}

// Hides the rows whose name and tags do not contain the term. While a term is
// typed the drag handles go too: a row moved among the visible ones would land
// next to hidden ones, in an order the user never saw.
function applyWorkspaceFilter() {
    var input = document.getElementById('workspace-filter-input');
    var list = document.querySelector('.workspace-list ul');
    if (!input || !list) return;

    var term = normalizeWorkspaceFilterText(input.value.trim());
    var wrapper = input.closest('.ws-filter');
    if (wrapper) wrapper.classList.toggle('has-value', input.value !== '');
    list.classList.toggle('is-filtering', term !== '');

    var shown = 0;
    Array.prototype.forEach.call(list.querySelectorAll('.ws-row'), function (row) {
        var haystack = row.getAttribute('data-ws') || '';
        Array.prototype.forEach.call(row.querySelectorAll('.ws-tag-chip'), function (chip) {
            haystack += ' ' + chip.textContent;
        });
        var match = term === '' || normalizeWorkspaceFilterText(haystack).indexOf(term) !== -1;
        row.hidden = !match;
        if (match) shown++;
    });

    var empty = document.getElementById('workspace-filter-empty');
    if (empty) empty.hidden = shown > 0;
}

function initWorkspaceFilter() {
    var input = document.getElementById('workspace-filter-input');
    if (!input) return;

    input.addEventListener('input', applyWorkspaceFilter);
    input.addEventListener('keydown', function (event) {
        if ((event.key === 'Escape' || event.key === 'Esc') && input.value !== '') {
            event.preventDefault();
            input.value = '';
            applyWorkspaceFilter();
        }
    });

    var clear = document.getElementById('workspace-filter-clear');
    if (clear) {
        clear.addEventListener('click', function () {
            input.value = '';
            applyWorkspaceFilter();
            input.focus();
        });
    }

    // A value the browser restored on back/forward navigation
    applyWorkspaceFilter();
}

// ========== PAGE INITIALIZATION ==========

function initializeWorkspacesPage() {
    // Only where the list is drawn (Settings > Workspaces): these scripts
    // also serve the workspace menu of the other pages
    if (!document.getElementById('settings-workspaces-list')) return;

    // Add event listeners for buttons
    document.addEventListener('click', handleWorkspaceActionsToggleClick);
    document.addEventListener('keydown', handleWorkspaceActionsMenuKeydown);
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

    // settings.php?open=new-workspace (what workspaces.php?new=1 redirects
    // to, the fallback of a page without the creation dialog): the dialog
    // opens here, once. The section has no button of its own for it.
    var pageUrl = new URL(window.location.href);
    if (pageUrl.searchParams.get('open') === 'new-workspace') {
        openCreateWorkspaceModal();
        pageUrl.searchParams.delete('open');
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(window.history.state, '', pageUrl.toString());
        }
    }

    // Dragging the rows by their handle to reorder the workspaces
    initWorkspaceOrderSortable();

    initWorkspaceFilter();
}

// Expose functions globally
window.openCreateWorkspaceModal = openCreateWorkspaceModal;

// Auto-initialize the workspace list on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeWorkspacesPage);

// Kanban view for Poznote.
// 
// Loading a folder's kanban board into the right column without losing the open tabs,
// plus two small shared helpers (the info modal and opening every note of a folder in
// tabs) that live here for historical reasons.

// ============================================
// Kanban View Functions
// ============================================

function setRightColumnContentPreservingTabs(html) {
    var rightCol = document.getElementById('right_col');
    if (!rightCol) {
        console.error('right_col element not found');
        return;
    }
    if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
        window.destroyMarkdownCodeMirrorEditorsWithin(rightCol);
    }
    rightCol.innerHTML = html;
}

function resetKanbanViewState() {
    window._isKanbanViewActive = false;
    window._kanbanFolderId = null;
    window._originalRightColContent = null;
    document.body.classList.remove('kanban-active');

    var isMobileClose = window.innerWidth <= 800;
    if (isMobileClose) {
        if (window._outlineWasMobileOpen) {
            document.body.classList.add('outline-mobile-open');
        }
        window._outlineWasMobileOpen = null;
    } else {
        if (window._outlineWasCollapsed === false) {
            document.documentElement.classList.remove('outline-collapsed');
            document.body.classList.remove('outline-collapsed');
        }
        window._outlineWasCollapsed = null;
    }
}

function activateKanbanViewState(folderId) {
    var wasKanbanActive = !!window._isKanbanViewActive;

    window._isKanbanViewActive = true;
    window._kanbanFolderId = folderId;
    document.body.classList.add('kanban-active');

    var isMobileKanban = window.innerWidth <= 800;
    if (isMobileKanban) {
        if (!wasKanbanActive) {
            window._outlineWasMobileOpen = document.body.classList.contains('outline-mobile-open');
        }
        document.body.classList.remove('outline-mobile-open');
    } else {
        if (!wasKanbanActive) {
            window._outlineWasCollapsed = document.body.classList.contains('outline-collapsed');
        }
        document.documentElement.classList.add('outline-collapsed');
        document.body.classList.add('outline-collapsed');
    }
}

function buildKanbanUrl(folderId, workspace) {
    var newUrl = 'index.php?kanban=' + encodeURIComponent(folderId);
    if (workspace) {
        newUrl += '&workspace=' + encodeURIComponent(workspace);
    }
    // Keep the sidebar folder filter ("Show only this folder") across reloads
    var currentFolder = new URLSearchParams(window.location.search).get('folder');
    if (currentFolder) {
        newUrl += '&folder=' + encodeURIComponent(currentFolder);
    }
    return newUrl;
}

function getKanbanLoadingHtml() {
    return '<div class="kanban-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);"><i class="lucide lucide-loader-2 lucide-spin" style="font-size: 2rem; margin-right: 12px;"></i> ' +
        (window.t ? window.t('common.loading', null, 'Loading...') : 'Loading...') + '</div>';
}

function getKanbanErrorHtml() {
    return '<div class="kanban-error" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">' +
        '<i class="lucide lucide-alert-triangle" style="font-size: 3rem; margin-bottom: 16px; color: #f59e0b;"></i>' +
        '<p>' + (window.t ? window.t('common.error', null, 'Error') : 'Error') + '</p>' +
        '<button onclick="closeKanbanView()" class="btn btn-primary" style="margin-top: 16px;">' +
        (window.t ? window.t('common.back_to_notes', null, 'Notes') : 'Notes') + '</button></div>';
}

/**
 * Open Kanban view for a folder (inline in right column)
 * @param {number} folderId - The folder ID
 * @param {string} folderName - The folder name
 */
function loadKanbanViewInline(folderId, folderName, options) {
    options = options || {};
    var workspace = getSelectedWorkspace();
    var rightCol = document.getElementById('right_col');

    if (!rightCol) {
        console.error('right_col element not found');
        return;
    }

    if (typeof window.releaseCurrentNoteEditLock === 'function') {
        window.releaseCurrentNoteEditLock();
    }
    if (typeof window.noteid !== 'undefined') {
        window.noteid = -1;
    }

    // Store original content for restoration
    if (!options.fromTabManager && !window._originalRightColContent) {
        window._originalRightColContent = rightCol.innerHTML;
    }

    // Show loading state
    setRightColumnContentPreservingTabs(getKanbanLoadingHtml());

    // Build AJAX URL
    var url = 'kanban_content.php?ajax=1&folder_id=' + folderId;
    if (workspace) {
        url += '&workspace=' + encodeURIComponent(workspace);
    }

    // Fetch Kanban content
    return fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'text/html' }
    })
        .then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.text();
        })
        .then(function (html) {
            setRightColumnContentPreservingTabs(html);

            if (typeof window.bindKanbanScrollButtons === 'function') {
                window.bindKanbanScrollButtons();
            }

            if (typeof window.restoreKanbanCompletedSections === 'function') {
                window.restoreKanbanCompletedSections();
            }

            if (typeof window.applyKanbanCardSize === 'function') {
                window.applyKanbanCardSize();
            }

            if (typeof window.applyKanbanCardSort === 'function') {
                window.applyKanbanCardSort();
            }

            activateKanbanViewState(folderId);

            // Remove selection from any notes in the sidebar
            document.querySelectorAll('.links_arbo_left.selected-note').forEach(function (el) {
                el.classList.remove('selected-note');
            });

            // Update URL
            var newUrl = buildKanbanUrl(folderId, workspace);

            // If we are already on this kanban view (e.g. page refresh), use replaceState
            var urlParams = new URLSearchParams(window.location.search);
            if (options.replaceHistory || urlParams.get('kanban') == folderId) {
                history.replaceState({ kanban: folderId }, '', newUrl);
            } else {
                history.pushState({ kanban: folderId }, '', newUrl);
            }

            // On mobile, scroll to right column
            if (window.innerWidth <= 800 && typeof window.scrollToRightColumn === 'function') {
                window.scrollToRightColumn();
            }
        })
        .catch(function (error) {
            console.error('Failed to load Kanban view:', error);
            setRightColumnContentPreservingTabs(getKanbanErrorHtml());
        });
}

function openKanbanView(folderId, folderName, options) {
    options = options || {};

    var tabManagerReady = window.tabManager &&
        typeof window.tabManager.openKanbanTab === 'function' &&
        (typeof window.tabManager.isInitialized !== 'function' || window.tabManager.isInitialized());

    if (!options.skipTabManager && tabManagerReady && window.innerWidth > 800) {
        window.tabManager.openKanbanTab(folderId, folderName);
        return;
    }

    return loadKanbanViewInline(folderId, folderName, options);
}

/**
 * Refresh the current Kanban view if it's active
 */
function refreshKanbanView() {
    if (window._isKanbanViewActive && window._kanbanFolderId) {
        loadKanbanViewInline(window._kanbanFolderId, null, { skipTabManager: true, fromTabManager: true, replaceHistory: true });
    }
}

/**
 * Close Kanban view and restore normal content
 */
function closeKanbanView() {
    var rightCol = document.getElementById('right_col');

    if (window.tabManager && window.innerWidth > 800 && typeof window.tabManager.getActiveTabType === 'function' && window.tabManager.getActiveTabType() === 'kanban') {
        if (typeof window.tabManager.closeActiveTab === 'function' && window.tabManager.closeActiveTab(false)) {
            return;
        }
        if (typeof window.tabManager.closeActiveTab === 'function' && window.tabManager.closeActiveTab(true)) {
            setRightColumnContentPreservingTabs('');
        }
    }

    if (window._originalRightColContent && rightCol) {
        rightCol.innerHTML = window._originalRightColContent;
        window._originalRightColContent = null;
    }

    resetKanbanViewState();

    // Update URL back to normal
    var workspace = getSelectedWorkspace();
    var newUrl = 'index.php';
    if (workspace) {
        newUrl += '?workspace=' + encodeURIComponent(workspace);
    }
    history.pushState({}, '', newUrl);
}

// Expose closeKanbanView globally
window.closeKanbanView = closeKanbanView;
window.resetKanbanViewState = resetKanbanViewState;


/**
 * Shows a simple information modal
 * @param {string} title 
 * @param {string} message 
 * @param {boolean} reloadAfter 
 */
function showInfoModal(title, message, reloadAfter = false) {
    const modal = document.getElementById('infoModal');
    const titleEl = document.getElementById('infoModalTitle');
    const messageEl = document.getElementById('infoModalMessage');

    if (!modal || !titleEl || !messageEl) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    window.reloadAfterInfoModal = reloadAfter;

    modal.style.display = 'flex';
}

/**
 * Open all notes in a folder in separate tabs
 * @param {number} folderId - The folder ID
 * @param {string} folderName - The folder name
 */
function openAllFolderNotesInTabs(folderId, folderName) {
    // Check if tabs are enabled
    if (!window.tabManager || !window.tabManager.openInNewTab) {
        console.error('Tab manager not available');
        showInfoModal(
            window.t ? window.t('common.error', null, 'Error') : 'Error',
            window.t ? window.t('notes_list.folder_actions.tabs_not_available', null, 'Tabs are not available on mobile devices') : 'Tabs are not available on mobile devices'
        );
        return;
    }

    // Find all notes in the folder
    // Notes have class 'links_arbo_left' and data-folder-id attribute
    var noteLinks = document.querySelectorAll('.links_arbo_left[data-folder-id="' + folderId + '"]');

    if (noteLinks.length === 0) {
        showInfoModal(
            window.t ? window.t('notes_list.folder_actions.no_notes_title', null, 'No notes') : 'No notes',
            window.t ? window.t('notes_list.folder_actions.no_notes_in_folder', null, 'This folder contains no notes') : 'This folder contains no notes'
        );
        return;
    }

    // Limit the number of tabs to avoid overwhelming the browser
    var maxTabs = 20;
    if (noteLinks.length > maxTabs) {
        var message = window.t
            ? window.t('notes_list.folder_actions.too_many_notes', {count: noteLinks.length, max: maxTabs}, 'This folder contains {count} notes. Only the first {max} will be opened to avoid overwhelming your browser.')
            : 'This folder contains ' + noteLinks.length + ' notes. Only the first ' + maxTabs + ' will be opened to avoid overwhelming your browser.';

        if (!confirm(message)) {
            return;
        }
    }

    // Open each note in a new tab
    var notesToOpen = Array.from(noteLinks).slice(0, maxTabs);
    notesToOpen.forEach(function(noteLink, index) {
        var noteId = noteLink.getAttribute('data-note-id');
        var noteTitleElement = noteLink.querySelector('.note-title');
        var noteTitle = noteTitleElement ? noteTitleElement.textContent.trim() : noteLink.textContent.trim();

        if (noteId) {
            // Add a small delay between opening tabs to avoid overwhelming the browser
            setTimeout(function() {
                window.tabManager.openInNewTab(noteId, noteTitle);
            }, index * 100); // 100ms delay between each tab
        }
    });
}

// Export to window
window.openKanbanView = openKanbanView;
window.openAllFolderNotesInTabs = openAllFolderNotesInTabs;
window.showInfoModal = showInfoModal;

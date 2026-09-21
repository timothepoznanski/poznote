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
        // The tab manager loads the neighbour tab, or empties the pane when
        // this was the last tab. Forced so a pinned kanban tab closes too.
        if (typeof window.tabManager.closeActiveTab === 'function' && window.tabManager.closeActiveTab(true)) {
            return;
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

// Limit the number of tabs opened at once to avoid overwhelming the browser
var OPEN_ALL_MAX_TABS = 20;

/**
 * Open all notes in a folder in separate tabs
 *
 * A folder whose subfolders also hold notes asks first: a folder with notes of
 * its own offers "this folder only" or "open all", one holding nothing but
 * subfolders offers to open theirs. Subfolders count at any depth (the tree
 * renders them inside the parent's #folder-{id} content, collapsed ones too).
 *
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

    // [data-note-id] keeps out the favorite-folder shortcut, which shares the
    // class and the folder id. Without a #folder-{id} content (the root of a
    // folder-filtered view) only the folder's own notes are looked up.
    var folderContent = document.getElementById('folder-' + folderId);
    var noteLinks = Array.from((folderContent || document).querySelectorAll('.links_arbo_left[data-note-id]'));
    var ownNoteLinks = noteLinks.filter(function(link) {
        return link.getAttribute('data-folder-id') === String(folderId);
    });
    var allNoteLinks = folderContent ? noteLinks : ownNoteLinks;

    if (allNoteLinks.length > ownNoteLinks.length && window.modalAlert && typeof window.modalAlert.showModal === 'function') {
        confirmOpenWithSubfolderNotes(ownNoteLinks, allNoteLinks);
        return;
    }

    if (ownNoteLinks.length === 0) {
        showInfoModal(
            window.t ? window.t('notes_list.folder_actions.no_notes_title', null, 'No notes') : 'No notes',
            window.t ? window.t('notes_list.folder_actions.no_notes_in_folder', null, 'This folder contains no notes') : 'This folder contains no notes'
        );
        return;
    }

    if (ownNoteLinks.length > OPEN_ALL_MAX_TABS) {
        var message = window.t
            ? window.t('notes_list.folder_actions.too_many_notes', {count: ownNoteLinks.length, max: OPEN_ALL_MAX_TABS}, 'This folder contains {{count}} notes. Only the first {{max}} will be opened to avoid overwhelming your browser.')
            : 'This folder contains ' + ownNoteLinks.length + ' notes. Only the first ' + OPEN_ALL_MAX_TABS + ' will be opened to avoid overwhelming your browser.';

        if (!confirm(message)) {
            return;
        }
    }

    openNoteLinksInTabs(ownNoteLinks);
}

/**
 * Ask before opening the notes of a folder whose subfolders hold notes too.
 * With notes of its own the folder gets a third button to open only those.
 * The tab limit is announced in the same dialog rather than in a second one.
 * Cancel stays the first button: Escape and a backdrop click run it.
 * @param {HTMLElement[]} ownNoteLinks - Note links directly in the folder
 * @param {HTMLElement[]} allNoteLinks - Every note link below the folder, in tree order
 */
function confirmOpenWithSubfolderNotes(ownNoteLinks, allNoteLinks) {
    var ownCount = ownNoteLinks.length;
    var totalCount = allNoteLinks.length;
    var title;
    var message;
    var buttons = [
        { text: window.t('common.cancel', null, 'Cancel'), type: 'secondary', action: function() {} }
    ];

    if (ownCount === 0) {
        title = window.t('notes_list.folder_actions.subfolders_only_title', null, 'Open subfolder notes');
        message = totalCount === 1
            ? window.t('notes_list.folder_actions.subfolders_only_message_one', null, 'This folder has no notes of its own, but its subfolders contain 1 note. Do you want to open it?')
            : window.t('notes_list.folder_actions.subfolders_only_message', {count: totalCount}, 'This folder has no notes of its own, but its subfolders contain {{count}} notes. Do you want to open all of these notes?');
    } else {
        title = window.t('notes_list.folder_actions.open_all_in_tabs', null, 'Open all notes');
        message = window.t('notes_list.folder_actions.with_subfolders_message', {own: ownCount, total: totalCount}, 'This folder contains notes, and its subfolders do too. Do you want to open only the notes of this folder ({{own}}) or all notes including subfolders ({{total}})?');
        buttons.push({
            text: window.t('notes_list.folder_actions.this_folder_only', null, 'This folder only'),
            type: 'primary',
            action: function() { openNoteLinksInTabs(ownNoteLinks); }
        });
    }

    if (totalCount > OPEN_ALL_MAX_TABS) {
        message += ' ' + window.t('notes_list.folder_actions.open_limit_notice', {max: OPEN_ALL_MAX_TABS}, 'Only the first {{max}} will be opened to avoid overwhelming your browser.');
    }

    buttons.push({
        text: window.t('notes_list.folder_actions.open_all_confirm', null, 'Open all'),
        type: 'primary',
        action: function() { openNoteLinksInTabs(allNoteLinks); }
    });

    window.modalAlert.showModal({
        type: 'confirm',
        message: message,
        alertType: 'info',
        title: title,
        modalClass: 'open-all-notes-confirm',
        buttons: buttons
    });
}

/**
 * Open note links in new tabs, up to OPEN_ALL_MAX_TABS
 * @param {HTMLElement[]} noteLinks - Note links from the tree
 */
function openNoteLinksInTabs(noteLinks) {
    var notesToOpen = Array.from(noteLinks).slice(0, OPEN_ALL_MAX_TABS);
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

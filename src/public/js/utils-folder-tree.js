// Folder tree state for Poznote.
// 
// Renaming a folder inline, opening and closing folders, expanding or collapsing them
// all, revealing a folder in the tree, persisting and restoring that state across page
// loads, and emptying a folder.

function editFolderName(folderId, oldName) {
    // Prevent renaming system folders
    if (oldName === 'Favorites' || oldName === 'Tags' || oldName === 'Trash') {
        showNotificationPopup(
            (window.t ? window.t('folders.errors.cannot_rename_system_folders', null, 'Cannot rename system folders') : 'Cannot rename system folders'),
            'error'
        );
        return;
    }

    // Inline in the tree when the folder has a row there; list_folders.php has
    // no tree and keeps the modal below.
    if (window.PoznoteInlineTreeEdit && window.PoznoteInlineTreeEdit.renameFolder(folderId, oldName)) {
        return;
    }

    document.getElementById('editFolderModal').style.display = 'flex';
    document.getElementById('editFolderName').value = oldName;
    document.getElementById('editFolderName').dataset.oldName = oldName;
    document.getElementById('editFolderName').dataset.folderId = folderId;
    document.getElementById('editFolderName').focus();
}

function saveFolderName() {
    var newName = document.getElementById('editFolderName').value.trim();
    var oldName = document.getElementById('editFolderName').dataset.oldName;
    var folderId = document.getElementById('editFolderName').dataset.folderId;

    if (!newName) {
        showNotificationPopup(
            (window.t ? window.t('folders.validation.enter_folder_name', null, 'Please enter a folder name') : 'Please enter a folder name'),
            'error'
        );
        return;
    }

    if (newName === oldName) {
        closeModal('editFolderModal');
        return;
    }

    var ws = getSelectedWorkspace();
    var requestData = {
        name: newName
    };
    if (ws) requestData.workspace = ws;

    fetch('/api/v1/folders/' + folderId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                closeModal('editFolderModal');
                // Folder renamed successfully - no notification needed
                location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.rename_prefix', { error: String(error) }, 'Error renaming folder: {{error}}') : ('Error renaming folder: ' + error)),
                'error'
            );
        });
}

function getFolderContentElements() {
    return Array.prototype.slice.call(document.querySelectorAll('#left_col .folder-content[id]')).filter(function (content) {
        var folderHeader = content.closest('.folder-header');
        return !folderHeader || folderHeader.getAttribute('data-folder') !== 'Favorites';
    });
}

function isFolderContentOpen(content) {
    if (!content) return false;
    var display = content.style.display || window.getComputedStyle(content).display;
    return display !== 'none';
}

function setFolderOpenState(folderId, isOpen) {
    var content = document.getElementById(folderId);
    if (!content) return;

    // Find the corresponding folder header/icon by folder DOM id (e.g. "folder-123")
    var folderNameEl = document.querySelector('.folder-name[data-folder-dom-id="' + folderId + '"]');
    var folderToggle = folderNameEl ? folderNameEl.closest('.folder-toggle') : null;
    var icon = folderToggle ? folderToggle.querySelector('.folder-icon') : null;
    // Determine folder name to avoid changing icon for the Favorites pseudo-folder
    var folderHeader = folderNameEl ? folderNameEl.closest('.folder-header') : null;
    var folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
    var isFavoritesFolder = folderKey === 'Favorites';

    // Check if icon is custom (don't toggle if custom)
    var isCustomIcon = icon && icon.getAttribute('data-custom-icon') === 'true';

    if (isOpen) {
        content.style.display = 'block';
        // show open folder icon (only if not custom and not favorites)
        if (icon && !isFavoritesFolder && !isCustomIcon) {
            icon.classList.remove('lucide-folder');
            icon.classList.add('lucide-folder-open');
        }
        localStorage.setItem('folder_' + folderId, 'open');
    } else {
        content.style.display = 'none';
        // show closed folder icon (only if not custom and not favorites)
        if (icon && !isFavoritesFolder && !isCustomIcon) {
            icon.classList.remove('lucide-folder-open');
            icon.classList.add('lucide-folder');
        }
        localStorage.setItem('folder_' + folderId, 'closed');
    }
}

function getShouldExpandAllFolders() {
    var folderContents = getFolderContentElements();
    if (folderContents.length === 0) return false;

    return folderContents.some(function (content) {
        return !isFolderContentOpen(content);
    });
}

function updateToggleAllFoldersButton() {
    // Two buttons share this action: the one in the sidebar header and the one
    // in the icon rail, so every match has to be kept in sync, not just the first.
    var buttons = document.querySelectorAll('[data-action="toggle-all-folders"]');
    if (!buttons.length) return;

    var folderContents = getFolderContentElements();
    var hasFolders = folderContents.length > 0;
    var shouldExpand = !hasFolders || getShouldExpandAllFolders();
    var title = shouldExpand
        ? (window.t ? window.t('sidebar.expand_all_folders', null, 'Expand all folders') : 'Expand all folders')
        : (window.t ? window.t('sidebar.collapse_all_folders', null, 'Collapse all folders') : 'Collapse all folders');

    buttons.forEach(function (button) {
        var icon = button.querySelector('.lucide');

        button.disabled = !hasFolders;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.setAttribute('aria-expanded', shouldExpand ? 'false' : 'true');

        if (icon) {
            icon.classList.toggle('lucide-chevron-down', shouldExpand);
            icon.classList.toggle('lucide-chevron-up', !shouldExpand);
        }
    });
}

function toggleAllFolders() {
    var folderContents = getFolderContentElements();
    if (folderContents.length === 0) return;

    var shouldOpen = getShouldExpandAllFolders();
    folderContents.forEach(function (content) {
        setFolderOpenState(content.id, shouldOpen);
    });
    updateToggleAllFoldersButton();
}

// Folder management function (open/closed folder icon)
function toggleFolder(folderId) {
    var content = document.getElementById(folderId);
    if (!content) return;

    setFolderOpenState(folderId, !isFolderContentOpen(content));
    updateToggleAllFoldersButton();
}

/**
 * Reveal a folder in the left folder list: expand it and all of its
 * ancestor folders, then scroll to its header and highlight it briefly.
 * Used by the folder breadcrumb segments in the note header.
 * @param {string|number} folderId - The folder database ID
 */
function revealFolderInTree(folderId) {
    var content = document.getElementById('folder-' + folderId);
    var header = document.querySelector(".folder-header[data-folder-key='folder_" + folderId + "']");
    // Folder may be absent from the list (search mode, folder filter)
    if (!content || !header) return;

    // Expand the folder itself and every ancestor folder
    var node = content;
    while (node) {
        if (node.classList.contains('folder-content')) {
            var isHidden = node.style.display === 'none' || window.getComputedStyle(node).display === 'none';
            if (isHidden) toggleFolder(node.id);
        }
        node = node.parentElement ? node.parentElement.closest('.folder-content') : null;
    }

    var isMobile = window.innerWidth <= 800;

    if (isMobile) {
        // Close the keyboard if the editor was focused: we are leaving the note.
        var active = document.activeElement;
        if (active && typeof active.blur === 'function' && active.closest && active.closest('#right_col')) {
            active.blur();
        }
        // On mobile the note view hides the list: switch back to the left column first.
        if (typeof window.scrollToLeftColumn === 'function') {
            window.scrollToLeftColumn();
        }
        // scrollIntoView() would walk up to <body>, which is the horizontal
        // scroller on mobile (css/index-mobile.css), and fight the sideways
        // animation back to the list, landing on the note again. Scroll the
        // list's own vertical scroller instead, once that animation is done.
        setTimeout(function () {
            scrollFolderHeaderIntoLeftColumn(header);
        }, 320);
    } else {
        header.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    header.classList.add('folder-reveal-highlight');
    setTimeout(function () {
        header.classList.remove('folder-reveal-highlight');
    }, 1600);
}

/**
 * Scroll a folder header into view inside the left column only, without
 * touching the horizontal (body) scroll used by the mobile two-pane layout.
 * @param {HTMLElement} header - The .folder-header element to center
 */
function scrollFolderHeaderIntoLeftColumn(header) {
    var leftCol = document.getElementById('left_col');
    if (!leftCol || !header) return;

    var headerRect = header.getBoundingClientRect();
    var colRect = leftCol.getBoundingClientRect();
    var offset = (headerRect.top - colRect.top) - (leftCol.clientHeight - headerRect.height) / 2;
    var target = Math.max(0, Math.min(leftCol.scrollTop + offset, leftCol.scrollHeight - leftCol.clientHeight));

    if (typeof leftCol.scrollTo === 'function') {
        leftCol.scrollTo({ top: target, behavior: 'smooth' });
    } else {
        leftCol.scrollTop = target;
    }
}

/**
 * Persist current folder open/closed states to localStorage
 * Useful before actions that reload the page (e.g., drag & drop moves)
 */
function persistFolderStatesFromDOM() {
    const folderToggles = document.querySelectorAll('.folder-name[data-folder-dom-id]');
    let pendingCreateOpenFolders = [];

    try {
        pendingCreateOpenFolders = JSON.parse(sessionStorage.getItem('poznote_create_open_folders') || '[]');
        if (!Array.isArray(pendingCreateOpenFolders)) {
            pendingCreateOpenFolders = [];
        }
    } catch (error) {
        pendingCreateOpenFolders = [];
    }

    folderToggles.forEach(function (toggleElement) {
        const folderDomId = toggleElement.getAttribute('data-folder-dom-id');
        const folderContent = folderDomId ? document.getElementById(folderDomId) : null;
        if (!folderDomId || !folderContent) return;

        const inlineDisplay = folderContent.style.display;
        const isOpen = pendingCreateOpenFolders.indexOf(folderDomId) !== -1
            || (inlineDisplay ? inlineDisplay !== 'none' : window.getComputedStyle(folderContent).display !== 'none');
        localStorage.setItem('folder_' + folderDomId, isOpen ? 'open' : 'closed');
    });
}

/**
 * Restore folder states from localStorage on page load
 * This preserves user preferences for which folders should stay open/closed
 */
function restoreFolderStates() {
    // Get all folder name elements that control toggling
    const folderToggles = document.querySelectorAll('.folder-name[data-folder-dom-id]');

    folderToggles.forEach(function (toggleElement) {
        const folderDomId = toggleElement.getAttribute('data-folder-dom-id');
        const folderContent = folderDomId ? document.getElementById(folderDomId) : null;
        const folderToggle = toggleElement.closest('.folder-toggle');
        const icon = folderToggle ? folderToggle.querySelector('.folder-icon') : null;

        if (!folderContent || !folderDomId) return;

        // Get the folder name to check if it's Favorites
        const folderHeader = toggleElement.closest('.folder-header');
        const folderKey = folderHeader ? folderHeader.getAttribute('data-folder') : '';
        const isFavoritesFolder = folderKey === 'Favorites';

        // Check if icon is custom
        const isCustomIcon = icon && icon.getAttribute('data-custom-icon') === 'true';

        // Check localStorage for this folder's state
        const savedState = localStorage.getItem('folder_' + folderDomId);

        // Only override the PHP-determined state if user has explicitly set a preference
        if (savedState === 'open') {
            // User explicitly opened this folder - keep it open
            folderContent.style.display = 'block';
            if (icon && !isFavoritesFolder && !isCustomIcon) {
                icon.classList.remove('lucide-folder');
                icon.classList.add('lucide-folder-open');
            }
        } else if (savedState === 'closed') {
            // User explicitly closed this folder - keep it closed
            folderContent.style.display = 'none';
            if (icon && !isFavoritesFolder && !isCustomIcon) {
                icon.classList.remove('lucide-folder-open');
                icon.classList.add('lucide-folder');
            }
        }
        // If no saved state exists, leave the folder as it was set by PHP logic
        // This preserves the smart PHP logic for determining initial folder states
    });

    // Favorites are always visible; the old separator toggle is no longer rendered.
    var favoritesHeader = document.querySelector('[data-folder="Favorites"]');
    if (favoritesHeader) {
        favoritesHeader.classList.remove('favorites-collapsed');
        localStorage.removeItem('favorites_collapsed');
    }

    updateToggleAllFoldersButton();
}

function emptyFolder(folderId, folderName) {
    showConfirmModal(
        (window.t ? window.t('folders.empty.title', null, 'Empty Folder') : 'Empty Folder'),
        (window.t
            ? window.t('folders.empty.confirm_message', { folder: folderName }, 'Are you sure you want to move all notes from "{{folder}}" to trash?')
            : ('Are you sure you want to move all notes from "' + folderName + '" to trash?')),
        function () {
            executeEmptyFolder(folderId, folderName);
        },
        {
            danger: true,
            confirmText: (window.t ? window.t('folders.empty.confirm_button', null, 'Send notes to trash') : 'Send notes to trash'),
            hideSaveAndExit: true
        }
    );
}

function executeEmptyFolder(folderId, folderName) {
    var ws = getSelectedWorkspace();
    var requestData = {};
    if (ws) requestData.workspace = ws;

    fetch('/api/v1/folders/' + folderId + '/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestData)
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                showNotificationPopup(
                    (window.t
                        ? window.t('folders.empty.success_moved_to_trash', { folder: folderName }, 'All notes moved to trash from folder: {{folder}}')
                        : ('All notes moved to trash from folder: ' + folderName))
                );
                location.reload();
            } else {
                showNotificationPopup(
                    (window.t ? window.t('folders.errors.generic_prefix', { error: data.error }, 'Error: {{error}}') : ('Error: ' + data.error)),
                    'error'
                );
            }
        })
        .catch(function (error) {
            showNotificationPopup(
                (window.t ? window.t('folders.errors.empty_folder_prefix', { error: String(error) }, 'Error emptying folder: {{error}}') : ('Error emptying folder: ' + error)),
                'error'
            );
        });
}

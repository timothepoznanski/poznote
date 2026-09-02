// ===========================
// Share / Export menu functionality
// ===========================

// Constants
const MENU_Z_INDEX = 20000;
const MENU_SPACING = 8;
const MIN_VIEWPORT_MARGIN = 8;

// State management
let currentShareMenuNoteId = null;
let isShareMenuOpen = false;

function getSelectedShareAccessMode(fallbackMode) {
    const selectedOption = document.querySelector('input[name="shareTaskAccessMode"]:checked');
    if (!selectedOption) {
        return ['read_only', 'check_only', 'full'].includes(fallbackMode) ? fallbackMode : 'full';
    }

    const accessMode = selectedOption.value;
    return ['read_only', 'check_only', 'full'].includes(accessMode) ? accessMode : 'full';
}

// ===========================
// Helper Functions
// ===========================

/**
 * Clear all inline positioning styles from a menu element
 * @param {HTMLElement} element - The menu element to clean
 */
function clearMenuPositioning(element) {
    const propertiesToClear = [
        'position', 'left', 'right', 'top', 'bottom',
        'transform', 'margin-top', 'z-index', 'box-shadow'
    ];
    
    propertiesToClear.forEach(prop => {
        try {
            element.style.removeProperty(prop);
        } catch (e) {
            // Ignore removal errors
        }
    });
    element.style.visibility = '';
}

/**
 * Position a menu relative to a button using fixed positioning
 * @param {HTMLElement} menu - The menu to position
 * @param {HTMLElement} button - The button that triggered the menu
 */
function positionMenuNearButton(menu, button) {
    const rect = button.getBoundingClientRect();
    
    // Make menu invisible but displayed to measure height
    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    
    // Clear any previous positioning
    clearMenuPositioning(menu);
    
    // Apply fixed positioning with important priority to override CSS
    menu.style.setProperty('position', 'fixed', 'important');
    
    // Center horizontally on the button
    const centerX = rect.left + rect.width / 2;
    menu.style.setProperty('left', centerX + 'px', 'important');
    menu.style.setProperty('transform', 'translateX(-50%)', 'important');
    menu.style.setProperty('margin-top', '0', 'important');
    menu.style.setProperty('z-index', MENU_Z_INDEX.toString(), 'important');
    menu.style.setProperty('box-shadow', '0 8px 24px rgba(0,0,0,0.18)', 'important');
    
    // Compute available space and place above by default
    const menuHeight = menu.getBoundingClientRect().height || menu.offsetHeight || 0;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let topPos = rect.top - menuHeight - MENU_SPACING;
    
    // If not enough space above, place below instead
    if (topPos < MIN_VIEWPORT_MARGIN && spaceBelow > spaceAbove) {
        topPos = rect.bottom + MENU_SPACING;
    }
    
    menu.style.setProperty('top', Math.max(MIN_VIEWPORT_MARGIN, topPos) + 'px', 'important');
    menu.style.setProperty('bottom', 'auto', 'important');
    
    // Restore visibility
    menu.style.visibility = '';
}

/**
 * Refresh notes list after folder action (share/revoke)
 */
function refreshNotesListAfterFolderAction(folderIdToOpen, options) {
    options = options || {};

    if (typeof persistFolderStatesFromDOM === 'function') {
        persistFolderStatesFromDOM();
    }

    if (folderIdToOpen !== null && folderIdToOpen !== undefined && folderIdToOpen !== '') {
        localStorage.setItem('folder_folder-' + String(folderIdToOpen), 'open');
    }

    const url = new URL(window.location.href);

    return fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newLeftCol = doc.getElementById('left_col');
            const currentLeftCol = document.getElementById('left_col');

            if (newLeftCol && currentLeftCol) {
                currentLeftCol.innerHTML = newLeftCol.innerHTML;

                // Reinitialize components
                try {
                    if (typeof initializeWorkspaceMenu === 'function') {
                        initializeWorkspaceMenu();
                    }

                    if (window.searchManager) {
                        window.searchManager.initializeSearch();
                        window.searchManager.ensureAtLeastOneButtonActive();
                    }

                    if (typeof reinitializeClickableTagsAfterAjax === 'function') {
                        reinitializeClickableTagsAfterAjax();
                    }

                    if (typeof window.initializeNoteClickHandlers === 'function') {
                        window.initializeNoteClickHandlers();
                    }

                    if (typeof setupNoteDragDropEvents === 'function') {
                        setupNoteDragDropEvents();
                    }

                    if (typeof restoreFolderStates === 'function') {
                        restoreFolderStates();
                    }

                    // The drag & drop import overlay lives inside #left_col and
                    // was destroyed by the innerHTML swap above.
                    if (typeof window.reinitializeSidebarFileImportOverlay === 'function') {
                        window.reinitializeSidebarFileImportOverlay();
                    }

                    if (typeof window.reinitializeFavoritesToggle === 'function') {
                        window.reinitializeFavoritesToggle();
                    }

                    if (!options.skipKanbanViewRefresh && typeof window.refreshKanbanView === 'function') {
                        window.refreshKanbanView();
                    }

                    // The mini calendar lives inside #left_col: replacing the
                    // innerHTML destroyed its DOM and listeners, so rebuild it
                    // (same as workspaces.js does after a workspace switch).
                    if (window.MiniCalendar && document.getElementById('mini-calendar')) {
                        window.miniCalendar = new window.MiniCalendar();
                    }
                } catch (error) {
                    console.error('Error reinitializing after folder action:', error);
                }
            }
        })
        .catch(err => {
            console.error('Error during refresh:', err);
        });
}

/**
 * Update the shared notes count in the sidebar
 * @param {number} delta - The change in count (positive or negative)
 */
function updateSharedCount(delta) {
    const countEl = document.getElementById('count-shared');
    if (countEl) {
        const currentCount = parseInt(countEl.textContent.trim(), 10) || 0;
        const newCount = Math.max(0, currentCount + delta);
        countEl.textContent = newCount.toString();
    }
}

// ===========================
// Share Menu Functions
// ===========================

/**
 * Toggle the share menu for a note
 * @param {Event} event - The click event
 * @param {string} noteId - The note ID
 * @param {string} filename - The note filename (unused but kept for compatibility)
 * @param {string} titleJson - The note title JSON (unused but kept for compatibility)
 */
function toggleShareMenu(event, noteId, filename, titleJson) {
    if (event) event.stopPropagation();
    currentShareMenuNoteId = noteId;

    // Close other menus
    if (typeof closeSettingsMenus === 'function') closeSettingsMenus();

    // Find the menu elements specific to this note
    const desktop = document.getElementById('shareMenu-' + noteId);
    const mobile = document.getElementById('shareMenuMobile-' + noteId);
    const activeMenu = desktop || mobile;

    if (!activeMenu) return;

    // Toggle off if already open for this note
    if (isShareMenuOpen && currentShareMenuNoteId === noteId) {
        closeShareMenu();
        return;
    }

    // Close any other share menus first
    const allMenus = document.querySelectorAll('.share-menu');
    allMenus.forEach(menu => {
        menu.style.display = 'none';
        clearMenuPositioning(menu);
    });

    // Show the active menu
    activeMenu.style.display = 'block';

    // Position the menu if it's in a mobile container
    try {
        let triggerBtn = null;
        if (event && event.target) {
            triggerBtn = event.target.closest('[data-note-id]');
        }
        if (!triggerBtn) {
            triggerBtn = document.querySelector('[data-note-id="' + noteId + '"]');
        }

        const isMobileDropdown = triggerBtn && 
            triggerBtn.closest('.share-dropdown') && 
            triggerBtn.closest('.share-dropdown').classList.contains('mobile');

        if (isMobileDropdown && triggerBtn) {
            positionMenuNearButton(activeMenu, triggerBtn);
        } else {
            // Desktop: ensure menu is positioned by CSS
            clearMenuPositioning(activeMenu);
        }
    } catch (error) {
        console.error('Error positioning share menu:', error);
    }

    isShareMenuOpen = true;
    currentShareMenuNoteId = noteId;
}

/**
 * Close all share menus
 */
function closeShareMenu() {
    const allMenus = document.querySelectorAll('.share-menu');
    allMenus.forEach(menu => {
        menu.style.display = 'none';
        clearMenuPositioning(menu);
    });
    isShareMenuOpen = false;
    currentShareMenuNoteId = null;
}

/**
 * Create a public share link for a note
 * @param {string} noteId - The note ID
 */
async function createPublicShare(noteId) {
    if (!noteId) return;

    try {
        // Gather optional parameters from modal inputs
        let customToken = '';
        try {
            const tokenInput = document.getElementById('shareCustomToken');
            if (tokenInput && tokenInput.value) {
                customToken = tokenInput.value.trim();
            }
        } catch (error) {
            console.error('Error reading custom token:', error);
        }

        let indexable = 0;
        try {
            const indexableCheckbox = document.getElementById('shareIndexable');
            if (indexableCheckbox && indexableCheckbox.checked) {
                indexable = 1;
            }
        } catch (error) {
            console.error('Error reading indexable setting:', error);
        }

        let password = '';
        try {
            const passwordInput = document.getElementById('sharePassword');
            if (passwordInput && passwordInput.value) {
                password = passwordInput.value.trim();
            }
        } catch (error) {
            console.error('Error reading password:', error);
        }

        // Build request body
        const theme = (window.__poznoteUserStorage || localStorage).getItem('poznote-theme') || 'light';
        const requestBody = { theme: theme, indexable: indexable };
        requestBody.access_mode = getSelectedShareAccessMode('full');
        if (customToken) requestBody.custom_token = customToken;
        if (password) requestBody.password = password;

        // Make API request
        const response = await fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.indexOf('application/json') !== -1) {
                const errorData = await response.json();
                throw new Error(errorData.error || ('Network response not ok: ' + response.status));
            }
            throw new Error('Network response not ok: ' + response.status);
        }

        // Parse response
        const contentType = response.headers.get('content-type') || '';
        let data = null;
        if (contentType.indexOf('application/json') !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error('Unexpected response from server: ' + text);
        }

        // Handle successful response
        if (data && data.url) {
            markShareIconShared(noteId, true);
            updateSharedCount(1);

            closeModal('shareModal');
            openSharedManagementPage({
                itemType: 'note',
                itemId: noteId,
                token: extractShareTokenFromUrl(data.url),
                workspace: data.workspace || ''
            });
        } else if (data && data.error) {
            const errorMsg = (window.t ? window.t('index.share_modal.error_prefix', null, 'Error: ') : 'Error: ') + data.error;
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(errorMsg, 'error');
            }
        } else {
            const errorMsg = window.t ? window.t('index.share_modal.unknown_error', null, 'Unknown error creating public share') : 'Unknown error creating public share';
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(errorMsg, 'error');
            }
        }
    } catch (error) {
        console.error('Error creating public share:', error);
        const errorMsg = (window.t ? window.t('index.share_modal.error_creating', null, 'Error creating public share: ') : 'Error creating public share: ') + error.message;
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup(errorMsg, 'error');
        }
    }
}

function extractShareTokenFromUrl(url) {
    if (!url) return '';

    try {
        const normalizedUrl = String(url).split('?')[0].replace(/\/+$/, '');
        return decodeURIComponent(normalizedUrl.substring(normalizedUrl.lastIndexOf('/') + 1));
    } catch (error) {
        console.error('Error extracting share token from URL:', error);
        return '';
    }
}

function buildSharedManagementUrl(options) {
    const sharedUrl = new URL('shared.php', window.location.href);
    const itemType = options && options.itemType ? options.itemType : 'note';
    const itemId = options && options.itemId ? options.itemId : null;
    const workspace = options && options.workspace ? options.workspace : '';
    const autoEdit = options && Object.prototype.hasOwnProperty.call(options, 'autoEdit')
        ? !!options.autoEdit
        : true;

    if (itemType === 'folder') {
        sharedUrl.searchParams.set('type', 'folders');
    }
    if (workspace) {
        sharedUrl.searchParams.set('workspace', workspace);
    }
    if (itemId && autoEdit) {
        sharedUrl.searchParams.set('auto_edit', '1');
        sharedUrl.searchParams.set('item_type', itemType);
        sharedUrl.searchParams.set('item_id', String(itemId));
    }

    return sharedUrl.toString();
}

function openSharedManagementPage(options) {
    const targetUrl = buildSharedManagementUrl(options);
    window.location.href = targetUrl;
}

// ===========================
// Share Modal Display
// ===========================

/**
 * Show the modal offering to create a public URL for a note.
 * Notes that are already shared are handled by the shared management page
 * (see openPublicShareModal), so this modal only covers the not-yet-shared case.
 * @param {Object} options - Modal options
 * @param {string} options.noteId - The note ID
 */
function showShareModal(options) {
    // Remove existing if any
    const existing = document.getElementById('shareModal');
    if (existing) existing.parentNode.removeChild(existing);

    // Build modal using same structure and classes as other modals (modal -> modal-content -> modal-buttons)
    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'modal share-modal';
    modal.style.display = 'flex';

    const content = document.createElement('div');
    content.className = 'modal-content share-modal-content';

    // No close (×) icon for the share modal per UX request

    const noteId = options && options.noteId ? options.noteId : null;

    const h3 = document.createElement('h3');
    h3.textContent = window.t ? window.t('index.public_modal.title', null, 'Shared URL') : 'Shared URL';
    content.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = window.t
        ? window.t('index.share_modal.description', null, 'A shared URL creates a public link to this note. Anyone with this link can access the shared version of the note.')
        : 'A shared URL creates a public link to this note. Anyone with this link can access the shared version of the note.';
    content.appendChild(p);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons share-modal-buttons';

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn-create-share';
    createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create url') : 'Create url';
    // create button styled via CSS class
    createBtn.onclick = function () { createPublicShare(noteId); };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = window.t ? window.t('common.cancel', null, 'Cancel') : 'Cancel';
    cancelBtn.onclick = function () { closeModal('shareModal'); };
    buttonsDiv.appendChild(cancelBtn);
    buttonsDiv.appendChild(createBtn);

    content.appendChild(buttonsDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);
}

// ===========================
// Public Share Management
// ===========================

/**
 * Get existing public share info for a note
 * @param {string} noteId - The note ID
 * @returns {Promise<Object>} Object with { shared: boolean, url?: string, workspace?: string }
 */
async function getPublicShare(noteId) {
    if (!noteId) return { shared: false };
    
    try {
        const response = await fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) return { shared: false };
        
        const contentType = response.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') === -1) return { shared: false };
        
        const data = await response.json();
        if (data && data.url) {
            return { 
                shared: true, 
                url: data.url, 
                workspace: data.workspace || '',
                noteType: data.noteType || 'note',
                accessMode: data.accessMode || 'full'
            };
        }
        return {
            shared: false,
            noteType: data.noteType || 'note',
            accessMode: data.accessMode || 'full'
        };
    } catch (error) {
        console.error('Error getting public share:', error);
        return { shared: false };
    }
}

/**
 * Open the share modal for a note (checks existing share first)
 * @param {string} noteId - The note ID
 * @param {Element} [sourceEl] - The clicked element; the toolbar button carries
 *                              data-shared-via-folder when the note is only
 *                              shared through a shared folder
 */
async function openPublicShareModal(noteId, sourceEl) {
    if (!noteId) return;

    const shareInfo = await getPublicShare(noteId);

    // Already shared: managing an existing share happens on the shared page
    if (shareInfo.shared && shareInfo.url) {
        markShareIconShared(noteId, true);
        openSharedManagementPage({
            itemType: 'note',
            itemId: noteId,
            token: extractShareTokenFromUrl(shareInfo.url),
            workspace: shareInfo.workspace,
            autoEdit: false
        });
        return;
    }

    // No direct share, but the toolbar icon is blue because an ancestor folder
    // is shared: explain that instead of offering to create another share URL.
    // (The note actions menu keeps the normal share flow: its menu item does
    // not carry the attribute.)
    if (sourceEl && sourceEl.getAttribute && sourceEl.getAttribute('data-shared-via-folder') === '1') {
        showSharedViaFolderModal(noteId, sourceEl.getAttribute('data-shared-folder-name') || '');
        return;
    }

    showShareModal({ noteId: noteId });
}

/**
 * Info popup for a note that is shared only because it sits inside a shared folder.
 * Also offers to create a note-specific share link on top of the folder share.
 * @param {string} noteId - The note ID
 * @param {string} folderName - Name of the shared (ancestor) folder
 */
function showSharedViaFolderModal(noteId, folderName) {
    const existing = document.getElementById('sharedViaFolderModal');
    if (existing) existing.parentNode.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'sharedViaFolderModal';
    modal.className = 'modal share-modal';
    modal.style.display = 'flex';

    const content = document.createElement('div');
    content.className = 'modal-content share-modal-content';

    const h3 = document.createElement('h3');
    h3.textContent = window.t
        ? window.t('index.share_modal.shared_via_folder_title', null, 'Shared note')
        : 'Shared note';
    content.appendChild(h3);

    const p = document.createElement('p');
    if (folderName) {
        p.textContent = window.t
            ? window.t('index.share_modal.shared_via_folder_message', { folder: folderName }, 'This note is already shared because it is located in the shared folder "{{folder}}".')
            : 'This note is already shared because it is located in the shared folder "' + folderName + '".';
    } else {
        p.textContent = window.t
            ? window.t('index.share_modal.shared_via_folder_message_generic', null, 'This note is already shared because it is located in a shared folder.')
            : 'This note is already shared because it is located in a shared folder.';
    }
    content.appendChild(p);

    const question = document.createElement('p');
    question.textContent = window.t
        ? window.t('index.share_modal.shared_via_folder_create_question', null, 'Do you want to also create a share link specific to this note, in addition to the folder share?')
        : 'Do you want to also create a share link specific to this note, in addition to the folder share?';
    content.appendChild(question);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons share-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = window.t ? window.t('common.cancel', null, 'Cancel') : 'Cancel';
    cancelBtn.onclick = function () { closeModal('sharedViaFolderModal'); };
    buttonsDiv.appendChild(cancelBtn);

    const viewSharesBtn = document.createElement('button');
    viewSharesBtn.type = 'button';
    viewSharesBtn.className = 'btn-view-shares';
    viewSharesBtn.textContent = window.t
        ? window.t('index.share_modal.shared_via_folder_view_shares', null, 'View shares')
        : 'View shares';
    viewSharesBtn.onclick = function () {
        closeModal('sharedViaFolderModal');
        // No itemType: land on the "All" tab of shared.php
        openSharedManagementPage({
            workspace: (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || '',
            autoEdit: false
        });
    };
    buttonsDiv.appendChild(viewSharesBtn);

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    // btn-primary: the green #shareModal .btn-create-share rule is scoped to
    // that modal, so the blue accent style applies here
    createBtn.className = 'btn-create-share btn-primary';
    createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create URL') : 'Create URL';
    createBtn.onclick = function () {
        closeModal('sharedViaFolderModal');
        createPublicShare(noteId);
    };
    buttonsDiv.appendChild(createBtn);

    content.appendChild(buttonsDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);
}

/**
 * Update the visual state of share icon in toolbar
 * @param {string} noteId - The note ID
 * @param {boolean} shared - Whether the note is shared
 */
function markShareIconShared(noteId, shared) {
    try {
        const shareButtons = document.querySelectorAll('.btn-publish');
        shareButtons.forEach(button => {
            // Check if this button's data-note-id matches
            const buttonNoteId = button.getAttribute('data-note-id');
            // Also check onclick for backward compatibility
            const onclick = button.getAttribute('onclick') || '';
            
            if (buttonNoteId === noteId || onclick.includes("openPublicShareModal('" + noteId + "')")) {
                if (shared) {
                    button.classList.add('is-shared');
                } else {
                    button.classList.remove('is-shared');
                }
            }
        });
    } catch (error) {
        console.error('Error marking share icon:', error);
    }
}

// ===========================
// Actions Menu Functions
// ===========================

let currentActionsMenuNoteId = null;
let isActionsMenuOpen = false;

/**
 * Toggle the actions menu for a note
 * @param {Event} event - The click event
 * @param {string} noteId - The note ID
 * @param {string} filename - The note filename (unused but kept for compatibility)
 * @param {string} titleJson - The note title JSON (unused but kept for compatibility)
 */
function toggleActionsMenu(event, noteId, filename, titleJson) {
    if (event) event.stopPropagation();
    currentActionsMenuNoteId = noteId;

    // Close other menus
    if (typeof closeSettingsMenus === 'function') closeSettingsMenus();
    if (typeof closeShareMenu === 'function') closeShareMenu();

    // Find the menu elements specific to this note
    const desktop = document.getElementById('actionsMenu-' + noteId);
    const mobile = document.getElementById('actionsMenuMobile-' + noteId);
    const activeMenu = desktop || mobile;

    if (!activeMenu) return;

    // Toggle off if already open for this note
    if (isActionsMenuOpen && currentActionsMenuNoteId === noteId) {
        closeActionsMenu();
        return;
    }

    // Close any other actions menus first
    const allMenus = document.querySelectorAll('.actions-menu');
    allMenus.forEach(menu => {
        menu.style.display = 'none';
        clearMenuPositioning(menu);
    });

    // Show the active menu
    activeMenu.style.display = 'block';

    // Position the menu if it's in a mobile container
    try {
        let triggerBtn = null;
        if (event && event.target) {
            triggerBtn = event.target.closest('.btn-actions');
        }
        if (!triggerBtn) {
            triggerBtn = document.querySelector('.btn-actions');
        }

        const isMobileDropdown = triggerBtn && 
            triggerBtn.closest('.actions-dropdown') && 
            triggerBtn.closest('.actions-dropdown').classList.contains('mobile');

        if (isMobileDropdown && triggerBtn) {
            positionMenuNearButton(activeMenu, triggerBtn);
        } else {
            // Desktop: ensure menu is positioned by CSS
            clearMenuPositioning(activeMenu);
        }
    } catch (error) {
        console.error('Error positioning actions menu:', error);
    }

    isActionsMenuOpen = true;
}

/**
 * Close all actions menus
 */
function closeActionsMenu() {
    const allMenus = document.querySelectorAll('.actions-menu');
    allMenus.forEach(menu => {
        menu.style.display = 'none';
        clearMenuPositioning(menu);
    });
    isActionsMenuOpen = false;
    currentActionsMenuNoteId = null;
}

// ===========================
// Folder Sharing Functions
// ===========================

/**
 * Create a public share link for a folder
 * @param {string} folderId - The folder ID
 */
async function createPublicFolderShare(folderId) {
    if (!folderId) return;

    try {
        // Gather optional parameters from modal inputs
        let customToken = '';
        try {
            const tokenInput = document.getElementById('shareFolderCustomToken');
            if (tokenInput && tokenInput.value) {
                customToken = tokenInput.value.trim();
            }
        } catch (error) {
            console.error('Error reading folder custom token:', error);
        }

        let indexable = 0;
        try {
            const indexableCheckbox = document.getElementById('shareFolderIndexable');
            if (indexableCheckbox && indexableCheckbox.checked) {
                indexable = 1;
            }
        } catch (error) {
            console.error('Error reading folder indexable setting:', error);
        }

        let password = '';
        try {
            const passwordInput = document.getElementById('shareFolderPassword');
            if (passwordInput && passwordInput.value) {
                password = passwordInput.value.trim();
            }
        } catch (error) {
            console.error('Error reading folder password:', error);
        }

        // Build request body
        const theme = (window.__poznoteUserStorage || localStorage).getItem('poznote-theme') || 'light';
        const requestBody = { theme: theme, indexable: indexable };
        if (customToken) requestBody.custom_token = customToken;
        if (password) requestBody.password = password;

        // Make API request
        const response = await fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.indexOf('application/json') !== -1) {
                const errorData = await response.json();
                throw new Error(errorData.error || ('Network response not ok: ' + response.status));
            }
            throw new Error('Network response not ok: ' + response.status);
        }

        const contentType = response.headers.get('content-type') || '';
        let data = null;
        if (contentType.indexOf('application/json') !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error('Unexpected response from server: ' + text);
        }

        if (data && data.url) {
            if (data.shared_notes_count && data.shared_notes_count > 0) {
                updateSharedCount(data.shared_notes_count);
            }

            if (typeof closeFolderActionsMenu === 'function') {
                closeFolderActionsMenu(folderId);
            }

            refreshNotesListAfterFolderAction(folderId);
            closeModal('folderShareModal');
            openSharedManagementPage({
                itemType: 'folder',
                itemId: folderId,
                token: extractShareTokenFromUrl(data.url),
                workspace: data.workspace || ''
            });
        }

    } catch (error) {
        console.error('Failed to create folder share:', error);
        alert('Failed to create public folder link: ' + error.message);
    }
}

/**
 * Get existing public share info for a folder
 * @param {string} folderId - The folder ID
 * @returns {Promise<Object>} Object with { shared: boolean, url?: string, workspace?: string }
 */
async function getPublicFolderShare(folderId) {
    try {
        const response = await fetch('/api/v1/folders/' + folderId + '/share', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) return { shared: false };

        const data = await response.json();
        if (data.success && data.public) {
            const preferredProtocol = getPreferredPublicUrlProtocol();
            return {
                shared: true,
                url: applyProtocolToPublicUrl(data.url, preferredProtocol),
                workspace: data.workspace
            };
        }
        return { shared: false };
    } catch (error) {
        console.error('Failed to get folder share status:', error);
        return { shared: false };
    }
}

/**
 * Open the share modal for a folder (checks existing share first)
 * @param {string} folderId - The folder ID
 */
async function openPublicFolderShareModal(folderId) {
    if (!folderId) return;

    const info = await getPublicFolderShare(folderId);

    // Already shared: managing an existing share happens on the shared page
    if (info.shared && info.url) {
        openSharedManagementPage({
            itemType: 'folder',
            itemId: folderId,
            token: extractShareTokenFromUrl(info.url),
            workspace: info.workspace,
            autoEdit: false
        });
        return;
    }

    showFolderShareModal({ folderId: folderId });
}

// Show the modal offering to create a public URL for a folder.
// Folders that are already shared are handled by the shared management page
// (see openPublicFolderShareModal), so this modal only covers the not-yet-shared case.
function showFolderShareModal(options) {
    const existing = document.getElementById('folderShareModal');
    if (existing) existing.parentNode.removeChild(existing);

    const modal = document.createElement('div');
    modal.id = 'folderShareModal';
    modal.className = 'modal share-modal';
    modal.style.display = 'flex';

    const content = document.createElement('div');
    content.className = 'modal-content share-modal-content';

    const h3 = document.createElement('h3');
    h3.textContent = window.t ? window.t('index.folder_share_modal.title', null, 'Public Folder URL') : 'Public Folder URL';
    content.appendChild(h3);

    const folderId = options && options.folderId ? options.folderId : null;

    const p = document.createElement('p');
    p.textContent = window.t
        ? window.t('index.folder_share_modal.create_description', null, 'A shared URL creates a public link to this folder. Once the URL is created, you will be able to add more options, such as protecting the folder with a password or customizing the share URL.')
        : 'A shared URL creates a public link to this folder. Once the URL is created, you will be able to add more options, such as protecting the folder with a password or customizing the share URL.';
    content.appendChild(p);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons share-modal-buttons';

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn-primary';
    createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create url') : 'Create url';
    createBtn.onclick = function () { createPublicFolderShare(folderId); };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = window.t ? window.t('common.cancel', null, 'Cancel') : 'Cancel';
    cancelBtn.onclick = function () { closeModal('folderShareModal'); };
    buttonsDiv.appendChild(cancelBtn);
    buttonsDiv.appendChild(createBtn);

    content.appendChild(buttonsDiv);

    modal.appendChild(content);
    document.body.appendChild(modal);
}

// ===========================
// Global API Exports
// ===========================

// Share menu functions
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;
window.getPublicShare = getPublicShare;
window.openPublicShareModal = openPublicShareModal;
window.markShareIconShared = markShareIconShared;

// Actions menu functions
window.toggleActionsMenu = toggleActionsMenu;
window.closeActionsMenu = closeActionsMenu;

// Folder sharing functions
window.createPublicFolderShare = createPublicFolderShare;
window.getPublicFolderShare = getPublicFolderShare;
window.openPublicFolderShareModal = openPublicFolderShareModal;
window.showFolderShareModal = showFolderShareModal;

// ===========================
// Event Listeners
// ===========================

// Close share menu when clicking outside
document.addEventListener('click', function (event) {
    if (!event.target.closest('.share-dropdown')) {
        closeShareMenu();
    }
});

// Close actions menu when clicking outside
document.addEventListener('click', function (event) {
    if (!event.target.closest('.actions-dropdown')) {
        closeActionsMenu();
    }
});

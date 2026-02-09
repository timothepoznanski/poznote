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

// Update the shared notes count in the sidebar
function updateSharedCount(delta) {
    const countEl = document.getElementById('count-shared');
    if (countEl) {
        // System folders display count without parentheses, e.g. "5" not "(5)"
        const currentCount = parseInt(countEl.textContent.trim(), 10) || 0;
        const newCount = Math.max(0, currentCount + delta);
        countEl.textContent = newCount.toString();
    }
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
function refreshNotesListAfterFolderAction() {
    if (typeof persistFolderStatesFromDOM === 'function') {
        persistFolderStatesFromDOM();
    }

    const url = new URL(window.location.href);

    fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
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

                    if (typeof window.reinitializeFavoritesToggle === 'function') {
                        window.reinitializeFavoritesToggle();
                    }

                    if (typeof window.refreshKanbanView === 'function') {
                        window.refreshKanbanView();
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
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();

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
        const theme = localStorage.getItem('poznote-theme') || 'light';
        const requestBody = { theme: theme, indexable: indexable };
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

            if (typeof showShareModal === 'function') {
                showShareModal(data.url, { 
                    noteId: noteId, 
                    shared: true, 
                    workspace: data.workspace || '' 
                });
            } else if (typeof showLinkModal === 'function') {
                showLinkModal(data.url, data.url, function () { });
            } else {
                window.prompt('Shared URL (read-only):', data.url);
            }
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

// ===========================
// Public URL Protocol Management
// ===========================

/**
 * Get the user's preferred protocol (http or https) for public URLs
 * @returns {string} 'http' or 'https' (default: 'https')
 */
function getPreferredPublicUrlProtocol() {
    try {
        const protocol = localStorage.getItem('poznote-public-url-protocol');
        if (protocol === 'http' || protocol === 'https') {
            return protocol;
        }
    } catch (error) {
        console.error('Error reading protocol preference:', error);
    }
    return 'https';
}

/**
 * Set the user's preferred protocol for public URLs
 * @param {string} protocol - Either 'http' or 'https'
 */
function setPreferredPublicUrlProtocol(protocol) {
    try {
        if (protocol === 'http' || protocol === 'https') {
            localStorage.setItem('poznote-public-url-protocol', protocol);
        }
    } catch (error) {
        console.error('Error saving protocol preference:', error);
    }
}

/**
 * Apply a protocol to a public URL
 * @param {string} url - The URL to modify
 * @param {string} protocol - Either 'http' or 'https'
 * @returns {string} The URL with the specified protocol
 */
function applyProtocolToPublicUrl(url, protocol) {
    if (!url) return url;
    if (protocol !== 'http' && protocol !== 'https') return url;

    // Replace existing protocol
    if (/^https?:\/\//i.test(url)) {
        return protocol + '://' + url.replace(/^https?:\/\//i, '');
    }
    // Add protocol if URL starts with //
    if (/^\/\//.test(url)) {
        return protocol + ':' + url;
    }
    return url;
}

// ===========================
// Share Modal Display
// ===========================

/**
 * Show a modal with the public URL and appropriate buttons
 * @param {string} url - The public URL (or empty string if not shared yet)
 * @param {Object} options - Modal options
 * @param {string} options.noteId - The note ID
 * @param {boolean} options.shared - Whether the note is already shared
 * @param {string} options.workspace - The workspace name
 */
function showShareModal(url, options) {
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

    const h3 = document.createElement('h3');
    h3.textContent = window.t ? window.t('index.public_modal.title', null, 'Shared URL') : 'Shared URL';
    content.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = '';
    content.appendChild(p);

    // Show the full URL as plain, non-selectable text (no input frame)
    const urlDiv = document.createElement('div');
    urlDiv.id = 'shareModalUrl';
    urlDiv.className = 'share-url';
    const preferredProto = getPreferredPublicUrlProtocol();
    urlDiv.textContent = applyProtocolToPublicUrl(url, preferredProto);
    content.appendChild(urlDiv);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons share-modal-buttons';

    // Get options
    const noteId = options && options.noteId ? options.noteId : null;
    const isShared = options && options.shared ? true : false;
    const noteWorkspace = options && options.workspace ? options.workspace : '';

    // Conditionally add buttons based on share status
    if (isShared) {
        // Protocol toggle (default: HTTPS)
        const protocolWrap = document.createElement('div');
        protocolWrap.className = 'share-protocol-wrap';
        const protocolLabel = document.createElement('label');
        protocolLabel.className = 'share-indexable-label';
        const protocolText = document.createElement('span');
        protocolText.className = 'indexable-label-text';
        protocolText.textContent = 'HTTPS';

        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'toggle-switch';
        const protocolCheckbox = document.createElement('input');
        protocolCheckbox.type = 'checkbox';
        protocolCheckbox.id = 'shareProtocolHttps';
        protocolCheckbox.checked = (preferredProto === 'https');
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggleSwitch.appendChild(protocolCheckbox);
        toggleSwitch.appendChild(slider);

        protocolLabel.appendChild(protocolText);
        protocolLabel.appendChild(toggleSwitch);
        protocolWrap.appendChild(protocolLabel);
        // Place the toggle above the URL (URL spacing stays consistent)
        content.insertBefore(protocolWrap, urlDiv);

        protocolCheckbox.addEventListener('change', function () {
            const nextProto = protocolCheckbox.checked ? 'https' : 'http';
            setPreferredPublicUrlProtocol(nextProto);
            urlDiv.textContent = applyProtocolToPublicUrl(urlDiv.textContent, nextProto);
        });

        // If shared, show Open, Copy, Revoke, Renew
        // Open button: opens the URL in a new tab (keeps modal open)
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn-open';
        openBtn.textContent = window.t ? window.t('index.public_modal.open', null, 'Open') : 'Open';
        // styling handled by CSS classes
        openBtn.onclick = function (ev) {
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
            // Read the current URL from the modal each time so Renew updates are respected
            try {
                const urlEl = document.getElementById('shareModalUrl');
                const currentUrl = urlEl ? urlEl.textContent : url;
                if (currentUrl) {
                    window.open(currentUrl, '_blank', 'noopener');
                }
            } catch (e) {
                // fallback to original captured url
                if (url) window.open(url, '_blank', 'noopener');
            }
        };
        buttonsDiv.appendChild(openBtn);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-primary';
        copyBtn.textContent = window.t ? window.t('index.public_modal.copy', null, 'Copy') : 'Copy';
        copyBtn.onclick = async function (ev) {
            // Prevent clicks from bubbling to global handlers
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }

            // Try to copy the URL, then close the modal. Do NOT change the button text.
            try {
                // Copy from the div's text content (non-selectable but programmatically copyable)
                await navigator.clipboard.writeText(urlDiv.textContent);
                closeModal('shareModal');
            } catch (e) {
                // Fallback: create a temporary textarea, select and execCommand, then remove it
                try {
                    const ta = document.createElement('textarea');
                    ta.value = urlDiv.textContent;
                    // Ensure off-screen and not visible
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    closeModal('shareModal');
                } catch (err) {
                    // As last resort, show the prompt then close
                    window.prompt('Copy this URL', urlDiv.textContent);
                    closeModal('shareModal');
                }
            }
        };
        buttonsDiv.appendChild(copyBtn);

        // Add Edit button to open shared.php filtered by this token
        if (noteId) {
            const manageBtn = document.createElement('button');
            manageBtn.type = 'button';
            manageBtn.className = 'btn-primary';
            manageBtn.textContent = window.t ? window.t('index.public_modal.manage', null, 'Edit') : 'Edit';
            manageBtn.onclick = function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                // Extract token from URL (last part after /)
                const token = decodeURIComponent(url.split('/').pop());
                if (token) {
                    let sharedUrl = 'shared.php?filter=' + encodeURIComponent(token);
                    if (noteWorkspace) {
                        sharedUrl += '&workspace=' + encodeURIComponent(noteWorkspace);
                    }
                    window.open(sharedUrl, '_blank');
                }
            };
            buttonsDiv.appendChild(manageBtn);
        }

        // Add Revoke and Renew buttons when options.noteId provided and shared
        if (noteId) {
            const renewBtn = document.createElement('button');
            renewBtn.type = 'button';
            renewBtn.className = 'btn-renew';
            renewBtn.textContent = window.t ? window.t('index.public_modal.renew', null, 'Renew') : 'Renew';
            // styling handled by CSS classes
            renewBtn.onclick = async function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                try {
                    // Get current theme from localStorage
                    const theme = localStorage.getItem('poznote-theme') || 'light';
                    const resp = await fetch('/api/v1/notes/' + noteId + '/share', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ theme: theme })
                    });
                    if (resp.ok) {
                        const ct = resp.headers.get('content-type') || '';
                        if (ct.indexOf('application/json') !== -1) {
                            const j = await resp.json();
                            if (j && j.url) {
                                const nextDisplayUrl = applyProtocolToPublicUrl(j.url, getPreferredPublicUrlProtocol());
                                // Update displayed URL and workspace
                                const urlDivEl = document.getElementById('shareModalUrl');
                                if (urlDivEl) urlDivEl.textContent = nextDisplayUrl;
                                // Update the workspace variable in modal closure
                                if (j.workspace !== undefined) {
                                    // We need to recreate the modal with updated workspace
                                    closeModal('shareModal');
                                    showShareModal(j.url, { noteId: noteId, shared: true, workspace: j.workspace });
                                }
                                markShareIconShared(noteId, true);
                            }
                        }
                    } else {
                        showNotificationPopup && showNotificationPopup('Failed to renew share', 'error');
                    }
                } catch (e) {
                    showNotificationPopup && showNotificationPopup('Network error: ' + e.message, 'error');
                }
            };
            buttonsDiv.appendChild(renewBtn);

            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'btn-cancel';
            revokeBtn.textContent = window.t ? window.t('index.public_modal.revoke', null, 'Revoke') : 'Revoke';
            // styling handled by CSS classes
            revokeBtn.onclick = async function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                // Call API to revoke
                try {
                    const resp = await fetch('/api/v1/notes/' + noteId + '/share', {
                        method: 'DELETE',
                        credentials: 'same-origin',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (resp.ok) {
                        markShareIconShared(noteId, false);
                        updateSharedCount(-1);
                        closeModal('shareModal');
                    } else {
                        const ct = resp.headers.get('content-type') || '';
                        let err = 'Failed to revoke';
                        if (ct.indexOf('application/json') !== -1) {
                            const j = await resp.json();
                            err = j.error || err;
                        }
                        showNotificationPopup && showNotificationPopup(err, 'error');
                    }
                } catch (e) {
                    showNotificationPopup && showNotificationPopup('Network error: ' + e.message, 'error');
                }
            };
            buttonsDiv.appendChild(revokeBtn);

            // Create Close button for shared notes
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-cancel';
            cancelBtn.textContent = window.t ? window.t('index.public_modal.close', null, 'Close') : 'Close';
            cancelBtn.onclick = function () { closeModal('shareModal'); };
            buttonsDiv.appendChild(cancelBtn);
        }
    } else {
        // If not shared, show Create button
        // Add an optional input for a custom slug/token
        const inputWrap = document.createElement('div');
        inputWrap.className = 'share-custom-wrap';
        const label = document.createElement('label');
        const labelText = window.t ? window.t('index.share_modal.custom_token', null, 'Custom token (optional)') : 'Custom token (optional)';
        // Split label to make "(optional)" red
        const labelParts = labelText.match(/^(.+?)(\(.*?\))$/);
        if (labelParts) {
            label.innerHTML = labelParts[1] + '<span class="optional-text">' + labelParts[2] + '</span>';
        } else {
            label.textContent = labelText;
        }
        label.className = 'share-custom-label';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'shareCustomToken';
        input.placeholder = window.t ? window.t('index.share_modal.custom_token_placeholder', null, 'my_custom_token-1') : 'my_custom_token-1';
        input.className = 'share-custom-input';
        inputWrap.appendChild(label);
        inputWrap.appendChild(input);
        content.appendChild(inputWrap);

        // Add password input
        const passwordWrap = document.createElement('div');
        passwordWrap.className = 'share-password-wrap';
        const passwordLabel = document.createElement('label');
        const passwordLabelText = window.t ? window.t('index.share_modal.password', null, 'Password (optional)') : 'Password (optional)';
        const passwordLabelParts = passwordLabelText.match(/^(.+?)(\(.*?\))$/);
        if (passwordLabelParts) {
            passwordLabel.innerHTML = passwordLabelParts[1] + '<span class="optional-text">' + passwordLabelParts[2] + '</span>';
        } else {
            passwordLabel.textContent = passwordLabelText;
        }
        passwordLabel.className = 'share-password-label';
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'sharePassword';
        passwordInput.placeholder = window.t ? window.t('index.share_modal.password_placeholder', null, 'Enter a password') : 'Enter a password';
        passwordInput.className = 'share-password-input';
        passwordWrap.appendChild(passwordLabel);
        passwordWrap.appendChild(passwordInput);
        content.appendChild(passwordWrap);

        // Add indexable toggle
        const indexableWrap = document.createElement('div');
        indexableWrap.className = 'share-indexable-wrap';
        const indexableLabel = document.createElement('label');
        indexableLabel.className = 'share-indexable-label';
        const indexableText = document.createElement('span');
        indexableText.textContent = window.t ? window.t('index.share_modal.indexable', null, 'Allow search engine indexing') : 'Allow search engine indexing';
        indexableText.className = 'indexable-label-text';
        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'toggle-switch';
        const indexableCheckbox = document.createElement('input');
        indexableCheckbox.type = 'checkbox';
        indexableCheckbox.id = 'shareIndexable';
        indexableCheckbox.className = 'share-indexable-checkbox';
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggleSwitch.appendChild(indexableCheckbox);
        toggleSwitch.appendChild(slider);
        indexableLabel.appendChild(indexableText);
        indexableLabel.appendChild(toggleSwitch);
        indexableWrap.appendChild(indexableLabel);
        content.appendChild(indexableWrap);

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'btn-create-share';
        createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create url') : 'Create url';
        // create button styled via CSS class
        createBtn.onclick = function () { createPublicShare(noteId); };
        buttonsDiv.appendChild(createBtn);

        // Create Close button for non-shared notes
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = window.t ? window.t('index.share_modal.close', null, 'Close') : 'Close';
        cancelBtn.onclick = function () { closeModal('shareModal'); };
        buttonsDiv.appendChild(cancelBtn);
    }

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
                workspace: data.workspace || '' 
            };
        }
        return { shared: false };
    } catch (error) {
        console.error('Error getting public share:', error);
        return { shared: false };
    }
}

/**
 * Open the share modal for a note (checks existing share first)
 * @param {string} noteId - The note ID
 */
async function openPublicShareModal(noteId) {
    if (!noteId) return;
    
    const shareInfo = await getPublicShare(noteId);
    if (shareInfo.shared && shareInfo.url) {
        markShareIconShared(noteId, true);
        showShareModal(shareInfo.url, { 
            noteId: noteId, 
            shared: true, 
            workspace: shareInfo.workspace 
        });
    } else {
        showShareModal('', { noteId: noteId, shared: false });
    }
}

/**
 * Update the visual state of share icon in toolbar
 * @param {string} noteId - The note ID
 * @param {boolean} shared - Whether the note is shared
 */
function markShareIconShared(noteId, shared) {
    try {
        const shareButtons = document.querySelectorAll('.btn-share');
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
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
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
        const theme = localStorage.getItem('poznote-theme') || 'light';
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
            if (typeof showFolderShareModal === 'function') {
                showFolderShareModal(data.url, { 
                    folderId: folderId, 
                    shared: true, 
                    workspace: data.workspace || '' 
                });
            }

            if (data.shared_notes_count && data.shared_notes_count > 0) {
                updateSharedCount(data.shared_notes_count);
            }

            if (typeof closeFolderActionsMenu === 'function') {
                closeFolderActionsMenu(folderId);
            }

            refreshNotesListAfterFolderAction(folderId);
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
    if (info.shared && info.url) {
        showFolderShareModal(info.url, { folderId: folderId, shared: true, workspace: info.workspace });
    } else {
        showFolderShareModal('', { folderId: folderId, shared: false });
    }
}

// Show folder share modal (similar to note share modal)
function showFolderShareModal(url, options) {
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

    const p = document.createElement('p');
    p.textContent = window.t ? window.t('index.folder_share_modal.description', null, 'Anyone with this link can view all notes in this folder.') : 'Anyone with this link can view all notes in this folder.';
    content.appendChild(p);

    const folderId = options && options.folderId ? options.folderId : null;
    const shared = options && options.shared;
    const folderWorkspace = options && options.workspace ? options.workspace : '';

    // Show the full URL as plain text
    const urlDiv = document.createElement('div');
    urlDiv.id = 'folderShareModalUrl';
    urlDiv.className = 'share-url';
    const preferredProto = getPreferredPublicUrlProtocol();
    if (url) {
        urlDiv.textContent = applyProtocolToPublicUrl(url, preferredProto);
    }
    content.appendChild(urlDiv);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons share-modal-buttons';

    if (shared && url) {
        // Protocol toggle for shared folders
        const protocolWrap = document.createElement('div');
        protocolWrap.className = 'share-protocol-wrap';
        const protocolLabel = document.createElement('label');
        protocolLabel.className = 'share-indexable-label';
        const protocolText = document.createElement('span');
        protocolText.className = 'indexable-label-text';
        protocolText.textContent = window.t ? window.t('index.folder_share_modal.use_https', null, 'HTTPS') : 'HTTPS';
        const toggleSwitch = document.createElement('label');
        toggleSwitch.className = 'toggle-switch';
        const protocolCheckbox = document.createElement('input');
        protocolCheckbox.type = 'checkbox';
        protocolCheckbox.id = 'folderProtocolToggle';
        protocolCheckbox.checked = preferredProto === 'https';
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        toggleSwitch.appendChild(protocolCheckbox);
        toggleSwitch.appendChild(slider);
        protocolLabel.appendChild(protocolText);
        protocolLabel.appendChild(toggleSwitch);
        protocolWrap.appendChild(protocolLabel);
        content.insertBefore(protocolWrap, urlDiv);

        protocolCheckbox.addEventListener('change', function () {
            const nextProto = protocolCheckbox.checked ? 'https' : 'http';
            setPreferredPublicUrlProtocol(nextProto);
            urlDiv.textContent = applyProtocolToPublicUrl(urlDiv.textContent, nextProto);
        });

        // Open button
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn-open';
        openBtn.textContent = window.t ? window.t('index.public_modal.open', null, 'Open') : 'Open';
        openBtn.onclick = function () {
            const currentUrl = urlDiv.textContent;
            if (currentUrl) window.open(currentUrl, '_blank', 'noopener');
        };
        buttonsDiv.appendChild(openBtn);

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-primary';
        copyBtn.textContent = window.t ? window.t('index.public_modal.copy', null, 'Copy') : 'Copy';
        copyBtn.onclick = async function (ev) {
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
            try {
                await navigator.clipboard.writeText(urlDiv.textContent);
            } catch (e) {
                console.error('Failed to copy:', e);
            }
        };
        buttonsDiv.appendChild(copyBtn);

        // Add Edit button to open list_shared_folders.php filtered by this token
        if (folderId) {
            const manageBtn = document.createElement('button');
            manageBtn.type = 'button';
            manageBtn.className = 'btn-primary';
            manageBtn.textContent = window.t ? window.t('index.public_modal.manage', null, 'Edit') : 'Edit';
            manageBtn.onclick = function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                // Extract token from URL (last part after /)
                const token = url.split('/').pop();
                if (token) {
                    let sharedUrl = 'list_shared_folders.php?filter=' + encodeURIComponent(token);
                    if (folderWorkspace) {
                        sharedUrl += '&workspace=' + encodeURIComponent(folderWorkspace);
                    }
                    window.open(sharedUrl, '_blank');
                }
            };
            buttonsDiv.appendChild(manageBtn);
        }

        // Renew button
        if (folderId) {
            const renewBtn = document.createElement('button');
            renewBtn.type = 'button';
            renewBtn.className = 'btn-primary';
            renewBtn.textContent = window.t ? window.t('index.public_modal.renew', null, 'Renew') : 'Renew';
            renewBtn.onclick = async function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                try {
                    const resp = await fetch('/api/v1/folders/' + folderId + '/share', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({})
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.url) {
                            const nextDisplayUrl = applyProtocolToPublicUrl(data.url, getPreferredPublicUrlProtocol());
                            // Update displayed URL
                            const urlDivEl = document.getElementById('folderShareModalUrl');
                            if (urlDivEl) urlDivEl.textContent = nextDisplayUrl;
                            // Update the workspace if needed
                            if (data.workspace !== undefined) {
                                // Recreate the modal with updated workspace
                                closeModal('folderShareModal');
                                showFolderShareModal(data.url, { folderId: folderId, shared: true, workspace: data.workspace });
                            }
                        }
                    } else {
                        const msg = window.t ? window.t('index.folder_share_modal.failed_renew', null, 'Failed to renew folder share') : 'Failed to renew folder share';
                        if (typeof showNotificationPopup === 'function') {
                            showNotificationPopup(msg, 'error');
                        } else {
                            alert(msg);
                        }
                    }
                } catch (e) {
                    console.error('Failed to renew folder share:', e);
                    const msg = window.t ? window.t('index.folder_share_modal.failed_renew', null, 'Failed to renew folder share') : 'Failed to renew folder share';
                    if (typeof showNotificationPopup === 'function') {
                        showNotificationPopup('Network error: ' + e.message, 'error');
                    } else {
                        alert(msg);
                    }
                }
            };
            buttonsDiv.appendChild(renewBtn);
        }

        // Revoke button
        if (folderId) {
            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'btn-cancel';
            revokeBtn.textContent = window.t ? window.t('index.public_modal.revoke', null, 'Revoke') : 'Revoke';
            revokeBtn.onclick = async function (ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) { }
                try {
                    const resp = await fetch('/api/v1/folders/' + folderId + '/share', {
                        method: 'DELETE',
                        credentials: 'same-origin',
                        headers: { 'Accept': 'application/json' }
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        // Update shared count (negative delta for unshared notes)
                        if (data.unshared_notes_count && typeof updateSharedCount === 'function') {
                            updateSharedCount(-data.unshared_notes_count);
                        }
                        // Refresh the notes list to update folder actions menu
                        refreshNotesListAfterFolderAction();
                        closeModal('folderShareModal');
                    } else {
                        const msg = window.t ? window.t('index.folder_share_modal.failed_revoke', null, 'Failed to revoke folder share') : 'Failed to revoke folder share';
                        alert(msg);
                    }
                } catch (e) {
                    console.error('Failed to revoke:', e);
                    const msg = window.t ? window.t('index.folder_share_modal.failed_revoke', null, 'Failed to revoke folder share') : 'Failed to revoke folder share';
                    alert(msg);
                }
            };
            buttonsDiv.appendChild(revokeBtn);
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-secondary';
        closeBtn.textContent = window.t ? window.t('index.public_modal.close', null, 'Close') : 'Close';
        closeBtn.onclick = function () { closeModal('folderShareModal'); };
        buttonsDiv.appendChild(closeBtn);

        content.appendChild(buttonsDiv);
    } else {
        // Not shared - show create button
        const inputWrap = document.createElement('div');
        inputWrap.className = 'share-custom-wrap';
        const label = document.createElement('label');
        const labelText = window.t ? window.t('index.share_modal.custom_token', null, 'Custom token (optional)') : 'Custom token (optional)';
        label.innerHTML = labelText.replace('(optional)', '<span class="optional-red">(optional)</span>');
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'shareFolderCustomToken';
        input.placeholder = 'my-folder-link';
        inputWrap.appendChild(label);
        inputWrap.appendChild(input);
        content.appendChild(inputWrap);

        // Indexable checkbox
        const indexableWrap = document.createElement('div');
        indexableWrap.className = 'share-indexable-wrap';
        const indexableLabel = document.createElement('label');
        const indexableCheckbox = document.createElement('input');
        indexableCheckbox.type = 'checkbox';
        indexableCheckbox.id = 'shareFolderIndexable';
        indexableLabel.appendChild(indexableCheckbox);
        const indexableText = document.createTextNode(' ' + (window.t ? window.t('index.share_modal.indexable', null, 'Allow search engines') : 'Allow search engines'));
        indexableLabel.appendChild(indexableText);
        indexableWrap.appendChild(indexableLabel);
        content.appendChild(indexableWrap);

        // Password field
        const passwordWrap = document.createElement('div');
        passwordWrap.className = 'share-password-wrap';
        const passwordLabel = document.createElement('label');
        passwordLabel.textContent = window.t ? window.t('index.share_modal.password', null, 'Password (optional)') : 'Password (optional)';
        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.id = 'shareFolderPassword';
        passwordInput.placeholder = window.t ? window.t('index.share_modal.password_placeholder', null, 'Enter password') : 'Enter password';
        passwordWrap.appendChild(passwordLabel);
        passwordWrap.appendChild(passwordInput);
        content.appendChild(passwordWrap);

        // Create button
        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'btn-primary';
        createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create url') : 'Create url';
        createBtn.onclick = function () { createPublicFolderShare(folderId); };
        buttonsDiv.appendChild(createBtn);

        // Cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-cancel';
        cancelBtn.textContent = window.t ? window.t('index.share_modal.close', null, 'Close') : 'Close';
        cancelBtn.onclick = function () { closeModal('folderShareModal'); };
        buttonsDiv.appendChild(cancelBtn);

        content.appendChild(buttonsDiv);
    }

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

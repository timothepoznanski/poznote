// Share / Export menu functionality
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

// Refresh notes list after folder action (share/revoke)
function refreshNotesListAfterFolderAction() {
    if (typeof persistFolderStatesFromDOM === 'function') {
        persistFolderStatesFromDOM();
    }

    const url = new URL(window.location.href);

    fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (response) { return response.text(); })
        .then(function (html) {
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

                    // Reinitialize drag and drop events for notes
                    if (typeof setupNoteDragDropEvents === 'function') {
                        setupNoteDragDropEvents();
                    }

                    if (typeof restoreFolderStates === 'function') {
                        restoreFolderStates();
                    }

                    // Refresh Kanban view if it's currently active
                    if (typeof window.refreshKanbanView === 'function') {
                        window.refreshKanbanView();
                    }
                } catch (error) {
                    console.error('Error reinitializing after folder action:', error);
                }
            }
        })
        .catch(function (err) {
            console.log('Error during refresh:', err);
        });
}

function toggleShareMenu(event, noteId, filename, titleJson) {
    if (event) event.stopPropagation();
    currentShareMenuNoteId = noteId;

    // Close other menus (guard with typeof to avoid ReferenceError if not present)
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();

    // Find the menu elements specific to this note
    const desktop = document.getElementById('shareMenu-' + noteId);
    const mobile = document.getElementById('shareMenuMobile-' + noteId);
    const activeMenu = desktop || mobile;

    if (!activeMenu) return;

    if (isShareMenuOpen && currentShareMenuNoteId === noteId) {
        closeShareMenu();
        return;
    }

    // Close any other share menus first and clear their inline positioning
    const all = document.querySelectorAll('.share-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // remove any inline positioning we may have added earlier
        el.style.removeProperty('position');
        el.style.removeProperty('left');
        el.style.removeProperty('right');
        el.style.removeProperty('top');
        el.style.removeProperty('bottom');
        el.style.removeProperty('transform');
        el.style.removeProperty('margin-top');
        el.style.removeProperty('z-index');
        el.style.removeProperty('box-shadow');
    });

    // Show the active menu
    activeMenu.style.display = 'block';

    // If this share dropdown is inside a mobile container, position it near the button
    try {
        // Find the triggering button: prefer the event target's closest element with data-note-id
        let triggerBtn = null;
        if (event && event.target) triggerBtn = event.target.closest('[data-note-id]');
        if (!triggerBtn) triggerBtn = document.querySelector('[data-note-id="' + noteId + '"]');

        const isMobileDropdown = !!triggerBtn && !!triggerBtn.closest && triggerBtn.closest('.share-dropdown') && triggerBtn.closest('.share-dropdown').classList.contains('mobile');

        if (isMobileDropdown && triggerBtn) {
            // Force fixed positioning placed near the button. Use important priority to override stylesheet !important rules.
            const rect = triggerBtn.getBoundingClientRect();

            // Make menu invisible but displayed to measure height
            activeMenu.style.visibility = 'hidden';
            activeMenu.style.display = 'block';

            // Ensure any previous important declarations are cleared
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');

            // Apply fixed positioning with important priority
            activeMenu.style.setProperty('position', 'fixed', 'important');
            // center horizontally on the button
            const centerX = rect.left + rect.width / 2;
            activeMenu.style.setProperty('left', centerX + 'px', 'important');
            activeMenu.style.setProperty('transform', 'translateX(-50%)', 'important');
            activeMenu.style.setProperty('margin-top', '0', 'important');
            activeMenu.style.setProperty('z-index', '20000', 'important');
            activeMenu.style.setProperty('box-shadow', '0 8px 24px rgba(0,0,0,0.18)', 'important');

            // Compute space and place above by default
            const menuHeight = activeMenu.getBoundingClientRect().height || activeMenu.offsetHeight || 0;
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            let topPos = rect.top - menuHeight - 8; // 8px gap
            if (topPos < 8 && spaceBelow > spaceAbove) {
                // Not enough space above -> place below the button
                topPos = rect.bottom + 8;
            }
            activeMenu.style.setProperty('top', Math.max(8, topPos) + 'px', 'important');
            // ensure bottom is unset
            activeMenu.style.setProperty('bottom', 'auto', 'important');

            // restore visibility
            activeMenu.style.visibility = '';
        } else {
            // Desktop/default behavior: ensure menu is positioned by CSS (absolute)
            // Remove any leftover important positioning
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');
            activeMenu.style.removeProperty('z-index');
        }
    } catch (e) {
        // If anything fails while computing position, fallback to default display
        console.error('Error positioning share menu:', e);
    }

    isShareMenuOpen = true;
    currentShareMenuNoteId = noteId;
}

function closeShareMenu() {
    // Hide all share menus
    const all = document.querySelectorAll('.share-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // Remove any inline styles we added for mobile positioning (including important ones)
        try {
            el.style.removeProperty('position');
            el.style.removeProperty('left');
            el.style.removeProperty('right');
            el.style.removeProperty('top');
            el.style.removeProperty('bottom');
            el.style.removeProperty('transform');
            el.style.removeProperty('margin-top');
            el.style.removeProperty('z-index');
            el.style.removeProperty('box-shadow');
            el.style.visibility = '';
        } catch (e) {
            // ignore
        }
    });
    isShareMenuOpen = false;
    currentShareMenuNoteId = null;
}

// Create a public share by calling the server API and show the returned URL in a link modal
async function createPublicShare(noteId) {
    if (!noteId) return;

    try {
        // If modal has a custom token input, include it
        let customToken = '';
        try {
            const el = document.getElementById('shareCustomToken');
            if (el && el.value) customToken = el.value.trim();
        } catch (e) { }

        // Get indexable checkbox value
        let indexable = 0;
        try {
            const indexableEl = document.getElementById('shareIndexable');
            if (indexableEl && indexableEl.checked) indexable = 1;
        } catch (e) { }

        // Get password value
        let password = '';
        try {
            const passwordEl = document.getElementById('sharePassword');
            if (passwordEl && passwordEl.value) password = passwordEl.value.trim();
        } catch (e) { }

        const theme = localStorage.getItem('poznote-theme') || 'light';
        const body = { theme: theme, indexable: indexable };
        if (customToken) body.custom_token = customToken;
        if (password) body.password = password;

        const resp = await fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'POST',
            credentials: 'same-origin', // send session cookie
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            // Try to read JSON error if any
            const ct = resp.headers.get('content-type') || '';
            if (ct.indexOf('application/json') !== -1) {
                const errBody = await resp.json();
                throw new Error(errBody.error || ('Network response not ok: ' + resp.status));
            }
            throw new Error('Network response not ok: ' + resp.status);
        }

        // Parse JSON only when content-type says so
        const ct2 = resp.headers.get('content-type') || '';
        let data = null;
        if (ct2.indexOf('application/json') !== -1) {
            data = await resp.json();
        } else {
            // Unexpected non-json response
            const text = await resp.text();
            throw new Error('Unexpected response from server: ' + text);
        }

        if (data && data.url) {
            // Update toolbar icon to indicate shared state
            markShareIconShared(noteId, true);
            updateSharedCount(1);

            // Use a dedicated share modal (copy + cancel + revoke/renew)
            if (typeof showShareModal === 'function') {
                showShareModal(data.url, { noteId: noteId, shared: true, workspace: data.workspace || '' });
            } else if (typeof showLinkModal === 'function') {
                showLinkModal(data.url, data.url, function () { });
            } else {
                // Fallback: prompt
                window.prompt('Shared URL (read-only):', data.url);
            }
        } else if (data && data.error) {
            showNotificationPopup && showNotificationPopup((window.t ? window.t('index.share_modal.error_prefix', null, 'Error: ') : 'Error: ') + data.error, 'error');
        } else {
            showNotificationPopup && showNotificationPopup(window.t ? window.t('index.share_modal.unknown_error', null, 'Unknown error creating public share') : 'Unknown error creating public share', 'error');
        }
    } catch (err) {
        console.error('Error creating public share:', err);
        showNotificationPopup && showNotificationPopup((window.t ? window.t('index.share_modal.error_creating', null, 'Error creating public share: ') : 'Error creating public share: ') + err.message, 'error');
    }
}

function getPreferredPublicUrlProtocol() {
    try {
        const v = localStorage.getItem('poznote-public-url-protocol');
        if (v === 'http' || v === 'https') return v;
    } catch (e) {
        // ignore
    }
    return 'https';
}

function setPreferredPublicUrlProtocol(protocol) {
    try {
        if (protocol === 'http' || protocol === 'https') {
            localStorage.setItem('poznote-public-url-protocol', protocol);
        }
    } catch (e) {
        // ignore
    }
}

function applyProtocolToPublicUrl(url, protocol) {
    if (!url) return url;
    if (protocol !== 'http' && protocol !== 'https') return url;

    if (/^https?:\/\//i.test(url)) {
        return protocol + '://' + url.replace(/^https?:\/\//i, '');
    }
    if (/^\/\//.test(url)) {
        return protocol + ':' + url;
    }
    return url;
}

// Close share menu when clicking elsewhere
document.addEventListener('click', function (e) {
    if (!e.target.closest('.share-dropdown')) {
        closeShareMenu();
    }
});

// Close actions menu when clicking elsewhere
document.addEventListener('click', function (e) {
    if (!e.target.closest('.actions-dropdown')) {
        closeActionsMenu();
    }
});

// Show a simple modal with the public URL and Copy / Cancel buttons (English)
// showShareModal can accept either just url or (url, options)
// options: { noteId: string, shared: boolean, workspace: string }
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

    // Do not auto-focus or select the URL — user requested no automatic highlighting
}

// Expose functions globally
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;

// Get existing public share for a note (returns {shared: bool, url?: string, workspace?: string})
async function getPublicShare(noteId) {
    if (!noteId) return { shared: false };
    try {
        const resp = await fetch('/api/v1/notes/' + noteId + '/share', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) return { shared: false };
        const ct = resp.headers.get('content-type') || '';
        if (ct.indexOf('application/json') === -1) return { shared: false };
        const j = await resp.json();
        if (j && j.url) return { shared: true, url: j.url, workspace: j.workspace || '' };
        return { shared: false };
    } catch (e) {
        return { shared: false };
    }
}

// Open the share modal for a note without automatically creating a new share.
// If no share exists, modal will include a Create button via createPublicShare
async function openPublicShareModal(noteId) {
    if (!noteId) return;
    // Fetch existing share
    const info = await getPublicShare(noteId);
    if (info.shared && info.url) {
        markShareIconShared(noteId, true);
        showShareModal(info.url, { noteId: noteId, shared: true, workspace: info.workspace });
    } else {
        // Show modal with no url and a Create button
        showShareModal('', { noteId: noteId, shared: false });
    }
}

// Toggle visual state of share icon in toolbar
function markShareIconShared(noteId, shared) {
    try {
        const sel = document.querySelectorAll('.btn-share');
        sel.forEach(btn => {
            // Check if this button's onclick contains the noteId
            const onclick = btn.getAttribute('onclick') || '';
            if (onclick.includes("openPublicShareModal('" + noteId + "')")) {
                if (shared) {
                    btn.classList.add('is-shared');
                } else {
                    btn.classList.remove('is-shared');
                }
            }
        });
    } catch (e) {
        // ignore
    }
}

window.getPublicShare = getPublicShare;
window.openPublicShareModal = openPublicShareModal;
window.markShareIconShared = markShareIconShared;

// Actions menu functionality
let currentActionsMenuNoteId = null;
let isActionsMenuOpen = false;

function toggleActionsMenu(event, noteId, filename, titleJson) {
    if (event) event.stopPropagation();
    currentActionsMenuNoteId = noteId;

    // Close other menus (guard with typeof to avoid ReferenceError if not present)
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();
    if (typeof closeShareMenu === 'function') closeShareMenu();

    // Find the menu elements specific to this note
    const desktop = document.getElementById('actionsMenu-' + noteId);
    const mobile = document.getElementById('actionsMenuMobile-' + noteId);
    const activeMenu = desktop || mobile;

    if (!activeMenu) return;

    if (isActionsMenuOpen && currentActionsMenuNoteId === noteId) {
        closeActionsMenu();
        return;
    }

    // Close any other actions menus first and clear their inline positioning
    const all = document.querySelectorAll('.actions-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // remove any inline positioning we may have added earlier
        el.style.removeProperty('position');
        el.style.removeProperty('left');
        el.style.removeProperty('right');
        el.style.removeProperty('top');
        el.style.removeProperty('bottom');
        el.style.removeProperty('transform');
        el.style.removeProperty('margin-top');
        el.style.removeProperty('z-index');
        el.style.removeProperty('box-shadow');
    });

    // Show the active menu
    activeMenu.style.display = 'block';

    // If this actions dropdown is inside a mobile container, position it near the button
    try {
        // Find the triggering button: prefer the event target's closest element with data-note-id
        let triggerBtn = null;
        if (event && event.target) triggerBtn = event.target.closest('.btn-actions');
        if (!triggerBtn) triggerBtn = document.querySelector('.btn-actions');

        const isMobileDropdown = !!triggerBtn && !!triggerBtn.closest && triggerBtn.closest('.actions-dropdown') && triggerBtn.closest('.actions-dropdown').classList.contains('mobile');

        if (isMobileDropdown && triggerBtn) {
            // Force fixed positioning placed near the button. Use important priority to override stylesheet !important rules.
            const rect = triggerBtn.getBoundingClientRect();

            // Make menu invisible but displayed to measure height
            activeMenu.style.visibility = 'hidden';
            activeMenu.style.display = 'block';

            // Ensure any previous important declarations are cleared
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');

            // Apply fixed positioning with important priority
            activeMenu.style.setProperty('position', 'fixed', 'important');
            // center horizontally on the button
            const centerX = rect.left + rect.width / 2;
            activeMenu.style.setProperty('left', centerX + 'px', 'important');
            activeMenu.style.setProperty('transform', 'translateX(-50%)', 'important');
            activeMenu.style.setProperty('margin-top', '0', 'important');
            activeMenu.style.setProperty('z-index', '20000', 'important');
            activeMenu.style.setProperty('box-shadow', '0 8px 24px rgba(0,0,0,0.18)', 'important');

            // Compute space and place above by default
            const menuHeight = activeMenu.getBoundingClientRect().height || activeMenu.offsetHeight || 0;
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            let topPos = rect.top - menuHeight - 8; // 8px gap
            if (topPos < 8 && spaceBelow > spaceAbove) {
                // Not enough space above -> place below the button
                topPos = rect.bottom + 8;
            }
            activeMenu.style.setProperty('top', Math.max(8, topPos) + 'px', 'important');
            // ensure bottom is unset
            activeMenu.style.setProperty('bottom', 'auto', 'important');

            // restore visibility
            activeMenu.style.visibility = '';
        } else {
            // Desktop/default behavior: ensure menu is positioned by CSS (absolute)
            // Remove any leftover important positioning
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');
            activeMenu.style.removeProperty('margin-top');
            activeMenu.style.removeProperty('z-index');
            activeMenu.style.removeProperty('box-shadow');
        }
    } catch (e) {
        // ignore positioning errors
    }

    isActionsMenuOpen = true;
}

function closeActionsMenu() {
    // Hide all actions menus
    const all = document.querySelectorAll('.actions-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // Remove any inline styles we added for mobile positioning (including important ones)
        try {
            el.style.removeProperty('position');
            el.style.removeProperty('left');
            el.style.removeProperty('right');
            el.style.removeProperty('top');
            el.style.removeProperty('bottom');
            el.style.removeProperty('transform');
            el.style.removeProperty('margin-top');
            el.style.removeProperty('z-index');
            el.style.removeProperty('box-shadow');
            el.style.visibility = '';
        } catch (e) {
            // ignore
        }
    });
    isActionsMenuOpen = false;
    currentActionsMenuNoteId = null;
}

window.toggleActionsMenu = toggleActionsMenu;
window.closeActionsMenu = closeActionsMenu;

// ===========================
// Folder Sharing Functions
// ===========================

// Create a public share for a folder
async function createPublicFolderShare(folderId) {
    if (!folderId) return;

    try {
        // Get custom token if provided
        let customToken = '';
        try {
            const el = document.getElementById('shareFolderCustomToken');
            if (el && el.value) customToken = el.value.trim();
        } catch (e) { }

        // Get indexable checkbox value
        let indexable = 0;
        try {
            const indexableEl = document.getElementById('shareFolderIndexable');
            if (indexableEl && indexableEl.checked) indexable = 1;
        } catch (e) { }

        // Get password value
        let password = '';
        try {
            const passwordEl = document.getElementById('shareFolderPassword');
            if (passwordEl && passwordEl.value) password = passwordEl.value.trim();
        } catch (e) { }

        const theme = localStorage.getItem('poznote-theme') || 'light';
        const body = { theme: theme, indexable: indexable };
        if (customToken) body.custom_token = customToken;
        if (password) body.password = password;

        const resp = await fetch('/api/v1/folders/' + folderId + '/share', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.indexOf('application/json') !== -1) {
                const errBody = await resp.json();
                throw new Error(errBody.error || ('Network response not ok: ' + resp.status));
            }
            throw new Error('Network response not ok: ' + resp.status);
        }

        const ct2 = resp.headers.get('content-type') || '';
        let data = null;
        if (ct2.indexOf('application/json') !== -1) {
            data = await resp.json();
        } else {
            const text = await resp.text();
            throw new Error('Unexpected response from server: ' + text);
        }

        if (data && data.url) {
            // Show success modal with URL
            if (typeof showFolderShareModal === 'function') {
                showFolderShareModal(data.url, { folderId: folderId, shared: true, workspace: data.workspace || '' });
            }

            // Update shared count in sidebar
            if (data.shared_notes_count && data.shared_notes_count > 0) {
                updateSharedCount(data.shared_notes_count);
            }

            // Close folder actions menu
            if (typeof closeFolderActionsMenu === 'function') {
                closeFolderActionsMenu(folderId);
            }

            // Refresh notes list to update folder actions menu item
            refreshNotesListAfterFolderAction(folderId);
        }

    } catch (err) {
        console.error('Failed to create folder share:', err);
        alert('Failed to create public folder link: ' + err.message);
    }
}

// Get existing public share for a folder
async function getPublicFolderShare(folderId) {
    try {
        const resp = await fetch('/api/v1/folders/' + folderId + '/share', {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        });

        if (!resp.ok) return { shared: false };

        const data = await resp.json();
        if (data.success && data.public) {
            const preferredProtocol = getPreferredPublicUrlProtocol();
            return {
                shared: true,
                url: applyProtocolToPublicUrl(data.url, preferredProtocol),
                workspace: data.workspace
            };
        }
        return { shared: false };
    } catch (err) {
        console.error('Failed to get folder share status:', err);
        return { shared: false };
    }
}

// Open the share modal for a folder
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

window.createPublicFolderShare = createPublicFolderShare;
window.getPublicFolderShare = getPublicFolderShare;
window.openPublicFolderShareModal = openPublicFolderShareModal;
window.showFolderShareModal = showFolderShareModal;

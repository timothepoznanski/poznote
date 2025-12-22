// Share / Export menu functionality
let currentShareMenuNoteId = null;
let isShareMenuOpen = false;

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
        // Get current theme from localStorage
        const theme = localStorage.getItem('poznote-theme') || 'light';
        // If modal has a custom token input, include it
        let customToken = '';
        try {
            const el = document.getElementById('shareCustomToken');
            if (el && el.value) customToken = el.value.trim();
        } catch (e) {}

        const body = { note_id: noteId, theme: theme };
        if (customToken) body.custom_token = customToken;

        const resp = await fetch('api_share_note.php', {
            method: 'POST',
            credentials: 'same-origin', // send session cookie
            headers: {
                'Content-Type': 'application/json'
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

            // Use a dedicated share modal (copy + cancel + revoke/renew)
            if (typeof showShareModal === 'function') {
                showShareModal(data.url, { noteId: noteId, shared: true });
            } else if (typeof showLinkModal === 'function') {
                showLinkModal(data.url, data.url, function(){});
            } else {
                // Fallback: prompt
                window.prompt('Public URL (read-only):', data.url);
            }
        } else if (data && data.error) {
            showNotificationPopup && showNotificationPopup('Error: ' + data.error, 'error');
        } else {
            showNotificationPopup && showNotificationPopup('Unknown error creating public share', 'error');
        }
    } catch (err) {
        console.error('Error creating public share:', err);
        showNotificationPopup && showNotificationPopup('Error creating public share: ' + err.message, 'error');
    }
}

// Close share menu when clicking elsewhere
document.addEventListener('click', function(e) {
    if (!e.target.closest('.share-dropdown')) {
        closeShareMenu();
    }
});

// Close actions menu when clicking elsewhere
document.addEventListener('click', function(e) {
    if (!e.target.closest('.actions-dropdown')) {
        closeActionsMenu();
    }
});

// Show a simple modal with the public URL and Copy / Cancel buttons (English)
// showShareModal can accept either just url or (url, options)
// options: { noteId: string, shared: boolean }
function showShareModal(url, options) {
    // Remove existing if any
    const existing = document.getElementById('shareModal');
    if (existing) existing.parentNode.removeChild(existing);

    // Build modal using same structure and classes as other modals (modal -> modal-content -> modal-buttons)
    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    const content = document.createElement('div');
    content.className = 'modal-content';

    // No close (×) icon for the share modal per UX request

    const h3 = document.createElement('h3');
    h3.textContent = window.t ? window.t('index.share_modal.title', null, 'Public URL') : 'Public URL';
    content.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = '';
    content.appendChild(p);

    // Show the full URL as plain, non-selectable text (no input frame)
    const urlDiv = document.createElement('div');
    urlDiv.id = 'shareModalUrl';
    urlDiv.textContent = url;
    urlDiv.style.width = '100%';
    urlDiv.style.padding = '0';
    urlDiv.style.border = 'none';
    urlDiv.style.background = 'transparent';
    urlDiv.style.boxSizing = 'border-box';
    urlDiv.style.whiteSpace = 'normal';
    urlDiv.style.wordBreak = 'break-all';
    urlDiv.style.userSelect = 'none';
    urlDiv.style.webkitUserSelect = 'none';
    urlDiv.style.MozUserSelect = 'none';
    urlDiv.style.cursor = 'default';
    // Ensure text is fully visible; allow wrapping
    content.appendChild(urlDiv);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons';
    // Remove the dividing line above buttons for this share modal
    buttonsDiv.style.borderTop = 'none';

    // Get options
    const noteId = options && options.noteId ? options.noteId : null;
    const isShared = options && options.shared ? true : false;

    // Create Cancel button. Always present.
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = window.t ? window.t('index.share_modal.close', null, 'Close') : 'Close';
    // red styling for cancel
    cancelBtn.style.background = '#dc3545';
    cancelBtn.style.color = '#ffffff';
    cancelBtn.style.border = 'none';
    cancelBtn.onclick = function() { closeModal('shareModal'); };
    buttonsDiv.appendChild(cancelBtn);

    // Conditionally add buttons based on share status
    if (isShared) {
        // If shared, show Open, Copy, Revoke, Renew
        // Open button: opens the URL in a new tab (keeps modal open)
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn-open';
        openBtn.textContent = window.t ? window.t('index.share_modal.open', null, 'Open') : 'Open';
        // green styling for open
        openBtn.style.background = '#28a745';
        openBtn.style.color = '#ffffff';
        openBtn.style.border = 'none';
        openBtn.onclick = function(ev) {
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}
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
        copyBtn.textContent = window.t ? window.t('index.share_modal.copy', null, 'Copy') : 'Copy';
        copyBtn.onclick = async function(ev) {
            // Prevent clicks from bubbling to global handlers
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}

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

        // Add Revoke and Renew buttons when options.noteId provided and shared
        if (noteId) {
            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'btn-revoke';
            revokeBtn.textContent = window.t ? window.t('index.share_modal.revoke', null, 'Revoke') : 'Revoke';
            revokeBtn.style.background = '#6c757d';
            revokeBtn.style.color = '#ffffff';
            revokeBtn.style.border = 'none';
            revokeBtn.onclick = async function(ev) {
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}
            // Call API to revoke
            try {
                const resp = await fetch('api_share_note.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note_id: noteId, action: 'revoke' })
                });
                if (resp.ok) {
                    markShareIconShared(noteId, false);
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

            const renewBtn = document.createElement('button');
            renewBtn.type = 'button';
            renewBtn.className = 'btn-renew';
            renewBtn.textContent = window.t ? window.t('index.share_modal.renew', null, 'Renew') : 'Renew';
            renewBtn.style.background = '#007DB8';
            renewBtn.style.color = '#ffffff';
            renewBtn.style.border = 'none';
            renewBtn.onclick = async function(ev) {
                try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}
                try {
                    // Get current theme from localStorage
                    const theme = localStorage.getItem('poznote-theme') || 'light';
                    const resp = await fetch('api_share_note.php', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ note_id: noteId, action: 'renew', theme: theme })
                    });
                    if (resp.ok) {
                        const ct = resp.headers.get('content-type') || '';
                        if (ct.indexOf('application/json') !== -1) {
                            const j = await resp.json();
                            if (j && j.url) {
                                // Update displayed URL but keep modal open
                                const urlDivEl = document.getElementById('shareModalUrl');
                                if (urlDivEl) urlDivEl.textContent = j.url;
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
        }
    } else {
        // If not shared, show Create button
        // Add an optional input for a custom slug/token
        const inputWrap = document.createElement('div');
        inputWrap.style.margin = '8px 0 12px 0';
        const label = document.createElement('label');
        label.textContent = window.t ? window.t('index.share_modal.custom_slug', null, 'Custom slug (optional)') : 'Custom slug (optional)';
        label.style.display = 'block';
        label.style.marginBottom = '6px';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'shareCustomToken';
        input.placeholder = window.t ? window.t('index.share_modal.custom_slug_placeholder', null, 'letters, numbers, -, _, .') : 'letters, numbers, -, _, .';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        inputWrap.appendChild(label);
        inputWrap.appendChild(input);
        content.appendChild(inputWrap);

        const createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.className = 'btn-create-share';
        createBtn.textContent = window.t ? window.t('index.share_modal.create_url', null, 'Create url') : 'Create url';
        createBtn.style.background = '#28a745';
        createBtn.style.color = '#ffffff';
        createBtn.style.border = 'none';
        createBtn.onclick = function() { createPublicShare(noteId); };
        buttonsDiv.appendChild(createBtn);
    }

    // If there's no URL provided, show placeholder text
    if (!url) {
        urlDiv.textContent = window.t ? window.t('index.share_modal.no_link_yet', null, '(No public link yet)') : '(No public link yet)';
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

// Get existing public share for a note (returns {shared: bool, url?: string})
async function getPublicShare(noteId) {
    if (!noteId) return { shared: false };
    try {
        // Get current theme from localStorage
        const theme = localStorage.getItem('poznote-theme') || 'light';
        const resp = await fetch('api_share_note.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note_id: noteId, action: 'get', theme: theme })
        });
        if (!resp.ok) return { shared: false };
        const ct = resp.headers.get('content-type') || '';
        if (ct.indexOf('application/json') === -1) return { shared: false };
        const j = await resp.json();
        if (j && j.url) return { shared: true, url: j.url };
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
        showShareModal(info.url, { noteId: noteId, shared: true });
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
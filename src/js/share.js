// Share / Export menu functionality
let currentShareMenuNoteId = null;
let isShareMenuOpen = false;

function toggleShareMenu(event, noteId, filename, titleJson) {
    if (event) event.stopPropagation();
    currentShareMenuNoteId = noteId;

    // Close other menus (guard with typeof to avoid ReferenceError if not present)
    if (typeof closeAIMenu === 'function') closeAIMenu();
    if (typeof closeSettingsMenu === 'function') closeSettingsMenu();

    // Find the menu elements specific to this note
    const desktop = document.getElementById('shareMenu-' + noteId);
    const mobile = document.getElementById('shareMenuMobile-' + noteId);
    const activeMenu = desktop || mobile;

    if (!activeMenu) return;

    if (isShareMenuOpen && currentShareMenuNoteId === noteId) {
        closeShareMenu();
    } else {
        // Close any other share menus first
        const all = document.querySelectorAll('.share-menu');
        all.forEach(el => el.style.display = 'none');

        activeMenu.style.display = 'block';
        isShareMenuOpen = true;
        currentShareMenuNoteId = noteId;
    }
}

function closeShareMenu() {
    // Hide all share menus
    const all = document.querySelectorAll('.share-menu');
    all.forEach(el => el.style.display = 'none');
    isShareMenuOpen = false;
    currentShareMenuNoteId = null;
}

// Create a public share by calling the server API and show the returned URL in a link modal
async function createPublicShare(noteId) {
    if (!noteId) return;

    try {
        const resp = await fetch('api_share_note.php', {
            method: 'POST',
            credentials: 'same-origin', // send session cookie
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ note_id: noteId })
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
    h3.textContent = 'Public URL';
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

    // Create Cancel and Open buttons. User requested Cancel and Open swapped and colored.
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    // red styling for cancel
    cancelBtn.style.background = '#dc3545';
    cancelBtn.style.color = '#ffffff';
    cancelBtn.style.border = 'none';
    cancelBtn.onclick = function() { closeModal('shareModal'); };
    buttonsDiv.appendChild(cancelBtn);

    // Open button: opens the URL in a new tab (keeps modal open)
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn-open';
    openBtn.textContent = 'Open';
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
    copyBtn.textContent = 'Copy';
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

    // Add Revoke and Renew buttons when options.noteId provided
    const noteId = options && options.noteId ? options.noteId : null;
    const isShared = options && options.shared ? true : false;
    if (noteId) {
        if (isShared) {
            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'btn-revoke';
            revokeBtn.textContent = 'Revoke';
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
        }
    const renewBtn = document.createElement('button');
        renewBtn.type = 'button';
        renewBtn.className = 'btn-renew';
        renewBtn.textContent = 'Renew';
        renewBtn.style.background = '#007DB8';
        renewBtn.style.color = '#ffffff';
        renewBtn.style.border = 'none';
        renewBtn.onclick = async function(ev) {
            try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}
            try {
                const resp = await fetch('api_share_note.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note_id: noteId, action: 'renew' })
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
                            // If Open/Copy were disabled because there was no URL, re-enable them
                            try {
                                if (openBtn) { openBtn.disabled = false; openBtn.style.opacity = ''; }
                                if (copyBtn) { copyBtn.disabled = false; copyBtn.style.opacity = ''; }
                            } catch (e) {
                                // ignore
                            }
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

    // If there's no URL provided, disable Open and Copy buttons and show placeholder text
    if (!url) {
        openBtn.disabled = true;
        copyBtn.disabled = true;
        urlDiv.textContent = '(No public link yet)';
        openBtn.style.opacity = '0.6';
        copyBtn.style.opacity = '0.6';
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
        const resp = await fetch('api_share_note.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note_id: noteId, action: 'get' })
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
        // Build a minimal modal that uses createPublicShare when user wants to create
        // Reuse showShareModal by passing empty URL and the noteId; create button will call createPublicShare
        showShareModal('', { noteId: noteId, shared: false });
        // Add a Create button to the modal
        const modal = document.getElementById('shareModal');
        if (modal) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-create-share';
            btn.textContent = 'Create share';
            btn.style.background = '#28a745';
            btn.style.color = '#ffffff';
            btn.style.border = 'none';
            btn.onclick = function() { createPublicShare(noteId); };
            const btns = modal.querySelector('.modal-buttons');
            if (btns) btns.appendChild(btn);
        }
    }
}

// Toggle visual state of share icon in toolbar
function markShareIconShared(noteId, shared) {
    try {
        const sel = document.querySelectorAll('.btn-share');
        sel.forEach(btn => {
            // Buttons generated include onclick with the note id; check data in onclick or nearby menu id
            const menuId = 'shareMenu-' + noteId;
            const mobileMenuId = 'shareMenuMobile-' + noteId;
            const parent = btn.parentElement || btn.parentNode;
            if (!parent) return;
            // If this button's associated menu matches, toggle class
            if (parent.querySelector && (parent.querySelector('#' + menuId) || parent.querySelector('#' + mobileMenuId))) {
                if (shared) btn.classList.add('is-shared'); else btn.classList.remove('is-shared');
            }
        });
    } catch (e) {
        // ignore
    }
}

window.getPublicShare = getPublicShare;
window.openPublicShareModal = openPublicShareModal;
window.markShareIconShared = markShareIconShared;
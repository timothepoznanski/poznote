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
            // Use a dedicated share modal (copy + cancel)
            if (typeof showShareModal === 'function') {
                showShareModal(data.url);
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
function showShareModal(url) {
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

    // Open button: opens the URL in a new tab (keeps modal open)
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn-primary btn-open';
    openBtn.textContent = 'Open';
    openBtn.onclick = function(ev) {
        try { ev && ev.stopPropagation(); ev && ev.preventDefault(); } catch (e) {}
        // Open in new tab with noopener for safety
        window.open(url, '_blank', 'noopener');
    };
    buttonsDiv.appendChild(openBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function() { closeModal('shareModal'); };
    buttonsDiv.appendChild(cancelBtn);

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

    content.appendChild(buttonsDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Do not auto-focus or select the URL — user requested no automatic highlighting
}

// Expose functions globally
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;
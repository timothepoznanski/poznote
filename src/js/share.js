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

    const closeSpan = document.createElement('span');
    closeSpan.className = 'close';
    closeSpan.innerHTML = '&times;';
    closeSpan.onclick = function() { closeModal('shareModal'); };
    content.appendChild(closeSpan);

    const h3 = document.createElement('h3');
    h3.textContent = 'Public URL';
    content.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = '';
    content.appendChild(p);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = url;
    input.id = 'shareModalUrl';
    input.readOnly = true;
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.border = '1px solid #ddd';
    input.style.borderRadius = '6px';
    input.style.boxSizing = 'border-box';
    content.appendChild(input);

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'modal-buttons';

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
            await navigator.clipboard.writeText(input.value);
            closeModal('shareModal');
        } catch (e) {
            // Fallback: select and execCommand, then close
            try {
                input.select();
                document.execCommand('copy');
                closeModal('shareModal');
            } catch (err) {
                // As last resort, show the prompt then close
                window.prompt('Copy this URL', input.value);
                closeModal('shareModal');
            }
        }
    };
    buttonsDiv.appendChild(copyBtn);

    content.appendChild(buttonsDiv);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Focus and select the URL so it's highlighted when the modal opens
    setTimeout(function(){
        try {
            input.focus();
            input.select();
            input.setSelectionRange(0, input.value.length);
        } catch (e) {}
    }, 50);
}

// Expose functions globally
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;
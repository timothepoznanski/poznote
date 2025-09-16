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
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'shareModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.zIndex = 10001;

    const box = document.createElement('div');
    box.style.width = 'min(720px, 92%)';
    box.style.background = '#fff';
    box.style.padding = '18px';
    box.style.borderRadius = '8px';
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
    box.style.fontFamily = 'Inter, sans-serif';

    const title = document.createElement('h3');
    title.textContent = 'Public URL';
    title.style.marginTop = '0';
    box.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = url;
    input.id = 'shareModalUrl';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.border = '1px solid #ddd';
    input.style.borderRadius = '4px';
    input.style.fontSize = '14px';
    input.readOnly = true;
    box.appendChild(input);

    const footer = document.createElement('div');
    footer.style.marginTop = '12px';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    footer.style.gap = '8px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.onclick = function() { modal.remove(); };
    footer.appendChild(cancelBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    copyBtn.className = 'btn btn-primary';
    copyBtn.onclick = async function() {
        try {
            await navigator.clipboard.writeText(input.value);
            copyBtn.textContent = 'Copied';
            copyBtn.disabled = true;
            setTimeout(function(){ if (copyBtn) { copyBtn.textContent = 'Copy'; copyBtn.disabled = false; }}, 2000);
        } catch (e) {
            // fallback select
            input.select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied';
            setTimeout(function(){ if (copyBtn) { copyBtn.textContent = 'Copy'; }}, 2000);
        }
    };
    footer.appendChild(copyBtn);

    box.appendChild(footer);
    modal.appendChild(box);
    document.body.appendChild(modal);

    // Focus + select the url
    setTimeout(function(){ input.focus(); input.select(); }, 100);

    // Close when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
}

// Expose functions globally
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;
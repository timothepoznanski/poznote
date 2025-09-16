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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ note_id: noteId })
        });

        if (!resp.ok) throw new Error('Network response not ok: ' + resp.status);
        const data = await resp.json();

        if (data && data.url) {
            // Use existing modal to show link
            if (typeof showLinkModal === 'function') {
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

// Expose functions globally
window.toggleShareMenu = toggleShareMenu;
window.closeShareMenu = closeShareMenu;
window.createPublicShare = createPublicShare;
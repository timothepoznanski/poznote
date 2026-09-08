/**
 * Note width settings module
 */

// Function to show note width settings prompt
function showNoteWidthPrompt() {
    // Close settings menus if they exist
    if (typeof closeSettingsMenus === 'function') {
        closeSettingsMenus();
    }

    // Get modal elements
    const modal = document.getElementById('noteWidthModal');
    const noteWidthInput = document.getElementById('noteWidthInput');
    const fullWidthBtn = document.getElementById('fullWidthBtn');
    const cancelNoteWidthBtn = document.getElementById('cancelNoteWidthBtn');
    const saveNoteWidthBtn = document.getElementById('saveNoteWidthBtn');

    if (!modal || !noteWidthInput) {
        return;
    }

    // Add event listeners if they don't exist yet
    if (!modal.hasAttribute('data-initialized')) {
        if (cancelNoteWidthBtn) {
            cancelNoteWidthBtn.addEventListener('click', closeNoteWidthModal);
        }
        if (saveNoteWidthBtn) {
            saveNoteWidthBtn.addEventListener('click', saveNoteWidth);
        }
        if (fullWidthBtn) {
            fullWidthBtn.addEventListener('click', function () {
                noteWidthInput.value = 100;
                saveNoteWidth(true); // pass true to redirect
            });
        }

        // Input change event
        noteWidthInput.addEventListener('input', function () {
            updateNoteWidthPreview();
        });

        // Mark as initialized
        modal.setAttribute('data-initialized', 'true');
    }

    // Load current width settings
    loadCurrentNoteWidth();

    // Show modal
    modal.style.display = 'block';

    // Focus on input
    setTimeout(function () {
        noteWidthInput.focus();
    }, 100);
}

// Function to close note width modal
function closeNoteWidthModal() {
    const modal = document.getElementById('noteWidthModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Highlight the "Full width" button when the input means full width (100 %)
function updateNoteWidthPreview() {
    const noteWidthInput = document.getElementById('noteWidthInput');
    const fullWidthBtn = document.getElementById('fullWidthBtn');

    if (noteWidthInput && fullWidthBtn) {
        const width = parseInt(noteWidthInput.value, 10);
        fullWidthBtn.classList.toggle('active', !isNaN(width) && width >= 100);
    }
}

// Function to load current width settings
function loadCurrentNoteWidth() {
    fetch('/api/v1/settings/center_note_content', {
        method: 'GET',
        credentials: 'same-origin'
    })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
            if (data && data.success) {
                const noteWidthInput = document.getElementById('noteWidthInput');
                if (noteWidthInput) {
                    // Stored as a percentage ('60%'), '0' for full width, or a
                    // legacy pixel value ('1'/'true' = 800px, bare number). A
                    // pixel value has no percentage equivalent: leave the
                    // input empty so the placeholder suggests a starting point.
                    const val = (data.value === null || data.value === undefined) ? '' : String(data.value).trim();
                    if (val === '0' || val === 'false' || val === '' || val === '100%') {
                        noteWidthInput.value = 100;
                    } else if (/^\d+%$/.test(val)) {
                        noteWidthInput.value = parseInt(val, 10);
                    } else {
                        noteWidthInput.value = '';
                    }
                    updateNoteWidthPreview();
                }
            }
        })
        .catch(error => console.error('Error loading note width:', error));
}

// Function to save width settings
function saveNoteWidth(redirect = false) {
    const noteWidthInput = document.getElementById('noteWidthInput');
    if (!noteWidthInput) return;

    // Percentage of the note column; 100 (or an empty input) means full
    // width, stored as '0' like before so existing readers keep working.
    let width = parseInt(noteWidthInput.value, 10);
    if (isNaN(width) || width >= 100) {
        width = '0';
    } else {
        width = Math.max(10, width) + '%';
    }

    // Save to server
    fetch('/api/v1/settings/center_note_content', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: width })
    })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            if (data.success) {
                closeNoteWidthModal();

                // Refresh badge in settings page
                if (typeof window.refreshNoteWidthBadge === 'function') {
                    window.refreshNoteWidthBadge();
                }

                if (redirect) {
                    window.location.href = 'index.php';
                }
            }
        })
        .catch(error => {
            console.error('Error saving note width:', error);
        });
}

// Add to window
window.showNoteWidthPrompt = showNoteWidthPrompt;

// Initialize when DOM loaded
document.addEventListener('DOMContentLoaded', function () {
    const noteWidthCard = document.getElementById('note-width-card');
    if (noteWidthCard) {
        noteWidthCard.addEventListener('click', showNoteWidthPrompt);
        // Initial badge refresh
        if (typeof window.refreshNoteWidthBadge === 'function') {
            window.refreshNoteWidthBadge();
        }
    }
});

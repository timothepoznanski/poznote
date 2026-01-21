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
                noteWidthInput.value = 0;
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

// Function to update preview/info
function updateNoteWidthPreview() {
    const noteWidthInput = document.getElementById('noteWidthInput');
    const defaultInfo = document.getElementById('defaultNoteWidthInfo');

    if (noteWidthInput) {
        const width = parseInt(noteWidthInput.value);



        // Logic for input display
        const fullWidthBtn = document.getElementById('fullWidthBtn');
        if (fullWidthBtn) {
            if (width === 0) {
                fullWidthBtn.classList.add('active');
            } else {
                fullWidthBtn.classList.remove('active');
            }
        }
        if (width === 0) {
            // we use 0 to represent full width in the input
        }
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
                    let val = data.value;
                    // Handle old boolean values
                    if (val === '1' || val === 'true') {
                        val = 800;
                    } else if (val === '0' || val === 'false' || val === '') {
                        val = 0; // 0 represents full width/disabled
                    } else {
                        val = parseInt(val) || 0;
                    }
                    noteWidthInput.value = val;
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

    let width = noteWidthInput.value;

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

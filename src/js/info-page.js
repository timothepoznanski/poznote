// JavaScript for note info page
// Requires: navigation.js (for goBackToNote)

// Get data from body attributes
function getPageData() {
    var body = document.body;
    return {
        noteId: body.getAttribute('data-note-id') || '',
        workspace: body.getAttribute('data-workspace') || '',
        currentSubheading: body.getAttribute('data-current-subheading') || '',
        autoEdit: body.getAttribute('data-auto-edit-subheading') === '1'
    };
}

// Edit subheading inline
function editSubheadingInline(currentSub) {
    // Hide the text display
    var displayEl = document.getElementById('subheading-display');
    if (displayEl) displayEl.style.display = 'none';
    
    var editBtnEl = document.getElementById('edit-subheading-btn');
    if (editBtnEl) editBtnEl.style.display = 'none';
    
    // Show input and buttons
    var input = document.getElementById('subheading-input');
    var buttons = document.getElementById('subheading-buttons');
    
    if (input) {
        input.style.display = 'inline-block';
        input.value = currentSub || '';
        input.focus();
        input.select();
    }
    
    if (buttons) {
        buttons.style.display = 'inline-block';
    }
}

// Save subheading
function saveSubheading(noteId) {
    var input = document.getElementById('subheading-input');
    if (!input) return;
    
    var newSub = input.value.trim();
    
    // Send update request
    fetch('api_update_subheading.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'note_id=' + encodeURIComponent(noteId) + '&subheading=' + encodeURIComponent(newSub)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            // Update display and exit edit mode
            var displayEl = document.getElementById('subheading-display');
            if (displayEl) {
                displayEl.textContent = newSub || (window.t ? window.t('common.not_specified', null, 'Not specified') : 'Not specified');
            }
            cancelSubheadingEdit();
            // Success: no popup shown per user request
        } else {
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(
                    (window.t
                        ? window.t('info.errors.failed_to_update_subheading_prefix', { error: (data.message || 'Unknown error') }, 'Failed to update heading: {{error}}')
                        : ('Failed to update heading: ' + (data.message || 'Unknown error'))),
                    'error'
                );
            }
        }
    })
    .catch(function(error) {
        console.error('Error:', error);
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup(
                (window.t
                    ? window.t('info.errors.network_error_updating_subheading', null, 'Network error while updating heading')
                    : 'Network error while updating heading'),
                'error'
            );
        }
    });
}

// Cancel subheading edit
function cancelSubheadingEdit() {
    // Hide input and buttons
    var input = document.getElementById('subheading-input');
    var buttons = document.getElementById('subheading-buttons');
    
    if (input) input.style.display = 'none';
    if (buttons) buttons.style.display = 'none';
    
    // Show text display
    var displayEl = document.getElementById('subheading-display');
    if (displayEl) displayEl.style.display = 'inline';
    
    var editBtnEl = document.getElementById('edit-subheading-btn');
    if (editBtnEl) editBtnEl.style.display = 'inline-block';
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    var data = getPageData();
    
    // Back to note button
    var backBtn = document.getElementById('backToNoteBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            goBackToNote(data.noteId);
        });
    }
    
    // Subheading display click to edit
    var subheadingDisplay = document.getElementById('subheading-display');
    if (subheadingDisplay) {
        subheadingDisplay.addEventListener('click', function() {
            editSubheadingInline(data.currentSubheading);
        });
        subheadingDisplay.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                editSubheadingInline(data.currentSubheading);
            }
        });
    }
    
    // Save button
    var saveBtn = document.querySelector('#subheading-buttons .btn-save');
    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            saveSubheading(data.noteId);
        });
    }
    
    // Cancel button
    var cancelBtn = document.querySelector('#subheading-buttons .btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelSubheadingEdit);
    }
    
    // Handle Enter/Escape keys in input
    var subheadingInput = document.getElementById('subheading-input');
    if (subheadingInput) {
        subheadingInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveSubheading(data.noteId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelSubheadingEdit();
            }
        });
    }
    
    // Auto-edit if requested via URL parameter
    if (data.autoEdit) {
        try {
            editSubheadingInline(data.currentSubheading);
        } catch(e) {
            console.error(e);
        }
    }
});

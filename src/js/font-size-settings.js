/**
 * Font size settings module for note editor
 */

// Function to show font size settings prompt
function showNoteFontSizePrompt() {
    // Close settings menus
    if (typeof closeSettingsMenus === 'function') {
        closeSettingsMenus();
    }

    // Get modal elements
    const modal = document.getElementById('fontSizeModal');
    const fontSizeInput = document.getElementById('fontSizeInput');
    const sidebarFontSizeInput = document.getElementById('sidebarFontSizeInput');
    const closeFontSizeBtn = document.getElementById('closeFontSizeModal');
    const cancelFontSizeBtn = document.getElementById('cancelFontSizeBtn');
    const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');

    if (!modal || !fontSizeInput || !sidebarFontSizeInput) {
        return;
    }

    // Add event listeners if they don't exist yet
    if (!modal.hasAttribute('data-initialized')) {
        // Add event listeners
        if (closeFontSizeBtn) {
            closeFontSizeBtn.addEventListener('click', closeFontSizeModal);
        }
        if (cancelFontSizeBtn) {
            cancelFontSizeBtn.addEventListener('click', closeFontSizeModal);
        }
        if (saveFontSizeBtn) {
            saveFontSizeBtn.addEventListener('click', saveFontSize);
        }

        // Mark as initialized
        modal.setAttribute('data-initialized', 'true');
    }

    // Load current font size settings
    loadCurrentFontSizes();

    // Show modal
    modal.style.display = 'block';
}

// Function to close font size modal
function closeFontSizeModal() {
    const modal = document.getElementById('fontSizeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Safe notification function that checks if the global function exists
function safeShowNotification(message, type) {
    if (typeof showNotificationPopup === 'function') {
        showNotificationPopup(message, type);
    } else if (type === 'error') {
        alert(message);
    }
}

// Function to update preview text with selected font sizes
function updateFontSizePreview() {
    // Preview logic removed as per user request to simplify
}

// Function to load current font size settings
function loadCurrentFontSizes() {
    // Load note font size from localStorage
    const noteFontSize = localStorage.getItem('note_font_size') || '15';
    const fontSizeInput = document.getElementById('fontSizeInput');
    if (fontSizeInput) {
        fontSizeInput.value = noteFontSize;
        updateFontSizePreview();
    }

    // Load sidebar font size from localStorage
    const sidebarFontSize = localStorage.getItem('sidebar_font_size') || '13';
    const sidebarFontSizeInput = document.getElementById('sidebarFontSizeInput');
    if (sidebarFontSizeInput) {
        sidebarFontSizeInput.value = sidebarFontSize;
        updateFontSizePreview();
    }
}

// Function to save font size settings
function saveFontSize() {
    const fontSizeInput = document.getElementById('fontSizeInput');
    const sidebarFontSizeInput = document.getElementById('sidebarFontSizeInput');

    if (!fontSizeInput || !sidebarFontSizeInput) {
        return;
    }

    const fontSize = fontSizeInput.value;
    const sidebarFontSize = sidebarFontSizeInput.value;

    // Validate inputs
    if (fontSize < 10 || fontSize > 32 || sidebarFontSize < 10 || sidebarFontSize > 32) {
        safeShowNotification('Font size must be between 10 and 32 pixels', 'error');
        return;
    }

    try {
        // Save to localStorage instead of database
        localStorage.setItem('note_font_size', fontSize);
        localStorage.setItem('sidebar_font_size', sidebarFontSize);

        closeFontSizeModal();

        // Apply changes immediately to the UI
        const noteSize = fontSize + 'px';
        const sidebarSize = sidebarFontSize + 'px';

        document.documentElement.style.setProperty('--note-font-size', noteSize);
        document.documentElement.style.setProperty('--sidebar-font-size', sidebarSize);

        // Direct application as fallback for existing elements
        document.querySelectorAll('.noteentry').forEach(el => el.style.fontSize = noteSize);
        document.querySelectorAll('.links_arbo_left .note-title, .folder-name').forEach(el => el.style.fontSize = sidebarSize);

        if (typeof window.refreshFontSizeBadge === 'function') {
            window.refreshFontSizeBadge();
        }
    } catch (error) {
        safeShowNotification('Error saving font size settings', 'error');
    }
}

// Function to apply font size to all note editors and note list
function applyFontSizeToNotes() {
    // Note: The font sizes are now handled via CSS variables on :root
    // Loading from localStorage to ensure UI is in sync (e.g. on page load)

    const noteFontSize = localStorage.getItem('note_font_size') || '15';
    document.documentElement.style.setProperty('--note-font-size', noteFontSize + 'px');

    const sidebarFontSize = localStorage.getItem('sidebar_font_size') || '13';
    document.documentElement.style.setProperty('--sidebar-font-size', sidebarFontSize + 'px');
}

// Function to apply font size on page load
function applyStoredFontSize() {
    applyFontSizeToNotes();
}

// Add the function to the window object so it can be called from HTML
window.showNoteFontSizePrompt = showNoteFontSizePrompt;

// Function to initialize all font size settings elements and events
function initFontSizeSettings() {
    const fontSizeModal = document.getElementById('fontSizeModal');
    const fontSizeInput = document.getElementById('fontSizeInput');
    const sidebarFontSizeInput = document.getElementById('sidebarFontSizeInput');
    const closeFontSizeBtn = document.getElementById('closeFontSizeModal');
    const cancelFontSizeBtn = document.getElementById('cancelFontSizeBtn');
    const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');

    if (!fontSizeModal || !fontSizeInput || !sidebarFontSizeInput || !cancelFontSizeBtn || !saveFontSizeBtn) {
        return;
    }

    // Add event listeners (once)
    if (!fontSizeModal.hasAttribute('data-initialized')) {
        if (closeFontSizeBtn) {
            closeFontSizeBtn.addEventListener('click', closeFontSizeModal);
        }
        cancelFontSizeBtn.addEventListener('click', closeFontSizeModal);
        saveFontSizeBtn.addEventListener('click', saveFontSize);

        fontSizeInput.addEventListener('input', updateFontSizePreview);
        sidebarFontSizeInput.addEventListener('input', updateFontSizePreview);

        fontSizeModal.setAttribute('data-initialized', 'true');
    }
}

// Apply stored font size when page loads
document.addEventListener('DOMContentLoaded', function () {
    initFontSizeSettings();
    applyStoredFontSize();

    // Set up a MutationObserver to watch for changes in the note list
    const notesContainer = document.getElementById('left_col');
    if (notesContainer) {
        const observer = new MutationObserver(function (mutations) {
            // Check if any mutations added new note list items, folders, or task lists
            let hasNewNotes = false;
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) { // Element node
                        if (node.classList && (node.classList.contains('links_arbo_left') ||
                            node.classList.contains('folder-name') ||
                            node.classList.contains('checklist-text') ||
                            node.classList.contains('task-list-item') ||
                            node.querySelector && (node.querySelector('.links_arbo_left') ||
                                node.querySelector('.folder-name') ||
                                node.querySelector('.checklist-text') ||
                                node.querySelector('.task-list-item')))) {
                            hasNewNotes = true;
                        }
                    }
                });
            });

            if (hasNewNotes) {
                // Apply font size to newly added notes, folders, and task lists
                applyStoredFontSize();
            }
        });

        // Start observing
        observer.observe(notesContainer, {
            childList: true,
            subtree: true
        });
    }
});

// Fallback initialization - sometimes DOMContentLoaded might have already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function () {
        initFontSizeSettings();
        applyStoredFontSize();
    }, 500);
}

// Add event to apply font size when a note is loaded
document.addEventListener('noteLoaded', function () {
    applyStoredFontSize();
});

// Apply font size after note is initialized
function reinitializeFontSize() {
    applyStoredFontSize();
}

// Add to reinitializeNoteContent if it exists
if (typeof window.reinitializeNoteContent === 'function') {
    const originalReinitializeNoteContent = window.reinitializeNoteContent;
    window.reinitializeNoteContent = function () {
        originalReinitializeNoteContent();
        reinitializeFontSize();
    };
}

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
    const closeFontSizeBtn = document.getElementById('closeFontSizeModal');
    const cancelFontSizeBtn = document.getElementById('cancelFontSizeBtn');
    const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');
    
    if (!modal || !fontSizeInput) {
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
        
        // Font size input change event
        fontSizeInput.addEventListener('input', function() {
            updateFontSizePreview();
        });
        
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

// Function to update preview text with selected font size
function updateFontSizePreview() {
    const fontSizeInput = document.getElementById('fontSizeInput');
    const fontSizePreview = document.getElementById('fontSizePreview');
    const defaultInfo = document.getElementById('defaultFontSizeInfo');
    
    if (fontSizeInput && fontSizePreview) {
        const fontSize = fontSizeInput.value;
        fontSizePreview.style.fontSize = fontSize + 'px';
        
        // Show/hide default info based on value
        if (defaultInfo) {
            if (fontSize == 15) {
                defaultInfo.style.display = 'block';
            } else {
                defaultInfo.style.display = 'none';
            }
        }
    }
}

// Function to load current font size settings
function loadCurrentFontSizes() {
    // Load font size
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: 'action=get&key=note_font_size' 
    })
    .then(function(response) {
        if (!response.ok) {
            return null;
        }
        return response.json();
    })
    .then(function(data) {
        if (data && data.success) {
            // Set input value
            const fontSizeInput = document.getElementById('fontSizeInput');
            if (fontSizeInput) {
                // Default to 15px if not set
                fontSizeInput.value = data.value || '15';
                
                // Update preview
                updateFontSizePreview();
            }
        }
    })
    .catch(function(error) {
        // Silently fail, no need to show errors for font size loading
    });
}

// Function to save font size settings
function saveFontSize() {
    const fontSizeInput = document.getElementById('fontSizeInput');
    
    if (!fontSizeInput) {
        return;
    }
    
    const fontSize = fontSizeInput.value;
    
    // Validate input (ensure it's between 10 and 32)
    if (fontSize < 10 || fontSize > 32) {
        safeShowNotification('Font size must be between 10 and 32 pixels', 'error');
        return;
    }
    
    // Save setting to server
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: `action=set&key=note_font_size&value=${fontSize}` 
    })
    .then(function(response) {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            // Close modal
            closeFontSizeModal();
            
            // Apply font size to current note
            applyFontSizeToNotes();
            
            // Refresh the font size badge if the function exists
            if (typeof window.refreshFontSizeBadge === 'function') {
                window.refreshFontSizeBadge();
            }
        } else {
            safeShowNotification('Error saving font size settings', 'error');
        }
    })
    .catch(function(error) {
        safeShowNotification('Error saving font size settings', 'error');
    });
}

// Function to apply font size to all note editors
function applyFontSizeToNotes() {
    // Apply to the current note editor if it exists
    const noteEditor = document.querySelector('[contenteditable="true"]');
    if (!noteEditor) {
        return;
    }
    
    // Get the font size from settings
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: 'action=get&key=note_font_size' 
    })
    .then(function(response) {
        if (!response.ok) {
            return null;
        }
        return response.json();
    })
    .then(function(data) {
        if (data && data.success && data.value) {
            // Apply font size to the note editor
            noteEditor.style.fontSize = data.value + 'px';
        }
    })
    .catch(function(error) {
        // Silently fail
    });
}

// Function to apply font size on page load
function applyStoredFontSize() {
    applyFontSizeToNotes();
}

// Add the function to the window object so it can be called from HTML
window.showNoteFontSizePrompt = showNoteFontSizePrompt;

// Function to initialize all font size settings elements and events
function initFontSizeSettings() {
    // Get elements
    const fontSizeModal = document.getElementById('fontSizeModal');
    const fontSizeDesktopInput = document.getElementById('fontSizeDesktopInput');
    const fontSizeMobileInput = document.getElementById('fontSizeMobileInput');
    const closeFontSizeBtn = document.getElementById('closeFontSizeModal');
    const cancelFontSizeBtn = document.getElementById('cancelFontSizeBtn');
    const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');
    
    // Check if elements exist
    if (!fontSizeModal || !fontSizeDesktopInput || !fontSizeMobileInput || 
        !closeFontSizeBtn || !cancelFontSizeBtn || !saveFontSizeBtn) {
        return;
    }
    
    // Remove any existing event listeners (in case of multiple initializations)
    const cloneCloseBtn = closeFontSizeBtn.cloneNode(true);
    const cloneCancelBtn = cancelFontSizeBtn.cloneNode(true);
    const cloneSaveBtn = saveFontSizeBtn.cloneNode(true);
    const cloneDesktopInput = fontSizeDesktopInput.cloneNode(true);
    const cloneMobileInput = fontSizeMobileInput.cloneNode(true);
    
    if (closeFontSizeBtn.parentNode) {
        closeFontSizeBtn.parentNode.replaceChild(cloneCloseBtn, closeFontSizeBtn);
    }
    if (cancelFontSizeBtn.parentNode) {
        cancelFontSizeBtn.parentNode.replaceChild(cloneCancelBtn, cancelFontSizeBtn);
    }
    if (saveFontSizeBtn.parentNode) {
        saveFontSizeBtn.parentNode.replaceChild(cloneSaveBtn, saveFontSizeBtn);
    }
    if (fontSizeDesktopInput.parentNode) {
        fontSizeDesktopInput.parentNode.replaceChild(cloneDesktopInput, fontSizeDesktopInput);
    }
    if (fontSizeMobileInput.parentNode) {
        fontSizeMobileInput.parentNode.replaceChild(cloneMobileInput, fontSizeMobileInput);
    }
    
    // Add event listeners
    cloneCloseBtn.addEventListener('click', function() {
        fontSizeModal.style.display = 'none';
    });
    
    cloneCancelBtn.addEventListener('click', function() {
        fontSizeModal.style.display = 'none';
    });
    
    cloneSaveBtn.addEventListener('click', function() {
        saveFontSize();
    });
    
    cloneDesktopInput.addEventListener('input', function() {
        const fontSizeDesktopPreview = document.getElementById('fontSizeDesktopPreview');
        if (fontSizeDesktopPreview) {
            fontSizeDesktopPreview.style.fontSize = cloneDesktopInput.value + 'px';
        }
    });
    
    cloneMobileInput.addEventListener('input', function() {
        const fontSizeMobilePreview = document.getElementById('fontSizeMobilePreview');
        if (fontSizeMobilePreview) {
            fontSizeMobilePreview.style.fontSize = cloneMobileInput.value + 'px';
        }
    });
}

// Apply stored font size when page loads
document.addEventListener('DOMContentLoaded', function() {
    initFontSizeSettings();
    applyStoredFontSize();
});

// Fallback initialization - sometimes DOMContentLoaded might have already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initFontSizeSettings, 500);
}

// Add event to apply font size when a note is loaded
document.addEventListener('noteLoaded', function() {
    applyStoredFontSize();
});

// Apply font size after note is initialized
function reinitializeFontSize() {
    applyStoredFontSize();
}

// Add to reinitializeNoteContent if it exists
if (typeof window.reinitializeNoteContent === 'function') {
    const originalReinitializeNoteContent = window.reinitializeNoteContent;
    window.reinitializeNoteContent = function() {
        originalReinitializeNoteContent();
        reinitializeFontSize();
    };
}

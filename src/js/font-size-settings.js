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
    const fontSizeDesktopInput = document.getElementById('fontSizeDesktopInput');
    const fontSizeMobileInput = document.getElementById('fontSizeMobileInput');
    const closeFontSizeBtn = document.getElementById('closeFontSizeModal');
    const cancelFontSizeBtn = document.getElementById('cancelFontSizeBtn');
    const saveFontSizeBtn = document.getElementById('saveFontSizeBtn');
    
    if (!modal || !fontSizeDesktopInput || !fontSizeMobileInput) {
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
        
        // Font size input change events
        fontSizeDesktopInput.addEventListener('input', function() {
            updateFontSizePreview('desktop');
        });
        
        fontSizeMobileInput.addEventListener('input', function() {
            updateFontSizePreview('mobile');
        });
        
        // Mark as initialized
        modal.setAttribute('data-initialized', 'true');
    }
    
    // Load current font size settings from server
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
function updateFontSizePreview(type) {
    if (type === 'desktop') {
        const fontSizeInput = document.getElementById('fontSizeDesktopInput');
        const fontSizePreview = document.getElementById('fontSizeDesktopPreview');
        
        if (fontSizeInput && fontSizePreview) {
            const fontSize = fontSizeInput.value;
            fontSizePreview.style.fontSize = fontSize + 'px';
        }
    } else if (type === 'mobile') {
        const fontSizeInput = document.getElementById('fontSizeMobileInput');
        const fontSizePreview = document.getElementById('fontSizeMobilePreview');
        
        if (fontSizeInput && fontSizePreview) {
            const fontSize = fontSizeInput.value;
            fontSizePreview.style.fontSize = fontSize + 'px';
        }
    }
}

// Function to load current font size settings
function loadCurrentFontSizes() {
    // Load desktop font size
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: 'action=get&key=note_font_size_desktop' 
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
            const fontSizeDesktopInput = document.getElementById('fontSizeDesktopInput');
            if (fontSizeDesktopInput) {
                // Default to 16px if not set
                fontSizeDesktopInput.value = data.value || '16';
                
                // Update preview
                updateFontSizePreview('desktop');
            }
        }
    })
    .catch(function(error) {
        // Silently fail, no need to show errors for font size loading
    });
    
    // Load mobile font size
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: 'action=get&key=note_font_size_mobile' 
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
            const fontSizeMobileInput = document.getElementById('fontSizeMobileInput');
            if (fontSizeMobileInput) {
                // Default to 16px if not set
                fontSizeMobileInput.value = data.value || '16';
                
                // Update preview
                updateFontSizePreview('mobile');
            }
        }
    })
    .catch(function(error) {
        // Silently fail, no need to show errors for font size loading
    });
}

// Function to save font size settings
function saveFontSize() {
    const fontSizeDesktopInput = document.getElementById('fontSizeDesktopInput');
    const fontSizeMobileInput = document.getElementById('fontSizeMobileInput');
    
    if (!fontSizeDesktopInput || !fontSizeMobileInput) {
        return;
    }
    
    const fontSizeDesktop = fontSizeDesktopInput.value;
    const fontSizeMobile = fontSizeMobileInput.value;
    
    // Validate desktop input (ensure it's between 10 and 32)
    if (fontSizeDesktop < 10 || fontSizeDesktop > 32) {
        safeShowNotification('Desktop font size must be between 10 and 32 pixels', 'error');
        return;
    }
    
    // Validate mobile input (ensure it's between 10 and 32)
    if (fontSizeMobile < 10 || fontSizeMobile > 32) {
        safeShowNotification('Mobile font size must be between 10 and 32 pixels', 'error');
        return;
    }
    
    // Save desktop setting to server
    const desktopPromise = fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: `action=set&key=note_font_size_desktop&value=${fontSizeDesktop}` 
    });
    
    // Save mobile setting to server
    const mobilePromise = fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: `action=set&key=note_font_size_mobile&value=${fontSizeMobile}` 
    });
    
    // Wait for both promises to resolve
    Promise.all([desktopPromise, mobilePromise])
        .then(function(responses) {
            // Check if both responses are ok
            if (responses[0].ok && responses[1].ok) {
                return Promise.all([responses[0].json(), responses[1].json()]);
            } else {
                throw new Error('Error saving font sizes');
            }
        })
        .then(function(data) {
            if (data[0].success && data[1].success) {
                // Close modal
                closeFontSizeModal();
                
                // Apply font size to current note based on device type
                applyFontSizeToNotes();
                
                // Notification supprimée comme demandé
            } else {
                safeShowNotification('Error saving font size settings', 'error');
            }
        })
        .catch(function(error) {
            safeShowNotification('Error saving font size settings', 'error');
        });
}

// Function to check if we're on a mobile device
function isMobileDevice() {
    return (window.innerWidth <= 800 || 
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

// Function to apply font size to all note editors
function applyFontSizeToNotes() {
    // Apply to the current note editor if it exists
    const noteEditor = document.querySelector('[contenteditable="true"]');
    if (!noteEditor) {
        return;
    }
    
    // Check if we're on mobile or desktop
    const isMobile = isMobileDevice();
    const settingKey = isMobile ? 'note_font_size_mobile' : 'note_font_size_desktop';
    
    // Get the appropriate font size from settings
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: `action=get&key=${settingKey}` 
    })
    .then(function(response) {
        if (!response.ok) return null;
        return response.json();
    })
    .then(function(data) {
        if (data && data.success && data.value) {
            noteEditor.style.fontSize = data.value + 'px';
        }
    })
    .catch(function(error) {
        // Silently fail when loading stored font size
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

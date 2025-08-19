/**
 * AI features for Poznote
 */

let currentSummaryNoteId = null;

/**
 * Generates an AI summary for a given note
 */
async function generateAISummary(noteId) {
    if (!noteId) {
        console.error('Note ID is required');
        return;
    }
    
    currentSummaryNoteId = noteId;
    
    // Show the modal
    showAISummaryModal();
    
    try {
        // Show loading state
        showLoadingState();
        
        const response = await fetch('api_ai_summary.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                note_id: noteId
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Show the summary
            showSummaryResult(data.summary, data.note_title);
        } else {
            // Show the error
            showErrorState(data.error || 'An error occurred while generating the summary');
        }
        
    } catch (error) {
        console.error('Error generating AI summary:', error);
        showErrorState('Connection error. Please try again.');
    }
}

/**
 * Shows the AI summary modal
 */
function showAISummaryModal() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

/**
 * Closes the AI summary modal
 */
function closeAISummaryModal() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        
        // Reset modal state
        resetModalState();
    }
}

/**
 * Shows the loading state
 */
function showLoadingState() {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (contentDiv) contentDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Shows the generated summary
 */
function showSummaryResult(summary, noteTitle) {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    const summaryTextElement = document.getElementById('summaryText');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    
    if (summaryTextElement) {
        summaryTextElement.textContent = summary;
    }
    
    if (contentDiv) contentDiv.style.display = 'block';
    if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
    if (copyBtn) copyBtn.style.display = 'inline-flex';
}

/**
 * Shows the error state
 */
function showErrorState(errorMessage) {
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    const errorMessageElement = document.getElementById('errorMessage');
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (contentDiv) contentDiv.style.display = 'none';
    
    if (errorMessageElement) {
        errorMessageElement.textContent = errorMessage;
    }
    
    if (errorDiv) errorDiv.style.display = 'block';
    if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Regenerates the summary for the current note
 */
function regenerateCurrentSummary() {
    if (currentSummaryNoteId) {
        generateAISummary(currentSummaryNoteId);
    }
}

/**
 * Resets the modal state
 */
function resetModalState() {
    currentSummaryNoteId = null;
    
    const loadingDiv = document.getElementById('aiSummaryLoading');
    const contentDiv = document.getElementById('aiSummaryContent');
    const errorDiv = document.getElementById('aiSummaryError');
    const regenerateBtn = document.getElementById('regenerateSummaryBtn');
    const copyBtn = document.getElementById('copyBtn');
    
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (contentDiv) contentDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    if (regenerateBtn) regenerateBtn.style.display = 'none';
    if (copyBtn) copyBtn.style.display = 'none';
}

/**
 * Copies the summary to clipboard
 */
async function copyToClipboard() {
    const summaryText = document.getElementById('summaryText');
    if (!summaryText) return;
    
    try {
        await navigator.clipboard.writeText(summaryText.textContent);
        
        // Temporary visual feedback
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy text: ', err);
        
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summaryText.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const copyBtn = document.getElementById('copyBtn');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.style.background = '#28a745';
                
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            }
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr);
        }
        document.body.removeChild(textArea);
    }
}

// Handle modal closing by clicking outside
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('aiSummaryModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAISummaryModal();
            }
        });
    }
    
    // Handle closing with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('aiSummaryModal');
            if (modal && modal.style.display === 'flex') {
                closeAISummaryModal();
            }
            
            // Also close AI menu if open
            closeAIMenu();
        }
    });
    
    // Close AI menu if clicking elsewhere
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.ai-dropdown')) {
            closeAIMenu();
        }
    });
});

/**
 * Global variables for the AI menu
 */
let currentAIMenuNoteId = null;
let isAIMenuOpen = false;

/**
 * Shows/hides the AI menu
 */
function toggleAIMenu(event, noteId) {
    event.stopPropagation();
    
    currentAIMenuNoteId = noteId;
    
    // Close all other open menus (settings for example)
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
    
    // Handle the AI menu
    const aiMenu = document.getElementById('aiMenu');
    const aiMenuMobile = document.getElementById('aiMenuMobile');
    
    if (isAIMenuOpen) {
        closeAIMenu();
    } else {
        // Determine which menu to use based on platform
        const activeMenu = aiMenu || aiMenuMobile;
        if (activeMenu) {
            activeMenu.style.display = 'block';
            isAIMenuOpen = true;
        }
    }
}

/**
 * Closes the AI menu
 */
function closeAIMenu() {
    const aiMenu = document.getElementById('aiMenu');
    const aiMenuMobile = document.getElementById('aiMenuMobile');
    
    if (aiMenu) aiMenu.style.display = 'none';
    if (aiMenuMobile) aiMenuMobile.style.display = 'none';
    
    isAIMenuOpen = false;
    currentAIMenuNoteId = null;
}

/**
 * Placeholder function for "Better note"
 * This function can be implemented later with another AI functionality
 */
function betterNote(noteId) {
    console.log('Better note function called for note:', noteId);
    alert('Better note functionality will be implemented soon!');
}

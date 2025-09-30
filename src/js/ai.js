/**
 * AI features for Poznote
 */

let currentSummaryNoteId = null;

/**
 * Generates an AI summary for a given note
 */
async function generateAISummary(noteId) {
    if (!noteId) {
        return;
    }
    
    // Redirect to the dedicated AI summary page
    window.location.href = 'ai_summary.php?note_id=' + encodeURIComponent(noteId);
}

/**
 * Checks for content accuracy and coherence using AI
 */
async function checkErrors(noteId) {
    if (!noteId) {
        return;
    }
    
    // Redirect to the dedicated content verification page
    window.location.href = 'check_errors.php?note_id=' + encodeURIComponent(noteId);
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
    if (copyBtn) copyBtn.style.display = 'inline-flex';
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
    // Keep buttons always visible
    if (regenerateBtn) regenerateBtn.style.display = 'inline-flex';
    if (copyBtn) copyBtn.style.display = 'inline-flex';
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
            copyBtn.innerHTML = '<i class="fa-check"></i> Copied!';
            copyBtn.style.background = '#28a745';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.style.background = '';
            }, 2000);
        }
    } catch (err) {
        
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
                copyBtn.innerHTML = '<i class="fa-check"></i> Copied!';
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
    const aiMenu = document.getElementById('aiMenu-' + noteId);
    
    if (isAIMenuOpen) {
        closeAIMenu();
        return;
    }
    
    // Close any other AI menus first and clear their inline positioning
    const all = document.querySelectorAll('.ai-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // remove any inline positioning we may have added earlier
        el.style.removeProperty('position');
        el.style.removeProperty('left');
        el.style.removeProperty('right');
        el.style.removeProperty('top');
        el.style.removeProperty('bottom');
        el.style.removeProperty('transform');
        el.style.removeProperty('margin-top');
        el.style.removeProperty('z-index');
        el.style.removeProperty('box-shadow');
    });
    
    // Determine which menu to use based on platform
    const activeMenu = aiMenu;
    if (!activeMenu) return;
    
    // Show the active menu
    activeMenu.style.display = 'block';
    
    // If this AI dropdown is inside a mobile container, position it near the button
    try {
        // Find the triggering button: prefer the event target's closest element with class btn-ai
        let triggerBtn = null;
        if (event && event.target) triggerBtn = event.target.closest('.btn-ai');
        if (!triggerBtn) {
            // Fallback: find any btn-ai button (less reliable)
            const btns = document.querySelectorAll('.btn-ai');
            for (let btn of btns) {
                // Check if this button's associated menu matches
                const parent = btn.parentElement || btn.parentNode;
                if (!parent) continue;
                if (parent.querySelector && parent.querySelector('#aiMenu-' + noteId)) {
                    triggerBtn = btn;
                    break;
                }
            }
        }
        
        const isMobileDropdown = !!triggerBtn && !!triggerBtn.closest && triggerBtn.closest('.ai-dropdown') && triggerBtn.closest('.ai-dropdown').classList.contains('mobile');
        
        if (isMobileDropdown && triggerBtn) {
            // Force fixed positioning placed near the button. Use important priority to override stylesheet !important rules.
            const rect = triggerBtn.getBoundingClientRect();
            
            // Make menu invisible but displayed to measure height
            activeMenu.style.visibility = 'hidden';
            activeMenu.style.display = 'block';
            
            // Ensure any previous important declarations are cleared
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');
            
            // Apply fixed positioning with important priority
            activeMenu.style.setProperty('position', 'fixed', 'important');
            // center horizontally on the button
            const centerX = rect.left + rect.width / 2;
            activeMenu.style.setProperty('left', centerX + 'px', 'important');
            activeMenu.style.setProperty('transform', 'translateX(-50%)', 'important');
            activeMenu.style.setProperty('margin-top', '0', 'important');
            activeMenu.style.setProperty('z-index', '20000', 'important');
            activeMenu.style.setProperty('box-shadow', '0 8px 24px rgba(0,0,0,0.18)', 'important');
            
            // Compute space and place above by default
            const menuHeight = activeMenu.getBoundingClientRect().height || activeMenu.offsetHeight || 0;
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            let topPos = rect.top - menuHeight - 8; // 8px gap
            if (topPos < 8 && spaceBelow > spaceAbove) {
                // Not enough space above -> place below the button
                topPos = rect.bottom + 8;
            }
            activeMenu.style.setProperty('top', Math.max(8, topPos) + 'px', 'important');
            // ensure bottom is unset
            activeMenu.style.setProperty('bottom', 'auto', 'important');
            
            // restore visibility
            activeMenu.style.visibility = '';
        } else {
            // Desktop/default behavior: ensure menu is positioned by CSS (absolute)
            // Remove any leftover important positioning
            activeMenu.style.removeProperty('position');
            activeMenu.style.removeProperty('left');
            activeMenu.style.removeProperty('top');
            activeMenu.style.removeProperty('bottom');
            activeMenu.style.removeProperty('transform');
            activeMenu.style.removeProperty('z-index');
        }
    } catch (e) {
        // If anything fails while computing position, fallback to default display
        console.error('Error positioning AI menu:', e);
    }
    
    isAIMenuOpen = true;
    currentAIMenuNoteId = noteId;
}

/**
 * Closes the AI menu
 */
function closeAIMenu() {
    const all = document.querySelectorAll('.ai-menu');
    all.forEach(el => {
        el.style.display = 'none';
        // Remove any inline styles we added for mobile positioning (including important ones)
        try {
            el.style.removeProperty('position');
            el.style.removeProperty('left');
            el.style.removeProperty('right');
            el.style.removeProperty('top');
            el.style.removeProperty('bottom');
            el.style.removeProperty('transform');
            el.style.removeProperty('margin-top');
            el.style.removeProperty('z-index');
            el.style.removeProperty('box-shadow');
            el.style.visibility = '';
        } catch (e) {
            // ignore
        }
    });
    
    isAIMenuOpen = false;
    currentAIMenuNoteId = null;
}

/**
 * Auto Generate Tags - Generates relevant tags for the note
 */
function autoGenerateTags(noteId) {
    if (!noteId) {
        console.error('Note ID is required');
        return;
    }
    
    // Get current workspace from localStorage
    let workspaceParam = '';
    try {
        const stored = localStorage.getItem('poznote_selected_workspace');
        if (stored && stored !== 'Poznote') {
            workspaceParam = '&workspace=' + encodeURIComponent(stored);
        }
    } catch(e) {
        console.error('Error getting workspace from localStorage:', e);
    }
    
    // Redirect to the dedicated Auto Tags page
    window.location.href = 'auto_tags.php?note_id=' + encodeURIComponent(noteId) + workspaceParam;
}

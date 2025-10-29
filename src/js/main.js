// Main initialization script
// This file coordinates initialization of all modules

document.addEventListener('DOMContentLoaded', function() {
    
    // Initialize global variables and workspaces
    initializeWorkspaces();
    
    // Initialize the user interface
    initializeWorkspaceMenu();
    initializeBrowserHistory();
    
    // Initialize all events
    initializeEventListeners();
    
    // Initialize text selection handling for formatting
    initTextSelectionHandlers();
    
    // Initialize automatic update checking (once per day)
    checkForUpdatesAutomatic();
    
    // Restore folder states from localStorage
    restoreFolderStates();
    
    // Restore checklist values from data attributes (after page reload)
    const noteentry = document.querySelector('.noteentry');
    if (noteentry) {
        const checklistInputs = noteentry.querySelectorAll('.checklist-input');
        checklistInputs.forEach(function(input) {
            const savedValue = input.getAttribute('data-value');
            if (savedValue !== null && savedValue !== undefined) {
                input.value = savedValue;
            }
        });
        
        const checklistCheckboxes = noteentry.querySelectorAll('.checklist-checkbox');
        checklistCheckboxes.forEach(function(checkbox) {
            // First check if the 'checked' attribute exists in HTML
            if (checkbox.hasAttribute('checked')) {
                checkbox.checked = true;
            } else {
                // Fallback to data-checked attribute for compatibility
                const savedChecked = checkbox.getAttribute('data-checked');
                if (savedChecked === '1') {
                    checkbox.checked = true;
                } else if (savedChecked === '0') {
                    checkbox.checked = false;
                }
            }
        });
    }
    
    // Initialize Excalidraw border preferences
    if (typeof applyExcalidrawBorderPreferences === 'function') {
        applyExcalidrawBorderPreferences();
        
        // Re-apply border preferences when window gets focus (after returning from settings)
        window.addEventListener('focus', function() {
            applyExcalidrawBorderPreferences();
        });
    }
    
    // Initialize regular image border preferences
    if (typeof applyRegularImageBorderPreferences === 'function') {
        applyRegularImageBorderPreferences();
        
        // Re-apply border preferences when window gets focus (after returning from settings)
        window.addEventListener('focus', function() {
            applyRegularImageBorderPreferences();
        });
    }
    
    
    // Listen for note content changes via mutation observer to restore checklist values
    const handleNoteLoad = function() {
        setTimeout(function() {
            const ne = document.querySelector('.noteentry');
            if (ne) {
                // Restore checklist values when new content loads
                const inputs = ne.querySelectorAll('.checklist-input');
                const checkboxes = ne.querySelectorAll('.checklist-checkbox');
                
                inputs.forEach(function(input) {
                    const savedValue = input.getAttribute('data-value');
                    if (savedValue !== null && savedValue !== undefined) {
                        input.value = savedValue;
                    }
                });
                
                checkboxes.forEach(function(checkbox) {
                    // First check if the 'checked' attribute exists in HTML
                    if (checkbox.hasAttribute('checked')) {
                        checkbox.checked = true;
                    } else {
                        // Fallback to data-checked attribute for compatibility
                        const savedChecked = checkbox.getAttribute('data-checked');
                        if (savedChecked === '1') {
                            checkbox.checked = true;
                        } else if (savedChecked === '0') {
                            checkbox.checked = false;
                        }
                    }
                });
            }
        }, 50);
    };
    
    // Listen for note content changes via mutation observer  
    const contentDiv = document.querySelector('.noteentry');
    if (contentDiv) {
        const observer = new MutationObserver(handleNoteLoad);
        observer.observe(contentDiv, { childList: true, subtree: true });
    }
    
    
});

// Global functions available for HTML (compatibility)
window.newnote = createNewNote;
window.saveNoteImmediately = saveNoteToServer;
window.updatenote = saveNoteToServer; // Legacy alias
window.saveFocusedNoteJS = function() { 
    console.log('[Poznote Auto-Save] Manual save not needed - auto-save active'); 
};
window.deleteNote = deleteNote;
window.toggleFavorite = toggleFavorite;
window.duplicateNote = duplicateNote;
window.showNoteInfo = showNoteInfo;
window.toggleNoteMenu = toggleNoteMenu;
window.toggleWorkspaceMenu = toggleWorkspaceMenu;
window.switchToWorkspace = switchToWorkspace;
window.showAttachmentDialog = showAttachmentDialog;
window.uploadAttachment = uploadAttachment;
window.downloadAttachment = downloadAttachment;
window.deleteAttachment = deleteAttachment;
window.closeModal = closeModal;
window.showNotificationPopup = showNotificationPopup;
window.showContactPopup = showContactPopup;
window.closeContactModal = closeContactModal;
window.newFolder = newFolder;
window.deleteFolder = deleteFolder;
window.executeDeleteFolder = executeDeleteFolder;
window.showDeleteFolderModal = showDeleteFolderModal;
window.selectFolder = selectFolder;
window.toggleFolder = toggleFolder;
window.restoreFolderStates = restoreFolderStates;
window.showNewWorkspacePrompt = showNewWorkspacePrompt;
window.deleteCurrentWorkspace = deleteCurrentWorkspace;
window.startDownload = startDownload;
window.toggleSettingsMenu = toggleSettingsMenu;
window.showLoginDisplayNamePrompt = showLoginDisplayNamePrompt;
window.closeLoginDisplayModal = closeLoginDisplayModal;
window.checkForUpdates = checkForUpdates;
window.highlightSearchTerms = highlightSearchTerms;
window.clearSearchHighlights = clearSearchHighlights;
 
window.showMoveFolderFilesDialog = showMoveFolderFilesDialog;
window.executeMoveAllFiles = executeMoveAllFiles;
window.populateTargetFolderDropdown = populateTargetFolderDropdown;
window.editFolderName = editFolderName;
window.saveFolderName = saveFolderName;
window.emptyFolder = emptyFolder;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.executeConfirmedAction = executeConfirmedAction;
window.showInputModal = showInputModal;
window.closeInputModal = closeInputModal;
window.executeInputModalAction = executeInputModalAction;
window.showLinkModal = showLinkModal;
window.closeLinkModal = closeLinkModal;
window.executeLinkModalAction = executeLinkModalAction;
window.executeLinkModalRemove = executeLinkModalRemove;
window.showMoveFolderDialog = showMoveFolderDialog;
window.moveNoteToFolder = moveNoteToFolder;
window.showUpdateInstructions = showUpdateInstructions;
window.closeUpdateModal = closeUpdateModal;
window.showCreateNoteInFolderModal = showCreateNoteInFolderModal;
window.showCreateModal = showCreateModal;
window.selectNoteType = selectNoteType;
window.selectCreateType = selectCreateType;
window.createNoteInFolder = createNoteInFolder;
window.executeCreateAction = executeCreateAction;
window.closeUpdateCheckModal = closeUpdateCheckModal;
window.goToSelfHostedUpdateInstructions = goToSelfHostedUpdateInstructions;
window.goToCloudUpdateInstructions = goToCloudUpdateInstructions;

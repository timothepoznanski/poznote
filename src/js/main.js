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
    
    // Initialize checklist listeners (for checkboxes that auto-save)
    const noteentry = document.querySelector('.noteentry');
    if (noteentry && typeof attachChecklistListeners === 'function') {
        attachChecklistListeners(noteentry);
        
        // Restore checklist values from data attributes (after page reload)
        const checklistInputs = noteentry.querySelectorAll('.checklist-input');
        checklistInputs.forEach(function(input) {
            const savedValue = input.getAttribute('data-value');
            if (savedValue !== null && savedValue !== undefined) {
                input.value = savedValue;
                console.log('Restored checklist input value:', savedValue);
            }
        });
        
        const checklistCheckboxes = noteentry.querySelectorAll('.checklist-checkbox');
        checklistCheckboxes.forEach(function(checkbox) {
            const savedChecked = checkbox.getAttribute('data-checked');
            if (savedChecked === '1') {
                checkbox.checked = true;
                console.log('Restored checklist checkbox state: checked');
            } else if (savedChecked === '0') {
                checkbox.checked = false;
                console.log('Restored checklist checkbox state: unchecked');
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
    
});

// Global functions available for HTML (compatibility)
window.newnote = createNewNote;
window.updatenote = saveNoteToServer;
window.saveFocusedNoteJS = saveNote;
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

// Functions for element events for elements (compatibility)
window.updateidsearch = updateidsearch;
window.updateidhead = updateidhead;
window.updateidtags = updateidtags;
window.updateidfolder = updateidfolder;
window.updateident = updateident;
window.setupNoteDragDropEvents = setupNoteDragDropEvents;

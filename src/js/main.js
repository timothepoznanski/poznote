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
window.showMoveFolderDialog = showMoveFolderDialog;
window.moveNoteToFolder = moveNoteToFolder;
window.showUpdateInstructions = showUpdateInstructions;
window.closeUpdateModal = closeUpdateModal;
window.showCreateNoteInFolderModal = showCreateNoteInFolderModal;
window.selectNoteType = selectNoteType;
window.createNoteInFolder = createNoteInFolder;
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

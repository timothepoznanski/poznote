// Script principal d'initialisation
// Ce fichier coordonne l'initialisation de tous les modules

document.addEventListener('DOMContentLoaded', function() {
    // Initialiser les variables globales et les workspaces
    initializeWorkspaces();
    
    // Initialiser l'interface utilisateur
    initializeWorkspaceMenu();
    initializeBrowserHistory();
    
    // Initialiser tous les événements
    initializeEventListeners();
    
    // Initialiser la gestion de sélection de texte pour le formatage
    initTextSelectionHandlers();
    
    // Initialiser les états des filtres de dossiers avec un petit délai pour être sûr que le DOM est prêt
    setTimeout(function() {
        initializeFolderSearchFilters();
    }, 100);
});

// Fonctions globales disponibles pour l'HTML (compatibilité)
window.newnote = createNewNote;
window.updatenote = saveNoteToServer;
window.saveFocusedNoteJS = saveNote;
window.deleteNote = deleteNote;
window.toggleFavorite = toggleFavorite;
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
window.showNewWorkspacePrompt = showNewWorkspacePrompt;
window.deleteCurrentWorkspace = deleteCurrentWorkspace;
window.startDownload = startDownload;
window.toggleSettingsMenu = toggleSettingsMenu;
window.foldAllFolders = foldAllFolders;
window.unfoldAllFolders = unfoldAllFolders;
window.showLoginDisplayNamePrompt = showLoginDisplayNamePrompt;
window.closeLoginDisplayModal = closeLoginDisplayModal;
window.checkForUpdates = checkForUpdates;
window.highlightSearchTerms = highlightSearchTerms;
window.clearSearchHighlights = clearSearchHighlights;
window.initializeFolderSearchFilters = initializeFolderSearchFilters;
window.toggleFolderSearchFilter = toggleFolderSearchFilter;
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
window.loadRecentFolders = loadRecentFolders;
window.selectRecentFolder = selectRecentFolder;
window.selectFolderForMove = selectFolderForMove;
window.moveNoteToFolder = moveNoteToFolder;
window.handleFolderSearch = handleFolderSearch;
window.executeFolderAction = executeFolderAction;
window.showUpdateInstructions = showUpdateInstructions;
window.closeUpdateModal = closeUpdateModal;
window.closeUpdateCheckModal = closeUpdateCheckModal;
window.goToUpdateInstructions = goToUpdateInstructions;

// Fonctions pour les événements des éléments (compatibilité)
window.updateidsearch = updateidsearch;
window.updateidhead = updateidhead;
window.updateidtags = updateidtags;
window.updateidfolder = updateidfolder;
window.updateident = updateident;

// Variables globales de l'application
var editedButNotSaved = 0;
var lastudpdate;
var noteid = -1;
var updateNoteEnCours = 0;
var selectedFolder = 'Default';
var defaultFolderName = 'Default';
var selectedWorkspace = 'Poznote';
var currentNoteFolder = null;
var currentNoteIdForAttachments = null;

// Variables pour le déplacement de notes vers des dossiers
var allFolders = [];
var selectedFolderOption = null;
var highlightedIndex = -1;

// Fonctions utilitaires pour les variables globales
function getDefaultFolderName() {
    return defaultFolderName;
}

function updateDefaultFolderName(newName) {
    defaultFolderName = newName;
    if (selectedFolder === 'Uncategorized' || selectedFolder === 'Default') {
        selectedFolder = newName;
    }
}

function getSelectedWorkspace() {
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) return stored;
    } catch(e) {}
    return selectedWorkspace || 'Poznote';
}

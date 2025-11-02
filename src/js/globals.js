// Variables globales de l'application
var noteid = -1;
var selectedFolderId = null; // ID du dossier sélectionné
var selectedFolder = 'Default'; // Nom du dossier (pour affichage uniquement)
var defaultFolderId = null; // ID du dossier par défaut
var defaultFolderName = 'Default';
var selectedWorkspace = 'Poznote';
var currentNoteFolder = null;
var currentNoteFolderId = null; // ID du dossier de la note actuelle
var currentNoteIdForAttachments = null;

// Variables for moving notes to folders
// allFolders contient maintenant des objets {id, name, is_default}
var allFolders = [];

// Map pour accès rapide folder ID -> folder data
var folderMap = new Map();

// Utility functions for global variables
function getDefaultFolderId() {
    return defaultFolderId;
}

function getDefaultFolderName() {
    return defaultFolderName;
}

function updateDefaultFolderName(newName) {
    defaultFolderName = newName;
    if (selectedFolder === 'Uncategorized' || selectedFolder === 'Default') {
        selectedFolder = newName;
    }
}

function updateDefaultFolderId(id) {
    defaultFolderId = id;
}

// Obtenir un dossier par son ID
function getFolderById(id) {
    return folderMap.get(parseInt(id));
}

// Mettre à jour le cache des dossiers
function updateFolderCache(folders) {
    folderMap.clear();
    if (Array.isArray(folders)) {
        folders.forEach(function(folder) {
            if (folder && folder.id !== undefined) {
                folderMap.set(parseInt(folder.id), folder);
                if (folder.is_default) {
                    defaultFolderId = parseInt(folder.id);
                    defaultFolderName = folder.name;
                }
            }
        });
    }
    allFolders = folders || [];
}

function getSelectedWorkspace() {
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) return stored;
    } catch(e) {}
    return selectedWorkspace || 'Poznote';
}

// Apply global preferences on load
document.addEventListener('DOMContentLoaded', function() {
    try {
        var form = new FormData();
        form.append('action', 'get');
        form.append('key', 'emoji_icons_enabled');
        fetch('api_settings.php', { method: 'POST', body: form })
        .then(function(r) { return r.json(); })
        .then(function(j) {
            var enabled = j && j.success && (j.value === '1' || j.value === 'true');
            if (!enabled) document.body.classList.add('emoji-hidden');
            else document.body.classList.remove('emoji-hidden');
        })
        .catch(function(){});
    } catch(e){}
});

// Centralized mobile detection: use CSS breakpoint (max-width: 800px)
function isMobileDevice() {
    if (window.matchMedia) return window.matchMedia('(max-width: 800px)').matches;
    return window.innerWidth <= 800;
}

// Accessibility: set aria-hidden on desktop/mobile variants so assistive tech ignores hidden parts
function updateMobileDesktopAria() {
    try {
        var mq = window.matchMedia && window.matchMedia('(max-width: 800px)');
        var mobileActive = mq ? mq.matches : (window.innerWidth <= 800);
        // Note: aria-hidden is not set for desktop-only/mobile-only since CSS display handles visibility
    } catch (e) {
        // ignore
    }
}

// Initialize on DOMContentLoaded and update on resize
document.addEventListener('DOMContentLoaded', updateMobileDesktopAria);
window.addEventListener('resize', function() {
    // throttle simple: run after short timeout
    clearTimeout(window._poznoteAriaTimeout);
    window._poznoteAriaTimeout = setTimeout(updateMobileDesktopAria, 120);
});

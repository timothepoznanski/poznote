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

// Variables for moving notes to folders
var allFolders = [];

// Utility functions for global variables
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
        var desktopEls = document.querySelectorAll('.desktop-only');
        var mobileEls = document.querySelectorAll('.mobile-only');
        for (var i = 0; i < desktopEls.length; i++) {
            desktopEls[i].setAttribute('aria-hidden', mobileActive ? 'true' : 'false');
        }
        for (var j = 0; j < mobileEls.length; j++) {
            mobileEls[j].setAttribute('aria-hidden', mobileActive ? 'false' : 'true');
        }
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

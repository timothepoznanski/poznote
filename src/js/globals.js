// Variables globales de l'application
var noteid = -1;
var selectedFolderId = null; // ID du dossier sélectionné
var selectedFolder = null; // Nom du dossier (pour affichage uniquement)
// Initialize from window.selectedWorkspace if available (set by PHP), otherwise empty string
var selectedWorkspace = (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : '';
var currentNoteFolder = null;
var currentNoteFolderId = null; // ID du dossier de la note actuelle
var currentNoteIdForAttachments = null;

// Variables for moving notes to folders
var allFolders = [];

// Map pour accès rapide folder ID -> folder data
var folderMap = new Map();

// Obtenir un dossier par son ID
function getFolderById(id) {
    return folderMap.get(parseInt(id));
}

// Mettre à jour le cache des dossiers
function updateFolderCache(folders) {
    folderMap.clear();
    if (Array.isArray(folders)) {
        folders.forEach(function (folder) {
            if (folder && folder.id !== undefined) {
                folderMap.set(parseInt(folder.id), folder);
            }
        });
    }
    allFolders = folders || [];
}

function getSelectedWorkspace() {
    // Return workspace from global variable (set by PHP from URL/database)
    // No more localStorage dependency
    var _dataWorkspace = document.body ? document.body.getAttribute('data-workspace') : null;
    return selectedWorkspace || (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace ? window.selectedWorkspace : '') || _dataWorkspace || '';
}

// Apply global preferences on load
document.addEventListener('DOMContentLoaded', function () {
    try {
        fetch('/api/v1/settings/emoji_icons_enabled', {
            method: 'GET',
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var enabled = j && j.success && (j.value === '1' || j.value === 'true');
                if (!enabled) document.body.classList.add('emoji-hidden');
                else document.body.classList.remove('emoji-hidden');
            })
            .catch(function () { });
    } catch (e) { }

    // Apply hide inline attachment images setting
    try {
        fetch('/api/v1/settings/hide_inline_attachment_images', {
            method: 'GET',
            credentials: 'same-origin'
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                // With invertLogic: '1' = show (don't hide), '0' or null = hide
                var hideImages = j && j.success && (j.value === '0' || j.value === 'false');
                if (hideImages) document.body.classList.add('hide-inline-attachment-images');
                else document.body.classList.remove('hide-inline-attachment-images');
            })
            .catch(function () {
                // On error, default to hiding images  
                document.body.classList.add('hide-inline-attachment-images');
            });
    } catch (e) {
        document.body.classList.add('hide-inline-attachment-images');
    }
});

// Centralized mobile detection: use CSS breakpoint (max-width: 800px)
function isMobileDevice() {
    if (window.matchMedia) return window.matchMedia('(max-width: 800px)').matches;
    return window.innerWidth <= 800;
}

// --- i18n (client-side) ---
// Loads merged translations from api_i18n.php and exposes window.t(key, vars, fallback)
(function () {
    if (window.t && window.loadPoznoteI18n) return;

    window.POZNOTE_I18N = window.POZNOTE_I18N || { lang: 'en', strings: {} };

    function getByPath(obj, key) {
        if (!obj || !key) return null;
        var parts = String(key).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== 'object' || !(parts[i] in cur)) return null;
            cur = cur[parts[i]];
        }
        return (typeof cur === 'string') ? cur : null;
    }

    window.t = function (key, vars, fallback) {
        var str = getByPath(window.POZNOTE_I18N && window.POZNOTE_I18N.strings, key);
        if (str == null) str = (fallback != null ? String(fallback) : String(key));
        if (vars && typeof vars === 'object') {
            for (var k in vars) {
                if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
                str = str.split('{{' + k + '}}').join(String(vars[k]));
            }
        }
        return str;
    };

    window.applyI18nToDom = function (root) {
        try {
            root = root || document;
            var nodes = root.querySelectorAll('[data-i18n]');
            for (var i = 0; i < nodes.length; i++) {
                var el = nodes[i];
                var key = el.getAttribute('data-i18n');
                var mode = el.getAttribute('data-i18n-mode') || 'text'; // text | html
                var value = window.t(key);
                if (mode === 'html') el.innerHTML = value;
                else el.textContent = value;
            }
            var placeholders = root.querySelectorAll('[data-i18n-placeholder]');
            for (var j = 0; j < placeholders.length; j++) {
                var inp = placeholders[j];
                var pKey = inp.getAttribute('data-i18n-placeholder');
                inp.setAttribute('placeholder', window.t(pKey));
            }
            if (window.POZNOTE_I18N && window.POZNOTE_I18N.lang) {
                document.documentElement.setAttribute('lang', window.POZNOTE_I18N.lang);
            }
        } catch (e) {
            // ignore
        }
    };

    window.loadPoznoteI18n = function () {
        return fetch('api/v1/system/i18n', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (j && j.success && j.strings) {
                    window.POZNOTE_I18N = { lang: j.lang || 'en', strings: j.strings };
                    window.applyI18nToDom(document);
                    try { document.dispatchEvent(new CustomEvent('poznote:i18n:loaded', { detail: window.POZNOTE_I18N })); } catch (e) { }
                }
            })
            .catch(function () { });
    };

    document.addEventListener('DOMContentLoaded', function () {
        window.loadPoznoteI18n();
    });
})();

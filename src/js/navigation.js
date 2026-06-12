// Common navigation utilities for Poznote pages
// This file provides shared navigation functions used across multiple pages

/**
 * Get workspace from data-attribute on body (set by PHP)
 * @returns {string} The workspace value or empty string
 */
function getPageWorkspace() {
    var body = document.body;
    return body ? body.getAttribute('data-workspace') || '' : '';
}

/**
 * Get the effective workspace from global variable or page data (no more localStorage)
 * @param {string} fallbackWorkspace - The fallback workspace from page data
 * @returns {string} The workspace to use
 */
function getEffectiveWorkspace(fallbackWorkspace) {
    // Use global selectedWorkspace (set by PHP from URL/database)
    if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace && selectedWorkspace !== '') {
        return selectedWorkspace;
    }
    if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace && window.selectedWorkspace !== '') {
        return window.selectedWorkspace;
    }
    return fallbackWorkspace || '';
}

/**
 * Build a URL with optional parameters
 * @param {string} baseUrl - The base URL (e.g., 'index.php')
 * @param {Object} params - Key-value pairs for query parameters
 * @returns {string} The complete URL with query string
 */
function buildUrl(baseUrl, params) {
    var queryParts = [];
    for (var key in params) {
        if (params.hasOwnProperty(key) && params[key] !== '' && params[key] !== null && params[key] !== undefined) {
            queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
        }
    }
    if (queryParts.length > 0) {
        return baseUrl + '?' + queryParts.join('&');
    }
    return baseUrl;
}

function getUrlNoteContext() {
    try {
        var params = new URLSearchParams(window.location.search || '');
        var noteId = params.get('note');
        if (noteId && /^\d+$/.test(noteId)) {
            return { type: 'note', noteId: noteId };
        }

        var folderId = params.get('kanban');
        if (folderId && /^\d+$/.test(folderId)) {
            return { type: 'kanban', folderId: folderId };
        }
    } catch (e) {
        // Ignore malformed URLs and fall back to stored tabs.
    }

    return null;
}

function getStoredActiveTabContext(workspace) {
    try {
        var storageWorkspace = workspace || 'default';
        var raw = localStorage.getItem('poznote_tabs_' + storageWorkspace);
        if (!raw) return null;

        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) return null;

        var activeTab = null;
        for (var i = 0; i < data.tabs.length; i++) {
            if (data.tabs[i] && data.tabs[i].id === data.activeTabId) {
                activeTab = data.tabs[i];
                break;
            }
        }
        if (!activeTab) activeTab = data.tabs[0];
        if (!activeTab) return null;

        if (activeTab.type === 'kanban' && activeTab.folderId) {
            return { type: 'kanban', folderId: String(activeTab.folderId) };
        }
        if (activeTab.noteId) {
            return { type: 'note', noteId: String(activeTab.noteId) };
        }
    } catch (e) {
        // Storage may be unavailable in private mode.
    }

    return null;
}

function getBackToNotesUrl() {
    var pageWorkspace = getPageWorkspace();
    var workspace = getEffectiveWorkspace(pageWorkspace);
    var params = {};
    var context = getUrlNoteContext() || getStoredActiveTabContext(workspace);

    if (workspace) {
        params.workspace = workspace;
    }
    if (context && context.type === 'note' && context.noteId) {
        params.note = context.noteId;
    } else if (context && context.type === 'kanban' && context.folderId) {
        params.kanban = context.folderId;
    }

    return buildUrl('index.php', params);
}

/**
 * Navigate back to the notes list (index.php)
 * Uses workspace from localStorage with fallback to page data-attribute
 */
function goBackToNotes() {
    window.location.href = getBackToNotesUrl();
}

/**
 * Navigate back to a specific note
 * Uses workspace from localStorage with fallback to page data-attribute
 * @param {string|number} noteId - The note ID to navigate to (optional, reads from data-note-id if not provided)
 */
function goBackToNote(noteId) {
    var body = document.body;
    var id = noteId || (body ? body.getAttribute('data-note-id') : null);
    var pageWorkspace = getPageWorkspace();
    var workspace = getEffectiveWorkspace(pageWorkspace);
    
    var params = {};
    if (id) {
        params.note = id;
    }
    if (workspace) {
        params.workspace = workspace;
    }
    
    var url = buildUrl('index.php', params);
    window.location.href = url;
}

/**
 * Navigate to a specific page with workspace preserved
 * @param {string} page - The page to navigate to (e.g., 'trash.php')
 */
function navigateToPage(page) {
    var pageWorkspace = getPageWorkspace();
    var workspace = getEffectiveWorkspace(pageWorkspace);
    var url = buildUrl(page, { workspace: workspace });
    window.location.href = url;
}

/**
 * Navigate back to Home (dashboard.php)
 * Preserves workspace when available.
 */
function goBackToHome() {
    navigateToPage('dashboard.php');
}

// Expose functions globally
window.getPageWorkspace = getPageWorkspace;
window.getEffectiveWorkspace = getEffectiveWorkspace;
window.buildUrl = buildUrl;
window.getStoredActiveTabContext = getStoredActiveTabContext;
window.getBackToNotesUrl = getBackToNotesUrl;
window.goBackToNotes = goBackToNotes;
window.goBackToNote = goBackToNote;
window.navigateToPage = navigateToPage;
window.goBackToHome = goBackToHome;

document.addEventListener('DOMContentLoaded', function () {
    var backToNotesLink = document.getElementById('backToNotesLink');
    if (backToNotesLink) {
        backToNotesLink.href = getBackToNotesUrl();
    }
});

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
 * Get the effective workspace, checking localStorage first then falling back to page data
 * @param {string} fallbackWorkspace - The fallback workspace from page data
 * @returns {string} The workspace to use
 */
function getEffectiveWorkspace(fallbackWorkspace) {
    try {
        var workspace = localStorage.getItem('poznote_selected_workspace');
        if (workspace && workspace !== '') {
            return workspace;
        }
    } catch(e) {
        // localStorage not available
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

/**
 * Navigate back to the notes list (index.php)
 * Uses workspace from localStorage with fallback to page data-attribute
 */
function goBackToNotes() {
    var pageWorkspace = getPageWorkspace();
    var workspace = getEffectiveWorkspace(pageWorkspace);
    var url = buildUrl('index.php', { workspace: workspace });
    window.location.href = url;
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

// Expose functions globally
window.getPageWorkspace = getPageWorkspace;
window.getEffectiveWorkspace = getEffectiveWorkspace;
window.buildUrl = buildUrl;
window.goBackToNotes = goBackToNotes;
window.goBackToNote = goBackToNote;
window.navigateToPage = navigateToPage;

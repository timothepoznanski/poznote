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
        console.debug('navigation: getUrlNoteContext() failed:', e);
    }

    return null;
}

function getStoredActiveTabContext(workspace) {
    try {
        var storageWorkspace = workspace || 'default';
        var raw = localStorage.getItem(window.__poznoteTabsStorageKey(storageWorkspace));
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
        console.debug('navigation: getStoredActiveTabContext() failed:', e);
    }

    return null;
}

/**
 * True when this workspace has a stored tab state holding no tab at all: the
 * user closed every note pane tab, so index.php must be told to leave the
 * pane empty (blank=1) rather than fall back to the last edited note, which
 * would come back with no tab to close it (issue #1462). A browser that
 * stored nothing yet is a first visit, and keeps the fallback.
 * @param {string} workspace
 * @returns {boolean}
 */
function hasEmptyStoredTabs(workspace) {
    try {
        var raw = localStorage.getItem(window.__poznoteTabsStorageKey(workspace || 'default'));
        if (!raw) return false;

        var data = JSON.parse(raw);
        return !!data && Array.isArray(data.tabs) && data.tabs.length === 0;
    } catch (e) {
        // Storage may be unavailable in private mode.
        console.debug('navigation: hasEmptyStoredTabs() failed:', e);
        return false;
    }
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
    } else if (hasEmptyStoredTabs(workspace)) {
        params.blank = '1';
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
window.hasEmptyStoredTabs = hasEmptyStoredTabs;
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

    // The rail's Home link is rendered server-side as a plain index.php link,
    // where the note pane falls back to the last edited note. While every tab
    // is closed that pane must stay empty (issue #1462), which only the
    // browser knows about: carry the flag on the link.
    var homeLink = document.getElementById('iconSidebarHomeBtn');
    if (homeLink && homeLink.tagName === 'A' && hasEmptyStoredTabs(getEffectiveWorkspace(getPageWorkspace()))) {
        try {
            var homeUrl = new URL(homeLink.getAttribute('href') || 'index.php', window.location.href);
            homeUrl.searchParams.set('blank', '1');
            homeLink.setAttribute('href', homeUrl.pathname + homeUrl.search);
        } catch (e) {
            console.debug('navigation: home link update failed:', e);
        }
    }
});

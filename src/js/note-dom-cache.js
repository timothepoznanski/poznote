/**
 * Note DOM cache.
 * 
 * Keeps the rendered DOM of recently opened notes so switching back to one is instant.
 * Entries are keyed by workspace + note and dropped whenever a search context or an
 * edit could make them stale.
 */

// Global variables for note loading
var currentLoadingNoteId = null;
var isNoteLoading = false;
var imageClickHandlerInitialized = false;
var NOTE_DOM_CACHE_LIMIT = 8;
var noteDomCache = new Map();

function getNoteDomCacheWorkspace(url) {
    try {
        var target = new URL(url, window.location.origin);
        var urlWorkspace = target.searchParams.get('workspace');
        if (urlWorkspace) return urlWorkspace;
    } catch (e) { /* ignore */ }

    if (typeof getSelectedWorkspace === 'function') {
        var selected = getSelectedWorkspace();
        if (selected) return selected;
    }

    return window.selectedWorkspace || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
}

function getNoteDomCacheKey(noteId, url) {
    var publicFlag = (typeof window.isPublicWorkspaceNavigationActive === 'function' && window.isPublicWorkspaceNavigationActive()) ? 'public' : 'private';
    return publicFlag + '|' + getNoteDomCacheWorkspace(url) + '|' + String(noteId);
}

function urlHasSearchContext(url) {
    var searchKeys = ['search', 'tags_search', 'unified_search', 'created_from', 'created_to', 'search_combined'];
    try {
        var target = new URL(url, window.location.origin);
        for (var i = 0; i < searchKeys.length; i++) {
            if ((target.searchParams.get(searchKeys[i]) || '').trim() !== '') {
                return true;
            }
        }
    } catch (e) { /* ignore */ }

    return false;
}

function isNoteDomCacheAllowed(url, noteId, options) {
    options = options || {};
    if (!noteId || noteId === -1 || noteId === 'search') return false;
    if (options.needsRefresh || options.disableDomCache) return false;
    if (urlHasSearchContext(url) || urlHasSearchContext(window.location.href)) return false;
    if (typeof window.isSearchMode !== 'undefined' && window.isSearchMode) return false;
    return true;
}

// Drop a cache entry, destroying any CodeMirror editors still living in its
// detached fragment so their instances (and theme observers) don't leak.
function dropNoteDomCacheEntry(key) {
    var entry = noteDomCache.get(key);
    if (entry && entry.fragment && typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
        window.destroyMarkdownCodeMirrorEditorsWithin(entry.fragment);
    }
    noteDomCache.delete(key);
}

function trimNoteDomCache(exceptKey) {
    while (noteDomCache.size > NOTE_DOM_CACHE_LIMIT) {
        var oldestKey = null;
        noteDomCache.forEach(function (_entry, key) {
            if (oldestKey === null && key !== exceptKey) oldestKey = key;
        });
        if (oldestKey === null) break;
        dropNoteDomCacheEntry(oldestKey);
    }
}

function invalidateNoteDomCache(noteId) {
    if (!noteId) return;
    noteId = String(noteId);
    var keysToDelete = [];
    noteDomCache.forEach(function (entry, key) {
        if (entry && String(entry.noteId) === noteId) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(function (key) {
        dropNoteDomCacheEntry(key);
    });
}

function storeCurrentNoteDomInCache(nextNoteId, targetUrl, options) {
    options = options || {};
    var currentRightColumn = document.getElementById('right_col');
    if (!currentRightColumn) return;

    var currentEntry = currentRightColumn.querySelector('.noteentry[data-note-id]');
    if (!currentEntry) return;

    var currentNoteId = currentEntry.getAttribute('data-note-id');
    if (!currentNoteId || String(currentNoteId) === String(nextNoteId)) return;
    if (!isNoteDomCacheAllowed(window.location.href, currentNoteId, options)) return;

    if (typeof notesNeedingRefresh !== 'undefined' && notesNeedingRefresh.has(String(currentNoteId))) {
        invalidateNoteDomCache(currentNoteId);
        return;
    }

    if (typeof window.hasUnsavedChanges === 'function' && window.hasUnsavedChanges(currentNoteId)) {
        invalidateNoteDomCache(currentNoteId);
        return;
    }

    var key = getNoteDomCacheKey(currentNoteId, window.location.href || targetUrl || '');
    var fragment = document.createDocumentFragment();
    while (currentRightColumn.firstChild) {
        fragment.appendChild(currentRightColumn.firstChild);
    }

    dropNoteDomCacheEntry(key);
    noteDomCache.set(key, {
        noteId: String(currentNoteId),
        fragment: fragment,
        cachedAt: Date.now()
    });
    trimNoteDomCache(key);
}

function clearKanbanStateForNoteLoad(options) {
    if (!options || !options.clearKanbanFlags) return;
    if (typeof window.resetKanbanViewState === 'function') {
        window.resetKanbanViewState();
    } else {
        window._isKanbanViewActive = false;
        window._kanbanFolderId = null;
        window._originalRightColContent = null;
    }
}

function finishNoteLoadVisualState(options) {
    options = options || {};
    if (options.skipLoadingAnimation) {
        var rightColEl = document.getElementById('right_col');
        if (rightColEl) rightColEl.classList.remove('note-fade-out');
        if (!options.updateSelectionBeforeLoad && options.clickedLink) {
            updateSelectedNote(options.clickedLink);
        }
        return;
    }

    setTimeout(function () {
        hideNoteLoadingState();
        if (!options.updateSelectionBeforeLoad && options.clickedLink) {
            updateSelectedNote(options.clickedLink);
        }
    }, 40);
}

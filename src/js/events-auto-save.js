// Auto-save system for Poznote
// Handles local storage drafts and debounced server synchronization

// Auto-save state variables (shared globally)
var saveTimeout;
var lastSavedContent = null;
var lastSavedTitle = null;
var lastSavedTags = null;
var isOnline = navigator.onLine;
var notesNeedingRefresh = new Set();
var changeCheckThrottle = null;
var lastChangeCheckTime = 0;
var CHANGE_CHECK_INTERVAL = 400;
var localStorageSaveTimer = null;

// Setup auto-save system with online/offline detection
function setupAutoSaveCheck() {
    // Modern auto-save: local storage + debounced server sync
    // No longer using periodic checks - saves happen immediately locally and debounced to server

    // Setup online/offline detection
    window.addEventListener('online', function () {
        isOnline = true;
        // Try to sync any pending changes
        if (noteid !== -1 && noteid !== 'search' && noteid !== null && noteid !== undefined) {
            var draftKey = 'poznote_draft_' + noteid;
            var draft = localStorage.getItem(draftKey);
            if (draft && draft !== lastSavedContent) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    saveToServerDebounced();
                }, 1000); // Shorter delay when coming back online
            }
        }
        updateConnectionStatus(true);
    });

    window.addEventListener('offline', function () {
        isOnline = false;
        updateConnectionStatus(false);
    });
}

// Update network status - called when connection state changes
function updateConnectionStatus(online) {
    if (online) {
        notesNeedingRefresh.delete(String(noteid));
    }
}

// Warn user before leaving page with unsaved changes
function setupPageUnloadWarning() {
    window.addEventListener('beforeunload', function (e) {
        var currentNoteId = window.noteid;
        if (hasUnsavedChanges(currentNoteId)) {
            // Force immediate save before leaving
            if (isOnline) {
                try {
                    emergencySave(currentNoteId);
                } catch (err) {
                    console.error('[Poznote Auto-Save] Emergency save failed:', err);
                }
            }

            // Show browser warning
            var message = tr(
                'autosave.beforeunload_warning',
                {},
                '⚠️ You have unsaved changes. Are you sure you want to leave?'
            );
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    });
}

// Trigger auto-save when note content or metadata changes
function markNoteAsModified() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    // Throttle expensive innerHTML comparisons to avoid lag when typing
    var now = Date.now();
    if (now - lastChangeCheckTime < CHANGE_CHECK_INTERVAL) {
        // Too soon - schedule a deferred check instead
        if (!changeCheckThrottle) {
            changeCheckThrottle = setTimeout(function () {
                changeCheckThrottle = null;
                markNoteAsModified();
            }, CHANGE_CHECK_INTERVAL - (now - lastChangeCheckTime));
        }
        return;
    }

    lastChangeCheckTime = now;

    // Check if there are actually changes before triggering save process
    var entryElem = document.getElementById("entry" + noteid);
    var titleInput = document.getElementById("inp" + noteid);
    var tagsElem = document.getElementById("tags" + noteid);

    // For title and tags, comparison is cheap
    var currentTitle = titleInput ? titleInput.value : '';
    var currentTags = tagsElem ? tagsElem.value : '';

    // Initialize lastSaved states if not set
    if (typeof lastSavedContent === 'undefined') lastSavedContent = null;
    if (typeof lastSavedTitle === 'undefined') lastSavedTitle = null;
    if (typeof lastSavedTags === 'undefined') lastSavedTags = null;

    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;

    // Use requestIdleCallback for expensive innerHTML comparison (or fallback to immediate)
    var checkContentAndSave = function () {
        var currentContent = entryElem ? entryElem.innerHTML : '';
        var contentChanged = currentContent !== lastSavedContent;

        if (!contentChanged && !titleChanged && !tagsChanged) {
            return;
        }

        // Modern auto-save: save to localStorage immediately
        saveToLocalStorage();

        // Mark this note as having pending changes (until server save completes)
        notesNeedingRefresh.add(String(noteid));

        // Visual indicator: add red dot to page title when there are unsaved changes
        if (!document.title.startsWith('🔴')) {
            document.title = '🔴 ' + document.title;
        }

        // Debounced server save (increased to 3s for better performance)
        clearTimeout(saveTimeout);
        var currentNoteId = noteid; // Capture current note ID
        saveTimeout = setTimeout(function () {
            // Only save if we're still on the same note
            if (noteid === currentNoteId && isOnline) {
                saveToServerDebounced();
            }
        }, 3000); // 3 second debounce (increased from 2s)
    };

    // If title or tags changed, check immediately; otherwise use idle callback
    if (titleChanged || tagsChanged) {
        checkContentAndSave();
    } else {
        // Schedule during browser idle time to avoid blocking typing
        if (window.requestIdleCallback) {
            window.requestIdleCallback(checkContentAndSave, { timeout: 500 });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(checkContentAndSave, 0);
        }
    }
}

// Save note content and metadata to localStorage immediately
function saveToLocalStorage() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) return;

    // Debounce localStorage writes (they can be expensive with large content)
    clearTimeout(localStorageSaveTimer);
    localStorageSaveTimer = setTimeout(function () {
        try {
            var entryElem = document.getElementById("entry" + noteid);
            var titleInput = document.getElementById("inp" + noteid);
            var tagsElem = document.getElementById("tags" + noteid);

            if (entryElem) {
                // Serialize checklist data before saving
                serializeChecklists(entryElem);

                var content = entryElem.innerHTML;
                var draftKey = 'poznote_draft_' + noteid;
                localStorage.setItem(draftKey, content);

                // Also save title and tags
                if (titleInput) {
                    localStorage.setItem('poznote_title_' + noteid, titleInput.value);
                }
                if (tagsElem) {
                    localStorage.setItem('poznote_tags_' + noteid, tagsElem.value);
                }
            }
        } catch (err) {
            // localStorage quota exceeded or other error
            console.warn('Failed to save to localStorage:', err);
        }
    }, 300); // Debounce localStorage by 300ms
}

// Debounced server save - triggered after user stops typing
function saveToServerDebounced() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) return;

    // Clear the timeout since we're executing the save now
    clearTimeout(saveTimeout);
    saveTimeout = null;

    // Check that the note elements still exist (user might have navigated away)
    var titleInput = document.getElementById("inp" + noteid);
    var entryElem = document.getElementById("entry" + noteid);
    if (!titleInput || !entryElem) {
        return;
    }

    // Check if content has actually changed
    var draftKey = 'poznote_draft_' + noteid;
    var titleKey = 'poznote_title_' + noteid;
    var tagsKey = 'poznote_tags_' + noteid;

    var currentDraft = localStorage.getItem(draftKey);
    var currentTitle = localStorage.getItem(titleKey);
    var currentTags = localStorage.getItem(tagsKey);

    var contentChanged = currentDraft !== lastSavedContent;
    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;

    if (!contentChanged && !titleChanged && !tagsChanged) {
        // No changes detected
        return;
    }

    // Trigger server save
    saveNoteToServer();
}

// Check if current note has unsaved changes (pending server save)
function hasUnsavedChanges(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') return false;

    // Check if there's a pending server save timeout
    if (saveTimeout !== null && saveTimeout !== undefined) {
        return true;
    }

    // Check if note is marked as needing refresh (has pending changes)
    if (notesNeedingRefresh.has(String(noteId))) {
        return true;
    }

    // Also check if page title still has unsaved indicator
    if (document.title.startsWith('🔴')) {
        return true;
    }

    return false;
}

// Emergency save function for page unload scenarios
function emergencySave(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') return;

    var entryElem = document.getElementById("entry" + noteId);
    var titleInput = document.getElementById("inp" + noteId);
    var tagsElem = document.getElementById("tags" + noteId);
    var folderElem = document.getElementById("folder" + noteId);

    if (!entryElem || !titleInput) {
        return;
    }

    // Serialize checklist data before saving
    serializeChecklists(entryElem);

    var headi = titleInput.value || '';

    // If title is empty, only use placeholder if it matches default note title patterns
    // Support both English and French (and potentially other languages)
    if (headi === '' && titleInput.placeholder) {
        var placeholderPatterns = [
            /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
            /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
        ];

        var isDefaultPlaceholder = placeholderPatterns.some(function (pattern) {
            return pattern.test(titleInput.placeholder);
        });

        if (isDefaultPlaceholder) {
            headi = titleInput.placeholder;
        }
    }

    var ent = entryElem.innerHTML.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    var tags = tagsElem ? tagsElem.value : '';
    var folder = folderElem ? folderElem.value : null; // No folder selected

    // Get folder_id from hidden input field
    var folderIdElem = document.getElementById("folderId" + noteId);
    var folder_id = null;
    if (folderIdElem && folderIdElem.value !== '') {
        folder_id = parseInt(folderIdElem.value);
        // Ensure it's a valid number, not NaN or 0
        if (isNaN(folder_id) || folder_id === 0) {
            folder_id = null;
        }
    }

    var updates = {
        heading: headi,
        content: ent,
        tags: tags,
        folder: folder,
        folder_id: folder_id,
        workspace: (window.selectedWorkspace || getSelectedWorkspace())
    };

    // Strategy 1: Try fetch with keepalive (most reliable)
    // Use RESTful API: PATCH /api/v1/notes/{id}
    try {
        fetch("/api/v1/notes/" + noteId, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(updates),
            keepalive: true
        }).then(function () {
        }).catch(function (err) {
            console.error('[Poznote Auto-Save] Emergency fetch failed:', err);
        });
    } catch (err) {
        // Strategy 2: Fallback to sendBeacon with FormData
        // Uses dedicated beacon endpoint that accepts FormData
        try {
            var formData = new FormData();
            formData.append('content', ent);
            formData.append('workspace', window.selectedWorkspace || getSelectedWorkspace());

            if (navigator.sendBeacon('/api/v1/notes/' + noteId + '/beacon', formData)) {
            } else {
                console.warn('[Poznote Auto-Save] sendBeacon failed to queue');
            }
        } catch (beaconErr) {
            console.error('[Poznote Auto-Save] sendBeacon failed:', beaconErr);

            // Strategy 3: Last resort - synchronous XMLHttpRequest (deprecated but works)
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/v1/notes/' + noteId + '/beacon', false);
                xhr.send(formData);
            } catch (xhrErr) {
                console.error('[Poznote Auto-Save] All save strategies failed:', xhrErr);
            }
        }
    }
}

// Restore note content from localStorage draft
function restoreDraft(noteId, content, title, tags) {
    var entryElem = document.getElementById('entry' + noteId);
    var titleInput = document.getElementById('inp' + noteId);
    var tagsInput = document.getElementById('tags' + noteId);

    if (entryElem && content) {
        var noteType = entryElem.getAttribute('data-note-type') || 'note';
        if (noteType === 'note') {
            // Fix drafts that stored escaped media tags
            content = content
                .replace(/&lt;audio\s+([^&]+)&gt;\s*&lt;\/audio&gt;/gi, '<audio $1></audio>')
                .replace(/&lt;video\s+([^&]+)&gt;\s*&lt;\/video&gt;/gi, '<video $1></video>')
                .replace(/&lt;iframe\s+([^&]+)&gt;\s*&lt;\/iframe&gt;/gi, '<iframe $1></iframe>');
        }
        entryElem.innerHTML = content;

        // Convert any restored <audio> elements to iframes for contenteditable
        if (typeof window.convertNoteAudioToIframes === 'function') {
            window.convertNoteAudioToIframes();
        }
    }
    if (titleInput && title) {
        titleInput.value = title;
    }
    if (tagsInput && tags) {
        tagsInput.value = tags;
    }

    // Auto-save will handle the restored content automatically
}

// Clear localStorage draft for a specific note
function clearDraft(noteId) {
    try {
        localStorage.removeItem('poznote_draft_' + noteId);
        localStorage.removeItem('poznote_title_' + noteId);
        localStorage.removeItem('poznote_tags_' + noteId);
    } catch (err) {
    }
}

// Reinitialize auto-save state after loading fresh note content from server
function reinitializeAutoSaveState() {
    // Get current note ID from the DOM
    var currentNoteId = null;
    var entryElem = document.querySelector('[id^="entry"]:not([id*="search"])');
    if (entryElem) {
        currentNoteId = extractNoteIdFromEntry(entryElem);
    }

    if (currentNoteId && currentNoteId !== 'search' && currentNoteId !== '-1') {
        // Update global noteid
        if (typeof window !== 'undefined') {
            window.noteid = currentNoteId;
        }

        // Initialize lastSaved* variables with current server content (freshly loaded)
        var entryContent = entryElem.innerHTML;
        var titleInput = document.getElementById('inp' + currentNoteId);
        var tagsElem = document.getElementById('tags' + currentNoteId);

        if (typeof lastSavedContent !== 'undefined') {
            lastSavedContent = entryContent;
        }
        if (typeof lastSavedTitle !== 'undefined' && titleInput) {
            lastSavedTitle = titleInput.value;
        }
        if (typeof lastSavedTags !== 'undefined' && tagsElem) {
            lastSavedTags = tagsElem.value;
        }

        // Clear any stale draft for this note since we just loaded fresh content
        clearDraft(currentNoteId);

        // Remove from refresh list if present
        if (typeof notesNeedingRefresh !== 'undefined') {
            notesNeedingRefresh.delete(String(currentNoteId));
        }
    }
}

// Expose auto-save functions globally
window.markNoteAsModified = markNoteAsModified;
window.hasUnsavedChanges = hasUnsavedChanges;
window.clearDraft = clearDraft;
window.reinitializeAutoSaveState = reinitializeAutoSaveState;
window.updateConnectionStatus = updateConnectionStatus;

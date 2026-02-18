/**
 * Auto-save system for Poznote
 * Handles local storage drafts and debounced server synchronization
 */

// ============================================================================
// STATE VARIABLES
// ============================================================================

// Save timing and debouncing
let saveTimeout = null;
let localStorageSaveTimer = null;
let changeCheckThrottle = null;
let lastChangeCheckTime = 0;
const CHANGE_CHECK_INTERVAL = 400;

// Content tracking for change detection
let lastSavedContent = null;
let lastSavedTitle = null;
let lastSavedTags = null;

// Network and sync state
let isOnline = navigator.onLine;
let notesNeedingRefresh = new Set();
let needsGitPush = false; // Tracks if a Git push is needed for the current note

// ============================================================================
// SETUP & INITIALIZATION
// ============================================================================

/**
 * Setup auto-save system with online/offline detection
 * Modern auto-save: local storage + debounced server sync
 */
function setupAutoSaveCheck() {
    // Setup online event listener
    window.addEventListener('online', () => {
        isOnline = true;

        // Try to sync any pending changes
        if (noteid !== -1 && noteid !== 'search' && noteid !== null && noteid !== undefined) {
            const draftKey = 'poznote_draft_' + noteid;
            const draft = localStorage.getItem(draftKey);

            if (draft && draft !== lastSavedContent) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    saveToServerDebounced();
                }, 1000); // Shorter delay when coming back online
            }
        }
        updateConnectionStatus(true);
    });

    // Setup offline event listener
    window.addEventListener('offline', () => {
        isOnline = false;
        updateConnectionStatus(false);
    });
}

/**
 * Update network status - called when connection state changes
 * @param {boolean} online - Whether the connection is online
 */
function updateConnectionStatus(online) {
    if (online) {
        notesNeedingRefresh.delete(String(noteid));
    }
}

/**
 * Warn user before leaving page with unsaved changes
 * Uses multiple events for better mobile compatibility
 */
function setupPageUnloadWarning() {
    // Desktop and some mobile browsers
    window.addEventListener('beforeunload', (e) => {
        const currentNoteId = window.noteid;

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
            const message = tr(
                'autosave.beforeunload_warning',
                {},
                '⚠️ You have unsaved changes. Are you sure you want to leave?'
            );
            e.preventDefault();
            e.returnValue = message;
            return message;
        } else if (isOnline && needsGitPush && currentNoteId && currentNoteId !== -1 && currentNoteId !== 'search') {
            // No unsaved UI changes, but Git push is pending
            try {
                emergencySave(currentNoteId);
            } catch (err) {
                console.error('[Poznote Auto-Save] Emergency Git push failed:', err);
            }
        }
    });

    // Mobile Safari and some Android browsers (more reliable than beforeunload)
    window.addEventListener('pagehide', (e) => {
        const currentNoteId = window.noteid;

        if (hasUnsavedChanges(currentNoteId)) {
            // Force immediate save before leaving (synchronous for pagehide)
            if (isOnline) {
                try {
                    emergencySave(currentNoteId);
                } catch (err) {
                    console.error('[Poznote Auto-Save] Emergency save via pagehide failed:', err);
                }
            }
        } else if (isOnline && needsGitPush && currentNoteId && currentNoteId !== -1 && currentNoteId !== 'search') {
            // No unsaved UI changes, but Git push is pending
            try {
                emergencySave(currentNoteId);
            } catch (err) {
                console.error('[Poznote Auto-Save] Emergency Git push via pagehide failed:', err);
            }
        }
    });

    // Additional fallback for visibility changes (tab switching, app backgrounding)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const currentNoteId = window.noteid;

            if (hasUnsavedChanges(currentNoteId)) {
                // Force immediate save when page becomes hidden
                if (isOnline) {
                    try {
                        emergencySave(currentNoteId);
                    } catch (err) {
                        console.error('[Poznote Auto-Save] Emergency save via visibilitychange failed:', err);
                    }
                }
            } else if (isOnline && needsGitPush && currentNoteId && currentNoteId !== -1 && currentNoteId !== 'search') {
                // No unsaved UI changes, but Git push is pending
                try {
                    emergencySave(currentNoteId);
                } catch (err) {
                    console.error('[Poznote Auto-Save] Emergency Git push via visibilitychange failed:', err);
                }
            }
        }
    });
}

// ============================================================================
// CHANGE DETECTION & TRIGGER
// ============================================================================

/**
 * Trigger auto-save when note content or metadata changes
 * Uses throttling to avoid performance issues during typing
 */
function markNoteAsModified() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    // Throttle expensive innerHTML comparisons to avoid lag when typing
    const now = Date.now();
    if (now - lastChangeCheckTime < CHANGE_CHECK_INTERVAL) {
        // Too soon - schedule a deferred check instead
        if (!changeCheckThrottle) {
            changeCheckThrottle = setTimeout(() => {
                changeCheckThrottle = null;
                markNoteAsModified();
            }, CHANGE_CHECK_INTERVAL - (now - lastChangeCheckTime));
        }
        return;
    }

    lastChangeCheckTime = now;

    // Get DOM elements
    const entryElem = document.getElementById("entry" + noteid);
    const titleInput = document.getElementById("inp" + noteid);
    const tagsElem = document.getElementById("tags" + noteid);

    // Check title and tags changes (cheap comparisons)
    const currentTitle = titleInput ? titleInput.value : '';
    const currentTags = tagsElem ? tagsElem.value : '';
    const titleChanged = currentTitle !== lastSavedTitle;
    const tagsChanged = currentTags !== lastSavedTags;

    // Function to check content and trigger save if needed
    const checkContentAndSave = () => {
        const currentContent = entryElem ? entryElem.innerHTML : '';
        const contentChanged = currentContent !== lastSavedContent;

        if (!contentChanged && !titleChanged && !tagsChanged) {
            return; // No changes detected
        }

        // Save to localStorage immediately
        saveToLocalStorage();

        // Mark note as having pending changes
        notesNeedingRefresh.add(String(noteid));

        // Visual indicator: add red dot to page title
        if (!document.title.startsWith('🔴')) {
            document.title = '🔴 ' + document.title;
        }

        // Show save indicator (red floppy disk in top right)
        const saveIndicator = document.getElementById('save-indicator');
        if (saveIndicator) {
            saveIndicator.style.display = 'flex';
        }

        // Debounced server save (3s delay for better performance)
        clearTimeout(saveTimeout);
        const currentNoteId = noteid; // Capture current note ID
        saveTimeout = setTimeout(() => {
            // Only save if we're still on the same note
            if (noteid === currentNoteId && isOnline) {
                saveToServerDebounced();
            }
        }, 3000);
    };

    // If title or tags changed, check immediately; otherwise use idle callback
    if (titleChanged || tagsChanged) {
        // Mark as needing git push since user modified content
        needsGitPush = true;
        checkContentAndSave();
    } else {
        // Schedule during browser idle time to avoid blocking typing
        if (window.requestIdleCallback) {
            window.requestIdleCallback(() => {
                // Check if content actually changed before setting flag
                const currentContent = entryElem ? entryElem.innerHTML : '';
                if (currentContent !== lastSavedContent) {
                    needsGitPush = true;
                }
                checkContentAndSave();
            }, { timeout: 500 });
        } else {
            setTimeout(() => {
                // Check if content actually changed before setting flag
                const currentContent = entryElem ? entryElem.innerHTML : '';
                if (currentContent !== lastSavedContent) {
                    needsGitPush = true;
                }
                checkContentAndSave();
            }, 0);
        }
    }
}

// ============================================================================
// LOCAL STORAGE SAVE
// ============================================================================

/**
 * Save note content and metadata to localStorage immediately
 * Debounced to avoid expensive writes with large content
 */
function saveToLocalStorage() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    // Debounce localStorage writes (they can be expensive with large content)
    clearTimeout(localStorageSaveTimer);
    localStorageSaveTimer = setTimeout(() => {
        try {
            const entryElem = document.getElementById("entry" + noteid);
            const titleInput = document.getElementById("inp" + noteid);
            const tagsElem = document.getElementById("tags" + noteid);

            if (entryElem) {
                // Serialize checklist data before saving
                serializeChecklists(entryElem);

                const content = entryElem.innerHTML;
                const draftKey = 'poznote_draft_' + noteid;
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
            console.warn('[Poznote Auto-Save] Failed to save to localStorage:', err);
        }
    }, 300); // Debounce by 300ms
}

// ============================================================================
// SERVER SAVE
// ============================================================================

/**
 * Debounced server save - triggered after user stops typing
 */
function saveToServerDebounced() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    // Clear the timeout since we're executing the save now
    clearTimeout(saveTimeout);
    saveTimeout = null;

    // Check that the note elements still exist (user might have navigated away)
    const titleInput = document.getElementById("inp" + noteid);
    const entryElem = document.getElementById("entry" + noteid);

    if (!titleInput || !entryElem) {
        return;
    }

    // Check if content has actually changed
    const draftKey = 'poznote_draft_' + noteid;
    const titleKey = 'poznote_title_' + noteid;
    const tagsKey = 'poznote_tags_' + noteid;

    const currentDraft = localStorage.getItem(draftKey);
    const currentTitle = localStorage.getItem(titleKey);
    const currentTags = localStorage.getItem(tagsKey);

    const contentChanged = currentDraft !== lastSavedContent;
    const titleChanged = currentTitle !== lastSavedTitle;
    const tagsChanged = currentTags !== lastSavedTags;

    if (!contentChanged && !titleChanged && !tagsChanged) {
        return; // No changes detected
    }

    // Trigger server save
    saveNoteToServer();
}

// ============================================================================
// UNSAVED CHANGES DETECTION
// ============================================================================

/**
 * Check if current note has unsaved changes (pending server save)
 * @param {number|string} noteId - The note ID to check
 * @returns {boolean} True if there are unsaved changes
 */
function hasUnsavedChanges(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') {
        return false;
    }

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

    // Check if Git push is pending (even if saved locally/remote DB)
    if (needsGitPush) {
        return false; // Don't block navigation, just trigger emergencySave via other means
    }

    return false;
}

// ============================================================================
// EMERGENCY SAVE (PAGE UNLOAD)
// ============================================================================

/**
 * Emergency save function for page unload scenarios
 * Uses multiple fallback strategies to ensure data is saved
 * @param {number|string} noteId - The note ID to save
 */
function emergencySave(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') {
        return;
    }

    // Skip if no changes need saving or syncing
    if (!needsGitPush && typeof hasUnsavedChanges === 'function' && !hasUnsavedChanges(noteId)) {
        return;
    }

    const entryElem = document.getElementById("entry" + noteId);
    const titleInput = document.getElementById("inp" + noteId);
    const tagsElem = document.getElementById("tags" + noteId);
    const folderElem = document.getElementById("folder" + noteId);

    if (!entryElem || !titleInput) {
        return;
    }

    // Serialize checklist data before saving
    serializeChecklists(entryElem);

    let headi = titleInput.value || '';

    // If title is empty, use placeholder if it matches default note title patterns
    // Support both English and French (and potentially other languages)
    if (headi === '' && titleInput.placeholder) {
        const placeholderPatterns = [
            /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
            /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
        ];

        const isDefaultPlaceholder = placeholderPatterns.some(pattern => pattern.test(titleInput.placeholder));

        if (isDefaultPlaceholder) {
            headi = titleInput.placeholder;
        }
    }

    const ent = entryElem.innerHTML.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    const tags = tagsElem ? tagsElem.value : '';
    const folder = folderElem ? folderElem.value : null;

    // Get folder_id from hidden input field
    const folderIdElem = document.getElementById("folderId" + noteId);
    let folder_id = null;

    if (folderIdElem && folderIdElem.value !== '') {
        folder_id = parseInt(folderIdElem.value);
        // Ensure it's a valid number, not NaN or 0
        if (isNaN(folder_id) || folder_id === 0) {
            folder_id = null;
        }
    }

    const updates = {
        heading: headi,
        content: ent,
        tags: tags,
        folder: folder,
        folder_id: folder_id,
        workspace: (window.selectedWorkspace || getSelectedWorkspace()),
        git_push: needsGitPush // Push only if changes were made since load
    };

    // Capture the flag value used in this request, then reset it optimistically
    // so that a concurrent regular save doesn't also trigger a second push.
    const gitPushRequested = needsGitPush;
    if (gitPushRequested) {
        needsGitPush = false;
    }

    // Strategy 1: Try fetch with keepalive (most reliable)
    try {
        console.log('[Poznote Auto-Save] Saving note', noteId, '| git_push:', gitPushRequested);
        fetch("/api/v1/notes/" + noteId, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(updates),
            keepalive: true
        }).then(res => res.json()).then(data => {
            if (gitPushRequested) {
                if (data.git_push) {
                    if (data.git_push.triggered) {
                        if (data.git_push.success) {
                            console.log('[Poznote Git] Auto-push success for note', noteId);
                        } else {
                            console.warn('[Poznote Git] Auto-push failed for note', noteId, '-', data.git_push.error || 'unknown error');
                            // Restore flag so next save retries
                            needsGitPush = true;
                        }
                    } else {
                        console.warn('[Poznote Git] Auto-push not triggered:', data.git_push.reason || 'not configured or disabled');
                    }
                } else {
                    console.warn('[Poznote Git] git_push requested but no git_push info in response. Check server logs.');
                }
            }
        }).catch(err => {
            console.error('[Poznote Auto-Save] Emergency fetch failed:', err);
            // Restore flag on network failure so next save retries
            if (gitPushRequested) { needsGitPush = true; }
        });
        return; // Exit if fetch was attempted successfully
    } catch (err) {
        console.error('[Poznote Auto-Save] Fetch strategy failed:', err);
        if (gitPushRequested) { needsGitPush = true; }
    }

    // Strategy 2: Fallback to sendBeacon with FormData
    try {
        const formData = new FormData();
        formData.append('content', ent);
        formData.append('workspace', window.selectedWorkspace || getSelectedWorkspace());

        if (navigator.sendBeacon('/api/v1/notes/' + noteId + '/beacon', formData)) {
            return; // Successfully queued
        }
        console.warn('[Poznote Auto-Save] sendBeacon failed to queue');
    } catch (beaconErr) {
        console.error('[Poznote Auto-Save] sendBeacon failed:', beaconErr);
    }

    // Strategy 3: Last resort - synchronous XMLHttpRequest (deprecated but works)
    try {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('content', ent);
        formData.append('workspace', window.selectedWorkspace || getSelectedWorkspace());

        xhr.open('POST', '/api/v1/notes/' + noteId + '/beacon', false);
        xhr.send(formData);
    } catch (xhrErr) {
        console.error('[Poznote Auto-Save] All save strategies failed:', xhrErr);
    }
}

// ============================================================================
// DRAFT MANAGEMENT
// ============================================================================

/**
 * Restore note content from localStorage draft
 * @param {number|string} noteId - The note ID to restore
 * @param {string} content - Draft content
 * @param {string} title - Draft title
 * @param {string} tags - Draft tags
 */
function restoreDraft(noteId, content, title, tags) {
    const entryElem = document.getElementById('entry' + noteId);
    const titleInput = document.getElementById('inp' + noteId);
    const tagsInput = document.getElementById('tags' + noteId);

    if (entryElem && content) {
        const noteType = entryElem.getAttribute('data-note-type') || 'note';

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

        // Fix existing audio iframes to use audio_player.php
        if (typeof window.fixAudioIframes === 'function') {
            window.fixAudioIframes();
        }
    }

    if (titleInput && title) {
        titleInput.value = title;
    }

    if (tagsInput && tags) {
        tagsInput.value = tags;
    }
}

/**
 * Clear localStorage draft for a specific note
 * @param {number|string} noteId - The note ID to clear draft for
 */
function clearDraft(noteId) {
    try {
        localStorage.removeItem('poznote_draft_' + noteId);
        localStorage.removeItem('poznote_title_' + noteId);
        localStorage.removeItem('poznote_tags_' + noteId);
    } catch (err) {
        console.warn('[Poznote Auto-Save] Failed to clear draft:', err);
    }
}

/**
 * Reinitialize auto-save state after loading fresh note content from server
 * This ensures the auto-save system knows the current "saved" state
 */
function reinitializeAutoSaveState() {
    // Get current note ID from the DOM
    let currentNoteId = null;
    const entryElem = document.querySelector('[id^="entry"]:not([id*="search"])');

    if (entryElem) {
        currentNoteId = extractNoteIdFromEntry(entryElem);
    }

    if (currentNoteId && currentNoteId !== 'search' && currentNoteId !== '-1') {
        // Update global noteid
        if (typeof window !== 'undefined') {
            window.noteid = currentNoteId;
        }

        // Initialize lastSaved* variables with current server content (freshly loaded)
        const entryContent = entryElem.innerHTML;
        const titleInput = document.getElementById('inp' + currentNoteId);
        const tagsElem = document.getElementById('tags' + currentNoteId);

        lastSavedContent = entryContent;
        lastSavedTitle = titleInput ? titleInput.value : null;
        lastSavedTags = tagsElem ? tagsElem.value : null;

        // Clear any stale draft for this note since we just loaded fresh content
        clearDraft(currentNoteId);

        // Remove from refresh list if present
        notesNeedingRefresh.delete(String(currentNoteId));

        // Reset git push flag since we just loaded fresh content
        needsGitPush = false;
    }
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

// Expose auto-save functions globally
window.markNoteAsModified = markNoteAsModified;
window.hasUnsavedChanges = hasUnsavedChanges;
window.clearDraft = clearDraft;
window.reinitializeAutoSaveState = reinitializeAutoSaveState;
window.updateConnectionStatus = updateConnectionStatus;

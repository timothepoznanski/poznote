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

// ============================================================================
// AUTO-PUSH FLAG MANAGEMENT (localStorage only - single source of truth)
// ============================================================================

/**
 * Get current note ID (helper)
 */
function getCurrentNoteId() {
    const id = noteid || window.noteid;
    return (id && id !== -1 && id !== 'search') ? id : null;
}

/**
 * Get the auto-push flag from localStorage
 */
function getAutoPushFlag() {
    const id = getCurrentNoteId();
    if (!id) return false;
    
    try {
        return localStorage.getItem('poznote_needs_auto_push_' + id) === 'true';
    } catch (e) {
        return false;
    }
}

/**
 * Set the auto-push flag in localStorage
 */
function setAutoPushFlag(value) {
    const id = getCurrentNoteId();
    if (!id) return;
    
    // Only log and update if value actually changes
    const currentValue = getAutoPushFlag();
    if (currentValue === value) return;
    
    try {
        if (value) {
            localStorage.setItem('poznote_needs_auto_push_' + id, 'true');
        } else {
            localStorage.removeItem('poznote_needs_auto_push_' + id);
        }
    } catch (e) {
        // Ignore localStorage errors
        console.debug('events-auto-save: setAutoPushFlag() failed:', e);
    }
}

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
                }, 1000);
            }
        }
        updateConnectionStatus(true);
    });

    // Setup offline event listener
    window.addEventListener('offline', () => {
        isOnline = false;
        updateConnectionStatus(false);
    });

    // On a full page load the note rendered by the server never goes through
    // reinitializeNoteContent(): take its baseline here too. This is also
    // where a draft left by a previous session gets picked up after a reload.
    if (document.querySelector('[id^="entry"]:not([id*="search"])')) {
        reinitializeAutoSaveState({ keepNoteId: true, keepAutoPushFlag: true });
    }

    // A draft found on a note that was locked (or whose lock could not be
    // checked, the server being down) when it loaded is looked at again once
    // the note becomes editable, before the user can type over it.
    document.addEventListener('noteEditUnlocked', function (event) {
        const noteId = (event && event.detail && event.detail.noteId) ? String(event.detail.noteId) : '';
        if (noteId && noteId === getDisplayedNoteId()) {
            considerDraftRecovery(noteId);
        }
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

        if (hasUnsavedChangesOnScreen(currentNoteId)) {
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
        }
    });

    // Mobile Safari and some Android browsers (more reliable than beforeunload)
    window.addEventListener('pagehide', (e) => {
        const currentNoteId = window.noteid;

        if (hasUnsavedChangesOnScreen(currentNoteId)) {
            if (isOnline) {
                try {
                    emergencySave(currentNoteId);
                } catch (err) {
                    console.error('[Poznote Auto-Save] Emergency save via pagehide failed:', err);
                }
            }
        }

        if (typeof window.releaseCurrentNoteEditLock === 'function') {
            window.releaseCurrentNoteEditLock();
        }
    });

    // Additional fallback for visibility changes (tab switching, app backgrounding)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const currentNoteId = window.noteid;

            if (hasUnsavedChangesOnScreen(currentNoteId)) {
                if (isOnline) {
                    try {
                        emergencySave(currentNoteId);
                    } catch (err) {
                        console.error('[Poznote Auto-Save] Emergency save via visibilitychange failed:', err);
                    }
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
// An input event happened and its (throttled, idle-time) change check has
// not run yet: the page must not be left before it does
let pendingChangeCheck = false;

function markNoteAsModified() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    if (typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteid)) {
        return;
    }

    pendingChangeCheck = true;

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

    // Title and tags changes are cheap to see: check right away; content is
    // compared during browser idle time to avoid blocking typing
    const titleInput = document.getElementById("inp" + noteid);
    const tagsElem = document.getElementById("tags" + noteid);
    const titleChanged = (titleInput ? titleInput.value : '') !== lastSavedTitle;
    const tagsChanged = (tagsElem ? tagsElem.value : '') !== lastSavedTags;
    if (titleChanged || tagsChanged) {
        runChangeCheck();
    } else if (window.requestIdleCallback) {
        window.requestIdleCallback(runChangeCheck, { timeout: 500 });
    } else {
        setTimeout(runChangeCheck, 0);
    }
}

/**
 * Compare the note on screen with its last saved state and, when it
 * changed, store the draft, mark the note unsaved and schedule the save.
 */
function runChangeCheck() {
    pendingChangeCheck = false;
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }
    const entryElem = document.getElementById("entry" + noteid);
    const titleInput = document.getElementById("inp" + noteid);
    const tagsElem = document.getElementById("tags" + noteid);

    const currentTitle = titleInput ? titleInput.value : '';
    const currentTags = tagsElem ? tagsElem.value : '';
    const currentContent = entryElem
        ? ((typeof window.getComparableNoteContent === 'function')
            ? window.getComparableNoteContent(entryElem, noteid)
            : entryElem.innerHTML)
        : '';
    if (currentContent === lastSavedContent && currentTitle === lastSavedTitle && currentTags === lastSavedTags) {
        return; // No changes detected
    }

    // Save to localStorage immediately
    saveToLocalStorage();

    // Mark note as having pending changes
    notesNeedingRefresh.add(String(noteid));
    setNoteSaveButtonState(noteid, true);

    // Visual indicator: add red dot to page title
    if (!document.title.startsWith('🔴')) {
        document.title = '🔴 ' + document.title;
    }

    // Show save indicator on mobile only.
    const saveIndicator = document.getElementById('save-indicator');
    if (saveIndicator && window.matchMedia('(max-width: 768px)').matches) {
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

                const content = (typeof window.getComparableNoteContent === 'function')
                    ? window.getComparableNoteContent(entryElem, noteid)
                    : entryElem.innerHTML;
                writeNoteDraft(noteid, content, titleInput ? titleInput.value : null, tagsElem ? tagsElem.value : null);
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

    if (typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteid)) {
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

    const storedDraft = localStorage.getItem(draftKey);
    const storedTitle = localStorage.getItem(titleKey);
    const storedTags = localStorage.getItem(tagsKey);

    const currentDraft = storedDraft !== null
        ? storedDraft
        : ((typeof window.getComparableNoteContent === 'function')
            ? window.getComparableNoteContent(entryElem, noteid)
            : entryElem.innerHTML);
    const currentTitle = storedTitle !== null ? storedTitle : titleInput.value;
    const tagsElem = document.getElementById("tags" + noteid);
    const currentTags = storedTags !== null ? storedTags : (tagsElem ? tagsElem.value : '');

    const contentChanged = currentDraft !== lastSavedContent;
    const titleChanged = currentTitle !== lastSavedTitle;
    const tagsChanged = currentTags !== lastSavedTags;

    // Skip save if no changes
    if (!contentChanged && !titleChanged && !tagsChanged) {
        return;
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

    return false;
}

/**
 * hasUnsavedChanges for the moment the page is left: the flags lag the last
 * keystrokes by up to a second (throttled change check, idle callback), so
 * a check still pending is run now rather than skipped.
 */
function hasUnsavedChangesOnScreen(noteId) {
    if (pendingChangeCheck && noteId && String(noteId) === String(noteid)) {
        clearTimeout(changeCheckThrottle);
        changeCheckThrottle = null;
        runChangeCheck();
    }
    return hasUnsavedChanges(noteId);
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

    if (typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteId)) {
        return;
    }

    // Skip if no changes need saving
    if (!hasUnsavedChangesOnScreen(noteId)) {
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

    // If title is empty, use placeholder if it matches a default note title.
    if (headi === '' && typeof window.isDefaultNoteTitleText === 'function' && window.isDefaultNoteTitleText(titleInput.placeholder)) {
        headi = titleInput.placeholder;
    }

    // Get note type to determine how to extract content
    const noteType = entryElem.getAttribute('data-note-type') || 'note';
    let ent = "";

    if (noteType === 'tasklist') {
        // For task list notes, save the JSON data
        if (typeof getTaskListData === 'function') {
            ent = getTaskListData(noteId) || '';
        } else {
            ent = entryElem.innerHTML;
        }
    } else if (noteType === 'markdown') {
        // Align table columns at save time (the caret's own table is left as-is)
        if (typeof window.formatMarkdownTablesBeforeSave === 'function') {
            window.formatMarkdownTablesBeforeSave(noteId);
        }
        // For markdown notes, save the raw markdown content
        if (typeof getMarkdownContentForNote === 'function') {
            const markdownContent = getMarkdownContentForNote(noteId);
            if (markdownContent !== null) {
                ent = markdownContent;
            } else {
                ent = entryElem.innerHTML;
            }
        } else {
            ent = entryElem.innerHTML;
        }
    } else {
        // Regular HTML note
        if (typeof cleanSearchHighlightsFromElement === 'function') {
            ent = cleanSearchHighlightsFromElement(entryElem);
        } else {
            ent = entryElem.innerHTML;
        }
        // Strip non-breaking spaces before <br>: blank lines render fine as
        // <div><br></div>, and injected &nbsp; used to accumulate across
        // save/reload cycles (also cleans up notes polluted by older versions)
        ent = ent.replace(/(?:&nbsp;|\u00A0)*<br\s*[\/]?>/gi, "<br>");
        // Until 6.81.4 the outline flashed the heading a link scrolled to by
        // writing a background on the heading itself, and never removed the
        // transition, so any save made meanwhile kept them. The flash is an
        // overlay now; this strips what those saves left in the note.
        ent = ent
            .replace(/\s*(?:transition:\s*background-color 0\.3s ease(?: 0s)?|background-color:\s*rgba\(0,\s*125,\s*184,\s*0\.1\))\s*;?/gi, '')
            .replace(/\s+style=""/g, '');
    }

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

    // The exact state being sent becomes the draft, and its fingerprint
    // travels with the request (see DRAFT STORAGE below)
    const stateHash = snapshotNoteStateForSave(noteId);

    const updates = {
        heading: headi,
        content: ent,
        tags: tags,
        folder: folder,
        folder_id: folder_id,
        workspace: (window.selectedWorkspace || getSelectedWorkspace()),
        state_hash: stateHash,
        editor_session_id: (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : ''
    };

    // Never overwrite an edit made elsewhere on the way out either (409 is
    // then silently accepted: nobody is left to arbitrate).
    var expectedVersion = (typeof window.getLiveNoteContentVersion === 'function') ? window.getLiveNoteContentVersion(noteId) : null;
    if (expectedVersion) {
        updates.if_version = expectedVersion;
    }

    // Strategy 1: Try fetch with keepalive (most reliable)
    try {
        fetch("/api/v1/notes/" + noteId, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                'X-Requested-With': 'XMLHttpRequest',
                'X-Editor-Session-ID': (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : ''
            },
            body: JSON.stringify(updates),
            keepalive: true
        }).catch(err => {
            console.error('[Poznote Auto-Save] Emergency fetch failed:', err);
        });
        return;
    } catch (err) {
        console.error('[Poznote Auto-Save] Fetch strategy failed:', err);
    }

    // Strategy 2: Fallback to sendBeacon with FormData
    try {
        const formData = new FormData();
        formData.append('content', ent);
        formData.append('workspace', window.selectedWorkspace || getSelectedWorkspace());
        formData.append('editor_session_id', (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '');

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
        formData.append('editor_session_id', (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '');

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
 * Clear localStorage draft for a specific note
 * @param {number|string} noteId - The note ID to clear draft for
 */
function clearDraft(noteId) {
    try {
        localStorage.removeItem('poznote_draft_' + noteId);
        localStorage.removeItem('poznote_title_' + noteId);
        localStorage.removeItem('poznote_tags_' + noteId);
        localStorage.removeItem(DRAFT_META_PREFIX + noteId);
    } catch (err) {
        console.warn('[Poznote Auto-Save] Failed to clear draft:', err);
    }
}

/**
 * Reinitialize auto-save state after loading fresh note content from server
 * This ensures the auto-save system knows the current "saved" state
 *
 * options.keepNoteId       leave window.noteid alone (full page load: it is
 *                          set when the user focuses the note, as before)
 * options.keepAutoPushFlag do not reset the pending git auto-push flag
 */
function reinitializeAutoSaveState(options) {
    options = options || {};
    // Get current note ID from the DOM
    let currentNoteId = null;
    const entryElem = document.querySelector('[id^="entry"]:not([id*="search"])');

    if (entryElem) {
        currentNoteId = extractNoteIdFromEntry(entryElem);
    }

    if (currentNoteId && currentNoteId !== 'search' && currentNoteId !== '-1') {
        // Update global noteid
        if (typeof window !== 'undefined' && !options.keepNoteId) {
            window.noteid = currentNoteId;
        }

        // Initialize lastSaved* variables with current server content (freshly loaded)
        const entryContent = (typeof window.getComparableNoteContent === 'function')
            ? window.getComparableNoteContent(entryElem, currentNoteId)
            : entryElem.innerHTML;
        const titleInput = document.getElementById('inp' + currentNoteId);
        const tagsElem = document.getElementById('tags' + currentNoteId);

        lastSavedContent = entryContent;
        lastSavedTitle = titleInput ? titleInput.value : null;
        lastSavedTags = tagsElem ? tagsElem.value : null;

        // Remove from refresh list if present
        notesNeedingRefresh.delete(String(currentNoteId));
        setNoteSaveButtonState(currentNoteId, false);

        // Reset auto-push flag since we just loaded fresh content
        if (!options.keepAutoPushFlag) {
            setAutoPushFlag(false);
        }

        // A draft left for this note by a previous session is not stale: it
        // is what the user typed and never got saved. Restore it, or ask.
        considerDraftRecovery(currentNoteId);
    }
}

// ============================================================================
// SAVE BUTTON STATE
// ============================================================================

/**
 * The toolbar's save icon is blue (class is-saving on .btn-save of the note
 * card) from the first unsaved change until the server confirmed the save,
 * so the answer to "is it saved?" is always on screen.
 */
function setNoteSaveButtonState(noteId, saving) {
    if (!noteId || noteId === -1 || noteId === 'search') {
        return;
    }
    const card = document.getElementById('note' + noteId);
    if (!card) {
        return;
    }
    card.querySelectorAll('.btn-save').forEach(function (button) {
        button.classList.toggle('is-saving', !!saving);
    });
}

// ============================================================================
// DRAFT STORAGE
// ============================================================================
//
// The draft is the note as this browser last saw it: written on every change
// (poznote_draft_<id>, plus the title and tags) and with every save, cleared
// once the server confirmed the save. Its meta entry records the version the
// note had when the draft started, so a later load can tell whether the
// server moved on since. Every load used to discard the draft, so a reload
// after a failed save lost everything typed since the last successful one
// (issue 1349).
//
// Every save also carries the fingerprint of the state it sends (content,
// title, tags), which the server keeps with the note as long as the note
// does not change again. A later visit compares it with the draft's own
// fingerprint: equal means that draft reached the server, whatever the
// server made of the content (sanitizer, base64 images turned into
// attachments...), so no content comparison is needed to know it.

const DRAFT_META_PREFIX = 'poznote_draft_meta_';
// A draft written this recently by another editor session most likely
// belongs to a tab still open on the note: it is left alone
const DRAFT_LIVE_SESSION_GRACE_MS = 15000;
// How long the recovery waits for the edit lock of a freshly loaded note
const DRAFT_RECOVERY_LOCK_WAIT_MS = 5000;
// A draft written after this instant was written by this page: it is the
// page's own unsaved state, not something left by a previous session
const PAGE_STARTED_AT = Date.now();
let draftRecoveryToken = 0;

function draftText(key, vars, fallback) {
    return (typeof window.t === 'function') ? window.t(key, vars || {}, fallback) : fallback;
}

/**
 * Fingerprint of a note state (content, title, tags). The same function
 * runs on the draft and on the state sent with a save, so the two can be
 * matched later without comparing content.
 */
function draftStateSignature(content, title, tags) {
    const sep = String.fromCharCode(31);
    const str = String(content == null ? '' : content)
        + sep + String(title == null ? '' : title)
        + sep + String(tags == null ? '' : tags);
    // cyrb53-style 64-bit hash, plenty to tell two note states apart
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + '-' + (h1 >>> 0).toString(16) + '-' + str.length;
}

/**
 * The state of a note as it stands on screen: the content the draft and
 * the change detection work with, the title and tags, and their fingerprint.
 */
function readNoteStateFromScreen(noteId) {
    const entryElem = document.getElementById('entry' + noteId);
    if (!entryElem) {
        return null;
    }
    const titleInput = document.getElementById('inp' + noteId);
    const tagsElem = document.getElementById('tags' + noteId);
    const state = {
        content: (typeof window.getComparableNoteContent === 'function')
            ? window.getComparableNoteContent(entryElem, noteId)
            : entryElem.innerHTML,
        title: titleInput ? titleInput.value : null,
        tags: tagsElem ? tagsElem.value : null
    };
    state.hash = draftStateSignature(state.content, state.title, state.tags);
    return state;
}

/**
 * Called by both save paths (js/notes.js and the unload save below) just
 * before the request goes out: stores the exact state being sent as the
 * draft and returns its fingerprint for the request. Keeping the draft equal
 * to the last state sent is what lets a later visit match the two.
 */
function snapshotNoteStateForSave(noteId) {
    const state = readNoteStateFromScreen(noteId);
    if (!state) {
        return null;
    }
    clearTimeout(localStorageSaveTimer);
    writeNoteDraft(noteId, state.content, state.title, state.tags);
    return state.hash;
}

function readDraftMeta(noteId) {
    try {
        const meta = JSON.parse(localStorage.getItem(DRAFT_META_PREFIX + noteId) || 'null');
        return (meta && typeof meta === 'object') ? meta : null;
    } catch (e) {
        return null;
    }
}

/**
 * Store the draft of a note (title and tags only when given). Every writer
 * of a draft goes through here (this file, the tag editor, the markdown
 * preview actions) so the draft always carries its meta entry.
 */
function writeNoteDraft(noteId, content, title, tags) {
    if (!noteId || noteId === -1 || noteId === 'search') {
        return;
    }
    try {
        const isNewDraft = localStorage.getItem('poznote_draft_' + noteId) === null;
        localStorage.setItem('poznote_draft_' + noteId, content);
        if (title !== null && title !== undefined) {
            localStorage.setItem('poznote_title_' + noteId, title);
        }
        if (tags !== null && tags !== undefined) {
            localStorage.setItem('poznote_tags_' + noteId, tags);
        }

        // The version is the one the server held when this draft started:
        // as long as no save succeeds (which clears the draft) it stays the
        // same from one write to the next.
        let meta = isNewDraft ? null : readDraftMeta(noteId);
        if (!meta) {
            const isCurrentNote = String(getCurrentNoteId()) === String(noteId);
            meta = {
                version: (isCurrentNote && typeof window.getLiveNoteContentVersion === 'function')
                    ? window.getLiveNoteContentVersion(noteId)
                    : null
            };
        }
        meta.session = (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '';
        meta.ts = Date.now();
        localStorage.setItem(DRAFT_META_PREFIX + noteId, JSON.stringify(meta));
    } catch (err) {
        // localStorage quota exceeded or other error
        console.warn('[Poznote Auto-Save] Failed to save to localStorage:', err);
    }
}

function readNoteDraft(noteId) {
    try {
        const content = localStorage.getItem('poznote_draft_' + noteId);
        if (content === null) {
            return null;
        }
        return {
            content: content,
            title: localStorage.getItem('poznote_title_' + noteId),
            tags: localStorage.getItem('poznote_tags_' + noteId),
            meta: readDraftMeta(noteId) || {}
        };
    } catch (e) {
        return null;
    }
}

// ============================================================================
// SAVE OUTCOME
// ============================================================================

// A save is retried on its own this long after it failed to reach the server
const AUTOSAVE_RETRY_MS = 10000;
let autosaveRetryTimer = null;
let autosaveFailureNoticed = false;

/**
 * A save did not reach the server (network down, server busy, proxy error).
 * Nothing alarming: the text is kept on this device (the draft), the save
 * icon stays blue, a short notice says so once, and the save is retried on
 * its own until it goes through.
 */
function noteSaveFailed(noteId) {
    if (!autosaveFailureNoticed) {
        autosaveFailureNoticed = true;
        if (typeof window.liveRefreshShowNotice === 'function') {
            window.liveRefreshShowNotice(noteId, draftText('autosave.notification.not_saved_yet', {},
                'Your latest changes could not be saved yet. They are kept on this device and Poznote keeps trying.'));
        }
    }
    clearTimeout(autosaveRetryTimer);
    autosaveRetryTimer = setTimeout(function () {
        autosaveRetryTimer = null;
        if (String(getCurrentNoteId()) === String(noteId) && isOnline && saveTimeout === null && hasUnsavedChanges(noteId)) {
            saveToServerDebounced();
        }
    }, AUTOSAVE_RETRY_MS);
}

/** The server confirmed a save: back to the quiet state */
function noteSaveSucceeded(noteId) {
    clearTimeout(autosaveRetryTimer);
    autosaveRetryTimer = null;
    setNoteSaveButtonState(noteId, false);
    if (autosaveFailureNoticed) {
        autosaveFailureNoticed = false;
        if (typeof window.showSavedToast === 'function') {
            window.showSavedToast();
        }
    }
}

// ============================================================================
// DRAFT RECOVERY
// ============================================================================

/**
 * Id of the note on screen, read from the DOM (after a full page load
 * window.noteid is only set once the user focuses the note)
 */
function getDisplayedNoteId() {
    const entryElem = document.querySelector('[id^="entry"]:not([id*="search"])');
    const id = entryElem ? extractNoteIdFromEntry(entryElem) : null;
    return (id && id !== 'search' && id !== '-1') ? String(id) : null;
}

/**
 * Called once a note is on screen. A draft left for it by a previous
 * session (failed save, reload, crash) is saved to the server when the note
 * has not changed since; otherwise the user decides from a banner.
 */
function considerDraftRecovery(noteId) {
    const draft = readNoteDraft(noteId);
    if (!draft) {
        return;
    }
    const token = ++draftRecoveryToken;
    // The edit lock is requested on the "noteLoaded" event, which fires
    // right after this runs: wait for its answer before touching the note,
    // another tab or user may be editing it.
    const startedAt = Date.now();
    const check = function () {
        if (token !== draftRecoveryToken) {
            return; // another note was loaded meanwhile
        }
        const settled = (typeof window.isNoteEditLockSettled !== 'function')
            || window.isNoteEditLockSettled(noteId)
            || Date.now() - startedAt >= DRAFT_RECOVERY_LOCK_WAIT_MS;
        if (!settled) {
            setTimeout(check, 150);
            return;
        }
        runDraftRecovery(noteId, draft, token);
    };
    setTimeout(check, 200);
}

function runDraftRecovery(noteId, draft, token) {
    if (getDisplayedNoteId() !== String(noteId)) {
        return;
    }
    // Locked here (another user, or another tab of ours): the draft stays
    // stored and is looked at again when the note becomes editable.
    if (typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteId)) {
        return;
    }
    const meta = draft.meta || {};
    const session = (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '';
    if (meta.session && meta.session !== session && meta.ts && Date.now() - meta.ts < DRAFT_LIVE_SESSION_GRACE_MS) {
        return; // written moments ago by another tab, most likely still open on the note
    }

    // The editors (markdown, task lists) are initialised by now: re-read the
    // note as loaded, which is also the baseline change detection starts from
    const loaded = readNoteStateFromScreen(noteId);
    if (!loaded) {
        return;
    }
    const typedMeanwhile = hasUnsavedChanges(noteId);
    if (typedMeanwhile && meta.ts && meta.ts >= PAGE_STARTED_AT) {
        return; // this page's own pending edits, still on screen and about to be saved
    }
    if (!typedMeanwhile) {
        lastSavedContent = loaded.content;
        lastSavedTitle = loaded.title;
        lastSavedTags = loaded.tags;
    }

    // Same as what is on screen: the save on the way out went through
    const titleMatches = draft.title === null || loaded.title === null || draft.title === loaded.title;
    const tagsMatch = draft.tags === null || loaded.tags === null || draft.tags === loaded.tags;
    if (draft.content === loaded.content && titleMatches && tagsMatch) {
        clearDraft(noteId);
        return;
    }

    // Typed here before the recovery ran: that must not be overwritten silently
    if (typedMeanwhile) {
        offerDraftRecovery(noteId, draft, 'conflict');
        return;
    }

    const draftHash = draftStateSignature(draft.content, draft.title, draft.tags);
    fetchServerNote(noteId).then(function (server) {
        if (token !== draftRecoveryToken || getDisplayedNoteId() !== String(noteId)) {
            return; // the draft stays stored for the next visit
        }
        if (!server) {
            offerDraftRecovery(noteId, draft, 'error');
            return;
        }
        // The server remembers the fingerprint of the state this browser last
        // saved: the draft is that state, it did reach the server
        if (server.stateHash && server.stateHash === draftHash) {
            clearDraft(noteId);
            // The page shows something else than that state (checked above):
            // it was rendered before the save landed, show the saved version
            if (typeof window.liveRefreshReloadNote === 'function') {
                window.liveRefreshReloadNote(noteId, false);
            }
            return;
        }
        // Not saved. Same version as when the draft started: nobody else
        // wrote since, the draft can be saved without asking (the PATCH
        // carries that version, so a write landing meanwhile is refused).
        if (!meta.version || meta.version !== server.version) {
            offerDraftRecovery(noteId, draft, 'conflict');
            return;
        }
        return pushDraftToServer(noteId, draft, server.version, false).then(function (result) {
            if (result.ok) {
                finishDraftRecovery(noteId);
                return;
            }
            if (token !== draftRecoveryToken || getDisplayedNoteId() !== String(noteId)) {
                return;
            }
            offerDraftRecovery(noteId, draft, result.conflict ? 'conflict' : 'error');
        });
    });
}

/** Current version and saved-state fingerprint of the note on the server, or null */
function fetchServerNote(noteId) {
    return fetch('/api/v1/notes/' + encodeURIComponent(noteId), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin'
    }).then(function (response) {
        return response.ok ? response.json() : null;
    }).then(function (data) {
        if (!data || !data.success || !data.note) {
            return null;
        }
        return {
            version: (typeof data.note.version === 'string' && data.note.version) ? data.note.version : null,
            stateHash: (typeof data.note.state_hash === 'string' && data.note.state_hash) ? data.note.state_hash : null
        };
    }).catch(function () {
        return null;
    });
}

/**
 * PATCH the draft as the autosave would, including the recovery of an edit
 * lock left behind by the tab that wrote the draft.
 */
function pushDraftToServer(noteId, draft, ifVersion, retriedLock) {
    const editorSessionId = (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '';
    const updates = {
        content: draft.content,
        state_hash: draftStateSignature(draft.content, draft.title, draft.tags),
        editor_session_id: editorSessionId
    };
    if (draft.title !== null && draft.title !== undefined && draft.title.trim() !== '') {
        updates.heading = draft.title;
    }
    if (draft.tags !== null && draft.tags !== undefined) {
        updates.tags = draft.tags;
    }
    if (ifVersion) {
        updates.if_version = ifVersion;
    }
    return fetch('/api/v1/notes/' + encodeURIComponent(noteId), {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Editor-Session-ID': editorSessionId
        },
        credentials: 'same-origin',
        body: JSON.stringify(updates)
    }).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
            return { ok: response.ok, status: response.status, data: data || {} };
        });
    }).then(function (result) {
        const data = result.data;
        if (result.ok && data.success) {
            if (data.note && data.note.version && typeof window.setLiveNoteContentVersion === 'function') {
                window.setLiveNoteContentVersion(noteId, data.note.version);
            }
            return { ok: true };
        }
        if (data.code === 'version_conflict') {
            return { ok: false, conflict: true, error: data.error || '' };
        }
        if (!retriedLock && data.lock
            && typeof _canRecoverOwnEditLock === 'function' && _canRecoverOwnEditLock(data.lock)
            && typeof _recoverOwnEditLock === 'function') {
            return _recoverOwnEditLock(noteId, editorSessionId).then(function (recovered) {
                if (recovered) {
                    return pushDraftToServer(noteId, draft, ifVersion, true);
                }
                return { ok: false, error: data.error || data.message || ('HTTP ' + result.status) };
            });
        }
        return { ok: false, error: data.error || data.message || ('HTTP ' + result.status) };
    }).catch(function (error) {
        return { ok: false, error: (error && error.message) ? error.message : 'network error' };
    });
}

function finishDraftRecovery(noteId) {
    clearDraft(noteId);
    if (window.POZNOTE_CONFIG?.gitSyncAutoPush) {
        try {
            localStorage.setItem('poznote_needs_auto_push_' + noteId, 'true');
        } catch (e) { /* ignore */ }
    }
    reloadNoteAfterDraftRecovery(noteId, 0);
}

// Show the recovered content the way the server renders it (markdown, task
// lists...): reload the note in place, with a notice above it
function reloadNoteAfterDraftRecovery(noteId, attempt) {
    if (getDisplayedNoteId() !== String(noteId)) {
        return;
    }
    const notice = draftText('autosave.draft.restored', {}, 'Your latest changes were recovered and saved.');
    if (typeof window.liveRefreshReloadNote === 'function' && window.liveRefreshReloadNote(noteId, notice)) {
        return;
    }
    if (attempt < 10) {
        setTimeout(function () { reloadNoteAfterDraftRecovery(noteId, attempt + 1); }, 300);
        return;
    }
    window.location.reload();
}

/**
 * The draft cannot be saved silently (the note changed since, or the save
 * failed): banner with Keep my unsaved changes / Keep the current version.
 * Keeping the draft overwrites the current version, which stays in the
 * note's history.
 */
function offerDraftRecovery(noteId, draft, kind) {
    const restore = function () {
        return pushDraftToServer(noteId, draft, null, false).then(function (result) {
            if (result.ok) {
                finishDraftRecovery(noteId);
                return true;
            }
            console.warn('[Poznote Auto-Save] Draft could not be saved:', result.error);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(draftText('autosave.draft.restore_failed', {},
                    'Your changes could not be saved. Check your connection and try again.'), 'error');
            }
            return false;
        });
    };
    const discard = function () {
        clearDraft(noteId);
    };
    // js/live-refresh.js is always loaded with this file; when the banner
    // cannot be shown (no note card) the draft simply stays stored
    if (typeof window.liveRefreshShowDraftBanner === 'function') {
        window.liveRefreshShowDraftBanner(noteId, { kind: kind, onRestore: restore, onDiscard: discard });
    }
}

// ============================================================================
// BACKGROUND GIT PUSH
// ============================================================================

/**
 * Trigger a background git push without blocking the UI
 * Called when changing notes if auto-push flag is set
 */
function triggerBackgroundPush() {
    if (!getAutoPushFlag()) return;
    if (!window.POZNOTE_CONFIG?.gitSyncAutoPush) {
        setAutoPushFlag(false);
        return;
    }
    
    // Reset flag before push
    setAutoPushFlag(false);
    
    fetch('/api/v1/git-sync/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ async: true }),
        keepalive: true
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Push completed successfully
        }
    })
    .catch(err => {
    });
}

// ============================================================================
// GLOBAL EXPORTS
// ============================================================================

// Expose auto-save functions globally
window.markNoteAsModified = markNoteAsModified;
window.hasUnsavedChanges = hasUnsavedChanges;
window.clearDraft = clearDraft;
window.writeNoteDraft = writeNoteDraft;
window.snapshotNoteStateForSave = snapshotNoteStateForSave;
window.noteSaveFailed = noteSaveFailed;
window.noteSaveSucceeded = noteSaveSucceeded;
window.setNoteSaveButtonState = setNoteSaveButtonState;
window.reinitializeAutoSaveState = reinitializeAutoSaveState;
window.updateConnectionStatus = updateConnectionStatus;
window.setNeedsAutoPush = setAutoPushFlag;
window.triggerBackgroundPush = triggerBackgroundPush;
window.emergencySave = emergencySave;

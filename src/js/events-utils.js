// Utility functions for event management
// Part of Poznote's modular event system

// Wrapper for translation function with fallback support
function tr(key, vars, fallback) {
    try {
        return window.t ? window.t(key, vars || {}, fallback) : fallback;
    } catch (e) {
        return fallback;
    }
}

// Generic function to update noteid based on element ID with prefix
function updateNoteIdFromElement(element, prefixLength) {
    if (element && element.id) {
        noteid = element.id.substring(prefixLength);
    }
}

// Used by event handlers to update the global noteid variable when users interact with notes
function updateident(el) {
    updateNoteIdFromElement(el, 5); // 'entry'.length
}

// Update noteid from title input element ID
function updateidhead(el) {
    updateNoteIdFromElement(el, 3); // 'inp'.length
}

// Utility function to extract note ID from entry element
function extractNoteIdFromEntry(entryElement) {
    return entryElement && entryElement.id ? entryElement.id.replace('entry', '') : null;
}

// Set the global noteid from the nearest .noteentry ancestor of a DOM element
function setNoteIdFromNoteentry(element) {
    var noteentry = element.closest('.noteentry');
    if (noteentry) {
        var id = extractNoteIdFromEntry(noteentry);
        if (id) noteid = id;
    }
    return noteentry;
}

// Serialize checklists in a noteentry and trigger the auto-save pipeline
function serializeAndMarkModified(noteentry) {
    if (noteentry && typeof serializeChecklistsBeforeSave === 'function') {
        serializeChecklistsBeforeSave(noteentry);
    }
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }
}

// Convert audio tags to iframes in Chrome for contenteditable compatibility
function convertNoteAudioToIframes() {
    try {
        var audios = document.querySelectorAll('.noteentry audio');
        audios.forEach(function (audio) {
            // Skip if already converted
            if (audio.hasAttribute('data-converted-to-iframe')) {
                return;
            }

            var src = audio.getAttribute('src');
            var controls = audio.hasAttribute('controls');

            if (!src) {
                return;
            }

            // Create iframe wrapper
            var iframe = document.createElement('iframe');
            iframe.setAttribute('src', src);
            iframe.setAttribute('data-audio-src', src);
            iframe.setAttribute('data-is-audio', 'true');
            iframe.style.width = '100%';
            iframe.style.height = '54px';
            iframe.style.border = 'none';
            iframe.style.display = 'block';
            iframe.style.margin = '10px 0';

            // Mark both original and iframe
            audio.setAttribute('data-converted-to-iframe', 'true');
            iframe.setAttribute('data-converted-from-audio', 'true');

            // Replace audio with iframe
            if (audio.parentNode) {
                audio.parentNode.replaceChild(iframe, audio);
            }
        });
    } catch (e) {
        console.error('[Audio] Error converting audio to iframes:', e);
    }
}

// Show a temporary notification while auto-save is in progress
function showSaveInProgressNotification(onCompleteCallback) {
    // Build the "saving" notification (styles in modules/misc.css)
    var notification = document.createElement('div');
    notification.className = 'save-notification';
    notification.innerHTML =
        '<div class="save-notification-inner">' +
            '<div class="save-notification-spinner"></div>' +
            '<span>' + tr('autosave.notification.saving', {}, 'Saving changes...') + '</span>' +
        '</div>';

    document.body.appendChild(notification);

    // Force immediate save
    var currentNoteId = window.noteid;
    clearTimeout(saveTimeout);
    saveTimeout = null;

    if (isOnline) {
        saveToServerDebounced();
    }

    // Helper: show "Saved!" then remove + callback
    function showSavedAndDismiss() {
        notification.innerHTML =
            '<div class="save-notification-inner">' +
                '<div class="save-notification-check">\u2713</div>' +
                '<span>' + tr('autosave.notification.saved', {}, 'Saved!') + '</span>' +
            '</div>';

        setTimeout(function () {
            if (notification && notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            if (typeof onCompleteCallback === 'function') {
                onCompleteCallback();
            }
        }, 800);
    }

    // Monitor for save completion
    var checkInterval = setInterval(function () {
        var noTimeout = !saveTimeout || saveTimeout === null || saveTimeout === undefined;
        var notInRefreshList = !notesNeedingRefresh.has(String(currentNoteId));
        var noRedDot = !document.title.startsWith('\uD83D\uDD34');
        if (noTimeout && notInRefreshList && noRedDot) {
            clearInterval(checkInterval);
            showSavedAndDismiss();
        }
    }, 100);

    // Fallback timeout
    var fallbackTimeoutId = setTimeout(function () {
        clearInterval(checkInterval);
        showSavedAndDismiss();
    }, 3000);
}

// Expose utilities globally
window.updateident = updateident;
window.updateidhead = updateidhead;
window.extractNoteIdFromEntry = extractNoteIdFromEntry;
window.convertNoteAudioToIframes = convertNoteAudioToIframes;
window.showSaveInProgressNotification = showSaveInProgressNotification;

// Check if element or its direct children are title/tag fields
function isTitleOrTagElement(element) {
    if (element.classList &&
        (element.classList.contains('css-title') ||
            element.classList.contains('add-margin') ||
            (element.id && (element.id.indexOf('inp') === 0 || element.id.indexOf('tags') === 0)))) {
        return true;
    }
    if (element.children) {
        for (var i = 0; i < element.children.length; i++) {
            var child = element.children[i];
            if (child.classList &&
                (child.classList.contains('css-title') ||
                    child.classList.contains('add-margin') ||
                    (child.id && (child.id.indexOf('inp') === 0 || child.id.indexOf('tags') === 0)))) {
                return true;
            }
        }
    }
    return false;
}

// Generic JSON POST helper that handles success/failure uniformly
function apiPostJson(url, body, onSuccess, errorPrefix) {
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body)
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success) {
                onSuccess(data);
            } else {
                var err = (data && (data.error || data.message)) || 'Unknown error';
                showNotificationPopup(errorPrefix + err, 'error');
            }
        })
        .catch(function (error) {
            showNotificationPopup(errorPrefix + error.message, 'error');
        });
}

// Refresh the sidebar after a folder/note move action
function refreshSidebarAfterMove(data) {
    if (data && data.share_delta && typeof updateSharedCount === 'function') {
        updateSharedCount(data.share_delta);
    }
    if (typeof refreshNotesListAfterFolderAction === 'function') {
        setTimeout(function () { refreshNotesListAfterFolderAction(); }, 200);
    } else {
        setTimeout(function () {
            if (typeof persistFolderStatesFromDOM === 'function') { persistFolderStatesFromDOM(); }
            location.reload();
        }, 500);
    }
}

// Utility function to serialize checklist data
function serializeChecklists(entryElement) {
    if (!entryElement) return;

    var checklists = entryElement.querySelectorAll('.checklist');
    checklists.forEach(function (checklist) {
        var items = checklist.querySelectorAll('.checklist-item');
        items.forEach(function (item) {
            var checkbox = item.querySelector('.checklist-checkbox');
            var input = item.querySelector('.checklist-input');
            if (checkbox && input) {
                checkbox.setAttribute('data-checked', checkbox.checked ? '1' : '0');
                input.setAttribute('data-value', input.value);
                input.setAttribute('value', input.value);
                if (checkbox.checked) {
                    checkbox.setAttribute('checked', 'checked');
                } else {
                    checkbox.removeAttribute('checked');
                }
            }
        });
    });
}

// Reinitialize auto-save state after loading fresh note content from server
// This function is called from external code when a new note is loaded
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

        // Delegate to the auto-save module if available
        if (typeof window.reinitializeAutoSaveState === 'function') {
            window.reinitializeAutoSaveState(currentNoteId, entryElem);
        }

        // Clear any stale draft for this note since we just loaded fresh content
        if (typeof window.clearDraft === 'function') {
            window.clearDraft(currentNoteId);
        }
    }
}

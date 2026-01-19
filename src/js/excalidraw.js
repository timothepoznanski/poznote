// Excalidraw integration for Poznote
// Handles creation and opening of Excalidraw diagram notes

function excaTr(key, vars, fallback) {
    try {
        if (typeof window !== 'undefined' && typeof window.t === 'function') {
            return window.t(key, vars || {}, fallback);
        }
    } catch (e) {
        // ignore
    }
    let text = (fallback !== undefined && fallback !== null) ? String(fallback) : String(key);
    if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach((k) => {
            text = text.replaceAll('{{' + k + '}}', String(vars[k]));
        });
    }
    return text;
}

// Open existing Excalidraw note for editing
function openExcalidrawNote(noteId) {
    // Disable Excalidraw editing on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError(
                excaTr('excalidraw.messages.disabled_small_screens', {}, 'Excalidraw editing is disabled on small screens for a better user experience.'),
                excaTr('excalidraw.titles.editing_not_available', {}, 'Editing not available')
            );
        } else {
            alert(excaTr('excalidraw.messages.disabled_mobile', {}, 'Excalidraw editing is disabled on mobile devices.'));
        }
        return false;
    }

    var params = new URLSearchParams({
        note_id: noteId
    });
    if (selectedWorkspace) {
        params.append('workspace', selectedWorkspace);
    }

    // Redirect to Excalidraw editor
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

/**
 * Check if cursor is in an editable note area
 */
function isCursorInEditableNote() {
    const selection = window.getSelection();

    // Check if there's a selection/cursor
    if (!selection.rangeCount) {
        return false;
    }

    // Get the current element
    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) { // Text node
        container = container.parentNode;
    }

    // Check if we're inside a contenteditable note area
    const editableElement = container.closest && container.closest('[contenteditable="true"]');
    const noteEntry = container.closest && container.closest('.noteentry');
    const markdownEditor = container.closest && container.closest('.markdown-editor');

    // Return true if we're in any editable note context
    return (editableElement && noteEntry) || markdownEditor || (editableElement && editableElement.classList.contains('noteentry'));
}


// Insert Excalidraw diagram at cursor position in a note
function insertExcalidrawDiagram() {
    // Disable Excalidraw insertion on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError(
                excaTr('excalidraw.messages.disabled_small_screens', {}, 'Excalidraw editing is disabled on small screens for a better user experience.'),
                excaTr('excalidraw.titles.editing_not_available', {}, 'Editing not available')
            );
        } else {
            alert(excaTr('excalidraw.messages.disabled_under_800', {}, 'Excalidraw editing is disabled on screens smaller than 800px.'));
        }
        return false;
    }

    // Check if cursor is in editable note first
    if (!isCursorInEditableNote()) {
        if (typeof window.showCursorWarning === 'function') {
            window.showCursorWarning();
        } else {
            window.showError(
                excaTr('modal_alerts.cursor_warning.message', {}, 'Please click inside the editor before continuing.'),
                excaTr('modal_alerts.cursor_warning.title', {}, 'Cursor Position Required')
            );
        }
        return;
    }

    // Check if the current note has content
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        window.showError(
            excaTr('excalidraw.errors.save_before_adding', {}, 'Please save the note before adding diagrams'),
            excaTr('excalidraw.titles.unsaved_note', {}, 'Unsaved note')
        );
        return;
    }

    // Get the current note content
    const noteEntry = document.getElementById('entry' + currentNoteId);
    if (!noteEntry) {
        window.showError(
            excaTr('excalidraw.errors.note_editor_not_found', {}, 'Note editor not found'),
            excaTr('common.error', {}, 'Error')
        );
        return;
    }

    // Show loading spinner
    const spinner = window.showLoadingSpinner(
        excaTr('excalidraw.spinner.saving_note', {}, 'Saving note...'),
        excaTr('excalidraw.spinner.saving_title', {}, 'Saving')
    );

    // Create a unique ID for this diagram
    const diagramId = 'excalidraw-' + Date.now();

    // Save the note and wait for completion
    saveNoteAndWaitForCompletion()
        .then(function (success) {
            if (success) {
                // Note saved successfully
                // Wait a bit more to ensure all handlers complete
                setTimeout(function () {
                    openExcalidrawEditor(diagramId);
                    // Note: spinner will be closed when page navigates to editor
                }, 300);
            } else {
                // Save failed, close spinner and show error
                if (spinner && spinner.close) {
                    spinner.close();
                }
                if (typeof window.showError === 'function') {
                    window.showError(
                        excaTr('excalidraw.errors.failed_to_save_try_again', {}, 'Failed to save note. Please try again.'),
                        excaTr('ui.alerts.save_error', {}, 'Save Error')
                    );
                }
            }
        })
        .catch(function (error) {
            // Error occurred, close spinner
            if (spinner && spinner.close) {
                spinner.close();
            }
            console.error('Error saving note:', error);
            if (typeof window.showError === 'function') {
                window.showError(
                    excaTr(
                        'excalidraw.errors.error_saving_note_prefix',
                        { error: (error && error.message) ? error.message : excaTr('common.unknown_error', {}, 'Unknown error') },
                        'Error saving note: {{error}}'
                    ),
                    excaTr('ui.alerts.save_error', {}, 'Save Error')
                );
            }
        });
}

// Helper function to save note and wait for completion
function saveNoteAndWaitForCompletion() {
    return new Promise(function (resolve, reject) {
        // Check that noteid is valid
        if (typeof noteid === 'undefined' || noteid == -1 || noteid == '' || noteid === null || noteid === undefined) {
            reject(new Error('Invalid note ID'));
            return;
        }

        // Check if saveNoteToServer function exists
        if (typeof saveNoteToServer !== 'function') {
            reject(new Error('saveNoteToServer function not available'));
            return;
        }

        // Clear any pending save timeout to avoid conflicts
        if (typeof saveTimeout !== 'undefined' && saveTimeout !== null) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        // Call the existing save function
        try {
            saveNoteToServer();

            // Wait a bit for the save to complete
            // The save is asynchronous but we can check for indicators
            var checkCount = 0;
            var maxChecks = 20; // 2 seconds max (20 x 100ms)

            var checkInterval = setInterval(function () {
                checkCount++;

                // Check if save completed by looking at indicators
                var saveCompleted = true;

                // Check if there's still a pending save timeout
                if (typeof saveTimeout !== 'undefined' && saveTimeout !== null) {
                    saveCompleted = false;
                }

                // Check if note still needs refresh
                if (typeof notesNeedingRefresh !== 'undefined' &&
                    notesNeedingRefresh.has &&
                    notesNeedingRefresh.has(String(noteid))) {
                    saveCompleted = false;
                }

                // Check if page title still has unsaved indicator
                if (document.title.startsWith('🔴')) {
                    saveCompleted = false;
                }

                if (saveCompleted || checkCount >= maxChecks) {
                    clearInterval(checkInterval);

                    // Clean up indicators to be sure
                    if (typeof saveTimeout !== 'undefined') {
                        clearTimeout(saveTimeout);
                        saveTimeout = null;
                    }

                    if (typeof notesNeedingRefresh !== 'undefined' && notesNeedingRefresh.delete) {
                        notesNeedingRefresh.delete(String(noteid));
                    }

                    if (document.title.startsWith('🔴')) {
                        document.title = document.title.substring(2);
                    }

                    // Clear draft from localStorage
                    try {
                        localStorage.removeItem('poznote_draft_' + noteid);
                        localStorage.removeItem('poznote_title_' + noteid);
                        localStorage.removeItem('poznote_tags_' + noteid);
                    } catch (err) {
                        // Ignore errors
                    }

                    if (checkCount >= maxChecks) {
                        console.warn('Save timeout reached, proceeding anyway');
                    }

                    resolve(true);
                }
            }, 100); // Check every 100ms

        } catch (error) {
            reject(error);
        }
    });
}

// Open Excalidraw editor for a specific diagram
function openExcalidrawEditor(diagramId) {
    // Disable Excalidraw editing on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError(
                excaTr('excalidraw.messages.disabled_small_screens', {}, 'Excalidraw editing is disabled on small screens for a better user experience.'),
                excaTr('excalidraw.titles.editing_not_available', {}, 'Editing not available')
            );
        } else {
            alert(excaTr('excalidraw.messages.disabled_mobile', {}, 'Excalidraw editing is disabled on mobile devices.'));
        }
        return false;
    }

    // Store the current note context
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        window.showError(
            excaTr('excalidraw.errors.save_before_editing', {}, 'Please save the note before editing diagrams'),
            excaTr('excalidraw.titles.unsaved_note', {}, 'Unsaved note')
        );
        return;
    }

    // Get the note entry element to extract cursor position
    const noteEntry = document.getElementById('entry' + currentNoteId);
    let cursorPosition = null;

    if (noteEntry) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Calculate the offset from the beginning of the note content
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(noteEntry);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            cursorPosition = preCaretRange.toString().length;
        }
    }

    // Store diagram context in sessionStorage
    sessionStorage.setItem('excalidraw_context', JSON.stringify({
        noteId: currentNoteId,
        diagramId: diagramId,
        returnUrl: window.location.href,
        cursorPosition: cursorPosition
    }));

    // Redirect to Excalidraw editor with diagram context
    const params = new URLSearchParams({
        diagram_id: diagramId,
        note_id: currentNoteId
    });
    if (selectedWorkspace) {
        params.append('workspace', selectedWorkspace);
    }

    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

// Helper function to get current note ID
function getCurrentNoteId() {
    // Try to get from global noteid variable first (most reliable)
    if (typeof noteid !== 'undefined' && noteid !== -1 && noteid !== null && noteid !== 'search') {
        return noteid;
    }

    // Try to get note ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const noteId = urlParams.get('note');
    if (noteId) {
        return noteId;
    }

    // Try to get from focused note element
    const focusedNote = document.querySelector('.note-item.focused');
    if (focusedNote) {
        const noteElement = focusedNote.closest('[id^="note"]');
        if (noteElement) {
            return noteElement.id.replace('note', '');
        }
    }

    return null;
}

// Helper function to insert HTML at cursor position
function insertHtmlAtCursor(html) {
    let selection = window.getSelection();
    let insertionSuccessful = false;

    // If there's a current selection, use it
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fragment = range.createContextualFragment(html);
        range.deleteContents();
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        insertionSuccessful = true;
    } else {
        // No selection, try to find the note content area and insert at the end
        const noteContentElement = document.querySelector('.note-content[contenteditable="true"]') ||
            document.querySelector('#note-content[contenteditable="true"]') ||
            document.querySelector('[contenteditable="true"]');

        if (noteContentElement) {
            noteContentElement.focus();

            // Create a range at the end of the content
            const range = document.createRange();
            range.selectNodeContents(noteContentElement);
            range.collapse(false); // Move to end

            // Insert the HTML
            const fragment = range.createContextualFragment(html);
            range.insertNode(fragment);
            range.collapse(false);

            // Update selection
            selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            insertionSuccessful = true;
        }
    }

    // If we still couldn't insert, show a notification
    if (!insertionSuccessful) {
        if (window.showNotificationPopup) {
            showNotificationPopup(
                excaTr('excalidraw.errors.insert_area_not_found', {}, 'Could not find note content area to insert diagram'),
                'warning'
            );
        } else {
            window.showError(
                excaTr('excalidraw.errors.insert_area_not_found', {}, 'Could not find note content area to insert diagram'),
                excaTr('excalidraw.titles.insertion_error', {}, 'Insertion Error')
            );
        }
    }
}

// Download Excalidraw diagram as PNG image
function downloadExcalidrawImage(noteId) {
    // Get the PNG file path for this note
    let entriesPath = 'data/entries/';
    if (typeof window.userEntriesPath !== 'undefined' && window.userEntriesPath) {
        entriesPath = window.userEntriesPath;
    }
    const pngPath = `${entriesPath}${noteId}.png`;

    // Check if PNG exists by trying to load it
    const img = new Image();
    img.onload = function () {
        // PNG exists, download it
        downloadImageFromUrl(pngPath, `excalidraw-diagram-${noteId}.png`);
    };
    img.onerror = function () {
        // PNG doesn't exist, show error message
        console.error('Excalidraw PNG not found for note ' + noteId);
        window.showError(
            excaTr('excalidraw.errors.image_not_found', {}, 'Excalidraw image not found. Please open the diagram in the editor and save it first.'),
            excaTr('excalidraw.titles.image_not_found', {}, 'Image not found')
        );
    };
    img.src = pngPath;
}

// Helper function to download image from URL
function downloadImageFromUrl(imageSrc, filename) {
    // Use the same logic as the existing downloadImage function
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filename || 'excalidraw-diagram.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to show alert when trying to edit Excalidraw on mobile
function showMobileExcalidrawAlert() {
    if (typeof window.showError === 'function') {
        window.showError(
            excaTr('excalidraw.messages.disabled_small_screens', {}, 'Excalidraw editing is disabled on small screens for a better user experience.'),
            excaTr('excalidraw.titles.editing_not_available', {}, 'Editing not available')
        );
    } else {
        alert(excaTr('excalidraw.messages.disabled_under_800', {}, 'Excalidraw editing is disabled on screens smaller than 800px.'));
    }
}

// Make functions globally available
window.openExcalidrawNote = openExcalidrawNote;
window.downloadExcalidrawImage = downloadExcalidrawImage;
window.insertExcalidrawDiagram = insertExcalidrawDiagram;
window.showMobileExcalidrawAlert = showMobileExcalidrawAlert;
window.openExcalidrawEditor = openExcalidrawEditor;

/**
 * Rich text editing: title, tags, attachments and links.
 * 
 * Handlers for the fields around the note body, and for clicks on links inside it
 * (internal note references stay in-app, external ones open in a new tab).
 */

// ============================================================================
// TITLE AND TAGS HANDLERS
// ============================================================================

/**
 * Handle input events in note content
 * Updates note ID and marks note as modified
 * @param {Event} e - The input event
 */
function handleNoteEditEvent(e) {
    var target = e.target;

    if (target.classList.contains('css-title')) {
        if (window.updateidhead) {
            window.updateidhead(target);
        }
        triggerNoteSave();
        return;
    }

    // Skip non-note fields
    if (target.classList.contains('searchbar') ||
        target.id === 'search' ||
        target.classList.contains('searchtrash') ||
        target.classList.contains('one_note_title') ||
        target.classList.contains('tags')) {
        return;
    }

    // Update note ID and mark as modified
    if (target.classList.contains('noteentry')) {
        var noteIdFromEntry = window.extractNoteIdFromEntry
            ? window.extractNoteIdFromEntry(target)
            : null;

        if (noteIdFromEntry) {
            window.noteid = noteIdFromEntry;
        }

        triggerNoteSave();
    }
}

/**
 * Handle tags input - convert spaces to comma separators
 * @param {Event} e - The keyboard event
 */
function handleTagsKeydown(e) {
    if (e.key === ' ') {
        e.preventDefault();
        e.target.value += ', ';
        triggerNoteSave();
    }
}

/**
 * Save note when title field loses focus
 * @param {Event} e - The blur event
 */
function handleTitleBlur(e) {
    // Update noteid from title input ID before saving
    if (window.updateidhead) {
        window.updateidhead(e.target);
    }
    // Immediate save for title changes (no debounce)
    if (typeof window.saveNoteToServer === 'function') {
        window.saveNoteToServer();
    }
}

/**
 * Save note when tags field loses focus
 * @param {Event} e - The blur event
 */
function handleTagsBlur(e) {
    if (e.target.id && e.target.id.startsWith('tags')) {
        var id = e.target.id.substring(4); // Remove 'tags' prefix
        if (id) {
            window.noteid = id;
        }
    }
    triggerNoteSave();
}

/**
 * Move the caret from a note title down into the body of that same note.
 *
 * Where that is depends on the note: a markdown note writes in the editor
 * inside its .noteentry rather than the element itself, and out of reach while
 * the note shows its preview, and a task list writes in its new-task field.
 * @param {HTMLElement} titleInput - The .css-title input of the note
 * @returns {boolean} true when the caret left the title
 */
function focusNoteBodyFromTitle(titleInput) {
    var noteId = titleInput && titleInput.id ? titleInput.id.replace(/^inp/, '') : '';
    var noteEntry = noteId ? document.getElementById('entry' + noteId) : null;
    if (!noteEntry) {
        noteEntry = document.querySelector('.noteentry');
    }
    if (!noteEntry) return false;

    var noteType = noteEntry.getAttribute('data-note-type');

    if (noteType === 'markdown') {
        var editorDiv = noteEntry.querySelector('.markdown-editor');
        if (!editorDiv || !editorDiv.getClientRects().length) return false;

        var codeMirror = window.PoznoteMarkdownCodeMirror;
        if (codeMirror && typeof codeMirror.isCodeMirrorEditor === 'function'
            && codeMirror.isCodeMirrorEditor(editorDiv) && typeof codeMirror.focus === 'function') {
            codeMirror.focus(editorDiv);
            return true;
        }

        editorDiv.focus();
        return true;
    }

    if (noteType === 'tasklist') {
        var taskInput = noteEntry.querySelector('.task-input');
        if (!taskInput || taskInput.disabled || !taskInput.getClientRects().length) return false;

        taskInput.focus();
        return true;
    }

    noteEntry.focus();
    return true;
}

/**
 * Handle title field keyboard shortcuts
 * Enter: Move to note content, Escape: Blur field
 * @param {Event} e - The keyboard event
 */
function handleTitleKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        // Update noteid before saving and moving to content
        if (window.updateidhead) {
            window.updateidhead(e.target);
        }
        // Leaving the field saves it immediately (handleTitleBlur), so only a
        // caret that stays put still needs a save here: sending both made the
        // same note two PATCH calls, the second one on a version the first had
        // just replaced (409).
        if (!focusNoteBodyFromTitle(e.target) && typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        }
    } else if (e.key === 'Escape') {
        // Update noteid before blur triggers save
        if (window.updateidhead) {
            window.updateidhead(e.target);
        }
        e.target.blur();
    }
}

// ============================================================================
// ATTACHMENT HANDLERS
// ============================================================================

/**
 * Setup attachment file input events
 * Handles file selection and uploads
 */
function setupAttachmentEvents() {
    var attachmentInput = document.getElementById('attachment_input');
    if (!attachmentInput) return;

    attachmentInput.addEventListener('change', function (e) {
        var files = e.target.files;
        if (!files || files.length === 0) return;

        if (typeof handleImageFilesAndInsert === 'function') {
            handleImageFilesAndInsert(files);
        }

        // Reset input for next upload
        e.target.value = '';
    });
}

// ============================================================================
// LINK HANDLERS
// ============================================================================

/**
 * Handle internal note-to-note link navigation
 * @param {string} href - The link URL
 */
function handleInternalNoteLink(href) {
    // Diary links (slash menu "Link to diary entry"): open that day's entry,
    // creating it on first click. diary.php?date= does the same server side
    // for links opened outside the editor (new browser tab, public pages).
    var diaryMatch = /(?:^|\/)diary\.php\?(?:[^#]*&)?date=(\d{4}-\d{2}-\d{2})/.exec(href);
    if (diaryMatch && typeof window.openDiaryEntryForDate === 'function') {
        var diaryWorkspaceMatch = href.match(/[?&]workspace=([^&#]+)/);
        var diaryWorkspace = diaryWorkspaceMatch
            ? decodeURIComponent(diaryWorkspaceMatch[1])
            : (window.selectedWorkspace || '');
        window.openDiaryEntryForDate(diaryMatch[1], diaryWorkspace, function (noteId, workspace, created) {
            if (created && typeof window.refreshNotesListAfterFolderAction === 'function') {
                try { window.refreshNotesListAfterFolderAction(); } catch (e) { /* list refresh is cosmetic */ }
            }
            handleInternalNoteLink('index.php?note=' + noteId + '&workspace=' + encodeURIComponent(workspace || diaryWorkspace));
        });
        return true;
    }

    var noteMatch = href.match(/[?&]note=(\d+)/);
    var workspaceMatch = href.match(/[?&]workspace=([^&]+)/);

    if (!noteMatch || !noteMatch[1]) return false;

    var targetNoteId = noteMatch[1];

    // A link without a workspace may target a note of another workspace:
    // navigateToNote (note-reference.js) looks the workspace up before
    // opening. Its own click handler fires for the same link right after
    // this one and is dropped as a duplicate.
    if (!workspaceMatch && typeof window.navigateToNote === 'function') {
        window.navigateToNote(targetNoteId);
        return true;
    }

    var targetWorkspace = workspaceMatch
        ? decodeURIComponent(workspaceMatch[1])
        : (window.selectedWorkspace || window.getSelectedWorkspace());

    // Navigate to different workspace if needed
    if (targetWorkspace !== window.selectedWorkspace) {
        if (typeof window.saveLastOpenedWorkspace === 'function') {
            window.saveLastOpenedWorkspace(targetWorkspace);
        }
        var url = 'index.php?workspace=' + encodeURIComponent(targetWorkspace) + '&note=' + targetNoteId;
        window.location.href = url;
    } else {
        // Same workspace - open in new tab on desktop, load directly on mobile
        const isMobile = window.innerWidth <= 800;
        if (!isMobile && window.tabManager && typeof window.tabManager.openInNewTab === 'function') {
            window.tabManager.openInNewTab(targetNoteId, null, { insertAfterActive: true });
        } else if (typeof window.loadNoteById === 'function') {
            window.loadNoteById(targetNoteId);
        }
    }

    return true;
}

/**
 * Check if user has selected text within a link
 * @param {HTMLElement} linkElement - The link element
 * @returns {boolean} True if text is selected within the link
 */
function hasTextSelection(linkElement) {
    var selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;

    var range = selection.getRangeAt(0);
    var selectedText = range.toString();

    return selectedText.length > 0 && range.intersectsNode(linkElement);
}

/**
 * Handle clicks on links in notes
 * Allows editing link text when selected, otherwise follows the link
 */
function setupLinkClickHandling() {
    document.body.addEventListener('click', function (e) {
        if (e.target.tagName !== 'A' || !e.target.closest('.noteentry')) return;

        e.preventDefault();

        // User has selected text - allow editing instead of following link
        if (hasTextSelection(e.target)) return;

        // Try to handle as internal note link
        var href = e.target.href;
        if (handleInternalNoteLink(href)) return;

        // External link - open in new tab
        window.open(href, '_blank');
    });
}

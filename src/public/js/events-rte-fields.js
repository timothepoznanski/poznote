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
        // Immediate save for title changes (no debounce)
        if (typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        }
        var noteentry = document.querySelector('.noteentry');
        if (noteentry) {
            noteentry.focus();
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
    var noteMatch = href.match(/[?&]note=(\d+)/);
    var workspaceMatch = href.match(/[?&]workspace=([^&]+)/);

    if (!noteMatch || !noteMatch[1]) return false;

    var targetNoteId = noteMatch[1];
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

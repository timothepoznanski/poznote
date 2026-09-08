// Markdown split-view synchronisation for Poznote.
//
// Keeps the preview pane aligned with the editor caret in split mode, using the
// data-line attributes parseMarkdown() puts on block elements, and refreshes the
// preview as the source changes.

function getMarkdownPreviewAnchorLine(element) {
    if (!element || typeof element.getAttribute !== 'function') {
        return null;
    }

    var lineValue = element.getAttribute('data-line');
    if (lineValue === null || lineValue === '') {
        lineValue = element.getAttribute('data-start-line');
    }

    if (lineValue === null || lineValue === '') {
        return null;
    }

    var lineNumber = parseInt(lineValue, 10);
    return isNaN(lineNumber) ? null : lineNumber;
}

function findMarkdownPreviewElementForLine(previewDiv, lineNumber) {
    if (!previewDiv || lineNumber < 0) {
        return null;
    }

    var candidates = previewDiv.querySelectorAll('[data-line], table[data-start-line]');
    var closestBefore = null;
    var closestBeforeLine = -1;
    var closestAfter = null;
    var closestAfterLine = Infinity;

    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        if (candidate.classList && candidate.classList.contains('markdown-task-checkbox')) {
            continue;
        }

        var candidateLine = getMarkdownPreviewAnchorLine(candidate);
        if (candidateLine === null) {
            continue;
        }

        if (candidateLine === lineNumber) {
            return candidate;
        }

        if (candidateLine < lineNumber && candidateLine > closestBeforeLine) {
            closestBefore = candidate;
            closestBeforeLine = candidateLine;
        } else if (candidateLine > lineNumber && candidateLine < closestAfterLine) {
            closestAfter = candidate;
            closestAfterLine = candidateLine;
        }
    }

    return closestBefore || closestAfter;
}

function scrollMarkdownPreviewToLine(noteEntry, lineNumber, lineCount, behavior) {
    if (!noteEntry || lineNumber < 0) {
        return false;
    }

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!previewDiv) {
        return false;
    }

    var maxScrollTop = Math.max(0, previewDiv.scrollHeight - previewDiv.clientHeight);
    if (maxScrollTop <= 0) {
        return false;
    }

    var target = findMarkdownPreviewElementForLine(previewDiv, lineNumber);
    var desiredScrollTop;

    if (target) {
        var previewRect = previewDiv.getBoundingClientRect();
        var targetRect = target.getBoundingClientRect();
        var topOffset = Math.min(Math.max(previewDiv.clientHeight * 0.2, 24), 120);
        desiredScrollTop = previewDiv.scrollTop + targetRect.top - previewRect.top - topOffset;
    } else {
        var ratio = lineCount > 1 ? (lineNumber / (lineCount - 1)) : 0;
        desiredScrollTop = ratio * maxScrollTop;
    }

    desiredScrollTop = Math.max(0, Math.min(maxScrollTop, desiredScrollTop));

    if (Math.abs(previewDiv.scrollTop - desiredScrollTop) < 2) {
        return true;
    }

    if (typeof previewDiv.scrollTo === 'function') {
        previewDiv.scrollTo({
            top: desiredScrollTop,
            behavior: behavior || 'auto'
        });
    } else {
        previewDiv.scrollTop = desiredScrollTop;
    }

    return true;
}

function syncMarkdownPreviewScrollToEditorCaret(noteEntry, behavior) {
    if (!noteEntry || !noteEntry.classList.contains('markdown-split-mode')) {
        return false;
    }

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (!editorDiv) {
        return false;
    }

    var selectionOffsets = getSelectionOffsetsInTextElement(editorDiv);
    if (!selectionOffsets) {
        return false;
    }

    var content = normalizeContentEditableText(editorDiv);
    var lineStarts = getMarkdownLineStartOffsets(content);
    var lineNumber = getMarkdownLineIndexForOffset(lineStarts, selectionOffsets.end);

    return scrollMarkdownPreviewToLine(noteEntry, lineNumber, lineStarts.length, behavior);
}

function cancelMarkdownPreviewScrollSync(noteEntry) {
    if (!noteEntry || !noteEntry._markdownPreviewScrollSyncFrame) {
        return;
    }

    var frame = noteEntry._markdownPreviewScrollSyncFrame;
    if (frame.raf && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frame.id);
    } else {
        clearTimeout(frame.id);
    }

    noteEntry._markdownPreviewScrollSyncFrame = null;
}

function scheduleMarkdownPreviewScrollToEditorCaret(noteEntry, behavior) {
    if (!noteEntry || noteEntry._markdownPreviewScrollSyncFrame) {
        return;
    }

    var runScroll = function () {
        noteEntry._markdownPreviewScrollSyncFrame = null;
        syncMarkdownPreviewScrollToEditorCaret(noteEntry, behavior || 'auto');
    };

    if (typeof window.requestAnimationFrame === 'function') {
        noteEntry._markdownPreviewScrollSyncFrame = {
            id: window.requestAnimationFrame(runScroll),
            raf: true
        };
    } else {
        noteEntry._markdownPreviewScrollSyncFrame = {
            id: setTimeout(runScroll, 0),
            raf: false
        };
    }
}

function teardownMarkdownPreviewScrollSync(editorDiv) {
    if (!editorDiv) {
        return;
    }

    var listeners = editorDiv._splitModePreviewScrollListeners || [];
    for (var i = 0; i < listeners.length; i++) {
        editorDiv.removeEventListener(listeners[i].type, listeners[i].handler);
    }

    cancelMarkdownPreviewScrollSync(editorDiv._splitModePreviewScrollNoteEntry);
    editorDiv._splitModePreviewScrollListeners = null;
    editorDiv._splitModePreviewScrollNoteEntry = null;
}

function setupMarkdownPreviewScrollSync(noteEntry, editorDiv) {
    if (!noteEntry || !editorDiv) {
        return;
    }

    teardownMarkdownPreviewScrollSync(editorDiv);

    var schedule = function () {
        if (editorDiv._suppressMarkdownTableContextInput) {
            return;
        }
        scheduleMarkdownPreviewScrollToEditorCaret(noteEntry);
    };
    var listeners = [
        { type: 'focus', handler: schedule },
        { type: 'click', handler: schedule },
        { type: 'mouseup', handler: schedule },
        { type: 'keyup', handler: schedule },
        { type: 'markdown-selection-change', handler: schedule }
    ];

    for (var i = 0; i < listeners.length; i++) {
        editorDiv.addEventListener(listeners[i].type, listeners[i].handler);
    }

    editorDiv._splitModePreviewScrollListeners = listeners;
    editorDiv._splitModePreviewScrollNoteEntry = noteEntry;
    scheduleMarkdownPreviewScrollToEditorCaret(noteEntry);
}

// Setup live preview update in split mode
function setupSplitModePreviewUpdate(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    if (!editorDiv || !previewDiv) return;

    // Remove existing listener if any
    if (editorDiv._splitModeInputListener) {
        editorDiv.removeEventListener('input', editorDiv._splitModeInputListener);
    }

    teardownMarkdownPreviewScrollSync(editorDiv);

    // Create debounced update function
    var updateTimeout;
    editorDiv._splitModeInputListener = function () {
        if (editorDiv._suppressMarkdownTableContextInput) {
            clearTimeout(updateTimeout);
            return;
        }

        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(function () {
            var content = normalizeContentEditableText(editorDiv);

            renderMarkdownPreview(previewDiv, content, noteId, {
                placeholder: window.t ? window.t('editor.messages.split_preview_placeholder', null, 'Preview will appear here as you type...') : 'Preview will appear here as you type...',
                delay: 50
            });
            scheduleMarkdownPreviewScrollToEditorCaret(noteEntry);

            // Refresh outline panel if available
            if (window.outlinePanel && window.outlinePanel.refresh) {
                window.outlinePanel.refresh();
            }
        }, 300); // 300ms debounce
    };

    editorDiv.addEventListener('input', editorDiv._splitModeInputListener);
    setupMarkdownPreviewScrollSync(noteEntry, editorDiv);
}

// Update toggle function to handle split mode
function toggleMarkdownModeSplit(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var viewModeBtn = document.querySelector('#note' + noteId + ' .markdown-view-mode-btn');
    if (!viewModeBtn) return;

    var currentMode = viewModeBtn.getAttribute('data-current-mode');

    // Cycle through: edit -> preview -> edit
    if (currentMode === 'edit') {
        switchToPreviewMode(noteId);
    } else {
        switchToEditMode(noteId);
    }
}

// Public API of this file.
window.toggleMarkdownMode = toggleMarkdownModeSplit;
window.setupSplitModePreviewUpdate = setupSplitModePreviewUpdate;

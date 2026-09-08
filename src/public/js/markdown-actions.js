// Markdown note actions for Poznote.
//
// What the preview's controls do to the markdown source: resizing, bordering and
// deleting images and Excalidraw diagrams, toggling task checkboxes, jumping from
// a preview element back to its source line, and wiring the preview's listeners.
//
// This file also holds the window.* exports for the whole markdown module set, so
// it must load last.

function persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent) {
    renderMarkdownEditorContent(editorDiv, newContent);
    noteEntry.setAttribute('data-markdown-content', newContent);

    if (typeof noteid !== 'undefined') {
        noteid = noteId;
    }
    window.noteid = noteId;

    try {
        localStorage.setItem('poznote_draft_' + noteId, newContent);

        var titleInput = document.getElementById('inp' + noteId);
        var tagsElem = document.getElementById('tags' + noteId);
        if (titleInput) {
            localStorage.setItem('poznote_title_' + noteId, titleInput.value);
        }
        if (tagsElem) {
            localStorage.setItem('poznote_tags_' + noteId, tagsElem.value);
        }
    } catch (e) {
        console.warn('Could not persist markdown image change draft:', e);
    }

    if (previewDiv) {
        renderMarkdownPreview(previewDiv, newContent, noteId, { delay: 50 });
    }

    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }

    if (typeof window.saveNoteToServer === 'function') {
        window.saveNoteToServer();
    } else if (typeof window.saveNoteImmediately === 'function') {
        window.saveNoteImmediately();
    }
}

function toggleMarkdownImageBorder(img, borderClass) {
    var normalizedBorderClass = _mdNormalizeMarkdownImageBorderClass(borderClass);
    if (!img || !normalizedBorderClass) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var imageIndex = parseInt(img.getAttribute('data-markdown-image-index'), 10);
    if (!noteId || isNaN(imageIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var currentBorderClass = img.classList.contains(normalizedBorderClass) ? normalizedBorderClass : '';
    var nextBorderClass = currentBorderClass === normalizedBorderClass ? '' : normalizedBorderClass;
    var newContent = _mdUpdateMarkdownImageBorderAtIndex(content, imageIndex, nextBorderClass);

    if (newContent === null) {
        console.warn('Could not find the markdown source image to update.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

function resizeMarkdownImage(img, width) {
    var normalizedWidth = _mdNormalizeMarkdownImageWidth(width);
    if (!img || !normalizedWidth) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var imageIndex = parseInt(img.getAttribute('data-markdown-image-index'), 10);
    if (!noteId || isNaN(imageIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var newContent = _mdUpdateMarkdownImageWidthAtIndex(content, imageIndex, normalizedWidth);

    if (newContent === null) {
        console.warn('Could not find the markdown source image to resize.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

function deleteMarkdownImage(img) {
    if (!img) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var imageIndex = parseInt(img.getAttribute('data-markdown-image-index'), 10);
    if (!noteId || isNaN(imageIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var newContent = _mdDeleteMarkdownImageAtIndex(content, imageIndex);

    if (newContent === null) {
        console.warn('Could not find the markdown source image to delete.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

function _mdGetMarkdownExcalidrawBlockIndex(img) {
    if (!img) return NaN;

    var excalidrawContainer = img.closest('.excalidraw-container');
    if (!excalidrawContainer) return NaN;

    return parseInt(excalidrawContainer.getAttribute('data-markdown-excalidraw-index'), 10);
}

function toggleMarkdownExcalidrawImageBorder(img, borderClass) {
    var normalizedBorderClass = _mdNormalizeMarkdownImageBorderClass(borderClass);
    if (!img || !normalizedBorderClass) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var blockIndex = _mdGetMarkdownExcalidrawBlockIndex(img);
    if (!noteId || isNaN(blockIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var currentBorderClass = img.classList.contains(normalizedBorderClass) ? normalizedBorderClass : '';
    var nextBorderClass = currentBorderClass === normalizedBorderClass ? '' : normalizedBorderClass;
    var newContent = _mdUpdateExcalidrawImageBorderAtIndex(content, blockIndex, nextBorderClass);

    if (newContent === null) {
        console.warn('Could not find the markdown source Excalidraw block to update.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

function resizeMarkdownExcalidrawImage(img, width) {
    var normalizedWidth = _mdNormalizeMarkdownImageWidth(width);
    if (!img || !normalizedWidth) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var blockIndex = _mdGetMarkdownExcalidrawBlockIndex(img);
    if (!noteId || isNaN(blockIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var newContent = _mdUpdateExcalidrawImageWidthAtIndex(content, blockIndex, normalizedWidth);

    if (newContent === null) {
        console.warn('Could not find the markdown source Excalidraw block to resize.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

function deleteMarkdownExcalidrawImage(img) {
    if (!img) return false;

    var noteEntry = img.closest('.noteentry');
    if (!noteEntry) return false;

    var noteId = noteEntry.id ? noteEntry.id.replace('entry', '') : null;
    var blockIndex = _mdGetMarkdownExcalidrawBlockIndex(img);
    if (!noteId || isNaN(blockIndex)) return false;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return false;

    var content = typeof getMarkdownContentForNote === 'function'
        ? getMarkdownContentForNote(noteId)
        : normalizeContentEditableText(editorDiv);
    var newContent = _mdDeleteExcalidrawBlockAtIndex(content, blockIndex);

    if (newContent === null) {
        console.warn('Could not find the markdown source Excalidraw block to delete.');
        return false;
    }

    persistMarkdownImageSourceChange(noteEntry, editorDiv, previewDiv, noteId, newContent);

    return true;
}

/**
 * Toggle a markdown checkbox and update the source content
 * @param {HTMLInputElement} checkbox - The checkbox element that was clicked
 * @param {number} lineNumber - The line number in the markdown source
 */
function toggleMarkdownCheckbox(checkbox, lineNumber) {
    // Find the note entry containing this checkbox
    var noteEntry = checkbox.closest('.noteentry');
    if (!noteEntry) return;

    var noteId = noteEntry.id.replace('entry', '');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    if (!editorDiv) return;

    // Get the current markdown content
    var content = normalizeContentEditableText(editorDiv);
    var lines = content.split('\n');

    // Validate line number
    if (lineNumber < 0 || lineNumber >= lines.length) {
        console.warn('Invalid line number for checkbox toggle:', lineNumber);
        return;
    }

    var line = lines[lineNumber];

    // Toggle the checkbox in the markdown source
    if (checkbox.checked) {
        // Changed from unchecked to checked
        lines[lineNumber] = line.replace(/\[([ ])\]/, '[x]');
    } else {
        // Changed from checked to unchecked
        lines[lineNumber] = line.replace(/\[([xX])\]/, '[ ]');
    }

    // Update the editor content
    var newContent = lines.join('\n');
    renderMarkdownEditorContent(editorDiv, newContent);
    noteEntry.setAttribute('data-markdown-content', newContent);

    // Mark the note as modified
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }

    // Set the global noteid
    if (typeof noteid !== 'undefined') {
        noteid = noteId;
    }
    window.noteid = noteId;

    // If in split mode, update the preview (but preserve checkbox states that just changed)
    if (noteEntry.classList.contains('markdown-split-mode') && previewDiv) {
        // Re-render the preview
        renderMarkdownPreview(previewDiv, newContent, noteId, { delay: 50 });
    }
}

function _mdGetSourceOffsetForLine(markdownContent, lineNumber) {
    var lines = String(markdownContent || '').split('\n');
    var targetLine = Math.max(0, Math.min(lineNumber, Math.max(lines.length - 1, 0)));
    var sourceOffset = 0;

    for (var i = 0; i < targetLine; i++) {
        sourceOffset += lines[i].length + 1;
    }

    return sourceOffset;
}

function _mdFindEditorPositionForSourceOffset(editorDiv, sourceOffset) {
    if (!editorDiv) return null;

    var targetOffset = Math.max(0, sourceOffset || 0);
    var traversed = 0;

    function walk(node) {
        if (!node) return null;

        if (node.nodeType === Node.TEXT_NODE) {
            var text = node.textContent || '';
            var nextTraversed = traversed + text.length;
            if (targetOffset <= nextTraversed) {
                return {
                    node: node,
                    offset: Math.max(0, Math.min(targetOffset - traversed, text.length))
                };
            }

            traversed = nextTraversed;
            return null;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return null;
        }

        if (_mdIsExcalidrawEditorPlaceholder(node)) {
            var rawSource = _mdGetExcalidrawEditorPlaceholderSource(node);
            var nextPlaceholderOffset = traversed + rawSource.length;
            if (targetOffset <= nextPlaceholderOffset) {
                var parentNode = node.parentNode || editorDiv;
                var childIndex = Array.prototype.indexOf.call(parentNode.childNodes, node);
                return {
                    node: parentNode,
                    offset: targetOffset <= traversed ? childIndex : childIndex + 1
                };
            }

            traversed = nextPlaceholderOffset;
            return null;
        }

        if (node.tagName === 'BR') {
            var nextLineBreakOffset = traversed + 1;
            if (targetOffset <= nextLineBreakOffset) {
                var brParentNode = node.parentNode || editorDiv;
                var brChildIndex = Array.prototype.indexOf.call(brParentNode.childNodes, node);
                return {
                    node: brParentNode,
                    offset: targetOffset <= traversed ? brChildIndex : brChildIndex + 1
                };
            }

            traversed = nextLineBreakOffset;
            return null;
        }

        for (var child = node.firstChild; child; child = child.nextSibling) {
            var match = walk(child);
            if (match) return match;
        }

        return null;
    }

    return walk(editorDiv) || {
        node: editorDiv,
        offset: editorDiv.childNodes.length
    };
}

function _mdSetSelectionToSourceOffset(editorDiv, sourceOffset) {
    if (!editorDiv) return false;

    if (isCodeMirrorMarkdownEditor(editorDiv)) {
        var api = getMarkdownCodeMirrorApi();
        return !!(api && typeof api.setSelection === 'function' && api.setSelection(editorDiv, sourceOffset, sourceOffset));
    }

    if (editorDiv.childNodes.length === 0) {
        editorDiv.appendChild(document.createTextNode(''));
    }

    var position = _mdFindEditorPositionForSourceOffset(editorDiv, sourceOffset);
    var selection = window.getSelection();
    if (!position || !selection) return false;

    var range = document.createRange();

    try {
        editorDiv.focus({ preventScroll: true });
    } catch (e) {
        editorDiv.focus();
    }

    range.setStart(position.node, position.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
}

function _mdGetEditorNavigationTopOffset(editorDiv, scrollContainer) {
    if (!scrollContainer || scrollContainer === editorDiv || scrollContainer.classList && scrollContainer.classList.contains('markdown-editor-container')) {
        return 0;
    }

    return 100;
}

function _mdScrollEditorCaretToTop(editorDiv, lineNumber, scrollContainer) {
    if (!editorDiv || !scrollContainer) return;

    var topOffset = _mdGetEditorNavigationTopOffset(editorDiv, scrollContainer);
    var caretRect = getMarkdownCaretClientRect(editorDiv);
    var containerRect = scrollContainer.getBoundingClientRect();

    if (caretRect && containerRect) {
        scrollContainer.scrollTo({
            top: Math.max(0, scrollContainer.scrollTop + caretRect.top - containerRect.top - topOffset),
            behavior: 'smooth'
        });
        return;
    }

    var lineHeight = parseFloat(window.getComputedStyle(editorDiv).lineHeight) || 20;
    var targetLinePosition = lineNumber * lineHeight;
    var fallbackScrollTop = targetLinePosition - topOffset;

    if (scrollContainer !== editorDiv) {
        var editorRect = editorDiv.getBoundingClientRect();
        var editorOffsetInContainer = editorRect.top - containerRect.top + scrollContainer.scrollTop;
        fallbackScrollTop = editorOffsetInContainer + targetLinePosition - topOffset;
    }

    scrollContainer.scrollTo({
        top: Math.max(0, fallbackScrollTop),
        behavior: 'smooth'
    });
}

/**
 * Navigate to a specific line in the markdown editor
 * @param {number} lineNumber - The line number to navigate to
 * @param {HTMLElement} noteEntry - The note entry element
 */
function navigateToEditorLine(lineNumber, noteEntry) {
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (!editorDiv) return;

    var content = normalizeContentEditableText(editorDiv);
    var charOffset = _mdGetSourceOffsetForLine(content, lineNumber);

    try {
        if (!_mdSetSelectionToSourceOffset(editorDiv, charOffset)) {
            setSelectionOffsetsInTextElement(editorDiv, charOffset, charOffset);
        }

        var scrollContainer = getMarkdownEditorScrollContainer(editorDiv);
        _mdScrollEditorCaretToTop(editorDiv, lineNumber, scrollContainer);
    } catch (e) {
        console.warn('Could not set cursor position:', e);
    }
}

/**
 * Setup interactivity for markdown preview (checkbox toggling and click-to-navigate)
 * @param {number} noteId - The note ID
 */
function setupPreviewInteractivity(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!previewDiv) return;

    if (typeof window.processNoteReferences === 'function') {
        try {
            window.processNoteReferences(previewDiv);
        } catch (e) {
            console.error('Error processing note references in markdown preview:', e);
        }
    }

    if (typeof reinitializeImageClickHandlers === 'function') {
        try {
            reinitializeImageClickHandlers();
        } catch (e) {
            console.error('Error reinitializing markdown preview image handlers:', e);
        }
    }

    // Right-click context menu on tables in preview (same gesture as HTML tables)
    var previewTables = previewDiv.querySelectorAll('table[data-start-line]');
    previewTables.forEach(function(table) {
        if (table._mdTableClickHandler) {
            table.removeEventListener('click', table._mdTableClickHandler);
            table._mdTableClickHandler = null;
        }
        table.removeEventListener('contextmenu', table._mdTableContextMenuHandler);
        table._mdTableContextMenuHandler = function(e) {
            const cell = e.target.closest('td, th');
            if (!cell) return;

            // Keep the browser's default menu when text is selected in the
            // table (so the user can copy the selection)
            var sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.rangeCount > 0 && sel.getRangeAt(0).intersectsNode(table)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            if (typeof window.showMdTableContextMenu === 'function') {
                window.showMdTableContextMenu(e.clientX, e.clientY, table, cell, noteEntry);
            }
        };
        table.addEventListener('contextmenu', table._mdTableContextMenuHandler);
        table.style.cursor = 'default';
    });

    var isInSplitMode = noteEntry.classList.contains('markdown-split-mode');

    // Setup checkbox click handlers
    var checkboxes = previewDiv.querySelectorAll('.markdown-task-checkbox');
    checkboxes.forEach(function (checkbox) {
        // Remove any existing listener
        checkbox.removeEventListener('click', checkbox._checkboxClickHandler);
        checkbox.removeEventListener('change', checkbox._checkboxChangeHandler);

        // Add click handler
        checkbox._checkboxChangeHandler = function (e) {
            var lineNumber = parseInt(checkbox.getAttribute('data-line'));
            toggleMarkdownCheckbox(checkbox, lineNumber);
        };

        checkbox.addEventListener('change', checkbox._checkboxChangeHandler);
    });

    // Setup click-to-navigate only in split mode
    if (isInSplitMode) {
        // Find all elements with data-line attributes
        var lineElements = previewDiv.querySelectorAll('[data-line]');
        lineElements.forEach(function (element) {
            // Skip checkboxes (they have their own handler)
            if (element.classList.contains('markdown-task-checkbox')) return;

            // Skip details and summary elements (they have native toggle functionality)
            if (element.tagName === 'DETAILS' || element.tagName === 'SUMMARY') return;

            // Remove any existing listener
            element.removeEventListener('click', element._navigateClickHandler);

            // Add click handler for navigation
            element._navigateClickHandler = function (e) {
                // Don't navigate if clicking a link, checkbox, or toggle elements
                if (e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;
                if (e.target.closest('summary, details')) return;
                // Embedded task lists own their clicks (task rows open the
                // source tasklist note instead of scrolling the editor)
                if (e.target.closest('.tasklist-embed')) return;

                var lineNumber = parseInt(element.getAttribute('data-line'));
                navigateToEditorLine(lineNumber, noteEntry);
            };

            element.addEventListener('click', element._navigateClickHandler);
            element.style.cursor = 'pointer';
        });
    }
}

// Make functions globally available

// Public API of this file.
window.toggleMarkdownExcalidrawImageBorder = toggleMarkdownExcalidrawImageBorder;
window.resizeMarkdownExcalidrawImage = resizeMarkdownExcalidrawImage;
window.deleteMarkdownExcalidrawImage = deleteMarkdownExcalidrawImage;
window.toggleMarkdownImageBorder = toggleMarkdownImageBorder;
window.resizeMarkdownImage = resizeMarkdownImage;
window.deleteMarkdownImage = deleteMarkdownImage;
window.toggleMarkdownCheckbox = toggleMarkdownCheckbox;
window.navigateToEditorLine = navigateToEditorLine;
window.setupPreviewInteractivity = setupPreviewInteractivity;

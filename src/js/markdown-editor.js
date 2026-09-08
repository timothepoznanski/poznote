// Markdown editor plumbing for Poznote.
//
// The bridge to the CodeMirror markdown editor (js/codemirror-dist), the
// read-only/editable state of a note's editor, split-pane height management,
// and the contenteditable fallback's text/selection/caret handling.

function getMarkdownCodeMirrorApi() {
    return window.PoznoteMarkdownCodeMirror || null;
}

function isCodeMirrorMarkdownEditor(editorDiv) {
    var api = getMarkdownCodeMirrorApi();
    return !!(api && editorDiv && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(editorDiv));
}

function getCodeMirrorMarkdownContent(editorDiv) {
    var api = getMarkdownCodeMirrorApi();
    if (!api || !editorDiv || typeof api.getValue !== 'function') {
        return null;
    }

    return api.getValue(editorDiv);
}

function setCodeMirrorMarkdownContent(editorDiv, content, options) {
    var api = getMarkdownCodeMirrorApi();
    if (!api || !editorDiv || typeof api.setValue !== 'function' || !isCodeMirrorMarkdownEditor(editorDiv)) {
        return false;
    }

    return api.setValue(editorDiv, String(content || ''), options || {});
}

function initializeCodeMirrorMarkdownEditor(editorDiv, markdownContent, readOnly) {
    var api = getMarkdownCodeMirrorApi();
    if (!api || !editorDiv || typeof api.createEditor !== 'function') {
        renderMarkdownEditorContent(editorDiv, markdownContent);
        return false;
    }

    try {
        api.createEditor(editorDiv, {
            value: String(markdownContent || ''),
            placeholder: editorDiv.getAttribute('data-ph') || '',
            readOnly: !!readOnly
        });
    } catch (error) {
        console.error('Error initializing CodeMirror Markdown editor:', error);
        try {
            if (typeof api.destroyEditor === 'function') {
                api.destroyEditor(editorDiv);
            }
        } catch (destroyError) { }
        editorDiv.removeAttribute('data-codemirror-enabled');
        editorDiv.classList.remove('markdown-codemirror-host');
        renderMarkdownEditorContent(editorDiv, markdownContent);
        return false;
    }

    if (!isCodeMirrorMarkdownEditor(editorDiv)) {
        renderMarkdownEditorContent(editorDiv, markdownContent);
        return false;
    }

    return true;
}

// Destroy every CodeMirror editor hosted inside root (element or fragment).
// Must be called before discarding note DOM (innerHTML replacement, cache
// eviction...), otherwise the editor instances and their theme observers on
// <html>/<body> stay alive and accumulate as notes are switched.
function destroyMarkdownCodeMirrorEditorsWithin(root) {
    var api = getMarkdownCodeMirrorApi();
    if (!api || !root || typeof api.destroyEditorsWithin !== 'function') {
        return;
    }

    try {
        api.destroyEditorsWithin(root);
    } catch (e) {
        console.error('Error destroying CodeMirror editors:', e);
    }
}
window.destroyMarkdownCodeMirrorEditorsWithin = destroyMarkdownCodeMirrorEditorsWithin;

function renderMarkdownEditorContent(editorDiv, content) {
    if (!editorDiv) {
        return;
    }

    if (setCodeMirrorMarkdownContent(editorDiv, content)) {
        return;
    }

    var rawContent = String(content || '');
    var pattern = _mdGetExcalidrawBlockRegex();
    var match = pattern.exec(rawContent);

    if (!match) {
        editorDiv.textContent = rawContent;
        return;
    }

    pattern.lastIndex = 0;
    editorDiv.innerHTML = '';

    var fragment = document.createDocumentFragment();
    var lastIndex = 0;

    while ((match = pattern.exec(rawContent)) !== null) {
        if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(rawContent.slice(lastIndex, match.index)));
        }
        fragment.appendChild(_mdCreateExcalidrawEditorPlaceholder(match[0]));
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < rawContent.length) {
        fragment.appendChild(document.createTextNode(rawContent.slice(lastIndex)));
    }

    editorDiv.appendChild(fragment);
}

function isMarkdownEntryReadOnly(noteEntry) {
    if (!noteEntry) {
        return true;
    }

    if (document.body && document.body.classList.contains('public-workspace-readonly')) {
        return true;
    }

    var noteId = noteEntry.getAttribute('data-note-id') || (noteEntry.id || '').replace('entry', '');
    return !!(noteId && typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteId));
}

function applyMarkdownEditorEditableState(editorDiv, editable) {
    if (!editorDiv) {
        return;
    }

    var canEdit = !!editable;
    var api = getMarkdownCodeMirrorApi();
    var isCodeMirrorEditor = isCodeMirrorMarkdownEditor(editorDiv);
    if (isCodeMirrorEditor && api && typeof api.setReadOnly === 'function') {
        api.setReadOnly(editorDiv, !canEdit);
    }
    editorDiv.setAttribute('contenteditable', isCodeMirrorEditor ? 'false' : (canEdit ? 'true' : 'false'));
    editorDiv.setAttribute('aria-readonly', canEdit ? 'false' : 'true');
    editorDiv.classList.toggle('markdown-editor-readonly', !canEdit);

    if (!canEdit && document.activeElement === editorDiv) {
        editorDiv.blur();
    }
}

function isMarkdownEditorDisplayed(noteEntry, editorDiv) {
    if (!noteEntry || !editorDiv) {
        return false;
    }

    if (noteEntry.classList.contains('markdown-split-mode')) {
        return true;
    }

    var editorContainer = editorDiv.closest ? editorDiv.closest('.markdown-editor-container') : null;
    var elementToCheck = editorContainer || editorDiv;
    try {
        return window.getComputedStyle(elementToCheck).display !== 'none';
    } catch (e) {
        return elementToCheck.style.display !== 'none';
    }
}

function setMarkdownEditorEditable(editorDiv, editable) {
    var noteEntry = editorDiv && editorDiv.closest ? editorDiv.closest('.noteentry') : null;
    applyMarkdownEditorEditableState(editorDiv, !!editable && !isMarkdownEntryReadOnly(noteEntry));
}

function syncMarkdownEditorEditableState(noteEntryOrId) {
    var noteEntry = null;
    if (typeof noteEntryOrId === 'string' || typeof noteEntryOrId === 'number') {
        noteEntry = document.getElementById('entry' + noteEntryOrId);
    } else {
        noteEntry = noteEntryOrId;
    }

    if (!noteEntry || noteEntry.getAttribute('data-note-type') !== 'markdown') {
        return;
    }

    noteEntry.setAttribute('contenteditable', 'false');

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (!editorDiv) {
        return;
    }

    setMarkdownEditorEditable(editorDiv, isMarkdownEditorDisplayed(noteEntry, editorDiv));
}

var markdownSplitPaneHeightRaf = null;
var markdownSplitPaneHeightListenersAttached = false;

function getMarkdownSplitViewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
}

function getMarkdownSplitPaneBottomGap(noteEntry) {
    var bottomGap = 18;

    try {
        var configuredGap = window.getComputedStyle(noteEntry).getPropertyValue('--markdown-split-pane-bottom-gap');
        var parsedGap = parseFloat(configuredGap);
        if (isFinite(parsedGap)) {
            bottomGap = parsedGap;
        }
    } catch (e) {}

    return bottomGap;
}

function clearMarkdownSplitPaneHeight(noteEntryOrId) {
    var noteEntry = null;
    if (typeof noteEntryOrId === 'string' || typeof noteEntryOrId === 'number') {
        noteEntry = document.getElementById('entry' + noteEntryOrId);
    } else {
        noteEntry = noteEntryOrId;
    }

    if (noteEntry && noteEntry.style) {
        noteEntry.style.removeProperty('--markdown-split-pane-height');
    }
}

function updateMarkdownSplitPaneHeight(noteEntryOrId) {
    var noteEntry = null;
    if (typeof noteEntryOrId === 'string' || typeof noteEntryOrId === 'number') {
        noteEntry = document.getElementById('entry' + noteEntryOrId);
    } else {
        noteEntry = noteEntryOrId;
    }

    if (!noteEntry) {
        return;
    }

    if (!noteEntry.classList.contains('markdown-split-mode')) {
        clearMarkdownSplitPaneHeight(noteEntry);
        return;
    }

    ensureMarkdownSplitPaneHeightListeners();

    var panes = [
        noteEntry.querySelector('.markdown-editor-container'),
        noteEntry.querySelector('.markdown-preview')
    ];
    var paneTop = null;

    panes.forEach(function (pane) {
        if (!pane) {
            return;
        }

        try {
            if (window.getComputedStyle(pane).display === 'none') {
                return;
            }
        } catch (e) {}

        var rect = pane.getBoundingClientRect();
        if (rect.height > 0 || rect.top > 0) {
            paneTop = paneTop === null ? rect.top : Math.min(paneTop, rect.top);
        }
    });

    if (paneTop === null) {
        paneTop = noteEntry.getBoundingClientRect().top;
    }

    var viewportHeight = getMarkdownSplitViewportHeight();
    var bottomGap = getMarkdownSplitPaneBottomGap(noteEntry);
    var availableHeight = Math.floor(viewportHeight - Math.max(0, paneTop) - bottomGap);

    if (!isFinite(availableHeight) || availableHeight <= 0) {
        return;
    }

    noteEntry.style.setProperty('--markdown-split-pane-height', Math.max(120, availableHeight) + 'px');
}

function updateAllMarkdownSplitPaneHeights() {
    document.querySelectorAll('.noteentry.markdown-split-mode').forEach(function (noteEntry) {
        updateMarkdownSplitPaneHeight(noteEntry);
    });
}

function scheduleMarkdownSplitPaneHeightUpdate(noteEntryOrId) {
    if (markdownSplitPaneHeightRaf !== null) {
        window.cancelAnimationFrame(markdownSplitPaneHeightRaf);
    }

    markdownSplitPaneHeightRaf = window.requestAnimationFrame(function () {
        markdownSplitPaneHeightRaf = null;

        if (noteEntryOrId) {
            updateMarkdownSplitPaneHeight(noteEntryOrId);
        } else {
            updateAllMarkdownSplitPaneHeights();
        }
    });
}

function ensureMarkdownSplitPaneHeightListeners() {
    if (markdownSplitPaneHeightListenersAttached) {
        return;
    }

    markdownSplitPaneHeightListenersAttached = true;
    window.addEventListener('resize', function () {
        scheduleMarkdownSplitPaneHeightUpdate();
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () {
            scheduleMarkdownSplitPaneHeightUpdate();
        });
    }
}

// Helper function to normalize content from contentEditable
function normalizeContentEditableText(element) {
    if (isCodeMirrorMarkdownEditor(element)) {
        var codeMirrorContent = getCodeMirrorMarkdownContent(element);
        return codeMirrorContent === null ? '' : codeMirrorContent;
    }

    // More robust content extraction that handles contentEditable quirks
    var content = '';

    // Try to walk through the DOM structure to better preserve formatting
    if (element.childNodes.length > 0) {
        var parts = [];

        for (var i = 0; i < element.childNodes.length; i++) {
            var node = element.childNodes[i];

            if (node.nodeType === Node.TEXT_NODE) {
                // Preserve newlines that are already in the text node
                var textContent = node.textContent || node.nodeValue || '';
                parts.push(textContent);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (_mdIsExcalidrawEditorPlaceholder(node)) {
                    parts.push(_mdGetExcalidrawEditorPlaceholderSource(node));
                    continue;
                }

                var tagName = node.tagName;

                if (['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(tagName) !== -1) {
                    // Block elements
                    var divText = node.textContent || '';
                    var isEmpty = (divText === '' && node.querySelector('br'));

                    // Ensure preceding newline check
                    if (parts.length > 0) {
                        var lastPart = parts[parts.length - 1];
                        if (lastPart && !lastPart.endsWith('\n')) {
                            parts.push('\n');
                        }
                    }

                    if (isEmpty) {
                        parts.push('\n');
                    } else {
                        parts.push(divText);
                        parts.push('\n');
                    }
                } else if (tagName === 'BR') {
                    // BR = line break
                    parts.push('\n');
                } else {
                    // Other inline elements, get their text content
                    parts.push(node.textContent || '');
                }
            }
        }

        // Join parts simply - logic is now handled during pushed parts
        content = parts.join('');
    } else {
        // Fallback to innerText/textContent
        content = element.innerText || element.textContent || '';
    }

    // Handle different line ending styles
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Fix excessive blank lines logic REMOVED to preserve user's intentional empty lines
    // content = content.replace(/\n{3,}/g, '\n\n');

    // Remove trailing newlines (but preserve intentional spacing)
    content = content.replace(/\n+$/, '');

    return content;
}

function getSelectionOffsetsInTextElement(element) {
    if (isCodeMirrorMarkdownEditor(element)) {
        var api = getMarkdownCodeMirrorApi();
        if (api && typeof api.getSelectionOffsets === 'function') {
            return api.getSelectionOffsets(element);
        }
    }

    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    var range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
        return null;
    }

    var startRange = document.createRange();
    startRange.selectNodeContents(element);
    startRange.setEnd(range.startContainer, range.startOffset);

    var endRange = document.createRange();
    endRange.selectNodeContents(element);
    endRange.setEnd(range.endContainer, range.endOffset);

    return {
        start: startRange.toString().length,
        end: endRange.toString().length
    };
}

function setSelectionOffsetsInTextElement(element, startOffset, endOffset) {
    if (!element) {
        return;
    }

    if (isCodeMirrorMarkdownEditor(element)) {
        var api = getMarkdownCodeMirrorApi();
        if (api && typeof api.setSelection === 'function' && api.setSelection(element, startOffset, endOffset)) {
            return;
        }
    }

    var textLength = (element.textContent || '').length;
    var safeStart = Math.max(0, Math.min(startOffset, textLength));
    var safeEnd = Math.max(0, Math.min(endOffset, textLength));

    if (element.childNodes.length === 0) {
        element.appendChild(document.createTextNode(''));
    }

    var findNodeAndOffset = function (targetOffset) {
        var traversed = 0;

        function walk(node) {
            if (!node) {
                return null;
            }

            if (node.nodeType === Node.TEXT_NODE) {
                var textLength = (node.textContent || '').length;
                var nextTraversed = traversed + textLength;
                if (targetOffset <= nextTraversed) {
                    return {
                        node: node,
                        offset: targetOffset - traversed
                    };
                }
                traversed = nextTraversed;
                return null;
            }

            if (_mdIsExcalidrawEditorPlaceholder(node)) {
                var rawSource = _mdGetExcalidrawEditorPlaceholderSource(node);
                var rawLength = rawSource.length;
                var nextPlaceholderOffset = traversed + rawLength;
                if (targetOffset <= nextPlaceholderOffset) {
                    var parentNode = node.parentNode || element;
                    var childIndex = Array.prototype.indexOf.call(parentNode.childNodes, node);
                    return {
                        node: parentNode,
                        offset: targetOffset <= traversed ? childIndex : childIndex + 1
                    };
                }
                traversed = nextPlaceholderOffset;
                return null;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                for (var child = node.firstChild; child; child = child.nextSibling) {
                    var match = walk(child);
                    if (match) {
                        return match;
                    }
                }
            }

            return null;
        }

        return walk(element) || {
            node: element,
            offset: element.childNodes.length
        };
    };

    var startPosition = findNodeAndOffset(safeStart);
    var endPosition = findNodeAndOffset(safeEnd);
    var range = document.createRange();
    var selection = window.getSelection();

    try {
        element.focus({ preventScroll: true });
    } catch (e) {
        element.focus();
    }

    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, endPosition.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

function isElementVerticallyScrollable(element) {
    if (!element) {
        return false;
    }

    var overflowY = '';
    try {
        overflowY = window.getComputedStyle(element).overflowY;
    } catch (error) {
        overflowY = '';
    }

    return element.scrollHeight > element.clientHeight && overflowY !== 'visible' && overflowY !== 'hidden';
}

function getMarkdownEditorScrollContainer(editorDiv) {
    if (!editorDiv) {
        return null;
    }

    if (isCodeMirrorMarkdownEditor(editorDiv)) {
        var cmScroller = editorDiv.querySelector('.cm-scroller');
        if (isElementVerticallyScrollable(cmScroller)) {
            return cmScroller;
        }
    }

    if (isElementVerticallyScrollable(editorDiv)) {
        return editorDiv;
    }

    var editorContainer = editorDiv.closest ? editorDiv.closest('.markdown-editor-container') : null;
    if (isElementVerticallyScrollable(editorContainer)) {
        return editorContainer;
    }

    var scrollContainer = document.getElementById('right_col');
    if (isElementVerticallyScrollable(scrollContainer)) {
        return scrollContainer;
    }

    return scrollContainer || editorContainer || editorDiv;
}

// Caret rectangle in viewport coordinates, for scrolling the caret into view
// and for positioning popups next to it.
//
// This file used to declare getMarkdownCaretClientRect twice at module scope.
// Function declarations hoist, so the second one silently won for every caller
// and the first (which had an extra zero-width-marker fallback for collapsed
// ranges with no client rects) was dead code. The surviving implementation is
// kept verbatim here; only the dead duplicate was removed.
function getMarkdownCaretClientRect(editorDiv) {
    if (isCodeMirrorMarkdownEditor(editorDiv)) {
        var cmApi = getMarkdownCodeMirrorApi();
        var cmSelection = cmApi && typeof cmApi.getSelectionOffsets === 'function'
            ? cmApi.getSelectionOffsets(editorDiv)
            : null;
        if (cmSelection && typeof cmApi.getCoordsAtPos === 'function') {
            var rect = cmApi.getCoordsAtPos(editorDiv, cmSelection.end, 1)
                || cmApi.getCoordsAtPos(editorDiv, cmSelection.end, -1);
            if (rect && isFinite(rect.top)) return rect;
        }
        var activeLine = editorDiv.querySelector && editorDiv.querySelector('.cm-activeLine');
        if (activeLine) return activeLine.getBoundingClientRect();
        return null;
    }

    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);
    if (!editorDiv.contains(range.startContainer)) return null;
    var r = range.getBoundingClientRect();
    return (r && isFinite(r.top)) ? r : null;
}

function scrollMarkdownCaretIntoView(editorDiv) {
    if (!editorDiv) {
        return;
    }

    if (isCodeMirrorMarkdownEditor(editorDiv)) {
        var cmApi = getMarkdownCodeMirrorApi();
        if (!cmApi || typeof cmApi.hasFocus !== 'function' || !cmApi.hasFocus(editorDiv)) {
            return;
        }
    } else if (document.activeElement !== editorDiv) {
        return;
    }

    var scrollContainer = getMarkdownEditorScrollContainer(editorDiv);
    var caretRect = getMarkdownCaretClientRect(editorDiv);
    if (!scrollContainer || !caretRect) {
        return;
    }

    var containerRect = scrollContainer.getBoundingClientRect();
    var bottomPadding = 48;
    var topPadding = 24;
    var scrollDelta = 0;

    if (caretRect.bottom > containerRect.bottom - bottomPadding) {
        scrollDelta = caretRect.bottom - containerRect.bottom + bottomPadding;
    } else if (caretRect.top < containerRect.top + topPadding) {
        scrollDelta = caretRect.top - containerRect.top - topPadding;
    }

    if (scrollDelta !== 0) {
        scrollContainer.scrollTop += scrollDelta;
    }
}

function scheduleMarkdownCaretScrollIntoView(editorDiv) {
    if (!editorDiv) {
        return;
    }

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function () {
            scrollMarkdownCaretIntoView(editorDiv);
        });
    } else {
        setTimeout(function () {
            scrollMarkdownCaretIntoView(editorDiv);
        }, 0);
    }
}

function getMarkdownLineStartOffsets(text) {
    var offsets = [0];
    for (var i = 0; i < text.length; i++) {
        if (text.charAt(i) === '\n') {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

function getMarkdownLineIndexForOffset(lineStarts, offset) {
    var safeOffset = Math.max(0, offset);
    var lineIndex = 0;

    while (lineIndex + 1 < lineStarts.length && lineStarts[lineIndex + 1] <= safeOffset) {
        lineIndex++;
    }

    return lineIndex;
}

function getMarkdownIndentWidth(indent) {
    return (indent || '').replace(/\t/g, '    ').length;
}

function updateMarkdownEditorContent(editorDiv, noteEntry, noteId, content, selectionStart, selectionEnd) {
    renderMarkdownEditorContent(editorDiv, content);
    noteEntry.setAttribute('data-markdown-content', content);

    if (typeof noteid !== 'undefined') {
        noteid = noteId;
    }
    window.noteid = noteId;

    if (!isCodeMirrorMarkdownEditor(editorDiv)) {
        editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setSelectionOffsetsInTextElement(editorDiv, selectionStart, selectionEnd);
    scheduleMarkdownCaretScrollIntoView(editorDiv);
}

// Public API of this file.
window.renderMarkdownEditorContent = renderMarkdownEditorContent;
window.syncMarkdownEditorEditableState = syncMarkdownEditorEditableState;
window.updateMarkdownSplitPaneHeight = updateMarkdownSplitPaneHeight;
window.scheduleMarkdownSplitPaneHeightUpdate = scheduleMarkdownSplitPaneHeightUpdate;

// Shared with the other markdown-*.js modules, and by the js/toolbar-*.js set
// and js/slash-command.js. Listed explicitly so the cross-file surface of this
// module is visible here, and so renaming one of them fails the lint rather
// than silently breaking a caller in another file.
window.initializeCodeMirrorMarkdownEditor = initializeCodeMirrorMarkdownEditor;
window.normalizeContentEditableText = normalizeContentEditableText;
window.getSelectionOffsetsInTextElement = getSelectionOffsetsInTextElement;
window.getMarkdownLineStartOffsets = getMarkdownLineStartOffsets;
window.getMarkdownLineIndexForOffset = getMarkdownLineIndexForOffset;
window.getMarkdownIndentWidth = getMarkdownIndentWidth;
window.updateMarkdownEditorContent = updateMarkdownEditorContent;

/**
 * Rich text editing: note body key handling.
 * 
 * Keyboard behaviour inside a note body, dominated by heading deletion: removing a
 * heading has to keep the surrounding blocks, the outline and the caret consistent,
 * which is why this is the largest part of the module.
 */

// ============================================================================
// NOTE ENTRY HANDLERS
// ============================================================================

/**
 * Handle Enter key in blockquote or callout - exit block if at end (or always for callouts)
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 */
function handleBlockquoteEnter(e, selection) {
    if (!selection.rangeCount) return;

    var range = selection.getRangeAt(0);
    var container = range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;

    // Check for standard blockquote OR specialized callout
    var blockquote = container.closest('blockquote');
    var callout = container.closest('aside.callout');

    if (!blockquote && !callout) return;

    var elementToExit = blockquote || callout;

    // For callouts, the text is inside .callout-body
    var checkEndElement = callout ? (callout.querySelector('.callout-body') || callout) : blockquote;

    // Check if cursor is at end of blockquote, or always exit for specialized callouts
    // as requested (users want to exit callouts with a single Enter)
    if (callout || isCursorAtEnd(checkEndElement, selection)) {
        e.preventDefault();

        var newPara = document.createElement('div');
        newPara.innerHTML = '<br>';
        elementToExit.parentElement.insertBefore(newPara, elementToExit.nextSibling);

        setCursorPosition(newPara, 0, false);
        triggerNoteSave();
    }
}

/**
 * Handle Backspace in empty blockquote/callout - remove block container
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 * @returns {boolean} True if handled
 */
function handleEmptyQuoteBackspace(e, selection) {
    if (!selection || selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    var container = range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;

    if (!container || !container.closest) return false;

    var blockquote = container.closest('blockquote');
    var callout = container.closest('aside.callout');
    var block = blockquote || callout;

    if (!block) return false;
    if (!isCursorAtStart(selection)) return false;

    var checkContentElement = callout ? (callout.querySelector('.callout-body') || callout) : blockquote;
    var normalizedText = (checkContentElement.textContent || '').replace(/[\s\u200B-\u200D\uFEFF\u00A0]/g, '');
    var hasMediaContent = !!checkContentElement.querySelector('img, video, audio, iframe, table, pre, code, ul, ol, li, hr, details, .excalidraw-wrapper');

    if (normalizedText !== '' || hasMediaContent) return false;

    e.preventDefault();

    var replacement = document.createElement('div');
    replacement.innerHTML = '<br>';

    if (block.parentElement) {
        block.parentElement.insertBefore(replacement, block);
        block.remove();
        setCursorPosition(replacement, 0, false);
        triggerNoteSave();
        return true;
    }

    return false;
}

// ============================================================================
// HEADING DELETION HANDLING
// ============================================================================

var HEADING_BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6';
var HEADING_ANCHOR_NODE_SELECTOR = '.heading-anchor, [data-heading-anchor="true"]';
// Blocks containing any of these are left to the browser's default merge logic
var HEADING_MERGE_BLOCKING_SELECTOR = 'img, video, audio, iframe, table, pre, ul, ol, li, hr, details, blockquote, aside, ' +
    'h1, h2, h3, h4, h5, h6, .excalidraw-wrapper';

function isHeadingElement(el) {
    return !!(el && el.nodeType === 1 && /^H[1-6]$/.test(el.tagName));
}

function isPlainTextBlock(el) {
    return !!(el && el.nodeType === 1 && (el.tagName === 'DIV' || el.tagName === 'P'));
}

/**
 * A block whose children can safely be moved into a sibling block
 */
function isMergeableBlock(el) {
    return (isHeadingElement(el) || isPlainTextBlock(el)) && !el.querySelector(HEADING_MERGE_BLOCKING_SELECTOR);
}

function removeHeadingAnchorNodes(el) {
    var anchors = el.querySelectorAll(HEADING_ANCHOR_NODE_SELECTOR);
    for (var i = 0; i < anchors.length; i++) {
        anchors[i].remove();
    }
}

/**
 * True when the block holds no visible text (heading anchor icons ignored)
 */
function isBlockVisuallyEmpty(el) {
    if (!el) return false;
    var clone = el.cloneNode(true);
    removeHeadingAnchorNodes(clone);
    var text = (clone.textContent || '').replace(/[\s\u200B-\u200D\uFEFF\u00A0]/g, '');
    return text === '' && !clone.querySelector('img, video, audio, iframe, table, pre, ul, ol, hr, details, .excalidraw-wrapper');
}

function isTextNodeWithContent(node) {
    return !!(node && node.nodeType === 3 && (node.textContent || '').replace(/[\s\u200B-\u200D\uFEFF\u00A0]/g, '') !== '');
}

function isCaretAtBlockStart(range, block) {
    var probe = document.createRange();
    probe.setStart(block, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().replace(/[\u200B-\u200D\uFEFF]/g, '') === '';
}

function isCaretAtBlockEnd(range, block) {
    var probe = document.createRange();
    probe.setStart(range.endContainer, range.endOffset);
    probe.setEnd(block, block.childNodes.length);
    return probe.toString().replace(/[\u200B-\u200D\uFEFF]/g, '') === '';
}

function getFirstTextNode(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    return walker.nextNode();
}

function selectCollapsedRange(range) {
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function placeCaretAtBlockStart(block) {
    var range = document.createRange();
    var textNode = getFirstTextNode(block);
    if (textNode) {
        range.setStart(textNode, 0);
    } else {
        range.setStart(block, 0);
    }
    range.collapse(true);
    selectCollapsedRange(range);
}

function placeCaretAtBlockEnd(block) {
    var range = document.createRange();
    var last = block.lastChild;
    // Skip a trailing <br>: the caret must sit before it, otherwise Chrome
    // renders it on a phantom extra line
    while (last && last.nodeType === 1 && last.tagName === 'BR') {
        last = last.previousSibling;
    }
    if (!last) {
        range.setStart(block, 0);
    } else if (last.nodeType === 3) {
        range.setStart(last, last.textContent.length);
    } else {
        range.setStartAfter(last);
    }
    range.collapse(true);
    selectCollapsedRange(range);
}

/**
 * Replace a heading with a plain block holding the same content
 * @returns {HTMLElement} The new block
 */
function convertHeadingToPlainBlock(heading) {
    var block = document.createElement('div');
    removeHeadingAnchorNodes(heading);
    while (heading.firstChild) {
        block.appendChild(heading.firstChild);
    }
    if (isBlockVisuallyEmpty(block)) {
        block.innerHTML = '<br>';
    }
    heading.parentNode.replaceChild(block, heading);
    return block;
}

/**
 * Move the content of `source` to the end of `target`, remove `source`
 * and put the caret at the junction. Unlike the browser's native merge this
 * never wraps the moved text in style spans (font-size, font-weight...), so
 * text joining a heading becomes heading text and heading text joining a
 * paragraph becomes plain text.
 */
function mergeBlockIntoPrevious(target, source) {
    removeHeadingAnchorNodes(target);
    removeHeadingAnchorNodes(source);

    if (isBlockVisuallyEmpty(target)) {
        target.innerHTML = '';
    }
    while (target.lastChild && target.lastChild.nodeType === 1 && target.lastChild.tagName === 'BR') {
        target.removeChild(target.lastChild);
    }
    if (isBlockVisuallyEmpty(source)) {
        source.innerHTML = '';
    }

    var junction = target.lastChild;
    while (source.firstChild) {
        target.appendChild(source.firstChild);
    }
    source.remove();

    if (!target.firstChild) {
        target.innerHTML = '<br>';
    }

    var range = document.createRange();
    if (junction && junction.nodeType === 3) {
        range.setStart(junction, junction.textContent.length);
    } else if (junction) {
        range.setStartAfter(junction);
    } else {
        var firstText = getFirstTextNode(target);
        if (firstText) {
            range.setStart(firstText, 0);
        } else {
            range.setStart(target, 0);
        }
    }
    range.collapse(true);
    selectCollapsedRange(range);
}

/**
 * Handle Backspace/Delete when a heading is involved at the caret boundary.
 * The browser's native merge keeps an emptied heading alive (with its id, so
 * its section link) and wraps merged text in inline style spans, which is
 * how a paragraph pulled up into a deleted heading ended up as bold heading
 * text. This handler removes emptied headings outright and merges the
 * neighbouring blocks itself.
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 * @param {HTMLElement} noteentry - The editable note container
 * @returns {boolean} True if handled
 */
function handleHeadingBoundaryDelete(e, selection, noteentry) {
    if (!noteentry || !selection || selection.rangeCount === 0) return false;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;

    var range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    var node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    if (!node || !node.closest || !noteentry.contains(node)) return false;
    if (node.closest('li, table, pre, code, blockquote, aside, details, .markdown-editor')) return false;

    var block = node.closest(HEADING_BLOCK_SELECTOR + ', p, div');
    if (!block || block === noteentry || !noteentry.contains(block)) return false;

    var isBackspace = e.key === 'Backspace';
    var neighbor, adjacentNode;

    if (isBackspace) {
        if (!isCaretAtBlockStart(range, block)) return false;
        adjacentNode = block.previousSibling;
        neighbor = block.previousElementSibling;
    } else {
        if (!isCaretAtBlockEnd(range, block)) return false;
        adjacentNode = block.nextSibling;
        neighbor = block.nextElementSibling;
    }

    // Raw text directly next to the block: leave the browser to it
    if (isTextNodeWithContent(adjacentNode)) return false;

    var blockIsHeading = isHeadingElement(block);
    var neighborIsHeading = isHeadingElement(neighbor);
    if (!blockIsHeading && !neighborIsHeading) return false;

    // Emptied heading under the caret: drop it and move on to the neighbour
    if (blockIsHeading && isBlockVisuallyEmpty(block)) {
        e.preventDefault();
        if (neighbor && isMergeableBlock(neighbor)) {
            block.remove();
            if (isBackspace) {
                placeCaretAtBlockEnd(neighbor);
            } else {
                placeCaretAtBlockStart(neighbor);
            }
        } else {
            placeCaretAtBlockStart(convertHeadingToPlainBlock(block));
        }
        triggerNoteSave();
        return true;
    }

    // Emptied heading next to the caret: just remove it
    if (neighborIsHeading && isBlockVisuallyEmpty(neighbor)) {
        e.preventDefault();
        neighbor.remove();
        triggerNoteSave();
        return true;
    }

    // Heading at the very start of the note: Backspace turns it into plain text
    if (blockIsHeading && isBackspace && !neighbor) {
        e.preventDefault();
        placeCaretAtBlockStart(convertHeadingToPlainBlock(block));
        triggerNoteSave();
        return true;
    }

    if (!neighbor || !isMergeableBlock(block) || !isMergeableBlock(neighbor)) return false;

    // Backspace at the start of a heading with an empty line above: remove the line
    if (blockIsHeading && isBackspace && isBlockVisuallyEmpty(neighbor)) {
        e.preventDefault();
        neighbor.remove();
        triggerNoteSave();
        return true;
    }

    e.preventDefault();
    if (isBackspace) {
        mergeBlockIntoPrevious(neighbor, block);
    } else {
        mergeBlockIntoPrevious(block, neighbor);
    }
    triggerNoteSave();
    return true;
}

/**
 * Handle Enter at the very start of a heading. The browser splits the block
 * natively, which leaves an empty copy of the heading (same tag, same id)
 * above the caret, so the line opened above a title stays a title. Insert
 * a plain block above instead and keep the caret in the heading.
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 * @param {HTMLElement} noteentry - The editable note container
 * @returns {boolean} True if handled
 */
function handleHeadingStartEnter(e, selection, noteentry) {
    if (!noteentry || !selection || selection.rangeCount === 0) return false;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;

    var range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    var node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    if (!node || !node.closest || !noteentry.contains(node)) return false;
    if (node.closest('li, table, pre, code, blockquote, aside, details, .markdown-editor')) return false;

    var heading = node.closest(HEADING_BLOCK_SELECTOR);
    if (!heading || !noteentry.contains(heading)) return false;
    if (!isCaretAtBlockStart(range, heading)) return false;

    e.preventDefault();
    var block = document.createElement('div');
    block.innerHTML = '<br>';
    heading.parentNode.insertBefore(block, heading);
    placeCaretAtBlockStart(heading);
    triggerNoteSave();
    return true;
}

/**
 * Handle arrow down navigation from note entry to checklist
 * @param {Event} e - The keyboard event
 * @param {HTMLElement} noteentry - The note entry element
 */
function handleNavigateToChecklist(e, noteentry) {
    var selection = window.getSelection();

    if (!isCursorAtEnd(noteentry, selection)) return;

    var notecard = noteentry.closest('.notecard');
    if (!notecard) return;

    var firstChecklistItem = notecard.querySelector('li.checklist-item');
    if (!firstChecklistItem) return;

    e.preventDefault();

    var textSpan = firstChecklistItem.querySelector('.checklist-text');
    if (textSpan) {
        textSpan.focus();
        setCursorPosition(textSpan, 0, false);
    }
}

/**
 * Insert a line break in the current code block while keeping the caret inside it.
 * Falls back to manual DOM insertion when execCommand is unavailable.
 * @param {Selection} selection - The current selection
 */
function insertCodeBlockLineBreak(selection) {
    if (!selection || !selection.rangeCount) return;

    var inserted = false;
    try {
        inserted = document.execCommand('insertLineBreak');
    } catch (err) {
        inserted = false;
    }

    if (inserted) {
        triggerNoteSave();
        return;
    }

    var range = selection.getRangeAt(0);
    range.deleteContents();

    var br = document.createElement('br');
    range.insertNode(br);

    var newRange = document.createRange();
    newRange.setStartAfter(br);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);

    triggerNoteSave();
}

/**
 * Get the plain text of a range with <br> elements counted as newlines,
 * since Range.toString() ignores them entirely.
 * @param {Range} range - The range to serialize
 * @returns {string} The text content with line breaks preserved
 */
function getRangeTextWithLineBreaks(range) {
    var container = document.createElement('div');
    container.appendChild(range.cloneContents());
    container.querySelectorAll('br').forEach(function (br) {
        br.replaceWith('\n');
    });
    return container.textContent;
}

/**
 * Check whether the caret is currently on an empty line inside a code block.
 * @param {HTMLElement} pre - The containing pre element
 * @param {Range} range - The current selection range
 * @returns {boolean} True when the current line is empty or whitespace-only
 */
function isCaretOnEmptyCodeBlockLine(pre, range) {
    if (!pre || !range) return false;

    try {
        var beforeRange = range.cloneRange();
        beforeRange.selectNodeContents(pre);
        beforeRange.setEnd(range.startContainer, range.startOffset);

        var afterRange = range.cloneRange();
        afterRange.selectNodeContents(pre);
        afterRange.setStart(range.endContainer, range.endOffset);

        var textBefore = getRangeTextWithLineBreaks(beforeRange);
        var textAfter = getRangeTextWithLineBreaks(afterRange);
        var currentLineBefore = textBefore.split('\n').pop() || '';
        var currentLineAfter = textAfter.split('\n')[0] || '';

        return (currentLineBefore + currentLineAfter).trim() === '';
    } catch (err) {
        return false;
    }
}

/**
 * Check whether the caret is on the last line of a code block (only
 * whitespace or line breaks remain after it).
 * @param {HTMLElement} pre - The containing pre element
 * @param {Range} range - The current selection range
 * @returns {boolean} True when nothing but whitespace follows the caret
 */
function isCaretOnLastCodeBlockLine(pre, range) {
    try {
        var afterRange = range.cloneRange();
        afterRange.selectNodeContents(pre);
        afterRange.setStart(range.endContainer, range.endOffset);
        return getRangeTextWithLineBreaks(afterRange).trim() === '';
    } catch (err) {
        return false;
    }
}

/**
 * Remove the line break (newline character or <br>) that starts the empty
 * line the caret sits on, so exiting the code block does not leave a blank
 * line at its end.
 * @param {HTMLElement} pre - The containing pre element
 * @param {Range} range - The current selection range
 */
function removeEmptyCodeBlockLine(pre, range) {
    try {
        var caret = range.cloneRange();
        caret.collapse(true);

        // Collect text nodes and <br> elements located before the caret
        var walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
        var beforeCaret = [];
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === 3) {
                if (node === caret.startContainer) {
                    beforeCaret.push({ node: node, end: caret.startOffset });
                } else if (caret.comparePoint(node, 0) < 0) {
                    beforeCaret.push({ node: node, end: node.textContent.length });
                }
            } else if (node.nodeName === 'BR') {
                var index = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
                if (caret.comparePoint(node.parentNode, index) <= 0) {
                    beforeCaret.push({ node: node, end: 0 });
                }
            }
        }

        // Walk backwards over the empty line until the break that starts it
        var whitespaceEntries = [];
        for (var i = beforeCaret.length - 1; i >= 0; i--) {
            var entry = beforeCaret[i];
            if (entry.node.nodeName === 'BR') {
                entry.node.remove();
                whitespaceEntries.forEach(function (t) { t.node.deleteData(0, t.end); });
                return;
            }
            var text = entry.node.textContent.slice(0, entry.end);
            var breakPos = text.lastIndexOf('\n');
            if (breakPos !== -1) {
                entry.node.deleteData(breakPos, entry.end - breakPos);
                whitespaceEntries.forEach(function (t) { t.node.deleteData(0, t.end); });
                return;
            }
            if (text.trim() !== '') return;
            if (entry.end > 0) whitespaceEntries.push(entry);
        }
    } catch (err) {
        // Leave the block untouched when the DOM walk fails
        console.debug('events-rte-notes: removeEmptyCodeBlockLine() failed:', err);
    }
}

/**
 * Handle Enter key in code block - insert a line break, or exit the block
 * when the caret is on an empty line.
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 */
function handleCodeBlockEnter(e, selection) {
    if (!selection.rangeCount) return;

    var range = selection.getRangeAt(0);
    var container = range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;

    // Check if we're inside a pre or code element
    var pre = container.closest('pre');
    if (!pre) return;

    var noteentry = pre.closest('.noteentry');
    if (!noteentry) return;

    if (!isCaretOnEmptyCodeBlockLine(pre, range)) {
        e.preventDefault();
        insertCodeBlockLineBreak(selection);
        return;
    }

    e.preventDefault();

    // Drop the trailing empty line so repeated exits don't stack blank lines
    if (isCaretOnLastCodeBlockLine(pre, range)) {
        removeEmptyCodeBlockLine(pre, range);
    }

    // Create a new paragraph after the code block
    var newPara = document.createElement('div');
    newPara.innerHTML = '<br>';

    pre.parentElement.insertBefore(newPara, pre.nextSibling);

    // Move cursor to the new paragraph
    setCursorPosition(newPara, 0, false);
    triggerNoteSave();
}

/**
 * Handle Enter key in markdown editor for list/task continuation.
 * When pressing Enter on a line starting with "- ", "- [ ] ", or a numbered list item (e.g., "1. "), auto-continues the list.
 * Pressing Enter on an empty list item (just the prefix) exits the list.
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 * @returns {boolean} True if the event was handled
 */
function handleMarkdownListEnter(e, selection) {
    if (!selection.rangeCount) return false;

    var range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    var startContainer = range.startContainer;
    if (startContainer.nodeType !== Node.TEXT_NODE) return false;

    var parent = startContainer.parentElement;
    if (!parent) return false;

    // Determine if we're inside a .markdown-editor
    var markdownEditor = null;
    if (parent.classList && parent.classList.contains('markdown-editor')) {
        markdownEditor = parent;
    } else if (parent.tagName === 'DIV' && parent.parentElement &&
        parent.parentElement.classList && parent.parentElement.classList.contains('markdown-editor')) {
        markdownEditor = parent.parentElement;
    }
    if (!markdownEditor) return false;

    // Get the current line element and its full text
    var lineElement = null;
    var lineText = '';
    var cursorOffset = range.startOffset;
    var fullText = '';
    var lineStart = 0;
    var lineEnd = 0;

    if (parent === markdownEditor) {
        // Text node directly in the editor (single text node containing all lines)
        fullText = startContainer.textContent || '';
        lineStart = fullText.lastIndexOf('\n', Math.max(0, cursorOffset - 1)) + 1;
        lineEnd = fullText.indexOf('\n', cursorOffset);
        if (lineEnd === -1) {
            lineEnd = fullText.length;
        }
        lineText = fullText.slice(lineStart, lineEnd);
        lineElement = null;
    } else {
        // Text node inside a line <div>
        lineElement = parent;
        lineText = parent.textContent;
        // Cursor offset may need adjusting if there are sibling text nodes before this one
        var offsetAdjust = 0;
        for (var i = 0; i < parent.childNodes.length; i++) {
            if (parent.childNodes[i] === startContainer) break;
            offsetAdjust += (parent.childNodes[i].textContent || '').length;
        }
        cursorOffset = offsetAdjust + range.startOffset;
    }

    // Match task item prefix first, then plain bullet, then numbered list
    // Capture optional leading spaces (indentation)
    var taskMatch = lineText.match(/^(\s*)(- \[[ xX]\] )/);
    var bulletMatch = !taskMatch && lineText.match(/^(\s*)(- )/);
    var numberedMatch = !taskMatch && !bulletMatch && lineText.match(/^(\s*)(\d+\. )/);

    if (!taskMatch && !bulletMatch && !numberedMatch) return false;

    var indent = '';
    var marker = '';
    var prefix = '';
    var newPrefix = '';

    if (taskMatch) {
        indent = taskMatch[1];
        marker = taskMatch[2];
        prefix = indent + marker;
        newPrefix = indent + '- [ ] ';
    } else if (bulletMatch) {
        indent = bulletMatch[1];
        marker = bulletMatch[2];
        prefix = indent + marker;
        newPrefix = indent + '- ';
    } else if (numberedMatch) {
        indent = numberedMatch[1];
        marker = numberedMatch[2];
        prefix = indent + marker;
        var currentNumber = parseInt(marker);
        newPrefix = indent + (currentNumber + 1) + '. ';
    }

    e.preventDefault();

    // Empty list item: just the prefix with nothing after — exit the list
    if (lineText === prefix) {
        if (lineElement) {
            lineElement.innerHTML = '<br>';
            setCursorPosition(lineElement, 0, false);
        } else {
            var newTextAfterExit = fullText.slice(0, lineStart) + fullText.slice(lineEnd);
            startContainer.textContent = newTextAfterExit;
            try {
                var exitRange = document.createRange();
                exitRange.setStart(startContainer, lineStart);
                exitRange.collapse(true);
                var exitSel = window.getSelection();
                exitSel.removeAllRanges();
                exitSel.addRange(exitRange);
            } catch (e) {
                // Fall back to default cursor placement if the range fails
                console.debug('events-rte-notes: handleMarkdownListEnter() failed:', e);
            }
        }
        triggerNoteSave();
        return true;
    }

    // Split line at cursor: keep text before cursor on current line, move rest to new line
    var textBeforeCursor = lineText.slice(0, cursorOffset - (parent === markdownEditor ? lineStart : 0));
    var textAfterCursor = lineText.slice(cursorOffset - (parent === markdownEditor ? lineStart : 0));
    var newLineContent = newPrefix + textAfterCursor;

    if (lineElement) {
        var newDiv = document.createElement('div');
        if (newLineContent === '') {
            newDiv.innerHTML = '<br>';
        } else {
            newDiv.textContent = newLineContent;
        }

        lineElement.textContent = textBeforeCursor || '';
        if (!textBeforeCursor) lineElement.innerHTML = '<br>';
        markdownEditor.insertBefore(newDiv, lineElement.nextSibling);

        // Place cursor right after the new prefix
        if (newDiv.firstChild && newDiv.firstChild.nodeType === Node.TEXT_NODE) {
            var newRange = document.createRange();
            newRange.setStart(newDiv.firstChild, newPrefix.length);
            newRange.collapse(true);
            var newSel = window.getSelection();
            newSel.removeAllRanges();
            newSel.addRange(newRange);
        } else {
            setCursorPosition(newDiv, 0, false);
        }
    } else {
        var insertText = '\n' + newPrefix;
        var newFullText = fullText.slice(0, cursorOffset) + insertText + fullText.slice(cursorOffset);
        startContainer.textContent = newFullText;

        // Place cursor right after the new prefix
        try {
            var caretOffset = cursorOffset + insertText.length;
            var textRange = document.createRange();
            textRange.setStart(startContainer, caretOffset);
            textRange.collapse(true);
            var textSel = window.getSelection();
            textSel.removeAllRanges();
            textSel.addRange(textRange);
        } catch (e) {
            // Fall back to default cursor placement if the range fails
            console.debug('events-rte-notes: handleMarkdownListEnter() failed:', e);
        }
    }

    triggerNoteSave();
    return true;
}

/**
 * Handle Tab key in markdown lists (bullet, numbered, task lists)
 * Indent with Tab, outdent with Shift+Tab
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 * @returns {boolean} True if handled, false otherwise
 */
function handleMarkdownListTab(e, selection) {
    if (!selection.rangeCount) return false;

    var range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    var startContainer = range.startContainer;
    if (startContainer.nodeType !== Node.TEXT_NODE) return false;

    var parent = startContainer.parentElement;
    if (!parent) return false;

    // Determine if we're inside a .markdown-editor
    var markdownEditor = null;
    if (parent.classList && parent.classList.contains('markdown-editor')) {
        markdownEditor = parent;
    } else if (parent.tagName === 'DIV' && parent.parentElement &&
        parent.parentElement.classList && parent.parentElement.classList.contains('markdown-editor')) {
        markdownEditor = parent.parentElement;
    }
    if (!markdownEditor) return false;

    // Get the current line element and its full text
    var lineElement = null;
    var lineText = '';
    var cursorOffset = range.startOffset;
    var fullText = '';
    var lineStart = 0;
    var lineEnd = 0;

    if (parent === markdownEditor) {
        // Text node directly in the editor (single text node containing all lines)
        fullText = startContainer.textContent || '';
        lineStart = fullText.lastIndexOf('\n', Math.max(0, cursorOffset - 1)) + 1;
        lineEnd = fullText.indexOf('\n', cursorOffset);
        if (lineEnd === -1) {
            lineEnd = fullText.length;
        }
        lineText = fullText.slice(lineStart, lineEnd);
        lineElement = null;
    } else {
        // Text node inside a line <div>
        lineElement = parent;
        lineText = parent.textContent;
        // Cursor offset may need adjusting if there are sibling text nodes before this one
        var offsetAdjust = 0;
        for (var i = 0; i < parent.childNodes.length; i++) {
            if (parent.childNodes[i] === startContainer) break;
            offsetAdjust += (parent.childNodes[i].textContent || '').length;
        }
        cursorOffset = offsetAdjust + range.startOffset;
    }

    // Match indented task items, plain task items, bullets, or numbered lists
    var indentMatch = lineText.match(/^(\s*)(- \[[ xX]\] |- |\d+\. )/);

    if (!indentMatch) return false;

    var currentIndent = indentMatch[1];
    var listMarker = indentMatch[2];
    var restOfLine = lineText.slice(currentIndent.length + listMarker.length);

    e.preventDefault();

    var newIndent;
    if (e.shiftKey) {
        // Shift+Tab: outdent (remove up to 4 spaces)
        if (currentIndent.length >= 4) {
            newIndent = currentIndent.slice(4);
        } else if (currentIndent.length > 0) {
            newIndent = '';
        } else {
            // Already at leftmost position
            return true;
        }
    } else {
        // Tab: indent (add 4 spaces)
        newIndent = '    ' + currentIndent;
    }

    var newLineText = newIndent + listMarker + restOfLine;

    if (lineElement) {
        // Update the line element
        lineElement.textContent = newLineText;

        // Restore cursor position (adjust for indent change)
        var indentDiff = newIndent.length - currentIndent.length;
        var newCursorPos = cursorOffset + indentDiff;

        if (lineElement.firstChild && lineElement.firstChild.nodeType === Node.TEXT_NODE) {
            var newRange = document.createRange();
            newRange.setStart(lineElement.firstChild, newCursorPos);
            newRange.collapse(true);
            var newSel = window.getSelection();
            newSel.removeAllRanges();
            newSel.addRange(newRange);
        }
    } else {
        // Update the full text node
        var newFullText = fullText.slice(0, lineStart) + newLineText + fullText.slice(lineEnd);
        startContainer.textContent = newFullText;

        // Restore cursor position
        var indentDiff = newIndent.length - currentIndent.length;
        var newCursorPos = cursorOffset + indentDiff;

        try {
            var textRange = document.createRange();
            textRange.setStart(startContainer, newCursorPos);
            textRange.collapse(true);
            var textSel = window.getSelection();
            textSel.removeAllRanges();
            textSel.addRange(textRange);
        } catch (err) {
            // Fall back to default cursor placement if the range fails
            console.debug('events-rte-notes: handleMarkdownListTab() failed:', err);
        }
    }

    triggerNoteSave();
    return true;
}

/**
 * Handle keyboard events in the note entry area
 * @param {Event} e - The keyboard event
 */
function handleNoteEntryKeydown(e) {
    var target = e.target;

    if (!target.closest || !target.closest('.noteentry')) return;
    if (target.closest('.markdown-codemirror-host')) return;

    // Delegate to checklist handler if in checklist
    if (target.closest('li.checklist-item')) {
        handleChecklistKeydown(e);
        return;
    }

    var selection = window.getSelection();

    // Handle Backspace in empty quote/callout blocks
    if (e.key === 'Backspace') {
        if (handleEmptyQuoteBackspace(e, selection)) {
            return;
        }
    }

    // Handle Backspace/Delete at heading boundaries (emptied headings, merges)
    if (e.key === 'Backspace' || e.key === 'Delete') {
        if (handleHeadingBoundaryDelete(e, selection, target.closest('.noteentry[contenteditable="true"]'))) {
            return;
        }
    }

    // Handle Enter key in code block
    if (e.key === 'Enter' && !e.shiftKey) {
        // Enter at the start of a heading: open a plain line above it
        if (handleHeadingStartEnter(e, selection, target.closest('.noteentry[contenteditable="true"]'))) {
            return;
        }

        // Check if we're in a code block
        var container = selection.rangeCount > 0
            ? selection.getRangeAt(0).commonAncestorContainer
            : null;
        if (container) {
            var checkNode = container.nodeType === 3 ? container.parentElement : container;
            var inCodeBlock = checkNode && checkNode.closest && (checkNode.closest('pre') || checkNode.closest('code'));

            if (inCodeBlock) {
                handleCodeBlockEnter(e, selection);
                return;
            }
        }

        // Handle Enter key in markdown list (bullet or task continuation)
        if (handleMarkdownListEnter(e, selection)) {
            return;
        }

        // Handle Enter key in blockquote
        handleBlockquoteEnter(e, selection);
    }

    // Handle Tab key in markdown list (indent/outdent) or insert tab in editor/code/pre
    if (e.key === 'Tab') {
        const isInList = handleMarkdownListTab(e, selection);
        if (isInList) {
            return;
        }

        // If not in a list, check if we're in the markdown editor or a code block
        var container = selection.rangeCount > 0
            ? selection.getRangeAt(0).commonAncestorContainer
            : null;

        if (container) {
            var checkNode = container.nodeType === 3 ? container.parentElement : container;
            var inMarkdownEditor = checkNode && checkNode.closest && checkNode.closest('.markdown-editor');
            var inCodeBlock = checkNode && checkNode.closest && (checkNode.closest('pre') || checkNode.closest('code'));
            var inRichTextNote = checkNode && checkNode.closest && checkNode.closest('.noteentry[contenteditable="true"]');

            if (inMarkdownEditor || inCodeBlock || inRichTextNote) {
                e.preventDefault();

                // Insert 4 spaces for Tab. In the rich-text note (default white-space),
                // consecutive plain spaces collapse to one, so use non-breaking spaces.
                // The markdown editor and code blocks use pre white-space, so plain
                // spaces are fine there.
                var tabString = inRichTextNote && !inMarkdownEditor && !inCodeBlock
                    ? '    '
                    : '    ';

                if (selection.rangeCount) {
                    var range = selection.getRangeAt(0);
                    range.deleteContents();

                    var tabNode = document.createTextNode(tabString);
                    range.insertNode(tabNode);

                    // Move cursor after the inserted spaces
                    range.setStartAfter(tabNode);
                    range.setEndAfter(tabNode);
                    selection.removeAllRanges();
                    selection.addRange(range);

                    // Explicitly trigger input event for the editor
                    if (inMarkdownEditor) {
                        const inputEvent = new Event('input', { bubbles: true });
                        inMarkdownEditor.dispatchEvent(inputEvent);
                    }

                    triggerNoteSave();
                }
                return;
            }
        }
    }

    // Handle note keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+Shift+S, Ctrl+Shift+B, etc.)
    if (e.ctrlKey || e.metaKey) {
        var container = selection.rangeCount > 0
            ? selection.getRangeAt(0).commonAncestorContainer
            : null;
        var checkNode = container ? (container.nodeType === 3 ? container.parentElement : container) : null;
        var inMarkdownEditor = checkNode && checkNode.closest && checkNode.closest('.markdown-editor');
        var noteEditor = checkNode && checkNode.closest && checkNode.closest('.noteentry[contenteditable="true"], .markdown-editor');

        if (e.key.toLowerCase() === 'k' && noteEditor) {
            e.preventDefault();
            if (typeof window.addLinkToNote === 'function') {
                window.addLinkToNote();
            } else if (typeof addLinkToNote === 'function') {
                addLinkToNote();
            }
            return;
        }

        if (e.shiftKey && e.key.toLowerCase() === 's' && noteEditor) {
            e.preventDefault();
            if (inMarkdownEditor) {
                if (typeof window.applyMarkdownStrikethrough === 'function') {
                    window.applyMarkdownStrikethrough();
                } else if (typeof applyMarkdownStrikethrough === 'function') {
                    applyMarkdownStrikethrough();
                }
            } else {
                document.execCommand('strikeThrough');
            }
            return;
        }


        if (e.key.toLowerCase() === 'u' && noteEditor) {
            e.preventDefault();
            if (inMarkdownEditor) {
                if (typeof window.applyMarkdownUnderline === 'function') {
                    window.applyMarkdownUnderline();
                } else if (typeof applyMarkdownUnderline === 'function') {
                    applyMarkdownUnderline();
                }
            } else {
                document.execCommand('underline');
            }
            return;
        }

        // Ctrl+Shift+B toggles a code block (overrides Chrome's bookmarks bar
        // shortcut while the caret is in a note). toggleCodeBlock handles both
        // the rich-text note and the markdown editor.
        if (e.shiftKey && e.key.toLowerCase() === 'b' && noteEditor) {
            e.preventDefault();
            if (typeof window.toggleCodeBlock === 'function') {
                window.toggleCodeBlock();
            } else if (typeof toggleCodeBlock === 'function') {
                toggleCodeBlock();
            }
            triggerNoteSave();
            return;
        }

        if (e.key.toLowerCase() === 'b' && !e.shiftKey && noteEditor) {
            e.preventDefault();
            if (inMarkdownEditor) {
                if (typeof window.applyMarkdownBold === 'function') {
                    window.applyMarkdownBold();
                } else if (typeof applyMarkdownBold === 'function') {
                    applyMarkdownBold();
                }
            } else {
                document.execCommand('bold');
            }
            return;
        }

        if (e.key.toLowerCase() === 'i' && noteEditor) {
            e.preventDefault();
            if (inMarkdownEditor) {
                if (typeof window.applyMarkdownItalic === 'function') {
                    window.applyMarkdownItalic();
                } else if (typeof applyMarkdownItalic === 'function') {
                    applyMarkdownItalic();
                }
            } else {
                document.execCommand('italic');
            }
            return;
        }
    }

    // Handle ArrowDown navigation to checklist
    if (e.key === 'ArrowDown') {
        var noteentry = target.closest('.noteentry');
        if (noteentry) {
            handleNavigateToChecklist(e, noteentry);
        }
    }
}

/**
 * Rich Text Editing Module
 * Handles paste events, link management, keyboard shortcuts, and content editing
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Set cursor position in a content editable element
 * @param {HTMLElement} element - The element to set cursor in
 * @param {number} offset - The character offset for cursor position
 * @param {boolean} atEnd - If true, place cursor at end; offset is ignored
 */
function setCursorPosition(element, offset, atEnd) {
    if (!element) return;

    var range = document.createRange();
    var selection = window.getSelection();

    if (atEnd) {
        range.selectNodeContents(element);
        range.collapse(false);
    } else {
        var textNode = element.firstChild || element;
        var finalOffset = Math.min(offset, textNode.textContent ? textNode.textContent.length : 0);
        range.setStart(textNode, finalOffset);
        range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Check if cursor is at the start of an element
 * @param {Selection} selection - The current selection
 * @returns {boolean} True if cursor is at start
 */
function isCursorAtStart(selection) {
    if (!selection || selection.rangeCount === 0) return false;
    var range = selection.getRangeAt(0);
    return range.startOffset === 0 && range.endOffset === 0;
}

/**
 * Check if cursor is at the end of an element
 * @param {HTMLElement} element - The element to check
 * @param {Selection} selection - The current selection
 * @returns {boolean} True if cursor is at end
 */
function isCursorAtEnd(element, selection) {
    if (!element || !selection || selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    var tempRange = range.cloneRange();
    tempRange.selectNodeContents(element);
    tempRange.setStart(range.endContainer, range.endOffset);

    return tempRange.toString().length === 0;
}

/**
 * Mark the current note as modified and trigger save
 */
function triggerNoteSave() {
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }
}

// ============================================================================
// MAIN SETUP FUNCTIONS
// ============================================================================

/**
 * Setup all note editing event listeners
 * Uses event delegation to handle dynamically loaded notes
 */
function setupNoteEditingEvents() {
    // Input events (typing, paste, etc.)
    document.body.addEventListener('keyup', handleNoteEditEvent);
    document.body.addEventListener('input', handleNoteEditEvent);
    document.body.addEventListener('paste', handleNoteEditEvent);
    document.body.addEventListener('change', handleNoteEditEvent);

    // Keyboard shortcuts
    document.body.addEventListener('keydown', handleNoteEntryKeydown);

    // Title and Tags fields handlers - use delegation to handle all title/tags fields
    document.body.addEventListener('blur', function (e) {
        if (e.target.classList && e.target.classList.contains('css-title')) {
            handleTitleBlur(e);
        } else if (e.target.classList && e.target.classList.contains('tags')) {
            handleTagsBlur(e);
        }
    }, true); // Use capture phase

    document.body.addEventListener('keydown', function (e) {
        if (e.target.classList && e.target.classList.contains('css-title')) {
            handleTitleKeydown(e);
        }
    });

    // Tags field handlers - use delegation
    document.body.addEventListener('keydown', function (e) {
        if (e.target.classList && e.target.classList.contains('tags')) {
            handleTagsKeydown(e);
        }
    });
}

// ============================================================================
// CHECKLIST HANDLERS
// ============================================================================

/**
 * Build a checklist item (li > label > input + span) with the given text.
 * DOM construction keeps user text as text: injecting it through innerHTML
 * would parse characters like < and & as markup and mangle the content.
 * @param {string} text - The item text
 * @returns {HTMLElement} The new li.checklist-item element
 */
function buildChecklistItem(text) {
    var item = document.createElement('li');
    item.className = 'checklist-item';

    var label = document.createElement('label');
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    var span = document.createElement('span');
    span.className = 'checklist-text';
    span.textContent = text || '';

    label.appendChild(checkbox);
    label.appendChild(span);
    item.appendChild(label);
    return item;
}

/**
 * Handle Enter key in checklist - create new item or exit checklist
 * @param {Event} e - The keyboard event
 * @param {HTMLElement} listItem - The current checklist item
 * @param {HTMLElement} textSpan - The text span element
 */
function handleChecklistEnter(e, listItem, textSpan) {
    e.preventDefault();

    var selection = window.getSelection();
    var cursorAtEnd = isCursorAtEnd(textSpan, selection);

    // Empty item - exit checklist mode
    if (textSpan.textContent.trim() === '') {
        var parentList = listItem.parentElement;
        listItem.remove();

        var newPara = document.createElement('div');
        newPara.innerHTML = '<br>';

        if (parentList.parentElement) {
            parentList.parentElement.insertBefore(newPara, parentList.nextSibling);
            setCursorPosition(newPara, 0, false);
        }

        triggerNoteSave();
        return;
    }

    // Cursor in middle - split text
    if (!cursorAtEnd && selection.rangeCount > 0) {
        var range = selection.getRangeAt(0);

        var beforeRange = document.createRange();
        beforeRange.setStart(textSpan, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        var textBefore = beforeRange.toString();

        var afterRange = document.createRange();
        afterRange.setStart(range.startContainer, range.startOffset);
        afterRange.setEnd(textSpan, textSpan.childNodes.length);
        var textAfter = afterRange.toString();

        textSpan.textContent = textBefore;

        var newItem = buildChecklistItem(textAfter);

        listItem.parentElement.insertBefore(newItem, listItem.nextSibling);

        var newTextSpan = newItem.querySelector('.checklist-text');
        newTextSpan.focus();
        setCursorPosition(newTextSpan, 0, false);

        triggerNoteSave();
        return;
    }

    // Create new empty checklist item
    var newItem = buildChecklistItem('');

    listItem.parentElement.insertBefore(newItem, listItem.nextSibling);

    var newTextSpan = newItem.querySelector('.checklist-text');
    newTextSpan.focus();
    setCursorPosition(newTextSpan, 0, false);

    triggerNoteSave();
}

/**
 * Handle Backspace in checklist - merge with previous item or delete
 * @param {Event} e - The keyboard event
 * @param {HTMLElement} listItem - The current checklist item
 * @param {HTMLElement} textSpan - The text span element
 */
function handleChecklistBackspace(e, listItem, textSpan) {
    var selection = window.getSelection();

    if (!isCursorAtStart(selection)) return;

    var previousItem = listItem.previousElementSibling;

    if (previousItem && previousItem.classList.contains('checklist-item')) {
        e.preventDefault();

        var currentText = textSpan.textContent;
        var prevLabel = previousItem.querySelector('label');
        var prevTextSpan = prevLabel ? prevLabel.querySelector('.checklist-text') : null;

        if (prevTextSpan) {
            var mergeOffset = prevTextSpan.textContent.length;
            prevTextSpan.textContent += currentText;
            listItem.remove();

            prevTextSpan.focus();
            setCursorPosition(prevTextSpan, mergeOffset, false);

            triggerNoteSave();
        }
    } else if (textSpan.textContent.trim() === '') {
        // First item and empty - delete it
        e.preventDefault();
        listItem.remove();
        triggerNoteSave();
    }
}

/**
 * Navigate between checklist items with arrow keys
 * @param {Event} e - The keyboard event
 * @param {HTMLElement} listItem - The current checklist item
 * @param {string} direction - 'up' or 'down'
 */
function navigateChecklistItems(e, listItem, direction) {
    var targetItem = direction === 'up'
        ? listItem.previousElementSibling
        : listItem.nextElementSibling;

    if (!targetItem || !targetItem.classList.contains('checklist-item')) return;

    e.preventDefault();

    var label = targetItem.querySelector('label');
    var textSpan = label ? label.querySelector('.checklist-text') : null;

    if (textSpan) {
        textSpan.focus();
        setCursorPosition(textSpan, 0, direction === 'up');
    }
}

/**
 * Handle keyboard events in checklist items
 * @param {Event} e - The keyboard event
 */
function handleChecklistKeydown(e) {
    var target = e.target;

    // checklist.js handles these keys first (capture phase) and calls
    // preventDefault when it does; running this fallback on top of it would
    // process the same keystroke twice (e.g. two new items on one Enter)
    if (e.defaultPrevented) return;

    if (!target.closest || !target.closest('li.checklist-item')) return;

    var listItem = target.closest('li.checklist-item');
    var checkboxLabel = listItem.querySelector('label');
    var textSpan = checkboxLabel ? checkboxLabel.querySelector('.checklist-text') : null;

    if (!textSpan) return;

    switch (e.key) {
        case 'Enter':
            if (!e.shiftKey) {
                handleChecklistEnter(e, listItem, textSpan);
            }
            break;
        case 'Backspace':
            handleChecklistBackspace(e, listItem, textSpan);
            break;
        case 'ArrowUp':
            navigateChecklistItems(e, listItem, 'up');
            break;
        case 'ArrowDown':
            navigateChecklistItems(e, listItem, 'down');
            break;
    }
}

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
// ============================================================================
// PASTE HANDLERS
// ============================================================================

/**
 * Check if pasted content is iframe HTML (YouTube, Vimeo, etc.)
 * @param {string} plainText - The pasted plain text
 * @returns {boolean} True if iframe is allowed and inserted
 */
function handleIframePaste(plainText) {
    var iframeMatch = plainText.match(/<iframe\s+([^>]+)>\s*<\/iframe>/i);
    if (!iframeMatch) return false;

    var iframeHtml = iframeMatch[0];
    var srcMatch = iframeHtml.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return false;

    var src = srcMatch[1];

    // Whitelist of allowed iframe domains
    var allowedDomains = [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'player.vimeo.com',
        'vimeo.com'
    ];

    var isAllowed = allowedDomains.some(function (domain) {
        return src.indexOf('//' + domain) !== -1 || src.indexOf('.' + domain) !== -1;
    });

    if (!isAllowed) {
        console.warn('Iframe domain not in whitelist:', src);
        return false;
    }

    // Create iframe element
    var tempContainer = document.createElement('div');
    tempContainer.innerHTML = iframeHtml;
    var iframeElement = tempContainer.querySelector('iframe');
    if (!iframeElement) return false;

    // Insert iframe at cursor
    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();

    var fragment = document.createDocumentFragment();

    // Add spacing around iframe
    var lineBefore = document.createElement('div');
    lineBefore.innerHTML = '<br>';
    fragment.appendChild(lineBefore);
    fragment.appendChild(iframeElement);

    var lineAfter = document.createElement('div');
    lineAfter.innerHTML = '<br>';
    fragment.appendChild(lineAfter);

    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Check if pasted content is code from VS Code or similar editors
 * @param {string} htmlData - The pasted HTML data
 * @param {string} plainText - The pasted plain text
 * @returns {boolean} True if code paste was handled
 */
function handleCodePaste(htmlData, plainText) {
    if (!htmlData) return false;

    // Code editors (VS Code, Monaco, etc.) put the whole snippet in a single
    // container styled inline with a monospace font and white-space: pre.
    // Only that exact shape counts as code: web pages that merely contain a
    // code example (monospace font somewhere in the payload) must keep their
    // tables, headings and lists intact (see discussion #1170).
    var doc = new DOMParser().parseFromString(htmlData, 'text/html');
    if (doc.body.children.length !== 1) return false;

    var rootStyle = (doc.body.children[0].getAttribute('style') || '').toLowerCase();
    var monospaceFonts = ['consolas', 'monaco', 'courier new', 'monospace', 'menlo', 'segoe ui mono'];
    var isCode = /white-space:\s*pre/.test(rootStyle) && monospaceFonts.some(function (font) {
        return rootStyle.indexOf(font) !== -1;
    });

    if (!isCode) return false;

    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();

    // Split into lines and create monospace structure
    var lines = (plainText || '').split('\n');
    var fragment = document.createDocumentFragment();

    lines.forEach(function (line, index) {
        // Just use text nodes for "normal text" as requested by user
        fragment.appendChild(document.createTextNode(line));

        if (index < lines.length - 1) {
            fragment.appendChild(document.createElement('br'));
        }
    });

    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Check if pasted text is a URL and convert to link
 * @param {string} plainText - The pasted plain text
 * @param {string} htmlData - The pasted HTML data
 * @returns {boolean} True if URL paste was handled
 */
function handleUrlPaste(plainText, htmlData) {
    // Only handle if plain text without HTML
    if (!plainText || htmlData) return false;

    var trimmedText = plainText.trim();
    var urlRegex = /^(https?:\/\/|ftp:\/\/)[^\s]+$/i;

    if (!urlRegex.test(trimmedText)) return false;

    var link = document.createElement('a');
    link.href = trimmedText;
    link.textContent = trimmedText;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(link);

    // Add space after link
    var space = document.createTextNode(' ');
    range.setStartAfter(link);
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Handle image paste from clipboard
 * @param {DataTransferItemList} items - Clipboard items
 * @param {HTMLElement} note - The note entry element
 * @returns {boolean} True if image was found and handled
 */
function handleImagePaste(items, note) {
    if (!items) return false;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            var file = item.getAsFile();
            if (file && typeof handleImageFilesAndInsert === 'function') {
                handleImageFilesAndInsert([file], note);
                return true;
            }
        }
    }

    return false;
}

/**
 * Handle rich text paste - clean up styles that might conflict with theme
 * @param {string} htmlData - The pasted HTML data
 * @returns {boolean} True if paste was handled
 */
function handleRichTextPaste(htmlData) {
    if (!htmlData || htmlData.trim() === '') return false;

    // If content was copied from a Poznote HTML note, preserve all formatting as-is
    var poznoteMarker = '<!-- poznote-internal -->';
    if (htmlData.includes(poznoteMarker)) {
        var fullHtml = htmlData.replace(poznoteMarker, '').replace('<!-- poznote-table-cells -->', '');
        if (!fullHtml || fullHtml.trim() === '') return false;
        document.execCommand('insertHTML', false, fullHtml);
        triggerNoteSave();
        return true;
    }

    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlData, 'text/html');

    // Remove conflicting attributes from all elements
    var elements = doc.body.querySelectorAll('*');

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        // Remove style attributes that set color or background
        if (el.hasAttribute('style')) {
            // Using the style object is more robust than regex for removing specific properties
            el.style.color = '';
            el.style.backgroundColor = '';
            el.style.background = '';
            el.style.backgroundImage = '';
            el.style.fontFamily = '';
            el.style.fontSize = '';
            el.style.lineHeight = '';

            // Clean up empty style attribute
            var styleAttr = el.getAttribute('style').trim();
            if (styleAttr === '' || el.style.length === 0 || /^;+$/.test(styleAttr)) {
                el.removeAttribute('style');
            }
        }

        // Remove legacy attributes. Keep width/height on media elements:
        // stripping them made pasted images lose their dimensions.
        el.removeAttribute('bgcolor');
        el.removeAttribute('color');
        el.removeAttribute('face');
        var isMediaElement = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME';
        if (!isMediaElement) {
            el.removeAttribute('width');
            el.removeAttribute('height');
        }
    }

    var cleanHtml = doc.body.innerHTML;
    if (!cleanHtml || cleanHtml.trim() === '') return false;

    // Insert cleaned HTML and signal success to prevent browser default paste
    document.execCommand('insertHTML', false, cleanHtml);
    triggerNoteSave();
    return true;
}

/**
 * Rebuild the ancestor context that Range.cloneContents() drops.
 *
 * cloneContents() never includes the ancestors of the range boundaries, so a
 * selection living entirely inside one block loses that block: two <li> of the
 * same list come out without their <ul> (pasting then produces orphan <li>),
 * a fully selected heading comes out as bare text, and text inside a styled
 * <span> loses its color. The native copy the handler below replaces rebuilds
 * this context; do the same by wrapping the fragment in shallow clones of the
 * relevant ancestors, from the range's common ancestor up to the note root.
 *
 * @param {DocumentFragment} fragment - The cloned selection contents
 * @param {Range} range - The selection range the fragment came from
 * @param {HTMLElement} note - The .noteentry containing the selection
 * @returns {DocumentFragment} The fragment, wrapped as needed
 */
function wrapCopiedFragmentWithAncestors(fragment, range, note) {
    // Inline formatting ancestors are always kept (they carry the visible style)
    var inlineTags = {
        B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1,
        CODE: 1, A: 1, MARK: 1, FONT: 1, SUB: 1, SUP: 1, KBD: 1
    };
    // Block ancestors kept only when the selection spans their entire text
    var fullTextBlockTags = {
        LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
        BLOCKQUOTE: 1, PRE: 1, DETAILS: 1
    };

    function fragmentHasTopLevel(tags) {
        for (var child = fragment.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 1 && tags[child.tagName]) return true;
        }
        return false;
    }

    function isChecklistNode(el) {
        return !!(el.classList && (
            el.classList.contains('checklist-item') || el.classList.contains('task-list-item') ||
            el.classList.contains('checklist') || el.classList.contains('task-list')));
    }

    function wrapIn(el) {
        var wrapper = el.cloneNode(false);
        wrapper.appendChild(fragment);
        fragment = document.createDocumentFragment();
        fragment.appendChild(wrapper);
    }

    var selectionText = range.toString();
    var node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentNode;

    while (node && node !== note && note.contains(node) && node.tagName) {
        var tag = node.tagName;

        // Checklist items need their <label><input> structure; wrapping the
        // bare text in their li/ul clones would produce a malformed checklist
        if (isChecklistNode(node)) {
            node = node.parentNode;
            continue;
        }

        if (inlineTags[tag]) {
            wrapIn(node);
        } else if (tag === 'SPAN' && node.getAttribute('style')) {
            // Plain spans are structural noise, styled spans carry formatting
            wrapIn(node);
        } else if (tag === 'UL' || tag === 'OL') {
            if (fragmentHasTopLevel({ LI: 1 })) wrapIn(node);
        } else if (tag === 'TR') {
            if (fragmentHasTopLevel({ TD: 1, TH: 1 })) wrapIn(node);
        } else if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' || tag === 'TABLE') {
            if (fragmentHasTopLevel({ TR: 1, THEAD: 1, TBODY: 1, TFOOT: 1 })) wrapIn(node);
        } else if (fullTextBlockTags[tag]) {
            // Keep the block (bullet, heading level, quote...) when the whole
            // line was selected; a partial selection pastes as inline text
            if (node.textContent === selectionText) wrapIn(node);
        }

        node = node.parentNode;
    }

    return fragment;
}

/**
 * Serialise the current note selection to the clipboard with the
 * Poznote-internal marker, so the paste handler can preserve all styles.
 * Shared by the copy and cut handlers.
 *
 * @param {ClipboardEvent} e - The copy or cut event
 * @returns {boolean} True when the clipboard was written (default prevented)
 */
function writeNoteSelectionToClipboard(e) {
    var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
    if (!note) return false;

    var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';
    if (isMarkdownNote) return false;

    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    // Serialise the selection into HTML, restoring the block/inline
    // ancestors that cloneContents() drops (list wrapper, heading tag,
    // styled spans...) so pasting reproduces the copied structure
    var range = selection.getRangeAt(0);
    var fragment = wrapCopiedFragmentWithAncestors(range.cloneContents(), range, note);
    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    var htmlContent = tempDiv.innerHTML;
    if (!htmlContent) return false;

    // Prepend the marker so the paste handler knows this came from Poznote
    e.clipboardData.setData('text/html', '<!-- poznote-internal -->' + htmlContent);
    e.clipboardData.setData('text/plain', selection.toString());
    e.preventDefault();
    return true;
}

/**
 * Setup paste event handling for rich text and images
 */
function setupPasteHandling() {
    document.body.addEventListener('copy', function (e) {
        try {
            writeNoteSelectionToClipboard(e);
        } catch (err) {
            console.error('Copy handling error:', err);
        }
    });

    // Cut must go through the same serialisation as copy: the browser's
    // native cut has no Poznote-internal marker, so pasting the cut content
    // back fell into the external-paste cleanup that strips colors,
    // highlights and font sizes (moving text lost its formatting).
    document.body.addEventListener('cut', function (e) {
        try {
            if (writeNoteSelectionToClipboard(e)) {
                // preventDefault suppressed the native deletion as well;
                // execCommand keeps the removal on the undo stack
                document.execCommand('delete');
                triggerNoteSave();
            }
        } catch (err) {
            console.error('Cut handling error:', err);
        }
    });

    document.body.addEventListener('paste', function (e) {
        try {
            // Skip paste handling for input fields
            if (e.target && (
                e.target.classList.contains('task-input') ||
                e.target.classList.contains('task-edit-input') ||
                e.target.tagName === 'INPUT'
            )) {
                return;
            }

            var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
            if (!note) return;

            var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';
            var items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : null;

            // Handle image paste
            if (handleImagePaste(items, note)) {
                e.preventDefault();
                return;
            }

            // Skip rich text processing for markdown notes
            if (isMarkdownNote) return;

            var htmlData = e.clipboardData ? e.clipboardData.getData('text/html') : '';
            var plainText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';

            // Windows editors (VS Code, Notepad++) put CRLF on the clipboard.
            // The handlers below split on \n, which would leave a stray CR at
            // the end of every line: invisible until the note is reloaded, at
            // which point the HTML parser turns each CR into a real newline and
            // every line break shows up twice inside a code block.
            plainText = plainText.replace(/\r\n?/g, '\n');

            // Try different paste handlers
            if (handleIframePaste(plainText)) {
                e.preventDefault();
                return;
            }

            if (handleCodePaste(htmlData, plainText)) {
                e.preventDefault();
                return;
            }

            if (handleUrlPaste(plainText, htmlData)) {
                e.preventDefault();
                return;
            }

            // Handle rich text paste (cleanup styles like black text in dark mode)
            if (htmlData && handleRichTextPaste(htmlData)) {
                e.preventDefault();
                return;
            }

        } catch (err) {
            console.error('Paste handling error:', err);
        }
    });
}

/**
 * Setup syntax highlighting trigger on code block input
 */
function setupCodeBlockHighlighting() {
    // Helper function to trigger syntax highlighting
    function triggerHighlighting(target) {
        var codeElement = target.tagName === 'CODE' ? target : null;
        var preElement = target.tagName === 'PRE' ? target : (codeElement ? codeElement.closest('pre') : null);

        if (!codeElement && preElement) {
            codeElement = preElement.querySelector('code[class*="language-"]');
        }

        if (codeElement && codeElement.className && codeElement.className.includes('language-')) {
            setTimeout(function () {
                if (typeof window.applySyntaxHighlighting === 'function') {
                    var pre = codeElement.closest('pre');
                    if (pre) {
                        window.applySyntaxHighlighting(pre);
                    }
                }
            }, 50);
        }
    }

    // Listen for input events (typing)
    document.body.addEventListener('input', function (e) {
        var target = e.target;

        // Check if editing code element with language class
        if (target.tagName === 'CODE' && target.className && target.className.includes('language-')) {
            triggerHighlighting(target);
        }

        // Check if editing pre element
        if (target.tagName === 'PRE') {
            var codeElement = target.querySelector('code[class*="language-"]');
            if (codeElement) {
                triggerHighlighting(target);
            }
        }
    });

    // Listen for paste events
    document.body.addEventListener('paste', function (e) {
        var target = e.target;

        // Check if pasting into code block
        var codeElement = null;
        if (target.tagName === 'CODE') {
            codeElement = target;
        } else if (target.closest) {
            codeElement = target.closest('code');
        }

        if (codeElement && codeElement.className && codeElement.className.includes('language-')) {
            setTimeout(function () {
                triggerHighlighting(codeElement);
            }, 100);
        }
    });
}

/**
 * Setup all link-related events
 */
function setupLinkEvents() {
    setupLinkClickHandling();
    setupPasteHandling();
    setupCodeBlockHighlighting();
}

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

/**
 * Check if a note entry is empty
 * @param {HTMLElement} noteEntry - The note entry element
 * @returns {boolean} True if empty
 */
function isNoteEntryEmpty(noteEntry) {
    var textContent = noteEntry.textContent.trim();
    var hasImages = noteEntry.querySelector('img') !== null;
    var isMarkdownPreview = noteEntry.classList.contains('markdown-preview');

    return textContent === '' && !hasImages && !isMarkdownPreview;
}

/**
 * Auto-focus empty notes when clicked in right column
 */
function setupAutoFocusEmpty() {
    document.addEventListener('click', function (e) {
        var rightCol = e.target.closest('#right_col');
        if (!rightCol) return;

        // Ignore clicks on interactive elements. [data-action] covers the
        // delegated controls (e.g. the folder breadcrumb in the note header),
        // which must not pull focus into the note and open the mobile keyboard.
        if (e.target.closest('button, a, input, select, textarea, [role="button"], [data-action]')) {
            return;
        }

        // Find target note entry
        var noteEntry = null;
        var card = e.target.closest('.notecard');

        if (card) {
            // Clicked on specific note card
            noteEntry = card.querySelector('.noteentry');
        } else {
            // Clicked on background - try to find current note
            var selectedNoteId = window.noteid;
            if (selectedNoteId !== -1 && selectedNoteId !== null) {
                noteEntry = document.querySelector('#note' + selectedNoteId + ' .noteentry');
            }

            // Fallback to first note entry
            if (!noteEntry) {
                noteEntry = rightCol.querySelector('.noteentry');
            }
        }

        if (!noteEntry || noteEntry.getAttribute('contenteditable') !== 'true') return;

        // Only auto-focus if empty
        if (!isNoteEntryEmpty(noteEntry)) return;

        // Update note ID
        var noteIdFromEntry = window.extractNoteIdFromEntry
            ? window.extractNoteIdFromEntry(noteEntry)
            : null;

        if (noteIdFromEntry) {
            window.noteid = noteIdFromEntry;
        }

        // Focus and place cursor at start
        if (document.activeElement !== noteEntry) {
            noteEntry.focus();
            setCursorPosition(noteEntry, 0, false);
        }
    });
}

/**
 * Setup focus management and auto-focus for empty notes
 */
function setupFocusEvents() {
    document.body.addEventListener('focusin', function (e) {
        if (e.target.classList.contains('searchbar') ||
            e.target.id === 'search' ||
            e.target.classList.contains('searchtrash')) {
            window.noteid = -1;
        }
    });

    setupAutoFocusEmpty();
}

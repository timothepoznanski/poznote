/**
 * Rich text editing: setup and checklists.
 * 
 * Shared helpers, the per-note wiring entry points, and the checklist key handling
 * (Enter/Tab/arrows inside a checklist item).
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

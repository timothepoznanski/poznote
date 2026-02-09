// Event and user interaction management

var saveTimeout;
var lastSavedContent = null;
var lastSavedTitle = null;
var lastSavedTags = null;
var isOnline = navigator.onLine;
var notesNeedingRefresh = new Set();
var changeCheckThrottle = null;
var lastChangeCheckTime = 0;
var CHANGE_CHECK_INTERVAL = 400;
var localStorageSaveTimer = null;

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

// Helper functions for note ID tracking from DOM elements
// Used by event handlers to update the global noteid variable when users interact with notes
function updateident(el) {
    updateNoteIdFromElement(el, 5); // 'entry'.length
}

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

function initializeEventListeners() {

    // Events for note modification
    setupNoteEditingEvents();

    // Events for attached files
    setupAttachmentEvents();

    // Events for image drag & drop
    setupDragDropEvents();

    // Events for note drag & drop between folders
    setupNoteDragDropEvents();

    // Events for link management
    setupLinkEvents();

    // Focus events
    setupFocusEvents();

    // Initialize auto-save system
    initializeAutoSaveSystem();

    // Warning before page close
    setupPageUnloadWarning();

    // Convert <audio> elements to iframes inside contenteditable notes
    // Chrome does not render native <audio> controls inside contenteditable zones
    convertNoteAudioToIframes();

    // Ensure embedded media renders with controls inside contenteditable notes
    try {
        var mediaEls = document.querySelectorAll('.noteentry video, .noteentry iframe');
        mediaEls.forEach(function (el) {
            el.setAttribute('contenteditable', 'false');
        });
    } catch (e) {
        // Ignore errors
    }
}

function setupNoteEditingEvents() {
    var eventTypes = ['keyup', 'input', 'paste', 'change'];

    for (var i = 0; i < eventTypes.length; i++) {
        var eventType = eventTypes[i];
        document.body.addEventListener(eventType, function (e) {

            // Handle checklist checkbox changes (auto-save)
            if (e.target && e.target.classList && e.target.classList.contains('checklist-checkbox')) {
                var noteentry = setNoteIdFromNoteentry(e.target);
                serializeAndMarkModified(noteentry);
                return;
            }

            // Handle checklist text input changes (auto-save)
            if (e.target && e.target.classList && e.target.classList.contains('checklist-input')) {
                if (eventType === 'input' || eventType === 'keyup' || eventType === 'change') {
                    var noteentry = setNoteIdFromNoteentry(e.target);
                    serializeAndMarkModified(noteentry);
                }
                return;
            }

            handleNoteEditEvent(e);
        });
    }

    // Handle Enter key and delete empty checklists
    document.body.addEventListener('keydown', function (e) {
        // Handle checklist input navigation
        if (e.target && e.target.classList && e.target.classList.contains('checklist-input')) {
            handleChecklistKeydown(e);
            return;
        }

        // Handle arrow up/down navigation, Enter, and delete between noteentry and checklists
        if (e.key === 'ArrowUp' || e.key === 'Up' || e.key === 'Delete' || e.key === 'Enter') {
            var noteentry = e.target.closest('.noteentry');
            if (noteentry && noteentry.isContentEditable) {
                handleNoteentryKeydown(e);
            }
        }

        handleTagsKeydown(e);
        handleTitleKeydown(e);
    });

    // Special handling for title blur and keydown events (Enter/Escape)
    document.body.addEventListener('blur', function (e) {
        handleTitleBlur(e);
    }, true); // Use capture phase to ensure we catch the event

    // Monitor code blocks and remove them if they become empty
    document.body.addEventListener('input', function (e) {
        var target = e.target;

        // Check if we're editing a noteentry (HTML notes)
        if (target.classList && target.classList.contains('noteentry')) {
            // Use requestAnimationFrame to check after the input is processed
            requestAnimationFrame(function () {
                if (target && target.parentNode) {
                    // Find all code blocks in this note
                    var codeBlocks = target.querySelectorAll('pre, .code-block');

                    for (var i = 0; i < codeBlocks.length; i++) {
                        var codeBlock = codeBlocks[i];
                        var content = codeBlock.textContent || '';

                        // If the code block is now empty, remove it
                        if (content.trim() === '') {
                            // Save the selection before modifying DOM
                            var sel = window.getSelection();
                            var wasInCodeBlock = codeBlock.contains(sel.anchorNode);

                            // Create a paragraph to replace the empty code block
                            var paragraph = document.createElement('p');
                            paragraph.innerHTML = '<br>';

                            // Insert the paragraph before removing the code block
                            codeBlock.parentNode.insertBefore(paragraph, codeBlock);
                            codeBlock.remove();

                            // Place cursor in the new paragraph if it was in the code block
                            if (wasInCodeBlock) {
                                var range = document.createRange();
                                range.setStart(paragraph, 0);
                                range.collapse(true);
                                sel.removeAllRanges();
                                sel.addRange(range);
                            }

                            // Mark note as modified
                            if (typeof window.markNoteAsModified === 'function') {
                                window.markNoteAsModified();
                            }
                        }
                    }
                }
            });
        }
    }, true); // Use capture phase to catch events from contenteditable children
}

function handleChecklistKeydown(e) {
    var input = e.target;

    if (e.key === 'Enter') {
        e.preventDefault();

        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;

        var checklist = checklistItem.closest('.checklist');
        if (!checklist) return;

        setNoteIdFromNoteentry(input);

        var textValue = input.value.trim();

        if (textValue === '') {
            // Empty item - delete it and create a paragraph
            var paragraph = document.createElement('p');
            paragraph.textContent = '';

            checklist.parentNode.insertBefore(paragraph, checklist.nextSibling);
            checklistItem.remove();

            // Focus the new paragraph
            var range = document.createRange();
            range.selectNodeContents(paragraph);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            paragraph.focus();
        } else {
            // Create new item with text from current input
            var newLi = document.createElement('li');
            newLi.className = 'checklist-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'checklist-checkbox';

            var newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'checklist-input';
            // Styles defined in modules/checklists.css (.checklist-input)

            newLi.appendChild(checkbox);
            newLi.appendChild(document.createTextNode(' '));
            newLi.appendChild(newInput);

            checklistItem.parentNode.insertBefore(newLi, checklistItem.nextSibling);

            // Focus the new input
            newInput.focus();
        }

        // Serialize and trigger save
        serializeAndMarkModified(checklist.closest('.noteentry'));
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
        // Handle Backspace/Delete key
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;

        var checklist = checklistItem.closest('.checklist');
        if (!checklist) return;

        // Check if cursor is at the beginning of the input
        var cursorPos = input.selectionStart;
        var cursorEnd = input.selectionEnd;
        var textValue = input.value;

        // Only handle deletion at the beginning (Backspace) or when item is empty
        if (e.key === 'Backspace' && cursorPos === 0 && cursorEnd === 0) {
            // Cursor at beginning - merge with previous item or delete if empty
            e.preventDefault();

            setNoteIdFromNoteentry(input);

            // Get the previous item to focus on
            var previousItem = checklistItem.previousElementSibling;

            if (textValue === '') {
                // Empty item - delete it
                checklistItem.remove();

                // If there are no more items in the checklist, remove the entire checklist
                var remainingItems = checklist.querySelectorAll('.checklist-item');
                if (remainingItems.length === 0) {
                    // Create a paragraph before removing the checklist
                    var paragraph = document.createElement('p');
                    paragraph.innerHTML = '<br>';

                    checklist.parentNode.insertBefore(paragraph, checklist);
                    checklist.remove();

                    // Focus the new paragraph
                    var range = document.createRange();
                    range.selectNodeContents(paragraph);
                    range.collapse(true);
                    var sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    paragraph.focus();
                } else if (previousItem && previousItem.classList.contains('checklist-item')) {
                    // Focus on the previous item's input
                    var previousInput = previousItem.querySelector('.checklist-input');
                    if (previousInput) {
                        previousInput.focus();
                        // Move cursor to the end of the previous item
                        previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length);
                    }
                } else {
                    // Focus on the first remaining item
                    var firstInput = checklist.querySelector('.checklist-input');
                    if (firstInput) {
                        firstInput.focus();
                    }
                }
            } else if (previousItem && previousItem.classList.contains('checklist-item')) {
                // Not empty - merge with previous item
                var previousInput = previousItem.querySelector('.checklist-input');
                if (previousInput) {
                    var previousLength = previousInput.value.length;
                    previousInput.value = previousInput.value + textValue;
                    previousInput.focus();
                    previousInput.setSelectionRange(previousLength, previousLength);
                    checklistItem.remove();
                }
            }

            // Serialize and trigger save
            serializeAndMarkModified(checklist.closest('.noteentry'));
        }
        // Note: We do NOT prevent default for other cases
        // This allows normal text deletion to work
    } else if (e.key === 'ArrowDown' || e.key === 'Down') {
        // Handle arrow down - navigate to next checklist item
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;

        var cursorPos = input.selectionStart;
        var textLength = input.value.length;

        // Only intercept if cursor is at the end of the line
        if (cursorPos === textLength) {
            var nextItem = checklistItem.nextElementSibling;
            if (nextItem && nextItem.classList.contains('checklist-item')) {
                e.preventDefault();
                var nextInput = nextItem.querySelector('.checklist-input');
                if (nextInput) {
                    nextInput.focus();
                    // Move cursor to the beginning of the next item
                    nextInput.setSelectionRange(0, 0);
                }
            } else {
                // No next item - try to exit checklist and focus next element
                e.preventDefault();
                var checklist = checklistItem.closest('.checklist');
                if (checklist && checklist.nextElementSibling) {
                    var nextElement = checklist.nextElementSibling;
                    // Focus next editable element if possible
                    if (nextElement.isContentEditable) {
                        nextElement.focus();
                        var range = document.createRange();
                        range.selectNodeContents(nextElement);
                        range.collapse(true); // start of content
                        var sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        return;
                    }
                }
            }
        }
    } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        // Handle arrow up - navigate to previous checklist item
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;

        var cursorPos = input.selectionStart;

        // Only intercept if cursor is at the beginning of the line
        if (cursorPos === 0) {
            var previousItem = checklistItem.previousElementSibling;
            if (previousItem && previousItem.classList.contains('checklist-item')) {
                e.preventDefault();
                var previousInput = previousItem.querySelector('.checklist-input');
                if (previousInput) {
                    previousInput.focus();
                    // Move cursor to the end of the previous item
                    previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length);
                }
            } else {
                // No previous item - try to exit checklist and focus previous element
                e.preventDefault();
                var checklist = checklistItem.closest('.checklist');
                if (checklist && checklist.previousElementSibling) {
                    var prevElement = checklist.previousElementSibling;
                    // Focus previous editable element
                    if (prevElement.isContentEditable) {
                        prevElement.focus();
                        var range = document.createRange();
                        range.selectNodeContents(prevElement);
                        range.collapse(false); // false = end of content
                        var sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                } else {
                    // No previous element - create one before the checklist
                    var noteentry = checklist.closest('.noteentry');
                    if (noteentry && checklist.parentNode === noteentry) {
                        var paragraph = document.createElement('p');
                        paragraph.innerHTML = '<br>';
                        checklist.parentNode.insertBefore(paragraph, checklist);

                        // Focus the new paragraph
                        paragraph.focus();
                        var range = document.createRange();
                        range.selectNodeContents(paragraph);
                        range.collapse(true);
                        var sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);

                        // Mark as modified
                        if (typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }
                    }
                }
            }
        }
    }
}

function handleNoteentryKeydown(e) {
    var originalTarget = e.target;
    var target = originalTarget.nodeType === 3 ? originalTarget.parentNode : originalTarget;
    // Find the containing .noteentry ancestor
    while (target && !target.classList.contains('noteentry')) {
        target = target.parentNode;
    }
    if (!target) return;

    var sel = window.getSelection();
    if (!sel.rangeCount) return;

    var range = sel.getRangeAt(0);

    // Handle Enter in blockquote/callout - exit on empty line
    if (e.key === 'Enter') {
        var node = range.startContainer;
        var currentElement = node.nodeType === 3 ? node.parentNode : node;

        // Find if we're in a blockquote or callout
        var blockquote = currentElement;
        var calloutBody = null;

        while (blockquote && blockquote !== target) {
            // Check for callout-body div
            if (blockquote.classList && blockquote.classList.contains('callout-body')) {
                calloutBody = blockquote;
            }

            if (blockquote.tagName === 'BLOCKQUOTE' ||
                (blockquote.tagName === 'ASIDE' && blockquote.classList.contains('callout'))) {
                break;
            }
            blockquote = blockquote.parentNode;
        }

        if (blockquote && blockquote !== target) {
            // For callouts, check if callout-body is empty
            // For plain blockquotes, check if the blockquote itself is empty
            var contentToCheck = calloutBody || blockquote;
            var textContent = contentToCheck.textContent || '';

            // Remove zero-width spaces and check if empty
            var isEmpty = textContent.replace(/\u200B/g, '').trim() === '';

            // Check for empty line at the end of the quote (to exit)
            var isLineEmpty = false;
            var nodeToRemove = null;

            if (!isEmpty && range.collapsed) {
                var node = range.startContainer;
                // Check if inside a block element in the quote (P or DIV)
                var currentBlock = node.nodeType === 3 ? node.parentNode : node;
                while (currentBlock && currentBlock !== contentToCheck &&
                    !['P', 'DIV'].includes(currentBlock.tagName)) {
                    currentBlock = currentBlock.parentNode;
                }

                if (currentBlock && currentBlock !== contentToCheck && contentToCheck.contains(currentBlock)) {
                    // Inside a block element
                    if (currentBlock.textContent.trim() === '' && currentBlock.querySelectorAll('img').length === 0) {
                        isLineEmpty = true;
                        nodeToRemove = currentBlock;
                    }
                } else {
                    // Check logic for naked BR at the end
                    var parent = node.nodeType === 3 ? node.parentNode : node;

                    if (parent === contentToCheck) {
                        var offset = range.startOffset;

                        if (node === contentToCheck) {
                            // Cursor is directly in the container
                            if (offset > 0) {
                                var prev = node.childNodes[offset - 1];
                                // Check if prev is BR and we are at the end (no visible content after)
                                var hasContentAfter = false;
                                for (var i = offset; i < node.childNodes.length; i++) {
                                    var n = node.childNodes[i];
                                    if (n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim() !== '')) {
                                        hasContentAfter = true;
                                        break;
                                    }
                                }

                                if (prev && prev.tagName === 'BR' && !hasContentAfter) {
                                    isLineEmpty = true;
                                    nodeToRemove = prev;
                                }
                            }
                        } else if (node.nodeType === 3) {
                            // Inside text node
                            if (node.textContent.trim() === '') {
                                // Empty text node. Check previous sibling of this text node
                                var prev = node.previousSibling;
                                var next = node.nextSibling;

                                // If prev is BR and no next sibling (or empty next)
                                var hasContentAfter = false;
                                var sibling = next;
                                while (sibling) {
                                    if (sibling.nodeType === 1 || (sibling.nodeType === 3 && sibling.textContent.trim() !== '')) {
                                        hasContentAfter = true;
                                        break;
                                    }
                                    sibling = sibling.nextSibling;
                                }

                                if (prev && prev.tagName === 'BR' && !hasContentAfter) {
                                    isLineEmpty = true;
                                    nodeToRemove = prev;
                                }
                            }
                        }
                    }
                }
            }

            if (isEmpty || isLineEmpty) {
                e.preventDefault();

                // Remove the empty line generating element (BR or P/DIV)
                if (nodeToRemove) {
                    nodeToRemove.remove();
                } else if (isEmpty && contentToCheck && contentToCheck.nodeType === 1) {
                    // When the quote/callout is empty, browsers often keep the caret alive by inserting
                    // a placeholder <br> (or an empty <p><br></p>). Clean those up so we don't leave
                    // a visible empty line inside the quote after exiting.
                    try {
                        // Remove direct placeholder BRs
                        Array.prototype.slice.call(contentToCheck.childNodes).forEach(function (n) {
                            if (n && n.nodeType === 1 && n.tagName === 'BR') {
                                n.remove();
                            }
                        });

                        // Remove empty block wrappers that only contain a BR/whitespace
                        Array.prototype.slice.call(contentToCheck.querySelectorAll('p, div')).forEach(function (el) {
                            if (!el) return;
                            var onlyBr = el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === 1 && el.firstChild.tagName === 'BR';
                            var onlyWhitespace = (el.textContent || '').replace(/\u200B/g, '').trim() === '';
                            if (onlyWhitespace && (onlyBr || el.querySelectorAll('img').length === 0) && el.querySelectorAll('pre, code, table, ul, ol, blockquote, aside').length === 0) {
                                // If it's truly an empty wrapper, remove it
                                if (onlyBr || el.innerHTML.trim() === '' || el.innerHTML.trim() === '<br>') {
                                    el.remove();
                                }
                            }
                        });

                        // If this is an extra empty callout-body (duplicate), remove it entirely
                        if (contentToCheck.classList && contentToCheck.classList.contains('callout-body')) {
                            var isNowEmpty = (contentToCheck.textContent || '').replace(/\u200B/g, '').trim() === '';
                            var hasNoElements = contentToCheck.querySelectorAll('*').length === 0;
                            if (isNowEmpty && hasNoElements) {
                                var prev = contentToCheck.previousElementSibling;
                                if (prev && prev.classList && prev.classList.contains('callout-body')) {
                                    contentToCheck.remove();
                                }
                            }
                        }
                    } catch (err) {
                        // Best-effort cleanup only
                    }
                }

                // Create a new paragraph after the blockquote/callout
                var newP = document.createElement('p');
                newP.innerHTML = '<br>';

                // Insert after the blockquote/callout
                if (blockquote.nextSibling) {
                    blockquote.parentNode.insertBefore(newP, blockquote.nextSibling);
                } else {
                    blockquote.parentNode.appendChild(newP);
                }

                // Move cursor to the new paragraph
                range = document.createRange();
                range.setStart(newP, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);

                return;
            }
        }
    }

    // Handle ArrowUp - navigate to previous checklist
    if (e.key === 'ArrowUp' || e.key === 'Up') {
        // Find the element containing the cursor
        var node = range.startContainer;
        var currentElement = node.nodeType === 3 ? node.parentNode : node;

        // Find the current block element (P, DIV, H1, etc.)
        var currentBlock = currentElement;
        while (currentBlock && currentBlock !== target) {
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(currentBlock.tagName)) {
                break;
            }
            currentBlock = currentBlock.parentNode;
        }

        if (!currentBlock || currentBlock === target) return;

        // Simple check: is there any previous sibling that's a checklist?
        var prevSibling = currentBlock.previousElementSibling;
        if (!prevSibling || !prevSibling.classList.contains('checklist')) return;

        // More reliable check: get the selection and compare positions
        // We want to intercept only if we're at/near the visual start of the block
        try {
            // Get all text content before the cursor position
            var preRange = document.createRange();
            preRange.selectNodeContents(currentBlock);
            preRange.setEnd(range.startContainer, range.startOffset);
            var textBeforeCursor = preRange.toString();

            // Only intercept if there's no significant text before cursor
            // (allows for whitespace/newlines)
            if (textBeforeCursor.trim().length > 0) return;

        } catch (e) {
            // If range creation fails, fall back to simple offset check
            if (range.startOffset > 0) return;
        }

        // We're at the start and there's a checklist above - navigate to it
        e.preventDefault();

        var items = prevSibling.querySelectorAll('.checklist-item');
        if (items.length > 0) {
            var lastItem = items[items.length - 1];
            // Try new system first (checklist-text spans)
            var lastText = lastItem.querySelector('.checklist-text');
            if (lastText) {
                // Position cursor at end of the text span
                var textNode = lastText.lastChild || lastText;
                if (textNode.nodeType === 3) {
                    var r = document.createRange();
                    r.setStart(textNode, textNode.textContent.length);
                    r.collapse(true);
                    var s = window.getSelection();
                    s.removeAllRanges();
                    s.addRange(r);
                } else {
                    var r = document.createRange();
                    r.selectNodeContents(lastText);
                    r.collapse(false);
                    var s = window.getSelection();
                    s.removeAllRanges();
                    s.addRange(r);
                }
                return;
            }
            // Fallback to old system (checklist-input)
            var lastInput = lastItem.querySelector('.checklist-input');
            if (lastInput) {
                lastInput.focus();
                setTimeout(function () {
                    var len = lastInput.value.length;
                    lastInput.setSelectionRange(len, len);
                }, 10);
            }
        }
    }
    // Handle Delete - merge with next checklist
    else if (e.key === 'Delete') {
        // Find the element containing the cursor
        var node = range.endContainer;
        var currentElement = node.nodeType === 3 ? node.parentNode : node;

        // Find the current block element
        var currentBlock = currentElement;
        while (currentBlock && currentBlock !== target) {
            if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(currentBlock.tagName)) {
                break;
            }
            currentBlock = currentBlock.parentNode;
        }

        if (!currentBlock || currentBlock === target) return;

        // Check if next sibling is a checklist
        var nextSibling = currentBlock.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('checklist')) return;

        // Check if we're at the end of our current block
        var testRange = document.createRange();
        testRange.setStart(range.endContainer, range.endOffset);
        testRange.setEnd(currentBlock, currentBlock.childNodes.length);

        var textAfter = testRange.toString();
        if (textAfter.replace(/[\r\n]/g, '').trim().length > 0) return;

        // We're at the end and there's a checklist below - navigate to it
        e.preventDefault();

        var items = nextSibling.querySelectorAll('.checklist-item');
        if (items.length > 0) {
            var firstInput = items[0].querySelector('.checklist-input');
            if (firstInput) {
                if (currentBlock.textContent.trim() === '') {
                    currentBlock.remove();
                }
                firstInput.focus();
                setTimeout(function () {
                    firstInput.setSelectionRange(0, 0);
                }, 10);
            }
        }
    }
}

function handleNoteEditEvent(e) {
    var target = e.target;

    // Set noteid from the noteentry element when editing
    if (target.classList.contains('noteentry')) {
        var noteIdFromEntry = extractNoteIdFromEntry(target);
        if (noteIdFromEntry) {
            noteid = noteIdFromEntry;
        }
    }

    if (target.classList.contains('name_doss') || target.classList.contains('noteentry')) {
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    } else if (target.tagName === 'INPUT') {
        // Ignore search fields
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }

        // Ignore title fields - they are handled separately on blur/Enter/Escape only
        if (target.classList.contains('css-title') ||
            (target.id && target.id.startsWith('inp'))) {
            return;
        }

        // Process other note fields (tags, etc.)
        if (target.id && target.id.startsWith('tags')) {
            // Extract noteid from tags element id (e.g., "tags123" -> "123")
            var noteIdFromTag = target.id.replace('tags', '');
            if (noteIdFromTag) {
                noteid = noteIdFromTag;
            }
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
        }
    }
}

function handleTagsKeydown(e) {
    var target = e.target;

    // Check if this is a standard tags field
    if (target.tagName === 'INPUT' &&
        target.id &&
        target.id.startsWith('tags') &&
        !target.classList.contains('tag-input')) {

        if (e.key === ' ') {
            var input = target;
            var currentValue = input.value;
            var cursorPos = input.selectionStart;

            var textBeforeCursor = currentValue.substring(0, cursorPos);
            var lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
            var currentTag = textBeforeCursor.substring(lastSpaceIndex + 1).trim();

            if (currentTag && currentTag.length > 0) {
                e.preventDefault();

                var charAfterCursor = currentValue.charAt(cursorPos);
                if (charAfterCursor !== ' ' && charAfterCursor !== '') {
                    input.value = currentValue.substring(0, cursorPos) + ' ' + currentValue.substring(cursorPos);
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                } else {
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                }

                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }
            }
        }
    }
}

function handleTitleBlur(e) {
    var target = e.target;

    // Check if this is a title input field
    if (target.tagName === 'INPUT' &&
        (target.classList.contains('css-title') ||
            (target.id && target.id.startsWith('inp')))) {

        // Ignore if this is a search field
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }

        // Save immediately when losing focus
        updateidhead(target);
        saveNoteToServer();
    }
}

function handleTitleKeydown(e) {
    var target = e.target;

    // Check if this is a title input field
    if (target.tagName === 'INPUT' &&
        (target.classList.contains('css-title') ||
            (target.id && target.id.startsWith('inp')))) {

        // Ignore if this is a search field
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }

        // Handle Enter and Escape keys
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();

            // Blur the input to trigger save
            target.blur();

            // Save immediately 
            updateidhead(target);
            saveNoteToServer();
        }
    }
}

function setupAttachmentEvents() {
    var fileInput = document.getElementById('attachmentFile');
    var fileNameDiv = document.getElementById('selectedFileName');
    var uploadButtonContainer = document.querySelector('.upload-button-container');

    if (fileInput && fileNameDiv) {
        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files.length > 0) {
                fileNameDiv.textContent = fileInput.files[0].name;
                if (uploadButtonContainer) {
                    uploadButtonContainer.classList.add('show');
                }
            } else {
                fileNameDiv.textContent = '';
                if (uploadButtonContainer) {
                    uploadButtonContainer.classList.remove('show');
                }
            }
        });
    }
}

// Initialize all auto-save and navigation systems
function initializeAutoSaveSystem() {
    setupAutoSaveCheck();
    setupNoteNavigationInterceptor();
    setupNavigationDebugger();
}

// Monitor popstate events - reload note when using browser back/forward
function setupNavigationDebugger() {
    // Handled by the global popstate listener below
}

// Global click interceptor for note navigation links
function setupNoteNavigationInterceptor() {

    document.addEventListener('click', function (e) {
        // Check if this is a note link
        var link = e.target.closest('a.links_arbo_left, a[href*="note="]');
        if (!link) return;


        // Extract target note ID from href
        var href = link.getAttribute('href');
        if (!href) return;

        var noteMatch = href.match(/[?&]note=(\d+)/);
        if (!noteMatch) return;

        var targetNoteId = noteMatch[1];
        var currentNoteId = window.noteid;


        // Check for unsaved changes BEFORE allowing navigation
        if (currentNoteId && currentNoteId !== targetNoteId && hasUnsavedChanges(currentNoteId)) {
            // Prevent default navigation
            e.preventDefault();
            e.stopPropagation();


            // Show temporary notification
            showSaveInProgressNotification(function () {
                // Callback when save is complete - proceed with navigation
                window.location.href = href;
            });

            return false;
        }

        // No unsaved changes, allow normal navigation
    }, true); // Use capture phase to intercept before other handlers
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
            notification.classList.add('save-notification-exit');
            setTimeout(function () {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (onCompleteCallback) {
                    onCompleteCallback();
                }
            }, 300);
        }, 800);
    }

    // Monitor for save completion
    var checkInterval = setInterval(function () {
        var noTimeout = !saveTimeout || saveTimeout === null || saveTimeout === undefined;
        var notInRefreshList = !notesNeedingRefresh.has(String(currentNoteId));
        var noRedDot = !document.title.startsWith('\uD83D\uDD34');
        if (noTimeout && notInRefreshList && noRedDot) {
            clearInterval(checkInterval);
            clearTimeout(fallbackTimeoutId);
            showSavedAndDismiss();
        }
    }, 100);

    // Fallback timeout
    var fallbackTimeoutId = setTimeout(function () {
        clearInterval(checkInterval);
        showSavedAndDismiss();
    }, 3000);
}

function convertNoteAudioToIframes() {
    try {
        var audios = document.querySelectorAll('.noteentry audio');
        audios.forEach(function (audio) {
            var src = audio.getAttribute('src') || '';
            if (!src) return;

            // Extract note ID and attachment ID from attachment URL
            // Expected format: /api/v1/notes/{noteId}/attachments/{attachmentId}[?workspace=...]
            var match = src.match(/\/api\/v1\/notes\/(\d+)\/attachments\/([^?&\/]+)/);
            if (!match) return;

            var noteId = match[1];
            var attachmentId = match[2];
            var wsMatch = src.match(/[?&]workspace=([^&]+)/);
            var wsParam = wsMatch ? '&workspace=' + wsMatch[1] : '';

            var iframeSrc = '/audio_player.php?note=' + encodeURIComponent(noteId)
                + '&attachment=' + encodeURIComponent(attachmentId) + wsParam;

            var iframe = document.createElement('iframe');
            iframe.className = 'note-audio-iframe';
            iframe.src = iframeSrc;
            // Styles defined in modules/notes.css (.note-audio-iframe)
            iframe.setAttribute('allowtransparency', 'true');

            // Replace the audio (and its optional wrapper div) with the iframe
            var parent = audio.parentElement;
            if (parent && parent.classList && parent.classList.contains('note-media-embed')) {
                parent.replaceWith(iframe);
            } else {
                audio.replaceWith(iframe);
            }
        });
    } catch (e) {
        console.error('[Audio] Error converting audio to iframes:', e);
    }
}

function setupDragDropEvents() {
    document.body.addEventListener('dragenter', function (e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                // Add visual feedback to show the drop target
                potential.classList.add('drag-over');
            }
        } catch (err) { }
    });

    document.body.addEventListener('dragover', function (e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
        } catch (err) { }
    });

    document.body.addEventListener('dragleave', function (e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (!potential) {
                // Remove visual feedback
                document.querySelectorAll('.noteentry.drag-over').forEach(function (note) {
                    note.classList.remove('drag-over');
                });
            }
        } catch (err) { }
    });

    document.body.addEventListener('drop', function (e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var note = el && el.closest ? el.closest('.noteentry') : null;

            if (!note && e.target && e.target.closest) {
                note = e.target.closest('.noteentry');
            }

            if (!note) return;

            e.preventDefault();
            e.stopPropagation();

            // Remove visual feedback
            note.classList.remove('drag-over');

            var dt = e.dataTransfer;
            if (!dt) return;

            if (dt.files && dt.files.length > 0) {
                handleImageFilesAndInsert(dt.files, note);
            }
        } catch (err) {
        }
    });
}

function setupNoteDragDropEvents() {
    // Remove existing event listeners to avoid duplicates
    document.querySelectorAll('.links_arbo_left').forEach(function (link) {
        link.removeEventListener('dragstart', handleNoteDragStart);
        link.removeEventListener('dragend', handleNoteDragEnd);
    });

    document.querySelectorAll('.folder-header').forEach(function (header) {
        // Remove enhanced handlers
        header.removeEventListener('dragenter', handleFolderDragEnterEnhanced);
        header.removeEventListener('dragover', handleFolderDragOverEnhanced);
        header.removeEventListener('drop', handleFolderDropEnhanced);
        header.removeEventListener('dragleave', handleFolderDragLeaveEnhanced);
    });

    // Setup folder drag and drop
    setupFolderDragDropEvents();

    // Add drag events to all note links (both in folders and without folder)
    var noteLinks = document.querySelectorAll('.links_arbo_left');

    noteLinks.forEach(function (link, index) {
        var isMobile = window.innerWidth <= 800;

        // On mobile, disable HTML5 dragging on note links.
        // Draggable anchors can intermittently swallow taps (treated as scroll/drag),
        // which prevents the note open + horizontal scroll from triggering.
        if (isMobile) {
            link.removeAttribute('draggable');
            link.draggable = false;
        } else {
            // Force draggable attribute both ways (desktop drag & drop)
            link.setAttribute('draggable', 'true');
            link.draggable = true;
        }

        // Remove existing event listeners if any
        link.removeEventListener('dragstart', handleNoteDragStart);
        link.removeEventListener('dragend', handleNoteDragEnd);

        // Add fresh event listeners (desktop only)
        if (!isMobile) {
            link.addEventListener('dragstart', handleNoteDragStart, false);
            link.addEventListener('dragend', handleNoteDragEnd, false);
        }

        // Handle click/tap events separately
        var dataOnclick = link.getAttribute('data-onclick') || link.getAttribute('onclick');
        if (dataOnclick) {
            link.removeAttribute('onclick'); // Remove to avoid conflicts

            // Centralized executor so we can call it from click and tap fallbacks
            function executeDataOnclick(evt) {
                try {
                    // Ensure mobile scroll flag is set even if other listeners were canceled
                    if (window.innerWidth <= 800 && typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('shouldScrollToNote', 'true');
                    }

                    var func = new Function('event', dataOnclick);
                    func.call(link, evt);
                } catch (err) {
                    console.error('Error executing click handler:', err);
                }
            }

            // Robust mobile tap fallback:
            // Some mobile browsers cancel the click if a tiny scroll/drag is detected,
            // so we also trigger on pointerup for touch pointers with a small movement threshold.
            if (isMobile) {
                var tapState = {
                    active: false,
                    startX: 0,
                    startY: 0,
                    startT: 0,
                    moved: false,
                    pointerId: null
                };

                // Avoid duplicate loads: if tap fallback fires, ignore the subsequent click.
                function markTapFired() {
                    link.dataset.tapFired = '1';
                    setTimeout(function () {
                        try { delete link.dataset.tapFired; } catch (e) { link.dataset.tapFired = ''; }
                    }, 500);
                }

                link.addEventListener('pointerdown', function (e) {
                    if (e.pointerType !== 'touch') return;
                    tapState.active = true;
                    tapState.moved = false;
                    tapState.startX = e.clientX;
                    tapState.startY = e.clientY;
                    tapState.startT = Date.now();
                    tapState.pointerId = e.pointerId;
                }, { passive: true });

                link.addEventListener('pointermove', function (e) {
                    if (!tapState.active) return;
                    if (e.pointerType !== 'touch') return;
                    // If finger moved more than ~10px, treat it as scroll/drag
                    var dx = Math.abs(e.clientX - tapState.startX);
                    var dy = Math.abs(e.clientY - tapState.startY);
                    if (dx > 10 || dy > 10) {
                        tapState.moved = true;
                    }
                }, { passive: true });

                link.addEventListener('pointerup', function (e) {
                    if (!tapState.active) return;
                    if (e.pointerType !== 'touch') return;
                    if (tapState.pointerId !== null && e.pointerId !== tapState.pointerId) return;

                    var dt = Date.now() - tapState.startT;
                    var shouldTrigger = !tapState.moved && dt < 700; // ignore long-press / scroll

                    tapState.active = false;
                    tapState.pointerId = null;

                    if (!shouldTrigger) return;

                    // Prevent navigation and execute note load
                    if (e.cancelable) e.preventDefault();
                    e.stopPropagation();

                    markTapFired();
                    executeDataOnclick(e);
                }, false);

                link.addEventListener('pointercancel', function () {
                    tapState.active = false;
                    tapState.pointerId = null;
                }, false);
            }

            link.addEventListener('click', function (e) {
                // If mobile tap fallback already handled this interaction, ignore click.
                if (link.dataset && link.dataset.tapFired === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Prevent default link behavior to avoid page reload
                e.preventDefault();
                e.stopPropagation();

                // On mobile, execute immediately without delay for better responsiveness
                if (isMobile) {
                    // Execute immediately on mobile
                    executeDataOnclick(e);
                } else {
                    // Small delay on desktop to distinguish from drag
                    setTimeout(function () {
                        executeDataOnclick(e);
                    }, 50);
                }

                // Always return false to ensure default behavior is prevented
                return false;
            }, false);
        }
    });

    // Add drop events to folder headers (using enhanced handlers for folder+note support)
    var folderHeaders = document.querySelectorAll('.folder-header');
    folderHeaders.forEach(function (header) {
        header.addEventListener('dragenter', handleFolderDragEnterEnhanced);
        header.addEventListener('dragover', handleFolderDragOverEnhanced);
        header.addEventListener('drop', handleFolderDropEnhanced);
        header.addEventListener('dragleave', handleFolderDragLeaveEnhanced);
    });

    // Add global drop handler for dropping outside folders (move to no folder or move folder to root)
    var notesListContainer = document.querySelector('.notes_list, #notes-list, body');
    if (notesListContainer) {
        notesListContainer.addEventListener('dragover', function (e) {
            // Check if we're not over a folder header
            var isOverFolder = e.target.closest('.folder-header');
            if (!isOverFolder && window.currentDragData) {
                // For notes: allow drop if note is in a folder
                if (window.currentDragData.currentFolderId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
                // For folders: allow drop to move to root (only for subfolders)
                if (window.currentDragData.type === 'folder') {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }
        });

        notesListContainer.addEventListener('drop', function (e) {
            // Check if we're not over a folder header
            var isOverFolder = e.target.closest('.folder-header');
            if (!isOverFolder && window.currentDragData) {
                // Handle note drop to root
                if (window.currentDragData.noteId && window.currentDragData.currentFolderId) {
                    e.preventDefault();
                    moveNoteToRoot(window.currentDragData.noteId);
                }
                // Handle folder drop to root
                if (window.currentDragData.type === 'folder' && window.currentDragData.folderId) {
                    e.preventDefault();
                    moveFolderToRoot(window.currentDragData.folderId);
                }
            }
        });
    }

    // Add drop events to root drop zone
    var rootDropZone = document.getElementById('root-drop-zone');

    if (rootDropZone) {
        // Remove existing listeners first
        rootDropZone.removeEventListener('dragover', handleRootDragOver);
        rootDropZone.removeEventListener('drop', handleRootDrop);
        rootDropZone.removeEventListener('dragleave', handleRootDragLeave);

        // Add new listeners
        rootDropZone.addEventListener('dragover', handleRootDragOver);
        rootDropZone.addEventListener('drop', handleRootDrop);
        rootDropZone.addEventListener('dragleave', handleRootDragLeave);
    }
}

function handleNoteDragStart(e) {
    var noteLink = e.target.closest('.links_arbo_left');
    if (!noteLink) {
        return;
    }

    // Stop propagation to prevent the folder-toggle from also starting a drag
    e.stopPropagation();

    var noteId = noteLink.getAttribute('data-note-db-id');
    var currentFolder = noteLink.getAttribute('data-folder');
    var currentFolderId = noteLink.getAttribute('data-folder-id');

    if (noteId) {
        var dragData = {
            noteId: noteId,
            currentFolder: currentFolder || null,
            currentFolderId: currentFolderId || null
        };

        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';

        // Store drag data globally for mouseup fallback
        window.currentDragData = dragData;

        // Create a custom drag image with styles already applied
        var dragImage = noteLink.cloneNode(true);
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.opacity = '0.85';
        dragImage.style.backgroundColor = 'rgba(0, 123, 255, 0.08)';
        dragImage.style.border = '1px solid rgba(0, 123, 255, 0.3)';
        dragImage.style.transform = 'scale(1.02)';
        dragImage.style.padding = '10px';
        dragImage.style.borderRadius = '4px';
        dragImage.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.15)';
        dragImage.style.width = noteLink.offsetWidth + 'px';
        dragImage.style.height = noteLink.offsetHeight + 'px';
        document.body.appendChild(dragImage);

        // Set the custom drag image
        try {
            e.dataTransfer.setDragImage(dragImage, 50, 20);
        } catch (err) {
            // Silently fail if browser doesn't support custom drag images
        }

        // Remove the drag image after a short delay
        setTimeout(function () {
            if (dragImage && dragImage.parentNode) {
                dragImage.parentNode.removeChild(dragImage);
            }
        }, 0);

        // Add visual feedback (styles in modules/drag-drop.css .dragging)
        noteLink.classList.add('dragging');
        noteLink.setAttribute('data-dragging', 'true');

        // Add visual feedback to the source folder
        var sourceFolderHeader = noteLink.closest('.folder-content');
        if (sourceFolderHeader) {
            var parentFolderHeader = sourceFolderHeader.previousElementSibling;
            if (parentFolderHeader && parentFolderHeader.classList.contains('folder-toggle')) {
                var folderHeaderContainer = parentFolderHeader.parentElement;
                if (folderHeaderContainer && folderHeaderContainer.classList.contains('folder-header')) {
                    folderHeaderContainer.classList.add('folder-source-drag');
                }
            }
        }

    }
}

function cleanupDraggingNotes() {
    document.querySelectorAll('.links_arbo_left.dragging').forEach(function (link) {
        link.classList.remove('dragging');
        link.removeAttribute('data-dragging');
        link.style.cssText = '';
    });
    // Remove source folder visual feedback
    document.querySelectorAll('.folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('folder-source-drag');
    });
}

function handleNoteDragEnd(e) {
    // Clean up the dragged note styles
    var noteLink = e.target.closest('.links_arbo_left');
    if (noteLink) {
        noteLink.classList.remove('dragging');
        noteLink.removeAttribute('data-dragging');
    }
    cleanupDraggingNotes();

    // Remove drag-over class from all folders
    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    // Clean up global drag data and hide drop zone after a longer delay
    setTimeout(function () {
        if (window.currentDragData) {
            window.currentDragData = null;
        }

        // Hide root drop zone
        var rootDropZone = document.getElementById('root-drop-zone');
        if (rootDropZone && getComputedStyle(rootDropZone).display !== 'none') {
            rootDropZone.classList.remove('drag-over');
            rootDropZone.className = 'root-drop-zone'; // Reset to original class
            rootDropZone.style.cssText = 'display: none;'; // Reset styles
        }
    }, 2000); // Much longer delay to allow for click interaction
}

function moveNoteToTargetFolder(noteId, targetFolderIdOrName) {
    // targetFolderIdOrName can be either a folder ID (preferred) or folder name (legacy)
    var targetFolderId = null;
    var targetFolder = null;

    // Check if it's a numeric ID
    if (targetFolderIdOrName && !isNaN(targetFolderIdOrName)) {
        targetFolderId = parseInt(targetFolderIdOrName);
    } else if (targetFolderIdOrName && window.folderMap) {
        // Legacy: it's a folder name, try to find the ID
        targetFolder = targetFolderIdOrName;
        for (var fid in window.folderMap) {
            if (window.folderMap[fid] === targetFolder) {
                targetFolderId = parseInt(fid);
                break;
            }
        }
    }

    apiPostJson(
        '/api/v1/notes/' + noteId + '/folder',
        { folder_id: targetFolderId || '', workspace: selectedWorkspace || getSelectedWorkspace() },
        refreshSidebarAfterMove,
        'Error moving note: '
    );
}

function handleRootDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.add('drag-over');
        rootDropZone.style.display = 'block';
    }
}

function handleRootDragLeave(e) {
    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.remove('drag-over');
    }
}

function handleRootDrop(e) {
    e.preventDefault();

    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.remove('drag-over');
        rootDropZone.className = 'root-drop-zone';
        rootDropZone.style.cssText = 'display: none;';
    }

    // Remove dragging class from all notes
    cleanupDraggingNotes();

    try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));

        // Only proceed if note is currently in a folder (not already in root)
        if (data.noteId && data.currentFolderId) {
            moveNoteToRoot(data.noteId);
        }
    } catch (err) {
        console.error('Error handling root drop:', err);
    }
}

function moveNoteToRoot(noteId) {
    apiPostJson(
        '/api/v1/notes/' + noteId + '/remove-folder',
        { workspace: selectedWorkspace || getSelectedWorkspace() },
        refreshSidebarAfterMove,
        'Error removing note from folder: '
    );
}

/**
 * Setup drag and drop events for folders
 * Called from setupNoteDragDropEvents to initialize folder dragging
 */
function setupFolderDragDropEvents() {
    var isMobile = window.innerWidth <= 800;

    // Get all folder toggle elements (excluding system folders)
    // We target folder-toggle instead of folder-header to avoid capturing note drag events
    var folderToggles = document.querySelectorAll('.folder-header:not(.system-folder) > .folder-toggle');

    folderToggles.forEach(function (toggle) {
        // Remove existing listeners
        toggle.removeEventListener('dragstart', handleFolderDragStart);
        toggle.removeEventListener('dragend', handleFolderDragEnd);

        if (!isMobile) {
            // Ensure draggable is set
            toggle.setAttribute('draggable', 'true');
            toggle.draggable = true;

            // Add drag event listeners
            toggle.addEventListener('dragstart', handleFolderDragStart, false);
            toggle.addEventListener('dragend', handleFolderDragEnd, false);
        } else {
            // Disable dragging on mobile
            toggle.removeAttribute('draggable');
            toggle.draggable = false;
        }
    });
}

/**
 * Handle folder drag start
 */
function handleFolderDragStart(e) {
    // Get the folder-toggle element (the draggable element)
    var folderToggle = e.target.closest('.folder-toggle');
    var folderHeader = e.target.closest('.folder-header');
    if (!folderToggle || !folderHeader) {
        return;
    }

    // Don't allow dragging system folders
    if (folderHeader.classList.contains('system-folder')) {
        e.preventDefault();
        return;
    }

    // Get folder data from folder-toggle first, then fallback to folder-header
    var folderId = folderToggle.getAttribute('data-folder-id') || folderHeader.getAttribute('data-folder-id');
    var folderName = folderToggle.getAttribute('data-folder') || folderHeader.getAttribute('data-folder');

    if (!folderId) {
        return;
    }

    var dragData = {
        type: 'folder',
        folderId: folderId,
        folderName: folderName || ''
    };

    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';

    // Store drag data globally for fallback
    window.currentDragData = dragData;

    // Create a custom drag image
    var dragImage = document.createElement('div');
    dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 10px 15px; background: rgba(0, 123, 255, 0.15); border: 2px solid rgba(0, 123, 255, 0.4); border-radius: 8px; font-weight: 500; color: #007bff; display: flex; align-items: center; gap: 8px;';
    dragImage.innerHTML = '<i class="fa-folder"></i> ' + (folderName || 'Folder');
    document.body.appendChild(dragImage);

    try {
        e.dataTransfer.setDragImage(dragImage, 50, 20);
    } catch (err) {
        // Silently fail if browser doesn't support custom drag images
    }

    // Remove the drag image after a short delay
    setTimeout(function () {
        if (dragImage && dragImage.parentNode) {
            dragImage.parentNode.removeChild(dragImage);
        }
    }, 0);

    // Add visual feedback (styles in modules/drag-drop.css .folder-dragging)
    folderToggle.classList.add('folder-dragging');
    folderHeader.classList.add('folder-source-drag');
}

/**
 * Handle folder drag end
 */
function handleFolderDragEnd(e) {
    var folderToggle = e.target.closest('.folder-toggle');
    var folderHeader = e.target.closest('.folder-header');

    // Clean up styles on folder-toggle (the draggable element)
    if (folderToggle) {
        folderToggle.classList.remove('folder-dragging');
        folderToggle.style.opacity = '';
        folderToggle.style.backgroundColor = '';
        folderToggle.style.border = '';
        folderToggle.style.transform = '';
    }
    // Also clean up folder-header styles if any were applied
    if (folderHeader) {
        folderHeader.classList.remove('folder-dragging');
        folderHeader.classList.remove('folder-source-drag');
        folderHeader.style.opacity = '';
        folderHeader.style.backgroundColor = '';
        folderHeader.style.border = '';
        folderHeader.style.transform = '';
    }

    // Clean up all folder drag-over states
    document.querySelectorAll('.folder-header.folder-drop-target, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    // Clean up global drag data
    setTimeout(function () {
        if (window.currentDragData && window.currentDragData.type === 'folder') {
            window.currentDragData = null;
        }
    }, 100);
}

/**
 * Enhanced folder drag enter handler to avoid flicker on nested elements
 */
function handleFolderDragEnterEnhanced(e) {
    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    if (e.relatedTarget && folderHeader.contains(e.relatedTarget)) {
        return;
    }

    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target').forEach(function (header) {
        if (header === folderHeader) return;
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    folderHeader.dataset.dragEnterCount = '1';

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    var dragData = window.currentDragData;

    if (dragData && dragData.type === 'folder') {
        if (dragData.folderId === targetFolderId) {
            return;
        }
        if (folderHeader.classList.contains('system-folder')) {
            return;
        }
        folderHeader.classList.add('folder-drop-target');
        folderHeader.classList.add('drag-over');
        return;
    }

    if (targetFolder === 'Tags') {
        return;
    }

    folderHeader.classList.add('drag-over');
}

/**
 * Enhanced folder drag over handler that supports both notes and folders
 */
function handleFolderDragOverEnhanced(e) {
    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    // Check what we're dragging
    var dragData = window.currentDragData;

    // If dragging a folder
    if (dragData && dragData.type === 'folder') {
        // Prevent dropping folder on itself
        if (dragData.folderId === targetFolderId) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        // Prevent dropping on system folders
        if (folderHeader.classList.contains('system-folder')) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        e.dataTransfer.dropEffect = 'move';
        folderHeader.classList.add('folder-drop-target');
        folderHeader.classList.add('drag-over');
        return;
    }

    // If dragging a note (existing behavior)
    // Prevent drag-over effect for Tags folder
    if (targetFolder === 'Tags') {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    // Allow drag-over for all other folders including Favorites
    e.dataTransfer.dropEffect = 'move';
    folderHeader.classList.add('drag-over');
}

/**
 * Enhanced folder drag leave handler
 */
function handleFolderDragLeaveEnhanced(e) {
    var folderHeader = e.target.closest('.folder-header');
    if (folderHeader) {
        if (e.relatedTarget && folderHeader.contains(e.relatedTarget)) {
            return;
        }

        var count = parseInt(folderHeader.dataset.dragEnterCount || '0', 10) - 1;
        if (count > 0) {
            folderHeader.dataset.dragEnterCount = String(count);
            return;
        }

        if (folderHeader.dataset && folderHeader.dataset.dragEnterCount) {
            delete folderHeader.dataset.dragEnterCount;
        }

        folderHeader.classList.remove('drag-over');
        folderHeader.classList.remove('folder-drop-target');
    }
}

/**
 * Enhanced folder drop handler that supports both notes and folders
 */
function handleFolderDropEnhanced(e) {
    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    folderHeader.classList.remove('drag-over');
    folderHeader.classList.remove('folder-drop-target');
    if (folderHeader.dataset && folderHeader.dataset.dragEnterCount) {
        delete folderHeader.dataset.dragEnterCount;
    }

    try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        var targetFolder = folderHeader.getAttribute('data-folder');
        var targetFolderId = folderHeader.getAttribute('data-folder-id');

        // Handle folder drop
        if (data.type === 'folder') {
            // Remove dragging class from the source folder
            document.querySelectorAll('.folder-header.folder-dragging').forEach(function (header) {
                header.classList.remove('folder-dragging');
                header.style.opacity = '';
                header.style.backgroundColor = '';
                header.style.border = '';
                header.style.transform = '';
            });

            // Prevent dropping folder on itself
            if (data.folderId === targetFolderId) {
                return;
            }

            // Prevent dropping on system folders
            if (folderHeader.classList.contains('system-folder')) {
                return;
            }

            // Move folder to new parent
            moveFolderToParent(data.folderId, targetFolderId);
            return;
        }

        // Handle note drop (existing behavior)
        // Remove dragging class from all notes
        document.querySelectorAll('.links_arbo_left.dragging').forEach(function (link) {
            link.classList.remove('dragging');
        });

        // Prevent dropping notes into the Tags folder
        if (targetFolder === 'Tags') {
            return;
        }

        // Special handling for Public folder
        if (targetFolder === 'Public') {
            if (typeof openPublicShareModal === 'function') {
                openPublicShareModal(data.noteId);
            }
            return;
        }

        // Special handling for Favorites folder
        if (targetFolder === 'Favorites') {
            toggleFavorite(data.noteId);
            return;
        }

        // Special handling for Trash folder
        if (targetFolder === 'Trash') {
            deleteNote(data.noteId);
            return;
        }

        // Compare folder IDs to handle subfolders with same names
        var currentFolderId = data.currentFolderId ? String(data.currentFolderId) : null;
        var targetFolderIdStr = targetFolderId ? String(targetFolderId) : null;

        if (data.noteId && targetFolderId && currentFolderId !== targetFolderIdStr) {
            moveNoteToTargetFolder(data.noteId, targetFolderId);
        }
    } catch (err) {
        console.error('Error handling folder drop:', err);
    }
}

/**
 * Move folder to a new parent folder (pass null for root)
 */
function moveFolderToParent(folderId, newParentFolderId) {
    apiPostJson(
        '/api/v1/folders/' + folderId + '/move',
        { workspace: selectedWorkspace || getSelectedWorkspace(), new_parent_folder_id: newParentFolderId },
        function () { location.reload(); },
        'Error moving folder: '
    );
}

/**
 * Move folder to root (remove from parent folder)
 */
function moveFolderToRoot(folderId) {
    moveFolderToParent(folderId, null);
}

function setupLinkEvents() {
    document.addEventListener('click', function (e) {
        // Make links clickable in contenteditable areas
        if (e.target.tagName === 'A' && e.target.closest('[contenteditable="true"]')) {
            e.preventDefault();
            e.stopPropagation();

            // Check if user has selected text (wants to edit) vs simple click (wants to follow link)
            var selection = window.getSelection();
            var hasSelection = selection && selection.toString().trim().length > 0;

            if (hasSelection) {
                // User has selected text - they want to edit the link, not follow it
                // Do nothing here, let the normal selection behavior work
                // The toolbar's link button will handle editing
                return;
            }

            // No selection - user wants to follow the link
            // Check if this is a note-to-note link
            var href = e.target.href;
            var noteMatch = href.match(/[?&]note=(\d+)/);
            var workspaceMatch = href.match(/[?&]workspace=([^&]+)/);

            if (noteMatch && noteMatch[1]) {
                // This is a note-to-note link - open it within the app
                var targetNoteId = noteMatch[1];
                var targetWorkspace = workspaceMatch ? decodeURIComponent(workspaceMatch[1]) : (selectedWorkspace || getSelectedWorkspace());

                // If workspace is different, reload page with new workspace and note
                if (targetWorkspace !== selectedWorkspace) {
                    // Save the new workspace to database
                    if (typeof saveLastOpenedWorkspace === 'function') {
                        saveLastOpenedWorkspace(targetWorkspace);
                    }

                    // Navigate to the new workspace with the target note
                    var url = 'index.php?workspace=' + encodeURIComponent(targetWorkspace) + '&note=' + targetNoteId;
                    window.location.href = url;
                } else {
                    // Same workspace, just load the note
                    loadNoteById(targetNoteId);
                }
            } else {
                // Regular external link - open in new tab
                window.open(href, '_blank');
            }
        }
    });

    // Image and text paste management
    document.body.addEventListener('paste', function (e) {
        try {
            // Skip paste handling for task input fields
            if (e.target && (
                e.target.classList.contains('task-input') ||
                e.target.classList.contains('task-edit-input') ||
                e.target.tagName === 'INPUT'
            )) {
                return; // Let the default paste behavior handle it
            }

            var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
            if (!note) return;

            // Check if this is a markdown note
            var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';

            var items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : null;

            // Handle image paste
            if (items) {
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item && item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                        e.preventDefault();
                        var file = item.getAsFile();
                        if (file) {
                            handleImageFilesAndInsert([file], note);
                        }
                        return;
                    }
                }
            }

            // Handle text paste for HTML rich notes (not markdown)
            if (!isMarkdownNote && e.clipboardData) {
                var htmlData = e.clipboardData.getData('text/html');
                var plainText = e.clipboardData.getData('text/plain');

                // Detect and handle iframe HTML (YouTube embeds, etc.)
                if (plainText) {
                    // Check if the pasted text is iframe HTML
                    var iframeMatch = plainText.match(/<iframe\s+([^>]+)>\s*<\/iframe>/i);
                    if (iframeMatch) {
                        e.preventDefault();

                        // Parse iframe attributes to validate and filter
                        var iframeHtml = iframeMatch[0];
                        var srcMatch = iframeHtml.match(/src\s*=\s*["']([^"']+)["']/i);

                        if (srcMatch) {
                            var src = srcMatch[1];

                            // Whitelist of allowed iframe domains (same as PHP markdown parser)
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

                            if (isAllowed) {
                                // Create actual iframe element from the HTML string
                                var tempContainer = document.createElement('div');
                                tempContainer.innerHTML = iframeHtml;
                                var iframeElement = tempContainer.querySelector('iframe');

                                if (iframeElement) {
                                    // Insert iframe at cursor position
                                    var selection = window.getSelection();
                                    if (selection.rangeCount > 0) {
                                        var range = selection.getRangeAt(0);
                                        range.deleteContents();

                                        // Create a wrapper for better spacing
                                        var fragment = document.createDocumentFragment();

                                        // Add line break before
                                        var lineBefore = document.createElement('div');
                                        lineBefore.innerHTML = '<br>';
                                        fragment.appendChild(lineBefore);

                                        // Add the iframe
                                        fragment.appendChild(iframeElement);

                                        // Add line break after
                                        var lineAfter = document.createElement('div');
                                        lineAfter.innerHTML = '<br>';
                                        fragment.appendChild(lineAfter);

                                        range.insertNode(fragment);

                                        // Move cursor after the inserted content
                                        range.collapse(false);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                    }

                                    // Trigger update
                                    if (typeof window.markNoteAsModified === 'function') {
                                        window.markNoteAsModified();
                                    }
                                    return;
                                }
                            } else {
                                // Domain not allowed - show warning
                                console.warn('Iframe domain not in whitelist:', src);
                            }
                        }
                    }
                }

                // Detect if pasted content is code from VS Code or similar editors
                // VS Code uses Consolas, Monaco, Courier New, or monospace fonts
                if (htmlData && (
                    htmlData.includes('Consolas') ||
                    htmlData.includes('Monaco') ||
                    htmlData.includes('Courier New') ||
                    htmlData.includes('monospace') ||
                    htmlData.includes('Segoe UI Mono') ||
                    htmlData.includes('vscode') ||
                    htmlData.includes('monaco-editor')
                )) {
                    e.preventDefault();

                    // Extract plain text from the pasted content to avoid formatting issues
                    var codeText = plainText || '';
                    
                    // Insert as plain text with monospace styling
                    var selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        var range = selection.getRangeAt(0);
                        range.deleteContents();

                        // Split text into lines and create proper structure
                        var lines = codeText.split('\n');
                        var fragment = document.createDocumentFragment();

                        lines.forEach(function(line, index) {
                            // Create a span for each line to preserve monospace
                            var span = document.createElement('span');
                            span.style.fontFamily = '"Segoe UI Mono", "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace';
                            span.textContent = line;
                            fragment.appendChild(span);

                            // Add line break except for the last line
                            if (index < lines.length - 1) {
                                fragment.appendChild(document.createElement('br'));
                            }
                        });

                        range.insertNode(fragment);

                        // Move cursor to end
                        range.collapse(false);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }

                    // Trigger update
                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }
                    return;
                }

                // Detect if this is a URL being pasted
                if (plainText && !htmlData) {
                    var trimmedText = plainText.trim();
                    // Check if the pasted text is a valid URL (http/https/ftp)
                    var urlRegex = /^(https?:\/\/|ftp:\/\/)[^\s]+$/i;

                    if (urlRegex.test(trimmedText)) {
                        e.preventDefault();

                        // Create a clickable link element
                        var link = document.createElement('a');
                        link.href = trimmedText;
                        link.textContent = trimmedText;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';

                        // Insert the link at cursor position
                        var selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            var range = selection.getRangeAt(0);
                            range.deleteContents();

                            // Insert the link element
                            range.insertNode(link);

                            // Add a space after for easier editing
                            var space = document.createTextNode(' ');
                            range.setStartAfter(link);
                            range.insertNode(space);

                            // Move cursor after the inserted link
                            range.setStartAfter(space);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }

                        // Trigger update
                        if (typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }
                    }
                }
            }
        } catch (err) {
        }
    });

    // Trigger syntax highlighting on code block input/paste
    document.body.addEventListener('input', function(e) {
        var target = e.target;
        
        // Check if we're in a code element with a language class
        if (target.tagName === 'CODE' && target.className && target.className.includes('language-')) {
            // Apply syntax highlighting after a short delay to allow DOM to update
            setTimeout(function() {
                if (typeof window.applySyntaxHighlighting === 'function') {
                    var pre = target.closest('pre');
                    if (pre) {
                        window.applySyntaxHighlighting(pre);
                    }
                }
            }, 10);
        }
        
        // Also check if we're in a pre element containing a code with language
        if (target.tagName === 'PRE') {
            var codeElement = target.querySelector('code[class*="language-"]');
            if (codeElement) {
                setTimeout(function() {
                    if (typeof window.applySyntaxHighlighting === 'function') {
                        window.applySyntaxHighlighting(target);
                    }
                }, 10);
            }
        }
    });
}

function setupFocusEvents() {
    document.body.addEventListener('focusin', function (e) {
        if (e.target.classList.contains('searchbar') ||
            e.target.id === 'search' ||
            e.target.classList.contains('searchtrash')) {
            noteid = -1;
        }
    });

    // Auto-focus empty notes when clicked anywhere in the content area OR right column
    document.addEventListener('click', function (e) {
        // Find which column was clicked
        const rightCol = e.target.closest('#right_col');
        if (!rightCol) return;

        // Ignore if clicking on interactive elements
        if (e.target.closest('button, a, input, select, textarea, [role="button"]')) {
            return;
        }

        // Determine which note to target
        // Priority 1: The specific note card clicked
        // Priority 2: The current note if only one is relevant
        const card = e.target.closest('.notecard');
        let noteEntry = null;

        if (card) {
            noteEntry = card.querySelector('.noteentry');
        } else {
            // Fallback for clicks in the background of #right_col
            // If there's a selected note in the sidebar, try to find it in the right column
            const selectedNoteId = window.noteid;
            if (selectedNoteId !== -1 && selectedNoteId !== null) {
                noteEntry = document.querySelector('#note' + selectedNoteId + ' .noteentry');
            }

            // Ultimate fallback: the first note entry if there's only one or if it's the intended one
            if (!noteEntry) {
                noteEntry = rightCol.querySelector('.noteentry');
            }
        }

        if (noteEntry && noteEntry.getAttribute('contenteditable') === 'true') {
            // Check if it's "empty" (no text or just empty tags)
            const textContent = noteEntry.textContent.trim();
            const hasImages = noteEntry.querySelector('img') !== null;
            const isMarkdownPreview = noteEntry.classList.contains('markdown-preview');

            if (textContent === '' && !hasImages && !isMarkdownPreview) {
                // Ensure noteid is correctly set to this note if it wasn't
                const noteIdFromEntry = extractNoteIdFromEntry(noteEntry);
                if (noteIdFromEntry) {
                    window.noteid = noteIdFromEntry;
                }

                // Focus it
                if (document.activeElement !== noteEntry) {
                    noteEntry.focus();
                }

                // Place cursor at the start
                const selection = window.getSelection();
                const range = document.createRange();
                range.setStart(noteEntry, 0);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    });
}

function setupAutoSaveCheck() {
    // Modern auto-save: local storage + debounced server sync
    // No longer using periodic checks - saves happen immediately locally and debounced to server

    // Setup online/offline detection
    window.addEventListener('online', function () {
        isOnline = true;
        // Try to sync any pending changes
        if (noteid !== -1 && noteid !== 'search' && noteid !== null && noteid !== undefined) {
            var draftKey = 'poznote_draft_' + noteid;
            var draft = localStorage.getItem(draftKey);
            if (draft && draft !== lastSavedContent) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    saveToServerDebounced();
                }, 1000); // Shorter delay when coming back online
            }
        }
        updateConnectionStatus(true);
    });

    window.addEventListener('offline', function () {
        isOnline = false;
        updateConnectionStatus(false);
    });
}

function updateConnectionStatus(online) {
    // Auto-save status - console only, no visual indicators
    if (online) {
        // Remove from refresh list since it's now saved
        notesNeedingRefresh.delete(String(noteid));
    } else {
    }
}

function setupPageUnloadWarning() {
    // Handled by the global beforeunload listener below
}

function markNoteAsModified() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) {
        return;
    }

    // Throttle expensive innerHTML comparisons to avoid lag when typing
    var now = Date.now();
    if (now - lastChangeCheckTime < CHANGE_CHECK_INTERVAL) {
        // Too soon - schedule a deferred check instead
        if (!changeCheckThrottle) {
            changeCheckThrottle = setTimeout(function () {
                changeCheckThrottle = null;
                markNoteAsModified();
            }, CHANGE_CHECK_INTERVAL - (now - lastChangeCheckTime));
        }
        return;
    }

    lastChangeCheckTime = now;

    // Check if there are actually changes before triggering save process
    var entryElem = document.getElementById("entry" + noteid);
    var titleInput = document.getElementById("inp" + noteid);
    var tagsElem = document.getElementById("tags" + noteid);

    // For title and tags, comparison is cheap
    var currentTitle = titleInput ? titleInput.value : '';
    var currentTags = tagsElem ? tagsElem.value : '';

    // Initialize lastSaved states if not set
    if (typeof lastSavedContent === 'undefined') lastSavedContent = null;
    if (typeof lastSavedTitle === 'undefined') lastSavedTitle = null;
    if (typeof lastSavedTags === 'undefined') lastSavedTags = null;

    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;

    // Use requestIdleCallback for expensive innerHTML comparison (or fallback to immediate)
    var checkContentAndSave = function () {
        var currentContent = entryElem ? entryElem.innerHTML : '';
        var contentChanged = currentContent !== lastSavedContent;

        if (!contentChanged && !titleChanged && !tagsChanged) {
            return;
        }

        // Modern auto-save: save to localStorage immediately
        saveToLocalStorage();

        // Mark this note as having pending changes (until server save completes)
        notesNeedingRefresh.add(String(noteid));

        // Visual indicator: add red dot to page title when there are unsaved changes
        if (!document.title.startsWith('🔴')) {
            document.title = '🔴 ' + document.title;
        }

        // Debounced server save (increased to 3s for better performance)
        clearTimeout(saveTimeout);
        var currentNoteId = noteid; // Capture current note ID
        saveTimeout = setTimeout(function () {
            // Only save if we're still on the same note
            if (noteid === currentNoteId && isOnline) {
                saveToServerDebounced();
            }
        }, 3000); // 3 second debounce (increased from 2s)
    };

    // If title or tags changed, check immediately; otherwise use idle callback
    if (titleChanged || tagsChanged) {
        checkContentAndSave();
    } else {
        // Schedule during browser idle time to avoid blocking typing
        if (window.requestIdleCallback) {
            window.requestIdleCallback(checkContentAndSave, { timeout: 500 });
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(checkContentAndSave, 0);
        }
    }
}

function saveToLocalStorage() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) return;

    // Debounce localStorage writes (they can be expensive with large content)
    clearTimeout(localStorageSaveTimer);
    localStorageSaveTimer = setTimeout(function () {
        try {
            var entryElem = document.getElementById("entry" + noteid);
            var titleInput = document.getElementById("inp" + noteid);
            var tagsElem = document.getElementById("tags" + noteid);

            if (entryElem) {
                // Serialize checklist data before saving
                serializeChecklists(entryElem);

                var content = entryElem.innerHTML;
                var draftKey = 'poznote_draft_' + noteid;
                localStorage.setItem(draftKey, content);

                // Also save title and tags
                if (titleInput) {
                    localStorage.setItem('poznote_title_' + noteid, titleInput.value);
                }
                if (tagsElem) {
                    localStorage.setItem('poznote_tags_' + noteid, tagsElem.value);
                }
            }
        } catch (err) {
            // localStorage quota exceeded or other error
            console.warn('Failed to save to localStorage:', err);
        }
    }, 300); // Debounce localStorage by 300ms
}

function saveToServerDebounced() {
    if (noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) return;

    // Clear the timeout since we're executing the save now
    clearTimeout(saveTimeout);
    saveTimeout = null;

    // Check that the note elements still exist (user might have navigated away)
    var titleInput = document.getElementById("inp" + noteid);
    var entryElem = document.getElementById("entry" + noteid);
    if (!titleInput || !entryElem) {
        return;
    }

    // Check if content has actually changed
    var draftKey = 'poznote_draft_' + noteid;
    var titleKey = 'poznote_title_' + noteid;
    var tagsKey = 'poznote_tags_' + noteid;

    var currentDraft = localStorage.getItem(draftKey);
    var currentTitle = localStorage.getItem(titleKey);
    var currentTags = localStorage.getItem(tagsKey);

    var contentChanged = currentDraft !== lastSavedContent;
    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;

    if (!contentChanged && !titleChanged && !tagsChanged) {
        // No changes detected
        return;
    }


    // Trigger server save
    saveNoteToServer();
}

// Text selection management for formatting toolbar
function initTextSelectionHandlers() {
    // Check if we're in desktop mode
    var isMobile = isMobileDevice();

    var selectionTimeout;

    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function () {
            var selection = window.getSelection();

            // Desktop handling (existing code)
            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            var noteActionButtons = document.querySelectorAll('.note-action-btn');

            // Check if the selection contains text
            if (selection && selection.toString().trim().length > 0) {
                var range = selection.getRangeAt(0);
                var container = range.commonAncestorContainer;

                // Improve detection of editable area
                var currentElement = container.nodeType === 3 ? container.parentElement : container; // Node.TEXT_NODE
                var editableElement = null;

                // Go up the DOM tree to find an editable area
                var isTitleOrTagField = false;
                while (currentElement && currentElement !== document.body) {

                    if (isTitleOrTagElement(currentElement)) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a markdown editor, allow formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-editor')) {
                        editableElement = currentElement;
                        break;
                    }
                    // If selection is inside a markdown preview (read-only), hide formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-preview')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a task list, treat it as non-editable for formatting
                    try {
                        if (currentElement && currentElement.closest && currentElement.closest('.task-list-container, .tasks-list, .task-item, .task-text')) {
                            // Consider as not editable so formatting buttons won't appear
                            editableElement = null;
                            isTitleOrTagField = true;
                            break;
                        }
                    } catch (err) { }
                    // Treat selection inside the note metadata subline as title-like (do not toggle toolbar)
                    if (currentElement.classList && currentElement.classList.contains('note-subline')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    if (currentElement.classList && currentElement.classList.contains('noteentry')) {
                        editableElement = currentElement;
                        break;
                    }
                    if (currentElement.contentEditable === 'true') {
                        editableElement = currentElement;
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }

                if (isTitleOrTagField) {
                    // Text selected in a title or tags field: keep normal state (actions visible, formatting hidden)
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.remove('hide-on-selection');
                    }
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.add('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                } else {
                    // Text selected but not in an editable area: hide everything
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                }
            } else {
                // No text selection: show actions, hide formatting
                for (var i = 0; i < textFormatButtons.length; i++) {
                    textFormatButtons[i].classList.remove('show-on-selection');
                }
                for (var i = 0; i < noteActionButtons.length; i++) {
                    noteActionButtons[i].classList.remove('hide-on-selection');
                }
            }

        }, 50); // Short delay to avoid too frequent calls
    }

    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);

    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', function (e) {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });
}

// Helper function to load a note by ID
function loadNoteById(noteId) {
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + noteId;

    // Use the existing loadNoteDirectly function if available
    if (typeof window.loadNoteDirectly === 'function') {
        window.loadNoteDirectly(url, noteId, null);
    } else {
        // Fallback: navigate directly
        window.location.href = url;
    }
}

// Helper function to switch workspace with callback
function switchWorkspace(targetWorkspace, callback) {
    // If switching to a different workspace, we need to reload the entire page
    // to refresh the left column with notes from the new workspace
    if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace !== targetWorkspace) {
        // Build the URL for the new workspace with the target note
        var url = 'index.php?workspace=' + encodeURIComponent(targetWorkspace);

        // If there's a callback that would load a note, extract the note ID from it
        // Since we're reloading the page, we can append the note parameter
        if (callback) {
            // Try to detect if callback will load a note
            // For now, we'll just reload to the workspace and let the callback handle the note
            window.location.href = url;
        } else {
            window.location.href = url;
        }
    } else {
        // Same workspace, just update the variable and call callback
        if (typeof selectedWorkspace !== 'undefined') {
            selectedWorkspace = targetWorkspace;
        }
        if (callback) {
            callback();
        }
    }
}

// Check if current note has unsaved changes (pending server save)
function hasUnsavedChanges(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') return false;


    // Check if there's a pending server save timeout
    if (saveTimeout !== null && saveTimeout !== undefined) {
        return true;
    }

    // Check if note is marked as needing refresh (has pending changes)
    if (notesNeedingRefresh.has(String(noteId))) {
        return true;
    }

    // Also check if page title still has unsaved indicator
    if (document.title.startsWith('🔴')) {
        return true;
    }

    return false;
}

// Check before leaving a note with unsaved changes
function checkUnsavedBeforeLeaving(targetNoteId) {
    var currentNoteId = window.noteid;

    if (!currentNoteId || currentNoteId === -1 || currentNoteId === 'search') return true;

    // If staying on same note, no need to check
    if (String(currentNoteId) === String(targetNoteId)) return true;

    if (hasUnsavedChanges(currentNoteId)) {
        var message = tr(
            'autosave.confirm_switch',
            {},
            "⚠️ Unsaved Changes Detected\n\n" +
            "You have unsaved changes that will be lost if you switch now.\n\n" +
            "Click OK to save and continue, or Cancel to stay.\n" +
            "(Auto-save occurs 2 seconds after you stop typing)"
        );

        if (confirm(message)) {
            // Force immediate save
            clearTimeout(saveTimeout);
            saveTimeout = null;

            // Immediate server save
            if (isOnline) {
                saveToServerDebounced();
            }

            // Small delay to let save complete
            setTimeout(() => {
                notesNeedingRefresh.delete(String(currentNoteId));
            }, 500);

            return true;
        } else {
            return false;
        }
    }

    return true;
}

// Emergency save function for page unload scenarios
function emergencySave(noteId) {
    if (!noteId || noteId === -1 || noteId === 'search') return;

    var entryElem = document.getElementById("entry" + noteId);
    var titleInput = document.getElementById("inp" + noteId);
    var tagsElem = document.getElementById("tags" + noteId);
    var folderElem = document.getElementById("folder" + noteId);

    if (!entryElem || !titleInput) {
        return;
    }

    // Serialize checklist data before saving
    serializeChecklists(entryElem);

    var headi = titleInput.value || '';

    // If title is empty, only use placeholder if it matches default note title patterns
    // Support both English and French (and potentially other languages)
    if (headi === '' && titleInput.placeholder) {
        var placeholderPatterns = [
            /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
            /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
        ];

        var isDefaultPlaceholder = placeholderPatterns.some(function (pattern) {
            return pattern.test(titleInput.placeholder);
        });

        if (isDefaultPlaceholder) {
            headi = titleInput.placeholder;
        }
    }

    var ent = entryElem.innerHTML.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    var tags = tagsElem ? tagsElem.value : '';
    var folder = folderElem ? folderElem.value : null; // No folder selected

    // Get folder_id from hidden input field
    var folderIdElem = document.getElementById("folderId" + noteId);
    var folder_id = null;
    if (folderIdElem && folderIdElem.value !== '') {
        folder_id = parseInt(folderIdElem.value);
        // Ensure it's a valid number, not NaN or 0
        if (isNaN(folder_id) || folder_id === 0) {
            folder_id = null;
        }
    }

    var updates = {
        heading: headi,
        content: ent,
        tags: tags,
        folder: folder,
        folder_id: folder_id,
        workspace: (window.selectedWorkspace || getSelectedWorkspace())
    };

    // Strategy 1: Try fetch with keepalive (most reliable)
    // Use RESTful API: PATCH /api/v1/notes/{id}
    try {
        fetch("/api/v1/notes/" + noteId, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(updates),
            keepalive: true
        }).then(function () {
        }).catch(function (err) {
            console.error('[Poznote Auto-Save] Emergency fetch failed:', err);
        });
    } catch (err) {

        // Strategy 2: Fallback to sendBeacon with FormData
        // Uses dedicated beacon endpoint that accepts FormData
        try {
            var formData = new FormData();
            formData.append('content', ent);
            formData.append('workspace', window.selectedWorkspace || getSelectedWorkspace());

            if (navigator.sendBeacon('/api/v1/notes/' + noteId + '/beacon', formData)) {
            } else {
                console.error('[Poznote Auto-Save] sendBeacon returned false');
            }
        } catch (beaconErr) {
            console.error('[Poznote Auto-Save] sendBeacon failed:', beaconErr);

            // Strategy 3: Last resort - synchronous XMLHttpRequest (deprecated but works)
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('PATCH', '/api/v1/notes/' + noteId, false); // false = synchronous
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                xhr.send(JSON.stringify(updates));
            } catch (xhrErr) {
                console.error('[Poznote Auto-Save] All emergency save strategies failed:', xhrErr);
            }
        }
    }
}

// Unified beforeunload handler: emergency save + browser warning
window.addEventListener('beforeunload', function (e) {
    var currentNoteId = window.noteid;
    if (hasUnsavedChanges(currentNoteId)) {
        // Force immediate save before leaving
        if (isOnline) {
            try {
                emergencySave(currentNoteId);
            } catch (err) {
                console.error('[Poznote Auto-Save] Emergency save failed:', err);
            }
        }

        // Show browser warning
        var message = tr(
            'autosave.beforeunload_warning',
            {},
            '⚠️ You have unsaved changes. Are you sure you want to leave?'
        );
        e.preventDefault();
        e.returnValue = message;
        return message;
    }
});

// Unified popstate handler: unsaved changes check + URL-based navigation
window.addEventListener('popstate', function (e) {
    var currentNoteId = window.noteid;

    // Check for unsaved changes first
    if (hasUnsavedChanges(currentNoteId)) {
        var message = tr(
            'autosave.confirm_navigation',
            {},
            "⚠️ Unsaved Changes\n\n" +
            "You have unsaved changes that will be lost.\n" +
            "Save before navigating away?"
        );

        if (confirm(message)) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
            if (isOnline) {
                saveToServerDebounced();
            }
            notesNeedingRefresh.delete(String(currentNoteId));
        }
    }

    // Handle URL-based navigation (browser back/forward)
    var url = new URL(window.location.href);
    var noteParam = url.searchParams.get('note');

    if (noteParam && typeof loadNoteFromUrl === 'function') {
        loadNoteFromUrl(window.location.href, true);
    } else if (!noteParam && url.searchParams.get('workspace')) {
        // Just workspace change, let ui.js handler manage it
    } else {
        window.location.reload();
    }
});

// Draft restoration functions
function checkForUnsavedDraft(noteId, skipAutoRestore) {
    if (!noteId || noteId === -1 || noteId === 'search') return;


    try {
        var draftKey = 'poznote_draft_' + noteId;
        var titleKey = 'poznote_title_' + noteId;
        var tagsKey = 'poznote_tags_' + noteId;

        var draftContent = localStorage.getItem(draftKey);
        var draftTitle = localStorage.getItem(titleKey);
        var draftTags = localStorage.getItem(tagsKey);

        if (draftContent) {
            var entryElem = document.getElementById('entry' + noteId);
            var titleInput = document.getElementById('inp' + noteId);
            var tagsInput = document.getElementById('tags' + noteId);

            // Check if draft is different from current content
            var currentContent = entryElem ? entryElem.innerHTML : '';
            var currentTitle = titleInput ? titleInput.value : '';
            var currentTags = tagsInput ? tagsInput.value : '';

            var hasUnsavedChanges = (draftContent !== currentContent) ||
                (draftTitle && draftTitle !== currentTitle) ||
                (draftTags && draftTags !== currentTags);

            if (hasUnsavedChanges && !skipAutoRestore) {
                // Restore draft automatically without asking
                restoreDraft(noteId, draftContent, draftTitle, draftTags);
            } else if (hasUnsavedChanges && skipAutoRestore) {
                // Draft exists but we're skipping auto-restore (note was refreshed from server)
                // Clear old draft since server content is more recent
                clearDraft(noteId);
                // Initialize with current server content
                var entryElem = document.getElementById('entry' + noteId);
                var titleInput = document.getElementById('inp' + noteId);
                var tagsElem = document.getElementById('tags' + noteId);
                if (entryElem) {
                    lastSavedContent = entryElem.innerHTML;
                }
                if (titleInput) {
                    lastSavedTitle = titleInput.value;
                }
                if (tagsElem) {
                    lastSavedTags = tagsElem.value;
                }
            } else {
                // No unsaved changes, initialize lastSaved* variables
                lastSavedContent = draftContent;

                var titleInput = document.getElementById('inp' + noteId);
                var tagsElem = document.getElementById('tags' + noteId);
                if (titleInput) {
                    lastSavedTitle = titleInput.value;
                }
                if (tagsElem) {
                    lastSavedTags = tagsElem.value;
                }
            }
        } else {
            // Initialize lastSaved* variables with current content
            var entryElem = document.getElementById('entry' + noteId);
            var titleInput = document.getElementById('inp' + noteId);
            var tagsElem = document.getElementById('tags' + noteId);
            if (entryElem) {
                lastSavedContent = entryElem.innerHTML;
            }
            if (titleInput) {
                lastSavedTitle = titleInput.value;
            }
            if (tagsElem) {
                lastSavedTags = tagsElem.value;
            }
        }
    } catch (err) {
    }
}

function restoreDraft(noteId, content, title, tags) {
    var entryElem = document.getElementById('entry' + noteId);
    var titleInput = document.getElementById('inp' + noteId);
    var tagsInput = document.getElementById('tags' + noteId);

    if (entryElem && content) {
        var noteType = entryElem.getAttribute('data-note-type') || 'note';
        if (noteType === 'note') {
            // Fix drafts that stored escaped media tags
            content = content
                .replace(/&lt;audio\s+([^&]+)&gt;\s*&lt;\/audio&gt;/gi, '<audio $1></audio>')
                .replace(/&lt;video\s+([^&]+)&gt;\s*&lt;\/video&gt;/gi, '<video $1></video>')
                .replace(/&lt;iframe\s+([^&]+)&gt;\s*&lt;\/iframe&gt;/gi, '<iframe $1></iframe>');
        }
        entryElem.innerHTML = content;

        // Convert any restored <audio> elements to iframes for contenteditable
        if (typeof window.convertNoteAudioToIframes === 'function') {
            window.convertNoteAudioToIframes();
        }
    }
    if (titleInput && title) {
        titleInput.value = title;
    }
    if (tagsInput && tags) {
        tagsInput.value = tags;
    }

    // Auto-save will handle the restored content automatically
}

function clearDraft(noteId) {
    try {
        localStorage.removeItem('poznote_draft_' + noteId);
        localStorage.removeItem('poznote_title_' + noteId);
        localStorage.removeItem('poznote_tags_' + noteId);
    } catch (err) {
    }
}

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

        // Initialize lastSaved* variables with current server content (freshly loaded)
        var entryContent = entryElem.innerHTML;
        var titleInput = document.getElementById('inp' + currentNoteId);
        var tagsElem = document.getElementById('tags' + currentNoteId);

        if (typeof lastSavedContent !== 'undefined') {
            lastSavedContent = entryContent;
        }
        if (typeof lastSavedTitle !== 'undefined' && titleInput) {
            lastSavedTitle = titleInput.value;
        }
        if (typeof lastSavedTags !== 'undefined' && tagsElem) {
            lastSavedTags = tagsElem.value;
        }

        // Clear any stale draft for this note since we just loaded fresh content
        clearDraft(currentNoteId);

        // Remove from refresh list if present
        if (typeof notesNeedingRefresh !== 'undefined') {
            var wasInList = notesNeedingRefresh.has(String(currentNoteId));
            notesNeedingRefresh.delete(String(currentNoteId));
        }

    }
}

// Make functions globally available
window.updateident = updateident;
window.updateidhead = updateidhead;
window.markNoteAsModified = markNoteAsModified;
window.saveNoteImmediately = saveNoteToServer;
window.checkUnsavedBeforeLeaving = checkUnsavedBeforeLeaving;
window.hasUnsavedChanges = hasUnsavedChanges;
window.checkForUnsavedDraft = checkForUnsavedDraft;
window.clearDraft = clearDraft;
window.reinitializeAutoSaveState = reinitializeAutoSaveState;
window.showSaveInProgressNotification = showSaveInProgressNotification;
window.updateConnectionStatus = updateConnectionStatus;
window.setupDragDropEvents = setupDragDropEvents;
window.setupNoteDragDropEvents = setupNoteDragDropEvents;
window.setupLinkEvents = setupLinkEvents;
window.setupFocusEvents = setupFocusEvents;
window.setupAutoSaveCheck = setupAutoSaveCheck;
window.setupPageUnloadWarning = setupPageUnloadWarning;
window.initTextSelectionHandlers = initTextSelectionHandlers;
window.initializeAutoSaveSystem = initializeAutoSaveSystem;
window.convertNoteAudioToIframes = convertNoteAudioToIframes;

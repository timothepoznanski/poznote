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

    // Title field handlers - use delegation to handle all title fields
    document.body.addEventListener('blur', function(e) {
        if (e.target.classList && e.target.classList.contains('css-title')) {
            handleTitleBlur(e);
        }
    }, true); // Use capture phase
    
    document.body.addEventListener('keydown', function(e) {
        if (e.target.classList && e.target.classList.contains('css-title')) {
            handleTitleKeydown(e);
        }
    });

    // Tags field handlers - use delegation
    document.body.addEventListener('keydown', function(e) {
        if (e.target.classList && e.target.classList.contains('tags')) {
            handleTagsKeydown(e);
        }
    });
}

// ============================================================================
// CHECKLIST HANDLERS
// ============================================================================

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
        
        var newItem = document.createElement('li');
        newItem.className = 'checklist-item';
        newItem.innerHTML = '<label><input type="checkbox"><span class="checklist-text">' + textAfter + '</span></label>';
        
        listItem.parentElement.insertBefore(newItem, listItem.nextSibling);
        
        var newTextSpan = newItem.querySelector('.checklist-text');
        newTextSpan.focus();
        setCursorPosition(newTextSpan, 0, false);
        
        triggerNoteSave();
        return;
    }
    
    // Create new empty checklist item
    var newItem = document.createElement('li');
    newItem.className = 'checklist-item';
    newItem.innerHTML = '<label><input type="checkbox"><span class="checklist-text"></span></label>';
    
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
 * Handle Enter key in blockquote - exit blockquote if at end
 * @param {Event} e - The keyboard event
 * @param {Selection} selection - The current selection
 */
function handleBlockquoteEnter(e, selection) {
    if (!selection.rangeCount) return;
    
    var range = selection.getRangeAt(0);
    var blockquote = range.startContainer.nodeType === 3 
        ? range.startContainer.parentElement.closest('blockquote')
        : range.startContainer.closest('blockquote');
    
    if (!blockquote) return;
    
    // Check if cursor is at end of blockquote
    if (isCursorAtEnd(blockquote, selection)) {
        e.preventDefault();
        
        var newPara = document.createElement('div');
        newPara.innerHTML = '<br>';
        blockquote.parentElement.insertBefore(newPara, blockquote.nextSibling);
        
        setCursorPosition(newPara, 0, false);
        triggerNoteSave();
    }
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
 * Handle Enter key in code block - exit block on Enter
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
    
    e.preventDefault();
    
    // Create a new paragraph after the code block
    var newPara = document.createElement('div');
    newPara.innerHTML = '<br>';
    
    pre.parentElement.insertBefore(newPara, pre.nextSibling);
    
    // Move cursor to the new paragraph
    setCursorPosition(newPara, 0, false);
    triggerNoteSave();
}

/**
 * Handle keyboard events in the note entry area
 * @param {Event} e - The keyboard event
 */
function handleNoteEntryKeydown(e) {
    var target = e.target;
    
    if (!target.closest || !target.closest('.noteentry')) return;
    
    // Delegate to checklist handler if in checklist
    if (target.closest('li.checklist-item')) {
        handleChecklistKeydown(e);
        return;
    }
    
    var selection = window.getSelection();
    
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
        
        // Handle Enter key in blockquote
        handleBlockquoteEnter(e, selection);
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
    
    // Skip non-note fields
    if (target.classList.contains('searchbar') ||
        target.id === 'search' ||
        target.classList.contains('searchtrash') ||
        target.classList.contains('one_note_title') ||
        target.classList.contains('css-title') ||
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
    
    attachmentInput.addEventListener('change', function(e) {
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
        // Same workspace - just load the note
        if (typeof window.loadNoteById === 'function') {
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
    document.body.addEventListener('click', function(e) {
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
    
    var isAllowed = allowedDomains.some(function(domain) {
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
    // Detect code editor HTML signatures
    var codeSignatures = [
        'Consolas', 'Monaco', 'Courier New', 'monospace',
        'Segoe UI Mono', 'vscode', 'monaco-editor'
    ];
    
    var isCode = codeSignatures.some(function(sig) {
        return htmlData && htmlData.includes(sig);
    });
    
    if (!isCode) return false;
    
    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;
    
    var range = selection.getRangeAt(0);
    range.deleteContents();
    
    // Split into lines and create monospace structure
    var lines = (plainText || '').split('\n');
    var fragment = document.createDocumentFragment();
    
    lines.forEach(function(line, index) {
        var span = document.createElement('span');
        span.style.fontFamily = '"Segoe UI Mono", "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace';
        span.textContent = line;
        fragment.appendChild(span);
        
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
 * Setup paste event handling for rich text and images
 */
function setupPasteHandling() {
    document.body.addEventListener('paste', function(e) {
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
            setTimeout(function() {
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
    document.body.addEventListener('input', function(e) {
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
    document.body.addEventListener('paste', function(e) {
        var target = e.target;
        
        // Check if pasting into code block
        var codeElement = null;
        if (target.tagName === 'CODE') {
            codeElement = target;
        } else if (target.closest) {
            codeElement = target.closest('code');
        }
        
        if (codeElement && codeElement.className && codeElement.className.includes('language-')) {
            setTimeout(function() {
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
    document.addEventListener('click', function(e) {
        var rightCol = e.target.closest('#right_col');
        if (!rightCol) return;
        
        // Ignore clicks on interactive elements
        if (e.target.closest('button, a, input, select, textarea, [role="button"]')) {
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
    document.body.addEventListener('focusin', function(e) {
        if (e.target.classList.contains('searchbar') ||
            e.target.id === 'search' ||
            e.target.classList.contains('searchtrash')) {
            window.noteid = -1;
        }
    });
    
    setupAutoFocusEmpty();
}

/**
 * Rich Text Editing Module
 * Handles paste events, link management, keyboard shortcuts, and content editing
 */

// Setup all note editing event listeners
function setupNoteEditingEvents() {
    // Setup event delegation on the body for all note-related events
    // This catches dynamically loaded notes without needing to re-attach listeners

    // Input events (typing, paste, etc.)
    document.body.addEventListener('keyup', handleNoteEditEvent);
    document.body.addEventListener('input', handleNoteEditEvent);
    document.body.addEventListener('paste', handleNoteEditEvent);
    document.body.addEventListener('change', handleNoteEditEvent);

    // Keyboard shortcuts
    document.body.addEventListener('keydown', handleNoteentryKeydown);

    // Title and tags specific handlers
    var titleField = document.querySelector('.one_note_title');
    if (titleField) {
        titleField.addEventListener('blur', handleTitleBlur);
        titleField.addEventListener('keydown', handleTitleKeydown);
    }

    var tagsField = document.querySelector('.tags');
    if (tagsField) {
        tagsField.addEventListener('keydown', handleTagsKeydown);
    }
}

// Handle keydown events in checklists for navigation and merging
function handleChecklistKeydown(e) {
    var target = e.target;

    // Only handle if we're inside a checklist item
    if (!target.closest || !target.closest('li.checklist-item')) {
        return;
    }

    var listItem = target.closest('li.checklist-item');
    var checkboxLabel = listItem.querySelector('label');
    var textSpan = checkboxLabel ? checkboxLabel.querySelector('.checklist-text') : null;

    if (!textSpan) return;

    // Enter key - insert new checklist item or exit checklist
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        var cursorAtEnd = false;
        var selection = window.getSelection();
        if (selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            // Check if cursor is at the end of the text span
            var tempRange = range.cloneRange();
            tempRange.selectNodeContents(textSpan);
            tempRange.setStart(range.endContainer, range.endOffset);
            cursorAtEnd = tempRange.toString().length === 0;
        }

        // If item is empty, exit checklist mode
        if (textSpan.textContent.trim() === '') {
            // Remove empty checklist item
            var parentList = listItem.parentElement;
            listItem.remove();

            // Insert new paragraph after the list
            var newPara = document.createElement('div');
            newPara.innerHTML = '<br>';

            // Insert after the parent list
            if (parentList.parentElement) {
                parentList.parentElement.insertBefore(newPara, parentList.nextSibling);

                // Move cursor to the new paragraph
                var range = document.createRange();
                var sel = window.getSelection();
                range.setStart(newPara, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }

            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
            return;
        }

        // Split text at cursor if cursor is in the middle
        if (!cursorAtEnd && selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            
            // Get text before and after cursor
            var beforeRange = document.createRange();
            beforeRange.setStart(textSpan, 0);
            beforeRange.setEnd(range.startContainer, range.startOffset);
            var textBefore = beforeRange.toString();

            var afterRange = document.createRange();
            afterRange.setStart(range.startContainer, range.startOffset);
            afterRange.setEnd(textSpan, textSpan.childNodes.length);
            var textAfter = afterRange.toString();

            // Update current item with text before cursor
            textSpan.textContent = textBefore;

            // Create new item with text after cursor
            var newItem = document.createElement('li');
            newItem.className = 'checklist-item';
            newItem.innerHTML = '<label><input type="checkbox"><span class="checklist-text">' + textAfter + '</span></label>';

            listItem.parentElement.insertBefore(newItem, listItem.nextSibling);

            // Focus the new item and place cursor at start
            var newTextSpan = newItem.querySelector('.checklist-text');
            var newRange = document.createRange();
            var newSel = window.getSelection();
            newRange.setStart(newTextSpan, 0);
            newRange.collapse(true);
            newSel.removeAllRanges();
            newSel.addRange(newRange);

            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
            return;
        }

        // Create new checklist item after current
        var newItem = document.createElement('li');
        newItem.className = 'checklist-item';
        newItem.innerHTML = '<label><input type="checkbox"><span class="checklist-text"></span></label>';

        listItem.parentElement.insertBefore(newItem, listItem.nextSibling);

        // Focus the new item
        var newTextSpan = newItem.querySelector('.checklist-text');
        newTextSpan.focus();

        // Place cursor at the start
        var range = document.createRange();
        var sel = window.getSelection();
        range.setStart(newTextSpan, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }

    // Backspace - merge with previous item if at start
    else if (e.key === 'Backspace') {
        var selection = window.getSelection();
        if (selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            
            // Check if cursor is at the very start
            if (range.startOffset === 0 && range.endOffset === 0) {
                var previousItem = listItem.previousElementSibling;

                if (previousItem && previousItem.classList.contains('checklist-item')) {
                    e.preventDefault();

                    // Get text from current item
                    var currentText = textSpan.textContent;

                    // Get previous item's text span
                    var prevLabel = previousItem.querySelector('label');
                    var prevTextSpan = prevLabel ? prevLabel.querySelector('.checklist-text') : null;

                    if (prevTextSpan) {
                        // Merge texts
                        var mergedText = prevTextSpan.textContent + currentText;
                        prevTextSpan.textContent = mergedText;

                        // Remove current item
                        listItem.remove();

                        // Focus previous item at merge point
                        prevTextSpan.focus();
                        var newRange = document.createRange();
                        var newSel = window.getSelection();
                        
                        // Place cursor at the merge point (end of original previous text)
                        var mergeOffset = prevTextSpan.textContent.length - currentText.length;
                        if (prevTextSpan.firstChild) {
                            newRange.setStart(prevTextSpan.firstChild, mergeOffset);
                            newRange.collapse(true);
                            newSel.removeAllRanges();
                            newSel.addRange(newRange);
                        }

                        if (typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }
                    }
                } else if (textSpan.textContent.trim() === '') {
                    // First item and empty - just delete it
                    e.preventDefault();
                    listItem.remove();

                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }
                }
            }
        }
    }

    // Arrow Up - move to previous checklist item
    else if (e.key === 'ArrowUp') {
        var previousItem = listItem.previousElementSibling;
        if (previousItem && previousItem.classList.contains('checklist-item')) {
            e.preventDefault();
            var prevLabel = previousItem.querySelector('label');
            var prevTextSpan = prevLabel ? prevLabel.querySelector('.checklist-text') : null;
            if (prevTextSpan) {
                prevTextSpan.focus();
                
                // Place cursor at end
                var range = document.createRange();
                var sel = window.getSelection();
                range.selectNodeContents(prevTextSpan);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }

    // Arrow Down - move to next checklist item
    else if (e.key === 'ArrowDown') {
        var nextItem = listItem.nextElementSibling;
        if (nextItem && nextItem.classList.contains('checklist-item')) {
            e.preventDefault();
            var nextLabel = nextItem.querySelector('label');
            var nextTextSpan = nextLabel ? nextLabel.querySelector('.checklist-text') : null;
            if (nextTextSpan) {
                nextTextSpan.focus();
                
                // Place cursor at start
                var range = document.createRange();
                var sel = window.getSelection();
                range.setStart(nextTextSpan, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
    }
}

// Handle keydown events in the note entry area
function handleNoteentryKeydown(e) {
    var target = e.target;

    // Skip if not in a note entry
    if (!target.closest || !target.closest('.noteentry')) {
        return;
    }

    // Handle checklist keyboard navigation
    if (target.closest('li.checklist-item')) {
        handleChecklistKeydown(e);
        return;
    }

    // Escape from blockquote with Enter key
    if (e.key === 'Enter' && !e.shiftKey) {
        var selection = window.getSelection();
        if (selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            var blockquote = range.startContainer.nodeType === 3 
                ? range.startContainer.parentElement.closest('blockquote')
                : range.startContainer.closest('blockquote');

            if (blockquote) {
                // Check if we're at the end of the blockquote
                var tempRange = range.cloneRange();
                tempRange.selectNodeContents(blockquote);
                tempRange.setStart(range.endContainer, range.endOffset);
                var textAfterCursor = tempRange.toString().trim();

                if (textAfterCursor === '') {
                    e.preventDefault();

                    // Create new paragraph after blockquote
                    var newPara = document.createElement('div');
                    newPara.innerHTML = '<br>';

                    blockquote.parentElement.insertBefore(newPara, blockquote.nextSibling);

                    // Move cursor to new paragraph
                    var newRange = document.createRange();
                    var newSel = window.getSelection();
                    newRange.setStart(newPara, 0);
                    newRange.collapse(true);
                    newSel.removeAllRanges();
                    newSel.addRange(newRange);

                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }
                }
            }
        }
    }

    // Arrow key navigation from noteentry to checklist
    if (e.key === 'ArrowDown') {
        var noteentry = target.closest('.noteentry');
        if (noteentry) {
            // Check if cursor is at the very end of noteentry
            var selection = window.getSelection();
            if (selection.rangeCount > 0) {
                var range = selection.getRangeAt(0);
                var tempRange = range.cloneRange();
                tempRange.selectNodeContents(noteentry);
                tempRange.setStart(range.endContainer, range.endOffset);
                var textAfter = tempRange.toString();

                if (textAfter.trim() === '') {
                    // Find next checklist
                    var notecard = noteentry.closest('.notecard');
                    if (notecard) {
                        var firstChecklistItem = notecard.querySelector('li.checklist-item');
                        if (firstChecklistItem) {
                            e.preventDefault();
                            var textSpan = firstChecklistItem.querySelector('.checklist-text');
                            if (textSpan) {
                                textSpan.focus();
                                
                                // Place cursor at start
                                var newRange = document.createRange();
                                var newSel = window.getSelection();
                                newRange.setStart(textSpan, 0);
                                newRange.collapse(true);
                                newSel.removeAllRanges();
                                newSel.addRange(newRange);
                            }
                        }
                    }
                }
            }
        }
    }
}

// Handle input events in note content
function handleNoteEditEvent(e) {
    var target = e.target;

    // For searches or non-note fields
    if (target.classList.contains('searchbar') ||
        target.id === 'search' ||
        target.classList.contains('searchtrash') ||
        target.classList.contains('one_note_title') ||
        target.classList.contains('tags')) {
        return;
    }

    // Update noteid from noteentry
    if (target.classList.contains('noteentry')) {
        var noteIdFromEntry = window.extractNoteIdFromEntry ? window.extractNoteIdFromEntry(target) : null;
        if (noteIdFromEntry) {
            window.noteid = noteIdFromEntry;
        }

        // Mark as modified
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }
}

// Handle tags input with space separator
function handleTagsKeydown(e) {
    if (e.key === ' ') {
        e.preventDefault();
        var input = e.target;
        var currentValue = input.value;
        
        // Add comma separator instead of space
        input.value = currentValue + ', ';
        
        // Trigger save
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }
}

// Save immediately when title loses focus
function handleTitleBlur(e) {
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }
}

// Handle title field keyboard shortcuts
function handleTitleKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        
        // Move focus to note content
        var noteentry = document.querySelector('.noteentry');
        if (noteentry) {
            noteentry.focus();
        }
    } else if (e.key === 'Escape') {
        e.target.blur();
    }
}

// Setup attachment file input events
function setupAttachmentEvents() {
    var attachmentInput = document.getElementById('attachment_input');
    if (attachmentInput) {
        attachmentInput.addEventListener('change', function(e) {
            var files = e.target.files;
            if (files && files.length > 0) {
                // Trigger attachment upload
                if (typeof handleImageFilesAndInsert === 'function') {
                    handleImageFilesAndInsert(files);
                }
                
                // Reset input
                e.target.value = '';
            }
        });
    }
}

// Setup link click handling and paste management
function setupLinkEvents() {
    // Handle link clicks in notes
    document.body.addEventListener('click', function (e) {
        if (e.target.tagName === 'A' && e.target.closest('.noteentry')) {
            e.preventDefault();

            // Check if user has selected text within the link
            var selection = window.getSelection();
            var hasSelection = false;

            if (selection && !selection.isCollapsed) {
                var range = selection.getRangeAt(0);
                var selectedText = range.toString();
                
                // Check if the selection is actually within this link
                if (selectedText.length > 0 && range.intersectsNode(e.target)) {
                    hasSelection = true;
                }
            }

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
                    if (typeof loadNoteById === 'function') {
                        loadNoteById(targetNoteId);
                    }
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

// Setup focus management and auto-focus for empty notes
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
                const noteIdFromEntry = window.extractNoteIdFromEntry ? window.extractNoteIdFromEntry(noteEntry) : null;
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

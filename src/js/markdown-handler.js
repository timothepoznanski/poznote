// Markdown handler for Poznote
// Simple markdown parser and renderer

// Helper function to normalize content from contentEditable
function normalizeContentEditableText(element) {
    // More robust content extraction that handles contentEditable quirks
    var content = '';
    
    // Try to walk through the DOM structure to better preserve formatting
    if (element.childNodes.length > 0) {
        var parts = [];
        for (var i = 0; i < element.childNodes.length; i++) {
            var node = element.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                parts.push(node.textContent);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'DIV') {
                    // DIV usually represents a line
                    var divText = node.textContent || '';
                    if (divText === '' && node.querySelector('br')) {
                        // Empty div with BR = empty line
                        parts.push('');
                    } else {
                        parts.push(divText);
                    }
                } else if (node.tagName === 'BR') {
                    // BR = line break
                    parts.push('');
                } else {
                    // Other elements, get their text content
                    parts.push(node.textContent || '');
                }
            }
        }
        content = parts.join('\n');
    } else {
        // Fallback to innerText/textContent
        content = element.innerText || element.textContent || '';
    }
    
    // Handle different line ending styles
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Fix excessive blank lines (but preserve intentional double line breaks)
    // Replace 3+ consecutive newlines with exactly 2 newlines
    content = content.replace(/\n{3,}/g, '\n\n');
    
    // Remove trailing newlines (but preserve intentional spacing)
    content = content.replace(/\n+$/, '');
    
    return content;
}

function parseMarkdown(text) {
    if (!text) return '';
    
    // First, extract and protect images and links from HTML escaping
    // We'll use placeholders and restore them later
    let protectedElements = [];
    let protectedIndex = 0;
    
    // Protect images first ![alt](url "title")
    text = text.replace(/!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, function(match, alt, url, title) {
        let placeholder = '\x00PIMG' + protectedIndex + '\x00';
        let imgTag;
        if (title) {
            imgTag = '<img src="' + url + '" alt="' + alt + '" title="' + title + '">';
        } else {
            imgTag = '<img src="' + url + '" alt="' + alt + '">';
        }
        protectedElements[protectedIndex] = imgTag;
        protectedIndex++;
        return placeholder;
    });
    
    // Protect links [text](url "title")
    text = text.replace(/\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, function(match, linkText, url, title) {
        let placeholder = '\x00PLNK' + protectedIndex + '\x00';
        let linkTag;
        if (title) {
            linkTag = '<a href="' + url + '" title="' + title + '" target="_blank" rel="noopener">' + linkText + '</a>';
        } else {
            linkTag = '<a href="' + url + '" target="_blank" rel="noopener">' + linkText + '</a>';
        }
        protectedElements[protectedIndex] = linkTag;
        protectedIndex++;
        return placeholder;
    });
    
    // Now escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Helper function to apply inline styles (bold, italic, code, etc.)
    function applyInlineStyles(text) {
        // First, protect inline code content from other replacements
        let protectedCode = [];
        let codeIndex = 0;
        text = text.replace(/`([^`]+)`/g, function(match, code) {
            let placeholder = '\x00CODE' + codeIndex + '\x00';
            protectedCode[codeIndex] = '<code>' + code + '</code>';
            codeIndex++;
            return placeholder;
        });
        
        // Handle angle bracket URLs <https://example.com>
        text = text.replace(/&lt;(https?:\/\/[^\s&gt;]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        // Bold and italic
        text = text.replace(/\*\*\*([^\*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
        text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // Strikethrough
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        
        // Restore protected code elements
        text = text.replace(/\x00CODE(\d+)\x00/g, function(match, index) {
            return protectedCode[parseInt(index)] || match;
        });
        
        // Restore protected elements (images and links)
        text = text.replace(/\x00P(IMG|LNK)(\d+)\x00/g, function(match, type, index) {
            return protectedElements[parseInt(index)] || match;
        });
        
        return text;
    }
    
    // Process line by line for block-level elements
    let lines = html.split('\n');
    let result = [];
    let currentParagraph = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockContent = [];
    
    function flushParagraph() {
        if (currentParagraph.length > 0) {
            // Process line breaks according to GitHub Flavored Markdown rules:
            // - Single line breaks become <br> (visible line breaks)
            // - Lines ending with 2+ spaces also become <br> (redundant but consistent)
            let processedLines = [];
            for (let i = 0; i < currentParagraph.length; i++) {
                let line = currentParagraph[i];
                if (i < currentParagraph.length - 1) {
                    // Check if line ends with 2+ spaces (remove trailing spaces, add <br>)
                    if (line.match(/\s{2,}$/)) {
                        processedLines.push(line.replace(/\s{2,}$/, '') + '<br>');
                    } else {
                        // GitHub style: single line breaks become <br>
                        processedLines.push(line + '<br>');
                    }
                } else {
                    // Last line - no <br> needed
                    processedLines.push(line);
                }
            }
            let para = processedLines.join('');
            para = applyInlineStyles(para);
            result.push('<p>' + para + '</p>');
            currentParagraph = [];
        }
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Handle code blocks
        if (line.match(/^```/)) {
            flushParagraph();
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLang = line.replace(/^```/, '').trim();
                codeBlockContent = [];
            } else {
                inCodeBlock = false;
                let codeContent = codeBlockContent.join('\n');
                result.push('<pre><code class="language-' + (codeBlockLang || 'text') + '">' + codeContent + '</code></pre>');
                codeBlockContent = [];
                codeBlockLang = '';
            }
            continue;
        }
        
        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }
        
        // Empty line - paragraph separator
        if (line.trim() === '') {
            flushParagraph();
            continue;
        }
        
        // Headers
        if (line.match(/^######\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^######\s+(.+)$/, function(match, content) {
                return '<h6>' + applyInlineStyles(content) + '</h6>';
            }));
            continue;
        }
        if (line.match(/^#####\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^#####\s+(.+)$/, function(match, content) {
                return '<h5>' + applyInlineStyles(content) + '</h5>';
            }));
            continue;
        }
        if (line.match(/^####\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^####\s+(.+)$/, function(match, content) {
                return '<h4>' + applyInlineStyles(content) + '</h4>';
            }));
            continue;
        }
        if (line.match(/^###\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^###\s+(.+)$/, function(match, content) {
                return '<h3>' + applyInlineStyles(content) + '</h3>';
            }));
            continue;
        }
        if (line.match(/^##\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^##\s+(.+)$/, function(match, content) {
                return '<h2>' + applyInlineStyles(content) + '</h2>';
            }));
            continue;
        }
        if (line.match(/^#\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^#\s+(.+)$/, function(match, content) {
                return '<h1>' + applyInlineStyles(content) + '</h1>';
            }));
            continue;
        }
        
        // Horizontal rules - allow spaces and require at least 3 characters
        if (line.trim().match(/^(\*{3,}|-{3,}|_{3,})$/)) {
            flushParagraph();
            result.push('<hr>');
            continue;
        }
        
        // Blockquotes - handle both escaped and unescaped
        if (line.match(/^(&gt;|>)\s*(.*)$/)) {
            flushParagraph();
            let quoteContent = line.replace(/^(&gt;|>)\s*(.*)$/, '$2');
            result.push('<blockquote>' + applyInlineStyles(quoteContent) + '</blockquote>');
            continue;
        }
        
        // Helper function to parse nested lists
        function parseNestedList(startIndex, isTaskList = false) {
            let listItems = [];
            let currentIndex = startIndex;
            
            while (currentIndex < lines.length) {
                let currentLine = lines[currentIndex];
                
                // Check if this is a list item
                let listMatch;
                if (isTaskList) {
                    listMatch = currentLine.match(/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/);
                } else {
                    listMatch = currentLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                }
                
                if (!listMatch) {
                    break; // Not a list item, end of list
                }
                
                let indent = listMatch[1].length;
                let content = isTaskList ? listMatch[3] : listMatch[3];
                
                // If this is the first item, set the base indentation
                if (listItems.length === 0) {
                    var baseIndent = indent;
                }
                
                if (indent === baseIndent) {
                    // Same level item
                    let itemHtml;
                    if (isTaskList) {
                        let isChecked = listMatch[2].toLowerCase() === 'x';
                        let checkbox = '<input type="checkbox" ' + (isChecked ? 'checked ' : '') + 'disabled>';
                        itemHtml = '<li class="task-list-item">' + checkbox + ' ' + applyInlineStyles(content);
                    } else {
                        itemHtml = '<li>' + applyInlineStyles(content);
                    }
                    
                    // Check if next items are more indented (nested)
                    let nextIndex = currentIndex + 1;
                    if (nextIndex < lines.length) {
                        let nextLine = lines[nextIndex];
                        let nextMatch;
                        if (isTaskList) {
                            nextMatch = nextLine.match(/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/);
                        } else {
                            nextMatch = nextLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                        }
                        
                        if (nextMatch && nextMatch[1].length > indent) {
                            // Parse nested list
                            let nestedResult = parseNestedList(nextIndex, isTaskList);
                            let isOrderedNested = !isTaskList && nextMatch[2].match(/\d+\./);
                            let listTag = isOrderedNested ? 'ol' : 'ul';
                            let listClass = isTaskList ? ' class="task-list"' : '';
                            itemHtml += '<' + listTag + listClass + '>' + nestedResult.items.join('') + '</' + listTag + '>';
                            currentIndex = nestedResult.endIndex;
                        }
                    }
                    
                    itemHtml += '</li>';
                    listItems.push(itemHtml);
                } else if (indent < baseIndent) {
                    // Less indented, end of current list
                    break;
                } else {
                    // This shouldn't happen if we're parsing correctly
                    break;
                }
                
                currentIndex++;
            }
            
            return {
                items: listItems,
                endIndex: currentIndex - 1
            };
        }
        
        // Task lists (checkboxes) - must be checked before unordered lists
        if (line.match(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, true);
            result.push('<ul class="task-list">' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }
        
        // Unordered lists
        if (line.match(/^\s*[\*\-\+]\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, false);
            result.push('<ul>' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }
        
        // Ordered lists
        if (line.match(/^\s*\d+\.\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, false);
            result.push('<ol>' + listResult.items.join('') + '</ol>');
            i = listResult.endIndex;
            continue;
        }
        
        // Tables - detect table rows (lines with | separators)
        if (line.match(/^\s*\|.+\|\s*$/)) {
            flushParagraph();
            
            let tableRows = [];
            let isFirstRow = true;
            let hasHeaderSeparator = false;
            
            // Collect all consecutive table rows
            while (i < lines.length && lines[i].match(/^\s*\|.+\|\s*$/)) {
                let currentLine = lines[i].trim();
                
                // Check if this is a header separator line (|---|---|)
                if (currentLine.match(/^\|[\s\-:|]+\|$/)) {
                    hasHeaderSeparator = true;
                    i++;
                    continue;
                }
                
                // Parse table cells
                let cells = currentLine
                    .split('|')
                    .slice(1, -1) // Remove first and last empty elements
                    .map(cell => cell.trim());
                
                tableRows.push({
                    cells: cells,
                    isHeader: isFirstRow && !hasHeaderSeparator
                });
                
                if (isFirstRow) {
                    isFirstRow = false;
                }
                
                i++;
            }
            i--; // Adjust because the for loop will increment
            
            // Generate HTML table
            if (tableRows.length > 0) {
                let tableHTML = '<table>';
                let hasHeader = hasHeaderSeparator || tableRows[0].isHeader;
                
                // Process rows
                for (let r = 0; r < tableRows.length; r++) {
                    let row = tableRows[r];
                    let isHeaderRow = (r === 0 && hasHeader);
                    let cellTag = isHeaderRow ? 'th' : 'td';
                    
                    tableHTML += '<tr>';
                    for (let c = 0; c < row.cells.length; c++) {
                        let cellContent = applyInlineStyles(row.cells[c]);
                        tableHTML += '<' + cellTag + '>' + cellContent + '</' + cellTag + '>';
                    }
                    tableHTML += '</tr>';
                }
                
                tableHTML += '</table>';
                result.push(tableHTML);
            }
            continue;
        }
        
        // Regular text - add to current paragraph
        currentParagraph.push(line);
    }
    
    // Flush any remaining paragraph
    flushParagraph();
    
    // Handle unclosed code block
    if (inCodeBlock && codeBlockContent.length > 0) {
        let codeContent = codeBlockContent.join('\n');
        result.push('<pre><code class="language-' + (codeBlockLang || 'text') + '">' + codeContent + '</code></pre>');
    }
    
    return result.join('\n');
}

/**
 * Initialize markdown note functionality
 */
function initializeMarkdownNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') {
        return;
    }
    
    // Check for corrupted content (both editor and preview elements present)
    var existingEditor = noteEntry.querySelector('.markdown-editor');
    var existingPreview = noteEntry.querySelector('.markdown-preview');
    
    // Also check for escaped HTML content that contains editor/preview elements
    var htmlContent = noteEntry.innerHTML;
    var hasEscapedEditor = htmlContent.includes('&lt;div class="markdown-editor"');
    var hasEscapedPreview = htmlContent.includes('&lt;div class="markdown-preview"');
    
    // Declare markdownContent variable once
    var markdownContent = '';
    
    // Only treat as corrupted if we have ESCAPED HTML (not real elements)
    if (hasEscapedEditor && hasEscapedPreview) {
        var cleanContent = '';
        
        // Extract content from escaped HTML
        // Look for the content between the escaped editor tags
        var editorMatch = htmlContent.match(/&lt;div class="markdown-editor"[^&]*&gt;([^&]*?)&lt;\/div&gt;/);
        if (editorMatch) {
            cleanContent = editorMatch[1];
            // Decode any HTML entities in the content
            var tempDiv = document.createElement('div');
            tempDiv.innerHTML = cleanContent;
            cleanContent = tempDiv.textContent || tempDiv.innerText || '';
        }
        
        // Clear the corrupted HTML and restore clean content
        noteEntry.innerHTML = '';
        noteEntry.textContent = cleanContent;
        
        // Update the data attribute with clean content
        noteEntry.setAttribute('data-markdown-content', cleanContent);
        
        // Use the clean content for initialization
        markdownContent = cleanContent;
    } else if (existingEditor && existingPreview) {
        // Real markdown elements exist - extract content and re-initialize
        
        // Extract the markdown content from the existing editor
        markdownContent = normalizeContentEditableText(existingEditor);
        
        // Store in data attribute
        noteEntry.setAttribute('data-markdown-content', markdownContent);
        
        // Clear existing elements to re-initialize cleanly
        noteEntry.innerHTML = '';
        noteEntry.textContent = markdownContent;
    } else {
        // No existing elements - get content from data attribute or text
        markdownContent = noteEntry.getAttribute('data-markdown-content') || noteEntry.textContent || '';
    }
    
    // Store the original markdown in a data attribute
    if (!noteEntry.getAttribute('data-markdown-content')) {
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    }
    
    // Try to restore saved view mode (global for all notes)
    var savedMode = null;
    try {
        savedMode = localStorage.getItem('poznote-markdown-view-mode');
    } catch (e) {
        console.warn('Could not read view mode from localStorage:', e);
    }
    
    // Determine initial mode: edit or preview
    var isEmpty = markdownContent.trim() === '';
    var startInEditMode;
    
    // Always start in edit mode for empty notes (new notes)
    if (isEmpty) {
        startInEditMode = true;
    } else if (savedMode && (savedMode === 'edit' || savedMode === 'preview')) {
        startInEditMode = (savedMode === 'edit');
    } else {
        // Default: preview mode if content exists
        startInEditMode = false;
    }
    
    // Create preview and editor containers
    var previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    // Set preview content or placeholder if empty
    if (isEmpty) {
        previewDiv.innerHTML = '<div class="markdown-preview-placeholder">You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.</div>';
        previewDiv.classList.add('empty');
    } else {
        previewDiv.innerHTML = parseMarkdown(markdownContent);
        previewDiv.classList.remove('empty');
    }
    
    // Create container for editor
    var editorContainer = document.createElement('div');
    editorContainer.className = 'markdown-editor-container';
    
    var editorDiv = document.createElement('div');
    editorDiv.className = 'markdown-editor';
    editorDiv.contentEditable = true;
    editorDiv.textContent = markdownContent;
    editorDiv.setAttribute('data-ph', 'Write your markdown here...');
    
    editorContainer.appendChild(editorDiv);
    
    // Ensure proper line break handling in contentEditable
    editorDiv.style.whiteSpace = 'pre-wrap';
    
    // Set initial display states using setProperty to override any CSS !important rules
    if (startInEditMode) {
        // Edit mode: show editor, hide preview
        editorContainer.style.setProperty('display', 'flex', 'important');
        previewDiv.style.setProperty('display', 'none', 'important');
    } else {
        // Preview mode: show preview, hide editor
        editorContainer.style.setProperty('display', 'none', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
    }
    
    // Replace note content with preview and editor
    noteEntry.innerHTML = '';
    noteEntry.appendChild(editorContainer);
    noteEntry.appendChild(previewDiv);
    noteEntry.contentEditable = false;
    
    var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
    if (toolbar) {
        // Hide separator button for markdown notes
        var separatorBtn = toolbar.querySelector('.btn-separator');
        if (separatorBtn) {
            separatorBtn.style.display = 'none';
        }
        
        // Check if view mode toggle button already exists, if not create it
        var existingViewModeBtn = toolbar.querySelector('.markdown-view-mode-btn');
        if (!existingViewModeBtn) {
            // Create unified view mode toggle button that cycles through: Edit -> Preview
            var viewModeBtn = document.createElement('button');
            viewModeBtn.type = 'button';
            viewModeBtn.className = 'toolbar-btn markdown-view-mode-btn note-action-btn';
            
            // Determine current view mode and set icon/title
            var currentMode;
            if (startInEditMode) {
                currentMode = 'edit';
                viewModeBtn.innerHTML = '<i class="fa-eye"></i>';
                viewModeBtn.title = 'Switch to preview mode';
            } else {
                currentMode = 'preview';
                viewModeBtn.innerHTML = '<i class="fa-markdown"></i>';
                viewModeBtn.title = 'witch to edit mode';
            }
            
            viewModeBtn.setAttribute('data-current-mode', currentMode);
            
            viewModeBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                toggleMarkdownMode(noteId);
            };
            
            toolbar.insertBefore(viewModeBtn, toolbar.firstChild);
            
            // Create markdown help button
            var helpBtn = document.createElement('button');
            helpBtn.type = 'button';
            helpBtn.className = 'toolbar-btn markdown-help-btn note-action-btn';
            helpBtn.innerHTML = '<i class="fa-question-circle"></i>';
            helpBtn.title = 'Markdown Guide';
            helpBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                window.open('markdown_guide.php', '_blank');
            };
            
            // Insert help button right after the view mode button
            if (viewModeBtn.nextSibling) {
                toolbar.insertBefore(helpBtn, viewModeBtn.nextSibling);
            } else {
                toolbar.appendChild(helpBtn);
            }
        } else {
            // Update existing button based on current state
            var currentMode;
            if (startInEditMode) {
                currentMode = 'edit';
                existingViewModeBtn.innerHTML = '<i class="fa-eye"></i>';
                existingViewModeBtn.title = 'Switch to preview mode';
                existingViewModeBtn.classList.remove('active');
            } else {
                currentMode = 'preview';
                existingViewModeBtn.innerHTML = '<i class="fa-markdown"></i>';
                existingViewModeBtn.title = 'Switch to edit mode';
                existingViewModeBtn.classList.remove('active');
            }
            existingViewModeBtn.setAttribute('data-current-mode', currentMode);
        }
    }
    
    // Setup event listeners for the editor
    setupMarkdownEditorListeners(noteId);
    
    // Set the global noteid
    noteid = noteId;
    window.noteid = noteId;
}

function switchToEditMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');
    
    if (!previewDiv || !editorDiv) return;
    
    // Save the scroll position ratio BEFORE hiding preview
    var previewScrollTop = previewDiv.scrollTop;
    var previewScrollHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
    var scrollRatio = previewScrollHeight > 0 ? previewScrollTop / previewScrollHeight : 0;
    
    // Switch to edit mode - use setProperty to override !important rules
    previewDiv.style.setProperty('display', 'none', 'important');
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'block', 'important');
    } else {
        editorDiv.style.setProperty('display', 'block', 'important');
    }
    
    // Restore scroll position in editor using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            setTimeout(function() {
                var editorScrollHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
                if (editorScrollHeight > 0) {
                    editorDiv.scrollTop = scrollRatio * editorScrollHeight;
                } else {
                    editorDiv.scrollTop = 0;
                }
            }, 50);
        });
    });
    
    // Show preview button, hide edit button (legacy support)
    if (editBtn) editBtn.style.display = 'none';
    if (previewBtn) previewBtn.style.display = '';
    
    // Update view mode button
    updateViewModeButton(noteId, 'edit');
    
    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'edit');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }
}

function switchToPreviewMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');
    
    if (!previewDiv || !editorDiv) return;
    
    // Save the scroll position ratio BEFORE switching
    var editorScrollTop = editorDiv.scrollTop;
    var editorScrollHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
    var scrollRatio = editorScrollHeight > 0 ? editorScrollTop / editorScrollHeight : 0;
    
    // Switch to preview mode
    // Use helper function to properly normalize content
    var markdownContent = normalizeContentEditableText(editorDiv);
    var isEmpty = markdownContent.trim() === '';
    
    if (isEmpty) {
        previewDiv.innerHTML = '<div class="markdown-preview-placeholder">You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.</div>';
        previewDiv.classList.add('empty');
    } else {
        previewDiv.innerHTML = parseMarkdown(markdownContent);
        previewDiv.classList.remove('empty');
    }
    
    noteEntry.setAttribute('data-markdown-content', markdownContent);
    
    // Use setProperty to override !important rules
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'none', 'important');
    } else {
        editorDiv.style.setProperty('display', 'none', 'important');
    }
    previewDiv.style.setProperty('display', 'block', 'important');
    
    // Restore scroll position in preview using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            setTimeout(function() {
                var previewScrollHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
                if (previewScrollHeight > 0) {
                    previewDiv.scrollTop = scrollRatio * previewScrollHeight;
                } else {
                    previewDiv.scrollTop = 0;
                }
            }, 50);
        });
    });
    
    // Show edit button, hide preview button (legacy support)
    if (editBtn) editBtn.style.display = '';
    if (previewBtn) previewBtn.style.display = 'none';
    
    // Update view mode button
    updateViewModeButton(noteId, 'preview');
    
    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'preview');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }
    
    // Check if content has actually changed before triggering save
    var previousContent = noteEntry.getAttribute('data-markdown-content') || '';
    var currentContent = markdownContent;
    
    // Only mark as edited and trigger save if content has changed
    if (previousContent !== currentContent) {
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }
}

function toggleMarkdownMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    
    if (!previewDiv || !editorDiv) return;
    
    // Check which element is visible: editor container or preview
    var elementToCheck = editorContainer || editorDiv;
    var isPreviewMode = window.getComputedStyle(elementToCheck).display === 'none';
    
    if (isPreviewMode) {
        switchToEditMode(noteId);
    } else {
        switchToPreviewMode(noteId);
    }
}

// Override the global getMarkdownContent to be accessible
function getMarkdownContentForNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';
    
    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') return null;
    
    // Check if we're in edit mode or preview mode
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv && editorDiv.style.display !== 'none') {
        // In edit mode, get content from editor
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }
    
    // In preview mode, get from data attribute
    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Listen to input events in markdown editor to mark note as edited
function setupMarkdownEditorListeners(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return;
    
    // Get the scrollable parent container
    var scrollContainer = document.getElementById('right_col');
    var preventScroll = false;
    var savedScrollTop = 0;
    
    // Set noteid on focus (like normal notes)
    editorDiv.addEventListener('focus', function() {
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        // Also set it globally for compatibility
        window.noteid = noteId;
    });
    
    // Before keydown, save scroll position
    editorDiv.addEventListener('keydown', function(e) {
        if (scrollContainer) {
            savedScrollTop = scrollContainer.scrollTop;
            preventScroll = true;
            
            // After a short delay, stop preventing scroll
            setTimeout(function() {
                preventScroll = false;
            }, 100);
        }
    });
    
    // Prevent unwanted scroll during input
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', function(e) {
            if (preventScroll) {
                // Restore the scroll position
                scrollContainer.scrollTop = savedScrollTop;
            }
        }, { passive: false });
    }
    
    editorDiv.addEventListener('input', function() {
        // Update the data attribute with current content
        // Use helper function to properly normalize content
        var content = normalizeContentEditableText(editorDiv);
        noteEntry.setAttribute('data-markdown-content', content);
        
        // Make sure noteid is set
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        window.noteid = noteId;
        
        // Mark as edited
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    });
}

// Save markdown content when updating note
function getMarkdownContent(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';
    
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv) {
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }
    
    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Helper function to update view mode button icon and title
function updateViewModeButton(noteId, mode) {
    var viewModeBtn = document.querySelector('#note' + noteId + ' .markdown-view-mode-btn');
    if (!viewModeBtn) return;
    
    viewModeBtn.setAttribute('data-current-mode', mode);
    
    if (mode === 'edit') {
        viewModeBtn.innerHTML = '<i class="fa-eye"></i>';
        viewModeBtn.title = 'Switch to preview mode';
        viewModeBtn.classList.remove('active');
    } else if (mode === 'preview') {
        viewModeBtn.innerHTML = '<i class="fa-markdown"></i>';
        viewModeBtn.title = 'Switch to edit mode';
        viewModeBtn.classList.remove('active');
    }
}

// Make functions globally available
window.initializeMarkdownNote = initializeMarkdownNote;
window.toggleMarkdownMode = toggleMarkdownMode;
window.switchToEditMode = switchToEditMode;
window.switchToPreviewMode = switchToPreviewMode;
window.getMarkdownContent = getMarkdownContent;
window.getMarkdownContentForNote = getMarkdownContentForNote;
window.parseMarkdown = parseMarkdown;
window.setupMarkdownEditorListeners = setupMarkdownEditorListeners;
window.updateViewModeButton = updateViewModeButton;

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
        // Inline code (must be first to protect code content from other replacements)
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold and italic
        text = text.replace(/\*\*\*([^\*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
        text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
        
        // Strikethrough
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        
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
        
        // Horizontal rules
        if (line.match(/^(\*\*\*+|---+|___+)$/)) {
            flushParagraph();
            result.push('<hr>');
            continue;
        }
        
        // Blockquotes
        if (line.match(/^&gt;\s+(.+)$/)) {
            flushParagraph();
            result.push(line.replace(/^&gt;\s+(.+)$/, function(match, content) {
                return '<blockquote>' + applyInlineStyles(content) + '</blockquote>';
            }));
            continue;
        }
        
        // Task lists (checkboxes) - must be checked before unordered lists
        if (line.match(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/)) {
            flushParagraph();
            // Check if next lines are also task list items to group them
            let listItems = [line.replace(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/, function(match, checked, content) {
                let isChecked = checked.toLowerCase() === 'x';
                let checkbox = '<input type="checkbox" ' + (isChecked ? 'checked ' : '') + 'disabled>';
                return '<li class="task-list-item">' + checkbox + ' ' + applyInlineStyles(content) + '</li>';
            })];
            while (i + 1 < lines.length && lines[i + 1].match(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/)) {
                i++;
                listItems.push(lines[i].replace(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/, function(match, checked, content) {
                    let isChecked = checked.toLowerCase() === 'x';
                    let checkbox = '<input type="checkbox" ' + (isChecked ? 'checked ' : '') + 'disabled>';
                    return '<li class="task-list-item">' + checkbox + ' ' + applyInlineStyles(content) + '</li>';
                }));
            }
            result.push('<ul class="task-list">' + listItems.join('') + '</ul>');
            continue;
        }
        
        // Unordered lists
        if (line.match(/^\s*[\*\-\+]\s+(.+)$/)) {
            flushParagraph();
            // Check if next lines are also list items to group them
            let listItems = [line.replace(/^\s*[\*\-\+]\s+(.+)$/, function(match, content) {
                return '<li>' + applyInlineStyles(content) + '</li>';
            })];
            while (i + 1 < lines.length && lines[i + 1].match(/^\s*[\*\-\+]\s+(.+)$/)) {
                i++;
                listItems.push(lines[i].replace(/^\s*[\*\-\+]\s+(.+)$/, function(match, content) {
                    return '<li>' + applyInlineStyles(content) + '</li>';
                }));
            }
            result.push('<ul>' + listItems.join('') + '</ul>');
            continue;
        }
        
        // Ordered lists
        if (line.match(/^\s*\d+\.\s+(.+)$/)) {
            flushParagraph();
            // Check if next lines are also list items to group them
            let listItems = [line.replace(/^\s*\d+\.\s+(.+)$/, function(match, content) {
                return '<li>' + applyInlineStyles(content) + '</li>';
            })];
            while (i + 1 < lines.length && lines[i + 1].match(/^\s*\d+\.\s+(.+)$/)) {
                i++;
                listItems.push(lines[i].replace(/^\s*\d+\.\s+(.+)$/, function(match, content) {
                    return '<li>' + applyInlineStyles(content) + '</li>';
                }));
            }
            result.push('<ol>' + listItems.join('') + '</ol>');
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

function initializeMarkdownNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') return;
    
    // Check if already initialized (prevent double initialization)
    if (noteEntry.querySelector('.markdown-editor') && noteEntry.querySelector('.markdown-preview')) {
        return; // Already initialized, skip
    }
    
    // Get the markdown content from the data attribute or text content
    var markdownContent = noteEntry.getAttribute('data-markdown-content') || noteEntry.textContent || '';
    
    // Store the original markdown in a data attribute
    if (!noteEntry.getAttribute('data-markdown-content')) {
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    }
    
    // Check if split view is enabled and we're not on mobile
    var isMobile = window.innerWidth <= 800;
    var isSplitViewEnabled = document.body.classList.contains('markdown-split-view-enabled') && !isMobile;
    
    // Determine initial mode: 
    // - Split view: show both editor and preview
    // - Regular mode: preview if content exists, edit if empty
    // - Mobile: always start in edit mode
    var isEmpty = markdownContent.trim() === '';
    var startInEditMode = isMobile || (isEmpty && !isSplitViewEnabled);
    
    // Create preview and editor containers
    var previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.innerHTML = parseMarkdown(markdownContent);
    
    var editorDiv = document.createElement('div');
    editorDiv.className = 'markdown-editor';
    editorDiv.contentEditable = true;
    editorDiv.textContent = markdownContent;
    editorDiv.setAttribute('data-ph', 'Write your markdown here...');
    
    // Ensure proper line break handling in contentEditable
    editorDiv.style.whiteSpace = 'pre-wrap';
    
    // Set initial display states using setProperty to override any CSS !important rules
    if (startInEditMode && !isSplitViewEnabled) {
        // Edit mode: show editor, hide preview
        editorDiv.style.setProperty('display', 'block', 'important');
        previewDiv.style.setProperty('display', 'none', 'important');
    } else {
        // Preview mode or split view: show both or just preview
        editorDiv.style.setProperty('display', isSplitViewEnabled ? 'block' : 'none', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
    }
    
    // Replace note content with preview and editor
    noteEntry.innerHTML = '';
    noteEntry.appendChild(editorDiv);
    noteEntry.appendChild(previewDiv);
    noteEntry.contentEditable = false;
    
    // Add edit and preview buttons in toolbar (only if not in split view OR if on mobile)
    if (!isSplitViewEnabled || isMobile) {
        var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
        if (toolbar) {
            // Hide separator button for markdown notes
            var separatorBtn = toolbar.querySelector('.btn-separator');
            if (separatorBtn) {
                separatorBtn.style.display = 'none';
            }
            
            // Edit button (markdown icon) - hidden in edit mode, visible in preview mode
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'toolbar-btn markdown-edit-btn note-action-btn';
            editBtn.innerHTML = '<i class="fa-markdown"></i>';
            editBtn.title = 'Edit markdown';
            // Hide edit button if we're starting in edit mode
            editBtn.style.display = startInEditMode ? 'none' : '';
            editBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                switchToEditMode(noteId);
            };
            toolbar.insertBefore(editBtn, toolbar.firstChild);
            
            // Preview button (eye icon) - visible in edit mode, hidden in preview mode
            var previewBtn = document.createElement('button');
            previewBtn.type = 'button';
            previewBtn.className = 'toolbar-btn markdown-preview-btn note-action-btn';
            previewBtn.innerHTML = '<i class="fa-eye"></i>';
            previewBtn.title = 'Preview markdown';
            // Show preview button if we're starting in edit mode
            previewBtn.style.display = startInEditMode ? '' : 'none';
            previewBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                switchToPreviewMode(noteId);
            };
            toolbar.insertBefore(previewBtn, toolbar.firstChild);
        }
    }
    
    // Setup event listeners for the editor
    setupMarkdownEditorListeners(noteId);
    
    // Set the global noteid
    noteid = noteId;
    window.noteid = noteId;
    
    // Give focus to the editor only if starting in edit mode (empty note)
    // But not on mobile to avoid unwanted scrolling
    if (startInEditMode) {
        // Check if we're not on mobile or if we explicitly want to scroll
        const isMobile = typeof isMobileDevice === 'function' ? isMobileDevice() : (window.innerWidth <= 800);
        const shouldScroll = new URLSearchParams(window.location.search).get('scroll') === '1';
        const shouldScrollFromSession = sessionStorage.getItem('shouldScrollToNote') === 'true';
        
        // Focus disabled - don't automatically focus the editor when opening a note
        // if (!isMobile || shouldScroll || shouldScrollFromSession) {
        //     editorDiv.focus();
        // }
    }
}

function switchToEditMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');
    
    if (!previewDiv || !editorDiv) return;
    
    // Switch to edit mode - use setProperty to override !important rules
    previewDiv.style.setProperty('display', 'none', 'important');
    editorDiv.style.setProperty('display', 'block', 'important');
    // Focus disabled - don't automatically focus when switching to edit mode
    // editorDiv.focus();
    
    // Show preview button, hide edit button
    if (editBtn) editBtn.style.display = 'none';
    if (previewBtn) previewBtn.style.display = '';
}

function switchToPreviewMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');
    
    if (!previewDiv || !editorDiv) return;
    
    // Switch to preview mode
    // Use helper function to properly normalize content
    var markdownContent = normalizeContentEditableText(editorDiv);
    previewDiv.innerHTML = parseMarkdown(markdownContent);
    noteEntry.setAttribute('data-markdown-content', markdownContent);
    
    // Use setProperty to override !important rules
    editorDiv.style.setProperty('display', 'none', 'important');
    previewDiv.style.setProperty('display', 'block', 'important');
    
    // Show edit button, hide preview button
    if (editBtn) editBtn.style.display = '';
    if (previewBtn) previewBtn.style.display = 'none';
    
    // Check if content has actually changed before triggering save
    var previousContent = noteEntry.getAttribute('data-markdown-content') || '';
    var currentContent = markdownContent;
    
    // Only mark as edited and trigger save if content has changed
    if (previousContent !== currentContent) {
        if (typeof updateNote === 'function') {
            updateNote();
        }
    }
}

function toggleMarkdownMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    
    if (!previewDiv || !editorDiv) return;
    
    if (editorDiv.style.display === 'none') {
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
    
    // Set noteid on focus (like normal notes)
    editorDiv.addEventListener('focus', function() {
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        // Also set it globally for compatibility
        window.noteid = noteId;
    });
    
    editorDiv.addEventListener('input', function() {
        // Update the data attribute with current content
        // Use helper function to properly normalize content
        var content = normalizeContentEditableText(editorDiv);
        noteEntry.setAttribute('data-markdown-content', content);
        
        // Check if split view is currently enabled (can change dynamically) and we're not on mobile
        var isMobile = window.innerWidth <= 800;
        var currentSplitViewEnabled = document.body.classList.contains('markdown-split-view-enabled') && !isMobile;
        
        // In split view mode, update preview in real-time
        if (currentSplitViewEnabled && previewDiv) {
            previewDiv.innerHTML = parseMarkdown(content);
        }
        
        // Make sure noteid is set
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        window.noteid = noteId;
        
        // Mark as edited
        if (typeof updateNote === 'function') {
            updateNote();
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

// Make functions globally available
window.initializeMarkdownNote = initializeMarkdownNote;
window.toggleMarkdownMode = toggleMarkdownMode;
window.switchToEditMode = switchToEditMode;
window.switchToPreviewMode = switchToPreviewMode;
window.getMarkdownContent = getMarkdownContent;
window.getMarkdownContentForNote = getMarkdownContentForNote;
window.parseMarkdown = parseMarkdown;
window.setupMarkdownEditorListeners = setupMarkdownEditorListeners;

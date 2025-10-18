// Markdown handler for Poznote
// Simple markdown parser and renderer

function parseMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML first to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Helper function to apply inline styles (bold, italic, code, links, etc.)
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
        
        // Links [text](url)
        text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        
        // Images ![alt](url)
        text = text.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, '<img src="$2" alt="$1">');
        
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
            let para = currentParagraph.join('<br>');
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
    
    // Create preview and editor containers
    var previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    previewDiv.innerHTML = parseMarkdown(markdownContent);
    previewDiv.style.display = 'none'; // Hidden initially (we start in edit mode)
    
    var editorDiv = document.createElement('div');
    editorDiv.className = 'markdown-editor';
    editorDiv.contentEditable = true;
    editorDiv.textContent = markdownContent;
    editorDiv.style.display = 'block'; // Visible initially (we start in edit mode)
    editorDiv.setAttribute('data-ph', 'Write your markdown here...');
    
    // Replace note content with preview and editor
    noteEntry.innerHTML = '';
    noteEntry.appendChild(previewDiv);
    noteEntry.appendChild(editorDiv);
    noteEntry.contentEditable = false;
    
    // Add edit and preview buttons in toolbar
    var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
    if (toolbar) {
        // Edit button (markdown icon) - hidden in edit mode
        var editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'toolbar-btn markdown-edit-btn note-action-btn';
        editBtn.innerHTML = '<i class="fa-markdown"></i>';
        editBtn.title = 'Edit markdown';
        editBtn.style.display = 'none'; // Hidden initially (we start in edit mode)
        editBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            switchToEditMode(noteId);
        };
        toolbar.insertBefore(editBtn, toolbar.firstChild);
        
        // Preview button (eye icon) - visible in edit mode
        var previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'toolbar-btn markdown-preview-btn note-action-btn';
        previewBtn.innerHTML = '<i class="fa-eye"></i>';
        previewBtn.title = 'Preview markdown';
        previewBtn.style.display = ''; // Visible initially (we start in edit mode)
        previewBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            switchToPreviewMode(noteId);
        };
        toolbar.insertBefore(previewBtn, toolbar.firstChild);
    }
    
    // Setup event listeners for the editor
    setupMarkdownEditorListeners(noteId);
    
    // Set the global noteid and give focus to the editor (we start in edit mode)
    noteid = noteId;
    window.noteid = noteId;
    editorDiv.focus();
}

function switchToEditMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');
    
    if (!previewDiv || !editorDiv) return;
    
    // Switch to edit mode
    previewDiv.style.display = 'none';
    editorDiv.style.display = 'block';
    editorDiv.focus();
    
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
    var markdownContent = editorDiv.textContent;
    previewDiv.innerHTML = parseMarkdown(markdownContent);
    noteEntry.setAttribute('data-markdown-content', markdownContent);
    
    editorDiv.style.display = 'none';
    previewDiv.style.display = 'block';
    
    // Show edit button, hide preview button
    if (editBtn) editBtn.style.display = '';
    if (previewBtn) previewBtn.style.display = 'none';
    
    // Mark as edited and trigger save
    if (typeof updateNote === 'function') {
        updateNote();
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
        return editorDiv.textContent || '';
    }
    
    // In preview mode, get from data attribute
    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Listen to input events in markdown editor to mark note as edited
function setupMarkdownEditorListeners(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;
    
    var editorDiv = noteEntry.querySelector('.markdown-editor');
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
        var content = editorDiv.textContent || '';
        noteEntry.setAttribute('data-markdown-content', content);
        
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
        return editorDiv.textContent || '';
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

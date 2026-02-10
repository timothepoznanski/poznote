// Slash Command Menu for Poznote
// Shows a command menu when user types "/" in an HTML note or in a Markdown note (edit mode)

(function () {
    'use strict';


    // Available languages for code blocks (used by HTML and Markdown menus)
    var CODE_BLOCK_LANGUAGES = [
        { id: 'code-javascript', icon: 'fa-code', iconColor: '#f7df1e', label: 'JavaScript', lang: 'javascript' },
        { id: 'code-typescript', icon: 'fa-code', iconColor: '#3178c6', label: 'TypeScript', lang: 'typescript' },
        { id: 'code-python', icon: 'fa-code', iconColor: '#3776ab', label: 'Python', lang: 'python' },
        { id: 'code-html', icon: 'fa-code', iconColor: '#e34f26', label: 'HTML', lang: 'html' },
        { id: 'code-css', icon: 'fa-code', iconColor: '#1572b6', label: 'CSS', lang: 'css' },
        { id: 'code-json', icon: 'fa-code', iconColor: '#292929', label: 'JSON', lang: 'json' },
        { id: 'code-bash', icon: 'fa-terminal', iconColor: '#4eaa25', label: 'Bash', lang: 'bash' },
        { id: 'code-powershell', icon: 'fa-terminal', iconColor: '#012456', label: 'PowerShell', lang: 'powershell' },
        { id: 'code-sql', icon: 'fa-database', iconColor: '#336791', label: 'SQL', lang: 'sql' },
        { id: 'code-php', icon: 'fa-code', iconColor: '#777bb4', label: 'PHP', lang: 'php' },
        { id: 'code-java', icon: 'fa-code', iconColor: '#007396', label: 'Java', lang: 'java' },
        { id: 'code-csharp', icon: 'fa-code', iconColor: '#239120', label: 'C#', lang: 'csharp' },
        { id: 'code-cpp', icon: 'fa-code', iconColor: '#00599c', label: 'C++', lang: 'cpp' },
        { id: 'code-go', icon: 'fa-code', iconColor: '#00add8', label: 'Go', lang: 'go' },
        { id: 'code-rust', icon: 'fa-code', iconColor: '#b7410e', label: 'Rust', lang: 'rust' },
        { id: 'code-ruby', icon: 'fa-gem', iconColor: '#cc342d', label: 'Ruby', lang: 'ruby' },
        { id: 'code-yaml', icon: 'fa-file-code', iconColor: '#cb171e', label: 'YAML', lang: 'yaml' },
        { id: 'code-xml', icon: 'fa-file-code', iconColor: '#0060ac', label: 'XML', lang: 'xml' },
        { id: 'code-markdown', icon: 'fa-file-code', iconColor: '#083fa1', label: 'Markdown', lang: 'markdown' }
    ];

    // Available callout / quote types
    var CALLOUT_TYPES = [
        { id: 'plain', labelKey: 'slash_menu.blockquote', fallback: 'Blockquote' },
        { id: 'note', labelKey: 'slash_menu.callout_note', fallback: 'Note' },
        { id: 'tip', labelKey: 'slash_menu.callout_tip', fallback: 'Tip' },
        { id: 'important', labelKey: 'slash_menu.callout_important', fallback: 'Important' },
        { id: 'warning', labelKey: 'slash_menu.callout_warning', fallback: 'Warning' },
        { id: 'caution', labelKey: 'slash_menu.callout_caution', fallback: 'Caution' }
    ];

    // -------------------------------------------------------------------
    // Slash menu global variables
    // -------------------------------------------------------------------

    let slashMenuElement = null;
    let submenuElement = null;
    let subSubmenuElement = null;
    let selectedIndex = 0;
    let selectedSubmenuIndex = 0;
    let selectedSubSubmenuIndex = 0;
    let filteredCommands = [];
    let currentSubmenu = null;
    let currentSubSubmenu = null;
    let slashTextNode = null;  // The text node containing the slash
    let slashOffset = -1;      // The position of the slash in the node
    let filterText = '';
    let savedNoteEntry = null;
    let savedEditableElement = null;
    let activeCommands = null;


    // Remove accents from a string for search
    function removeAccents(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    // Get the Markdown editor from the current selection
    function getCurrentMarkdownEditorFromSelection() {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return null;

        let container = selection.getRangeAt(0).commonAncestorContainer;
        if (container && container.nodeType === 3) container = container.parentNode;
        if (!container || !container.closest) return null;

        const editor = container.closest('.markdown-editor');
        if (!editor) return null;

        // Ensure editor is actually in edit mode (visible)
        try {
            if (window.getComputedStyle(editor).display === 'none') return null;
        } catch (e) { }

        return editor;
    }

    // Calculate selection start and end offsets within an element
    function getSelectionOffsetsWithin(rootEl) {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return null;

        const range = selection.getRangeAt(0);
        if (!rootEl || !rootEl.contains(range.startContainer) || !rootEl.contains(range.endContainer)) {
            return null;
        }

        const preStart = range.cloneRange();
        preStart.selectNodeContents(rootEl);
        preStart.setEnd(range.startContainer, range.startOffset);
        const start = preStart.toString().length;

        const preEnd = range.cloneRange();
        preEnd.selectNodeContents(rootEl);
        preEnd.setEnd(range.endContainer, range.endOffset);
        const end = preEnd.toString().length;

        return { start: Math.min(start, end), end: Math.max(start, end) };
    }

    // Extract text from a Markdown editor
    function getMarkdownEditorText(rootEl) {
        if (!rootEl) return '';

        // Prefer the same normalization as the markdown editor uses (handles DIV/BR quirks)
        try {
            if (typeof window.normalizeContentEditableText === 'function') {
                return window.normalizeContentEditableText(rootEl);
            }
        } catch (e) { }

        // Fallback: innerText preserves visual newlines better than textContent
        return rootEl.innerText || rootEl.textContent || '';
    }

    // Find the text node at a given offset
    function findTextNodeAtOffset(rootEl, offset) {
        const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        let remaining = offset;

        while (node) {
            const len = node.nodeValue ? node.nodeValue.length : 0;
            if (remaining <= len) {
                return { node, offset: remaining };
            }
            remaining -= len;
            node = walker.nextNode();
        }

        // Fallback: put caret at end
        return { node: rootEl, offset: rootEl.childNodes ? rootEl.childNodes.length : 0 };
    }

    // Set selection from start and end offsets
    function setSelectionByOffsets(rootEl, startOffset, endOffset) {
        const selection = window.getSelection();
        if (!selection) return;

        const startPos = findTextNodeAtOffset(rootEl, Math.max(0, startOffset));
        const endPos = findTextNodeAtOffset(rootEl, Math.max(0, endOffset));

        const range = document.createRange();
        try {
            range.setStart(startPos.node, startPos.offset);
            range.setEnd(endPos.node, endPos.offset);
        } catch (e) {
            // Last resort: collapse at end
            try {
                range.selectNodeContents(rootEl);
                range.collapse(false);
            } catch (e2) { }
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    // Replace a text range in the Markdown editor
    function replaceMarkdownRange(rootEl, start, end, replacement, selectStartAfter, selectEndAfter) {
        if (!rootEl) return;

        const fullText = getMarkdownEditorText(rootEl);
        const safeStart = Math.max(0, Math.min(start, fullText.length));
        const safeEnd = Math.max(safeStart, Math.min(end, fullText.length));

        const newText = fullText.slice(0, safeStart) + replacement + fullText.slice(safeEnd);
        // Force a plain-text representation with explicit \n so offsets stay stable.
        rootEl.textContent = newText;

        const newSelStart = typeof selectStartAfter === 'number' ? selectStartAfter : (safeStart + replacement.length);
        const newSelEnd = typeof selectEndAfter === 'number' ? selectEndAfter : newSelStart;
        setSelectionByOffsets(rootEl, newSelStart, newSelEnd);

        try {
            rootEl.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { }
    }

    // Insert Markdown text at cursor position
    function insertMarkdownAtCursor(text, caretDeltaFromInsertEnd) {
        // Prefer DOM-range insertion to avoid line/offset mismatches in contentEditable.
        const editor = getCurrentMarkdownEditorFromSelection();
        if (!editor) {
            return;
        }

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) {
            return;
        }

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.startContainer)) {
            return;
        }

        const caretDelta = typeof caretDeltaFromInsertEnd === 'number' ? caretDeltaFromInsertEnd : 0;
        const caretPos = Math.max(0, Math.min(text.length, text.length + caretDelta));

        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);

        const newRange = document.createRange();
        newRange.setStart(node, caretPos);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        try {
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { }
    }

    // Wrap Markdown selection with a prefix and suffix
    function wrapMarkdownSelection(prefix, suffix, emptyInnerCaretOffset) {
        const editor = getCurrentMarkdownEditorFromSelection();
        if (!editor) return;

        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return;

        const selectedText = range.toString();

        if (!selectedText) {
            const replacement = prefix + suffix;
            const node = document.createTextNode(replacement);
            range.deleteContents();
            range.insertNode(node);

            const caretInside = typeof emptyInnerCaretOffset === 'number' ? emptyInnerCaretOffset : prefix.length;
            const newRange = document.createRange();
            newRange.setStart(node, Math.max(0, Math.min(replacement.length, caretInside)));
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        } else {
            const replacement = prefix + selectedText + suffix;
            const node = document.createTextNode(replacement);
            range.deleteContents();
            range.insertNode(node);

            // Keep the original text selected (inside the wrapper)
            const newRange = document.createRange();
            newRange.setStart(node, prefix.length);
            newRange.setEnd(node, prefix.length + selectedText.length);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }

        try {
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { }
    }

    // Insert a prefix at the start of the current line in Markdown
    function insertMarkdownPrefixAtLineStart(prefix) {
        // For Markdown, the slash command is typically typed at the insertion point.
        // Inserting at cursor is more reliable than trying to compute line starts across contentEditable lines.
        insertMarkdownAtCursor(prefix, 0);
    }

    // Insert an HTML heading (h1, h2, h3)
    function insertHeading(level) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const tag = 'h' + level;

        // Create new heading
        const heading = document.createElement(tag);
        heading.appendChild(document.createElement('br'));

        // Insert at cursor position
        range.deleteContents();
        range.insertNode(heading);

        // Place cursor inside heading
        const newRange = document.createRange();
        newRange.setStart(heading, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Trigger input event for autosave
        const noteEntry = heading.closest('.noteentry');
        if (noteEntry) {
            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Insert an inline HTML element (strong, em, mark, code, etc.)
    function insertInlineElement(tagName, styleObj) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const el = document.createElement(tagName);
        if (styleObj) {
            for (var key in styleObj) {
                if (styleObj.hasOwnProperty(key)) el.style[key] = styleObj[key];
            }
        }
        const textNode = document.createTextNode('\u200B'); // Zero-width space to place cursor
        el.appendChild(textNode);

        range.deleteContents();
        range.insertNode(el);

        const newRange = document.createRange();
        newRange.setStart(textNode, 1);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        const noteEntry = el.closest('.noteentry');
        if (noteEntry) {
            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Insert bold text
    function insertBold() { 
        insertInlineElement('strong'); 
    }

    // Insert italic text
    function insertItalic() { 
        insertInlineElement('em'); 
    }

    // Insert highlighted text
    function insertHighlight() { 
        insertInlineElement('mark'); 
    }

    // Insert strikethrough text
    function insertStrikethrough() { 
        insertInlineElement('s'); 
    }

    // Insert inline code
    function insertCode() { 
        insertInlineElement('code'); 
    }

    // Insert colored text
    function insertColor(color) {
        insertInlineElement('span', color !== 'black' ? { color: color } : undefined);
    }

    // Insert a code block with syntax highlighting
    function insertCodeBlock(language) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Create code block (pre > code structure)
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        
        // Add language class if specified
        if (language) {
            code.className = 'language-' + language;
            code.setAttribute('data-language', language);
            pre.setAttribute('data-language', language);
        }
        
        // Add a line break inside code element for cursor positioning
        const br = document.createElement('br');
        code.appendChild(br);
        pre.appendChild(code);

        // Insert at cursor position
        range.deleteContents();
        range.insertNode(pre);

        // Prepare selection inside code element
        const newRange = document.createRange();
        newRange.setStart(code, 0);
        newRange.collapse(true);

        // Ensure the containing noteentry is focused
        const noteEntry = pre.closest('.noteentry');
        if (noteEntry) {
            try { noteEntry.focus(); } catch (err) { }
            // Apply selection after a short timeout to ensure it's not overridden by executeCommand's focus
            setTimeout(function () {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);

                // Trigger syntax highlighting if available
                if (language && typeof window.applySyntaxHighlighting === 'function') {
                    window.applySyntaxHighlighting(pre);
                }

                // Trigger input event for autosave
                noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
            }, 50);
        } else {
            selection.removeAllRanges();
            selection.addRange(newRange);

            if (language && typeof window.applySyntaxHighlighting === 'function') {
                setTimeout(function() {
                    window.applySyntaxHighlighting(pre);
                }, 10);
            }
        }
    }

    // Return to normal text (remove formatting)
    function insertNormalText() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Check if we're inside a formatting element (code, strong, em, mark, s, etc.)
        let currentNode = range.startContainer;
        if (currentNode.nodeType === 3) {
            currentNode = currentNode.parentNode;
        }

        // Find if we're inside a formatting element
        const formattingTags = ['CODE', 'STRONG', 'EM', 'MARK', 'S', 'SPAN', 'B', 'I', 'U'];
        let formattingElement = null;
        let node = currentNode;

        while (node && !node.classList?.contains('noteentry')) {
            if (formattingTags.includes(node.tagName)) {
                formattingElement = node;
                break;
            }
            node = node.parentNode;
        }

        // Create span that resets all formatting to default
        const span = document.createElement('span');
        // Don't hardcode a light-theme text color; inherit from the editor (works in dark mode too).
        span.style.color = 'inherit';
        span.style.backgroundColor = 'transparent';
        span.style.fontWeight = 'normal';
        span.style.fontStyle = 'normal';
        span.style.textDecoration = 'none';
        span.style.fontSize = 'inherit';
        span.style.fontFamily = 'inherit';

        const textNode = document.createTextNode('\u200B');
        span.appendChild(textNode);

        range.deleteContents();

        // If inside a formatting element, insert after it
        if (formattingElement) {
            formattingElement.parentNode.insertBefore(span, formattingElement.nextSibling);
        } else {
            range.insertNode(span);
        }

        const newRange = document.createRange();
        newRange.setStart(textNode, 1);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Trigger input event for autosave
        const noteEntry = span.closest('.noteentry');
        if (noteEntry) {
            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Insert a callout block (note, warning, info, etc.)
    function insertCallout(type) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        let element;

        if (!type || type === 'plain') {
            // Plain blockquote
            element = document.createElement('blockquote');
            const textNode = document.createTextNode('\u200B');
            element.appendChild(textNode);
        } else {
            // Callout with icon and title
            element = document.createElement('aside');
            element.className = 'callout callout-' + type;

            // Create title div
            const titleDiv = document.createElement('div');
            titleDiv.className = 'callout-title';

            // Add icon SVG
            const iconSvgs = {
                'note': '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
                'tip': '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
                'important': '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.75v4.5a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"></path></svg>',
                'warning': '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
                'caution': '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.75.75 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>'
            };

            titleDiv.innerHTML = iconSvgs[type] || iconSvgs['note'];

            const titleSpan = document.createElement('span');
            titleSpan.className = 'callout-title-text';
            const defaultTitle = type.charAt(0).toUpperCase() + type.slice(1);
            titleSpan.textContent = (window.t ? window.t('slash_menu.callout_' + type, null, defaultTitle) : defaultTitle);
            titleDiv.appendChild(titleSpan);

            // Create body div
            const bodyDiv = document.createElement('div');
            bodyDiv.className = 'callout-body';
            const textNode = document.createTextNode('\u200B');
            bodyDiv.appendChild(textNode);

            element.appendChild(titleDiv);
            element.appendChild(bodyDiv);
        }

        // Insert at cursor position
        range.deleteContents();
        range.insertNode(element);

        // Prepare the desired selection inside the element but don't apply it yet
        const newRange = document.createRange();
        const targetNode = type && type !== 'plain' ? element.querySelector('.callout-body') : element;
        const textNode = targetNode.firstChild || targetNode;

        if (textNode.nodeType === 3) {
            newRange.setStart(textNode, 1);
        } else {
            newRange.setStart(textNode, 0);
        }
        newRange.collapse(true);

        // Ensure the containing noteentry is focused so the caret stays inside.
        // Apply the selection after focusing (short timeout) to avoid focus stealing.
        const noteEntry = element.closest('.noteentry');
        if (noteEntry) {
            try { noteEntry.focus(); } catch (err) { }
            setTimeout(function () {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
                // Trigger input event for autosave
                noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
            }, 10);
        } else {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }

    // Insert a toggle element (collapsible/expandable block)
    function insertToggle() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Create the details element (HTML5 collapsible)
        const details = document.createElement('details');
        details.className = 'toggle-block';
        details.open = true; // Open by default for easier editing

        // Create summary (the always-visible label)
        const summary = document.createElement('summary');
        summary.className = 'toggle-header';
        summary.textContent = window.t ? window.t('slash_menu.toggle_placeholder', null, 'Toggle') : 'Toggle';

        const toggleContentPlaceholder = window.t
            ? window.t('slash_menu.toggle_content_placeholder', null, 'Write inside the toggle…')
            : 'Write inside the toggle…';
        const toggleAfterPlaceholder = window.t
            ? window.t('slash_menu.toggle_after_placeholder', null, 'Continue writing below…')
            : 'Continue writing below…';

        // Create content div (hidden content)
        const contentDiv = document.createElement('div');
        contentDiv.className = 'toggle-content';
        contentDiv.setAttribute('contenteditable', 'true');
        contentDiv.setAttribute('data-ph', toggleContentPlaceholder);
        contentDiv.innerHTML = '';

        details.appendChild(summary);
        details.appendChild(contentDiv);

        // Create empty lines before and after
        const emptyLineBefore = document.createElement('p');
        emptyLineBefore.className = 'toggle-before-placeholder';
        emptyLineBefore.setAttribute('data-ph', toggleAfterPlaceholder);
        emptyLineBefore.innerHTML = '';
        const emptyLineAfter = document.createElement('p');
        emptyLineAfter.className = 'toggle-after-placeholder';
        emptyLineAfter.setAttribute('data-ph', toggleAfterPlaceholder);
        emptyLineAfter.innerHTML = '';

        // Insert at cursor position
        range.deleteContents();

        // Insert in reverse order to maintain correct sequence: before -> details -> after
        range.insertNode(emptyLineAfter);
        range.insertNode(details);
        range.insertNode(emptyLineBefore);

        // Place cursor at the end of the summary text
        const newRange = document.createRange();
        newRange.selectNodeContents(summary);
        newRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Trigger input event for autosave
        const noteEntry = details.closest('.noteentry');
        if (noteEntry) {
            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Insert a list (ordered or unordered)
    function insertList(ordered) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);

        // Create new list
        const list = document.createElement(ordered ? 'ol' : 'ul');
        const li = document.createElement('li');
        li.appendChild(document.createElement('br'));
        list.appendChild(li);

        // Insert at cursor position
        range.deleteContents();
        range.insertNode(list);

        // Place cursor inside li
        const newRange = document.createRange();
        newRange.setStart(li, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);

        // Trigger input event for autosave
        const noteEntry = list.closest('.noteentry');
        if (noteEntry) {
            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    // Insert an image (opens file picker)
    function insertImage() {
        // Create a temporary file input for images
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files.length > 0) {
                const file = fileInput.files[0];

                // Check if we're in a markdown note
                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                let container = range.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentNode;

                const noteEntry = container.closest('.noteentry');
                const isMarkdown = noteEntry && noteEntry.hasAttribute('data-note-type') &&
                    noteEntry.getAttribute('data-note-type') === 'markdown';

                if (isMarkdown) {
                    // Handle markdown image insertion
                    const noteId = noteEntry.id.replace('entry', '');
                    const loadingText = '![Uploading ' + file.name + '...]()';

                    // Insert loading text
                    const editor = noteEntry.querySelector('.markdown-editor');
                    if (editor) {
                        range.deleteContents();
                        const textNode = document.createTextNode(loadingText);
                        range.insertNode(textNode);

                        // Trigger input event
                        editor.dispatchEvent(new Event('input', { bubbles: true }));

                        // Upload the file
                        const formData = new FormData();
                        formData.append('note_id', noteId);
                        formData.append('file', file);
                        if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
                            formData.append('workspace', selectedWorkspace);
                        }

                        fetch('/api/v1/notes/' + noteId + '/attachments', {
                            method: 'POST',
                            body: formData
                        })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    const imageMarkdown = '![' + file.name + '](/api/v1/notes/' + noteId + '/attachments/' + data.attachment_id + ')';

                                    // Replace loading text
                                    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
                                    let textNodes = [];
                                    let node;
                                    while (node = walker.nextNode()) {
                                        textNodes.push(node);
                                    }

                                    for (let i = 0; i < textNodes.length; i++) {
                                        const textNode = textNodes[i];
                                        const text = textNode.textContent;
                                        if (text.indexOf(loadingText) !== -1) {
                                            textNode.textContent = text.replace(loadingText, imageMarkdown);
                                            break;
                                        }
                                    }

                                    editor.dispatchEvent(new Event('input', { bubbles: true }));

                                    // Mark note as modified
                                    if (typeof window.markNoteAsModified === 'function') {
                                        window.markNoteAsModified();
                                    }

                                    // Re-initialize image click handlers
                                    if (typeof reinitializeImageClickHandlers === 'function') {
                                        setTimeout(() => reinitializeImageClickHandlers(), 200);
                                    }

                                    // Save after upload
                                    setTimeout(() => {
                                        if (typeof window.saveNoteImmediately === 'function') {
                                            window.saveNoteImmediately();
                                        }
                                    }, 500);
                                } else {
                                    // Remove loading text on error
                                    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
                                    let textNodes = [];
                                    let node;
                                    while (node = walker.nextNode()) {
                                        textNodes.push(node);
                                    }

                                    for (let i = 0; i < textNodes.length; i++) {
                                        const textNode = textNodes[i];
                                        const text = textNode.textContent;
                                        if (text.indexOf(loadingText) !== -1) {
                                            textNode.textContent = text.replace(loadingText, '');
                                            break;
                                        }
                                    }

                                    editor.dispatchEvent(new Event('input', { bubbles: true }));

                                    if (typeof showNotificationPopup === 'function') {
                                        showNotificationPopup('Upload failed: ' + data.message, 'error');
                                    }
                                }
                            })
                            .catch(error => {
                                // Remove loading text on error
                                const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
                                let textNodes = [];
                                let node;
                                while (node = walker.nextNode()) {
                                    textNodes.push(node);
                                }

                                for (let i = 0; i < textNodes.length; i++) {
                                    const textNode = textNodes[i];
                                    const text = textNode.textContent;
                                    if (text.indexOf(loadingText) !== -1) {
                                        textNode.textContent = text.replace(loadingText, '');
                                        break;
                                    }
                                }

                                editor.dispatchEvent(new Event('input', { bubbles: true }));

                                if (typeof showNotificationPopup === 'function') {
                                    showNotificationPopup('Upload failed: ' + error.message, 'error');
                                }
                            });
                    }
                } else {
                    // Handle HTML image insertion
                    const reader = new FileReader();
                    reader.onload = function (ev) {
                        const originalDataUrl = ev.target.result;

                        // Use compression function if available (from attachments.js)
                        const processImage = function (dataUrl) {
                            // Add lazy loading and async decoding for better performance
                            const imgHtml = '<img src="' + dataUrl + '" alt="image" loading="lazy" decoding="async" />';

                            // Insert at cursor using the same method as drag-and-drop
                            const inserted = insertHTMLAtSelection(imgHtml);

                            if (!inserted) {
                                // Fallback: insert at end of note
                                const noteEntry = container.closest('.noteentry');
                                if (noteEntry) {
                                    noteEntry.innerHTML += imgHtml;
                                }
                            }

                            // Get note ID for saving
                            const noteEntry = container.closest('.noteentry');
                            if (noteEntry) {
                                const targetNoteId = noteEntry.id.replace('entry', '');
                                if (targetNoteId && targetNoteId !== '' && targetNoteId !== 'search') {
                                    window.noteid = targetNoteId;
                                }
                            }

                            // Mark note as modified
                            if (typeof window.markNoteAsModified === 'function') {
                                window.markNoteAsModified();
                            }

                            // Re-initialize image click handlers
                            if (typeof reinitializeImageClickHandlers === 'function') {
                                setTimeout(() => reinitializeImageClickHandlers(), 50);
                            }

                            // Save after insertion
                            setTimeout(() => {
                                if (typeof saveNoteToServer === 'function') {
                                    saveNoteToServer();
                                } else if (typeof window.saveNoteImmediately === 'function') {
                                    window.saveNoteImmediately();
                                }
                            }, 100);
                        };

                        // Compress if function available, otherwise use original
                        if (typeof compressImageIfNeeded === 'function') {
                            compressImageIfNeeded(originalDataUrl, processImage);
                        } else {
                            processImage(originalDataUrl);
                        }
                    };
                    reader.readAsDataURL(file);
                }
            }

            // Remove the temporary input
            document.body.removeChild(fileInput);
        });

        // Add to DOM and trigger click
        document.body.appendChild(fileInput);
        fileInput.click();
    }

    // Insert a date (opens date picker)
    function insertDate() {
        // Find current editor context to restore later
        const context = getEditorContext();
        if (!context) return;

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.style.position = 'fixed';
        dateInput.style.opacity = '0';
        dateInput.style.zIndex = '9999';
        dateInput.style.pointerEvents = 'none';

        // Attempt to position near the cursor
        try {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                dateInput.style.left = rect.left + 'px';
                dateInput.style.top = rect.bottom + 'px';
            } else {
                // Fallback to center
                dateInput.style.left = '50%';
                dateInput.style.top = '50%';
                dateInput.style.transform = 'translate(-50%, -50%)';
            }
        } catch (e) {
            // Fallback to center
            dateInput.style.left = '50%';
            dateInput.style.top = '50%';
            dateInput.style.transform = 'translate(-50%, -50%)';
        }

        document.body.appendChild(dateInput);

        dateInput.addEventListener('change', function () {
            const date = dateInput.value;
            if (date) {
                // Focus the editor back before inserting
                context.editableElement.focus();

                // Format the date based on user's locale
                const formattedDate = new Date(date).toLocaleDateString();
                if (typeof window.insertHTMLAtSelection === 'function') {
                    window.insertHTMLAtSelection(formattedDate);
                } else {
                    // Fallback for HTML notes
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(document.createTextNode(formattedDate));
                    }
                }
            }
            document.body.removeChild(dateInput);

            // Trigger input event for autosave
            const noteEntry = context.noteEntry;
            if (noteEntry) {
                noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Some browsers need a short delay or user interaction
        if (dateInput.showPicker) {
            dateInput.showPicker();
        } else {
            dateInput.click();
        }
    }

    // Insert a date in a Markdown editor
    function insertDateMarkdown() {
        const context = getEditorContext();
        if (!context) return;

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.style.position = 'fixed';
        dateInput.style.opacity = '0';
        dateInput.style.zIndex = '9999';
        dateInput.style.pointerEvents = 'none';

        // Attempt to position near the cursor
        try {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                dateInput.style.left = rect.left + 'px';
                dateInput.style.top = rect.bottom + 'px';
            } else {
                // Fallback to center
                dateInput.style.left = '50%';
                dateInput.style.top = '50%';
                dateInput.style.transform = 'translate(-50%, -50%)';
            }
        } catch (e) {
            // Fallback to center
            dateInput.style.left = '50%';
            dateInput.style.top = '50%';
            dateInput.style.transform = 'translate(-50%, -50%)';
        }

        document.body.appendChild(dateInput);

        dateInput.addEventListener('change', function () {
            const date = dateInput.value;
            if (date) {
                // Focus the editor back before inserting
                context.editableElement.focus();

                const formattedDate = new Date(date).toLocaleDateString();
                insertMarkdownAtCursor(formattedDate, 0);
            }
            document.body.removeChild(dateInput);
        });

        if (dateInput.showPicker) {
            dateInput.showPicker();
        } else {
            dateInput.click();
        }
    }

    // Return title commands for the slash menu (specific to title field)
    function getTitleSlashCommands() {
        const t = window.t || ((key, params, fallback) => fallback);
        return [
            {
                id: 'emoji',
                icon: 'fa-smile',
                label: t('slash_menu.emoji', null, 'Emoji'),
                action: function () {
                    const input = savedEditableElement;
                    if (!input || input.tagName !== 'INPUT') return;

                    // Ensure input focus and preserve selection for emoji insertion
                    input.focus();
                    window.savedActiveInput = input;
                    window.savedActiveInputSelection = {
                        start: input.selectionStart,
                        end: input.selectionEnd
                    };

                    // Open the emoji picker after focus is applied
                    if (typeof window.toggleEmojiPicker === 'function') {
                        setTimeout(() => window.toggleEmojiPicker(), 0);
                    }
                }
            },
            {
                id: 'date',
                icon: 'fa-calendar-alt',
                label: t('slash_menu.date', null, 'Date'),
                action: function () {
                    const input = savedEditableElement;
                    if (!input || input.tagName !== 'INPUT') return;

                    // Capture insertion position now (selection is already restored by deleteSlashText)
                    const insertionStart = (typeof input.selectionStart === 'number') ? input.selectionStart : Math.max(0, slashOffset);
                    const insertionEnd = (typeof input.selectionEnd === 'number') ? input.selectionEnd : insertionStart;
                    
                    const dateInput = document.createElement('input');
                    dateInput.type = 'date';
                    dateInput.style.position = 'fixed';
                    dateInput.style.top = '-1000px';
                    dateInput.style.left = '-1000px';
                    document.body.appendChild(dateInput);

                    dateInput.addEventListener('change', function () {
                        const date = dateInput.value;
                        if (date) {
                            const formattedDate = new Date(date).toLocaleDateString() + ' ';
                            const text = input.value;

                            const safeStart = Math.max(0, Math.min(insertionStart, text.length));
                            const safeEnd = Math.max(safeStart, Math.min(insertionEnd, text.length));

                            if (typeof input.setRangeText === 'function') {
                                input.setRangeText(formattedDate, safeStart, safeEnd, 'end');
                            } else {
                                input.value = text.substring(0, safeStart) + formattedDate + text.substring(safeEnd);
                            }

                            const caretPos = safeStart + formattedDate.length;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.focus();
                            try {
                                input.setSelectionRange(caretPos, caretPos);
                            } catch (e) { }
                            setTimeout(() => {
                                try {
                                    input.setSelectionRange(caretPos, caretPos);
                                } catch (e) { }
                            }, 0);
                        }
                        document.body.removeChild(dateInput);
                    });

                    if (dateInput.showPicker) {
                        dateInput.showPicker();
                    } else {
                        dateInput.click();
                    }
                }
            }
        ];
    }

    // Return slash commands common between HTML and Markdown modes
    function getCommonSlashCommands() {
        var t = window.t || (function (key, params, fallback) { return fallback; });
        return {
            excalidraw: {
                id: 'excalidraw',
                icon: 'fal fa-paint-brush',
                label: t('slash_menu.excalidraw', null, 'Excalidraw'),
                mobileHidden: true,
                action: function () {
                    if (typeof window.insertExcalidrawDiagram === 'function') {
                        window.insertExcalidrawDiagram();
                    }
                }
            },
            emoji: {
                id: 'emoji',
                icon: 'fa-smile',
                label: t('slash_menu.emoji', null, 'Emoji'),
                mobileHidden: true,
                action: function () {
                    if (typeof window.toggleEmojiPicker === 'function') {
                        // Small delay to ensure focus and selection have settled
                        // after slash deletion and menu hiding.
                        setTimeout(() => window.toggleEmojiPicker(), 10);
                    }
                }
            },
            noteReference: {
                id: 'note-reference',
                icon: 'fa fa-at',
                label: t('slash_menu.link_to_note', null, 'Link to note'),
                action: function () {
                    if (typeof window.openNoteReferenceModal === 'function') {
                        window.openNoteReferenceModal();
                    }
                }
            },
            image: {
                id: 'image',
                icon: 'fa fa-image',
                label: t('slash_menu.image', null, 'Image'),
                action: function () { insertImage(); }
            },
            cancel: {
                id: 'open-keyboard',
                icon: 'fa-times-circle',
                label: t('slash_menu.cancel', null, 'Cancel'),
                mobileOnly: true,
                keepSlash: true,
                action: function () {
                    var editable = savedEditableElement;
                    hideSlashMenu();
                    savedNoteEntry = null;
                    savedEditableElement = null;
                    if (editable) editable.focus();
                }
            }
        };
    }

    // Slash command menu items - actions match toolbar exactly
    // Order matches toolbar
    // Use a function to get translated labels at runtime
    function getSlashCommands() {
        const t = window.t || ((key, params, fallback) => fallback);
        var common = getCommonSlashCommands();
        return [
            {
                id: 'normal',
                icon: 'fa-align-left',
                label: t('slash_menu.back_to_normal', null, 'Back to normal text'),
                action: function () {
                    insertNormalText();
                }
            },
            {
                id: 'title',
                icon: 'fa-text-height',
                label: t('slash_menu.title', null, 'Title'),
                submenu: [
                    { id: 'h1', label: t('slash_menu.heading_1', null, 'Heading 1'), action: () => insertHeading(1) },
                    { id: 'h2', label: t('slash_menu.heading_2', null, 'Heading 2'), action: () => insertHeading(2) },
                    { id: 'h3', label: t('slash_menu.heading_3', null, 'Heading 3'), action: () => insertHeading(3) }
                ]
            },
            {
                id: 'format',
                icon: 'fa-bold',
                label: t('slash_menu.format_text', null, 'Format text'),
                submenu: [
                    { id: 'bold', icon: 'fa-bold', label: t('slash_menu.bold', null, 'Bold'), action: () => insertBold() },
                    { id: 'italic', icon: 'fa-italic', label: t('slash_menu.italic', null, 'Italic'), action: () => insertItalic() },
                    { id: 'highlight', icon: 'fa-fill-drip', label: t('slash_menu.highlight', null, 'Highlight'), action: () => insertHighlight() },
                    { id: 'strikethrough', icon: 'fa-strikethrough', label: t('slash_menu.strikethrough', null, 'Strikethrough'), action: () => insertStrikethrough() }
                ]
            },
            {
                id: 'color',
                icon: 'fa-palette',
                label: t('slash_menu.color', null, 'Color'),
                submenu: [
                    { id: 'red', icon: 'fa-circle', iconColor: '#e74c3c', label: t('slash_menu.color_red', null, 'Red'), action: () => insertColor('#e74c3c') },
                    { id: 'blue', icon: 'fa-circle', iconColor: '#3498db', label: t('slash_menu.color_blue', null, 'Blue'), action: () => insertColor('#3498db') },
                    { id: 'green', icon: 'fa-circle', iconColor: '#2ecc71', label: t('slash_menu.color_green', null, 'Green'), action: () => insertColor('#2ecc71') },
                    { id: 'yellow', icon: 'fa-circle', iconColor: '#f1c40f', label: t('slash_menu.color_yellow', null, 'Yellow'), action: () => insertColor('#f1c40f') },
                    { id: 'purple', icon: 'fa-circle', iconColor: '#9b59b6', label: t('slash_menu.color_purple', null, 'Purple'), action: () => insertColor('#9b59b6') },
                    { id: 'orange', icon: 'fa-circle', iconColor: '#e67e22', label: t('slash_menu.color_orange', null, 'Orange'), action: () => insertColor('#e67e22') },
                    { id: 'black', icon: 'fa-circle', iconColor: '#000000', label: t('slash_menu.color_black', null, 'Black'), action: () => insertColor('inherit') }
                ]
            },
            {
                id: 'code',
                icon: 'fa-code',
                label: t('slash_menu.code', null, 'Code'),
                submenu: [
                    { id: 'inline-code', icon: 'fa-terminal', label: t('slash_menu.inline_code', null, 'Inline code'), action: () => insertCode() },
                    {
                        id: 'block-languages',
                        icon: 'fa-laptop-code',
                        label: t('slash_menu.block_languages', null, 'Block Languages'),
                        submenu: CODE_BLOCK_LANGUAGES.map(function (l) {
                            return { id: l.id, icon: l.icon, iconColor: l.iconColor, label: l.label, action: function () { insertCodeBlock(l.lang); } };
                        })
                    }
                ]
            },
            {
                id: 'list',
                icon: 'fa-list-ul',
                label: t('slash_menu.list', null, 'List'),
                submenu: [
                    { id: 'bullets', icon: 'fa-list-ul', label: t('slash_menu.bullet_list', null, 'Bullet list'), action: () => insertList(false) },
                    { id: 'numbers', icon: 'fa-list-ol', label: t('slash_menu.numbered_list', null, 'Numbered list'), action: () => insertList(true) },
                    {
                        id: 'checklist',
                        icon: 'fa-list-check',
                        label: t('slash_menu.checklist', null, 'Checklist'),
                        action: () => {
                            if (typeof window.insertChecklist === 'function') {
                                window.insertChecklist();
                            }
                        }
                    }
                ]
            },
            {
                id: 'quote',
                icon: 'fa-info-circle',
                label: t('slash_menu.quote', null, 'Quote'),
                submenu: CALLOUT_TYPES.map(function (c) {
                    return { id: c.id, label: t(c.labelKey, null, c.fallback), action: function () { insertCallout(c.id); } };
                })
            },
            {
                id: 'insert',
                icon: 'fa-plus',
                label: t('slash_menu.insert', null, 'Insert'),
                submenu: [
                    {
                        id: 'toggle',
                        icon: 'fa-caret-down',
                        label: t('slash_menu.toggle', null, 'Toggle'),
                        action: function () {
                            insertToggle();
                        }
                    },
                    {
                        id: 'date',
                        icon: 'fa-calendar-alt',
                        label: t('slash_menu.date', null, 'Date'),
                        mobileHidden: true,
                        action: function () {
                            insertDate();
                        }
                    },
                    common.excalidraw,
                    common.emoji,
                    {
                        id: 'table',
                        icon: 'fa-table',
                        label: t('slash_menu.table', null, 'Table'),
                        action: function () {
                            if (typeof window.toggleTablePicker === 'function') {
                                window.toggleTablePicker();
                            }
                        }
                    },
                    {
                        id: 'separator',
                        icon: 'fa-minus',
                        label: t('slash_menu.separator', null, 'Separator'),
                        action: function () {
                            if (typeof window.insertSeparator === 'function') {
                                window.insertSeparator();
                            }
                        }
                    }
                ]
            },
            {
                id: 'link-menu',
                icon: 'fa-link',
                label: t('slash_menu.link', null, 'Link'),
                submenu: [
                    {
                        id: 'link',
                        icon: 'fa fa-link',
                        label: t('slash_menu.link', null, 'Link'),
                        action: function () {
                            if (typeof window.showLinkModal === 'function') {
                                // Save the note entry and editable element before they get cleared
                                const noteEntry = savedNoteEntry;
                                const editableElement = savedEditableElement;

                                // Get current selection if any
                                const sel = window.getSelection();
                                const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
                                const selectedText = hasSelection ? sel.toString() : '';

                                // Save the current range/position, with fallback to the
                                // range saved by executeCommand (in case hideSlashMenu lost it)
                                let savedRange = null;
                                if (sel && sel.rangeCount > 0) {
                                    savedRange = sel.getRangeAt(0).cloneRange();
                                }
                                if (!savedRange && window._slashCommandSavedRange) {
                                    savedRange = window._slashCommandSavedRange.cloneRange();
                                }

                                window.showLinkModal('https://', selectedText, function (url, text) {
                                    if (!url) return;

                                    // Create a new link element
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.textContent = text || url;
                                    a.target = '_blank';
                                    a.rel = 'noopener noreferrer';

                                    // Focus the editable element first
                                    if (editableElement) {
                                        editableElement.focus();
                                    }

                                    // Restore selection and insert link
                                    try {
                                        const sel = window.getSelection();
                                        if (savedRange) {
                                            sel.removeAllRanges();
                                            sel.addRange(savedRange);

                                            // Replace the selected text with the link
                                            savedRange.deleteContents();
                                            savedRange.insertNode(a);

                                            // Position cursor after the link
                                            const newRange = document.createRange();
                                            newRange.setStartAfter(a);
                                            newRange.setEndAfter(a);
                                            sel.removeAllRanges();
                                            sel.addRange(newRange);
                                        } else if (sel && sel.rangeCount > 0) {
                                            // Fallback: insert at current position
                                            const range = sel.getRangeAt(0);
                                            range.insertNode(a);
                                            range.setStartAfter(a);
                                            range.setEndAfter(a);
                                            sel.removeAllRanges();
                                            sel.addRange(range);
                                        } else if (editableElement) {
                                            // Last resort: append to editable element
                                            editableElement.appendChild(a);
                                        }
                                    } catch (e) {
                                        console.error('Error inserting link:', e);
                                        // Absolute fallback
                                        if (editableElement) {
                                            editableElement.appendChild(a);
                                        }
                                    }

                                    // Trigger input event for autosave
                                    if (noteEntry) {
                                        noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
                                    }

                                    // Save the note
                                    if (typeof window.saveNoteImmediately === 'function') {
                                        window.saveNoteImmediately();
                                    }
                                });
                            }
                        }
                    },
                    common.noteReference
                ]
            },
            {
                id: 'media',
                icon: 'fa-image',
                label: t('slash_menu.media', null, 'Media'),
                submenu: [
                    common.image,
                    {
                        id: 'youtube',
                        icon: 'fa fa-video',
                        label: t('slash_menu.youtube_video', null, 'YouTube video'),
                        action: function () {
                            if (typeof window.insertYouTubeVideo === 'function') {
                                window.insertYouTubeVideo();
                            }
                        }
                    },
                    {
                        id: 'mp4-video',
                        icon: 'fal fa-video',
                        label: t('slash_menu.mp4_video', null, 'MP4 video'),
                        action: function () {
                            if (typeof window.insertMp4Video === 'function') {
                                window.insertMp4Video();
                            }
                        }
                    },
                    {
                        id: 'audio-file',
                        icon: 'fal fa-music',
                        label: t('slash_menu.audio', null, 'Audio'),
                        action: function () {
                            if (typeof window.insertAudioFile === 'function') {
                                window.insertAudioFile();
                            }
                        }
                    }
                ]
            },
            common.cancel
        ];
    }

    // Slash command menu items for Markdown notes (edit mode)
    // Keep labels close to the HTML menu, but insert Markdown syntax.
    // Return slash menu commands for Markdown notes
    function getMarkdownSlashCommands() {
        const t = window.t || ((key, params, fallback) => fallback);
        var common = getCommonSlashCommands();
        return [
            {
                id: 'title',
                icon: 'fa-text-height',
                label: t('slash_menu.title', null, 'Title'),
                submenu: [
                    { id: 'h1', label: t('slash_menu.heading_1', null, 'Heading 1'), action: () => insertMarkdownPrefixAtLineStart('# ') },
                    { id: 'h2', label: t('slash_menu.heading_2', null, 'Heading 2'), action: () => insertMarkdownPrefixAtLineStart('## ') },
                    { id: 'h3', label: t('slash_menu.heading_3', null, 'Heading 3'), action: () => insertMarkdownPrefixAtLineStart('### ') }
                ]
            },
            {
                id: 'format',
                icon: 'fa-bold',
                label: t('slash_menu.format_text', null, 'Format text'),
                submenu: [
                    { id: 'bold', icon: 'fa-bold', label: t('slash_menu.bold', null, 'Bold'), action: () => wrapMarkdownSelection('**', '**', 2) },
                    { id: 'italic', icon: 'fa-italic', label: t('slash_menu.italic', null, 'Italic'), action: () => wrapMarkdownSelection('*', '*', 1) },
                    { id: 'strikethrough', icon: 'fa-strikethrough', label: t('slash_menu.strikethrough', null, 'Strikethrough'), action: () => wrapMarkdownSelection('~~', '~~', 2) }
                ]
            },
            {
                id: 'code',
                icon: 'fa-code',
                label: t('slash_menu.code', null, 'Code'),
                submenu: [
                    { id: 'inline-code', icon: 'fa-terminal', label: t('slash_menu.inline_code', null, 'Inline code'), action: () => wrapMarkdownSelection('`', '`', 1) },
                    {
                        id: 'block-languages',
                        icon: 'fa-laptop-code',
                        label: t('slash_menu.block_languages', null, 'Block Languages'),
                        submenu: CODE_BLOCK_LANGUAGES.map(function (l) {
                            return { id: l.id, icon: l.icon, iconColor: l.iconColor, label: l.label, action: function () { insertMarkdownAtCursor('```' + l.lang + '\n\n```\n', -5); } };
                        })
                    }
                ]
            },
            {
                id: 'list',
                icon: 'fa-list-ul',
                label: t('slash_menu.list', null, 'List'),
                submenu: [
                    { id: 'bullets', icon: 'fa-list-ul', label: t('slash_menu.bullet_list', null, 'Bullet list'), action: () => insertMarkdownPrefixAtLineStart('- ') },
                    { id: 'numbers', icon: 'fa-list-ol', label: t('slash_menu.numbered_list', null, 'Numbered list'), action: () => insertMarkdownPrefixAtLineStart('1. ') },
                    { id: 'checklist', icon: 'fa-list-check', label: t('slash_menu.checklist', null, 'Checklist'), action: () => insertMarkdownPrefixAtLineStart('- [ ] ') }
                ]
            },
            {
                id: 'quote',
                icon: 'fa-info-circle',
                label: t('slash_menu.quote', null, 'Quote'),
                submenu: CALLOUT_TYPES.map(function (c) {
                    var prefix = c.id === 'plain' ? '> ' : '> ' + c.fallback + '\n> ';
                    return { id: c.id, label: t(c.labelKey, null, c.fallback), action: function () { insertMarkdownAtCursor(prefix, 0); } };
                })
            },
            {
                id: 'color',
                icon: 'fa-palette',
                label: t('slash_menu.color', null, 'Color'),
                submenu: [
                    { id: 'red', icon: 'fa-circle', iconColor: '#e74c3c', label: t('slash_menu.color_red', null, 'Red'), action: () => wrapMarkdownSelection('<span style="color:#e74c3c">', '</span>') },
                    { id: 'blue', icon: 'fa-circle', iconColor: '#3498db', label: t('slash_menu.color_blue', null, 'Blue'), action: () => wrapMarkdownSelection('<span style="color:#3498db">', '</span>') },
                    { id: 'green', icon: 'fa-circle', iconColor: '#2ecc71', label: t('slash_menu.color_green', null, 'Green'), action: () => wrapMarkdownSelection('<span style="color:#2ecc71">', '</span>') },
                    { id: 'yellow', icon: 'fa-circle', iconColor: '#f1c40f', label: t('slash_menu.color_yellow', null, 'Yellow'), action: () => wrapMarkdownSelection('<span style="color:#f1c40f">', '</span>') },
                    { id: 'purple', icon: 'fa-circle', iconColor: '#9b59b6', label: t('slash_menu.color_purple', null, 'Purple'), action: () => wrapMarkdownSelection('<span style="color:#9b59b6">', '</span>') },
                    { id: 'orange', icon: 'fa-circle', iconColor: '#e67e22', label: t('slash_menu.color_orange', null, 'Orange'), action: () => wrapMarkdownSelection('<span style="color:#e67e22">', '</span>') },
                    { id: 'bg-yellow', icon: 'fa-fill-drip', iconColor: '#f1c40f', label: t('slash_menu.bg_yellow', null, 'Yellow background'), action: () => wrapMarkdownSelection('<span style="background-color:#f1c40f">', '</span>') }
                ]
            },
            {
                id: 'insert',
                icon: 'fa-plus',
                label: t('slash_menu.insert', null, 'Insert'),
                submenu: [
                    {
                        id: 'toggle',
                        icon: 'fa-caret-down',
                        label: t('slash_menu.toggle', null, 'Toggle'),
                        action: function () {
                            // Automatically add empty lines before and after for better spacing
                            insertMarkdownAtCursor('\n\n<details class="toggle-block" open>\n<summary class="toggle-header">Toggle</summary>\n\n...\n\n</details>\n\n', -17);
                        }
                    },
                    {
                        id: 'date',
                        icon: 'fa-calendar-alt',
                        label: t('slash_menu.date', null, 'Date'),
                        mobileHidden: true,
                        action: function () {
                            insertDateMarkdown();
                        }
                    },
                    common.emoji,
                    {
                        id: 'table',
                        icon: 'fa-table',
                        label: t('slash_menu.table', null, 'Table'),
                        action: function () {
                            insertMarkdownAtCursor('| Column | Column |\n| --- | --- |\n|  |  |\n', 0);
                        }
                    },
                    {
                        id: 'separator',
                        icon: 'fa-minus',
                        label: t('slash_menu.separator', null, 'Separator'),
                        action: function () {
                            insertMarkdownAtCursor('\n---\n', 0);
                        }
                    }
                ]
            },
            {
                id: 'link-menu',
                icon: 'fa-link',
                label: t('slash_menu.link', null, 'Link'),
                submenu: [
                    {
                        id: 'link',
                        icon: 'fa fa-link',
                        label: t('slash_menu.link', null, 'Link'),
                        action: function () {
                            if (typeof window.showLinkModal === 'function') {
                                // Get current selection if any
                                const sel = window.getSelection();
                                const hasSelection = sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;
                                const selectedText = hasSelection ? sel.toString() : '';

                                // Save the current range/position, with fallback to the
                                // range saved by executeCommand (in case hideSlashMenu lost it)
                                let savedRange = null;
                                if (sel && sel.rangeCount > 0) {
                                    savedRange = sel.getRangeAt(0).cloneRange();
                                }
                                if (!savedRange && window._slashCommandSavedRange) {
                                    savedRange = window._slashCommandSavedRange.cloneRange();
                                }

                                // Find the editor for focus purpose later
                                let editor = savedEditableElement;
                                if (!editor || !editor.classList.contains('markdown-editor')) {
                                    editor = getCurrentMarkdownEditorFromSelection();
                                }

                                window.showLinkModal('https://', selectedText, function (url, linkText) {
                                    if (!url) return;

                                    const linkMarkdown = '[' + (linkText || url || 'link') + '](' + url + ')';

                                    // Focus the editor first
                                    if (editor) {
                                        try { editor.focus(); } catch (e) { }
                                    }

                                    // Restore selection and insert link using DOM insertion (more robust than execCommand)
                                    try {
                                        if (savedRange) {
                                            const selection = window.getSelection();
                                            selection.removeAllRanges();
                                            selection.addRange(savedRange);

                                            // Use the same approach as insertMarkdownAtCursor for robustness
                                            const range = selection.getRangeAt(0);
                                            range.deleteContents();
                                            const node = document.createTextNode(linkMarkdown);
                                            range.insertNode(node);

                                            // Position cursor after the inserted link
                                            const newRange = document.createRange();
                                            newRange.setStart(node, linkMarkdown.length);
                                            newRange.collapse(true);
                                            selection.removeAllRanges();
                                            selection.addRange(newRange);
                                        } else if (editor) {
                                            // Fallback: insert at end of editor
                                            const range = document.createRange();
                                            range.selectNodeContents(editor);
                                            range.collapse(false);
                                            const node = document.createTextNode(linkMarkdown);
                                            range.insertNode(node);
                                            
                                            const newRange = document.createRange();
                                            newRange.setStart(node, linkMarkdown.length);
                                            newRange.collapse(true);
                                            const selection = window.getSelection();
                                            selection.removeAllRanges();
                                            selection.addRange(newRange);
                                        }
                                    } catch (e) {
                                        console.error('Error inserting markdown link:', e);
                                    }

                                    // Trigger input event for autosave
                                    if (editor) {
                                        try {
                                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                                        } catch (e) { }
                                    }
                                });
                            }
                        }
                    },
                    common.noteReference
                ]
            },
            {
                id: 'media',
                icon: 'fa-image',
                label: t('slash_menu.media', null, 'Media'),
                submenu: [
                    common.image,
                    {
                        id: 'youtube',
                        icon: 'fa fa-video',
                        label: t('slash_menu.youtube_video', null, 'YouTube video'),
                        action: function () {
                            if (typeof window.insertYouTubeVideoMarkdown === 'function') {
                                window.insertYouTubeVideoMarkdown();
                            }
                        }
                    },
                    {
                        id: 'mp4-video',
                        icon: 'fal fa-video',
                        label: t('slash_menu.mp4_video', null, 'MP4 video'),
                        action: function () {
                            if (typeof window.insertMp4VideoMarkdown === 'function') {
                                window.insertMp4VideoMarkdown();
                            }
                        }
                    },
                    {
                        id: 'audio-file',
                        icon: 'fal fa-music',
                        label: t('slash_menu.audio', null, 'Audio'),
                        action: function () {
                            if (typeof window.insertAudioFileMarkdown === 'function') {
                                window.insertAudioFileMarkdown();
                            }
                        }
                    }
                ]
            },
            common.cancel
        ];
    }

    // Get current editor context (note type, DOM elements)
    function getEditorContext() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return false;

        const range = selection.getRangeAt(0);
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentNode;

        const editableElement = container.closest && container.closest('[contenteditable="true"]');
        const noteEntry = container.closest && container.closest('.noteentry');

        if (!editableElement || !noteEntry) return null;

        const noteType = noteEntry.getAttribute('data-note-type');
        if (noteType === 'tasklist') return null;

        if (noteType === 'markdown') {
            // Slash menu only in Markdown edit mode (inside .markdown-editor)
            if (!editableElement.classList || !editableElement.classList.contains('markdown-editor')) return null;
            try {
                if (window.getComputedStyle(editableElement).display === 'none') return null;
            } catch (e) { }
        }

        return { noteType: noteType || 'note', noteEntry, editableElement };
    }

    // Filter slash menu commands based on search text
    function getFilteredCommands(searchText) {
        const isMobile = window.innerWidth < 768;
        const commands = (activeCommands || getSlashCommands()).filter(cmd => {
            if (isMobile && cmd.mobileHidden) return false;
            if (!isMobile && cmd.mobileOnly) return false;
            return true;
        });

        if (!searchText) return commands;

        const search = removeAccents(searchText.toLowerCase());
        const results = [];

        // Flatten the menu structure when filtering
        commands.forEach(cmd => {
            // Check if main command label matches
            const cmdMatches = cmd.label && removeAccents(cmd.label.toLowerCase()).includes(search);

            if (cmdMatches && (!cmd.submenu || cmd.submenu.length === 0)) {
                // Command without submenu matches - add it directly
                results.push(cmd);
            } else if (cmdMatches && cmd.submenu && cmd.submenu.length > 0) {
                // Command with submenu matches - add all submenu items directly
                cmd.submenu.forEach(subItem => {
                    if (subItem.submenu && subItem.submenu.length > 0) {
                        // If submenu item has sub-submenu, add all sub-submenu items
                        subItem.submenu.forEach(subSubItem => {
                            results.push({
                                ...subSubItem,
                                label: cmd.label + ' › ' + subItem.label + ' › ' + subSubItem.label,
                                _originalLabel: subSubItem.label
                            });
                        });
                    } else {
                        results.push({
                            ...subItem,
                            label: cmd.label + ' › ' + subItem.label,
                            _originalLabel: subItem.label
                        });
                    }
                });
            } else if (cmd.submenu && cmd.submenu.length > 0) {
                // Command doesn't match but might have matching submenu items
                cmd.submenu.forEach(subItem => {
                    const subItemMatches = subItem.label && removeAccents(subItem.label.toLowerCase()).includes(search);

                    if (subItemMatches && (!subItem.submenu || subItem.submenu.length === 0)) {
                        // Submenu item matches and has no sub-submenu
                        results.push({
                            ...subItem,
                            label: cmd.label + ' › ' + subItem.label,
                            _originalLabel: subItem.label
                        });
                    } else if (subItemMatches && subItem.submenu && subItem.submenu.length > 0) {
                        // Submenu item matches and has sub-submenu - add all sub-submenu items
                        subItem.submenu.forEach(subSubItem => {
                            results.push({
                                ...subSubItem,
                                label: cmd.label + ' › ' + subItem.label + ' › ' + subSubItem.label,
                                _originalLabel: subSubItem.label
                            });
                        });
                    } else if (subItem.submenu && subItem.submenu.length > 0) {
                        // Submenu item doesn't match but might have matching sub-submenu items
                        subItem.submenu.forEach(subSubItem => {
                            if (subSubItem.label && removeAccents(subSubItem.label.toLowerCase()).includes(search)) {
                                results.push({
                                    ...subSubItem,
                                    label: cmd.label + ' › ' + subItem.label + ' › ' + subSubItem.label,
                                    _originalLabel: subSubItem.label
                                });
                            }
                        });
                    }
                });
            }
        });

        return results;
    }

    // Build slash menu HTML
    function buildMenuHTML() {
        if (!filteredCommands.length) {
            return '<div class="slash-command-empty">No results</div>';
        }

        return filteredCommands
            .map((cmd, idx) => {
                const selectedClass = idx === selectedIndex ? ' selected' : '';
                const hasSubmenu = cmd.submenu && cmd.submenu.length > 0;
                const submenuIndicator = hasSubmenu ? '<i class="fa fa-chevron-right slash-command-submenu-indicator"></i>' : '';
                const iconStyle = cmd.iconColor ? ' style="color: ' + cmd.iconColor + ';"' : '';
                return (
                    '<div class="slash-command-item' + selectedClass + '" data-command-id="' + cmd.id + '" data-has-submenu="' + hasSubmenu + '">' +
                    '<i class="slash-command-icon fa ' + cmd.icon + '"' + iconStyle + '></i>' +
                    '<span class="slash-command-label">' + escapeHtml(cmd.label) + '</span>' +
                    submenuIndicator +
                    '</div>'
                );
            })
            .join('');
    }

    // Build submenu HTML for level 2 menu items
    function buildSubmenuHTML(items) {
        const isMobile = window.innerWidth < 768;
        const t = window.t || ((key, params, fallback) => fallback);

        let html = '';

        // Add back button on mobile
        if (isMobile) {
            html += '<div class="slash-command-item slash-command-back" data-action="back">' +
                '<i class="fa fa-arrow-left" style="margin-right: 8px; width: 16px; display: inline-block; text-align: center;"></i>' +
                '<span class="slash-command-label">' + escapeHtml(t('slash_menu.back', null, 'Back')) + '</span>' +
                '</div>';
        }

        html += items
            .filter(item => !isMobile || !item.mobileHidden)
            .map((item, idx) => {
                const selectedClass = idx === selectedSubmenuIndex ? ' selected' : '';
                const hasSubmenu = item.submenu && item.submenu.length > 0;
                const submenuIndicator = hasSubmenu ? '<i class="fa fa-chevron-right slash-command-submenu-indicator"></i>' : '';
                const iconStyle = item.iconColor ? ' style="margin-right: 8px; width: 16px; display: inline-block; text-align: center; color: ' + item.iconColor + ';"' : ' style="margin-right: 8px; width: 16px; display: inline-block; text-align: center;"';
                const iconHtml = item.icon ? '<i class="slash-command-icon fa ' + item.icon + '"' + iconStyle + '></i>' : '';
                return (
                    '<div class="slash-command-item' + selectedClass + '" data-submenu-id="' + item.id + '" data-has-sub-submenu="' + hasSubmenu + '">' +
                    iconHtml +
                    '<span class="slash-command-label">' + escapeHtml(item.label) + '</span>' +
                    submenuIndicator +
                    '</div>'
                );
            })
            .join('');

        return html;
    }

    // Build sub-submenu HTML for level 3 menu items
    function buildSubSubmenuHTML(items) {
        const isMobile = window.innerWidth < 768;
        const t = window.t || ((key, params, fallback) => fallback);

        let html = '';

        // Add back button on mobile
        if (isMobile) {
            html += '<div class="slash-command-item slash-command-back" data-action="back-sub">' +
                '<i class="fa fa-arrow-left" style="margin-right: 8px; width: 16px; display: inline-block; text-align: center;"></i>' +
                '<span class="slash-command-label">' + escapeHtml(t('slash_menu.back', null, 'Back')) + '</span>' +
                '</div>';
        }

        html += items
            .map((item, idx) => {
                const selectedClass = idx === selectedSubSubmenuIndex ? ' selected' : '';
                const iconStyle = item.iconColor ? ' style="margin-right: 8px; color: ' + item.iconColor + ';"' : ' style="margin-right: 8px;"';
                const iconHtml = item.icon ? '<i class="slash-command-icon ' + item.icon + '"' + iconStyle + '></i>' : '';
                return (
                    '<div class="slash-command-item' + selectedClass + '" data-sub-submenu-id="' + item.id + '">' +
                    iconHtml +
                    '<span class="slash-command-label">' + escapeHtml(item.label) + '</span>' +
                    '</div>'
                );
            })
            .join('');

        return html;
    }

    // Escape HTML special characters to prevent XSS
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Position slash menu near the cursor or selection range
    function positionMenu(range) {
        if (!slashMenuElement) return;

        const rect = range.getBoundingClientRect();
        const menuRect = slashMenuElement.getBoundingClientRect();
        const isMobile = window.innerWidth < 768;

        const padding = 8;

        if (isMobile) {
            // On mobile, center horizontally and position near cursor
            const menuWidth = menuRect.width || 360;
            const x = Math.max(padding, (window.innerWidth - menuWidth) / 2);
            // Position below cursor, but ensure it fits on screen
            let y = rect.bottom + 10;
            // If menu would go below viewport, position above cursor instead
            if (y + menuRect.height > window.innerHeight - padding) {
                y = Math.max(padding, rect.top - menuRect.height - 10);
            }
            slashMenuElement.style.left = x + 'px';
            slashMenuElement.style.top = y + 'px';
        } else {
            const x = Math.min(rect.left, window.innerWidth - menuRect.width - padding);
            const y = Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - padding);
            slashMenuElement.style.left = Math.max(padding, x) + 'px';
            slashMenuElement.style.top = Math.max(padding, y) + 'px';
        }
    }

    // Hide and cleanup sub-submenu (level 3)
    function hideSubSubmenu() {
        if (!subSubmenuElement) return;

        try {
            subSubmenuElement.removeEventListener('mousedown', handleMenuMouseDown);
            subSubmenuElement.removeEventListener('click', handleSubSubmenuClick);
            subSubmenuElement.removeEventListener('touchend', handleSubSubmenuTouchEnd);
        } catch (e) { }

        try {
            subSubmenuElement.remove();
        } catch (e) {
            if (subSubmenuElement.parentNode) subSubmenuElement.parentNode.removeChild(subSubmenuElement);
        }

        subSubmenuElement = null;
        currentSubSubmenu = null;
        selectedSubSubmenuIndex = 0;
    }

    // Hide and cleanup submenu (level 2)
    function hideSubmenu() {
        if (!submenuElement) return;

        hideSubSubmenu();

        try {
            submenuElement.removeEventListener('mousedown', handleMenuMouseDown);
            submenuElement.removeEventListener('click', handleSubmenuClick);
            submenuElement.removeEventListener('touchend', handleSubmenuTouchEnd);
            submenuElement.removeEventListener('mouseover', handleSubmenuMouseOver);
        } catch (e) { }

        try {
            submenuElement.remove();
        } catch (e) {
            if (submenuElement.parentNode) submenuElement.parentNode.removeChild(submenuElement);
        }

        submenuElement = null;
        currentSubmenu = null;
        selectedSubmenuIndex = 0;
    }

    // Hide slash menu and all its submenus
    function hideSlashMenu() {
        if (!slashMenuElement) return;

        hideSubmenu();

        try {
            slashMenuElement.removeEventListener('mousedown', handleMenuMouseDown);
            slashMenuElement.removeEventListener('click', handleMenuClick);
            slashMenuElement.removeEventListener('mouseover', handleMenuMouseOver);
        } catch (e) { }

        try {
            slashMenuElement.remove();
        } catch (e) {
            if (slashMenuElement.parentNode) slashMenuElement.parentNode.removeChild(slashMenuElement);
        }

        slashMenuElement = null;
        selectedIndex = 0;
        filteredCommands = [];
        slashTextNode = null;
        slashOffset = -1;
        filterText = '';

        // Restore cursor in case it was hidden
        document.body.style.cursor = '';
    }

    // Show slash menu for an input field (title)
    function showSlashMenuForInput(input, pos) {
        hideSlashMenu();

        // Save context
        savedEditableElement = input;
        savedNoteEntry = input.closest('.notecard');

        // Mark slash position
        slashOffset = pos - 1;

        const ctx = { noteType: 'title', noteEntry: savedNoteEntry, editableElement: input };

        activeCommands = getTitleSlashCommands();
        filterText = '';
        selectedIndex = 0;
        filteredCommands = getFilteredCommands('');

        slashMenuElement = document.createElement('div');
        slashMenuElement.className = 'slash-command-menu';
        slashMenuElement.innerHTML = buildMenuHTML();

        document.body.appendChild(slashMenuElement);

        // Position menu for input
        const rect = input.getBoundingClientRect();

        // Measure text width up to cursor to position horizontally
        const styles = window.getComputedStyle(input);
        const span = document.createElement('span');
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';

        // Copy relevant font properties safely
        span.style.fontFamily = styles.fontFamily;
        span.style.fontSize = styles.fontSize;
        span.style.fontWeight = styles.fontWeight;
        span.style.fontStyle = styles.fontStyle;
        span.style.letterSpacing = styles.letterSpacing;
        span.style.textTransform = styles.textTransform;
        span.style.whiteSpace = 'pre';

        span.textContent = input.value.substring(0, pos);
        document.body.appendChild(span);
        const textWidth = span.getBoundingClientRect().width;
        document.body.removeChild(span);

        // Position: left = input rect left + paddingWidth + text width - scroll
        const menuRect = slashMenuElement.getBoundingClientRect();
        const padding = 8;

        const paddingLeft = parseFloat(styles.paddingLeft) || 0;
        const scrollLeft = input.scrollLeft || 0;

        // Calculate caret position relative to viewport
        let x = rect.left + paddingLeft + textWidth - scrollLeft;
        let y = rect.bottom + 6;

        // Boundary checks
        if (x + menuRect.width > window.innerWidth - padding) {
            x = window.innerWidth - menuRect.width - padding;
        }
        // Ensure menu doesn't start off-screen left
        x = Math.max(padding, x);

        if (y + menuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, rect.top - menuRect.height - 6);
        }

        slashMenuElement.style.left = x + 'px';
        slashMenuElement.style.top = y + 'px';

        requestAnimationFrame(() => {
            if (slashMenuElement) slashMenuElement.classList.add('show');
        });

        slashMenuElement.addEventListener('mousedown', handleMenuMouseDown);
        slashMenuElement.addEventListener('click', handleMenuClick);
        slashMenuElement.addEventListener('mouseover', handleMenuMouseOver);

        // Hide cursor until mouse moves (desktop only)
        const isMobile = window.innerWidth < 768;
        if (!isMobile) {
            document.body.style.cursor = 'none';
            const showCursor = () => {
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', showCursor);
            };
            document.addEventListener('mousemove', showCursor);
        }
    }

    // Update slash menu content based on current filter text
    function updateMenuContent() {
        if (!slashMenuElement) return;

        hideSubmenu();
        filteredCommands = getFilteredCommands(filterText);
        selectedIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));
        slashMenuElement.innerHTML = buildMenuHTML();
    }

    // Display submenu (level 2) for a command with subcommands
    function showSubmenu(cmd, parentItem) {
        if (!cmd.submenu || !cmd.submenu.length) return;

        hideSubmenu();

        currentSubmenu = cmd.submenu;
        selectedSubmenuIndex = 0;

        submenuElement = document.createElement('div');
        submenuElement.className = 'slash-command-menu slash-command-submenu';
        submenuElement.innerHTML = buildSubmenuHTML(cmd.submenu);

        document.body.appendChild(submenuElement);

        // Position to the right of parent item
        const parentRect = parentItem.getBoundingClientRect();
        const submenuRect = submenuElement.getBoundingClientRect();

        const padding = 8;
        let x = parentRect.right + 4;
        let y = parentRect.top;

        // If overflows to the right, display to the left
        if (x + submenuRect.width > window.innerWidth - padding) {
            x = parentRect.left - submenuRect.width - 4;
        }

        // If overflows at the bottom
        if (y + submenuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, window.innerHeight - submenuRect.height - padding);
        }

        submenuElement.style.left = Math.max(padding, x) + 'px';
        submenuElement.style.top = Math.max(padding, y) + 'px';

        requestAnimationFrame(() => {
            if (submenuElement) submenuElement.classList.add('show');
        });

        submenuElement.addEventListener('mousedown', handleMenuMouseDown);
        submenuElement.addEventListener('click', handleSubmenuClick);
        submenuElement.addEventListener('touchend', handleSubmenuTouchEnd);
        submenuElement.addEventListener('mouseover', handleSubmenuMouseOver);
    }

    // Display sub-submenu (level 3) for nested menu items
    function showSubSubmenu(item, parentItem) {
        if (!item.submenu || !item.submenu.length) return;

        hideSubSubmenu();

        currentSubSubmenu = item.submenu;
        selectedSubSubmenuIndex = 0;

        subSubmenuElement = document.createElement('div');
        subSubmenuElement.className = 'slash-command-menu slash-command-submenu';
        subSubmenuElement.innerHTML = buildSubSubmenuHTML(item.submenu);

        document.body.appendChild(subSubmenuElement);

        // Position to the right of parent item
        const parentRect = parentItem.getBoundingClientRect();
        const submenuRect = subSubmenuElement.getBoundingClientRect();

        const padding = 8;
        let x = parentRect.right + 4;
        let y = parentRect.top;

        // If overflows to the right, display to the left
        if (x + submenuRect.width > window.innerWidth - padding) {
            x = parentRect.left - submenuRect.width - 4;
        }

        // If overflows at the bottom
        if (y + submenuRect.height > window.innerHeight - padding) {
            y = Math.max(padding, window.innerHeight - submenuRect.height - padding);
        }

        subSubmenuElement.style.left = Math.max(padding, x) + 'px';
        subSubmenuElement.style.top = Math.max(padding, y) + 'px';

        requestAnimationFrame(() => {
            if (subSubmenuElement) subSubmenuElement.classList.add('show');
        });

        subSubmenuElement.addEventListener('mousedown', handleMenuMouseDown);
        subSubmenuElement.addEventListener('click', handleSubSubmenuClick);
        subSubmenuElement.addEventListener('touchend', handleSubSubmenuTouchEnd);
    }

    // Delete slash text and search
    function deleteSlashText() {
        try {
            // Handle input fields (title inputs)
            if (savedEditableElement && savedEditableElement.tagName === 'INPUT') {
                const input = savedEditableElement;
                const text = input.value;
                const start = slashOffset;

                if (start < 0 || start >= text.length) return;

                // Find the end of the slash command text
                // Only delete the slash and the filter text that was typed
                let end = start + 1 + filterText.length;

                // Remove the slash and filter text only
                input.value = text.substring(0, start) + text.substring(end);

                // Position cursor where the slash was
                input.selectionStart = input.selectionEnd = start;

                // Trigger input event
                input.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            
            // Handle contenteditable elements
            if (!slashTextNode || slashOffset < 0 || !slashTextNode.parentNode) {
                return;
            }

            // Obtenir la position actuelle du curseur
            const sel = window.getSelection();
            let currentOffset = -1;

            if (sel && sel.rangeCount > 0) {
                const currentRange = sel.getRangeAt(0);
                // Check if we're in the correct node
                if (currentRange.startContainer === slashTextNode) {
                    currentOffset = currentRange.startOffset;
                }
            }

            // If we couldn't get the offset (e.g. mobile blurred), use filterText
            if (currentOffset === -1) {
                const textContent = slashTextNode.textContent || '';
                // The end offset is slashOffset + 1 (for the '/') + filter length
                // Use the current length of text after slash as fallback
                const textAfterSlash = textContent.substring(slashOffset + 1);
                const spaceIndex = textAfterSlash.search(/[\s\n]/);
                const actualFilterLength = spaceIndex >= 0 ? spaceIndex : textAfterSlash.length;
                currentOffset = slashOffset + 1 + actualFilterLength;
            }

            const text = slashTextNode.textContent;
            // Safety: we don't want to delete less than the slash itself
            const safeEndOffset = Math.max(slashOffset + 1, Math.min(text.length, currentOffset));

            const before = text.substring(0, slashOffset);
            const after = text.substring(safeEndOffset);
            const result = before + after;

            // If the line became effectively empty, add a ZWSP to keep it from collapsing visually.
            // This prevents the cursor from jumping to the previous line when deleting the slash.
            if (result === '') {
                slashTextNode.textContent = '\u200B';
            } else {
                slashTextNode.textContent = result;
            }

            // Replace cursor where the slash was deleted
            if (sel) {
                const newRange = document.createRange();
                try {
                    const finalPos = Math.min(slashTextNode.textContent.length, slashOffset);
                    if (result === '') {
                        // If we added a ZWSP, select it so it gets replaced by the next insertion
                        newRange.setStart(slashTextNode, 0);
                        newRange.setEnd(slashTextNode, 1);
                    } else {
                        newRange.setStart(slashTextNode, finalPos);
                        newRange.collapse(true);
                    }
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } catch (e) {
                    // Fallback if node has an issue
                }
            }

            const target = savedEditableElement || savedNoteEntry;
            if (target) {
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (e) {
            console.error('Error deleting slash text:', e);
        }
    }

    // Execute a slash command action and cleanup
    function executeCommand(commandId, isSubmenuItem, isSubSubmenuItem) {
        let actionToExecute = null;
        let foundCmd = null;

        if (isSubSubmenuItem && currentSubSubmenu) {
            const item = currentSubSubmenu.find(i => i.id === commandId);
            if (item && item.action) {
                actionToExecute = item.action;
                foundCmd = item;
            }
        } else if (isSubmenuItem && currentSubmenu) {
            const item = currentSubmenu.find(i => i.id === commandId);
            if (item) {
                // If this item has a submenu, display it
                if (item.submenu && item.submenu.length > 0) {
                    const menuItem = submenuElement.querySelector('[data-submenu-id="' + commandId + '"]');
                    if (menuItem) {
                        showSubSubmenu(item, menuItem);
                    }
                    return;
                }
                if (item.action) {
                    actionToExecute = item.action;
                    foundCmd = item;
                }
            }
        } else {
            // First try to find in filtered commands (for flattened results)
            const filteredCmd = filteredCommands.find(c => c.id === commandId);
            if (filteredCmd && filteredCmd.action) {
                actionToExecute = filteredCmd.action;
                foundCmd = filteredCmd;
            } else {
                // Fallback to original commands
                const cmd = (activeCommands || getSlashCommands()).find(c => c.id === commandId);
                if (!cmd) return;

                // If command has a submenu, display it instead of executing
                if (cmd.submenu && cmd.submenu.length > 0) {
                    const item = slashMenuElement.querySelector('[data-command-id="' + commandId + '"]');
                    if (item) {
                        showSubmenu(cmd, item);
                    }
                    return;
                }

                if (cmd.action) {
                    actionToExecute = cmd.action;
                    foundCmd = cmd;
                }
            }
        }

        if (!actionToExecute) {
            return;
        }

        // On mobile, restore focus before deleting text to ensure
        // that the selection is properly taken into account if possible by deleteSlashText.
        const isMobile = window.innerWidth < 768;
        if (isMobile && savedEditableElement) {
            try { savedEditableElement.focus(); } catch (e) { }
        }

        // Delete the slash and filter text (unless keepSlash is true)
        const shouldKeepSlash = foundCmd && foundCmd.keepSlash;
        let cursorRangeAfterDelete = null;
        let inputCursorPosition = null;
        if (!shouldKeepSlash) {
            deleteSlashText();
            // Save cursor position right after deleteSlashText placed it correctly,
            // because hideSlashMenu() removing the menu DOM can cause the browser
            // to lose the selection in the contenteditable.
            try {
                // For INPUT fields, save selectionStart/End
                if (savedEditableElement && savedEditableElement.tagName === 'INPUT') {
                    inputCursorPosition = {
                        start: savedEditableElement.selectionStart,
                        end: savedEditableElement.selectionEnd
                    };
                } else {
                    // For contenteditable, save range
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        cursorRangeAfterDelete = sel.getRangeAt(0).cloneRange();
                    }
                }
            } catch (e) { }
        }

        hideSlashMenu();

        // Restore cursor position that was set by deleteSlashText, in case
        // hideSlashMenu() disrupted it by removing the menu DOM element.
        if (inputCursorPosition && savedEditableElement && savedEditableElement.tagName === 'INPUT') {
            // Restore cursor for INPUT fields
            try {
                savedEditableElement.focus();
                savedEditableElement.setSelectionRange(inputCursorPosition.start, inputCursorPosition.end);
            } catch (e) { }
        } else if (cursorRangeAfterDelete) {
            // Restore cursor for contenteditable
            try {
                if (savedEditableElement) {
                    savedEditableElement.focus();
                }
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(cursorRangeAfterDelete);
            } catch (e) { }
        }
        // Also expose it globally so async modal callbacks (link, note-reference)
        // can use it as a reliable fallback for the cursor position.
        window._slashCommandSavedRange = cursorRangeAfterDelete;
        window._slashCommandInputCursor = inputCursorPosition;

        // Execute command immediately (selection is restored above)
        try {
            actionToExecute();
        } catch (e) {
            console.error('Error executing command:', e);
        }
        window._slashCommandSavedRange = null;
        window._slashCommandInputCursor = null;

        // Re-focus after insertion to avoid caret jumping on focus (skip if keepSlash)
        if (!shouldKeepSlash) {
            if (savedEditableElement) {
                try {
                    savedEditableElement.focus();
                } catch (e) { }
            } else if (savedNoteEntry) {
                try {
                    savedNoteEntry.focus();
                } catch (e) { }
            }
        }

        savedNoteEntry = null;
        savedEditableElement = null;
    }

    // Prevent menu click from losing editor focus
    function handleMenuMouseDown(e) {
        // Prevent editor losing focus before we run the command
        e.preventDefault();
    }

    // Handle click on main menu item
    function handleMenuClick(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const commandId = item.getAttribute('data-command-id');
        if (commandId) executeCommand(commandId, false);
    }

    // Handle click on submenu (level 2) item
    function handleSubmenuClick(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        // Check if it's the back button
        const action = item.getAttribute('data-action');
        if (action === 'back') {
            e.preventDefault();
            e.stopPropagation();
            hideSubmenu();
            return;
        }

        const submenuId = item.getAttribute('data-submenu-id');
        if (submenuId) executeCommand(submenuId, true, false);
    }

    // Handle click on sub-submenu (level 3) item
    function handleSubSubmenuClick(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        // Check if it's the back button
        const action = item.getAttribute('data-action');
        if (action === 'back-sub') {
            e.preventDefault();
            e.stopPropagation();
            hideSubSubmenu();
            return;
        }

        const subSubmenuId = item.getAttribute('data-sub-submenu-id');
        if (subSubmenuId) executeCommand(subSubmenuId, false, true);
    }

    // Touch handlers for Firefox mobile compatibility
    function handleSubmenuTouchEnd(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        // Check if it's the back button
        const action = item.getAttribute('data-action');
        if (action === 'back') {
            e.preventDefault();
            e.stopPropagation();
            hideSubmenu();
            return;
        }

        const submenuId = item.getAttribute('data-submenu-id');
        if (submenuId) {
            e.preventDefault();
            executeCommand(submenuId, true, false);
        }
    }

    // Handle touch end on sub-submenu item (mobile support)
    function handleSubSubmenuTouchEnd(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        // Check if it's the back button
        const action = item.getAttribute('data-action');
        if (action === 'back-sub') {
            e.preventDefault();
            e.stopPropagation();
            hideSubSubmenu();
            return;
        }

        const subSubmenuId = item.getAttribute('data-sub-submenu-id');
        if (subSubmenuId) {
            e.preventDefault();
            executeCommand(subSubmenuId, false, true);
        }
    }

    // Handle mouse hover on submenu item to show sub-submenu if available
    function handleSubmenuMouseOver(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const hasSubSubmenu = item.getAttribute('data-has-sub-submenu') === 'true';
        const submenuId = item.getAttribute('data-submenu-id');

        if (hasSubSubmenu && submenuId && currentSubmenu) {
            const subItem = currentSubmenu.find(i => i.id === submenuId);
            if (subItem) {
                showSubSubmenu(subItem, item);
            }
        } else {
            hideSubSubmenu();
        }
    }

    // Handle mouse hover on main menu item to show submenu if available
    function handleMenuMouseOver(e) {
        const item = e.target.closest && e.target.closest('.slash-command-item');
        if (!item) return;

        const hasSubmenu = item.getAttribute('data-has-submenu') === 'true';
        const commandId = item.getAttribute('data-command-id');

        if (hasSubmenu && commandId) {
            const cmd = filteredCommands.find(c => c.id === commandId);
            if (cmd) {
                showSubmenu(cmd, item);
            }
        } else {
            hideSubmenu();
        }
    }

    // Schedule an async filter update based on current input
    function scheduleFilterUpdate() {
        if (savedEditableElement && savedEditableElement.tagName === 'INPUT') {
            setTimeout(() => updateFilterFromInput(savedEditableElement), 0);
        } else {
            setTimeout(updateFilterFromEditor, 0);
        }
    }

    // Handle filter text changes from keyboard input
    function handleMenuFilterKey(key) {
        if (key === 'Backspace') {
            if (filterText.length === 0) {
                hideSlashMenu();
                savedNoteEntry = null;
            } else {
                scheduleFilterUpdate();
            }
        } else {
            scheduleFilterUpdate();
        }
    }

    // Handle keyboard input (menu navigation)
    function handleKeydown(e) {
        if (!slashMenuElement) return;

        // If a sub-submenu is open (level 3)
        if (subSubmenuElement && currentSubSubmenu) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (currentSubSubmenu.length) {
                        selectedSubSubmenuIndex = (selectedSubSubmenuIndex + 1) % currentSubSubmenu.length;
                        subSubmenuElement.innerHTML = buildSubSubmenuHTML(currentSubSubmenu);
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (currentSubSubmenu.length) {
                        selectedSubSubmenuIndex = (selectedSubSubmenuIndex - 1 + currentSubSubmenu.length) % currentSubSubmenu.length;
                        subSubmenuElement.innerHTML = buildSubSubmenuHTML(currentSubSubmenu);
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    hideSubSubmenu();
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (currentSubSubmenu.length) {
                        executeCommand(currentSubSubmenu[selectedSubSubmenuIndex].id, false, true);
                    }
                    break;

                case 'Escape':
                    e.preventDefault();
                    hideSubSubmenu();
                    break;

                default:
                    if (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace') {
                        hideSubSubmenu();
                        hideSubmenu();
                        handleMenuFilterKey(e.key);
                    }
                    break;
            }
            return;
        }

        // If a submenu is open (level 2)
        if (submenuElement && currentSubmenu) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        selectedSubmenuIndex = (selectedSubmenuIndex + 1) % currentSubmenu.length;
                        submenuElement.innerHTML = buildSubmenuHTML(currentSubmenu);
                    }
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        selectedSubmenuIndex = (selectedSubmenuIndex - 1 + currentSubmenu.length) % currentSubmenu.length;
                        submenuElement.innerHTML = buildSubmenuHTML(currentSubmenu);
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    hideSubmenu();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        const item = currentSubmenu[selectedSubmenuIndex];
                        if (item.submenu && item.submenu.length > 0) {
                            const menuItem = submenuElement.querySelector('[data-submenu-id="' + item.id + '"]');
                            if (menuItem) {
                                showSubSubmenu(item, menuItem);
                            }
                        }
                    }
                    break;

                case 'Enter':
                    e.preventDefault();
                    if (currentSubmenu.length) {
                        executeCommand(currentSubmenu[selectedSubmenuIndex].id, true, false);
                    }
                    break;

                case 'Escape':
                    e.preventDefault();
                    hideSubmenu();
                    break;

                default:
                    if (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace') {
                        hideSubmenu();
                        handleMenuFilterKey(e.key);
                    }
                    break;
            }
            return;
        }

        // Navigate in main menu
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (filteredCommands.length) {
                    selectedIndex = (selectedIndex + 1) % filteredCommands.length;
                    updateMenuContent();
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (filteredCommands.length) {
                    selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
                    updateMenuContent();
                }
                break;

            case 'ArrowRight':
                e.preventDefault();
                if (filteredCommands.length) {
                    const cmd = filteredCommands[selectedIndex];
                    if (cmd.submenu && cmd.submenu.length > 0) {
                        const item = slashMenuElement.querySelector('[data-command-id="' + cmd.id + '"]');
                        if (item) {
                            showSubmenu(cmd, item);
                        }
                    }
                }
                break;

            case 'Enter':
                e.preventDefault();
                if (filteredCommands.length) {
                    executeCommand(filteredCommands[selectedIndex].id, false);
                }
                break;

            case 'Escape':
                e.preventDefault();
                hideSlashMenu();
                savedNoteEntry = null;
                break;

            case 'Backspace':
                handleMenuFilterKey('Backspace');
                break;

            case ' ':
                hideSlashMenu();
                savedNoteEntry = null;
                break;

            default:
                if (e.key.length === 1 || e.key === 'Delete') {
                    scheduleFilterUpdate();
                }
                break;
        }
    }

    // Update filter text from contenteditable editor content
    function updateFilterFromEditor() {
        if (!slashMenuElement || !slashTextNode || slashOffset < 0) return;

        // Extract text after the slash
        const textContent = slashTextNode.textContent || '';
        const textAfterSlash = textContent.substring(slashOffset + 1);

        // Find the first space or newline after the slash to limit the filter text
        const spaceIndex = textAfterSlash.search(/[\s\n]/);
        filterText = spaceIndex >= 0 ? textAfterSlash.substring(0, spaceIndex) : textAfterSlash;

        // Update the menu with filtered commands
        updateMenuContent();
    }

    // Update filter text from input field (title) value
    function updateFilterFromInput(input) {
        if (!slashMenuElement || slashOffset < 0 || !input) return;

        // Extract text after the slash in the input
        const text = input.value || '';
        const textAfterSlash = text.substring(slashOffset + 1);

        // Find the first space after the slash to limit the filter text
        const spaceIndex = textAfterSlash.search(/\s/);
        filterText = spaceIndex >= 0 ? textAfterSlash.substring(0, spaceIndex) : textAfterSlash;

        // Update the menu with filtered commands
        updateMenuContent();
    }

    // Show slash menu
    function showSlashMenu() {
        hideSlashMenu();

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const container = range.startContainer;

        // Must be in a text node
        if (container.nodeType !== 3) return;

        // Save the slash position (just before current position)
        slashTextNode = container;
        slashOffset = range.startOffset - 1;

        let containerElement = container.parentNode;
        savedNoteEntry = containerElement.closest && containerElement.closest('.noteentry');
        savedEditableElement = containerElement.closest && containerElement.closest('[contenteditable="true"]');

        const ctx = getEditorContext();
        if (!ctx) {
            savedNoteEntry = null;
            savedEditableElement = null;
            slashTextNode = null;
            slashOffset = -1;
            return;
        }

        activeCommands = ctx.noteType === 'markdown' ? getMarkdownSlashCommands() : getSlashCommands();

        filterText = '';
        selectedIndex = 0;
        filteredCommands = getFilteredCommands('');

        slashMenuElement = document.createElement('div');
        slashMenuElement.className = 'slash-command-menu';
        slashMenuElement.innerHTML = buildMenuHTML();

        document.body.appendChild(slashMenuElement);
        positionMenu(range);

        requestAnimationFrame(() => {
            if (slashMenuElement) slashMenuElement.classList.add('show');
        });

        slashMenuElement.addEventListener('mousedown', handleMenuMouseDown);
        slashMenuElement.addEventListener('click', handleMenuClick);
        slashMenuElement.addEventListener('mouseover', handleMenuMouseOver);

        // On mobile, close keyboard when menu opens
        const isMobile = window.innerWidth < 768;
        if (isMobile && savedEditableElement) {
            savedEditableElement.blur();
        }

        // Hide cursor until mouse moves (desktop only)
        if (!isMobile) {
            document.body.style.cursor = 'none';
            const showCursor = () => {
                document.body.style.cursor = '';
                document.removeEventListener('mousemove', showCursor);
            };
            document.addEventListener('mousemove', showCursor);
        }
    }

    // Handle user input (/ detection)
    function handleInput(e) {
        const target = e.target;
        if (!target) return;

        const noteEntry = target.closest && target.closest('.noteentry');
        if (!noteEntry) return;

        const ctx = getEditorContext();
        if (!ctx) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        const container = range.startContainer;
        if (container.nodeType !== 3) return;

        const offset = range.startOffset;
        if (offset < 1) return;

        const textBefore = container.textContent.substring(0, offset);
        const lastChar = textBefore.charAt(textBefore.length - 1);

        // Don't open menu if we're deleting (e.g. backspace landing on a slash)
        const isDeleting = e.inputType && e.inputType.startsWith('delete');

        if (lastChar === '/' && !isDeleting) {
            showSlashMenu();
        } else if (slashMenuElement) {
            // If menu is open, update filter from editor
            setTimeout(updateFilterFromEditor, 0);
        }
    }

    // Handle click outside menu (close)
    function handleClickOutside(e) {
        if (!slashMenuElement) return;

        const isClickInsideMenu = slashMenuElement.contains(e.target);
        const isClickInsideSubmenu = submenuElement && submenuElement.contains(e.target);
        const isClickInsideSubSubmenu = subSubmenuElement && subSubmenuElement.contains(e.target);

        if (!isClickInsideMenu && !isClickInsideSubmenu && !isClickInsideSubSubmenu) {
            hideSlashMenu();
            savedNoteEntry = null;
        }
    }

    // Initialize slash menu system (event listeners)
    function init() {
        document.addEventListener('input', handleInput, true);
        document.addEventListener('keydown', handleKeydown, true);
        document.addEventListener('mousedown', handleClickOutside, true);

        // Position caret at the end of the toggle title when clicked
        document.addEventListener('click', function (e) {
            const header = e.target.closest('.toggle-header');
            if (header && header.isContentEditable) {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(header);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        });

        // Prevent new lines and duplication in toggle title
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                const header = e.target.closest('.toggle-header');
                if (header) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Move focus to the content area instead of creating a new line
                    const content = header.nextElementSibling;
                    if (content && content.classList.contains('toggle-content')) {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(content);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }

            // Delete toggle when backspace is pressed on empty header
            if (e.key === 'Backspace') {
                const selection = window.getSelection();
                let header = e.target.closest('.toggle-header');
                if (!header && selection && selection.anchorNode) {
                    const anchorEl = selection.anchorNode.nodeType === Node.ELEMENT_NODE
                        ? selection.anchorNode
                        : selection.anchorNode.parentElement;
                    if (anchorEl) {
                        header = anchorEl.closest('.toggle-header');
                    }
                }

                if (header && header.textContent.trim() === '') {
                    e.preventDefault();
                    e.stopPropagation();

                    const toggleBlock = header.closest('.toggle-block');
                    if (toggleBlock) {
                        const parent = toggleBlock.parentNode;
                        if (parent) {
                            // Create a paragraph to maintain cursor position
                            const p = document.createElement('p');
                            p.innerHTML = '<br>';
                            parent.insertBefore(p, toggleBlock);
                            toggleBlock.remove();

                            // Move cursor to the new paragraph
                            const range = document.createRange();
                            range.setStart(p, 0);
                            range.collapse(true);
                            const sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(range);
                        }
                    }
                }
            }
        }, true);

        // Prevent multi-line pastes in toggle title
        document.addEventListener('paste', function (e) {
            const header = e.target.closest('.toggle-header');
            if (header) {
                e.preventDefault();
                const text = (e.originalEvent || e).clipboardData.getData('text/plain');
                const cleanText = text.replace(/[\r\n]+/g, ' ');
                document.execCommand('insertText', false, cleanText);
            }
        }, true);

        // Aggressively sanitize toggle headers on input to enforce single-line structure
        document.addEventListener('input', function (e) {
            const target = e.target;
            const toggleBlock = target.closest && target.closest('.toggle-block');

            if (toggleBlock) {
                // 1. Prevent multiple summaries (duplicate headers)
                const summaries = toggleBlock.querySelectorAll('summary');
                if (summaries.length > 1) {
                    const first = summaries[0];
                    let mergedText = first.textContent;

                    for (let i = 1; i < summaries.length; i++) {
                        mergedText += ' ' + summaries[i].textContent;
                        summaries[i].remove();
                    }

                    first.textContent = mergedText;

                    // Restore focus to first header (at end)
                    const range = document.createRange();
                    range.selectNodeContents(first);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }

                // 2. Flatten content inside the header (remove BRs, DIVs, newlines)
                const header = toggleBlock.querySelector('.toggle-header');
                if (header) {
                    const hasBlockContent = header.querySelector('div, p, br');
                    const hasNewlines = header.textContent.includes('\n');

                    if (hasBlockContent || hasNewlines) {
                        // Flatten text
                        const cleanText = header.textContent.replace(/[\r\n]+/g, '');
                        header.textContent = cleanText;

                        // Restore caret to end
                        const range = document.createRange();
                        range.selectNodeContents(header);
                        range.collapse(false);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                }
            }
        }, true);

        // Handle slash menu in title inputs (notecards)
        document.addEventListener('input', function (e) {
            const target = e.target;
            
            // Check if this is a title input field
            if (target.tagName === 'INPUT' && target.classList.contains('css-title')) {
                const value = target.value;
                const pos = target.selectionStart;
                
                // Check if the last character typed is a slash
                if (pos > 0 && value[pos - 1] === '/') {
                    // Don't show if we're deleting
                    const isDeleting = e.inputType && e.inputType.startsWith('delete');
                    if (!isDeleting) {
                        showSlashMenuForInput(target, pos);
                    }
                }
                // Update filter if menu is already open
                else if (slashMenuElement && savedEditableElement === target) {
                    updateFilterFromInput(target);
                }
            }
        }, true);
    }

    // Process a YouTube URL and insert the corresponding iframe
    function processYouTubeUrl(url, isMarkdown, editableElement, savedRange, noteEntry) {
        const t = window.t || ((key, params, fallback) => fallback);

        if (!url) return;

        // Extract video ID from various YouTube URL formats
        let videoId = null;
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
            /^([a-zA-Z0-9_-]{11})$/  // Direct ID (exactly 11 chars)
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                videoId = match[1];
                break;
            }
        }

        if (!videoId) {
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(t('slash_menu.youtube_invalid_url', null, 'Invalid YouTube URL'), 'error');
            } else {
                alert(t('slash_menu.youtube_invalid_url', null, 'Invalid YouTube URL'));
            }
            return;
        }

        if (isMarkdown) {
            // For markdown, insert iframe HTML directly
            const iframeMarkdown = '<iframe width="560" height="315" src="https://www.youtube.com/embed/' + videoId + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\n\n';

            // Focus the editable element first
            if (editableElement) {
                editableElement.focus();
            }

            // Restore selection if saved
            if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }

            insertMarkdownAtCursor(iframeMarkdown, 0);
        } else {
            // For HTML notes
            // Create iframe HTML
            const iframeHtml = '<iframe width="560" height="315" src="https://www.youtube.com/embed/' + videoId + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';

            // Focus the editable element first
            if (editableElement) {
                editableElement.focus();
            }

            // Restore selection and insert iframe
            try {
                const sel = window.getSelection();
                let range;

                if (savedRange) {
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                    range = savedRange;
                } else if (sel && sel.rangeCount > 0) {
                    range = sel.getRangeAt(0);
                } else {
                    // No saved range and no current range, try to create one at the end of editableElement
                    if (editableElement) {
                        range = document.createRange();
                        range.selectNodeContents(editableElement);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        return; // Cannot insert without a valid target
                    }
                }

                // Create a temporary container to parse the HTML
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = iframeHtml;
                const iframeElement = tempContainer.firstChild;

                // Insert with spacing
                const fragment = document.createDocumentFragment();

                const lineBefore = document.createElement('div');
                lineBefore.innerHTML = '<br>';
                fragment.appendChild(lineBefore);

                fragment.appendChild(iframeElement);

                const lineAfter = document.createElement('div');
                lineAfter.innerHTML = '<br>';
                fragment.appendChild(lineAfter);

                range.deleteContents();
                range.insertNode(fragment);

                // Move cursor after
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);

                // Trigger input event
                if (noteEntry) {
                    noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Mark as modified and save
                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }
            } catch (e) {
                console.error('Error inserting YouTube iframe:', e);
            }
        }
    }

    // Check if a file is an MP4 video
    function isMp4File(file) {
        if (!file) return false;
        const name = String(file.name || '').toLowerCase();
        const type = String(file.type || '').toLowerCase();
        return type === 'video/mp4' || name.endsWith('.mp4');
    }

    // Check if a file is an audio file
    function isAudioFile(file) {
        if (!file) return false;
        const name = String(file.name || '').toLowerCase();
        const type = String(file.type || '').toLowerCase();
        if (type.startsWith('audio/')) return true;
        return name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.m4a') || name.endsWith('.ogg') || name.endsWith('.flac');
    }

    // Resolve the editor context from provided or global state
    function resolveEditorContext(preferredNoteEntry, preferredEditableElement) {
        if (preferredNoteEntry && preferredEditableElement) {
            return { noteEntry: preferredNoteEntry, editableElement: preferredEditableElement };
        }
        const ctx = (typeof getEditorContext === 'function') ? getEditorContext() : null;
        return {
            noteEntry: preferredNoteEntry || (ctx ? ctx.noteEntry : null),
            editableElement: preferredEditableElement || (ctx ? ctx.editableElement : null)
        };
    }

    // Generic media upload: handles both MP4 video and audio uploads. mediaType: 'video' | 'audio'
    function insertUploadedMedia(mediaType, isMarkdown, preferredNoteEntry, preferredEditableElement, savedRange) {
        var isVideo = (mediaType === 'video');
        var logPrefix = isVideo ? '[MP4]' : '[AUDIO]';
        var acceptType = isVideo ? 'video/mp4' : 'audio/*';
        var validateFn = isVideo ? isMp4File : isAudioFile;
        var i18nPrefix = isVideo ? 'mp4' : 'audio';

        var t = window.t || (function (key, params, fallback) { return fallback; });
        var context = resolveEditorContext(preferredNoteEntry, preferredEditableElement);
        var noteEntry = context.noteEntry;
        var editableElement = context.editableElement;

        var noteId = '';
        if (noteEntry && noteEntry.id) {
            noteId = noteEntry.id.replace('entry', '');
        }
        if (!noteId && typeof window.noteid !== 'undefined' && window.noteid !== null) {
            noteId = String(window.noteid);
        }

        if (!editableElement && noteEntry) {
            editableElement = noteEntry.querySelector ? (noteEntry.querySelector('.markdown-editor') || noteEntry.querySelector('[contenteditable="true"]')) : null;
        }

        if (!noteId) {
            console.error(logPrefix + ' No note ID found!');
            var noNoteMsg = t('slash_menu.' + i18nPrefix + '_no_note', null, 'No note selected');
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(noNoteMsg, 'error');
            } else {
                alert(noNoteMsg);
            }
            return;
        }

        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = acceptType;
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', function () {
            try {
                var file = fileInput.files && fileInput.files[0];
                if (!file) return;

                if (!validateFn(file)) {
                    console.warn(logPrefix + ' Invalid file type:', file.type);
                    var invalidMsg = t('slash_menu.' + i18nPrefix + '_invalid_file', null, isVideo ? 'Please select an MP4 video.' : 'Please select an audio file.');
                    if (typeof showNotificationPopup === 'function') {
                        showNotificationPopup(invalidMsg, 'error');
                    } else {
                        alert(invalidMsg);
                    }
                    return;
                }

                // Show upload spinner
                var uploadMsg = t('slash_menu.' + i18nPrefix + '_uploading', null, isVideo ? 'Uploading video...' : 'Uploading audio...');
                var uploadSpinner = window.modalAlert?.showSpinner(uploadMsg, t('common.please_wait', null, 'Please wait'));

                var formData = new FormData();
                formData.append('note_id', noteId);
                formData.append('file', file);
                if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
                    formData.append('workspace', selectedWorkspace);
                }

                fetch('/api/v1/notes/' + noteId + '/attachments', {
                    method: 'POST',
                    body: formData
                })
                    .then(function (response) { return response.text(); })
                    .then(function (text) {
                        var data;
                        try {
                            data = JSON.parse(text);
                        } catch (e) {
                            console.error(logPrefix + ' Failed to parse response:', e);
                            throw new Error('Invalid server response');
                        }
                        if (!data || !data.success || !data.attachment_id) {
                            console.error(logPrefix + ' Upload failed:', data);
                            throw new Error((data && data.message) ? data.message : 'Upload failed');
                        }

                        var wsParam = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace)
                            ? '?workspace=' + encodeURIComponent(selectedWorkspace)
                            : '';
                        var attachmentId = data.attachment_id;
                        var fileUrl = '/api/v1/notes/' + noteId + '/attachments/' + attachmentId + wsParam;

                        // Build the HTML to insert (differs by media type)
                        var mediaHtml;
                        if (isVideo) {
                            mediaHtml = '<video class="note-video-embed" contenteditable="false" width="560" height="315" controls preload="metadata" playsinline src="' + fileUrl + '"></video>';
                        } else {
                            // Audio: use native <audio> with contenteditable="false" (works in Chrome)
                            mediaHtml = '<audio class="note-audio-embed" controls preload="metadata" contenteditable="false" src="' + fileUrl + '"></audio>';
                        }

                        if (editableElement) {
                            editableElement.focus();
                        }

                        if (savedRange) {
                            var sel = window.getSelection();
                            sel.removeAllRanges();
                            sel.addRange(savedRange);
                        }

                        if (isMarkdown) {
                            insertMarkdownAtCursor(mediaHtml + '\n\n', 0);
                            if (editableElement) {
                                editableElement.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        } else {
                            try {
                                var sel = window.getSelection();
                                var range;
                                if (savedRange) {
                                    range = savedRange;
                                } else if (sel && sel.rangeCount > 0) {
                                    range = sel.getRangeAt(0);
                                } else if (editableElement) {
                                    range = document.createRange();
                                    range.selectNodeContents(editableElement);
                                    range.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                }

                                if (range) {
                                    var temp = document.createElement('div');
                                    temp.innerHTML = mediaHtml;
                                    var mediaEl = temp.firstChild;

                                    var fragment = document.createDocumentFragment();
                                    var lineBefore = document.createElement('div');
                                    lineBefore.innerHTML = '<br>';
                                    fragment.appendChild(lineBefore);
                                    fragment.appendChild(mediaEl);
                                    var lineAfter = document.createElement('div');
                                    lineAfter.innerHTML = '<br>';
                                    fragment.appendChild(lineAfter);

                                    range.deleteContents();
                                    range.insertNode(fragment);
                                    range.collapse(false);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                }
                            } catch (e) {
                                console.error('Error inserting ' + mediaType + ':', e);
                            }
                        }

                        if (noteEntry) {
                            noteEntry.dispatchEvent(new Event('input', { bubbles: true }));
                        }

                        if (typeof window.markNoteAsModified === 'function') {
                            window.markNoteAsModified();
                        }

                        if (typeof window.saveNoteImmediately === 'function') {
                            window.saveNoteImmediately();
                        }

                        // Close upload spinner
                        if (uploadSpinner?.close) {
                            uploadSpinner.close();
                        }
                    })
                    .catch(function (error) {
                        console.error(logPrefix + ' Upload error:', error);

                        // Close upload spinner
                        if (uploadSpinner?.close) {
                            uploadSpinner.close();
                        }

                        var failMsg = t('slash_menu.' + i18nPrefix + '_upload_failed', { error: error.message }, 'Upload failed: {{error}}');
                        if (typeof showNotificationPopup === 'function') {
                            showNotificationPopup(failMsg, 'error');
                        } else {
                            alert(failMsg);
                        }
                    });
            } catch (e) {
                console.error(logPrefix + ' Exception in change handler:', e);
            } finally {
                if (fileInput.parentNode) {
                    document.body.removeChild(fileInput);
                }
            }
        });

        // Cleanup if user cancels the file selection
        fileInput.addEventListener('cancel', function () {
            if (fileInput.parentNode) {
                document.body.removeChild(fileInput);
            }
        });

        document.body.appendChild(fileInput);
        fileInput.click();
    }

    // Backward-compatible wrapper for MP4 video uploads
    function insertUploadedMp4(isMarkdown, preferredNoteEntry, preferredEditableElement, savedRange) {
        insertUploadedMedia('video', isMarkdown, preferredNoteEntry, preferredEditableElement, savedRange);
    }

    // Backward-compatible wrapper for audio uploads
    function insertUploadedAudio(isMarkdown, preferredNoteEntry, preferredEditableElement, savedRange) {
        insertUploadedMedia('audio', isMarkdown, preferredNoteEntry, preferredEditableElement, savedRange);
    }

    // ============================================================================
    // GLOBALLY EXPOSED FUNCTIONS
    // ============================================================================

    // Expose hideSlashMenu globally
    window.hideSlashMenu = hideSlashMenu;

    // Insert YouTube video into HTML note (exposed globally)
    window.insertYouTubeVideo = function () {
        const t = window.t || ((key, params, fallback) => fallback);

        if (typeof window.showYouTubeModal !== 'function') {
            // Fallback to prompt if modal not available
            const url = prompt(t('slash_menu.youtube_url_prompt', null, 'Enter YouTube video URL or ID:'), 'https://www.youtube.com/watch?v=');
            if (url) processYouTubeUrl(url, false, null, null, null);
            return;
        }

        // Save the note entry and editable element before they get cleared
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;

        // Save the current range/position
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }

        window.showYouTubeModal(function (url) {
            processYouTubeUrl(url, false, editableElement, savedRange, noteEntry);
        });
    };

    // Insert YouTube video into Markdown note (exposed globally)
    window.insertYouTubeVideoMarkdown = function () {
        const t = window.t || ((key, params, fallback) => fallback);

        if (typeof window.showYouTubeModal !== 'function') {
            // Fallback to prompt if modal not available
            const url = prompt(t('slash_menu.youtube_url_prompt', null, 'Enter YouTube video URL or ID:'), 'https://www.youtube.com/watch?v=');
            if (url) processYouTubeUrl(url, true, null, null, null);
            return;
        }

        // Save the note entry and editable element before they get cleared
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;

        // Save the current range/position
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }

        window.showYouTubeModal(function (url) {
            processYouTubeUrl(url, true, editableElement, savedRange, noteEntry);
        });
    };

    // Insert MP4 video into HTML note (exposed globally)
    window.insertMp4Video = function () {
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
        insertUploadedMp4(false, noteEntry, editableElement, savedRange);
    };

    // Insert audio file into HTML note (exposed globally)
    window.insertAudioFile = function () {
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
        insertUploadedAudio(false, noteEntry, editableElement, savedRange);
    };

    // Insert MP4 video into Markdown note (exposed globally)
    window.insertMp4VideoMarkdown = function () {
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
        insertUploadedMp4(true, noteEntry, editableElement, savedRange);
    };

    // Insert audio file into Markdown note (exposed globally)
    window.insertAudioFileMarkdown = function () {
        const noteEntry = savedNoteEntry;
        const editableElement = savedEditableElement;
        let savedRange = null;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
        insertUploadedAudio(true, noteEntry, editableElement, savedRange);
    };

    // ============================================================================
    // MODULE INITIALIZATION
    // ============================================================================

    // Module initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


// Markdown Formatting Functions
// Handles text formatting for markdown notes using markdown syntax

(function() {
    'use strict';

    /**
     * Check if the current selection is within a markdown editor
     */
    function isInMarkdownEditor() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        
        var range = sel.getRangeAt(0);
        var container = range.commonAncestorContainer;
        var element = container.nodeType === 3 ? container.parentElement : container;
        
        // Traverse up to find if we're in a markdown editor
        while (element && element !== document.body) {
            if (element.classList && element.classList.contains('markdown-editor')) {
                return true;
            }
            element = element.parentElement;
        }
        return false;
    }

    /**
     * Wrap selected text with markdown syntax
     */
    function wrapSelectionWithMarkdown(prefix, suffix) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var range = sel.getRangeAt(0);
        var selectedText = sel.toString();
        
        // If no text selected, insert markers and place cursor between them
        if (!selectedText) {
            var marker = prefix + suffix;
            document.execCommand('insertText', false, marker);
            // Move cursor between markers
            var newSel = window.getSelection();
            if (newSel.rangeCount > 0) {
                var newRange = newSel.getRangeAt(0);
                newRange.setStart(newRange.startContainer, newRange.startOffset - suffix.length);
                newRange.collapse(true);
                newSel.removeAllRanges();
                newSel.addRange(newRange);
            }
            return;
        }

        // Check if already wrapped with this syntax
        var container = range.commonAncestorContainer;
        if (container.nodeType === 3) { // Text node
            var textContent = container.textContent;
            var startOffset = range.startOffset;
            var endOffset = range.endOffset;
            
            var beforeText = textContent.substring(Math.max(0, startOffset - prefix.length), startOffset);
            var afterText = textContent.substring(endOffset, Math.min(textContent.length, endOffset + suffix.length));
            
            // If already wrapped, unwrap
            if (beforeText === prefix && afterText === suffix) {
                var newRange = document.createRange();
                newRange.setStart(container, startOffset - prefix.length);
                newRange.setEnd(container, endOffset + suffix.length);
                
                var unwrappedText = selectedText;
                document.execCommand('insertText', false, unwrappedText);
                return;
            }
        }
        
        // Wrap the selected text
        var wrappedText = prefix + selectedText + suffix;
        document.execCommand('insertText', false, wrappedText);
    }

    /**
     * Toggle list formatting (bullet or numbered)
     */
    function toggleMarkdownList(listType) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var range = sel.getRangeAt(0);
        var container = range.commonAncestorContainer;
        var element = container.nodeType === 3 ? container.parentElement : container;
        
        // Find the markdown editor
        var editor = element.closest('.markdown-editor');
        if (!editor) return;

        // Get all text content
        var textContent = editor.textContent || editor.innerText;
        var lines = textContent.split('\n');
        
        // Find which line(s) are selected
        var startOffset = 0;
        var endOffset = 0;
        
        // Calculate offset from start of editor to selection
        var walker = document.createTreeWalker(
            editor,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        var currentOffset = 0;
        var node;
        while (node = walker.nextNode()) {
            if (node === range.startContainer) {
                startOffset = currentOffset + range.startOffset;
            }
            if (node === range.endContainer) {
                endOffset = currentOffset + range.endOffset;
                break;
            }
            currentOffset += node.textContent.length;
        }

        // Find affected line numbers
        var charCount = 0;
        var startLine = 0;
        var endLine = 0;
        
        for (var i = 0; i < lines.length; i++) {
            var lineLength = lines[i].length + 1; // +1 for newline
            
            if (charCount <= startOffset && startOffset < charCount + lineLength) {
                startLine = i;
            }
            if (charCount <= endOffset && endOffset <= charCount + lineLength) {
                endLine = i;
            }
            
            charCount += lineLength;
        }

        // Toggle list markers for affected lines
        var listMarker = listType === 'ul' ? '- ' : '1. ';
        var listPattern = listType === 'ul' ? /^[\s]*[-*+]\s+/ : /^[\s]*\d+\.\s+/;
        
        var modified = false;
        for (var i = startLine; i <= endLine; i++) {
            if (lines[i].trim() === '') continue; // Skip empty lines
            
            if (listPattern.test(lines[i])) {
                // Remove list marker
                lines[i] = lines[i].replace(listPattern, '');
                modified = true;
            } else {
                // Add list marker
                var indent = lines[i].match(/^[\s]*/)[0];
                if (listType === 'ol') {
                    listMarker = (i - startLine + 1) + '. ';
                }
                lines[i] = indent + listMarker + lines[i].trimStart();
                modified = true;
            }
        }

        if (modified) {
            // Replace editor content
            editor.textContent = lines.join('\n');
        }
    }

    /**
     * Apply markdown bold formatting
     */
    function applyMarkdownBold() {
        wrapSelectionWithMarkdown('**', '**');
    }

    /**
     * Apply markdown italic formatting
     */
    function applyMarkdownItalic() {
        wrapSelectionWithMarkdown('*', '*');
    }

    /**
     * Apply markdown strikethrough formatting
     */
    function applyMarkdownStrikethrough() {
        wrapSelectionWithMarkdown('~~', '~~');
    }

    /**
     * Apply markdown inline code formatting
     */
    function applyMarkdownInlineCode() {
        wrapSelectionWithMarkdown('`', '`');
    }

    /**
     * Apply markdown code block formatting
     */
    function applyMarkdownCodeBlock() {
        wrapSelectionWithMarkdown('\n```\n', '\n```\n');
    }

    /**
     * Apply markdown link formatting
     */
    function applyMarkdownLink(url, text) {
        if (!text && !url) return;
        
        var sel = window.getSelection();
        
        // Restore saved range if available
        if (window.savedRanges && window.savedRanges.link) {
            sel.removeAllRanges();
            sel.addRange(window.savedRanges.link);
        }
        
        if (!sel || sel.rangeCount === 0) return;

        var selectedText = sel.toString();
        var linkText = text || url || selectedText || 'link';
        var linkUrl = url || 'https://';
        
        var markdownLink = '[' + linkText + '](' + linkUrl + ')';
        document.execCommand('insertText', false, markdownLink);
    }

    /**
     * Apply markdown heading formatting
     */
    function applyMarkdownHeading(level) {
        level = Math.max(1, Math.min(6, level || 1));
        var prefix = '#'.repeat(level) + ' ';
        
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var range = sel.getRangeAt(0);
        var container = range.commonAncestorContainer;
        
        // Find the line start
        var textNode = container.nodeType === 3 ? container : container.firstChild;
        if (!textNode || textNode.nodeType !== 3) return;
        
        var text = textNode.textContent;
        var offset = range.startOffset;
        
        // Find line start
        var lineStart = text.lastIndexOf('\n', offset - 1) + 1;
        var lineEnd = text.indexOf('\n', offset);
        if (lineEnd === -1) lineEnd = text.length;
        
        var line = text.substring(lineStart, lineEnd);
        
        // Check if already a heading
        var headingPattern = /^#{1,6}\s+/;
        var newLine;
        if (headingPattern.test(line)) {
            // Remove heading
            newLine = line.replace(headingPattern, '');
        } else {
            // Add heading
            newLine = prefix + line;
        }
        
        // Replace the line
        var newRange = document.createRange();
        newRange.setStart(textNode, lineStart);
        newRange.setEnd(textNode, lineEnd);
        
        sel.removeAllRanges();
        sel.addRange(newRange);
        document.execCommand('insertText', false, newLine);
    }

    /**
     * Apply text color using HTML inline in markdown
     */
    function applyMarkdownColor(color) {
        if (!color) return;
        
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var selectedText = sel.toString();
        
        // If no selection, do nothing
        if (!selectedText) return;

        // Wrap with HTML color span as plain text in the markdown editor
        var coloredText = '<span style="color:' + color + '">' + selectedText + '</span>';
        document.execCommand('insertText', false, coloredText);
    }

    /**
     * Apply highlight using HTML span tag in markdown
     */
    function applyMarkdownHighlight(color) {
        var highlightColor = color || '#f1c40f';
        
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var selectedText = sel.toString();
        
        // If no selection, do nothing
        if (!selectedText) return;

        // Apply highlight using span tag as plain text in the markdown editor
        var highlightedText = '<span style="background-color:' + highlightColor + '">' + selectedText + '</span>';
        document.execCommand('insertText', false, highlightedText);
    }

    /**
     * Apply font size using HTML inline in markdown
     */
    function applyMarkdownFontSize(fontSize) {
        if (!fontSize) return;
        
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        var selectedText = sel.toString();
        
        // If no selection, do nothing
        if (!selectedText) return;

        // Wrap with HTML span with font size
        var styledText = '<span style="font-size: ' + fontSize + '">' + selectedText + '</span>';
        document.execCommand('insertHTML', false, styledText);
    }

    // Export functions
    window.isInMarkdownEditor = isInMarkdownEditor;
    window.applyMarkdownBold = applyMarkdownBold;
    window.applyMarkdownItalic = applyMarkdownItalic;
    window.applyMarkdownStrikethrough = applyMarkdownStrikethrough;
    window.applyMarkdownInlineCode = applyMarkdownInlineCode;
    window.applyMarkdownCodeBlock = applyMarkdownCodeBlock;
    window.applyMarkdownLink = applyMarkdownLink;
    window.applyMarkdownHeading = applyMarkdownHeading;
    window.toggleMarkdownList = toggleMarkdownList;
    window.applyMarkdownColor = applyMarkdownColor;
    window.applyMarkdownHighlight = applyMarkdownHighlight;
    window.applyMarkdownFontSize = applyMarkdownFontSize;

})();

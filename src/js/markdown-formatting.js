// Markdown Formatting Functions
// Handles text formatting for markdown notes using markdown syntax

(function() {
    'use strict';

    /**
     * Check if the current selection is within a markdown editor
     */
    function isInMarkdownEditor() {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
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
        }

        return !!getFallbackCodeMirrorEditor(false);
    }

    function getMarkdownEditorElement(range) {
        if (!range) return null;

        if (typeof getMarkdownEditorFromRange === 'function') {
            var existingEditor = getMarkdownEditorFromRange(range);
            if (existingEditor) return existingEditor;
        }

        var container = range.commonAncestorContainer;
        var element = container.nodeType === 3 ? container.parentElement : container;
        return element && element.closest ? element.closest('.markdown-editor') : null;
    }

    function getMarkdownEditorValue(editor) {
        if (!editor) return '';

        if (typeof getMarkdownEditorText === 'function') {
            return getMarkdownEditorText(editor);
        }

        return editor.innerText || editor.textContent || '';
    }

    function getMarkdownCodeMirrorApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    function escapeMarkdownLinkLabel(text, fallback) {
        var normalized = String(text || '')
            .replace(/[\r\n\t]+/g, ' ')
            .trim();
        var value = normalized || fallback || '';
        return value
            .replace(/\\/g, '\\\\')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
    }

    function normalizeMarkdownLinkDestination(url) {
        var value = String(url || '').trim();
        if (!value) return '';
        if (/[\u0000-\u001F\u007F]/.test(value)) return '';
        var schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
        if (schemeMatch) {
            var scheme = schemeMatch[1].toLowerCase();
            if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto' && scheme !== 'tel') {
                return '';
            }
        }
        return value.replace(/[()\s<>]/g, function (match) {
            return encodeURIComponent(match);
        });
    }

    function buildSafeMarkdownLink(label, url) {
        var destination = normalizeMarkdownLinkDestination(url);
        if (!destination) return '';
        return '[' + escapeMarkdownLinkLabel(label || url || 'link', 'link') + '](' + destination + ')';
    }

    function isMarkdownCodeMirrorEditor(editor) {
        var api = getMarkdownCodeMirrorApi();
        return !!(api && editor && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(editor));
    }

    function getCodeMirrorSelectionOffsets(editor) {
        var api = getMarkdownCodeMirrorApi();
        if (!api || !editor || typeof api.getSelectionOffsets !== 'function' || !isMarkdownCodeMirrorEditor(editor)) {
            return null;
        }

        return api.getSelectionOffsets(editor);
    }

    function getFallbackCodeMirrorEditor(includeLastActive) {
        var active = document.activeElement;
        var toolbar = active && active.closest ? active.closest('.note-edit-toolbar') : null;
        var noteCard = toolbar && toolbar.closest ? toolbar.closest('.notecard') : null;
        var editor = noteCard && noteCard.querySelector ? noteCard.querySelector('.markdown-editor') : null;

        if (isMarkdownCodeMirrorEditor(editor)) {
            return editor;
        }

        if (includeLastActive === false) {
            return null;
        }

        var api = getMarkdownCodeMirrorApi();
        if (api && typeof api.getLastActiveEditor === 'function') {
            editor = api.getLastActiveEditor();
            if (isMarkdownCodeMirrorEditor(editor)) {
                return editor;
            }
        }

        return null;
    }

    function getCurrentMarkdownEditContext() {
        var sel = window.getSelection();
        var range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        var editor = range ? getMarkdownEditorElement(range) : null;
        var offsets = editor && range ? getSelectionOffsetsInMarkdownEditor(editor, range) : null;

        if (!editor || !offsets) {
            var fallbackEditor = getFallbackCodeMirrorEditor(true);
            if (fallbackEditor) {
                editor = fallbackEditor;
                offsets = getCodeMirrorSelectionOffsets(editor);
                range = null;
            }
        }

        return {
            selection: sel,
            range: range,
            editor: editor,
            offsets: offsets
        };
    }

    function getSelectionOffsetsInMarkdownEditor(editor, range) {
        if (!editor || !range) return null;

        if (typeof getRangeOffsetsWithinEditor === 'function') {
            var existingOffsets = getRangeOffsetsWithinEditor(editor, range);
            if (existingOffsets) return existingOffsets;
        }

        try {
            if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
                return null;
            }

            var startRange = range.cloneRange();
            startRange.selectNodeContents(editor);
            startRange.setEnd(range.startContainer, range.startOffset);
            var start = startRange.toString().length;

            var endRange = range.cloneRange();
            endRange.selectNodeContents(editor);
            endRange.setEnd(range.endContainer, range.endOffset);
            var end = endRange.toString().length;

            return {
                start: Math.min(start, end),
                end: Math.max(start, end)
            };
        } catch (e) {
            return null;
        }
    }

    function findTextNodeAtOffset(rootEl, offset) {
        var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null, false);
        var node = walker.nextNode();
        var remaining = Math.max(0, offset);

        while (node) {
            var length = node.nodeValue ? node.nodeValue.length : 0;
            if (remaining <= length) {
                return { node: node, offset: remaining };
            }

            remaining -= length;
            node = walker.nextNode();
        }

        return {
            node: rootEl,
            offset: rootEl.childNodes ? rootEl.childNodes.length : 0
        };
    }

    function setMarkdownEditorSelection(editor, startOffset, endOffset) {
        if (!editor) return;

        if (typeof setSelectionByEditorOffsets === 'function') {
            setSelectionByEditorOffsets(editor, startOffset, endOffset);
            return;
        }

        var selection = window.getSelection();
        if (!selection) return;

        var startPos = findTextNodeAtOffset(editor, startOffset);
        var endPos = findTextNodeAtOffset(editor, endOffset);
        var range = document.createRange();

        try {
            range.setStart(startPos.node, startPos.offset);
            range.setEnd(endPos.node, endPos.offset);
        } catch (e) {
            range.selectNodeContents(editor);
            range.collapse(false);
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }

    function focusMarkdownEditor(editor) {
        if (!editor) return;

        try {
            editor.focus({ preventScroll: true });
        } catch (e) {
            editor.focus();
        }
    }

    function replaceMarkdownRangeAndSelect(editor, start, end, replacement, selectionStart, selectionEnd) {
        if (!editor) return false;

        var didReplace = false;

        if (typeof replaceMarkdownRangeByOffsets === 'function') {
            didReplace = replaceMarkdownRangeByOffsets(editor, start, end, replacement);
        } else {
            var fullText = getMarkdownEditorValue(editor);
            var safeStart = Math.max(0, Math.min(start, fullText.length));
            var safeEnd = Math.max(safeStart, Math.min(end, fullText.length));
            editor.textContent = fullText.slice(0, safeStart) + replacement + fullText.slice(safeEnd);

            try {
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            } catch (e) {
                // Ignore input dispatch failures.
            }

            didReplace = true;
        }

        if (!didReplace) return false;

        focusMarkdownEditor(editor);
        setMarkdownEditorSelection(editor, selectionStart, selectionEnd);

        setTimeout(function () {
            focusMarkdownEditor(editor);
            setMarkdownEditorSelection(editor, selectionStart, selectionEnd);
        }, 0);

        return true;
    }

    /**
     * Wrap selected text with markdown syntax
     */
    function wrapSelectionWithMarkdown(prefix, suffix) {
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var range = context.range;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets && editor
            ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end)
            : (sel ? sel.toString() : '');

        if (editor && offsets) {
            var fullText = getMarkdownEditorValue(editor);
            selectedText = fullText.slice(offsets.start, offsets.end);

            if (!selectedText) {
                var marker = prefix + suffix;
                replaceMarkdownRangeAndSelect(
                    editor,
                    offsets.start,
                    offsets.end,
                    marker,
                    offsets.start + prefix.length,
                    offsets.start + prefix.length
                );
                return;
            }

            var beforeText = fullText.slice(Math.max(0, offsets.start - prefix.length), offsets.start);
            var afterText = fullText.slice(offsets.end, offsets.end + suffix.length);

            if (beforeText === prefix && afterText === suffix) {
                replaceMarkdownRangeAndSelect(
                    editor,
                    offsets.start - prefix.length,
                    offsets.end + suffix.length,
                    selectedText,
                    offsets.start - prefix.length,
                    offsets.start - prefix.length + selectedText.length
                );
                return;
            }

            var wrappedText = prefix + selectedText + suffix;
            replaceMarkdownRangeAndSelect(
                editor,
                offsets.start,
                offsets.end,
                wrappedText,
                offsets.start + prefix.length,
                offsets.start + prefix.length + selectedText.length
            );
            return;
        }

        if (!range) return;
        
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
        var context = getCurrentMarkdownEditContext();
        var range = context.range;
        var editor = context.editor;

        if (!editor && range) {
            var container = range.commonAncestorContainer;
            var element = container.nodeType === 3 ? container.parentElement : container;
            editor = element.closest('.markdown-editor');
        }

        if (!editor) return;

        // Get all text content
        var textContent = getMarkdownEditorValue(editor);
        var lines = textContent.split('\n');
        
        // Find which line(s) are selected
        var startOffset = context.offsets ? context.offsets.start : 0;
        var endOffset = context.offsets ? context.offsets.end : 0;

        if (!context.offsets && range) {
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

        var modified = false;

        if (listType === 'task' || listType === 'task-remove') {
            var taskLinePattern = /^(\s*[-*+]\s+)\[[ xX]\]/;
            var nonEmptyLines = [];
            var allTasks = true;
            for (var i = startLine; i <= endLine; i++) {
                if (lines[i].trim() === '') continue;
                nonEmptyLines.push(i);
                if (!taskLinePattern.test(lines[i])) allTasks = false;
            }

            if (listType === 'task-remove') {
                // Strip checkbox markers, leaving plain text
                nonEmptyLines.forEach(function (idx) {
                    if (!taskLinePattern.test(lines[idx])) return;
                    lines[idx] = lines[idx].replace(/^(\s*)[-*+]\s+\[[ xX]\]\s*/, '$1');
                    modified = true;
                });
            } else if (nonEmptyLines.length && allTasks) {
                // Selection is already a checklist: check everything,
                // or uncheck everything when all boxes are already checked
                var allChecked = nonEmptyLines.every(function (idx) {
                    return /^\s*[-*+]\s+\[[xX]\]/.test(lines[idx]);
                });
                nonEmptyLines.forEach(function (idx) {
                    lines[idx] = lines[idx].replace(taskLinePattern, '$1[' + (allChecked ? ' ' : 'x') + ']');
                });
                modified = nonEmptyLines.length > 0;
            } else {
                // Convert plain/bullet/numbered lines into unchecked boxes
                nonEmptyLines.forEach(function (idx) {
                    if (taskLinePattern.test(lines[idx])) return;
                    var indent = lines[idx].match(/^[\s]*/)[0];
                    var rest = lines[idx].trimStart()
                        .replace(/^[-*+]\s+/, '')
                        .replace(/^\d+(?:\.\d+)*\.\s+/, '');
                    lines[idx] = indent + '- [ ] ' + rest;
                    modified = true;
                });
            }
        } else {
            // Toggle list markers for affected lines
            var listMarker = listType === 'ul' ? '- ' : '1. ';
            var listPattern = listType === 'ul' ? /^[\s]*[-*+]\s+(?!\[[ xX]\]\s)/ : /^[\s]*\d+(?:\.\d+)*\.\s+/;

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
                    // Strip any other list marker first so line types convert instead of nesting
                    var rest = lines[i].trimStart()
                        .replace(/^[-*+]\s+\[[ xX]\]\s*/, '')
                        .replace(/^[-*+]\s+/, '')
                        .replace(/^\d+(?:\.\d+)*\.\s+/, '');
                    lines[i] = indent + listMarker + rest;
                    modified = true;
                }
            }
        }

        if (modified) {
            // Replace editor content
            replaceMarkdownRangeByOffsets(editor, 0, textContent.length, lines.join('\n'));
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
     * Apply markdown underline formatting using inline HTML
     */
    function applyMarkdownUnderline() {
        wrapSelectionWithMarkdown('<u>', '</u>');
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
        var context = getCurrentMarkdownEditContext();
        var editor = context.editor;
        var offsets = context.offsets;
        var prefix = '\n```\n';
        var suffix = '\n```\n';

        if (!editor || !offsets) {
            wrapSelectionWithMarkdown(prefix, suffix);
            return;
        }

        var fullText = getMarkdownEditorValue(editor);
        var selectedText = fullText.slice(offsets.start, offsets.end);
        var beforeText = fullText.slice(Math.max(0, offsets.start - prefix.length), offsets.start);
        var afterText = fullText.slice(offsets.end, offsets.end + suffix.length);

        if (selectedText && beforeText === prefix && afterText === suffix) {
            replaceMarkdownRangeAndSelect(
                editor,
                offsets.start - prefix.length,
                offsets.end + suffix.length,
                selectedText,
                offsets.start - prefix.length,
                offsets.start - prefix.length + selectedText.length
            );
            return;
        }

        var replacement = prefix + selectedText + suffix;
        var caretOffset = offsets.start + prefix.length + selectedText.length;

        replaceMarkdownRangeAndSelect(
            editor,
            offsets.start,
            offsets.end,
            replacement,
            caretOffset,
            caretOffset
        );
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
        
        // Ensure editor has focus to avoid scroll jump
        var context = getCurrentMarkdownEditContext();
        var editor = context.editor;
        var offsets = context.offsets;

        if (editor) {
            focusMarkdownEditor(editor);
        } else {
            const noteentry = document.querySelector('.noteentry');
            if (noteentry) {
                try { noteentry.focus({ preventScroll: true }); } catch (e) { noteentry.focus(); }
            }
        }
        
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end) : (sel ? sel.toString() : '');
        var linkText = text || url || selectedText || 'link';
        var linkUrl = url || 'https://';

        var markdownLink = buildSafeMarkdownLink(linkText, linkUrl);
        if (!markdownLink) {
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup((window.t || function (key, params, fallback) { return fallback; })('slash_menu.invalid_url', null, 'Invalid URL'), 'error');
            }
            return;
        }

        if (editor && offsets) {
            replaceMarkdownRangeAndSelect(
                editor,
                offsets.start,
                offsets.end,
                markdownLink,
                offsets.start,
                offsets.start + markdownLink.length
            );
            return;
        }
        document.execCommand('insertText', false, markdownLink);
    }

    /**
     * Apply markdown heading formatting (toggles heading on/off)
     */
    function applyMarkdownHeading(level) {
        level = Math.max(1, Math.min(6, level || 1));
        var prefix = '#'.repeat(level) + ' ';
        
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var range = context.range;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        if (editor && offsets) {
            var fullText = getMarkdownEditorValue(editor);
            var lineStart = fullText.lastIndexOf('\n', Math.max(0, offsets.start - 1)) + 1;
            var lineEnd = fullText.indexOf('\n', offsets.start);
            if (lineEnd === -1) lineEnd = fullText.length;

            var sourceLine = fullText.slice(lineStart, lineEnd);
            var nextLine = sourceLine.match(/^#{1,6}\s+/)
                ? sourceLine.replace(/^#{1,6}\s+/, '')
                : prefix + sourceLine;

            replaceMarkdownRangeAndSelect(
                editor,
                lineStart,
                lineEnd,
                nextLine,
                lineStart + nextLine.length,
                lineStart + nextLine.length
            );
            return;
        }

        if (!range) return;

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
     * Apply markdown heading level from toolbar (wraps selected text like bold does)
     * @param {string|number} style - 'normal' to remove heading, or '1', '2', '3' for heading level
     */
    function applyMarkdownHeadingLevel(style) {
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var range = context.range;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets && editor
            ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end)
            : (sel ? sel.toString() : '');
        if (!selectedText) return;

        if (editor && offsets) {
            var fullText = getMarkdownEditorValue(editor);
            selectedText = fullText.slice(offsets.start, offsets.end);

            if (style === 'normal') {
                var cleanText = selectedText.replace(/^#{1,6}\s+/, '');
                replaceMarkdownRangeAndSelect(editor, offsets.start, offsets.end, cleanText, offsets.start, offsets.start + cleanText.length);
                return;
            }

            var level = parseInt(style, 10);
            if (!level || level < 1 || level > 6) return;

            var replacement = '#'.repeat(level) + ' ' + selectedText;
            replaceMarkdownRangeAndSelect(editor, offsets.start, offsets.end, replacement, offsets.start + replacement.length, offsets.start + replacement.length);
            return;
        }

        if (!range) return;
        
        if (style === 'normal') {
            // For normal text, just remove any heading markers at the start
            var cleanText = selectedText.replace(/^#{1,6}\s+/, '');
            document.execCommand('insertText', false, cleanText);
        } else {
            // For headings, we need to ensure proper line breaks
            var level = parseInt(style, 10);
            if (!level || level < 1 || level > 6) return;
            
            var prefix = '#'.repeat(level) + ' ';
            var range = sel.getRangeAt(0);
            var container = range.startContainer;
            
            // Check if we need line breaks before and after
            var needsLineBreakBefore = false;
            var needsLineBreakAfter = false;
            
            // Check if there's text before the selection on the same line
            if (container.nodeType === 3) { // Text node
                var textContent = container.textContent;
                var startOffset = range.startOffset;
                var endOffset = range.endOffset;
                
                // Find the start of the current line
                var lineStart = textContent.lastIndexOf('\n', startOffset - 1);
                
                // If there's text between line start and selection start, we need a line break before
                if (lineStart === -1) {
                    // We're on the first line
                    if (startOffset > 0) {
                        needsLineBreakBefore = true;
                    }
                } else {
                    if (startOffset > lineStart + 1) {
                        needsLineBreakBefore = true;
                    }
                }
                
                // Check if there's text after the selection on the same line
                var lineEnd = textContent.indexOf('\n', endOffset);
                if (lineEnd === -1) {
                    // We're on the last line or line doesn't end with \n
                    if (endOffset < textContent.length) {
                        needsLineBreakAfter = true;
                    }
                } else {
                    if (endOffset < lineEnd) {
                        needsLineBreakAfter = true;
                    }
                }
            }
            
            // Build the replacement text with appropriate line breaks
            var replacement = '';
            if (needsLineBreakBefore) replacement += '\n';
            replacement += prefix + selectedText;
            if (needsLineBreakAfter) replacement += '\n';
            
            document.execCommand('insertText', false, replacement);
        }
    }

    /**
     * Apply text color using HTML inline in markdown
     */
    function applyMarkdownColor(color) {
        if (!color) return;
        
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets && editor
            ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end)
            : (sel ? sel.toString() : '');
        
        // If no selection, do nothing
        if (!selectedText) return;
        if (editor && offsets) {
            selectedText = getMarkdownEditorValue(editor).slice(offsets.start, offsets.end);
            var coloredText = '<span style="color:' + color + '">' + selectedText + '</span>';
            replaceMarkdownRangeAndSelect(editor, offsets.start, offsets.end, coloredText, offsets.start, offsets.start + coloredText.length);
            return;
        }

        // Wrap with HTML color span as plain text in the markdown editor
        var coloredText = '<span style="color:' + color + '">' + selectedText + '</span>';
        document.execCommand('insertText', false, coloredText);
    }

    /**
     * Apply markdown highlight formatting
     */
    function applyMarkdownHighlight(color) {
        // Markdown's == highlight syntax has no per-color variant. When a real
        // color is chosen, wrap the selection in an inline-styled span so the
        // chosen highlight color is preserved; the plain == form stays the
        // default for the standard yellow highlight and for "none".
        if (color && color !== 'none' && color !== '#ffe066' &&
            typeof applyMarkdownBackgroundSpan === 'function') {
            applyMarkdownBackgroundSpan(color);
            return;
        }
        wrapSelectionWithMarkdown('==', '==');
    }

    /**
     * Wrap the current markdown selection in an inline background-color span.
     */
    function applyMarkdownBackgroundSpan(color) {
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets && editor
            ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end)
            : (sel ? sel.toString() : '');

        if (!selectedText) return;

        var styledText = '<span style="background-color:' + color + '">' + selectedText + '</span>';
        if (editor && offsets) {
            replaceMarkdownRangeAndSelect(editor, offsets.start, offsets.end, styledText, offsets.start, offsets.start + styledText.length);
            return;
        }
        document.execCommand('insertText', false, styledText);
    }

    /**
     * Apply font size using HTML inline in markdown
     */
    function applyMarkdownFontSize(fontSize) {
        if (!fontSize) return;
        
        var context = getCurrentMarkdownEditContext();
        var sel = context.selection;
        var editor = context.editor;
        var offsets = context.offsets;
        if ((!sel || sel.rangeCount === 0) && !editor) return;

        var selectedText = offsets && editor
            ? getMarkdownEditorValue(editor).slice(offsets.start, offsets.end)
            : (sel ? sel.toString() : '');
        
        // If no selection, do nothing
        if (!selectedText) return;
        if (editor && offsets) {
            selectedText = getMarkdownEditorValue(editor).slice(offsets.start, offsets.end);
            var styledText = '<span style="font-size: ' + fontSize + '">' + selectedText + '</span>';
            replaceMarkdownRangeAndSelect(editor, offsets.start, offsets.end, styledText, offsets.start, offsets.start + styledText.length);
            return;
        }

        // Wrap with HTML span with font size
        var styledText = '<span style="font-size: ' + fontSize + '">' + selectedText + '</span>';
        document.execCommand('insertHTML', false, styledText);
    }

    // Export functions
    window.isInMarkdownEditor = isInMarkdownEditor;
    window.applyMarkdownBold = applyMarkdownBold;
    window.applyMarkdownItalic = applyMarkdownItalic;
    window.applyMarkdownStrikethrough = applyMarkdownStrikethrough;
    window.applyMarkdownUnderline = applyMarkdownUnderline;
    window.applyMarkdownInlineCode = applyMarkdownInlineCode;
    window.applyMarkdownCodeBlock = applyMarkdownCodeBlock;
    window.applyMarkdownLink = applyMarkdownLink;
    window.applyMarkdownHeading = applyMarkdownHeading;
    window.applyMarkdownHeadingLevel = applyMarkdownHeadingLevel;
    window.toggleMarkdownList = toggleMarkdownList;
    window.applyMarkdownColor = applyMarkdownColor;
    window.applyMarkdownHighlight = applyMarkdownHighlight;
    window.applyMarkdownFontSize = applyMarkdownFontSize;

})();

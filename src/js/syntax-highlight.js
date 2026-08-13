/**
 * Syntax Highlighting for Code Blocks
 * Uses Highlight.js to apply syntax highlighting to code blocks with language classes
 */

(function() {
    'use strict';

    var searchHighlightRefreshScheduled = false;

    function scheduleSearchHighlightRefresh() {
        var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
        if (!searchInput || !searchInput.value || !searchInput.value.trim()) {
            return;
        }

        if (typeof window.highlightSearchTerms !== 'function' || searchHighlightRefreshScheduled) {
            return;
        }

        searchHighlightRefreshScheduled = true;
        setTimeout(function() {
            searchHighlightRefreshScheduled = false;
            try {
                window.highlightSearchTerms(true);
            } catch (e) {
                console.warn('Search Highlight refresh error:', e);
            }
        }, 0);
    }

    function isKnownSyntaxHighlightLanguage(language) {
        var normalizedLanguage = String(language || '').trim().toLowerCase();
        return !!(normalizedLanguage && typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function' && hljs.getLanguage(normalizedLanguage));
    }

    function isCodeLineBlockElement(node) {
        if (!node || node.nodeType !== 1) return false;

        // Line-number wrappers render one logical line each, so they end a line
        // just like editable block elements do.
        if (node.classList && node.classList.contains('code-line')) return true;

        return ['DIV', 'P', 'LI'].indexOf(node.tagName) !== -1;
    }

    function getTextWithCodeLineBreaks(node) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            return node.nodeValue || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        if (node.classList && (
            node.classList.contains('code-block-copy-btn') ||
            node.classList.contains('code-block-delete-btn')
        )) {
            return '';
        }

        if (node.tagName === 'BR') {
            return '\n';
        }

        var text = '';
        for (var i = 0; i < node.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(node.childNodes[i]);
        }

        if (isCodeLineBlockElement(node) && !text.endsWith('\n')) {
            text += '\n';
        }

        return text;
    }

    function getCodeBlockSourceText(codeElement) {
        if (!codeElement) return '';

        var text = '';
        for (var i = 0; i < codeElement.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(codeElement.childNodes[i]);
        }

        var lastChild = codeElement.lastChild;
        if (lastChild && isCodeLineBlockElement(lastChild) && text.endsWith('\n')) {
            text = text.slice(0, -1);
        }

        return text.replace(/\u00A0/g, ' ');
    }

    function isExplicitPlainCodeBlock(codeBlock) {
        if (!codeBlock) return false;

        var preElement = codeBlock.closest ? codeBlock.closest('pre') : null;
        var dataLanguage = (codeBlock.getAttribute && codeBlock.getAttribute('data-language')) ||
            (preElement && preElement.getAttribute ? preElement.getAttribute('data-language') : '');

        return String(dataLanguage || '').trim().toLowerCase() === 'code';
    }

    /**
     * Split a code element's content into one DocumentFragment per logical line.
     * Elements spanning several lines (multi-line hljs tokens, styled spans) are
     * re-opened on each new line so per-line wrappers keep the token markup.
     */
    function splitCodeElementIntoLines(codeEl) {
        var lines = [];
        var current = document.createDocumentFragment();
        var openStack = [];

        function appendTarget() {
            return openStack.length ? openStack[openStack.length - 1] : current;
        }

        function newLine() {
            lines.push(current);
            current = document.createDocumentFragment();
            var previousChain = openStack;
            openStack = [];
            var parent = current;
            for (var i = 0; i < previousChain.length; i++) {
                var clone = previousChain[i].cloneNode(false);
                parent.appendChild(clone);
                openStack.push(clone);
                parent = clone;
            }
        }

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                var parts = (node.nodeValue || '').split('\n');
                for (var i = 0; i < parts.length; i++) {
                    if (i > 0) newLine();
                    if (parts[i]) appendTarget().appendChild(document.createTextNode(parts[i]));
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.tagName === 'BR') {
                newLine();
                return;
            }

            var clone = node.cloneNode(false);
            appendTarget().appendChild(clone);
            openStack.push(clone);
            for (var child = node.firstChild; child; child = child.nextSibling) {
                walk(child);
            }
            openStack.pop();
        }

        for (var child = codeEl.firstChild; child; child = child.nextSibling) {
            walk(child);
        }
        lines.push(current);

        return lines;
    }

    function isCodeLineNumberCandidate(codeEl) {
        if (!codeEl || codeEl.classList.contains('language-mermaid') ||
            codeEl.classList.contains('lang-mermaid')) {
            return false;
        }

        var preElement = codeEl.parentElement;
        if (!preElement || preElement.tagName !== 'PRE' ||
            preElement.classList.contains('indented-pre')) {
            return false;
        }

        return true;
    }

    /**
     * Caret preservation across code block rebuilds: the caret position is
     * remembered as a plain character offset (BR counts as one newline) and
     * restored by walking the rebuilt text nodes.
     */
    function computeCaretTextOffset(codeEl) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.rangeCount) return null;

        var range = selection.getRangeAt(0);
        var container = range.startContainer;
        var startOffset = range.startOffset;
        if (!codeEl.contains(container)) return null;

        var count = 0;
        var found = false;

        function walk(node) {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                if (node === container) {
                    count += startOffset;
                    found = true;
                } else {
                    count += (node.nodeValue || '').length;
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.tagName === 'BR') {
                count += 1;
                if (node === container) found = true;
                return;
            }

            var children = node.childNodes;
            for (var i = 0; i < children.length; i++) {
                if (node === container && i === startOffset) {
                    found = true;
                    return;
                }
                walk(children[i]);
                if (found) return;
            }
            if (node === container) found = true;
        }

        walk(codeEl);
        if (!found) return null;

        // After insertLineBreak, Chrome anchors the selection at the end of
        // the text node BEFORE the <br> even though the visible caret sits on
        // the next line. Count the break so the caret is restored there.
        if (container.nodeType === Node.TEXT_NODE &&
            startOffset === (container.nodeValue || '').length &&
            container.nextSibling && container.nextSibling.nodeType === 1 &&
            container.nextSibling.tagName === 'BR') {
            count += 1;
        }

        return count;
    }

    function restoreCaretAtTextOffset(codeEl, offset) {
        if (offset === null || offset === undefined) return;

        var walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, null);
        var remaining = offset;
        var node;
        var target = null;
        var targetOffset = 0;
        var lastNode = null;

        // On an exact node boundary, prefer the START of the next node: line
        // wrappers end with a newline text node, and stopping at its end would
        // put the caret on the previous line's side of the span boundary.
        while ((node = walker.nextNode())) {
            var len = (node.nodeValue || '').length;
            if (remaining < len) {
                target = node;
                targetOffset = remaining;
                break;
            }
            remaining -= len;
            lastNode = node;
        }
        if (!target && lastNode && remaining === 0) {
            target = lastNode;
            targetOffset = (lastNode.nodeValue || '').length;
        }

        var range = document.createRange();
        if (target) {
            range.setStart(target, targetOffset);
        } else {
            range.selectNodeContents(codeEl);
            range.collapse(false);
        }
        range.collapse(true);

        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Remove .code-line wrappers, keeping the inner markup and the exact
     * visible text (a wrapper without a trailing newline still rendered as a
     * full line, so a real newline is materialized in its place).
     */
    function unwrapCodeLineNumbers(codeEl) {
        if (!codeEl) return;

        var spans = [];
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            var child = codeEl.childNodes[i];
            if (child.nodeType === 1 && child.classList && child.classList.contains('code-line')) {
                spans.push(child);
            }
        }

        spans.forEach(function(span, index) {
            var isLast = index === spans.length - 1;
            var endsWithNewline = (span.textContent || '').slice(-1) === '\n';

            if (isLast && endsWithNewline) {
                // Drop the trailing newline the wrapper materialized; the
                // extraction helpers treat it as virtual on the last line, so
                // keeping it would grow the stored content by one newline on
                // every save.
                var lastText = span.lastChild;
                while (lastText && lastText.lastChild) lastText = lastText.lastChild;
                if (lastText && lastText.nodeType === Node.TEXT_NODE) {
                    var value = lastText.nodeValue || '';
                    if (value.slice(-1) === '\n') {
                        if (value.length > 1) {
                            lastText.nodeValue = value.slice(0, -1);
                        } else if (lastText.parentNode) {
                            lastText.parentNode.removeChild(lastText);
                        }
                    }
                }
            }

            while (span.firstChild) {
                codeEl.insertBefore(span.firstChild, span);
            }
            if (!endsWithNewline && !isLast) {
                codeEl.insertBefore(document.createTextNode('\n'), span);
            }
            codeEl.removeChild(span);
        });

        codeEl.classList.remove('code-line-numbers');
        if (codeEl.style) {
            codeEl.style.removeProperty('--code-line-number-digits');
            if (!codeEl.getAttribute('style')) codeEl.removeAttribute('style');
        }
        if (!codeEl.className) codeEl.removeAttribute('class');
    }

    /**
     * True when the .code-line structure no longer matches one logical line
     * per wrapper (Shift+Enter inserts BRs, paste adds newlines, backspace
     * merges lines), or when stray nodes ended up outside the wrappers.
     */
    function isCodeLineStructureDesynced(codeEl) {
        var spans = [];
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            var child = codeEl.childNodes[i];
            if (child.nodeType === 1 && child.classList && child.classList.contains('code-line')) {
                spans.push(child);
            } else if (child.nodeType === Node.TEXT_NODE && !(child.nodeValue || '')) {
                continue;
            } else {
                return true;
            }
        }
        if (!spans.length) return true;

        for (var s = 0; s < spans.length; s++) {
            if (spans[s].querySelector('br')) return true;
            var text = spans[s].textContent || '';
            var newlineAt = text.indexOf('\n');
            if (newlineAt === -1) {
                if (s < spans.length - 1) return true;
            } else if (newlineAt !== text.length - 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Wrap each line of a code block in a .code-line span so CSS counters can
     * draw a line-number gutter (code_block_line_numbers setting). Works on
     * rendered markdown preview blocks and on editable HTML-note blocks; the
     * wrappers are stripped from editable blocks before storage by
     * normalizeCodeBlocksForStorage() in js/notes.js.
     */
    function applyCodeLineNumbersToElement(codeEl) {
        if (!isCodeLineNumberCandidate(codeEl)) return;

        var alreadyNumbered = codeEl.classList.contains('code-line-numbers');
        if (alreadyNumbered && !isCodeLineStructureDesynced(codeEl)) return;

        var caretOffset = codeEl.isContentEditable ? computeCaretTextOffset(codeEl) : null;
        var rebuilt = false;

        if (alreadyNumbered || codeEl.querySelector('.code-line')) {
            unwrapCodeLineNumbers(codeEl);
            rebuilt = true;
        }

        var text = getCodeBlockSourceText(codeEl);
        var lines = null;
        if (text && text.indexOf('\n') !== -1) {
            lines = splitCodeElementIntoLines(codeEl);
            // A trailing newline yields a final empty fragment; don't number it
            if (lines.length > 1 && !lines[lines.length - 1].hasChildNodes()) {
                lines.pop();
            }
            if (lines.length < 2) lines = null;
        }

        if (lines) {
            var wrapped = document.createDocumentFragment();
            lines.forEach(function(lineFragment) {
                var lineSpan = document.createElement('span');
                lineSpan.className = 'code-line';
                lineSpan.appendChild(lineFragment);
                // Keep the newline as real text inside the span: a trailing
                // segment break renders no extra row, but it keeps blank lines
                // one row tall and makes manual selection copy lossless.
                lineSpan.appendChild(document.createTextNode('\n'));
                wrapped.appendChild(lineSpan);
            });

            codeEl.textContent = '';
            codeEl.appendChild(wrapped);
            codeEl.classList.add('code-line-numbers');
            var digits = Math.max(2, String(lines.length).length);
            codeEl.style.setProperty('--code-line-number-digits', digits + 'ch');
            rebuilt = true;
        }

        // Only touch the selection when the DOM was actually rebuilt: a
        // restore always collapses to a caret, which would destroy an
        // in-progress user selection on untouched blocks.
        if (rebuilt && caretOffset !== null) {
            restoreCaretAtTextOffset(codeEl, caretOffset);
        }
    }

    function applyCodeLineNumbers(container) {
        if (!document.body || !document.body.classList.contains('code-block-line-numbers')) {
            return;
        }

        var root = (container && container.querySelectorAll) ? container : document;
        root.querySelectorAll('.noteentry pre > code').forEach(applyCodeLineNumbersToElement);
    }

    // Editable HTML-note blocks drift out of sync while typing (Shift+Enter
    // inserts a BR inside a .code-line wrapper, paste adds newlines, backspace
    // merges lines), so re-sync shortly after the last input.
    var editableRefreshTimer = null;
    document.addEventListener('input', function(e) {
        if (!document.body || !document.body.classList.contains('code-block-line-numbers')) {
            return;
        }

        var host = e.target && e.target.closest ? e.target.closest('.noteentry') : null;
        if (!host || !host.isContentEditable) return;

        clearTimeout(editableRefreshTimer);
        editableRefreshTimer = setTimeout(function() {
            applyCodeLineNumbers(host);
        }, 250);
    });

    /**
     * Apply syntax highlighting to all code blocks in a container
     * @param {HTMLElement} container - The container to search for code blocks (optional, defaults to document)
     */
    function applySyntaxHighlighting(container) {
        if (typeof hljs === 'undefined') {
            console.warn('Syntax Highlight: Highlight.js is not loaded');
            return;
        }

        container = container || document;

        // Find all code blocks with a language class
        var codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
        var highlightedAnyBlock = false;
        
        codeBlocks.forEach(function(codeBlock) {
            // Skip if it's a mermaid block (handled separately)
            if (codeBlock.classList.contains('language-mermaid') ||
                codeBlock.classList.contains('lang-mermaid')) {
                return;
            }

            // Skip if the code block is empty or only has zero-width space
            var text = getCodeBlockSourceText(codeBlock);
            if (!text.trim() || text === '\u200B') {
                return;
            }

            // Get the parent pre element
            var preElement = codeBlock.closest('pre');
            
            // Extract language from code element's class
            var languageMatch = codeBlock.className.match(/language-([\w-]+)/);
            var language = languageMatch ? languageMatch[1] : null;

            if (language && !isKnownSyntaxHighlightLanguage(language)) {
                return;
            }
            
            // Save the data-language attribute if it exists
            var dataLanguage = codeBlock.getAttribute('data-language') || 
                              (preElement ? preElement.getAttribute('data-language') : null) || 
                              language;
            
            // Remove hljs class to allow re-highlighting
            codeBlock.classList.remove('hljs');
            // Remove highlighted dataset to prevent the warning
            delete codeBlock.dataset.highlighted;
            codeBlock.textContent = text;

            try {
                hljs.highlightElement(codeBlock);
                highlightedAnyBlock = true;
                
                // Restore/set data-language on both pre and code elements
                if (dataLanguage) {
                    codeBlock.setAttribute('data-language', dataLanguage);
                    if (preElement) {
                        preElement.setAttribute('data-language', dataLanguage);
                    }
                }
            } catch (e) {
                console.warn('Highlight.js error:', e);
            }
        });

        applyCodeLineNumbers(container);

        if (highlightedAnyBlock) {
            scheduleSearchHighlightRefresh();
        }
    }

    /**
     * Apply syntax highlighting with auto-detection for code blocks without language class
     * @param {HTMLElement} container - The container to search for code blocks (optional, defaults to document)
     */
    function applyAutoHighlighting(container) {
        if (typeof hljs === 'undefined') {
            console.warn('Highlight.js is not loaded');
            return;
        }

        container = container || document;

        // Find all code blocks in pre elements
        var codeBlocks = container.querySelectorAll('pre code:not([class*="language-"]):not(.hljs)');
        var highlightedAnyBlock = false;
        
        codeBlocks.forEach(function(codeBlock) {
            if (isExplicitPlainCodeBlock(codeBlock)) {
                return;
            }

            // Skip if the code block is empty or only has zero-width space
            var text = getCodeBlockSourceText(codeBlock);
            if (!text.trim() || text === '\u200B') {
                return;
            }

            // Only auto-highlight if there's substantial code (at least 10 chars)
            if (text.trim().length < 10) {
                return;
            }

            try {
                // Auto-detect language
                var result = hljs.highlightAuto(text);
                if (result.language && result.relevance > 5) {
                    codeBlock.textContent = text;
                    codeBlock.innerHTML = result.value;
                    codeBlock.classList.add('hljs');
                    codeBlock.classList.add('language-' + result.language);
                    highlightedAnyBlock = true;
                }
            } catch (e) {
                console.warn('Highlight.js auto-detect error:', e);
            }
        });

        applyCodeLineNumbers(container);

        if (highlightedAnyBlock) {
            scheduleSearchHighlightRefresh();
        }
    }

    /**
     * Initialize syntax highlighting when DOM is ready
     */
    function initSyntaxHighlighting() {
        applySyntaxHighlighting(document);
    }

    /**
     * Re-highlight code blocks (useful after dynamic content changes)
     * @param {HTMLElement} container - The container to re-highlight (optional)
     */
    function refreshSyntaxHighlighting(container) {
        container = container || document;
        
        // Remove hljs class to allow re-highlighting
        var highlighted = container.querySelectorAll('pre code.hljs');
        highlighted.forEach(function(codeBlock) {
            // Don't remove if it has data-language (explicitly set)
            if (!codeBlock.hasAttribute('data-highlighted')) {
                codeBlock.classList.remove('hljs');
            }
        });

        applySyntaxHighlighting(container);
    }

    // Export functions globally
    window.getCodeBlockSourceText = window.getCodeBlockSourceText || getCodeBlockSourceText;
    window.applySyntaxHighlighting = applySyntaxHighlighting;
    window.applyAutoHighlighting = applyAutoHighlighting;
    window.applyCodeLineNumbers = applyCodeLineNumbers;
    window.unwrapCodeLineNumbers = unwrapCodeLineNumbers;
    window.refreshSyntaxHighlighting = refreshSyntaxHighlighting;
    window.initSyntaxHighlighting = initSyntaxHighlighting;

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyntaxHighlighting);
    } else {
        initSyntaxHighlighting();
    }

    // Hook into reinitializeNoteContent to apply highlighting after note loads
    var hookRetries = 0;
    function hookReinitializeNoteContent() {
        if (typeof window.reinitializeNoteContent === 'function') {
            var originalReinitializeNoteContent = window.reinitializeNoteContent;
            window.reinitializeNoteContent = function() {
                originalReinitializeNoteContent.apply(this, arguments);
                // Apply syntax highlighting after note content is reinitialized
                setTimeout(function() {
                    applySyntaxHighlighting(document);
                }, 100);
            };
        } else if (hookRetries < 20) {
            hookRetries++;
            setTimeout(hookReinitializeNoteContent, 100);
        }
    }

    // Hook after a short delay to ensure other scripts have loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(hookReinitializeNoteContent, 200);
        });
    } else {
        setTimeout(hookReinitializeNoteContent, 200);
    }

    // Listen for content changes in note entries (for live preview)
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        // Check if it's a code block or contains code blocks
                        if (node.tagName === 'PRE' || node.tagName === 'CODE' ||
                            (node.querySelectorAll && node.querySelectorAll('pre code[class*="language-"]').length > 0)) {
                            setTimeout(function() {
                                applySyntaxHighlighting(node.closest ? node.closest('.noteentry') || document : document);
                            }, 50);
                        }
                    }
                });
            }
        });
    });

    // Start observing when DOM is ready
    function startObserving() {
        var noteContainers = document.querySelectorAll('.noteentry, .markdown-preview, .note-content');
        noteContainers.forEach(function(container) {
            observer.observe(container, { childList: true, subtree: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }
})();

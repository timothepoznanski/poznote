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

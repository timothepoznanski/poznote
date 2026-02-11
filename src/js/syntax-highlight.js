/**
 * Syntax Highlighting for Code Blocks
 * Uses Highlight.js to apply syntax highlighting to code blocks with language classes
 */

(function() {
    'use strict';

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
        
        codeBlocks.forEach(function(codeBlock) {
            // Skip if it's a mermaid block (handled separately)
            if (codeBlock.classList.contains('language-mermaid') ||
                codeBlock.classList.contains('lang-mermaid')) {
                return;
            }

            // Skip if the code block is empty or only has zero-width space
            var text = codeBlock.textContent || '';
            if (!text.trim() || text === '\u200B') {
                return;
            }

            // Get the parent pre element
            var preElement = codeBlock.closest('pre');
            
            // Extract language from code element's class
            var languageMatch = codeBlock.className.match(/language-([\w-]+)/);
            var language = languageMatch ? languageMatch[1] : null;
            
            // Save the data-language attribute if it exists
            var dataLanguage = codeBlock.getAttribute('data-language') || 
                              (preElement ? preElement.getAttribute('data-language') : null) || 
                              language;
            
            // Remove hljs class to allow re-highlighting
            codeBlock.classList.remove('hljs');
            // Remove highlighted dataset to prevent the warning
            delete codeBlock.dataset.highlighted;

            try {
                hljs.highlightElement(codeBlock);
                
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
        
        codeBlocks.forEach(function(codeBlock) {
            // Skip if the code block is empty or only has zero-width space
            var text = codeBlock.textContent || '';
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
                    codeBlock.innerHTML = result.value;
                    codeBlock.classList.add('hljs');
                    codeBlock.classList.add('language-' + result.language);
                }
            } catch (e) {
                console.warn('Highlight.js auto-detect error:', e);
            }
        });
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

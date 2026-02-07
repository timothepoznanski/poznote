/**
 * Math Renderer for KaTeX
 * Renders mathematical equations in markdown notes
 */

(function() {
    'use strict';

    var _mathRetryCount = 0;
    var MAX_MATH_RETRIES = 50; // 5 seconds max

    // Function to render all math elements on the page
    window.renderMathInElement = function(element) {
        if (!element) {
            element = document.body;
        }

        // Check if KaTeX is available
        if (typeof katex === 'undefined') {
            if (_mathRetryCount < MAX_MATH_RETRIES) {
                _mathRetryCount++;
                setTimeout(function() {
                    window.renderMathInElement(element);
                }, 100);
            }
            return;
        }
        _mathRetryCount = 0;

        // Render math blocks (display mode)
        const mathBlocks = element.querySelectorAll('.math-block');
        mathBlocks.forEach(function(block) {
            const mathContent = block.getAttribute('data-math');
            if (mathContent) {
                try {
                    block.innerHTML = '';
                    katex.render(mathContent, block, {
                        displayMode: true,
                        throwOnError: false,
                        errorColor: '#cc0000',
                        trust: false
                    });
                } catch (e) {
                    console.error('KaTeX rendering error (block):', e);
                    block.innerHTML = '<span style="color: #cc0000;">Math rendering error: ' + 
                                      escapeHtml(e.message) + '</span>';
                }
            }
        });

        // Render inline math
        const mathInline = element.querySelectorAll('.math-inline');
        mathInline.forEach(function(inline) {
            const mathContent = inline.getAttribute('data-math');
            if (mathContent) {
                try {
                    inline.innerHTML = '';
                    katex.render(mathContent, inline, {
                        displayMode: false,
                        throwOnError: false,
                        errorColor: '#cc0000',
                        trust: false
                    });
                } catch (e) {
                    console.error('KaTeX rendering error (inline):', e);
                    inline.innerHTML = '<span style="color: #cc0000;">Math error: ' + 
                                       escapeHtml(e.message) + '</span>';
                }
            }
        });
    };

    // Helper function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Re-render when content changes (for dynamic note loading)
    function setupMathObserver() {
        if (typeof MutationObserver !== 'undefined' && document.body) {
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach(function(node) {
                            if (node.nodeType === 1) {
                                renderMathInElement(node);
                            }
                        });
                    }
                });
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Auto-render on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            renderMathInElement(document.body);
            setupMathObserver();
        });
    } else {
        renderMathInElement(document.body);
        setupMathObserver();
    }
})();

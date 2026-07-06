/**
 * Math Renderer for KaTeX
 * Renders mathematical equations in markdown notes
 */

(function() {
    'use strict';

    var _mathRetryCount = 0;
    var MAX_MATH_RETRIES = 50; // 5 seconds max

    var _katexLoading = false;

    // Function to render all math elements on the page
    window.renderMathInElement = function(element) {
        if (!element) {
            element = document.body;
        }

        // Locate math elements first: when there are none (the vast majority
        // of calls, including every MutationObserver tick), exit before any
        // KaTeX loading/availability logic runs.
        const mathBlocks = element.querySelectorAll('.math-block');
        const mathInline = element.querySelectorAll('.math-inline');
        if (mathBlocks.length === 0 && mathInline.length === 0) {
            return;
        }

        // Check if KaTeX is available
        if (typeof katex === 'undefined') {
            // Load it on demand (deduped by lazy-libs.js), then re-run.
            if (typeof window.poznoteEnsureKatex === 'function') {
                if (!_katexLoading) {
                    _katexLoading = true;
                    window.poznoteEnsureKatex().then(function() {
                        _katexLoading = false;
                        window.renderMathInElement(element);
                    }, function(error) {
                        _katexLoading = false;
                        console.error('Could not load KaTeX:', error);
                    });
                }
                return;
            }

            // Fallback for pages that include KaTeX statically (async/defer tag).
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

    // Use global escapeHtml from globals.js, with fallback for standalone pages
    var escapeHtml = window.escapeHtml || function(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

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

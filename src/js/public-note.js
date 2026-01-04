/**
 * Public Note Page JavaScript
 * Handles theme toggle, mermaid rendering, and other public note functionality
 * CSP-compliant external script
 */
(function() {
    'use strict';
    
    // Mark this as a public note page for JS behavior
    window.isPublicNotePage = true;
    
    /**
     * Get Mermaid configuration for the given theme
     * Uses 'base' theme for dark mode with custom colors for better integration
     */
    function getMermaidConfig(isDark) {
        if (isDark) {
            return {
                startOnLoad: false,
                theme: 'base',
                themeVariables: {
                    // Dark mode optimized colors
                    primaryColor: '#3b82f6',
                    primaryTextColor: '#f8fafc',
                    primaryBorderColor: '#60a5fa',
                    lineColor: '#94a3b8',
                    secondaryColor: '#475569',
                    tertiaryColor: '#334155',
                    // Background
                    background: '#1e293b',
                    mainBkg: '#334155',
                    secondBkg: '#475569',
                    // Text colors
                    textColor: '#f1f5f9',
                    nodeTextColor: '#f8fafc',
                    // Flowchart specific
                    nodeBorder: '#60a5fa',
                    clusterBkg: '#1e293b',
                    clusterBorder: '#475569',
                    defaultLinkColor: '#94a3b8',
                    titleColor: '#f1f5f9',
                    edgeLabelBackground: '#334155',
                    // Sequence diagram
                    actorBkg: '#334155',
                    actorBorder: '#60a5fa',
                    actorTextColor: '#f8fafc',
                    actorLineColor: '#94a3b8',
                    signalColor: '#94a3b8',
                    signalTextColor: '#f1f5f9',
                    labelBoxBkgColor: '#334155',
                    labelBoxBorderColor: '#60a5fa',
                    labelTextColor: '#f1f5f9',
                    loopTextColor: '#f1f5f9',
                    noteBorderColor: '#60a5fa',
                    noteBkgColor: '#475569',
                    noteTextColor: '#f1f5f9',
                    // Pie chart
                    pieTitleTextColor: '#f1f5f9',
                    pieSectionTextColor: '#f8fafc',
                    pieLegendTextColor: '#f1f5f9'
                }
            };
        } else {
            return {
                startOnLoad: false,
                theme: 'default'
            };
        }
    }
    
    // Theme toggle functionality
    var themeToggle = document.getElementById('themeToggle');
    var root = document.documentElement;
    
    function updateThemeIcon(theme) {
        if (!themeToggle) return;
        var icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
        root.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        
        try {
            localStorage.setItem('poznote-public-theme', theme);
        } catch (e) {
            // localStorage not available
        }
        
        updateThemeIcon(theme);
        
        // Reinitialize mermaid with new theme if present
        rerenderMermaidDiagrams(theme === 'dark');
    }
    
    /**
     * Re-render all Mermaid diagrams with the specified theme
     * This properly handles Mermaid's caching by removing old IDs and re-rendering
     */
    function rerenderMermaidDiagrams(isDark) {
        if (typeof mermaid === 'undefined') return;
        
        var mermaidNodes = document.querySelectorAll('.mermaid');
        if (mermaidNodes.length === 0) return;
        
        try {
            // Re-initialize mermaid with new config
            mermaid.initialize(getMermaidConfig(isDark));
            
            // Collect nodes that need re-rendering
            var nodesToRender = [];
            
            mermaidNodes.forEach(function(node) {
                var source = node.getAttribute('data-mermaid-source') || '';
                if (!source.trim()) return;
                
                // Remove the data-processed attribute to allow re-rendering
                node.removeAttribute('data-processed');
                
                // Remove any existing ID that Mermaid assigned (they are like mermaid-123)
                if (node.id && node.id.startsWith('mermaid-')) {
                    node.removeAttribute('id');
                }
                
                // Clear the node content and restore original source
                node.innerHTML = '';
                node.textContent = source;
                
                nodesToRender.push(node);
            });
            
            if (nodesToRender.length > 0) {
                // Use mermaid.run for modern versions
                if (typeof mermaid.run === 'function') {
                    mermaid.run({ 
                        nodes: nodesToRender,
                        suppressErrors: true 
                    }).catch(function(e) {
                        console.error('Mermaid re-render failed', e);
                    });
                } else {
                    // Fallback for older mermaid versions
                    mermaid.init(undefined, nodesToRender);
                }
            }
        } catch (e) {
            console.error('Mermaid theme update failed', e);
        }
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            var currentTheme = root.getAttribute('data-theme');
            var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }
    
    // Check localStorage on page load (visitor preference overrides server theme)
    try {
        var savedTheme = localStorage.getItem('poznote-public-theme');
        if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
            var serverTheme = root.getAttribute('data-theme');
            if (savedTheme !== serverTheme) {
                setTheme(savedTheme);
            } else {
                updateThemeIcon(savedTheme);
            }
        } else {
            updateThemeIcon(root.getAttribute('data-theme'));
        }
    } catch (e) {
        updateThemeIcon(root.getAttribute('data-theme') || 'light');
    }
    
    // Mermaid rendering - ensure it runs after DOM is ready and mermaid is loaded
    function tryInitializeMermaid() {
        if (typeof mermaid !== 'undefined') {
            initializeMermaid();
            return true;
        }
        return false;
    }
    
    // Try immediately
    if (!tryInitializeMermaid()) {
        // If mermaid not available, wait for DOM and try again
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                if (!tryInitializeMermaid()) {
                    // Last resort: wait a bit for async script loading
                    setTimeout(tryInitializeMermaid, 100);
                }
            });
        } else {
            // DOM already loaded, wait a bit for async mermaid script
            setTimeout(tryInitializeMermaid, 100);
        }
    }
    
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderMermaidError(node, err, source) {
        var msg = 'Mermaid: syntax error.';
        try {
            if (err) {
                if (typeof err === 'string') msg = err;
                else if (err.str) msg = err.str;
                else if (err.message) msg = err.message;
            }
        } catch (e) {}

        node.classList.remove('mermaid');
        node.innerHTML =
            '<pre><code class="language-text">' +
            escapeHtml(msg) +
            (source ? ('\n\n' + escapeHtml(source)) : '') +
            '</code></pre>';
    }

    function initializeMermaid() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        try {
            // Support Mermaid blocks that ended up rendered as regular code blocks
            // e.g. <pre><code class="language-mermaid">...</code></pre>
            var codeNodes = document.querySelectorAll('pre > code, code');
            for (var i = 0; i < codeNodes.length; i++) {
                var codeNode = codeNodes[i];
                if (!codeNode || !codeNode.classList) continue;
                var isMermaidCode = codeNode.classList.contains('language-mermaid') ||
                    codeNode.classList.contains('lang-mermaid') ||
                    codeNode.classList.contains('mermaid');
                if (!isMermaidCode) continue;
                if (codeNode.closest && codeNode.closest('.mermaid')) continue;

                var pre = codeNode.parentElement && codeNode.parentElement.tagName === 'PRE'
                    ? codeNode.parentElement
                    : (codeNode.closest ? codeNode.closest('pre') : null);

                var diagramText = codeNode.textContent || '';
                if (!diagramText.trim()) continue;

                var mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.textContent = diagramText;

                if (pre && pre.parentNode) {
                    pre.parentNode.replaceChild(mermaidDiv, pre);
                } else if (codeNode.parentNode) {
                    codeNode.parentNode.replaceChild(mermaidDiv, codeNode);
                }
            }

            mermaid.initialize(getMermaidConfig(isDark));

            var mermaidNodes = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
            for (var j = 0; j < mermaidNodes.length; j++) {
                var n = mermaidNodes[j];
                if (!n.getAttribute('data-mermaid-source')) {
                    n.setAttribute('data-mermaid-source', (n.textContent || '').trim());
                }
            }

            if (typeof mermaid.parse === 'function' && typeof Promise !== 'undefined') {
                var validNodes = [];
                var checks = mermaidNodes.map(function(node) {
                    var src = node.getAttribute('data-mermaid-source') || '';
                    if (!src.trim()) return Promise.resolve();
                    return Promise.resolve(mermaid.parse(src))
                        .then(function() {
                            node.textContent = src;
                            validNodes.push(node);
                        })
                        .catch(function(err) {
                            renderMermaidError(node, err, src);
                        });
                });

                Promise.all(checks).then(function() {
                    if (!validNodes.length) return;
                    return mermaid.run({
                        nodes: validNodes,
                        suppressErrors: true
                    });
                }).catch(function(e1) {
                    console.error('Mermaid rendering failed', e1);
                });
            } else {
                mermaid.run({
                    nodes: document.querySelectorAll('.mermaid'),
                    suppressErrors: true
                });
            }
        } catch (e) {
            try {
                mermaid.initialize(getMermaidConfig(isDark));
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            } catch (e2) {
                console.error('Mermaid initialization failed', e2);
            }
        }
    }
})();

/**
 * Public Folder Page JavaScript
 * Handles theme toggle, note expansion, and other public folder functionality
 */

(function() {
    'use strict';

    // Mark this as a public folder page for JS behavior
    window.isPublicFolderPage = true;

    // Theme management
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Get initial theme from data attribute
        const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateThemeIcon(initialTheme);
        
        themeToggle.addEventListener('click', function() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector('i');
        if (icon) {
            if (theme === 'dark') {
                icon.className = 'fas fa-sun';
            } else {
                icon.className = 'fas fa-moon';
            }
        }
    }

    // Initialize Mermaid if present
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: true,
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default',
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true }
        });
    }

    // Re-render Mermaid diagrams on theme change
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                const newTheme = document.documentElement.getAttribute('data-theme');
                if (typeof mermaid !== 'undefined') {
                    // Re-initialize mermaid with new theme
                    mermaid.initialize({
                        startOnLoad: true,
                        theme: newTheme === 'dark' ? 'dark' : 'default',
                        securityLevel: 'loose',
                        flowchart: { useMaxWidth: true }
                    });
                    // Re-render all mermaid diagrams
                    const mermaidDivs = document.querySelectorAll('.mermaid');
                    mermaidDivs.forEach(function(div) {
                        if (div.getAttribute('data-processed')) {
                            div.removeAttribute('data-processed');
                            const originalCode = div.getAttribute('data-original-code');
                            if (originalCode) {
                                div.textContent = originalCode;
                            }
                        }
                    });
                    mermaid.init(undefined, '.mermaid');
                }
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    // Render math equations if KaTeX is loaded
    if (typeof renderMathInElement !== 'undefined') {
        try {
            renderMathInElement(document.body, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false
            });
        } catch (e) {
            console.error('KaTeX rendering failed:', e);
        }
    }
})();

// Note expansion functionality
function expandNote(noteId) {
    const noteItem = document.querySelector('.note-item[data-note-id="' + noteId + '"]');
    if (!noteItem) return;

    const expandBtn = noteItem.querySelector('.expand-note-btn');
    const fullContent = noteItem.querySelector('.note-full-content');
    const preview = noteItem.querySelector('.note-preview');

    if (!fullContent || !expandBtn) return;

    if (fullContent.style.display === 'none' || !fullContent.style.display) {
        // Expand
        fullContent.style.display = 'block';
        if (preview) preview.style.display = 'none';
        expandBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Collapse';
        
        // Re-render math in the expanded content
        if (typeof renderMathInElement !== 'undefined') {
            try {
                renderMathInElement(fullContent, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false
                });
            } catch (e) {
                console.error('KaTeX rendering failed:', e);
            }
        }
        
        // Re-render mermaid diagrams in expanded content
        if (typeof mermaid !== 'undefined') {
            const mermaidDivs = fullContent.querySelectorAll('.mermaid');
            if (mermaidDivs.length > 0) {
                mermaid.init(undefined, mermaidDivs);
            }
        }
    } else {
        // Collapse
        fullContent.style.display = 'none';
        if (preview) preview.style.display = 'block';
        expandBtn.innerHTML = '<i class="fas fa-chevron-down"></i> View full note';
    }
}

window.expandNote = expandNote;

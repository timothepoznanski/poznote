/**
 * Public Note Page JavaScript
 * Handles theme toggle, mermaid rendering, and other public note functionality
 * CSP-compliant external script
 */
(function () {
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
    const themeToggle = document.getElementById('themeToggle');
    const root = document.documentElement;

    function updateThemeIcon(theme) {
        if (!themeToggle) return;
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'lucide lucide-sun' : 'lucide lucide-moon';
        }
    }

    function setTheme(theme) {
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
        root.style.backgroundColor = theme === 'dark' ? '#252526' : '#ffffff';

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

        const mermaidNodes = document.querySelectorAll('.mermaid');
        if (mermaidNodes.length === 0) return;

        try {
            // Re-initialize mermaid with new config
            mermaid.initialize(getMermaidConfig(isDark));

            // Collect nodes that need re-rendering
            const nodesToRender = [];

            mermaidNodes.forEach(function (node) {
                const source = node.getAttribute('data-mermaid-source') || '';
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
                    }).catch(function (e) {
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
        themeToggle.addEventListener('click', function () {
            const currentTheme = root.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            setTheme(newTheme);
        });
    }

    // Check localStorage on page load (visitor preference overrides server theme)
    try {
        const savedTheme = localStorage.getItem('poznote-public-theme');
        if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light')) {
            const serverTheme = root.getAttribute('data-theme');
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
            document.addEventListener('DOMContentLoaded', function () {
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
        let msg = 'Mermaid: syntax error.';
        try {
            if (err) {
                if (typeof err === 'string') msg = err;
                else if (err.str) msg = err.str;
                else if (err.message) msg = err.message;
            }
        } catch (e) { }

        node.classList.remove('mermaid');
        node.innerHTML =
            '<pre><code class="language-text">' +
            escapeHtml(msg) +
            (source ? ('\n\n' + escapeHtml(source)) : '') +
            '</code></pre>';
    }

    function initializeMermaid() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        try {
            // Support Mermaid blocks that ended up rendered as regular code blocks
            // e.g. <pre><code class="language-mermaid">...</code></pre>
            const codeNodes = document.querySelectorAll('pre > code, code');
            for (let i = 0; i < codeNodes.length; i++) {
                const codeNode = codeNodes[i];
                if (!codeNode || !codeNode.classList) continue;
                const isMermaidCode = codeNode.classList.contains('language-mermaid') ||
                    codeNode.classList.contains('lang-mermaid') ||
                    codeNode.classList.contains('mermaid');
                if (!isMermaidCode) continue;
                if (codeNode.closest && codeNode.closest('.mermaid')) continue;

                const pre = codeNode.parentElement && codeNode.parentElement.tagName === 'PRE'
                    ? codeNode.parentElement
                    : (codeNode.closest ? codeNode.closest('pre') : null);

                const diagramText = codeNode.textContent || '';
                if (!diagramText.trim()) continue;

                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.textContent = diagramText;

                if (pre && pre.parentNode) {
                    pre.parentNode.replaceChild(mermaidDiv, pre);
                } else if (codeNode.parentNode) {
                    codeNode.parentNode.replaceChild(mermaidDiv, codeNode);
                }
            }

            mermaid.initialize(getMermaidConfig(isDark));

            const mermaidNodes = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
            for (let j = 0; j < mermaidNodes.length; j++) {
                const n = mermaidNodes[j];
                if (!n.getAttribute('data-mermaid-source')) {
                    n.setAttribute('data-mermaid-source', (n.textContent || '').trim());
                }
            }

            if (typeof mermaid.parse === 'function' && typeof Promise !== 'undefined') {
                const validNodes = [];
                const checks = mermaidNodes.map(function (node) {
                    const src = node.getAttribute('data-mermaid-source') || '';
                    if (!src.trim()) return Promise.resolve();
                    return Promise.resolve(mermaid.parse(src))
                        .then(function () {
                            node.textContent = src;
                            validNodes.push(node);
                        })
                        .catch(function (err) {
                            renderMermaidError(node, err, src);
                        });
                });

                Promise.all(checks).then(function () {
                    if (!validNodes.length) return;
                    return mermaid.run({
                        nodes: validNodes,
                        suppressErrors: true
                    });
                }).catch(function (e1) {
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

    /**
     * Helper to get public config
     */
    function getPublicConfig() {
        const configElement = document.getElementById('public-note-config');
        if (!configElement) return null;
        try {
            return JSON.parse(configElement.textContent);
        } catch (err) {
            console.error('Failed to parse config', err);
            return null;
        }
    }

    // Task list interaction (Checkboxes)
    document.addEventListener('change', function (e) {
        if (!e.target || !e.target.matches('.task-checkbox, .markdown-task-checkbox')) return;

        const checkbox = e.target;
        const config = getPublicConfig();
        if (!config || !config.token) return;

        const isMarkdown = checkbox.classList.contains('markdown-task-checkbox');
        const completed = checkbox.checked;
        const idOrIndex = isMarkdown ? checkbox.getAttribute('data-line') : checkbox.getAttribute('data-index');
        const apiBaseUrl = config.apiBaseUrl || 'api/v1';

        // Optimistic UI update
        const taskItem = checkbox.closest('.task-item, .task-list-item');
        if (taskItem) {
            taskItem.classList.toggle('completed', completed);

            // Move to bottom if completed
            if (completed) {
                const parent = taskItem.parentNode;
                // Add a small delay for the animation/feel
                setTimeout(() => {
                    if (checkbox.checked) { // Double check it's still checked
                        parent.appendChild(taskItem);
                    }
                }, 300);
            }
        }

        fetch(`${apiBaseUrl}/public/tasks/${idOrIndex}?token=${encodeURIComponent(config.token)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: completed })
        })
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    console.error('Failed to update task', data.error);
                    location.reload(); // Revert by reloading
                } else if (!isMarkdown) {
                    // For tasklists, sorting on server might have changed indices
                    // Let's reload to be safe and keep UI in sync with server sort
                    setTimeout(() => location.reload(), 800);
                }
            })
            .catch(err => {
                console.error('Network error', err);
                checkbox.checked = !completed;
                if (taskItem) taskItem.classList.toggle('completed', !completed);
            });
    });

    /**
     * Handle adding a new task
     * @param {HTMLInputElement} input - The input element containing the task text
     */
    function handleAddTask(input) {
        const text = input.value.trim();
        if (!text) return;

        const config = getPublicConfig();
        if (!config || !config.token) return;
        const apiBaseUrl = config.apiBaseUrl || 'api/v1';

        fetch(`${apiBaseUrl}/public/tasks?token=${encodeURIComponent(config.token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reload to show new item (simpler for public view)
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => console.error('Network error', err));
    }

    document.addEventListener('keydown', function (e) {
        if (e.target.matches('.public-task-add-input, .public-markdown-task-add-input')) {
            if (e.key === 'Enter') {
                handleAddTask(e.target);
            }
        }
    });

    /**
     * Enable inline editing for a task
     * @param {HTMLElement} textElement - The text element to edit
     * @param {string|number} idOrIndex - The task ID or index
     * @param {boolean} isMarkdown - Whether this is a markdown task
     */
    function enableInlineEdit(textElement, idOrIndex, isMarkdown) {
        const originalText = textElement.getAttribute('data-text') || textElement.textContent;
        const width = textElement.offsetWidth;

        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'public-task-edit-input';

        // Style to look like text
        input.style.width = '100%';
        input.style.minWidth = Math.max(width, 200) + 'px';
        input.style.font = 'inherit';
        input.style.color = 'inherit';
        input.style.background = 'transparent';
        // Use css variable if available, else fallback
        input.style.border = '1px solid var(--primary-color, #3b82f6)';
        input.style.borderRadius = '4px';
        input.style.padding = '2px 4px';
        input.style.boxSizing = 'border-box';

        let isSaving = false;

        const save = () => {
            if (isSaving) return;
            isSaving = true;

            const newText = input.value.trim();
            if (newText !== null && newText !== originalText) {
                updateTaskText(idOrIndex, newText, isMarkdown);
            } else {
                cancel();
            }
        };

        const cancel = () => {
            // If we're cancelling, we just put back the element
            // If save was called and triggered a reload, this might race, but usually reload wins
            if (input.parentNode) {
                input.replaceWith(textElement);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        input.addEventListener('blur', save);

        textElement.replaceWith(input);
        input.focus();
    }

    // Task interaction handlers (edit and delete)
    document.addEventListener('click', function (e) {
        const deleteBtn = e.target.closest('.public-task-delete-btn');
        if (deleteBtn) {
            const taskItem = deleteBtn.closest('.task-item');
            const config = getPublicConfig();
            const deleteMessage = config?.i18n?.deleteTask || 'Delete this task?';
            const deleteTitle = config?.i18n?.confirm || 'Confirm';
            
            if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
                window.modalAlert.confirm(deleteMessage, deleteTitle)
                    .then(function(isConfirmed) {
                        if (isConfirmed) {
                            deleteTask(taskItem.getAttribute('data-index'));
                        }
                    });
            } else {
                // Fallback to native confirm if modal system not available
                const isConfirmed = window.confirm(deleteMessage);
                if (isConfirmed) {
                    deleteTask(taskItem.getAttribute('data-index'));
                }
            }
            return;
        }

        // Click on structured task text to edit
        if (e.target.matches('.task-item .task-text')) {
            const taskItem = e.target.closest('.task-item');
            const idOrIndex = taskItem.getAttribute('data-index');
            enableInlineEdit(e.target, idOrIndex, false);
            return;
        }

        // Click on markdown task text to edit
        if (e.target.matches('.task-list-item .task-text')) {
            const taskItem = e.target.closest('.task-list-item');
            const idOrIndex = taskItem.getAttribute('data-line');
            enableInlineEdit(e.target, idOrIndex, true);
        }
    });

    /**
     * Update task text on the server
     * @param {string|number} idOrIndex - The task ID or index
     * @param {string} text - The new task text
     * @param {boolean} isMarkdown - Whether this is a markdown task
     */
    function updateTaskText(idOrIndex, text, isMarkdown = false) {
        const config = getPublicConfig();
        if (!config || !config.token) return;
        const apiBaseUrl = config.apiBaseUrl || 'api/v1';

        fetch(`${apiBaseUrl}/public/tasks/${idOrIndex}?token=${encodeURIComponent(config.token)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => console.error('Network error', err));
    }

    /**
     * Delete a task from the server
     * @param {string|number} index - The task index
     */
    function deleteTask(index) {
        const config = getPublicConfig();
        if (!config || !config.token || index === null) return;
        const apiBaseUrl = config.apiBaseUrl || 'api/v1';

        fetch(`${apiBaseUrl}/public/tasks/${index}?token=${encodeURIComponent(config.token)}`, {
            method: 'DELETE'
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => console.error('Network error', err));
    }
})();

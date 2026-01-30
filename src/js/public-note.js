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

        var mermaidNodes = document.querySelectorAll('.mermaid');
        if (mermaidNodes.length === 0) return;

        try {
            // Re-initialize mermaid with new config
            mermaid.initialize(getMermaidConfig(isDark));

            // Collect nodes that need re-rendering
            var nodesToRender = [];

            mermaidNodes.forEach(function (node) {
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
        var msg = 'Mermaid: syntax error.';
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
                var checks = mermaidNodes.map(function (node) {
                    var src = node.getAttribute('data-mermaid-source') || '';
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

    // Task strings from PHP-passed i18n or fallbacks
    const globalConfig = getPublicConfig(); // Get config once for i18n
    const i18n = globalConfig ? (globalConfig.i18n || {}) : {};
    const texts = {
        addTask: i18n.addTask || 'Add a task...',
        editTask: i18n.editTask || 'Edit task:',
        deleteTask: i18n.deleteTask || 'Delete this task?',
        confirm: i18n.confirm || 'Confirm',
        cancel: i18n.cancel || 'Cancel',
        ok: i18n.ok || 'OK'
    };

    /**
     * Helper for Poznote-styled prompt
     */
    function publicNotePrompt(message, defaultValue = '') {
        return new Promise((resolve) => {
            const config = {
                type: 'prompt',
                message,
                alertType: 'info',
                title: 'Poznote',
                buttons: [
                    { text: texts.cancel, type: 'secondary', action: () => resolve(null) },
                    {
                        text: texts.ok, type: 'primary', action: () => {
                            const input = document.getElementById('public-prompt-input');
                            resolve(input ? input.value : null);
                        }
                    }
                ]
            };

            // Custom implementation for prompt since modal-alerts.js doesn't have it
            if (window.modalAlert) {
                const originalCreateModal = window.modalAlert.createModal;
                window.modalAlert.createModal = function (cfg) {
                    if (cfg.type === 'prompt') {
                        const overlay = document.createElement('div');
                        overlay.className = 'alert-modal-overlay';
                        const modal = document.createElement('div');
                        modal.className = 'alert-modal';
                        const body = document.createElement('div');
                        body.className = 'alert-modal-body';
                        body.textContent = cfg.message;

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = 'public-prompt-input';
                        input.value = defaultValue;
                        input.style.width = '100%';
                        input.style.marginTop = '15px';
                        input.style.padding = '10px';
                        input.style.border = '1px solid #ddd';
                        input.style.borderRadius = '4px';
                        input.style.boxSizing = 'border-box';
                        body.appendChild(input);

                        const footer = document.createElement('div');
                        footer.className = 'alert-modal-footer';
                        cfg.buttons.forEach(btn => {
                            const b = document.createElement('button');
                            b.className = `alert-modal-button ${btn.type}`;
                            b.textContent = btn.text;
                            b.onclick = () => {
                                window.modalAlert.closeModal(overlay);
                                btn.action();
                            };
                            footer.appendChild(b);
                        });

                        modal.appendChild(body);
                        modal.appendChild(footer);
                        overlay.appendChild(modal);
                        document.body.appendChild(overlay);
                        window.modalAlert.currentModal = overlay;

                        input.onkeydown = (e) => {
                            if (e.key === 'Enter') {
                                window.modalAlert.closeModal(overlay);
                                cfg.buttons.find(b => b.type === 'primary').action();
                            } else if (e.key === 'Escape') {
                                window.modalAlert.closeModal(overlay);
                                cfg.buttons.find(b => b.type === 'secondary').action();
                            }
                        };

                        requestAnimationFrame(() => overlay.classList.add('show'));
                        setTimeout(() => input.focus(), 100);

                        // Restore original method
                        window.modalAlert.createModal = originalCreateModal;
                    } else {
                        originalCreateModal.call(window.modalAlert, cfg);
                    }
                };
                window.modalAlert.showModal(config);
            } else {
                // Fallback to native prompt if something failed
                resolve(prompt(message, defaultValue));
            }
        });
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

    // Add Task Handler
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

    // Edit Task Handler
    document.addEventListener('click', async function (e) {
        const editBtn = e.target.closest('.public-task-edit-btn');
        if (editBtn) {
            const taskItem = editBtn.closest('.task-item');
            const textSpan = taskItem.querySelector('.task-text');
            const originalText = textSpan.getAttribute('data-text') || textSpan.textContent;

            const newText = await publicNotePrompt(texts.editTask, originalText);
            if (newText !== null && newText.trim() !== originalText) {
                updateTaskText(taskItem.getAttribute('data-index'), newText.trim());
            }
            return;
        }

        const deleteBtn = e.target.closest('.public-task-delete-btn');
        if (deleteBtn) {
            const isConfirmed = await window.confirm(texts.deleteTask);
            if (isConfirmed) {
                const taskItem = deleteBtn.closest('.task-item');
                deleteTask(taskItem.getAttribute('data-index'));
            }
            return;
        }

        // Click on markdown task text to edit
        if (e.target.matches('.task-list-item .task-text')) {
            const taskItem = e.target.closest('.task-list-item');
            const idOrIndex = taskItem.getAttribute('data-line');
            const originalText = e.target.getAttribute('data-text') || e.target.textContent;

            const newText = await publicNotePrompt(texts.editTask, originalText);
            if (newText !== null && newText.trim() !== originalText) {
                updateTaskText(idOrIndex, newText.trim(), true);
            }
        }
    });

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

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
                flowchart: {
                    htmlLabels: false
                },
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
                theme: 'default',
                flowchart: {
                    htmlLabels: false
                }
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
            const effectiveTheme = theme === 'black' ? 'dark' : theme;
            icon.className = effectiveTheme === 'dark' ? 'lucide lucide-sun' : 'lucide lucide-moon';
        }
    }

    function setTheme(theme, options) {
        options = options || {};
        const effectiveTheme = theme === 'black' ? 'dark' : theme;
        const isDark = effectiveTheme === 'dark';
        const background = theme === 'black' ? '#141821' : '#252526';
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        root.style.colorScheme = isDark ? 'dark' : 'light';
        root.style.backgroundColor = isDark ? background : '#ffffff';
        root.classList.toggle('theme-black', theme === 'black');

        try {
            localStorage.setItem('poznote-public-theme', theme);
        } catch (e) {
            // localStorage not available
        }

        updateThemeIcon(theme);

        if (options.rerenderMermaid !== false) {
            rerenderMermaidDiagrams();
        }
    }

    /**
     * Re-render all Mermaid diagrams with the specified theme
     * This properly handles Mermaid's caching by removing old IDs and re-rendering
     */
    function rerenderMermaidDiagrams() {
        if (typeof mermaid === 'undefined') return;
        initializeMermaid();
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
        if (savedTheme && (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'black')) {
            const serverTheme = root.getAttribute('data-theme');
            const savedEffectiveTheme = savedTheme === 'black' ? 'dark' : savedTheme;
            const savedIsBlack = savedTheme === 'black';
            if (savedEffectiveTheme !== serverTheme || savedIsBlack !== root.classList.contains('theme-black')) {
                setTheme(savedTheme, { rerenderMermaid: false });
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

    function normalizeMermaidSourceForRendering(source) {
        return String(source || '')
            .replace(/\\n/g, '<br/>')
            .replace(/<br\s*\/?>/gi, '<br/>');
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
                mermaidDiv.setAttribute('data-mermaid-source', diagramText.trim());

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
                const source = n.getAttribute('data-mermaid-source') || '';
                if (source.trim()) {
                    n.removeAttribute('data-processed');
                    if (n.id && n.id.startsWith('mermaid-')) {
                        n.removeAttribute('id');
                    }
                    n.innerHTML = '';
                    n.textContent = normalizeMermaidSourceForRendering(source);
                }
            }

            if (typeof mermaid.parse === 'function' && typeof Promise !== 'undefined') {
                const validNodes = [];
                const checks = mermaidNodes.map(function (node) {
                    const src = node.getAttribute('data-mermaid-source') || '';
                    const renderSrc = normalizeMermaidSourceForRendering(src);
                    if (!src.trim()) return Promise.resolve();
                    return Promise.resolve(mermaid.parse(renderSrc))
                        .then(function () {
                            node.removeAttribute('data-processed');
                            node.textContent = renderSrc;
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

    function getTaskAccessMode() {
        const config = getPublicConfig();
        const accessMode = config && typeof config.taskAccessMode === 'string' ? config.taskAccessMode : 'full';
        return ['read_only', 'check_only', 'full'].includes(accessMode) ? accessMode : 'full';
    }

    function canToggleTasks() {
        return ['check_only', 'full'].includes(getTaskAccessMode());
    }

    function canFullyEditTasks() {
        return getTaskAccessMode() === 'full';
    }

    // Task list interaction (Checkboxes)
    document.addEventListener('change', function (e) {
        if (!e.target || !e.target.matches('.task-checkbox, .markdown-task-checkbox')) return;

        const checkbox = e.target;
        const config = getPublicConfig();
        if (!config || !config.token) return;

        if (!canToggleTasks()) {
            checkbox.checked = !checkbox.checked;
            return;
        }

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
        if (!canFullyEditTasks()) return;

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
                // preventDefault also suppresses the implicit form submission,
                // so handleAddTask is not called twice when keydown does fire.
                e.preventDefault();
                handleAddTask(e.target);
            }
        }
    });

    // Implicit form submission is the only Enter mechanism that mobile virtual
    // keyboards trigger reliably (their keydown events often come through IME
    // composition with key 'Unidentified' instead of 'Enter').
    document.addEventListener('submit', function (e) {
        const form = e.target;
        if (!form.classList || !form.classList.contains('task-input-form')) return;
        e.preventDefault();
        const input = form.querySelector('.public-task-add-input, .public-markdown-task-add-input');
        if (input) handleAddTask(input);
    });

    let publicTaskEditState = {
        idOrIndex: null,
        isMarkdown: false,
        originalText: '',
        lastFocusedElement: null
    };

    function getPublicTaskEditText(key, fallback) {
        const config = getPublicConfig();
        return (config && config.i18n && config.i18n[key]) ? config.i18n[key] : fallback;
    }

    function setPublicTaskEditError(message) {
        const errorEl = document.getElementById('publicTaskEditError');
        if (!errorEl) return;

        errorEl.textContent = message || '';
        errorEl.style.display = message ? 'block' : 'none';
    }

    function closePublicTaskEditModal() {
        const overlay = document.getElementById('publicTaskEditOverlay');
        if (overlay) overlay.classList.remove('show');

        const lastFocusedElement = publicTaskEditState.lastFocusedElement;
        publicTaskEditState = {
            idOrIndex: null,
            isMarkdown: false,
            originalText: '',
            lastFocusedElement: null
        };
        setPublicTaskEditError('');

        if (lastFocusedElement && document.contains(lastFocusedElement)) {
            lastFocusedElement.focus({ preventScroll: true });
        }
    }

    function savePublicTaskEditModal() {
        const textarea = document.getElementById('publicTaskEditTextarea');
        if (!textarea || publicTaskEditState.idOrIndex === null) return;

        const newText = textarea.value.trim();
        if (!newText) {
            setPublicTaskEditError(getPublicTaskEditText('taskEditEmptyError', 'Task text cannot be empty.'));
            textarea.focus();
            return;
        }

        if (newText !== publicTaskEditState.originalText) {
            updateTaskText(publicTaskEditState.idOrIndex, newText, publicTaskEditState.isMarkdown);
        } else {
            closePublicTaskEditModal();
        }
    }

    function ensurePublicTaskEditModal() {
        let overlay = document.getElementById('publicTaskEditOverlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'publicTaskEditOverlay';
        overlay.className = 'alert-modal-overlay public-task-edit-overlay';
        overlay.innerHTML = `
            <div class="alert-modal public-task-edit-modal" role="dialog" aria-modal="true" aria-labelledby="publicTaskEditTitle">
                <div class="alert-modal-body public-task-edit-body">
                    <h3 id="publicTaskEditTitle" class="public-task-edit-title">${escapeHtml(getPublicTaskEditText('editTask', 'Edit task'))}</h3>
                    <label for="publicTaskEditTextarea" class="task-edit-label">${escapeHtml(getPublicTaskEditText('taskTextLabel', 'Task text'))}</label>
                    <textarea id="publicTaskEditTextarea" class="task-edit-textarea public-task-edit-textarea" maxlength="4000" aria-describedby="publicTaskEditHint publicTaskEditError"></textarea>
                    <p id="publicTaskEditHint" class="task-edit-hint">${escapeHtml(getPublicTaskEditText('taskEditHint', 'Enter adds a new line. Ctrl+Enter saves.'))}</p>
                    <p id="publicTaskEditError" class="task-edit-error" role="alert"></p>
                </div>
                <div class="alert-modal-footer public-task-edit-footer">
                    <button type="button" class="alert-modal-button public-task-edit-cancel" id="publicTaskEditCancelBtn">${escapeHtml(getPublicTaskEditText('cancel', 'Cancel'))}</button>
                    <button type="button" class="alert-modal-button primary" id="publicTaskEditSaveBtn">${escapeHtml(getPublicTaskEditText('save', 'Save'))}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const textarea = document.getElementById('publicTaskEditTextarea');
        const saveBtn = document.getElementById('publicTaskEditSaveBtn');
        const cancelBtn = document.getElementById('publicTaskEditCancelBtn');

        if (textarea) {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    savePublicTaskEditModal();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closePublicTaskEditModal();
                }
            });

            textarea.addEventListener('input', function() {
                setPublicTaskEditError('');
            });
        }

        if (saveBtn) saveBtn.addEventListener('click', savePublicTaskEditModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closePublicTaskEditModal);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                closePublicTaskEditModal();
            }
        });

        return overlay;
    }

    /**
     * Open the task edit modal
     * @param {HTMLElement} textElement - The text element to edit
     * @param {string|number} idOrIndex - The task ID or index
     * @param {boolean} isMarkdown - Whether this is a markdown task
     */
    function enableInlineEdit(textElement, idOrIndex, isMarkdown) {
        const originalText = textElement.getAttribute('data-text') || textElement.textContent;
        const overlay = ensurePublicTaskEditModal();
        const textarea = document.getElementById('publicTaskEditTextarea');
        if (!overlay || !textarea) return;

        publicTaskEditState = {
            idOrIndex: idOrIndex,
            isMarkdown: isMarkdown,
            originalText: originalText,
            lastFocusedElement: textElement
        };

        setPublicTaskEditError('');
        textarea.value = originalText;
        overlay.classList.add('show');

        requestAnimationFrame(function() {
            textarea.focus();
            const end = textarea.value.length;
            try {
                textarea.setSelectionRange(end, end);
            } catch (e) {
                // Some browsers do not support selection APIs on inactive controls.
            }
        });
    }

    // Task interaction handlers (edit and delete)
    document.addEventListener('click', function (e) {
        const deleteBtn = e.target.closest('.public-task-delete-btn');
        if (deleteBtn) {
            if (!canFullyEditTasks()) return;
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
            if (!canFullyEditTasks()) return;
            const taskItem = e.target.closest('.task-item');
            const idOrIndex = taskItem.getAttribute('data-index');
            enableInlineEdit(e.target, idOrIndex, false);
            return;
        }

        // Click on markdown task text to edit
        if (e.target.matches('.task-list-item .task-text')) {
            if (!canFullyEditTasks()) return;
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
        if (!canFullyEditTasks()) return;

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
        if (!canFullyEditTasks()) return;

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

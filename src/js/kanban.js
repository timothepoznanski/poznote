/**
 * Kanban View JavaScript
 * Handles drag and drop functionality for moving notes between subfolder columns
 */

(function () {
    'use strict';

    // State
    let draggedCard = null;
    let draggedFromFolderId = null;
    let pointerStartedInTaskPreview = false;
    let trackedKanbanBoard = null;
    let kanbanScrollResizeObserver = null;

    function isPublicWorkspaceReadOnly() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    function syncKanbanCardDragState() {
        const isReadOnly = isPublicWorkspaceReadOnly();
        document.querySelectorAll('.kanban-card').forEach((card) => {
            if (isReadOnly) {
                card.removeAttribute('draggable');
                card.draggable = false;
            }
        });
    }

    /**
     * Initialization called either on DOMContentLoaded or manually when content is loaded via AJAX
     */
    function init() {
        syncKanbanCardDragState();
        bindKanbanScrollButtons();
        restoreCompletedSectionStates();

        // Document-level delegation ensures listeners work even when content is replaced
        if (window._kanbanInitialized) {
            return;
        }

        setupDelegatedEvents();
        window._kanbanInitialized = true;
    }

    /**
     * Setup drag and drop functionality using document delegation
     */
    function setupDelegatedEvents() {
        document.addEventListener('pointerdown', (e) => {
            pointerStartedInTaskPreview = !!e.target.closest('.kanban-tasklist-preview');
        }, true);

        document.addEventListener('pointerup', () => {
            pointerStartedInTaskPreview = false;
        }, true);

        // Drag Start
        document.addEventListener('dragstart', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                e.preventDefault();
                return;
            }

            // Text-selection drags fire dragstart with a text node target
            const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
            if (!targetEl) return;

            if (pointerStartedInTaskPreview || targetEl.closest('.kanban-tasklist-preview')) {
                e.preventDefault();
                draggedCard = null;
                draggedFromFolderId = null;
                pointerStartedInTaskPreview = false;
                return;
            }

            const card = targetEl.closest('.kanban-card');
            if (!card) return;

            draggedCard = card;
            draggedFromFolderId = card.dataset.folderId;

            // Add dragging class
            card.classList.add('dragging');

            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.noteId);

            // Add a slight delay for visual feedback
            setTimeout(() => {
                if (draggedCard) draggedCard.style.opacity = '0.4';
            }, 0);
        });

        // Drag End
        document.addEventListener('dragend', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            // Text-selection drags fire dragend with a text node target
            const targetEl = e.target instanceof Element ? e.target : e.target && e.target.parentElement;
            const card = targetEl && targetEl.closest('.kanban-card');
            if (!card) return;

            card.classList.remove('dragging');
            card.style.opacity = '1';

            // Clean up visual states
            document.querySelectorAll('.kanban-column-content, .kanban-column').forEach(el => {
                el.classList.remove('drag-over');
            });

            draggedCard = null;
            draggedFromFolderId = null;
            pointerStartedInTaskPreview = false;
        });

        // Drag Over - CRITICAL: must prevent default to allow drop
        document.addEventListener('dragover', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            // Important: we are over a column, allow drop
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // Drag Enter
        document.addEventListener('dragenter', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            columnContent.classList.add('drag-over');
            const column = columnContent.closest('.kanban-column');
            if (column) column.classList.add('drag-over');
        });

        // Drag Leave
        document.addEventListener('dragleave', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            // Check if we're actually leaving the column content (not entering a child card)
            if (!columnContent.contains(e.relatedTarget)) {
                columnContent.classList.remove('drag-over');
                const column = columnContent.closest('.kanban-column');
                if (column) column.classList.remove('drag-over');
            }
        });

        // Drop
        document.addEventListener('drop', async (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            // Prevent browser default drop action
            e.preventDefault();
            // Stop propagation to avoid Poznote's folder-drop logic
            e.stopPropagation();


            columnContent.classList.remove('drag-over');
            const column = columnContent.closest('.kanban-column');
            if (column) column.classList.remove('drag-over');

            if (!draggedCard) {
                console.warn("Kanban: Drop occurred but no draggedCard state found.");
                return;
            }

            const targetFolderId = columnContent.dataset.folderId;
            const noteId = draggedCard.dataset.noteId;

            // Don't do anything if dropped in the same column
            if (targetFolderId === draggedFromFolderId) {
                return;
            }

            // Move the card visually immediately for best UX
            const originalParent = draggedCard.parentNode;
            const originalSibling = draggedCard.nextElementSibling;
            const oldFolderId = draggedFromFolderId;

            // A dragged card always lands in the active area, above the
            // completed section of the target column.
            const targetCompletedSection = columnContent.querySelector(':scope > .kanban-completed-section');
            if (targetCompletedSection) {
                columnContent.insertBefore(draggedCard, targetCompletedSection);
            } else {
                columnContent.appendChild(draggedCard);
            }
            draggedCard.dataset.folderId = targetFolderId;
            draggedCard.classList.add('kanban-card-dropped');

            // Dragging a completed card into another column puts it back into
            // active work, so its completed state is cleared.
            const wasCompleted = draggedCard.dataset.completed === '1';
            if (wasCompleted) {
                draggedCard.classList.remove('kanban-card-completed');
                draggedCard.dataset.completed = '0';
                const completeBtn = draggedCard.querySelector('.kanban-card-complete-btn');
                if (completeBtn) {
                    const label = kanbanT('kanban.completed.mark_completed', 'Mark as completed');
                    completeBtn.setAttribute('aria-pressed', 'false');
                    completeBtn.setAttribute('aria-label', label);
                    completeBtn.title = label;
                }
            }

            // Remove animation class after it completes
            setTimeout(() => {
                if (draggedCard) draggedCard.classList.remove('kanban-card-dropped');
            }, 300);

            // Update column counts visually
            updateColumnCounts();

            // Persist the change to the database
            try {
                const success = await moveNoteToFolder(noteId, targetFolderId);

                if (!success) {
                    console.error("Kanban: API move failed, reverting UI...");
                    // Revert the visual change if API call failed
                    if (originalParent) originalParent.insertBefore(draggedCard, originalSibling);
                    draggedCard.dataset.folderId = oldFolderId;
                    if (wasCompleted) {
                        draggedCard.classList.add('kanban-card-completed');
                        draggedCard.dataset.completed = '1';
                    }
                    updateColumnCounts();
                    showError('Failed to move note');
                } else {
                    if (wasCompleted) {
                        // Best-effort: the move already succeeded, so a failure
                        // here only leaves a stale completed flag in the DB.
                        setKanbanCompleted(noteId, false).catch((err) => {
                            console.error('Kanban: could not clear completed flag after move:', err);
                        });
                    }
                    // Mark note for auto-push since we moved a note (if auto-push enabled)
                    if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }
                    
                    // Success: refresh the sidebar without rebuilding the already-updated Kanban view.
                    if (typeof window.refreshNotesListAfterFolderAction === 'function') {
                        window.refreshNotesListAfterFolderAction(null, { skipKanbanViewRefresh: true });
                    }
                }
            } catch (error) {
                console.error('Kanban: Error during persistence:', error);
                // Revert on error
                if (draggedCard && originalParent) {
                    originalParent.insertBefore(draggedCard, originalSibling);
                    draggedCard.dataset.folderId = oldFolderId;
                    if (wasCompleted) {
                        draggedCard.classList.add('kanban-card-completed');
                        draggedCard.dataset.completed = '1';
                    }
                }
                updateColumnCounts();
                showError('Error moving note');
            }
        });

        // Task checkbox delegation. The task area is interactive but the rest of the card still opens/drags normally.
        document.addEventListener('change', (e) => {
            const checkbox = e.target.closest('.kanban-task-checkbox');
            if (!checkbox) return;

            e.stopPropagation();
            toggleKanbanTaskFromCard(checkbox);
        });

        // Card Click Delegation
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.kanban-card');
            if (!card) return;

            if (e.target.closest('.kanban-tasklist-preview')) {
                return;
            }

            // Don't trigger if dragging
            if (card.classList.contains('dragging')) return;

            // Find if an action-button or picker was clicked specifically
            if (e.target.closest('[data-action]') && !e.target.closest('.kanban-card-title') && !e.target.closest('.kanban-card-snippet')) {
                // Let other listeners handle specific actions on the card
                return;
            }

            const noteId = card.dataset.noteId;
            const titleEl = card.querySelector('.kanban-card-title');
            const noteTitle = titleEl && titleEl.textContent ? titleEl.textContent.trim() : '';

            if (window.innerWidth > 800 && window.tabManager && typeof window.tabManager.openInNewTab === 'function') {
                e.preventDefault();
                e.stopPropagation();
                window.tabManager.openInNewTab(noteId, noteTitle, { insertAfterActive: true });
                return;
            }

            // Get workspace
            let workspace = '';
            if (typeof window.getSelectedWorkspace === 'function') {
                workspace = window.getSelectedWorkspace();
            } else if (document.body.dataset.workspace) {
                workspace = document.body.dataset.workspace;
            } else {
                const urlParams = new URLSearchParams(window.location.search);
                workspace = urlParams.get('workspace') || '';
            }

            // Load via AJAX if helper is available
            if (typeof window.loadNoteDirectly === 'function') {
                const link = `index.php?note=${noteId}${workspace ? '&workspace=' + encodeURIComponent(workspace) : ''}`;
                window.loadNoteDirectly(link, noteId, e);
            } else {
                // Fallback to full reload
                let url = 'index.php?note=' + noteId;
                if (workspace) url += '&workspace=' + encodeURIComponent(workspace);
                window.location.href = url;
            }
        });

        // Completed toggle on a card
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="toggle-kanban-completed"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();

            if (isPublicWorkspaceReadOnly()) return;

            const card = btn.closest('.kanban-card');
            if (card) toggleKanbanCardCompleted(card);
        });

        // Expand / collapse a column's completed section
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('[data-action="toggle-kanban-completed-section"]');
            if (!toggle) return;

            e.preventDefault();
            e.stopPropagation();

            const section = toggle.closest('.kanban-completed-section');
            if (!section) return;

            const expanded = !section.classList.contains('is-expanded');
            applyCompletedSectionState(section, expanded);
            storeCompletedSectionState(section.dataset.folderId, expanded);
        });

        // Kanban Scroll Buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.kanban-scroll-btn, .kanban-scroll-btn-header');
            if (!btn) return;

            if (btn.disabled) return;

            const board = document.getElementById('kanbanBoard');
            if (!board) return;

            const scrollAmount = 350; // Pixels to scroll
            if (btn.classList.contains('left')) {
                board.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            } else if (btn.classList.contains('right')) {
                board.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            }

            requestAnimationFrame(syncKanbanScrollButtons);
        });

        // Kanban Add Card Button
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="create-kanban-note"]');
            if (!btn) return;

            // Stop propagation to avoid triggering other click handlers
            e.stopPropagation();
            e.preventDefault();

            const folderId = btn.dataset.folderId;
            const folderName = btn.dataset.folderName;

            // Use the create modal function if available
            if (typeof window.showCreateModal === 'function') {
                window.showCreateModal(folderId, folderName);
            } else if (typeof window.showCreateNoteInFolderModal === 'function') {
                window.showCreateNoteInFolderModal(folderId, folderName);
            } else {
                console.error('Kanban: No create modal function available');
            }
        });

        // Kanban Add Column Button
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="create-kanban-column"]');
            if (!btn) return;

            e.stopPropagation();
            e.preventDefault();

            const parentId = btn.dataset.parentId;

            // Use showInputModal to get column name
            if (typeof window.showInputModal === 'function') {
                window.showInputModal(
                    (window.t ? window.t('kanban.new_column_title', null, 'New Column') : 'New Column'),
                    (window.t ? window.t('kanban.new_column_placeholder', null, 'Column name') : 'Column name'),
                    '',
                    async function (columnName) {
                        if (!columnName) return;

                        let workspace = '';
                        if (typeof window.getSelectedWorkspace === 'function') {
                            workspace = window.getSelectedWorkspace();
                        }

                        try {
                            const response = await fetch('api/v1/folders', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    folder_name: columnName,
                                    parent_folder_id: parentId,
                                    workspace: workspace
                                }),
                                credentials: 'same-origin'
                            });

                            if (!response.ok) throw new Error('HTTP error: ' + response.status);

                            const data = await response.json();
                            if (data.success) {
                                // Reload to show the new column
                                // If inside index.php, we might want a partial refresh, 
                                // but for now, simple reload is safest and matches others.
                                if (typeof window.loadKanbanView === 'function') {
                                    window.loadKanbanView(parentId);
                                } else {
                                    window.location.reload();
                                }
                            } else {
                                showError(data.message || 'Failed to create column');
                            }
                        } catch (error) {
                            console.error('Kanban: Error creating column:', error);
                            showError('Error creating column');
                        }
                    },
                    (window.t ? window.t('common.create', null, 'Create') : 'Create')
                );
            }
        });
    }

    /**
     * Move note to folder via API
     */
    async function moveNoteToFolder(noteId, folderId) {
        let workspace = '';
        if (typeof window.getSelectedWorkspace === 'function') {
            workspace = window.getSelectedWorkspace();
        } else if (document.body.dataset.workspace) {
            workspace = document.body.dataset.workspace;
        }

        try {
            const response = await fetch(`api/v1/notes/${noteId}/folder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    folder_id: folderId,
                    workspace: workspace
                }),
                credentials: 'same-origin'
            });

            if (!response.ok) throw new Error('HTTP error: ' + response.status);

            const data = await response.json();
            return data.success === true;
        } catch (error) {
            console.error('Kanban API error:', error);
            return false;
        }
    }

    function setKanbanScrollButtonState(button, isAvailable) {
        if (!button) return;

        button.disabled = !isAvailable;
        button.classList.toggle('is-unavailable', !isAvailable);
        button.setAttribute('aria-hidden', isAvailable ? 'false' : 'true');
        button.tabIndex = isAvailable ? 0 : -1;
    }

    function syncKanbanScrollButtons() {
        const board = document.getElementById('kanbanBoard');
        const leftButton = document.getElementById('kanbanScrollLeft');
        const rightButton = document.getElementById('kanbanScrollRight');

        if (!leftButton && !rightButton) {
            return;
        }

        if (!board) {
            setKanbanScrollButtonState(leftButton, false);
            setKanbanScrollButtonState(rightButton, false);
            return;
        }

        const maxScrollLeft = Math.max(0, board.scrollWidth - board.clientWidth);
        const tolerance = 2;
        const canScroll = maxScrollLeft > tolerance;
        const canScrollLeft = canScroll && board.scrollLeft > tolerance;
        const canScrollRight = canScroll && board.scrollLeft < (maxScrollLeft - tolerance);

        setKanbanScrollButtonState(leftButton, canScrollLeft);
        setKanbanScrollButtonState(rightButton, canScrollRight);
    }

    function bindKanbanScrollButtons() {
        const board = document.getElementById('kanbanBoard');

        if (trackedKanbanBoard === board) {
            requestAnimationFrame(syncKanbanScrollButtons);
            return;
        }

        if (trackedKanbanBoard) {
            trackedKanbanBoard.removeEventListener('scroll', syncKanbanScrollButtons);
        }

        if (kanbanScrollResizeObserver) {
            kanbanScrollResizeObserver.disconnect();
            kanbanScrollResizeObserver = null;
        }

        trackedKanbanBoard = board;

        if (trackedKanbanBoard) {
            trackedKanbanBoard.addEventListener('scroll', syncKanbanScrollButtons, { passive: true });

            if (typeof ResizeObserver === 'function') {
                kanbanScrollResizeObserver = new ResizeObserver(() => {
                    syncKanbanScrollButtons();
                });
                kanbanScrollResizeObserver.observe(trackedKanbanBoard);
            }
        }

        requestAnimationFrame(syncKanbanScrollButtons);
    }

    function getTaskByIdOrIndex(tasks, taskId, taskIndex) {
        if (!Array.isArray(tasks)) return -1;

        if (taskId !== '') {
            const numericTaskId = Number(taskId);
            const hasNumericTaskId = Number.isFinite(numericTaskId);

            const idIndex = tasks.findIndex((task) => {
                if (!task || typeof task !== 'object' || task.id === undefined || task.id === null) return false;

                if (String(task.id) === String(taskId)) return true;

                const numericCandidate = Number(task.id);
                return hasNumericTaskId && Number.isFinite(numericCandidate) && Math.abs(numericCandidate - numericTaskId) < 0.000001;
            });

            if (idIndex !== -1) return idIndex;
        }

        return Number.isInteger(taskIndex) && taskIndex >= 0 && taskIndex < tasks.length ? taskIndex : -1;
    }

    function groupKanbanTasksByStatus(tasks) {
        const important = [];
        const normal = [];
        const completed = [];

        tasks.forEach((task) => {
            if (task && task.completed) completed.push(task);
            else if (task && task.important) important.push(task);
            else if (task) normal.push(task);
        });

        return { important, normal, completed };
    }

    function reorderKanbanTasksAfterToggle(tasks, toggledTask) {
        const remainingTasks = tasks.filter((task) => task !== toggledTask);
        const groups = groupKanbanTasksByStatus(remainingTasks);

        if (toggledTask.completed) {
            groups.completed.unshift(toggledTask);
        } else if (toggledTask.important) {
            groups.important.push(toggledTask);
        } else {
            groups.normal.push(toggledTask);
        }

        return [].concat(groups.important, groups.normal, groups.completed);
    }

    function escapeKanbanHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderKanbanTaskPreview(preview, tasks) {
        if (!preview || !Array.isArray(tasks)) return;

        const previousScrollTop = preview.scrollTop;

        preview.classList.toggle('is-empty', tasks.length === 0);
        preview.innerHTML = tasks.map((task, index) => {
            const taskObject = task && typeof task === 'object' ? task : {};
            const text = taskObject.text ?? taskObject.content ?? '';
            const completed = !!(taskObject.completed || taskObject.checked || taskObject.done);
            const important = !!taskObject.important;
            const taskId = taskObject.id ?? '';
            const className = 'kanban-task-preview-item' + (completed ? ' completed' : '') + (important ? ' important' : '');

            return '<label class="' + className + '">'
                + '<input type="checkbox" class="kanban-task-checkbox" data-task-index="' + index + '" data-task-id="' + escapeKanbanHtml(taskId) + '"' + (completed ? ' checked' : '') + '>'
                + '<span class="kanban-task-preview-text">' + escapeKanbanHtml(text) + '</span>'
                + '</label>';
        }).join('');

        preview.scrollTop = previousScrollTop;
    }

    function getKanbanEditorSessionId() {
        return (typeof window.getCurrentEditorSessionId === 'function')
            ? window.getCurrentEditorSessionId()
            : '';
    }

    async function parseKanbanJsonResponse(response) {
        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        return {
            ok: response.ok,
            status: response.status,
            data: data || {}
        };
    }

    async function patchKanbanTasklistContent(taskNoteId, tasks, editorSessionId) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
        const payload = { content: JSON.stringify(tasks) };

        if (editorSessionId) {
            headers['X-Editor-Session-ID'] = editorSessionId;
            payload.editor_session_id = editorSessionId;
        }

        const response = await fetch(`/api/v1/notes/${encodeURIComponent(taskNoteId)}`, {
            method: 'PATCH',
            headers: headers,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });

        return parseKanbanJsonResponse(response);
    }

    async function toggleKanbanTaskFromCard(checkbox) {
        if (isPublicWorkspaceReadOnly()) {
            checkbox.checked = !checkbox.checked;
            return;
        }

        const preview = checkbox.closest('.kanban-tasklist-preview');
        const card = checkbox.closest('.kanban-card');
        const taskNoteId = preview?.dataset.taskNoteId || card?.dataset.noteId;
        const taskId = checkbox.dataset.taskId || '';
        const taskIndex = Number.parseInt(checkbox.dataset.taskIndex || '', 10);
        const completed = checkbox.checked;

        if (!taskNoteId) {
            checkbox.checked = !completed;
            showError('Unable to update task');
            return;
        }

        checkbox.disabled = true;
        if (preview) preview.classList.add('is-saving');

        try {
            const noteResponse = await fetch(`/api/v1/notes/${encodeURIComponent(taskNoteId)}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            });

            if (!noteResponse.ok) throw new Error('HTTP error: ' + noteResponse.status);

            const noteData = await noteResponse.json();
            if (!noteData || !noteData.success || !noteData.note || noteData.note.type !== 'tasklist') {
                throw new Error('Invalid tasklist note response');
            }

            let tasks = JSON.parse(noteData.note.content || '[]');
            if (!Array.isArray(tasks)) throw new Error('Invalid tasklist content');

            const targetIndex = getTaskByIdOrIndex(tasks, taskId, Number.isNaN(taskIndex) ? -1 : taskIndex);
            if (targetIndex === -1) throw new Error('Task not found');

            const toggledTask = tasks[targetIndex];
            toggledTask.completed = completed;
            tasks = reorderKanbanTasksAfterToggle(tasks, toggledTask);

            let updateResult = await patchKanbanTasklistContent(taskNoteId, tasks, '');
            if (updateResult.status === 423) {
                const editorSessionId = getKanbanEditorSessionId();
                if (editorSessionId) {
                    updateResult = await patchKanbanTasklistContent(taskNoteId, tasks, editorSessionId);
                }
            }

            const updateData = updateResult.data || {};
            if (!updateResult.ok) {
                throw new Error(updateData.error || ('HTTP error: ' + updateResult.status));
            }

            if (!updateData || !updateData.success) {
                throw new Error(updateData?.error || 'Unable to update task');
            }

            if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                window.setNeedsAutoPush(true);
            }

            renderKanbanTaskPreview(preview, tasks);
            if (preview) preview.classList.remove('is-saving');
        } catch (error) {
            console.error('Kanban task toggle error:', error);
            checkbox.checked = !completed;
            checkbox.disabled = false;
            if (preview) preview.classList.remove('is-saving');
            showError(error?.message || 'Unable to update task');
        }
    }

    /**
     * Update column note counts. Completed cards live in the collapsible
     * completed section and are excluded from the column badge, which tracks
     * remaining work only.
     */
    function updateColumnCounts() {
        document.querySelectorAll('.kanban-column').forEach(column => {
            const content = column.querySelector('.kanban-column-content');
            const countBadge = column.querySelector('.kanban-column-count');
            if (content && countBadge) {
                const cardCount = content.querySelectorAll(':scope > .kanban-card').length;
                countBadge.textContent = cardCount;
            }

            const completedSection = column.querySelector('.kanban-completed-section');
            if (completedSection) {
                const completedBadge = completedSection.querySelector('.kanban-completed-count');
                const completedCards = completedSection.querySelectorAll('.kanban-card').length;
                if (completedBadge) {
                    completedBadge.textContent = completedCards;
                }
                // Drop the section once its last completed card leaves.
                if (completedCards === 0) {
                    completedSection.remove();
                }
            }
        });
    }

    /**
     * Translate with a safe fallback when i18n is not loaded yet.
     */
    function kanbanT(key, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, null, fallback);
        }
        return fallback;
    }

    /**
     * localStorage key holding the expanded state of a column's completed section.
     */
    function completedSectionStateKey(folderId) {
        return 'kanban_completed_open_' + folderId;
    }

    function isCompletedSectionExpanded(folderId) {
        try {
            return localStorage.getItem(completedSectionStateKey(folderId)) === 'open';
        } catch (e) {
            return false;
        }
    }

    function storeCompletedSectionState(folderId, expanded) {
        try {
            localStorage.setItem(completedSectionStateKey(folderId), expanded ? 'open' : 'closed');
        } catch (e) {
            /* localStorage unavailable (private mode): collapse state is simply not persisted */
        }
    }

    /**
     * Apply the expanded/collapsed state to one completed section.
     */
    function applyCompletedSectionState(section, expanded) {
        const toggle = section.querySelector('.kanban-completed-toggle');
        const label = section.querySelector('.kanban-completed-label');

        section.classList.toggle('is-expanded', expanded);
        if (toggle) {
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
        if (label) {
            label.textContent = expanded
                ? kanbanT('kanban.completed.hide', 'Hide completed')
                : kanbanT('kanban.completed.show', 'Show completed');
        }
    }

    /**
     * Restore every completed section's collapse state. Called after each board
     * render because refreshKanbanView() replaces the whole DOM.
     */
    function restoreCompletedSectionStates() {
        document.querySelectorAll('.kanban-completed-section').forEach((section) => {
            applyCompletedSectionState(section, isCompletedSectionExpanded(section.dataset.folderId));
        });
    }

    /**
     * Get (or build) the completed section of a column.
     */
    function ensureCompletedSection(columnContent) {
        let section = columnContent.querySelector(':scope > .kanban-completed-section');
        if (section) {
            return section;
        }

        const folderId = columnContent.dataset.folderId;
        section = document.createElement('div');
        section.className = 'kanban-completed-section';
        section.dataset.folderId = folderId;
        section.innerHTML =
            '<button type="button" class="kanban-completed-toggle" data-action="toggle-kanban-completed-section"' +
            ' data-folder-id="' + folderId + '" aria-expanded="false">' +
            '<i class="lucide lucide-chevron-right kanban-completed-chevron"></i>' +
            '<span class="kanban-completed-label"></span>' +
            '<span class="kanban-completed-count">0</span>' +
            '</button>' +
            '<div class="kanban-completed-content"></div>';

        columnContent.appendChild(section);
        applyCompletedSectionState(section, isCompletedSectionExpanded(folderId));
        return section;
    }

    /**
     * Persist a card's completed state.
     */
    async function setKanbanCompleted(noteId, completed) {
        const response = await fetch('api/v1/notes/' + noteId + '/kanban-completed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ completed: completed }),
            credentials: 'same-origin'
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return data.success === true;
    }

    /**
     * Move a card between the active area and the completed section, updating
     * its visual state. Returns a callback that restores the previous position.
     */
    function moveCardToCompletionArea(card, completed) {
        const columnContent = card.closest('.kanban-column-content');
        const previousSibling = card.nextElementSibling;
        const previousParent = card.parentNode;

        if (completed) {
            const section = ensureCompletedSection(columnContent);
            section.querySelector('.kanban-completed-content').prepend(card);
        } else {
            // Active cards go back above the completed section.
            const section = columnContent.querySelector(':scope > .kanban-completed-section');
            if (section) {
                columnContent.insertBefore(card, section);
            } else {
                columnContent.appendChild(card);
            }
        }

        card.classList.toggle('kanban-card-completed', completed);
        card.dataset.completed = completed ? '1' : '0';

        const btn = card.querySelector('.kanban-card-complete-btn');
        if (btn) {
            const label = completed
                ? kanbanT('kanban.completed.mark_active', 'Mark as not completed')
                : kanbanT('kanban.completed.mark_completed', 'Mark as completed');
            btn.setAttribute('aria-pressed', completed ? 'true' : 'false');
            btn.setAttribute('aria-label', label);
            btn.title = label;
        }

        updateColumnCounts();

        return function revert() {
            if (previousParent) {
                previousParent.insertBefore(card, previousSibling);
            }
            card.classList.toggle('kanban-card-completed', !completed);
            card.dataset.completed = completed ? '0' : '1';
            if (btn) {
                const revertLabel = !completed
                    ? kanbanT('kanban.completed.mark_active', 'Mark as not completed')
                    : kanbanT('kanban.completed.mark_completed', 'Mark as completed');
                btn.setAttribute('aria-pressed', completed ? 'false' : 'true');
                btn.setAttribute('aria-label', revertLabel);
                btn.title = revertLabel;
            }
            updateColumnCounts();
        };
    }

    /**
     * Toggle a card's completed state, optimistically then persisted.
     */
    async function toggleKanbanCardCompleted(card) {
        const noteId = card.dataset.noteId;
        if (!noteId) return;

        const completed = card.dataset.completed !== '1';
        const revert = moveCardToCompletionArea(card, completed);

        try {
            const success = await setKanbanCompleted(noteId, completed);
            if (!success) {
                revert();
                showError(kanbanT('kanban.completed.error', 'Failed to update the card'));
            }
        } catch (error) {
            console.error('Kanban: Error updating completed state:', error);
            revert();
            showError(kanbanT('kanban.completed.error', 'Failed to update the card'));
        }
    }

    /**
     * Show notification error
     */
    function showError(message) {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(message, 'error');
        } else {
            console.error(message);
        }
    }

    window.bindKanbanScrollButtons = bindKanbanScrollButtons;
    window.syncKanbanScrollButtons = syncKanbanScrollButtons;
    window.restoreKanbanCompletedSections = restoreCompletedSectionStates;

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

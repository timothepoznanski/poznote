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
        restoreSubfolderSectionStates();

        // Document-level delegation ensures listeners work even when content is replaced
        if (window._kanbanInitialized) {
            return;
        }

        setupDelegatedEvents();
        window._kanbanInitialized = true;
    }

    /**
     * The drop zone under an event target: a column content or a nested
     * subfolder content, whichever is closest. Hovering a subfolder header
     * targets that subfolder too, so a collapsed group still accepts drops.
     */
    function getKanbanDropZone(target) {
        const el = target instanceof Element ? target : target && target.parentElement;
        if (!el) return null;

        const header = el.closest('.kanban-subfolder-header');
        if (header) {
            const section = header.closest('.kanban-subfolder-section');
            return section ? section.querySelector(':scope > .kanban-subfolder-content') : null;
        }
        return el.closest('.kanban-subfolder-content, .kanban-column-content');
    }

    /**
     * The element highlighted while a card hovers a drop zone: the subfolder
     * group (header included) for a nested zone, the column otherwise.
     */
    function getKanbanDropHighlight(zone) {
        if (!zone) return null;
        if (zone.classList.contains('kanban-subfolder-content')) {
            return zone.closest('.kanban-subfolder-section');
        }
        return zone.closest('.kanban-column');
    }

    function clearKanbanDragOver() {
        document.querySelectorAll('.kanban-inline-view .drag-over').forEach((el) => {
            el.classList.remove('drag-over');
        });
    }

    /**
     * The drop zone a card currently lives in (its own folder's zone, even
     * when the card sits inside that zone's completed section).
     */
    function getKanbanCardZone(card) {
        return card.closest('.kanban-subfolder-content, .kanban-column-content');
    }

    /**
     * First non-card block of a zone (completed section or subfolder group).
     * Active cards are always inserted before it.
     */
    function getKanbanZoneAnchor(zone) {
        return zone.querySelector(':scope > .kanban-completed-section, :scope > .kanban-subfolder-section');
    }

    function insertActiveCardIntoZone(zone, card) {
        zone.insertBefore(card, getKanbanZoneAnchor(zone));
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
            clearKanbanDragOver();

            draggedCard = null;
            draggedFromFolderId = null;
            pointerStartedInTaskPreview = false;
        });

        // Drag Over - CRITICAL: must prevent default to allow drop
        document.addEventListener('dragover', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            if (!getKanbanDropZone(e.target)) return;

            // Important: we are over a drop zone, allow drop
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // Drag Enter
        document.addEventListener('dragenter', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const zone = getKanbanDropZone(e.target);
            if (!zone) return;

            // Only the innermost hovered zone is highlighted.
            clearKanbanDragOver();
            zone.classList.add('drag-over');
            const highlight = getKanbanDropHighlight(zone);
            if (highlight) highlight.classList.add('drag-over');
        });

        // Drag Leave
        document.addEventListener('dragleave', (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const zone = getKanbanDropZone(e.target);
            if (!zone) return;

            // Check if we're actually leaving the zone (not entering a child card)
            const highlight = getKanbanDropHighlight(zone) || zone;
            if (!highlight.contains(e.relatedTarget)) {
                zone.classList.remove('drag-over');
                highlight.classList.remove('drag-over');
            }
        });

        // Drop
        document.addEventListener('drop', async (e) => {
            if (isPublicWorkspaceReadOnly()) {
                return;
            }

            const columnContent = getKanbanDropZone(e.target);
            if (!columnContent) return;

            // Prevent browser default drop action
            e.preventDefault();
            // Stop propagation to avoid Poznote's folder-drop logic
            e.stopPropagation();

            clearKanbanDragOver();

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
            const originalOrder = draggedCard.dataset.kanbanOrder;

            // A dragged card always lands in the active area, above the
            // completed section and the subfolder groups of the target zone.
            insertActiveCardIntoZone(columnContent, draggedCard);
            draggedCard.dataset.folderId = targetFolderId;

            // Dropping into a collapsed subfolder group opens it so the card
            // does not vanish from view.
            const targetSection = columnContent.closest('.kanban-subfolder-section');
            if (targetSection && !targetSection.classList.contains('is-expanded')) {
                applySubfolderSectionState(targetSection, true);
                storeSubfolderSectionState(targetSection.dataset.folderId, true);
            }
            draggedCard.dataset.kanbanOrder = nextKanbanOrder();
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

            resortKanbanColumnIfNeeded(columnContent);

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
                    if (originalOrder) draggedCard.dataset.kanbanOrder = originalOrder;
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
                    if (originalOrder) draggedCard.dataset.kanbanOrder = originalOrder;
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

        // Cycle the card size (small -> medium -> large)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="cycle-kanban-card-size"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();
            cycleKanbanCardSize();
        });

        // Cycle the card sort (date <-> tag)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="cycle-kanban-card-sort"]');
            if (!btn) return;

            e.preventDefault();
            e.stopPropagation();
            cycleKanbanCardSort();
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

        // Expand / collapse a nested subfolder group
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('[data-action="toggle-kanban-subfolder-section"]');
            if (!toggle) return;

            e.preventDefault();
            e.stopPropagation();

            const section = toggle.closest('.kanban-subfolder-section');
            if (!section) return;

            const expanded = !section.classList.contains('is-expanded');
            applySubfolderSectionState(section, expanded);
            storeSubfolderSectionState(section.dataset.folderId, expanded);
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

    // ===== Card size toggle =====
    // The preference persists per user (S/M/L) and is applied as a
    // kanban-size-* class on the board container; the visual differences
    // live in kanban.css. Medium is the historical default.

    const KANBAN_SIZES = ['small', 'medium', 'large'];
    const KANBAN_SIZE_KEY = 'kanbanCardSize';

    function getKanbanCardSize() {
        let stored = null;
        try {
            stored = (window.__poznoteUserStorage || window.localStorage).getItem(KANBAN_SIZE_KEY);
        } catch (e) { /* storage unavailable */ }
        return KANBAN_SIZES.includes(stored) ? stored : 'medium';
    }

    function setKanbanCardSize(size) {
        try {
            (window.__poznoteUserStorage || window.localStorage).setItem(KANBAN_SIZE_KEY, size);
        } catch (e) { /* storage unavailable */ }
    }

    function applyKanbanCardSize() {
        const container = document.getElementById('kanban-view-container');
        if (!container) return;

        const size = getKanbanCardSize();
        KANBAN_SIZES.forEach((s) => container.classList.toggle('kanban-size-' + s, s === size));

        const btn = container.querySelector('.kanban-size-toggle');
        if (!btn) return;
        const sizeLabel = btn.getAttribute('data-label-' + size) || size;
        const letter = btn.querySelector('.kanban-size-letter');
        if (letter) letter.textContent = sizeLabel.charAt(0).toUpperCase();
        const title = (btn.getAttribute('data-label') || 'Card size') + ': ' + sizeLabel;
        btn.title = title;
        btn.setAttribute('aria-label', title);
    }

    function cycleKanbanCardSize() {
        const current = getKanbanCardSize();
        const next = KANBAN_SIZES[(KANBAN_SIZES.indexOf(current) + 1) % KANBAN_SIZES.length];
        setKanbanCardSize(next);
        applyKanbanCardSize();
    }

    // ===== Card sort toggle (date / tag) =====
    // "date" is the server-rendered order (most recently updated first) and stays
    // the default. "tag" reorders every column alphabetically on each card's
    // first tag, keeping the untagged ("uncategorized") cards at the bottom.
    // Like the card size, the preference persists per user and is applied
    // client-side after each render.

    const KANBAN_SORTS = ['date', 'tag'];
    const KANBAN_SORT_KEY = 'kanbanCardSort';
    const KANBAN_SORT_ICONS = { date: 'lucide-calendar', tag: 'lucide-tag' };

    // Rank of each card in the server-rendered (date) order, so switching back
    // from the tag sort restores it without reloading the board.
    let kanbanOrderCounter = 0;

    function getKanbanCardSort() {
        let stored = null;
        try {
            stored = (window.__poznoteUserStorage || window.localStorage).getItem(KANBAN_SORT_KEY);
        } catch (e) { /* storage unavailable */ }
        return KANBAN_SORTS.includes(stored) ? stored : 'date';
    }

    function setKanbanCardSort(sort) {
        try {
            (window.__poznoteUserStorage || window.localStorage).setItem(KANBAN_SORT_KEY, sort);
        } catch (e) { /* storage unavailable */ }
    }

    function nextKanbanOrder() {
        return String(++kanbanOrderCounter);
    }

    /**
     * Stamp every not-yet-seen card with its rank in the current DOM order.
     * Called before each sort, so cards rendered by the server keep their date
     * order and cards moved around later keep whatever rank they were given.
     */
    function rememberKanbanCardOrder(root) {
        root.querySelectorAll('.kanban-card').forEach((card) => {
            if (!card.dataset.kanbanOrder) card.dataset.kanbanOrder = nextKanbanOrder();
        });
    }

    /**
     * A card's tags, lowercased, in the order they are stored on the note (the
     * order the badges are rendered in). Empty for an untagged card.
     */
    function getKanbanCardTags(card) {
        return (card.dataset.tags || '')
            .split(',')
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean);
    }

    function compareKanbanCardsByDate(a, b) {
        return (parseInt(a.dataset.kanbanOrder, 10) || 0) - (parseInt(b.dataset.kanbanOrder, 10) || 0);
    }

    function compareKanbanCardsByTag(a, b) {
        const tagsA = getKanbanCardTags(a);
        const tagsB = getKanbanCardTags(b);

        // Untagged cards sink below every tagged one.
        if (!tagsA.length || !tagsB.length) {
            if (tagsA.length === tagsB.length) return compareKanbanCardsByDate(a, b);
            return tagsA.length ? -1 : 1;
        }

        // A card with several tags is filed under the first one of its list,
        // which is also the first badge shown on the card.
        const diff = tagsA[0].localeCompare(tagsB[0], undefined, { sensitivity: 'base', numeric: true });
        if (diff !== 0) return diff;

        return compareKanbanCardsByDate(a, b);
    }

    /**
     * Reorder the cards that are direct children of a container, keeping them
     * before `anchor` (the completed section, when the column has one).
     */
    function sortKanbanCardList(container, anchor) {
        if (!container) return;

        const cards = Array.from(container.children).filter((el) => el.classList.contains('kanban-card'));
        if (cards.length < 2) return;

        const compare = getKanbanCardSort() === 'tag' ? compareKanbanCardsByTag : compareKanbanCardsByDate;
        const sorted = cards.slice().sort(compare);
        if (sorted.every((card, index) => card === cards[index])) return;

        sorted.forEach((card) => container.insertBefore(card, anchor || null));
    }

    /**
     * Sort a zone's active cards and its completed ones independently.
     * Nested subfolder zones are sorted by their own call.
     */
    function sortKanbanColumn(columnContent) {
        if (!columnContent) return;

        sortKanbanCardList(columnContent, getKanbanZoneAnchor(columnContent));
        const completedSection = columnContent.querySelector(':scope > .kanban-completed-section');
        if (completedSection) {
            sortKanbanCardList(completedSection.querySelector('.kanban-completed-content'), null);
        }
    }

    /**
     * Re-sort a column after a card moved into it. No-op under the date sort,
     * where the caller already dropped the card where it belongs.
     */
    function resortKanbanColumnIfNeeded(columnContent) {
        if (getKanbanCardSort() !== 'tag') return;
        sortKanbanColumn(columnContent);
    }

    function updateKanbanSortToggle(container) {
        const btn = container.querySelector('.kanban-sort-toggle');
        if (!btn) return;

        const sort = getKanbanCardSort();
        const icon = btn.querySelector('.kanban-sort-icon');
        if (icon) icon.className = 'lucide ' + KANBAN_SORT_ICONS[sort] + ' kanban-sort-icon';

        const title = (btn.getAttribute('data-label') || 'Sort by') + ': '
            + (btn.getAttribute('data-label-' + sort) || sort);
        btn.title = title;
        btn.setAttribute('aria-label', title);
    }

    function applyKanbanCardSort() {
        const container = document.getElementById('kanban-view-container');
        if (!container) return;

        rememberKanbanCardOrder(container);
        container.querySelectorAll('.kanban-column-content, .kanban-subfolder-content').forEach(sortKanbanColumn);
        updateKanbanSortToggle(container);
    }

    function cycleKanbanCardSort() {
        const current = getKanbanCardSort();
        const next = KANBAN_SORTS[(KANBAN_SORTS.indexOf(current) + 1) % KANBAN_SORTS.length];
        setKanbanCardSort(next);
        applyKanbanCardSort();
    }

    // ===== Due date badge (mirrors the server-side rendering in kanban_content.php) =====

    function normalizeKanbanDueAt(value) {
        if (typeof window.normalizeTaskDueAt === 'function') {
            return window.normalizeTaskDueAt(value) || '';
        }
        if (typeof value !== 'string') return '';
        const match = value.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/);
        if (!match) return '';
        return value.slice(0, match[1] ? 16 : 10);
    }

    function isKanbanDueOverdue(due) {
        if (!due) return false;
        if (typeof window.isTaskDueOverdue === 'function') {
            return window.isTaskDueOverdue(due);
        }
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const nowStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
            + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        return due.length > 10 ? due < nowStr : due < nowStr.slice(0, 10);
    }

    function formatKanbanDueLabel(due) {
        if (!due) return '';
        let label = due.slice(8, 10) + '/' + due.slice(5, 7);
        if (due.length > 10) {
            label += ' ' + due.slice(11, 16);
        }
        return label;
    }

    function getKanbanNextTaskDue(tasks) {
        let next = '';
        (Array.isArray(tasks) ? tasks : []).forEach((task) => {
            const taskObject = task && typeof task === 'object' ? task : {};
            if (taskObject.completed || taskObject.checked || taskObject.done) return;
            const due = normalizeKanbanDueAt(taskObject.dueAt);
            if (due && (!next || due < next)) {
                next = due;
            }
        });
        return next;
    }

    /**
     * Recompute a card's due badge after its tasks changed. Falls back to the
     * note reminder (data-reminder-due) when no task due date remains.
     */
    function updateKanbanCardDueBadge(card, tasks) {
        if (!card) return;

        const taskDue = getKanbanNextTaskDue(tasks);
        const reminderDue = card.dataset.reminderDue || '';
        const dueValue = taskDue || reminderDue;
        const existing = card.querySelector('.kanban-card-due');

        if (!dueValue) {
            if (existing) {
                const topline = existing.closest('.kanban-card-topline');
                existing.remove();
                // An emptied topline would still take up its bottom margin.
                if (topline && !topline.children.length) topline.remove();
            }
            return;
        }

        const source = taskDue ? 'task' : 'reminder';
        const overdue = isKanbanDueOverdue(dueValue);
        const title = overdue
            ? (window.t ? window.t('kanban.due.overdue', {}, 'Overdue') : 'Overdue')
            : (window.t ? window.t('kanban.due.label', {}, 'Due date') : 'Due date');

        let badge = existing;
        if (!badge) {
            // Cards without a date render no topline at all, so build one and
            // place it where the server would have: before the tags row.
            let topline = card.querySelector('.kanban-card-topline');
            if (!topline) {
                topline = document.createElement('div');
                topline.className = 'kanban-card-topline';
                const anchor = card.querySelector('.kanban-card-tags') || card.querySelector('.kanban-card-title');
                if (!anchor) return;
                card.insertBefore(topline, anchor);
            }
            badge = document.createElement('span');
            topline.insertBefore(badge, topline.firstChild);
        }

        badge.className = 'kanban-card-due' + (overdue ? ' overdue' : '');
        badge.dataset.dueSource = source;
        badge.title = title;
        badge.innerHTML = '<i class="lucide ' + (source === 'task' ? 'lucide-alarm-clock' : 'lucide-bell') + '"></i>'
            + '<span class="kanban-card-due-text">' + escapeKanbanHtml(formatKanbanDueLabel(dueValue)) + '</span>';
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
            updateKanbanCardDueBadge(card, tasks);
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
        // Each zone (column content or nested subfolder content) counts only
        // its own direct active cards; nested groups carry their own badge.
        document.querySelectorAll('.kanban-column-content, .kanban-subfolder-content').forEach((zone) => {
            const cardCount = zone.querySelectorAll(':scope > .kanban-card').length;
            const owner = zone.classList.contains('kanban-subfolder-content')
                ? zone.closest('.kanban-subfolder-section')
                : zone.closest('.kanban-column');
            const countBadge = owner && owner.querySelector(
                ':scope > .kanban-subfolder-header .kanban-subfolder-count, :scope > .kanban-column-header .kanban-column-count'
            );
            if (countBadge) {
                countBadge.textContent = cardCount;
            }
        });

        document.querySelectorAll('.kanban-completed-section').forEach((completedSection) => {
            const completedBadge = completedSection.querySelector('.kanban-completed-count');
            const completedCards = completedSection.querySelectorAll('.kanban-card').length;
            if (completedBadge) {
                completedBadge.textContent = completedCards;
            }
            // Drop the section once its last completed card leaves.
            if (completedCards === 0) {
                completedSection.remove();
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
     * localStorage key holding the expanded state of a nested subfolder group.
     * Groups start collapsed: the user opens only the ones they need.
     */
    function subfolderSectionStateKey(folderId) {
        return 'kanban_subfolder_open_' + folderId;
    }

    function isSubfolderSectionExpanded(folderId) {
        try {
            return localStorage.getItem(subfolderSectionStateKey(folderId)) === 'open';
        } catch (e) {
            return false;
        }
    }

    function storeSubfolderSectionState(folderId, expanded) {
        try {
            localStorage.setItem(subfolderSectionStateKey(folderId), expanded ? 'open' : 'closed');
        } catch (e) {
            /* localStorage unavailable (private mode): collapse state is simply not persisted */
        }
    }

    /**
     * Apply the expanded/collapsed state to one subfolder group.
     */
    function applySubfolderSectionState(section, expanded) {
        const toggle = section.querySelector(':scope > .kanban-subfolder-header .kanban-subfolder-toggle');

        section.classList.toggle('is-expanded', expanded);
        if (toggle) {
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            const label = expanded
                ? (toggle.getAttribute('data-label-collapse') || 'Collapse subfolder')
                : (toggle.getAttribute('data-label-expand') || 'Expand subfolder');
            toggle.title = label;
        }
    }

    /**
     * Restore every subfolder group's collapse state after a board render.
     */
    function restoreSubfolderSectionStates() {
        document.querySelectorAll('.kanban-subfolder-section').forEach((section) => {
            applySubfolderSectionState(section, isSubfolderSectionExpanded(section.dataset.folderId));
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

        // The completed section sits below the active cards and above the
        // nested subfolder groups.
        columnContent.insertBefore(section, columnContent.querySelector(':scope > .kanban-subfolder-section'));
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
        const columnContent = getKanbanCardZone(card);
        const previousSibling = card.nextElementSibling;
        const previousParent = card.parentNode;

        if (completed) {
            const section = ensureCompletedSection(columnContent);
            section.querySelector('.kanban-completed-content').prepend(card);
        } else {
            // Active cards go back above the completed section.
            insertActiveCardIntoZone(columnContent, card);
        }

        card.classList.toggle('kanban-card-completed', completed);
        card.dataset.completed = completed ? '1' : '0';
        resortKanbanColumnIfNeeded(columnContent);

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
            resortKanbanColumnIfNeeded(columnContent);
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
    window.restoreKanbanCompletedSections = function () {
        restoreCompletedSectionStates();
        restoreSubfolderSectionStates();
    };
    window.applyKanbanCardSize = applyKanbanCardSize;
    window.applyKanbanCardSort = applyKanbanCardSort;

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

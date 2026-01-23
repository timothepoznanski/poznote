/**
 * Kanban View JavaScript
 * Handles drag and drop functionality for moving notes between subfolder columns
 */

(function () {
    'use strict';

    // State
    let draggedCard = null;
    let draggedFromFolderId = null;

    /**
     * Initialization called either on DOMContentLoaded or manually when content is loaded via AJAX
     */
    function init() {
        // Document-level delegation ensures listeners work even when content is replaced
        if (window._kanbanInitialized) {
            console.log("Kanban: Listeners already initialized on document.");
            return;
        }

        setupDelegatedEvents();
        window._kanbanInitialized = true;
    }

    /**
     * Setup drag and drop functionality using document delegation
     */
    function setupDelegatedEvents() {
        // Drag Start
        document.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.kanban-card');
            if (!card) return;

            console.log("Kanban: Drag start on card", card.dataset.noteId);
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
            const card = e.target.closest('.kanban-card');
            if (!card) return;

            console.log("Kanban: Drag end");
            card.classList.remove('dragging');
            card.style.opacity = '1';

            // Clean up visual states
            document.querySelectorAll('.kanban-column-content, .kanban-column').forEach(el => {
                el.classList.remove('drag-over');
            });

            draggedCard = null;
            draggedFromFolderId = null;
        });

        // Drag Over - CRITICAL: must prevent default to allow drop
        document.addEventListener('dragover', (e) => {
            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            // Important: we are over a column, allow drop
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        // Drag Enter
        document.addEventListener('dragenter', (e) => {
            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            columnContent.classList.add('drag-over');
            const column = columnContent.closest('.kanban-column');
            if (column) column.classList.add('drag-over');
        });

        // Drag Leave
        document.addEventListener('dragleave', (e) => {
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
            const columnContent = e.target.closest('.kanban-column-content');
            if (!columnContent) return;

            // Prevent browser default drop action
            e.preventDefault();
            // Stop propagation to avoid Poznote's folder-drop logic
            e.stopPropagation();

            console.log("Kanban: Drop detected in column", columnContent.dataset.folderId);

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
                console.log("Kanban: Dropped in same column, ignoring.");
                return;
            }

            // Move the card visually immediately for best UX
            const originalParent = draggedCard.parentNode;
            const oldFolderId = draggedFromFolderId;

            columnContent.appendChild(draggedCard);
            draggedCard.dataset.folderId = targetFolderId;
            draggedCard.classList.add('kanban-card-dropped');

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
                    if (originalParent) originalParent.appendChild(draggedCard);
                    draggedCard.dataset.folderId = oldFolderId;
                    updateColumnCounts();
                    showError('Failed to move note');
                } else {
                    console.log("Kanban: Move successful");
                    // Success: refresh the sidebar to stay in sync with the new note location
                    if (typeof window.refreshNotesListAfterFolderAction === 'function') {
                        window.refreshNotesListAfterFolderAction();
                    }
                }
            } catch (error) {
                console.error('Kanban: Error during persistence:', error);
                // Revert on error
                if (draggedCard && originalParent) {
                    originalParent.appendChild(draggedCard);
                    draggedCard.dataset.folderId = oldFolderId;
                }
                updateColumnCounts();
                showError('Error moving note');
            }
        });

        // Card Click Delegation
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.kanban-card');
            if (!card) return;

            // Don't trigger if dragging
            if (card.classList.contains('dragging')) return;

            // Find if an action-button or picker was clicked specifically
            if (e.target.closest('[data-action]') && !e.target.closest('.kanban-card-title') && !e.target.closest('.kanban-card-snippet')) {
                // Let other listeners handle specific actions on the card
                return;
            }

            const noteId = card.dataset.noteId;
            console.log("Kanban: Card clicked, loading note", noteId);

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

    /**
     * Update column note counts
     */
    function updateColumnCounts() {
        document.querySelectorAll('.kanban-column').forEach(column => {
            const content = column.querySelector('.kanban-column-content');
            const countBadge = column.querySelector('.kanban-column-count');
            if (content && countBadge) {
                const cardCount = content.querySelectorAll('.kanban-card').length;
                countBadge.textContent = cardCount;
            }
        });
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

    // Export dummy functions for compatibility with any leftover inline calls
    window.initKanbanDragDrop = function () { };
    window.initKanbanCardClicks = function () { };

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

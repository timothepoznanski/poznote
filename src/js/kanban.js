/**
 * Kanban View JavaScript
 * Handles drag and drop functionality for moving notes between subfolder columns
 */

(function () {
    'use strict';

    // State
    let draggedCard = null;
    let draggedFromFolderId = null;

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        setupDragAndDrop();
        setupCardClicks();
    }

    /**
     * Setup drag and drop functionality
     */
    function setupDragAndDrop() {
        const cards = document.querySelectorAll('.kanban-card');
        const columns = document.querySelectorAll('.kanban-column-content');

        // Card drag events
        cards.forEach(card => {
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);
        });

        // Column drop events
        columns.forEach(column => {
            column.addEventListener('dragover', handleDragOver);
            column.addEventListener('dragenter', handleDragEnter);
            column.addEventListener('dragleave', handleDragLeave);
            column.addEventListener('drop', handleDrop);
        });
    }

    /**
     * Handle drag start
     */
    function handleDragStart(e) {
        draggedCard = this;
        draggedFromFolderId = this.dataset.folderId;

        this.classList.add('dragging');

        // Set drag data
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.noteId);

        // Add a slight delay for the visual feedback
        setTimeout(() => {
            this.style.opacity = '0.4';
        }, 0);
    }

    /**
     * Handle drag end
     */
    function handleDragEnd(e) {
        this.classList.remove('dragging');
        this.style.opacity = '1';

        // Remove drag-over class from all columns
        document.querySelectorAll('.kanban-column-content').forEach(col => {
            col.classList.remove('drag-over');
        });
        document.querySelectorAll('.kanban-column').forEach(col => {
            col.classList.remove('drag-over');
        });

        draggedCard = null;
        draggedFromFolderId = null;
    }

    /**
     * Handle drag over
     */
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    /**
     * Handle drag enter
     */
    function handleDragEnter(e) {
        e.preventDefault();
        this.classList.add('drag-over');
        this.closest('.kanban-column').classList.add('drag-over');
    }

    /**
     * Handle drag leave
     */
    function handleDragLeave(e) {
        // Only remove if we're leaving the column content, not entering a child
        if (!this.contains(e.relatedTarget)) {
            this.classList.remove('drag-over');
            this.closest('.kanban-column').classList.remove('drag-over');
        }
    }

    /**
     * Handle drop
     */
    async function handleDrop(e) {
        e.preventDefault();

        this.classList.remove('drag-over');
        this.closest('.kanban-column').classList.remove('drag-over');

        if (!draggedCard) return;

        const targetFolderId = this.dataset.folderId;
        const noteId = draggedCard.dataset.noteId;

        // Don't do anything if dropped in the same column
        if (targetFolderId === draggedFromFolderId) {
            return;
        }

        // Move the card visually first for immediate feedback
        const originalParent = draggedCard.parentNode;
        this.appendChild(draggedCard);
        draggedCard.dataset.folderId = targetFolderId;
        draggedCard.classList.add('kanban-card-dropped');

        // Remove animation class after it completes
        setTimeout(() => {
            draggedCard.classList.remove('kanban-card-dropped');
        }, 300);

        // Update counts
        updateColumnCounts();

        // Send API request to move the note
        try {
            const success = await moveNoteToFolder(noteId, targetFolderId);

            if (!success) {
                // Revert the visual change if API call failed
                originalParent.appendChild(draggedCard);
                draggedCard.dataset.folderId = draggedFromFolderId;
                updateColumnCounts();
                showError('Failed to move note');
            }
        } catch (error) {
            console.error('Error moving note:', error);
            // Revert on error
            originalParent.appendChild(draggedCard);
            draggedCard.dataset.folderId = draggedFromFolderId;
            updateColumnCounts();
            showError('Error moving note');
        }
    }

    /**
     * Move note to folder via API
     */
    async function moveNoteToFolder(noteId, folderId) {
        // Get workspace from global function, body dataset, or URL
        let workspace = '';
        if (typeof window.getSelectedWorkspace === 'function') {
            workspace = window.getSelectedWorkspace();
        } else if (document.body.dataset.workspace) {
            workspace = document.body.dataset.workspace;
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            workspace = urlParams.get('workspace') || '';
        }

        try {
            const response = await fetch(`api/v1/notes/${noteId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    folder_id: folderId,
                    workspace: workspace
                }),
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error('HTTP error: ' + response.status);
            }

            const data = await response.json();
            return data.success === true;
        } catch (error) {
            console.error('API error:', error);
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
     * Setup click to open note
     */
    function setupCardClicks() {
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't open if we're dragging
                if (card.classList.contains('dragging')) return;

                const noteId = card.dataset.noteId;

                // Get workspace from global function, body dataset, or URL
                let workspace = '';
                if (typeof window.getSelectedWorkspace === 'function') {
                    workspace = window.getSelectedWorkspace();
                } else if (document.body.dataset.workspace) {
                    workspace = document.body.dataset.workspace;
                } else {
                    const urlParams = new URLSearchParams(window.location.search);
                    workspace = urlParams.get('workspace') || '';
                }

                // Navigate to the note
                let url = 'index.php?note=' + noteId;
                if (workspace) {
                    url += '&workspace=' + encodeURIComponent(workspace);
                }
                window.location.href = url;
            });
        });
    }

    /**
     * Show error message (simple alert for now)
     */
    function showError(message) {
        // Could be replaced with a nicer notification system
        console.error(message);
        // For now, just log - we could add a toast notification later
    }

    // Expose functions globally for inline Kanban initialization
    window.initKanbanDragDrop = setupDragAndDrop;
    window.initKanbanCardClicks = setupCardClicks;

})();

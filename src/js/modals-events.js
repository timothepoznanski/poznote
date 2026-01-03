/**
 * Modals Event Delegation
 * CSP-compliant event handlers for modal buttons
 */

(function() {
    'use strict';

    /**
     * Handle click events on modal elements using event delegation
     * @param {Event} e - Click event
     */
    function handleModalsClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const modalId = target.dataset.modal;
        const type = target.dataset.type;

        switch (action) {
            // Generic modal close
            case 'close-modal':
                if (modalId && typeof closeModal === 'function') {
                    closeModal(modalId);
                }
                break;

            // Update modal actions
            case 'go-to-self-hosted-update':
                if (typeof goToSelfHostedUpdateInstructions === 'function') {
                    goToSelfHostedUpdateInstructions();
                }
                break;
            case 'go-to-cloud-update':
                if (typeof goToCloudUpdateInstructions === 'function') {
                    goToCloudUpdateInstructions();
                }
                break;
            case 'close-update-modal':
                if (typeof closeUpdateModal === 'function') {
                    closeUpdateModal();
                }
                break;
            case 'close-update-check-modal':
                if (typeof closeUpdateCheckModal === 'function') {
                    closeUpdateCheckModal();
                }
                break;

            // Login display modal
            case 'close-login-display-modal':
                if (typeof closeLoginDisplayModal === 'function') {
                    closeLoginDisplayModal();
                }
                break;

            // Confirm modal actions
            case 'close-confirm-modal':
                if (typeof closeConfirmModal === 'function') {
                    closeConfirmModal();
                }
                break;
            case 'execute-save-and-exit':
                if (typeof executeSaveAndExitAction === 'function') {
                    executeSaveAndExitAction();
                }
                break;
            case 'execute-confirmed-action':
                if (typeof executeConfirmedAction === 'function') {
                    executeConfirmedAction();
                }
                break;

            // Folder actions
            case 'create-folder':
                if (typeof createFolder === 'function') {
                    createFolder();
                }
                break;
            case 'save-folder-name':
                if (typeof saveFolderName === 'function') {
                    saveFolderName();
                }
                break;
            case 'execute-delete-folder':
                if (typeof executeDeleteFolder === 'function') {
                    executeDeleteFolder();
                }
                break;
            case 'execute-move-all-files':
                if (typeof executeMoveAllFiles === 'function') {
                    executeMoveAllFiles();
                }
                break;
            case 'execute-move-folder-to-subfolder':
                if (typeof executeMoveFolderToSubfolder === 'function') {
                    executeMoveFolderToSubfolder();
                }
                break;

            // Note actions
            case 'move-note-to-folder':
                if (typeof moveNoteToFolder === 'function') {
                    moveNoteToFolder();
                }
                break;

            // Workspace modal actions (workspaces.php)
            case 'close-move-modal':
                if (typeof closeMoveModal === 'function') {
                    closeMoveModal();
                }
                break;
            case 'close-rename-modal':
                if (typeof closeRenameModal === 'function') {
                    closeRenameModal();
                }
                break;
            case 'close-delete-modal':
                if (typeof closeDeleteModal === 'function') {
                    closeDeleteModal();
                }
                break;

            // Create modal - type selection
            case 'select-create-type':
                if (type && typeof selectCreateType === 'function') {
                    selectCreateType(type);
                }
                break;

            // Export modal - type selection
            case 'select-export-type':
                if (type && typeof selectExportType === 'function') {
                    selectExportType(type);
                }
                break;

            // Note reference modal
            case 'close-note-reference-modal':
                if (typeof closeNoteReferenceModal === 'function') {
                    closeNoteReferenceModal();
                }
                break;
        }
    }

    /**
     * Handle change events on modal elements
     * @param {Event} e - Change event
     */
    function handleModalsChange(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'on-workspace-change':
                if (typeof onWorkspaceChange === 'function') {
                    onWorkspaceChange();
                }
                break;
        }
    }

    /**
     * Handle keypress events on modal input elements
     * @param {Event} e - Keypress event
     */
    function handleModalsKeypress(e) {
        const target = e.target.closest('[data-enter-action]');
        if (!target) return;

        if (e.key === 'Enter') {
            const action = target.dataset.enterAction;

            switch (action) {
                case 'create-folder':
                    if (typeof createFolder === 'function') {
                        createFolder();
                    }
                    break;
            }
        }
    }

    // Initialize event listeners when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        document.addEventListener('click', handleModalsClick);
        document.addEventListener('change', handleModalsChange);
        document.addEventListener('keypress', handleModalsKeypress);
    });
})();

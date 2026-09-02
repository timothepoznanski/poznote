/**
 * Modals Event Delegation
 * CSP-compliant event handlers for modal buttons
 */

(function () {
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
            case 'close-info-modal':
                if (typeof closeModal === 'function') {
                    closeModal('infoModal');
                    // Reload if indicated (useful for Kanban activation)
                    if (window.reloadAfterInfoModal) {
                        window.location.reload();
                    }
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
            case 'save-note-name':
                if (typeof window.saveNoteName === 'function') {
                    window.saveNoteName();
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

            case 'toggle-move-create-workspace':
                if (typeof toggleMoveCreateWorkspace === 'function') {
                    toggleMoveCreateWorkspace();
                }
                break;
            case 'toggle-move-create-folder':
                if (typeof toggleMoveCreateFolder === 'function') {
                    toggleMoveCreateFolder();
                }
                break;
            case 'create-move-modal-workspace':
                if (typeof createWorkspaceFromMoveModal === 'function') {
                    createWorkspaceFromMoveModal();
                }
                break;
            case 'create-move-modal-folder':
                if (typeof createFolderFromMoveModal === 'function') {
                    createFolderFromMoveModal();
                }
                break;

            // Note actions
            case 'move-note-to-folder':
                if (typeof moveNoteToFolder === 'function') {
                    moveNoteToFolder();
                }
                break;
            case 'move-linked-note-shortcut':
                if (typeof moveLinkedNoteShortcutOnly === 'function') {
                    moveLinkedNoteShortcutOnly();
                }
                break;
            case 'move-linked-note-target':
                if (typeof moveLinkedNoteTarget === 'function') {
                    moveLinkedNoteTarget();
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

            // Attachment picker modal
            case 'close-attachment-picker-modal':
                if (typeof window.closeAttachmentPickerModal === 'function') {
                    window.closeAttachmentPickerModal();
                }
                break;

            // Note reference modal
            case 'close-note-reference-modal':
                if (typeof closeNoteReferenceModal === 'function') {
                    closeNoteReferenceModal();
                }
                break;
            case 'close-linked-selector-modal':
                if (typeof closeLinkedNoteSelectorModal === 'function') {
                    closeLinkedNoteSelectorModal();
                }
                break;
            case 'close-linked-folder-selector-modal':
                if (typeof closeLinkedNoteFolderSelectorModal === 'function') {
                    closeLinkedNoteFolderSelectorModal();
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
                case 'create-move-modal-workspace':
                    if (typeof createWorkspaceFromMoveModal === 'function') {
                        createWorkspaceFromMoveModal();
                    }
                    break;
                case 'create-move-modal-folder':
                    if (typeof createFolderFromMoveModal === 'function') {
                        createFolderFromMoveModal();
                    }
                    break;
            }
        }
    }

    /**
     * Close the active modal when Escape is pressed
     * @param {Event} e - Keydown event
     */
    function handleModalsEscape(e) {
        if (e.key !== 'Escape' || e.defaultPrevented) return;

        // The alert/confirm overlay handles its own Escape key
        if (document.querySelector('.alert-modal-overlay.show')) return;

        const openModals = Array.from(document.querySelectorAll('.modal')).filter(function (modal) {
            return modal.style.display === 'flex' || modal.style.display === 'block';
        });
        if (!openModals.length) return;

        // All modals share the same z-index, so the last one in DOM order paints on top
        const modal = openModals[openModals.length - 1];
        e.preventDefault();

        // Prefer the modal's own close button so its cleanup logic runs
        const closeButton = modal.querySelector('[data-action^="close"]');
        if (closeButton) {
            closeButton.click();
        } else if (modal.id && typeof closeModal === 'function') {
            closeModal(modal.id);
        }
    }

    // Initialize event listeners when DOM is loaded
    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('click', handleModalsClick);
        document.addEventListener('change', handleModalsChange);
        document.addEventListener('keypress', handleModalsKeypress);
        document.addEventListener('keydown', handleModalsEscape);
    });
})();

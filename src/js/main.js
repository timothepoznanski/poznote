// Main initialization script
// This file coordinates initialization of all modules

document.addEventListener('DOMContentLoaded', function () {

    // Initialize page configuration first (sets window.isAdmin, etc.)
    if (typeof window.initializePageConfig === 'function') {
        window.initializePageConfig();
    }

    // Initialize global variables and workspaces
    initializeWorkspaces();

    // Initialize the user interface
    initializeWorkspaceMenu();
    initializeBrowserHistory();

    // Initialize all event systems
    // Rich text editing (paste, keyboard shortcuts, content editing)
    if (typeof setupNoteEditingEvents === 'function') setupNoteEditingEvents();
    if (typeof setupAttachmentEvents === 'function') setupAttachmentEvents();
    if (typeof setupLinkEvents === 'function') setupLinkEvents();
    if (typeof setupFocusEvents === 'function') setupFocusEvents();

    // Drag & drop system (files, notes, folders)
    if (typeof setupDragDropEvents === 'function') setupDragDropEvents();
    if (typeof setupNoteDragDropEvents === 'function') setupNoteDragDropEvents();
    if (typeof setupFolderDragDropEvents === 'function') setupFolderDragDropEvents();

    // Navigation system (note-to-note navigation, history)
    if (typeof initializeAutoSaveSystem === 'function') initializeAutoSaveSystem();
    if (typeof setupPageUnloadWarning === 'function') setupPageUnloadWarning();

    // Text selection and formatting toolbar
    if (typeof initTextSelectionHandlers === 'function') initTextSelectionHandlers();

    // Chrome fix: Convert <audio> elements to iframes inside contenteditable notes
    if (typeof window.convertNoteAudioToIframes === 'function') {
        window.convertNoteAudioToIframes();
    }

    // Fix existing audio iframes to use audio_player.php
    if (typeof window.fixAudioIframes === 'function') {
        window.fixAudioIframes();
    }

    // Ensure embedded media has correct attributes
    try {
        var mediaEls = document.querySelectorAll('.noteentry video, .noteentry iframe');
        mediaEls.forEach(function (el) {
            el.setAttribute('contenteditable', 'false');
        });
    } catch (e) {
        // Ignore errors
    }

    // Initialize automatic update checking (once per day, for admin users only)
    checkForUpdatesAutomatic();

    // Restore folder states from localStorage
    restoreFolderStates();

    // Restore checklist values from data attributes (after page reload)
    const noteentry = document.querySelector('.noteentry');
    if (noteentry) {
        const checklistInputs = noteentry.querySelectorAll('.checklist-input');
        checklistInputs.forEach(function (input) {
            const savedValue = input.getAttribute('data-value');
            if (savedValue !== null && savedValue !== undefined) {
                input.value = savedValue;
            }
        });

        const checklistCheckboxes = noteentry.querySelectorAll('.checklist-checkbox');
        checklistCheckboxes.forEach(function (checkbox) {
            // First check if the 'checked' attribute exists in HTML
            if (checkbox.hasAttribute('checked')) {
                checkbox.checked = true;
            } else {
                // Fallback to data-checked attribute for compatibility
                const savedChecked = checkbox.getAttribute('data-checked');
                if (savedChecked === '1') {
                    checkbox.checked = true;
                } else if (savedChecked === '0') {
                    checkbox.checked = false;
                }
            }
        });
    }

    // Initialize Excalidraw border preferences
    if (typeof applyExcalidrawBorderPreferences === 'function') {
        applyExcalidrawBorderPreferences();

        // Re-apply border preferences when window gets focus (after returning from settings)
        window.addEventListener('focus', function () {
            applyExcalidrawBorderPreferences();
        });
    }

    // Initialize regular image border preferences
    if (typeof applyRegularImageBorderPreferences === 'function') {
        applyRegularImageBorderPreferences();

        // Re-apply border preferences when window gets focus (after returning from settings)
        window.addEventListener('focus', function () {
            applyRegularImageBorderPreferences();
        });
    }


    // Listen for note content changes via mutation observer to restore checklist values
    const handleNoteLoad = function () {
        setTimeout(function () {
            const ne = document.querySelector('.noteentry');
            if (ne) {
                // Restore checklist values when new content loads
                const inputs = ne.querySelectorAll('.checklist-input');
                const checkboxes = ne.querySelectorAll('.checklist-checkbox');

                inputs.forEach(function (input) {
                    const savedValue = input.getAttribute('data-value');
                    if (savedValue !== null && savedValue !== undefined) {
                        input.value = savedValue;
                    }
                });

                checkboxes.forEach(function (checkbox) {
                    // First check if the 'checked' attribute exists in HTML
                    if (checkbox.hasAttribute('checked')) {
                        checkbox.checked = true;
                    } else {
                        // Fallback to data-checked attribute for compatibility
                        const savedChecked = checkbox.getAttribute('data-checked');
                        if (savedChecked === '1') {
                            checkbox.checked = true;
                        } else if (savedChecked === '0') {
                            checkbox.checked = false;
                        }
                    }
                });
            }
        }, 50);
    };

    // Listen for note content changes via mutation observer (e.g., for checklists and image deletions)
    const rightCol = document.getElementById('right_col');
    if (rightCol) {
        const observer = new MutationObserver(function (mutations) {
            // Restore checklist values when new content loads (via existing helper)
            handleNoteLoad();

            // Detect image deletions from DOM (keyboard or external)
            if (window.isLoadingNote) return;

            mutations.forEach(function (mutation) {
                if (!mutation.removedNodes) return;

                mutation.removedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return; // Only element nodes

                    // Find all images within removed nodes
                    const imgs = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img');
                    imgs.forEach(function (img) {
                        // Only handle if it was actually in an active noteentry and NOT marked as manually deleted
                        // AND it's not currently being wrapped for resizing
                        const noteEntry = mutation.target.closest('.noteentry');

                        // ONLY auto-delete for standard HTML notes.
                        // Markdown and Tasklist notes re-render their DOM from state, so removal from DOM doesn't mean deletion.
                        const noteType = noteEntry ? (noteEntry.getAttribute('data-note-type') || 'note') : null;

                        if (noteEntry && noteType === 'note' && document.body.contains(noteEntry) && !img._manuallyDeleted && !img._isResizing) {
                            // Extract attachment info and call API
                            const src = img.getAttribute('src');
                            if (src) {
                                const match = src.match(/\/api\/v1\/notes\/(\d+)\/attachments\/([a-fA-F0-9_-]+)/);
                                if (match) {
                                    const noteId = match[1];
                                    const attachmentId = match[2];

                                    // Only delete if the image belongs to the note it's being deleted from
                                    const noteIdMatch = noteEntry.id.match(/entry(\d+)/);
                                    const activeNoteId = noteIdMatch ? noteIdMatch[1] : null;

                                    if (activeNoteId && noteId === activeNoteId) {
                                        // Defer execution a brief moment to check if the browser simply re-inserted it
                                        // (e.g., during a paragraph split or rich text operation that moves elements)
                                        setTimeout(function () {
                                            const stillExists = document.querySelector('img[src*="' + attachmentId + '"]');
                                            if (!stillExists) {
                                                // Call the existing deleteAttachment function if available
                                                if (typeof window.deleteAttachment === 'function') {
                                                    window.deleteAttachment(attachmentId, noteId);
                                                }
                                            }
                                        }, 100);
                                    }
                                }
                            }
                        }
                    });
                });
            });
        });

        observer.observe(rightCol, { childList: true, subtree: true });
    }
});

// Global functions available for HTML (compatibility)
window.newnote = createNewNote;
window.saveNoteImmediately = saveNoteToServer;
window.deleteNote = deleteNote;
window.toggleFavorite = toggleFavorite;
window.duplicateNote = duplicateNote;
window.showNoteInfo = showNoteInfo;
window.toggleNoteMenu = toggleNoteMenu;
window.toggleWorkspaceMenu = toggleWorkspaceMenu;
window.switchToWorkspace = switchToWorkspace;
window.showAttachmentDialog = showAttachmentDialog;
window.uploadAttachment = uploadAttachment;
window.downloadAttachment = downloadAttachment;
window.deleteAttachment = deleteAttachment;
window.closeModal = closeModal;
window.showNotificationPopup = showNotificationPopup;
window.showContactPopup = showContactPopup;
window.closeContactModal = closeContactModal;
window.newFolder = newFolder;
window.deleteFolder = deleteFolder;
window.downloadFolder = downloadFolder;
window.executeDeleteFolder = executeDeleteFolder;
window.showDeleteFolderModal = showDeleteFolderModal;
window.selectFolder = selectFolder;
window.toggleFolder = toggleFolder;
window.restoreFolderStates = restoreFolderStates;
window.persistFolderStatesFromDOM = persistFolderStatesFromDOM;
window.showNewWorkspacePrompt = showNewWorkspacePrompt;
window.deleteCurrentWorkspace = deleteCurrentWorkspace;
window.startDownload = startDownload;
window.toggleSettingsMenu = toggleSettingsMenu;
window.showLoginDisplayNamePrompt = showLoginDisplayNamePrompt;
window.closeLoginDisplayModal = closeLoginDisplayModal;
window.checkForUpdates = checkForUpdates;
window.highlightSearchTerms = highlightSearchTerms;
window.clearSearchHighlights = clearSearchHighlights;
window.showMoveFolderFilesDialog = showMoveFolderFilesDialog;
window.executeMoveAllFiles = executeMoveAllFiles;
window.populateTargetFolderDropdown = populateTargetFolderDropdown;
window.showMoveEntireFolderDialog = showMoveEntireFolderDialog;
window.executeMoveFolderToSubfolder = executeMoveFolderToSubfolder;
window.editFolderName = editFolderName;
window.saveFolderName = saveFolderName;
window.emptyFolder = emptyFolder;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.executeConfirmedAction = executeConfirmedAction;
window.showInputModal = showInputModal;
window.closeInputModal = closeInputModal;
window.executeInputModalAction = executeInputModalAction;
window.showLinkModal = showLinkModal;
window.closeLinkModal = closeLinkModal;
window.executeLinkModalAction = executeLinkModalAction;
window.executeLinkModalRemove = executeLinkModalRemove;
window.showMoveFolderDialog = showMoveFolderDialog;
window.moveNoteToFolder = moveNoteToFolder;
window.showUpdateInstructions = showUpdateInstructions;
window.closeUpdateModal = closeUpdateModal;
window.showCreateNoteInFolderModal = showCreateNoteInFolderModal;
window.showCreateModal = showCreateModal;
window.selectNoteType = selectNoteType;
window.selectCreateType = selectCreateType;
window.createNoteInFolder = createNoteInFolder;
window.executeCreateAction = executeCreateAction;
window.closeUpdateCheckModal = closeUpdateCheckModal;
window.goToSelfHostedUpdateInstructions = goToSelfHostedUpdateInstructions;
window.goToCloudUpdateInstructions = goToCloudUpdateInstructions;

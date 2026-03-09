/**
 * Index Page Event Delegation
 * 
 * This module handles all event listeners for the main index.php page.
 * It uses event delegation for better performance and CSP compliance.
 * 
 * Key features:
 * - Event delegation pattern for all click and focus events
 * - Initialization of tasklists, markdown notes, and page config
 * - Mobile navigation helpers
 * - Note creation functions (tasklist and markdown)
 * 
 * @module index-events
 */

(function () {
    'use strict';

    /**
     * Handle focus events using event delegation for note editing tracking
     * @param {Event} e - Focus event
     */
    function handleIndexFocus(e) {
        var target = e.target;

        // Handle note title input focus (starts with 'inp')
        if (target.id && target.id.startsWith('inp') && target.classList.contains('css-title')) {
            if (typeof updateidhead === 'function') {
                updateidhead(target);
            }
            return;
        }

        // Handle note entry focus (starts with 'entry')
        if (target.id && target.id.startsWith('entry') && target.classList.contains('noteentry')) {
            if (typeof updateident === 'function') {
                updateident(target);
            }
            return;
        }
    }

    // ============================================================
    // Tasklist Actions Menu Handlers
    // ============================================================

    /**
     * Close all open tasklist action menus
     */
    function closeTasklistActionsMenus() {
        const openMenus = document.querySelectorAll('.tasklist-actions-menu:not([hidden])');
        openMenus.forEach(menu => {
            menu.hidden = true;
            const btn = menu.parentElement?.querySelector('[data-action="toggle-tasklist-actions"]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    /**
     * Toggle a tasklist actions menu and attach outside click listener
     * @param {string} noteId - The note ID
     * @param {HTMLElement} triggerEl - The button element that triggered the toggle
     */
    function toggleTasklistActionsMenu(noteId, triggerEl) {
        if (!noteId) return;

        const menu = document.getElementById(`tasklist-actions-menu-${noteId}`);
        if (!menu) return;

        const isHidden = menu.hasAttribute('hidden');
        closeTasklistActionsMenus();
        closeTagsMenus(); // Close other types of menus

        if (isHidden) {
            menu.hidden = false;
            if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');

            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target) && !(triggerEl && triggerEl.contains(e.target))) {
                        menu.hidden = true;
                        if (triggerEl) triggerEl.setAttribute('aria-expanded', 'false');
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 0);
        }
    }

    /**
     * Close all open tags action menus
     */
    function closeTagsMenus() {
        const openMenus = document.querySelectorAll('.tags-actions-menu:not([hidden])');
        openMenus.forEach(menu => {
            menu.hidden = true;
            const btn = menu.parentElement?.querySelector('[data-action="toggle-tags-menu"]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    /**
     * Toggle a tags actions menu and attach outside click listener
     * @param {string} noteId - The note ID
     * @param {HTMLElement} triggerEl - The element that triggered the toggle
     */
    function toggleTagsMenu(noteId, triggerEl) {
        if (!noteId) return;

        const menu = document.getElementById(`tags-menu-${noteId}`);
        if (!menu) return;

        const isHidden = menu.hasAttribute('hidden');
        closeTasklistActionsMenus(); // Close other types of menus
        closeTagsMenus();

        if (isHidden) {
            menu.hidden = false;
            if (triggerEl) triggerEl.setAttribute('aria-expanded', 'true');

            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target) && !(triggerEl && triggerEl.contains(e.target))) {
                        menu.hidden = true;
                        if (triggerEl) triggerEl.setAttribute('aria-expanded', 'false');
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 0);
        }
    }

    /**
     * Handle click events using event delegation
     * @param {Event} e - Click event
     */
    function handleIndexClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const noteId = target.dataset.noteId;
        const selector = target.dataset.selector;

        switch (action) {
            // Sidebar actions
            case 'toggle-workspace-menu':
                if (typeof toggleWorkspaceMenu === 'function') {
                    toggleWorkspaceMenu(e);
                }
                break;
            case 'navigate-to-home':
                if (typeof navigateToDisplayOrSettings === 'function') {
                    navigateToDisplayOrSettings('home.php');
                }
                break;
            case 'navigate-to-settings':
                if (typeof navigateToDisplayOrSettings === 'function') {
                    navigateToDisplayOrSettings('settings.php');
                }
                break;
            case 'navigate-to-profile':
                if (typeof navigateToDisplayOrSettings === 'function') {
                    navigateToDisplayOrSettings('profile.php');
                }
                break;
            case 'toggle-create-menu':
                if (typeof toggleCreateMenu === 'function') {
                    toggleCreateMenu();
                }
                break;
            case 'toggle-sidebar-menu':
                if (typeof toggleSidebarMenu === 'function') {
                    toggleSidebarMenu(e);
                }
                break;

            // Mobile navigation
            case 'scroll-to-left-column':
                if (typeof scrollToLeftColumn === 'function') {
                    scrollToLeftColumn();
                }
                break;

            // Text formatting commands
            case 'exec-bold':
                if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
                    if (typeof applyMarkdownBold === 'function') {
                        applyMarkdownBold();
                    }
                } else {
                    document.execCommand('bold');
                }
                break;
            case 'exec-italic':
                if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
                    if (typeof applyMarkdownItalic === 'function') {
                        applyMarkdownItalic();
                    }
                } else {
                    document.execCommand('italic');
                }
                break;
            case 'exec-underline':
                // Underline not supported in standard markdown, use HTML fallback
                document.execCommand('underline');
                break;
            case 'exec-strikethrough':
                if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
                    if (typeof applyMarkdownStrikethrough === 'function') {
                        applyMarkdownStrikethrough();
                    }
                } else {
                    document.execCommand('strikeThrough');
                }
                break;
            case 'exec-unordered-list':
                if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
                    if (typeof toggleMarkdownList === 'function') {
                        toggleMarkdownList('ul');
                    }
                } else {
                    document.execCommand('insertUnorderedList');
                }
                break;
            case 'exec-ordered-list':
                if (typeof isInMarkdownEditor === 'function' && isInMarkdownEditor()) {
                    if (typeof toggleMarkdownList === 'function') {
                        toggleMarkdownList('ol');
                    }
                } else {
                    document.execCommand('insertOrderedList');
                }
                break;
            case 'exec-remove-format':
                // For markdown, this doesn't make much sense, but we keep it
                document.execCommand('removeFormat');
                break;

            // Toolbar functions
            case 'add-link':
                if (typeof addLinkToNote === 'function') {
                    addLinkToNote();
                }
                break;
            case 'toggle-red-color':
                if (typeof toggleRedColor === 'function') {
                    toggleRedColor();
                }
                break;
            case 'toggle-yellow-highlight':
                if (typeof toggleYellowHighlight === 'function') {
                    toggleYellowHighlight();
                }
                break;
            case 'change-font-size':
                if (typeof changeFontSize === 'function') {
                    changeFontSize();
                }
                break;
            case 'toggle-code-block':
                if (typeof toggleCodeBlock === 'function') {
                    toggleCodeBlock();
                }
                break;
            case 'toggle-inline-code':
                if (typeof toggleInlineCode === 'function') {
                    toggleInlineCode();
                }
                break;
            case 'insert-excalidraw':
                if (typeof insertExcalidrawDiagram === 'function') {
                    insertExcalidrawDiagram();
                }
                break;
            case 'toggle-emoji-picker':
                if (typeof toggleEmojiPicker === 'function') {
                    toggleEmojiPicker();
                }
                break;
            case 'toggle-table-picker':
                if (typeof toggleTablePicker === 'function') {
                    toggleTablePicker();
                }
                break;
            case 'insert-checklist':
                if (typeof insertChecklist === 'function') {
                    insertChecklist();
                }
                break;
            case 'insert-separator':
                if (typeof insertSeparator === 'function') {
                    insertSeparator();
                }
                break;
            case 'open-note-reference-modal':
                if (typeof openNoteReferenceModal === 'function') {
                    openNoteReferenceModal();
                }
                break;
            case 'create-linked-note':
                if (typeof createLinkedNoteFromCurrent === 'function') {
                    createLinkedNoteFromCurrent();
                }
                break;
            case 'open-search-replace-modal':
                if (noteId && typeof openSearchReplaceModal === 'function') {
                    openSearchReplaceModal(noteId);
                }
                break;
            case 'clear-completed-tasks':
                if (noteId && typeof clearCompletedTasks === 'function') {
                    clearCompletedTasks(noteId);
                }
                closeTasklistActionsMenus();
                break;
            case 'uncheck-all-tasks':
                if (noteId && typeof uncheckAllTasks === 'function') {
                    uncheckAllTasks(noteId);
                }
                closeTasklistActionsMenus();
                break;
            case 'toggle-tasklist-actions':
                toggleTasklistActionsMenu(noteId, target);
                break;
            case 'toggle-tags-menu':
                toggleTagsMenu(noteId, target);
                break;
            case 'show-tag-edit-modal':
                if (noteId && typeof showNoteTagsModal === 'function') {
                    showNoteTagsModal(noteId);
                }
                break;
            case 'close-tags-modal':
                const tagsModal = document.getElementById('tagsModal');
                if (tagsModal) {
                    tagsModal.style.display = 'none';
                    // Clean up modal content
                    const container = document.getElementById('tagsModalTagsList');
                    if (container) container.innerHTML = '';
                    const tagInput = document.getElementById('tagsModalInput');
                    if (tagInput) tagInput.value = '';
                }
                break;
            case 'close-user-settings-info-modal':
                const userSettingsModal = document.getElementById('userSettingsInfoModal');
                if (userSettingsModal) {
                    userSettingsModal.style.display = 'none';
                }
                break;

            // Note actions with noteId
            case 'toggle-favorite':
                if (noteId && typeof toggleFavorite === 'function') {
                    toggleFavorite(noteId);
                }
                break;
            case 'open-share-modal':
                if (noteId && typeof openPublicShareModal === 'function') {
                    openPublicShareModal(noteId);
                }
                break;
            case 'show-attachment-dialog':
                if (noteId && typeof showAttachmentDialog === 'function') {
                    showAttachmentDialog(noteId);
                }
                break;
            case 'open-note-new-tab':
                if (noteId && typeof openNoteInNewTab === 'function') {
                    openNoteInNewTab(noteId);
                }
                break;
            case 'toggle-mobile-toolbar-menu':
                if (typeof toggleMobileToolbarMenu === 'function') {
                    toggleMobileToolbarMenu(target);
                }
                break;
            case 'trigger-mobile-action':
                if (selector && typeof triggerMobileToolbarAction === 'function') {
                    triggerMobileToolbarAction(target, selector);
                }
                break;
            case 'duplicate-note':
                if (noteId && typeof duplicateNote === 'function') {
                    duplicateNote(noteId);
                }
                break;
            case 'show-move-folder-dialog':
                if (noteId && typeof showMoveFolderDialog === 'function') {
                    const fId = target.dataset.folderId;
                    const fName = target.dataset.folder;
                    showMoveFolderDialog(noteId, fId, fName);
                }
                break;
            case 'show-export-modal':
                if (typeof showExportModal === 'function') {
                    const filename = target.dataset.filename;
                    const title = target.dataset.title;
                    const noteType = target.dataset.noteType;
                    showExportModal(noteId, filename, title, noteType);
                }
                break;
            case 'show-convert-modal':
                if (noteId && typeof showConvertNoteModal === 'function') {
                    const convertTo = target.dataset.convertTo;
                    showConvertNoteModal(noteId, convertTo);
                }
                break;
            case 'delete-note':
                if (noteId && typeof deleteNote === 'function') {
                    deleteNote(noteId);
                }
                break;
            case 'show-note-info':
                if (noteId && typeof showNoteInfo === 'function') {
                    const created = target.dataset.created;
                    const updated = target.dataset.updated;
                    const folder = target.dataset.folder;
                    const favorite = target.dataset.favorite;
                    const tags = target.dataset.tags;
                    const attachmentsCount = target.dataset.attachmentsCount;
                    showNoteInfo(noteId, created, updated, folder, favorite, tags, attachmentsCount);
                }
                break;
            case 'navigate-tags':
                window.location = 'list_tags.php?workspace=' + encodeURIComponent(window.selectedWorkspace || '');
                break;
            case 'download-attachment':
                if (typeof downloadAttachment === 'function') {
                    const attachmentId = target.dataset.attachmentId;
                    downloadAttachment(attachmentId, noteId);
                }
                break;
            case 'open-note-info':
                if (noteId) {
                    var url = 'info.php?note_id=' + encodeURIComponent(noteId);
                    if (window.selectedWorkspace) {
                        url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
                    }
                    window.location.href = url;
                }
                break;
            case 'open-kanban-view': {
                e.preventDefault();
                e.stopImmediatePropagation();

                const kanbanFolderId = target.dataset.folderId;
                const kanbanFolderName = target.dataset.folderName || '';

                if (kanbanFolderId && typeof window.openKanbanView === 'function') {
                    // Close folder actions menu if opened from there
                    if (typeof window.closeFolderActionsMenu === 'function') {
                        window.closeFolderActionsMenu(kanbanFolderId);
                    }

                    window.openKanbanView(parseInt(kanbanFolderId, 10), kanbanFolderName);

                    // On mobile, scroll to the right column to show the Kanban board
                    if (window.innerWidth <= 800 && typeof window.scrollToRightColumn === 'function') {
                        window.scrollToRightColumn();
                    }
                }
                break;
            }
        }
    }

    /**
     * Initialize tasklists from JSON data element
     */
    function initializeTasklists() {
        var dataElement = document.getElementById('tasklist-init-data');
        if (dataElement && typeof initializeTaskList === 'function') {
            try {
                var tasklistIds = JSON.parse(dataElement.textContent);
                if (Array.isArray(tasklistIds)) {
                    tasklistIds.forEach(function (id) {
                        initializeTaskList(id, 'tasklist');
                    });
                }
            } catch (e) {
                console.error('Error parsing tasklist init data:', e);
            }
        }
    }

    /**
     * Initialize markdown notes from JSON data element
     */
    function initializeMarkdownNotes() {
        var dataElement = document.getElementById('markdown-init-data');
        if (dataElement && typeof initializeMarkdownNote === 'function') {
            try {
                var markdownIds = JSON.parse(dataElement.textContent);
                if (Array.isArray(markdownIds)) {
                    markdownIds.forEach(function (id) {
                        initializeMarkdownNote(id);
                    });
                }
            } catch (e) {
                console.error('Error parsing markdown init data:', e);
            }
        }
    }

    /**
     * Track opened note and process note references
     */
    window.trackAndProcessNotes = function () {
        // Track the currently opened note for recent notes list
        var noteEntry = document.querySelector('.noteentry[data-note-id]');
        if (noteEntry && typeof window.trackNoteOpened === 'function') {
            var noteId = noteEntry.getAttribute('data-note-id');
            var heading = noteEntry.getAttribute('data-note-heading');
            if (noteId && heading) {
                window.trackNoteOpened(noteId, heading);
            }
        }

        // Process note references [[Note Title]] in rendered content
        if (typeof window.processNoteReferences === 'function') {
            var noteEntries = document.querySelectorAll('.noteentry');
            noteEntries.forEach(function (entry) {
                // Only process for view mode or after markdown rendering
                window.processNoteReferences(entry);
            });
        }
    }

    /**
     * Check for unsaved drafts after note loads
     */
    function checkForDrafts() {
        var dataElement = document.getElementById('current-note-data');
        if (dataElement && typeof checkForUnsavedDraft === 'function') {
            try {
                var data = JSON.parse(dataElement.textContent);
                if (data && data.noteId) {
                    setTimeout(function () {
                        // Check if this was a forced refresh (skip auto-restore in that case)
                        var isRefresh = window.location.search.includes('_refresh=');
                        checkForUnsavedDraft(data.noteId, isRefresh);
                    }, 500); // Small delay to ensure content is fully loaded
                }
            } catch (e) {
                console.error('Error parsing current note data:', e);
            }
        }
    }

    /**
     * Initialize page configuration from JSON data element
     */
    function initializePageConfig() {
        // Load page config (isSearchMode, currentNoteFolder, selectedWorkspace)
        var configElement = document.getElementById('page-config-data');
        if (configElement) {
            try {
                var config = JSON.parse(configElement.textContent);
                window.isSearchMode = config.isSearchMode || false;
                window.currentNoteFolder = config.currentNoteFolder;
                window.selectedWorkspace = config.selectedWorkspace || '';
                window.userId = config.userId;
                window.userEntriesPath = config.userEntriesPath;
                window.defaultNoteSortType = config.defaultNoteSortType || 'updated_desc';
                window.isAdmin = config.isAdmin || false;
            } catch (e) {
                console.error('Error parsing page config data:', e);
            }
        }

        // Load workspace display map
        var mapElement = document.getElementById('workspace-display-map-data');
        if (mapElement) {
            try {
                window.workspaceDisplayMap = JSON.parse(mapElement.textContent);
            } catch (e) {
                window.workspaceDisplayMap = {};
                console.error('Error parsing workspace display map:', e);
            }
        }

        // Update workspace title - use selectedWorkspace from PHP (no more localStorage dependency)
        var lastOpenedFlag = document.getElementById('workspace-last-opened-flag');
        if (lastOpenedFlag) {
            try {
                var currentWs = (typeof selectedWorkspace !== 'undefined') ? selectedWorkspace :
                    (typeof window.selectedWorkspace !== 'undefined') ? window.selectedWorkspace : null;
                if (currentWs && currentWs !== '__last_opened__') {
                    var titleElement = document.querySelector('.workspace-title-text');
                    if (titleElement && window.workspaceDisplayMap) {
                        // Use the display map to get the proper label
                        var displayName = window.workspaceDisplayMap[currentWs] || currentWs;
                        titleElement.textContent = displayName;
                    }
                }
            } catch (e) {
                console.error('Error updating workspace title:', e);
            }
        }
    }

    // Expose initializePageConfig globally so it can be called from main.js
    window.initializePageConfig = initializePageConfig;

    /**
     * Restore folder states from localStorage
     */
    function restoreFolderStates() {
        try {
            var folderContents = document.querySelectorAll('.folder-content');
            for (var i = 0; i < folderContents.length; i++) {
                var content = folderContents[i];
                var folderId = content.id;
                var savedState = localStorage.getItem('folder_' + folderId);

                if (savedState === 'closed') {
                    // add a closed class so CSS can hide it; existing code expects this state
                    content.classList.add('closed');
                }
            }
        } catch (e) {
            // ignore errors during initial folder state restoration
        }
    }

    /**
     * Helper to place cursor at the end of contentEditable
     * @param {HTMLElement} el 
     */
    function focusAtEnd(el) {
        el.focus();
        if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    /**
     * Handle clicks on note background to focus the editor at the end
     */
    function handleNoteBackgroundClick(e) {
        // Ensure the click is within the right column (editor area)
        // This prevents triggering focus when clicking on the sidebar/note list
        if (!e.target.closest('#right_col')) {
            return;
        }

        // If the click is on an interactive element, ignore
        if (e.target.closest('button, a, input, textarea, select, [contenteditable="true"], .search-replace-bar, .mobile-toolbar-menu, .note-edit-toolbar, .note-tags-row, summary, details')) {
            return;
        }

        // Also ignore if clicking on a toggle block (details/summary elements)
        if (e.target.tagName === 'SUMMARY' || e.target.tagName === 'DETAILS' || e.target.closest('.toggle-block')) {
            return;
        }

        // Also ignore if clicking on specific icons that are meant to be interactive
        if (e.target.tagName === 'I' || e.target.tagName === 'SVG' || e.target.tagName === 'PATH') {
            if (e.target.closest('button, a, .cursor-pointer, .note-tags-row')) return;
        }

        // Check if text is being selected - don't focus if user is selecting text
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            return;
        }

        // Find the visible (active) note entry inside the right column
        const noteEntry = document.querySelector('#right_col .noteentry');
        if (!noteEntry || noteEntry.offsetParent === null) return;

        // Determine the actual target element for focusing
        // For HTML notes, it's the noteEntry. For Markdown notes, it's the .markdown-editor child.
        let targetEl = noteEntry;
        const markdownEditor = noteEntry.querySelector('.markdown-editor');
        if (markdownEditor && markdownEditor.offsetParent !== null) {
            targetEl = markdownEditor;
        }

        // If clicking specifically on the bottom space padding div
        if (e.target.classList.contains('note-bottom-space')) {
            focusAtEnd(targetEl);
            e.preventDefault();
            return;
        }

        const rect = noteEntry.getBoundingClientRect();

        // If the click is anywhere in the right column background (below the note or around it)
        // Since we already checked for #right_col target and excluded interactive elements,
        // we can focus the end of the note.
        if (e.clientY > rect.bottom || e.target.closest('#right_col')) {
            focusAtEnd(targetEl);
            e.preventDefault();
        }
    }

    // ============================================================
    // Main Event Initialization
    // ============================================================
    document.addEventListener('DOMContentLoaded', function () {
        // Attach global event listeners
        document.addEventListener('click', handleIndexClick);
        document.addEventListener('click', handleNoteBackgroundClick);
        document.addEventListener('focusin', handleIndexFocus);

        // Initialize page configuration first
        initializePageConfig();
        restoreFolderStates();

        // Check for kanban parameter in URL to restore Kanban view
        const urlParams = new URLSearchParams(window.location.search);
        const kanbanFolderId = urlParams.get('kanban');
        if (kanbanFolderId && typeof window.openKanbanView === 'function') {
            window.openKanbanView(parseInt(kanbanFolderId, 10));
        }

        // Initialize tasklists and markdown notes
        initializeTasklists();
        initializeMarkdownNotes();
        if (typeof window.trackAndProcessNotes === 'function') {
            window.trackAndProcessNotes();
        }
        checkForDrafts();

        // Close all toggle blocks on page load (toggles should always start closed)
        try {
            const toggleBlocks = document.querySelectorAll('details.toggle-block');
            toggleBlocks.forEach(function (toggle) {
                toggle.removeAttribute('open');
            });
        } catch (e) {
            console.error('Error closing toggle blocks:', e);
        }

        // Initialize mobile note click handlers
        initializeNoteClickHandlers();
        checkAndScrollToNote();

        // Initialize image click handlers for images in notes
        if (typeof reinitializeImageClickHandlers === 'function') {
            reinitializeImageClickHandlers();
        }

        // Check if we need to expand a specific folder (e.g., after creating a template)
        const expandFolderId = urlParams.get('expand_folder');
        if (expandFolderId && typeof window.toggleFolder === 'function') {
            // Wait for the DOM to be fully loaded including folder structure
            setTimeout(function () {
                const folderDomId = 'folder-' + expandFolderId;
                const folderContent = document.getElementById(folderDomId);
                // Expand folder if it exists and is currently closed
                if (folderContent) {
                    if (folderContent.style.display === 'none' || folderContent.style.display === '') {
                        window.toggleFolder(folderDomId);
                    }
                }
                // Clean up URL parameter
                urlParams.delete('expand_folder');
                const newUrl = window.location.pathname + '?' + urlParams.toString();
                window.history.replaceState({}, '', newUrl);
            }, 300);
        }
    });

    // ============================================================
    // Global Functions (exposed via window object)
    // These functions are called from other modules or inline event handlers
    // ============================================================

    /**
     * Redirect to create.php with current workspace
     * Note: Despite the name "toggle", this function only redirects
     */
    window.toggleCreateMenu = function () {
        closeSidebarMenu();
        var workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || '';
        window.location.href = 'create.php?workspace=' + encodeURIComponent(workspace);
    };

    /**
     * Close the sidebar menu dropdown
     */
    function closeSidebarMenu() {
        var menu = document.getElementById('sidebarMenu');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    /**
     * Toggle the sidebar menu dropdown
     */
    window.toggleSidebarMenu = function (event) {
        if (event) event.stopPropagation();

        var menu = document.getElementById('sidebarMenu');
        if (!menu) return;

        var isVisible = menu.style.display !== 'none';

        if (isVisible) {
            menu.style.display = 'none';
        } else {
            // Close create menu if open
            var createMenu = document.querySelector('.create-menu');
            if (createMenu) {
                createMenu.style.display = 'none';
            }

            menu.style.display = 'block';

            // Close menu when clicking elsewhere
            setTimeout(function () {
                document.addEventListener('click', function closeSidebarMenuHandler(e) {
                    if (!menu.contains(e.target) && !e.target.closest('.sidebar-menu-btn')) {
                        menu.style.display = 'none';
                        document.removeEventListener('click', closeSidebarMenuHandler);
                    }
                });
            }, 10);
        }
    };

    /**
     * Create a new task list note via API
     * Redirects to the new note after successful creation
     */
    window.createTaskListNote = function () {
        var noteData = {
            folder_id: window.selectedFolderId || null,
            workspace: window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''),
            type: 'tasklist'
        };

        // Use RESTful API: POST /api/v1/notes
        fetch("/api/v1/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json", 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(noteData)
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success && data.note) {
                    window.scrollTo(0, 0);
                    var ws = encodeURIComponent(window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''));
                    window.location.href = "index.php?workspace=" + ws + "&note=" + data.note.id + "&scroll=1";
                } else {
                    showNotificationPopup(data.error || (window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list'), 'error');
                }
            })
            .catch(function (error) {
                showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
            });
    };

    /**
     * Create a new markdown note via API
     * Redirects to the new note after successful creation
     */
    window.createMarkdownNote = function () {
        var noteData = {
            folder_id: window.selectedFolderId || null,
            workspace: window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''),
            type: 'markdown'
        };

        // Use RESTful API: POST /api/v1/notes
        fetch("/api/v1/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json", 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(noteData)
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success && data.note) {
                    window.scrollTo(0, 0);
                    var ws = encodeURIComponent(window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''));
                    window.location.href = "index.php?workspace=" + ws + "&note=" + data.note.id + "&scroll=1";
                } else {
                    showNotificationPopup(data.error || (window.t ? window.t('index.errors.create_markdown_note', null, 'Error creating markdown note') : 'Error creating markdown note'), 'error');
                }
            })
            .catch(function (error) {
                showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
            });
    };

    /**
     * Navigate to a different page while preserving workspace and note context
     * @param {string} page - The target page (e.g., 'settings.php', 'home.php')
     */
    window.navigateToDisplayOrSettings = function (page) {
        var url = page;
        var params = [];

        if (window.selectedWorkspace) {
            params.push('workspace=' + encodeURIComponent(window.selectedWorkspace));
        }

        // Don't pass note parameter to profile.php
        if (page !== 'profile.php') {
            var urlParams = new URLSearchParams(window.location.search);
            var noteId = urlParams.get('note');
            if (noteId) {
                params.push('note=' + encodeURIComponent(noteId));
            }
        }

        if (params.length > 0) {
            url += '?' + params.join('&');
        }

        window.location.href = url;
    };

    // ============================================================
    // Mobile Navigation Helpers
    // ============================================================

    function isReducedMotionPreferred() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function setHorizontalScroll(left) {
        const scrollRoot = document.scrollingElement || document.documentElement;
        scrollRoot.scrollLeft = left;
        document.body.scrollLeft = left;
        window.scrollTo({
            left: left,
            behavior: 'auto'
        });
    }

    function animateHorizontalScroll(targetLeft, durationMs) {
        const scrollRoot = document.scrollingElement || document.documentElement;
        const startLeft = scrollRoot.scrollLeft;
        const delta = targetLeft - startLeft;

        if (durationMs <= 0 || delta === 0) {
            setHorizontalScroll(targetLeft);
            return;
        }

        const startTime = performance.now();

        function step(now) {
            const progress = Math.min(1, (now - startTime) / durationMs);
            const eased = 1 - Math.pow(1 - progress, 3);
            setHorizontalScroll(startLeft + delta * eased);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    /**
     * Scroll to the right column (note editor area)
     * On mobile: uses horizontal scroll
     * On desktop: uses scrollIntoView
     */
    window.scrollToRightColumn = function () {
        if (window.innerWidth <= 800) {
            const scrollAmount = window.innerWidth;
            const duration = isReducedMotionPreferred() ? 0 : 260;
            animateHorizontalScroll(scrollAmount, duration);
        } else {
            const rightCol = document.getElementById('right_col');
            if (rightCol) {
                rightCol.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'start'
                });
            }
        }
    };

    /**
     * Scroll to the left column (note list / sidebar)
     * On mobile: uses horizontal scroll
     * On desktop: uses scrollIntoView
     */
    window.scrollToLeftColumn = function () {
        // Check for unsaved changes before navigating away
        if (typeof hasUnsavedChanges === 'function' && typeof window.noteid !== 'undefined') {
            if (hasUnsavedChanges(window.noteid)) {
                // Get translation function or use default message
                const message = typeof tr === 'function'
                    ? tr('autosave.unsaved_changes_warning', {}, '⚠️ You have unsaved changes. Are you sure you want to leave?')
                    : '⚠️ You have unsaved changes. Are you sure you want to leave?';

                const title = typeof tr === 'function'
                    ? tr('autosave.unsaved_changes_title', {}, 'Unsaved Changes')
                    : 'Unsaved Changes';

                // Use styled modal instead of native confirm
                if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
                    window.modalAlert.confirm(message, title).then(function (isConfirmed) {
                        if (!isConfirmed) {
                            return; // User cancelled, don't navigate
                        }

                        // User confirmed, try to save before leaving
                        if (typeof emergencySave === 'function') {
                            try {
                                emergencySave(window.noteid);
                            } catch (err) {
                                console.error('[Poznote] Emergency save failed:', err);
                            }
                        }

                        // Now perform the navigation
                        performScroll();
                    });
                } else {
                    // Fallback to native confirm if modal system not available
                    if (!confirm(message)) {
                        return; // User cancelled, don't navigate
                    }

                    // User confirmed, try to save before leaving
                    if (typeof emergencySave === 'function') {
                        try {
                            emergencySave(window.noteid);
                        } catch (err) {
                            console.error('[Poznote] Emergency save failed:', err);
                        }
                    }

                    performScroll();
                }
                return; // Exit early since we'll call performScroll() in callback
            }
        }

        // No unsaved changes, perform scroll immediately
        performScroll();
    };

    /**
     * Helper function to perform the actual scroll action
     */
    function performScroll() {
        if (window.innerWidth <= 800) {
            const duration = isReducedMotionPreferred() ? 0 : 260;
            animateHorizontalScroll(0, duration);
        } else {
            const leftCol = document.getElementById('left_col');
            if (leftCol) {
                leftCol.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                    inline: 'start'
                });
            }
        }
    }

    /**
     * Check URL parameters and auto-scroll to note if scroll=1 is present
     * or if a note ID is present in the URL (mobile only).
     * Used on mobile after creating/loading a note
     */
    function checkAndScrollToNote() {
        const isMobile = window.innerWidth <= 800;
        if (isMobile) {
            const urlParams = new URLSearchParams(window.location.search);
            const hasScrollFlag = urlParams.has('scroll') && urlParams.get('scroll') === '1';
            const hasNoteId = urlParams.has('note') && urlParams.get('note');
            const isSearch = urlParams.has('search') || urlParams.has('tags_search') || window.isSearchMode;

            if (hasScrollFlag || (hasNoteId && !isSearch)) {
                requestAnimationFrame(function () {
                    if (typeof window.scrollToRightColumn === 'function') {
                        window.scrollToRightColumn();
                    } else if (typeof scrollToRightColumn === 'function') {
                        scrollToRightColumn();
                    }
                    if (hasScrollFlag) {
                        urlParams.delete('scroll');
                        const newUrl = window.location.pathname + '?' + urlParams.toString();
                        window.history.replaceState({}, '', newUrl);
                    }
                });
            }
        }
    }

    /**
     * Mark that we should scroll to note on next page load (mobile only)
     * @param {Event} event - Click event
     */
    function handleNoteClick(event) {
        const isMobile = window.innerWidth <= 800;
        if (isMobile) {
            sessionStorage.setItem('shouldScrollToNote', 'true');
        }
    }

    /**
     * Initialize click handlers for note-related elements
     * Attaches handleNoteClick to all elements that load a note
     */
    window.initializeNoteClickHandlers = function () {
        const noteElements = document.querySelectorAll('a[href*="note="], .links_arbo_left, .note-title, .note-link');
        noteElements.forEach(function (element) {
            element.addEventListener('click', handleNoteClick);
        });
    };

})();

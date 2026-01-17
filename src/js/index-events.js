/**
 * Index Page Event Delegation
 * CSP-compliant event handlers for index.php toolbar and actions
 */

(function() {
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

    function closeTasklistActionsMenus() {
        const openMenus = document.querySelectorAll('.tasklist-actions-menu:not([hidden])');
        openMenus.forEach(menu => {
            menu.hidden = true;
            const btn = menu.parentElement?.querySelector('[data-action="toggle-tasklist-actions"]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    function toggleTasklistActionsMenu(noteId, triggerEl) {
        if (!noteId) return;

        const menu = document.getElementById(`tasklist-actions-menu-${noteId}`);
        if (!menu) return;

        const isHidden = menu.hasAttribute('hidden');
        closeTasklistActionsMenus();

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
            case 'toggle-create-menu':
                if (typeof toggleCreateMenu === 'function') {
                    toggleCreateMenu();
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
                document.execCommand('bold');
                break;
            case 'exec-italic':
                document.execCommand('italic');
                break;
            case 'exec-underline':
                document.execCommand('underline');
                break;
            case 'exec-strikethrough':
                document.execCommand('strikeThrough');
                break;
            case 'exec-unordered-list':
                document.execCommand('insertUnorderedList');
                break;
            case 'exec-ordered-list':
                document.execCommand('insertOrderedList');
                break;
            case 'exec-remove-format':
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
                    showMoveFolderDialog(noteId);
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
                    tasklistIds.forEach(function(id) {
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
                    markdownIds.forEach(function(id) {
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
    function trackAndProcessNotes() {
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
            noteEntries.forEach(function(entry) {
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
                    setTimeout(function() {
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

    // Initialize event delegation
    document.addEventListener('DOMContentLoaded', function() {
        document.addEventListener('click', handleIndexClick);
        document.addEventListener('focusin', handleIndexFocus);
        
        // Initialize page configuration first
        initializePageConfig();
        restoreFolderStates();
        
        // Initialize tasklists and markdown notes
        initializeTasklists();
        initializeMarkdownNotes();
        trackAndProcessNotes();
        checkForDrafts();
    });

    // ============================================================
    // Functions previously inline in index.php
    // ============================================================

    // Create menu functionality - opens unified modal
    window.toggleCreateMenu = function() {
        if (typeof showCreateModal === 'function') {
            showCreateModal();
        } else {
            console.error('showCreateModal function not available');
        }
    };

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        var menu = document.getElementById('header-create-menu');
        var plusBtn = document.querySelector('.sidebar-plus');
        if (menu && plusBtn && !plusBtn.contains(e.target) && !menu.contains(e.target)) {
            menu.remove();
            plusBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Task list creation function
    window.createTaskListNote = function() {
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
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success && data.note) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''));
                window.location.href = "index.php?workspace=" + ws + "&note=" + data.note.id + "&scroll=1";
            } else {
                showNotificationPopup(data.error || (window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list'), 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
        });
    };

    // Markdown note creation function
    window.createMarkdownNote = function() {
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
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success && data.note) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(window.selectedWorkspace || (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : ''));
                window.location.href = "index.php?workspace=" + ws + "&note=" + data.note.id + "&scroll=1";
            } else {
                showNotificationPopup(data.error || (window.t ? window.t('index.errors.create_markdown_note', null, 'Error creating markdown note') : 'Error creating markdown note'), 'error');
            }
        })
        .catch(function(error) {
            showNotificationPopup((window.t ? window.t('ui.alerts.network_error', null, 'Network error') : 'Network error') + ': ' + error.message, 'error');
        });
    };

    // Navigate to settings.php with current workspace and note parameters
    window.navigateToDisplayOrSettings = function(page) {
        var url = page;
        var params = [];

        if (window.selectedWorkspace) {
            params.push('workspace=' + encodeURIComponent(window.selectedWorkspace));
        }

        var urlParams = new URLSearchParams(window.location.search);
        var noteId = urlParams.get('note');
        if (noteId) {
            params.push('note=' + encodeURIComponent(noteId));
        }

        if (params.length > 0) {
            url += '?' + params.join('&');
        }

        window.location.href = url;
    };

    // Mobile navigation functionality
    window.scrollToRightColumn = function() {
        if (window.innerWidth < 800) {
            const scrollAmount = window.innerWidth;
            document.documentElement.scrollLeft = scrollAmount;
            document.body.scrollLeft = scrollAmount;
            window.scrollTo({
                left: scrollAmount,
                behavior: 'smooth'
            });
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

    window.scrollToLeftColumn = function() {
        if (window.innerWidth < 800) {
            document.documentElement.scrollLeft = 0;
            document.body.scrollLeft = 0;
            window.scrollTo({
                left: 0,
                behavior: 'smooth'
            });
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
    };

    // Auto-scroll to right column when a note is loaded on mobile
    function checkAndScrollToNote() {
        const isMobile = window.innerWidth <= 800;
        if (isMobile) {
            const urlParams = new URLSearchParams(window.location.search);
            const shouldScroll = urlParams.has('scroll') && urlParams.get('scroll') === '1';

            if (shouldScroll) {
                setTimeout(function() {
                    scrollToRightColumn();
                    urlParams.delete('scroll');
                    const newUrl = window.location.pathname + '?' + urlParams.toString();
                    window.history.replaceState({}, '', newUrl);
                }, 100);
            }
        }
    }

    // Auto-scroll to right column when clicking on any element that loads a note
    function handleNoteClick(event) {
        const isMobile = window.innerWidth <= 800;
        if (isMobile) {
            sessionStorage.setItem('shouldScrollToNote', 'true');
        }
    }

    // Add click listeners to all note-related elements
    window.initializeNoteClickHandlers = function() {
        const noteElements = document.querySelectorAll('a[href*="note="], .links_arbo_left, .note-title, .note-link');
        noteElements.forEach(function(element) {
            element.addEventListener('click', handleNoteClick);
        });
    };

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function() {
        initializeNoteClickHandlers();
        checkAndScrollToNote();

        // Initialize image click handlers for images in notes
        if (typeof reinitializeImageClickHandlers === 'function') {
            reinitializeImageClickHandlers();
        }
    });
})();

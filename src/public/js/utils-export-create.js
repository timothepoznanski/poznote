// Note export and the create menu for Poznote.
// 
// Exporting a note (HTML, Markdown, JSON, print) and the "+" menu that creates notes,
// task lists, diary entries, folders and workspaces.

// Function to download a note (handles markdown and HTML)
// Store current export note info
var currentExportNoteId = null;
var currentExportNoteType = null;
var currentExportFilename = null;

// Show export modal
function showExportModal(noteId, filename, title, noteType) {
    currentExportNoteId = noteId;
    currentExportNoteType = noteType;
    currentExportFilename = filename;

    var modal = document.getElementById('exportModal');
    if (modal) {
        // Show/hide options based on note type
        var markdownOption = modal.querySelector('.export-option-markdown');
        var htmlOption = modal.querySelector('.export-option-html');
        var htmlEmbeddedOption = modal.querySelector('.export-option-html-embedded');
        var jsonOption = modal.querySelector('.export-option-json');

        if (noteType === 'markdown') {
            // For markdown notes: allow MD export and HTML export
            if (markdownOption) markdownOption.style.display = 'flex';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'none';
        } else if (noteType === 'tasklist') {
            // For tasklist notes: allow MD export (checkbox format), HTML export and JSON export
            if (markdownOption) markdownOption.style.display = 'flex';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'flex';
        } else {
            // For other notes: show HTML options, hide MD and JSON options
            if (markdownOption) markdownOption.style.display = 'none';
            if (htmlOption) htmlOption.style.display = 'flex';
            if (htmlEmbeddedOption) htmlEmbeddedOption.style.display = 'flex';
            if (jsonOption) jsonOption.style.display = 'none';
        }

        modal.style.display = 'flex';
    }
}

// Select export type and execute
function selectExportType(type) {
    closeModal('exportModal');

    exportNoteAsFormat(currentExportNoteId, type, currentExportNoteType);
}

// Unified export function for HTML, Markdown, JSON formats
function exportNoteAsFormat(noteId, format, noteType) {
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) +
        '&type=' + encodeURIComponent(noteType) +
        '&format=' + encodeURIComponent(format);

    var link = document.createElement('a');
    link.href = apiUrl;
    link.download = '';  // Let the server set the filename via Content-Disposition
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export note using browser's native print dialog
function exportNoteToPrint(noteId, noteType) {
    // Open the export URL directly so relative assets resolve correctly,
    // and the printed content matches exactly what the HTML export generates.
    var apiUrl = 'api_export_note.php?id=' + encodeURIComponent(noteId) +
        '&type=' + encodeURIComponent(noteType) +
        '&format=html' +
        '&disposition=inline';

    var printWindow = window.open(apiUrl, '_blank', 'width=800,height=600');
    if (!printWindow) {
        alert('Please allow pop-ups to use the print feature.');
        return;
    }

    printWindow.onload = function () {
        setTimeout(function () {
            printWindow.print();
        }, 250);
    };
}

// Unified create functionality
var selectedCreateType = null;
var targetFolderId = null;
var targetFolderName = null;
var isCreatingInFolder = false;

/**
 * Open the create dropdown (#create-menu in modals.php).
 *
 * options:
 *   anchor      element to hang the menu off (the sidebar + button); when
 *               absent the menu is placed at options.x / options.y instead,
 *               which is what the folder actions entry uses.
 *   folderId    creating inside this folder rather than at the root
 *   folderName  its name, for the note-creation helpers
 *
 * Returns false when the menu is not on the page (secondary pages that include
 * neither modals.php nor these handlers).
 */
function openCreateMenu(options) {
    options = options || {};

    targetFolderId = options.folderId || null;
    targetFolderName = options.folderName || null;
    selectedCreateType = null;
    isCreatingInFolder = !!(targetFolderId || targetFolderName);

    var menu = document.getElementById('create-menu');
    if (!menu) return false;

    // Inside a folder the menu offers notes and a subfolder; a new folder or
    // workspace only makes sense from the sidebar button.
    var otherSection = document.getElementById('otherSection');
    var subfolderOption = document.getElementById('subfolderOption');
    if (otherSection) otherSection.style.display = isCreatingInFolder ? 'none' : 'block';
    if (subfolderOption) subfolderOption.style.display = isCreatingInFolder ? 'flex' : 'none';

    closeFolderActionsMenu();
    closeNoteActionsMenu();

    menu.classList.add('show');
    if (options.anchor) {
        adjustMenuPosition(menu, options.anchor);
    } else {
        positionMenuAtPoint(menu, options.x || 0, options.y || 0);
    }

    createMenuAnchor = options.anchor || null;

    // Registered on the next tick so the click that opened the menu does not
    // immediately close it again.
    setTimeout(function () {
        document.addEventListener('click', closeCreateMenuOnOutsideClick);
    }, 0);

    return true;
}

// The element the menu is hanging off, so a second click on it is left to that
// element's own handler (toggleCreateMenu closes the menu) instead of being
// treated as an outside click. Which of the two document listeners runs first
// is otherwise a matter of registration order, and getting it wrong would
// reopen the menu the button just closed.
var createMenuAnchor = null;

function closeCreateMenu() {
    var menu = document.getElementById('create-menu');
    if (menu) menu.classList.remove('show');
    createMenuAnchor = null;
    document.removeEventListener('click', closeCreateMenuOnOutsideClick);
}

function closeCreateMenuOnOutsideClick(event) {
    var menu = document.getElementById('create-menu');
    if (!menu || !menu.classList.contains('show')) {
        document.removeEventListener('click', closeCreateMenuOnOutsideClick);
        return;
    }
    // A click on an entry is handled by selectCreateType, which closes the menu
    // itself; anything else outside it just dismisses.
    if (!event.target.closest) return;
    if (createMenuAnchor && createMenuAnchor.contains(event.target)) {
        return;
    }
    if (!event.target.closest('#create-menu')) {
        closeCreateMenu();
    }
}

window.openCreateMenu = openCreateMenu;
window.closeCreateMenu = closeCreateMenu;

// Kept for the callers that predate the dropdown (the Kanban view's add-card
// button), which pass a folder but no anchor: the menu opens at the pointer.
function showCreateModal(folderId = null, folderName = null) {
    openCreateMenu({
        folderId: folderId,
        folderName: folderName,
        x: lastPointerX,
        y: lastPointerY
    });
}

// Legacy function for backwards compatibility
function showCreateNoteInFolderModal(folderId, folderName) {
    showCreateModal(folderId, folderName);
}

// Last pointer position, so a caller with no anchor still opens the menu where
// the user just clicked instead of in the top-left corner.
var lastPointerX = 0;
var lastPointerY = 0;
document.addEventListener('click', function (event) {
    if (typeof event.clientX === 'number' && (event.clientX || event.clientY)) {
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
    }
}, true);

function selectCreateType(createType) {
    selectedCreateType = createType;

    closeCreateMenu();

    // Create the selected item
    executeCreateAction();
}

// Legacy function for backwards compatibility
function selectNoteType(noteType) {
    selectCreateType(noteType);
}

function executeCreateAction() {
    if (!selectedCreateType) {
        return;
    }

    // Handle different creation types
    switch (selectedCreateType) {
        case 'html':
            createHtmlNote();
            break;
        case 'markdown':
            createMarkdownNoteInUtils();
            break;
        case 'list':
            createTaskListNoteInUtils();
            break;
        case 'folder':
            newFolder();
            break;
        case 'workspace':
            createWorkspace();
            break;
        case 'diary':
            createDiaryEntryForToday();
            break;
        case 'subfolder':
            if (targetFolderId) {
                var folderKey = 'folder_' + targetFolderId;
                if (typeof createSubfolder === 'function') {
                    createSubfolder(folderKey);
                } else {
                    console.error('createSubfolder function not found');
                }
            } else {
                console.error('No target folder ID for subfolder creation');
            }
            break;
        default:
            console.error('Unknown create type:', selectedCreateType);
    }
}

/**
 * Unified note creation function.
 * @param {string} noteType - The note type for the API ('note', 'tasklist', 'markdown').
 * @param {string[]} globalFnNames - Ordered list of global function names to try before falling back to the API.
 */
function createNoteOfType(noteType, globalFnNames) {
    if (typeof window.showNoteCreationLoading === 'function') {
        window.showNoteCreationLoading();
    }

    if (isCreatingInFolder && targetFolderId) {
        // Mark folder as open in localStorage to keep it open after page reload
        var folderDomId = 'folder-' + targetFolderId;
        localStorage.setItem('folder_' + folderDomId, 'open');

        var originalSelectedFolderId = selectedFolderId;
        var originalSelectedFolder = selectedFolder;
        selectedFolderId = targetFolderId;
        selectedFolder = targetFolderName;

        var created = false;
        for (var i = 0; i < globalFnNames.length; i++) {
            if (typeof window[globalFnNames[i]] === 'function') {
                window[globalFnNames[i]]();
                created = true;
                break;
            }
        }
        if (!created) {
            // Fallback to RESTful API
            fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: targetFolderId, workspace: selectedWorkspace, type: noteType })
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.success && data.note) {
                    // Mark note for auto-push since we created a note (if auto-push enabled)
                    if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }
                    if (typeof window.navigateToCreatedNoteInInternalTab === 'function') {
                        window.navigateToCreatedNoteInInternalTab(
                            data.note.id,
                            data.note.heading,
                            data.note.workspace || selectedWorkspace,
                            data.note.folder_id || targetFolderId
                        );
                    } else {
                        window.location.href = 'index.php?note=' + data.note.id;
                    }
                } else {
                    if (typeof window.hideNoteCreationLoading === 'function') {
                        window.hideNoteCreationLoading();
                    }
                    showNotificationPopup(data.error || data.message || 'Error creating note', 'error');
                }
            }).catch(function (error) {
                if (typeof window.hideNoteCreationLoading === 'function') {
                    window.hideNoteCreationLoading();
                }
                showNotificationPopup('Network error: ' + error.message, 'error');
            });
        }

        // Restore original folder
        selectedFolderId = originalSelectedFolderId;
        selectedFolder = originalSelectedFolder;
    } else {
        // Regular creation (not in specific folder)
        var created = false;
        for (var i = 0; i < globalFnNames.length; i++) {
            if (typeof window[globalFnNames[i]] === 'function') {
                window[globalFnNames[i]]();
                created = true;
                break;
            }
        }
        if (!created) {
            fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspace: selectedWorkspace, type: noteType })
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.success && data.note) {
                    // Mark note for auto-push since we created a note (if auto-push enabled)
                    if (window.POZNOTE_CONFIG?.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
                        window.setNeedsAutoPush(true);
                    }
                    if (typeof window.navigateToCreatedNoteInInternalTab === 'function') {
                        window.navigateToCreatedNoteInInternalTab(
                            data.note.id,
                            data.note.heading,
                            data.note.workspace || selectedWorkspace,
                            data.note.folder_id || null
                        );
                    } else {
                        window.location.href = 'index.php?note=' + data.note.id;
                    }
                } else {
                    if (typeof window.hideNoteCreationLoading === 'function') {
                        window.hideNoteCreationLoading();
                    }
                    showNotificationPopup(data.error || data.message || 'Error creating note', 'error');
                }
            }).catch(function (error) {
                if (typeof window.hideNoteCreationLoading === 'function') {
                    window.hideNoteCreationLoading();
                }
                showNotificationPopup('Network error: ' + error.message, 'error');
            });
        }
    }
}

/**
 * Open today's diary entry, creating it first when it does not exist yet.
 * Goes straight to the note: routing through diary.php?today=1 made the diary
 * board render for a moment before the note replaced it.
 * api/v1/calendar/diary-entry.php supplies the target folder, workspace, the
 * configured note type (see the diary_default_note_type setting) and the entry
 * title in the configured diary date format (diary_date_format).
 */
function createDiaryEntryForToday() {
    var diaryWs = window.selectedWorkspace || '';
    // Local date, so the entry matches the user's today rather than UTC's.
    var now = new Date();
    var today = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');

    var lookupUrl = 'api/v1/calendar/diary-entry.php?date=' + encodeURIComponent(today) +
        (diaryWs ? '&workspace=' + encodeURIComponent(diaryWs) : '');

    function openEntry(noteId, workspace) {
        var url = 'index.php?note=' + encodeURIComponent(noteId) + '&newtab=1';
        if (workspace) url += '&workspace=' + encodeURIComponent(workspace);
        window.location.href = url;
    }

    function fail(error) {
        if (typeof window.hideNoteCreationLoading === 'function') {
            window.hideNoteCreationLoading();
        }
        var message = (window.t ? window.t('diary.create_error', {}, 'Could not create the diary entry.')
            : 'Could not create the diary entry.');
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup(message + (error ? ' ' + error : ''), 'error');
        } else {
            window.alert(message);
        }
    }

    fetch(lookupUrl, { credentials: 'same-origin' })
        .then(function (response) { return response.json(); })
        .then(function (diary) {
            if (diary && diary.error) throw new Error(diary.error);

            if (diary.exists && diary.id) {
                openEntry(diary.id, diary.workspace || diaryWs);
                return null;
            }

            return fetch('api/v1/notes', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({
                    // The title follows the configured diary date format;
                    // created_date stays YYYY-MM-DD, as the API expects.
                    heading: diary.title || today,
                    folder_name: diary.folder,
                    workspace: diary.workspace,
                    type: diary.noteType === 'markdown' ? 'markdown' : 'note',
                    created_date: today
                })
            })
                .then(function (response) { return response.json(); })
                .then(function (result) {
                    if (result.success && result.note) {
                        openEntry(result.note.id, result.note.workspace || diary.workspace);
                    } else {
                        fail(result.error || result.message || '');
                    }
                });
        })
        .catch(function (error) { fail(error.message); });
}

function createHtmlNote() {
    createNoteOfType('note', ['newnote', 'createNewNote']);
}

function createTaskListNoteInUtils() {
    createNoteOfType('tasklist', ['createTaskListNote']);
}

function createMarkdownNoteInUtils() {
    createNoteOfType('markdown', ['createMarkdownNote']);
}

function createWorkspace() {
    // Same small modal as the sidebar workspace menu (js/workspaces-create.js), so
    // both entry points create a workspace the same way. Pages that do not
    // include modals.php fall back to the workspaces page.
    if (typeof window.openCreateWorkspaceModal === 'function') {
        window.openCreateWorkspaceModal();
        return;
    }

    if (typeof window.showNoteCreationLoading === 'function') {
        window.showNoteCreationLoading();
    }

    window.location = 'workspaces.php?new=1';
}

// Legacy function for backwards compatibility
function createNoteInFolder() {
    executeCreateAction();
}

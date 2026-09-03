// Drag & drop system for Poznote
// Handles file uploads, note movement between folders, note reordering
// (drop before/after another note) and folder reorganization

// Setup drag-and-drop handlers for file uploads
function setupDragDropEvents() {
    // Track drags that originate inside the page. Chrome exposes a dragged
    // <img> (e.g. an image already in a note) through dataTransfer.files, so
    // without this flag the file-upload drop handlers below would re-import
    // it as a new attachment and duplicate the image. OS file drags never
    // fire dragstart in-page, so the flag stays false for real imports.
    window.internalDragActive = false;
    document.addEventListener('dragstart', function () {
        window.internalDragActive = true;
    }, true);
    document.addEventListener('dragend', function () {
        window.internalDragActive = false;
    }, true);
    document.addEventListener('drop', function () {
        // Bubble handlers of this same drop still see the flag; clear after.
        setTimeout(function () {
            window.internalDragActive = false;
        }, 0);
    }, true);

    document.body.addEventListener('dragenter', function (e) {
        if (window.internalDragActive) return;
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                // Add visual feedback to show the drop target
                potential.classList.add('drag-over');
            }
        } catch (err) { }
    });

    document.body.addEventListener('dragover', function (e) {
        if (window.internalDragActive) return;
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
        } catch (err) { }
    });

    document.body.addEventListener('dragleave', function (e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (!potential) {
                // Remove visual feedback
                document.querySelectorAll('.noteentry.drag-over').forEach(function (note) {
                    note.classList.remove('drag-over');
                });
            }
        } catch (err) { }
    });

    document.body.addEventListener('drop', function (e) {
        if (window.internalDragActive) return;
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var note = el && el.closest ? el.closest('.noteentry') : null;

            if (!note && e.target && e.target.closest) {
                note = e.target.closest('.noteentry');
            }

            if (!note) return;

            e.preventDefault();
            e.stopPropagation();

            // Remove visual feedback
            note.classList.remove('drag-over');

            var dt = e.dataTransfer;
            if (!dt) return;

            if (dt.files && dt.files.length > 0) {
                handleImageFilesAndInsert(dt.files, note, { x: e.clientX, y: e.clientY });
            }
        } catch (err) {
        }
    });
}

function isPublicWorkspaceReadOnly() {
    return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
}

// True when the drag comes from outside the browser (OS files) rather than
// from a note/folder being moved inside the app. Those drops are handled by
// js/sidebar-file-import.js, so the folder handlers must ignore them.
function isExternalFileDrag(e) {
    if (window.currentDragData) return false;
    // Dragging an image already displayed in a note also advertises 'Files';
    // only drags that never fired an in-page dragstart are real OS file drags.
    if (window.internalDragActive) return false;
    if (!e.dataTransfer || !e.dataTransfer.types) return false;
    return Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1;
}

// Initialize drag-and-drop for notes between folders and workspace
function setupNoteDragDropEvents() {
    // Remove existing event listeners to avoid duplicates
    document.querySelectorAll('.links_arbo_left').forEach(function (link) {
        link.removeEventListener('dragstart', handleNoteDragStart);
        link.removeEventListener('dragend', handleNoteDragEnd);
    });

    document.querySelectorAll('.folder-header').forEach(function (header) {
        // Remove enhanced handlers
        header.removeEventListener('dragenter', handleFolderDragEnterEnhanced);
        header.removeEventListener('dragover', handleFolderDragOverEnhanced);
        header.removeEventListener('drop', handleFolderDropEnhanced);
        header.removeEventListener('dragleave', handleFolderDragLeaveEnhanced);
    });

    // Setup folder drag and drop
    setupFolderDragDropEvents();

    // Add drag events to all note links (both in folders and without folder)
    var noteLinks = document.querySelectorAll('.links_arbo_left');
    var isReadOnly = isPublicWorkspaceReadOnly();

    noteLinks.forEach(function (link, index) {
        var isMobile = window.innerWidth <= 800;

        // On mobile, disable HTML5 dragging on note links.
        // Draggable anchors can intermittently swallow taps (treated as scroll/drag),
        // which prevents the note open + horizontal scroll from triggering.
        if (isMobile || isReadOnly) {
            link.removeAttribute('draggable');
            link.draggable = false;
        } else {
            // Force draggable attribute both ways (desktop drag & drop)
            link.setAttribute('draggable', 'true');
            link.draggable = true;
        }

        // Remove existing event listeners if any
        link.removeEventListener('dragstart', handleNoteDragStart);
        link.removeEventListener('dragend', handleNoteDragEnd);

        // Add fresh event listeners (desktop only)
        if (!isMobile && !isReadOnly) {
            link.addEventListener('dragstart', handleNoteDragStart, false);
            link.addEventListener('dragend', handleNoteDragEnd, false);
        }

        // Handle click/tap events separately
        var dataOnclick = link.getAttribute('data-onclick') || link.getAttribute('onclick');
        if (dataOnclick) {
            link.removeAttribute('onclick'); // Remove to avoid conflicts

            // Centralized executor so we can call it from click and tap fallbacks
            function executeDataOnclick(evt) {
                try {
                    // Ensure mobile scroll flag is set even if other listeners were canceled
                    if (window.innerWidth <= 800 && typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem('shouldScrollToNote', 'true');
                    }

                    var func = new Function('event', dataOnclick);
                    func.call(link, evt);
                } catch (err) {
                    console.error('Error executing click handler:', err);
                }
            }

            // Robust mobile tap fallback:
            // Some mobile browsers cancel the click if a tiny scroll/drag is detected,
            // so we also trigger on pointerup for touch pointers with a small movement threshold.
            if (isMobile) {
                var tapState = {
                    active: false,
                    startX: 0,
                    startY: 0,
                    startT: 0,
                    moved: false,
                    pointerId: null
                };

                // Avoid duplicate loads: if tap fallback fires, ignore the subsequent click.
                function markTapFired() {
                    link.dataset.tapFired = '1';
                    setTimeout(function () {
                        try { delete link.dataset.tapFired; } catch (e) { link.dataset.tapFired = ''; }
                    }, 500);
                }

                link.addEventListener('pointerdown', function (e) {
                    if (e.pointerType !== 'touch') return;
                    tapState.active = true;
                    tapState.moved = false;
                    tapState.startX = e.clientX;
                    tapState.startY = e.clientY;
                    tapState.startT = Date.now();
                    tapState.pointerId = e.pointerId;
                }, { passive: true });

                link.addEventListener('pointermove', function (e) {
                    if (!tapState.active) return;
                    if (e.pointerType !== 'touch') return;
                    // If finger moved more than ~10px, treat it as scroll/drag
                    var dx = Math.abs(e.clientX - tapState.startX);
                    var dy = Math.abs(e.clientY - tapState.startY);
                    if (dx > 10 || dy > 10) {
                        tapState.moved = true;
                    }
                }, { passive: true });

                link.addEventListener('pointerup', function (e) {
                    if (!tapState.active) return;
                    if (e.pointerType !== 'touch') return;
                    if (tapState.pointerId !== null && e.pointerId !== tapState.pointerId) return;

                    var dt = Date.now() - tapState.startT;
                    var shouldTrigger = !tapState.moved && dt < 700; // ignore long-press / scroll

                    tapState.active = false;
                    tapState.pointerId = null;

                    if (!shouldTrigger) return;

                    // Prevent navigation and execute note load
                    if (e.cancelable) e.preventDefault();
                    e.stopPropagation();

                    markTapFired();
                    executeDataOnclick(e);
                }, false);

                link.addEventListener('pointercancel', function () {
                    tapState.active = false;
                    tapState.pointerId = null;
                }, false);
            }

            link.addEventListener('click', function (e) {
                // If mobile tap fallback already handled this interaction, ignore click.
                if (link.dataset && link.dataset.tapFired === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }

                // Prevent default link behavior to avoid page reload
                e.preventDefault();
                e.stopPropagation();

                // On mobile, execute immediately without delay for better responsiveness
                if (isMobile) {
                    // Execute immediately on mobile
                    executeDataOnclick(e);
                } else {
                    // Small delay on desktop to distinguish from drag
                    setTimeout(function () {
                        executeDataOnclick(e);
                    }, 50);
                }

                // Always return false to ensure default behavior is prevented
                return false;
            }, false);
        }
    });

    if (isReadOnly) {
        return;
    }

    // Add drop events to folder headers (using enhanced handlers for folder+note support)
    var folderHeaders = document.querySelectorAll('.folder-header');
    folderHeaders.forEach(function (header) {
        header.addEventListener('dragenter', handleFolderDragEnterEnhanced);
        header.addEventListener('dragover', handleFolderDragOverEnhanced);
        header.addEventListener('drop', handleFolderDropEnhanced);
        header.addEventListener('dragleave', handleFolderDragLeaveEnhanced);
    });

    // Note rows are drop targets too: a note dropped on the top half of a row
    // lands before it, on the bottom half after it (manual ordering, persisted
    // by /api/v1/notes/reorder). The wrapper is the target so the indicator
    // line spans the title and the actions button alike.
    document.querySelectorAll('.note-list-item').forEach(function (item) {
        item.removeEventListener('dragover', handleNoteReorderDragOver);
        item.removeEventListener('dragleave', handleNoteReorderDragLeave);
        item.removeEventListener('drop', handleNoteReorderDrop);
        item.addEventListener('dragover', handleNoteReorderDragOver);
        item.addEventListener('dragleave', handleNoteReorderDragLeave);
        item.addEventListener('drop', handleNoteReorderDrop);
    });

    // Add global drop handler for dropping outside folders (move to no folder or move folder to root)
    var notesListContainer = document.querySelector('.notes_list, #notes-list, body');
    if (notesListContainer) {
        notesListContainer.addEventListener('dragover', function (e) {
            // Check if we're not over a folder header
            var isOverFolder = e.target.closest('.folder-header');
            if (!isOverFolder && window.currentDragData) {
                // Root note over the root area: position change among root
                // notes (rows themselves are handled by handleNoteReorderDragOver)
                if (isRootNoteDragOverRoot(window.currentDragData, e.target)) {
                    var nearestRoot = findNearestRootNoteRowForDrop(e, window.currentDragData);
                    if (nearestRoot) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        applyNoteDropIndicator(nearestRoot.item, nearestRoot.position);
                    } else {
                        clearNoteDropIndicators(null);
                    }
                    return;
                }
                // For notes: allow drop if note is in a folder
                if (window.currentDragData.currentFolderId) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
                // For folders: allow drop to move to root (only for subfolders)
                if (window.currentDragData.type === 'folder') {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }
        });

        notesListContainer.addEventListener('drop', function (e) {
            // Check if we're not over a folder header
            var isOverFolder = e.target.closest('.folder-header');
            if (!isOverFolder && window.currentDragData) {
                // Root note dropped in the root area: reorder beside the nearest row
                if (isRootNoteDragOverRoot(window.currentDragData, e.target)) {
                    var nearestRootRow = findNearestRootNoteRowForDrop(e, window.currentDragData);
                    clearNoteDropIndicators(null);
                    if (nearestRootRow) {
                        e.preventDefault();
                        cleanupDraggingNotes();
                        reorderNoteBesideTarget(window.currentDragData.noteId, nearestRootRow.noteId, nearestRootRow.position);
                    }
                    return;
                }
                // Handle note drop to root
                if (window.currentDragData.noteId && window.currentDragData.currentFolderId) {
                    e.preventDefault();
                    moveNoteToRoot(window.currentDragData.noteId);
                }
                // Handle folder drop to root
                if (window.currentDragData.type === 'folder' && window.currentDragData.folderId) {
                    e.preventDefault();
                    moveFolderToRoot(window.currentDragData.folderId);
                }
            }
        });
    }

    // Add drop events to root drop zone
    var rootDropZone = document.getElementById('root-drop-zone');

    if (rootDropZone) {
        // Remove existing listeners first
        rootDropZone.removeEventListener('dragover', handleRootDragOver);
        rootDropZone.removeEventListener('drop', handleRootDrop);
        rootDropZone.removeEventListener('dragleave', handleRootDragLeave);

        // Add new listeners
        rootDropZone.addEventListener('dragover', handleRootDragOver);
        rootDropZone.addEventListener('drop', handleRootDrop);
        rootDropZone.addEventListener('dragleave', handleRootDragLeave);
    }
}

// Handle start of note drag operation
function handleNoteDragStart(e) {
    if (isPublicWorkspaceReadOnly()) {
        e.preventDefault();
        return;
    }

    var noteLink = e.target.closest('.links_arbo_left');
    if (!noteLink) {
        return;
    }

    // Stop propagation to prevent the folder-toggle from also starting a drag
    e.stopPropagation();

    var noteId = noteLink.getAttribute('data-note-db-id');
    var currentFolder = noteLink.getAttribute('data-folder');
    var currentFolderId = noteLink.getAttribute('data-folder-id');

    if (noteId) {
        var dragData = {
            noteId: noteId,
            currentFolder: currentFolder || null,
            currentFolderId: currentFolderId || null
        };

        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'move';

        // Store drag data globally for mouseup fallback
        window.currentDragData = dragData;

        // Create a custom drag image with styles already applied
        var dragImage = noteLink.cloneNode(true);
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.opacity = '0.85';
        dragImage.style.backgroundColor = 'rgba(0, 123, 255, 0.08)';
        dragImage.style.border = '1px solid rgba(0, 123, 255, 0.3)';
        dragImage.style.transform = 'scale(1.02)';
        dragImage.style.padding = '10px';
        dragImage.style.borderRadius = '4px';
        dragImage.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.15)';
        dragImage.style.width = noteLink.offsetWidth + 'px';
        dragImage.style.height = noteLink.offsetHeight + 'px';
        document.body.appendChild(dragImage);

        // Set the custom drag image
        try {
            e.dataTransfer.setDragImage(dragImage, 50, 20);
        } catch (err) {
            // Silently fail if browser doesn't support custom drag images
        }

        // Remove the drag image after a short delay
        setTimeout(function () {
            if (dragImage && dragImage.parentNode) {
                dragImage.parentNode.removeChild(dragImage);
            }
        }, 0);

        // Add visual feedback (styles in modules/drag-drop.css .dragging)
        noteLink.classList.add('dragging');
        noteLink.setAttribute('data-dragging', 'true');

        // Add visual feedback to the source folder
        var sourceFolderHeader = noteLink.closest('.folder-content');
        if (sourceFolderHeader) {
            var parentFolderHeader = sourceFolderHeader.previousElementSibling;
            if (parentFolderHeader && parentFolderHeader.classList.contains('folder-toggle')) {
                var folderHeaderContainer = parentFolderHeader.parentElement;
                if (folderHeaderContainer && folderHeaderContainer.classList.contains('folder-header')) {
                    folderHeaderContainer.classList.add('folder-source-drag');
                }
            }
        }
    }
}

// Remove dragging visual indicators from notes and folders
function cleanupDraggingNotes() {
    document.querySelectorAll('.links_arbo_left.dragging').forEach(function (link) {
        link.classList.remove('dragging');
        link.removeAttribute('data-dragging');
        link.style.cssText = '';
    });
    // Remove source folder visual feedback
    document.querySelectorAll('.folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('folder-source-drag');
    });
}

// Handle end of note drag operation and cleanup
function handleNoteDragEnd(e) {
    clearFolderDragExpandTimer();

    // Clean up the dragged note styles
    var noteLink = e.target.closest('.links_arbo_left');
    if (noteLink) {
        noteLink.classList.remove('dragging');
        noteLink.removeAttribute('data-dragging');
    }
    cleanupDraggingNotes();

    // Remove drag-over class from all folders
    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target, .folder-header.folder-drop-before, .folder-header.folder-drop-after, .folder-header.folder-drop-inside, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-drop-before');
        header.classList.remove('folder-drop-after');
        header.classList.remove('folder-drop-inside');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
        if (header.dataset && header.dataset.folderDropPosition) {
            delete header.dataset.folderDropPosition;
        }
    });
    clearNoteDropIndicators(null);

    // Clean up global drag data and hide drop zone after a longer delay.
    // Only clear the data of THIS drag: a new drag started within the delay
    // must keep its own data, or its handlers lose track of it mid-drag.
    var finishedDragData = window.currentDragData;
    setTimeout(function () {
        if (window.currentDragData && window.currentDragData === finishedDragData) {
            window.currentDragData = null;
        }

        // Hide root drop zone
        var rootDropZone = document.getElementById('root-drop-zone');
        if (rootDropZone && getComputedStyle(rootDropZone).display !== 'none') {
            rootDropZone.classList.remove('drag-over');
            rootDropZone.className = 'root-drop-zone'; // Reset to original class
            rootDropZone.style.cssText = 'display: none;'; // Reset styles
        }
    }, 2000); // Much longer delay to allow for click interaction
}

// Move a note to a target folder using API
function moveNoteToTargetFolder(noteId, targetFolderIdOrName) {
    // targetFolderIdOrName can be either a folder ID (preferred) or folder name (legacy)
    var targetFolderId = null;
    var targetFolder = null;

    // Check if it's a numeric ID
    if (targetFolderIdOrName && !isNaN(targetFolderIdOrName)) {
        targetFolderId = parseInt(targetFolderIdOrName);
    } else if (targetFolderIdOrName && window.folderMap) {
        // Legacy: it's a folder name, try to find the ID
        targetFolder = targetFolderIdOrName;
        for (var fid in window.folderMap) {
            if (window.folderMap[fid] === targetFolder) {
                targetFolderId = parseInt(fid);
                break;
            }
        }
    }

    var targetWorkspace = selectedWorkspace || getSelectedWorkspace();
    var noteBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.noteState(noteId) : null;

    apiPostJson(
        '/api/v1/notes/' + noteId + '/folder',
        { folder_id: targetFolderId || '', workspace: targetWorkspace },
        function (data) {
            recordNoteMoveForUndo(noteId, noteBefore, targetFolderId || null, targetWorkspace);
            refreshSidebarAfterMove(data);
        },
        'Error moving note: '
    );
}

// Undo support (js/tree-undo-clipboard.js): remember where the note came from
function recordNoteMoveForUndo(noteId, noteBefore, targetFolderId, targetWorkspace) {
    if (!window.PoznoteTreeHistory || !noteBefore) return;
    window.PoznoteTreeHistory.record({
        type: 'note-move',
        noteId: String(noteId),
        from: { folderId: noteBefore.folderId, workspace: noteBefore.workspace },
        to: { folderId: targetFolderId ? String(targetFolderId) : null, workspace: targetWorkspace }
    });
}

// Same for a folder: parent and neighbours before the move, destination after
function recordFolderMoveForUndo(folderId, folderBefore, to) {
    if (!window.PoznoteTreeHistory || !folderBefore) return;
    window.PoznoteTreeHistory.record({
        type: 'folder-move',
        folderId: String(folderId),
        from: {
            parentId: folderBefore.parentId,
            workspace: folderBefore.workspace,
            prevSiblingId: folderBefore.prevSiblingId,
            nextSiblingId: folderBefore.nextSiblingId
        },
        to: to
    });
}

// Handle dragover event for root drop zone
function handleRootDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.add('drag-over');
        rootDropZone.style.display = 'block';
    }
}

// Handle dragleave event for root drop zone
function handleRootDragLeave(e) {
    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.remove('drag-over');
    }
}

// Handle drop event for root zone (move note out of folder)
function handleRootDrop(e) {
    e.preventDefault();

    var rootDropZone = document.getElementById('root-drop-zone');
    if (rootDropZone) {
        rootDropZone.classList.remove('drag-over');
        rootDropZone.className = 'root-drop-zone';
        rootDropZone.style.cssText = 'display: none;';
    }

    // Remove dragging class from all notes
    cleanupDraggingNotes();

    try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));

        // Only proceed if note is currently in a folder (not already in root)
        if (data.noteId && data.currentFolderId) {
            moveNoteToRoot(data.noteId);
        }
    } catch (err) {
        console.error('Error handling root drop:', err);
    }
}

// ---- Note reordering (drop before/after another note) ----

// Row that can anchor a reorder: a real note row (favorite folder shortcuts
// have no note id) outside the Favorites / Tags / Public pseudo-folders,
// whose contents mirror notes living elsewhere.
function getNoteReorderTarget(item) {
    if (!item || !item.querySelector) return null;
    if (item.closest('.folder-header.system-folder')) return null;
    var link = item.querySelector('a.links_arbo_left[data-note-db-id]');
    if (!link) return null;
    var noteId = link.getAttribute('data-note-db-id');
    if (!noteId) return null;
    return { link: link, noteId: String(noteId) };
}

function getNoteDropPosition(e, item) {
    var rect = item.getBoundingClientRect();
    var ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    return ratio < 0.5 ? 'before' : 'after';
}

function clearNoteDropIndicators(activeItem) {
    document.querySelectorAll('.note-list-item.note-drop-before, .note-list-item.note-drop-after').forEach(function (row) {
        if (row === activeItem) return;
        row.classList.remove('note-drop-before');
        row.classList.remove('note-drop-after');
    });
}

// The row sits inside its folder's .folder-header, whose dragenter handler
// highlights the folder as an "inside" target. While a note row is the
// target, that highlight (and the auto-expand timer) must go, on every
// enclosing folder for nested ones.
function clearEnclosingFolderDropIndicators(item) {
    var header = item.closest('.folder-header');
    while (header) {
        clearFolderDropIndicator(header);
        header = header.parentElement ? header.parentElement.closest('.folder-header') : null;
    }
}

// True while a note is dragged over the folder it already lives in. Such a
// drag can only change the note's position, never its folder, so the folder
// handlers must not offer "move into this folder".
function isNoteDragInOwnFolder(dragData, folderHeader) {
    if (!dragData || dragData.type === 'folder' || !dragData.noteId || !folderHeader) return false;
    if (folderHeader.classList.contains('system-folder')) return false;
    var targetFolderId = folderHeader.getAttribute('data-folder-id') || '';
    var currentFolderId = dragData.currentFolderId ? String(dragData.currentFolderId) : '';
    return currentFolderId !== '' && currentFolderId === String(targetFolderId);
}

// Nearest note row of a folder for a pointer that is over the folder's
// content but not over a row itself (gaps between rows, padding). Returns
// {item, noteId, position} or null when the pointer is on the folder toggle
// or the folder has no other note.
function findNearestNoteRowForDrop(e, folderHeader, dragData) {
    var toggle = getFolderToggleElement(folderHeader);
    if (toggle) {
        var toggleRect = toggle.getBoundingClientRect();
        if (e.clientY <= toggleRect.bottom) return null;
    }
    var content = getDirectFolderContentElement(folderHeader);
    if (!content) return null;

    var best = null;
    content.querySelectorAll(':scope > .note-list-item').forEach(function (item) {
        var target = getNoteReorderTarget(item);
        if (!target || target.noteId === String(dragData.noteId)) return;
        var rect = item.getBoundingClientRect();
        var distance, position;
        if (e.clientY < rect.top) {
            distance = rect.top - e.clientY;
            position = 'before';
        } else if (e.clientY > rect.bottom) {
            distance = e.clientY - rect.bottom;
            position = 'after';
        } else {
            distance = 0;
            position = getNoteDropPosition(e, item);
        }
        if (!best || distance < best.distance) {
            best = { item: item, noteId: target.noteId, position: position, distance: distance };
        }
    });
    return best;
}

function applyNoteDropIndicator(item, position) {
    clearNoteDropIndicators(item);
    item.classList.toggle('note-drop-before', position === 'before');
    item.classList.toggle('note-drop-after', position === 'after');
}

function handleNoteReorderDragOver(e) {
    if (isExternalFileDrag(e)) return;

    var dragData = window.currentDragData;
    // Folders dropped on a note row fall through to the folder-header
    // handlers (drop "inside" that folder)
    if (!dragData || dragData.type === 'folder' || !dragData.noteId) return;

    var item = e.currentTarget;
    var target = getNoteReorderTarget(item);
    if (!target || target.noteId === String(dragData.noteId)) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    applyNoteDropIndicator(item, getNoteDropPosition(e, item));
    clearEnclosingFolderDropIndicators(item);
}

function handleNoteReorderDragLeave(e) {
    var item = e.currentTarget;
    if (e.relatedTarget && item.contains(e.relatedTarget)) return;
    // Inside the note's own folder (or among root notes) the surrounding
    // dragover handlers re-place the indicator on the nearest row at once;
    // clearing here first only makes it flicker.
    var dragData = window.currentDragData;
    if (dragData && (isNoteDragInOwnFolder(dragData, item.closest('.folder-header')) || isRootNoteDragOverRoot(dragData, item))) {
        return;
    }
    item.classList.remove('note-drop-before');
    item.classList.remove('note-drop-after');
}

// True while a root note (no folder) is dragged over the root area of the
// list, outside any folder: only its position among root notes can change.
function isRootNoteDragOverRoot(dragData, element) {
    if (!dragData || dragData.type === 'folder' || !dragData.noteId || dragData.currentFolderId) return false;
    if (!element || !element.closest) return false;
    if (element.closest('.folder-header')) return false;
    return !!element.closest('.notes-list-scrollable-content');
}

// Nearest root note row for a pointer over the root area (gaps between
// rows, padding). Same contract as findNearestNoteRowForDrop.
function findNearestRootNoteRowForDrop(e, dragData) {
    var best = null;
    document.querySelectorAll('.note-list-item').forEach(function (item) {
        if (item.closest('.folder-header')) return;
        var target = getNoteReorderTarget(item);
        if (!target || target.noteId === String(dragData.noteId)) return;
        var rect = item.getBoundingClientRect();
        var distance, position;
        if (e.clientY < rect.top) {
            distance = rect.top - e.clientY;
            position = 'before';
        } else if (e.clientY > rect.bottom) {
            distance = e.clientY - rect.bottom;
            position = 'after';
        } else {
            distance = 0;
            position = getNoteDropPosition(e, item);
        }
        if (!best || distance < best.distance) {
            best = { item: item, noteId: target.noteId, position: position, distance: distance };
        }
    });
    return best;
}

function handleNoteReorderDrop(e) {
    if (isExternalFileDrag(e)) return;

    var item = e.currentTarget;
    item.classList.remove('note-drop-before');
    item.classList.remove('note-drop-after');

    var data = null;
    try {
        data = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch (err) {
        data = window.currentDragData;
    }
    if (!data || data.type === 'folder' || !data.noteId) return;

    var target = getNoteReorderTarget(item);
    if (!target || target.noteId === String(data.noteId)) return;

    e.preventDefault();
    e.stopPropagation();
    cleanupDraggingNotes();

    reorderNoteBesideTarget(data.noteId, target.noteId, getNoteDropPosition(e, item));
}

// Real (non Favorites) row of a note in the list, or null
function findNoteRowElement(noteId) {
    var links = document.querySelectorAll('.note-list-item > a.links_arbo_left[data-note-db-id="' + String(noteId) + '"]');
    for (var i = 0; i < links.length; i++) {
        var row = links[i].parentElement;
        if (row && !row.closest('.folder-header.system-folder')) {
            return row;
        }
    }
    return null;
}

// Move a note row next to a target row in the DOM right away (with its
// spacer), when both are siblings of the same container. Returns true when
// the DOM was updated, so the caller can skip the full list refresh.
function moveNoteRowInDom(noteId, targetNoteId, position) {
    var dragRow = findNoteRowElement(noteId);
    var targetRow = findNoteRowElement(targetNoteId);
    if (!dragRow || !targetRow || dragRow === targetRow) return false;
    var parent = dragRow.parentElement;
    if (!parent || parent !== targetRow.parentElement) return false;

    var spacer = dragRow.nextElementSibling;
    if (!spacer || spacer.id !== 'pxbetweennotes') spacer = null;

    var reference;
    if (position === 'before') {
        reference = targetRow;
    } else {
        reference = targetRow.nextElementSibling;
        if (reference && reference.id === 'pxbetweennotes') {
            reference = reference.nextElementSibling;
        }
    }
    if (reference === dragRow || (spacer && reference === spacer)) return true;

    parent.insertBefore(dragRow, reference);
    if (spacer) {
        parent.insertBefore(spacer, dragRow.nextSibling);
    }

    // The container now follows the manual sort (the server sets it too)
    var header = dragRow.closest('.folder-header');
    if (header) {
        header.setAttribute('data-sort-setting', 'manual');
        var folderId = header.getAttribute('data-folder-id');
        var toggle = folderId ? header.querySelector('.folder-actions-toggle[data-folder-id="' + folderId + '"]') : null;
        if (toggle) toggle.setAttribute('data-current-sort', 'manual');
    }
    return true;
}

// Move a note before or after a target note and persist sibling order. The
// server switches the target's folder (or the global default for root notes)
// to the manual sort so the position sticks. Between siblings the row moves
// in the DOM immediately and the list is only reloaded on failure; across
// folders the list is reloaded once the server confirms.
function reorderNoteBesideTarget(noteId, targetNoteId, position) {
    var movedInDom = moveNoteRowInDom(noteId, targetNoteId, position);

    fetch('/api/v1/notes/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            workspace: selectedWorkspace || getSelectedWorkspace(),
            note_id: noteId,
            target_note_id: targetNoteId,
            position: position
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data && data.success) {
                if (!movedInDom) {
                    refreshSidebarAfterMove(data);
                }
            } else {
                var err = (data && (data.error || data.message)) || 'Unknown error';
                showNotificationPopup('Error reordering note: ' + err, 'error');
                refreshSidebarAfterMove(null);
            }
        })
        .catch(function (error) {
            showNotificationPopup('Error reordering note: ' + error.message, 'error');
            refreshSidebarAfterMove(null);
        });
}

// Remove a note from its folder (move to root)
function moveNoteToRoot(noteId) {
    var targetWorkspace = selectedWorkspace || getSelectedWorkspace();
    var noteBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.noteState(noteId) : null;

    apiPostJson(
        '/api/v1/notes/' + noteId + '/remove-folder',
        { workspace: targetWorkspace },
        function (data) {
            recordNoteMoveForUndo(noteId, noteBefore, null, targetWorkspace);
            refreshSidebarAfterMove(data);
        },
        'Error removing note from folder: '
    );
}

// Setup drag and drop events for folders. Called from setupNoteDragDropEvents to initialize folder dragging
function setupFolderDragDropEvents() {
    var isMobile = window.innerWidth <= 800;
    var isReadOnly = isPublicWorkspaceReadOnly();

    // Get all folder toggle elements (excluding system folders)
    // We target folder-toggle instead of folder-header to avoid capturing note drag events
    var folderToggles = document.querySelectorAll('.folder-header:not(.system-folder) > .folder-toggle');

    folderToggles.forEach(function (toggle) {
        // Remove existing listeners
        toggle.removeEventListener('dragstart', handleFolderDragStart);
        toggle.removeEventListener('dragend', handleFolderDragEnd);

        if (!isMobile && !isReadOnly) {
            // Ensure draggable is set
            toggle.setAttribute('draggable', 'true');
            toggle.draggable = true;

            // Add drag event listeners
            toggle.addEventListener('dragstart', handleFolderDragStart, false);
            toggle.addEventListener('dragend', handleFolderDragEnd, false);
        } else {
            // Disable dragging on mobile
            toggle.removeAttribute('draggable');
            toggle.draggable = false;
        }
    });
}

// Handle folder drag start
function handleFolderDragStart(e) {
    if (isPublicWorkspaceReadOnly()) {
        e.preventDefault();
        return;
    }

    // Get the folder-toggle element (the draggable element)
    var folderToggle = e.target.closest('.folder-toggle');
    var folderHeader = e.target.closest('.folder-header');
    if (!folderToggle || !folderHeader) {
        return;
    }

    // Don't allow dragging system folders
    if (folderHeader.classList.contains('system-folder')) {
        e.preventDefault();
        return;
    }

    // Get folder data from folder-toggle first, then fallback to folder-header
    var folderId = folderToggle.getAttribute('data-folder-id') || folderHeader.getAttribute('data-folder-id');
    var folderName = folderToggle.getAttribute('data-folder') || folderHeader.getAttribute('data-folder');

    if (!folderId) {
        return;
    }

    var dragData = {
        type: 'folder',
        folderId: folderId,
        folderName: folderName || ''
    };

    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';

    // Store drag data globally for fallback
    window.currentDragData = dragData;

    // Create a custom drag image
    var dragImage = document.createElement('div');
    dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 10px 15px; background: rgba(0, 123, 255, 0.15); border: 2px solid rgba(0, 123, 255, 0.4); border-radius: 8px; font-weight: 500; color: #007bff; display: flex; align-items: center; gap: 8px;';
    dragImage.innerHTML = '<i class="lucide lucide-folder"></i> ' + (folderName || 'Folder');
    document.body.appendChild(dragImage);

    try {
        e.dataTransfer.setDragImage(dragImage, 50, 20);
    } catch (err) {
        // Silently fail if browser doesn't support custom drag images
    }

    // Remove the drag image after a short delay
    setTimeout(function () {
        if (dragImage && dragImage.parentNode) {
            dragImage.parentNode.removeChild(dragImage);
        }
    }, 0);

    // Add visual feedback (styles in modules/drag-drop.css .folder-dragging)
    folderToggle.classList.add('folder-dragging');
    folderHeader.classList.add('folder-source-drag');
}

// Handle folder drag end
function handleFolderDragEnd(e) {
    clearFolderDragExpandTimer();

    var folderToggle = e.target.closest('.folder-toggle');
    var folderHeader = e.target.closest('.folder-header');

    // Clean up styles on folder-toggle (the draggable element)
    if (folderToggle) {
        folderToggle.classList.remove('folder-dragging');
        folderToggle.style.opacity = '';
        folderToggle.style.backgroundColor = '';
        folderToggle.style.border = '';
        folderToggle.style.transform = '';
    }
    // Also clean up folder-header styles if any were applied
    if (folderHeader) {
        folderHeader.classList.remove('folder-dragging');
        folderHeader.classList.remove('folder-source-drag');
        folderHeader.style.opacity = '';
        folderHeader.style.backgroundColor = '';
        folderHeader.style.border = '';
        folderHeader.style.transform = '';
    }

    // Clean up all folder drag-over states
    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target, .folder-header.folder-drop-before, .folder-header.folder-drop-after, .folder-header.folder-drop-inside, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-drop-before');
        header.classList.remove('folder-drop-after');
        header.classList.remove('folder-drop-inside');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
        if (header.dataset && header.dataset.folderDropPosition) {
            delete header.dataset.folderDropPosition;
        }
    });

    // Clean up global drag data (only this drag's, see handleNoteDragEnd)
    var finishedFolderDrag = window.currentDragData;
    setTimeout(function () {
        if (window.currentDragData && window.currentDragData === finishedFolderDrag) {
            window.currentDragData = null;
        }
    }, 100);
}

var folderDragExpandTimer = null;
var folderDragExpandTarget = null;
var FOLDER_DRAG_EXPAND_DELAY = 550;

function getFolderToggleElement(folderHeader) {
    if (!folderHeader || !folderHeader.children) return null;
    for (var i = 0; i < folderHeader.children.length; i++) {
        if (folderHeader.children[i].classList && folderHeader.children[i].classList.contains('folder-toggle')) {
            return folderHeader.children[i];
        }
    }
    return folderHeader.querySelector ? folderHeader.querySelector('.folder-toggle') : null;
}

function getDirectFolderContentElement(folderHeader) {
    if (!folderHeader || !folderHeader.children) return null;
    for (var i = 0; i < folderHeader.children.length; i++) {
        if (folderHeader.children[i].classList && folderHeader.children[i].classList.contains('folder-content')) {
            return folderHeader.children[i];
        }
    }
    return null;
}

function clearFolderDragExpandTimer(folderHeader) {
    if (folderHeader && folderDragExpandTarget !== folderHeader) return;

    if (folderDragExpandTimer) {
        clearTimeout(folderDragExpandTimer);
    }

    folderDragExpandTimer = null;
    folderDragExpandTarget = null;
}

function isFolderContentOpenForDrag(content) {
    if (!content) return false;
    if (typeof isFolderContentOpen === 'function') {
        return isFolderContentOpen(content);
    }

    var display = content.style.display || window.getComputedStyle(content).display;
    return display !== 'none';
}

function openFolderHeaderForDrag(folderHeader) {
    var content = getDirectFolderContentElement(folderHeader);
    if (!content || isFolderContentOpenForDrag(content)) return;

    if (typeof setFolderOpenState === 'function') {
        setFolderOpenState(content.id, true);
    } else {
        content.style.display = 'block';
        try {
            localStorage.setItem('folder_' + content.id, 'open');
        } catch (err) { }
    }

    if (typeof updateToggleAllFoldersButton === 'function') {
        updateToggleAllFoldersButton();
    }
}

function scheduleFolderDragExpand(folderHeader, dragData, dropPosition) {
    if (!folderHeader || !dragData) {
        clearFolderDragExpandTimer();
        return;
    }

    var targetFolder = folderHeader.getAttribute('data-folder');
    if (targetFolder === 'Tags' || targetFolder === 'Public' || targetFolder === 'Trash') {
        clearFolderDragExpandTimer(folderHeader);
        return;
    }

    if (dragData.type === 'folder' && dropPosition && dropPosition !== 'inside') {
        clearFolderDragExpandTimer(folderHeader);
        return;
    }

    var content = getDirectFolderContentElement(folderHeader);
    if (!content || isFolderContentOpenForDrag(content)) {
        clearFolderDragExpandTimer(folderHeader);
        return;
    }

    if (folderDragExpandTimer && folderDragExpandTarget === folderHeader) {
        return;
    }

    clearFolderDragExpandTimer();
    folderDragExpandTarget = folderHeader;
    folderDragExpandTimer = setTimeout(function () {
        var targetHeader = folderDragExpandTarget;
        folderDragExpandTimer = null;
        folderDragExpandTarget = null;

        if (!targetHeader || !document.body.contains(targetHeader) || !window.currentDragData) {
            return;
        }

        if (window.currentDragData.type === 'folder') {
            var currentDropPosition = targetHeader.dataset ? (targetHeader.dataset.folderDropPosition || 'inside') : 'inside';
            if (currentDropPosition !== 'inside') {
                return;
            }
        }

        openFolderHeaderForDrag(targetHeader);
    }, FOLDER_DRAG_EXPAND_DELAY);
}

function clearFolderDropIndicator(folderHeader) {
    if (!folderHeader) return;
    folderHeader.classList.remove('drag-over');
    folderHeader.classList.remove('folder-drop-target');
    folderHeader.classList.remove('folder-drop-before');
    folderHeader.classList.remove('folder-drop-after');
    folderHeader.classList.remove('folder-drop-inside');
    if (folderHeader.dataset && folderHeader.dataset.folderDropPosition) {
        delete folderHeader.dataset.folderDropPosition;
    }
    clearFolderDragExpandTimer(folderHeader);
}

function clearOtherFolderDropIndicators(activeHeader) {
    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target, .folder-header.folder-drop-before, .folder-header.folder-drop-after, .folder-header.folder-drop-inside').forEach(function (header) {
        if (header === activeHeader) return;
        clearFolderDropIndicator(header);
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });
}

function getFolderDropPosition(e, folderHeader) {
    var folderToggle = getFolderToggleElement(folderHeader);
    if (!folderToggle) return 'inside';

    var rect = folderToggle.getBoundingClientRect();
    if (e.clientY < rect.top || e.clientY > rect.bottom) {
        return 'inside';
    }

    var ratio = (e.clientY - rect.top) / Math.max(rect.height, 1);
    var previousPosition = folderHeader.dataset ? (folderHeader.dataset.folderDropPosition || '') : '';

    if (previousPosition === 'before') {
        return ratio <= 0.36 ? 'before' : 'inside';
    }
    if (previousPosition === 'after') {
        return ratio >= 0.64 ? 'after' : 'inside';
    }

    if (ratio <= 0.24) return 'before';
    if (ratio >= 0.76) return 'after';
    return 'inside';
}

function canDropFolderOnHeader(dragData, folderHeader, targetFolderId) {
    if (!dragData || dragData.type !== 'folder' || !folderHeader) return false;
    if (folderHeader.classList.contains('system-folder')) return false;

    var sourceFolderId = parseInt(dragData.folderId, 10);
    var targetNumericId = parseInt(targetFolderId, 10);
    if (!sourceFolderId || !targetNumericId || sourceFolderId === targetNumericId) return false;

    var sourceHeader = document.querySelector('.folder-header[data-folder-id="' + sourceFolderId + '"]');
    if (sourceHeader && sourceHeader.contains(folderHeader)) return false;

    return true;
}

function applyFolderDropIndicator(folderHeader, position) {
    clearOtherFolderDropIndicators(folderHeader);

    if (position !== 'before' && position !== 'after') {
        position = 'inside';
    }

    var currentPosition = folderHeader.dataset ? (folderHeader.dataset.folderDropPosition || '') : '';
    if (currentPosition === position) {
        return;
    }

    if (position === 'before') {
        folderHeader.classList.remove('drag-over');
        folderHeader.classList.remove('folder-drop-target');
        folderHeader.classList.remove('folder-drop-inside');
        folderHeader.classList.add('folder-drop-before');
        folderHeader.classList.remove('folder-drop-after');
    } else if (position === 'after') {
        folderHeader.classList.remove('drag-over');
        folderHeader.classList.remove('folder-drop-target');
        folderHeader.classList.remove('folder-drop-inside');
        folderHeader.classList.remove('folder-drop-before');
        folderHeader.classList.add('folder-drop-after');
    } else {
        folderHeader.classList.add('drag-over');
        folderHeader.classList.add('folder-drop-target');
        folderHeader.classList.add('folder-drop-inside');
        folderHeader.classList.remove('folder-drop-before');
        folderHeader.classList.remove('folder-drop-after');
    }

    if (folderHeader.dataset) {
        folderHeader.dataset.folderDropPosition = position;
    }
}

// Enhanced folder drag enter handler to avoid flicker on nested elements
function handleFolderDragEnterEnhanced(e) {
    if (isExternalFileDrag(e)) return;

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    if (e.relatedTarget && folderHeader.contains(e.relatedTarget)) {
        return;
    }

    clearOtherFolderDropIndicators(folderHeader);

    folderHeader.dataset.dragEnterCount = '1';

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    var dragData = window.currentDragData;

    if (dragData && dragData.type === 'folder') {
        if (!canDropFolderOnHeader(dragData, folderHeader, targetFolderId)) {
            return;
        }
        var folderDropPosition = getFolderDropPosition(e, folderHeader);
        applyFolderDropIndicator(folderHeader, folderDropPosition);
        scheduleFolderDragExpand(folderHeader, dragData, folderDropPosition);
        return;
    }

    if (targetFolder === 'Tags') {
        return;
    }

    // Own folder: position change only, handled in handleFolderDragOverEnhanced
    if (isNoteDragInOwnFolder(dragData, folderHeader)) {
        return;
    }

    folderHeader.classList.add('drag-over');
    scheduleFolderDragExpand(folderHeader, dragData, 'inside');
}

// Enhanced folder drag over handler that supports both notes and folders
function handleFolderDragOverEnhanced(e) {
    if (isExternalFileDrag(e)) return;

    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    // Check what we're dragging
    var dragData = window.currentDragData;

    // If dragging a folder
    if (dragData && dragData.type === 'folder') {
        // Dropping a folder on Favorites toggles its favorite state
        if (targetFolder === 'Favorites') {
            e.dataTransfer.dropEffect = 'move';
            folderHeader.classList.add('drag-over');
            return;
        }

        if (!canDropFolderOnHeader(dragData, folderHeader, targetFolderId)) {
            e.dataTransfer.dropEffect = 'none';
            clearFolderDropIndicator(folderHeader);
            return;
        }

        e.dataTransfer.dropEffect = 'move';
        var folderDropPosition = getFolderDropPosition(e, folderHeader);
        applyFolderDropIndicator(folderHeader, folderDropPosition);
        scheduleFolderDragExpand(folderHeader, dragData, folderDropPosition);
        return;
    }

    // If dragging a note (existing behavior)
    // Prevent drag-over effect for Tags folder
    if (targetFolder === 'Tags') {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    // A note dragged inside its own folder only changes position: no "move
    // into folder" highlight, the nearest note row shows before/after instead
    // (rows themselves are handled by handleNoteReorderDragOver; this covers
    // the gaps between rows and the folder padding).
    if (isNoteDragInOwnFolder(dragData, folderHeader)) {
        clearFolderDropIndicator(folderHeader);
        var nearest = findNearestNoteRowForDrop(e, folderHeader, dragData);
        if (nearest) {
            e.dataTransfer.dropEffect = 'move';
            applyNoteDropIndicator(nearest.item, nearest.position);
        } else {
            e.dataTransfer.dropEffect = 'none';
            clearNoteDropIndicators(null);
        }
        return;
    }

    // Allow drag-over for all other folders including Favorites
    e.dataTransfer.dropEffect = 'move';
    folderHeader.classList.add('drag-over');
    scheduleFolderDragExpand(folderHeader, dragData, 'inside');
}

// Enhanced folder drag leave handler
function handleFolderDragLeaveEnhanced(e) {
    var folderHeader = e.target.closest('.folder-header');
    if (folderHeader) {
        if (e.relatedTarget && folderHeader.contains(e.relatedTarget)) {
            return;
        }

        var count = parseInt(folderHeader.dataset.dragEnterCount || '0', 10) - 1;
        if (count > 0) {
            folderHeader.dataset.dragEnterCount = String(count);
            return;
        }

        if (folderHeader.dataset && folderHeader.dataset.dragEnterCount) {
            delete folderHeader.dataset.dragEnterCount;
        }

        clearFolderDropIndicator(folderHeader);
        clearNoteDropIndicators(null);
    }
}

// Enhanced folder drop handler that supports both notes and folders
function handleFolderDropEnhanced(e) {
    // External files are imported as new notes elsewhere, not moved.
    if (isExternalFileDrag(e)) return;

    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    folderHeader.classList.remove('drag-over');
    folderHeader.classList.remove('folder-drop-target');
    folderHeader.classList.remove('folder-drop-before');
    folderHeader.classList.remove('folder-drop-after');
    folderHeader.classList.remove('folder-drop-inside');
    clearFolderDragExpandTimer(folderHeader);
    if (folderHeader.dataset && folderHeader.dataset.dragEnterCount) {
        delete folderHeader.dataset.dragEnterCount;
    }
    if (folderHeader.dataset && folderHeader.dataset.folderDropPosition) {
        delete folderHeader.dataset.folderDropPosition;
    }

    try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        var targetFolder = folderHeader.getAttribute('data-folder');
        var targetFolderId = folderHeader.getAttribute('data-folder-id');

        // Handle folder drop
        if (data.type === 'folder') {
            // Remove dragging class from the source folder
            document.querySelectorAll('.folder-header.folder-dragging').forEach(function (header) {
                header.classList.remove('folder-dragging');
                header.style.opacity = '';
                header.style.backgroundColor = '';
                header.style.border = '';
                header.style.transform = '';
            });

            // Special handling for Favorites folder: toggle favorite state
            if (targetFolder === 'Favorites') {
                if (typeof toggleFolderFavorite === 'function') {
                    toggleFolderFavorite(data.folderId);
                }
                return;
            }

            if (!canDropFolderOnHeader(data, folderHeader, targetFolderId)) {
                return;
            }

            var dropPosition = getFolderDropPosition(e, folderHeader);

            if (dropPosition === 'before' || dropPosition === 'after') {
                moveFolderBesideTarget(data.folderId, targetFolderId, dropPosition);
                return;
            }

            // Move folder to new parent
            moveFolderToParent(data.folderId, targetFolderId);
            return;
        }

        // Handle note drop (existing behavior)
        // Remove dragging class from all notes
        document.querySelectorAll('.links_arbo_left.dragging').forEach(function (link) {
            link.classList.remove('dragging');
        });

        // Prevent dropping notes into the Tags folder
        if (targetFolder === 'Tags') {
            return;
        }

        // Special handling for Public folder
        if (targetFolder === 'Public') {
            if (typeof openPublicShareModal === 'function') {
                openPublicShareModal(data.noteId);
            }
            return;
        }

        // Special handling for Favorites folder
        if (targetFolder === 'Favorites') {
            toggleFavorite(data.noteId);
            return;
        }

        // Special handling for Trash folder
        if (targetFolder === 'Trash') {
            deleteNote(data.noteId);
            return;
        }

        // Own folder: reorder beside the nearest note row (a drop on the
        // folder toggle itself changes nothing)
        if (isNoteDragInOwnFolder(data, folderHeader)) {
            var nearestRow = findNearestNoteRowForDrop(e, folderHeader, data);
            clearNoteDropIndicators(null);
            if (nearestRow) {
                reorderNoteBesideTarget(data.noteId, nearestRow.noteId, nearestRow.position);
            }
            return;
        }

        // Compare folder IDs to handle subfolders with same names
        var currentFolderId = data.currentFolderId ? String(data.currentFolderId) : null;
        var targetFolderIdStr = targetFolderId ? String(targetFolderId) : null;

        if (data.noteId && targetFolderId && currentFolderId !== targetFolderIdStr) {
            moveNoteToTargetFolder(data.noteId, targetFolderId);
        }
    } catch (err) {
        console.error('Error handling folder drop:', err);
    }
}

// Move folder to a new parent folder (pass null for root)
function moveFolderToParent(folderId, newParentFolderId) {
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var folderBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.folderState(folderId) : null;

    apiPostJson(
        '/api/v1/folders/' + folderId + '/move',
        { workspace: workspace, new_parent_folder_id: newParentFolderId },
        function () {
            recordFolderMoveForUndo(folderId, folderBefore, {
                parentId: newParentFolderId ? String(newParentFolderId) : null,
                workspace: workspace
            });
            location.reload();
        },
        'Error moving folder: '
    );
}

// Move folder before or after a target folder and persist sibling order
function moveFolderBesideTarget(folderId, targetFolderId, position) {
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var folderBefore = window.PoznoteTreeHistory ? window.PoznoteTreeHistory.folderState(folderId) : null;

    apiPostJson(
        '/api/v1/folders/reorder',
        {
            workspace: workspace,
            folder_id: folderId,
            target_folder_id: targetFolderId,
            position: position
        },
        function () {
            recordFolderMoveForUndo(folderId, folderBefore, {
                targetFolderId: String(targetFolderId),
                position: position,
                workspace: workspace
            });
            location.reload();
        },
        'Error reordering folder: '
    );
}

// Move folder to root (remove from parent folder)
function moveFolderToRoot(folderId) {
    moveFolderToParent(folderId, null);
}

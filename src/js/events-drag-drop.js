// Drag & drop system for Poznote
// Handles file uploads, note movement between folders, and folder reorganization

// Setup drag-and-drop handlers for file uploads
function setupDragDropEvents() {
    document.body.addEventListener('dragenter', function (e) {
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
                handleImageFilesAndInsert(dt.files, note);
            }
        } catch (err) {
        }
    });
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

    noteLinks.forEach(function (link, index) {
        var isMobile = window.innerWidth <= 800;

        // On mobile, disable HTML5 dragging on note links.
        // Draggable anchors can intermittently swallow taps (treated as scroll/drag),
        // which prevents the note open + horizontal scroll from triggering.
        if (isMobile) {
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
        if (!isMobile) {
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

    // Add drop events to folder headers (using enhanced handlers for folder+note support)
    var folderHeaders = document.querySelectorAll('.folder-header');
    folderHeaders.forEach(function (header) {
        header.addEventListener('dragenter', handleFolderDragEnterEnhanced);
        header.addEventListener('dragover', handleFolderDragOverEnhanced);
        header.addEventListener('drop', handleFolderDropEnhanced);
        header.addEventListener('dragleave', handleFolderDragLeaveEnhanced);
    });

    // Add global drop handler for dropping outside folders (move to no folder or move folder to root)
    var notesListContainer = document.querySelector('.notes_list, #notes-list, body');
    if (notesListContainer) {
        notesListContainer.addEventListener('dragover', function (e) {
            // Check if we're not over a folder header
            var isOverFolder = e.target.closest('.folder-header');
            if (!isOverFolder && window.currentDragData) {
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
    // Clean up the dragged note styles
    var noteLink = e.target.closest('.links_arbo_left');
    if (noteLink) {
        noteLink.classList.remove('dragging');
        noteLink.removeAttribute('data-dragging');
    }
    cleanupDraggingNotes();

    // Remove drag-over class from all folders
    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    // Clean up global drag data and hide drop zone after a longer delay
    setTimeout(function () {
        if (window.currentDragData) {
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

    apiPostJson(
        '/api/v1/notes/' + noteId + '/folder',
        { folder_id: targetFolderId || '', workspace: selectedWorkspace || getSelectedWorkspace() },
        refreshSidebarAfterMove,
        'Error moving note: '
    );
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

// Remove a note from its folder (move to root)
function moveNoteToRoot(noteId) {
    apiPostJson(
        '/api/v1/notes/' + noteId + '/remove-folder',
        { workspace: selectedWorkspace || getSelectedWorkspace() },
        refreshSidebarAfterMove,
        'Error removing note from folder: '
    );
}

// Setup drag and drop events for folders. Called from setupNoteDragDropEvents to initialize folder dragging
function setupFolderDragDropEvents() {
    var isMobile = window.innerWidth <= 800;

    // Get all folder toggle elements (excluding system folders)
    // We target folder-toggle instead of folder-header to avoid capturing note drag events
    var folderToggles = document.querySelectorAll('.folder-header:not(.system-folder) > .folder-toggle');

    folderToggles.forEach(function (toggle) {
        // Remove existing listeners
        toggle.removeEventListener('dragstart', handleFolderDragStart);
        toggle.removeEventListener('dragend', handleFolderDragEnd);

        if (!isMobile) {
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
    dragImage.innerHTML = '<i class="fa-folder"></i> ' + (folderName || 'Folder');
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
    document.querySelectorAll('.folder-header.folder-drop-target, .folder-header.folder-source-drag').forEach(function (header) {
        header.classList.remove('folder-drop-target');
        header.classList.remove('folder-source-drag');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    // Clean up global drag data
    setTimeout(function () {
        if (window.currentDragData && window.currentDragData.type === 'folder') {
            window.currentDragData = null;
        }
    }, 100);
}

// Enhanced folder drag enter handler to avoid flicker on nested elements
function handleFolderDragEnterEnhanced(e) {
    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    if (e.relatedTarget && folderHeader.contains(e.relatedTarget)) {
        return;
    }

    document.querySelectorAll('.folder-header.drag-over, .folder-header.folder-drop-target').forEach(function (header) {
        if (header === folderHeader) return;
        header.classList.remove('drag-over');
        header.classList.remove('folder-drop-target');
        if (header.dataset && header.dataset.dragEnterCount) {
            delete header.dataset.dragEnterCount;
        }
    });

    folderHeader.dataset.dragEnterCount = '1';

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    var dragData = window.currentDragData;

    if (dragData && dragData.type === 'folder') {
        if (dragData.folderId === targetFolderId) {
            return;
        }
        if (folderHeader.classList.contains('system-folder')) {
            return;
        }
        folderHeader.classList.add('folder-drop-target');
        folderHeader.classList.add('drag-over');
        return;
    }

    if (targetFolder === 'Tags') {
        return;
    }

    folderHeader.classList.add('drag-over');
}

// Enhanced folder drag over handler that supports both notes and folders
function handleFolderDragOverEnhanced(e) {
    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    var targetFolder = folderHeader.getAttribute('data-folder');
    var targetFolderId = folderHeader.getAttribute('data-folder-id');

    // Check what we're dragging
    var dragData = window.currentDragData;

    // If dragging a folder
    if (dragData && dragData.type === 'folder') {
        // Prevent dropping folder on itself
        if (dragData.folderId === targetFolderId) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        // Prevent dropping on system folders
        if (folderHeader.classList.contains('system-folder')) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        e.dataTransfer.dropEffect = 'move';
        folderHeader.classList.add('folder-drop-target');
        folderHeader.classList.add('drag-over');
        return;
    }

    // If dragging a note (existing behavior)
    // Prevent drag-over effect for Tags folder
    if (targetFolder === 'Tags') {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    // Allow drag-over for all other folders including Favorites
    e.dataTransfer.dropEffect = 'move';
    folderHeader.classList.add('drag-over');
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

        folderHeader.classList.remove('drag-over');
        folderHeader.classList.remove('folder-drop-target');
    }
}

// Enhanced folder drop handler that supports both notes and folders
function handleFolderDropEnhanced(e) {
    e.preventDefault();

    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;

    folderHeader.classList.remove('drag-over');
    folderHeader.classList.remove('folder-drop-target');
    if (folderHeader.dataset && folderHeader.dataset.dragEnterCount) {
        delete folderHeader.dataset.dragEnterCount;
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

            // Prevent dropping folder on itself
            if (data.folderId === targetFolderId) {
                return;
            }

            // Prevent dropping on system folders
            if (folderHeader.classList.contains('system-folder')) {
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
    apiPostJson(
        '/api/v1/folders/' + folderId + '/move',
        { workspace: selectedWorkspace || getSelectedWorkspace(), new_parent_folder_id: newParentFolderId },
        function () { location.reload(); },
        'Error moving folder: '
    );
}

// Move folder to root (remove from parent folder)
function moveFolderToRoot(folderId) {
    moveFolderToParent(folderId, null);
}

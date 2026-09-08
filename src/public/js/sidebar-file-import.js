// Drag & drop import of external note files (.md, .html, .txt, .json, .zip)
// dropped from the file explorer onto the notes sidebar.
//
// Dropping on a folder imports into that folder; dropping anywhere else in the
// sidebar imports at root level. Notes moved inside the app are handled by
// events-drag-drop.js - this module only reacts to real files.

(function () {
    'use strict';

    var ACCEPTED_EXTENSIONS = ['html', 'htm', 'md', 'markdown', 'txt', 'json', 'zip'];
    var SYSTEM_FOLDERS = ['Favorites', 'Tags', 'Trash', 'Public'];

    var dragDepth = 0;
    var importInProgress = false;

    function tr(key, vars, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, vars, fallback);
        }
        // Minimal fallback interpolation when i18n is not loaded yet.
        var text = fallback || key;
        if (vars) {
            Object.keys(vars).forEach(function (name) {
                text = text.replace(new RegExp('{{' + name + '}}', 'g'), vars[name]);
            });
        }
        return text;
    }

    function isReadOnlyWorkspace() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    // True only when the drag carries OS files, not a note/folder being moved.
    function dragCarriesFiles(e) {
        if (!e.dataTransfer) return false;
        // An in-app note/folder drag sets window.currentDragData; never treat it as a file drop.
        if (window.currentDragData) return false;
        // An image dragged from inside a note advertises 'Files' in Chrome;
        // importing it here would create a duplicate note from the image.
        if (window.internalDragActive) return false;
        var types = e.dataTransfer.types;
        if (!types) return false;
        return Array.prototype.indexOf.call(types, 'Files') !== -1;
    }

    function hasExtension(fileName) {
        var ext = String(fileName).split('.').pop().toLowerCase();
        return ACCEPTED_EXTENSIONS.indexOf(ext) !== -1;
    }

    function getSidebar() {
        return document.getElementById('left_col');
    }

    // Resolve the folder the files were dropped on, if any.
    // Returns null for a root-level drop.
    function resolveDropFolder(target) {
        if (!target || !target.closest) return null;

        var folderHeader = target.closest('.folder-header');
        if (!folderHeader) {
            // Dropping on a note or inside an open folder's body still targets that folder.
            var folderContent = target.closest('.folder-content');
            if (folderContent && folderContent.id) {
                var contentId = folderContent.id.replace('folder-', '');
                var owner = document.querySelector('.folder-header[data-folder-id="' + contentId + '"]');
                if (owner) folderHeader = owner;
            }
        }

        if (!folderHeader) return null;

        return {
            id: folderHeader.getAttribute('data-folder-id'),
            name: folderHeader.getAttribute('data-folder'),
            element: folderHeader
        };
    }

    function isImportableFolder(folder) {
        return !folder || SYSTEM_FOLDERS.indexOf(folder.name) === -1;
    }

    function clearHighlights() {
        var sidebar = getSidebar();
        if (sidebar) sidebar.classList.remove('file-import-drop-active');
        document.querySelectorAll('.folder-header.file-import-drop-target').forEach(function (el) {
            el.classList.remove('file-import-drop-target');
        });
    }

    function highlightTarget(folder) {
        var sidebar = getSidebar();
        if (sidebar) sidebar.classList.add('file-import-drop-active');

        document.querySelectorAll('.folder-header.file-import-drop-target').forEach(function (el) {
            if (!folder || el !== folder.element) {
                el.classList.remove('file-import-drop-target');
            }
        });

        if (folder && folder.element && isImportableFolder(folder)) {
            folder.element.classList.add('file-import-drop-target');
        }
    }

    function showOverlay(folder) {
        var overlay = document.getElementById('sidebarFileImportOverlay');
        if (!overlay) return;

        var label = overlay.querySelector('.sidebar-file-import-overlay-text');
        if (label) {
            if (folder && isImportableFolder(folder)) {
                label.textContent = tr(
                    'restore_import.drag_drop.sidebar.drop_into_folder',
                    { folder: folder.name },
                    'Drop to import into "{{folder}}"'
                );
            } else if (folder) {
                label.textContent = tr(
                    'restore_import.drag_drop.sidebar.folder_not_allowed',
                    { folder: folder.name },
                    'Cannot import into "{{folder}}"'
                );
            } else {
                label.textContent = tr(
                    'restore_import.drag_drop.sidebar.drop_here',
                    {},
                    'Drop note files to import them'
                );
            }
        }
        overlay.classList.add('visible');
    }

    function hideOverlay() {
        var overlay = document.getElementById('sidebarFileImportOverlay');
        if (overlay) overlay.classList.remove('visible');
    }

    function buildOverlay() {
        var sidebar = getSidebar();
        if (!sidebar || document.getElementById('sidebarFileImportOverlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'sidebarFileImportOverlay';
        overlay.className = 'sidebar-file-import-overlay';
        overlay.innerHTML =
            '<div class="sidebar-file-import-overlay-inner">' +
            '<i class="lucide lucide-download"></i>' +
            '<div class="sidebar-file-import-overlay-text"></div>' +
            '</div>';
        sidebar.appendChild(overlay);
    }

    function endDrag() {
        dragDepth = 0;
        clearHighlights();
        hideOverlay();
    }

    function handleDragEnter(e) {
        if (!dragCarriesFiles(e) || isReadOnlyWorkspace()) return;
        e.preventDefault();
        dragDepth++;
        var folder = resolveDropFolder(e.target);
        highlightTarget(folder);
        showOverlay(folder);
    }

    function handleDragOver(e) {
        if (!dragCarriesFiles(e) || isReadOnlyWorkspace()) return;
        // Required so the browser lets us receive the drop instead of opening the file.
        e.preventDefault();
        e.stopPropagation();

        var folder = resolveDropFolder(e.target);
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = isImportableFolder(folder) ? 'copy' : 'none';
        }
        highlightTarget(folder);
        showOverlay(folder);
    }

    function handleDragLeave(e) {
        if (!dragCarriesFiles(e)) return;
        dragDepth--;
        if (dragDepth <= 0) {
            endDrag();
        }
    }

    function handleDrop(e) {
        if (!dragCarriesFiles(e)) return;

        e.preventDefault();
        e.stopPropagation();
        endDrag();

        if (isReadOnlyWorkspace()) return;

        var files = e.dataTransfer && e.dataTransfer.files ? Array.prototype.slice.call(e.dataTransfer.files) : [];
        if (!files.length) return;

        var folder = resolveDropFolder(e.target);

        if (!isImportableFolder(folder)) {
            showNotificationPopup(
                tr(
                    'restore_import.drag_drop.sidebar.folder_not_allowed',
                    { folder: folder.name },
                    'Cannot import into "{{folder}}"'
                ),
                'error'
            );
            return;
        }

        var supported = files.filter(function (file) { return hasExtension(file.name); });
        var rejected = files.length - supported.length;

        if (!supported.length) {
            showNotificationPopup(
                tr(
                    'restore_import.drag_drop.sidebar.no_supported_files',
                    { allowed: '.md, .html, .txt, .json, .zip' },
                    'No supported files were dropped. Allowed types: {{allowed}}'
                ),
                'error'
            );
            return;
        }

        importFiles(supported, folder, rejected);
    }

    function setBusy(busy) {
        importInProgress = busy;
        var sidebar = getSidebar();
        if (sidebar) sidebar.classList.toggle('file-import-busy', busy);

        var overlay = document.getElementById('sidebarFileImportOverlay');
        if (!overlay) return;

        if (busy) {
            var label = overlay.querySelector('.sidebar-file-import-overlay-text');
            if (label) {
                label.textContent = tr(
                    'restore_import.drag_drop.sidebar.importing',
                    {},
                    'Importing notes...'
                );
            }
            overlay.classList.add('visible', 'busy');
        } else {
            overlay.classList.remove('visible', 'busy');
        }
    }

    function importFiles(files, folder, rejectedCount) {
        if (importInProgress) return;
        setBusy(true);

        var formData = new FormData();
        files.forEach(function (file) { formData.append('files[]', file); });

        var workspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace)
            ? selectedWorkspace
            : (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '');
        if (workspace) formData.append('workspace', workspace);
        if (folder && folder.id) formData.append('folder_id', folder.id);

        fetch('api_import_dropped_notes.php', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                setBusy(false);

                if (!data || !data.success) {
                    var errorText = (data && (data.error || data.message)) ||
                        tr('restore_import.drag_drop.sidebar.import_failed', {}, 'Import failed.');
                    showNotificationPopup(errorText, 'error');
                    return;
                }

                var message = data.message ||
                    tr('restore_import.drag_drop.sidebar.import_done', {}, 'Notes imported.');
                if (rejectedCount > 0) {
                    message += '\n' + tr(
                        'restore_import.drag_drop.sidebar.skipped_files',
                        { count: rejectedCount },
                        '{{count}} unsupported file(s) were skipped.'
                    );
                }
                showNotificationPopup(message, 'success');

                // Rebuild the sidebar so the new notes appear straight away.
                if (typeof refreshNotesListAfterFolderAction === 'function') {
                    refreshNotesListAfterFolderAction(folder ? folder.id : null);
                } else {
                    location.reload();
                }
            })
            .catch(function (err) {
                setBusy(false);
                console.error('Drag & drop import failed:', err);
                showNotificationPopup(
                    tr('restore_import.drag_drop.sidebar.import_failed', {}, 'Import failed.'),
                    'error'
                );
            });
    }

    function init() {
        var sidebar = getSidebar();
        if (!sidebar || isReadOnlyWorkspace()) return;

        buildOverlay();

        sidebar.addEventListener('dragenter', handleDragEnter, false);
        sidebar.addEventListener('dragover', handleDragOver, false);
        sidebar.addEventListener('dragleave', handleDragLeave, false);
        sidebar.addEventListener('drop', handleDrop, false);

        // A drop outside the sidebar would otherwise make the browser navigate
        // to the dropped file and lose the current note.
        window.addEventListener('dragover', function (e) {
            if (dragCarriesFiles(e) && !e.target.closest('#left_col, .noteentry')) {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
            }
        }, false);
        window.addEventListener('drop', function (e) {
            if (dragCarriesFiles(e) && !e.target.closest('#left_col, .noteentry')) {
                e.preventDefault();
                endDrag();
            }
        }, false);

        window.addEventListener('dragend', endDrag, false);
    }

    // The sidebar is re-rendered on refresh, so the overlay must be rebuilt.
    window.reinitializeSidebarFileImportOverlay = function () {
        buildOverlay();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

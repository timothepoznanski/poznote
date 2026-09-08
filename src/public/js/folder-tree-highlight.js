/**
 * Current Folder Tree Highlight
 *
 * Keeps .folder-tree-active (the folder being worked in) and .folder-tree-branch
 * (its ancestors) pointing at the right rows so css/folders/tree-highlight.css
 * can dim the rest of the notes list. notes_list.php renders the initial marks;
 * this module moves them afterwards, since notes and folders open without a
 * page reload.
 *
 * The active folder is the folder of the selected note, or the folder the user
 * clicked on last when that click did not open a note.
 */
(function () {
    'use strict';

    var ACTIVE_CLASS = 'folder-tree-active';
    var BRANCH_CLASS = 'folder-tree-branch';
    var FAVORITES_FOLDER = 'Favorites';

    var container = null;
    var observer = null;
    var refreshScheduled = false;
    // Folder the user clicked on directly. Cleared as soon as a note is opened,
    // so the note's own folder takes the lead again.
    var pinnedFolderId = null;

    function isEnabled() {
        return !!document.body && document.body.classList.contains('highlight-folder-tree');
    }

    function getContainer() {
        if (!container || !container.isConnected) {
            container = document.querySelector('.notes-list-scrollable-content');
        }

        return container;
    }

    // The Favorites section repeats folders and notes that live elsewhere, so
    // its rows never identify the hierarchy the user is working in.
    function isFavoritesRow(element) {
        return !!element && element.getAttribute('data-folder') === FAVORITES_FOLDER;
    }

    function findFolderHeader(folderId) {
        var root = getContainer();
        if (!root || !folderId) return null;

        var headers = root.querySelectorAll('.folder-header[data-folder-id="' + CSS.escape(folderId) + '"]');
        for (var i = 0; i < headers.length; i++) {
            if (!isFavoritesRow(headers[i])) {
                return headers[i];
            }
        }

        return null;
    }

    function getSelectedNoteLinks() {
        var root = getContainer();
        return root ? root.querySelectorAll('.links_arbo_left.selected-note') : [];
    }

    function folderIdOfSelectedNote() {
        var links = getSelectedNoteLinks();
        for (var i = 0; i < links.length; i++) {
            var folderId = links[i].getAttribute('data-folder-id');
            // Notes outside any folder carry an empty folder id
            if (folderId && !isFavoritesRow(links[i])) {
                return folderId;
            }
        }

        return null;
    }

    function markActiveTree(active) {
        var root = getContainer();
        if (!root) return;

        root.querySelectorAll('.' + ACTIVE_CLASS + ', .' + BRANCH_CLASS).forEach(function (marked) {
            marked.classList.remove(ACTIVE_CLASS, BRANCH_CLASS);
        });

        if (!active) return;

        active.classList.add(ACTIVE_CLASS);

        var ancestor = active.parentElement ? active.parentElement.closest('.folder-header') : null;
        while (ancestor) {
            ancestor.classList.add(BRANCH_CLASS);
            ancestor = ancestor.parentElement ? ancestor.parentElement.closest('.folder-header') : null;
        }
    }

    function refresh() {
        refreshScheduled = false;
        if (!isEnabled() || !getContainer()) return;

        var active = pinnedFolderId ? findFolderHeader(pinnedFolderId) : null;
        if (!active) {
            active = findFolderHeader(folderIdOfSelectedNote());
        }

        // Without a pinned folder and without a selected note there is nothing
        // to derive a hierarchy from: index.php opens the latest note without
        // selecting it in the list, and the marks it rendered are still the
        // best answer. Leave them alone rather than clearing the highlight.
        if (!active && !pinnedFolderId && getSelectedNoteLinks().length === 0) {
            return;
        }

        // Our own class writes would feed straight back into the observer.
        stopObserving();
        try {
            markActiveTree(active);
        } finally {
            startObserving();
        }
    }

    function scheduleRefresh() {
        if (refreshScheduled) return;
        refreshScheduled = true;
        requestAnimationFrame(refresh);
    }

    function startObserving() {
        var root = getContainer();
        if (!root) return;

        if (!observer) {
            observer = new MutationObserver(scheduleRefresh);
        }

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function stopObserving() {
        if (observer) {
            observer.disconnect();
        }
    }

    function handleListClick(event) {
        if (!isEnabled() || !event.target || !event.target.closest) return;

        var root = getContainer();
        if (!root || !root.contains(event.target)) return;

        // Opening a note hands the lead back to that note's folder
        if (event.target.closest('.links_arbo_left')) {
            pinnedFolderId = null;
            scheduleRefresh();
            return;
        }

        var toggle = event.target.closest('.folder-toggle');
        if (!toggle) return;

        // The ⋮ menu acts on a folder without moving the user into it
        if (event.target.closest('.folder-actions')) return;

        var header = toggle.closest('.folder-header');
        if (!header || isFavoritesRow(header)) return;

        pinnedFolderId = header.getAttribute('data-folder-id');
        scheduleRefresh();
    }

    function init() {
        if (!isEnabled()) return;

        document.addEventListener('click', handleListClick, true);
        startObserving();
        scheduleRefresh();
    }

    window.PoznoteFolderTreeHighlight = {
        refresh: scheduleRefresh
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============================================================================
// Sort mode of the notes tree (#1442)
// ============================================================================
// One global sort order for the whole tree, picked in the "Sort by" group of
// the view options menu (#tree-options-menu, rendered by index.php, opened by
// js/tree-options-menu.js): the mode in use is checked in the accent colour.
//
// The mode lives in the `note_list_sort` setting. index.php renders the group
// from it (data-note-sort-mode on #sidebarSortBtn), so a sidebar refresh
// brings the markup back in the right state and nothing here has to be
// re-bound: the click listener sits on the document.
//
// The order of MODES mirrors poznoteNoteSortModes() in src/lib/note-sort.php.
// Keep the two in step.

(function () {
    'use strict';

    var MODES = ['heading_asc', 'updated_desc', 'created_desc', 'type_asc', 'manual'];

    var LABELS = {
        heading_asc: ['sort.modes.name', 'Name'],
        updated_desc: ['sort.modes.date_modified', 'Date modified'],
        created_desc: ['sort.modes.date_created', 'Date created'],
        type_asc: ['sort.modes.type', 'Type'],
        manual: ['sort.modes.custom', 'Custom']
    };

    var TOAST_DURATION = 1600;
    var toastTimeout = null;
    var saving = false;

    function tr(key, fallback, params) {
        return (typeof window.t === 'function') ? window.t(key, params || null, fallback) : fallback;
    }

    function normalize(mode) {
        return MODES.indexOf(mode) === -1 ? 'updated_desc' : mode;
    }

    function label(mode) {
        var entry = LABELS[normalize(mode)];
        return tr(entry[0], entry[1]);
    }

    function getGroup() {
        return document.querySelector('[data-note-sort-mode]');
    }

    // Check the mode before the request answers, a failure puts the previous
    // mode back
    function paint(group, mode) {
        mode = normalize(mode);
        group.setAttribute('data-note-sort-mode', mode);
        group.querySelectorAll('[data-action="set-note-sort"]').forEach(function (item) {
            var active = item.getAttribute('data-sort-mode') === mode;
            item.classList.toggle('active-state', active);
            item.setAttribute('aria-checked', active ? 'true' : 'false');
        });
    }

    // Same toast as Ctrl+S and Ctrl+Alt+S: accent box at the top right, check
    // mark, one at a time. Only for the switch to Custom a drop makes, which
    // nothing else announces.
    function showToast(text) {
        var existing = document.querySelector('.save-notification[data-sort-toast]');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        clearTimeout(toastTimeout);

        var toast = document.createElement('div');
        toast.className = 'save-notification';
        toast.setAttribute('data-sort-toast', 'true');
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<div class="save-notification-inner"><div class="save-notification-check">✓</div><span></span></div>';
        toast.querySelector('span').textContent = text;
        (window.poznoteToastStack ? window.poznoteToastStack() : document.body).appendChild(toast);

        toastTimeout = setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, TOAST_DURATION);
    }

    function showError(text) {
        var existing = document.querySelector('.save-notification[data-sort-toast]');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(text, 'error');
        } else {
            alert(text);
        }
    }

    // The tree is built server side, so the new order comes from a rebuild of
    // the sidebar rather than from re-sorting the DOM here: the same markup the
    // next page load would produce, folder states kept.
    function refreshTree() {
        if (typeof window.refreshNotesListAfterFolderAction === 'function') {
            try {
                var result = window.refreshNotesListAfterFolderAction();
                if (result && typeof result.catch === 'function') {
                    result.catch(function () { window.location.reload(); });
                }
                return;
            } catch (e) {
                console.debug('note-sort-cycle: sidebar refresh failed, reloading', e);
            }
        }
        window.location.reload();
    }

    function setMode(mode) {
        var group = getGroup();
        if (saving || !group) return;

        var previous = normalize(group.getAttribute('data-note-sort-mode'));
        mode = normalize(mode);
        if (mode === previous) return;

        saving = true;
        paint(group, mode);

        fetch('/api/v1/settings/note_list_sort', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ value: mode })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error('save rejected');
                refreshTree();
            })
            .catch(function (error) {
                console.error('note-sort-cycle: could not save the sort mode', error);
                var current = getGroup();
                if (current) paint(current, previous);
                showError(tr('sort.save_failed', 'Could not change the sort order'));
            })
            .finally(function () { saving = false; });
    }

    // The mode the tree follows right now. The menu group carries it, and is
    // repainted by markCustom() without waiting for a reload, so it is a
    // truer source than the setting the page was rendered with. Callers use
    // it to tell a drop that places a row (Custom only) from a drop that just
    // moves it somewhere else (#1441).
    function currentMode() {
        var group = getGroup();
        if (group) return normalize(group.getAttribute('data-note-sort-mode'));
        return normalize(window.defaultNoteSortType);
    }

    window.poznoteNoteSortMode = currentMode;

    // A drop that reorders rows switches the tree to Custom server side
    // (enableManualNoteSort). Where the drop is applied in the DOM instead of
    // reloading the list, the menu has to follow, or it keeps checking the
    // mode the tree just left.
    function markCustom() {
        // Kept in step for the pages where the menu group is absent: it is
        // what currentMode() falls back to
        window.defaultNoteSortType = 'manual';

        var group = getGroup();
        if (!group || group.getAttribute('data-note-sort-mode') === 'manual') return;

        paint(group, 'manual');
        showToast(tr('sort.button_title', 'Sort by: {{mode}}', { mode: label('manual') }));
    }

    window.markNoteSortCustom = markCustom;

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var item = target.closest('[data-action="set-note-sort"]');
        if (!item) return;

        event.preventDefault();
        setMode(item.getAttribute('data-sort-mode'));
    });
})();

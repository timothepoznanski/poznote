// ============================================================================
// Sidebar sort button (#1442)
// ============================================================================
// One global sort order for the whole tree, stepped through by the button at
// the top of the notes list the way the theme button steps through themes:
// a click moves to the next mode, the icon and the title name the mode now in
// use, and a short label says which one it is, since a reordered list does not
// announce itself.
//
// The mode lives in the `note_list_sort` setting. index.php renders the button
// from it, so a sidebar refresh brings the markup back in the right state and
// nothing here has to be re-bound: the click listener sits on the document.
//
// The order of MODES and the icons mirror poznoteNoteSortModes() and
// poznoteNoteSortIcon() in src/lib/note-sort.php. Keep the two in step.
//
// The five icons share their left half, the down arrow of lucide-arrow-down-a-z,
// and change only the mark on its right, so the button stays one control; the
// four composed classes are defined at the end of css/lucide.css.

(function () {
    'use strict';

    var MODES = ['heading_asc', 'updated_desc', 'created_desc', 'type_asc', 'manual'];

    var ICONS = {
        heading_asc: 'lucide-arrow-down-a-z',
        updated_desc: 'lucide-sort-date-modified',
        created_desc: 'lucide-sort-date-created',
        type_asc: 'lucide-sort-type',
        manual: 'lucide-sort-custom'
    };

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

    function nextMode(mode) {
        return MODES[(MODES.indexOf(normalize(mode)) + 1) % MODES.length];
    }

    // Paint the button before the request answers: the click has to feel like
    // the theme button, and a failure puts the previous mode back.
    function paint(button, mode) {
        mode = normalize(mode);
        var title = tr('sort.button_title', 'Sort by: {{mode}}', { mode: label(mode) });

        button.setAttribute('data-sort-mode', mode);
        button.setAttribute('title', title);
        button.setAttribute('aria-label', title);

        var icon = button.querySelector('i');
        if (icon) {
            icon.className = 'lucide ' + ICONS[mode];
        }
    }

    // Same toast as Ctrl+S and Ctrl+Alt+S: accent box at the top right, check
    // mark, one at a time.
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
        document.body.appendChild(toast);

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

    function cycle(button) {
        if (saving) return;

        var previous = normalize(button.getAttribute('data-sort-mode'));
        var mode = nextMode(previous);

        saving = true;
        paint(button, mode);
        showToast(tr('sort.button_title', 'Sort by: {{mode}}', { mode: label(mode) }));

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
                paint(button, previous);
                showError(tr('sort.save_failed', 'Could not change the sort order'));
            })
            .finally(function () { saving = false; });
    }

    // The mode the tree follows right now. The button carries it, and is
    // repainted by markCustom() without waiting for a reload, so it is a
    // truer source than the setting the page was rendered with. Callers use
    // it to tell a drop that places a row (Custom only) from a drop that just
    // moves it somewhere else (#1441).
    function currentMode() {
        var button = document.querySelector('[data-action="cycle-note-sort"]');
        if (button) return normalize(button.getAttribute('data-sort-mode'));
        return normalize(window.defaultNoteSortType);
    }

    window.poznoteNoteSortMode = currentMode;

    // A drop that reorders rows switches the tree to Custom server side
    // (enableManualNoteSort). Where the drop is applied in the DOM instead of
    // reloading the list, the button has to follow, or it keeps naming the
    // mode the tree just left.
    function markCustom() {
        // Kept in step for the pages where the button is hidden: it is what
        // currentMode() falls back to
        window.defaultNoteSortType = 'manual';

        var button = document.querySelector('[data-action="cycle-note-sort"]');
        if (!button || button.getAttribute('data-sort-mode') === 'manual') return;

        paint(button, 'manual');
        showToast(label('manual'));
    }

    window.markNoteSortCustom = markCustom;

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var button = target.closest('[data-action="cycle-note-sort"]');
        if (!button) return;

        event.preventDefault();
        cycle(button);
    });
})();

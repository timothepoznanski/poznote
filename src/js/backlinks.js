/**
 * Backlinks panel
 *
 * Displays, below the current note, every other note that links to it,
 * using the same row layout as the attachments row.
 *
 * Detection is performed server-side (BacklinksController).  Three formats
 * are supported:
 *   1. HTML internal-link attribute  — data-note-id="{id}"
 *   2. URL-based link                — ?note={id}
 *   3. Wiki-link syntax              — [[Note Title]]
 */
(function () {
    'use strict';

    /* --------------------------------------------------------------------- */
    /* Helpers                                                                 */
    /* --------------------------------------------------------------------- */

    /** Safely escape text for HTML insertion. */
    function esc(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(text)));
        return div.innerHTML;
    }

    /** Return the data-note-id of the first visible .noteentry element. */
    function getActiveNoteId() {
        var entry = document.querySelector('.noteentry[data-note-id]');
        return entry ? entry.getAttribute('data-note-id') : null;
    }

    /** Remove any existing backlinks row from the DOM. */
    function removePanel() {
        var existing = document.getElementById('backlinks-row');
        if (existing) {
            existing.remove();
        }
    }

    /* --------------------------------------------------------------------- */
    /* Rendering                                                               */
    /* --------------------------------------------------------------------- */

    /**
     * Build and inject the backlinks row immediately after .note-attachments-row,
     * mirroring the exact markup/class pattern of that row.
     * Falls back to inserting before the note title (<h4>) if the attachments
     * row is absent (notes with no attachments at all).
     * Does nothing if there are no backlinks.
     */
    function renderPanel(backlinks) {
        removePanel();

        if (backlinks.length === 0) {
            return;
        }

        // Preferred anchor: right after the attachments row
        var attachRow = document.querySelector('.note-attachments-row');
        // Fallback anchor: before the note title
        var titleEl = attachRow ? null : document.querySelector('.notecard h4');
        var anchor = attachRow || titleEl;

        if (!anchor) {
            return;
        }

        /* ── Icon button (mirrors .icon-attachment-btn) ───────────────────── */
        var iconBtn = document.createElement('span');
        iconBtn.className = 'icon-backlinks-btn';
        iconBtn.innerHTML = '<i class="lucide lucide-link icon_backlinks" aria-hidden="true"></i>';

        /* ── Links list (mirrors .note-attachments-list) ─────────────────── */
        var list = document.createElement('span');
        list.className = 'backlinks-links-list';

        backlinks.forEach(function (link) {
            var ws = (typeof selectedWorkspace !== 'undefined') ? selectedWorkspace : '';
            var href = 'index.php?note=' + encodeURIComponent(link.id) +
                       (ws ? '&workspace=' + encodeURIComponent(ws) : '');

            var a = document.createElement('a');
            a.href      = href;
            a.className = 'backlink-link';
            a.setAttribute('data-note-id', link.id);
            a.textContent = link.heading;

            /* Use AJAX navigation when available */
            a.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof window.loadNoteDirectly === 'function') {
                    window.loadNoteDirectly(href, String(link.id), e, a);
                } else {
                    window.location.href = href;
                }
            });

            list.appendChild(a);
        });

        /* ── Row (mirrors .note-attachments-row) ─────────────────────────── */
        var row = document.createElement('div');
        row.id        = 'backlinks-row';
        row.className = 'backlinks-row';
        row.appendChild(iconBtn);
        row.appendChild(list);

        // Insert after the attachments row, or before the title as fallback
        if (attachRow) {
            attachRow.parentNode.insertBefore(row, attachRow.nextSibling);
        } else {
            titleEl.parentNode.insertBefore(row, titleEl);
        }
    }

    /* --------------------------------------------------------------------- */
    /* Data fetching                                                           */
    /* --------------------------------------------------------------------- */

    function loadBacklinks(noteId) {
        removePanel();

        fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/backlinks', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (response) {
            return response.ok ? response.json() : null;
        })
        .then(function (data) {
            if (data && data.success) {
                renderPanel(data.backlinks || []);
            }
        })
        .catch(function () {
            /* Backlinks are non-critical — fail silently */
        });
    }

    /* --------------------------------------------------------------------- */
    /* Public API                                                              */
    /* --------------------------------------------------------------------- */

    /**
     * (Re-)initialise the backlinks row for the currently displayed note.
     * Called on initial page load and after each AJAX note load.
     */
    function initBacklinksPanel() {
        var noteId = getActiveNoteId();
        if (noteId) {
            loadBacklinks(noteId);
        }
    }

    window.initBacklinksPanel = initBacklinksPanel;

    /* Initial page load: note content is server-rendered */
    document.addEventListener('DOMContentLoaded', function () {
        initBacklinksPanel();
    });

}());

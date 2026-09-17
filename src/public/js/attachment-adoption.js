/**
 * Editor side of lib/attachment-adoption.php.
 *
 * When a save finds, in the note, the address of an attachment that belongs
 * to another note or another account (content pasted from elsewhere), the
 * server copies the file into this note and stores the rewritten address. The
 * editor still holds the old one: the picture stays broken until a reload,
 * and every later save sends the stale address again. The save answer lists
 * what changed (adopted_attachments: [{ url, id, new_url }]); this swaps those
 * addresses in place, in the HTML of a rich-text note or in the source of a
 * markdown note, without touching anything typed meanwhile.
 *
 * Called by saveNoteToServer() (js/notes.js) BEFORE it records the saved
 * state, so the swap is not taken for a new edit.
 */
(function () {
    'use strict';

    function ownAddress(noteId, attachmentId) {
        return '/api/v1/notes/' + noteId + '/attachments/' + attachmentId;
    }

    function applyToMarkdown(noteId, replacements) {
        if (typeof window.getMarkdownContentForNote !== 'function' || typeof window.replaceMarkdownNoteContent !== 'function') {
            return false;
        }
        var source = window.getMarkdownContentForNote(noteId);
        if (typeof source !== 'string') return false;
        var updated = source;
        // Longest first: an address with a query string contains the bare one.
        Object.keys(replacements).sort(function (a, b) { return b.length - a.length; }).forEach(function (url) {
            updated = updated.split(url).join(replacements[url]);
        });
        if (updated === source) return false;
        window.replaceMarkdownNoteContent(noteId, updated);
        return true;
    }

    function applyToHtml(entry, replacements) {
        var changed = false;
        entry.querySelectorAll('[src], [href], [poster]').forEach(function (el) {
            ['src', 'href', 'poster'].forEach(function (attr) {
                var value = el.getAttribute(attr);
                if (value !== null && Object.prototype.hasOwnProperty.call(replacements, value)) {
                    el.setAttribute(attr, replacements[value]);
                    changed = true;
                }
            });
        });
        return changed;
    }

    window.poznoteApplyAdoptedAttachments = function (noteId, adopted) {
        if (!Array.isArray(adopted) || !adopted.length) return false;
        var entry = document.getElementById('entry' + noteId);
        if (!entry) return false;

        var replacements = {};
        adopted.forEach(function (item) {
            if (item && typeof item.url === 'string' && item.url !== '' && item.id) {
                replacements[item.url] = typeof item.new_url === 'string' && item.new_url !== ''
                    ? item.new_url
                    : ownAddress(noteId, String(item.id));
            }
        });

        try {
            var changed = entry.getAttribute('data-note-type') === 'markdown'
                ? applyToMarkdown(noteId, replacements)
                : applyToHtml(entry, replacements);
            // The note now shows files it did not list before.
            if (changed && typeof window.refreshAttachmentPreviewsForNote === 'function') {
                try { window.refreshAttachmentPreviewsForNote(noteId); } catch (e) { /* cosmetic */ }
            }
            return changed;
        } catch (e) {
            console.debug('attachment-adoption: could not swap addresses:', e);
            return false;
        }
    };
})();

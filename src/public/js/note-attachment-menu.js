/**
 * Right-click menu on an attachment inside a note: open, download, transcribe
 * (audio only, and only when a speech-to-text server is configured), move to
 * another note and delete.
 *
 * An attachment shows up in a note in several shapes, all covered here:
 *   - a link to it, in a rich-text note or in the Markdown preview
 *   - a <video> embed
 *   - an audio embed, which is an iframe on audio_player.php (Chrome renders
 *     no <audio> controls inside contenteditable). A right-click there never
 *     reaches this document, so the player forwards it to
 *     window.openNoteAttachmentMenuFromFrame()
 *   - the preview cards js/attachments.js renders for attachments the note
 *     does not reference
 *
 * Images are left alone: a click on one already opens the image menu
 * (js/note-image-menu.js), which has the same actions, and the right-click
 * keeps the browser's "copy image".
 */
(function () {
    'use strict';

    var ATTACHMENT_PATH = /^\/api\/v1\/notes\/(\d+)\/attachments\/([A-Za-z0-9_-]+)\/?$/;

    var menuEl = null;
    // Every opening gets a number: the menu waits for the attachment's
    // metadata, and a right-click somewhere else in the meantime wins.
    var openToken = 0;
    // noteId -> Promise resolving to that note's attachment list (null on failure)
    var listCache = {};

    function t(key, vars, fallback) {
        return (typeof window.t === 'function') ? window.t(key, vars, fallback) : fallback;
    }

    /** {noteId, attachmentId} for a same-origin attachment URL, or null. */
    function parseAttachmentUrl(value) {
        if (!value) return null;
        try {
            var url = new URL(value, window.location.origin);
            if (url.origin !== window.location.origin) return null;
            var match = url.pathname.match(ATTACHMENT_PATH);
            return match ? { noteId: match[1], attachmentId: match[2] } : null;
        } catch (e) {
            return null;
        }
    }

    function parseAudioPlayerUrl(value) {
        if (!value) return null;
        try {
            var url = new URL(value, window.location.origin);
            if (url.origin !== window.location.origin || !url.pathname.endsWith('/audio_player.php')) return null;
            var noteId = url.searchParams.get('note');
            var attachmentId = url.searchParams.get('attachment');
            if (!/^\d+$/.test(noteId || '') || !/^[A-Za-z0-9_-]+$/.test(attachmentId || '')) return null;
            return { noteId: noteId, attachmentId: attachmentId };
        } catch (e) {
            return null;
        }
    }

    function hostNoteIdOf(noteEntry) {
        if (!noteEntry) return null;
        return noteEntry.getAttribute('data-note-id') || String(noteEntry.id || '').replace(/^entry/, '') || null;
    }

    /**
     * What was right-clicked, when it is an attachment: which one, which note
     * shows it, and the element the transcript should follow.
     */
    function describeTarget(node) {
        if (!node || !node.closest) return null;

        var card = node.closest('.note-attachment-preview[data-attachment-id]');
        var cards = card ? card.closest('.note-attachment-previews[data-note-id]') : null;
        if (card && cards) {
            var nameEl = card.querySelector('.note-attachment-preview-file-name, .note-attachment-preview-caption a');
            return {
                noteId: cards.getAttribute('data-note-id'),
                attachmentId: card.getAttribute('data-attachment-id'),
                hostNoteId: cards.getAttribute('data-note-id'),
                filename: nameEl ? nameEl.textContent.trim() : '',
                anchor: card
            };
        }

        // The file names row above (or below) the note, shown when previews are off
        var rowLink = node.closest('.note-attachments-row a.attachment-link[data-attachment-id]');
        if (rowLink) {
            var rowNoteId = rowLink.getAttribute('data-note-id') ||
                String((rowLink.closest('[id^="note"]') || {}).id || '').replace(/^note/, '');
            if (!/^\d+$/.test(rowNoteId)) return null;
            return {
                noteId: rowNoteId,
                attachmentId: rowLink.getAttribute('data-attachment-id'),
                hostNoteId: rowNoteId,
                filename: rowLink.textContent.trim(),
                anchor: rowLink
            };
        }

        var noteEntry = node.closest('.noteentry');
        // The Markdown source is plain text: nothing there is a link to click
        if (!noteEntry || node.closest('.cm-editor, .markdown-editor')) return null;

        var link = node.closest('a[href]');
        var ref = link ? parseAttachmentUrl(link.getAttribute('href')) : null;
        var anchor = link;
        var filename = link ? link.textContent.trim() : '';

        if (!ref) {
            var media = node.closest('video, audio');
            if (media) {
                var source = media.querySelector('source[src]');
                ref = parseAttachmentUrl(media.getAttribute('src') || (source && source.getAttribute('src')));
                anchor = media;
                filename = '';
            }
        }
        if (!ref) return null;

        ref.hostNoteId = hostNoteIdOf(noteEntry);
        ref.filename = filename;
        ref.anchor = anchor;
        return ref;
    }

    function describeFrame(frame) {
        if (!frame || !frame.closest) return null;
        var ref = parseAudioPlayerUrl(frame.getAttribute('src')) || parseAttachmentUrl(frame.getAttribute('data-audio-src'));
        if (!ref) return null;

        var cards = frame.closest('.note-attachment-previews[data-note-id]');
        var noteEntry = frame.closest('.noteentry');
        if (!cards && !noteEntry) return null;

        var card = frame.closest('.note-attachment-preview');
        ref.hostNoteId = cards ? cards.getAttribute('data-note-id') : hostNoteIdOf(noteEntry);
        ref.filename = frame.getAttribute('title') || '';
        ref.anchor = card || frame;
        return ref;
    }

    function loadNoteAttachments(noteId, refresh) {
        if (!refresh && listCache[noteId]) return listCache[noteId];

        var request = fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/attachments', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (data) { return (data && data.success && Array.isArray(data.attachments)) ? data.attachments : null; })
            .catch(function () { return null; });

        listCache[noteId] = request;
        request.then(function (list) {
            // A failure is not worth remembering
            if (list === null && listCache[noteId] === request) delete listCache[noteId];
        });
        return request;
    }

    /** The attachment's record, or null when the note does not have it (or the list failed). */
    function findAttachment(noteId, attachmentId) {
        function pick(list) {
            if (!list) return null;
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].id === attachmentId) return list[i];
            }
            return null;
        }
        var cached = !!listCache[noteId];
        return loadNoteAttachments(noteId, false).then(function (list) {
            var found = pick(list);
            // Uploaded after the list was cached
            if (!found && cached) return loadNoteAttachments(noteId, true).then(pick);
            return found;
        });
    }

    function canTranscribe(attachment) {
        return !!(attachment &&
            window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.speechToText &&
            typeof window.transcribeAttachment === 'function' &&
            typeof window.isAudioAttachment === 'function' &&
            window.isAudioAttachment(attachment));
    }

    function canDelete(target, attachment) {
        if (!attachment || String(target.hostNoteId) !== String(target.noteId)) return false;
        if (typeof window.deleteAttachment !== 'function') return false;
        return !(typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(target.noteId));
    }

    /** Same conditions as deleting: it takes the attachment out of this note. */
    function canMove(target, attachment) {
        if (!attachment || String(target.hostNoteId) !== String(target.noteId)) return false;
        if (typeof window.openAttachmentMoveDialog !== 'function') return false;
        return !(typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(target.noteId));
    }

    function attachmentUrl(target, forceDownload) {
        if (typeof window.buildAttachmentPreviewUrl === 'function') {
            return window.buildAttachmentPreviewUrl(target.noteId, target.attachmentId, forceDownload);
        }
        return '/api/v1/notes/' + encodeURIComponent(target.noteId) + '/attachments/' +
            encodeURIComponent(target.attachmentId) + (forceDownload ? '?download=1' : '');
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    function openAttachment(target) {
        window.open(attachmentUrl(target, false), '_blank', 'noopener');
    }

    function downloadAttachmentFile(target) {
        var link = document.createElement('a');
        link.href = attachmentUrl(target, true);
        // Empty: the server's Content-Disposition carries the real file name,
        // the link text is only a label
        link.setAttribute('download', '');
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function transcribe(target) {
        var inNote = target.anchor && target.anchor.closest && target.anchor.closest('.noteentry');
        window.transcribeAttachment(target.noteId, target.attachmentId, target.filename, inNote ? target.anchor : null);
    }

    /**
     * Hand the attachment to another note (js/attachment-move.js), then bring
     * both notes back in line with what they hold now: the one it left no
     * longer shows it, unless its own content still uses the file, and the one
     * it joined does.
     */
    function moveToAnotherNote(target) {
        var workspace = '';
        if (typeof window.getSelectedWorkspace === 'function') {
            workspace = window.getSelectedWorkspace() || '';
        }

        window.openAttachmentMoveDialog({
            noteId: target.noteId,
            attachmentId: target.attachmentId,
            workspace: workspace,
            filename: target.filename,
            onMoved: function (result) {
                [result.sourceNoteId, result.targetNoteId].forEach(function (noteId) {
                    delete listCache[noteId];
                    if (typeof window.refreshAttachmentPreviewsForNote === 'function') {
                        window.refreshAttachmentPreviewsForNote(noteId);
                    }
                    if (typeof window.updateAttachmentCountInMenu === 'function') {
                        window.updateAttachmentCountInMenu(noteId);
                    }
                });

                if (window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.gitSyncAutoPush &&
                    typeof window.setNeedsAutoPush === 'function') {
                    window.setNeedsAutoPush(true);
                }

                if (typeof window.showNotificationPopup === 'function') {
                    var message = t('attachments.messages.moved_success', { heading: result.targetNoteHeading },
                        'Attachment moved to "{{heading}}"');
                    if (result.keptInSource) {
                        message += ' ' + t('attachments.move.kept_notice', null,
                            'A copy stays in this note, whose content uses the file.');
                    }
                    window.showNotificationPopup(message, 'success');
                }
            }
        });
    }

    function confirmDelete(target) {
        var title = t('attachments.context_menu.delete_confirm_title', null, 'Delete attachment');
        var message = target.filename
            ? t('attachments.context_menu.delete_confirm_message', { filename: target.filename }, 'Delete "{{filename}}"? It is removed from the note and cannot be recovered.')
            : t('attachments.context_menu.delete_confirm_message_unnamed', null, 'Delete this attachment? It is removed from the note and cannot be recovered.');

        var answer = (window.modalAlert && typeof window.modalAlert.confirm === 'function')
            ? window.modalAlert.confirm(message, title, {
                alertType: 'warning',
                confirmText: t('attachments.context_menu.delete', null, 'Delete'),
                confirmButtonClass: 'danger'
            })
            : Promise.resolve(window.confirm(message));

        answer.then(function (confirmed) {
            if (!confirmed) return;
            delete listCache[target.noteId];
            window.deleteAttachment(target.attachmentId, target.noteId);
        });
    }

    // ------------------------------------------------------------------
    // The menu
    // ------------------------------------------------------------------

    function closeMenu() {
        openToken++;
        if (menuEl) {
            menuEl.remove();
            menuEl = null;
        }
    }

    function addItem(menu, action, icon, label, extraClass) {
        var item = document.createElement('div');
        item.className = 'image-menu-item' + (extraClass ? ' ' + extraClass : '');
        item.setAttribute('role', 'menuitem');
        item.setAttribute('data-action', action);
        var i = document.createElement('i');
        i.className = 'lucide ' + icon;
        item.appendChild(i);
        item.appendChild(document.createTextNode(label));
        menu.appendChild(item);
    }

    function placeMenu(menu, x, y) {
        var padding = 8;
        var rect = menu.getBoundingClientRect();
        var left = x;
        var top = y;
        if (left + rect.width > window.innerWidth - padding) left = x - rect.width;
        if (top + rect.height > window.innerHeight - padding) top = y - rect.height;
        menu.style.left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding)) + 'px';
        menu.style.top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding)) + 'px';
    }

    function showMenu(target, attachment, x, y) {
        closeMenu();

        var menu = document.createElement('div');
        menu.className = 'image-menu note-attachment-menu';
        menu.setAttribute('role', 'menu');
        menu.style.position = 'fixed';
        menu.style.zIndex = '10000';

        addItem(menu, 'open', 'lucide-external-link', t('attachments.context_menu.open', null, 'Open'));
        addItem(menu, 'download', 'lucide-download', t('attachments.context_menu.download', null, 'Download'));
        if (canTranscribe(attachment)) {
            addItem(menu, 'transcribe', 'lucide-mic', t('attachments.context_menu.transcribe', null, 'Transcribe'));
        }
        if (canMove(target, attachment)) {
            addItem(menu, 'move', 'lucide-file-output', t('attachments.context_menu.move', null, 'Move to another note'));
        }
        if (canDelete(target, attachment)) {
            addItem(menu, 'delete', 'lucide-trash-2', t('attachments.context_menu.delete', null, 'Delete'), 'image-menu-item-danger');
        }

        // A link's text is only a label; the record has the real name
        if (attachment && attachment.original_filename) {
            target.filename = attachment.original_filename;
        }

        menu.addEventListener('mousedown', function (event) {
            // Keep the caret (and a rich-text selection) where it is
            event.preventDefault();
        });
        menu.addEventListener('click', function (event) {
            var item = event.target.closest('.image-menu-item');
            if (!item) return;
            event.stopPropagation();
            var action = item.getAttribute('data-action');
            closeMenu();
            if (action === 'open') openAttachment(target);
            else if (action === 'download') downloadAttachmentFile(target);
            else if (action === 'transcribe') transcribe(target);
            else if (action === 'move') moveToAnotherNote(target);
            else if (action === 'delete') confirmDelete(target);
        });

        document.body.appendChild(menu);
        placeMenu(menu, x, y);
        menuEl = menu;
    }

    /** Resolve the attachment, then show the menu unless something else happened meanwhile. */
    function openFor(target, x, y) {
        closeMenu();
        var token = openToken;
        findAttachment(target.noteId, target.attachmentId).then(function (attachment) {
            if (token !== openToken) return;
            showMenu(target, attachment, x, y);
        });
    }

    document.addEventListener('contextmenu', function (event) {
        if (menuEl && menuEl.contains(event.target)) {
            event.preventDefault();
            return;
        }

        var target = describeTarget(event.target);
        if (!target) {
            closeMenu();
            return;
        }

        // Text selected across the link: the browser's menu is the one that copies it
        var sel = window.getSelection ? window.getSelection() : null;
        if (target.anchor.tagName === 'A' && sel && !sel.isCollapsed && sel.rangeCount > 0 &&
            sel.getRangeAt(0).intersectsNode(target.anchor)) {
            return;
        }

        event.preventDefault();
        // Ahead of the table menu when the link sits in a cell
        event.stopPropagation();
        openFor(target, event.clientX, event.clientY);
    }, true);

    document.addEventListener('mousedown', function (event) {
        if (menuEl && !menuEl.contains(event.target)) closeMenu();
    }, true);

    document.addEventListener('keydown', function (event) {
        if (menuEl && event.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', function () { if (menuEl) closeMenu(); });
    document.addEventListener('scroll', function (event) {
        if (menuEl && !menuEl.contains(event.target)) closeMenu();
    }, true);

    /**
     * Called by audio_player.php from inside its iframe. Returns true when the
     * right-click was taken, so the player suppresses the browser's own menu.
     */
    window.openNoteAttachmentMenuFromFrame = function (frame, clientX, clientY) {
        var target = describeFrame(frame);
        if (!target) return false;
        var rect = frame.getBoundingClientRect();
        openFor(target, rect.left + clientX, rect.top + clientY);
        return true;
    };

    window.closeNoteAttachmentMenu = function () {
        if (menuEl) closeMenu();
    };
})();

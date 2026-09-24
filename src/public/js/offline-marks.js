/**
 * The notes and folders this browser keeps offline, marked on the pages that
 * list them (notes_manager.php, list_folders.php): a note it holds a copy of,
 * a folder kept whole ("Keep offline", or under one). Read from the copies
 * of js/offline-store.js, so a mark says what opens here without a network,
 * as the "Available offline in this browser" line of a note's menu does.
 *
 * The lists are built or rebuilt by their own scripts (a filter redraws the
 * notes manager): new rows are marked as they appear.
 */
(function () {
    'use strict';

    var script = document.currentScript;
    var NOTE_TITLE = (script && script.getAttribute('data-note-title')) || 'Available offline in this browser';
    var FOLDER_TITLE = (script && script.getAttribute('data-folder-title')) || 'Kept offline in this browser';

    function readCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function makeMark(title) {
        var mark = document.createElement('i');
        mark.className = 'lucide lucide-wifi-off offline-mark';
        mark.title = title;
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', title);
        return mark;
    }

    var notes = {};
    var folders = {};

    function markAll() {
        // Notes manager: note rows, and the folder of each group
        document.querySelectorAll('.nm-note-row[data-note-id]').forEach(function (row) {
            var wrap = row.querySelector('.nm-note-title-wrap');
            if (wrap && notes[row.getAttribute('data-note-id')] && !wrap.querySelector('.offline-mark')) {
                wrap.appendChild(makeMark(NOTE_TITLE));
            }
        });
        document.querySelectorAll('.nm-folder-header[data-folder-id]').forEach(function (header) {
            var label = header.querySelector('.nm-folder-label');
            if (label && folders[header.getAttribute('data-folder-id')] && !label.querySelector('.offline-mark')) {
                label.appendChild(makeMark(FOLDER_TITLE));
            }
        });
        // Folders list: the id sits on the row's action buttons
        document.querySelectorAll('.folder-item').forEach(function (row) {
            var idHolder = row.querySelector('[data-folder-id]');
            var name = row.querySelector('.folder-name-text');
            if (idHolder && name && folders[idHolder.getAttribute('data-folder-id')] && !name.querySelector('.offline-mark')) {
                name.appendChild(makeMark(FOLDER_TITLE));
            }
        });
    }

    // Reads the copies again and redraws every mark: after the copies
    // changed (the bulk actions of the notes manager call it).
    function refresh() {
        var Store = window.PoznoteOffline;
        if (!Store || !Store.isSupported()) {
            return Promise.resolve();
        }
        // Note and folder ids belong to one account: the page must show the
        // account whose copies this browser holds (not one opened through a
        // grant or a shared workspace)
        var pageAccount = Number(readCookie('poznote_account') || 0);
        return Store.getMeta('current').then(function (current) {
            if (!pageAccount || !current || Number(current.userId) !== pageAccount) {
                return null;
            }
            return Promise.all([Store.getAccount(pageAccount), Store.getNotes(pageAccount), Store.getIndex(pageAccount)]);
        }).then(function (all) {
            notes = {};
            folders = {};
            if (all && all[0] && all[0].days) {
                (all[1] || []).forEach(function (note) { notes[String(note.id)] = true; });
                ((all[2] && all[2].keptFolders) || []).forEach(function (id) { folders[String(id)] = true; });
            }
            document.querySelectorAll('.offline-mark').forEach(function (mark) { mark.remove(); });
            markAll();
        }).catch(function (e) {
            console.debug('offline-marks: the offline copies could not be read:', e);
        });
    }

    function start() {
        refresh().then(function () {
            var pending = false;
            new MutationObserver(function () {
                if (pending) {
                    return;
                }
                pending = true;
                window.requestAnimationFrame(function () {
                    pending = false;
                    markAll();
                });
            }).observe(document.body, { childList: true, subtree: true });
        });
    }

    window.poznoteOfflineMarksRefresh = refresh;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

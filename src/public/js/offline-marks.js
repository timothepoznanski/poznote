/**
 * The notes and folders this browser keeps offline, marked on the pages that
 * list them (notes_manager.php, list_folders.php, and the notes tree of
 * index.php, folders included, while the sidebar_offline_marks setting is on,
 * which the dot button of the tree toggles without a reload):
 * a note it holds a copy of, a folder kept whole ("Keep offline", or under one). Read from the copies
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
    // The dots of index.php's tree (sidebar_offline_marks); the other pages
    // always mark their lists
    var sidebarShown = !script || script.getAttribute('data-sidebar') !== 'off';

    function readCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    // A small accent dot rather than an icon: discreet next to a title
    function makeMark(title) {
        var mark = document.createElement('span');
        mark.className = 'offline-mark';
        mark.title = title;
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', title);
        return mark;
    }

    var notes = {};
    var folders = {};

    function markAll() {
        if (sidebarShown) {
            markTree();
        }
        markPages();
    }

    // The Favorites section of the tree (notes_list.php): its rows repeat
    // notes and folders shown further down, which carry the dot there
    var FAVORITES_SECTION = '.folder-header.system-folder[data-folder="Favorites"]';

    function markTree() {
        // Notes tree of index.php, Favorites left out: after the title,
        // inside the link, so a click on the mark opens the note
        document.querySelectorAll('#left_col .note-list-item > a.links_arbo_left[data-note-id]').forEach(function (link) {
            if (notes[link.getAttribute('data-note-id')] && !link.querySelector('.offline-mark') && !link.closest(FAVORITES_SECTION)) {
                link.appendChild(makeMark(NOTE_TITLE));
                link.classList.add('has-offline-mark');
            }
        });
        // Folders of the notes tree: between the name and the note count,
        // outside the name, which scrolls on mobile
        document.querySelectorAll('#left_col .folder-toggle[data-folder-id] > .folder-name').forEach(function (name) {
            var next = name.nextElementSibling;
            if (folders[name.parentNode.getAttribute('data-folder-id')] && !(next && next.classList.contains('offline-mark'))) {
                name.insertAdjacentElement('afterend', makeMark(FOLDER_TITLE));
            }
        });
    }

    function markPages() {
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
            document.querySelectorAll('.has-offline-mark').forEach(function (link) { link.classList.remove('has-offline-mark'); });
            markAll();
        }).catch(function (e) {
            console.debug('offline-marks: the offline copies could not be read:', e);
        });
    }

    function start() {
        refresh().then(function () {
            // index.php redraws only its notes tree (the editor next to it
            // changes on every key)
            var watched = document.getElementById('left_col') || document.body;
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
            }).observe(watched, { childList: true, subtree: true });
        });
    }

    window.poznoteOfflineMarksRefresh = refresh;

    // The dot button of the tree (index.php): shows or hides the dots at
    // once, then saves the setting; a failure puts the previous state back.
    function paintDotsButton(button, shown) {
        var title = button.getAttribute(shown ? 'data-title-hide' : 'data-title-show') || '';
        button.classList.toggle('is-on', shown);
        button.setAttribute('aria-pressed', shown ? 'true' : 'false');
        button.setAttribute('title', title);
        button.setAttribute('aria-label', title);
    }

    function setSidebarShown(shown) {
        sidebarShown = shown;
        document.querySelectorAll('[data-action="toggle-offline-dots"]').forEach(function (button) {
            paintDotsButton(button, shown);
        });
        return refresh();
    }

    var savingDots = false;
    document.addEventListener('click', function (event) {
        var button = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('[data-action="toggle-offline-dots"]')
            : null;
        if (!button || savingDots) {
            return;
        }
        event.preventDefault();
        var previous = sidebarShown;
        savingDots = true;
        setSidebarShown(!previous);
        fetch('/api/v1/settings/sidebar_offline_marks', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ value: previous ? '0' : '1' })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) {
                    throw new Error('save rejected');
                }
            })
            .catch(function (e) {
                console.error('offline-marks: the offline dots setting could not be saved', e);
                setSidebarShown(previous);
            })
            .then(function () {
                savingDots = false;
            });
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

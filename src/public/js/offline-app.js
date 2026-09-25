/**
 * The offline page (offline.php).
 *
 * The service worker serves this page when Poznote is opened and the server
 * cannot be reached. Everything here works from what the browser kept
 * (js/offline-store.js, filled by js/offline-sync.js while online):
 *
 *  - offline sign-in: the password is checked against the verifier kept at
 *    the last password sign-in on this device. An account with no password
 *    typed here (SSO, remember-me) has nothing to check: it continues
 *    directly, but only while it is the last account signed in on the device
 *    (its copies are forgotten at sign-out);
 *  - tabs: the app's tab bar (js/tabs.js), loaded once the account is open,
 *    with a window.loadNoteDirectly that opens the local copies and the two
 *    hooks the app's note loader calls; double-click or middle-click opens
 *    a note in a new tab, as in the app;
 *  - sign-out, from the Logout button or a logout.php that could not reach
 *    the server: the device forgets the account's copies at once, the
 *    server session is closed when the server answers;
 *  - the interface of index.php: same sidebar and note markup, and the app's
 *    own editor modules (formatting toolbar, CodeMirror markdown editor and
 *    preview, task lists, search and replace), loaded by offline.php. This
 *    file only builds the markup the server would have rendered, dispatches
 *    the toolbar actions that work without a server, and stands in for the
 *    autosave: every change is saved on the device (outbox);
 *  - only the notes kept offline are listed; a link to any other one says it
 *    will open once the connection is back;
 *  - the way back: the page watches the connection and, when the server
 *    answers again, sends the changes (conflicts end up as a copy, nothing
 *    is overwritten) and offers to return to the app.
 */
(function () {
    'use strict';

    var Store = window.PoznoteOffline;
    var UNLOCK_KEY = 'poznote_offline_unlocked';
    var SIGNED_OUT_KEY = 'poznote_offline_signed_out';
    var AUTO_RELOAD_KEY = 'poznote_offline_auto_reload_at';
    var SAVE_DELAY_MS = 400;
    var PUSH_DELAY_MS = 3000;
    var PROBE_INTERVAL_MS = 20000;
    var NOTE_ICONS = { note: 'lucide-file-text', markdown: 'lucide-file-code', tasklist: 'lucide-list-todo' };

    var state = {
        accounts: [],
        account: null,
        userId: null,
        currentUserId: 0,
        index: { notes: [], folders: [], workspaces: [], days: 0 },
        folders: {},
        server: {},
        outbox: {},
        idMap: {},
        workspace: '',
        search: '',
        closedFolders: {},
        currentId: null,
        dirtyId: null,
        tabsStarted: false,
        lastOpen: null,
        cachedFiles: {},
        saveTimer: null,
        online: false,
        pushing: false,
        pushTimer: null,
        failedSignIns: 0
    };

    // ---- Helpers -------------------------------------------------------------

    // App strings (editor.toolbar.*, tasklist.*...) and the offline.* ones,
    // from the dictionary embedded by offline.php (js/offline-boot.js).
    function t(key, vars, fallback) {
        return window.t(key, vars || null, fallback);
    }

    function ot(key, vars, fallback) {
        return t('offline.' + key, vars, fallback);
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }

    function icon(classes) {
        var node = el('i', 'lucide ' + classes);
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    function values(map) {
        return Object.keys(map).map(function (key) { return map[key]; });
    }

    function fold(text) {
        return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function parseServerDate(value) {
        if (!value) {
            return null;
        }
        var date = new Date(String(value).replace(' ', 'T') + 'Z');
        return isNaN(date.getTime()) ? null : date;
    }

    function isNarrow() {
        return window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
    }

    function show(sectionId) {
        var screen = byId('offline-screen');
        ['offline-loading', 'offline-signin', 'offline-empty'].forEach(function (id) {
            byId(id).hidden = id !== sectionId;
        });
        screen.hidden = sectionId === 'app';
        document.body.classList.toggle('offline-app-open', sectionId === 'app');
    }

    function readUnlocked() {
        try {
            return Number(window.sessionStorage.getItem(UNLOCK_KEY) || 0);
        } catch (e) {
            return 0;
        }
    }

    function writeUnlocked(userId) {
        try {
            if (userId) {
                window.sessionStorage.setItem(UNLOCK_KEY, String(userId));
            } else {
                window.sessionStorage.removeItem(UNLOCK_KEY);
            }
        } catch (e) {
            console.debug('offline-app: writeUnlocked() failed:', e);
        }
    }

    function requestedNoteId() {
        try {
            var id = Number(new URLSearchParams(window.location.search).get('note') || 0);
            return id > 0 ? id : null;
        } catch (e) {
            return null;
        }
    }

    // The account's display preferences, captured on index.php at the last
    // sync (js/offline-sync.js): body classes, markdown view mode, sizes.
    function applyDisplay(display) {
        if (!display) {
            return;
        }
        (display.bodyClasses || []).forEach(function (name) {
            document.body.classList.add(name);
        });
        if (display.markdownDefaultMode) {
            document.body.setAttribute('data-markdown-default-mode', display.markdownDefaultMode);
        }
        var vars = display.rootVars || {};
        Object.keys(vars).forEach(function (name) {
            if (vars[name]) {
                document.documentElement.style.setProperty(name, vars[name]);
            }
        });
        // The slash menu (js/slash-command.js) reads its key from the page
        // config and the hidden commands from UI Customization, as in the app
        if (display.slashMenuTrigger || display.slashMenuTriggerMobile) {
            var configEl = byId('page-config-data');
            try {
                var config = JSON.parse(configEl.textContent || '{}') || {};
                config.settings = config.settings || {};
                if (display.slashMenuTrigger) {
                    config.settings.slash_menu_trigger = display.slashMenuTrigger;
                }
                if (display.slashMenuTriggerMobile) {
                    config.settings.slash_menu_trigger_mobile = display.slashMenuTriggerMobile;
                }
                configEl.textContent = JSON.stringify(config);
            } catch (e) {
                console.debug('offline-app: the slash menu setting could not be applied:', e);
            }
        }
        if (Array.isArray(display.hiddenSlashCommands) && display.hiddenSlashCommands.length && !window.PoznoteUiCustomization) {
            var hidden = Object.create(null);
            display.hiddenSlashCommands.forEach(function (key) { hidden[key] = true; });
            window.PoznoteUiCustomization = {
                hiddenKeyMap: hidden,
                isHidden: function (key) { return !!hidden[key]; }
            };
        }
    }

    // ---- Sign-in ---------------------------------------------------------------

    function showSignIn() {
        var withPassword = state.accounts.filter(function (account) { return !!account.verifier; });
        // Without a password to check, only the account last signed in on
        // this device opens (it never signed out here). js/offline-sync.js
        // forgets the others when another account signs in.
        var withoutPassword = state.accounts.filter(function (account) {
            return !account.verifier && Number(account.userId) === state.currentUserId;
        });

        var form = byId('offline-signin-form');
        form.hidden = withPassword.length === 0;
        if (withPassword.length === 1) {
            byId('offline-username').value = withPassword[0].username || withPassword[0].email || '';
        }

        var list = byId('offline-continue-list');
        list.textContent = '';
        withoutPassword.forEach(function (account) {
            var button = el('button', 'btn btn-secondary offline-continue-btn',
                ot('signin.continue', { name: account.displayName || account.username }, 'Continue as {{name}}'));
            button.type = 'button';
            button.addEventListener('click', function () {
                unlock(account);
            });
            list.appendChild(button);
        });
        byId('offline-continue').hidden = withoutPassword.length === 0;

        show('offline-signin');
        if (!form.hidden) {
            (byId('offline-username').value ? byId('offline-password') : byId('offline-username')).focus();
        }
    }

    function signInError(message) {
        var error = byId('offline-signin-error');
        error.textContent = message;
        error.hidden = !message;
    }

    function onSignInSubmit(event) {
        event.preventDefault();
        var login = byId('offline-username').value.trim();
        var passwordField = byId('offline-password');
        var submit = byId('offline-signin-submit');
        var account = state.accounts.filter(function (candidate) {
            return candidate.verifier && Store.loginMatchesAccount(login, candidate);
        })[0];
        if (!account) {
            signInError(ot('signin.unknown_account', null, 'The notes of this account are not kept on this device.'));
            return;
        }

        var label = submit.textContent;
        submit.disabled = true;
        submit.textContent = ot('signin.checking', null, 'Checking…');
        signInError('');
        Store.checkVerifier(account.verifier, passwordField.value).then(function (ok) {
            if (ok) {
                state.failedSignIns = 0;
                passwordField.value = '';
                unlock(account);
                return null;
            }
            state.failedSignIns++;
            signInError(ot('signin.wrong_password', null, 'Incorrect password. Use the password you last signed in with on this device.'));
            passwordField.select();
            submit.textContent = label;
            // Each failure waits a little longer before the next try.
            return new Promise(function (resolve) {
                setTimeout(resolve, Math.min(state.failedSignIns, 5) * 1000);
            });
        }).catch(function (e) {
            console.debug('offline-app: checkVerifier() failed:', e);
            signInError(ot('signin.wrong_password', null, 'Incorrect password. Use the password you last signed in with on this device.'));
        }).then(function () {
            submit.disabled = false;
            submit.textContent = label;
        });
    }

    function unlock(account) {
        writeUnlocked(account.userId);
        openAccount(account);
    }

    // ---- Sign-out ------------------------------------------------------------

    // Same outcome as the app's logout (js/offline-login.js): everything this
    // account left on the device goes, changes not sent yet included (the
    // callers warn first, see confirmLosingChanges). The server session is
    // closed now if the server answers, otherwise the next time the app
    // opens online: the "signedOut" mark sends it to logout.php
    // (js/offline-sync.js).
    function signOut() {
        var userId = state.userId || state.currentUserId;
        return commitDirty().then(function () {
            writeUnlocked(0);
            return Store.setMeta('signedOut', { userId: userId, at: Date.now() });
        }).then(function () {
            return userId ? Store.forgetAccount(userId, { withOutbox: true }) : null;
        }).then(function () {
            return Store.deleteMeta('current');
        }).then(closeServerSession).catch(function (e) {
            console.error('offline-app: signing out failed:', e);
        }).then(function () {
            try {
                window.sessionStorage.setItem(SIGNED_OUT_KEY, '1');
            } catch (e) {
                console.debug('offline-app: the sign-out notice could not be kept:', e);
            }
            window.location.replace('index.php');
        });
    }

    function closeServerSession() {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
        var init = { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' };
        if (controller) {
            init.signal = controller.signal;
        }
        return fetch('logout.php', init).then(function (response) {
            // logout.php answers with a redirect once the session is closed.
            return response.type === 'opaqueredirect' || response.ok ? Store.deleteMeta('signedOut') : null;
        }).catch(function () {
            return null;
        }).then(function () {
            clearTimeout(timer);
        });
    }

    // The app's logout dialog (js/profile.js), with what leaves the device;
    // the loud warning instead when changes would be lost.
    function confirmSignOut() {
        commitDirty().then(function () {
            return Store.getOutbox(state.userId).catch(function () { return []; });
        }).then(function (pending) {
            if (pending.length) {
                Store.confirmLosingChanges(pending).then(function (sure) {
                    if (sure) {
                        signOut();
                    }
                });
                return;
            }
            // The id of the app's dialog: same look (css/profile-modal.css).
            var modal = el('div', 'modal');
            modal.id = 'confirmLogoutModal';
            var content = el('div', 'modal-content');
            content.appendChild(el('h3', null, t('workspace_menu.logout', null, 'Logout')));
            content.appendChild(el('p', 'text-small-muted', t('profile.logout.confirm', null, 'Are you sure you want to log out?')));
            content.appendChild(el('p', 'text-small-muted', ot('signout.removes', null, 'The notes kept offline will be removed from this device.')));
            var buttons = el('div', 'modal-buttons');
            var cancel = el('button', 'btn-cancel', t('common.cancel', null, 'Cancel'));
            var confirm = el('button', 'btn-danger', t('workspace_menu.logout', null, 'Logout'));
            cancel.type = 'button';
            confirm.type = 'button';
            buttons.appendChild(cancel);
            buttons.appendChild(confirm);
            content.appendChild(buttons);
            modal.appendChild(content);
            document.body.appendChild(modal);
            modal.style.display = 'flex';

            var close = function () {
                document.removeEventListener('keydown', onKey);
                modal.remove();
            };
            var onKey = function (event) {
                if (event.key === 'Escape') {
                    close();
                }
            };
            document.addEventListener('keydown', onKey);
            cancel.addEventListener('click', close);
            modal.addEventListener('click', function (event) {
                if (event.target === modal) {
                    close();
                }
            });
            confirm.addEventListener('click', function () {
                cancel.disabled = true;
                confirm.disabled = true;
                confirm.textContent = t('profile.logout.in_progress', null, 'Logging out...');
                signOut();
            });
            confirm.focus();
        });
    }

    // Shown once, on the screen that follows a sign-out.
    function takeSignedOutNotice() {
        try {
            var notice = window.sessionStorage.getItem(SIGNED_OUT_KEY);
            window.sessionStorage.removeItem(SIGNED_OUT_KEY);
            return !!notice;
        } catch (e) {
            return false;
        }
    }

    // ---- Data ------------------------------------------------------------------

    // The files this browser holds for the account (js/offline-sync.js),
    // so the note lists only the attachments that will open.
    function loadCachedFiles(userId) {
        if (!window.caches) {
            return Promise.resolve({});
        }
        return window.caches.open(Store.mediaCacheName(userId)).then(function (cache) {
            return cache.keys();
        }).then(function (keys) {
            var urls = {};
            keys.forEach(function (request) { urls[request.url] = true; });
            return urls;
        }).catch(function () {
            return {};
        });
    }

    function loadData() {
        var userId = state.userId;
        return Promise.all([Store.getIndex(userId), Store.getNotes(userId), Store.getOutbox(userId), loadCachedFiles(userId)]).then(function (all) {
            var index = all[0] || {};
            state.cachedFiles = all[3] || {};
            state.index = {
                notes: index.notes || [],
                folders: index.folders || [],
                workspaces: index.workspaces || [],
                days: index.days || (state.account && state.account.days) || 0
            };
            state.folders = {};
            state.index.folders.forEach(function (folder) {
                state.folders[folder.id] = folder;
            });
            state.server = {};
            all[1].forEach(function (note) {
                state.server[note.id] = note;
            });
            state.outbox = {};
            all[2].forEach(function (entry) {
                state.outbox[entry.id] = entry;
            });
        });
    }

    // The notes kept on the device: server copies, and notes changed or
    // written here. The list downloaded with them gives the latest folder,
    // workspace and date of each.
    function items() {
        var meta = {};
        state.index.notes.forEach(function (note) {
            meta[note.id] = note;
        });
        var byNote = {};
        values(state.server).forEach(function (note) {
            var known = meta[note.id] || {};
            var updated = note.updated;
            if (known.updated && (!updated || String(known.updated) > String(updated))) {
                updated = known.updated;
            }
            byNote[note.id] = {
                id: Number(note.id),
                heading: note.heading,
                type: note.type,
                workspace: known.workspace || note.workspace || '',
                folderId: known.folder_id !== undefined ? known.folder_id : note.folderId,
                tags: note.tags || '',
                updated: updated
            };
        });
        values(state.outbox).forEach(function (entry) {
            var item = byNote[entry.id] || (byNote[entry.id] = {
                id: Number(entry.id),
                type: entry.type,
                workspace: entry.workspace || '',
                folderId: entry.folderId,
                tags: '',
                updated: null
            });
            item.heading = entry.heading;
            item.pending = true;
            item.editedAt = entry.editedAt;
        });
        return values(byNote);
    }

    function findItem(id) {
        return items().filter(function (item) { return item.id === Number(id); })[0] || null;
    }

    function itemTime(item) {
        if (item.pending && item.editedAt) {
            return item.editedAt;
        }
        var date = parseServerDate(item.updated);
        return date ? date.getTime() : 0;
    }

    function noteText(id) {
        var note = state.outbox[id] || state.server[id];
        if (!note) {
            return '';
        }
        var content = String(note.content || '');
        return note.type === 'note' ? content.replace(/<[^>]*>/g, ' ') : content;
    }

    function workspaceNames() {
        var names = [];
        items().forEach(function (item) {
            if (item.workspace && names.indexOf(item.workspace) === -1) {
                names.push(item.workspace);
            }
        });
        return names.sort(function (a, b) { return a.localeCompare(b); });
    }

    function folderPath(folderId) {
        var names = [];
        var seen = {};
        var folder = folderId ? state.folders[folderId] : null;
        while (folder && !seen[folder.id]) {
            seen[folder.id] = true;
            names.unshift(folder.name);
            folder = folder.parent_id ? state.folders[folder.parent_id] : null;
        }
        return names.join(' / ');
    }

    // ---- Sidebar (index.php markup: folder-header / note-list-item) ---------------

    function renderWorkspaceTitle() {
        var names = workspaceNames();
        if (state.workspace && names.indexOf(state.workspace) === -1) {
            state.workspace = '';
        }
        var label = state.workspace
            || (names.length === 1 ? names[0] : (names.length ? ot('list.all_workspaces', null, 'All workspaces') : 'Poznote'));
        byId('offline-workspace-name').textContent = label;
        byId('offline-workspace-name').title = label;
        byId('offline-workspace-caret').hidden = names.length < 2;

        var menu = byId('offline-workspace-menu');
        menu.textContent = '';
        [''].concat(names).forEach(function (name) {
            var item = el('button', 'dropdown-item', name || ot('list.all_workspaces', null, 'All workspaces'));
            item.type = 'button';
            item.setAttribute('role', 'menuitem');
            item.setAttribute('data-workspace', name);
            if (name === state.workspace) {
                item.classList.add('active');
            }
            menu.appendChild(item);
        });
    }

    function noteLink(item) {
        var row = el('div', 'note-list-item');
        var link = el('a', 'links_arbo_left ' + (item.folderId ? 'note-in-folder' : 'note-without-folder'));
        link.href = 'index.php?note=' + item.id;
        link.setAttribute('data-note-id', String(item.id));
        // What js/tabs.js looks for to hide the tabs a search filters out
        link.setAttribute('data-action', 'load-note');
        link.setAttribute('data-note-type', item.type || 'note');
        if (state.currentId === item.id) {
            link.classList.add('selected-note');
        }
        var title = el('span', 'note-title');
        title.appendChild(icon((NOTE_ICONS[item.type] || NOTE_ICONS.note) + ' note-icon'));
        title.appendChild(document.createTextNode(' ' + (item.heading || ot('list.untitled', null, 'Untitled'))));
        link.appendChild(title);
        if (item.pending) {
            var dot = el('span', 'offline-item-pending');
            dot.title = ot('list.not_synced', null, 'Not synced yet');
            dot.setAttribute('aria-label', dot.title);
            link.appendChild(dot);
        }
        row.appendChild(link);
        return row;
    }

    function renderList() {
        renderWorkspaceTitle();
        var list = byId('offline-list');
        var scroll = list.scrollTop;
        list.textContent = '';

        var query = fold(state.search.trim());
        var matching = items().filter(function (item) {
            if (state.workspace && item.workspace !== state.workspace) {
                return false;
            }
            return !query || fold(item.heading).indexOf(query) !== -1 || fold(noteText(item.id)).indexOf(query) !== -1;
        }).sort(function (a, b) {
            return itemTime(b) - itemTime(a);
        });

        var days = state.index.days || (state.account && state.account.days) || 0;
        if (matching.length === 0) {
            var empty = query
                ? ot('list.no_results', null, 'No notes match your search.')
                : (state.workspace
                    ? ot('list.empty', null, 'No notes in this workspace.')
                    : ot('list.none', { days: days }, 'No notes were modified in the last {{days}} days.'));
            list.appendChild(el('p', 'offline-list-empty', empty));
            return;
        }

        // "Modified in the last N days" only while that is the whole story:
        // favorites and notes kept with "Keep offline" can be older. No
        // caption otherwise: every note of this page is available offline.
        var onlyRecent = (state.index.notes || []).every(function (meta) {
            return !meta.kept || meta.kept === 'recent';
        });
        if (days && onlyRecent) {
            list.appendChild(el('p', 'offline-list-caption', ot('list.recent', { days: days }, 'Modified in the last {{days}} days')));
        }

        // Folder tree of the listed notes: their folders and the parents.
        var children = {};
        var notesIn = {};
        var rootNotes = [];
        matching.forEach(function (item) {
            if (item.folderId && state.folders[item.folderId]) {
                (notesIn[item.folderId] = notesIn[item.folderId] || []).push(item);
                var folder = state.folders[item.folderId];
                var guard = 0;
                while (folder && guard++ < 50) {
                    var parentKey = folder.parent_id && state.folders[folder.parent_id] ? folder.parent_id : 'root';
                    children[parentKey] = children[parentKey] || [];
                    if (children[parentKey].indexOf(folder.id) === -1) {
                        children[parentKey].push(folder.id);
                    }
                    folder = parentKey === 'root' ? null : state.folders[parentKey];
                }
            } else {
                rootNotes.push(item);
            }
        });

        function countNotes(folderId) {
            var count = (notesIn[folderId] || []).length;
            (children[folderId] || []).forEach(function (childId) {
                count += countNotes(childId);
            });
            return count;
        }

        function byName(a, b) {
            return String(state.folders[a].name).localeCompare(String(state.folders[b].name));
        }

        function renderFolder(folderId, container) {
            var folder = state.folders[folderId];
            var open = !!query || !state.closedFolders[folderId];

            var header = el('div', 'folder-header');
            header.setAttribute('data-folder-id', String(folderId));
            var toggle = el('div', 'folder-toggle');
            toggle.setAttribute('data-offline-folder', String(folderId));
            toggle.appendChild(icon((open ? 'lucide-folder-open' : 'lucide-folder') + ' folder-icon'));
            toggle.appendChild(el('span', 'folder-name', folder.name));
            toggle.appendChild(el('span', 'folder-note-count', '(' + countNotes(folderId) + ')'));
            header.appendChild(toggle);
            container.appendChild(header);

            var content = el('div', 'folder-content');
            content.style.display = open ? 'block' : 'none';
            (children[folderId] || []).sort(byName).forEach(function (childId) {
                renderFolder(childId, content);
            });
            (notesIn[folderId] || []).forEach(function (item) {
                content.appendChild(noteLink(item));
            });
            container.appendChild(content);
        }

        (children.root || []).sort(byName).forEach(function (folderId) {
            renderFolder(folderId, list);
        });
        rootNotes.forEach(function (item) {
            list.appendChild(noteLink(item));
        });
        list.scrollTop = scroll;
    }

    // ---- Note pane (note_display.php markup) -------------------------------------

    function toolbarButton(classes, title, action, iconClass, extra) {
        var button = el('button', 'toolbar-btn ' + classes);
        button.type = 'button';
        button.title = title;
        button.setAttribute('data-action', action);
        Object.keys(extra || {}).forEach(function (name) {
            button.setAttribute(name, extra[name]);
        });
        button.appendChild(icon(iconClass));
        return button;
    }

    // The buttons of note_display.php that need no server, in the same order.
    function buildToolbar(id, type) {
        var bar = el('div', 'note-edit-toolbar');
        var fmt = 'text-format-btn';
        var add = function (button) { bar.appendChild(button); };
        add(toolbarButton('btn-home mobile-home-btn', t('editor.toolbar.back_to_notes', null, 'Notes'), 'scroll-to-left-column', 'lucide-home'));
        add(toolbarButton('btn-bold ' + fmt, t('editor.toolbar.bold', null, 'Bold'), 'exec-bold', 'lucide-bold'));
        add(toolbarButton('btn-italic ' + fmt, t('editor.toolbar.italic', null, 'Italic'), 'exec-italic', 'lucide-italic'));
        add(toolbarButton('btn-underline ' + fmt, t('editor.toolbar.underline', null, 'Underline'), 'exec-underline', 'lucide-underline'));
        add(toolbarButton('btn-strikethrough ' + fmt, t('editor.toolbar.strikethrough', null, 'Strikethrough'), 'exec-strikethrough', 'lucide-strikethrough'));
        add(toolbarButton('btn-link ' + fmt, t('editor.toolbar.link', null, 'Link'), 'add-link', 'lucide-link'));
        add(toolbarButton('btn-color ' + fmt, t('editor.toolbar.text_color', null, 'Text color'), 'toggle-red-color', 'lucide-palette'));
        add(toolbarButton('btn-highlight ' + fmt, t('editor.toolbar.highlight', null, 'Highlight'), 'toggle-yellow-highlight', 'lucide-paintbrush'));
        add(toolbarButton('btn-list-ul ' + fmt, t('editor.toolbar.bullet_list', null, 'Bullet list'), 'exec-unordered-list', 'lucide-list-ul'));
        add(toolbarButton('btn-list-ol ' + fmt, t('editor.toolbar.numbered_list', null, 'Numbered list'), 'exec-ordered-list', 'lucide-list-ol'));
        if (type === 'markdown' || type === 'note') {
            add(toolbarButton('btn-task-list ' + fmt, t('editor.toolbar.toggle_checklist', null, 'Toggle checklist'), 'exec-task-list', 'lucide-list-check'));
        }
        if (type === 'markdown') {
            add(toolbarButton('btn-task-remove ' + fmt, t('editor.toolbar.remove_checklist', null, 'Remove checkboxes'), 'exec-task-remove', 'lucide-minus-square'));
        }
        add(toolbarButton('btn-text-height ' + fmt, t('slash_menu.title', null, 'Title'), 'change-font-size', 'lucide-type-height'));
        add(toolbarButton('btn-code ' + fmt, t('editor.toolbar.code_block', null, 'Code block'), 'toggle-code-block', 'lucide-code'));
        add(toolbarButton('btn-inline-code ' + fmt, t('editor.toolbar.inline_code', null, 'Inline code'), 'toggle-inline-code', 'lucide-terminal'));
        if (type !== 'markdown') {
            add(toolbarButton('btn-eraser ' + fmt, t('editor.toolbar.clear_formatting', null, 'Clear formatting'), 'exec-remove-format', 'lucide-eraser'));
        }
        if (type === 'note' || type === 'markdown') {
            add(toolbarButton('btn-search-replace-format ' + fmt, t('editor.toolbar.search_replace', null, 'Search and replace'), 'open-search-replace-modal', 'lucide-search', { 'data-note-id': String(id) }));
        }
        if (type === 'tasklist') {
            var dropdown = el('div', 'tasklist-actions-dropdown');
            dropdown.appendChild(toolbarButton('btn-tasklist-actions note-action-btn', t('tasklist.actions', null, 'Task list actions'), 'toggle-tasklist-actions', 'lucide-check-square', {
                'data-note-id': String(id), 'aria-haspopup': 'true', 'aria-expanded': 'false'
            }));
            var menu = el('div', 'dropdown-menu tasklist-actions-menu');
            menu.id = 'tasklist-actions-menu-' + id;
            menu.hidden = true;
            [['clear-completed-tasks', 'lucide-trash', t('tasklist.clear_completed', null, 'Clear completed tasks')],
                ['uncheck-all-tasks', 'lucide-square', t('tasklist.uncheck_all', null, 'Uncheck all tasks')]].forEach(function (def) {
                var item = el('button', 'dropdown-item');
                item.type = 'button';
                item.setAttribute('data-action', def[0]);
                item.setAttribute('data-note-id', String(id));
                item.appendChild(icon(def[1]));
                item.appendChild(document.createTextNode(' ' + def[2]));
                menu.appendChild(item);
            });
            dropdown.appendChild(menu);
            add(dropdown);
        }
        add(toolbarButton('btn-checklist note-action-btn', t('editor.toolbar.insert_checklist', null, 'Insert checklist'), 'insert-checklist', 'lucide-list-check'));
        // Every change is kept on the device as it is typed: Save now only
        // does it at once, as Ctrl+S does in the app.
        add(toolbarButton('btn-save note-action-btn', t('editor.toolbar.save_now', null, 'Save now'), 'save-note', 'lucide-save', { 'data-note-id': String(id) }));
        return bar;
    }

    function buildSearchReplaceBar(id) {
        var bar = el('div', 'search-replace-bar');
        bar.id = 'searchReplaceBar' + id;
        bar.style.display = 'none';
        bar.innerHTML =
            '<div class="search-replace-controls">'
            + '<button type="button" class="search-replace-btn search-replace-toggle-btn" id="searchToggleReplaceBtn' + id + '" aria-expanded="false"><i class="lucide lucide-chevron-down"></i></button>'
            + '<div class="search-replace-input-group"><input type="text" class="search-replace-input" id="searchInput' + id + '" autocomplete="off"><span class="search-replace-count" id="searchCount' + id + '"></span></div>'
            + '<div class="search-replace-buttons">'
            + '<button type="button" class="search-replace-btn search-replace-prev-btn" id="searchPrevBtn' + id + '"><i class="lucide lucide-chevron-left"></i></button>'
            + '<button type="button" class="search-replace-btn search-replace-next-btn" id="searchNextBtn' + id + '"><i class="lucide lucide-chevron-right"></i></button>'
            + '<button type="button" class="search-replace-btn search-replace-close-btn" id="searchCloseBtn' + id + '"><i class="lucide lucide-x"></i></button>'
            + '</div></div>'
            + '<div class="search-replace-replace-row" id="searchReplaceRow' + id + '">'
            + '<div class="search-replace-input-group"><input type="text" class="search-replace-input" id="replaceInput' + id + '" autocomplete="off"></div>'
            + '<div class="search-replace-buttons">'
            + '<button type="button" class="search-replace-btn" id="replaceBtn' + id + '"></button>'
            + '<button type="button" class="search-replace-btn" id="replaceAllBtn' + id + '"></button>'
            + '</div></div>';
        // Labels as text, never as markup.
        bar.querySelector('#searchToggleReplaceBtn' + id).title = t('search_replace.toggle_replace', null, 'Toggle replace');
        bar.querySelector('#searchInput' + id).placeholder = t('search_replace.search_placeholder', null, 'Find...');
        bar.querySelector('#searchPrevBtn' + id).title = t('search_replace.previous', null, 'Previous');
        bar.querySelector('#searchNextBtn' + id).title = t('search_replace.next', null, 'Next');
        bar.querySelector('#searchCloseBtn' + id).title = t('search_replace.close', null, 'Close');
        bar.querySelector('#replaceInput' + id).placeholder = t('search_replace.replace_placeholder', null, 'Replace...');
        var one = bar.querySelector('#replaceBtn' + id);
        one.title = t('search_replace.replace_one', null, 'Replace');
        one.textContent = t('search_replace.replace', null, 'Replace');
        var all = bar.querySelector('#replaceAllBtn' + id);
        all.title = t('search_replace.replace_all', null, 'Replace All');
        all.textContent = t('search_replace.replace_all', null, 'All');
        return bar;
    }

    // The note's files this browser holds (every attachment of a note kept
    // whatever its date, js/offline-sync.js), as the app lists them under the
    // title. Pictures shown in the text are not repeated; a file that was
    // not copied (too big, no room) is left out rather than shown broken.
    function buildAttachmentsRow(id, attachments, text) {
        attachments = attachments || [];
        if (!attachments.length) {
            return null;
        }
        var content = String(text || '');
        var list = el('span', 'note-attachments-list');
        attachments.forEach(function (attachment) {
            if (!attachment || !attachment.id) {
                return;
            }
            var url = new URL('api/v1/notes/' + id + '/attachments/' + attachment.id, window.location.href).href;
            if (!state.cachedFiles[url] || content.indexOf('attachments/' + attachment.id) !== -1) {
                return;
            }
            var name = attachment.original_filename || String(attachment.id);
            var link = el('a', 'attachment-link', name);
            link.href = url;
            // What the app's right-click menu reads (js/note-attachment-menu.js)
            link.setAttribute('data-attachment-id', String(attachment.id));
            link.setAttribute('data-note-id', String(id));
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = t('attachments.actions.download', { filename: name }, 'Download {{filename}}');
            if (list.childNodes.length) {
                list.appendChild(document.createTextNode(' '));
            }
            list.appendChild(link);
        });
        if (!list.childNodes.length) {
            return null;
        }
        var row = el('div', 'note-attachments-row');
        row.appendChild(el('span', 'lucide lucide-paperclip icon_attachment'));
        row.appendChild(list);
        return row;
    }

    // The files the rules would have kept (every attachment of a note kept
    // whatever its date, the pictures shown in any note) but that the
    // per-file limit left online: named, so a missing PDF is not a mystery.
    function buildTooBigNotice(id, attachments, text) {
        var limitMb = Number(state.account && state.account.limits && state.account.limits.picture_mb) || 25;
        var meta = (state.index.notes || []).filter(function (entry) { return Number(entry.id) === Number(id); })[0];
        var keptWhole = !!(meta && meta.kept && meta.kept !== 'recent');
        var content = String(text || '');
        var names = [];
        (attachments || []).forEach(function (attachment) {
            if (!attachment || !attachment.id) {
                return;
            }
            var size = Number(attachment.file_size) || 0;
            var shown = content.indexOf('attachments/' + attachment.id) !== -1;
            var url = new URL('api/v1/notes/' + id + '/attachments/' + attachment.id, window.location.href).href;
            if ((keptWhole || shown) && size > limitMb * 1024 * 1024 && !state.cachedFiles[url]) {
                names.push(ot('note.file_size', {
                    name: attachment.original_filename || String(attachment.id),
                    size: String(Math.round(size / 1024 / 1024))
                }, '{{name}} ({{size}} MB)'));
            }
        });
        if (!names.length) {
            return null;
        }
        var notice = el('div', 'offline-note-notice');
        notice.setAttribute('role', 'note');
        notice.appendChild(icon('lucide-alert-triangle'));
        notice.appendChild(el('span', null, ot('note.too_big', { limit: String(limitMb), files: names.join(', ') }, 'Not available offline, larger than {{limit}} MB: {{files}}')));
        return notice;
    }

    function buildTagsRow(item) {
        var row = el('div', 'note-tags-row');
        var folder = el('div', 'folder-wrapper');
        folder.appendChild(el('span', 'lucide lucide-folder icon_folder'));
        folder.appendChild(el('span', 'folder_name', folderPath(item.folderId) || t('modals.folder.no_folder', null, 'No folder')));
        row.appendChild(folder);
        var tags = String(item.tags || '').split(',').map(function (tag) { return tag.trim(); }).filter(Boolean);
        if (tags.length) {
            var tagIcon = el('div', 'tag-actions-dropdown');
            tagIcon.appendChild(el('span', 'lucide lucide-tag icon_tag'));
            row.appendChild(tagIcon);
            var list = el('span', 'name_tags');
            tags.forEach(function (tag) {
                var wrapper = el('span', 'clickable-tag-wrapper');
                var chip = el('span', 'clickable-tag', tag);
                chip.setAttribute('data-tag', tag);
                wrapper.appendChild(chip);
                list.appendChild(wrapper);
            });
            row.appendChild(list);
        }
        return row;
    }

    function hidePanes() {
        byId('offline-placeholder').hidden = true;
        byId('offline-unavailable').hidden = true;
    }

    function clearNotePane() {
        var host = byId('offline-note-host');
        if (typeof window.destroyMarkdownCodeMirrorEditorsWithin === 'function') {
            try { window.destroyMarkdownCodeMirrorEditorsWithin(host); } catch (e) { /* ignore */ }
        }
        host.textContent = '';
    }

    function renderNote(id) {
        var note = state.outbox[id] || state.server[id];
        var item = findItem(id) || { id: id, type: note.type, folderId: note.folderId, tags: '' };
        var type = note.type || 'note';
        clearNotePane();
        hidePanes();

        var card = el('div', 'notecard');
        card.id = 'note' + id;
        var inner = el('div', 'innernote');
        if (type === 'markdown') {
            inner.setAttribute('data-markdown-note', 'true');
        } else if (type === 'tasklist') {
            inner.setAttribute('data-tasklist-note', 'true');
        }
        card.appendChild(inner);

        // The list of files comes with the server copy: a change made here
        // (outbox) carries the text only.
        var server = state.server[id];
        var attachmentsRow = buildAttachmentsRow(id, server ? server.attachments : null, note.content);

        var header = el('div', 'note-header');
        header.appendChild(buildToolbar(id, type));
        if (type === 'note' || type === 'markdown') {
            header.appendChild(buildSearchReplaceBar(id));
        }
        inner.appendChild(header);
        inner.appendChild(buildTagsRow(item));
        if (attachmentsRow) {
            inner.appendChild(attachmentsRow);
        }
        var tooBig = buildTooBigNotice(id, server ? server.attachments : null, note.content);
        if (tooBig) {
            inner.appendChild(tooBig);
        }

        var tagsInput = el('input');
        tagsInput.type = 'hidden';
        tagsInput.id = 'tags' + id;
        tagsInput.value = item.tags || '';
        inner.appendChild(tagsInput);

        var heading = el('h4', 'note-title-heading');
        heading.appendChild(icon((NOTE_ICONS[type] || NOTE_ICONS.note) + ' note-icon note-title-icon'));
        var title = el('input', 'css-title');
        title.type = 'text';
        title.id = 'inp' + id;
        title.autocomplete = 'off';
        title.spellcheck = false;
        var defaultTitle = matchDefaultTitle(note.heading);
        if (defaultTitle) {
            title.placeholder = defaultTitle.number
                ? t('index.note.new_note_numbered', { number: defaultTitle.number }, 'New note ({{number}})')
                : t('index.note.new_note', null, 'New note');
            title.value = '';
        } else {
            title.placeholder = t('index.note.title_placeholder', null, 'Title ?');
            title.value = note.heading || '';
        }
        title.addEventListener('input', markDirty);
        heading.appendChild(title);
        inner.appendChild(heading);

        var entry = el('div', 'noteentry');
        entry.id = 'entry' + id;
        entry.setAttribute('data-note-id', String(id));
        entry.setAttribute('data-note-heading', note.heading || '');
        entry.setAttribute('data-note-type', type);
        entry.setAttribute('autocomplete', 'off');
        entry.setAttribute('autocapitalize', 'off');
        if (type === 'markdown') {
            entry.setAttribute('contenteditable', 'false');
            entry.setAttribute('data-markdown-content', note.content || '');
            entry.textContent = note.content || '';
        } else if (type === 'tasklist') {
            entry.setAttribute('contenteditable', 'true');
            entry.setAttribute('data-tasklist-json', note.content || '[]');
            entry.textContent = note.content || '[]';
        } else {
            entry.setAttribute('contenteditable', 'true');
            // Server-sanitized content, or what was typed here: rendered the
            // way the online editor does.
            entry.innerHTML = note.content || '';
            entry.addEventListener('input', markDirty);
            entry.addEventListener('change', onHtmlChange);
        }
        inner.appendChild(entry);
        inner.appendChild(el('div', 'note-bottom-space'));

        byId('offline-note-host').appendChild(card);

        window.noteid = id;
        window.selectedWorkspace = item.workspace || window.selectedWorkspace || '';

        // The app's own initialisation of the note body (note-content-init.js).
        if (type === 'markdown' && typeof window.initializeMarkdownNote === 'function') {
            window.initializeMarkdownNote(id);
        } else if (type === 'tasklist' && typeof window.initializeTaskList === 'function') {
            window.initializeTaskList(id, 'tasklist');
        }
        if (typeof window.reinitializeImageClickHandlers === 'function') {
            try { window.reinitializeImageClickHandlers(); } catch (e) { /* ignore */ }
        }
        if (type === 'note' && typeof window.applySyntaxHighlighting === 'function') {
            try { window.applySyntaxHighlighting(entry); } catch (e) { /* ignore */ }
        }
    }

    // A ticked box only changes a property: write it into the markup the way
    // the online editor does (js/checklist.js), or it is not saved.
    function onHtmlChange(event) {
        var box = event.target;
        if (!box || box.type !== 'checkbox') {
            return;
        }
        box.setAttribute('data-checked', box.checked ? '1' : '0');
        box.toggleAttribute('checked', box.checked);
        var item = box.closest('.checklist-item');
        if (item) {
            item.classList.toggle('checklist-item-checked', box.checked);
        }
        markDirty();
    }

    // What notes.js would send for an HTML note: the markup without the
    // search highlights and the buttons added around code blocks.
    function serializeHtml(entry) {
        var clone = entry.cloneNode(true);
        clone.querySelectorAll('.code-block-copy-btn, .code-block-delete-btn, .code-block-lang-btn, .code-block-line-numbers-btn, .heading-anchor, [data-heading-anchor="true"]').forEach(function (node) {
            node.remove();
        });
        clone.querySelectorAll('.search-highlight').forEach(function (mark) {
            mark.replaceWith(document.createTextNode(mark.textContent));
        });
        clone.querySelectorAll('.checklist-item').forEach(function (row) {
            var input = row.querySelector('.checklist-input');
            if (input) {
                input.setAttribute('value', input.value);
                input.setAttribute('data-value', input.value);
            }
        });
        return clone.innerHTML.replace(/(?:&nbsp;| )*<br\s*[/]?>/gi, '<br>');
    }

    // A default title ("New note", "New note (2)", in any language) is shown
    // as the placeholder of an empty title field, as note_display.php does
    // (lib/note-titles.php, js/notes.js).
    function matchDefaultTitle(text) {
        var normalized = String(text || '').trim();
        if (!normalized) {
            return null;
        }
        var titles = window.DEFAULT_NOTE_TITLES || ['New note'];
        for (var i = 0; i < titles.length; i++) {
            var escaped = String(titles[i]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var match = new RegExp('^' + escaped + '(?: \\((\\d+)\\))?$').exec(normalized);
            if (match) {
                return { number: match[1] || null };
            }
        }
        return null;
    }

    function readNoteState(id) {
        var entry = byId('entry' + id);
        if (!entry) {
            return null;
        }
        var type = entry.getAttribute('data-note-type') || 'note';
        var content;
        if (type === 'markdown') {
            content = typeof window.getMarkdownContentForNote === 'function' ? window.getMarkdownContentForNote(id) : null;
            if (content === null || content === undefined) {
                content = entry.getAttribute('data-markdown-content') || '';
            }
        } else if (type === 'tasklist') {
            content = typeof window.getTaskListData === 'function' ? window.getTaskListData(id) : (entry.dataset.tasklistJson || '[]');
        } else {
            content = serializeHtml(entry);
        }
        var title = byId('inp' + id);
        var heading = title ? title.value : undefined;
        // Left empty: the default title shown as placeholder stays the title.
        if (heading === '' && matchDefaultTitle(title.placeholder)) {
            heading = title.placeholder;
        }
        return { content: String(content), heading: heading };
    }

    function openNote(id) {
        id = Number(id);
        tabsLoadStarted(id);
        return commitDirty().then(function () {
            state.currentId = id;
            document.body.classList.add('note-open');
            // A note written here has a temporary id: the address names no
            // note then, and a reload reopens the active tab (js/tabs.js)
            try {
                window.history.replaceState(null, '', id > 0 ? 'index.php?note=' + id : 'index.php');
            } catch (e) { /* ignore */ }
            if (!state.outbox[id] && !state.server[id]) {
                clearNotePane();
                renderUnavailable();
                renderList();
                showNoteColumn();
                // A tab of a note no longer kept here still switches; no tab
                // is made for it otherwise
                if (tabs() && tabs().isNoteOpen(id)) {
                    tabsLoaded(id);
                }
                return null;
            }
            return adoptMainAppDraft(id).then(function () {
                if (state.currentId !== id) {
                    return;
                }
                renderNote(id);
                renderList();
                showNoteColumn();
                tabsLoaded(id);
            });
        });
    }

    // ---- Tabs ------------------------------------------------------------------

    function tabs() {
        return window.tabManager || null;
    }

    function tabsEnabled() {
        return !!tabs() && window.innerWidth > 800;
    }

    // What the app's note loader tells js/tabs.js (js/note-loader.js)
    function tabsLoadStarted(id) {
        if (tabs()) {
            tabs()._onNoteLoadStarted(id);
        }
    }

    function tabsLoaded(id) {
        if (tabs()) {
            tabs()._onNoteLoaded(id);
            tabs().render();
        }
    }

    // A note in a new tab, as a double-click does in the app; the note
    // itself where tabs are off (phones). Resolves once it is on screen.
    function openInTab(id, options) {
        id = Number(id);
        if (!tabsEnabled()) {
            return openNote(id);
        }
        var item = findItem(id);
        state.lastOpen = null;
        tabs().openInNewTab(String(id), (item && item.heading) || t('index.note.new_note', null, 'New note'), options || {});
        return state.lastOpen || Promise.resolve();
    }

    function tabsKey() {
        return 'poznote_offline_tabs::u' + state.userId;
    }

    // The tabs open online in the account's last workspace (recorded by
    // js/offline-sync.js), the first time and whenever they changed since:
    // only the notes kept on this device. The online tabs are left alone.
    function seedTabsFromOnline() {
        var workspace = state.account && state.account.workspace;
        if (!workspace) {
            return;
        }
        var seedKey = 'poznote_offline_tabs_seed::u' + state.userId;
        try {
            var raw = window.localStorage.getItem('poznote_tabs_' + workspace + '::u' + state.userId);
            if (!raw || raw === window.localStorage.getItem(seedKey)) {
                return;
            }
            var online = JSON.parse(raw) || {};
            var kept = (online.tabs || []).filter(function (tab) {
                var noteId = tab && Number(tab.noteId);
                return tab && (tab.type || 'note') === 'note' && noteId && (state.server[noteId] || state.outbox[noteId]);
            });
            var active = kept.some(function (tab) { return tab.id === online.activeTabId; })
                ? online.activeTabId
                : (kept[0] ? kept[0].id : null);
            window.localStorage.setItem(tabsKey(), JSON.stringify({ tabs: kept, activeTabId: active }));
            window.localStorage.setItem(seedKey, raw);
        } catch (e) {
            console.debug('offline-app: the online tabs could not be read:', e);
        }
    }

    // js/tabs.js empties the pane once the last tab is closed: back to the
    // placeholder, which lives in the same column.
    window.poznoteClearNotePane = function () {
        commitDirty();
        state.currentId = null;
        clearNotePane();
        hidePanes();
        byId('offline-placeholder').hidden = false;
        document.body.classList.remove('note-open');
        renderList();
    };

    // How js/tabs.js opens a tab's note
    window.loadNoteDirectly = function (url, noteId) {
        state.lastOpen = openNote(Number(noteId));
        return state.lastOpen;
    };

    function startTabs() {
        if (state.tabsStarted) {
            return;
        }
        state.tabsStarted = true;
        // One set of tabs per account, whatever the workspace shown
        window.__poznoteTabsStorageKey = tabsKey;
        seedTabsFromOnline();
        // The note on screen, told to js/tabs.js the way index.php does
        var id = state.currentId;
        if (id !== null && (state.server[id] || state.outbox[id])) {
            var config = el('script');
            config.type = 'application/json';
            config.id = 'current-note-data';
            config.textContent = JSON.stringify({ noteId: id });
            document.body.appendChild(config);
        }
        var script = document.createElement('script');
        script.src = byId('right_pane').getAttribute('data-tabs-script');
        document.body.appendChild(script);
    }

    // Only reached through the address (index.php?note=...): the list holds
    // nothing else than the notes kept offline.
    function renderUnavailable() {
        hidePanes();
        byId('offline-unavailable').hidden = false;
        byId('offline-unavailable-title').textContent = ot('unavailable.title', null, 'This note is not available offline');
        var days = state.index.days || (state.account && state.account.days) || 0;
        byId('offline-unavailable-text').textContent = days
            ? ot('unavailable.text', { days: days }, 'Only the notes modified in the last {{days}} days are kept on this device. This one will open as soon as you are back online.')
            : ot('unavailable.text_generic', null, 'This note is not kept on this device. It will open as soon as you are back online.');
    }

    // Phones: the two columns side by side, the body scrolled to one of them
    // (css/index-mobile.css), as index-events.js does.
    function showNoteColumn() {
        if (isNarrow()) {
            document.body.scrollTo({ left: window.innerWidth, behavior: 'smooth' });
        }
    }

    function backToList() {
        commitDirty();
        document.body.classList.remove('note-open');
        if (isNarrow()) {
            document.body.scrollTo({ left: 0, behavior: 'smooth' });
        }
    }

    // A draft the online editor left in this browser (typed while the
    // connection dropped, never saved): it becomes an offline change, so
    // what was typed last is what opens here and what gets sent later.
    function adoptMainAppDraft(id) {
        var server = state.server[id];
        if (!server || id <= 0 || String(window.__poznoteUserId || '') !== String(state.userId)) {
            return Promise.resolve();
        }
        var draft;
        var title;
        var meta;
        try {
            draft = window.localStorage.getItem('poznote_draft_' + id);
            title = window.localStorage.getItem('poznote_title_' + id);
            meta = JSON.parse(window.localStorage.getItem('poznote_draft_meta_' + id) || 'null');
        } catch (e) {
            return Promise.resolve();
        }
        if (draft === null) {
            return Promise.resolve();
        }
        var entry = state.outbox[id];
        if (entry && meta && meta.ts && entry.editedAt >= meta.ts) {
            return Promise.resolve();
        }
        var heading = title !== null ? title : server.heading;
        var clear = function () {
            try {
                ['poznote_draft_', 'poznote_title_', 'poznote_tags_', 'poznote_draft_meta_'].forEach(function (prefix) {
                    window.localStorage.removeItem(prefix + id);
                });
            } catch (e) { /* ignore */ }
        };
        if (draft === server.content && heading === server.heading) {
            clear();
            return Promise.resolve();
        }
        var startedOn = meta && meta.version ? meta.version : server.version;
        var base = {
            id: id,
            type: server.type,
            workspace: server.workspace,
            folderId: server.folderId,
            heading: server.heading,
            content: server.content,
            version: startedOn,
            baseUnknown: startedOn !== server.version
        };
        return Store.saveLocalEdit(state.userId, entry || base, { heading: heading, content: draft }).then(function (saved) {
            if (saved) {
                state.outbox[id] = saved;
            }
            clear();
        }).catch(function (e) {
            console.debug('offline-app: adoptMainAppDraft() failed:', e);
        });
    }

    // ---- Saving on the device (stands in for the app's autosave) ------------------

    function setSaveButtonState(saving) {
        var button = document.querySelector('#offline-note-host .btn-save');
        if (button) {
            button.classList.toggle('is-saving', !!saving);
        }
    }

    function markDirty() {
        if (state.currentId === null) {
            return;
        }
        state.dirtyId = state.currentId;
        setSaveButtonState(true);
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(commitDirty, SAVE_DELAY_MS);
    }

    // Read the note on screen and save it on the device. The text is read
    // right away, so a note about to be replaced on screen is saved first.
    function commitDirty() {
        clearTimeout(state.saveTimer);
        var id = state.dirtyId;
        state.dirtyId = null;
        if (id === null) {
            return Promise.resolve();
        }
        var read = readNoteState(id);
        if (!read) {
            return Promise.resolve();
        }
        // A note created here and meanwhile created on the server too.
        if (state.idMap[id] && !state.outbox[id] && !state.server[id]) {
            id = state.idMap[id];
        }
        var base = state.server[id] || state.outbox[id];
        if (!base) {
            return Promise.resolve();
        }
        var changes = { content: read.content };
        if (read.heading !== undefined) {
            changes.heading = read.heading;
        }
        return Store.saveLocalEdit(state.userId, base, changes).then(function (entry) {
            if (entry) {
                state.outbox[id] = entry;
            } else {
                delete state.outbox[id];
            }
            if (state.currentId === id && state.dirtyId === null) {
                setSaveButtonState(false);
            }
            renderList();
            updateStatus();
            schedulePush();
        }).catch(function (e) {
            console.error('offline-app: the change could not be saved on this device:', e);
        });
    }

    // The autosave entry points the app modules call.
    window.markNoteAsModified = markDirty;
    window.saveNoteToServer = function () {
        markDirty();
        return commitDirty();
    };
    window.saveNoteImmediately = window.saveNoteToServer;
    // The due date picker needs the app's modals: nothing happens offline.
    window.openTaskDueDatePicker = function () {};

    // ---- Toolbar actions (the ones of js/index-events.js that need no server) ------

    function inMarkdownEditor() {
        return typeof window.isInMarkdownEditor === 'function' && window.isInMarkdownEditor();
    }

    function closeTasklistMenus() {
        document.querySelectorAll('.tasklist-actions-menu:not([hidden])').forEach(function (menu) {
            menu.hidden = true;
            var button = menu.parentElement && menu.parentElement.querySelector('[data-action="toggle-tasklist-actions"]');
            if (button) {
                button.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function call(name) {
        if (typeof window[name] === 'function') {
            window[name].apply(null, Array.prototype.slice.call(arguments, 1));
        }
    }

    function runAction(action, target) {
        var noteId = target.getAttribute('data-note-id');
        var md = inMarkdownEditor();
        switch (action) {
            case 'exec-bold': if (md) { call('applyMarkdownBold'); } else { document.execCommand('bold'); } break;
            case 'exec-italic': if (md) { call('applyMarkdownItalic'); } else { document.execCommand('italic'); } break;
            case 'exec-underline': if (md) { call('applyMarkdownUnderline'); } else { document.execCommand('underline'); } break;
            case 'exec-strikethrough': if (md) { call('applyMarkdownStrikethrough'); } else { document.execCommand('strikeThrough'); } break;
            case 'exec-unordered-list': if (md) { call('toggleMarkdownList', 'ul'); } else { document.execCommand('insertUnorderedList'); } break;
            case 'exec-ordered-list': if (md) { call('toggleMarkdownList', 'ol'); } else { document.execCommand('insertOrderedList'); } break;
            case 'exec-task-list': if (md) { call('toggleMarkdownList', 'task'); } else { call('toggleChecklistSelection'); } break;
            case 'exec-task-remove': if (md) { call('toggleMarkdownList', 'task-remove'); } break;
            case 'exec-remove-format': document.execCommand('removeFormat'); break;
            case 'add-link': call('addLinkToNote'); break;
            case 'toggle-red-color': call('toggleRedColor', target); break;
            case 'toggle-yellow-highlight': call('toggleYellowHighlight', target); break;
            case 'change-font-size': call('changeFontSize'); break;
            case 'toggle-code-block': call('toggleCodeBlock'); break;
            case 'toggle-inline-code': call('toggleInlineCode'); break;
            case 'insert-checklist': call('insertChecklist'); break;
            case 'open-search-replace-modal':
                if (noteId) {
                    call('openSearchReplaceModal', noteId);
                }
                return;
            case 'toggle-tasklist-actions': {
                var menu = byId('tasklist-actions-menu-' + noteId);
                if (menu) {
                    var opening = menu.hidden;
                    closeTasklistMenus();
                    menu.hidden = !opening;
                    target.setAttribute('aria-expanded', opening ? 'true' : 'false');
                }
                return;
            }
            case 'clear-completed-tasks': call('clearCompletedTasks', noteId); closeTasklistMenus(); break;
            case 'uncheck-all-tasks': call('uncheckAllTasks', noteId); closeTasklistMenus(); break;
            case 'save-note':
                markDirty();
                commitDirty();
                return;
            case 'scroll-to-left-column':
                backToList();
                return;
            default:
                return;
        }
        // Formatting changes the note: save it like any edit.
        markDirty();
    }

    // ---- Connection and push -------------------------------------------------------

    function pendingCount() {
        return Object.keys(state.outbox).length;
    }

    // The icon before the list's title tells the state, its tooltip the words.
    function updateStatus() {
        var status = byId('offline-status');
        var pending = pendingCount();
        var iconName;
        var label;
        if (state.pushing) {
            iconName = 'lucide-refresh-cw';
            label = ot('status.syncing', null, 'Syncing…');
        } else {
            iconName = state.online ? 'lucide-wifi' : 'lucide-wifi-off';
            label = state.online ? ot('status.online', null, 'Online') : ot('status.offline', null, 'Offline');
            if (pending) {
                label += ' · ' + (pending === 1
                    ? ot('status.pending_one', null, '1 change waiting')
                    : ot('status.pending_other', { count: pending }, '{{count}} changes waiting'));
            }
        }
        status.className = 'lucide ' + iconName + ' workspace-title-icon offline-title-status' + (state.online ? ' is-online' : '');
        status.title = label;
        status.setAttribute('aria-label', label);
    }

    function probeServer() {
        var controller = window.AbortController ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
        return fetch('api_health.php', { cache: 'no-store', credentials: 'same-origin', signal: controller ? controller.signal : undefined })
            .then(function (response) {
                return response.status > 0 && response.status < 500;
            }, function () {
                return false;
            })
            .then(function (reachable) {
                if (timer) {
                    clearTimeout(timer);
                }
                return reachable;
            });
    }

    function returnUrl() {
        var id = state.currentId;
        if (id !== null && state.idMap[id]) {
            id = state.idMap[id];
        }
        return 'index.php' + (id && id > 0 ? '?note=' + id : '');
    }

    function showOnlineBanner(text, actionLabel, href) {
        byId('offline-online-text').textContent = text;
        var action = byId('offline-online-action');
        action.textContent = actionLabel;
        action.setAttribute('href', href);
        byId('offline-online-banner').hidden = false;
    }

    function checkConnection() {
        return probeServer().then(function (reachable) {
            var wasOnline = state.online;
            state.online = reachable;
            updateStatus();
            if (!reachable) {
                byId('offline-online-banner').hidden = true;
                return;
            }
            if (state.userId) {
                if (!wasOnline) {
                    pushNow();
                }
                return;
            }
            // Nothing open yet (sign-in, empty device): the app itself can
            // load again. Not twice in a row, in case the server answers the
            // health check but not the page, and not when this page was
            // opened by its own address.
            if (window.location.pathname.endsWith('/offline.php')) {
                return;
            }
            var last = 0;
            try {
                last = Number(window.sessionStorage.getItem(AUTO_RELOAD_KEY) || 0);
                window.sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
            } catch (e) { /* ignore */ }
            if (!wasOnline && Date.now() - last > 60000) {
                window.location.reload();
            }
        });
    }

    function schedulePush() {
        if (!state.online) {
            return;
        }
        clearTimeout(state.pushTimer);
        state.pushTimer = setTimeout(pushNow, PUSH_DELAY_MS);
    }

    function copyTitle(heading) {
        return ot('sync.copy_title', { title: heading }, heading + ' (offline copy)');
    }

    function pushNow() {
        if (state.pushing || !state.userId) {
            return Promise.resolve();
        }
        clearTimeout(state.pushTimer);
        state.pushing = true;
        updateStatus();

        var result = null;
        return commitDirty()
            .then(function () {
                return Store.flushOutbox(state.userId, { copyTitle: copyTitle });
            })
            .then(function (pushResult) {
                result = pushResult;
                return loadData();
            })
            .catch(function (e) {
                console.debug('offline-app: push failed:', e);
            })
            .then(function () {
                state.pushing = false;
                if (result) {
                    applyPushResult(result);
                }
                updateStatus();
            });
    }

    function applyPushResult(result) {
        var current = state.currentId;
        var reopen = null;
        var rerender = false;
        var copies = [];
        (result.events || []).forEach(function (event) {
            if (event.type === 'created' || event.type === 'recreated') {
                state.idMap[event.previousId] = event.id;
                if (tabs()) {
                    tabs().renameNote(event.previousId, event.id);
                }
                if (current === event.previousId) {
                    reopen = event.id;
                }
            } else if (event.type === 'copied') {
                copies.push(event);
                // What is on screen is the offline text: it now lives in the copy.
                if (current === event.id) {
                    reopen = event.copyId;
                }
            } else if (event.type === 'merged' && current === event.id) {
                rerender = true;
            }
        });

        if (reopen !== null) {
            state.currentId = reopen;
            renderNote(reopen);
            tabsLoaded(reopen);
            try {
                window.history.replaceState(null, '', 'index.php?note=' + reopen);
            } catch (e) { /* ignore */ }
        } else if (rerender) {
            renderNote(current);
        }
        renderList();

        if (result.offline) {
            state.online = false;
            return;
        }
        if (result.busy) {
            schedulePush();
            return;
        }
        if (result.needsSignIn) {
            showOnlineBanner(
                ot('online.sign_in_needed', null, 'You are back online. Sign in to send the changes made offline.'),
                ot('online.sign_in', null, 'Sign in'),
                'login.php?redirect=' + encodeURIComponent(returnUrl())
            );
            return;
        }
        if (result.wrongAccount) {
            showOnlineBanner(
                ot('online.wrong_account', { name: state.account.displayName || state.account.username },
                    'You are back online, but the browser is signed in to another account. Open Poznote as {{name}} to send the changes made offline.'),
                ot('online.open', null, 'Open Poznote'),
                returnUrl()
            );
            return;
        }

        var messages = [];
        copies.forEach(function (event) {
            messages.push(ot('sync.conflict_copy', { title: event.heading, copy: event.copyHeading },
                '"{{title}}" was also changed elsewhere while you were offline. Your version was saved as "{{copy}}".'));
        });
        (result.events || []).forEach(function (event) {
            if (event.type === 'recreated') {
                messages.push(ot('sync.recreated', { title: event.heading },
                    '"{{title}}" had been deleted elsewhere while you were offline. Your version was saved again as a new note.'));
            }
        });
        var errors = (result.events || []).filter(function (event) { return event.type === 'error'; });
        if (errors.length) {
            messages.push(ot('online.push_failed', { error: errors[0].message }, 'Some changes could not be sent yet ({{error}}). They are kept on this device.'));
        } else if (result.pending === 0) {
            messages.unshift((result.events || []).length
                ? ot('online.synced', null, 'You are back online and your changes have been synced.')
                : ot('online.back', null, 'You are back online.'));
        }
        if (messages.length) {
            showOnlineBanner(messages.join(' '), ot('online.return', null, 'Return to Poznote'), returnUrl());
        }
    }

    // ---- New notes -------------------------------------------------------------------

    function defaultWorkspace() {
        if (state.workspace) {
            return state.workspace;
        }
        var recent = items().filter(function (item) { return item.workspace; }).sort(function (a, b) {
            return itemTime(b) - itemTime(a);
        })[0];
        return (recent && recent.workspace) || state.index.workspaces[0] || '';
    }

    function createNote(type) {
        closeMenus();
        commitDirty().then(function () {
            return Store.createLocalNote(state.userId, {
                type: type,
                workspace: defaultWorkspace(),
                folderId: null,
                heading: t('index.note.new_note', null, 'New note'),
                content: type === 'tasklist' ? '[]' : ''
            });
        }).then(function (entry) {
            state.outbox[entry.id] = entry;
            updateStatus();
            // In a new tab, as in the app (js/utils-note-create.js). Without
            // its isNewNote: that blank placeholder covers a server round
            // trip, and it would empty this page's column.
            return openInTab(entry.id);
        }).then(function () {
            var title = byId('inp' + state.currentId);
            if (title) {
                title.focus();
                title.select();
            }
        }).catch(function (e) {
            console.error('offline-app: createNote() failed:', e);
        });
    }

    function closeMenus() {
        ['offline-new-menu', 'offline-workspace-menu'].forEach(function (id) {
            byId(id).hidden = true;
        });
        byId('offline-new-btn').setAttribute('aria-expanded', 'false');
        byId('offline-workspace-title').setAttribute('aria-expanded', 'false');
    }

    function toggleMenu(menuId, trigger) {
        var menu = byId(menuId);
        var opening = menu.hidden;
        closeMenus();
        menu.hidden = !opening;
        trigger.setAttribute('aria-expanded', opening ? 'true' : 'false');
    }

    // ---- Opening an account ----------------------------------------------------------

    function openAccount(account) {
        state.account = account;
        state.userId = Number(account.userId);
        applyDisplay(account.display);
        return loadData().then(function () {
            renderList();
            show('app');
            updateStatus();
            var wanted = requestedNoteId();
            return wanted ? openNote(wanted) : null;
        }).then(function () {
            startTabs();
            checkConnection();
        }).catch(function (e) {
            console.error('offline-app: openAccount() failed:', e);
            show('offline-empty');
        });
    }

    function wire() {
        byId('offline-signin-form').addEventListener('submit', onSignInSubmit);
        byId('offline-retry-btn').addEventListener('click', function () { window.location.reload(); });
        byId('offline-empty-retry-btn').addEventListener('click', function () { window.location.reload(); });
        byId('offline-logout-btn').addEventListener('click', confirmSignOut);
        byId('offline-unavailable-back').addEventListener('click', backToList);

        var searchInput = byId('unified-search');
        var searchClear = byId('offline-search-clear');
        function applySearch() {
            state.search = searchInput.value || '';
            searchClear.hidden = state.search === '';
            renderList();
            if (tabs()) {
                tabs().render();
            }
        }
        searchInput.addEventListener('input', applySearch);
        searchClear.addEventListener('click', function () {
            searchInput.value = '';
            applySearch();
            searchInput.focus();
        });

        byId('offline-new-btn').addEventListener('click', function (event) {
            event.stopPropagation();
            toggleMenu('offline-new-menu', byId('offline-new-btn'));
        });
        byId('offline-new-menu').addEventListener('click', function (event) {
            var item = event.target.closest('button[data-type]');
            if (item) {
                createNote(item.getAttribute('data-type'));
            }
        });

        var title = byId('offline-workspace-title');
        var openWorkspaces = function (event) {
            if (workspaceNames().length < 2) {
                return;
            }
            event.stopPropagation();
            toggleMenu('offline-workspace-menu', title);
        };
        title.addEventListener('click', openWorkspaces);
        title.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openWorkspaces(event);
            }
        });
        byId('offline-workspace-menu').addEventListener('click', function (event) {
            var item = event.target.closest('button[data-workspace]');
            if (item) {
                state.workspace = item.getAttribute('data-workspace') || '';
                closeMenus();
                renderList();
            }
        });

        byId('offline-list').addEventListener('click', function (event) {
            var folderToggle = event.target.closest('[data-offline-folder]');
            if (folderToggle) {
                var folderId = folderToggle.getAttribute('data-offline-folder');
                state.closedFolders[folderId] = !state.closedFolders[folderId];
                renderList();
                return;
            }
            var link = event.target.closest('a.links_arbo_left');
            if (link) {
                event.preventDefault();
                var id = Number(link.getAttribute('data-note-id'));
                // The note on screen is not opened again (the second click of
                // a double-click, which js/tabs.js is about to sort out)
                if (id === state.currentId && document.getElementById('inp' + id)) {
                    showNoteColumn();
                    return;
                }
                openNote(id);
            }
        });
        // New tab: double-click (the first click already opened the note in
        // the active tab, js/tabs.js sorts that out) or middle-click, as in
        // the app (js/notes-list-events.js)
        byId('offline-list').addEventListener('dblclick', function (event) {
            var link = event.target.closest('a.links_arbo_left');
            if (link) {
                event.preventDefault();
                openInTab(link.getAttribute('data-note-id'), { afterSidebarClick: true });
            }
        });
        byId('offline-list').addEventListener('auxclick', function (event) {
            var link = event.button === 1 && event.target.closest('a.links_arbo_left');
            if (link) {
                event.preventDefault();
                event.stopPropagation();
                openInTab(link.getAttribute('data-note-id'));
            }
        });

        // Toolbar: keep the selection in the note while clicking a button.
        var host = byId('offline-note-host');
        host.addEventListener('mousedown', function (event) {
            if (event.target.closest('.note-edit-toolbar .toolbar-btn')) {
                event.preventDefault();
            }
        });
        host.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (target && host.contains(target)) {
                runAction(target.getAttribute('data-action'), target);
            }
        });

        document.addEventListener('click', function (event) {
            if (!event.target.closest('.sidebar-title-row')) {
                closeMenus();
            }
            if (!event.target.closest('.tasklist-actions-dropdown')) {
                closeTasklistMenus();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeMenus();
                closeTasklistMenus();
            }
            if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
                event.preventDefault();
                markDirty();
                commitDirty();
            }
        });

        window.addEventListener('online', checkConnection);
        window.addEventListener('offline', function () {
            state.online = false;
            updateStatus();
            byId('offline-online-banner').hidden = true;
        });
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                commitDirty();
            }
        });
        window.addEventListener('pagehide', function () {
            commitDirty();
        });
        setInterval(checkConnection, PROBE_INTERVAL_MS);
    }

    function boot() {
        wire();
        // Formatting buttons shown on a text selection, as in the app (main.js).
        if (typeof window.initTextSelectionHandlers === 'function') {
            window.initTextSelectionHandlers();
        }
        if (!Store || !Store.isSupported()) {
            byId('offline-empty-text').textContent = ot('unsupported', null, 'This browser cannot keep notes offline.');
            show('offline-empty');
            return;
        }
        Promise.all([Store.getAccounts(), Store.getMeta('current')]).then(function (both) {
            var accounts = both[0];
            state.currentUserId = both[1] && both[1].userId ? Number(both[1].userId) : 0;
            // A logout clicked in the app without a network: this page stands
            // in for logout.php (sw.js) and signs out on the device. The app's
            // dialog said nothing of changes that would be lost: this one does.
            if (window.location.pathname.endsWith('/logout.php')) {
                var accepted = Store.takeLossAccepted();
                Store.getOutbox(state.currentUserId).catch(function () { return []; }).then(function (pending) {
                    return pending.length && !accepted ? Store.confirmLosingChanges(pending) : true;
                }).then(function (sure) {
                    if (sure) {
                        signOut();
                    } else {
                        window.location.replace('index.php');
                    }
                });
                return;
            }
            var signedOut = takeSignedOutNotice();
            byId('offline-signin-signed-out').hidden = !signedOut;
            state.accounts = (accounts || []).filter(function (account) {
                return account && account.userId && (account.verifier || Number(account.userId) === state.currentUserId);
            });
            if (!state.accounts.length) {
                if (signedOut) {
                    byId('offline-empty-title').textContent = ot('signout.done_title', null, 'You are signed out');
                    byId('offline-empty-text').textContent = ot('signout.done_text', null, 'The notes kept offline were removed from this device.');
                }
                show('offline-empty');
                checkConnection();
                return;
            }
            var unlocked = readUnlocked();
            var account = state.accounts.filter(function (candidate) { return Number(candidate.userId) === unlocked; })[0];
            if (account) {
                openAccount(account);
                return;
            }
            showSignIn();
            checkConnection();
        }).catch(function (e) {
            console.error('offline-app: the offline data could not be read:', e);
            show('offline-empty');
        });
    }

    boot();
})();

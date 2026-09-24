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
 *  - the note list: the notes kept offline open, the others are listed with
 *    a message saying they will open once the connection is back;
 *  - reading and editing: HTML notes (a small toolbar), markdown notes
 *    (source + preview), task lists. Every change is saved on the device at
 *    once (outbox) and new notes can be written;
 *  - the way back: the page watches the connection and, when the server
 *    answers again, sends the changes (conflicts end up as a copy, nothing
 *    is overwritten) and offers to return to the app.
 */
(function () {
    'use strict';

    var Store = window.PoznoteOffline;
    var UNLOCK_KEY = 'poznote_offline_unlocked';
    var AUTO_RELOAD_KEY = 'poznote_offline_auto_reload_at';
    var SAVE_DELAY_MS = 400;
    var PUSH_DELAY_MS = 3000;
    var PROBE_INTERVAL_MS = 20000;
    var OTHER_NOTES_LIMIT = 200;
    var OFFLINE_TYPES = { note: true, markdown: true, tasklist: true };

    var strings = {};
    try {
        strings = JSON.parse(document.getElementById('offline-i18n').textContent || '{}') || {};
    } catch (e) {
        strings = {};
    }
    var lang = document.documentElement.getAttribute('lang') || 'en';

    var state = {
        accounts: [],
        account: null,
        userId: null,
        index: { notes: [], folders: [], workspaces: [] },
        folders: {},
        server: {},
        outbox: {},
        idMap: {},
        workspace: '',
        search: '',
        currentId: null,
        mdMode: 'preview',
        showOther: false,
        online: false,
        pushing: false,
        pushTimer: null,
        saveTimer: null,
        pendingSave: null,
        failedSignIns: 0,
        currentUserId: 0
    };

    // ---- Helpers -------------------------------------------------------------

    function t(key, vars, fallback) {
        var parts = String(key).split('.');
        var current = strings;
        for (var i = 0; i < parts.length && current; i++) {
            current = current[parts[i]];
        }
        var text = typeof current === 'string' ? current : (fallback !== undefined ? fallback : key);
        if (vars) {
            Object.keys(vars).forEach(function (name) {
                text = text.split('{{' + name + '}}').join(String(vars[name]));
            });
        }
        return text;
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

    function icon(name) {
        var node = el('i', 'lucide lucide-' + name);
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

    function formatDate(date) {
        if (!date) {
            return '';
        }
        var seconds = Math.round((date.getTime() - Date.now()) / 1000);
        var abs = Math.abs(seconds);
        try {
            if (abs < 7 * 86400 && window.Intl && Intl.RelativeTimeFormat) {
                var rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
                if (abs < 60) {
                    return rtf.format(0, 'second');
                }
                if (abs < 3600) {
                    return rtf.format(Math.round(seconds / 60), 'minute');
                }
                if (abs < 86400) {
                    return rtf.format(Math.round(seconds / 3600), 'hour');
                }
                return rtf.format(Math.round(seconds / 86400), 'day');
            }
            var sameYear = date.getFullYear() === new Date().getFullYear();
            return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
        } catch (e) {
            return date.toLocaleString();
        }
    }

    function show(sectionId) {
        ['offline-loading', 'offline-signin', 'offline-empty', 'offline-app'].forEach(function (id) {
            byId(id).hidden = id !== sectionId;
        });
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

    function isNarrow() {
        return window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
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
                t('signin.continue', { name: account.displayName || account.username }, 'Continue as {{name}}'));
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
            signInError(t('signin.unknown_account', null, 'The notes of this account are not kept on this device.'));
            return;
        }

        var label = submit.textContent;
        submit.disabled = true;
        submit.textContent = t('signin.checking', null, 'Checking…');
        signInError('');
        Store.checkVerifier(account.verifier, passwordField.value).then(function (ok) {
            if (ok) {
                state.failedSignIns = 0;
                passwordField.value = '';
                unlock(account);
                return;
            }
            state.failedSignIns++;
            signInError(t('signin.wrong_password', null, 'Incorrect password. Use the password you last signed in with on this device.'));
            passwordField.select();
            submit.textContent = label;
            // Each failure waits a little longer before the next try.
            return new Promise(function (resolve) {
                setTimeout(resolve, Math.min(state.failedSignIns, 5) * 1000);
            });
        }).catch(function (e) {
            console.debug('offline-app: checkVerifier() failed:', e);
            signInError(t('signin.wrong_password', null, 'Incorrect password. Use the password you last signed in with on this device.'));
        }).then(function () {
            submit.disabled = false;
            submit.textContent = label;
        });
    }

    function unlock(account) {
        writeUnlocked(account.userId);
        openAccount(account);
    }

    function lock() {
        flushPendingSave().then(function () {
            writeUnlocked(0);
            window.location.reload();
        });
    }

    // ---- Data ------------------------------------------------------------------

    function loadData() {
        var userId = state.userId;
        return Promise.all([Store.getIndex(userId), Store.getNotes(userId), Store.getOutbox(userId)]).then(function (all) {
            var index = all[0] || {};
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

    function items() {
        var byNote = {};
        state.index.notes.forEach(function (meta) {
            byNote[meta.id] = {
                id: Number(meta.id),
                heading: meta.heading || '',
                type: meta.type || 'note',
                workspace: meta.workspace || '',
                folderId: meta.folder_id === undefined ? null : meta.folder_id,
                updated: meta.updated,
                linkedId: meta.linked_note_id || null,
                available: false
            };
        });
        values(state.server).forEach(function (note) {
            var item = byNote[note.id] || (byNote[note.id] = {
                id: Number(note.id),
                type: note.type,
                workspace: note.workspace,
                folderId: note.folderId,
                updated: note.updated
            });
            item.heading = note.heading;
            item.available = true;
            // A note pushed from here is newer than the last list download.
            if (note.updated && (!item.updated || String(note.updated) > String(item.updated))) {
                item.updated = note.updated;
            }
        });
        values(state.outbox).forEach(function (entry) {
            var item = byNote[entry.id] || (byNote[entry.id] = {
                id: Number(entry.id),
                type: entry.type,
                workspace: entry.workspace,
                folderId: entry.folderId,
                updated: null
            });
            item.heading = entry.heading;
            item.available = true;
            item.pending = true;
            item.editedAt = entry.editedAt;
        });
        values(byNote).forEach(function (item) {
            if (item.type === 'linked' && item.linkedId && byNote[item.linkedId]) {
                item.available = !!byNote[item.linkedId].available;
            }
        });
        return values(byNote);
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
        if (note.type === 'note') {
            content = content.replace(/<[^>]*>/g, ' ');
        }
        return content;
    }

    function findItem(id) {
        return items().filter(function (item) { return item.id === Number(id); })[0] || null;
    }

    // ---- List ------------------------------------------------------------------

    function setupWorkspaces() {
        var select = byId('offline-workspace');
        var names = state.index.workspaces.slice();
        items().forEach(function (item) {
            if (item.workspace && names.indexOf(item.workspace) === -1) {
                names.push(item.workspace);
            }
        });
        select.textContent = '';
        var all = el('option', '', t('list.all_workspaces', null, 'All workspaces'));
        all.value = '';
        select.appendChild(all);
        names.forEach(function (name) {
            var option = el('option', '', name);
            option.value = name;
            select.appendChild(option);
        });
        select.value = state.workspace;
        select.hidden = names.length < 2;
    }

    function itemIcon(type) {
        if (type === 'markdown') {
            return 'file-code';
        }
        if (type === 'tasklist') {
            return 'list-checks';
        }
        if (type === 'linked') {
            return 'link';
        }
        return 'file-text';
    }

    function renderItem(item) {
        var button = el('button', 'offline-item' + (item.available ? '' : ' is-unavailable'));
        button.type = 'button';
        button.setAttribute('data-id', String(item.id));
        if (state.currentId === item.id) {
            button.classList.add('is-active');
            button.setAttribute('aria-current', 'true');
        }
        button.appendChild(icon(item.available ? itemIcon(item.type) : 'cloud-off'));

        var text = el('span', 'offline-item-text');
        text.appendChild(el('span', 'offline-item-title', item.heading || t('list.untitled', null, 'Untitled')));
        var meta = [];
        if (!state.workspace && state.index.workspaces.length > 1 && item.workspace) {
            meta.push(item.workspace);
        }
        var path = folderPath(item.folderId);
        if (path) {
            meta.push(path);
        }
        var time = itemTime(item);
        if (time) {
            meta.push(formatDate(new Date(time)));
        }
        text.appendChild(el('span', 'offline-item-meta', meta.join(' · ')));
        button.appendChild(text);

        if (item.pending) {
            var dot = el('span', 'offline-item-pending');
            dot.title = t('list.not_synced', null, 'Not synced yet');
            dot.setAttribute('aria-label', dot.title);
            button.appendChild(dot);
        }
        return button;
    }

    function renderList() {
        var list = byId('offline-list');
        var scroll = list.scrollTop;
        list.textContent = '';

        var query = fold(state.search.trim());
        var matching = items().filter(function (item) {
            if (state.workspace && item.workspace !== state.workspace) {
                return false;
            }
            if (!query) {
                return true;
            }
            return fold(item.heading).indexOf(query) !== -1
                || (item.available && fold(noteText(item.id)).indexOf(query) !== -1);
        }).sort(function (a, b) {
            return itemTime(b) - itemTime(a);
        });

        var available = matching.filter(function (item) { return item.available; });
        var other = matching.filter(function (item) { return !item.available; });

        if (available.length === 0 && other.length === 0) {
            list.appendChild(el('p', 'offline-list-empty', query
                ? t('list.no_results', null, 'No notes match your search.')
                : t('list.empty', null, 'No notes in this workspace.')));
            return;
        }

        if (available.length) {
            list.appendChild(el('h2', 'offline-list-heading', t('list.available', null, 'Available offline')));
            available.forEach(function (item) {
                list.appendChild(renderItem(item));
            });
        }

        if (other.length) {
            var expanded = state.showOther || !!query;
            var toggle = el('button', 'offline-list-heading offline-list-toggle');
            toggle.type = 'button';
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggle.appendChild(icon(expanded ? 'chevron-down' : 'chevron-right'));
            toggle.appendChild(el('span', '', t('list.other', null, 'Other notes') + ' (' + other.length + ')'));
            toggle.appendChild(el('span', 'offline-list-hint', t('list.other_hint', null, 'Not available offline')));
            toggle.addEventListener('click', function () {
                state.showOther = !state.showOther;
                renderList();
            });
            list.appendChild(toggle);
            if (expanded) {
                other.slice(0, OTHER_NOTES_LIMIT).forEach(function (item) {
                    list.appendChild(renderItem(item));
                });
                if (other.length > OTHER_NOTES_LIMIT) {
                    list.appendChild(el('p', 'offline-list-empty',
                        t('list.more', { count: other.length - OTHER_NOTES_LIMIT }, '{{count}} more notes, use the search to find them')));
                }
            }
        }
        list.scrollTop = scroll;
    }

    // ---- Note --------------------------------------------------------------------

    function currentNote() {
        var id = state.currentId;
        return id === null ? null : (state.outbox[id] || state.server[id] || null);
    }

    function renderMeta(id) {
        var metaEl = byId('offline-note-meta');
        metaEl.textContent = '';
        var item = findItem(id);
        var note = state.outbox[id] || state.server[id];
        if (!note) {
            return;
        }
        var parts = [];
        if (item && item.workspace && state.index.workspaces.length > 1) {
            parts.push(item.workspace);
        }
        var path = folderPath(item ? item.folderId : note.folderId);
        if (path) {
            parts.push(path);
        }
        var time = item ? itemTime(item) : 0;
        if (time) {
            parts.push(t('note.modified', { date: formatDate(new Date(time)) }, 'Modified {{date}}'));
        }
        metaEl.appendChild(el('span', '', parts.join(' · ')));

        var entry = state.outbox[id];
        if (entry) {
            var status = el('span', 'offline-note-pending');
            status.appendChild(icon('cloud-off'));
            status.appendChild(el('span', '', entry.lastError
                ? t('note.push_error', { error: entry.lastError }, 'Not sent yet: {{error}}')
                : t('note.saved_locally', null, 'Saved on this device. It will be sent to the server when you are back online.')));
            metaEl.appendChild(status);
        }
    }

    function hideNotePanes() {
        byId('offline-placeholder').hidden = true;
        byId('offline-note').hidden = true;
        byId('offline-unavailable').hidden = true;
    }

    function openNote(id) {
        id = Number(id);
        flushPendingSave();

        var item = findItem(id);
        if (item && item.type === 'linked' && item.linkedId && Number(item.linkedId) !== id) {
            return openNote(item.linkedId);
        }

        state.currentId = id;
        byId('offline-app').classList.add('is-note-open');
        if (id > 0) {
            try {
                window.history.replaceState(null, '', 'index.php?note=' + id);
            } catch (e) { /* ignore */ }
        }

        if (!state.outbox[id] && !state.server[id]) {
            renderUnavailable(item);
            renderList();
            return Promise.resolve();
        }

        state.mdMode = 'preview';
        return adoptMainAppDraft(id).then(function () {
            if (state.currentId !== id) {
                return;
            }
            var note = currentNote();
            if (note && note.type === 'markdown' && !String(note.content || '').trim()) {
                state.mdMode = 'edit';
            }
            renderNote();
            renderList();
        });
    }

    function renderUnavailable(item) {
        hideNotePanes();
        byId('offline-unavailable').hidden = false;
        byId('offline-unavailable-title').textContent = item ? (item.heading || t('list.untitled', null, 'Untitled')) : '';
        var meta = [];
        if (item) {
            var path = folderPath(item.folderId);
            if (path) {
                meta.push(path);
            }
            var date = parseServerDate(item.updated);
            if (date) {
                meta.push(t('note.modified', { date: formatDate(date) }, 'Modified {{date}}'));
            }
        }
        byId('offline-unavailable-meta').textContent = meta.join(' · ');
        var text;
        if (item && !OFFLINE_TYPES[item.type] && item.type !== 'linked') {
            text = t('unavailable.unsupported_type', null, 'This kind of note (a drawing, for instance) cannot be opened offline. It will open as soon as you are back online.');
        } else if (state.index.days) {
            text = t('unavailable.text', { days: state.index.days }, 'Only the notes modified in the last {{days}} days are kept on this device. This one will open as soon as you are back online.');
        } else {
            text = t('unavailable.text_generic', null, 'This note is not kept on this device. It will open as soon as you are back online.');
        }
        byId('offline-unavailable-text').textContent = text;
    }

    function renderNote() {
        var id = state.currentId;
        var note = currentNote();
        if (!note) {
            return;
        }
        hideNotePanes();
        byId('offline-note').hidden = false;

        var title = byId('offline-note-title');
        title.value = note.heading || '';

        renderMeta(id);

        var body = byId('offline-note-body');
        body.textContent = '';
        body.className = 'offline-note-body';
        body.removeAttribute('contenteditable');
        body.oninput = null;
        body.onchange = null;
        byId('offline-html-toolbar').hidden = true;
        byId('offline-mode-btn').hidden = true;

        if (note.type === 'markdown') {
            renderMarkdown(id, note, body);
        } else if (note.type === 'tasklist') {
            renderTasks(id, note, body);
        } else {
            renderHtml(id, note, body);
        }
    }

    function renderHtml(id, note, body) {
        byId('offline-html-toolbar').hidden = false;
        body.classList.add('offline-note-html');
        body.setAttribute('contenteditable', 'true');
        body.setAttribute('spellcheck', 'true');
        // Server-sanitized content (or what was typed here), rendered the way
        // the online editor does.
        body.innerHTML = note.content || '';
        body.oninput = function () {
            queueSave(id, { content: body.innerHTML });
        };
        // A ticked box only changes a property: write it into the markup the
        // way the online editor does (js/checklist.js), or it is not saved.
        body.onchange = function (event) {
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
            queueSave(id, { content: body.innerHTML });
        };
    }

    function renderMarkdown(id, note, body) {
        var modeButton = byId('offline-mode-btn');
        modeButton.hidden = false;
        modeButton.textContent = state.mdMode === 'edit'
            ? t('note.preview', null, 'Preview')
            : t('note.edit', null, 'Edit');

        if (state.mdMode === 'edit') {
            var editor = el('textarea', 'offline-markdown-editor');
            editor.value = note.content || '';
            editor.setAttribute('spellcheck', 'true');
            editor.setAttribute('aria-label', t('note.content', null, 'Note content'));
            editor.addEventListener('input', function () {
                autoGrow(editor);
                queueSave(id, { content: editor.value });
            });
            body.appendChild(editor);
            autoGrow(editor);
            return;
        }

        var preview = el('div', 'markdown-preview offline-markdown-preview');
        var source = String(note.content || '');
        if (typeof window.parseMarkdown === 'function') {
            try {
                preview.innerHTML = window.parseMarkdown(source);
            } catch (e) {
                preview.appendChild(el('pre', '', source));
            }
        } else {
            preview.appendChild(el('pre', '', source));
        }
        preview.addEventListener('dblclick', function () {
            setMarkdownMode('edit');
        });
        body.appendChild(preview);
    }

    function setMarkdownMode(mode) {
        flushPendingSave().then(function () {
            state.mdMode = mode;
            renderNote();
            if (mode === 'edit') {
                var editor = document.querySelector('.offline-markdown-editor');
                if (editor) {
                    editor.focus();
                }
            }
        });
    }

    function autoGrow(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(textarea.scrollHeight, 240) + 'px';
    }

    function parseTasks(content) {
        try {
            var parsed = JSON.parse(content || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function renderTasks(id, note, body) {
        var tasks = parseTasks(note.content);
        var wrapper = el('div', 'offline-tasks');

        var save = function () {
            queueSave(id, { content: JSON.stringify(tasks) });
        };

        var add = el('input', 'offline-task-add');
        add.type = 'text';
        add.placeholder = t('tasks.add_placeholder', null, 'Add a task and press Enter');
        add.setAttribute('aria-label', add.placeholder);
        add.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.isComposing) {
                return;
            }
            event.preventDefault();
            var text = add.value.trim();
            if (!text) {
                return;
            }
            var task = { id: Date.now() + Math.random(), text: text, completed: false };
            if (id > 0) {
                task.noteId = String(id);
            }
            tasks.push(task);
            add.value = '';
            save();
            renderTaskRows();
        });
        wrapper.appendChild(add);

        var list = el('ul', 'offline-task-list');
        wrapper.appendChild(list);

        function renderTaskRows() {
            list.textContent = '';
            if (!tasks.length) {
                list.appendChild(el('li', 'offline-task-empty', t('tasks.empty', null, 'No tasks yet.')));
                return;
            }
            tasks.forEach(function (task, index) {
                var row = el('li', 'offline-task' + (task.completed ? ' is-completed' : ''));
                var label = el('label', 'offline-task-label');
                var box = el('input');
                box.type = 'checkbox';
                box.checked = !!task.completed;
                box.addEventListener('change', function () {
                    task.completed = box.checked;
                    row.classList.toggle('is-completed', box.checked);
                    save();
                });
                label.appendChild(box);
                label.appendChild(el('span', 'offline-task-text', task.text || ''));
                row.appendChild(label);

                var remove = el('button', 'offline-icon-button offline-task-delete');
                remove.type = 'button';
                remove.title = t('tasks.delete', null, 'Delete task');
                remove.setAttribute('aria-label', remove.title);
                remove.appendChild(icon('x'));
                remove.addEventListener('click', function () {
                    tasks.splice(index, 1);
                    save();
                    renderTaskRows();
                });
                row.appendChild(remove);
                list.appendChild(row);
            });
        }

        renderTaskRows();
        body.appendChild(wrapper);
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

    // ---- Saving on the device ----------------------------------------------------

    function queueSave(id, changes) {
        if (state.pendingSave && state.pendingSave.id !== id) {
            flushPendingSave();
        }
        if (!state.pendingSave) {
            state.pendingSave = { id: id, changes: {} };
        }
        Object.keys(changes).forEach(function (key) {
            state.pendingSave.changes[key] = changes[key];
        });
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(flushPendingSave, SAVE_DELAY_MS);
    }

    function flushPendingSave() {
        clearTimeout(state.saveTimer);
        var job = state.pendingSave;
        state.pendingSave = null;
        if (!job) {
            return Promise.resolve();
        }
        var id = job.id;
        // A note created here and meanwhile created on the server too.
        if (state.idMap[id] && !state.outbox[id] && !state.server[id]) {
            id = state.idMap[id];
        }
        var base = state.server[id] || state.outbox[id];
        if (!base) {
            return Promise.resolve();
        }
        return Store.saveLocalEdit(state.userId, base, job.changes).then(function (entry) {
            if (entry) {
                state.outbox[id] = entry;
            } else {
                delete state.outbox[id];
            }
            if (state.currentId === id) {
                renderMeta(id);
            }
            renderList();
            updateStatus();
            schedulePush();
        }).catch(function (e) {
            console.error('offline-app: the change could not be saved on this device:', e);
        });
    }

    // ---- Connection and push -------------------------------------------------------

    function pendingCount() {
        return Object.keys(state.outbox).length;
    }

    function updateStatus() {
        var status = byId('offline-status');
        var text = status.querySelector('.offline-status-text');
        var statusIcon = status.querySelector('.lucide');
        var pending = pendingCount();
        var label;
        if (state.pushing) {
            statusIcon.className = 'lucide lucide-refresh-cw';
            label = t('status.syncing', null, 'Syncing…');
        } else {
            statusIcon.className = 'lucide ' + (state.online ? 'lucide-wifi' : 'lucide-wifi-off');
            label = state.online ? t('status.online', null, 'Online') : t('status.offline', null, 'Offline');
            if (pending) {
                label += ' · ' + (pending === 1
                    ? t('status.pending_one', null, '1 change waiting')
                    : t('status.pending_other', { count: pending }, '{{count}} changes waiting'));
            }
        }
        text.textContent = label;
        status.classList.toggle('is-online', state.online);
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
            if (!byId('offline-app').hidden) {
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
        return t('sync.copy_title', { title: heading }, heading + ' (offline copy)');
    }

    function pushNow() {
        if (state.pushing || !state.userId) {
            return Promise.resolve();
        }
        clearTimeout(state.pushTimer);
        state.pushing = true;
        updateStatus();

        var result = null;
        return flushPendingSave()
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

        renderList();
        if (reopen !== null) {
            state.currentId = reopen;
            renderNote();
            try {
                window.history.replaceState(null, '', 'index.php?note=' + reopen);
            } catch (e) { /* ignore */ }
            renderList();
        } else if (rerender) {
            renderNote();
        } else if (current !== null && (state.outbox[current] || state.server[current])) {
            renderMeta(current);
        }

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
                t('online.sign_in_needed', null, 'You are back online. Sign in to send the changes made offline.'),
                t('online.sign_in', null, 'Sign in'),
                'login.php?redirect=' + encodeURIComponent(returnUrl())
            );
            return;
        }
        if (result.wrongAccount) {
            showOnlineBanner(
                t('online.wrong_account', { name: state.account.displayName || state.account.username },
                    'You are back online, but the browser is signed in to another account. Open Poznote as {{name}} to send the changes made offline.'),
                t('online.open', null, 'Open Poznote'),
                returnUrl()
            );
            return;
        }

        var messages = [];
        copies.forEach(function (event) {
            messages.push(t('sync.conflict_copy', { title: event.heading, copy: event.copyHeading },
                '"{{title}}" was also changed elsewhere while you were offline. Your version was saved as "{{copy}}".'));
        });
        (result.events || []).forEach(function (event) {
            if (event.type === 'recreated') {
                messages.push(t('sync.recreated', { title: event.heading },
                    '"{{title}}" had been deleted elsewhere while you were offline. Your version was saved again as a new note.'));
            }
        });
        var errors = (result.events || []).filter(function (event) { return event.type === 'error'; });
        if (errors.length) {
            messages.push(t('online.push_failed', { error: errors[0].message }, 'Some changes could not be sent yet ({{error}}). They are kept on this device.'));
        } else if (result.pending === 0) {
            messages.unshift((result.events || []).length
                ? t('online.synced', null, 'You are back online and your changes have been synced.')
                : t('online.back', null, 'You are back online.'));
        }
        if (messages.length) {
            showOnlineBanner(messages.join(' '), t('online.return', null, 'Return to Poznote'), returnUrl());
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
        closeNewMenu();
        flushPendingSave().then(function () {
            return Store.createLocalNote(state.userId, {
                type: type,
                workspace: defaultWorkspace(),
                folderId: null,
                heading: t('new.default_title', null, 'New note'),
                content: type === 'tasklist' ? '[]' : ''
            });
        }).then(function (entry) {
            state.outbox[entry.id] = entry;
            updateStatus();
            return openNote(entry.id);
        }).then(function () {
            var title = byId('offline-note-title');
            title.focus();
            title.select();
        }).catch(function (e) {
            console.error('offline-app: createNote() failed:', e);
        });
    }

    function closeNewMenu() {
        byId('offline-new-menu').hidden = true;
        byId('offline-new-btn').setAttribute('aria-expanded', 'false');
    }

    // ---- Opening an account ----------------------------------------------------------

    function openAccount(account) {
        state.account = account;
        state.userId = Number(account.userId);
        return loadData().then(function () {
            byId('offline-account-name').textContent = account.displayName || account.username || '';
            setupWorkspaces();
            renderList();
            show('offline-app');
            updateStatus();

            var wanted = requestedNoteId();
            if (wanted) {
                openNote(wanted);
            } else if (!isNarrow()) {
                hideNotePanes();
                byId('offline-placeholder').hidden = false;
            }
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
        byId('offline-lock-btn').addEventListener('click', lock);

        byId('offline-search').addEventListener('input', function (event) {
            state.search = event.target.value || '';
            renderList();
        });
        byId('offline-workspace').addEventListener('change', function (event) {
            state.workspace = event.target.value || '';
            renderList();
        });

        byId('offline-list').addEventListener('click', function (event) {
            var button = event.target.closest('.offline-item');
            if (button) {
                openNote(Number(button.getAttribute('data-id')));
            }
        });

        byId('offline-back-btn').addEventListener('click', backToList);
        byId('offline-unavailable-back').addEventListener('click', backToList);

        byId('offline-note-title').addEventListener('input', function (event) {
            if (state.currentId !== null) {
                queueSave(state.currentId, { heading: event.target.value });
            }
        });

        byId('offline-mode-btn').addEventListener('click', function () {
            setMarkdownMode(state.mdMode === 'edit' ? 'preview' : 'edit');
        });

        var toolbar = byId('offline-html-toolbar');
        toolbar.addEventListener('mousedown', function (event) {
            // Keep the selection in the note while clicking a button.
            if (event.target.closest('button')) {
                event.preventDefault();
            }
        });
        toolbar.addEventListener('click', function (event) {
            var button = event.target.closest('button[data-command]');
            if (!button) {
                return;
            }
            var command = button.getAttribute('data-command');
            var value = button.getAttribute('data-value') || null;
            if (command === 'formatBlock') {
                var currentBlock = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
                value = currentBlock === value ? 'p' : value;
            }
            byId('offline-note-body').focus();
            document.execCommand(command, false, value);
        });

        var newButton = byId('offline-new-btn');
        newButton.addEventListener('click', function (event) {
            event.stopPropagation();
            var menu = byId('offline-new-menu');
            menu.hidden = !menu.hidden;
            newButton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
        });
        byId('offline-new-menu').addEventListener('click', function (event) {
            var item = event.target.closest('button[data-type]');
            if (item) {
                createNote(item.getAttribute('data-type'));
            }
        });
        document.addEventListener('click', function (event) {
            if (!event.target.closest('.offline-new')) {
                closeNewMenu();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeNewMenu();
            }
            if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
                event.preventDefault();
                flushPendingSave();
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
                flushPendingSave();
            }
        });
        window.addEventListener('pagehide', function () {
            flushPendingSave();
        });
        setInterval(checkConnection, PROBE_INTERVAL_MS);
    }

    function backToList() {
        flushPendingSave();
        state.currentId = null;
        byId('offline-app').classList.remove('is-note-open');
        hideNotePanes();
        byId('offline-placeholder').hidden = false;
        renderList();
    }

    function boot() {
        wire();
        if (!Store || !Store.isSupported()) {
            byId('offline-empty-text').textContent = t('unsupported', null, 'This browser cannot keep notes offline.');
            show('offline-empty');
            return;
        }
        Promise.all([Store.getAccounts(), Store.getMeta('current')]).then(function (both) {
            var accounts = both[0];
            state.currentUserId = both[1] && both[1].userId ? Number(both[1].userId) : 0;
            state.accounts = (accounts || []).filter(function (account) {
                return account && account.userId && (account.verifier || Number(account.userId) === state.currentUserId);
            });
            if (!state.accounts.length) {
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

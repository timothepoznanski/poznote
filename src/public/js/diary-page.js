(function () {
    'use strict';

    var data = window.DIARY_DATA || { notes: [] };
    var notes = data.notes || [];
    var txt = data.txt || {};
    var activeFilterTerm = '';

    // 'board' (month-grouped cards) or 'journal' (full entries, newest first).
    // A per-user display preference, like the board's size and layout.
    var VIEW_MODE_KEY = 'diaryViewMode';
    var viewMode = 'board';

    // --- Helpers (same conventions as dashboard-page.js) ---

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeSearchText(value) {
        var text = String(value || '').toLowerCase();
        if (typeof text.normalize === 'function') {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return text;
    }

    function getNoteSearchValue(note) {
        var tags = note.tags || [];
        var taskText = '';
        if (Array.isArray(note.tasks)) {
            taskText = note.tasks.map(function (task) { return task.text || ''; }).join(' ');
        }
        return normalizeSearchText(note.search || (note.heading + ' ' + tags.join(' ') + ' ' + (note.text || '') + ' ' + taskText));
    }

    function noteMatchesSearch(note, term) {
        var haystack = getNoteSearchValue(note);
        var tokens = term.split(/\s+/).filter(Boolean);
        return tokens.every(function (token) {
            return haystack.indexOf(token) !== -1;
        });
    }

    function monthKey(note) {
        // note.entryDate is 'YYYY-MM-DD': the title date when the title is a
        // valid date, otherwise the creation date in the user's timezone.
        return String(note.entryDate || note.created || '').slice(0, 7);
    }

    function monthLabel(key) {
        var parts = key.split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        if (!year || !month) return key;
        var date = new Date(year, month - 1, 1);
        try {
            var label = date.toLocaleDateString(data.lang || undefined, { month: 'long', year: 'numeric' });
            return label.charAt(0).toUpperCase() + label.slice(1);
        } catch (e) {
            return key;
        }
    }

    // --- Card builder (mirrors dashboard-page.js buildNoteCard) ---

    function buildNoteCard(note) {
        var tags = note.tags || [];
        var isToday = data.todayNoteId && note.id === data.todayNoteId;

        var content = '';
        if (note.tasks !== null && note.tasks !== undefined && note.tasks.length > 0) {
            content = '<ul class="board-card-tasks">';
            note.tasks.forEach(function (task) {
                content += '<li class="' + (task.done ? 'done' : '') + '">' +
                    '<i class="lucide ' + (task.done ? 'lucide-check-square' : 'lucide-square') + '"></i>' +
                    '<span>' + esc(task.text) + '</span></li>';
            });
            content += '</ul>';
        } else if (note.text) {
            // The preview keeps the note's line breaks; render them as <br>
            // (line-clamp handles <br> correctly, unlike white-space: pre-line)
            content = '<div class="board-card-excerpt">' + esc(note.text).replace(/\n/g, '<br>') + '</div>';
        }

        // First image of the note as a thumbnail next to the excerpt
        if (note.image) {
            content = '<div class="dash-card-body">' + content +
                '<div class="dash-card-thumb"><img src="' + esc(note.image) + '" alt="" loading="lazy" decoding="async"></div>' +
            '</div>';
        }

        var footer = '';
        if (tags.length > 0 || isToday) {
            footer = '<div class="board-card-footer">';
            if (isToday) {
                footer += '<span class="board-card-tag diary-today-tag">' + esc(txt.today || 'Today') + '</span>';
            }
            tags.slice(0, 3).forEach(function (tag) {
                footer += '<span class="board-card-tag">' + esc(tag) + '</span>';
            });
            footer += '</div>';
        }

        var iconHtml = buildNoteIcon(note, 'dash-note-icon');

        return '<div class="dash-card dash-note-card' + (isToday ? ' diary-card-today' : '') + '" data-note-id="' + note.id + '" title="' + esc(note.heading) + '">' +
            '<a class="dash-card-link" href="' + esc(note.url) + '">' +
                '<div class="dash-card-note-title">' + iconHtml + esc(note.heading) + '</div>' +
                content +
            '</a>' +
            footer +
        '</div>';
    }

    // --- Journal view ---
    //
    // Every entry in one scrolling column, newest first, with its full body.
    // DIARY_DATA already holds each entry's metadata and excerpt; bodies come
    // rendered from api/v1/diary/entries.php. Entries are appended a chunk at a
    // time when the reader nears the end of the column, and each chunk fetches
    // its bodies in one request, so a diary of years of notes stays cheap to
    // open. The excerpt stands in until the body arrives.

    var JOURNAL_CHUNK = 10;
    // Start the next chunk this far before the reader reaches the end.
    var JOURNAL_LOOKAHEAD_PX = 1200;
    var journalBodies = {};   // note id -> rendered html, kept across re-renders
    var journalFailed = {};   // note id -> true when its body could not be loaded
    var journalPending = {};  // note id -> true while its body is being fetched
    var journalNotes = [];    // entries of the current render, filter applied
    var journalShown = 0;     // how many of them are in the DOM
    var journalObserver = null;

    function readViewMode() {
        try {
            var store = window.__poznoteUserStorage || window.localStorage;
            return store.getItem(VIEW_MODE_KEY) === 'journal' ? 'journal' : 'board';
        } catch (e) {
            return 'board';
        }
    }

    function saveViewMode(mode) {
        try {
            var store = window.__poznoteUserStorage || window.localStorage;
            store.setItem(VIEW_MODE_KEY, mode);
        } catch (e) { /* storage unavailable */ }
    }

    function capitalize(label) {
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function longDateLabel(iso) {
        var parts = String(iso || '').split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        var day = parseInt(parts[2], 10);
        if (!year || !month || !day) return String(iso || '');
        try {
            return capitalize(new Date(year, month - 1, day).toLocaleDateString(data.lang || undefined, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }));
        } catch (e) {
            return String(iso);
        }
    }

    function buildNoteIcon(note, extraClass) {
        if (!note.icon) return '';
        if (note.icon.indexOf('lucide') !== -1) {
            var iconStyle = note.iconColor ? ' style="color:' + esc(note.iconColor) + ' !important"' : '';
            return '<i class="' + esc(note.icon) + ' ' + extraClass + '"' + iconStyle + '></i>';
        }
        return '<span class="' + extraClass + ' dash-note-icon-emoji">' + esc(note.icon) + '</span>';
    }

    function buildJournalExcerpt(note) {
        if (Array.isArray(note.tasks) && note.tasks.length > 0) {
            return '<ul class="diary-journal-tasks">' + note.tasks.map(function (task) {
                return '<li class="' + (task.done ? 'completed' : '') + '">' +
                    '<input type="checkbox" disabled' + (task.done ? ' checked' : '') + '> ' +
                    '<span>' + esc(task.text) + '</span></li>';
            }).join('') + '</ul>';
        }
        return note.text ? '<p>' + esc(note.text).replace(/\n/g, '<br>') + '</p>' : '';
    }

    function buildJournalEntry(note) {
        var isToday = data.todayNoteId && note.id === data.todayNoteId;
        var title = note.dated ? longDateLabel(note.entryDate) : note.heading;
        var subtitle = note.dated ? '' : '<span class="diary-journal-subtitle">' + esc(longDateLabel(note.entryDate)) + '</span>';
        var trashLabel = txt.journalTrash || 'Move to trash';
        var editable = journalNoteIsEditable(note);
        var editLabel = txt.journalEdit || 'Edit here';

        var tags = (note.tags || []).map(function (tag) {
            return '<span class="board-card-tag">' + esc(tag) + '</span>';
        }).join('');

        return '<article class="diary-journal-entry' + (isToday ? ' is-today' : '') + '" data-note-id="' + note.id + '">' +
            '<header class="diary-journal-header">' +
                '<h2 class="diary-journal-title">' +
                    '<a href="' + esc(note.url) + '">' + buildNoteIcon(note, 'diary-journal-icon') + esc(title) + '</a>' +
                '</h2>' +
                (isToday ? '<span class="board-card-tag diary-today-tag">' + esc(txt.today || 'Today') + '</span>' : '') +
                subtitle +
                '<span class="diary-journal-save-status" aria-live="polite"></span>' +
                // The pencil edits in place (the title opens the note); a
                // tasklist or a shortcut has no inline editor and no pencil
                (editable
                    ? '<button type="button" class="diary-journal-edit" title="' + esc(editLabel) + '" aria-label="' + esc(editLabel) + '">' +
                        '<i class="lucide lucide-pencil"></i>' +
                      '</button>'
                    : '') +
                '<button type="button" class="diary-journal-delete" title="' + esc(trashLabel) + '" aria-label="' + esc(trashLabel) + '">' +
                    '<i class="lucide lucide-trash-2"></i>' +
                '</button>' +
            '</header>' +
            // Markdown paragraphs carry their own gap, rich-text ones are flush
            // as in the editor (same split as public_note.css).
            '<div class="diary-journal-body' + (note.type === 'markdown' ? ' diary-journal-markdown' : '') + ' is-loading">' +
                buildJournalExcerpt(note) +
            '</div>' +
            (tags ? '<div class="board-card-footer diary-journal-tags">' + tags + '</div>' : '') +
        '</article>';
    }

    // The body is shown, not edited: nothing in it may change the note.
    function prepareJournalBody(body) {
        body.querySelectorAll('[contenteditable]').forEach(function (el) {
            el.removeAttribute('contenteditable');
        });
        body.querySelectorAll('input, button, select, textarea').forEach(function (el) {
            el.disabled = true;
            el.tabIndex = -1;
        });
        body.querySelectorAll('a[href]').forEach(function (link) {
            if (/^https?:\/\//i.test(link.getAttribute('href') || '')) {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        });
    }

    function fillJournalBody(noteId) {
        var entry = document.querySelector('.diary-journal-entry[data-note-id="' + noteId + '"]');
        if (!entry) return;
        var body = entry.querySelector('.diary-journal-body');
        if (!body || !body.classList.contains('is-loading') || body.classList.contains('is-editing')) return;

        if (journalFailed[noteId]) {
            body.classList.remove('is-loading');
            body.insertAdjacentHTML('beforeend', '<p class="diary-journal-error">' +
                esc(txt.journalLoadError || 'Could not load this entry.') + '</p>');
            realignAfterBodyLoad(entry);
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(journalBodies, noteId)) return;

        var html = journalBodies[noteId];
        body.classList.remove('is-loading');
        if (html) {
            body.innerHTML = html;
            prepareJournalBody(body);
        } else {
            body.innerHTML = '<p class="diary-journal-empty">' + esc(txt.journalEmptyEntry || 'This entry is empty.') + '</p>';
        }
        realignAfterBodyLoad(entry);
    }

    function loadJournalBodies(chunk) {
        var missing = chunk.filter(function (note) {
            return !Object.prototype.hasOwnProperty.call(journalBodies, note.id) &&
                !journalFailed[note.id] && !journalPending[note.id];
        }).map(function (note) { return note.id; });

        // Cached bodies go in right away; a re-render (filter typing) while a
        // request is in flight leaves those entries to that request.
        chunk.forEach(function (note) { fillJournalBody(note.id); });
        if (missing.length === 0) return;
        missing.forEach(function (id) { journalPending[id] = true; });
        // A body saved in place while this request is out is fetched again
        // by invalidateJournalBody(): this response must not overwrite it
        var generation = {};
        missing.forEach(function (id) { generation[id] = journalBodyGen[id] || 0; });
        var isCurrent = function (id) { return (journalBodyGen[id] || 0) === generation[id]; };

        var url = 'api/v1/diary/entries.php?ids=' + missing.join(',') +
            '&workspace=' + encodeURIComponent(data.workspace || '');
        fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (result) {
                var entries = (result && result.entries) || {};
                missing.forEach(function (id) {
                    if (!isCurrent(id)) return;
                    delete journalPending[id];
                    if (Object.prototype.hasOwnProperty.call(entries, id)) {
                        journalBodies[id] = String(entries[id] || '');
                    } else {
                        journalFailed[id] = true;
                    }
                    fillJournalBody(id);
                });
            })
            .catch(function () {
                missing.forEach(function (id) {
                    if (!isCurrent(id)) return;
                    delete journalPending[id];
                    journalFailed[id] = true;
                    fillJournalBody(id);
                });
            });
    }

    function appendJournalChunk() {
        var list = document.querySelector('.diary-journal-list');
        if (!list || journalShown >= journalNotes.length) return false;

        var chunk = journalNotes.slice(journalShown, journalShown + JOURNAL_CHUNK);
        journalShown += chunk.length;
        list.insertAdjacentHTML('beforeend', chunk.map(buildJournalEntry).join(''));
        loadJournalBodies(chunk);
        return true;
    }

    // Keep appending while the end of the column is within the lookahead: the
    // observer only reports changes, so a chunk too short to push the sentinel
    // out of range would otherwise stop the loading.
    function fillJournalViewport() {
        var sentinel = document.querySelector('.diary-journal-sentinel');
        while (sentinel && journalShown < journalNotes.length &&
               sentinel.getBoundingClientRect().top < window.innerHeight + JOURNAL_LOOKAHEAD_PX) {
            appendJournalChunk();
        }
    }

    function renderJournal(container, visibleNotes) {
        finishAllJournalEdits(null);
        if (journalObserver) {
            journalObserver.disconnect();
            journalObserver = null;
        }
        journalNotes = visibleNotes;
        journalShown = 0;

        // Only existing entries: a day without one has no slot in the column
        // (the "Today's entry" button above creates it).
        container.innerHTML = '<div class="diary-journal">' +
            '<div class="diary-journal-list"></div>' +
            '<div class="diary-journal-sentinel" aria-hidden="true"></div>' +
        '</div>';

        appendJournalChunk();
        fillJournalViewport();
        renderOutline();

        var sentinel = container.querySelector('.diary-journal-sentinel');
        if (sentinel && 'IntersectionObserver' in window) {
            journalObserver = new IntersectionObserver(function (records) {
                if (records.some(function (r) { return r.isIntersecting; })) {
                    fillJournalViewport();
                }
            }, { rootMargin: '0px 0px ' + JOURNAL_LOOKAHEAD_PX + 'px 0px' });
            journalObserver.observe(sentinel);
        } else {
            while (appendJournalChunk()) { /* no observer: show everything */ }
        }
    }

    // --- Journal inline editing ---
    //
    // An entry is edited where it is read: its pencil, or a click in its
    // body, swaps the rendered body for an editor on the note's source (a
    // textarea for markdown, a rich-text area for HTML notes), and the note
    // is saved through PATCH api/v1/notes/{id} as the writer types. The
    // journal takes no edit lock, like the other one-shot writers (issue
    // 1366): every save carries if_version, so a note changed elsewhere in
    // the meantime is never overwritten. Leaving the editor (Done, Escape, a
    // click outside the entry) saves what is pending and renders the body
    // again from the server. Tasklists and shortcuts open in the editor.

    var JOURNAL_SAVE_DELAY_MS = 1200;
    var journalEdits = {};    // note id -> edit state while its editor is open
    var journalBodyGen = {};  // note id -> bumped when a cached body is retired

    function journalNoteIsEditable(note) {
        return !!note && (note.type === 'note' || note.type === 'markdown');
    }

    function findJournalNote(noteId) {
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === noteId) return notes[i];
        }
        return null;
    }

    function journalEditList() {
        return Object.keys(journalEdits).map(function (id) { return journalEdits[id]; });
    }

    function journalHasUnsavedEdit() {
        return journalEditList().some(function (state) { return state.dirty || state.saving; });
    }

    function setJournalSaveStatus(entry, kind, text) {
        var status = entry.querySelector('.diary-journal-save-status');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('is-error', kind === 'error');
        status.classList.toggle('is-saving', kind === 'saving');
    }

    function setJournalEditButton(entry, editing) {
        var btn = entry.querySelector('.diary-journal-edit');
        if (!btn) return;
        var label = editing ? (txt.journalEditDone || 'Done editing') : (txt.journalEdit || 'Edit here');
        btn.title = label;
        btn.setAttribute('aria-label', label);
        var icon = btn.querySelector('.lucide');
        if (icon) icon.className = 'lucide ' + (editing ? 'lucide-check' : 'lucide-pencil');
    }

    // The cached body is stale once the note was saved: drop it and, when the
    // entry is on screen, fetch it again. The generation guards a fetch that
    // was already in flight for the old content.
    function invalidateJournalBody(note) {
        journalBodyGen[note.id] = (journalBodyGen[note.id] || 0) + 1;
        delete journalBodies[note.id];
        delete journalFailed[note.id];
        delete journalPending[note.id];
        var entry = entryElement(note.id);
        if (!entry) return;
        var body = entry.querySelector('.diary-journal-body');
        if (!body || body.classList.contains('is-editing')) return;
        body.classList.add('is-loading');
        body.innerHTML = buildJournalExcerpt(note);
        loadJournalBodies([note]);
    }

    // The filter and the board's cards read the excerpt: keep them current
    // without waiting for a page reload.
    function updateJournalNoteExcerpt(note, content, type) {
        var text;
        if (type === 'markdown') {
            text = String(content || '');
        } else {
            var holder = document.createElement('div');
            holder.innerHTML = String(content || '');
            text = holder.textContent || '';
        }
        text = text.replace(/\s+/g, ' ').trim();
        note.text = text.length > 300 ? text.slice(0, 300) : text;
        note.search = normalizeSearchText(note.heading + ' ' + (note.tags || []).join(' ') + ' ' + text);
    }

    function journalEditorContent(state) {
        return state.type === 'markdown' ? state.editor.value : state.editor.innerHTML;
    }

    function autosizeJournalEditor(editor) {
        if (editor.tagName !== 'TEXTAREA') return;
        editor.style.height = 'auto';
        editor.style.height = (editor.scrollHeight + 2) + 'px';
    }

    function placeJournalCaret(state) {
        var editor = state.editor;
        // Writing continues at the end, unless the end is off screen: then the
        // page must not jump, and the caret starts at the top.
        var atEnd = editor.getBoundingClientRect().bottom <= window.innerHeight;
        try {
            editor.focus({ preventScroll: true });
        } catch (e) {
            editor.focus();
        }
        if (state.type === 'markdown') {
            var pos = atEnd ? editor.value.length : 0;
            editor.setSelectionRange(pos, pos);
            return;
        }
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection) return;
        var range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(!atEnd);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function scheduleJournalSave(state) {
        state.dirty = true;
        if (state.conflict) return;
        setJournalSaveStatus(state.entry, '', '');
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(function () { saveJournalEdit(state); }, JOURNAL_SAVE_DELAY_MS);
    }

    // Resolves to true once the editor's content is on the server. A failed
    // save leaves the state dirty, so the next keystroke (or Done) retries;
    // a version conflict stops the saving for good, the writer is told.
    function saveJournalEdit(state) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
        if (state.conflict) return Promise.resolve(false);
        if (state.saving) {
            state.saveAgain = true;
            return state.saving;
        }
        if (!state.dirty) return Promise.resolve(true);

        var content = journalEditorContent(state);
        state.dirty = false;
        setJournalSaveStatus(state.entry, 'saving', txt.journalSaving || 'Saving...');

        state.saving = fetch('api/v1/notes/' + encodeURIComponent(state.noteId), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ content: content, if_version: state.version })
        })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (result) {
                    if (response.status === 409) {
                        state.conflict = true;
                        throw new Error(result.error || 'version_conflict');
                    }
                    if (!response.ok || !result.note) {
                        throw new Error(result.error || result.message || ('HTTP ' + response.status));
                    }
                    if (result.note.version) state.version = result.note.version;
                    updateJournalNoteExcerpt(state.note, content, state.type);
                    setJournalSaveStatus(state.entry, 'saved', txt.journalSaved || 'Saved');
                    return true;
                });
            })
            .catch(function (err) {
                state.dirty = true;
                if (state.conflict) {
                    setJournalSaveStatus(state.entry, 'error', txt.journalConflict ||
                        'This entry was changed elsewhere. Your latest changes here were not saved: reload the page to see the current version.');
                } else {
                    setJournalSaveStatus(state.entry, 'error', (txt.journalSaveError || 'Could not save this entry.') + ' ' + err.message);
                }
                return false;
            })
            .then(function (ok) {
                state.saving = null;
                if (state.saveAgain) {
                    state.saveAgain = false;
                    if (state.dirty) return saveJournalEdit(state);
                }
                return ok;
            });
        return state.saving;
    }

    function openJournalEditor(entry, note, fresh) {
        var body = entry.querySelector('.diary-journal-body');
        if (!body) return;
        var type = fresh.type === 'markdown' ? 'markdown' : 'note';
        var placeholder = txt.journalEditPlaceholder || 'Write here...';
        var editor;
        if (type === 'markdown') {
            editor = document.createElement('textarea');
            editor.className = 'diary-journal-editor diary-journal-editor-markdown';
            editor.value = String(fresh.content || '');
            editor.placeholder = placeholder;
        } else {
            editor = document.createElement('div');
            editor.className = 'diary-journal-editor diary-journal-editor-richtext';
            editor.contentEditable = 'true';
            editor.innerHTML = String(fresh.content || '');
            editor.setAttribute('data-placeholder', placeholder);
        }

        var state = {
            noteId: note.id,
            note: note,
            entry: entry,
            editor: editor,
            type: type,
            version: fresh.version || '',
            dirty: false,
            saving: null,
            saveAgain: false,
            saveTimer: null,
            conflict: false
        };
        journalEdits[note.id] = state;

        body.classList.remove('is-loading');
        body.classList.add('is-editing');
        body.innerHTML = '';
        body.appendChild(editor);
        entry.classList.add('is-editing');
        setJournalEditButton(entry, true);
        setJournalSaveStatus(entry, '', '');

        editor.addEventListener('input', function () {
            autosizeJournalEditor(editor);
            scheduleJournalSave(state);
        });
        editor.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                finishJournalEdit(state);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                saveJournalEdit(state);
                return;
            }
            // Two spaces indent a markdown list item; the focus stays put
            if (e.key === 'Tab' && !e.shiftKey && type === 'markdown') {
                e.preventDefault();
                var start = editor.selectionStart;
                var end = editor.selectionEnd;
                editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
                editor.setSelectionRange(start + 2, start + 2);
                autosizeJournalEditor(editor);
                scheduleJournalSave(state);
            }
        });

        autosizeJournalEditor(editor);
        placeJournalCaret(state);
    }

    function startJournalEdit(entry) {
        if (!entry) return;
        var noteId = parseInt(entry.getAttribute('data-note-id'), 10);
        var note = findJournalNote(noteId);
        if (!journalNoteIsEditable(note) || journalEdits[noteId] || entry.classList.contains('is-edit-loading')) return;

        // One entry at a time: the others are saved and rendered again
        journalEditList().forEach(function (state) { finishJournalEdit(state); });

        entry.classList.add('is-edit-loading');
        // The source is read afresh: the rendered body may be minutes old,
        // and the version token must be the one the save is checked against.
        var url = 'api/v1/notes/' + encodeURIComponent(noteId);
        if (data.workspace) url += '?workspace=' + encodeURIComponent(data.workspace);
        fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (result) {
                    if (!response.ok || !result.note) {
                        throw new Error(result.error || result.message || ('HTTP ' + response.status));
                    }
                    return result.note;
                });
            })
            .then(function (fresh) {
                entry.classList.remove('is-edit-loading');
                if (!entry.isConnected || journalEdits[noteId]) return;
                openJournalEditor(entry, note, fresh);
            })
            .catch(function (err) {
                entry.classList.remove('is-edit-loading');
                if (!entry.isConnected) return;
                setJournalSaveStatus(entry, 'error', (txt.journalLoadError || 'Could not load this entry.') + ' ' + err.message);
            });
    }

    // Save what is pending, then show the rendered body again. When the
    // save fails the editor stays open with the error, so nothing written
    // is lost; typing again or pressing Done retries.
    function finishJournalEdit(state) {
        if (!state || journalEdits[state.noteId] !== state) return Promise.resolve(false);
        clearTimeout(state.saveTimer);
        state.saveTimer = null;

        var pending = state.dirty && !state.conflict ? saveJournalEdit(state) : (state.saving || Promise.resolve(true));
        return pending.then(function (ok) {
            if (journalEdits[state.noteId] !== state) return false;
            if (!ok && !state.conflict && state.entry.isConnected) return false;
            delete journalEdits[state.noteId];

            var entry = state.entry;
            if (entry.isConnected) {
                entry.classList.remove('is-editing');
                setJournalEditButton(entry, false);
                setJournalSaveStatus(entry, '', '');
                var body = entry.querySelector('.diary-journal-body');
                if (body) body.classList.remove('is-editing');
            }
            invalidateJournalBody(state.note);
            return true;
        });
    }

    function finishAllJournalEdits(except) {
        journalEditList().forEach(function (state) {
            if (state.entry !== except) finishJournalEdit(state);
        });
    }

    function initJournalEditing() {
        var diaryContent = document.getElementById('diaryContent');
        if (diaryContent) {
            diaryContent.addEventListener('click', function (e) {
                var editBtn = e.target.closest('.diary-journal-edit');
                if (editBtn) {
                    var entry = editBtn.closest('.diary-journal-entry');
                    var noteId = entry ? parseInt(entry.getAttribute('data-note-id'), 10) : 0;
                    if (journalEdits[noteId]) {
                        finishJournalEdit(journalEdits[noteId]);
                    } else {
                        startJournalEdit(entry);
                    }
                    return;
                }
                // A click in the text starts editing, but not one on a link or
                // a control, nor the release of a text selection
                var body = e.target.closest('.diary-journal-body');
                if (!body || body.classList.contains('is-editing')) return;
                if (e.target.closest('a, input, button, select, textarea, audio, video, iframe, img, details, summary, label')) return;
                var selection = window.getSelection ? window.getSelection() : null;
                if (selection && !selection.isCollapsed) return;
                startJournalEdit(body.closest('.diary-journal-entry'));
            });
        }

        // A click anywhere else leaves the editor
        document.addEventListener('mousedown', function (e) {
            if (!Object.keys(journalEdits).length) return;
            var entry = e.target.closest ? e.target.closest('.diary-journal-entry') : null;
            finishAllJournalEdits(entry);
        });

        window.addEventListener('beforeunload', function (e) {
            if (!journalHasUnsavedEdit()) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    // --- Journal dates panel ---
    //
    // The note outline's panel (css/outline.css) on the right of the journal,
    // listing the entries' dates grouped by month. A click scrolls to the
    // entry, appending the chunks up to it first when it is not rendered yet;
    // the entry being read is highlighted as the page scrolls.

    var OUTLINE_COLLAPSED_KEY = 'diaryOutlineCollapsed';
    // Shared with the note outline (js/outline-panel.js), which keeps it in
    // plain localStorage.
    var OUTLINE_WIDTH_KEY = 'outlineWidth';
    // Gap left above an entry's title when jumping to it, below the topbar.
    var OUTLINE_JUMP_OFFSET_PX = 16;
    // An entry counts as the one being read once its top passes this far
    // below the topbar.
    var OUTLINE_ACTIVE_LINE_PX = 40;
    var outlineActiveId = null;
    var outlineSpyFrame = 0;
    // Entry the reader jumped to while bodies above it may still be loading:
    // each body that lands above it pushes it down, so it is realigned until
    // the reader scrolls on their own.
    var outlineJumpId = null;
    var outlineJumpUntil = 0;

    function isMobileLayout() {
        return window.innerWidth <= 800;
    }

    function outlineDayLabel(note) {
        if (!note.dated) return note.heading;
        var parts = String(note.entryDate).split('-');
        try {
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
                .toLocaleDateString(data.lang || undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        } catch (e) {
            return note.entryDate;
        }
    }

    function renderOutline() {
        var nav = document.getElementById('diaryOutlineNav');
        if (!nav) return;

        var html = '';
        var currentMonth = null;
        journalNotes.forEach(function (note) {
            var key = monthKey(note);
            if (key !== currentMonth) {
                currentMonth = key;
                html += '<li class="outline-nav-item"><a class="outline-nav-link" data-level="1" href="#" data-note-id="' + note.id + '">' +
                    esc(monthLabel(key)) + '</a></li>';
            }
            var label = outlineDayLabel(note);
            html += '<li class="outline-nav-item"><a class="outline-nav-link" data-level="2" href="#" data-note-id="' + note.id + '"' +
                ' data-entry-link="1" title="' + esc(note.dated ? longDateLabel(note.entryDate) : note.heading) + '">' + esc(label) + '</a></li>';
        });
        nav.innerHTML = html;
        outlineActiveId = null;
        updateOutlineActive();
    }

    function entryElement(noteId) {
        return document.querySelector('.diary-journal-entry[data-note-id="' + noteId + '"]');
    }

    // The topbar (actions + filter) is sticky (css/dashboard.css) and covers
    // the top of the page, so every position below is measured from its bottom.
    function stickyTopbarHeight() {
        var topbar = document.querySelector('.dashboard-topbar');
        return topbar ? topbar.offsetHeight : 0;
    }

    function alignEntry(entry, smooth) {
        // The title, not the entry's padded top, lands under the topbar
        var anchor = entry.querySelector('.diary-journal-header') || entry;
        var top = anchor.getBoundingClientRect().top + window.pageYOffset - stickyTopbarHeight() - OUTLINE_JUMP_OFFSET_PX;
        window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }

    function jumpToEntry(noteId) {
        var index = -1;
        for (var i = 0; i < journalNotes.length; i++) {
            if (journalNotes[i].id === noteId) { index = i; break; }
        }
        if (index === -1) return;

        var wasRendered = index < journalShown;
        while (journalShown <= index && appendJournalChunk()) { /* reach the entry */ }
        var entry = entryElement(noteId);
        if (!entry) return;

        // A far jump lands at once: the chunks it just appended grow as their
        // bodies arrive, and a smooth scroll would chase a moving target.
        alignEntry(entry, wasRendered);
        outlineJumpId = noteId;
        outlineJumpUntil = Date.now() + 3000;
        setOutlineActive(noteId);

        if (isMobileLayout()) setMobileOutlineOpen(false);
    }

    function realignAfterBodyLoad(filledEntry) {
        if (outlineJumpId === null) return;
        if (Date.now() > outlineJumpUntil) {
            outlineJumpId = null;
            return;
        }
        var target = entryElement(outlineJumpId);
        if (!target || filledEntry === target) return;
        // Only a body above the target moves it
        if (filledEntry.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) {
            alignEntry(target, false);
        }
    }

    function cancelOutlineJump() {
        outlineJumpId = null;
    }

    function setOutlineActive(noteId) {
        if (noteId === outlineActiveId) return;
        outlineActiveId = noteId;
        var nav = document.getElementById('diaryOutlineNav');
        if (!nav) return;
        nav.querySelectorAll('.outline-nav-link.active').forEach(function (link) {
            link.classList.remove('active');
        });
        if (noteId === null) return;
        var link = nav.querySelector('.outline-nav-link[data-entry-link][data-note-id="' + noteId + '"]');
        if (!link) return;
        link.classList.add('active');

        // Keep the highlighted date in sight inside the panel, without moving the page
        var panel = document.getElementById('outline-panel');
        if (!panel) return;
        var linkRect = link.getBoundingClientRect();
        var panelRect = panel.getBoundingClientRect();
        var header = panel.querySelector('.outline-header');
        var headerHeight = header ? header.offsetHeight : 0;
        if (linkRect.top < panelRect.top + headerHeight) {
            panel.scrollTop -= (panelRect.top + headerHeight) - linkRect.top + 8;
        } else if (linkRect.bottom > panelRect.bottom) {
            panel.scrollTop += linkRect.bottom - panelRect.bottom + 8;
        }
    }

    function updateOutlineActive() {
        outlineSpyFrame = 0;
        if (viewMode !== 'journal') return;
        var entries = document.querySelectorAll('.diary-journal-list > .diary-journal-entry');
        var current = entries.length ? entries[0] : null;
        var activeLine = stickyTopbarHeight() + OUTLINE_ACTIVE_LINE_PX;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].getBoundingClientRect().top > activeLine) break;
            current = entries[i];
        }
        setOutlineActive(current ? parseInt(current.getAttribute('data-note-id'), 10) : null);
    }

    function scheduleOutlineActive() {
        if (!outlineSpyFrame) {
            outlineSpyFrame = window.requestAnimationFrame(updateOutlineActive);
        }
    }

    function setMobileOutlineOpen(isOpen) {
        document.body.classList.toggle('outline-mobile-open', isOpen);
    }

    function toggleOutlinePanel() {
        if (isMobileLayout()) {
            setMobileOutlineOpen(!document.body.classList.contains('outline-mobile-open'));
            return;
        }
        var isCollapsed = !document.body.classList.contains('outline-collapsed');
        document.body.classList.toggle('outline-collapsed', isCollapsed);
        try {
            (window.__poznoteUserStorage || window.localStorage).setItem(OUTLINE_COLLAPSED_KEY, isCollapsed ? 'true' : 'false');
        } catch (e) { /* storage unavailable */ }
        if (!isCollapsed) scheduleOutlineActive();
    }

    function initOutlineResize() {
        var handle = document.getElementById('outlineResizeHandle');
        var panel = document.getElementById('outline-panel');
        if (!handle || !panel) return;
        var resizing = false;

        handle.addEventListener('mousedown', function (e) {
            if (e.target.closest('.toggle-outline-btn') || document.body.classList.contains('outline-collapsed')) return;
            e.preventDefault();
            resizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', function (e) {
            if (!resizing) return;
            var width = Math.min(Math.max(window.innerWidth - e.clientX, 200), 500);
            document.documentElement.style.setProperty('--outline-width', width + 'px');
        });
        document.addEventListener('mouseup', function () {
            if (!resizing) return;
            resizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try { window.localStorage.setItem(OUTLINE_WIDTH_KEY, String(panel.offsetWidth)); } catch (e) { /* storage unavailable */ }
        });
    }

    // Phones open the panel like the note outline (js/outline-panel.js): a
    // right-to-left swipe on the journal slides it in, a left-to-right swipe
    // on the panel slides it out. Same distances as there.
    var SWIPE_MIN_DISTANCE_PX = 80;
    var SWIPE_MAX_VERTICAL_PX = 100;

    // A swipe that starts in something scrolling sideways (a wide table or
    // code block of an entry) belongs to that scroller.
    function isInHorizontalScroller(target, root) {
        var current = target instanceof Element ? target : null;
        while (current && current !== root) {
            var overflowX = window.getComputedStyle(current).overflowX;
            if ((overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth + 1) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    function initOutlineSwipe() {
        var startX = 0;
        var startY = 0;
        var tracking = false;

        document.addEventListener('touchstart', function (e) {
            tracking = false;
            if (!isMobileLayout() || viewMode !== 'journal' || e.touches.length !== 1) return;
            var root = e.target.closest ? e.target.closest('.diary-journal') : null;
            if (!root || isInHorizontalScroller(e.target, root)) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            if (!tracking) return;
            tracking = false;
            var dx = startX - e.changedTouches[0].clientX;
            var dy = Math.abs(startY - e.changedTouches[0].clientY);
            if (dx > SWIPE_MIN_DISTANCE_PX && dy < SWIPE_MAX_VERTICAL_PX &&
                !document.body.classList.contains('outline-mobile-open')) {
                setMobileOutlineOpen(true);
                scheduleOutlineActive();
            }
        }, { passive: true });

        var panel = document.getElementById('outline-panel');
        if (!panel) return;
        var panelStartX = 0;
        var panelStartY = 0;
        panel.addEventListener('touchstart', function (e) {
            panelStartX = e.touches[0].clientX;
            panelStartY = e.touches[0].clientY;
        }, { passive: true });
        panel.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].clientX - panelStartX;
            var dy = Math.abs(e.changedTouches[0].clientY - panelStartY);
            if (dx > SWIPE_MIN_DISTANCE_PX && dy < SWIPE_MAX_VERTICAL_PX &&
                document.body.classList.contains('outline-mobile-open')) {
                setMobileOutlineOpen(false);
            }
        }, { passive: true });
    }

    function initOutline() {
        var nav = document.getElementById('diaryOutlineNav');
        if (!nav) return;

        nav.addEventListener('click', function (e) {
            var link = e.target.closest('.outline-nav-link');
            if (!link) return;
            e.preventDefault();
            jumpToEntry(parseInt(link.getAttribute('data-note-id'), 10));
            link.blur();
        });

        var toggleBtn = document.getElementById('toggleOutlineBtn');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleOutlinePanel);
        document.querySelectorAll('.diary-outline .outline-close-btn').forEach(function (btn) {
            btn.addEventListener('click', toggleOutlinePanel);
        });
        var backdrop = document.getElementById('outlineMobileBackdrop');
        if (backdrop) backdrop.addEventListener('click', function () { setMobileOutlineOpen(false); });

        initOutlineResize();
        initOutlineSwipe();

        window.addEventListener('scroll', scheduleOutlineActive, { passive: true });
        window.addEventListener('resize', scheduleOutlineActive);
        ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
            window.addEventListener(type, cancelOutlineJump, { passive: true });
        });
    }

    function applyViewMode() {
        var isJournal = viewMode === 'journal';
        document.body.classList.toggle('diary-journal-active', isJournal);
        if (!isJournal) setMobileOutlineOpen(false);
        var toggle = document.getElementById('diaryJournalToggle');
        if (toggle) {
            toggle.classList.toggle('active', isJournal);
            toggle.setAttribute('aria-pressed', isJournal ? 'true' : 'false');
        }
    }

    // --- Render ---

    function render() {
        var container = document.getElementById('diaryContent');
        if (!container) return;

        var visibleNotes = notes;
        if (activeFilterTerm) {
            visibleNotes = notes.filter(function (note) {
                return noteMatchesSearch(note, activeFilterTerm);
            });
        }

        var noResults = document.getElementById('diaryNoResults');
        if (noResults) {
            noResults.style.display = (activeFilterTerm && visibleNotes.length === 0) ? 'block' : 'none';
        }

        if (viewMode === 'journal') {
            renderJournal(container, visibleNotes);
            return;
        }
        finishAllJournalEdits(null);
        if (journalObserver) {
            journalObserver.disconnect();
            journalObserver = null;
        }

        // Notes arrive sorted by entry date DESC; group them by month preserving order.
        var html = '';
        var currentMonth = null;
        visibleNotes.forEach(function (note) {
            var key = monthKey(note);
            if (key !== currentMonth) {
                if (currentMonth !== null) html += '</div></section>';
                currentMonth = key;
                html += '<section class="diary-month">' +
                    '<h2 class="diary-month-title">' + esc(monthLabel(key)) + '</h2>' +
                    '<div class="dashboard-grid-container">';
            }
            html += buildNoteCard(note);
        });
        if (currentMonth !== null) html += '</div></section>';

        container.innerHTML = html;
    }

    // --- Today's entry ---

    function openNote(noteId) {
        var url = 'index.php?note=' + encodeURIComponent(noteId) + '&newtab=1';
        if (data.pageWorkspace) {
            url += '&workspace=' + encodeURIComponent(data.pageWorkspace);
        }
        window.location.href = url;
    }

    function showError(message) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'error');
        } else {
            window.alert(message);
        }
    }

    function handleTodayClick(btn) {
        if (data.todayNoteId) {
            openNote(data.todayNoteId);
            return;
        }

        btn.disabled = true;
        fetch('api/v1/notes', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({
                heading: data.todayTitle,
                folder_name: data.folderPath,
                workspace: data.workspace,
                type: data.noteType === 'markdown' ? 'markdown' : 'note'
            })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success && result.note) {
                    openNote(result.note.id);
                } else {
                    btn.disabled = false;
                    showError(result.error || result.message || txt.createError || 'Could not create the diary entry.');
                }
            })
            .catch(function (err) {
                btn.disabled = false;
                showError((txt.createError || 'Could not create the diary entry.') + ' ' + err.message);
            });
    }

    // --- New diary ---

    // Name prompt shared by "New diary" and "Rename". opts.submit(name) returns
    // a promise resolving to the URL to load, or rejecting with the message to
    // show under the input.
    function openDiaryNameModal(opts) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay diary-new-modal-overlay';
        overlay.innerHTML =
            '<div class="modal-dialog diary-new-modal">' +
                '<div class="modal-header"><h3 class="modal-title">' + esc(opts.title) + '</h3></div>' +
                '<div class="modal-body">' +
                    '<input type="text" class="diary-new-input" maxlength="255" placeholder="' + esc(txt.newDiaryPlaceholder || 'Diary name') + '" autocomplete="off">' +
                    '<p class="diary-new-error initially-hidden"></p>' +
                '</div>' +
                '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-secondary" data-action="close-modal">' + esc(txt.cancel || 'Cancel') + '</button>' +
                    '<button type="button" class="btn btn-primary" data-action="submit-diary-name">' + esc(opts.confirmText) + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var input = overlay.querySelector('.diary-new-input');
        var errorEl = overlay.querySelector('.diary-new-error');
        var submitBtn = overlay.querySelector('[data-action="submit-diary-name"]');
        input.value = opts.value || '';

        function close() { overlay.remove(); }

        function showModalError(message) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        function submit() {
            var name = input.value.trim();
            if (!name) {
                input.focus();
                return;
            }
            if (name === (opts.value || '')) {
                close();
                return;
            }
            submitBtn.disabled = true;
            opts.submit(name)
                .then(function (url) { window.location.href = url; })
                .catch(function (err) {
                    submitBtn.disabled = false;
                    showModalError(err.message);
                });
        }

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        overlay.querySelector('[data-action="close-modal"]').addEventListener('click', close);
        submitBtn.addEventListener('click', submit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') close();
        });
        input.focus();
        input.select();
    }

    function diaryPageUrl(diaryId) {
        var url = 'diary.php?diary=' + encodeURIComponent(diaryId);
        if (data.pageWorkspace) url += '&workspace=' + encodeURIComponent(data.pageWorkspace);
        return url;
    }

    function openNewDiaryModal() {
        var fallback = txt.newDiaryError || 'Could not create the diary.';
        openDiaryNameModal({
            title: txt.newDiaryTitle || 'Create a new diary',
            confirmText: txt.create || 'Create',
            submit: function (name) {
                return fetch('api/v1/diary/diaries.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ name: name, workspace: data.workspace })
                })
                    .then(function (response) { return response.json(); })
                    .then(function (result) {
                        if (result.success && result.diary) return diaryPageUrl(result.diary.id);
                        throw new Error(result.error || fallback);
                    }, function (err) {
                        throw new Error(fallback + ' ' + err.message);
                    });
            }
        });
    }

    // A diary is a root folder: renaming it is the tree's folder rename, and
    // its entries keep their place (they hang off the folder id).
    function openRenameDiaryModal(pill) {
        var diaryId = parseInt(pill.getAttribute('data-diary-id'), 10);
        var fallback = txt.renameDiaryError || 'Could not rename the diary.';
        openDiaryNameModal({
            title: txt.renameDiaryTitle || 'Rename diary',
            value: pill.getAttribute('data-diary-name') || '',
            confirmText: txt.renameLabel || 'Rename',
            submit: function (name) {
                // Same forbidden characters as a new diary (api/v1/diary/diaries.php):
                // the name is also a segment of the Diary/YYYY/MM path.
                var forbidden = name.match(/[/\\:*?"<>|]/);
                if (forbidden) {
                    return Promise.reject(new Error(fallback + ' ' + forbidden[0]));
                }
                return fetch('api/v1/folders/' + encodeURIComponent(diaryId), {
                    method: 'PATCH',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    body: JSON.stringify({ name: name, workspace: data.workspace })
                })
                    .then(function (response) {
                        return response.json().catch(function () { return {}; }).then(function (result) {
                            if (!response.ok || !result.success) {
                                throw new Error(result.error || result.message || fallback);
                            }
                            return diaryPageUrl(diaryId);
                        });
                    });
            }
        });
    }

    // --- Diary pill context menu (desktop) ---

    var diaryContextMenu = null;

    function closeDiaryContextMenu() {
        if (diaryContextMenu) {
            diaryContextMenu.remove();
            diaryContextMenu = null;
        }
    }

    function openDiaryContextMenu(pill, x, y) {
        closeDiaryContextMenu();
        var menu = document.createElement('div');
        menu.className = 'diary-context-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML =
            '<button type="button" class="diary-context-menu-item" role="menuitem" data-action="rename">' +
                '<i class="lucide lucide-pencil"></i> ' + esc(txt.renameLabel || 'Rename') +
            '</button>' +
            '<button type="button" class="diary-context-menu-item danger" role="menuitem" data-action="delete">' +
                '<i class="lucide lucide-trash-2"></i> ' + esc(txt.deleteLabel || 'Delete') +
            '</button>';
        document.body.appendChild(menu);
        diaryContextMenu = menu;

        // Opens at the pointer, pulled back inside the window
        var rect = menu.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
        menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';

        menu.addEventListener('click', function (e) {
            var item = e.target.closest('.diary-context-menu-item');
            if (!item) return;
            closeDiaryContextMenu();
            if (item.getAttribute('data-action') === 'rename') {
                openRenameDiaryModal(pill);
            } else {
                deleteDiary(pill);
            }
        });
        var first = menu.querySelector('.diary-context-menu-item');
        if (first) first.focus();
    }

    function initDiaryContextMenu() {
        var switcher = document.querySelector('.diary-switcher');
        if (!switcher) return;
        switcher.addEventListener('contextmenu', function (e) {
            var pill = e.target.closest('.diary-switch-btn');
            // Phones keep their long-press and the pill's own delete button
            if (!pill || isMobileLayout()) return;
            e.preventDefault();
            openDiaryContextMenu(pill, e.clientX, e.clientY);
        });
        document.addEventListener('mousedown', function (e) {
            if (diaryContextMenu && !diaryContextMenu.contains(e.target)) closeDiaryContextMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDiaryContextMenu();
        });
        window.addEventListener('scroll', closeDiaryContextMenu, { passive: true });
        window.addEventListener('resize', closeDiaryContextMenu);
    }

    // --- Move a journal entry to the trash ---
    //
    // Same request as the note menu's delete (not permanent, restorable from
    // the trash). The entry leaves the column in place, so the reader keeps
    // their position instead of the journal being rebuilt from the top.

    function removeNoteFromList(list, noteId) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === noteId) {
                list.splice(i, 1);
                return i;
            }
        }
        return -1;
    }

    function trashJournalEntry(btn) {
        var entry = btn.closest('.diary-journal-entry');
        if (!entry) return;
        var noteId = parseInt(entry.getAttribute('data-note-id'), 10);
        if (journalEdits[noteId]) finishJournalEdit(journalEdits[noteId]);
        var titleEl = entry.querySelector('.diary-journal-title');
        var title = titleEl ? titleEl.textContent.trim() : '';
        var message = (txt.journalTrashConfirm || 'Move "{{title}}" to the trash?').replace('{{title}}', title);

        var confirmed = window.modalAlert && typeof window.modalAlert.confirm === 'function'
            ? window.modalAlert.confirm(message, txt.journalTrash || 'Move to trash', {
                alertType: 'warning',
                confirmText: txt.journalTrash || 'Move to trash',
                cancelText: txt.cancel || 'Cancel',
                cancelButtonClass: 'diary-confirm-cancel',
                confirmButtonClass: 'danger'
            })
            : Promise.resolve(window.confirm(message));

        confirmed.then(function (ok) {
            if (!ok) return;
            btn.disabled = true;
            var url = 'api/v1/notes/' + encodeURIComponent(noteId) + '?permanent=false';
            if (data.workspace) url += '&workspace=' + encodeURIComponent(data.workspace);
            fetch(url, { method: 'DELETE', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(function (response) {
                    // 423 carries the name of whoever is editing the note
                    return response.json().catch(function () { return {}; }).then(function (result) {
                        if (!response.ok || !result.success) {
                            throw new Error(result.error || result.message || ('HTTP ' + response.status));
                        }
                    });
                })
                .then(function () {
                    removeNoteFromList(notes, noteId);
                    delete journalBodies[noteId];
                    // The day has no entry any more: the button creates one again
                    if (noteId === data.todayNoteId) {
                        data.todayNoteId = null;
                        var todayBtn = document.getElementById('diaryTodayBtn');
                        var todayLabel = todayBtn && todayBtn.querySelector('.diary-today-label');
                        var todayIcon = todayBtn && todayBtn.querySelector('.lucide');
                        if (todayLabel) todayLabel.textContent = txt.todayCreate || "Create today's entry";
                        if (todayIcon) todayIcon.className = 'lucide lucide-calendar-plus';
                    }

                    if (notes.length === 0) {
                        // Last entry gone: the server renders the empty diary's invitation
                        window.location.reload();
                        return;
                    }
                    var index = removeNoteFromList(journalNotes, noteId);
                    if (index !== -1 && index < journalShown) journalShown--;
                    entry.remove();
                    renderOutline();
                    fillJournalViewport();
                    scheduleOutlineActive();
                })
                .catch(function (err) {
                    btn.disabled = false;
                    showError((txt.journalTrashError || 'Could not move this entry to the trash.') + ' ' + err.message);
                });
        });
    }

    // --- Delete a diary ---
    //
    // A diary is a root folder, so deleting one is the folder delete of the
    // tree: its subfolders go, its entries move to the trash (and can be
    // restored from there).

    function deleteDiary(btn) {
        var diaryId = parseInt(btn.getAttribute('data-diary-id'), 10);
        var name = btn.getAttribute('data-diary-name') || '';
        var message = (txt.deleteDiaryConfirm || 'Delete the diary "{{name}}"? Its folders are removed and all its entries are moved to the trash.')
            .replace('{{name}}', name);
        var title = txt.deleteDiaryTitle || 'Delete diary';

        var confirmed = window.modalAlert && typeof window.modalAlert.confirm === 'function'
            ? window.modalAlert.confirm(message, title, {
                alertType: 'warning',
                confirmText: txt.deleteLabel || 'Delete',
                cancelText: txt.cancel || 'Cancel',
                cancelButtonClass: 'diary-confirm-cancel',
                confirmButtonClass: 'danger'
            })
            : Promise.resolve(window.confirm(message));

        confirmed.then(function (ok) {
            if (!ok) return;
            btn.disabled = true;
            fetch('api/v1/folders/' + encodeURIComponent(diaryId) + '?workspace=' + encodeURIComponent(data.workspace || ''), {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
                .then(function (response) {
                    return response.json().catch(function () { return {}; }).then(function (result) {
                        if (!response.ok || !result.success) {
                            throw new Error(result.error || result.message || ('HTTP ' + response.status));
                        }
                    });
                })
                .then(function () {
                    // The page shows the selected diary: when that one is
                    // gone, fall back to the workspace's first diary.
                    var url = new URL(window.location.href);
                    url.searchParams.delete('today');
                    if (diaryId === data.diaryId) url.searchParams.delete('diary');
                    window.location.href = url.toString();
                })
                .catch(function (err) {
                    btn.disabled = false;
                    showError((txt.deleteDiaryError || 'Could not delete the diary.') + ' ' + err.message);
                });
        });
    }

    // --- Init ---

    document.addEventListener('DOMContentLoaded', function () {
        viewMode = readViewMode();
        applyViewMode();
        initOutline();
        render();

        var journalToggle = document.getElementById('diaryJournalToggle');
        if (journalToggle) {
            journalToggle.addEventListener('click', function () {
                viewMode = viewMode === 'journal' ? 'board' : 'journal';
                saveViewMode(viewMode);
                applyViewMode();
                render();
            });
        }

        var diaryContent = document.getElementById('diaryContent');
        if (diaryContent) {
            // Delegated: entries are appended as the reader scrolls
            diaryContent.addEventListener('click', function (e) {
                var btn = e.target.closest('.diary-journal-delete');
                if (btn) trashJournalEntry(btn);
            });
        }

        initJournalEditing();
        initDiaryContextMenu();

        document.querySelectorAll('.diary-switch-delete').forEach(function (btn) {
            btn.addEventListener('click', function () { deleteDiary(btn); });
        });

        var newDiaryBtn = document.getElementById('diaryNewBtn');
        if (newDiaryBtn) {
            newDiaryBtn.addEventListener('click', openNewDiaryModal);
        }

        var todayBtn = document.getElementById('diaryTodayBtn');
        if (todayBtn) {
            todayBtn.addEventListener('click', function () {
                handleTodayClick(todayBtn);
            });

            // today=1 (set by the "Diary entry" card on create.php) triggers the
            // open-or-create flow on load. The param is stripped first so going
            // back to this page does not re-trigger it.
            try {
                var pageUrl = new URL(window.location.href);
                if (pageUrl.searchParams.get('today') === '1') {
                    pageUrl.searchParams.delete('today');
                    window.history.replaceState(null, '', pageUrl.toString());
                    handleTodayClick(todayBtn);
                }
            } catch (e) { /* URL API unavailable */ }
        }

        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');

        if (filterInput) {
            filterInput.addEventListener('input', function () {
                var term = this.value.trim();
                activeFilterTerm = normalizeSearchText(term);
                render();
                if (clearFilterBtn) clearFilterBtn.style.display = term ? 'flex' : 'none';
            });
        }

        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                if (filterInput) {
                    filterInput.value = '';
                    filterInput.focus();
                }
                activeFilterTerm = '';
                render();
                clearFilterBtn.style.display = 'none';
            });
        }
    });
})();

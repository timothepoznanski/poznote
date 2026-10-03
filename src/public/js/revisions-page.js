/**
 * Revisions page (revisions.php): the history of one note, what changed
 * between two versions, and restore / delete / copy.
 *
 * The API still calls revisions snapshots (/api/v1/notes/{id}/snapshot[s]).
 * The diff itself is js/revisions-diff.js.
 */
(function () {
    'use strict';

    var configEl = document.getElementById('revisions-config');
    if (!configEl || !window.PoznoteDiff) return;

    var config = {};
    try {
        config = JSON.parse(configEl.textContent || '{}');
    } catch (e) {
        config = {};
    }

    var noteId = parseInt(config.noteId, 10);
    if (!noteId) return;

    var CONTEXT_LINES = 3;
    var PREFS_KEY = 'poznote-revisions-prefs';

    var state = {
        revisions: [],
        currentHash: '',
        // Title and tags of the note as it is now ({heading, tags})
        currentMeta: { heading: '', tags: '' },
        selectedKey: '',
        // The content unless the browser remembers the other tab
        view: 'content',
        compare: 'current',
        layout: 'unified',
        mdMode: 'preview',
        contents: Object.create(null),
        current: null,
        loadToken: 0
    };

    var els = {
        list: document.getElementById('revisionsList'),
        loading: document.getElementById('revisionsLoading'),
        empty: document.getElementById('revisionsEmpty'),
        panel: document.getElementById('revisionsPanel'),
        when: document.getElementById('revisionsSelectedWhen'),
        compare: document.getElementById('revisionsCompare'),
        mdMode: document.getElementById('revisionsMdMode'),
        toolbar: document.getElementById('revisionsToolbar'),
        diffBar: document.getElementById('revisionsDiffBar'),
        direction: document.getElementById('revisionsDiffDirection'),
        stats: document.getElementById('revisionsDiffStats'),
        body: document.getElementById('revisionsBody'),
        newBtns: document.querySelectorAll('.revisions-new-btn'),
        restoreBtn: document.getElementById('revisionsRestoreBtn'),
        deleteBtn: document.getElementById('revisionsDeleteBtn'),
        copyBtn: document.getElementById('revisionsCopyBtn'),
        actionsBtn: document.getElementById('revisionsActionsBtn'),
        actionsMenu: document.getElementById('revisionsActionsMenu'),
        prevChange: document.getElementById('revisionsPrevChange'),
        nextChange: document.getElementById('revisionsNextChange')
    };

    function tr(key, fallback, vars) {
        if (typeof window.t === 'function') {
            return window.t('revisions.' + key, vars || null, fallback);
        }
        var text = fallback;
        if (vars) {
            Object.keys(vars).forEach(function (name) {
                text = text.split('{{' + name + '}}').join(String(vars[name]));
            });
        }
        return text;
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function icon(name) {
        return el('i', 'lucide lucide-' + name);
    }

    // ---- Preferences (per browser) ----------------------------------------

    function loadPrefs() {
        try {
            var saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            if (saved.layout === 'split' || saved.layout === 'unified') state.layout = saved.layout;
            if (saved.view === 'content' || saved.view === 'changes') state.view = saved.view;
            if (saved.compare === 'previous' || saved.compare === 'current') state.compare = saved.compare;
            if (saved.mdMode === 'source' || saved.mdMode === 'preview') state.mdMode = saved.mdMode;
        } catch (e) {
            // Private window or blocked storage: defaults
        }
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({
                layout: state.layout,
                view: state.view,
                // Only the two generic targets are worth remembering
                compare: state.compare === 'previous' ? 'previous' : 'current',
                mdMode: state.mdMode
            }));
        } catch (e) {
            // Not critical
        }
    }

    // ---- API ----------------------------------------------------------------

    function api(path, options) {
        options = options || {};
        options.headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, options.headers || {});
        options.credentials = 'same-origin';
        return fetch('api/v1/notes/' + noteId + path, options).then(function (response) {
            return response.json().catch(function () {
                return { success: false };
            }).then(function (data) {
                if (!response.ok && data && data.success !== false) data.success = false;
                return data || { success: false };
            });
        });
    }

    function fetchList() {
        return api('/snapshots');
    }

    function fetchRevision(key) {
        if (state.contents[key]) return Promise.resolve(state.contents[key]);
        return api('/snapshot?render=1&snapshot_key=' + encodeURIComponent(key)).then(function (data) {
            if (!data.success || !data.snapshot) throw new Error(data.error || 'load failed');
            state.contents[key] = data.snapshot;
            return data.snapshot;
        });
    }

    function fetchCurrent() {
        if (state.current) return Promise.resolve(state.current);
        return api('').then(function (data) {
            if (!data.success || !data.note) throw new Error(data.error || 'load failed');
            state.current = data.note;
            return data.note;
        });
    }

    // ---- Labels ----------------------------------------------------------------

    function revisionKind(rev) {
        if (rev.origin === 'ai') return { key: 'ai', icon: 'sparkles', label: tr('kind.ai', 'Before AI edit') };
        if (rev.origin === 'mcp') return { key: 'mcp', icon: 'plug', label: tr('kind.mcp', 'Before MCP edit') };
        if (rev.manual) return { key: 'manual', icon: 'bookmark', label: tr('kind.manual', 'Saved by hand') };
        return { key: 'auto', icon: 'calendar', label: tr('kind.auto', 'Automatic') };
    }

    function revisionDay(rev) {
        var created = String(rev.created_at || '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10);
        return String(rev.date || '');
    }

    // Minutes ("2026-10-03 14:32") shared by more than one revision: those
    // show their seconds, or two of them would read the same
    var crowdedMinutes = Object.create(null);

    function countMinutes() {
        var seen = Object.create(null);
        crowdedMinutes = Object.create(null);
        state.revisions.forEach(function (rev) {
            var minute = String(rev.created_at || '').slice(0, 16);
            if (minute.length < 16) return;
            if (seen[minute]) crowdedMinutes[minute] = true;
            seen[minute] = true;
        });
    }

    function revisionTime(rev) {
        var created = String(rev.created_at || '');
        var match = created.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return '';
        var time = match[1] + ':' + match[2];
        if (match[3] && crowdedMinutes[created.slice(0, 16)]) time += ':' + match[3];
        return time;
    }

    function dayLabel(day) {
        if (day === config.today) return tr('today', 'Today');
        if (day === config.yesterday) return tr('yesterday', 'Yesterday');
        var parts = day.split('-');
        if (parts.length !== 3) return day;
        var date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        var options = { weekday: 'long', day: 'numeric', month: 'long' };
        if (parts[0] !== String(config.today || '').slice(0, 4)) options.year = 'numeric';
        try {
            return date.toLocaleDateString(config.lang || undefined, options);
        } catch (e) {
            return day;
        }
    }

    function revisionTitle(rev) {
        var time = revisionTime(rev);
        var label = dayLabel(revisionDay(rev)) + (time ? ', ' + time : '');
        // A locale date can start lowercase ("samedi 3 octobre")
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function findIndex(key) {
        for (var i = 0; i < state.revisions.length; i++) {
            if (state.revisions[i].snapshot_key === key) return i;
        }
        return -1;
    }

    // ---- Title and tags ----------------------------------------------------------

    function tagList(tags) {
        return String(tags || '').split(',').map(function (tag) { return tag.trim(); }).filter(Boolean);
    }

    /**
     * What differs between the title and tags of two versions:
     * {heading: [old, new] | null, added: [...], removed: [...]}. A revision
     * taken before tags were versioned has tags === null: no tag comparison.
     */
    function metaChanges(oldMeta, newMeta) {
        var changes = { heading: null, added: [], removed: [] };
        if ((oldMeta.heading || '') !== (newMeta.heading || '')) {
            changes.heading = [oldMeta.heading || '', newMeta.heading || ''];
        }
        if (oldMeta.tags !== null && oldMeta.tags !== undefined && newMeta.tags !== null && newMeta.tags !== undefined) {
            var before = tagList(oldMeta.tags);
            var after = tagList(newMeta.tags);
            changes.removed = before.filter(function (tag) { return after.indexOf(tag) < 0; });
            changes.added = after.filter(function (tag) { return before.indexOf(tag) < 0; });
        }
        return changes;
    }

    function hasMetaChanges(changes) {
        return !!changes.heading || changes.added.length > 0 || changes.removed.length > 0;
    }

    function sameVersion(revA, hashB, metaB) {
        return !!hashB && revA.content_hash === hashB && !hasMetaChanges(metaChanges(revA, metaB));
    }

    function renderMetaChanges(changes) {
        var box = el('div', 'revisions-meta-changes');
        if (changes.heading) {
            var titleRow = el('div', 'revisions-meta-row');
            titleRow.appendChild(el('span', 'revisions-meta-label', tr('meta.title', 'Title')));
            titleRow.appendChild(el('span', 'revisions-meta-old', changes.heading[0]));
            titleRow.appendChild(icon('arrow-right'));
            titleRow.appendChild(el('span', 'revisions-meta-new', changes.heading[1]));
            box.appendChild(titleRow);
        }
        if (changes.added.length || changes.removed.length) {
            var tagRow = el('div', 'revisions-meta-row');
            tagRow.appendChild(el('span', 'revisions-meta-label', tr('meta.tags', 'Tags')));
            changes.removed.forEach(function (tag) {
                tagRow.appendChild(el('span', 'revisions-meta-old', '− ' + tag));
            });
            changes.added.forEach(function (tag) {
                tagRow.appendChild(el('span', 'revisions-meta-new', '+ ' + tag));
            });
            box.appendChild(tagRow);
        }
        return box;
    }

    // ---- History list ----------------------------------------------------------

    function renderList() {
        els.list.innerHTML = '';
        var lastDay = null;

        state.revisions.forEach(function (rev, index) {
            var day = revisionDay(rev);
            if (day !== lastDay) {
                els.list.appendChild(el('div', 'revisions-day', dayLabel(day)));
                lastDay = day;
            }

            var kind = revisionKind(rev);
            var item = el('button', 'revisions-item revisions-kind-' + kind.key);
            item.type = 'button';
            item.setAttribute('role', 'option');
            item.dataset.key = rev.snapshot_key;
            item.setAttribute('aria-selected', rev.snapshot_key === state.selectedKey ? 'true' : 'false');
            item.tabIndex = -1;

            var kindIcon = el('span', 'revisions-item-icon');
            kindIcon.appendChild(icon(kind.icon));
            item.appendChild(kindIcon);

            var text = el('span', 'revisions-item-text');
            text.appendChild(el('span', 'revisions-item-time', revisionTime(rev) || dayLabel(day)));
            text.appendChild(el('span', 'revisions-item-kind', kind.label));
            item.appendChild(text);

            var older = state.revisions[index + 1];
            if (sameVersion(rev, state.currentHash, state.currentMeta)) {
                item.appendChild(el('span', 'revisions-badge revisions-badge-current', tr('same_as_current', 'Current')));
            } else if (older && sameVersion(rev, older.content_hash, older)) {
                var same = el('span', 'revisions-badge', tr('same_as_previous', 'No change'));
                same.title = tr('same_as_previous_title', 'Same content, title and tags as the revision before it');
                item.appendChild(same);
            }

            item.addEventListener('click', function () {
                selectRevision(rev.snapshot_key);
            });
            els.list.appendChild(item);
        });
    }

    function syncListSelection() {
        var items = els.list.querySelectorAll('.revisions-item');
        items.forEach(function (item) {
            var selected = item.dataset.key === state.selectedKey;
            item.setAttribute('aria-selected', selected ? 'true' : 'false');
            if (selected) {
                if (typeof item.scrollIntoView === 'function') {
                    item.scrollIntoView({ block: 'nearest' });
                }
            }
        });
    }

    els.list.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        var index = findIndex(state.selectedKey);
        var next = index + (event.key === 'ArrowDown' ? 1 : -1);
        if (next < 0 || next >= state.revisions.length) return;
        event.preventDefault();
        selectRevision(state.revisions[next].snapshot_key);
    });

    // ---- Compare target ----------------------------------------------------------

    function renderCompareOptions() {
        var select = els.compare;
        select.innerHTML = '';

        var current = el('option', null, tr('current_version', 'Current version'));
        current.value = 'current';
        select.appendChild(current);

        var index = findIndex(state.selectedKey);
        var previous = el('option', null, tr('previous_revision', 'Previous revision'));
        previous.value = 'previous';
        previous.disabled = index < 0 || index >= state.revisions.length - 1;
        select.appendChild(previous);

        if (state.revisions.length > 2) {
            var group = document.createElement('optgroup');
            group.label = tr('other_revisions', 'Other revisions');
            state.revisions.forEach(function (rev) {
                if (rev.snapshot_key === state.selectedKey) return;
                var option = el('option', null, revisionTitle(rev) + ' · ' + revisionKind(rev).label);
                option.value = 'rev:' + rev.snapshot_key;
                group.appendChild(option);
            });
            select.appendChild(group);
        }

        var wanted = state.compare;
        if (wanted === 'previous' && previous.disabled) wanted = 'current';
        if (wanted.indexOf('rev:') === 0 && (wanted.slice(4) === state.selectedKey || findIndex(wanted.slice(4)) < 0)) {
            wanted = 'current';
        }
        select.value = wanted;
    }

    els.compare.addEventListener('change', function () {
        state.compare = els.compare.value;
        savePrefs();
        render();
    });

    /**
     * The two sides of the diff, older first: {old: {label, load()}, new: ...}
     */
    function compareSides() {
        var index = findIndex(state.selectedKey);
        var selected = state.revisions[index];
        var selectedSide = {
            label: revisionTitle(selected),
            meta: selected,
            load: function () { return fetchRevision(selected.snapshot_key).then(function (r) { return r.content || ''; }); }
        };
        var value = els.compare.value || 'current';

        if (value === 'current') {
            return {
                old: selectedSide,
                new: {
                    label: tr('current_version', 'Current version'),
                    meta: state.currentMeta,
                    load: function () { return fetchCurrent().then(function (n) { return n.content || ''; }); }
                }
            };
        }

        var otherIndex = value === 'previous' ? index + 1 : findIndex(value.slice(4));
        var other = state.revisions[otherIndex];
        if (!other) return null;
        var otherSide = {
            label: revisionTitle(other),
            meta: other,
            load: function () { return fetchRevision(other.snapshot_key).then(function (r) { return r.content || ''; }); }
        };
        // The list is newest first: a higher index is older
        return otherIndex > index
            ? { old: otherSide, new: selectedSide }
            : { old: selectedSide, new: otherSide };
    }

    // ---- Content to lines ----------------------------------------------------------

    var BLOCK_TAGS = /^(address|article|aside|blockquote|details|dialog|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|thead|tfoot|tr|ul)$/;

    /**
     * Text of a rich-text note, one line per block, the way it reads on
     * screen. Headings keep a # marker, list items a bullet or their number,
     * checklist items their box, images their name, so the change of a
     * line's role still shows.
     */
    function htmlToLines(html) {
        var doc = new DOMParser().parseFromString('<!DOCTYPE html><body>' + (html || '') + '</body>', 'text/html');
        var lines = [];
        var current = '';
        var listStack = [];

        function flush(force) {
            var text = current.replace(/[ \t ]+/g, ' ').trim();
            if (text !== '' || force) lines.push(text);
            current = '';
        }

        function walk(node, inPre) {
            if (node.nodeType === 3) {
                current += inPre ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' ');
                return;
            }
            if (node.nodeType !== 1) return;

            var tag = node.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'template') return;
            if (tag === 'br') {
                flush(true);
                return;
            }
            if (tag === 'img') {
                var name = node.getAttribute('alt') || (node.getAttribute('src') || '').split('/').pop().split('?')[0];
                current += ' [' + (name || 'image') + '] ';
                return;
            }
            if (tag === 'input' && (node.getAttribute('type') || '').toLowerCase() === 'checkbox') {
                current += node.hasAttribute('checked') ? '☑ ' : '☐ ';
                return;
            }
            if (tag === 'hr') {
                flush(false);
                lines.push('―――');
                return;
            }
            if (tag === 'td' || tag === 'th') {
                if (node.previousElementSibling) current += ' | ';
                Array.prototype.forEach.call(node.childNodes, function (child) { walk(child, inPre); });
                return;
            }

            var isBlock = BLOCK_TAGS.test(tag);
            if (isBlock) flush(false);

            if (/^h[1-6]$/.test(tag)) {
                current += '#'.repeat(parseInt(tag.charAt(1), 10)) + ' ';
            } else if (tag === 'li') {
                var list = listStack[listStack.length - 1];
                var indent = ' '.repeat(Math.max(0, listStack.length - 1) * 2);
                if (list && list.ordered) {
                    list.count++;
                    current += indent + list.count + '. ';
                } else {
                    current += indent + '• ';
                }
            } else if (tag === 'blockquote') {
                current += '> ';
            }

            if (tag === 'ul' || tag === 'ol') {
                var start = parseInt(node.getAttribute('start') || '1', 10);
                listStack.push({ ordered: tag === 'ol', count: (isNaN(start) ? 1 : start) - 1 });
            }

            if (tag === 'pre') {
                var text = node.textContent.replace(/\r\n?/g, '\n').replace(/\n$/, '');
                text.split('\n').forEach(function (line) { lines.push(line); });
            } else {
                Array.prototype.forEach.call(node.childNodes, function (child) { walk(child, inPre); });
            }

            if (tag === 'ul' || tag === 'ol') listStack.pop();
            if (isBlock) flush(false);
        }

        walk(doc.body, false);
        flush(false);

        // Runs of empty lines (empty paragraphs) count as one
        var out = [];
        lines.forEach(function (line) {
            if (line === '' && (out.length === 0 || out[out.length - 1] === '')) return;
            out.push(line);
        });
        while (out.length && out[out.length - 1] === '') out.pop();
        return out;
    }

    function tasksToLines(content) {
        var tasks;
        try {
            tasks = JSON.parse(content || '[]');
        } catch (e) {
            return String(content || '').split('\n');
        }
        if (!Array.isArray(tasks)) return String(content || '').split('\n');

        var lines = [];
        tasks.forEach(function (task) {
            if (!task || typeof task !== 'object') return;
            var text = String(task.text || task.content || '');
            lines.push((task.completed ? '☑ ' : '☐ ') + text + (task.important ? ' ★' : ''));
            (Array.isArray(task.subtasks) ? task.subtasks : []).forEach(function (subtask) {
                if (!subtask || typeof subtask !== 'object') return;
                lines.push('    ' + (subtask.completed ? '☑ ' : '☐ ') + String(subtask.text || ''));
            });
        });
        return lines;
    }

    function contentToLines(content) {
        if (config.noteType === 'markdown') {
            return String(content || '').replace(/\r\n?/g, '\n').split('\n');
        }
        if (config.noteType === 'tasklist') return tasksToLines(content);
        return htmlToLines(content);
    }

    // ---- Diff rendering ----------------------------------------------------------

    function wordParts(container, parts, changedClass) {
        parts.forEach(function (part) {
            if (part.changed) {
                container.appendChild(el('span', changedClass, part.text));
            } else {
                container.appendChild(document.createTextNode(part.text));
            }
        });
    }

    function textCell(className, text, parts, changedClass) {
        var cell = el('td', className);
        if (parts) {
            wordParts(cell, parts, changedClass);
        } else {
            cell.textContent = text;
        }
        if (text === '') cell.classList.add('revisions-text-blank');
        return cell;
    }

    function numberCell(value) {
        return el('td', 'revisions-ln', value === null ? '' : String(value + 1));
    }

    /**
     * Line up the removed and added lines of one change run: each removed
     * line is matched with the next added line that reads like an edit of it
     * (word diff alike enough), keeping the order. Returns the rows of the
     * run as [{del, ins, words}], either side possibly missing.
     */
    function alignRun(dels, ins, oldLines, newLines) {
        var rows = [];
        var next = 0;
        dels.forEach(function (del) {
            var match = -1;
            var words = null;
            for (var k = next; k < Math.min(ins.length, next + 8); k++) {
                var candidate = window.PoznoteDiff.diffWords(oldLines[del.aIndex], newLines[ins[k].bIndex]);
                if (candidate && candidate.ratio >= 0.4) {
                    match = k;
                    words = candidate;
                    break;
                }
            }
            if (match < 0) {
                rows.push({ del: del, ins: null, words: null });
                return;
            }
            for (; next < match; next++) {
                rows.push({ del: null, ins: ins[next], words: null });
            }
            rows.push({ del: del, ins: ins[match], words: words });
            next = match + 1;
        });
        for (; next < ins.length; next++) {
            rows.push({ del: null, ins: ins[next], words: null });
        }

        // Side by side: between two matched pairs, the unmatched removals and
        // additions share rows rather than each leaving a half-empty one
        var packed = [];
        var dels = [];
        var adds = [];
        function flush() {
            for (var i = 0; i < Math.max(dels.length, adds.length); i++) {
                packed.push({ del: dels[i] || null, ins: adds[i] || null, words: null });
            }
            dels = [];
            adds = [];
        }
        rows.forEach(function (row) {
            if (row.words) {
                flush();
                packed.push(row);
            } else if (row.del) {
                dels.push(row.del);
            } else {
                adds.push(row.ins);
            }
        });
        flush();
        return { rows: rows, packed: packed };
    }

    function splitRuns(ops) {
        // [{type: 'equal', ops}] | [{type: 'change', dels, ins}]
        var runs = [];
        var run = null;
        ops.forEach(function (op) {
            if (op.type === 'equal') {
                if (!run || run.type !== 'equal') {
                    run = { type: 'equal', ops: [] };
                    runs.push(run);
                }
                run.ops.push(op);
            } else {
                if (!run || run.type !== 'change') {
                    run = { type: 'change', dels: [], ins: [] };
                    runs.push(run);
                }
                (op.type === 'delete' ? run.dels : run.ins).push(op);
            }
        });
        return runs;
    }

    function appendRows(tbody, ops, oldLines, newLines, layout) {
        splitRuns(ops).forEach(function (run) {
            if (run.type === 'equal') {
                run.ops.forEach(function (op) {
                    var row = el('tr', 'revisions-row');
                    if (layout === 'split') {
                        row.appendChild(numberCell(op.aIndex));
                        row.appendChild(textCell('revisions-text', oldLines[op.aIndex]));
                        row.appendChild(numberCell(op.bIndex));
                        row.appendChild(textCell('revisions-text', newLines[op.bIndex]));
                    } else {
                        row.appendChild(numberCell(op.aIndex));
                        row.appendChild(numberCell(op.bIndex));
                        row.appendChild(el('td', 'revisions-sign', ''));
                        row.appendChild(textCell('revisions-text', oldLines[op.aIndex]));
                    }
                    tbody.appendChild(row);
                });
                return;
            }

            var aligned = alignRun(run.dels, run.ins, oldLines, newLines);
            var first = true;
            function mark(row) {
                if (first) {
                    row.classList.add('revisions-change-start');
                    first = false;
                }
                return row;
            }

            if (layout === 'split') {
                aligned.packed.forEach(function (line) {
                    var row = mark(el('tr', 'revisions-row'));
                    var pair = line.words;
                    if (line.del) {
                        row.appendChild(numberCell(line.del.aIndex)).classList.add('revisions-del');
                        row.appendChild(textCell('revisions-text revisions-del', oldLines[line.del.aIndex], pair && pair.a, 'revisions-word-del'));
                    } else {
                        row.appendChild(el('td', 'revisions-ln revisions-filler'));
                        row.appendChild(el('td', 'revisions-text revisions-filler'));
                    }
                    if (line.ins) {
                        row.appendChild(numberCell(line.ins.bIndex)).classList.add('revisions-ins');
                        row.appendChild(textCell('revisions-text revisions-ins', newLines[line.ins.bIndex], pair && pair.b, 'revisions-word-ins'));
                    } else {
                        row.appendChild(el('td', 'revisions-ln revisions-filler'));
                        row.appendChild(el('td', 'revisions-text revisions-filler'));
                    }
                    tbody.appendChild(row);
                });
                return;
            }

            // Unified: the removed lines, then the added ones
            var delWords = new Map();
            var insWords = new Map();
            aligned.rows.forEach(function (line) {
                if (line.words) {
                    delWords.set(line.del, line.words.a);
                    insWords.set(line.ins, line.words.b);
                }
            });
            run.dels.forEach(function (op) {
                var row = mark(el('tr', 'revisions-row revisions-del'));
                row.appendChild(numberCell(op.aIndex));
                row.appendChild(numberCell(null));
                row.appendChild(el('td', 'revisions-sign', '−'));
                row.appendChild(textCell('revisions-text', oldLines[op.aIndex], delWords.get(op), 'revisions-word-del'));
                tbody.appendChild(row);
            });
            run.ins.forEach(function (op) {
                var row = mark(el('tr', 'revisions-row revisions-ins'));
                row.appendChild(numberCell(null));
                row.appendChild(numberCell(op.bIndex));
                row.appendChild(el('td', 'revisions-sign', '+'));
                row.appendChild(textCell('revisions-text', newLines[op.bIndex], insWords.get(op), 'revisions-word-ins'));
                tbody.appendChild(row);
            });
        });
    }

    function gapRow(ops, oldLines, newLines, layout) {
        var tbody = document.createElement('tbody');
        tbody.className = 'revisions-gap';
        var row = el('tr');
        var cell = el('td');
        cell.colSpan = 4;
        var button = el('button', 'revisions-gap-btn');
        button.type = 'button';
        button.appendChild(icon('chevrons-up-down'));
        button.appendChild(el('span', null, ops.length === 1
            ? tr('unchanged_line', '1 unchanged line')
            : tr('unchanged_lines', '{{count}} unchanged lines', { count: ops.length })));
        button.addEventListener('click', function () {
            var expanded = document.createElement('tbody');
            appendRows(expanded, ops, oldLines, newLines, layout);
            tbody.parentNode.replaceChild(expanded, tbody);
        });
        cell.appendChild(button);
        row.appendChild(cell);
        tbody.appendChild(row);
        return tbody;
    }

    function renderDiff(oldText, newText, sides) {
        var oldLines = contentToLines(oldText);
        var newLines = contentToLines(newText);
        var ops = window.PoznoteDiff.diffLines(oldLines, newLines);
        var counts = window.PoznoteDiff.countChanges(ops);

        // Direction and totals
        els.direction.innerHTML = '';
        els.direction.appendChild(el('span', 'revisions-side revisions-side-old', sides.old.label));
        els.direction.appendChild(icon('arrow-right'));
        els.direction.appendChild(el('span', 'revisions-side revisions-side-new', sides.new.label));

        els.stats.innerHTML = '';
        var added = el('span', 'revisions-stat revisions-stat-ins', '+' + counts.added);
        added.title = tr('added_lines', '{{count}} lines added', { count: counts.added });
        var removed = el('span', 'revisions-stat revisions-stat-del', '−' + counts.removed);
        removed.title = tr('removed_lines', '{{count}} lines removed', { count: counts.removed });
        els.stats.appendChild(added);
        els.stats.appendChild(removed);

        els.body.innerHTML = '';
        if (config.noteType !== 'markdown' && config.noteType !== 'tasklist') {
            els.body.appendChild(el('p', 'revisions-hint', tr('text_compare_hint', 'Rich-text notes are compared on their text: a change of formatting alone does not show.')));
        }

        var meta = metaChanges(sides.old.meta, sides.new.meta);
        if (hasMetaChanges(meta)) {
            els.body.appendChild(renderMetaChanges(meta));
        }

        if (counts.added === 0 && counts.removed === 0) {
            var same = el('div', 'revisions-state revisions-state-inline');
            same.appendChild(icon('check-circle'));
            same.appendChild(el('p', 'revisions-state-title', hasMetaChanges(meta)
                ? tr('same_content', 'Same content')
                : tr('no_differences', 'No differences')));
            same.appendChild(el('p', 'revisions-state-hint', hasMetaChanges(meta)
                ? tr('same_content_hint', 'Only the title or the tags differ.')
                : tr('no_differences_hint', 'Both versions hold the same content, title and tags.')));
            els.body.appendChild(same);
            setNavEnabled(false);
            return;
        }

        var layout = isNarrow() ? 'unified' : state.layout;
        var table = el('table', 'revisions-diff revisions-diff-' + layout);
        if (config.noteType === 'markdown') table.classList.add('revisions-diff-mono');
        var colgroup = document.createElement('colgroup');
        (layout === 'split'
            ? ['revisions-col-ln', 'revisions-col-text', 'revisions-col-ln', 'revisions-col-text']
            : ['revisions-col-ln', 'revisions-col-ln', 'revisions-col-sign', 'revisions-col-text']
        ).forEach(function (className) {
            colgroup.appendChild(el('col', className));
        });
        table.appendChild(colgroup);

        var groups = window.PoznoteDiff.groupHunks(ops, CONTEXT_LINES);
        groups.forEach(function (group) {
            // A fold costs a row too: a gap of one or two lines just shows
            if (group.type === 'gap' && group.ops.length > 2) {
                table.appendChild(gapRow(group.ops, oldLines, newLines, layout));
            } else {
                var tbody = document.createElement('tbody');
                appendRows(tbody, group.ops, oldLines, newLines, layout);
                table.appendChild(tbody);
            }
        });

        var scroller = el('div', 'revisions-diff-scroll');
        scroller.appendChild(table);
        els.body.appendChild(scroller);
        setNavEnabled(true);
    }

    function setNavEnabled(enabled) {
        els.prevChange.disabled = !enabled;
        els.nextChange.disabled = !enabled;
    }

    function jumpToChange(direction) {
        var starts = els.body.querySelectorAll('.revisions-change-start');
        if (!starts.length) return;
        // The diff scrolls inside its box on a wide window, with the page on
        // a narrow one: measure from the top of whichever scrolls
        var scrollsInside = els.body.scrollHeight > els.body.clientHeight + 1;
        var top = scrollsInside ? els.body.getBoundingClientRect().top : 0;
        var target = null;
        var i;
        if (direction > 0) {
            for (i = 0; i < starts.length; i++) {
                if (starts[i].getBoundingClientRect().top - top > 16) {
                    target = starts[i];
                    break;
                }
            }
            if (!target) target = starts[0];
        } else {
            for (i = starts.length - 1; i >= 0; i--) {
                if (starts[i].getBoundingClientRect().top - top < 4) {
                    target = starts[i];
                    break;
                }
            }
            if (!target) target = starts[starts.length - 1];
        }
        var cell = target.firstElementChild || target;
        cell.scrollIntoView({ block: 'start' });
        target.classList.remove('revisions-flash');
        void target.offsetWidth;
        target.classList.add('revisions-flash');
    }

    els.prevChange.addEventListener('click', function () { jumpToChange(-1); });
    els.nextChange.addEventListener('click', function () { jumpToChange(1); });

    // ---- Content rendering ----------------------------------------------------------

    function renderContent(revision) {
        els.body.innerHTML = '';
        var content = revision.content || '';
        var box;

        if (config.noteType === 'markdown') {
            if (state.mdMode === 'source' || typeof revision.html !== 'string') {
                box = el('pre', 'revisions-content revisions-content-source', content);
            } else {
                box = el('div', 'revisions-content markdown-preview');
                box.innerHTML = revision.html;
            }
        } else if (config.noteType === 'tasklist') {
            box = el('div', 'revisions-content revisions-content-tasks');
            var lines = tasksToLines(content);
            lines.forEach(function (line) {
                var row = el('div', 'revisions-task' + (/^\s+/.test(line) ? ' revisions-subtask' : ''));
                var done = /^\s*☑/.test(line);
                if (done) row.classList.add('revisions-task-done');
                var box2 = el('span', 'revisions-task-box');
                box2.appendChild(icon(done ? 'check-square' : 'square'));
                row.appendChild(box2);
                row.appendChild(el('span', null, line.replace(/^\s*[☐☑]\s?/, '')));
                box.appendChild(row);
            });
        } else {
            // Stored HTML, sanitized when it was saved; the old dialog showed
            // it the same way
            box = el('div', 'revisions-content revisions-content-html noteentry');
            box.innerHTML = content;
        }

        if (content.trim() === '') {
            box = el('div', 'revisions-content revisions-content-empty', tr('empty_content', '(Empty content)'));
        }
        els.body.appendChild(box);
    }

    // ---- Main render ----------------------------------------------------------

    function isNarrow() {
        return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    }

    function syncToolbar() {
        els.panel.dataset.view = state.view;
        document.querySelectorAll('.revisions-tab').forEach(function (tab) {
            var active = tab.dataset.view === state.view;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-for-view]').forEach(function (node) {
            node.hidden = node.dataset.forView !== state.view;
        });
        document.querySelectorAll('[data-layout]').forEach(function (button) {
            var active = button.dataset.layout === state.layout;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-md-mode]').forEach(function (button) {
            var active = button.dataset.mdMode === state.mdMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        // Preview / Source of a Markdown revision, beside the tabs
        els.mdMode.hidden = config.noteType !== 'markdown' || state.view !== 'content';
        // The option row only serves the comparison
        els.toolbar.hidden = state.view === 'content';
    }

    /**
     * The note's title on top of the panel, as the revision recorded it (a
     * note renamed since shows its old title). When and why the revision was
     * saved reads in the selected entry of the history.
     */
    function renderSelectedHeader(rev) {
        els.when.textContent = rev.heading || config.noteHeading || '';
    }

    function showLoadingBody() {
        els.body.innerHTML = '';
        var loading = el('div', 'revisions-state revisions-state-inline');
        loading.appendChild(icon('loader-2'));
        loading.firstChild.classList.add('revisions-spinner');
        els.body.appendChild(loading);
    }

    function render() {
        var index = findIndex(state.selectedKey);
        if (index < 0) return;
        var rev = state.revisions[index];
        var token = ++state.loadToken;

        syncToolbar();
        renderSelectedHeader(rev);
        showLoadingBody();
        els.body.scrollTop = 0;

        if (state.view === 'content') {
            fetchRevision(rev.snapshot_key).then(function (revision) {
                if (token !== state.loadToken) return;
                renderContent(revision);
            }).catch(function () {
                if (token !== state.loadToken) return;
                showBodyError(tr('errors.load_failed', 'Could not load this revision'));
            });
            return;
        }

        renderCompareOptions();
        var sides = compareSides();
        if (!sides) {
            els.body.innerHTML = '';
            els.body.appendChild(el('p', 'revisions-hint', tr('no_previous', 'This is the oldest revision: there is nothing before it to compare with.')));
            return;
        }
        Promise.all([sides.old.load(), sides.new.load()]).then(function (texts) {
            if (token !== state.loadToken) return;
            renderDiff(texts[0], texts[1], sides);
        }).catch(function () {
            if (token !== state.loadToken) return;
            showBodyError(tr('errors.load_failed', 'Could not load this revision'));
        });
    }

    function showBodyError(message) {
        els.body.innerHTML = '';
        var box = el('div', 'revisions-state revisions-state-inline');
        box.appendChild(icon('alert-triangle'));
        box.appendChild(el('p', 'revisions-state-title', message));
        els.body.appendChild(box);
    }

    function selectRevision(key) {
        if (findIndex(key) < 0) return;
        state.selectedKey = key;
        syncListSelection();
        try {
            var url = new URL(window.location.href);
            url.searchParams.set('revision', key);
            window.history.replaceState(null, '', url.toString());
        } catch (e) {
            // Old browser: the selection just is not kept on reload
        }
        render();
    }

    document.querySelectorAll('.revisions-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            state.view = tab.dataset.view;
            savePrefs();
            render();
        });
    });

    document.querySelectorAll('[data-layout]').forEach(function (button) {
        button.addEventListener('click', function () {
            state.layout = button.dataset.layout;
            savePrefs();
            render();
        });
    });

    document.querySelectorAll('[data-md-mode]').forEach(function (button) {
        button.addEventListener('click', function () {
            state.mdMode = button.dataset.mdMode;
            savePrefs();
            render();
        });
    });

    var lastNarrow = isNarrow();
    window.addEventListener('resize', function () {
        var narrow = isNarrow();
        if (narrow !== lastNarrow) {
            lastNarrow = narrow;
            if (state.view === 'changes' && state.layout === 'split') render();
        }
    });

    // ---- Loading the history ----------------------------------------------------------

    function showState(which) {
        els.loading.hidden = which !== 'loading';
        els.empty.hidden = which !== 'empty';
        els.panel.hidden = which !== 'panel';
        // The loading block is visible by default in the markup
        els.loading.style.display = which === 'loading' ? '' : 'none';
    }

    function loadHistory(preferredKey) {
        return fetchList().then(function (data) {
            if (!data.success) throw new Error(data.error || 'load failed');
            state.revisions = Array.isArray(data.snapshots) ? data.snapshots.filter(function (rev) {
                return rev && rev.snapshot_key;
            }) : [];
            state.currentHash = data.current_hash || '';
            state.currentMeta = { heading: data.current_heading || '', tags: data.current_tags || '' };
            countMinutes();
            state.current = null;

            if (!state.revisions.length) {
                els.list.innerHTML = '';
                state.selectedKey = '';
                showState('empty');
                return;
            }

            showState('panel');
            var key = preferredKey && findIndex(preferredKey) >= 0 ? preferredKey : state.revisions[0].snapshot_key;
            state.selectedKey = key;
            renderList();
            selectRevision(key);
        }).catch(function () {
            showState('empty');
            showError(tr('errors.load_failed', 'Could not load the revisions'));
        });
    }

    // ---- Actions ----------------------------------------------------------

    function showToast(message) {
        var stack = document.getElementById('revisionsToasts');
        if (!stack) {
            stack = el('div', 'revisions-toasts');
            stack.id = 'revisionsToasts';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        var toast = el('div', 'revisions-toast', message);
        stack.appendChild(toast);
        setTimeout(function () {
            toast.classList.add('revisions-toast-out');
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 250);
        }, 1800);
    }

    function showError(message) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'error');
        } else {
            window.alert(message);
        }
    }

    function confirmAction(message, title, button, danger) {
        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            return window.modalAlert.confirm(message, title, {
                confirmText: button,
                confirmButtonClass: danger ? 'danger' : ''
            });
        }
        return Promise.resolve(window.confirm(message));
    }

    function saveRevision() {
        els.newBtns.forEach(function (button) { button.disabled = true; });
        api('/snapshot?manual=1', { method: 'POST' }).then(function (data) {
            if (!data.success) throw new Error(data.error || '');
            showToast(tr('messages.created', 'Revision saved'));
            return loadHistory(data.snapshot_key || '');
        }).catch(function (error) {
            showError((error && error.message) || tr('errors.create_failed', 'Could not save a revision'));
        }).finally(function () {
            els.newBtns.forEach(function (button) { button.disabled = false; });
        });
    }

    els.newBtns.forEach(function (button) {
        button.addEventListener('click', saveRevision);
    });

    els.restoreBtn.addEventListener('click', function () {
        var key = state.selectedKey;
        if (!key) return;
        confirmAction(
            tr('confirm.restore_message', 'The note will take the content, the title and the tags of this revision. Its current state is replaced: save a revision first if you want to keep it.'),
            tr('confirm.restore_title', 'Restore this revision?'),
            tr('confirm.restore_button', 'Restore')
        ).then(function (confirmed) {
            if (!confirmed) return;
            els.restoreBtn.disabled = true;
            // meta=1: the title and the tags come back with the content
            api('/snapshot/restore?meta=1&snapshot_key=' + encodeURIComponent(key), { method: 'POST' }).then(function (data) {
                if (!data.success) throw new Error(data.error || '');
                window.location.href = config.backUrl || 'index.php';
            }).catch(function (error) {
                els.restoreBtn.disabled = false;
                showError((error && error.message) || tr('errors.restore_failed', 'Could not restore this revision'));
            });
        });
    });

    els.deleteBtn.addEventListener('click', function () {
        var key = state.selectedKey;
        if (!key) return;
        var index = findIndex(key);
        confirmAction(
            tr('confirm.delete_message', 'This revision will be deleted for good.'),
            tr('confirm.delete_title', 'Delete this revision?'),
            tr('confirm.delete_button', 'Delete'),
            true
        ).then(function (confirmed) {
            if (!confirmed) return;
            api('/snapshot?snapshot_key=' + encodeURIComponent(key), { method: 'DELETE' }).then(function (data) {
                if (!data.success) throw new Error(data.error || '');
                delete state.contents[key];
                showToast(tr('messages.deleted', 'Revision deleted'));
                var neighbour = state.revisions[index + 1] || state.revisions[index - 1];
                return loadHistory(neighbour ? neighbour.snapshot_key : '');
            }).catch(function (error) {
                showError((error && error.message) || tr('errors.delete_failed', 'Could not delete this revision'));
            });
        });
    });

    function copyText(text, html) {
        if (html && navigator.clipboard && navigator.clipboard.write && typeof window.ClipboardItem === 'function') {
            return navigator.clipboard.write([new window.ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' })
            })]);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            var ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (e) {
                ok = false;
            }
            document.body.removeChild(area);
            if (ok) resolve();
            else reject(new Error('copy failed'));
        });
    }

    els.copyBtn.addEventListener('click', function () {
        var key = state.selectedKey;
        if (!key) return;
        fetchRevision(key).then(function (revision) {
            var content = revision.content || '';
            // Markdown copies its source, a task list its lines, a rich-text
            // note its text plus its markup so pasting into a note keeps the
            // formatting
            if (config.noteType === 'markdown') return copyText(content, '');
            if (config.noteType === 'tasklist') return copyText(tasksToLines(content).join('\n'), '');
            return copyText(htmlToLines(content).join('\n'), content);
        }).then(function () {
            showToast(tr('messages.copied', 'Content copied'));
        }).catch(function () {
            showError(tr('errors.copy_failed', 'Copy failed'));
        });
    });

    // ---- Actions menu ----------------------------------------------------------

    function menuItems() {
        return Array.prototype.filter.call(els.actionsMenu.querySelectorAll('.revisions-menu-item'), function (item) {
            return !item.disabled;
        });
    }

    function openMenu(focusFirst) {
        els.actionsMenu.hidden = false;
        els.actionsBtn.setAttribute('aria-expanded', 'true');
        if (focusFirst) {
            var items = menuItems();
            if (items.length) items[0].focus();
        }
    }

    function closeMenu(restoreFocus) {
        if (els.actionsMenu.hidden) return;
        els.actionsMenu.hidden = true;
        els.actionsBtn.setAttribute('aria-expanded', 'false');
        if (restoreFocus) els.actionsBtn.focus();
    }

    els.actionsBtn.addEventListener('click', function () {
        if (els.actionsMenu.hidden) openMenu(false);
        else closeMenu(false);
    });

    els.actionsBtn.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            openMenu(true);
        }
    });

    els.actionsMenu.addEventListener('keydown', function (event) {
        var items = menuItems();
        var index = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            var next = index + (event.key === 'ArrowDown' ? 1 : -1);
            items[(next + items.length) % items.length].focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(true);
        } else if (event.key === 'Tab') {
            closeMenu(false);
        }
    });

    // Every item does its job and closes the menu
    els.actionsMenu.addEventListener('click', function (event) {
        if (event.target.closest('.revisions-menu-item')) closeMenu(false);
    });

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.revisions-menu-wrap')) closeMenu(false);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu(true);
    });

    loadPrefs();
    showState('loading');
    loadHistory(config.initialRevision || '');
})();

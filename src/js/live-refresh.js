/**
 * Live refresh: keep an open tab in sync with changes made outside it, i.e.
 * by the built-in AI chat, the MCP server, the REST API, another tab or
 * another user working on the same account.
 *
 * The tab polls GET /api/v1/changes for an opaque token describing the
 * sidebar tree of the current workspace and one token per note it holds
 * (the open note plus the notes kept in the DOM cache), and compares them
 * with the tokens from its previous poll. Writes made by this tab itself are
 * detected through a fetch/XHR hook so the tokens are re-adopted silently
 * after them: only changes made elsewhere trigger a refresh.
 *
 *   - sidebar tree: reloaded in place (refreshNotesListAfterFolderAction),
 *     unless the user is interacting with it (inline rename, drag...)
 *   - open note: reloaded in place when it has no unsaved edits, no focus
 *     and no selection; otherwise a banner offers to reload it, or to keep
 *     and save this tab's version instead
 *   - cached notes: their cached DOM is dropped so the next visit refetches
 *
 * It also keeps the server "content version" of each note it knows about,
 * which the autosave (js/notes.js) sends as "if_version" so a save can never
 * silently overwrite an edit made elsewhere: the API answers 409 instead and
 * the banner above is shown.
 */
(function () {
    var POLL_INTERVAL_MS = 5000;
    var MAX_BACKOFF_MS = 60000;
    var MIN_POLL_GAP_MS = 800;
    var LOCAL_WRITE_REBASE_DELAY_MS = 300;
    var NOTICE_DURATION_MS = 4000;

    var treeBaseline = null;
    var treeWorkspace = null;
    var noteBaselines = Object.create(null);
    var contentVersions = Object.create(null);
    // Notes this tab knowingly no longer matches on the server: the change was
    // signalled (banner) but not applied here. Their stored content version is
    // deliberately left stale so the autosave is refused with a 409 instead of
    // overwriting the outside change, until the user resolves the conflict.
    var outOfSync = Object.create(null);
    var pendingLocalWrites = 0;
    var localWriteSeen = false;
    var rebasePending = false;
    var pollTimer = null;
    var rebaseTimer = null;
    var lastPollAt = 0;
    var inFlight = false;
    var queuedPoll = null;
    var backoffMs = POLL_INTERVAL_MS;
    var pendingScrollRestore = null;
    var started = false;

    function t(key, vars, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, vars || {}, fallback);
        }
        var text = fallback || key;
        Object.keys(vars || {}).forEach(function (name) {
            text = text.split('{{' + name + '}}').join(vars[name]);
        });
        return text;
    }

    function ensureStyles() {
        if (document.getElementById('live-refresh-styles')) {
            return;
        }
        var style = document.createElement('style');
        style.id = 'live-refresh-styles';
        style.textContent = [
            '.note-external-change-banner {',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: space-between;',
            '    gap: 12px;',
            '    flex-wrap: wrap;',
            '    margin: 12px 0;',
            '    padding: 10px 14px;',
            '    border: 1px solid rgba(0, 122, 204, 0.3);',
            '    border-radius: 10px;',
            '    background: #e8f3fc;',
            '    color: #0b4f7d;',
            '    font-size: 14px;',
            '    line-height: 1.45;',
            '}',
            '.note-external-change-banner.is-notice {',
            '    justify-content: center;',
            '    transition: opacity 0.4s ease;',
            '}',
            '.note-external-change-actions {',
            '    display: inline-flex;',
            '    gap: 8px;',
            '    flex-shrink: 0;',
            '}',
            '.note-external-change-banner button {',
            '    border: 1px solid rgba(0, 122, 204, 0.5);',
            '    border-radius: 8px;',
            '    background: #ffffff;',
            '    color: #0b4f7d;',
            '    font: inherit;',
            '    padding: 4px 12px;',
            '    cursor: pointer;',
            '}',
            '.note-external-change-banner button:hover {',
            '    background: #d7ebfa;',
            '}',
            'body.dark-mode .note-external-change-banner {',
            '    border-color: rgba(96, 165, 250, 0.4);',
            '    background: rgba(37, 99, 235, 0.18);',
            '    color: #cfe3ff;',
            '}',
            'body.dark-mode .note-external-change-banner button {',
            '    border-color: rgba(96, 165, 250, 0.5);',
            '    background: rgba(15, 23, 42, 0.6);',
            '    color: #cfe3ff;',
            '}',
            'body.dark-mode .note-external-change-banner button:hover {',
            '    background: rgba(37, 99, 235, 0.35);',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function normalizeNoteId(noteId) {
        if (noteId === null || noteId === undefined) {
            return '';
        }
        noteId = String(noteId).trim();
        if (!noteId || noteId === 'search' || noteId === '-1' || !/^\d+$/.test(noteId)) {
            return '';
        }
        return noteId;
    }

    function isReadonlyWorkspace() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    function currentWorkspace() {
        try {
            if (typeof window.getSelectedWorkspace === 'function') {
                return window.getSelectedWorkspace() || '';
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    function getActiveNoteId() {
        var rightCol = document.getElementById('right_col');
        var entry = rightCol ? rightCol.querySelector('.noteentry[data-note-id]') : null;
        return entry ? normalizeNoteId(entry.getAttribute('data-note-id')) : '';
    }

    function getCachedNoteIds() {
        var ids = [];
        try {
            if (typeof noteDomCache !== 'undefined' && noteDomCache && typeof noteDomCache.forEach === 'function') {
                noteDomCache.forEach(function (cached) {
                    var id = cached ? normalizeNoteId(cached.noteId) : '';
                    if (id && ids.indexOf(id) === -1) {
                        ids.push(id);
                    }
                });
            }
        } catch (e) { /* ignore */ }
        return ids;
    }

    function dropCachedNote(noteId) {
        try {
            if (typeof invalidateNoteDomCache === 'function') {
                invalidateNoteDomCache(noteId);
            }
        } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------------
    // Local write tracking (fetch + XMLHttpRequest hooks)
    // ------------------------------------------------------------------

    function isLocalWriteRequest(method, url) {
        method = String(method || 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            return false;
        }
        var parsed;
        try {
            parsed = new URL(String(url || ''), window.location.href);
        } catch (e) {
            return false;
        }
        if (parsed.origin !== window.location.origin) {
            return false;
        }
        var path = parsed.pathname;
        // The AI chat is an "external" writer even though it runs in this tab:
        // its tool calls must be picked up like any other outside change.
        if (/api_ai_chat\.php$/.test(path)) {
            return false;
        }
        if (/\/api\/v1\/changes$/.test(path)) {
            return false;
        }
        // Edit-lock traffic never changes note data
        if (/\/api\/v1\/(public\/)?notes(\/\d+)?\/lock(\/|$)/.test(path)) {
            return false;
        }
        return true;
    }

    function beginLocalWrite() {
        pendingLocalWrites += 1;
    }

    function endLocalWrite(succeeded) {
        pendingLocalWrites = Math.max(0, pendingLocalWrites - 1);
        if (succeeded) {
            localWriteSeen = true;
            rebasePending = true;
        }
        // A failed write (e.g. a 409 version conflict) changed nothing on the
        // server: re-adopting the tokens now would hide the outside change.
        if (pendingLocalWrites === 0 && localWriteSeen) {
            scheduleRebase();
        }
    }

    function scheduleRebase() {
        if (rebaseTimer) {
            window.clearTimeout(rebaseTimer);
        }
        rebaseTimer = window.setTimeout(function () {
            rebaseTimer = null;
            poll({ silent: true });
        }, LOCAL_WRITE_REBASE_DELAY_MS);
    }

    function installHooks() {
        if (typeof window.fetch === 'function') {
            var nativeFetch = window.fetch;
            window.fetch = function (input, init) {
                var tracked = false;
                try {
                    var method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
                    var url = (typeof input === 'string') ? input : ((input && input.url) || '');
                    tracked = isLocalWriteRequest(method, url);
                } catch (e) {
                    tracked = false;
                }
                if (tracked) {
                    beginLocalWrite();
                }
                var result;
                try {
                    result = nativeFetch.apply(this, arguments);
                } catch (e) {
                    if (tracked) {
                        endLocalWrite(false);
                    }
                    throw e;
                }
                if (tracked && result && typeof result.then === 'function') {
                    result.then(function (response) {
                        endLocalWrite(!!(response && response.ok));
                    }, function () {
                        endLocalWrite(false);
                    });
                }
                return result;
            };
        }

        if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
            var nativeOpen = XMLHttpRequest.prototype.open;
            var nativeSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url, async) {
                try {
                    this.__poznoteLiveWrite = isLocalWriteRequest(method, url);
                    this.__poznoteLiveSync = (async === false);
                } catch (e) {
                    this.__poznoteLiveWrite = false;
                }
                return nativeOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function () {
                if (!this.__poznoteLiveWrite) {
                    return nativeSend.apply(this, arguments);
                }
                var xhr = this;
                var finished = false;
                var finish = function () {
                    if (finished) {
                        return;
                    }
                    finished = true;
                    endLocalWrite(xhr.status >= 200 && xhr.status < 300);
                };
                beginLocalWrite();
                xhr.addEventListener('loadend', finish);
                try {
                    return nativeSend.apply(this, arguments);
                } finally {
                    if (this.__poznoteLiveSync) {
                        finish();
                    }
                }
            };
        }
    }

    // ------------------------------------------------------------------
    // Polling
    // ------------------------------------------------------------------

    function isVisibleModalOpen() {
        // Alert overlays stay in the DOM while closing and are hidden with
        // visibility, not display: only the "show" class means open.
        if (document.querySelector('.alert-modal-overlay.show')) {
            return true;
        }
        // Regular modals are display:none until opened (css/modals/base.css),
        // so having a box means being on screen.
        var modals = document.querySelectorAll('.modal');
        for (var i = 0; i < modals.length; i++) {
            if (modals[i].getClientRects().length > 0) {
                return true;
            }
        }
        return false;
    }

    function schedulePoll(delayMs) {
        if (pollTimer) {
            window.clearTimeout(pollTimer);
        }
        pollTimer = window.setTimeout(function () {
            pollTimer = null;
            poll({ silent: false });
        }, delayMs);
    }

    function poll(opts) {
        opts = opts || {};
        if (!started) {
            return;
        }
        if (document.visibilityState === 'hidden') {
            // Resume on visibilitychange
            return;
        }
        if (inFlight) {
            queuedPoll = { silent: !!(queuedPoll ? (queuedPoll.silent && opts.silent) : opts.silent) };
            return;
        }
        var now = Date.now();
        if (!opts.silent && now - lastPollAt < MIN_POLL_GAP_MS) {
            schedulePoll(MIN_POLL_GAP_MS - (now - lastPollAt));
            return;
        }

        var workspace = currentWorkspace();
        var activeNoteId = getActiveNoteId();
        var ids = getCachedNoteIds();
        if (activeNoteId && ids.indexOf(activeNoteId) === -1) {
            ids.unshift(activeNoteId);
        }

        var url = '/api/v1/changes?workspace=' + encodeURIComponent(workspace)
            + '&note_ids=' + encodeURIComponent(ids.join(','))
            + '&_=' + now;

        inFlight = true;
        lastPollAt = now;
        if (pollTimer) {
            window.clearTimeout(pollTimer);
            pollTimer = null;
        }

        fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            cache: 'no-store',
            credentials: 'same-origin'
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        }).then(function (data) {
            backoffMs = POLL_INTERVAL_MS;
            if (data && data.success) {
                applyPollResult(data, {
                    silent: !!opts.silent,
                    workspace: workspace,
                    requestedIds: ids
                });
            }
        }).catch(function () {
            backoffMs = Math.min(MAX_BACKOFF_MS, backoffMs * 2);
        }).then(function () {
            inFlight = false;
            if (queuedPoll) {
                var queued = queuedPoll;
                queuedPoll = null;
                poll(queued);
                return;
            }
            schedulePoll(backoffMs);
        });
    }

    function applyPollResult(data, ctx) {
        // A write of our own may have landed while this poll was running: its
        // result can't be attributed, drop it and let the rebase poll settle.
        if (pendingLocalWrites > 0) {
            return;
        }
        var silent = ctx.silent || localWriteSeen;
        localWriteSeen = false;

        // --- sidebar tree ---
        var treeVersion = String(data.tree_version || '');
        if (silent || treeBaseline === null || treeWorkspace !== ctx.workspace) {
            treeBaseline = treeVersion;
            treeWorkspace = ctx.workspace;
        } else if (treeVersion !== treeBaseline) {
            if (canRefreshTree()) {
                treeBaseline = treeVersion;
                refreshTree();
            }
            // otherwise keep the old baseline and retry on the next poll
        }

        // --- notes ---
        var activeNoteId = getActiveNoteId();
        var notes = data.notes || {};
        var nextBaselines = Object.create(null);
        var nextContentVersions = Object.create(null);
        ctx.requestedIds.forEach(function (id) {
            var info = notes[id];
            if (!info || typeof info.version !== 'string') {
                if (noteBaselines[id] !== undefined) {
                    nextBaselines[id] = noteBaselines[id];
                }
                if (contentVersions[id] !== undefined) {
                    nextContentVersions[id] = contentVersions[id];
                }
                return;
            }
            var previous = noteBaselines[id];
            var serverContentVersion = (typeof info.content_version === 'string') ? info.content_version : null;
            var keptContentVersion = (contentVersions[id] !== undefined) ? contentVersions[id] : null;
            nextBaselines[id] = info.version;
            // What this tab displays matches the server version, so that is
            // what the autosave must send back as "if_version" - except for a
            // note already flagged out of sync, which keeps its stale version.
            nextContentVersions[id] = outOfSync[id] ? keptContentVersion : serverContentVersion;
            if (previous === undefined || previous === info.version) {
                return;
            }
            if (id !== activeNoteId) {
                // A cached note changed (even by our own tree action such as
                // a rename): its cached DOM is stale either way.
                dropCachedNote(id);
                return;
            }
            if (silent) {
                return;
            }
            if (handleActiveNoteChanged(id, info, serverContentVersion)) {
                // Reloaded: this tab shows the server version again.
                delete outOfSync[id];
                nextContentVersions[id] = serverContentVersion;
            } else {
                // Only signalled: keep the version this tab last agreed with.
                outOfSync[id] = true;
                nextContentVersions[id] = keptContentVersion;
            }
        });
        noteBaselines = nextBaselines;
        contentVersions = nextContentVersions;
        if (silent) {
            rebasePending = false;
        }
    }

    // ------------------------------------------------------------------
    // Sidebar tree refresh
    // ------------------------------------------------------------------

    function canRefreshTree() {
        var leftCol = document.getElementById('left_col');
        if (!leftCol || typeof window.refreshNotesListAfterFolderAction !== 'function') {
            return false;
        }
        if (pendingLocalWrites > 0 || window.isLoadingNote || window.internalDragActive) {
            return false;
        }
        if (leftCol.querySelector('.tree-inline-input, .tree-draft-folder, .sortable-ghost, .sortable-drag, .sortable-chosen')) {
            return false;
        }
        var active = document.activeElement;
        if (active && active !== document.body && leftCol.contains(active)) {
            return false;
        }
        if (isVisibleModalOpen()) {
            return false;
        }
        return true;
    }

    function refreshTree() {
        var leftCol = document.getElementById('left_col');
        var scrollTop = leftCol ? leftCol.scrollTop : 0;
        var result;
        try {
            result = window.refreshNotesListAfterFolderAction(null, {});
        } catch (e) {
            return;
        }
        Promise.resolve(result).then(function () {
            var refreshed = document.getElementById('left_col');
            if (refreshed) {
                refreshed.scrollTop = scrollTop;
            }
        }).catch(function () { /* ignore */ });
    }

    // ------------------------------------------------------------------
    // Open note refresh
    // ------------------------------------------------------------------

    function hasUnsavedChanges(noteId) {
        try {
            return typeof window.hasUnsavedChanges === 'function' && window.hasUnsavedChanges(noteId);
        } catch (e) {
            return false;
        }
    }

    function isNoteLocked(noteId) {
        try {
            return typeof window.isNoteEditingLocked === 'function' && window.isNoteEditingLocked(noteId);
        } catch (e) {
            return false;
        }
    }

    function canAutoReloadNote(noteId) {
        if (pendingLocalWrites > 0 || window.isLoadingNote) {
            return false;
        }
        // Swapping the note out from under an open dialog is disorienting,
        // whatever the note holds.
        if (isVisibleModalOpen()) {
            return false;
        }
        // On mobile the note pane may be off-screen behind the list; a reload
        // would scroll the user into it, so leave the banner for later.
        try {
            if (typeof isMobileDevice === 'function' && isMobileDevice() && !document.body.classList.contains('note-open')) {
                return false;
            }
        } catch (e) { /* ignore */ }
        if (isNoteLocked(noteId)) {
            // Read-only here (edited elsewhere): nothing to lose
            return true;
        }
        if (hasUnsavedChanges(noteId)) {
            return false;
        }
        var card = document.getElementById('note' + noteId);
        var active = document.activeElement;
        if (card && active && active !== document.body && card.contains(active)) {
            return false;
        }
        try {
            var selection = window.getSelection();
            if (card && selection && !selection.isCollapsed && selection.anchorNode && card.contains(selection.anchorNode)) {
                return false;
            }
        } catch (e) { /* ignore */ }
        return true;
    }

    function buildNoteUrl(noteId) {
        var workspace = currentWorkspace();
        // Reload in place: start from the current URL so the search context and
        // any other parameter survive (loadNoteDirectly rewrites the address
        // bar with this URL once the refresh completes).
        try {
            var url = new URL(window.location.href);
            url.searchParams.set('note', String(noteId));
            if (workspace && !url.searchParams.get('workspace')) {
                url.searchParams.set('workspace', workspace);
            }
            return url.pathname + url.search;
        } catch (e) { /* fall through */ }
        if (typeof window.buildNoteNavigationUrl === 'function') {
            return window.buildNoteNavigationUrl(noteId, workspace);
        }
        return 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + encodeURIComponent(noteId);
    }

    function discardLocalEdits(noteId) {
        try {
            if (typeof saveTimeout !== 'undefined' && saveTimeout) {
                window.clearTimeout(saveTimeout);
                saveTimeout = null;
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof notesNeedingRefresh !== 'undefined' && notesNeedingRefresh && notesNeedingRefresh.delete) {
                notesNeedingRefresh.delete(String(noteId));
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof window.clearDraft === 'function') {
                window.clearDraft(noteId);
            }
        } catch (e) { /* ignore */ }
        if (document.title.indexOf('🔴') === 0) {
            document.title = document.title.replace(/^🔴\s*/, '');
        }
    }

    function reloadNote(noteId, showNotice) {
        if (typeof window.loadNoteDirectly !== 'function' || window.isLoadingNote) {
            return false;
        }
        var rightCol = document.getElementById('right_col');
        var cmScroller = rightCol ? rightCol.querySelector('.cm-scroller') : null;
        pendingScrollRestore = {
            noteId: noteId,
            main: rightCol ? rightCol.scrollTop : 0,
            cm: cmScroller ? cmScroller.scrollTop : 0,
            notice: !!showNotice
        };
        delete outOfSync[noteId];
        dropCachedNote(noteId);
        window.loadNoteDirectly(buildNoteUrl(noteId), noteId, null, null, {
            needsRefresh: true,
            fromHistory: true
        });
        return true;
    }

    /**
     * Returns true when the outside change was applied here (note reloaded),
     * false when the user was only told about it.
     */
    function handleActiveNoteChanged(noteId, info, serverContentVersion) {
        if (!info.exists || info.trash) {
            showBanner(noteId, 'removed', null);
            return false;
        }
        if (canAutoReloadNote(noteId) && reloadNote(noteId, true)) {
            return true;
        }
        showBanner(noteId, 'changed', serverContentVersion);
        return false;
    }

    function getBannerAnchor(noteId) {
        var card = document.getElementById('note' + noteId);
        if (!card) {
            return null;
        }
        var existing = card.querySelector('.note-external-change-banner');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        return card;
    }

    function removeBanner(noteId) {
        var card = document.getElementById('note' + noteId);
        var banner = card ? card.querySelector('.note-external-change-banner') : null;
        if (banner && banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
    }

    /**
     * Overwrite the outside change with what this tab holds: adopt the server
     * version so the save passes the concurrency check, then save.
     */
    function keepLocalVersion(noteId, serverContentVersion) {
        delete outOfSync[noteId];
        contentVersions[noteId] = (typeof serverContentVersion === 'string' && serverContentVersion)
            ? serverContentVersion
            : null;
        removeBanner(noteId);
        if (String(window.noteid || '') !== String(noteId)) {
            return;
        }
        if (typeof window.saveNoteToServer === 'function') {
            window.saveNoteToServer();
        } else if (typeof saveNoteToServer === 'function') {
            saveNoteToServer();
        }
    }

    function insertBanner(card, banner) {
        var noteHeader = card.querySelector('.note-header');
        if (noteHeader && noteHeader.parentNode) {
            noteHeader.parentNode.insertBefore(banner, noteHeader.nextSibling);
        } else {
            card.insertBefore(banner, card.firstChild);
        }
    }

    function showBanner(noteId, kind, serverContentVersion) {
        ensureStyles();
        var card = document.getElementById('note' + noteId);
        if (!card) {
            return;
        }

        var unsaved = hasUnsavedChanges(noteId);
        var signature = kind + '|' + (unsaved ? 'unsaved' : 'clean');
        var existing = card.querySelector('.note-external-change-banner');
        if (existing && existing.dataset.bannerSignature === signature) {
            // Same message already on screen (a save retried and was refused
            // again): keep the node so it does not blink while typing.
            existing.dataset.serverVersion = serverContentVersion || '';
            return;
        }

        card = getBannerAnchor(noteId);
        var banner = document.createElement('div');
        banner.className = 'note-external-change-banner';
        banner.setAttribute('role', 'status');
        banner.dataset.bannerSignature = signature;
        banner.dataset.serverVersion = serverContentVersion || '';

        var text = document.createElement('span');
        if (kind === 'removed') {
            text.textContent = t('live_refresh.note_removed', {}, 'This note was deleted or moved to trash outside this tab.');
            banner.appendChild(text);
            insertBanner(card, banner);
            return;
        }

        text.textContent = unsaved
            ? t('live_refresh.note_changed_unsaved', {}, 'This note was modified outside this tab while you have unsaved changes here.')
            : t('live_refresh.note_changed', {}, 'This note was modified outside this tab.');
        banner.appendChild(text);

        var actions = document.createElement('span');
        actions.className = 'note-external-change-actions';

        var reloadButton = document.createElement('button');
        reloadButton.type = 'button';
        reloadButton.textContent = t('live_refresh.reload', {}, 'Reload');
        reloadButton.addEventListener('click', function () {
            if (!hasUnsavedChanges(noteId)) {
                reloadNote(noteId, false);
                return;
            }
            var message = t('live_refresh.discard_confirm', {}, 'Reloading will discard the changes you made here. Continue?');
            var title = t('live_refresh.discard_title', {}, 'Discard unsaved changes?');
            var confirmed = (window.modalAlert && typeof window.modalAlert.confirm === 'function')
                ? window.modalAlert.confirm(message, title)
                : Promise.resolve(window.confirm(message));
            Promise.resolve(confirmed).then(function (ok) {
                if (!ok) {
                    return;
                }
                discardLocalEdits(noteId);
                reloadNote(noteId, false);
            });
        });
        actions.appendChild(reloadButton);

        // Without this the note could never be saved again: every autosave
        // would keep being refused as long as the tab holds the old version.
        if (unsaved) {
            var keepButton = document.createElement('button');
            keepButton.type = 'button';
            keepButton.textContent = t('live_refresh.keep_mine', {}, 'Keep my version');
            keepButton.addEventListener('click', function () {
                keepLocalVersion(noteId, banner.dataset.serverVersion || null);
            });
            actions.appendChild(keepButton);
        }

        banner.appendChild(actions);
        insertBanner(card, banner);
    }

    function showRefreshedNotice(noteId) {
        ensureStyles();
        var card = getBannerAnchor(noteId);
        if (!card) {
            return;
        }
        var notice = document.createElement('div');
        notice.className = 'note-external-change-banner is-notice';
        notice.setAttribute('role', 'status');
        notice.textContent = t('live_refresh.note_refreshed', {}, 'Refreshed with changes made outside this tab.');
        insertBanner(card, notice);
        window.setTimeout(function () {
            notice.style.opacity = '0';
            window.setTimeout(function () {
                if (notice.parentNode) {
                    notice.parentNode.removeChild(notice);
                }
            }, 450);
        }, NOTICE_DURATION_MS);
    }

    function onNoteLoaded(event) {
        var detail = event && event.detail ? event.detail : {};
        var loadedId = normalizeNoteId(detail.noteId) || getActiveNoteId();
        var restore = pendingScrollRestore;
        pendingScrollRestore = null;

        // A note left behind while flagged must not be restored from the DOM
        // cache later: its markup predates the outside change.
        Object.keys(outOfSync).forEach(function (flaggedId) {
            if (flaggedId !== loadedId) {
                dropCachedNote(flaggedId);
            }
        });
        // The note just loaded comes from the server (its cache entry was
        // dropped above or by the reload), so this tab matches it again.
        if (loadedId) {
            delete outOfSync[loadedId];
        }
        if (restore && loadedId && String(restore.noteId) === String(loadedId)) {
            window.requestAnimationFrame(function () {
                var rightCol = document.getElementById('right_col');
                if (rightCol) {
                    rightCol.scrollTop = restore.main;
                    var cmScroller = rightCol.querySelector('.cm-scroller');
                    if (cmScroller) {
                        cmScroller.scrollTop = restore.cm;
                    }
                }
            });
            if (restore.notice) {
                showRefreshedNotice(loadedId);
            }
        }
        // Adopt the freshly loaded note's token as soon as possible
        poll({ silent: false });
    }

    // ------------------------------------------------------------------
    // Bootstrap
    // ------------------------------------------------------------------

    function start() {
        if (started || isReadonlyWorkspace()) {
            return;
        }
        if (!document.getElementById('left_col') && !document.getElementById('right_col')) {
            return;
        }
        started = true;
        installHooks();
        poll({ silent: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    document.addEventListener('noteLoaded', onNoteLoaded);

    // The AI chat panel raises this once a streamed answer (and its tool
    // calls) is complete, so its edits show up without waiting for the timer.
    document.addEventListener('poznoteExternalChangeHint', function () {
        poll({ silent: false });
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
            poll({ silent: false });
        }
    });

    window.addEventListener('focus', function () {
        poll({ silent: false });
    });

    window.pollLiveRefreshNow = function () {
        poll({ silent: false });
    };

    // --- hooks used by the autosave (js/notes.js, js/events-auto-save.js) ---

    // Server content version this tab is in sync with, or null when unknown
    // (note just loaded and not polled yet): the autosave then saves unchecked.
    window.getLiveNoteContentVersion = function (noteId) {
        noteId = normalizeNoteId(noteId);
        var version = noteId ? contentVersions[noteId] : null;
        return (typeof version === 'string' && version) ? version : null;
    };

    // Adopt the version returned by a successful save of our own: what the
    // server holds is now what this tab shows, so any conflict is resolved.
    window.setLiveNoteContentVersion = function (noteId, version) {
        noteId = normalizeNoteId(noteId);
        if (noteId && typeof version === 'string' && version) {
            contentVersions[noteId] = version;
            delete outOfSync[noteId];
        }
    };

    // A 409 is our own doing (task toggle, kanban move... that bumped the
    // version before the poller re-adopted the tokens) only while a write of
    // ours is settling AND the note is not knowingly out of sync. Retrying in
    // any other case would overwrite the change made elsewhere.
    window.liveRefreshShouldRetryVersionConflict = function (noteId) {
        noteId = normalizeNoteId(noteId);
        if (noteId && outOfSync[noteId]) {
            return false;
        }
        return rebasePending || pendingLocalWrites > 0;
    };

    // Called by the autosave when the API refused a save with 409. The note
    // stays flagged (so later polls do not silently adopt the server version)
    // until the user reloads or keeps their own version.
    window.handleNoteVersionConflict = function (noteId, serverContentVersion) {
        noteId = normalizeNoteId(noteId);
        if (!noteId) {
            return;
        }
        outOfSync[noteId] = true;
        ensureStyles();
        showBanner(noteId, 'changed', serverContentVersion || null);
    };
})();

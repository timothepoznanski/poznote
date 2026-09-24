/**
 * Offline copies of notes, kept in the browser (IndexedDB).
 *
 * Shared by three pages:
 *  - index.php (js/offline-sync.js) downloads the notes modified in the last
 *    days and pushes the changes made offline once the network is back;
 *  - offline.php (js/offline-app.js), the page the service worker (sw.js)
 *    serves when Poznote is opened without a network;
 *  - login.php (js/offline-login.js), which keeps what the offline sign-in
 *    checks a password against, and forgets the device's copies on sign-out.
 *
 * Stores, every record carrying the account id (userId):
 *   accounts  one per account: username, email, days kept, last sync, and the
 *             password verifier of the offline sign-in (PBKDF2, never the
 *             password itself)
 *   notes     the server copies of the offline notes (content + version)
 *   indexes   the account's whole note list, metadata only, so the offline
 *             page can list the notes it cannot open
 *   outbox    what was changed offline and still has to reach the server
 *             (a note's new title/content, or a note created offline, with a
 *             negative temporary id)
 *   meta      small device-wide values ('current' = account last synced here)
 *
 * Exposed as window.PoznoteOffline.
 */
(function () {
    'use strict';

    if (window.PoznoteOffline) {
        return;
    }

    var DB_NAME = 'poznote-offline';
    var DB_VERSION = 1;

    // Same names as sw.js
    var SHELL_CACHE = 'poznote-offline-shell';
    var MEDIA_CACHE_PREFIX = 'poznote-offline-media-';

    var PBKDF2_ITERATIONS = 250000;
    var PENDING_VERIFIER_KEY = 'poznote_offline_pending_verifier';
    var PENDING_VERIFIER_TTL_MS = 15 * 60 * 1000;

    var dbPromise = null;

    function isSupported() {
        try {
            return !!(window.indexedDB
                && window.isSecureContext
                && window.crypto && window.crypto.subtle
                && 'serviceWorker' in navigator);
        } catch (e) {
            return false;
        }
    }

    // ---- IndexedDB plumbing -------------------------------------------------

    function openDb() {
        if (dbPromise) {
            return dbPromise;
        }
        dbPromise = new Promise(function (resolve, reject) {
            var request;
            try {
                request = window.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (e) {
                reject(e);
                return;
            }
            request.onupgradeneeded = function () {
                var db = request.result;
                if (!db.objectStoreNames.contains('accounts')) {
                    db.createObjectStore('accounts', { keyPath: 'userId' });
                }
                if (!db.objectStoreNames.contains('notes')) {
                    db.createObjectStore('notes', { keyPath: ['userId', 'id'] }).createIndex('userId', 'userId');
                }
                if (!db.objectStoreNames.contains('indexes')) {
                    db.createObjectStore('indexes', { keyPath: 'userId' });
                }
                if (!db.objectStoreNames.contains('outbox')) {
                    db.createObjectStore('outbox', { keyPath: ['userId', 'id'] }).createIndex('userId', 'userId');
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }
            };
            request.onsuccess = function () {
                var db = request.result;
                // Another tab upgrading the schema must not be blocked by us.
                db.onversionchange = function () {
                    db.close();
                    dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = function () {
                dbPromise = null;
                reject(request.error);
            };
            request.onblocked = function () {
                dbPromise = null;
                reject(new Error('IndexedDB blocked'));
            };
        });
        return dbPromise;
    }

    /**
     * Run `work(stores)` in one transaction; resolves with what work() put in
     * `result.value` once the transaction has committed.
     */
    function transaction(storeNames, mode, work) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeNames, mode);
                var stores = {};
                storeNames.forEach(function (name) {
                    stores[name] = tx.objectStore(name);
                });
                var result = { value: undefined };
                tx.oncomplete = function () { resolve(result.value); };
                tx.onerror = function () { reject(tx.error); };
                tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
                try {
                    work(stores, result);
                } catch (e) {
                    try { tx.abort(); } catch (ignored) { /* already finished */ }
                    reject(e);
                }
            });
        });
    }

    function getOne(storeName, key) {
        return transaction([storeName], 'readonly', function (stores, result) {
            stores[storeName].get(key).onsuccess = function (event) {
                result.value = event.target.result;
            };
        });
    }

    function getAllForUser(storeName, userId) {
        return transaction([storeName], 'readonly', function (stores, result) {
            stores[storeName].index('userId').getAll(Number(userId)).onsuccess = function (event) {
                result.value = event.target.result || [];
            };
        });
    }

    function putMany(storeName, records) {
        return transaction([storeName], 'readwrite', function (stores) {
            records.forEach(function (record) {
                stores[storeName].put(record);
            });
        });
    }

    // ---- Accounts, notes, list, meta ---------------------------------------

    function getAccount(userId) {
        return getOne('accounts', Number(userId));
    }

    function getAccounts() {
        return transaction(['accounts'], 'readonly', function (stores, result) {
            stores.accounts.getAll().onsuccess = function (event) {
                result.value = event.target.result || [];
            };
        });
    }

    function putAccount(account) {
        account.userId = Number(account.userId);
        return putMany('accounts', [account]);
    }

    function getNotes(userId) {
        return getAllForUser('notes', userId);
    }

    function getNote(userId, noteId) {
        return getOne('notes', [Number(userId), Number(noteId)]);
    }

    function putNotes(notes) {
        return putMany('notes', notes);
    }

    function deleteNotes(userId, noteIds) {
        return transaction(['notes'], 'readwrite', function (stores) {
            noteIds.forEach(function (noteId) {
                stores.notes.delete([Number(userId), Number(noteId)]);
            });
        });
    }

    function getIndex(userId) {
        return getOne('indexes', Number(userId));
    }

    function putIndex(record) {
        record.userId = Number(record.userId);
        return putMany('indexes', [record]);
    }

    function getMeta(key) {
        return getOne('meta', key).then(function (record) {
            return record ? record.value : undefined;
        });
    }

    function setMeta(key, value) {
        return putMany('meta', [{ key: key, value: value }]);
    }

    function deleteMeta(key) {
        return transaction(['meta'], 'readwrite', function (stores) {
            stores.meta.delete(key);
        });
    }

    function mediaCacheName(userId) {
        return MEDIA_CACHE_PREFIX + Number(userId);
    }

    /**
     * Forget what the device keeps for an account (sign-out, offline copies
     * turned off). Changes still waiting in the outbox are kept: they reach
     * the server the next time this account signs in on this browser.
     */
    function forgetAccount(userId) {
        userId = Number(userId);
        var work = transaction(['accounts', 'notes', 'indexes'], 'readwrite', function (stores) {
            stores.accounts.delete(userId);
            stores.indexes.delete(userId);
            stores.notes.index('userId').openKeyCursor(IDBKeyRange.only(userId)).onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    stores.notes.delete(cursor.primaryKey);
                    cursor.continue();
                }
            };
        });
        return work.then(function () {
            if (window.caches) {
                return window.caches.delete(mediaCacheName(userId)).catch(function () { return false; });
            }
            return false;
        });
    }

    // ---- Outbox ------------------------------------------------------------

    function getOutbox(userId) {
        return getAllForUser('outbox', userId).then(function (entries) {
            return entries.sort(function (a, b) { return (a.editedAt || 0) - (b.editedAt || 0); });
        });
    }

    function getOutboxEntry(userId, noteId) {
        return getOne('outbox', [Number(userId), Number(noteId)]);
    }

    /**
     * Record a change made offline to a note. `note` is the copy the change
     * starts from (server copy, or the outbox entry of a note created
     * offline); `changes` holds the new heading and/or content. The first
     * change remembers the version and text it was made on, which is what
     * the push compares against. Resolves with the outbox entry, or null
     * when the note is back to its server state.
     */
    function saveLocalEdit(userId, note, changes) {
        userId = Number(userId);
        var noteId = Number(note.id);
        return transaction(['outbox'], 'readwrite', function (stores, result) {
            var store = stores.outbox;
            store.get([userId, noteId]).onsuccess = function (event) {
                var entry = event.target.result;
                if (!entry) {
                    entry = {
                        userId: userId,
                        id: noteId,
                        isNew: false,
                        type: note.type || 'note',
                        workspace: note.workspace || '',
                        folderId: note.folderId === undefined ? null : note.folderId,
                        heading: note.heading || '',
                        content: note.content || '',
                        baseVersion: note.version || '',
                        baseHeading: note.heading || '',
                        // null: the text the change started from is not known
                        // (a draft left by the online editor on an older
                        // version), so the push cannot merge, only compare.
                        baseContent: note.baseUnknown ? null : (note.content || ''),
                        rev: 0,
                        createdAt: Date.now()
                    };
                }
                if (Object.prototype.hasOwnProperty.call(changes, 'heading')) {
                    entry.heading = String(changes.heading);
                }
                if (Object.prototype.hasOwnProperty.call(changes, 'content')) {
                    entry.content = String(changes.content);
                }
                entry.rev = (entry.rev || 0) + 1;
                entry.editedAt = Date.now();
                entry.lastError = null;

                if (!entry.isNew && entry.baseContent !== null && entry.heading === entry.baseHeading && entry.content === entry.baseContent) {
                    store.delete([userId, noteId]);
                    result.value = null;
                    return;
                }
                store.put(entry);
                result.value = entry;
            };
        });
    }

    /**
     * A note created offline. It lives in the outbox only, under a negative
     * temporary id, until the push creates it on the server.
     */
    function createLocalNote(userId, fields) {
        userId = Number(userId);
        var now = Date.now();
        var entry = {
            userId: userId,
            id: -now,
            isNew: true,
            type: fields.type || 'note',
            workspace: fields.workspace || '',
            folderId: fields.folderId === undefined ? null : fields.folderId,
            heading: fields.heading || '',
            content: fields.content || '',
            baseVersion: '',
            baseHeading: '',
            baseContent: '',
            rev: 1,
            createdAt: now,
            editedAt: now,
            lastError: null
        };
        return putMany('outbox', [entry]).then(function () { return entry; });
    }

    function deleteOutboxEntry(userId, noteId) {
        return transaction(['outbox'], 'readwrite', function (stores) {
            stores.outbox.delete([Number(userId), Number(noteId)]);
        });
    }

    function setOutboxError(userId, noteId, message) {
        return transaction(['outbox'], 'readwrite', function (stores) {
            var key = [Number(userId), Number(noteId)];
            stores.outbox.get(key).onsuccess = function (event) {
                var entry = event.target.result;
                if (entry) {
                    entry.lastError = message || 'error';
                    entry.lastAttemptAt = Date.now();
                    stores.outbox.put(entry);
                }
            };
        });
    }

    /**
     * After a push: drop the outbox entry when nothing was typed meanwhile
     * (same rev), otherwise keep the newer text and rebase it on what the
     * server now holds, so the next push sends it with the right version.
     * `moveTo` re-files the entry under another id (note created on the
     * server, or a conflict copy that takes over the edits).
     */
    function settleOutboxEntry(userId, noteId, sentRev, rebase, moveTo) {
        userId = Number(userId);
        noteId = Number(noteId);
        return transaction(['outbox'], 'readwrite', function (stores, result) {
            var store = stores.outbox;
            store.get([userId, noteId]).onsuccess = function (event) {
                var entry = event.target.result;
                result.value = false;
                if (!entry) {
                    return;
                }
                if (entry.rev === sentRev) {
                    store.delete([userId, noteId]);
                    return;
                }
                entry.baseVersion = rebase.version || '';
                entry.baseHeading = rebase.heading;
                entry.baseContent = rebase.content;
                entry.lastError = null;
                if (moveTo !== undefined && moveTo !== null && Number(moveTo) !== noteId) {
                    store.delete([userId, noteId]);
                    entry.id = Number(moveTo);
                    entry.isNew = false;
                }
                store.put(entry);
                result.value = true;
            };
        });
    }

    // ---- Offline sign-in ---------------------------------------------------

    function bytesToBase64(bytes) {
        var binary = '';
        bytes = new Uint8Array(bytes);
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToBytes(text) {
        var binary = window.atob(String(text || ''));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function derivePasswordBits(password, salt, iterations) {
        var subtle = window.crypto.subtle;
        return subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'])
            .then(function (key) {
                return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, key, 256);
            });
    }

    /**
     * What the offline sign-in checks a password against: a salted PBKDF2
     * hash, computed in the browser when the password is typed on the login
     * page. The password itself is never stored.
     */
    function createVerifier(password) {
        var salt = window.crypto.getRandomValues(new Uint8Array(16));
        return derivePasswordBits(password, salt, PBKDF2_ITERATIONS).then(function (bits) {
            return {
                algorithm: 'PBKDF2-SHA256',
                iterations: PBKDF2_ITERATIONS,
                salt: bytesToBase64(salt),
                hash: bytesToBase64(bits),
                createdAt: Date.now()
            };
        });
    }

    function checkVerifier(verifier, password) {
        if (!verifier || !verifier.salt || !verifier.hash) {
            return Promise.resolve(false);
        }
        return derivePasswordBits(password, base64ToBytes(verifier.salt), Number(verifier.iterations) || PBKDF2_ITERATIONS)
            .then(function (bits) {
                var actual = new Uint8Array(bits);
                var expected = base64ToBytes(verifier.hash);
                if (actual.length !== expected.length) {
                    return false;
                }
                var diff = 0;
                for (var i = 0; i < actual.length; i++) {
                    diff |= actual[i] ^ expected[i];
                }
                return diff === 0;
            });
    }

    // The login page cannot know which account a password opens, nor whether
    // it was accepted: it parks the verifier in this tab, and the first page
    // of the signed-in app (js/offline-sync.js) files it under the account
    // whose username or email was typed.
    function storePendingVerifier(login, verifier) {
        try {
            window.sessionStorage.setItem(PENDING_VERIFIER_KEY, JSON.stringify({
                login: String(login || ''),
                verifier: verifier,
                at: Date.now()
            }));
        } catch (e) {
            console.debug('offline-store: storePendingVerifier() failed:', e);
        }
    }

    function clearPendingVerifier() {
        try {
            window.sessionStorage.removeItem(PENDING_VERIFIER_KEY);
        } catch (e) {
            console.debug('offline-store: clearPendingVerifier() failed:', e);
        }
    }

    function takePendingVerifier() {
        var pending = null;
        try {
            pending = JSON.parse(window.sessionStorage.getItem(PENDING_VERIFIER_KEY) || 'null');
        } catch (e) {
            pending = null;
        }
        clearPendingVerifier();
        if (!pending || !pending.verifier || !pending.at || Date.now() - pending.at > PENDING_VERIFIER_TTL_MS) {
            return null;
        }
        return pending;
    }

    function loginMatchesAccount(login, account) {
        var typed = String(login || '').trim().toLowerCase();
        if (!typed || !account) {
            return false;
        }
        return typed === String(account.username || '').trim().toLowerCase()
            || (!!account.email && typed === String(account.email).trim().toLowerCase());
    }

    // ---- Pushing offline changes -------------------------------------------

    function withLock(name, work) {
        if (navigator.locks && typeof navigator.locks.request === 'function') {
            return navigator.locks.request(name, { ifAvailable: true }, function (lock) {
                return lock ? work() : null;
            });
        }
        return work();
    }

    /**
     * One API call. Never throws: resolves with {status, ok, data} or
     * {networkError: true}. The X-Poznote-Account header makes the server
     * refuse (409 account_switched) a push while the browser's session is
     * signed in to another account.
     */
    function apiRequest(method, url, body, userId) {
        var headers = { 'Accept': 'application/json' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (userId) {
            headers['X-Poznote-Account'] = String(userId);
        }
        var init = { method: method, headers: headers, credentials: 'same-origin', cache: 'no-store' };
        if (body !== undefined) {
            init.body = JSON.stringify(body);
        }
        return fetch(url, init).then(function (response) {
            // A page gate answers a dead session with the login page.
            if (response.redirected && /\/login\.php(\?|$)/.test(response.url)) {
                return { status: 401, ok: false, data: null };
            }
            return response.json().catch(function () { return null; }).then(function (data) {
                return {
                    status: response.status,
                    ok: response.ok && !!data && data.success !== false,
                    data: data
                };
            });
        }, function () {
            return { networkError: true, status: 0, ok: false, data: null };
        });
    }

    // Requests of the push carry this marker: js/live-refresh.js must treat
    // them as outside changes (reload the open note), not as the tab's own.
    function syncUrl(path) {
        return path + (path.indexOf('?') === -1 ? '?' : '&') + 'offline_sync=1';
    }

    function errorMessage(response) {
        if (response && response.data && typeof response.data.error === 'string') {
            return response.data.error;
        }
        return 'HTTP ' + (response ? response.status : 0);
    }

    function isAccountSwitched(response) {
        return response.status === 409 && response.data && response.data.error === 'account_switched';
    }

    function createNoteOnServer(userId, entry, heading) {
        var body = {
            heading: heading,
            content: entry.content,
            type: entry.type || 'note',
            workspace: entry.workspace || undefined
        };
        if (entry.folderId) {
            body.folder_id = entry.folderId;
        }
        return apiRequest('POST', syncUrl('api/v1/notes'), body, userId).then(function (response) {
            // The folder may have been deleted meanwhile: land at the root.
            if (!response.ok && response.status === 404 && entry.folderId) {
                delete body.folder_id;
                return apiRequest('POST', syncUrl('api/v1/notes'), body, userId);
            }
            return response;
        });
    }

    function serverCopyFromEntry(userId, entry, note, content) {
        return {
            userId: Number(userId),
            id: Number(note.id),
            heading: note.heading !== undefined ? String(note.heading) : entry.heading,
            type: entry.type || 'note',
            workspace: note.workspace || entry.workspace || '',
            folderId: note.folder_id !== undefined ? note.folder_id : (entry.folderId === undefined ? null : entry.folderId),
            tags: entry.tags || '',
            updated: note.updated || note.created || null,
            version: note.version || '',
            content: content,
            // The server sanitizes what it stores: download it again at the
            // next sync instead of trusting the text that was sent.
            needsRefresh: true,
            cachedAt: Date.now()
        };
    }

    /**
     * Push one outbox entry. Resolves with 'next' (go on with the others)
     * or 'stop' (no point trying the rest now), after adding what happened
     * to result.events.
     */
    function pushEntry(userId, entry, options, result) {
        var sentRev = entry.rev;
        var sentContent = entry.content;
        var sentHeading = entry.heading;

        function stopOn(response) {
            if (response.networkError) {
                result.offline = true;
                return 'stop';
            }
            if (response.status === 401) {
                result.needsSignIn = true;
                return 'stop';
            }
            if (isAccountSwitched(response)) {
                result.wrongAccount = true;
                return 'stop';
            }
            return null;
        }

        function fail(response) {
            var message = errorMessage(response);
            result.events.push({ type: 'error', id: entry.id, heading: entry.heading, status: response.status, message: message });
            return setOutboxError(userId, entry.id, message).then(function () {
                return response.status >= 500 ? 'stop' : 'next';
            });
        }

        // A note written offline from scratch, or one deleted on the server
        // meanwhile: create it (again).
        function create(eventType) {
            return createNoteOnServer(userId, entry, sentHeading || '').then(function (response) {
                var stop = stopOn(response);
                if (stop) {
                    return stop;
                }
                if (!response.ok || !response.data || !response.data.note) {
                    return fail(response);
                }
                var created = response.data.note;
                return putNotes([serverCopyFromEntry(userId, entry, created, sentContent)])
                    .then(function () {
                        return entry.isNew ? null : deleteNotes(userId, [entry.id]);
                    })
                    .then(function () {
                        return settleOutboxEntry(userId, entry.id, sentRev, {
                            version: '',
                            heading: created.heading,
                            content: sentContent
                        }, created.id);
                    })
                    .then(function () {
                        result.events.push({ type: eventType, previousId: entry.id, id: Number(created.id), heading: created.heading });
                        return 'next';
                    });
            });
        }

        function adoptPushed(note, content, eventType) {
            return getNote(userId, entry.id).then(function (existing) {
                var copy = serverCopyFromEntry(userId, existing || entry, note, content);
                copy.tags = existing ? existing.tags : '';
                if (existing && existing.folderId !== undefined && note.folder_id === undefined) {
                    copy.folderId = existing.folderId;
                }
                return putNotes([copy]);
            }).then(function () {
                return settleOutboxEntry(userId, entry.id, sentRev, {
                    version: note.version,
                    heading: note.heading !== undefined ? note.heading : sentHeading,
                    content: content
                });
            }).then(function () {
                result.events.push({ type: eventType, id: entry.id, heading: note.heading !== undefined ? note.heading : sentHeading });
                return 'next';
            });
        }

        // The note changed on the server since it was copied. Each field is
        // taken from the side that changed it; when both sides changed the
        // text, markdown gets a three-way merge (js/markdown-merge.js). What
        // cannot be merged is kept twice: the server version stays in the
        // note and the offline one becomes a copy next to it. Nothing is
        // overwritten. A title changed on both sides keeps the offline one.
        function resolveConflict(current) {
            var serverHeading = current.heading !== undefined ? String(current.heading) : sentHeading;
            var serverContent = current.content !== undefined ? String(current.content) : '';
            if (serverContent === sentContent && serverHeading === sentHeading) {
                return adoptPushed(current, sentContent, 'pushed');
            }

            var baseKnown = entry.baseContent !== null && entry.baseContent !== undefined;
            var baseContent = baseKnown ? String(entry.baseContent) : '';
            var mergedContent = null;
            if (serverContent === sentContent || (baseKnown && serverContent === baseContent)) {
                mergedContent = sentContent;
            } else if (baseKnown && sentContent === baseContent) {
                mergedContent = serverContent;
            } else if (baseKnown && entry.type === 'markdown' && typeof window.mergeMarkdownThreeWay === 'function') {
                try {
                    mergedContent = window.mergeMarkdownThreeWay(baseContent, sentContent, serverContent);
                } catch (e) {
                    mergedContent = null;
                }
            }
            if (mergedContent === null) {
                return keepBoth(current);
            }
            var mergedHeading = (sentHeading === entry.baseHeading) ? serverHeading : sentHeading;

            return apiRequest('PATCH', syncUrl('api/v1/notes/' + entry.id), {
                heading: mergedHeading,
                content: mergedContent,
                if_version: current.version
            }, userId).then(function (response) {
                var stop = stopOn(response);
                if (stop) {
                    return stop;
                }
                if (response.ok && response.data && response.data.note) {
                    return adoptPushed(response.data.note, mergedContent, 'merged');
                }
                if (response.status === 409 && response.data && response.data.current) {
                    // Changed yet again in between: keep both.
                    return keepBoth(response.data.current);
                }
                return fail(response);
            });
        }

        function keepBoth(current) {
            var copyTitle = typeof options.copyTitle === 'function'
                ? options.copyTitle(sentHeading)
                : sentHeading + ' (offline copy)';
            return createNoteOnServer(userId, entry, copyTitle).then(function (response) {
                var stop = stopOn(response);
                if (stop) {
                    return stop;
                }
                if (!response.ok || !response.data || !response.data.note) {
                    return fail(response);
                }
                var created = response.data.note;
                return getNote(userId, entry.id).then(function (existing) {
                    var serverCopy = serverCopyFromEntry(userId, existing || entry, {
                        id: entry.id,
                        heading: current.heading,
                        updated: current.updated,
                        version: current.version
                    }, current.content || '');
                    serverCopy.needsRefresh = false;
                    serverCopy.tags = existing ? existing.tags : '';
                    return putNotes([serverCopy, serverCopyFromEntry(userId, entry, created, sentContent)]);
                }).then(function () {
                    // Anything typed during the push goes on in the copy.
                    return settleOutboxEntry(userId, entry.id, sentRev, {
                        version: '',
                        heading: created.heading,
                        content: sentContent
                    }, created.id);
                }).then(function () {
                    result.events.push({
                        type: 'copied',
                        id: entry.id,
                        heading: current.heading,
                        copyId: Number(created.id),
                        copyHeading: created.heading
                    });
                    return 'next';
                });
            });
        }

        if (entry.isNew) {
            return create('created');
        }

        var body = { heading: sentHeading, content: sentContent };
        if (entry.baseVersion) {
            body.if_version = entry.baseVersion;
        }
        return apiRequest('PATCH', syncUrl('api/v1/notes/' + entry.id), body, userId).then(function (response) {
            var stop = stopOn(response);
            if (stop) {
                return stop;
            }
            if (response.ok && response.data && response.data.note) {
                return adoptPushed(response.data.note, sentContent, 'pushed');
            }
            if (response.status === 409 && response.data && response.data.current) {
                return resolveConflict(response.data.current);
            }
            if (response.status === 404) {
                return create('recreated');
            }
            return fail(response);
        });
    }

    /**
     * Send everything changed offline for an account. Only one tab pushes at
     * a time (Web Locks); the others resolve with {busy: true}.
     *
     * options.copyTitle(heading) names the copy kept when a note changed on
     * both sides.
     */
    function flushOutbox(userId, options) {
        options = options || {};
        userId = Number(userId);
        var result = { events: [], offline: false, needsSignIn: false, wrongAccount: false, pending: 0 };

        var run = function () {
            return getOutbox(userId).then(function (entries) {
                var index = 0;
                function next() {
                    if (index >= entries.length) {
                        return null;
                    }
                    var entry = entries[index++];
                    return pushEntry(userId, entry, options, result).then(function (outcome) {
                        return outcome === 'stop' ? null : next();
                    });
                }
                return next();
            }).then(function () {
                return getOutbox(userId);
            }).then(function (left) {
                result.pending = left.length;
                return result;
            });
        };

        return Promise.resolve(withLock('poznote-offline-push-' + userId, run)).then(function (value) {
            return value || { busy: true, events: [], pending: -1 };
        });
    }

    window.PoznoteOffline = {
        SHELL_CACHE: SHELL_CACHE,
        MEDIA_CACHE_PREFIX: MEDIA_CACHE_PREFIX,
        isSupported: isSupported,
        getAccount: getAccount,
        getAccounts: getAccounts,
        putAccount: putAccount,
        forgetAccount: forgetAccount,
        getNotes: getNotes,
        getNote: getNote,
        putNotes: putNotes,
        deleteNotes: deleteNotes,
        getIndex: getIndex,
        putIndex: putIndex,
        getMeta: getMeta,
        setMeta: setMeta,
        deleteMeta: deleteMeta,
        mediaCacheName: mediaCacheName,
        getOutbox: getOutbox,
        getOutboxEntry: getOutboxEntry,
        saveLocalEdit: saveLocalEdit,
        createLocalNote: createLocalNote,
        deleteOutboxEntry: deleteOutboxEntry,
        flushOutbox: flushOutbox,
        withLock: withLock,
        apiRequest: apiRequest,
        createVerifier: createVerifier,
        checkVerifier: checkVerifier,
        storePendingVerifier: storePendingVerifier,
        clearPendingVerifier: clearPendingVerifier,
        takePendingVerifier: takePendingVerifier,
        loginMatchesAccount: loginMatchesAccount
    };
})();

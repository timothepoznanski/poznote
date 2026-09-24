/**
 * Offline copies, the online side (index.php).
 *
 * While the app is open and the network works, this keeps the browser's
 * offline copies (js/offline-store.js) up to date:
 *  - pushes what was changed on the offline page first (offline.php), then
 *    downloads the notes modified in the last days (GET api/v1/offline/...),
 *    only those whose version changed, and the pictures they show;
 *  - files the password verifier parked by the login page under the account
 *    that just signed in (the offline sign-in checks it);
 *  - stores the offline page itself for the service worker (sw.js), which
 *    serves it when Poznote is opened without a network.
 *
 * It also tells the user when the connection is lost, with a way to the
 * offline page, and reports what the push did when it comes back.
 */
(function () {
    'use strict';

    var Store = window.PoznoteOffline;
    if (!Store || !Store.isSupported()) {
        return;
    }
    // An account opened through a grant is not the user's to keep offline
    // (the API refuses it too).
    if (window.__poznoteBorrowedAccountId) {
        return;
    }

    var SYNC_INTERVAL_MS = 2 * 60 * 1000;
    var MIN_GAP_MS = 20 * 1000;
    var PROBE_INTERVAL_MS = 15 * 1000;
    var BATCH_SIZE = 50;
    var MEDIA_MAX_BYTES = 8 * 1024 * 1024;
    var MEDIA_MAX_FILES = 400;
    var ATTACHMENT_URL = /\/?api\/v1\/notes\/(\d+)\/attachments\/([A-Za-z0-9_.-]+)/g;

    var running = null;
    var lastRunAt = 0;
    var shellStored = false;
    var offlineDays = null;
    var bannerEl = null;
    var probeTimer = null;

    function tr(key, vars, fallback) {
        return typeof window.t === 'function' ? window.t(key, vars || {}, fallback) : fallback;
    }

    function readCookie(name) {
        var match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : '';
    }

    function currentLanguage() {
        return (window.POZNOTE_I18N && window.POZNOTE_I18N.lang)
            || document.documentElement.getAttribute('lang')
            || 'en';
    }

    function copyTitle(heading) {
        return tr('offline.sync.copy_title', { title: heading }, heading + ' (offline copy)');
    }

    // ---- Manifest and note downloads ---------------------------------------

    function fetchManifest(etag) {
        var headers = { 'Accept': 'application/json' };
        if (etag) {
            headers['If-None-Match'] = etag;
        }
        return fetch('api/v1/offline/manifest', { credentials: 'same-origin', cache: 'no-store', headers: headers })
            .then(function (response) {
                if (response.status === 304) {
                    return { status: 304 };
                }
                return response.json().catch(function () { return null; }).then(function (data) {
                    return {
                        status: response.status,
                        data: data,
                        etag: response.headers.get('ETag') || ''
                    };
                });
            }, function () {
                return { status: 0, networkError: true };
            });
    }

    function fetchNotes(ids) {
        return fetch('api/v1/offline/notes?ids=' + ids.join(','), { credentials: 'same-origin', cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                return (data && data.notes) || [];
            });
    }

    function toRecord(userId, note) {
        return {
            userId: userId,
            id: Number(note.id),
            heading: note.heading || '',
            type: note.type || 'note',
            workspace: note.workspace || '',
            folderId: note.folder_id === undefined ? null : note.folder_id,
            tags: note.tags || '',
            updated: note.updated || null,
            version: note.version || '',
            content: note.content || '',
            attachments: note.attachments || [],
            needsRefresh: false,
            cachedAt: Date.now()
        };
    }

    function downloadNotes(userId, ids) {
        var batches = [];
        for (var i = 0; i < ids.length; i += BATCH_SIZE) {
            batches.push(ids.slice(i, i + BATCH_SIZE));
        }
        return batches.reduce(function (chain, batch) {
            return chain.then(function () {
                return fetchNotes(batch).then(function (notes) {
                    return Store.putNotes(notes.map(function (note) { return toRecord(userId, note); }));
                });
            });
        }, Promise.resolve());
    }

    // ---- Pictures shown in the offline notes -------------------------------

    function attachmentUrls(records) {
        var urls = {};
        records.forEach(function (record) {
            var content = String(record.content || '');
            var match;
            ATTACHMENT_URL.lastIndex = 0;
            while ((match = ATTACHMENT_URL.exec(content)) !== null) {
                var url = new URL('/api/v1/notes/' + match[1] + '/attachments/' + match[2], window.location.origin).href;
                urls[url] = true;
            }
        });
        return Object.keys(urls).slice(0, MEDIA_MAX_FILES);
    }

    function cacheMedia(userId, records) {
        if (!window.caches) {
            return Promise.resolve();
        }
        var wanted = attachmentUrls(records);
        var wantedSet = {};
        wanted.forEach(function (url) { wantedSet[url] = true; });

        return window.caches.open(Store.mediaCacheName(userId)).then(function (cache) {
            return cache.keys().then(function (keys) {
                var have = {};
                var drops = [];
                keys.forEach(function (request) {
                    if (wantedSet[request.url]) {
                        have[request.url] = true;
                    } else {
                        drops.push(cache.delete(request));
                    }
                });
                return Promise.all(drops).then(function () {
                    var missing = wanted.filter(function (url) { return !have[url]; });
                    return missing.reduce(function (chain, url) {
                        return chain.then(function () {
                            return fetch(url, { credentials: 'same-origin' }).then(function (response) {
                                var type = response.headers.get('Content-Type') || '';
                                var size = Number(response.headers.get('Content-Length') || 0);
                                // Only pictures are shown inline; big files stay online.
                                if (!response.ok || type.indexOf('image/') !== 0 || size > MEDIA_MAX_BYTES) {
                                    return null;
                                }
                                return cache.put(url, response);
                            }).catch(function () { return null; });
                        });
                    }, Promise.resolve());
                });
            });
        }).catch(function (e) {
            console.debug('offline-sync: cacheMedia() failed:', e);
        });
    }

    // ---- The offline page, stored for the service worker --------------------

    function storeOfflinePage() {
        if (shellStored || !window.caches || !navigator.serviceWorker) {
            return Promise.resolve();
        }
        var pageUrl = new URL('offline.php', window.location.href).href;
        return fetch('offline.php?lang=' + encodeURIComponent(currentLanguage()), { credentials: 'same-origin', cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                var copy = response.clone();
                return response.text().then(function (html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var listEl = doc.getElementById('offline-shell-assets');
                    var assets = listEl ? JSON.parse(listEl.textContent || '[]') : [];
                    var wanted = {};
                    wanted[pageUrl] = true;
                    assets.forEach(function (asset) {
                        wanted[new URL(asset, pageUrl).href] = true;
                    });
                    return window.caches.open(Store.SHELL_CACHE).then(function (cache) {
                        var urls = Object.keys(wanted).filter(function (url) { return url !== pageUrl; });
                        return urls.reduce(function (chain, url) {
                            return chain.then(function () {
                                return cache.match(url).then(function (hit) {
                                    if (hit) {
                                        return null;
                                    }
                                    return fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function (assetResponse) {
                                        if (!assetResponse.ok) {
                                            throw new Error('HTTP ' + assetResponse.status + ' for ' + url);
                                        }
                                        return cache.put(url, assetResponse);
                                    });
                                });
                            });
                        }, Promise.resolve()).then(function () {
                            // The page last, once everything it loads is there.
                            return cache.put(pageUrl, copy);
                        }).then(function () {
                            return cache.keys();
                        }).then(function (keys) {
                            return Promise.all(keys.map(function (request) {
                                return wanted[request.url] ? null : cache.delete(request);
                            }));
                        });
                    });
                });
            })
            .then(function () {
                shellStored = true;
            })
            .catch(function (e) {
                console.debug('offline-sync: storeOfflinePage() failed:', e);
            });
    }

    // ---- Push report --------------------------------------------------------

    function reportPush(result) {
        if (!result || !result.events || result.events.length === 0) {
            return;
        }
        var synced = 0;
        var messages = [];
        var openNoteId = String(window.noteid || '');
        var touchesOpenNote = false;
        result.events.forEach(function (event) {
            if (String(event.id) === openNoteId) {
                touchesOpenNote = true;
            }
            if (event.type === 'pushed' || event.type === 'merged' || event.type === 'created' || event.type === 'recreated') {
                synced++;
            }
            if (event.type === 'recreated') {
                messages.push(tr('offline.sync.recreated', { title: event.heading },
                    '"{{title}}" had been deleted elsewhere while you were offline. Your version was saved again as a new note.'));
            } else if (event.type === 'copied') {
                messages.push(tr('offline.sync.conflict_copy', { title: event.heading, copy: event.copyHeading },
                    '"{{title}}" was also changed elsewhere while you were offline. Your version was saved as "{{copy}}".'));
            } else if (event.type === 'error') {
                messages.push(tr('offline.sync.push_failed', { title: event.heading, error: event.message },
                    'Your offline changes to "{{title}}" could not be saved yet ({{error}}). They will be sent again.'));
            }
        });
        if (synced > 0) {
            messages.unshift(synced === 1
                ? tr('offline.sync.synced_one', {}, '1 note changed offline has been synced.')
                : tr('offline.sync.synced_other', { count: synced }, '{{count}} notes changed offline have been synced.'));
        }
        if (messages.length > 0) {
            showMessage(messages.join(' '), true);
        }
        // Notes written from here are outside changes for the open note:
        // js/live-refresh.js reloads it (or offers to).
        if (touchesOpenNote) {
            try {
                document.dispatchEvent(new CustomEvent('poznoteExternalChangeHint'));
            } catch (e) { /* ignore */ }
        }
        // New notes and conflict copies must appear in the tree.
        if (typeof window.refreshNotesListAfterFolderAction === 'function') {
            try { window.refreshNotesListAfterFolderAction(); } catch (e) { /* ignore */ }
        }
    }

    // ---- One sync -----------------------------------------------------------

    function runSync() {
        var pageAccount = Number(readCookie('poznote_account') || 0);
        var stored = null;

        return (pageAccount ? Store.getAccount(pageAccount) : Promise.resolve(null))
            .then(function (account) {
                stored = account || null;
                return fetchManifest(stored && stored.manifestEtag);
            })
            .then(function (manifest) {
                if (manifest.networkError) {
                    onConnectionLost();
                    return null;
                }
                onConnectionBack();
                if (manifest.status === 304 && stored) {
                    return handleManifest(stored, null);
                }
                if (manifest.status !== 200 || !manifest.data || !manifest.data.success || !manifest.data.user) {
                    return null;
                }
                var data = manifest.data;
                var account = stored && Number(stored.userId) === Number(data.user.id) ? stored : { userId: Number(data.user.id) };
                account.username = data.user.username || '';
                account.email = data.user.email || '';
                account.displayName = data.user.display_name || account.username;
                account.days = Number(data.days) || 0;
                account.manifestEtag = manifest.etag || '';
                return handleManifest(account, data);
            });
    }

    function handleManifest(account, data) {
        var userId = Number(account.userId);
        account.lastSyncAt = Date.now();
        account.language = currentLanguage();
        offlineDays = account.days;

        // A password typed on the login page of this tab, for this account.
        var pending = Store.takePendingVerifier();
        if (pending && Store.loginMatchesAccount(pending.login, account)) {
            account.verifier = pending.verifier;
        }

        return Store.putAccount(account)
            .then(function () {
                return Store.setMeta('current', { userId: userId, at: Date.now() });
            })
            .then(function () {
                // Another account signed in on this device: the copies of an
                // account without a password verifier (SSO, remember-me)
                // could otherwise be opened by whoever uses the device next.
                return Store.getAccounts().then(function (accounts) {
                    return Promise.all(accounts.filter(function (other) {
                        return Number(other.userId) !== userId && !other.verifier;
                    }).map(function (other) {
                        return Store.forgetAccount(other.userId);
                    }));
                });
            })
            .then(function () {
                return Store.flushOutbox(userId, { copyTitle: copyTitle });
            })
            .then(function (push) {
                reportPush(push);
                var pushedSomething = push && push.events && push.events.some(function (event) {
                    return event.type !== 'error';
                });
                if (!pushedSomething) {
                    return data;
                }
                // Versions changed: read the manifest again, in full.
                return fetchManifest('').then(function (manifest) {
                    if (manifest.status === 200 && manifest.data && manifest.data.success) {
                        account.manifestEtag = manifest.etag || '';
                        return Store.putAccount(account).then(function () { return manifest.data; });
                    }
                    return data;
                });
            })
            .then(function (fresh) {
                if (!account.days) {
                    // Offline copies turned off for this account: forget them.
                    return Store.forgetAccount(userId);
                }
                return applyManifest(userId, fresh);
            })
            .then(function () {
                return account.days ? storeOfflinePage() : null;
            });
    }

    function applyManifest(userId, data) {
        var indexWrite = data
            ? Store.putIndex({
                userId: userId,
                notes: data.notes || [],
                folders: data.folders || [],
                workspaces: data.workspaces || [],
                days: Number(data.days) || 0,
                syncedAt: Date.now()
            })
            : Promise.resolve();

        return indexWrite.then(function () {
            return Promise.all([Store.getNotes(userId), data ? Promise.resolve(data.notes || []) : Store.getIndex(userId).then(function (index) {
                return (index && index.notes) || [];
            })]);
        }).then(function (both) {
            var local = both[0];
            var wanted = both[1].filter(function (note) { return note.offline; });
            var localById = {};
            local.forEach(function (record) { localById[record.id] = record; });
            var wantedIds = {};
            var toFetch = [];
            wanted.forEach(function (note) {
                wantedIds[note.id] = true;
                var record = localById[note.id];
                if (!record || record.version !== note.version || record.needsRefresh) {
                    toFetch.push(note.id);
                }
            });
            var toDrop = local.filter(function (record) { return !wantedIds[record.id]; }).map(function (record) { return record.id; });

            return downloadNotes(userId, toFetch)
                .then(function () {
                    return toDrop.length ? Store.deleteNotes(userId, toDrop) : null;
                })
                .then(function () {
                    return Store.getNotes(userId);
                })
                .then(function (records) {
                    return cacheMedia(userId, records);
                });
        });
    }

    function syncNow(force) {
        if (running) {
            return running;
        }
        if (!force && Date.now() - lastRunAt < MIN_GAP_MS) {
            return Promise.resolve();
        }
        lastRunAt = Date.now();
        running = Promise.resolve(Store.withLock('poznote-offline-sync', runSync))
            .catch(function (e) {
                console.debug('offline-sync: sync failed:', e);
            })
            .then(function () {
                running = null;
            });
        return running;
    }

    // ---- Connection banner ---------------------------------------------------

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

    function showMessage(text, transient) {
        ensureBanner();
        bannerEl.querySelector('.offline-banner > .lucide').className = transient
            ? 'lucide lucide-refresh-cw'
            : 'lucide lucide-wifi-off';
        bannerEl.querySelector('.offline-banner-text').textContent = text;
        bannerEl.querySelector('.offline-banner-open').hidden = !!transient;
        bannerEl.classList.toggle('is-transient', !!transient);
        bannerEl.hidden = false;
        if (transient) {
            clearTimeout(bannerEl._hideTimer);
            bannerEl._hideTimer = setTimeout(function () {
                if (bannerEl.classList.contains('is-transient')) {
                    bannerEl.hidden = true;
                }
            }, 8000);
        }
    }

    function ensureBanner() {
        if (bannerEl) {
            return;
        }
        bannerEl = document.createElement('div');
        bannerEl.className = 'offline-banner';
        bannerEl.setAttribute('role', 'status');
        bannerEl.hidden = true;

        var icon = document.createElement('i');
        icon.className = 'lucide lucide-wifi-off';
        icon.setAttribute('aria-hidden', 'true');

        var text = document.createElement('span');
        text.className = 'offline-banner-text';

        var open = document.createElement('button');
        open.type = 'button';
        open.className = 'btn btn-primary offline-banner-open';
        open.textContent = tr('offline.banner.open', {}, 'Open offline notes');
        open.addEventListener('click', openOfflinePage);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'offline-banner-close';
        close.setAttribute('aria-label', tr('common.close', {}, 'Close'));
        close.innerHTML = '<i class="lucide lucide-x" aria-hidden="true"></i>';
        close.addEventListener('click', function () {
            bannerEl.hidden = true;
        });

        bannerEl.appendChild(icon);
        bannerEl.appendChild(text);
        bannerEl.appendChild(open);
        bannerEl.appendChild(close);
        document.body.appendChild(bannerEl);
    }

    // The same URL as now (note included): with the server unreachable the
    // service worker answers it with the offline page, which opens that note.
    // If the network is in fact back, this is just a reload.
    function openOfflinePage() {
        var target = 'index.php';
        var noteId = window.noteid;
        var hasNote = noteId && noteId !== -1 && noteId !== 'search';
        if (hasNote) {
            target += '?note=' + encodeURIComponent(noteId);
            // Text typed since the last save goes into the note's draft, which
            // the offline page takes over (js/offline-app.js), so leaving does
            // not need the "unsaved changes" prompt.
            if (typeof window.hasUnsavedChangesOnScreen === 'function'
                && window.hasUnsavedChangesOnScreen(noteId)
                && typeof window.snapshotNoteStateForSave === 'function') {
                window.snapshotNoteStateForSave(noteId);
                window.__poznoteLeavingForOfflinePage = true;
            }
        }
        window.location.href = target;
    }

    function onConnectionLost() {
        if (bannerEl && !bannerEl.hidden && !bannerEl.classList.contains('is-transient')) {
            return;
        }
        var text = offlineDays === 0
            ? tr('offline.banner.offline_no_copies', {}, 'You are offline. Changes will be saved when the connection is back.')
            : tr('offline.banner.offline', {}, 'You are offline. Notes modified recently can still be opened and edited in offline mode.');
        showMessage(text, false);
        if (offlineDays === 0) {
            bannerEl.querySelector('.offline-banner-open').hidden = true;
        }
        if (!probeTimer) {
            probeTimer = setInterval(function () {
                probeServer().then(function (reachable) {
                    if (reachable) {
                        onConnectionBack();
                        syncNow(true);
                    }
                });
            }, PROBE_INTERVAL_MS);
        }
    }

    function onConnectionBack() {
        if (probeTimer) {
            clearInterval(probeTimer);
            probeTimer = null;
        }
        if (bannerEl && !bannerEl.hidden && !bannerEl.classList.contains('is-transient')) {
            bannerEl.hidden = true;
        }
    }

    // A dead Wi-Fi fires no "offline" event: the app's own requests failing
    // (live refresh polls every few seconds) is what tells. Any network
    // failure triggers one reachability check.
    var probeScheduled = null;
    function checkAfterFailure() {
        if (probeScheduled || probeTimer) {
            return;
        }
        probeScheduled = setTimeout(function () {
            probeServer().then(function (reachable) {
                probeScheduled = null;
                if (!reachable) {
                    onConnectionLost();
                }
            });
        }, 1000);
    }

    if (typeof window.fetch === 'function') {
        var nativeFetch = window.fetch;
        window.fetch = function () {
            var result = nativeFetch.apply(this, arguments);
            result.catch(function (error) {
                if (error && error.name === 'TypeError') {
                    checkAfterFailure();
                }
            });
            return result;
        };
    }
    if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
        var nativeSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
            this.addEventListener('error', checkAfterFailure);
            return nativeSend.apply(this, arguments);
        };
    }

    // ---- Wiring ----------------------------------------------------------------

    window.addEventListener('offline', function () {
        probeServer().then(function (reachable) {
            if (!reachable) {
                onConnectionLost();
            }
        });
    });

    window.addEventListener('online', function () {
        onConnectionBack();
        syncNow(true);
    });

    document.addEventListener('visibilitychange', function () {
        // Leaving the tab (or closing the laptop) is the last chance to take
        // the latest edits along before the network goes away.
        if (document.visibilityState === 'hidden' || Date.now() - lastRunAt > SYNC_INTERVAL_MS) {
            syncNow(false);
        }
    });

    setInterval(function () {
        if (document.visibilityState === 'visible') {
            syncNow(false);
        }
    }, SYNC_INTERVAL_MS);

    function start() {
        var begin = function () { syncNow(true); };
        var pageAccount = Number(readCookie('poznote_account') || 0);
        (pageAccount ? Store.getOutbox(pageAccount) : Promise.resolve([])).catch(function () {
            return [];
        }).then(function (pending) {
            // Changes made offline go out at once, before anything is typed
            // on top of the old version.
            if (pending.length) {
                begin();
                return;
            }
            // Otherwise after the page settled: this never competes with
            // opening the note.
            setTimeout(function () {
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(begin, { timeout: 5000 });
                } else {
                    begin();
                }
            }, 1500);
        });
    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

    window.poznoteOfflineSyncNow = function () {
        return syncNow(true);
    };
})();

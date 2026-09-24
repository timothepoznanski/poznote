/**
 * Offline copies, the online side (index.php).
 *
 * While the app is open and the network works, this keeps the browser's
 * offline copies (js/offline-store.js) up to date:
 *  - the note the app just saved (or created, renamed, moved, whose tasks
 *    changed): its copy is refreshed right after the save, so what was
 *    written last is always what opens offline;
 *  - on load and every few minutes: pushes what was changed on the offline
 *    page first (offline.php), then downloads the notes modified in the last
 *    days (GET api/v1/offline/...), only those whose version changed, and the
 *    pictures they show (changes made elsewhere: another device, the API);
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
    // Loaded by another page than index.php with data-offline-mode="writes"
    // (attachments.php): only the copy of the notes written there is
    // refreshed. The full sync, the connection banner and the capture of the
    // display belong to index.php.
    var WRITES_ONLY = !!(document.currentScript && document.currentScript.getAttribute('data-offline-mode') === 'writes');
    // Signed out on the offline page while the server could not be reached
    // (js/offline-app.js): the session left open ends now, before anything
    // is kept again. The mark goes first, so a failure cannot loop.
    var leaving = false;
    var signingOut = Store.getMeta('signedOut').then(function (signedOut) {
        if (!signedOut) {
            return false;
        }
        leaving = true;
        return Store.deleteMeta('signedOut').then(function () {
            window.location.replace('logout.php');
            return true;
        });
    }).catch(function (e) {
        console.debug('offline-sync: the sign-out mark could not be read:', e);
        return false;
    });
    // An account opened through a grant is not the user's to keep offline
    // (the API refuses it too).
    if (window.__poznoteBorrowedAccountId) {
        return;
    }

    var SYNC_INTERVAL_MS = 2 * 60 * 1000;
    var MIN_GAP_MS = 20 * 1000;
    var PROBE_INTERVAL_MS = 15 * 1000;
    var BATCH_SIZE = 50;
    // Pictures of the offline notes: limits sent by the server with the
    // manifest (POZNOTE_OFFLINE_* in functions.php), these values until then.
    // Never more than half the room the browser has left, whatever they say.
    // The notes' text has its own budget on the server (OfflineController).
    var MB = 1024 * 1024;
    var limits = { picture_mb: 25, pictures: 400, pictures_mb: 200 };
    // Body classes of index.php that describe a moment, not a preference.
    var TRANSIENT_BODY_CLASS = /^(note-open|mobile-|modal-|ui-custom-panel-open|note-creation|left-col-resizing|has-background-image|has-internal-tabs|outline-collapsed|sidebar-collapsed|icon-sidebar-collapsed|focus-mode|dragging|is-)/;
    var ATTACHMENT_URL = /\/?api\/v1\/notes\/(\d+)\/attachments\/([A-Za-z0-9_.-]+)/g;

    var running = null;
    var lastRunAt = 0;
    var syncStartedAt = 0;
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
            // Changes with the list of attachments, which the version ignores
            files: note.files || '',
            content: note.content || '',
            attachments: note.attachments || [],
            needsRefresh: false,
            cachedAt: Date.now()
        };
    }

    function isQuotaError(error) {
        return !!error && (error.name === 'QuotaExceededError' || /quota/i.test(String(error.message || '')));
    }

    // Most recent first: when the browser runs out of room, what is kept is
    // what was modified last.
    function downloadNotes(userId, ids) {
        var batches = [];
        for (var i = 0; i < ids.length; i += BATCH_SIZE) {
            batches.push(ids.slice(i, i + BATCH_SIZE));
        }
        var full = false;
        return batches.reduce(function (chain, batch) {
            return chain.then(function () {
                if (full) {
                    return null;
                }
                return fetchNotes(batch).then(function (notes) {
                    return Store.putNotes(notes.map(function (note) { return toRecord(userId, note); }));
                }).catch(function (e) {
                    if (isQuotaError(e)) {
                        full = true;
                        console.warn('offline-sync: the browser has no room left for more offline notes');
                        return null;
                    }
                    throw e;
                });
            });
        }, Promise.resolve());
    }

    // ---- Files of the offline notes ----------------------------------------

    // Why each note is kept (manifest "kept": note, folder, favorite or
    // recent), from the list stored with the copies.
    function keptReasons(index) {
        var reasons = {};
        ((index && index.notes) || []).forEach(function (meta) {
            reasons[Number(meta.id)] = meta.kept || 'recent';
        });
        return reasons;
    }

    // The files to keep: the pictures the notes show, and every attachment
    // of the notes kept whatever their date (a course PDF is what one wants
    // in class). Those notes first, then the most recently modified.
    // Returns the URLs in priority order and the set of URLs that may be
    // any type of file (the others must be pictures).
    function attachmentUrls(records, reasons) {
        var urls = [];
        var seen = {};
        var anyType = {};
        var add = function (url, any) {
            if (!seen[url]) {
                seen[url] = true;
                urls.push(url);
            }
            if (any) {
                anyType[url] = true;
            }
        };
        records.slice().sort(function (a, b) {
            var pinnedA = (reasons[a.id] || 'recent') !== 'recent';
            var pinnedB = (reasons[b.id] || 'recent') !== 'recent';
            if (pinnedA !== pinnedB) {
                return pinnedA ? -1 : 1;
            }
            return String(b.updated || '').localeCompare(String(a.updated || ''));
        }).forEach(function (record) {
            var pinned = (reasons[record.id] || 'recent') !== 'recent';
            var content = String(record.content || '');
            var match;
            ATTACHMENT_URL.lastIndex = 0;
            while ((match = ATTACHMENT_URL.exec(content)) !== null) {
                add(new URL('/api/v1/notes/' + match[1] + '/attachments/' + match[2], window.location.origin).href, false);
            }
            if (pinned) {
                (record.attachments || []).forEach(function (attachment) {
                    if (attachment && attachment.id) {
                        add(new URL('/api/v1/notes/' + record.id + '/attachments/' + attachment.id, window.location.origin).href, true);
                    }
                });
            }
        });
        return { urls: urls.slice(0, limits.pictures), anyType: anyType };
    }

    // Room for pictures: the fixed budget, or half of what the browser still
    // grants this site plus what the pictures already take, if that is less.
    function mediaBudget(currentBytes) {
        if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
            return Promise.resolve(limits.pictures_mb * MB);
        }
        return navigator.storage.estimate().then(function (estimate) {
            var free = Math.max(0, (estimate.quota || 0) - (estimate.usage || 0));
            return estimate.quota ? Math.min(limits.pictures_mb * MB, currentBytes + free / 2) : limits.pictures_mb * MB;
        }, function () {
            return limits.pictures_mb * MB;
        });
    }

    function useLimits(account) {
        var sent = account && account.limits;
        if (sent && sent.picture_mb && sent.pictures && sent.pictures_mb) {
            limits = { picture_mb: Number(sent.picture_mb), pictures: Number(sent.pictures), pictures_mb: Number(sent.pictures_mb) };
        }
    }

    function cachedSize(response) {
        return Number(response && response.headers.get('X-Offline-Size')) || 0;
    }

    function cacheMedia(userId, records) {
        if (!window.caches) {
            return Promise.resolve();
        }
        return Store.getIndex(userId).catch(function () { return null; }).then(function (index) {
            return cacheFiles(userId, records, keptReasons(index));
        });
    }

    function cacheFiles(userId, records, reasons) {
        var chosen = attachmentUrls(records, reasons);
        var wanted = chosen.urls;
        var anyType = chosen.anyType;
        var wantedSet = {};
        wanted.forEach(function (url) { wantedSet[url] = true; });

        return window.caches.open(Store.mediaCacheName(userId)).then(function (cache) {
            // Forget pictures no offline note shows any more, and measure the rest.
            return cache.keys().then(function (keys) {
                var have = {};
                return Promise.all(keys.map(function (request) {
                    if (!wantedSet[request.url]) {
                        return cache.delete(request);
                    }
                    return cache.match(request).then(function (response) {
                        have[request.url] = cachedSize(response);
                    });
                })).then(function () {
                    var current = Object.keys(have).reduce(function (sum, url) { return sum + have[url]; }, 0);
                    return mediaBudget(current);
                }).then(function (budget) {
                    var used = 0;
                    var full = false;
                    return wanted.reduce(function (chain, url) {
                        return chain.then(function () {
                            if (Object.prototype.hasOwnProperty.call(have, url)) {
                                // Kept while it fits, in priority order.
                                used += have[url];
                                return used > budget ? cache.delete(url) : null;
                            }
                            if (full || used >= budget) {
                                return null;
                            }
                            return fetch(url, { credentials: 'same-origin' }).then(function (response) {
                                var type = response.headers.get('Content-Type') || '';
                                var announced = Number(response.headers.get('Content-Length') || 0);
                                // Pictures only, unless the note is kept whatever
                                // its date; big files stay online either way.
                                if (!response.ok || (type.indexOf('image/') !== 0 && !anyType[url]) || announced > limits.picture_mb * MB) {
                                    return null;
                                }
                                return response.blob().then(function (blob) {
                                    if (blob.size > limits.picture_mb * MB || used + blob.size > budget) {
                                        return null;
                                    }
                                    used += blob.size;
                                    return cache.put(url, new Response(blob, {
                                        headers: { 'Content-Type': type, 'X-Offline-Size': String(blob.size) }
                                    }));
                                });
                            }).catch(function (e) {
                                if (isQuotaError(e)) {
                                    full = true;
                                }
                                return null;
                            });
                        });
                    }, Promise.resolve());
                });
            });
        }).catch(function (e) {
            console.debug('offline-sync: cacheMedia() failed:', e);
        });
    }

    // How the account displays notes (index.php body classes, markdown view
    // mode, sizes): the offline page applies the same.
    function captureDisplay() {
        var bodyClasses = Array.prototype.filter.call(document.body.classList, function (name) {
            return !TRANSIENT_BODY_CLASS.test(name);
        });
        var rootStyle = window.getComputedStyle(document.documentElement);
        var rootVars = {};
        ['--note-font-size', '--sidebar-font-size', '--note-max-width', '--left-col-width'].forEach(function (name) {
            var value = rootStyle.getPropertyValue(name).trim();
            if (value) {
                rootVars[name] = value;
            }
        });
        // The slash menu's preferences: its key, and the commands hidden
        // in UI Customization
        var slashTrigger = typeof window.getPoznoteInitialSetting === 'function' ? window.getPoznoteInitialSetting('slash_menu_trigger') : null;
        var hiddenMap = (window.PoznoteUiCustomization && window.PoznoteUiCustomization.hiddenKeyMap) || {};
        return {
            bodyClasses: bodyClasses,
            markdownDefaultMode: document.body.getAttribute('data-markdown-default-mode') || '',
            rootVars: rootVars,
            slashMenuTrigger: slashTrigger ? String(slashTrigger) : '',
            hiddenSlashCommands: Object.keys(hiddenMap).filter(function (key) {
                return key.indexOf('slash:') === 0 && hiddenMap[key];
            })
        };
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
        syncStartedAt = Date.now();
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
                account.limits = data.limits || account.limits || null;
                account.manifestEtag = manifest.etag || '';
                return handleManifest(account, data);
            });
    }

    function handleManifest(account, data) {
        var userId = Number(account.userId);
        useLimits(account);
        account.lastSyncAt = Date.now();
        account.language = currentLanguage();
        account.display = captureDisplay();
        // The offline page resumes the tabs open in this workspace (js/tabs.js)
        if (window.selectedWorkspace) {
            account.workspace = String(window.selectedWorkspace);
        }
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
            var wanted = both[1];
            var localById = {};
            local.forEach(function (record) { localById[record.id] = record; });
            var wantedIds = {};
            var toFetch = [];
            wanted.forEach(function (note) {
                wantedIds[note.id] = true;
                var record = localById[note.id];
                if (!record || record.version !== note.version || (record.files || '') !== (note.files || '') || record.needsRefresh) {
                    toFetch.push(note.id);
                }
            });
            // A copy refreshed by a save made while this sync ran is newer
            // than the list it compares against: it stays.
            var toDrop = local.filter(function (record) {
                return !wantedIds[record.id] && !(record.cachedAt > syncStartedAt);
            }).map(function (record) { return record.id; });

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
        if (leaving) {
            return Promise.resolve();
        }
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
        if (WRITES_ONLY || probeScheduled || probeTimer) {
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

    // ---- The copy follows every save ---------------------------------------------

    var refreshIds = {};
    var refreshTimer = null;
    var NOTE_WRITE_URL = /\/api\/v1\/notes\/(\d+)(\/[^?#]*)?$/;
    // Writes that leave the note as it was
    var NOT_A_NOTE_CHANGE = /^\/(lock|snapshot|beacon|task-reminder)/;

    function queueRefresh(noteId) {
        refreshIds[noteId] = true;
        clearTimeout(refreshTimer);
        // Coalesces the requests of one action (a save, its tag update...).
        refreshTimer = setTimeout(refreshQueued, 300);
    }

    // Re-read the notes just written and store their copy, as the full sync
    // would: a note saved now is a note modified in the last days.
    function refreshQueued() {
        var ids = Object.keys(refreshIds).map(Number);
        refreshIds = {};
        var userId = Number(readCookie('poznote_account') || 0);
        if (!ids.length || !userId) {
            return Promise.resolve();
        }
        return Store.getAccount(userId).then(function (account) {
            if (!account || !account.days) {
                return null;
            }
            useLimits(account);
            return fetchNotes(ids).then(function (notes) {
                var kept = notes.filter(function (note) {
                    return note.type === 'note' || note.type === 'markdown' || note.type === 'tasklist';
                });
                var keptIds = {};
                kept.forEach(function (note) { keptIds[note.id] = true; });
                var gone = ids.filter(function (id) { return !keptIds[id]; });
                return Store.putNotes(kept.map(function (note) { return toRecord(userId, note); }))
                    .then(function () {
                        return gone.length ? Store.deleteNotes(userId, gone) : null;
                    })
                    .then(function () {
                        return Store.getIndex(userId);
                    })
                    .then(function (index) {
                        index = index || { userId: userId, notes: [], folders: [], workspaces: [], days: account.days };
                        var byId = {};
                        kept.forEach(function (note) { byId[note.id] = note; });
                        var list = (index.notes || []).filter(function (meta) {
                            return !byId[meta.id] && gone.indexOf(Number(meta.id)) === -1;
                        });
                        var previous = {};
                        (index.notes || []).forEach(function (meta) { previous[Number(meta.id)] = meta; });
                        kept.forEach(function (note) {
                            list.unshift({
                                id: Number(note.id),
                                heading: note.heading,
                                type: note.type,
                                workspace: note.workspace,
                                folder_id: note.folder_id === undefined ? null : note.folder_id,
                                updated: note.updated,
                                version: note.version,
                                files: note.files || '',
                                // Why it is kept is only known from the next
                                // manifest: keep what the last one said.
                                kept: (previous[Number(note.id)] || {}).kept || 'recent'
                            });
                        });
                        index.notes = list;
                        return Store.putIndex(index);
                    })
                    .then(function () {
                        return kept.length ? Store.getNotes(userId).then(function (records) {
                            return cacheMedia(userId, records);
                        }) : null;
                    });
            });
        }).catch(function (e) {
            console.debug('offline-sync: refreshing the copy of a saved note failed:', e);
        });
    }

    function onNoteWrite(method, rawUrl, response) {
        var url;
        try {
            url = new URL(String(rawUrl || ''), window.location.href);
        } catch (e) {
            return;
        }
        // The push of offline changes updates the copies itself.
        if (url.origin !== window.location.origin || url.searchParams.get('offline_sync') === '1') {
            return;
        }
        var match = NOTE_WRITE_URL.exec(url.pathname);
        if (match) {
            if (!match[2] && method === 'DELETE') {
                // In the trash now: the next sync drops its copy.
                return;
            }
            if (!NOT_A_NOTE_CHANGE.test(match[2] || '')) {
                queueRefresh(Number(match[1]));
            }
            return;
        }
        // A note created in the app
        if (url.pathname.endsWith('/api/v1/notes') && method === 'POST') {
            response.clone().json().then(function (data) {
                if (data && data.note && data.note.id) {
                    queueRefresh(Number(data.note.id));
                }
            }).catch(function () {});
        }
    }

    if (typeof window.fetch === 'function') {
        var nativeFetch = window.fetch;
        window.fetch = function (input, init) {
            var result = nativeFetch.apply(this, arguments);
            var method = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
            var url = (input && typeof input === 'object' && input.url) || String(input);
            result.then(function (response) {
                if (method !== 'GET' && method !== 'HEAD' && response && response.ok) {
                    onNoteWrite(method, url, response);
                }
            }, function (error) {
                if (error && error.name === 'TypeError') {
                    checkAfterFailure();
                }
            });
            return result;
        };
    }
    // Same for XMLHttpRequest: the attachments page uploads with it (for the
    // progress bar), and a file added there must reach the copy at once.
    if (window.XMLHttpRequest && XMLHttpRequest.prototype) {
        var nativeOpen = XMLHttpRequest.prototype.open;
        var nativeSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__poznoteWrite = { method: String(method || 'GET').toUpperCase(), url: String(url || '') };
            return nativeOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            var xhr = this;
            xhr.addEventListener('error', checkAfterFailure);
            xhr.addEventListener('load', function () {
                var write = xhr.__poznoteWrite;
                if (!write || write.method === 'GET' || write.method === 'HEAD' || xhr.status < 200 || xhr.status >= 300) {
                    return;
                }
                onNoteWrite(write.method, xhr.responseURL || write.url, {
                    clone: function () {
                        return {
                            json: function () {
                                return Promise.resolve().then(function () { return JSON.parse(xhr.responseText); });
                            }
                        };
                    }
                });
            });
            return nativeSend.apply(this, arguments);
        };
    }

    if (WRITES_ONLY) {
        return;
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
        signingOut.then(function (leaving) {
            if (leaving) {
                return null;
            }
            return (pageAccount ? Store.getOutbox(pageAccount) : Promise.resolve([])).catch(function () {
                return [];
            }).then(startWith);
        });
        function startWith(pending) {
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
        }
    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

    window.poznoteOfflineSyncNow = function () {
        return syncNow(true);
    };

    // The note's three-dot menu (js/utils-menus.js) asks whether this browser
    // holds the note right now: the line is shown once the copies answer.
    window.poznoteOfflineFillMenu = function (menu, noteId) {
        var line = menu.querySelector('.offline-availability');
        var userId = Number(readCookie('poznote_account') || 0);
        var id = Number(noteId);
        if (!line || !userId || !id) {
            return;
        }
        Store.getNote(userId, id).then(function (record) {
            if (menu.getAttribute('data-note-id') !== String(noteId)) {
                return;
            }
            var available = !!record;
            line.classList.toggle('is-available', available);
            line.querySelectorAll('[data-available]').forEach(function (span) {
                span.hidden = (span.getAttribute('data-available') === '1') !== available;
            });
            line.hidden = false;
        }).catch(function () {
            line.hidden = true;
        });
    };
})();

// Browser notifications for reminders (#1571).
// A reminder that fires raises a system notification, on top of the bell of
// the sidebar. The permission is asked when a reminder is saved (a user
// gesture, as browsers require), and nothing happens without it or outside a
// secure context (HTTPS or localhost).
//
// Two ways to get there. Web Push when the browser and the instance can do
// it: the device subscribes, the reminder worker pushes, and the service
// worker (sw.js) shows the notification even with Poznote closed. Otherwise
// this page polls and shows it itself, which only works while it is open.
(function () {
    'use strict';

    var POLL_INTERVAL = 30000;
    var SEEN_KEY = 'reminder_notified_ids';
    var MAX_PER_POLL = 5;
    var PUSH_REGISTERED_KEY = 'reminder_push_registered';
    var PUSH_REGISTER_EVERY = 12 * 3600 * 1000;
    var PUSH_SETUP_TIMEOUT = 15000;

    // True once this device is subscribed and the server knows it: the
    // notifications then come from the service worker, not from this page
    var pushActive = false;
    var pushSetupRunning = null;

    function supported() {
        return 'Notification' in window && window.isSecureContext;
    }

    function granted() {
        return supported() && Notification.permission === 'granted';
    }

    // Ids already notified on this browser, null before the first poll
    function readSeen() {
        try {
            var store = window.__poznoteUserStorage || window.localStorage;
            var raw = store.getItem(SEEN_KEY);
            if (raw === null || raw === undefined) return null;
            var ids = JSON.parse(raw);
            return Array.isArray(ids) ? ids.map(String) : null;
        } catch (e) {
            return null;
        }
    }

    function writeSeen(ids) {
        try {
            var store = window.__poznoteUserStorage || window.localStorage;
            store.setItem(SEEN_KEY, JSON.stringify(ids));
        } catch (e) {
            console.debug('reminder-notifications: writeSeen() failed:', e);
        }
    }

    function storageGet(key) {
        try {
            return (window.__poznoteUserStorage || window.localStorage).getItem(key);
        } catch (e) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            (window.__poznoteUserStorage || window.localStorage).setItem(key, value);
        } catch (e) {
            console.debug('reminder-notifications: storageSet() failed:', e);
        }
    }

    function base64UrlToBytes(text) {
        var raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64Url(buffer) {
        var bytes = new Uint8Array(buffer);
        var raw = '';
        for (var i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
        return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function api(method, path, body) {
        var options = {
            method: method,
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        };
        if (body) options.body = JSON.stringify(body);
        return fetch('api/v1/' + path, options).then(function (response) {
            return response.ok ? response.json() : null;
        });
    }

    // Tell the server about this device, again every so often: it forgets a
    // device whose push service once answered that it was gone
    function registerSubscription(subscription) {
        var known = (storageGet(PUSH_REGISTERED_KEY) || '').split('|');
        if (known[0] === subscription.endpoint && Date.now() - Number(known[1]) < PUSH_REGISTER_EVERY) {
            return Promise.resolve(true);
        }
        return api('POST', 'users/me/push/subscriptions', subscription.toJSON()).then(function (data) {
            if (!data || !data.success) return false;
            storageSet(PUSH_REGISTERED_KEY, subscription.endpoint + '|' + Date.now());
            return true;
        });
    }

    // Subscribe this device to Web Push. Resolves to whether pushes are now
    // on their way; any failure leaves the page-driven notifications in place.
    function setupPush() {
        if (!granted() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            return Promise.resolve(false);
        }
        if (pushSetupRunning) return pushSetupRunning;

        pushSetupRunning = navigator.serviceWorker.getRegistration().then(function (registration) {
            if (!registration) return false;

            return api('GET', 'users/me/push').then(function (status) {
                if (!status || !status.available || !status.public_key) return false;

                return navigator.serviceWorker.ready.then(function (ready) {
                    return ready.pushManager.getSubscription().then(function (subscription) {
                        // A subscription made for another key (the instance
                        // was reinstalled) can no longer be pushed to
                        var key = subscription && subscription.options && subscription.options.applicationServerKey;
                        if (subscription && key && bytesToBase64Url(key) !== status.public_key) {
                            return subscription.unsubscribe().then(function () { return null; });
                        }
                        return subscription;
                    }).then(function (subscription) {
                        return subscription || ready.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: base64UrlToBytes(status.public_key)
                        });
                    }).then(registerSubscription);
                });
            });
        }).catch(function (e) {
            console.debug('reminder-notifications: setupPush() failed:', e);
            return false;
        }).then(function (active) {
            pushActive = !!active;
            pushSetupRunning = null;
            return pushActive;
        });

        return pushSetupRunning;
    }

    function noteUrl(noteId) {
        return new URL('index.php?note=' + encodeURIComponent(noteId), window.location.href).href;
    }

    function openReminder(reminder) {
        fetch('api/v1/reminders/' + encodeURIComponent(reminder.id) + '/read', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        }).catch(function (e) {
            console.debug('reminder-notifications: openReminder() failed:', e);
        });
        window.focus();
        if (reminder.note_id) window.location.href = noteUrl(reminder.note_id);
    }

    function show(reminder) {
        var heading = reminder.note_heading || '';
        var title = reminder.message || heading || 'Poznote';
        var options = {
            body: heading && heading !== title ? heading : '',
            // One tag per reminder: several open tabs show it once
            tag: 'poznote-reminder-' + reminder.id,
            icon: new URL('pwa/poznote-192.png', window.location.href).href,
            data: { id: reminder.id, url: reminder.note_id ? noteUrl(reminder.note_id) : '' }
        };

        try {
            var notification = new Notification(title, options);
            notification.onclick = function () {
                notification.close();
                openReminder(reminder);
            };
        } catch (e) {
            // Chrome on Android only accepts notifications from a service
            // worker, whose notificationclick handler opens data.url
            if (!navigator.serviceWorker) return;
            navigator.serviceWorker.getRegistration().then(function (registration) {
                if (registration) return registration.showNotification(title, options);
            }).catch(function (err) {
                console.debug('reminder-notifications: show() failed:', err);
            });
        }
    }

    // seedOnly records what has already fired without notifying it: the first
    // poll of a browser, or the moment the permission is granted, must not
    // replay the reminders still waiting behind the bell. The same goes for a
    // device on Web Push, which keeps the record current in case it has to
    // fall back to this page.
    function check(seedOnly) {
        if (!granted()) return;

        // No workspace filter: a reminder notifies whatever workspace is open
        fetch('api/v1/reminders', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (!data || !data.success) return;
            var fired = data.notifications || [];
            var seen = readSeen();

            if (!seedOnly && !pushActive && seen !== null) {
                fired.filter(function (reminder) {
                    return Number(reminder.is_read) !== 1 && seen.indexOf(String(reminder.id)) === -1;
                }).reverse().slice(-MAX_PER_POLL).forEach(show);
            }

            writeSeen(fired.map(function (reminder) { return String(reminder.id); }));
        })
        .catch(function (e) {
            console.debug('reminder-notifications: check() failed:', e);
        });
    }

    // Called from the save button of the reminder and due-date modals
    window.poznoteRequestReminderNotifications = function () {
        if (!supported() || Notification.permission !== 'default') return;

        var answered = false;
        var done = function (permission) {
            if (answered || permission !== 'granted') return;
            answered = true;
            check(true);
            setupPush();
        };
        try {
            // Older Safari only takes the callback form
            var result = Notification.requestPermission(done);
            if (result && typeof result.then === 'function') result.then(done).catch(function () {});
        } catch (e) {
            console.debug('reminder-notifications: requestPermission() failed:', e);
        }
    };

    if (!supported()) return;

    // The first poll waits for the answer: a device on Web Push must not
    // also be notified by this page. Not forever though: a subscription
    // that never settles (push service out of reach) leaves the page in charge.
    Promise.race([
        setupPush(),
        new Promise(function (resolve) { setTimeout(resolve, PUSH_SETUP_TIMEOUT); })
    ]).then(function () {
        check(false);
        setInterval(function () { check(false); }, POLL_INTERVAL);
    });
})();

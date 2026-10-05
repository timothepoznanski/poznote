// Browser notifications for reminders (#1571).
// While a Poznote page is open, a reminder that fires also raises a system
// notification, on top of the bell of the sidebar. The permission is asked
// when a reminder is saved (a user gesture, as browsers require), and nothing
// happens without it or outside a secure context (HTTPS or localhost).
(function () {
    'use strict';

    var POLL_INTERVAL = 30000;
    var SEEN_KEY = 'reminder_notified_ids';
    var MAX_PER_POLL = 5;

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
            data: { url: reminder.note_id ? noteUrl(reminder.note_id) : '' }
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
    // replay the reminders still waiting behind the bell.
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

            if (!seedOnly && seen !== null) {
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

        var done = function (permission) {
            if (permission === 'granted') check(true);
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

    check(false);
    setInterval(function () { check(false); }, POLL_INTERVAL);
})();

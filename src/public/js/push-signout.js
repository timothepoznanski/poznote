// Loaded by the sign-in page, where nobody is signed in on this device: a
// Web Push subscription left by the previous session is dropped, so the
// reminders of an account stop reaching a browser it signed out of. The
// server learns about it from the push service, and signing in again
// subscribes anew (js/reminder-notifications.js).
(function () {
    'use strict';

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.getRegistration().then(function (registration) {
        return registration && registration.pushManager ? registration.pushManager.getSubscription() : null;
    }).then(function (subscription) {
        if (subscription) return subscription.unsubscribe();
    }).catch(function (e) {
        console.debug('push-signout: unsubscribe failed:', e);
    });
})();

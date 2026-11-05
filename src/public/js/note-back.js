/**
 * Mobile: the device/browser Back button, pressed while a note is on screen,
 * slides back to the notes list, like the Home button of the note toolbar.
 *
 * Below 801px the list and the note are two screens side by side
 * (body.note-open = the note is the one showing). Back used to follow the
 * URL history instead: the previously opened note loaded out of sight, or the
 * app closed when the note was the first page of the visit.
 *
 * How it works, as in js/panel-back.js: when the note screen shows, an entry
 * of our own (state.poznoteNoteView) is pushed on the same URL, and Back pops
 * it. Leaving that entry slides to the list; the popstate listener is
 * registered while the bundle runs, ahead of events-navigation.js (registered
 * on DOMContentLoaded), and stops the event so the note is not reloaded.
 * Back from a note opened by a link inside another note still returns to that
 * note first (it lands on the entry of ours below), then to the list.
 *
 * Going back to the list another way (Home button, swipe) drops the entry, so
 * Back from the list keeps its usual meaning. An entry left behind anyway is
 * skipped over: popping it with the list showing goes one step further back.
 */
(function () {
    'use strict';

    var STATE_KEY = 'poznoteNoteView';

    function isMobile() {
        return window.innerWidth <= 800;
    }

    function isOurs(state) {
        return !!(state && typeof state === 'object' && state[STATE_KEY]);
    }

    function noteShowing() {
        return isMobile() && document.body && document.body.classList.contains('note-open');
    }

    // Whether the current history entry is ours. history.state cannot tell
    // which entry a popstate came FROM, so it is tracked: every push/replace
    // of the app goes through the wrappers below.
    var onOurEntry = isOurs(history.state);
    var poppingSelf = false;     // we asked for the history.back() in drop()
    var waitingForActivation = false;

    try {
        var nativePush = history.pushState;
        var nativeReplace = history.replaceState;
        history.pushState = function (state) {
            var result = nativePush.apply(history, arguments);
            onOurEntry = isOurs(state);
            return result;
        };
        history.replaceState = function (state) {
            var result = nativeReplace.apply(history, arguments);
            onOurEntry = isOurs(state);
            return result;
        };
    } catch (e) { /* not wrapped: the entry is still pushed, tracking is best effort */ }

    /** The note screen is showing: give Back something to pop. */
    function ensure() {
        if (!noteShowing() || isOurs(history.state) || poppingSelf) return;
        // Chrome skips, on Back, the entries a page added before the user
        // ever interacted with it (history manipulation intervention): a
        // note shown at page load waits for the first tap or key.
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
            waitForActivation();
            return;
        }
        var state = {};
        if (history.state && typeof history.state === 'object') {
            Object.keys(history.state).forEach(function (key) { state[key] = history.state[key]; });
        }
        state[STATE_KEY] = true;
        try {
            history.pushState(state, '', window.location.href);
        } catch (e) { /* no entry: Back keeps its usual meaning */ }
    }

    function waitForActivation() {
        if (waitingForActivation) return;
        waitingForActivation = true;
        function onActivation() {
            waitingForActivation = false;
            document.removeEventListener('click', onActivation, true);
            document.removeEventListener('keydown', onActivation, true);
            ensure();
        }
        document.addEventListener('click', onActivation, true);
        document.addEventListener('keydown', onActivation, true);
    }

    /** Back to the list from the UI: drop the entry pushed in ensure(). */
    function drop() {
        if (!isOurs(history.state) || poppingSelf) return;
        poppingSelf = true;
        try {
            history.back();
        } catch (e) {
            poppingSelf = false;
        }
    }

    window.addEventListener('popstate', function (e) {
        var leftOurs = onOurEntry;
        onOurEntry = isOurs(e.state);

        if (poppingSelf) {
            // Our entry, dropped by drop(): same URL below, nothing to load.
            poppingSelf = false;
            e.stopImmediatePropagation();
            // The note came back while the entry was going (a swipe that
            // crossed the middle twice): it needs one again.
            ensure();
            return;
        }

        // Only leaving our entry is ours to handle. Arriving on it (Back from
        // a note opened by a link) is a regular note navigation.
        if (!leftOurs || onOurEntry) return;

        // Same URL as the entry we left: the note on screen is already this
        // one, the navigation handlers must not reload it.
        e.stopImmediatePropagation();

        if (noteShowing()) {
            if (typeof window.scrollToLeftColumn === 'function') {
                window.scrollToLeftColumn();
            }
        } else {
            // A stray entry (list already showing): Back goes on to the
            // previous page, as if the entry had not been there.
            try { history.back(); } catch (err) { /* ignore */ }
        }
    });

    // .note-open is set and cleared by several paths (slide to the note, Home
    // button, swipe, failed load), so the entry follows the class itself.
    function observe() {
        var showing = noteShowing();
        new MutationObserver(function () {
            var now = noteShowing();
            if (now === showing) return;
            showing = now;
            if (now) ensure();
            else drop();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        if (showing) ensure();
    }

    if (document.body) {
        observe();
    } else {
        document.addEventListener('DOMContentLoaded', observe);
    }

    window.PoznoteNoteBack = { ensure: ensure };
})();

/**
 * Mobile: make the device/browser Back button close an open overlay panel
 * instead of leaving the page.
 *
 * The panels concerned (AI chat, "Customize this page") cover the whole
 * screen below the 801px breakpoint, so from the user's point of view they
 * are a screen of their own: Back should bring the notes back, not the
 * previous page.
 *
 * How it works: opening a panel on mobile pushes a history entry on the same
 * URL, and Back pops it. The popstate listener is registered while this file
 * is parsed, i.e. before every other one (they all register from
 * DOMContentLoaded), so it can stopImmediatePropagation() and keep
 * events-navigation.js from reloading the page on the entry we own.
 *
 * Panels register with { isOpen, close } and call opened()/closed() from
 * their own open/close path.
 */
(function () {
    'use strict';

    /** Same breakpoint as css/ai-chat.css: docked on desktop, overlay below. */
    function isMobile() {
        return !window.matchMedia('(min-width: 801px)').matches;
    }

    var panels = [];
    var pushed = false;          // a history entry of ours sits on top
    var poppingSelf = false;     // we asked for the history.back() below
    var closingFromBack = false; // ignore the closed() calls we cause ourselves

    function anyOpen() {
        return panels.some(function (p) {
            try { return p.isOpen(); } catch (e) { return false; }
        });
    }

    function closeAll() {
        closingFromBack = true;
        try {
            panels.forEach(function (p) {
                try { if (p.isOpen()) p.close(); } catch (e) { /* ignore */ }
            });
        } finally {
            closingFromBack = false;
        }
    }

    window.addEventListener('popstate', function (e) {
        if (poppingSelf) {
            // The entry was already dropped by closed(): swallow the event so
            // the navigation handlers don't reload the page under us.
            poppingSelf = false;
            pushed = false;
            e.stopImmediatePropagation();
            return;
        }
        if (!pushed) return;
        pushed = false;
        closeAll();
        e.stopImmediatePropagation();
    });

    window.PoznotePanelBack = {
        /** @param {{isOpen: function(): boolean, close: function()}} panel */
        register: function (panel) {
            if (panel && typeof panel.isOpen === 'function' && typeof panel.close === 'function') {
                panels.push(panel);
            }
        },

        /** A panel just opened: give Back something to pop. */
        opened: function () {
            if (pushed || !isMobile()) return;
            try {
                history.pushState({ poznotePanel: true }, '', window.location.href);
                pushed = true;
            } catch (err) { /* ignore */ }
        },

        /** A panel was closed from the UI: drop the entry we pushed for it. */
        closed: function () {
            if (closingFromBack || !pushed || anyOpen()) return;
            poppingSelf = true;
            try {
                history.back();
            } catch (err) {
                poppingSelf = false;
                pushed = false;
            }
        }
    };
})();

/**
 * Workspace menu behind the "(workspace)" suffix of the secondary pages' title
 * (poznoteRenderPageTitleWorkspace() in functions.php): the suffix is a button
 * whose chevron opens a menu listing every workspace as a plain link to this
 * same page, plus a shortcut to workspaces.php.
 *
 * The menu is rendered inside the <h1> and moved under <body> here, so that no
 * ancestor with overflow, transform or contain can clip it or re-anchor its
 * fixed positioning. It stays a list of links: clicking one navigates (a
 * modifier click opens a tab), and the chosen workspace is remembered as the
 * last opened one on the way out, as index.php does when it opens one.
 *
 * Loaded by icon_sidebar.php on every page carrying the rail; a no-op where
 * the title has no suffix.
 */
(function () {
    'use strict';

    var OPEN_CLASS = 'poznote-page-title-workspace-menu-open';
    var ITEM_SELECTOR = '.poznote-page-title-workspace-item';
    var MARGIN = 8;
    var GAP = 6;

    function init() {
        var button = document.getElementById('poznotePageTitleWorkspaceBtn');
        var menu = document.getElementById('poznotePageTitleWorkspaceMenu');
        if (!button || !menu) return;

        document.body.appendChild(menu);

        function isOpen() {
            return menu.classList.contains(OPEN_CLASS);
        }

        function items() {
            return Array.prototype.slice.call(menu.querySelectorAll(ITEM_SELECTOR));
        }

        // Under the button, left edges aligned, then pulled back inside the
        // viewport; above it when there is no room below.
        function position() {
            var anchor = button.getBoundingClientRect();

            // Measured while open but off-screen, so the clamping below has
            // real dimensions to work with.
            menu.style.top = '0px';
            menu.style.left = '-9999px';
            var box = menu.getBoundingClientRect();

            var left = anchor.left;
            if (left + box.width > window.innerWidth - MARGIN) {
                left = Math.max(MARGIN, window.innerWidth - box.width - MARGIN);
            }

            var top = anchor.bottom + GAP;
            if (top + box.height > window.innerHeight - MARGIN) {
                var above = anchor.top - GAP - box.height;
                top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - box.height - MARGIN);
            }

            menu.style.left = Math.round(left) + 'px';
            menu.style.top = Math.round(top) + 'px';
        }

        function open() {
            menu.classList.add(OPEN_CLASS);
            button.setAttribute('aria-expanded', 'true');
            position();

            var current = menu.querySelector('.poznote-page-title-workspace-item-current') || items()[0];
            if (current) current.focus();
        }

        function close(refocus) {
            if (!isOpen()) return;
            menu.classList.remove(OPEN_CLASS);
            button.setAttribute('aria-expanded', 'false');
            if (refocus) button.focus();
        }

        function moveFocus(key) {
            var list = items();
            if (!list.length) return;

            var index = list.indexOf(document.activeElement);
            var next;
            if (key === 'Home') {
                next = 0;
            } else if (key === 'End') {
                next = list.length - 1;
            } else if (key === 'ArrowDown') {
                next = index < 0 ? 0 : (index + 1) % list.length;
            } else {
                next = index < 0 ? list.length - 1 : (index - 1 + list.length) % list.length;
            }
            list[next].focus();
        }

        button.addEventListener('click', function (e) {
            e.preventDefault();
            if (isOpen()) {
                close(false);
            } else {
                open();
            }
        });

        document.addEventListener('click', function (e) {
            if (!isOpen()) return;
            if (menu.contains(e.target) || button.contains(e.target)) return;
            close(false);
        });

        document.addEventListener('keydown', function (e) {
            if (!isOpen()) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                close(true);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                moveFocus(e.key);
            } else if (e.key === 'Tab') {
                close(false);
            }
        });

        window.addEventListener('resize', function () {
            if (isOpen()) position();
        });
        // Capture: the page's scrolling container is not the window on most
        // of these pages. The menu's own scrollbar (long lists) is not a move.
        window.addEventListener('scroll', function (e) {
            if (isOpen() && e.target !== menu) position();
        }, true);

        // Remember the choice as the last opened workspace, as index.php does
        // when it opens one; keepalive lets the request outlive the navigation
        // the link is about to make. Best effort: the link works without it.
        menu.addEventListener('click', function (e) {
            var target = e.target;
            var item = target && target.closest ? target.closest(ITEM_SELECTOR) : null;
            if (!item) return;

            // Action entries (dashboard.php's scope modal) belong to the page's
            // own handler, bound on their data-action: the menu just gets out
            // of the way.
            if (item.tagName !== 'A') {
                close(false);
                return;
            }

            var name = item.getAttribute('data-workspace');
            if (!name) return;

            try {
                fetch('api/v1/settings/last_opened_workspace', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    keepalive: true,
                    body: JSON.stringify({ value: name })
                }).catch(function () { /* best effort */ });
            } catch (err) {
                /* best effort */
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

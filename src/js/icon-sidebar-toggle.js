/**
 * Collapse / expand the notes page icon rail, and reach the entries a short
 * viewport pushes out of sight.
 *
 * The collapse toggle mirrors the left column toggle in js/resize-column.js: a
 * body class drives the CSS, and the state is persisted in localStorage.
 *
 * The rail's navigation entries scroll (.icon-sidebar-scroll) but their
 * scrollbar is hidden, so on a short screen the last few icons are simply
 * invisible above the account group's divider. #iconSidebarOverflowBtn appears
 * in that case and opens a labelled menu of whatever is currently out of view.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'iconSidebarCollapsed';
    var COLLAPSED_CLASS = 'icon-sidebar-collapsed';
    var OVERFLOW_BTN_VISIBLE_CLASS = 'icon-sidebar-overflow-visible';
    var OVERFLOW_MENU_OPEN_CLASS = 'icon-sidebar-overflow-open';
    // An entry counts as visible only if this much of it is inside the scroll
    // viewport; a sliver peeking past the edge still reads as cut off.
    var VISIBLE_RATIO = 0.85;

    function readStoredState() {
        try {
            return localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }

    function persistState(collapsed) {
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? 'true' : 'false');
        } catch (error) {
            // Private browsing: the toggle still works for this page view.
        }
    }

    function syncButton(collapsed) {
        var button = document.getElementById('iconSidebarToggle');
        if (button) {
            button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
    }

    function applyState(collapsed) {
        document.body.classList.toggle(COLLAPSED_CLASS, collapsed);
        syncButton(collapsed);
    }

    // --- Overflow menu -----------------------------------------------------

    function getScrollArea() {
        var rail = document.getElementById('icon_sidebar');
        return rail ? rail.querySelector('.icon-sidebar-scroll') : null;
    }

    // Entries the UI Customization modal hides are display:none, so they have no
    // box at all and drop out here on their own.
    function getEntries(scrollArea) {
        return Array.prototype.filter.call(
            scrollArea.querySelectorAll('.icon-sidebar-btn'),
            function (entry) {
                return entry.offsetParent !== null || entry.getClientRects().length > 0;
            }
        );
    }

    function getHiddenEntries(scrollArea) {
        var viewport = scrollArea.getBoundingClientRect();

        return getEntries(scrollArea).filter(function (entry) {
            var box = entry.getBoundingClientRect();
            if (!box.height) return false;

            var shown = Math.min(box.bottom, viewport.bottom) - Math.max(box.top, viewport.top);
            return shown < box.height * VISIBLE_RATIO;
        });
    }

    function closeMenu() {
        var menu = document.getElementById('iconSidebarOverflowMenu');
        var button = document.getElementById('iconSidebarOverflowBtn');

        if (menu) menu.classList.remove(OVERFLOW_MENU_OPEN_CLASS);
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    function isMenuOpen() {
        var menu = document.getElementById('iconSidebarOverflowMenu');
        return !!menu && menu.classList.contains(OVERFLOW_MENU_OPEN_CLASS);
    }

    // The rail entries are icon-only, so the label comes from their title /
    // aria-label; the icon itself is cloned so the menu reads the same way.
    function buildMenuItem(entry) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'icon-sidebar-overflow-item';
        item.setAttribute('role', 'menuitem');

        if (entry.classList.contains('icon-sidebar-btn-active') ||
            entry.classList.contains('icon-sidebar-btn-active-favorite')) {
            item.classList.add('icon-sidebar-overflow-item-active');
        }

        var icon = entry.querySelector('.lucide');
        if (icon) {
            var clone = icon.cloneNode(false);
            clone.removeAttribute('id');
            item.appendChild(clone);
        }

        var label = document.createElement('span');
        label.textContent = entry.getAttribute('aria-label') || entry.getAttribute('title') || '';
        item.appendChild(label);

        item.addEventListener('click', function () {
            closeMenu();

            // Links navigate; the action buttons (notifications, git sync, ...)
            // keep their handlers on the original element, so replay the click
            // there rather than duplicating what each one does.
            var href = entry.getAttribute('href');
            if (entry.tagName === 'A' && href) {
                window.location.href = href;
            } else {
                entry.click();
            }
        });

        return item;
    }

    function positionMenu(menu, button) {
        var anchor = button.getBoundingClientRect();

        // Measured while open but off-screen, so the clamping below has real
        // dimensions to work with.
        menu.style.top = '0px';
        menu.style.left = '-9999px';

        var box = menu.getBoundingClientRect();
        var margin = 8;

        var left = anchor.right + 6;
        if (left + box.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - box.width - margin);
        }

        // Bottom-aligned with the button, then pulled back inside the viewport.
        var top = anchor.bottom - box.height;
        if (top + box.height > window.innerHeight - margin) {
            top = window.innerHeight - box.height - margin;
        }
        if (top < margin) {
            top = margin;
        }

        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(top) + 'px';
    }

    function openMenu() {
        var scrollArea = getScrollArea();
        var menu = document.getElementById('iconSidebarOverflowMenu');
        var button = document.getElementById('iconSidebarOverflowBtn');
        if (!scrollArea || !menu || !button) return;

        var hidden = getHiddenEntries(scrollArea);
        if (!hidden.length) {
            closeMenu();
            return;
        }

        menu.innerHTML = '';
        hidden.forEach(function (entry) {
            menu.appendChild(buildMenuItem(entry));
        });

        menu.classList.add(OVERFLOW_MENU_OPEN_CLASS);
        button.setAttribute('aria-expanded', 'true');
        positionMenu(menu, button);
    }

    function syncOverflowButton() {
        var scrollArea = getScrollArea();
        var button = document.getElementById('iconSidebarOverflowBtn');
        if (!scrollArea || !button) return;

        // Showing the button shrinks the scroll area, which can only make an
        // existing overflow worse, never create one where there was none, so
        // toggling off this measurement cannot oscillate. The MutationObserver
        // below sees the class change, hence the early return once settled.
        var wasVisible = button.classList.contains(OVERFLOW_BTN_VISIBLE_CLASS);
        var overflows = scrollArea.scrollHeight - scrollArea.clientHeight > 1;

        if (overflows !== wasVisible) {
            button.classList.toggle(OVERFLOW_BTN_VISIBLE_CLASS, overflows);
        }

        if (!overflows && isMenuOpen()) closeMenu();
    }

    function initOverflow() {
        var button = document.getElementById('iconSidebarOverflowBtn');
        var scrollArea = getScrollArea();
        if (!button || !scrollArea) return;

        button.addEventListener('click', function (event) {
            event.stopPropagation();
            if (isMenuOpen()) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Reopening rather than repositioning: what is out of view changes as
        // the entries scroll.
        scrollArea.addEventListener('scroll', function () {
            if (isMenuOpen()) openMenu();
        });

        document.addEventListener('click', function (event) {
            if (!isMenuOpen()) return;
            var menu = document.getElementById('iconSidebarOverflowMenu');
            if (menu && menu.contains(event.target)) return;
            if (button.contains(event.target)) return;
            closeMenu();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isMenuOpen()) {
                closeMenu();
                button.focus();
            }
        });

        window.addEventListener('resize', function () {
            closeMenu();
            syncOverflowButton();
        });

        // UI Customization hides entries after load (js/ui-customization.js),
        // and index.php appends its own extras, so re-measure on both.
        document.addEventListener('poznote-ui-customization-updated', syncOverflowButton);

        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(syncOverflowButton).observe(scrollArea);
        }
        if (typeof MutationObserver === 'function') {
            new MutationObserver(syncOverflowButton).observe(scrollArea, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }

        syncOverflowButton();
    }

    function init() {
        initOverflow();

        var button = document.getElementById('iconSidebarToggle');
        if (!button) return;

        applyState(readStoredState());

        button.addEventListener('click', function () {
            var collapsed = !document.body.classList.contains(COLLAPSED_CLASS);
            applyState(collapsed);
            persistState(collapsed);
            button.blur();
            closeMenu();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

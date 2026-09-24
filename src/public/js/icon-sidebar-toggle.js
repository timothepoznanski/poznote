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
 *
 * The group separators icon_sidebar.php draws between the entries are also
 * kept honest here: once UI Customization (or the git scope) has hidden every
 * entry on one side of a line, that line is hidden too.
 *
 * So is the Home link, outside index.php: it names what the stored note tabs
 * hold, so index.php does not render another note before switching to it.
 *
 * Focus mode (discussion #1482) lives here too, because the rail is the one
 * piece of chrome every page shares: html.focus-mode hides the rail (and, on
 * the notes page, the notes column and the rows around the note's title, see
 * css/focus-mode.css) and a hot zone on the left edge of the viewport slides
 * them back in as a flyout while the mouse is over it (html.focus-mode-peek).
 * The state is persisted, so it follows the user from page to page until
 * turned off: F11, the button of the floating stack
 * (ui_customization_panel.php) or window.PoznoteFocusMode.
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
            console.debug('icon-sidebar-toggle: persistState() failed:', error);
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

    // --- Workspace links ---------------------------------------------------

    /**
     * Re-point every rail link at another workspace.
     *
     * index.php switches workspace without reloading (js/workspaces-core.js pushes
     * the new one into the URL and re-fetches only #left_col), and the rail
     * lives outside that column, so the hrefs icon_sidebar.php rendered would
     * otherwise keep carrying the workspace that was selected when the page
     * loaded: clicking Tags right after a switch landed on the previous
     * workspace's tags, since an explicit ?workspace= wins over the
     * last-opened setting server-side.
     *
     * @param {string} workspaceName - The workspace now selected
     */
    function updateWorkspaceLinks(workspaceName) {
        var rail = document.getElementById('icon_sidebar');
        if (!rail) return;

        var workspace = (workspaceName === null || workspaceName === undefined)
            ? '' : String(workspaceName);

        Array.prototype.forEach.call(rail.querySelectorAll('a[href]'), function (link) {
            var href = link.getAttribute('href');
            // Leave anchors, absolute URLs and anything not page-relative alone.
            if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return;

            var url;
            try {
                url = new URL(href, window.location.href);
            } catch (error) {
                return;
            }

            // Logging out is workspace-agnostic.
            if (url.pathname.split('/').pop() === 'logout.php') return;

            // '__last_opened__' is a UI placeholder, not a workspace name.
            if (workspace === '' || workspace === '__last_opened__') {
                url.searchParams.delete('workspace');
            } else {
                url.searchParams.set('workspace', workspace);
            }

            link.setAttribute('href', url.pathname + url.search + url.hash);
        });

        // The git Push/Pull buttons only apply to workspaces included in the
        // Git sync scope. index.php's #poznote-config carries the synced list
        // (null = every workspace); the buttons are always in the DOM so a
        // client-side workspace switch just toggles them.
        var gitButtons = [
            document.getElementById('iconSidebarGitPushBtn'),
            document.getElementById('iconSidebarGitPullBtn')
        ].filter(Boolean);
        if (gitButtons.length) {
            var syncedWorkspaces = null;
            try {
                var configEl = document.getElementById('poznote-config');
                if (configEl) {
                    syncedWorkspaces = (JSON.parse(configEl.textContent) || {}).gitSyncedWorkspaces;
                }
            } catch (error) {
                syncedWorkspaces = null;
            }
            var visible = !Array.isArray(syncedWorkspaces)
                || workspace === '' || workspace === '__last_opened__'
                || syncedWorkspaces.indexOf(workspace) !== -1;
            gitButtons.forEach(function (button) { button.hidden = !visible; });
            syncDividers();
            syncOverflowButton();
        }
    }

    // --- Group separators --------------------------------------------------

    function isEntryShown(entry) {
        // Own display only: an entry hidden by its [hidden] attribute or by a
        // UI Customization rule (#id { display: none }) is out, whatever the
        // rail itself is doing (collapsed, mobile) at the time.
        return !entry.hidden && window.getComputedStyle(entry).display !== 'none';
    }

    /**
     * Hide the separators left with nothing visible on one side.
     *
     * icon_sidebar.php already drops the ones that would sit first, last or
     * back to back, but it cannot see which entries the UI Customization CSS
     * hides, nor the git buttons index.php toggles per workspace. Walk the
     * scroll area: a separator is shown only if a visible entry precedes it
     * since the last shown separator, and another follows it before the next.
     */
    function syncDividers() {
        var scrollArea = getScrollArea();
        if (!scrollArea) return;

        var shown = [];
        var pending = null;
        var entrySince = false;

        Array.prototype.forEach.call(scrollArea.children, function (child) {
            if (child.classList.contains('icon-sidebar-divider')) {
                // A visible entry since the last kept line makes this one a
                // candidate; it is kept once an entry shows up after it. With
                // none since, an earlier candidate is still waiting for its
                // entry and this one is redundant.
                if (entrySince) {
                    pending = child;
                    entrySince = false;
                }
                return;
            }
            if (!child.classList.contains('icon-sidebar-btn') || !isEntryShown(child)) return;
            if (pending) {
                shown.push(pending);
                pending = null;
            }
            entrySince = true;
        });

        Array.prototype.forEach.call(scrollArea.querySelectorAll('.icon-sidebar-divider'), function (divider) {
            var hide = shown.indexOf(divider) === -1;
            // Only touch what changes: the MutationObserver below watches
            // [hidden] and would otherwise loop on a no-op write.
            if (divider.hidden !== hide) divider.hidden = hide;
        });
    }

    // The overflow menu reads each entry's href when the copy is clicked, so
    // it picks the refreshed links up on its own.
    window.updateIconSidebarWorkspace = updateWorkspaceLinks;

    // --- Home link ---------------------------------------------------------

    // At this width and below index.php has no tabs and opens on the notes
    // list, where a note named in the URL would slide the note pane in
    // instead (js/tabs.js, js/index-events.js).
    var TABS_MAX_MOBILE_WIDTH = 800;

    /**
     * The tab state js/tabs.js stored for a workspace, or null when there is
     * none (a first visit) or it cannot be read.
     *
     * @param {string} workspace
     * @returns {?{tabs: Array, activeTabId: ?string}}
     */
    function readStoredTabs(workspace) {
        if (typeof window.__poznoteTabsStorageKey !== 'function') return null;

        try {
            var data = JSON.parse(localStorage.getItem(window.__poznoteTabsStorageKey(workspace)) || 'null');
            return data && Array.isArray(data.tabs) ? data : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Make the Home link ask index.php for what its tabs are about to show.
     *
     * Asked for nothing, index.php renders the last edited note and js/tabs.js
     * then replaces it with what the stored tabs hold, so coming back from
     * Settings flashed a note (issue #1488): one that vanished at once when
     * every tab was closed (see #1462), or that gave way to the active tab's
     * note. The link carries blank=1 while every tab is closed and, on
     * desktop, the active tab's note or board otherwise. A workspace that
     * never stored a tab state keeps the fallback, like any first visit.
     *
     * Not on index.php itself: js/tabs.js keeps the link in step there as
     * tabs open and close.
     */
    function syncHomeLink() {
        var link = document.getElementById('iconSidebarHomeBtn');
        if (!link || link.tagName !== 'A' || link.getAttribute('aria-current') === 'page') return;

        var url;
        try {
            url = new URL(link.getAttribute('href') || 'index.php', window.location.href);
        } catch (error) {
            return;
        }
        ['blank', 'note', 'kanban'].forEach(function (key) { url.searchParams.delete(key); });

        var stored = readStoredTabs(url.searchParams.get('workspace') || 'default');
        if (stored && stored.tabs.length === 0) {
            url.searchParams.set('blank', '1');
        } else if (stored && window.innerWidth > TABS_MAX_MOBILE_WIDTH) {
            var active = null;
            stored.tabs.forEach(function (tab) {
                if (!active && tab && tab.id === stored.activeTabId) active = tab;
            });
            active = active || stored.tabs[0];

            if (active && active.type === 'kanban' && active.folderId) {
                url.searchParams.set('kanban', String(active.folderId));
            } else if (active && active.noteId) {
                url.searchParams.set('note', String(active.noteId));
            }
        }

        link.setAttribute('href', url.pathname + url.search + url.hash);
    }

    function initHomeLink() {
        syncHomeLink();

        // A stale link would do worse than flash: naming a note whose tab was
        // closed meanwhile reopens it. Tabs change in another browser tab...
        window.addEventListener('storage', function (event) {
            if (event.key === null || event.key.indexOf('poznote_tabs_') === 0) syncHomeLink();
        });
        // ...or while this page sat in the back/forward cache, which gets no
        // storage events.
        window.addEventListener('pageshow', function (event) {
            if (event.persisted) syncHomeLink();
        });
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

        if (entry.classList.contains('icon-sidebar-btn-active')) {
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

        // Separators first: hiding one changes the scroll height the overflow
        // measurement reads.
        function syncLayout() {
            syncDividers();
            syncOverflowButton();
        }

        // UI Customization hides entries after load (js/ui-customization.js),
        // and index.php appends its own extras, so re-measure on both.
        document.addEventListener('poznote-ui-customization-updated', syncLayout);

        // Showing or hiding the button resizes the scroll area, and a resize
        // made from inside a ResizeObserver callback is what the browser
        // reports as "ResizeObserver loop completed with undelivered
        // notifications". Deferring the sync to the next frame keeps that
        // write out of the callback; the measurement itself is unchanged.
        var overflowSyncFrame = null;
        function scheduleOverflowSync() {
            if (overflowSyncFrame !== null) return;
            overflowSyncFrame = window.requestAnimationFrame(function () {
                overflowSyncFrame = null;
                syncOverflowButton();
            });
        }

        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(scheduleOverflowSync).observe(scrollArea);
        }
        if (typeof MutationObserver === 'function') {
            new MutationObserver(syncLayout).observe(scrollArea, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden']
            });
        }

        syncLayout();
    }

    // --- Focus mode ---------------------------------------------------------

    // On or off. On clears the rows around the note's title and sends the
    // rail and the notes column into the flyout; off brings everything back.
    var FOCUS_STORAGE_KEY = 'focusMode';
    var FOCUS_CLASS = 'focus-mode';
    var FOCUS_PEEK_CLASS = 'focus-mode-peek';
    var FOCUS_EDGE_ZONE_ID = 'focusModeEdgeZone';
    // A pause before the flyout opens, so brushing the edge on the way to the
    // first character of a line does not pull 400px of chrome over the note,
    // and a longer one before it closes, so a slip off its edge is forgiven.
    var FOCUS_PEEK_OPEN_DELAY = 120;
    var FOCUS_PEEK_CLOSE_DELAY = 300;

    var focusPeekTimer = null;

    // '1' is on. 'true' (the first version) and '2' (the second step of the
    // two-step cycle that followed) both meant focus mode was on, so they
    // still read as on.
    function isStoredOn(stored) {
        return stored === '1' || stored === '2' || stored === 'true';
    }

    function readFocusMode() {
        try {
            return isStoredOn(localStorage.getItem(FOCUS_STORAGE_KEY));
        } catch (error) {
            return false;
        }
    }

    function persistFocusMode(on) {
        try {
            localStorage.setItem(FOCUS_STORAGE_KEY, on ? '1' : '0');
        } catch (error) {
            console.debug('icon-sidebar-toggle: persistFocusMode() failed:', error);
        }
    }

    function isFocusMode() {
        return document.documentElement.classList.contains(FOCUS_CLASS);
    }

    function isFocusPeek() {
        return document.documentElement.classList.contains(FOCUS_PEEK_CLASS);
    }

    // The rail and, on the notes page, the notes column: what the flyout shows
    function focusFlyoutElements() {
        return [
            document.getElementById('icon_sidebar'),
            document.getElementById('left_col'),
            document.getElementById(FOCUS_EDGE_ZONE_ID)
        ].filter(Boolean);
    }

    function focusFlyoutContains(node) {
        return focusFlyoutElements().some(function (element) {
            return node && element.contains(node);
        });
    }

    function cancelFocusPeekTimer() {
        clearTimeout(focusPeekTimer);
        focusPeekTimer = null;
    }

    function setFocusPeek(open) {
        cancelFocusPeekTimer();
        if (open && !isFocusMode()) return;
        document.documentElement.classList.toggle(FOCUS_PEEK_CLASS, open);
    }

    function scheduleFocusPeek(open) {
        cancelFocusPeekTimer();
        focusPeekTimer = setTimeout(function () {
            focusPeekTimer = null;
            if (!open) {
                // Typing in the flyout (tree search, an inline rename) or
                // reading the rail's overflow menu, which hangs outside it:
                // the mouse has left but the user has not.
                if (focusFlyoutContains(document.activeElement) || isMenuOpen()) {
                    return;
                }
            }
            setFocusPeek(open);
        }, open ? FOCUS_PEEK_OPEN_DELAY : FOCUS_PEEK_CLOSE_DELAY);
    }

    function syncFocusButtons(on) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="toggle-focus-mode"]'), function (button) {
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function applyFocusMode(on) {
        document.documentElement.classList.toggle(FOCUS_CLASS, on);
        if (!on) {
            setFocusPeek(false);
        }
        syncFocusButtons(on);
        // The split view sizes its panes from what is left under the title
        // rows (js/markdown-editor.js), so it has to measure again.
        document.dispatchEvent(new CustomEvent('poznote:focus-mode', { detail: { enabled: on } }));
    }

    function setFocusMode(on) {
        on = !!on;
        if (on === isFocusMode()) return;
        applyFocusMode(on);
        persistFocusMode(on);
    }

    function toggleFocusMode() {
        setFocusMode(!isFocusMode());
    }

    // Strip along the left edge of the viewport that opens the flyout, with a
    // small handle in the middle of it so the flyout is something you see
    // rather than something you find by accident. Both are only shown by the
    // CSS while focus mode is on (css/icon-sidebar.css).
    function ensureFocusEdgeZone() {
        var zone = document.getElementById(FOCUS_EDGE_ZONE_ID);
        if (zone || !document.body) return;

        zone = document.createElement('div');
        zone.id = FOCUS_EDGE_ZONE_ID;
        zone.setAttribute('aria-hidden', 'true');

        var handle = document.createElement('span');
        handle.className = 'focus-mode-edge-handle';
        handle.innerHTML = '<i class="lucide lucide-chevron-right"></i>';
        zone.appendChild(handle);

        document.body.appendChild(zone);

        zone.addEventListener('mouseenter', function () {
            scheduleFocusPeek(true);
        });
        // A tap on a touch screen wide enough for the desktop layout
        zone.addEventListener('click', function () {
            setFocusPeek(!isFocusPeek());
        });
    }

    function initFocusMode() {
        // icon_sidebar.php sets the class before the first paint; the stored
        // value still wins here, for the pages that render the rail some other
        // way and for a page painted before the store was read.
        applyFocusMode(readFocusMode());
        ensureFocusEdgeZone();

        focusFlyoutElements().forEach(function (element) {
            element.addEventListener('mouseenter', function () {
                if (!isFocusPeek()) return;
                cancelFocusPeekTimer();
            });
            element.addEventListener('mouseleave', function () {
                if (!isFocusPeek()) return;
                scheduleFocusPeek(false);
            });
        });

        // A click anywhere else puts the flyout away at once
        document.addEventListener('mousedown', function (event) {
            if (isFocusPeek() && !focusFlyoutContains(event.target)) {
                setFocusPeek(false);
            }
        }, true);

        document.addEventListener('click', function (event) {
            var trigger = event.target.closest ? event.target.closest('[data-action="toggle-focus-mode"]') : null;
            if (!trigger) return;
            event.preventDefault();
            toggleFocusMode();
            trigger.blur();
        });

        document.addEventListener('keydown', function (event) {
            if (event.defaultPrevented || event.key !== 'F11') return;
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            event.preventDefault();
            toggleFocusMode();
        });

        // Another tab of the same account turning it on or off
        window.addEventListener('storage', function (event) {
            if (event.key !== FOCUS_STORAGE_KEY) return;
            applyFocusMode(isStoredOn(event.newValue));
        });
    }

    window.PoznoteFocusMode = {
        isEnabled: isFocusMode,
        set: setFocusMode,
        toggle: toggleFocusMode
    };

    function init() {
        initOverflow();
        initFocusMode();
        initHomeLink();

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

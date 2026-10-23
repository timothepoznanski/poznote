/**
 * Foldable boxes on the pages of the Settings frame (settings_shell.php
 * loads this at the end of every one): each box with a title of its own
 * (.git-sync-section or .settings-section with an h2, such as External tools
 * on the AI assistant page or General on the OIDC page) folds under its
 * title, like the sections of the Backup / Export page. The boxes start
 * folded; a click on the title opens or folds one, and the open ones are
 * remembered per user and page. A box named by the address
 * (#ai-saved-prompts) opens whatever was stored.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'settingsOpenBoxes';
    var store = window.__poznoteUserStorage || window.localStorage;
    var page = window.location.pathname.replace(/^.*\//, '');

    var saved = {};
    try {
        saved = JSON.parse(store.getItem(STORAGE_KEY) || '{}');
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    } catch (e) { /* storage unavailable or corrupt */ }
    var opened = Array.isArray(saved[page]) ? saved[page] : [];

    function persist() {
        if (opened.length) {
            saved[page] = opened;
        } else {
            delete saved[page];
        }
        try { store.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch (e) { /* storage unavailable */ }
    }

    var hashId = decodeURIComponent(window.location.hash.slice(1));
    var boxes = document.querySelectorAll('.settings-subpage-body .git-sync-section, .settings-subpage-body .settings-section');

    Array.prototype.forEach.call(boxes, function (box, index) {
        var title = box.querySelector(':scope > h2');
        if (!title) return;

        // Keyed by something that stays put when a box before it is left
        // out (the configuration box when personal keys are not allowed):
        // its id, else the class of its icon, else its position
        var icon = title.querySelector('.lucide');
        var iconClass = icon ? Array.prototype.find.call(icon.classList, function (c) { return c.indexOf('lucide-') === 0; }) : '';
        var key = box.id || iconClass || ('box-' + index);

        // Everything after the title becomes the foldable body
        var body = document.createElement('div');
        body.className = 'settings-box-body';
        body.id = (box.id || 'settings-box-' + index) + '-body';
        while (title.nextSibling) body.appendChild(title.nextSibling);
        box.appendChild(body);

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'settings-box-toggle';
        toggle.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
        toggle.setAttribute('aria-controls', body.id);
        title.appendChild(toggle);
        title.classList.add('settings-box-header');
        box.classList.add('settings-box');

        function apply(isCollapsed) {
            box.classList.toggle('settings-box-collapsed', isCollapsed);
            toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            // Open, the band above and beside the title folds it too: the
            // title's click area reaches the box's edges (css/settings.css),
            // which sit as far as the box's padding, a value of each page
            if (!isCollapsed) {
                var style = window.getComputedStyle(box);
                title.style.setProperty('--settings-box-pad-top', style.paddingTop);
                title.style.setProperty('--settings-box-pad-left', style.paddingLeft);
                title.style.setProperty('--settings-box-pad-right', style.paddingRight);
            }
        }
        apply(opened.indexOf(key) === -1 && !(box.id && box.id === hashId));

        // Folded, the whole box is the bar that opens it; open, its title
        // band folds it (a click in the fields below must not). The button's click
        // bubbles up here, and links and controls the title may hold keep
        // their own behaviour.
        box.addEventListener('click', function (e) {
            var wasCollapsed = box.classList.contains('settings-box-collapsed');
            if (!wasCollapsed && !title.contains(e.target)) return;
            if (e.target.closest('a, input, select, textarea, button:not(.settings-box-toggle)')) return;
            var isCollapsed = !wasCollapsed;
            apply(isCollapsed);
            var at = opened.indexOf(key);
            if (!isCollapsed && at === -1) opened.push(key);
            if (isCollapsed && at !== -1) opened.splice(at, 1);
            persist();
        });
    });
})();

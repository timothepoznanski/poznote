/**
 * Right-click menu of the line under the note title.
 *
 * A right-click on the line of the opened note (dates, characters, words,
 * lines, information icon: note_display.php, css/notes/subline.css) opens a
 * small menu (#noteSublineMenu) with one entry per item of that line, ticked
 * when it is shown. A click shows or hides the item at once and leaves the
 * menu open, so several can be changed in a row.
 *
 * Each item is a key of the 'hidden_ui_elements' user setting, the one the
 * Element visibility list edits (js/ui-customization-panel.js), so both stay
 * in step. The keys the administrator hides for everyone show greyed out.
 * The last item shown cannot be hidden from here: with nothing left on the
 * line, there would be nothing left to right-click to bring it back.
 */
(function () {
    'use strict';

    var MENU_ID = 'noteSublineMenu';
    var HIDDEN_UI_URL = '/api/v1/settings/hidden_ui_elements';
    var TARGET_SELECTOR = '.innernote .note-title-heading .note-subline';
    // In the order of the line, labels shared with the Element visibility list
    // (modals/ui_customization_sections.php).
    var ENTRIES = [
        { key: 'panel:note-created-date', label: 'display.cards.show_note_created', fallback: 'Show creation date' },
        { key: 'panel:note-updated-date', label: 'modals.ui_customization.note_updated_date', fallback: 'Show modification date' },
        { key: 'panel:note-stats-characters', label: 'modals.ui_customization.note_stats_characters', fallback: 'Show character count' },
        { key: 'panel:note-stats-words', label: 'modals.ui_customization.note_stats_words', fallback: 'Show word count' },
        { key: 'panel:note-stats-lines', label: 'modals.ui_customization.note_stats_lines', fallback: 'Show line count' },
        { key: 'panel:note-info-icon', label: 'modals.ui_customization.note_info_icon', fallback: 'Show information icon under the note title' }
    ];

    var menuEl = null;
    // The element the menu was opened on, focused again when it closes.
    var menuOwner = null;
    // The user's own hidden set: what the runtime holds until the saved one
    // has been read (on each open), then that one.
    var userHidden = [];
    var loaded = null;
    // Saves run one after the other, each with the set as it then stands.
    var saving = Promise.resolve();

    function t(key, fallback) {
        return window.t ? window.t(key, null, fallback) : fallback;
    }

    function runtime() {
        return window.PoznoteUiCustomization || null;
    }

    function normalizeKeys(keys) {
        var rt = runtime();
        if (!Array.isArray(keys)) return [];
        return rt && typeof rt.normalizeKeys === 'function' ? rt.normalizeKeys(keys) : keys.slice();
    }

    function lockedKeys() {
        return normalizeKeys(window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__);
    }

    function isShown(key) {
        return userHidden.indexOf(key) === -1 && lockedKeys().indexOf(key) === -1;
    }

    function notifyError() {
        var message = t('display.alerts.error_saving_preference', 'Error saving preference');
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    function applyLive() {
        var rt = runtime();
        if (rt && typeof rt.apply === 'function') rt.apply(userHidden);
    }

    // Read fresh on each open, so a change made in another tab or in the
    // settings page is not written back over.
    function loadUserHidden() {
        return fetch(HIDDEN_UI_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error('load failed');
                var parsed = [];
                try {
                    parsed = JSON.parse(result.value || '[]');
                } catch (e) {
                    console.debug('note-subline-menu: unreadable hidden_ui_elements:', e);
                }
                userHidden = normalizeKeys(parsed);
                refreshMenuState();
            });
    }

    function save() {
        var hidden = userHidden.slice();
        saving = saving
            .then(function () {
                return fetch(HIDDEN_UI_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ value: JSON.stringify(hidden) })
                });
            })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error((result && result.error) || 'save failed');
                // The Element visibility panel adopts the set, or its next
                // change would write the old one back.
                try {
                    document.dispatchEvent(new CustomEvent('poznote-hidden-ui-elements-saved', {
                        detail: { hidden: hidden.slice() }
                    }));
                } catch (e) {
                    console.debug('note-subline-menu: event dispatch failed:', e);
                }
            })
            .catch(function (error) {
                console.debug('note-subline-menu: save() failed:', error);
                notifyError();
                // Back to what the server holds.
                return loadUserHidden().then(applyLive).catch(function () {});
            });
    }

    // Shown at once, saved behind.
    function toggle(key) {
        if (!loaded || lockedKeys().indexOf(key) !== -1) return;
        loaded.then(function () {
            var index = userHidden.indexOf(key);
            if (index === -1) {
                if (lastShown(key)) return;
                userHidden.push(key);
            } else {
                userHidden.splice(index, 1);
            }
            applyLive();
            refreshMenuState();
            save();
        });
    }

    function lastShown(key) {
        return isShown(key) && ENTRIES.every(function (entry) {
            return entry.key === key || !isShown(entry.key);
        });
    }

    // ------------------------------------------------------------------
    // Menu
    // ------------------------------------------------------------------

    function menuItems() {
        return menuEl ? Array.prototype.slice.call(menuEl.querySelectorAll('.note-subline-menu-item')) : [];
    }

    function closeMenu(restoreFocus) {
        if (!menuEl || menuEl.hidden) return;
        menuEl.hidden = true;
        var owner = menuOwner;
        menuOwner = null;
        if (restoreFocus && owner && typeof owner.focus === 'function') owner.focus();
    }

    function refreshMenuState() {
        if (!menuEl || menuEl.hidden) return;
        var locked = lockedKeys();
        var lockedTitle = t('modals.ui_customization.locked_by_admin', 'Hidden for all users by the administrator');
        menuItems().forEach(function (item) {
            var key = item.getAttribute('data-ui-key');
            var isLocked = locked.indexOf(key) !== -1;
            var on = isShown(key);
            item.setAttribute('aria-checked', on ? 'true' : 'false');
            item.classList.toggle('is-checked', on);
            item.disabled = isLocked || lastShown(key);
            if (isLocked) {
                item.title = lockedTitle;
            } else {
                item.removeAttribute('title');
            }
        });
    }

    function buildMenu() {
        var menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', t('note_subline_menu.label', 'Under the title'));
        menu.hidden = true;

        var label = document.createElement('div');
        label.className = 'note-subline-menu-label';
        label.textContent = t('note_subline_menu.label', 'Under the title');
        menu.appendChild(label);

        ENTRIES.forEach(function (entry) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'note-subline-menu-item';
            item.setAttribute('role', 'menuitemcheckbox');
            item.setAttribute('data-ui-key', entry.key);
            var check = document.createElement('i');
            check.className = 'lucide lucide-check';
            check.setAttribute('aria-hidden', 'true');
            item.appendChild(check);
            item.appendChild(document.createTextNode(t(entry.label, entry.fallback)));
            item.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                toggle(entry.key);
            });
            menu.appendChild(item);
        });

        // Keep the caret in the note where it is.
        menu.addEventListener('mousedown', function (event) { event.preventDefault(); });
        menu.addEventListener('contextmenu', function (event) { event.preventDefault(); });
        menu.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeMenu(true);
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Tab') {
                var items = menuItems().filter(function (item) { return !item.disabled; });
                if (!items.length) return;
                event.preventDefault();
                var index = items.indexOf(document.activeElement);
                var back = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey);
                var next = back ? index - 1 : index + 1;
                items[(next + items.length) % items.length].focus();
            }
        });

        document.body.appendChild(menu);
        return menu;
    }

    function openMenu(event, owner) {
        if (!menuEl) menuEl = buildMenu();
        closeMenu(false);

        menuOwner = owner;
        var rt = runtime();
        var locked = lockedKeys();
        userHidden = rt && Array.isArray(rt.hiddenKeys) ? rt.hiddenKeys.filter(function (key) {
            return locked.indexOf(key) === -1;
        }) : [];
        loaded = loadUserHidden().catch(function (error) {
            console.debug('note-subline-menu: load failed:', error);
        });

        menuEl.hidden = false;
        refreshMenuState();

        // A keyboard context menu (Shift+F10, menu key) reports no pointer
        // position: open under the line instead.
        var fromKeyboard = event.clientX === 0 && event.clientY === 0;
        var x = event.clientX;
        var y = event.clientY;
        if (fromKeyboard) {
            var ownerRect = owner.getBoundingClientRect();
            x = ownerRect.left;
            y = ownerRect.bottom;
        }

        var padding = 8;
        var rect = menuEl.getBoundingClientRect();
        var left = x + rect.width > window.innerWidth - padding ? x - rect.width : x;
        var top = y + rect.height > window.innerHeight - padding ? y - rect.height : y;
        menuEl.style.left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding)) + 'px';
        menuEl.style.top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding)) + 'px';

        if (fromKeyboard) {
            var first = menuItems().filter(function (item) { return !item.disabled; })[0];
            if (first) first.focus();
        }
    }

    // Capture phase, like the title menu (js/note-title-menu.js).
    document.addEventListener('contextmenu', function (event) {
        if (event.shiftKey) return;
        var line = event.target.closest && event.target.closest(TARGET_SELECTOR);
        if (!line) return;
        event.preventDefault();
        openMenu(event, event.target.closest('button') || line);
    }, true);

    document.addEventListener('mousedown', function (event) {
        if (menuEl && !menuEl.hidden && !menuEl.contains(event.target)) closeMenu(false);
    }, true);
    document.addEventListener('scroll', function (event) {
        if (menuEl && !menuEl.hidden && !menuEl.contains(event.target)) closeMenu(false);
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && menuEl && !menuEl.hidden && !menuEl.contains(event.target)) {
            event.stopPropagation();
            closeMenu(true);
        }
    }, true);
    window.addEventListener('resize', function () { closeMenu(false); });
    window.addEventListener('blur', function () { closeMenu(false); });
})();

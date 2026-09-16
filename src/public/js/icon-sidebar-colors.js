/**
 * Icon rail colours, and the icon colour modal they share with the note toolbar.
 *
 * Drives #iconSidebarColorModal, rendered by icon_sidebar.php next to the rail:
 * the folder colour palette (modals/icon_color_options.php) without the icon
 * grid. A right-click on a rail button opens a small menu (change the colour,
 * or hide the button); its colour entry opens the modal, which saves the pick
 * straight away. The Icon Sidebar Order modal (js/settings-page.js) opens it with an
 * onApply callback instead and saves along with the order. The note toolbar
 * (js/toolbar-icon-colors.js) opens it through window.PoznoteIconColorModal.
 *
 * The colours are the 'icon_sidebar_colors' user setting, a button id =>
 * #rrggbb map (poznoteGetIconSidebarColors()). A coloured icon carries the
 * icon-sidebar-icon-colored class and the --icon-sidebar-icon-color property,
 * the same markup poznoteRenderIconSidebarIcon() emits; css/icon-sidebar.css
 * paints it.
 */
(function () {
    'use strict';

    var COLORED_CLASS = 'icon-sidebar-icon-colored';
    var COLOR_PROPERTY = '--icon-sidebar-icon-color';
    var MODAL_ID = 'iconSidebarColorModal';

    var config = window.PoznoteIconSidebarColorsConfig || {};
    var colors = normalizeColors(config.colors);
    // { id, onApply } while the modal is open.
    var current = null;
    var selectedColor = '';

    function normalizeColors(value) {
        var clean = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
        Object.keys(value).forEach(function (id) {
            if (typeof value[id] === 'string' && /^#[0-9a-f]{6}$/i.test(value[id])) {
                clean[id] = value[id].toLowerCase();
            }
        });
        return clean;
    }

    function copyColors() {
        var copy = {};
        Object.keys(colors).forEach(function (id) {
            copy[id] = colors[id];
        });
        return copy;
    }

    function paintIcon(icon, color) {
        if (!icon) return;
        if (color) {
            icon.classList.add(COLORED_CLASS);
            icon.style.setProperty(COLOR_PROPERTY, window.poznoteIconColorCss ? window.poznoteIconColorCss(color) : color);
        } else {
            icon.classList.remove(COLORED_CLASS);
            icon.style.removeProperty(COLOR_PROPERTY);
            if (!icon.getAttribute('style')) icon.removeAttribute('style');
        }
    }

    // The lucide-* class naming the glyph, whatever else the icon carries.
    function iconClassOf(icon) {
        if (!icon) return '';
        for (var i = 0; i < icon.classList.length; i++) {
            if (icon.classList[i].indexOf('lucide-') === 0) return icon.classList[i];
        }
        return '';
    }

    function getModal() {
        return document.getElementById(MODAL_ID);
    }

    function selectSwatch(color) {
        var modal = getModal();
        if (!modal) return;
        selectedColor = color || '';
        // A colour saved from the old 21-swatch palette selects the swatch
        // that now stands for it (js/color-palette.js).
        var swatchColor = window.PoznoteColorPalette ? window.PoznoteColorPalette.canonicalIconColor(selectedColor) : selectedColor;
        modal.querySelectorAll('.folder-color-option').forEach(function (option) {
            var optionColor = (option.getAttribute('data-color') || '').toLowerCase();
            option.classList.toggle('selected', optionColor === swatchColor);
        });
        paintIcon(modal.querySelector('[data-icon-sidebar-color-preview]'), selectedColor);
    }

    // Shows the modal. current.id is the rail button to save when there is
    // no onApply; a caller with its own onApply passes no id.
    function show(id, color, icon, label, onApply) {
        var modal = getModal();
        if (!modal) return false;

        var preview = modal.querySelector('[data-icon-sidebar-color-preview]');
        if (preview) preview.className = 'lucide ' + (icon || 'lucide-circle');
        var title = modal.querySelector('[data-icon-sidebar-color-label]');
        if (title) title.textContent = label || '';

        current = { id: id, onApply: onApply };
        selectSwatch(color || '');

        modal.style.display = 'flex';
        var applyBtn = modal.querySelector('[data-icon-sidebar-color-apply]');
        if (applyBtn) applyBtn.focus();
        return true;
    }

    /**
     * Open the modal for one rail button.
     * options.color    colour to preselect (defaults to the saved one)
     * options.icon     lucide-* class of the preview (defaults to the button's)
     * options.label    name shown in the title (defaults to the button's)
     * options.onApply  called with the picked colour ('' for none) instead of
     *                  saving it
     */
    function open(id, options) {
        if (!id) return;
        options = options || {};

        var button = document.getElementById(id);
        var buttonIcon = button ? button.querySelector('.lucide') : null;
        show(
            id,
            Object.prototype.hasOwnProperty.call(options, 'color') ? options.color : (colors[id] || ''),
            options.icon || iconClassOf(buttonIcon),
            options.label || (button ? (button.getAttribute('aria-label') || button.getAttribute('title') || '') : ''),
            typeof options.onApply === 'function' ? options.onApply : null
        );
    }

    function close() {
        var modal = getModal();
        if (modal) modal.style.display = 'none';
        current = null;
    }

    // The overflow menu clones the rail's icons each time it opens, so the
    // rail button is the only copy to update.
    function paintButton(id, color) {
        var button = document.getElementById(id);
        if (button) paintIcon(button.querySelector('.lucide'), color);
    }

    function save(id, color) {
        var next = copyColors();
        if (color) {
            next[id] = color;
        } else {
            delete next[id];
        }

        var applyBtn = getModal() && getModal().querySelector('[data-icon-sidebar-color-apply]');
        if (applyBtn) applyBtn.disabled = true;

        fetch('/api/v1/settings/icon_sidebar_colors', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: JSON.stringify(next) })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error('save failed');
                var saved = next;
                try {
                    saved = normalizeColors(JSON.parse(result.value || '{}'));
                } catch (e) {
                    console.debug('icon-sidebar-colors: unreadable saved value:', e);
                }
                colors = saved;
                paintButton(id, colors[id] || '');
                close();
            })
            .catch(function (error) {
                console.debug('icon-sidebar-colors: save() failed:', error);
                alert(config.errorSaving || 'Error saving preference');
            })
            .then(function () {
                if (applyBtn) applyBtn.disabled = false;
            });
    }

    function apply() {
        if (!current) return;
        if (current.onApply) {
            var onApply = current.onApply;
            close();
            onApply(selectedColor);
            return;
        }
        save(current.id, selectedColor);
    }

    function init() {
        var modal = getModal();
        if (!modal) return;

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (event) {
            pressedOnBackdrop = (event.target === modal);
        });
        modal.addEventListener('click', function (event) {
            var backdropClick = (event.target === modal && pressedOnBackdrop);
            pressedOnBackdrop = false;
            if (backdropClick || event.target.closest('[data-icon-sidebar-color-cancel]')) {
                close();
                return;
            }
            if (event.target.closest('[data-icon-sidebar-color-apply]')) {
                apply();
                return;
            }
            var option = event.target.closest('.folder-color-option');
            if (option) selectSwatch((option.getAttribute('data-color') || '').toLowerCase());
        });

        // Capture phase, so the Escape that closes this modal does not also
        // reach the handlers of a modal open beneath it.
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && menuEl && !menuEl.hidden) {
                event.stopPropagation();
                closeContextMenu(true);
                return;
            }
            if (event.key !== 'Escape' || !current) return;
            event.stopPropagation();
            close();
        }, true);

        // Every button of the rail, account group included; the overflow
        // button lists entries rather than being one.
        document.addEventListener('contextmenu', function (event) {
            var button = event.target.closest && event.target.closest('#icon_sidebar .icon-sidebar-btn[id]');
            if (!button || button.id === 'iconSidebarOverflowBtn') return;
            event.preventDefault();
            var nonHideable = Array.isArray(config.nonHideable) ? config.nonHideable : [];
            openContextMenu(event, button, {
                hideKey: nonHideable.indexOf(button.id) === -1 ? 'card:' + button.id : '',
                onColor: function () { open(button.id); }
            });
        });

        document.addEventListener('mousedown', function (event) {
            if (menuEl && !menuEl.hidden && !menuEl.contains(event.target)) closeContextMenu(false);
        }, true);
        document.addEventListener('scroll', function (event) {
            if (menuEl && !menuEl.hidden && !menuEl.contains(event.target)) closeContextMenu(false);
        }, true);
        window.addEventListener('resize', function () { closeContextMenu(false); });
        window.addEventListener('blur', function () { closeContextMenu(false); });
    }

    // ------------------------------------------------------------------
    // Right-click menu of an icon button: change its colour, or hide it.
    // Shared with the note toolbar (js/toolbar-icon-colors.js). Hiding adds
    // the button's key to the 'hidden_ui_elements' user setting, the one the
    // UI Customization list edits, so the button shows unchecked there and
    // comes back from it.
    // ------------------------------------------------------------------

    var HIDDEN_UI_URL = '/api/v1/settings/hidden_ui_elements';
    var menuEl = null;
    // The button the menu was opened on, focused again when it closes.
    var menuOwner = null;

    function closeContextMenu(restoreFocus) {
        if (!menuEl || menuEl.hidden) return;
        menuEl.hidden = true;
        menuEl.textContent = '';
        if (restoreFocus && menuOwner && typeof menuOwner.focus === 'function') menuOwner.focus();
        menuOwner = null;
    }

    function menuItems() {
        return menuEl ? Array.prototype.slice.call(menuEl.querySelectorAll('.icon-context-menu-item')) : [];
    }

    function getMenu() {
        if (menuEl) return menuEl;
        menuEl = document.createElement('div');
        menuEl.id = 'iconContextMenu';
        menuEl.setAttribute('role', 'menu');
        menuEl.hidden = true;
        // Keep the note's caret and selection where they are.
        menuEl.addEventListener('mousedown', function (event) { event.preventDefault(); });
        menuEl.addEventListener('contextmenu', function (event) { event.preventDefault(); });
        menuEl.addEventListener('keydown', function (event) {
            // Escape is handled by the capture listener in init().
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                var items = menuItems();
                if (!items.length) return;
                event.preventDefault();
                var index = items.indexOf(document.activeElement);
                var next = event.key === 'ArrowDown' ? index + 1 : index - 1;
                items[(next + items.length) % items.length].focus();
            } else if (event.key === 'Tab') {
                closeContextMenu(false);
            }
        });
        document.body.appendChild(menuEl);
        return menuEl;
    }

    function addMenuItem(menu, icon, label, run) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'icon-context-menu-item';
        item.setAttribute('role', 'menuitem');
        var i = document.createElement('i');
        i.className = 'lucide ' + icon;
        i.setAttribute('aria-hidden', 'true');
        item.appendChild(i);
        item.appendChild(document.createTextNode(label));
        item.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeContextMenu(false);
            run();
        });
        menu.appendChild(item);
    }

    // Adds key to the user's own hidden set, read fresh so a change made in
    // another tab or in the settings page is not overwritten.
    function hideUiKey(key, element) {
        var hidden = [];
        fetch(HIDDEN_UI_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error('load failed');
                try {
                    var parsed = JSON.parse(result.value || '[]');
                    if (Array.isArray(parsed)) hidden = parsed;
                } catch (e) {
                    console.debug('icon-sidebar-colors: unreadable hidden_ui_elements:', e);
                }
                if (hidden.indexOf(key) === -1) hidden.push(key);
                return fetch(HIDDEN_UI_URL, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ value: JSON.stringify(hidden) })
                });
            })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error('save failed');
                var runtime = window.PoznoteUiCustomization;
                if (runtime && typeof runtime.apply === 'function') {
                    runtime.apply(hidden);
                } else if (element) {
                    // Pages without the UI Customization runtime (admin pages).
                    element.style.display = 'none';
                }
                try {
                    document.dispatchEvent(new CustomEvent('poznote-hidden-ui-elements-saved', {
                        detail: { hidden: hidden.slice() }
                    }));
                } catch (e) {
                    console.debug('icon-sidebar-colors: event dispatch failed:', e);
                }
            })
            .catch(function (error) {
                console.debug('icon-sidebar-colors: hideUiKey() failed:', error);
                alert(config.errorSaving || 'Error saving preference');
            });
    }

    /**
     * Show the menu for a right-clicked button.
     * options.onColor  opens the colour modal
     * options.hideKey  UI Customization key that hides the button, '' when
     *                  the button cannot be hidden (the entry is left out)
     */
    function openContextMenu(event, owner, options) {
        var menu = getMenu();
        closeContextMenu(false);
        options = options || {};

        if (typeof options.onColor === 'function') {
            addMenuItem(menu, 'lucide-palette', config.menuChangeColor || 'Change icon color', options.onColor);
        }
        if (options.hideKey) {
            addMenuItem(menu, 'lucide-eye-off', config.menuHide || 'Hide button', function () {
                hideUiKey(options.hideKey, owner);
            });
        }
        if (!menu.firstChild) return;

        menuOwner = owner || null;
        menu.hidden = false;

        // A keyboard context menu (Shift+F10, menu key) reports no pointer
        // position: open under the button instead.
        var fromKeyboard = !event || (event.clientX === 0 && event.clientY === 0);
        var x = event ? event.clientX : 0;
        var y = event ? event.clientY : 0;
        if (fromKeyboard && owner) {
            var ownerRect = owner.getBoundingClientRect();
            x = ownerRect.left;
            y = ownerRect.bottom;
        }

        var padding = 8;
        var rect = menu.getBoundingClientRect();
        var left = x + rect.width > window.innerWidth - padding ? x - rect.width : x;
        var top = y + rect.height > window.innerHeight - padding ? y - rect.height : y;
        menu.style.left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding)) + 'px';
        menu.style.top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding)) + 'px';

        if (fromKeyboard) menuItems()[0].focus();
    }

    // Any other icon: the caller stores the colour itself.
    // options: { color, icon, label, onApply(color) }, onApply required.
    window.PoznoteIconColorModal = {
        open: function (options) {
            if (!options || typeof options.onApply !== 'function') return false;
            return show(null, options.color, options.icon, options.label, options.onApply);
        },
        iconClassOf: iconClassOf
    };

    // Right-click menu for any other icon button.
    // openContextMenu(event, button, { onColor(), hideKey })
    window.PoznoteIconContextMenu = {
        open: openContextMenu,
        close: function () { closeContextMenu(false); }
    };

    window.PoznoteIconSidebarColors = {
        open: open,
        getColor: function (id) { return colors[id] || ''; },
        getColors: copyColors,
        paintIcon: paintIcon,
        iconClassOf: iconClassOf
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

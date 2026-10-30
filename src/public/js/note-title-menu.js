/**
 * Right-click menu of the note title.
 *
 * A right-click on the title of the opened note, or on its icon, opens a
 * small menu (#noteTitleMenu): the colour of the title text (the palette of
 * js/color-palette.js), its size, a link to the note icon picker
 * (js/folder-icon.js), and a reset that brings all three back to the default.
 * Shift + right click keeps the browser's menu, for copy and paste in the
 * field. Touch screens keep theirs too: a long press selects the text, and a
 * tap on the icon already opens the picker.
 *
 * The colour and the size are stored on the note (entries.title_color,
 * entries.title_size) through PUT /api/v1/notes/{id}/title-style, and each
 * pick is saved straight away. note_display.php renders them the way
 * applyStyle() does: the colour inline and !important on the field
 * (theme-init.js forces the title colour in dark mode), the size as
 * --note-title-size on the heading, which css/notes/editor.css and
 * css/notes/subline.css read for the title and its icon.
 */
(function () {
    'use strict';

    var MENU_ID = 'noteTitleMenu';
    var HEADING_SELECTOR = '.innernote .note-title-heading';
    var TARGET_SELECTOR = HEADING_SELECTOR + ' .css-title, ' + HEADING_SELECTOR + ' .note-title-icon';
    var HEX_PATTERN = /^#[0-9a-f]{6}$/i;
    // null is the default size, 24px (css/notes/editor.css).
    var SIZES = [
        { key: 'small', size: 20, sample: 12 },
        { key: 'normal', size: null, sample: 14 },
        { key: 'large', size: 30, sample: 17 },
        { key: 'xlarge', size: 36, sample: 20 }
    ];

    var menuEl = null;
    // { noteId, heading, owner } while the menu is open.
    var current = null;

    function t(key, fallback) {
        return window.t ? window.t(key, null, fallback) : fallback;
    }

    function notifyError() {
        var message = t('display.alerts.error_saving_preference', 'Error saving preference');
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, 'error');
        } else {
            alert(message);
        }
    }

    // The heading of a note, looked up again on each use: the note is
    // re-rendered when it is reopened, so a saved reference can be stale.
    function headingOf(noteId) {
        var input = document.getElementById('inp' + noteId);
        return input ? input.closest('.note-title-heading') : null;
    }

    function readStyle(heading) {
        var color = (heading.getAttribute('data-title-color') || '').toLowerCase();
        var size = parseInt(heading.getAttribute('data-title-size') || '', 10);
        return {
            color: HEX_PATTERN.test(color) ? color : '',
            size: isNaN(size) ? null : size
        };
    }

    function applyStyle(heading, style) {
        if (!heading) return;
        var input = heading.querySelector('.css-title');

        if (style.color) {
            heading.setAttribute('data-title-color', style.color);
            if (input) input.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(style.color) : style.color, 'important');
        } else {
            heading.removeAttribute('data-title-color');
            if (input) {
                input.style.removeProperty('color');
                if (!input.getAttribute('style')) input.removeAttribute('style');
            }
        }

        if (style.size) {
            heading.setAttribute('data-title-size', String(style.size));
            heading.style.setProperty('--note-title-size', style.size + 'px');
        } else {
            heading.removeAttribute('data-title-size');
            heading.style.removeProperty('--note-title-size');
            if (!heading.getAttribute('style')) heading.removeAttribute('style');
        }
    }

    function putTitleStyle(noteId, body) {
        return fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/title-style', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error((result && result.error) || 'save failed');
                return {
                    color: result.title_color || '',
                    size: result.title_size || null
                };
            });
    }

    // Shown at once, put back when the server refuses it.
    function save(noteId, changes) {
        var heading = headingOf(noteId);
        if (!heading) return;
        var before = readStyle(heading);
        var next = {
            color: Object.prototype.hasOwnProperty.call(changes, 'title_color') ? (changes.title_color || '') : before.color,
            size: Object.prototype.hasOwnProperty.call(changes, 'title_size') ? changes.title_size : before.size
        };
        applyStyle(heading, next);
        refreshMenuState();

        putTitleStyle(noteId, changes)
            .then(function (saved) {
                applyStyle(headingOf(noteId), saved);
                refreshMenuState();
            })
            .catch(function (error) {
                console.debug('note-title-menu: save() failed:', error);
                applyStyle(headingOf(noteId), before);
                refreshMenuState();
                notifyError();
            });
    }

    function resetAll(noteId) {
        var heading = headingOf(noteId);
        if (!heading) return;
        var before = readStyle(heading);
        applyStyle(heading, { color: '', size: null });

        putTitleStyle(noteId, { title_color: null, title_size: null })
            .catch(function (error) {
                console.debug('note-title-menu: resetAll() failed:', error);
                applyStyle(headingOf(noteId), before);
                notifyError();
            });

        // Same request as the Default button of the icon picker.
        fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/icon', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ icon: '', icon_color: '' })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (!result || !result.success) throw new Error((result && result.error) || 'reset failed');
                if (typeof window.updateNoteIconInUI === 'function') window.updateNoteIconInUI(noteId, '', '');
            })
            .catch(function (error) {
                console.debug('note-title-menu: icon reset failed:', error);
                notifyError();
            });
    }

    function openIconPicker(noteId) {
        var heading = headingOf(noteId);
        if (!heading || typeof window.showChangeNoteIconModal !== 'function') return;
        var icon = heading.querySelector('.note-title-icon');
        var input = heading.querySelector('.css-title');
        var title = (icon && icon.getAttribute('data-note-title')) || (input ? (input.value || input.placeholder || '') : '');
        if (input && document.activeElement === input) input.blur();
        window.showChangeNoteIconModal(noteId, title);
    }

    // ------------------------------------------------------------------
    // Menu
    // ------------------------------------------------------------------

    function focusables() {
        return menuEl ? Array.prototype.slice.call(menuEl.querySelectorAll('button')) : [];
    }

    function closeMenu(restoreFocus) {
        if (!menuEl || menuEl.hidden) return;
        menuEl.hidden = true;
        var owner = current && current.owner;
        current = null;
        if (restoreFocus && owner && typeof owner.focus === 'function') owner.focus();
    }

    function refreshMenuState() {
        if (!menuEl || menuEl.hidden || !current) return;
        var heading = headingOf(current.noteId);
        if (!heading) return;
        var style = readStyle(heading);
        var swatchColor = window.PoznoteColorPalette ? window.PoznoteColorPalette.canonicalIconColor(style.color) : style.color;

        menuEl.querySelectorAll('.note-title-menu-swatch').forEach(function (swatch) {
            var on = (swatch.getAttribute('data-color') || '') === swatchColor;
            swatch.classList.toggle('is-selected', on);
            swatch.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        menuEl.querySelectorAll('.note-title-menu-size').forEach(function (button) {
            var raw = button.getAttribute('data-size');
            var on = (raw === '' ? null : parseInt(raw, 10)) === style.size;
            button.classList.toggle('is-selected', on);
            button.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function addSectionLabel(menu, text) {
        var label = document.createElement('div');
        label.className = 'note-title-menu-label';
        label.textContent = text;
        menu.appendChild(label);
    }

    function addItem(menu, icon, label, run) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'note-title-menu-item';
        var i = document.createElement('i');
        i.className = 'lucide ' + icon;
        i.setAttribute('aria-hidden', 'true');
        item.appendChild(i);
        item.appendChild(document.createTextNode(label));
        item.addEventListener('click', function () {
            var noteId = current && current.noteId;
            closeMenu(false);
            if (noteId) run(noteId);
        });
        menu.appendChild(item);
    }

    function buildMenu() {
        var menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-label', t('note_title_menu.label', 'Title style'));
        menu.hidden = true;

        addSectionLabel(menu, t('note_title_menu.color', 'Title color'));
        var swatches = document.createElement('div');
        swatches.className = 'note-title-menu-swatches';
        var palette = window.PoznoteColorPalette ? window.PoznoteColorPalette.colors : [];
        [{ id: 'default', hex: '' }].concat(palette).forEach(function (entry) {
            var swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'note-title-menu-swatch' + (entry.hex ? '' : ' is-default');
            swatch.setAttribute('data-color', entry.hex);
            var name = t('colors.' + entry.id, entry.id.charAt(0).toUpperCase() + entry.id.slice(1));
            swatch.title = name;
            swatch.setAttribute('aria-label', name);
            if (entry.hex) swatch.style.backgroundColor = window.poznoteIconColorCss ? window.poznoteIconColorCss(entry.hex) : entry.hex;
            swatch.addEventListener('click', function () {
                if (current) save(current.noteId, { title_color: entry.hex || null });
            });
            swatches.appendChild(swatch);
        });
        menu.appendChild(swatches);

        addSectionLabel(menu, t('note_title_menu.size', 'Title size'));
        var sizes = document.createElement('div');
        sizes.className = 'note-title-menu-sizes';
        SIZES.forEach(function (entry) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'note-title-menu-size';
            button.setAttribute('data-size', entry.size === null ? '' : String(entry.size));
            var name = t('note_title_menu.sizes.' + entry.key, entry.key);
            button.title = name;
            button.setAttribute('aria-label', name);
            var sample = document.createElement('span');
            sample.textContent = 'A';
            sample.style.fontSize = entry.sample + 'px';
            sample.setAttribute('aria-hidden', 'true');
            button.appendChild(sample);
            button.addEventListener('click', function () {
                if (current) save(current.noteId, { title_size: entry.size });
            });
            sizes.appendChild(button);
        });
        menu.appendChild(sizes);

        var separator = document.createElement('div');
        separator.className = 'note-title-menu-separator';
        menu.appendChild(separator);

        addItem(menu, 'lucide-smile', t('note_title_menu.change_icon', 'Change icon'), openIconPicker);
        addItem(menu, 'lucide-rotate-ccw', t('note_title_menu.reset', 'Reset to default'), resetAll);

        // Keep the caret in the title where it is.
        menu.addEventListener('mousedown', function (event) { event.preventDefault(); });
        menu.addEventListener('contextmenu', function (event) { event.preventDefault(); });
        menu.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeMenu(true);
            } else if (event.key === 'Tab') {
                // Tabbing cycles inside the menu rather than leaving it open
                // behind the focus.
                var items = focusables();
                if (!items.length) return;
                var index = items.indexOf(document.activeElement);
                var next = event.shiftKey ? index - 1 : index + 1;
                event.preventDefault();
                items[(next + items.length) % items.length].focus();
            }
        });

        document.body.appendChild(menu);
        return menu;
    }

    function openMenu(event, owner, noteId) {
        if (!menuEl) menuEl = buildMenu();
        closeMenu(false);

        current = { noteId: noteId, owner: owner };
        menuEl.hidden = false;
        refreshMenuState();

        // A keyboard context menu (Shift+F10, menu key) reports no pointer
        // position: open under the title instead.
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
            var selected = menuEl.querySelector('.note-title-menu-swatch.is-selected') || focusables()[0];
            if (selected) selected.focus();
        }
    }

    // Capture phase, so the editor's own right-click menu (js/slash-command.js)
    // sees the event handled.
    document.addEventListener('contextmenu', function (event) {
        if (event.shiftKey) return;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
        var target = event.target.closest && event.target.closest(TARGET_SELECTOR);
        if (!target) return;
        var heading = target.closest('.note-title-heading');
        var input = heading && heading.querySelector('.css-title');
        var noteId = input && input.id ? input.id.replace(/^inp/, '') : '';
        if (!/^\d+$/.test(noteId)) return;

        event.preventDefault();
        openMenu(event, input, noteId);
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

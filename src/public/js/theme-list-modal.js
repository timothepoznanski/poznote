/**
 * Theme list modal: what the rail's theme button offers, and in which order.
 *
 * Rendered by icon_sidebar.php for admins only, next to the rail, so the last
 * entry of the theme button's menu (js/theme-manager.js) opens it on the page
 * it is on rather than on settings.php. The Theme list card and the Custom CSS
 * modal of settings.php open it too, through window.poznoteOpenThemeListModal.
 *
 * Half the pages carrying the rail never load the i18n runtime, so the strings
 * come from the modal's data-strings, resolved server-side.
 */
(function () {
    'use strict';

    var modal = null;
    var strings = {};
    var apiUrl = 'api_upload_css.php';

    // What api_upload_css.php answered last
    var builtinThemes = [];
    var customThemeIcon = 'lucide-palette';
    var storedFiles = [];
    var savedEntries = [];
    var savedJson = '';
    // The rows work on their own order: the order of the rows IS the order
    // the button lists, so a row keeps its place whether it is ticked or not.
    var rows = [];

    function str(key, fallback) {
        return Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : fallback;
    }

    function themeName(id) {
        return str('theme.names.' + id, id.charAt(0).toUpperCase() + id.slice(1));
    }

    function findSaved(id) {
        for (var i = 0; i < savedEntries.length; i++) {
            if (savedEntries[i].id === id) return savedEntries[i];
        }
        return null;
    }

    function readState(data) {
        builtinThemes = Array.isArray(data.builtin_themes) ? data.builtin_themes : [];
        customThemeIcon = data.custom_theme_icon || 'lucide-palette';
        storedFiles = (Array.isArray(data.themes) ? data.themes : []).map(function (theme) { return theme.filename; });
        var list = data.theme_list && Array.isArray(data.theme_list.entries) ? data.theme_list.entries : [];
        savedEntries = list.map(function (entry) {
            return { id: entry.id, mode: entry.mode === 'dark' ? 'dark' : 'light' };
        });
        savedJson = JSON.stringify(entriesOf(buildRows()));
    }

    /**
     * One row per theme this instance has: what the admin kept first, in the
     * order it was saved, then everything left over. Rebuilding it this way is
     * what makes a reordering survive a reopen, and what puts a freshly
     * uploaded stylesheet at the end rather than in the middle.
     */
    function buildRows() {
        var known = {};
        var result = [];

        var push = function (id) {
            if (known[id]) return;
            var file = id.indexOf('custom:') === 0 ? id.slice('custom:'.length) : '';
            var builtin = null;
            for (var i = 0; i < builtinThemes.length; i++) {
                if (builtinThemes[i].id === id) { builtin = builtinThemes[i]; break; }
            }
            if (!file && !builtin) return;
            known[id] = true;
            var saved = findSaved(id);
            result.push({
                id: id,
                custom: !!file,
                icon: builtin ? builtin.icon : customThemeIcon,
                label: builtin ? themeName(id) : file.replace(/\.css$/i, ''),
                checked: !!saved,
                mode: saved && saved.mode === 'dark' ? 'dark' : 'light'
            });
        };

        savedEntries.forEach(function (entry) { push(entry.id); });
        builtinThemes.forEach(function (def) { push(def.id); });
        storedFiles.forEach(function (filename) { push('custom:' + filename); });

        return result;
    }

    /** What gets saved: the ticked rows, in the order they are shown. */
    function entriesOf(list) {
        var entries = [];
        list.forEach(function (row) {
            if (!row.checked) return;
            var entry = { id: row.id };
            if (row.custom) entry.mode = row.mode;
            entries.push(entry);
        });
        return entries;
    }

    function moveRow(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= rows.length) return;
        var row = rows[index];
        rows[index] = rows[target];
        rows[target] = row;
        render();
    }

    function buildRowElement(row, index) {
        var el = document.createElement('div');
        el.className = 'custom-css-theme-choice';
        el.setAttribute('data-theme-id', row.id);
        if (row.checked) el.classList.add('selected');

        var main = document.createElement('label');
        main.className = 'custom-css-theme-choice-main';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = row.checked;
        checkbox.addEventListener('change', function () {
            row.checked = checkbox.checked;
            el.classList.toggle('selected', row.checked);
        });
        main.appendChild(checkbox);

        var icon = document.createElement('i');
        icon.className = 'lucide ' + row.icon;
        main.appendChild(icon);

        var name = document.createElement('span');
        name.className = 'custom-css-theme-choice-name';
        name.textContent = row.label;
        main.appendChild(name);
        el.appendChild(main);

        if (row.custom) {
            // A stylesheet paints over one of the two modes, and which one it
            // was written for cannot be read from the file: the admin says it.
            var select = document.createElement('select');
            select.className = 'custom-css-theme-choice-mode';
            select.title = str('modals.theme_list.mode_help', 'Is this stylesheet written for the light mode or the dark mode?');
            [['light', themeName('light')], ['dark', themeName('dark')]].forEach(function (pair) {
                var option = document.createElement('option');
                option.value = pair[0];
                option.textContent = pair[1];
                select.appendChild(option);
            });
            select.value = row.mode;
            select.addEventListener('change', function () {
                row.mode = select.value === 'dark' ? 'dark' : 'light';
            });
            el.appendChild(select);
        }

        var order = document.createElement('span');
        order.className = 'custom-css-theme-order';
        [['up', -1, 'lucide-chevron-up'], ['down', 1, 'lucide-chevron-down']].forEach(function (spec) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'custom-css-theme-order-btn';
            button.title = spec[0] === 'up'
                ? str('modals.theme_list.move_up', 'Move up')
                : str('modals.theme_list.move_down', 'Move down');
            button.setAttribute('aria-label', button.title);
            button.innerHTML = '<i class="lucide ' + spec[2] + '"></i>';
            button.disabled = spec[1] < 0 ? index === 0 : index === rows.length - 1;
            button.addEventListener('click', function () { moveRow(index, spec[1]); });
            order.appendChild(button);
        });
        el.appendChild(order);

        return el;
    }

    function render() {
        var box = document.getElementById('themeListChoices');
        if (!box) return;
        box.innerHTML = '';
        rows.forEach(function (row, index) {
            box.appendChild(buildRowElement(row, index));
        });
    }

    function failed(error) {
        alert((error && error.message) || str('display.alerts.error_saving_preference', 'Error saving preference'));
    }

    function open() {
        if (!modal) return;
        fetch(apiUrl, { method: 'GET', credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                readState(data);
                rows = buildRows();
                render();
                modal.style.display = 'flex';
            })
            .catch(failed);
    }

    function close() {
        if (modal) modal.style.display = 'none';
    }

    function save() {
        var entries = entriesOf(rows);
        if (entries.length === 0) {
            alert(str('modals.theme_list.empty', 'Keep at least one theme in the list.'));
            return;
        }
        if (JSON.stringify(entries) === savedJson) {
            close();
            return;
        }

        var body = new FormData();
        body.append('action', 'theme_list');
        body.append('entries', JSON.stringify(entries));
        fetch(apiUrl, { method: 'POST', credentials: 'same-origin', body: body })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.success) throw new Error((data && data.error) || '');
                close();
                // The list is injected at the top of every page (config.php):
                // a reload is what hands the new one to the theme button
                window.location.reload();
            })
            .catch(failed);
    }

    function init() {
        modal = document.getElementById('themeListModal');
        if (!modal) return;

        try {
            strings = JSON.parse(modal.getAttribute('data-strings') || '{}') || {};
        } catch (e) {
            strings = {};
        }
        apiUrl = modal.getAttribute('data-api') || apiUrl;

        var cancel = document.getElementById('cancelThemeListBtn');
        if (cancel) cancel.addEventListener('click', close);
        var saveButton = document.getElementById('saveThemeListBtn');
        if (saveButton) saveButton.addEventListener('click', save);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display === 'flex') close();
        });

        window.poznoteOpenThemeListModal = open;

        // Older links to the list: settings.php?open=theme-list
        if (new URLSearchParams(window.location.search || '').get('open') === 'theme-list') {
            open();
            if (window.history && typeof window.history.replaceState === 'function') {
                var cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('open');
                window.history.replaceState({}, '', cleanUrl.toString());
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

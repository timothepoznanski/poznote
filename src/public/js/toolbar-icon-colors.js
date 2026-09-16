/**
 * Note toolbar icon colours.
 *
 * A right-click on a toolbar button, or on an entry of a toolbar menu (⋮,
 * task list actions), opens the icon colour modal of the rail
 * (window.PoznoteIconColorModal, js/icon-sidebar-colors.js) and saves the pick
 * under the 'toolbar_icon_colors' user setting straight away.
 *
 * The colours are painted by the <style id="toolbar-icon-colors-styles">
 * poznoteRenderToolbarIconColorsBootstrap() emits in index.php's <head>, not
 * on the buttons: the toolbar is re-rendered each time a note opens. After a
 * change the style is rebuilt here by buildRules(), which mirrors
 * poznoteBuildToolbarIconColorRules() in lib/ui-customization.php.
 */
(function () {
    'use strict';

    var STYLE_ID = 'toolbar-icon-colors-styles';
    var KEY_PATTERN = /^[a-z][a-z0-9-]{0,79}$/;
    // Buttons with no btn-* class of their own.
    var CLASS_KEYS = ['mobile-more-btn', 'markdown-view-mode-btn', 'markdown-split-btn'];
    // Same list as $states in poznoteBuildToolbarIconColorRules().
    var STATES = ':not(.is-favorite):not(.is-shared):not(.has-attachments):not(.has-reminder):not(.is-saving):not(.is-format-active):not(.is-edit-mode)';

    var colors = normalizeColors(window.__POZNOTE_TOOLBAR_ICON_COLORS__);

    function normalizeColors(value) {
        var clean = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
        Object.keys(value).forEach(function (key) {
            if (KEY_PATTERN.test(key) && typeof value[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value[key])) {
                clean[key] = value[key].toLowerCase();
            }
        });
        return clean;
    }

    function buildRules(map) {
        return Object.keys(map).map(function (key) {
            // Same token mapping as poznoteIconColorCss() on the PHP side.
            var css = window.poznoteIconColorCss ? window.poznoteIconColorCss(map[key]) : map[key];
            var paint = ' { color: ' + css + '; background-color: ' + css + '; }';
            if (key.indexOf('menu-') === 0) {
                return '.note-edit-toolbar .dropdown-item[data-action="' + key.slice(5) + '"]:not([data-selector]):not(.has-attachments) i' + paint;
            }
            return '.note-edit-toolbar .toolbar-btn.' + key + STATES + ' i, .note-edit-toolbar .dropdown-item[data-selector=".' + key + '"]:not(.has-attachments) i' + paint;
        }).join('\n');
    }

    function applyRules() {
        var style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = buildRules(colors);
    }

    // The colour key of a toolbar button or menu entry, '' when it has none.
    // A button is keyed by its btn-* class, the one UI Customization uses too
    // (btn-history-nav is shared by Back and Forward). A menu entry that
    // triggers a toolbar button shares that button's key; any other entry is
    // keyed by its action.
    function keyOf(element) {
        var key = '';
        if (element.classList.contains('toolbar-btn')) {
            CLASS_KEYS.forEach(function (cls) {
                if (!key && element.classList.contains(cls)) key = cls;
            });
            Array.prototype.forEach.call(element.classList, function (cls) {
                if (!key && cls.indexOf('btn-') === 0 && cls !== 'btn-history-nav') key = cls;
            });
        } else {
            var selector = element.getAttribute('data-selector') || '';
            var action = element.getAttribute('data-action') || '';
            if (/^\.[a-z0-9-]+$/.test(selector)) {
                key = selector.slice(1);
            } else if (action) {
                key = 'menu-' + action;
            }
        }
        return KEY_PATTERN.test(key) ? key : '';
    }

    function labelOf(element) {
        if (element.classList.contains('toolbar-btn')) {
            return element.getAttribute('title') || element.getAttribute('aria-label') || '';
        }
        return (element.textContent || '').trim();
    }

    function save(key, color) {
        var next = {};
        Object.keys(colors).forEach(function (id) {
            next[id] = colors[id];
        });
        if (color) {
            next[key] = color;
        } else {
            delete next[key];
        }

        fetch('/api/v1/settings/toolbar_icon_colors', {
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
                    console.debug('toolbar-icon-colors: unreadable saved value:', e);
                }
                colors = saved;
                applyRules();
            })
            .catch(function (error) {
                console.debug('toolbar-icon-colors: save() failed:', error);
                var message = window.t ? window.t('display.alerts.error_saving_preference', null, 'Error saving preference') : 'Error saving preference';
                alert(message);
            });
    }

    document.addEventListener('contextmenu', function (event) {
        var modal = window.PoznoteIconColorModal;
        var target = event.target.closest && event.target.closest('.note-edit-toolbar .toolbar-btn, .note-edit-toolbar .dropdown-item');
        if (!modal || !target) return;

        var key = keyOf(target);
        if (!key) return;

        event.preventDefault();
        modal.open({
            color: colors[key] || '',
            icon: modal.iconClassOf(target.querySelector('.lucide')),
            label: labelOf(target),
            onApply: function (color) {
                save(key, color);
            }
        });
    });
})();

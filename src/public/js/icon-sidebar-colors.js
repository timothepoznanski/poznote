/**
 * Icon rail colours, and the icon colour modal they share with the note toolbar.
 *
 * Drives #iconSidebarColorModal, rendered by icon_sidebar.php next to the rail:
 * the folder colour palette (modals/icon_color_options.php) without the icon
 * grid. A right-click on a rail button opens it and saves the pick straight
 * away; the Icon Sidebar Order modal (js/settings-page.js) opens it with an
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
            icon.style.setProperty(COLOR_PROPERTY, color);
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
        modal.querySelectorAll('.folder-color-option').forEach(function (option) {
            var optionColor = (option.getAttribute('data-color') || '').toLowerCase();
            option.classList.toggle('selected', optionColor === selectedColor);
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
            open(button.id);
        });
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

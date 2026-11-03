/**
 * Page width slider, in a popover of the toolbar of the speed dial and the
 * dashboard (speed_dial.php, dashboard.php), rendered by
 * poznoteRenderPageWidthSlider().
 *
 * The width of the page's column, as a percentage of the room beside the icon
 * rail, saved in an account setting (speed_dial_width, dashboard_width) once
 * the slider stops. The page renders the stored width on <body> as a CSS
 * variable (lib/page-width.php), which its stylesheet reads; without one the
 * page keeps its own layout.
 */
document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    var row = document.querySelector('[data-page-width]');
    if (!row) return;

    var SAVE_DEBOUNCE = 400;

    var input = row.querySelector('.page-more-menu-slider-input');
    var output = row.querySelector('.page-more-menu-slider-value');
    // The popover the slider sits in, and its button
    var toggle = document.querySelector('[data-page-width-toggle]');
    var popup = toggle ? document.getElementById(toggle.getAttribute('aria-controls')) : null;
    var setting = row.getAttribute('data-setting');
    var cssVar = row.getAttribute('data-css-var');
    var column = document.querySelector(row.getAttribute('data-column'));
    var min = parseInt(input.min, 10);
    var max = parseInt(input.max, 10);
    var step = parseInt(input.step, 10);
    var saveTimeout = null;

    function readWidth(raw) {
        var width = parseInt(raw, 10);
        return isNaN(width) ? null : Math.min(max, Math.max(min, width));
    }

    // The width the page has without a setting: the dashboard's is full
    // width, the speed dial's is a column of its own, null here
    var defaultWidth = readWidth(row.getAttribute('data-default-width'));
    var width = readWidth(row.getAttribute('data-value'));
    var saved = width;

    // Without a setting, the dashboard says "Full width" like the slider at 100
    function label(value) {
        if (value === null && defaultWidth !== null) value = defaultWidth;
        if (value === null) return row.getAttribute('data-label-default') || 'Default';
        if (value >= 100) return row.getAttribute('data-label-full') || 'Full width';
        return value + ' %';
    }

    // Where the thumb sits without a setting: the page's own width, read off
    // the column against the room it is a percentage of
    function measuredWidth() {
        if (defaultWidth !== null) return defaultWidth;
        if (!column || !column.parentElement) return max;

        var parent = column.parentElement;
        var style = window.getComputedStyle(parent);
        var room = parent.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        if (room <= 0) return max;

        var percent = Math.round(column.getBoundingClientRect().width / room * 100 / step) * step;
        return Math.min(max, Math.max(min, percent));
    }

    function show() {
        input.value = String(width === null ? measuredWidth() : width);
        output.textContent = label(width);
        input.setAttribute('aria-valuetext', label(width));
    }

    function apply() {
        if (width === null) {
            document.body.style.removeProperty(cssVar);
        } else {
            document.body.style.setProperty(cssVar, width + '%');
        }
    }

    // Debounced: dragging the slider must not fire one PUT per step
    function save() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(function () {
            var value = width;
            fetch('api/v1/settings/' + encodeURIComponent(setting), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ value: value === null ? '' : String(value) })
            }).then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                saved = value;
            }).catch(function (error) {
                console.error('Error saving page width:', error);
                width = saved;
                apply();
                show();
                if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
                    window.modalAlert.alert(row.getAttribute('data-txt-error') || 'Could not save the width.', 'error');
                }
            });
        }, SAVE_DEBOUNCE);
    }

    // The page follows the thumb as it moves. The width the page has anyway
    // is stored as no setting at all.
    input.addEventListener('input', function () {
        var value = readWidth(input.value);
        width = value === defaultWidth ? null : value;
        apply();
        show();
        save();
    });

    // Measured when the popover opens: the room changes with the
    // window, the docked panels and the rail
    if (popup && typeof MutationObserver === 'function') {
        new MutationObserver(function () {
            if (!popup.hidden) show();
        }).observe(popup, { attributes: true, attributeFilter: ['hidden'] });
    }

    // The dashboard's popover is fixed, as its toolbar is a scroller that
    // would clip it: it is placed under its button on open. The speed dial's
    // hangs from its button in CSS.
    if (toggle && popup) {
        var setOpen = function (open) {
            popup.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (!open) return;

            if (window.getComputedStyle(popup).position === 'fixed') {
                var rect = toggle.getBoundingClientRect();
                popup.style.top = (rect.bottom + 6) + 'px';
                popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - popup.offsetWidth - 8)) + 'px';
            }
            input.focus();
        };

        toggle.addEventListener('click', function () {
            setOpen(popup.hidden);
        });
        document.addEventListener('mousedown', function (event) {
            if (!popup.hidden && !popup.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
        }, true);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !popup.hidden) {
                setOpen(false);
                toggle.focus();
            }
        }, true);
        window.addEventListener('resize', function () { setOpen(false); });
    }

    show();
});

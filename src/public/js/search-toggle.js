// Folded search field, as on graph.php: a magnifier button first on the row
// of buttons, which unfolds the field in its place. The cross and Escape
// empty the field and fold it; so does leaving it empty.
//
// Markup: <button class="pz-search-toggle" aria-controls="ID"> followed by the
// field's wrapper <div id="ID" class="pz-search-collapsible is-search-collapsed">
// holding the text input (and the page's own cross, if any). Both sit in the
// same flex row, marked .pz-search-row: on a phone the open field takes the
// whole row and the buttons after it go to the line below
// (css/components/search-toggle.css).
//
// The page keeps its own filtering: this file only shows and hides the field.
// Clearing goes through an 'input' event, the one every page listens to.
(function () {
    'use strict';

    var valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    function setup(toggle) {
        if (toggle.getAttribute('data-search-toggle-ready') === '1') return;
        var wrapper = document.getElementById(toggle.getAttribute('aria-controls') || '');
        if (!wrapper) return;
        var input = wrapper.querySelector('input[type="text"], input[type="search"]');
        if (!input) return;
        toggle.setAttribute('data-search-toggle-ready', '1');
        var row = wrapper.closest('.pz-search-row');

        function isOpen() {
            return !wrapper.classList.contains('is-search-collapsed');
        }

        function setOpen(open) {
            wrapper.classList.toggle('is-search-collapsed', !open);
            toggle.classList.toggle('is-search-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (row) row.classList.toggle('has-open-search', open);
        }

        function close(refocus) {
            setOpen(false);
            if (refocus) toggle.focus();
        }

        toggle.addEventListener('click', function () {
            setOpen(true);
            input.focus();
        });

        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (input.value !== '') {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            close(true);
        });

        // Run after the page's own handlers: a cross gives the focus back to
        // the field, which must not keep it open once empty
        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (isOpen() && input.value === '' && document.activeElement !== input) close(false);
            }, 0);
        });
        wrapper.addEventListener('click', function (e) {
            if (!e.target.closest('button')) return;
            setTimeout(function () {
                if (isOpen() && input.value === '') close(true);
            }, 0);
        });

        // A value the page puts there itself (a filter read from the URL, a
        // search kept by the server) shows the field
        input.addEventListener('input', function () {
            if (input.value !== '') setOpen(true);
        });
        if (valueDescriptor && valueDescriptor.get && valueDescriptor.set) {
            Object.defineProperty(input, 'value', {
                configurable: true,
                get: function () { return valueDescriptor.get.call(this); },
                set: function (v) {
                    valueDescriptor.set.call(this, v);
                    if (v !== '' && v !== null && v !== undefined) setOpen(true);
                }
            });
        }
        // The browser can restore a typed value on Back without any event
        window.addEventListener('pageshow', function () {
            if (input.value !== '') setOpen(true);
        });

        setOpen(input.value !== '');
    }

    function init() {
        document.querySelectorAll('.pz-search-toggle').forEach(setup);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

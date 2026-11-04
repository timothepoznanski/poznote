/**
 * Per-row actions menu of the backup archive tables (Local Backups admin
 * page, Local Backups section of the Backup / Export page).
 *
 *   var toggle = window.poznoteRowActionsMenu.createToggle(label, function () {
 *       return [
 *           { icon: 'lucide-download', label: 'Download', href: url },
 *           { icon: 'lucide-trash-2', label: 'Delete', danger: true,
 *             disabled: true, title: 'Why it is greyed out', onSelect: fn },
 *       ];
 *   });
 *
 * The items are built when the menu opens, so a disabled state always
 * reflects the page's current state. One menu element on <body>, with
 * position:fixed under the clicked button: inside the table it would be
 * clipped by the scrolling wrapper (css/components/row-actions-menu.css).
 * It follows its button when the page or the table scrolls.
 * A disabled item stays visible and focusable (aria-disabled, not the
 * disabled attribute) so its title explains why it cannot be used.
 */
(function () {
    'use strict';

    var menuEl = null;
    var owner = null;

    function close(restoreFocus) {
        if (!menuEl || menuEl.hidden) return;
        var previous = owner;
        menuEl.hidden = true;
        menuEl.innerHTML = '';
        owner = null;
        if (previous) {
            previous.setAttribute('aria-expanded', 'false');
            if (restoreFocus) previous.focus();
        }
    }

    function ensureMenu() {
        if (menuEl) return menuEl;
        menuEl = document.createElement('div');
        menuEl.className = 'row-actions-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.hidden = true;
        menuEl.addEventListener('click', function (e) { e.stopPropagation(); });
        menuEl.addEventListener('keydown', function (e) {
            var items = Array.prototype.slice.call(menuEl.querySelectorAll('.row-actions-item'));
            var index = items.indexOf(document.activeElement);
            if (e.key === 'Escape') {
                e.preventDefault();
                close(true);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                var next = e.key === 'ArrowDown' ? index + 1 : index - 1;
                if (items.length) items[(next + items.length) % items.length].focus();
            } else if (e.key === 'Tab') {
                close();
            }
        });
        document.body.appendChild(menuEl);

        document.addEventListener('click', function () { close(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && owner) close(true);
        });
        // A fixed menu would drift away from its row: it follows its button
        // instead, and closes once the button has left the viewport. Closing
        // on every scroll also closed it right after opening when the page
        // was still settling from a scroll (momentum, scroll-into-view).
        window.addEventListener('resize', function () { place(); });
        document.addEventListener('scroll', function (e) {
            if (e.target instanceof Node && menuEl.contains(e.target)) return;
            place();
        }, true);
        return menuEl;
    }

    function buildItem(spec) {
        var item = document.createElement(spec.href && !spec.disabled ? 'a' : 'button');
        item.className = 'row-actions-item' + (spec.danger ? ' is-danger' : '') + (spec.disabled ? ' is-disabled' : '');
        item.setAttribute('role', 'menuitem');
        if (item.tagName === 'BUTTON') item.type = 'button';
        if (item.tagName === 'A') item.href = spec.href;
        if (spec.title) item.title = spec.title;
        if (spec.disabled) item.setAttribute('aria-disabled', 'true');
        var icon = document.createElement('i');
        icon.className = 'lucide ' + spec.icon;
        item.appendChild(icon);
        item.appendChild(document.createTextNode(spec.label));
        item.addEventListener('click', function (e) {
            if (spec.disabled) {
                e.preventDefault();
                return;
            }
            close();
            if (spec.onSelect) spec.onSelect();
        });
        return item;
    }

    // Right-aligned under the button, flipped above it when the viewport has
    // no room below, kept inside the viewport
    function place() {
        if (!menuEl || menuEl.hidden || !owner) return;
        var rect = owner.getBoundingClientRect();
        if (!owner.isConnected || rect.bottom < 0 || rect.top > window.innerHeight) {
            close();
            return;
        }
        var mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
        var top = rect.bottom + 6;
        if (top + mh > window.innerHeight - 8 && rect.top - 6 - mh >= 8) top = rect.top - 6 - mh;
        var left = Math.min(Math.max(8, rect.right - mw), window.innerWidth - mw - 8);
        menuEl.style.top = Math.round(top) + 'px';
        menuEl.style.left = Math.round(left) + 'px';
    }

    function open(toggle, specs) {
        close();
        var menu = ensureMenu();
        specs.forEach(function (spec) { menu.appendChild(buildItem(spec)); });
        owner = toggle;
        toggle.setAttribute('aria-expanded', 'true');
        menu.hidden = false;
        place();

        var first = menu.querySelector('.row-actions-item');
        if (first) first.focus();
    }

    function createToggle(label, buildItems) {
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'btn btn-secondary row-actions-toggle';
        toggle.setAttribute('aria-haspopup', 'menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        toggle.innerHTML = '<i class="lucide lucide-more-horizontal"></i>';
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (owner === toggle) {
                close();
            } else {
                open(toggle, buildItems());
            }
        });
        return toggle;
    }

    window.poznoteRowActionsMenu = { createToggle: createToggle, close: close };
})();

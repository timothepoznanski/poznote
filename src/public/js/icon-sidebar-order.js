/**
 * Icon sidebar layout modal: the order of the rail's buttons, the separators
 * between them and their colours.
 *
 * Rendered by icon_sidebar.php next to the rail, so the "Customize this menu" entry
 * of the rail's right-click menu (js/icon-sidebar-colors.js) opens it on the
 * page it is on; the Icon sidebar layout card of settings.php opens the same
 * one, through window.poznoteOpenIconSidebarOrderModal.
 *
 * The rows are rendered server-side from the very list the rail was built
 * from, already in the saved order, separators included, so this only has to
 * let them be reordered and track the icon colours picked on them. The rail
 * itself is rendered in PHP, hence the reload after saving.
 */
(function () {
    'use strict';

    // Same token as POZNOTE_ICON_SIDEBAR_DIVIDER in functions.php: the
    // data-entry-id of a separator row, repeated in the saved order for each
    // line the user placed.
    var DIVIDER = 'divider';

    var modal = null;
    var list = null;
    // The rows as rendered, put back on each opening so Cancel drops a
    // reordering along with the colours picked
    var initialRows = '';

    function isDividerRow(row) {
        return row.getAttribute('data-entry-id') === DIVIDER;
    }

    // A separator before the first entry, after the last, or right after
    // another one draws nothing, and the rail drops them
    // (poznoteTidyIconSidebarDividers()); do the same so what is saved is what
    // the rail shows.
    function tidyOrder(order) {
        var tidy = [];
        order.forEach(function (id) {
            if (id !== DIVIDER) {
                tidy.push(id);
            } else if (tidy.length && tidy[tidy.length - 1] !== DIVIDER) {
                tidy.push(id);
            }
        });
        if (tidy.length && tidy[tidy.length - 1] === DIVIDER) {
            tidy.pop();
        }
        return tidy;
    }

    function orderIds() {
        return tidyOrder(Array.prototype.map.call(list.querySelectorAll('.icon-sidebar-order-item'), function (row) {
            return row.getAttribute('data-entry-id');
        }).filter(function (id) {
            return !!id;
        }));
    }

    // A new separator lands at the bottom, ready to be dragged to where the
    // line should go.
    function addDividerRow() {
        var template = document.getElementById('iconSidebarOrderDividerTemplate');
        var row = template && template.content ? template.content.firstElementChild : null;
        if (!row) return;
        row = row.cloneNode(true);
        list.appendChild(row);
        try { row.scrollIntoView({ block: 'nearest' }); } catch (e) {
            console.debug('icon-sidebar-order: scrollIntoView() failed:', e);
        }
    }

    // Colours picked in this modal stay on the rows (data-icon-color) until
    // Save, so Cancel drops them. The colour modal itself belongs to the rail
    // (js/icon-sidebar-colors.js), which also paints the row's icon the way it
    // paints the rail's.
    function colorsApi() {
        return window.PoznoteIconSidebarColors || null;
    }

    function setRowColor(row, color) {
        var api = colorsApi();
        row.setAttribute('data-icon-color', color || '');
        if (api) api.paintIcon(row.querySelector('.icon-sidebar-order-icon'), color || '');
    }

    function resetRowColors() {
        var api = colorsApi();
        if (!api) return;
        list.querySelectorAll('.icon-sidebar-order-item').forEach(function (row) {
            if (!isDividerRow(row)) setRowColor(row, api.getColor(row.getAttribute('data-entry-id')));
        });
    }

    function openRowColor(row) {
        var api = colorsApi();
        if (!api || !row) return;
        var icon = row.querySelector('.icon-sidebar-order-icon');
        var label = row.querySelector('.icon-sidebar-order-label');
        api.open(row.getAttribute('data-entry-id'), {
            color: row.getAttribute('data-icon-color') || '',
            icon: icon ? api.iconClassOf(icon) : '',
            label: label ? label.textContent : '',
            onApply: function (color) {
                setRowColor(row, color);
            }
        });
    }

    // Every saved colour, with the listed rows' pending ones on top. Starts
    // from the saved map so the account buttons at the bottom of the rail,
    // which the list does not show, keep theirs.
    function pendingColors() {
        var api = colorsApi();
        var colors = api ? api.getColors() : {};
        list.querySelectorAll('.icon-sidebar-order-item').forEach(function (row) {
            if (isDividerRow(row) || !row.hasAttribute('data-icon-color')) return;
            var id = row.getAttribute('data-entry-id');
            var color = row.getAttribute('data-icon-color');
            if (color) {
                colors[id] = color;
            } else {
                delete colors[id];
            }
        });
        return colors;
    }

    // SortableJS is vendored but not loaded on most pages; pull it in on
    // first open, exactly as js/tasklist-order-drag.js does.
    function initSortable() {
        if (list.dataset.sortable === '1') return;

        if (typeof Sortable === 'undefined') {
            if (!document.querySelector('script[data-sortable-local]')) {
                var script = document.createElement('script');
                script.src = window.poznoteAssetUrl ? window.poznoteAssetUrl('js/Sortable.min.js') : '/js/Sortable.min.js';
                script.async = true;
                script.setAttribute('data-sortable-local', '1');
                script.onload = initSortable;
                document.head.appendChild(script);
            }
            return;
        }

        new Sortable(list, {
            animation: 150,
            handle: '.icon-sidebar-order-handle',
            draggable: '.icon-sidebar-order-item',
            onStart: function (evt) { evt.item.classList.add('dragging'); },
            onEnd: function (evt) { evt.item.classList.remove('dragging'); }
        });

        list.dataset.sortable = '1';
    }

    function open() {
        if (!modal) return;
        list.innerHTML = initialRows;
        resetRowColors();
        initSortable();
        modal.style.display = 'flex';
    }

    function close() {
        if (modal) modal.style.display = 'none';
    }

    function putSetting(key, value) {
        return fetch('/api/v1/settings/' + encodeURIComponent(key), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: value })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
        });
    }

    // colors is optional: Reset only clears the order.
    function save(order, colors) {
        var chain = putSetting('icon_sidebar_order', JSON.stringify(order));
        if (colors) {
            chain = chain.then(function () {
                return putSetting('icon_sidebar_colors', JSON.stringify(colors));
            });
        }
        chain.then(function () {
            close();
            window.location.reload();
        }).catch(function () {
            alert(modal.getAttribute('data-error') || 'Error saving preference');
        });
    }

    function init() {
        modal = document.getElementById('iconSidebarOrderModal');
        list = document.getElementById('iconSidebarOrderList');
        if (!modal || !list) return;
        initialRows = list.innerHTML;

        list.addEventListener('click', function (event) {
            var button = event.target.closest('[data-change-color], [data-remove-divider]');
            if (!button) return;
            var row = button.closest('.icon-sidebar-order-item');
            if (button.hasAttribute('data-remove-divider')) {
                if (row) row.remove();
            } else {
                openRowColor(row);
            }
        });

        var addDivider = document.getElementById('addIconSidebarDividerBtn');
        if (addDivider) addDivider.addEventListener('click', addDividerRow);

        var saveButton = document.getElementById('saveIconSidebarOrderBtn');
        if (saveButton) {
            saveButton.addEventListener('click', function () {
                save(orderIds(), pendingColors());
            });
        }

        // Reset clears the preference, so the rail falls back to the order
        // icon_sidebar.php declares.
        var reset = document.getElementById('resetIconSidebarOrderBtn');
        if (reset) {
            reset.addEventListener('click', function () {
                save([]);
            });
        }

        var cancel = document.getElementById('cancelIconSidebarOrderBtn');
        if (cancel) cancel.addEventListener('click', close);

        modal.addEventListener('click', function (event) {
            if (event.target === modal) close();
        });
        // The colour modal opens over this one and stops its own Escape in the
        // capture phase (js/icon-sidebar-colors.js), so this one stays open
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal.style.display === 'flex') close();
        });

        window.poznoteOpenIconSidebarOrderModal = open;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

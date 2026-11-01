/**
 * Speed dial (public/speed_dial.php): a favicon can take seconds to fail on a
 * site that does not answer, and an image in the page holds its load event for
 * that long. So the icons are only asked for once the page has loaded, and an
 * icon only covers the letter under it once it is there. Listening in the
 * capture phase: load and error do not bubble.
 * The filter bar narrows the tiles down by title or link; Settings can hide it
 * (card:speedDialFilter).
 *
 * Tiles and groups are dragged the way the dashboard's cards are (js/dashboard-page.js):
 * the HTML5 drag for a mouse, a long press then a move on touch, the position
 * saved through POST /api/v1/notes/reorder. Not while the filter is on: a rank
 * among the tiles it leaves has no meaning.
 */
window.addEventListener('load', function () {
    document.querySelectorAll('.speed-dial-icon img[data-src]').forEach(function (img) {
        img.src = img.getAttribute('data-src');
    });
});

document.addEventListener('load', function (event) {
    var target = event.target;
    if (target && target.tagName === 'IMG' && target.closest('.speed-dial-icon')) {
        target.classList.add('is-loaded');
    }
}, true);

document.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target.tagName === 'IMG' && target.closest('.speed-dial-icon')) {
        target.remove();
    }
}, true);

// Background image, from the "..." menu of the floating stack: the modal of the
// workspaces' background (js/workspace-background.js), for the view's own image.
document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('edgeMenuSpeedDialBackground');
    if (!button) return;

    button.addEventListener('click', function () {
        window.openSpeedDialBackgroundModal(document.body.getAttribute('data-workspace') || '');
    });
});

// Size of the tiles: the button opens a slider, which resizes them as it moves
// and saves on release, in the setting speed_dial_tile_size. speed_dial.php
// renders the width on <body>, css/speed-dial.css derives the rest from it.
document.addEventListener('DOMContentLoaded', function () {
    var wrapper = document.getElementById('speedDialSize');
    if (!wrapper) return;

    var button = document.getElementById('speedDialSizeBtn');
    var popover = document.getElementById('speedDialSizePopover');
    var slider = document.getElementById('speedDialSizeInput');
    var value = document.getElementById('speedDialSizeValue');
    var saved = slider.value;

    function showSize(size) {
        slider.value = size;
        value.textContent = size;
        document.body.style.setProperty('--speed-dial-tile-width', size + 'px');
    }

    function setOpen(open) {
        popover.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    button.addEventListener('click', function () {
        setOpen(popover.hidden);
        if (!popover.hidden) slider.focus();
    });

    slider.addEventListener('input', function () {
        showSize(slider.value);
    });

    slider.addEventListener('change', function () {
        var before = saved;
        var size = slider.value;
        saved = size;

        fetch('api/v1/settings/speed_dial_tile_size', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: size })
        }).then(function (response) {
            return window.readApiJson(response).then(function (data) {
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                }
            });
        }).catch(function (error) {
            saved = before;
            showSize(before);
            window.modalAlert.alert(window.apiErrorMessage(error), 'error');
        });
    });

    document.addEventListener('mousedown', function (event) {
        if (!wrapper.contains(event.target)) setOpen(false);
    }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !popover.hidden) {
            setOpen(false);
            button.focus();
        }
    }, true);
});

// Colour of a group's label, from its right-click menu, saved straight away in
// the setting speed_dial_label_colors: note id => #rrggbb. Touch
// screens keep their own menu: a long press moves the group.
document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('speedDialGrid');
    var menu = document.getElementById('noteTitleMenu');
    if (!grid || !menu) return;

    var colors = JSON.parse(grid.getAttribute('data-label-colors'));
    var swatches = menu.querySelectorAll('.note-title-menu-swatch');
    var current = null; // the label the menu is open on

    function noteIdOf(label) {
        return label.closest('.speed-dial-group').getAttribute('data-note-id');
    }

    function colorOf(label) {
        return colors[noteIdOf(label)] || '';
    }

    function setColor(label, color) {
        if (color) {
            colors[noteIdOf(label)] = color;
            label.style.setProperty('--speed-dial-label-color', window.poznoteIconColorCss(color));
        } else {
            delete colors[noteIdOf(label)];
            label.style.removeProperty('--speed-dial-label-color');
            if (!label.getAttribute('style')) label.removeAttribute('style');
        }
    }

    function refreshSwatches() {
        var color = current ? colorOf(current) : '';
        swatches.forEach(function (swatch) {
            var on = swatch.getAttribute('data-color') === color;
            swatch.classList.toggle('is-selected', on);
            swatch.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function closeMenu(restoreFocus) {
        if (menu.hidden) return;
        menu.hidden = true;
        if (restoreFocus && current) current.focus();
        current = null;
    }

    function openMenu(event, label) {
        current = label;
        menu.hidden = false;
        refreshSwatches();

        // A keyboard context menu (Shift+F10, menu key) reports no pointer
        // position: open under the label instead.
        var fromKeyboard = event.clientX === 0 && event.clientY === 0;
        var labelRect = label.getBoundingClientRect();
        var x = fromKeyboard ? labelRect.left : event.clientX;
        var y = fromKeyboard ? labelRect.bottom : event.clientY;
        var padding = 8;
        var rect = menu.getBoundingClientRect();
        var left = x + rect.width > window.innerWidth - padding ? x - rect.width : x;
        var top = y + rect.height > window.innerHeight - padding ? y - rect.height : y;
        menu.style.left = Math.max(padding, Math.min(left, window.innerWidth - rect.width - padding)) + 'px';
        menu.style.top = Math.max(padding, Math.min(top, window.innerHeight - rect.height - padding)) + 'px';

        if (fromKeyboard) (menu.querySelector('.is-selected') || swatches[0]).focus();
    }

    grid.addEventListener('contextmenu', function (event) {
        if (event.shiftKey) return;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
        var label = event.target.closest && event.target.closest('.speed-dial-group-name');
        if (!label) return;
        event.preventDefault();
        openMenu(event, label);
    });

    // Shown at once, put back when the server refuses it
    swatches.forEach(function (swatch) {
        swatch.addEventListener('click', function () {
            if (!current) return;
            var label = current;
            var before = colorOf(label);
            setColor(label, swatch.getAttribute('data-color'));
            refreshSwatches();

            fetch('api/v1/settings/speed_dial_label_colors', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ value: JSON.stringify(colors) })
            }).then(function (response) {
                return window.readApiJson(response).then(function (data) {
                    if (!response.ok || !data || !data.success) {
                        throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                    }
                });
            }).catch(function (error) {
                setColor(label, before);
                refreshSwatches();
                window.modalAlert.alert(window.apiErrorMessage(error), 'error');
            });
        });
    });

    menu.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    menu.addEventListener('keydown', function (event) {
        if (event.key === 'Tab') {
            // Tabbing cycles inside the menu rather than leaving it open behind the focus
            var items = Array.prototype.slice.call(swatches);
            var next = items.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1);
            event.preventDefault();
            items[(next + items.length) % items.length].focus();
        }
    });

    document.addEventListener('mousedown', function (event) {
        if (!menu.contains(event.target)) closeMenu(false);
    }, true);
    document.addEventListener('scroll', function () { closeMenu(false); }, true);
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeMenu(true);
    }, true);
    window.addEventListener('resize', function () { closeMenu(false); });
    window.addEventListener('blur', function () { closeMenu(false); });
});

document.addEventListener('DOMContentLoaded', function () {
    var grid = document.getElementById('speedDialGrid');
    var input = document.getElementById('speedDialFilterInput');
    if (!grid || !input) return;

    var clear = document.getElementById('speedDialFilterClear');
    var noResults = document.getElementById('speedDialNoResults');
    var tiles = grid.querySelectorAll('.speed-dial-tile');
    // What moves: a note, as a tile or as the group of its links
    var items = grid.querySelectorAll('.speed-dial-item');
    var groups = grid.querySelectorAll('.speed-dial-group');
    var workspace = document.body.getAttribute('data-workspace') || '';

    function isFiltered() {
        return input.value.trim() !== '';
    }

    // The list of a page spanning every workspace mixes notes no rank can join
    function tilesReorderable() {
        return workspace !== '' && !isFiltered();
    }

    function syncDraggable() {
        var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        var draggable = !coarse && tilesReorderable();
        items.forEach(function (item) {
            item.setAttribute('draggable', draggable ? 'true' : 'false');
        });
    }

    function applyFilter() {
        var query = input.value.trim().toLowerCase();
        var shown = 0;

        function matches(element) {
            return element.getAttribute('data-filter').toLowerCase().indexOf(query) !== -1;
        }

        tiles.forEach(function (tile) {
            // The name of a group shows all its tiles
            var group = tile.closest('.speed-dial-group');
            var match = matches(tile) || (!!group && matches(group));
            tile.hidden = !match;
            if (match) shown++;
        });
        groups.forEach(function (group) {
            group.querySelectorAll('.speed-dial-group-row').forEach(function (row) {
                row.hidden = !row.querySelector('.speed-dial-tile:not([hidden])');
            });
            group.hidden = !group.querySelector('.speed-dial-tile:not([hidden])');
        });
        grid.classList.toggle('is-filtered', query !== '');
        noResults.hidden = shown > 0;
        input.parentNode.classList.toggle('has-value', input.value !== '');
        syncDraggable();
    }

    input.addEventListener('input', applyFilter);
    clear.addEventListener('click', function () {
        input.value = '';
        applyFilter();
        input.focus();
    });
    syncDraggable();

    // --- Moving a tile ------------------------------------------------------

    var dragged = null; // the item being moved, by mouse or finger

    // A group takes the whole width: above or below it, not beside it
    function dropPosition(event, item) {
        var rect = item.getBoundingClientRect();
        if (item.classList.contains('speed-dial-group')) {
            return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        }
        return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    }

    // Tile under the pointer or, over a gap, the nearest one, so a drop
    // between two tiles still lands somewhere.
    function findDropTarget(event) {
        if (!event.target || !event.target.closest) return null;
        var direct = event.target.closest('.speed-dial-item');
        if (direct && direct !== dragged) {
            return { tile: direct, position: dropPosition(event, direct) };
        }
        if (direct || !grid.contains(event.target)) return null;

        var best = null;
        items.forEach(function (tile) {
            if (tile === dragged) return;
            var rect = tile.getBoundingClientRect();
            var dx = event.clientX < rect.left ? rect.left - event.clientX : (event.clientX > rect.right ? event.clientX - rect.right : 0);
            var dy = event.clientY < rect.top ? rect.top - event.clientY : (event.clientY > rect.bottom ? event.clientY - rect.bottom : 0);
            var distance = dx * dx + dy * dy;
            if (!best || distance < best.distance) {
                best = { tile: tile, distance: distance };
            }
        });
        return best ? { tile: best.tile, position: dropPosition(event, best.tile) } : null;
    }

    function clearDropIndicators() {
        items.forEach(function (tile) {
            tile.classList.remove('drop-before', 'drop-after');
        });
    }

    function showDropIndicator(target) {
        clearDropIndicators();
        if (target) target.tile.classList.add(target.position === 'before' ? 'drop-before' : 'drop-after');
    }

    function endDrag() {
        clearDropIndicators();
        if (dragged) dragged.classList.remove('is-dragging');
        dragged = null;
    }

    // Moved at once; on failure the tile goes back and the error is shown.
    function moveTile(tile, target) {
        var previousNext = tile.nextElementSibling;
        grid.insertBefore(tile, target.position === 'before' ? target.tile : target.tile.nextElementSibling);

        fetch('api/v1/notes/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                scope: 'speed_dial',
                note_id: parseInt(tile.getAttribute('data-note-id'), 10),
                target_note_id: parseInt(target.tile.getAttribute('data-note-id'), 10),
                position: target.position,
                workspace: workspace
            })
        }).then(function (response) {
            return window.readApiJson(response).then(function (data) {
                if (!response.ok || !data || !data.success) {
                    throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
                }
            });
        }).catch(function (error) {
            grid.insertBefore(tile, previousNext);
            var detail = error && window.apiErrorMessage(error);
            var message = grid.getAttribute('data-txt-reorder-error');
            window.modalAlert.alert(detail ? message + ' ' + detail : message, 'error');
        });
    }

    // Mouse

    grid.addEventListener('dragstart', function (event) {
        var tile = event.target && event.target.closest ? event.target.closest('.speed-dial-item') : null;
        if (!tile || !tilesReorderable()) {
            event.preventDefault();
            return;
        }
        dragged = tile;
        // Firefox needs data for the drag to start at all
        try {
            event.dataTransfer.setData('text/plain', tile.getAttribute('data-note-id'));
            event.dataTransfer.effectAllowed = 'move';
        } catch (error) { /* ignore */ }
        // Faded once the browser has taken its drag image of the tile
        setTimeout(function () { tile.classList.add('is-dragging'); }, 0);
    });

    grid.addEventListener('dragover', function (event) {
        if (!dragged) return;
        var target = findDropTarget(event);
        showDropIndicator(target);
        if (!target) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    });

    grid.addEventListener('dragleave', function (event) {
        if (!dragged) return;
        // Moving between children of the grid is not leaving it
        if (event.relatedTarget && grid.contains(event.relatedTarget)) return;
        clearDropIndicators();
    });

    grid.addEventListener('drop', function (event) {
        if (!dragged) return;
        event.preventDefault();
        var target = findDropTarget(event);
        var tile = dragged;
        endDrag();
        if (target) moveTile(tile, target);
    });

    // Cancelled drags (Escape, drop outside the grid)
    grid.addEventListener('dragend', endDrag);

    // Touch

    var LONG_PRESS_MS = 450;
    // How far the finger may wander before a press counts as a scroll, and
    // how far a held tile must move before it is dragged
    var TOUCH_SLOP = 8;
    var press = null; // the finger currently down on a tile

    function activatePress() {
        if (!press || press.active) return;
        clearTimeout(press.timer);
        press.active = true;
        if (navigator.vibrate) {
            try { navigator.vibrate(10); } catch (error) { /* not allowed */ }
        }
    }

    function startTouchDrag() {
        var rect = press.tile.getBoundingClientRect();
        var ghost = press.tile.cloneNode(true);
        ghost.classList.add('speed-dial-ghost');
        ghost.style.left = rect.left + 'px';
        ghost.style.top = rect.top + 'px';
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
        document.body.appendChild(ghost);
        dragged = press.tile;
        dragged.classList.add('is-dragging');
        press.ghost = ghost;
        press.frame = requestAnimationFrame(autoScroll);
    }

    function updateTouchTarget() {
        var element = document.elementFromPoint(press.x, press.y);
        press.target = element ? findDropTarget({ target: element, clientX: press.x, clientY: press.y }) : null;
        showDropIndicator(press.target);
    }

    // Scrolls the page while the finger holds a tile near the top or the
    // bottom of the screen, faster closer to the edge
    function autoScroll() {
        if (!press || !press.ghost) return;
        var edge = 64;
        var speed = 0;
        if (press.y < edge) {
            speed = -Math.ceil((edge - press.y) / 5);
        } else if (press.y > window.innerHeight - edge) {
            speed = Math.ceil((press.y - (window.innerHeight - edge)) / 5);
        }
        if (speed) {
            var scroller = document.scrollingElement || document.documentElement;
            var before = scroller.scrollTop;
            scroller.scrollTop = before + speed;
            if (scroller.scrollTop !== before) updateTouchTarget();
        }
        press.frame = requestAnimationFrame(autoScroll);
    }

    function finishPress(drop) {
        var ended = press;
        press = null;
        if (!ended) return null;
        clearTimeout(ended.timer);
        if (ended.ghost) {
            cancelAnimationFrame(ended.frame);
            ended.ghost.remove();
            var tile = dragged;
            endDrag();
            if (drop && ended.target) moveTile(tile, ended.target);
        }
        return ended;
    }

    grid.addEventListener('touchstart', function (event) {
        finishPress(false);
        if (event.touches.length !== 1 || !event.target.closest) return;
        var tile = event.target.closest('.speed-dial-item');
        if (!tile || event.target.closest('.speed-dial-edit') || !tilesReorderable()) return;
        var touch = event.touches[0];
        press = {
            tile: tile,
            startX: touch.clientX,
            startY: touch.clientY,
            x: touch.clientX,
            y: touch.clientY,
            active: false,
            ghost: null,
            target: null,
            frame: 0,
            timer: setTimeout(activatePress, LONG_PRESS_MS)
        };
    }, { passive: true });

    grid.addEventListener('touchmove', function (event) {
        if (!press || !event.touches.length) return;
        press.x = event.touches[0].clientX;
        press.y = event.touches[0].clientY;
        var moved = Math.abs(press.x - press.startX) > TOUCH_SLOP || Math.abs(press.y - press.startY) > TOUCH_SLOP;

        if (!press.active) {
            // Moving before the long press is a scroll, and so is any move
            // the browser no longer lets us cancel
            if (moved || !event.cancelable) finishPress(false);
            return;
        }
        // Held: the finger now moves the tile instead of the page
        if (event.cancelable) event.preventDefault();
        if (!press.ghost) {
            if (!moved) return;
            startTouchDrag();
        }
        press.ghost.style.transform = 'translate(' + (press.x - press.startX) + 'px, ' + (press.y - press.startY) + 'px)';
        updateTouchTarget();
    }, { passive: false });

    grid.addEventListener('touchend', function (event) {
        var ended = finishPress(true);
        // The long press already acted: no click must follow the link
        if (ended && ended.active && event.cancelable) event.preventDefault();
    });

    grid.addEventListener('touchcancel', function () {
        finishPress(false);
    });

    // Android fires it for a long press, possibly ahead of the timer: the
    // press goes on, without the browser's link menu
    grid.addEventListener('contextmenu', function (event) {
        if (!press) return;
        event.preventDefault();
        activatePress();
    });
});

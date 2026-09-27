/**
 * Column layout of tables in HTML (rich-text) notes.
 *
 * - Hovering the border between two columns shows a resize guide; dragging
 *   it moves that border only (the two neighbouring columns trade width)
 * - Double-clicking a column border fits the column on its left to its widest
 *   cell content (the column on its right takes up the difference)
 * - Column, row and cell alignment (left / center / right), driven by the
 *   table menu
 *
 * Widths are stored as percentages in the inline style of every cell of the
 * column, so they follow the note width and survive the loss of any row.
 * Alignment is stored as an inline text-align on the cells.
 */
(function () {
    'use strict';

    var EDGE_TOLERANCE = 5;   // px on each side of a border that grab it
    var MIN_COLUMN_WIDTH = 32; // px

    var guide = null;
    var hover = null;          // {table, note, border} under the pointer
    var drag = null;           // active resize

    // ─── Table grid ──────────────────────────────────────────────────────────

    /**
     * Maps the table to a grid of cells indexed by visual column, so that
     * colspan/rowspan cells occupy every slot they cover.
     */
    function buildGrid(table) {
        var grid = [];
        for (var r = 0; r < table.rows.length; r++) {
            grid[r] = grid[r] || [];
            var c = 0;
            var cells = table.rows[r].cells;
            for (var i = 0; i < cells.length; i++) {
                var cell = cells[i];
                while (grid[r][c]) c++;
                var colSpan = Math.max(1, cell.colSpan || 1);
                var rowSpan = Math.max(1, cell.rowSpan || 1);
                for (var dr = 0; dr < rowSpan && r + dr < table.rows.length; dr++) {
                    grid[r + dr] = grid[r + dr] || [];
                    for (var dc = 0; dc < colSpan; dc++) {
                        grid[r + dr][c + dc] = cell;
                    }
                }
                c += colSpan;
            }
        }
        return grid;
    }

    function columnCount(grid) {
        var count = 0;
        grid.forEach(function (row) { count = Math.max(count, row.length); });
        return count;
    }

    /** First and last visual columns covered by the cell. */
    function cellColumns(cell, grid) {
        var row = grid[cell.parentElement.rowIndex] || [];
        var first = row.indexOf(cell);
        if (first === -1) return null;
        return { first: first, last: first + Math.max(1, cell.colSpan || 1) - 1 };
    }

    /** Cells of a visual column, each listed once. */
    function columnCells(grid, col, singleSpanOnly) {
        var result = [];
        grid.forEach(function (row) {
            var cell = row[col];
            if (!cell || result.indexOf(cell) !== -1) return;
            if (singleSpanOnly && cell.colSpan > 1) return;
            result.push(cell);
        });
        return result;
    }

    function getEditableTableInfo(el) {
        if (!el || !el.closest) return null;
        var cell = el.closest('td, th');
        if (!cell) return null;
        var note = cell.closest('.noteentry[contenteditable="true"]');
        if (!note || note.getAttribute('data-note-type') === 'markdown') return null;
        var table = cell.closest('table');
        if (!table || !note.contains(table)) return null;
        return { cell: cell, table: table, note: note };
    }

    function triggerSave(note) {
        if (note) note.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ─── Widths ──────────────────────────────────────────────────────────────

    /** Rendered width (px) of every visual column. */
    function measureColumns(table, grid) {
        var count = columnCount(grid);
        var widths = [];
        var tableWidth = table.getBoundingClientRect().width;
        for (var c = 0; c < count; c++) {
            var single = columnCells(grid, c, true)[0];
            widths[c] = single ? single.getBoundingClientRect().width : 0;
        }
        // A column only covered by colspan cells has no own box: share what is left
        var known = widths.reduce(function (sum, w) { return sum + w; }, 0);
        var missing = widths.filter(function (w) { return !w; }).length;
        if (missing) {
            var share = Math.max(MIN_COLUMN_WIDTH, (tableWidth - known) / missing);
            widths = widths.map(function (w) { return w || share; });
        }
        return widths;
    }

    function applyWidths(grid, percents) {
        percents.forEach(function (pct, c) {
            columnCells(grid, c, true).forEach(function (cell) {
                cell.style.width = (Math.round(pct * 100) / 100) + '%';
            });
        });
        // A spanning cell must not impose a width of its own
        grid.forEach(function (row) {
            row.forEach(function (cell) {
                if (cell && cell.colSpan > 1 && cell.style.width) cell.style.removeProperty('width');
            });
        });
    }

    /**
     * Width (px) the cell needs to show its content without wrapping, padding
     * and borders included. Measured on an off-screen copy: the note itself
     * must not be touched (it would be seen as an edit).
     */
    function naturalCellWidth(cell) {
        var style = window.getComputedStyle(cell);
        var probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;width:max-content;';
        ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'wordSpacing', 'lineHeight', 'whiteSpace', 'textTransform']
            .forEach(function (prop) { probe.style[prop] = style[prop]; });
        Array.prototype.forEach.call(cell.childNodes, function (node) {
            probe.appendChild(node.cloneNode(true));
        });
        document.body.appendChild(probe);
        var content = probe.getBoundingClientRect().width;
        probe.remove();
        var edges = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
            .reduce(function (sum, prop) { return sum + (parseFloat(style[prop]) || 0); }, 0);
        return Math.ceil(content + edges);
    }

    /**
     * Sizes a column to its widest cell; the column on its right gives or
     * takes the difference so the rest of the table does not move.
     */
    function fitColumn(table, col) {
        var grid = buildGrid(table);
        if (col < 0 || col + 1 >= columnCount(grid)) return false;
        var widths = measureColumns(table, grid);
        var total = widths.reduce(function (sum, w) { return sum + w; }, 0);
        if (!total) return false;

        var wanted = MIN_COLUMN_WIDTH;
        columnCells(grid, col, true).forEach(function (cell) {
            wanted = Math.max(wanted, naturalCellWidth(cell));
        });
        var pair = widths[col] + widths[col + 1];
        var left = Math.min(wanted, pair - MIN_COLUMN_WIDTH);

        var percents = widths.map(function (w) { return w / total * 100; });
        percents[col] = left / total * 100;
        percents[col + 1] = (pair - left) / total * 100;
        applyWidths(grid, percents);
        return true;
    }

    function hasColumnWidths(table) {
        var grid = buildGrid(table);
        return grid.some(function (row) {
            return row.some(function (cell) { return cell && !!cell.style.width; });
        });
    }

    function resetColumnWidths(table) {
        var changed = false;
        Array.prototype.forEach.call(table.querySelectorAll('td, th'), function (cell) {
            if (cell.closest('table') !== table || !cell.style.width) return;
            cell.style.removeProperty('width');
            changed = true;
        });
        return changed;
    }

    // ─── Alignment ───────────────────────────────────────────────────────────

    function readAlignment(cell) {
        var value = window.getComputedStyle(cell).textAlign || '';
        if (value.indexOf('center') !== -1) return 'center';
        if (value === 'right' || value === 'end') return 'right';
        return 'left';
    }

    /** The cell itself, or the cells of its column / row. */
    function lineCells(table, cell, scope) {
        if (scope === 'cell') return [cell];
        var grid = buildGrid(table);
        if (scope === 'row') {
            var result = [];
            (grid[cell.parentElement.rowIndex] || []).forEach(function (target) {
                if (target && result.indexOf(target) === -1) result.push(target);
            });
            return result;
        }
        var cols = cellColumns(cell, grid);
        return cols ? columnCells(grid, cols.first, false) : [];
    }

    /** Alignment shared by the whole column / row, or null when mixed. */
    function readLineAlignment(table, cell, scope) {
        var cells = lineCells(table, cell, scope);
        if (!cells.length) return null;
        var first = readAlignment(cells[0]);
        return cells.every(function (target) { return readAlignment(target) === first; }) ? first : null;
    }

    function alignCells(table, cell, scope, align) {
        lineCells(table, cell, scope).forEach(function (target) {
            target.style.textAlign = align;
            // Pasted content may carry its own alignment, which would win
            Array.prototype.forEach.call(target.querySelectorAll('[style*="text-align"]'), function (el) {
                if (el.closest('td, th') === target) el.style.removeProperty('text-align');
            });
        });
    }

    /**
     * Gives a newly created cell the column format (alignment, width) of the
     * cell it was modelled on.
     */
    function copyColumnFormat(from, to) {
        if (!from || !to) return;
        if (from.style.textAlign) to.style.textAlign = from.style.textAlign;
        if (from.style.width && (from.colSpan || 1) === 1) to.style.width = from.style.width;
    }

    // ─── Resize guide ────────────────────────────────────────────────────────

    function getGuide() {
        if (!guide) {
            guide = document.createElement('div');
            guide.className = 'pz-col-resize-guide';
            document.body.appendChild(guide);
        }
        return guide;
    }

    function showGuide(table, x) {
        var rect = table.getBoundingClientRect();
        var g = getGuide();
        g.style.left = Math.round(x - 1) + 'px';
        g.style.top = rect.top + 'px';
        g.style.height = rect.height + 'px';
        g.style.display = 'block';
    }

    function hideGuide() {
        if (guide) guide.style.display = 'none';
    }

    /** X position (viewport) of the right edge of a visual column. */
    function borderX(grid, col) {
        var cells = columnCells(grid, col, true);
        if (!cells.length) cells = columnCells(grid, col, false);
        for (var i = 0; i < cells.length; i++) {
            var cols = cellColumns(cells[i], grid);
            if (cols && cols.last === col) return cells[i].getBoundingClientRect().right;
        }
        return null;
    }

    /**
     * Returns the inner border (index of the column on its left) the pointer
     * is on, or -1.
     */
    function findBorder(info, clientX) {
        if (window.getComputedStyle(info.table).direction === 'rtl') return -1;
        var grid = buildGrid(info.table);
        var count = columnCount(grid);
        var cols = cellColumns(info.cell, grid);
        if (!cols || count < 2) return -1;
        var rect = info.cell.getBoundingClientRect();
        if (Math.abs(clientX - rect.right) <= EDGE_TOLERANCE && cols.last < count - 1) return cols.last;
        if (Math.abs(clientX - rect.left) <= EDGE_TOLERANCE && cols.first > 0) return cols.first - 1;
        return -1;
    }

    function setHover(next) {
        if (hover && (!next || hover.table !== next.table)) {
            hover.table.classList.remove('pz-col-resize-hover');
        }
        hover = next;
        if (hover) {
            hover.table.classList.add('pz-col-resize-hover');
            var x = borderX(buildGrid(hover.table), hover.border);
            if (x !== null) showGuide(hover.table, x);
        } else {
            hideGuide();
        }
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    document.addEventListener('mousemove', function (e) {
        if (drag) {
            var dx = e.clientX - drag.startX;
            var pair = drag.widths[drag.border] + drag.widths[drag.border + 1];
            var left = Math.min(Math.max(drag.widths[drag.border] + dx, MIN_COLUMN_WIDTH), pair - MIN_COLUMN_WIDTH);
            var percents = drag.percents.slice();
            percents[drag.border] = left / drag.total * 100;
            percents[drag.border + 1] = (pair - left) / drag.total * 100;
            applyWidths(drag.grid, percents);
            drag.changed = true;
            var x = borderX(drag.grid, drag.border);
            if (x !== null) showGuide(drag.table, x);
            e.preventDefault();
            return;
        }

        // Plain hover only: a button held down belongs to a text or cell selection
        if (e.buttons) {
            if (hover) setHover(null);
            return;
        }
        var info = getEditableTableInfo(e.target);
        var border = info ? findBorder(info, e.clientX) : -1;
        if (border === -1) {
            if (hover) setHover(null);
            return;
        }
        if (!hover || hover.table !== info.table || hover.border !== border) {
            setHover({ table: info.table, note: info.note, border: border });
        }
    });

    // Capture phase: runs before the caret placement and the cell selection
    document.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || !hover) return;
        var info = getEditableTableInfo(e.target);
        if (!info || info.table !== hover.table || findBorder(info, e.clientX) !== hover.border) return;

        e.preventDefault();
        e.stopPropagation();

        var grid = buildGrid(hover.table);
        var widths = measureColumns(hover.table, grid);
        var total = widths.reduce(function (sum, w) { return sum + w; }, 0);
        if (!total) return;

        drag = {
            table: hover.table,
            note: hover.note,
            border: hover.border,
            grid: grid,
            startX: e.clientX,
            widths: widths,
            total: total,
            percents: widths.map(function (w) { return w / total * 100; }),
            changed: false
        };
        document.documentElement.classList.add('pz-col-resizing');
    }, true);

    document.addEventListener('mouseup', function () {
        if (!drag) return;
        var finished = drag;
        drag = null;
        document.documentElement.classList.remove('pz-col-resizing');
        setHover(null);
        if (finished.changed) triggerSave(finished.note);
    });

    // Double-click on a border: fit the column on its left to its content
    document.addEventListener('dblclick', function (e) {
        var info = getEditableTableInfo(e.target);
        var border = info ? findBorder(info, e.clientX) : -1;
        if (border === -1) return;
        e.preventDefault();
        e.stopPropagation();
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) sel.collapseToStart();
        if (fitColumn(info.table, border)) triggerSave(info.note);
        setHover(null);
    }, true);

    // The guide is positioned in the viewport: drop it when the note moves
    document.addEventListener('scroll', function () {
        if (hover && !drag) setHover(null);
    }, true);

    window.pzTableColumns = {
        alignCells: alignCells,
        readLineAlignment: readLineAlignment,
        hasColumnWidths: hasColumnWidths,
        resetColumnWidths: resetColumnWidths,
        copyColumnFormat: copyColumnFormat
    };
})();

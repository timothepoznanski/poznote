/**
 * Table cell selection, copy and paste for HTML (rich-text) notes.
 *
 * - Drag across cells of a table to select a rectangular range of cells
 * - Ctrl/Cmd+C or Ctrl/Cmd+X copies (cuts) the selected cells as an HTML
 *   table fragment plus TSV plain text
 * - Pasting tabular data (Poznote cells, Excel, TSV) into a table cell fills
 *   the cells one by one starting at the caret cell, adding rows/columns when
 *   the pasted block overflows the table
 * - Pasting a single value into a cell inserts it inline, without adding
 *   line breaks to the cell
 * - ArrowUp/ArrowDown on the first/last line of a cell move to the cell
 *   above/below instead of the previous/next cell of the row
 */
(function () {
    'use strict';

    var CELL_MARKER = '<!-- poznote-table-cells -->';
    var INTERNAL_MARKER = '<!-- poznote-internal -->';
    var BLOCK_TAG_REGEX = /<\/?(?:div|p|br|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|h[1-6]|blockquote|pre|hr|section|article|header|footer|form)\b/i;

    // Current cell selection state
    var anchorCell = null;      // cell where the mouse went down
    var focusCell = null;       // cell currently under the pointer while dragging
    var selectionTable = null;  // table containing the current selection
    var selectionActive = false;
    var mouseIsDown = false;
    var selectedCells = [];
    var pendingClipboard = null; // {html, text} to write on the next copy event

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Returns {cell, table, note} if the element is a cell of a table inside
     * an editable rich-text (non-markdown) note, null otherwise.
     */
    function getEditableCellInfo(el) {
        if (!el || !el.closest) return null;
        var cell = el.closest('td, th');
        if (!cell) return null;
        var note = cell.closest('.noteentry[contenteditable="true"]');
        if (!note || note.getAttribute('data-note-type') === 'markdown') return null;
        var table = cell.closest('table');
        if (!table) return null;
        return { cell: cell, table: table, note: note };
    }

    /**
     * Finds the table cell containing the caret (if any).
     */
    function getCaretCellInfo() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var node = sel.getRangeAt(0).startContainer;
        var el = node.nodeType === 1 ? node : node.parentElement;
        return getEditableCellInfo(el);
    }

    function triggerSave(note) {
        if (note) {
            note.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Cells render literal newlines as line breaks (white-space: pre-line),
     * so anything inserted into a cell must have its newlines collapsed.
     */
    function collapseNewlines(str) {
        return String(str || '').replace(/\s*[\r\n]+\s*/g, ' ');
    }

    /** True when the cell only holds placeholder whitespace (e.g. &nbsp;). */
    function cellIsEmpty(cell) {
        return cell.textContent.replace(/\u00a0/g, ' ').trim() === '' && !cell.querySelector('img');
    }

    function makeCell() {
        var cell = document.createElement('td');
        cell.style.cssText = 'border: 1px solid #ddd; padding: 8px; min-width: 50px;';
        cell.innerHTML = '&nbsp;';
        return cell;
    }

    // ─── Cell selection (mouse drag) ─────────────────────────────────────────

    function clearSelection() {
        selectedCells.forEach(function (c) { c.classList.remove('pz-cell-selected'); });
        selectedCells = [];
        if (selectionTable) selectionTable.classList.remove('pz-cell-selecting');
        selectionActive = false;
        anchorCell = null;
        focusCell = null;
        selectionTable = null;
    }

    function getSelectionRect() {
        var r1 = Math.min(anchorCell.parentElement.rowIndex, focusCell.parentElement.rowIndex);
        var r2 = Math.max(anchorCell.parentElement.rowIndex, focusCell.parentElement.rowIndex);
        var c1 = Math.min(anchorCell.cellIndex, focusCell.cellIndex);
        var c2 = Math.max(anchorCell.cellIndex, focusCell.cellIndex);
        return { r1: r1, r2: r2, c1: c1, c2: c2 };
    }

    function updateHighlight() {
        selectedCells.forEach(function (c) { c.classList.remove('pz-cell-selected'); });
        selectedCells = [];
        if (!anchorCell || !focusCell || !selectionTable) return;

        var rect = getSelectionRect();
        for (var r = rect.r1; r <= rect.r2; r++) {
            var row = selectionTable.rows[r];
            if (!row) continue;
            for (var c = rect.c1; c <= rect.c2; c++) {
                var cell = row.cells[c];
                if (cell) {
                    cell.classList.add('pz-cell-selected');
                    selectedCells.push(cell);
                }
            }
        }
    }

    document.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return; // keep the selection on right-click (context menu)
        clearSelection();
        var info = getEditableCellInfo(e.target);
        if (!info) return;
        anchorCell = info.cell;
        selectionTable = info.table;
        mouseIsDown = true;
    });

    document.addEventListener('mouseover', function (e) {
        if (!mouseIsDown || !anchorCell) return;
        var info = getEditableCellInfo(e.target);
        if (!info || info.table !== selectionTable) return;
        // While staying in the anchor cell, keep the native text selection
        if (!selectionActive && info.cell === anchorCell) return;

        if (!selectionActive) {
            selectionActive = true;
            selectionTable.classList.add('pz-cell-selecting');
        }
        focusCell = info.cell;
        updateHighlight();

        // Kill the native text selection started by the drag
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) sel.removeAllRanges();
    });

    document.addEventListener('mousemove', function () {
        if (!selectionActive || !mouseIsDown) return;
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) sel.removeAllRanges();
    });

    document.addEventListener('mouseup', function () {
        mouseIsDown = false;
        if (selectionTable) selectionTable.classList.remove('pz-cell-selecting');
        if (!selectionActive) {
            anchorCell = null;
            selectionTable = null;
        }
    });

    // ─── Copy / cut / delete of the selected cells ───────────────────────────

    function buildClipboardPayload() {
        var rect = getSelectionRect();
        var htmlRows = [];
        var textRows = [];

        for (var r = rect.r1; r <= rect.r2; r++) {
            var row = selectionTable.rows[r];
            var htmlCells = [];
            var textCells = [];
            for (var c = rect.c1; c <= rect.c2; c++) {
                var cell = row ? row.cells[c] : null;
                if (cell) {
                    var clone = cell.cloneNode(true);
                    clone.classList.remove('pz-cell-selected');
                    if (clone.getAttribute('class') === '') clone.removeAttribute('class');
                    htmlCells.push(clone.outerHTML);
                    textCells.push(cell.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());
                } else {
                    htmlCells.push('<td></td>');
                    textCells.push('');
                }
            }
            htmlRows.push('<tr>' + htmlCells.join('') + '</tr>');
            textRows.push(textCells.join('\t'));
        }

        // Clone the table element itself (class + style) so pasting outside a
        // table recreates a proper standalone table
        var tableClone = selectionTable.cloneNode(false);
        tableClone.classList.remove('pz-cell-selecting');
        tableClone.innerHTML = '<tbody>' + htmlRows.join('') + '</tbody>';

        return {
            html: CELL_MARKER + INTERNAL_MARKER + tableClone.outerHTML,
            text: textRows.join('\n')
        };
    }

    function copySelectedCells(isCut) {
        if (!anchorCell || !focusCell || !selectionTable) return;
        var note = selectionTable.closest('.noteentry');
        pendingClipboard = buildClipboardPayload();

        // execCommand('copy') needs a non-empty native selection: select a
        // temporary offscreen node, the copy event handler below then writes
        // the real payload to the clipboard
        var temp = document.createElement('span');
        temp.textContent = '\u200b';
        temp.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(temp);
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(temp);
        sel.removeAllRanges();
        sel.addRange(range);
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Cell copy error:', err);
        }
        sel.removeAllRanges();
        temp.remove();
        pendingClipboard = null;

        if (isCut) {
            clearSelectedCellContents(note);
        }
    }

    function clearSelectedCellContents(note) {
        selectedCells.forEach(function (cell) { cell.innerHTML = '&nbsp;'; });
        triggerSave(note || (selectionTable ? selectionTable.closest('.noteentry') : null));
    }

    /**
     * True when a native selection is anchored outside the table holding the
     * highlighted cells. The highlight survives mouseup (it is only cleared on
     * the next mousedown), so a keyboard-made text selection elsewhere means
     * the user has moved on and the cell selection is stale.
     */
    function isNativeSelectionOutsideTable() {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return false;
        var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
        return !!(el && selectionTable && !selectionTable.contains(el));
    }

    document.addEventListener('copy', function (e) {
        if (!e.clipboardData) return;
        // Ctrl/Cmd+C and cut set pendingClipboard just before execCommand.
        // The browser's native "Copy" menu item fires this event without it,
        // so build the payload on the fly when a cell range is highlighted.
        var payload = pendingClipboard;
        if (!payload && selectionActive && selectedCells.length > 0 &&
            anchorCell && focusCell && selectionTable) {
            if (isNativeSelectionOutsideTable()) {
                // Stale highlight: let the copy proceed on the real selection
                clearSelection();
                return;
            }
            payload = buildClipboardPayload();
        }
        if (!payload) return;
        e.clipboardData.setData('text/html', payload.html);
        e.clipboardData.setData('text/plain', payload.text);
        e.preventDefault();
        e.stopPropagation(); // keep the generic noteentry copy handler out of the way
        pendingClipboard = null;
    }, true);

    // On right-click over a highlighted cell range, place a native text
    // selection spanning those cells so the browser's context menu shows an
    // enabled "Copy" (which our copy handler then fills with the cell payload).
    document.addEventListener('contextmenu', function (e) {
        if (!selectionActive || selectedCells.length === 0) return;
        var info = getEditableCellInfo(e.target);
        if (!info || info.table !== selectionTable) return;

        var first = selectedCells[0];
        var last = selectedCells[selectedCells.length - 1];
        try {
            var range = document.createRange();
            range.setStartBefore(first.firstChild || first);
            range.setEndAfter(last.lastChild || last);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (err) {
            // If the DOM shape prevents a clean range, leave the selection as-is
            console.debug('table-cell-selection: isNativeSelectionOutsideTable() failed:', err);
        }
    }, true);

    document.addEventListener('keydown', function (e) {
        if (!selectionActive || selectedCells.length === 0) return;
        // A text selection made elsewhere after the drag means the cell
        // highlight is stale: drop it and let the keystroke act natively
        // (Ctrl+C must copy that text, not the old cells)
        if (isNativeSelectionOutsideTable()) {
            clearSelection();
            return;
        }
        var key = e.key ? e.key.toLowerCase() : '';
        var mod = e.ctrlKey || e.metaKey;

        if (mod && key === 'c') {
            e.preventDefault();
            e.stopPropagation();
            copySelectedCells(false);
        } else if (mod && key === 'x') {
            e.preventDefault();
            e.stopPropagation();
            copySelectedCells(true);
        } else if (key === 'delete' || key === 'backspace') {
            e.preventDefault();
            e.stopPropagation();
            clearSelectedCellContents();
        } else if (key === 'escape') {
            clearSelection();
        }
    }, true);

    // ─── ArrowUp/ArrowDown between rows ──────────────────────────────────────
    //
    // Chromium moves the caret off the last line of a cell to the next cell in
    // DOM order, so ArrowDown walked right along the row instead of down the
    // column (and ArrowUp walked left). Coming into a table from the line
    // above (below), it also always lands in the first (last) cell. Take over
    // those moves: go to the cell under the caret in the next row, or out of
    // the table past its last/first row. Moves between the lines of a
    // multi-line cell, and outside tables, stay native.

    function getEditableNote(node) {
        var el = node && (node.nodeType === 1 ? node : node.parentElement);
        var note = el ? el.closest('.noteentry[contenteditable="true"]') : null;
        return note && note.getAttribute('data-note-type') !== 'markdown' ? note : null;
    }

    function caretRangeAtPoint(x, y) {
        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y);
        }
        if (document.caretPositionFromPoint) {
            var pos = document.caretPositionFromPoint(x, y);
            if (!pos || !pos.offsetNode) return null;
            var range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            return range;
        }
        return null;
    }

    /**
     * Where the caret would go one line down (forward) or up: probes with
     * Selection.modify, then puts the caret back. Null when it cannot move.
     */
    function probeLineMove(sel, forward) {
        var saved = sel.getRangeAt(0).cloneRange();
        sel.modify('move', forward ? 'forward' : 'backward', 'line');
        var moved = sel.rangeCount ? sel.getRangeAt(0) : null;
        var dest = moved && (moved.startContainer !== saved.startContainer || moved.startOffset !== saved.startOffset)
            ? moved.startContainer
            : null;
        sel.removeAllRanges();
        sel.addRange(saved);
        return dest;
    }

    /** Horizontal position of the caret, used to pick the column. */
    function getCaretX(range) {
        var rect = range.getBoundingClientRect();
        if (rect.height) return rect.left;
        // A caret beside a lone <br> has no geometry: use the content edge of
        // its container (the border edge of a cell is the column boundary)
        var node = range.startContainer;
        var el = node.nodeType === 1 ? node : node.parentElement;
        var padding = parseFloat(window.getComputedStyle(el).paddingLeft) || 0;
        return el.getBoundingClientRect().left + el.clientLeft + padding;
    }

    /**
     * Cell of the given row under the horizontal position x, or the closest
     * cell of that row. Rows fully covered by rowspans above have no cells of
     * their own and are skipped. Null past the table edge.
     */
    function getCellInRow(table, index, x, forward) {
        var row = table.rows[index];
        while (row && row.cells.length === 0) {
            index += forward ? 1 : -1;
            row = table.rows[index];
        }
        if (!row) return null;

        var best = null;
        var bestDistance = Infinity;
        for (var i = 0; i < row.cells.length; i++) {
            var rect = row.cells[i].getBoundingClientRect();
            var distance = x < rect.left ? rect.left - x : (x > rect.right ? x - rect.right : 0);
            if (distance < bestDistance) {
                best = row.cells[i];
                bestDistance = distance;
            }
        }
        return best;
    }

    /** Somewhere the caret can sit: visible text, a line break or an image. */
    function isCaretStop(node) {
        var el = node.nodeType === 3 ? node.parentElement : node;
        if (!el || !el.isContentEditable) return false;
        if (node.nodeType === 3) return /\S| /.test(node.data);
        return node.nodeName === 'BR' || node.nodeName === 'IMG';
    }

    function lastDescendant(node) {
        while (node.lastChild) node = node.lastChild;
        return node;
    }

    /** Next (forward) or previous caret stop from the walker's current node. */
    function walkToCaretStop(walker, forward) {
        var node;
        while ((node = forward ? walker.nextNode() : walker.previousNode())) {
            if (isCaretStop(node)) return node;
        }
        return null;
    }

    /** First (forward) or last caret stop inside the element. */
    function getCaretStopIn(el, forward) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        if (!forward) {
            var last = lastDescendant(el);
            if (last !== el && isCaretStop(last)) return last;
            walker.currentNode = last;
        }
        return walkToCaretStop(walker, forward);
    }

    /**
     * First caret stop after the table (forward) or last one before it,
     * within `scope` (the note, or the cell holding a nested table).
     */
    function getCaretStopPast(table, scope, forward) {
        var walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        walker.currentNode = forward ? lastDescendant(table) : table;
        return walkToCaretStop(walker, forward);
    }

    /** Viewport rect of the first (forward) or last line of a caret stop. */
    function getStopLineRect(stop, forward) {
        var rects;
        if (stop.nodeType === 3) {
            var range = document.createRange();
            range.selectNodeContents(stop);
            rects = range.getClientRects();
        } else {
            rects = [stop.getBoundingClientRect()];
        }
        var lines = Array.prototype.filter.call(rects, function (r) { return r.height > 0; });
        return lines.length ? lines[forward ? 0 : lines.length - 1] : null;
    }

    /**
     * Puts the caret on the first (forward) or last line of `stop`, at the
     * horizontal position x kept inside `box`, when the position found there
     * passes `accept`. Otherwise at the near edge of `stop`.
     */
    function placeCaretAtStop(sel, stop, x, forward, box, accept) {
        var range = null;
        var boxRect = box.getBoundingClientRect();
        var inset = Math.min(4, boxRect.width / 2);
        var px = Math.min(Math.max(x, boxRect.left + inset), boxRect.right - inset);
        var line = getStopLineRect(stop, forward);
        if (line) {
            var py = line.top + line.height / 2;
            var hit = document.elementFromPoint(px, py);
            if (!hit || !accept(hit)) {
                // Off screen, or under a toolbar: bring the line into view
                box.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                boxRect = box.getBoundingClientRect();
                px = Math.min(Math.max(x, boxRect.left + inset), boxRect.right - inset);
                line = getStopLineRect(stop, forward);
                py = line ? line.top + line.height / 2 : py;
                hit = document.elementFromPoint(px, py);
            }
            if (hit && accept(hit)) range = caretRangeAtPoint(px, py);
        }
        if (!range || !accept(range.startContainer)) {
            range = document.createRange();
            if (stop.nodeType === 3) {
                range.setStart(stop, forward ? 0 : stop.length);
            } else {
                range.setStartBefore(stop);
            }
            range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function placeCaretInCell(sel, cell, x, forward) {
        var stop = getCaretStopIn(cell, forward);
        if (stop) {
            placeCaretAtStop(sel, stop, x, forward, cell, function (node) {
                return cell.contains(node);
            });
            return;
        }
        // Nothing in the cell (<td></td>)
        cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        var range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Moves the caret to the line after the table (forward) or before it,
     * within `scope`. Returns false, caret untouched, when the table ends
     * (starts) the scope.
     */
    function moveCaretPastTable(sel, table, scope, x, forward) {
        var stop = getCaretStopPast(table, scope, forward);
        if (!stop) return false;
        var el = stop.nodeType === 3 ? stop.parentElement : stop;
        var box = el.closest('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th') || el;
        placeCaretAtStop(sel, stop, x, forward, box, function (node) {
            return scope.contains(node) && !table.contains(node);
        });
        return true;
    }

    /**
     * Outermost table the node sits in that does not also hold `from`, i.e.
     * the table a caret coming from `from` enters.
     */
    function getEnteredTable(node, from) {
        var entered = null;
        var el = node.nodeType === 1 ? node : node.parentElement;
        var table = el ? el.closest('table') : null;
        while (table && !table.contains(from)) {
            entered = table;
            table = table.parentElement ? table.parentElement.closest('table') : null;
        }
        return entered;
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        // Open popups (slash menu, emoji picker...) handle the arrows first
        if (e.defaultPrevented || e.isComposing) return;
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || typeof sel.modify !== 'function') return;
        var caretNode = sel.getRangeAt(0).startContainer;
        var note = getEditableNote(caretNode);
        if (!note) return;

        var forward = e.key === 'ArrowDown';
        var dest = probeLineMove(sel, forward);
        var entered = dest && note.contains(dest) ? getEnteredTable(dest, caretNode) : null;
        // A table nested in another cell of the caret's table is not entered
        // from here: that is the DOM-order jump to fix, handled below
        var enteredFrom = entered && entered.parentElement.closest('td, th');
        if (enteredFrom && !enteredFrom.contains(caretNode)) entered = null;
        var info = entered ? null : getCaretCellInfo();
        // Moving within the cell, or not near a table at all: native move
        if (!entered && (!info || (dest && info.cell.contains(dest)))) return;

        var x = getCaretX(sel.getRangeAt(0));
        if (entered) {
            var first = getCellInRow(entered, forward ? 0 : entered.rows.length - 1, x, forward);
            if (!first) return;
            e.preventDefault();
            placeCaretInCell(sel, first, x, forward);
            return;
        }

        e.preventDefault();

        var cell = info.cell;
        var table = info.table;
        while (table) {
            var row = cell.parentElement;
            var index = forward ? row.rowIndex + Math.max(1, cell.rowSpan) : row.rowIndex - 1;
            var target = getCellInRow(table, index, x, forward);
            if (target) {
                placeCaretInCell(sel, target, x, forward);
                return;
            }
            // Past the edge row: the line after (before) the table, or, when
            // the table is the last (first) thing of a cell of an outer
            // table, the next row of that outer table
            var outerCell = table.parentElement.closest('td, th');
            if (outerCell && !note.contains(outerCell)) outerCell = null;
            if (moveCaretPastTable(sel, table, outerCell || note, x, forward)) return;
            cell = outerCell;
            table = outerCell ? outerCell.closest('table') : null;
        }
        // Nothing past the table: go to the end (start) of the cell, like a
        // textarea on its last (first) line
        var range = document.createRange();
        range.selectNodeContents(info.cell);
        range.collapse(!forward);
        sel.removeAllRanges();
        sel.addRange(range);
    });

    // ─── Paste into a table cell ─────────────────────────────────────────────

    /**
     * Parses clipboard data into a grid of {html, text} values.
     * Returns null when the clipboard does not contain tabular data.
     */
    function parseClipboardGrid(html, plain) {
        if (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var table = doc.querySelector('table');
            // Copies of cell ranges can come as bare <tr>/<td> fragments
            if (!table && /<t[rdh]\b/i.test(html)) {
                doc = new DOMParser().parseFromString('<table>' + html + '</table>', 'text/html');
                table = doc.querySelector('table');
            }
            if (table && table.rows.length > 0) {
                var grid = [];
                for (var r = 0; r < table.rows.length; r++) {
                    var rowVals = [];
                    var cells = table.rows[r].cells;
                    for (var c = 0; c < cells.length; c++) {
                        rowVals.push({ html: cells[c].innerHTML, text: cells[c].textContent });
                    }
                    if (rowVals.length) grid.push(rowVals);
                }
                if (grid.length) return grid;
            }
            return null;
        }

        // Tab-separated plain text (Excel / LibreOffice / TSV)
        if (plain && plain.indexOf('\t') !== -1) {
            var lines = plain.replace(/\r\n?/g, '\n').split('\n');
            while (lines.length && lines[lines.length - 1] === '') lines.pop();
            if (lines.length) {
                return lines.map(function (line) {
                    return line.split('\t').map(function (t) { return { html: null, text: t }; });
                });
            }
        }
        return null;
    }

    function setCellValue(cell, value, useHtml) {
        if (useHtml && value.html !== null && !BLOCK_TAG_REGEX.test(value.html)) {
            cell.innerHTML = collapseNewlines(value.html).trim() || '&nbsp;';
            return;
        }
        var text = (value.text || '').replace(/\u00a0/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').trim();
        if (text) {
            cell.textContent = text;
        } else {
            cell.innerHTML = '&nbsp;';
        }
    }

    /**
     * Distributes a grid of values cell by cell starting at startCell,
     * extending the table with rows/columns when the block overflows.
     */
    function fillCells(table, startCell, grid, useHtml) {
        var startRow = startCell.parentElement.rowIndex;
        var startCol = startCell.cellIndex;
        var gridCols = Math.max.apply(null, grid.map(function (r) { return r.length; }));
        var neededRows = startRow + grid.length;
        var neededCols = startCol + gridCols;

        var tableCols = 0;
        for (var i = 0; i < table.rows.length; i++) {
            tableCols = Math.max(tableCols, table.rows[i].cells.length);
        }

        // Add missing rows at the bottom
        var lastRow = table.rows[table.rows.length - 1];
        var section = lastRow.parentElement;
        while (table.rows.length < neededRows) {
            var tr = document.createElement('tr');
            var cols = Math.max(tableCols, neededCols);
            for (var j = 0; j < cols; j++) tr.appendChild(makeCell());
            section.appendChild(tr);
        }

        // Add missing columns on the right
        for (var r = 0; r < table.rows.length; r++) {
            var row = table.rows[r];
            while (row.cells.length < neededCols) row.appendChild(makeCell());
        }

        for (var gr = 0; gr < grid.length; gr++) {
            var targetRow = table.rows[startRow + gr];
            if (!targetRow) continue;
            for (var gc = 0; gc < grid[gr].length; gc++) {
                var target = targetRow.cells[startCol + gc];
                if (target) setCellValue(target, grid[gr][gc], useHtml);
            }
        }
    }

    /**
     * Inserts a single value at the caret, inline, without adding line breaks.
     */
    function insertInline(value, useHtml) {
        if (useHtml && value.html !== null && !BLOCK_TAG_REGEX.test(value.html)) {
            document.execCommand('insertHTML', false, collapseNewlines(value.html).trim());
            return;
        }
        var text = (value.text || '').replace(/\u00a0/g, ' ').replace(/\s*[\r\n]+\s*/g, ' ').trim();
        document.execCommand('insertText', false, text);
    }

    document.addEventListener('paste', function (e) {
        if (!e.clipboardData) return;

        // Determine the target cell: top-left of the active cell selection,
        // otherwise the cell containing the caret
        var info = null;
        var hasCellSelection = selectionActive && anchorCell && focusCell && selectionTable;
        if (hasCellSelection) {
            var rect = getSelectionRect();
            var startCell = selectionTable.rows[rect.r1] ? selectionTable.rows[rect.r1].cells[rect.c1] : null;
            if (startCell) {
                info = { cell: startCell, table: selectionTable, note: selectionTable.closest('.noteentry') };
            }
        }
        if (!info) info = getCaretCellInfo() || getEditableCellInfo(e.target);
        if (!info || !info.note) return;

        var html = e.clipboardData.getData('text/html') || '';
        var plain = e.clipboardData.getData('text/plain') || '';
        var isInternal = html.indexOf(CELL_MARKER) !== -1 || html.indexOf(INTERNAL_MARKER) !== -1;
        var grid = parseClipboardGrid(html, plain);

        if (grid && (grid.length > 1 || grid[0].length > 1)) {
            // Multi-cell block: distribute the values cell by cell
            e.preventDefault();
            e.stopPropagation();
            fillCells(info.table, info.cell, grid, isInternal);
            clearSelection();
            triggerSave(info.note);
            return;
        }

        // Writes a single value: into every selected cell, or replacing the
        // placeholder of an empty cell, or inline at the caret
        function applySingleValue(value, useHtml) {
            if (hasCellSelection) {
                selectedCells.forEach(function (cell) { setCellValue(cell, value, useHtml); });
                clearSelection();
            } else if (cellIsEmpty(info.cell)) {
                setCellValue(info.cell, value, useHtml);
            } else {
                insertInline(value, useHtml);
            }
        }

        if (grid) {
            // Single table cell: insert its value without the cell structure
            e.preventDefault();
            e.stopPropagation();
            applySingleValue(grid[0][0], isInternal);
            triggerSave(info.note);
            return;
        }

        // Non-tabular content aimed at a cell. Block-level HTML or literal
        // newlines would show up as line breaks in the cell (cells render
        // with white-space: pre-line): flatten to a single line. Clean inline
        // content is also intercepted when it must replace the placeholder of
        // an empty cell or fill a cell selection.
        var htmlBody = html ? html.replace(CELL_MARKER, '').replace(INTERNAL_MARKER, '') : '';
        var isBlocky = htmlBody ? BLOCK_TAG_REGEX.test(htmlBody) : false;
        var hasNewlines = htmlBody ? /[\r\n]/.test(htmlBody) : /[\r\n]/.test(plain);
        var replacesCell = hasCellSelection || cellIsEmpty(info.cell);
        if (!isBlocky && !hasNewlines && !replacesCell) return; // the normal paste pipeline is fine
        if (!htmlBody && !plain) return; // nothing to insert (e.g. image paste)
        // Keep the dedicated URL→link and iframe embed pipelines working
        if (!htmlBody && /^(https?:\/\/|ftp:\/\/)\S+$/i.test(plain.trim())) return;
        if (!htmlBody && /<iframe\s/i.test(plain)) return;

        e.preventDefault();
        e.stopPropagation();
        // Keep inline formatting for Poznote-internal content, otherwise
        // fall back to plain text (external HTML may carry conflicting styles)
        var value = (htmlBody && !isBlocky && isInternal)
            ? { html: htmlBody, text: plain }
            : { html: null, text: plain };
        applySingleValue(value, value.html !== null);
        triggerSave(info.note);
    }, true);

    // Let other modules (e.g. the table context menu) know whether a cell
    // range is currently highlighted, and in which table.
    window.pzTableCellSelection = {
        isActive: function () {
            return selectionActive && selectedCells.length > 0;
        },
        getTable: function () {
            return selectionActive && selectedCells.length > 0 ? selectionTable : null;
        }
    };

})();

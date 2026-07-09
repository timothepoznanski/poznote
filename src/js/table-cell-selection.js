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

    document.addEventListener('copy', function (e) {
        if (!e.clipboardData) return;
        // Ctrl/Cmd+C and cut set pendingClipboard just before execCommand.
        // The browser's native "Copy" menu item fires this event without it,
        // so build the payload on the fly when a cell range is highlighted.
        var payload = pendingClipboard;
        if (!payload && selectionActive && selectedCells.length > 0 &&
            anchorCell && focusCell && selectionTable) {
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
        }
    }, true);

    document.addEventListener('keydown', function (e) {
        if (!selectionActive || selectedCells.length === 0) return;
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

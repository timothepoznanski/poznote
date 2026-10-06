// Table formulas: a cell that shows the sum, average, minimum, maximum, count
// or product of its row or of its column (discussion #1586). There are no cell references, a formula
// always reads the whole line it sits on, so inserting or deleting rows and
// columns needs no bookkeeping.
//
// HTML notes carry the formula as <td data-formula="sum-col"> and keep the
// computed value as the cell's text, so everything that knows nothing about
// formulas (export, search, API, public page) shows the last total.
// Markdown notes write it in the source cell as =SUM(col), =MAX(row)... and
// both renderers compute it (resolveMarkdownRows here, and
// resolveMarkdownTableFormulas() in markdown_parser.php: keep them in step).
(function () {
    'use strict';

    // data-formula is "<kind>-<axis>": sum-col, avg-row...
    var KINDS = ['sum', 'avg', 'min', 'max', 'count', 'prod'];
    var MARKDOWN_NAMES = { sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX', count: 'COUNT', prod: 'PRODUCT' };
    var FORMULAS = [];
    KINDS.forEach(function (kind) {
        FORMULAS.push(kind + '-col', kind + '-row');
    });

    // A row formula can feed a column formula and the other way round
    // (grand total), so the grid is resolved in a few passes
    var MAX_PASSES = 4;

    // sign, currency, number, then %, currency. Anything else around the
    // digits ("Phase 2", "3 kg", a date) makes the cell text, not a number.
    var NUMBER_RE = /^([-+−]?)\s*(\p{Sc}|[A-Z]{3})?(\s*)([-+−]?)\s*(\d(?:[\d.,' ]*\d)?|[.,]\d+)(\s*)(%|\p{Sc}|[A-Z]{3})?$/u;
    var GROUPED_RE = /^\d{1,3}(?:[.,' ]\d{3})+$/;
    var TOKEN_RE = /^([*_~]*)=\s*(sum|avg|average|min|max|count|prod|product)\s*\(\s*(col|column|row)\s*\)([*_~]*)$/i;

    function isFormula(name) {
        return FORMULAS.indexOf(name) !== -1;
    }

    function isRowFormula(name) {
        return name.slice(-3) === 'row';
    }

    function kindOf(name) {
        return name.split('-')[0];
    }

    /**
     * Reads a cell as a number: "1 234,56 €", "$1,234.56", "-12", "45%".
     * Returns null when the cell is not a number.
     */
    function parseNumber(text) {
        var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
            .replace(/^[*_~`]+|[*_~`]+$/g, '').trim();
        var m = NUMBER_RE.exec(s);
        if (!m || (m[1] && m[4])) return null;

        var body = m[5];
        var dots = body.split('.').length - 1;
        var commas = body.split(',').length - 1;
        var decimalSep = '';
        if (dots && commas) {
            decimalSep = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
        } else if (commas === 1 && !/^\d{1,3},\d{3}$/.test(body)) {
            decimalSep = ',';
        } else if (dots === 1) {
            decimalSep = '.';
        }

        var cut = decimalSep ? body.lastIndexOf(decimalSep) : body.length;
        var whole = body.slice(0, cut);
        var fraction = body.slice(cut + 1);
        // Separators left in the whole part must group thousands, which
        // keeps dates and phone numbers out
        if (!/^\d*$/.test(whole) && !GROUPED_RE.test(whole)) return null;
        if (!/^\d*$/.test(fraction)) return null;

        var value = parseFloat((whole.replace(/\D/g, '') || '0') + '.' + (fraction || '0'));
        if (!isFinite(value)) return null;
        var sign = m[1] || m[4];
        if (sign === '-' || sign === '−') value = -value;

        return {
            value: value,
            decimals: fraction.length,
            comma: decimalSep === ',',
            prefix: m[2] ? m[2] + m[3] : '',
            suffix: m[7] ? m[6] + m[7] : ''
        };
    }

    /**
     * toFixed() rounds the binary value (1.7525 gives 1.752); this rounds the
     * decimal one, as PHP's number_format() does
     */
    function roundHalfUp(value, decimals) {
        var rounded = Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
        return (isFinite(rounded) ? rounded : value).toFixed(decimals);
    }

    /**
     * Whether the numbers carry different currencies or units ("2 €" and
     * "$3", or euros and a percentage): no total of those means anything
     */
    function hasMixedUnits(numbers) {
        var unit = null;
        return numbers.some(function (n) {
            var own = n.prefix.trim() || n.suffix.trim();
            if (!own) return false;
            if (unit === null) unit = own;
            return own !== unit;
        });
    }

    /**
     * What a formula cell shows when its cells cannot be computed together
     */
    function incompatibleText() {
        var fallback = 'Incompatible formula';
        return typeof window.t === 'function' ? window.t('table.context_menu.formula_incompatible', null, fallback) : fallback;
    }

    /**
     * The one currency (or unit sign) found among the numbers, '' when they
     * disagree. A product reads "2" x "2,50 €" as euros.
     */
    function commonAffix(numbers, key, ignoreEmpty) {
        var found = null;
        for (var i = 0; i < numbers.length; i++) {
            var affix = numbers[i][key];
            if (ignoreEmpty && affix === '') continue;
            if (found === null) {
                found = affix;
            } else if (found.trim() !== affix.trim()) {
                return '';
            }
        }
        return found || '';
    }

    /**
     * The text a formula cell shows for the given cells of its line. The
     * result takes the decimals, decimal separator and currency of the cells.
     */
    function compute(formula, texts) {
        var kind = kindOf(formula);
        var numbers = [];
        texts.forEach(function (text) {
            var parsed = parseNumber(text);
            if (!parsed) return;
            // In a product a percentage is a rate: 200 x 20% is 40
            if (kind === 'prod' && parsed.suffix.trim() === '%') {
                parsed.value /= 100;
                parsed.rateDecimals = 2;
                parsed.suffix = '';
            }
            numbers.push(parsed);
        });
        if (kind === 'count') return String(numbers.length);
        if (!numbers.length) return '0';
        if (hasMixedUnits(numbers)) return incompatibleText();

        var value = kind === 'prod' ? 1 : (kind === 'min' || kind === 'max' ? numbers[0].value : 0);
        var inputDecimals = 0;
        var decimalsTotal = 0;
        var comma = null;
        numbers.forEach(function (n) {
            if (kind === 'prod') value *= n.value;
            else if (kind === 'min') value = Math.min(value, n.value);
            else if (kind === 'max') value = Math.max(value, n.value);
            else value += n.value;
            inputDecimals = Math.max(inputDecimals, n.decimals);
            decimalsTotal += n.decimals + (n.rateDecimals || 0);
            if (comma === null && n.decimals) comma = n.comma;
        });
        if (kind === 'avg') value /= numbers.length;
        inputDecimals = Math.min(inputDecimals, 10);

        var decimals = inputDecimals;
        if (kind === 'avg') decimals = Math.max(inputDecimals, 2);
        if (kind === 'prod') decimals = Math.min(decimalsTotal, 10);
        var out = roundHalfUp(Math.abs(value), decimals);
        // An average or a product only keeps the extra decimals it needs
        while (decimals > inputDecimals && out.charAt(out.length - 1) === '0') {
            out = out.slice(0, -1);
            decimals--;
        }
        if (out.charAt(out.length - 1) === '.') out = out.slice(0, -1);

        var negative = value < 0 && parseFloat(out) !== 0;
        if (comma) out = out.replace('.', ',');

        return (negative ? '-' : '') + commonAffix(numbers, 'prefix', kind === 'prod') + out + commonAffix(numbers, 'suffix', kind === 'prod');
    }

    /**
     * Fills in the text of every formula cell of a grid (rows of
     * { text, formula, header }). A formula skips header cells and the other
     * formulas of its own direction, so a total never counts the average
     * next to it, while a column total does add up the row totals above it.
     */
    function resolveGrid(grid) {
        var entries = [];
        grid.forEach(function (row, r) {
            row.forEach(function (cell, c) {
                if (cell.formula) entries.push({ cell: cell, r: r, c: c });
            });
        });
        if (!entries.length) return;

        for (var pass = 0; pass < MAX_PASSES; pass++) {
            var changed = false;
            entries.forEach(function (entry) {
                var byRow = isRowFormula(entry.cell.formula);
                var line = byRow ? grid[entry.r] : grid.map(function (row) { return row[entry.c]; });
                var texts = [];
                line.forEach(function (other) {
                    if (!other || other === entry.cell || other.header) return;
                    if (other.formula && isRowFormula(other.formula) === byRow) return;
                    texts.push(other.text);
                });
                var value = compute(entry.cell.formula, texts);
                if (value !== entry.cell.text) {
                    entry.cell.text = value;
                    changed = true;
                }
            });
            if (!changed) break;
        }
    }

    // ─── Markdown ────────────────────────────────────────────────────────────

    function markdownToken(formula) {
        if (!isFormula(formula)) return '';
        return '=' + MARKDOWN_NAMES[kindOf(formula)] + '(' + (isRowFormula(formula) ? 'row' : 'col') + ')';
    }

    /**
     * Reads a source cell such as "=SUM(col)" or "**=avg(row)**"
     */
    function parseMarkdownToken(text) {
        var m = TOKEN_RE.exec(String(text == null ? '' : text).trim());
        if (!m) return null;
        var name = m[2].toLowerCase();
        var kind = name === 'average' ? 'avg' : (name === 'product' ? 'prod' : name);
        return {
            formula: kind + '-' + (m[3].toLowerCase() === 'row' ? 'row' : 'col'),
            open: m[1],
            close: m[4]
        };
    }

    /**
     * Replaces the formula cells of a parsed Markdown table (rows of
     * { cells, isHeader }) with their value, and records them in
     * row.formulas so the renderer can mark the cell.
     */
    function resolveMarkdownRows(tableRows) {
        var found = false;
        var tokens = [];
        var grid = tableRows.map(function (row, r) {
            var header = r === 0 && !!row.isHeader;
            tokens.push([]);
            return row.cells.map(function (text, c) {
                var token = header ? null : parseMarkdownToken(text);
                tokens[r][c] = token;
                if (token) found = true;
                return { text: token ? '' : text, formula: token ? token.formula : null, header: header };
            });
        });
        if (!found) return;

        resolveGrid(grid);
        tableRows.forEach(function (row, r) {
            row.formulas = [];
            tokens[r].forEach(function (token, c) {
                if (!token) return;
                row.cells[c] = token.open + grid[r][c].text + token.close;
                row.formulas[c] = token.formula;
            });
        });
    }

    // ─── HTML notes ──────────────────────────────────────────────────────────

    function readFormula(cell) {
        if (!cell || cell.tagName !== 'TD') return null;
        var name = cell.getAttribute('data-formula');
        return isFormula(name) ? name : null;
    }

    /**
     * Writes the value in place of the cell's text, keeping the formatting
     * (a bold total stays bold) when the cell holds a single run of text
     */
    function writeCellText(cell, value) {
        var walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        var textNodes = [];
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.trim() !== '') textNodes.push(walker.currentNode);
        }
        if (textNodes.length === 1) {
            textNodes[0].nodeValue = value;
        } else {
            cell.textContent = value;
        }
    }

    /**
     * Brings the formula cells of an HTML table up to date. Only touches the
     * cells whose value changed, and returns whether any did.
     */
    function recomputeTable(table) {
        if (!table || !table.querySelector('td[data-formula]')) return false;

        var shown = [];
        var grid = Array.prototype.map.call(table.rows, function (row) {
            return Array.prototype.map.call(row.cells, function (cell) {
                var entry = {
                    el: cell,
                    text: cell.textContent.trim(),
                    formula: readFormula(cell),
                    header: cell.tagName === 'TH'
                };
                if (entry.formula) shown.push({ entry: entry, text: entry.text });
                return entry;
            });
        });

        resolveGrid(grid);
        var changed = false;
        shown.forEach(function (item) {
            if (item.entry.text === item.text) return;
            writeCellText(item.entry.el, item.entry.text);
            changed = true;
        });
        return changed;
    }

    function recomputeNote(noteentry) {
        if (!noteentry || !noteentry.querySelector('td[data-formula]')) return;
        Array.prototype.forEach.call(noteentry.querySelectorAll('table'), recomputeTable);
    }

    /**
     * Turns a cell into a formula cell, or back into a plain cell that keeps
     * the last value (formula = null)
     */
    function setFormula(table, cell, formula) {
        if (!table || !cell || cell.tagName !== 'TD') return false;
        if (formula) {
            if (!isFormula(formula)) return false;
            cell.setAttribute('data-formula', formula);
        } else {
            cell.removeAttribute('data-formula');
        }
        recomputeTable(table);
        return true;
    }

    function formulaCellOf(node) {
        var el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
        var cell = el ? el.closest('td[data-formula]') : null;
        return cell && cell.closest('.noteentry[contenteditable="true"]') ? cell : null;
    }

    // Totals follow every edit of the note, table menu actions included
    document.addEventListener('input', function (e) {
        var noteentry = e.target && e.target.closest ? e.target.closest('.noteentry') : null;
        recomputeNote(noteentry);
    });

    // A note changed elsewhere (API, another device) shows fresh totals as
    // soon as it is entered
    document.addEventListener('focusin', function (e) {
        var noteentry = e.target && e.target.closest ? e.target.closest('.noteentry[contenteditable="true"]') : null;
        recomputeNote(noteentry);
    });

    // The value of a formula cell is computed: typing in it would be
    // overwritten by the next edit, so it is refused
    document.addEventListener('beforeinput', function (e) {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        var cell = formulaCellOf(sel.anchorNode);
        if (cell && cell === formulaCellOf(sel.focusNode)) {
            e.preventDefault();
        }
    });

    window.pzTableFormulas = {
        FORMULAS: FORMULAS,
        KINDS: KINDS,
        parseNumber: parseNumber,
        compute: compute,
        resolveGrid: resolveGrid,
        markdownToken: markdownToken,
        parseMarkdownToken: parseMarkdownToken,
        resolveMarkdownRows: resolveMarkdownRows,
        readFormula: readFormula,
        recomputeTable: recomputeTable,
        setFormula: setFormula
    };
})();

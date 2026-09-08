// Markdown list and table editing for Poznote.
//
// Source-level formatting of ordered lists and pipe tables (renumbering, cell
// padding, alignment rows) plus the keyboard handlers that keep them tidy while
// typing: Enter/Tab inside a table or an ordered list.
//
// This is about editing the markdown *source*. Rendering tables and lists to
// HTML lives in markdown-parser.js.

function renumberMarkdownOrderedListLines(lines) {
    var renumberedLines = lines.slice();
    var orderedContexts = [];
    var fencePattern = /^[ \t]*```/;
    var orderedLinePattern = /^([ \t]*)(\d+(?:\.\d+)*)(\.\s+.*)$/;
    var unorderedLinePattern = /^([ \t]*)(?:[\*\-\+]\s+(?:\[[ xX]\]\s+)?.*)$/;
    var inFencedCodeBlock = false;

    for (var i = 0; i < renumberedLines.length; i++) {
        var line = renumberedLines[i];
        if (fencePattern.test(line)) {
            inFencedCodeBlock = !inFencedCodeBlock;
            orderedContexts = [];
            continue;
        }

        if (inFencedCodeBlock || line.trim() === '') {
            continue;
        }

        var orderedMatch = line.match(orderedLinePattern);
        if (orderedMatch) {
            var orderedIndentWidth = getMarkdownIndentWidth(orderedMatch[1]);
            while (orderedContexts.length > 0 && orderedContexts[orderedContexts.length - 1].indent > orderedIndentWidth) {
                orderedContexts.pop();
            }

            if (orderedContexts.length === 0) {
                orderedContexts.push({ indent: orderedIndentWidth, count: 1 });
            } else if (orderedContexts[orderedContexts.length - 1].indent === orderedIndentWidth) {
                orderedContexts[orderedContexts.length - 1].count++;
            } else {
                orderedContexts.push({ indent: orderedIndentWidth, count: 1 });
            }

            renumberedLines[i] = orderedMatch[1] + orderedContexts.map(function (context) {
                return context.count;
            }).join('.') + orderedMatch[3];
            continue;
        }

        var unorderedMatch = line.match(unorderedLinePattern);
        if (unorderedMatch) {
            var unorderedIndentWidth = getMarkdownIndentWidth(unorderedMatch[1]);
            while (orderedContexts.length > 0 && orderedContexts[orderedContexts.length - 1].indent >= unorderedIndentWidth) {
                orderedContexts.pop();
            }
            continue;
        }

        var leadingWhitespaceMatch = line.match(/^([ \t]*)/);
        var otherIndentWidth = getMarkdownIndentWidth(leadingWhitespaceMatch ? leadingWhitespaceMatch[1] : '');

        if (otherIndentWidth === 0) {
            orderedContexts = [];
            continue;
        }

        while (orderedContexts.length > 0 && orderedContexts[orderedContexts.length - 1].indent >= otherIndentWidth) {
            orderedContexts.pop();
        }
    }

    return renumberedLines;
}

function buildMarkdownEmptyTableRow(cellCount, indent) {
    var safeCount = Math.max(1, cellCount || 0);
    return (indent || '') + '|' + new Array(safeCount + 1).join('   |');
}

function splitMarkdownTableLineCells(line) {
    var text = String(line || '');
    var indentMatch = text.match(/^[ \t]*/);
    var trimmed = text.trim();
    if (!trimmed || trimmed.indexOf('|') === -1) {
        return null;
    }

    var inner = trimmed;
    if (inner.charAt(0) === '|') {
        inner = inner.slice(1);
    }
    if (inner.length && inner.charAt(inner.length - 1) === '|') {
        var backslashes = 0;
        for (var b = inner.length - 2; b >= 0 && inner.charAt(b) === '\\'; b--) {
            backslashes++;
        }
        if (backslashes % 2 === 0) {
            inner = inner.slice(0, -1);
        }
    }

    var cells = [];
    var current = '';
    for (var i = 0; i < inner.length; i++) {
        var ch = inner.charAt(i);
        if (ch === '\\' && i + 1 < inner.length) {
            current += ch + inner.charAt(i + 1);
            i++;
            continue;
        }
        if (ch === '|') {
            cells.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    cells.push(current.trim());

    return { indent: indentMatch ? indentMatch[0] : '', cells: cells };
}

function padMarkdownTableCell(content, width, alignment) {
    var missing = Math.max(0, width - content.length);
    if (alignment === 'right') {
        return ' '.repeat(missing) + content;
    }
    if (alignment === 'center') {
        var before = Math.floor(missing / 2);
        return ' '.repeat(before) + content + ' '.repeat(missing - before);
    }
    return content + ' '.repeat(missing);
}

function buildMarkdownTableSeparatorCell(width, alignment) {
    if (alignment === 'center') {
        return ':' + '-'.repeat(Math.max(1, width - 2)) + ':';
    }
    if (alignment === 'right') {
        return '-'.repeat(Math.max(1, width - 1)) + ':';
    }
    if (alignment === 'left') {
        return ':' + '-'.repeat(Math.max(1, width - 1));
    }
    return '-'.repeat(Math.max(3, width));
}

// Like splitMarkdownTableLineCells, but keeps the raw (untrimmed) cell text and
// its character offsets within the line, so a caret position can be mapped from
// the unformatted line to the formatted one.
function splitMarkdownTableLineCellsWithPositions(line) {
    var text = String(line || '');
    var indentMatch = text.match(/^[ \t]*/);
    var indent = indentMatch ? indentMatch[0] : '';
    if (text.indexOf('|', indent.length) === -1) {
        return null;
    }

    var pos = indent.length;
    if (text.charAt(pos) === '|') {
        pos++;
    }

    var trimmedEnd = text.length;
    while (trimmedEnd > pos && /\s/.test(text.charAt(trimmedEnd - 1))) {
        trimmedEnd--;
    }
    var endLimit = text.length;
    if (trimmedEnd > pos && text.charAt(trimmedEnd - 1) === '|') {
        var backslashes = 0;
        for (var q = trimmedEnd - 2; q >= 0 && text.charAt(q) === '\\'; q--) {
            backslashes++;
        }
        if (backslashes % 2 === 0) {
            endLimit = trimmedEnd - 1;
        }
    }

    var cells = [];
    var cellStart = pos;
    var i = pos;
    while (i < endLimit) {
        var ch = text.charAt(i);
        if (ch === '\\' && i + 1 < endLimit) {
            i += 2;
            continue;
        }
        if (ch === '|') {
            cells.push({ raw: text.slice(cellStart, i), start: cellStart, end: i });
            cellStart = i + 1;
        }
        i++;
    }
    cells.push({ raw: text.slice(cellStart, endLimit), start: cellStart, end: endLimit });

    return { indent: indent, cells: cells };
}

// Aligns every column of a markdown table block (header + separator + rows) to the
// width of its widest cell, so pipes line up in the raw source.
//
// caret (optional): { line, ch } within the block. The caret cell's whitespace is
// preserved up to the caret (a save firing mid-typing must not eat a space the
// user just typed), the caret row keeps its own cell count, and the returned
// caret gives the equivalent position in the formatted block.
//
// Returns { lines, caret } or null when the input is not a well-formed table block.
function formatMarkdownTableBlock(tableLines, caret) {
    if (!tableLines || tableLines.length < 2) {
        return null;
    }

    var parsed = [];
    var separatorFlags = [];
    for (var i = 0; i < tableLines.length; i++) {
        var cellsInfo = splitMarkdownTableLineCells(tableLines[i]);
        if (!cellsInfo || cellsInfo.cells.length === 0) {
            return null;
        }
        parsed.push(cellsInfo);
        separatorFlags.push(isMarkdownTableSeparatorLine(tableLines[i]));
    }

    var separatorIndex = separatorFlags.indexOf(true);
    if (separatorIndex === -1) {
        return null;
    }

    var caretInfo = null;
    if (caret && caret.line >= 0 && caret.line < tableLines.length && !separatorFlags[caret.line]) {
        var positioned = splitMarkdownTableLineCellsWithPositions(tableLines[caret.line]);
        if (positioned && positioned.cells.length > 0) {
            var lineText = String(tableLines[caret.line]);
            var chOffset = Math.max(0, Math.min(caret.ch, lineText.length));
            var cellIndex = positioned.cells.length;
            var rawOffset = 0;
            for (var k = 0; k < positioned.cells.length; k++) {
                if (chOffset <= positioned.cells[k].end) {
                    cellIndex = k;
                    rawOffset = Math.max(0, chOffset - positioned.cells[k].start);
                    break;
                }
            }
            caretInfo = { cellIndex: cellIndex, inCell: 0 };
            if (cellIndex < positioned.cells.length) {
                var raw = positioned.cells[cellIndex].raw;
                var leadingLength = (raw.match(/^\s*/) || [''])[0].length;
                var keepEnd = Math.max(leadingLength + raw.trim().length, Math.min(rawOffset, raw.length));
                var preserved = raw.slice(leadingLength, keepEnd);
                parsed[caret.line].cells[cellIndex] = preserved;
                caretInfo.inCell = Math.max(0, Math.min(rawOffset - leadingLength, preserved.length));
            }
        }
    }

    var columnCount = 0;
    parsed.forEach(function (info) {
        columnCount = Math.max(columnCount, info.cells.length);
    });

    var alignments = [];
    var widths = [];
    for (var col = 0; col < columnCount; col++) {
        var separatorCell = (parsed[separatorIndex].cells[col] || '').trim();
        var alignLeft = separatorCell.charAt(0) === ':';
        var alignRight = separatorCell.charAt(separatorCell.length - 1) === ':';
        alignments.push(alignLeft && alignRight ? 'center' : (alignRight ? 'right' : (alignLeft ? 'left' : '')));

        var width = 3;
        parsed.forEach(function (info, rowIndex) {
            if (separatorFlags[rowIndex]) {
                return;
            }
            var cell = info.cells[col] || '';
            if (cell.length > width) {
                width = cell.length;
            }
        });
        widths.push(width);
    }

    var indent = parsed[0].indent;
    var caretResult = null;
    var formattedLines = tableLines.map(function (line, rowIndex) {
        var isCaretRow = !!(caretInfo && caret.line === rowIndex);
        var rowColumnCount = isCaretRow ? parsed[rowIndex].cells.length : columnCount;
        var cells = [];
        var caretCh = -1;
        for (var col = 0; col < rowColumnCount; col++) {
            if (separatorFlags[rowIndex]) {
                cells.push(buildMarkdownTableSeparatorCell(widths[col], alignments[col]));
                continue;
            }

            var content = parsed[rowIndex].cells[col] || '';
            if (isCaretRow && col === caretInfo.cellIndex) {
                var missing = Math.max(0, widths[col] - content.length);
                var padBefore = alignments[col] === 'right'
                    ? missing
                    : (alignments[col] === 'center' ? Math.floor(missing / 2) : 0);
                var prefixLength = indent.length + 2;
                for (var j = 0; j < col; j++) {
                    prefixLength += widths[j] + 3;
                }
                caretCh = prefixLength + padBefore + caretInfo.inCell;
            }
            cells.push(padMarkdownTableCell(content, widths[col], alignments[col]));
        }

        var formattedLine = indent + '| ' + cells.join(' | ') + ' |';
        if (isCaretRow) {
            caretResult = {
                line: rowIndex,
                ch: caretCh === -1 ? formattedLine.length : Math.min(caretCh, formattedLine.length)
            };
        }
        return formattedLine;
    });

    return { lines: formattedLines, caret: caretResult };
}

function formatMarkdownTableBlockLines(tableLines) {
    var result = formatMarkdownTableBlock(tableLines, null);
    return result ? result.lines : null;
}

// Formats the table block containing lines[lineIndex] in place.
// Returns { start, end } (inclusive line indexes) when a table was formatted, else null.
function formatMarkdownTableAtLine(lines, lineIndex) {
    if (!lines || lineIndex < 0 || lineIndex >= lines.length || !isMarkdownTableRowLine(lines[lineIndex] || '')) {
        return null;
    }

    var start = lineIndex;
    while (start > 0 && isMarkdownTableRowLine(lines[start - 1] || '')) {
        start--;
    }
    var end = lineIndex;
    while (end + 1 < lines.length && isMarkdownTableRowLine(lines[end + 1] || '')) {
        end++;
    }

    var formatted = formatMarkdownTableBlockLines(lines.slice(start, end + 1));
    if (!formatted) {
        return null;
    }

    for (var i = 0; i < formatted.length; i++) {
        lines[start + i] = formatted[i];
    }

    return { start: start, end: end };
}

// Called from the auto-save path: re-aligns every table in the note's CodeMirror
// editor. The caret's own table is formatted with caret tracking (its cell keeps
// the whitespace typed so far and the caret is remapped to the aligned position);
// tables overlapping a non-empty selection are left untouched so the selection
// isn't invalidated, and a separator line being hand-edited is left alone too.
function formatMarkdownTablesBeforeSave(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) {
        return;
    }

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var api = window.PoznoteMarkdownCodeMirror;
    if (!editorDiv || !api ||
        typeof api.isCodeMirrorEditor !== 'function' || !api.isCodeMirrorEditor(editorDiv) ||
        typeof api.replaceRangeKeepSelection !== 'function' || typeof api.getValue !== 'function') {
        return;
    }

    var content = api.getValue(editorDiv);
    if (!content || content.indexOf('|') === -1) {
        return;
    }

    var lines = content.split('\n');
    var lineStarts = getMarkdownLineStartOffsets(content);

    var selectionStartLine = -1;
    var selectionEndLine = -1;
    var selectionOffsets = null;
    if (typeof api.hasFocus === 'function' && api.hasFocus(editorDiv) &&
        typeof api.getSelectionOffsets === 'function') {
        selectionOffsets = api.getSelectionOffsets(editorDiv);
        if (selectionOffsets) {
            selectionStartLine = getMarkdownLineIndexForOffset(lineStarts, selectionOffsets.start);
            selectionEndLine = getMarkdownLineIndexForOffset(lineStarts, selectionOffsets.end);
        }
    }

    var blocks = [];
    for (var i = 0; i < lines.length; i++) {
        if (isMarkdownTableRowLine(lines[i] || '')) {
            var start = i;
            while (i + 1 < lines.length && isMarkdownTableRowLine(lines[i + 1] || '')) {
                i++;
            }
            blocks.push({ start: start, end: i });
        }
    }

    // Bottom-up so the offsets of the blocks still to process stay valid
    var changed = false;
    for (var b = blocks.length - 1; b >= 0; b--) {
        var block = blocks[b];
        var caret = null;
        if (selectionStartLine <= block.end && selectionEndLine >= block.start) {
            // A non-empty selection must not be rewritten under the user
            if (!selectionOffsets || selectionOffsets.start !== selectionOffsets.end) {
                continue;
            }
            // Rebuilding the separator while it is being hand-edited would
            // rewrite the colons/dashes mid-keystroke
            if (isMarkdownTableSeparatorLine(lines[selectionStartLine] || '')) {
                continue;
            }
            caret = {
                line: selectionStartLine - block.start,
                ch: selectionOffsets.start - lineStarts[selectionStartLine]
            };
        }

        var original = lines.slice(block.start, block.end + 1).join('\n');
        var result = formatMarkdownTableBlock(lines.slice(block.start, block.end + 1), caret);
        if (!result) {
            continue;
        }

        var replacement = result.lines.join('\n');
        if (replacement === original) {
            continue;
        }

        var from = lineStarts[block.start];
        var anchor;
        if (caret && result.caret) {
            anchor = from + result.caret.ch;
            for (var li = 0; li < result.caret.line; li++) {
                anchor += result.lines[li].length + 1;
            }
        }

        // The dispatch fires a synthetic input event; the suppress flag keeps it
        // from re-marking the note as modified (this content is being saved now)
        var previousSuppress = editorDiv._suppressMarkdownTableContextInput;
        editorDiv._suppressMarkdownTableContextInput = true;
        try {
            api.replaceRangeKeepSelection(editorDiv, from, from + original.length, replacement, anchor);
        } finally {
            editorDiv._suppressMarkdownTableContextInput = previousSuppress;
        }
        changed = true;
    }

    if (changed) {
        noteEntry.setAttribute('data-markdown-content', api.getValue(editorDiv));
    }
}

function handleMarkdownTableEnter(event, editorDiv, noteEntry, noteId) {
    if (!event || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !editorDiv || !noteEntry) {
        return false;
    }

    var selectionOffsets = getSelectionOffsetsInTextElement(editorDiv);
    if (!selectionOffsets || selectionOffsets.start !== selectionOffsets.end) {
        return false;
    }

    var content = normalizeContentEditableText(editorDiv);
    if (!content) {
        return false;
    }

    var lines = content.split('\n');
    var lineStarts = getMarkdownLineStartOffsets(content);
    var lineIndex = getMarkdownLineIndexForOffset(lineStarts, selectionOffsets.start);
    var currentLine = lines[lineIndex] || '';
    var currentLineEnd = (lineStarts[lineIndex] || 0) + currentLine.length;

    if (!isMarkdownTableRowLine(currentLine)) {
        return false;
    }

    var isCurrentLineSeparator = isMarkdownTableSeparatorLine(currentLine);
    var separatorIndex = isCurrentLineSeparator ? lineIndex : -1;
    for (var scanIndex = lineIndex - 1; scanIndex >= 0 && separatorIndex === -1; scanIndex--) {
        if (isMarkdownTableSeparatorLine(lines[scanIndex] || '')) {
            separatorIndex = scanIndex;
            break;
        }

        if (!isMarkdownTableRowLine(lines[scanIndex])) {
            break;
        }
    }

    if (separatorIndex <= 0) {
        return false;
    }

    var tableEnd = lineIndex;
    while (tableEnd + 1 < lines.length && isMarkdownTableRowLine(lines[tableEnd + 1])) {
        tableEnd++;
    }

    if (lineIndex < separatorIndex) {
        return false;
    }

    var headerCells = getMarkdownTableCells(lines[separatorIndex - 1] || '');
    var currentCells = getMarkdownTableCells(currentLine);
    var columnCount = headerCells && headerCells.length > 0
        ? headerCells.length
        : (currentCells ? currentCells.length : 0);

    if (columnCount === 0 || !currentCells || currentCells.length === 0) {
        return false;
    }

    var currentIndentMatch = currentLine.match(/^([ \t]*)\|/);
    var currentIndent = currentIndentMatch ? currentIndentMatch[1] : '';
    var isCaretAtLineEnd = selectionOffsets.start === currentLineEnd;
    var isLastTableRow = lineIndex === tableEnd;

    if (!isMarkdownTableSeparatorLine(currentLine) && currentCells.length === columnCount) {
        var isEmptyRow = currentCells.every(function (cell) {
            return cell === '';
        });

        if (isEmptyRow && isLastTableRow) {
            event.preventDefault();
            event.stopPropagation();
            lines[lineIndex] = '';
            if (lineIndex > 0) {
                formatMarkdownTableAtLine(lines, lineIndex - 1);
            }
            var exitedTableContent = lines.join('\n');
            var exitCaret = getMarkdownLineStartOffsets(exitedTableContent)[lineIndex] || 0;
            updateMarkdownEditorContent(editorDiv, noteEntry, noteId, exitedTableContent, exitCaret, exitCaret);
            return true;
        }
    }

    if (!isCaretAtLineEnd) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    var insertedLine = buildMarkdownEmptyTableRow(columnCount, currentIndent);
    lines.splice(lineIndex + 1, 0, insertedLine);
    formatMarkdownTableAtLine(lines, lineIndex + 1);

    var newRowIndentMatch = (lines[lineIndex + 1] || '').match(/^[ \t]*/);
    var newRowIndent = newRowIndentMatch ? newRowIndentMatch[0] : currentIndent;
    var newContent = lines.join('\n');
    var newLineStarts = getMarkdownLineStartOffsets(newContent);
    var caretOffset = (newLineStarts[lineIndex + 1] || newContent.length) + newRowIndent.length + 2;

    updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContent, caretOffset, caretOffset);
    return true;
}

function handleMarkdownOrderedListTab(event, editorDiv, noteEntry, noteId) {
    if (!event || event.key !== 'Tab' || !editorDiv || !noteEntry) {
        return false;
    }

    var selectionOffsets = getSelectionOffsetsInTextElement(editorDiv);
    if (!selectionOffsets) {
        return false;
    }

    var content = normalizeContentEditableText(editorDiv);
    if (!content) {
        return false;
    }

    var orderedLinePattern = /^([ \t]*)(\d+(?:\.\d+)*)(\.\s+.*)$/;
    var oldLines = content.split('\n');
    var lines = oldLines.slice();
    var oldLineStarts = getMarkdownLineStartOffsets(content);
    var lineTransforms = {};
    var selectionEndForLineLookup = selectionOffsets.end;
    var handled = false;
    var modified = false;

    if (selectionEndForLineLookup > selectionOffsets.start && selectionEndForLineLookup > 0 && content.charAt(selectionEndForLineLookup - 1) === '\n') {
        selectionEndForLineLookup--;
    }

    var startLine = getMarkdownLineIndexForOffset(oldLineStarts, selectionOffsets.start);
    var endLine = getMarkdownLineIndexForOffset(oldLineStarts, selectionEndForLineLookup);

    for (var lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
        var line = lines[lineIndex];
        var orderedMatch = line.match(orderedLinePattern);
        if (!orderedMatch) {
            continue;
        }

        handled = true;

        if (event.shiftKey) {
            var removableIndentMatch = orderedMatch[1].match(/^( {1,4}|\t)/);
            if (!removableIndentMatch) {
                continue;
            }

            lines[lineIndex] = orderedMatch[1].slice(removableIndentMatch[1].length) + orderedMatch[2] + orderedMatch[3];
            modified = true;
        } else {
            lines[lineIndex] = '    ' + line;
            modified = true;
        }
    }

    if (!handled) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!modified) {
        return true;
    }

    lines = renumberMarkdownOrderedListLines(lines);

    for (var transformIndex = startLine; transformIndex <= endLine; transformIndex++) {
        var oldOrderedMatch = oldLines[transformIndex] ? oldLines[transformIndex].match(orderedLinePattern) : null;
        var newOrderedMatch = lines[transformIndex] ? lines[transformIndex].match(orderedLinePattern) : null;
        if (!oldOrderedMatch || !newOrderedMatch) {
            continue;
        }

        var oldPrefixMatch = oldLines[transformIndex].match(/^[ \t]*\d+(?:\.\d+)*\.\s+/);
        var newPrefixMatch = lines[transformIndex].match(/^[ \t]*\d+(?:\.\d+)*\.\s+/);

        lineTransforms[transformIndex] = {
            oldPrefixLength: oldPrefixMatch ? oldPrefixMatch[0].length : 0,
            newPrefixLength: newPrefixMatch ? newPrefixMatch[0].length : 0
        };
    }

    var newContent = lines.join('\n');
    var newLineStarts = getMarkdownLineStartOffsets(newContent);

    var translateOffset = function (oldOffset) {
        var lineIndex = getMarkdownLineIndexForOffset(oldLineStarts, oldOffset);
        var oldColumn = oldOffset - oldLineStarts[lineIndex];
        var transform = lineTransforms[lineIndex];
        var newColumn = oldColumn;

        if (transform) {
            if (oldColumn <= transform.oldPrefixLength) {
                newColumn = Math.max(0, Math.min(transform.newPrefixLength, oldColumn + (transform.newPrefixLength - transform.oldPrefixLength)));
            } else {
                newColumn = transform.newPrefixLength + (oldColumn - transform.oldPrefixLength);
            }
        }

        return Math.max(0, Math.min((newLineStarts[lineIndex] || 0) + newColumn, newContent.length));
    };

    updateMarkdownEditorContent(
        editorDiv,
        noteEntry,
        noteId,
        newContent,
        translateOffset(selectionOffsets.start),
        translateOffset(selectionOffsets.end)
    );

    return true;
}

function handleMarkdownOrderedListEnter(event, editorDiv, noteEntry, noteId) {
    if (!event || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !editorDiv || !noteEntry) {
        return false;
    }

    var selectionOffsets = getSelectionOffsetsInTextElement(editorDiv);
    if (!selectionOffsets || selectionOffsets.start !== selectionOffsets.end) {
        return false;
    }

    var content = normalizeContentEditableText(editorDiv);
    if (!content) {
        return false;
    }

    var lines = content.split('\n');
    var lineStarts = getMarkdownLineStartOffsets(content);
    var lineIndex = getMarkdownLineIndexForOffset(lineStarts, selectionOffsets.start);
    var currentLine = lines[lineIndex] || '';
    var currentLineEnd = (lineStarts[lineIndex] || 0) + currentLine.length;
    if (selectionOffsets.start !== currentLineEnd) {
        return false;
    }

    // Task list: "- [ ] " / "- [x] " / "1. [ ] " etc.
    var taskMatch = currentLine.match(/^([ \t]*)([-*+]|\d+(?:\.\d+)*\.)(\s+)(\[[ xX]\])(\s+)(.*)$/);
    if (taskMatch) {
        event.preventDefault();
        event.stopPropagation();

        // Empty task item -> exit the list (remove the marker)
        if (taskMatch[6].trim() === '') {
            lines[lineIndex] = '';
            var newContent = lines.join('\n');
            var caret = (getMarkdownLineStartOffsets(newContent)[lineIndex] || 0);
            updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContent, caret, caret);
            return true;
        }

        var emptyCheckbox = '[ ]';
        var isOrdered = /^\d/.test(taskMatch[2]);
        var marker = isOrdered ? taskMatch[2] : taskMatch[2];
        var insertedLine = taskMatch[1] + marker + taskMatch[3] + emptyCheckbox + taskMatch[5];
        lines.splice(lineIndex + 1, 0, insertedLine);
        if (isOrdered) {
            lines = renumberMarkdownOrderedListLines(lines);
        }
        var newContent2 = lines.join('\n');
        var newLineStarts2 = getMarkdownLineStartOffsets(newContent2);
        var insertedLine2 = lines[lineIndex + 1] || '';
        var caret2 = (newLineStarts2[lineIndex + 1] || newContent2.length) + insertedLine2.length;
        updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContent2, caret2, caret2);
        return true;
    }

    // Ordered list: "1. ", "2.1. ", etc.
    var orderedMatch = currentLine.match(/^([ \t]*)(\d+(?:\.\d+)*)(\.\s+)(.*)$/);
    if (orderedMatch) {
        // Empty item -> exit the list
        if (orderedMatch[4].trim() === '') {
            event.preventDefault();
            event.stopPropagation();
            lines[lineIndex] = '';
            var newContentE = lines.join('\n');
            var caretE = (getMarkdownLineStartOffsets(newContentE)[lineIndex] || 0);
            updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContentE, caretE, caretE);
            return true;
        }

        event.preventDefault();
        event.stopPropagation();

        lines.splice(lineIndex + 1, 0, orderedMatch[1] + orderedMatch[2] + orderedMatch[3]);
        lines = renumberMarkdownOrderedListLines(lines);

        var newContent = lines.join('\n');
        var newLineStarts = getMarkdownLineStartOffsets(newContent);
        var insertedLine = lines[lineIndex + 1] || '';
        var insertedPrefixMatch = insertedLine.match(/^[ \t]*\d+(?:\.\d+)*\.\s+/);
        var caretOffset = (newLineStarts[lineIndex + 1] || newContent.length) + (insertedPrefixMatch ? insertedPrefixMatch[0].length : insertedLine.length);

        updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContent, caretOffset, caretOffset);
        return true;
    }

    // Unordered list: "- ", "* ", "+ "
    var unorderedMatch = currentLine.match(/^([ \t]*)([-*+])(\s+)(.*)$/);
    if (unorderedMatch) {
        // Empty item -> exit the list
        if (unorderedMatch[4].trim() === '') {
            event.preventDefault();
            event.stopPropagation();
            lines[lineIndex] = '';
            var newContentU0 = lines.join('\n');
            var caretU0 = (getMarkdownLineStartOffsets(newContentU0)[lineIndex] || 0);
            updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContentU0, caretU0, caretU0);
            return true;
        }

        event.preventDefault();
        event.stopPropagation();

        var insertedLineU = unorderedMatch[1] + unorderedMatch[2] + unorderedMatch[3];
        lines.splice(lineIndex + 1, 0, insertedLineU);
        var newContentU = lines.join('\n');
        var newLineStartsU = getMarkdownLineStartOffsets(newContentU);
        var caretU = (newLineStartsU[lineIndex + 1] || newContentU.length) + insertedLineU.length;
        updateMarkdownEditorContent(editorDiv, noteEntry, noteId, newContentU, caretU, caretU);
        return true;
    }

    return false;
}

// Public API of this file.
window.handleMarkdownOrderedListTab = handleMarkdownOrderedListTab;
window.handleMarkdownTableEnter = handleMarkdownTableEnter;

// Shared with markdown-view-modes.js, js/events-auto-save.js and js/notes.js.
// Listed explicitly so the cross-file surface of this module is visible here,
// and so renaming one of them fails the lint rather than silently breaking a
// caller in another file.
window.formatMarkdownTablesBeforeSave = formatMarkdownTablesBeforeSave;
window.handleMarkdownOrderedListEnter = handleMarkdownOrderedListEnter;

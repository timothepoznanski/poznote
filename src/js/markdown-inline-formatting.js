// Markdown Inline Formatting
// Applies live visual formatting to the raw markdown source inside the
// .markdown-editor contentEditable div (bold, italic, headings, etc.).
// The raw markdown syntax characters (**, #, etc.) remain visible and
// editable; only visual styling is layered on top via span wrappers.

(function () {
    'use strict';

    var CURSOR_MARKER = '\uE001';
    var TOKEN_OPEN = '\uE010';
    var TOKEN_CLOSE = '\uE011';
    var DEBOUNCE_MS = 120;
    var debounceTimers = new WeakMap();
    var rebuildingEditors = new WeakSet();

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getNormalizedText(editor) {
        if (typeof window.normalizeContentEditableText === 'function') {
            return window.normalizeContentEditableText(editor);
        }
        return editor.innerText || editor.textContent || '';
    }

    // Like normalizeContentEditableText but DOES preserve trailing newlines.
    // We need this because if the user has just pressed Enter at the end of
    // the document, the trailing newline is the cursor's current line — we
    // must keep it to restore the cursor correctly.
    function extractSourceText(element) {
        var parts = [];
        if (element.childNodes.length === 0) {
            return element.innerText || element.textContent || '';
        }
        for (var i = 0; i < element.childNodes.length; i++) {
            var node = element.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                parts.push(node.textContent || node.nodeValue || '');
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                var tagName = node.tagName;
                if (['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(tagName) !== -1) {
                    var divText = node.textContent || '';
                    var hasBr = !!node.querySelector('br');
                    if (parts.length > 0) {
                        var lastPart = parts[parts.length - 1];
                        if (lastPart && !lastPart.endsWith('\n')) {
                            parts.push('\n');
                        }
                    }
                    if (divText === '' && hasBr) {
                        parts.push('\n');
                    } else {
                        parts.push(divText);
                        parts.push('\n');
                    }
                } else if (tagName === 'BR') {
                    parts.push('\n');
                } else {
                    parts.push(node.textContent || '');
                }
            }
        }
        var content = parts.join('');
        return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    function formatInline(text) {
        var tokens = [];
        function store(html) {
            tokens.push(html);
            return TOKEN_OPEN + (tokens.length - 1) + TOKEN_CLOSE;
        }

        // Inline code first so its content is protected from other rules
        text = text.replace(/`([^`\n]+?)`/g, function (_, code) {
            return store(
                '<span class="md-syntax">`</span>' +
                '<span class="md-inline-code">' + escapeHtml(code) + '</span>' +
                '<span class="md-syntax">`</span>'
            );
        });

        // Images  ![alt](url)
        text = text.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, function (_, alt, url) {
            return store(
                '<span class="md-syntax">![</span>' +
                '<span class="md-link-text">' + escapeHtml(alt) + '</span>' +
                '<span class="md-syntax">](</span>' +
                '<span class="md-link-url">' + escapeHtml(url) + '</span>' +
                '<span class="md-syntax">)</span>'
            );
        });

        // Links  [text](url)
        text = text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, function (_, txt, url) {
            return store(
                '<span class="md-syntax">[</span>' +
                '<span class="md-link-text">' + escapeHtml(txt) + '</span>' +
                '<span class="md-syntax">](</span>' +
                '<span class="md-link-url">' + escapeHtml(url) + '</span>' +
                '<span class="md-syntax">)</span>'
            );
        });

        // Bold + italic (***x*** or ___x___)
        text = text.replace(/(\*\*\*|___)(?=\S)([\s\S]+?)(?<=\S)\1/g, function (_, m, inner) {
            return store(
                '<span class="md-syntax">' + escapeHtml(m) + '</span>' +
                '<span class="md-bold md-italic">' + escapeHtml(inner) + '</span>' +
                '<span class="md-syntax">' + escapeHtml(m) + '</span>'
            );
        });

        // Bold (**x** or __x__)
        text = text.replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, function (_, m, inner) {
            return store(
                '<span class="md-syntax">' + escapeHtml(m) + '</span>' +
                '<span class="md-bold">' + escapeHtml(inner) + '</span>' +
                '<span class="md-syntax">' + escapeHtml(m) + '</span>'
            );
        });

        // Italic *x*
        try {
            text = text.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\w)/g, function (m, pre, inner) {
                return (pre || '') + store(
                    '<span class="md-syntax">*</span>' +
                    '<span class="md-italic">' + escapeHtml(inner) + '</span>' +
                    '<span class="md-syntax">*</span>'
                );
            });
        } catch (e) { /* lookbehind unsupported */ }

        // Italic _x_
        try {
            text = text.replace(/(^|[^_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g, function (m, pre, inner) {
                return (pre || '') + store(
                    '<span class="md-syntax">_</span>' +
                    '<span class="md-italic">' + escapeHtml(inner) + '</span>' +
                    '<span class="md-syntax">_</span>'
                );
            });
        } catch (e) { /* lookbehind unsupported */ }

        // Strikethrough
        text = text.replace(/~~([^~\n]+?)~~/g, function (_, inner) {
            return store(
                '<span class="md-syntax">~~</span>' +
                '<span class="md-strike">' + escapeHtml(inner) + '</span>' +
                '<span class="md-syntax">~~</span>'
            );
        });

        // Highlight
        text = text.replace(/==([^=\n]+?)==/g, function (_, inner) {
            return store(
                '<span class="md-syntax">==</span>' +
                '<span class="md-highlight">' + escapeHtml(inner) + '</span>' +
                '<span class="md-syntax">==</span>'
            );
        });

        // Escape remaining text, then splice in stored tokens. escapeHtml
        // leaves the TOKEN_OPEN / TOKEN_CLOSE private-use characters alone.
        var out = escapeHtml(text);
        var tokenRegex = new RegExp(TOKEN_OPEN + '(\\d+)' + TOKEN_CLOSE, 'g');
        // Loop until stable: a stored token may itself contain references
        // to earlier tokens (e.g. a link nested inside a bold span).
        var prev;
        var safety = 0;
        do {
            prev = out;
            out = out.replace(tokenRegex, function (_, i) { return tokens[+i] || ''; });
            safety++;
        } while (out !== prev && safety < 10);
        return out;
    }

    // Detects a markdown table separator row like:
    //   | --- | --- |
    //   |:----|----:|:---:|
    //   ---|---
    // The line must contain at least one '|' or a dash run, be composed
    // solely of pipes, dashes, colons and whitespace, and have at least
    // one '---'-style run.
    function isTableSeparator(line) {
        if (!line) return false;
        var stripped = line.replace(/^\s+|\s+$/g, '');
        if (stripped.length === 0) return false;
        if (!/[-|]/.test(stripped)) return false;
        if (!/^[|:\- \t]+$/.test(stripped)) return false;
        if (!/-{3,}/.test(stripped)) return false;
        // Must have at least 2 "cells" separated by | or at least one | anywhere.
        return /\|/.test(stripped) || /-{3,}\s+-{3,}/.test(stripped);
    }

    function isTableRow(line) {
        if (!line) return false;
        // At least one pipe that is not escaped, not purely inside a code span.
        return /\|/.test(line);
    }

    // Split a table row into [cell0, pipe, cell1, pipe, ...] preserving
    // the original text exactly. Pipes escaped with a backslash are kept
    // inside the surrounding cell.
    function splitTableRow(line) {
        var parts = [];
        var cur = '';
        for (var i = 0; i < line.length; i++) {
            var ch = line.charAt(i);
            if (ch === '\\' && i + 1 < line.length) {
                cur += ch + line.charAt(i + 1);
                i++;
                continue;
            }
            if (ch === '|') {
                parts.push({ type: 'cell', text: cur });
                parts.push({ type: 'pipe', text: '|' });
                cur = '';
            } else {
                cur += ch;
            }
        }
        parts.push({ type: 'cell', text: cur });
        return parts;
    }

    function formatTableLine(line, role, widths) {
        var segments = splitTableRow(line);
        var html = '<span class="md-line md-table-row md-table-' + role + '">';
        var colIndex = 0;
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.type === 'pipe') {
                html += '<span class="md-syntax md-table-pipe">|</span>';
            } else {
                // Preserve leading/trailing whitespace inside the cell by
                // wrapping it; CSS gives the cell its visual padding and
                // alignment. Empty cells (outer pipes) render as zero-width.
                var inner = seg.text;
                var leading = inner.match(/^\s*/)[0];
                var trailing = inner.match(/\s*$/)[0];
                var core = inner.substring(leading.length, inner.length - trailing.length);
                var cellClass = 'md-table-cell';
                if (role === 'separator') cellClass += ' md-table-sep-cell';
                var style = '';
                var w = widths ? widths[colIndex] : 0;
                if (w && w > 0) {
                    // inline-block + fixed width in ch locks the cell's
                    // box so the pipes line up vertically across rows,
                    // even when some rows render the content bold (header)
                    // and others don't — bold glyphs in a monospace font
                    // may have a slightly larger advance width, which
                    // would otherwise stretch the cell.
                    style = ' style="width:' + w + 'ch"';
                }
                html += '<span class="' + cellClass + '"' + style + '>';
                if (leading) html += escapeHtml(leading);
                if (core !== '') {
                    if (role === 'separator') {
                        html += '<span class="md-table-sep-bar">' + escapeHtml(core) + '</span>';
                    } else {
                        html += formatInline(core);
                    }
                }
                if (trailing) html += escapeHtml(trailing);
                html += '</span>';
                colIndex++;
            }
        }
        html += '</span>';
        return html;
    }

    // Scan all lines and return a parallel array of roles:
    //   'header' | 'separator' | 'body' | null
    // A table is recognized when a separator line is preceded by a
    // non-empty line that contains a pipe.
    function detectTableRoles(lines, state) {
        var roles = new Array(lines.length);
        var inCodeBlock = !!state.inCodeBlock;
        // First pass: track code block boundaries so we don't format
        // tables inside ``` fences.
        var codeFlags = new Array(lines.length);
        for (var i = 0; i < lines.length; i++) {
            if (/^\s*```/.test(lines[i])) {
                codeFlags[i] = inCodeBlock || true; // fence line itself: still code
                inCodeBlock = !inCodeBlock;
            } else {
                codeFlags[i] = inCodeBlock;
            }
        }
        for (var j = 0; j < lines.length; j++) {
            if (roles[j]) continue;
            if (codeFlags[j]) continue;
            if (!isTableSeparator(lines[j])) continue;
            if (j === 0) continue;
            var header = lines[j - 1];
            if (codeFlags[j - 1]) continue;
            if (!header || !isTableRow(header)) continue;
            roles[j - 1] = 'header';
            roles[j] = 'separator';
            // Consume body rows
            for (var k = j + 1; k < lines.length; k++) {
                if (codeFlags[k]) break;
                var ln = lines[k];
                if (ln === '' || /^\s*$/.test(ln)) break;
                if (!isTableRow(ln)) break;
                roles[k] = 'body';
            }
        }
        return roles;
    }

    // For each line belonging to a table, returns the per-column max
    // cell width (in characters) shared by every row of that table.
    // Lines not in any table get a null entry.
    function computeTableColumnWidths(lines, roles) {
        var widthsByLine = new Array(lines.length);
        var i = 0;
        while (i < lines.length) {
            if (!roles[i]) { i++; continue; }
            var start = i;
            var end = i;
            while (end + 1 < lines.length && roles[end + 1]) end++;

            var widths = [];
            for (var r = start; r <= end; r++) {
                var segs = splitTableRow(lines[r]);
                var col = 0;
                for (var s = 0; s < segs.length; s++) {
                    if (segs[s].type !== 'cell') continue;
                    var len = segs[s].text.length;
                    if (widths[col] == null || len > widths[col]) {
                        widths[col] = len;
                    }
                    col++;
                }
            }
            for (var r2 = start; r2 <= end; r2++) {
                widthsByLine[r2] = widths;
            }
            i = end + 1;
        }
        return widthsByLine;
    }

    function formatLine(line, state) {
        // Fenced code block toggle
        if (/^\s*```/.test(line)) {
            state.inCodeBlock = !state.inCodeBlock;
            return '<span class="md-line md-code-fence">' + escapeHtml(line) + '</span>';
        }
        if (state.inCodeBlock) {
            return '<span class="md-line md-code-block">' + escapeHtml(line) + '</span>';
        }

        // Heading
        var m = line.match(/^(#{1,6})(\s+)([\s\S]*)$/);
        if (m) {
            return '<span class="md-line md-heading md-h' + m[1].length + '">' +
                '<span class="md-syntax">' + escapeHtml(m[1] + m[2]) + '</span>' +
                formatInline(m[3]) +
                '</span>';
        }

        // Horizontal rule  (---, ***, ___)
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
            return '<span class="md-line md-hr">' + escapeHtml(line) + '</span>';
        }

        // Blockquote / callout
        m = line.match(/^(\s*)(>+\s?)([\s\S]*)$/);
        if (m) {
            return '<span class="md-line md-blockquote">' +
                escapeHtml(m[1]) +
                '<span class="md-syntax">' + escapeHtml(m[2]) + '</span>' +
                formatInline(m[3]) +
                '</span>';
        }

        // Task list item
        m = line.match(/^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\])(\s+)([\s\S]*)$/);
        if (m) {
            var checked = /[xX]/.test(m[4]);
            return '<span class="md-line md-list-item md-task' + (checked ? ' md-task-done' : '') + '">' +
                escapeHtml(m[1]) +
                '<span class="md-syntax md-list-marker">' + escapeHtml(m[2]) + '</span>' +
                escapeHtml(m[3]) +
                '<span class="md-syntax md-task-checkbox">' + escapeHtml(m[4]) + '</span>' +
                escapeHtml(m[5]) +
                '<span class="md-task-text">' + formatInline(m[6]) + '</span>' +
                '</span>';
        }

        // List item
        m = line.match(/^(\s*)([-*+]|\d+\.)(\s+)([\s\S]*)$/);
        if (m) {
            return '<span class="md-line md-list-item">' +
                escapeHtml(m[1]) +
                '<span class="md-syntax md-list-marker">' + escapeHtml(m[2]) + '</span>' +
                escapeHtml(m[3]) +
                formatInline(m[4]) +
                '</span>';
        }

        // Default line
        return '<span class="md-line">' + formatInline(line) + '</span>';
    }

    function captureCursorOffset(editor) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var range = sel.getRangeAt(0);
        if (!editor.contains(range.endContainer)) return null;

        var markerNode = document.createTextNode(CURSOR_MARKER);
        var markerRange = range.cloneRange();
        markerRange.collapse(false);
        try {
            markerRange.insertNode(markerNode);
        } catch (e) {
            return null;
        }

        var fullText = extractSourceText(editor);
        var idx = fullText.indexOf(CURSOR_MARKER);

        if (markerNode.parentNode) {
            markerNode.parentNode.removeChild(markerNode);
        }

        if (idx < 0) return null;
        return {
            offset: idx,
            text: fullText.replace(CURSOR_MARKER, '')
        };
    }

    function isLiveFormattingDisabled() {
        return !!(document.body && document.body.classList.contains('markdown-live-formatting-disabled'));
    }

    function clearFormatting(editor) {
        if (!editor || rebuildingEditors.has(editor)) return;
        var text = extractSourceText(editor);
        rebuildingEditors.add(editor);
        try {
            editor.textContent = text;
        } finally {
            rebuildingEditors.delete(editor);
        }
    }

    function applyFormatting(editor) {
        if (!editor || rebuildingEditors.has(editor)) return;

        // User-level kill switch (display settings card). If the editor
        // still carries previously-formatted spans, flatten it once so
        // the user sees raw markdown; otherwise do nothing — rewriting
        // textContent on every keystroke would reset the caret to the
        // start of the editor.
        if (isLiveFormattingDisabled()) {
            if (editor.querySelector && editor.querySelector('.md-line, .md-syntax, .md-bold, .md-italic, .md-inline-code, .md-code-block, .md-heading, .md-link-text')) {
                clearFormatting(editor);
            }
            return;
        }

        // Never rebuild the DOM while the slash command menu is open: it
        // stores a reference to the text node containing the "/", and
        // swapping that node would break both filter typing and item
        // selection.
        if (document.querySelector('.slash-command-menu')) return;

        // Similarly, never rebuild while the emoji picker is open: the
        // toolbar saves a Range to restore the caret when an emoji is
        // clicked, and a DOM rebuild would detach that Range's containers.
        if (document.querySelector('.emoji-picker')) return;

        var hadFocus = (document.activeElement === editor);
        var captured = hadFocus ? captureCursorOffset(editor) : null;
        var text = captured ? captured.text : getNormalizedText(editor);

        rebuildingEditors.add(editor);
        try {
            // Preserve the empty state so the CSS placeholder (:empty:before)
            // keeps working when there's no content.
            if (text === '') {
                if (editor.childNodes.length !== 0) {
                    editor.innerHTML = '';
                }
                return;
            }

            var lines = text.split('\n');
            var state = { inCodeBlock: false };
            var tableRoles = detectTableRoles(lines, state);
            var tableWidths = computeTableColumnWidths(lines, tableRoles);
            var pieces = [];
            for (var i = 0; i < lines.length; i++) {
                if (tableRoles[i]) {
                    // Keep the code-block toggle state in sync: table lines
                    // never live inside a code block (detectTableRoles
                    // already skips fenced regions).
                    pieces.push(formatTableLine(lines[i], tableRoles[i], tableWidths[i]));
                } else {
                    pieces.push(formatLine(lines[i], state));
                }
            }

            // Build via a detached container for a single DOM swap. Pieces
            // are joined with \uE020 markers; the browser parses each marker
            // into a text node between sibling spans, which we then convert
            // into real '\n' text nodes so the editor's textContent matches
            // the source markdown exactly (including newlines).
            var container = document.createElement('div');
            container.innerHTML = pieces.join('\uE020');
            // Replace placeholder markers with actual newline text nodes.
            // Walk children and split text nodes at the marker.
            var newChildren = [];
            (function collect(node) {
                for (var j = 0; j < node.childNodes.length; j++) {
                    newChildren.push(node.childNodes[j]);
                }
            })(container);

            editor.innerHTML = '';
            for (var k = 0; k < newChildren.length; k++) {
                var child = newChildren[k];
                if (child.nodeType === Node.TEXT_NODE) {
                    // Split on our placeholder char into alternating text + newline
                    var raw = child.nodeValue;
                    var segments = raw.split('\uE020');
                    for (var s = 0; s < segments.length; s++) {
                        if (s > 0) {
                            editor.appendChild(document.createTextNode('\n'));
                        }
                        if (segments[s] !== '') {
                            editor.appendChild(document.createTextNode(segments[s]));
                        }
                    }
                } else {
                    editor.appendChild(child);
                }
            }

            // Our pieces were joined with \uE020 inside the container's
            // innerHTML, which the browser parses as text nodes between
            // sibling spans. The split loop above converts those markers
            // into real '\n' text nodes.

            if (hadFocus && captured && typeof window.setSelectionOffsetsInTextElement === 'function') {
                window.setSelectionOffsetsInTextElement(editor, captured.offset, captured.offset);
            }
        } finally {
            rebuildingEditors.delete(editor);
        }
    }

    function scheduleFormat(editor) {
        var existing = debounceTimers.get(editor);
        if (existing) clearTimeout(existing);
        // When the kill switch is on, skip the debounce entirely: there is
        // nothing to reformat, and a rebuild would reset the caret.
        if (isLiveFormattingDisabled()) {
            debounceTimers.delete(editor);
            return;
        }
        var t = setTimeout(function () {
            debounceTimers.delete(editor);
            applyFormatting(editor);
        }, DEBOUNCE_MS);
        debounceTimers.set(editor, t);
    }

    function attach(editor) {
        if (!editor || editor._mdInlineFormattingAttached) return;
        editor._mdInlineFormattingAttached = true;

        editor.addEventListener('input', function () {
            scheduleFormat(editor);
        });

        // Cancel any pending reformat when the editor loses focus. This
        // avoids rebuilding the DOM (and wiping the selection) while the
        // user is interacting with the toolbar — which would otherwise
        // cause execCommand('insertText') to fire at the wrong location.
        editor.addEventListener('blur', function () {
            var existing = debounceTimers.get(editor);
            if (existing) {
                clearTimeout(existing);
                debounceTimers.delete(editor);
            }
        });

        // Initial pass
        applyFormatting(editor);
    }

    function attachAll(root) {
        var container = root || document;
        if (!container.querySelectorAll) return;
        var editors = container.querySelectorAll('.markdown-editor');
        for (var i = 0; i < editors.length; i++) {
            attach(editors[i]);
        }
    }

    function startObserver() {
        if (!window.MutationObserver) return;
        var observer = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                var added = mutations[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var node = added[j];
                    if (node.nodeType !== 1) continue;
                    if (node.classList && node.classList.contains('markdown-editor')) {
                        attach(node);
                    } else if (node.querySelectorAll) {
                        attachAll(node);
                    }
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        attachAll();
        startObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    window.applyMarkdownInlineFormatting = applyFormatting;
})();

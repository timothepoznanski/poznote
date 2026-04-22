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

        var fullText = getNormalizedText(editor);
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

    function applyFormatting(editor) {
        if (!editor || rebuildingEditors.has(editor)) return;

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
            var pieces = [];
            for (var i = 0; i < lines.length; i++) {
                pieces.push(formatLine(lines[i], state));
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

        // Re-format on blur so the displayed text reflects any final edits
        // performed by other handlers (list auto-continuation, etc.).
        editor.addEventListener('blur', function () {
            var existing = debounceTimers.get(editor);
            if (existing) clearTimeout(existing);
            debounceTimers.delete(editor);
            applyFormatting(editor);
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

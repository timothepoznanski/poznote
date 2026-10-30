/**
 * Syntax Highlighting for Code Blocks
 * Uses Highlight.js to apply syntax highlighting to code blocks with language classes
 */

(function() {
    'use strict';

    var searchHighlightRefreshScheduled = false;

    function scheduleSearchHighlightRefresh() {
        var searchInput = document.getElementById('unified-search') || document.getElementById('unified-search-mobile');
        if (!searchInput || !searchInput.value || !searchInput.value.trim()) {
            return;
        }

        if (typeof window.highlightSearchTerms !== 'function' || searchHighlightRefreshScheduled) {
            return;
        }

        searchHighlightRefreshScheduled = true;
        setTimeout(function() {
            searchHighlightRefreshScheduled = false;
            try {
                window.highlightSearchTerms(true);
            } catch (e) {
                console.warn('Search Highlight refresh error:', e);
            }
        }, 0);
    }

    /**
     * highlight.js's Bash grammar leaves numbers and the name of an assignment
     * (name=value, an fstab option) in the text colour, so a shell snippet came
     * out nearly monochrome (issue #1660). Re-register it with both added on
     * top of the stock definition. A name after a comma (uid=1000) is left
     * alone, like the other editors do; its number is still coloured.
     */
    function extendBashGrammar() {
        if (typeof hljs === 'undefined' || !hljs || typeof hljs.getLanguage !== 'function') return;
        var bash = hljs.getLanguage('bash');
        if (!bash || bash.poznoteExtended || typeof bash.rawDefinition !== 'function') return;

        var stockDefinition = bash.rawDefinition;
        hljs.registerLanguage('bash', function() {
            var definition = stockDefinition();
            definition.poznoteExtended = true;
            definition.contains = (definition.contains || []).concat([
                { scope: 'variable', match: /(?<=^|[\s;|&(])[A-Za-z_]\w*(?=\+?=)/, relevance: 0 },
                { scope: 'number', match: /(?<=^|[\s=,:])\d+(?:\.\d+)?(?=$|[\s,;:)|&])/, relevance: 0 }
            ]);
            return definition;
        });
    }

    extendBashGrammar();

    function isKnownSyntaxHighlightLanguage(language) {
        var normalizedLanguage = String(language || '').trim().toLowerCase();
        return !!(normalizedLanguage && typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function' && hljs.getLanguage(normalizedLanguage));
    }

    function isCodeLineBlockElement(node) {
        if (!node || node.nodeType !== 1) return false;

        // Line-number wrappers render one logical line each, so they end a line
        // just like editable block elements do.
        if (node.classList && node.classList.contains('code-line')) return true;

        return ['DIV', 'P', 'LI'].indexOf(node.tagName) !== -1;
    }

    /**
     * @param {Node} node
     * @param {Array} [textNodes] - Collects {node, start} for each text node,
     *     start being its offset in the text of the whole block
     * @param {number} [offset] - Where the text of this node starts
     */
    function getTextWithCodeLineBreaks(node, textNodes, offset) {
        if (!node) return '';

        if (node.nodeType === Node.TEXT_NODE) {
            if (textNodes) textNodes.push({ node: node, start: offset || 0 });
            return node.nodeValue || '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        if (node.classList && (
            node.classList.contains('code-block-copy-btn') ||
            node.classList.contains('code-block-delete-btn') ||
            node.classList.contains('code-block-lang-btn') ||
            node.classList.contains('code-block-line-numbers-btn')
        )) {
            return '';
        }

        if (node.tagName === 'BR') {
            return '\n';
        }

        var text = '';
        for (var i = 0; i < node.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(node.childNodes[i], textNodes, (offset || 0) + text.length);
        }

        if (isCodeLineBlockElement(node) && !text.endsWith('\n')) {
            text += '\n';
        }

        return text;
    }

    function getCodeBlockSourceText(codeElement) {
        if (!codeElement) return '';

        var text = '';
        for (var i = 0; i < codeElement.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(codeElement.childNodes[i]);
        }

        var lastChild = codeElement.lastChild;
        if (lastChild && isCodeLineBlockElement(lastChild) && text.endsWith('\n')) {
            text = text.slice(0, -1);
        }

        return text.replace(/\u00A0/g, ' ');
    }

    function isExplicitPlainCodeBlock(codeBlock) {
        if (!codeBlock) return false;

        var preElement = codeBlock.closest ? codeBlock.closest('pre') : null;
        var dataLanguage = (codeBlock.getAttribute && codeBlock.getAttribute('data-language')) ||
            (preElement && preElement.getAttribute ? preElement.getAttribute('data-language') : '');

        return String(dataLanguage || '').trim().toLowerCase() === 'code';
    }

    /**
     * The "Plain block" inserted from the slash menu: no language badge, no
     * syntax highlighting, no line numbers. Marked by .plain-block on the PRE
     * so it survives save/reload as a plain pre > code.
     */
    function isPlainBlockElement(el) {
        if (!el || !el.closest) return false;
        var preElement = el.tagName === 'PRE' ? el : el.closest('pre');
        return !!(preElement && preElement.classList.contains('plain-block'));
    }

    /**
     * Split a code element's content into one DocumentFragment per logical line.
     * Elements spanning several lines (multi-line hljs tokens, styled spans) are
     * re-opened on each new line so per-line wrappers keep the token markup.
     */
    function splitCodeElementIntoLines(codeEl) {
        var lines = [];
        var current = document.createDocumentFragment();
        var openStack = [];

        function appendTarget() {
            return openStack.length ? openStack[openStack.length - 1] : current;
        }

        function newLine() {
            lines.push(current);
            current = document.createDocumentFragment();
            var previousChain = openStack;
            openStack = [];
            var parent = current;
            for (var i = 0; i < previousChain.length; i++) {
                var clone = previousChain[i].cloneNode(false);
                parent.appendChild(clone);
                openStack.push(clone);
                parent = clone;
            }
        }

        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                var parts = (node.nodeValue || '').split('\n');
                for (var i = 0; i < parts.length; i++) {
                    if (i > 0) newLine();
                    if (parts[i]) appendTarget().appendChild(document.createTextNode(parts[i]));
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.tagName === 'BR') {
                newLine();
                return;
            }

            var clone = node.cloneNode(false);
            appendTarget().appendChild(clone);
            openStack.push(clone);
            for (var child = node.firstChild; child; child = child.nextSibling) {
                walk(child);
            }
            openStack.pop();
        }

        for (var child = codeEl.firstChild; child; child = child.nextSibling) {
            walk(child);
        }
        lines.push(current);

        return lines;
    }

    /**
     * True when a code block carries no language tag at all: a plain block
     * inserted from the slash menu, or a markdown fence (```) opened without a
     * language. Those blocks hold text that is not code, so they get no
     * line-number gutter. The tagged "CODE" block keeps its numbering.
     * A language added afterwards by hljs auto-detection does not count as a
     * tag, hence the data-auto-language marker set by applyAutoHighlighting().
     */
    function isUntaggedCodeBlock(codeEl) {
        if (!codeEl) return true;

        if (isPlainBlockElement(codeEl)) return true;

        var preElement = codeEl.closest ? codeEl.closest('pre') : null;
        var dataLanguage = (codeEl.getAttribute('data-language') ||
            (preElement ? preElement.getAttribute('data-language') : '') || '').trim();
        if (dataLanguage) return false;

        // Toolbar-inserted blocks (js/toolbar-format.js) carry the tag as a class:
        // the CSS draws a "CODE" badge for pre.code-block:not([data-language]).
        if (preElement && preElement.classList.contains('code-block')) return false;

        if (codeEl.hasAttribute('data-auto-language')) return true;

        return !/(?:^|\s)(?:language|lang)-\S+/.test(codeEl.className || '');
    }

    /**
     * Per-block override written by the gutter toggle in js/copy-code-on-focus.js:
     * data-line-numbers="1"/"0" on the PRE wins over the global
     * code_block_line_numbers setting. Returns true/false for an explicit
     * override, or null when the block follows the global setting.
     */
    function getCodeLineNumbersOverride(codeEl) {
        if (!codeEl) return null;
        var preElement = codeEl.tagName === 'PRE' ? codeEl :
            (codeEl.closest ? codeEl.closest('pre') : null);
        if (!preElement || !preElement.hasAttribute('data-line-numbers')) return null;

        var value = (preElement.getAttribute('data-line-numbers') || '').trim();
        if (value === '1') return true;
        if (value === '0') return false;
        return null;
    }

    function isGlobalLineNumbersEnabled() {
        return !!(document.body && document.body.classList.contains('code-block-line-numbers'));
    }

    /**
     * Whether this block should currently draw a gutter, combining the
     * per-block override with the global setting.
     */
    function shouldNumberCodeBlock(codeEl) {
        var override = getCodeLineNumbersOverride(codeEl);
        return override === null ? isGlobalLineNumbersEnabled() : override;
    }

    function isCodeLineNumberCandidate(codeEl) {
        if (!codeEl || codeEl.classList.contains('language-mermaid') ||
            codeEl.classList.contains('lang-mermaid')) {
            return false;
        }

        var preElement = codeEl.parentElement;
        if (!preElement || preElement.tagName !== 'PRE' ||
            preElement.classList.contains('indented-pre')) {
            return false;
        }

        // An explicit per-block choice also covers untagged blocks, which the
        // global setting deliberately skips.
        var override = getCodeLineNumbersOverride(codeEl);
        if (override !== null) {
            return override;
        }

        if (isUntaggedCodeBlock(codeEl)) {
            return false;
        }

        return true;
    }

    /**
     * Caret preservation across code block rebuilds: the caret position is
     * remembered as a plain character offset (BR counts as one newline) and
     * restored by walking the rebuilt text nodes.
     */
    function computeCaretTextOffset(codeEl) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.rangeCount) return null;

        var range = selection.getRangeAt(0);
        var container = range.startContainer;
        var startOffset = range.startOffset;
        if (!codeEl.contains(container)) return null;

        var count = 0;
        var found = false;

        function walk(node) {
            if (found) return;

            if (node.nodeType === Node.TEXT_NODE) {
                if (node === container) {
                    count += startOffset;
                    found = true;
                } else {
                    count += (node.nodeValue || '').length;
                }
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            if (node.tagName === 'BR') {
                count += 1;
                if (node === container) found = true;
                return;
            }

            var children = node.childNodes;
            for (var i = 0; i < children.length; i++) {
                if (node === container && i === startOffset) {
                    found = true;
                    return;
                }
                walk(children[i]);
                if (found) return;
            }
            if (node === container) found = true;
        }

        walk(codeEl);
        if (!found) return null;

        // After insertLineBreak, Chrome anchors the selection at the end of
        // the text node BEFORE the <br> even though the visible caret sits on
        // the next line. Count the break so the caret is restored there.
        // Only right after a break: text typed at the end of a line that
        // ends in a <br> leaves the same DOM, with the caret on that line.
        if (lastInputWasLineBreak && container.nodeType === Node.TEXT_NODE &&
            startOffset === (container.nodeValue || '').length &&
            container.nextSibling && container.nextSibling.nodeType === 1 &&
            container.nextSibling.tagName === 'BR') {
            count += 1;
        }

        return count;
    }

    function restoreCaretAtTextOffset(codeEl, offset) {
        if (offset === null || offset === undefined) return;

        var walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, null);
        var remaining = offset;
        var node;
        var target = null;
        var targetOffset = 0;
        var lastNode = null;

        // On an exact node boundary, prefer the START of the next node: line
        // wrappers end with a newline text node, and stopping at its end would
        // put the caret on the previous line's side of the span boundary.
        while ((node = walker.nextNode())) {
            var len = (node.nodeValue || '').length;
            if (remaining < len) {
                target = node;
                targetOffset = remaining;
                break;
            }
            remaining -= len;
            lastNode = node;
        }
        if (!target && lastNode && remaining === 0) {
            target = lastNode;
            targetOffset = (lastNode.nodeValue || '').length;
        }

        var range = document.createRange();
        if (target) {
            range.setStart(target, targetOffset);
        } else {
            range.selectNodeContents(codeEl);
            range.collapse(false);
        }
        range.collapse(true);

        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    /**
     * Remove .code-line wrappers, keeping the inner markup and the exact
     * visible text (a wrapper without a trailing newline still rendered as a
     * full line, so a real newline is materialized in its place).
     */
    function unwrapCodeLineNumbers(codeEl) {
        if (!codeEl) return;

        var spans = [];
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            var child = codeEl.childNodes[i];
            if (child.nodeType === 1 && child.classList && child.classList.contains('code-line')) {
                spans.push(child);
            }
        }

        spans.forEach(function(span, index) {
            var isLast = index === spans.length - 1;
            var endsWithNewline = (span.textContent || '').slice(-1) === '\n';

            if (isLast && endsWithNewline) {
                // Drop the trailing newline the wrapper materialized; the
                // extraction helpers treat it as virtual on the last line, so
                // keeping it would grow the stored content by one newline on
                // every save.
                var lastText = span.lastChild;
                while (lastText && lastText.lastChild) lastText = lastText.lastChild;
                if (lastText && lastText.nodeType === Node.TEXT_NODE) {
                    var value = lastText.nodeValue || '';
                    if (value.slice(-1) === '\n') {
                        if (value.length > 1) {
                            lastText.nodeValue = value.slice(0, -1);
                        } else if (lastText.parentNode) {
                            lastText.parentNode.removeChild(lastText);
                        }
                    }
                }
            }

            while (span.firstChild) {
                codeEl.insertBefore(span.firstChild, span);
            }
            if (!endsWithNewline && !isLast) {
                codeEl.insertBefore(document.createTextNode('\n'), span);
            }
            codeEl.removeChild(span);
        });

        codeEl.classList.remove('code-line-numbers');
        if (codeEl.style) {
            codeEl.style.removeProperty('--code-line-number-digits');
            if (!codeEl.getAttribute('style')) codeEl.removeAttribute('style');
        }
        if (!codeEl.className) codeEl.removeAttribute('class');
    }

    /**
     * True when the .code-line structure no longer matches one logical line
     * per wrapper (Shift+Enter inserts BRs, paste adds newlines, backspace
     * merges lines), or when stray nodes ended up outside the wrappers.
     */
    function isCodeLineStructureDesynced(codeEl) {
        var spans = [];
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            var child = codeEl.childNodes[i];
            if (child.nodeType === 1 && child.classList && child.classList.contains('code-line')) {
                spans.push(child);
            } else if (child.nodeType === Node.TEXT_NODE && !(child.nodeValue || '')) {
                continue;
            } else {
                return true;
            }
        }
        if (!spans.length) return true;

        for (var s = 0; s < spans.length; s++) {
            if (spans[s].querySelector('br')) return true;
            var text = spans[s].textContent || '';
            var newlineAt = text.indexOf('\n');
            if (newlineAt === -1) {
                if (s < spans.length - 1) return true;
            } else if (newlineAt !== text.length - 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * Wrap each line of a code block in a .code-line span so CSS counters can
     * draw a line-number gutter (code_block_line_numbers setting). Works on
     * rendered markdown preview blocks and on editable HTML-note blocks; the
     * wrappers are stripped from editable blocks before storage by
     * normalizeCodeBlocksForStorage() in js/notes.js.
     */
    function applyCodeLineNumbersToElement(codeEl) {
        if (!isCodeLineNumberCandidate(codeEl)) {
            // A block can stop being a candidate after it was numbered (its
            // language tag was removed, or content saved by an older version),
            // so drop any gutter it still carries.
            if (codeEl && (codeEl.classList.contains('code-line-numbers') ||
                codeEl.querySelector('.code-line'))) {
                var strippedCaret = codeEl.isContentEditable ? computeCaretTextOffset(codeEl) : null;
                unwrapCodeLineNumbers(codeEl);
                if (strippedCaret !== null) {
                    restoreCaretAtTextOffset(codeEl, strippedCaret);
                }
            }
            return;
        }

        var alreadyNumbered = codeEl.classList.contains('code-line-numbers');
        if (alreadyNumbered && !isCodeLineStructureDesynced(codeEl)) return;

        var caretOffset = codeEl.isContentEditable ? computeCaretTextOffset(codeEl) : null;
        var rebuilt = false;

        if (alreadyNumbered || codeEl.querySelector('.code-line')) {
            unwrapCodeLineNumbers(codeEl);
            rebuilt = true;
        }

        var text = getCodeBlockSourceText(codeEl);
        var lines = null;
        if (text && text.indexOf('\n') !== -1) {
            lines = splitCodeElementIntoLines(codeEl);
            // A trailing newline yields a final empty fragment; don't number it
            if (lines.length > 1 && !lines[lines.length - 1].hasChildNodes()) {
                lines.pop();
            }
            if (lines.length < 2) lines = null;
        }

        if (lines) {
            var wrapped = document.createDocumentFragment();
            lines.forEach(function(lineFragment) {
                var lineSpan = document.createElement('span');
                lineSpan.className = 'code-line';
                lineSpan.appendChild(lineFragment);
                // Keep the newline as real text inside the span: a trailing
                // segment break renders no extra row, but it keeps blank lines
                // one row tall and makes manual selection copy lossless.
                lineSpan.appendChild(document.createTextNode('\n'));
                wrapped.appendChild(lineSpan);
            });

            codeEl.textContent = '';
            codeEl.appendChild(wrapped);
            codeEl.classList.add('code-line-numbers');
            var digits = Math.max(2, String(lines.length).length);
            codeEl.style.setProperty('--code-line-number-digits', digits + 'ch');
            rebuilt = true;
        }

        // Only touch the selection when the DOM was actually rebuilt: a
        // restore always collapses to a caret, which would destroy an
        // in-progress user selection on untouched blocks.
        if (rebuilt && caretOffset !== null) {
            restoreCaretAtTextOffset(codeEl, caretOffset);
        }
    }

    /**
     * Keep the browser spell checker (spellcheck_html_notes setting) off the
     * code of an HTML note, blocks and inline code: code is not prose, and
     * every identifier came out underlined. The Markdown editor does the
     * same for its code (build/markdown-editor/src/main.js). Display only:
     * normalizeCodeBlocksForStorage() in js/notes.js strips it again.
     */
    function disableCodeSpellcheck(root) {
        var elements = root.querySelectorAll ? Array.from(root.querySelectorAll('.noteentry pre, .noteentry code')) : [];
        if ((root.tagName === 'PRE' || root.tagName === 'CODE') && root.closest && root.closest('.noteentry')) elements.push(root);
        elements.forEach(function(element) {
            if (element.getAttribute('spellcheck') !== 'false') {
                element.setAttribute('spellcheck', 'false');
            }
        });
    }

    function applyCodeLineNumbers(container) {
        var root = (container && container.querySelectorAll) ? container : document;

        disableCodeSpellcheck(root);

        // (the choices made on the blocks of a Markdown preview, js/copy-code-on-focus.js)
        if (typeof window.restoreMarkdownPreviewLineNumbers === 'function') {
            window.restoreMarkdownPreviewLineNumbers(root);
        }

        root.querySelectorAll('.noteentry pre > code').forEach(function(codeEl) {
            if (shouldNumberCodeBlock(codeEl)) {
                applyCodeLineNumbersToElement(codeEl);
            } else if (codeEl.classList.contains('code-line-numbers') ||
                codeEl.querySelector('.code-line')) {
                // Turned off (globally or per block) while a gutter was drawn
                var caret = codeEl.isContentEditable ? computeCaretTextOffset(codeEl) : null;
                unwrapCodeLineNumbers(codeEl);
                if (caret !== null) restoreCaretAtTextOffset(codeEl, caret);
            }
        });
    }

    /**
     * Live token colours for the code blocks of a note being edited (issue
     * #1695). Blocks were only turned into hljs spans on load, paste and
     * language change, so new code stayed uncoloured until a reload, and text
     * typed next to a token went into its span and took its colour (a line
     * opened above a comment came out as a comment). Rebuilding the spans
     * while typing fixed that but emptied the browser's undo history: Ctrl+Z
     * then did nothing. So an editable block keeps plain text and its tokens
     * are painted over it as ranges (CSS Custom Highlight API), which leaves
     * the DOM the browser edits alone. One highlight per colour group of
     * css/syntax-highlight.css, painted by its ::highlight(pz-syntax-*) rules.
     * Browsers without the API keep the spans drawn on load.
     */
    var supportsLiveTokens = typeof CSS !== 'undefined' && !!CSS.highlights &&
        typeof Highlight === 'function' && typeof StaticRange === 'function';

    var LIVE_TOKEN_GROUPS = {
        'hljs-keyword': 'keyword', 'hljs-literal': 'keyword', 'hljs-doctag': 'keyword',
        'hljs-template-tag': 'keyword', 'hljs-section': 'keyword',
        'hljs-title': 'function', 'hljs-built_in': 'function', 'hljs-bullet': 'function',
        'hljs-type': 'type',
        'hljs-variable': 'variable', 'hljs-template-variable': 'variable', 'hljs-params': 'variable',
        'hljs-property': 'variable', 'hljs-attr': 'variable', 'hljs-attribute': 'variable',
        'hljs-selector-attr': 'variable',
        'hljs-string': 'string',
        'hljs-number': 'number',
        'hljs-regexp': 'regexp', 'hljs-symbol': 'regexp', 'hljs-link': 'regexp',
        'hljs-meta': 'meta',
        'hljs-code': 'comment', 'hljs-comment': 'comment', 'hljs-formula': 'comment', 'hljs-quote': 'comment',
        'hljs-name': 'tag', 'hljs-selector-tag': 'tag', 'hljs-selector-id': 'tag',
        'hljs-selector-class': 'tag', 'hljs-selector-pseudo': 'tag',
        'hljs-operator': 'text', 'hljs-punctuation': 'text', 'hljs-subst': 'text',
        'hljs-emphasis': 'text', 'hljs-strong': 'text',
        'hljs-addition': 'addition', 'hljs-deletion': 'deletion'
    };

    // codeEl -> Map(key -> { group, range }) currently painted
    var liveTokenRanges = new Map();
    // codeEl -> how long its last paint took, in ms
    var liveTokenCost = new Map();
    var liveTokenNodeIds = new WeakMap();
    var nextLiveTokenNodeId = 1;

    function getLiveTokenGroup(span) {
        var classes = span.classList;
        if (classes.contains('hljs-title') && classes.contains('class_')) return 'type';
        if (classes.contains('hljs-variable') && classes.contains('language_')) return 'keyword';
        if (classes.contains('hljs-char') && classes.contains('escape_')) return 'string';
        for (var i = 0; i < classes.length; i++) {
            if (LIVE_TOKEN_GROUPS[classes[i]]) return LIVE_TOKEN_GROUPS[classes[i]];
        }
        return null;
    }

    function getLiveTokenHighlight(group) {
        var name = 'pz-syntax-' + group;
        var highlight = CSS.highlights.get(name);
        if (!highlight) {
            highlight = new Highlight();
            CSS.highlights.set(name, highlight);
        }
        return highlight;
    }

    function getLiveTokenNodeId(node) {
        var id = liveTokenNodeIds.get(node);
        if (!id) {
            id = nextLiveTokenNodeId++;
            liveTokenNodeIds.set(node, id);
        }
        return id;
    }

    function clearLiveTokens(codeEl) {
        var painted = liveTokenRanges.get(codeEl);
        liveTokenCost.delete(codeEl);
        if (!painted) return;
        painted.forEach(function(entry) {
            getLiveTokenHighlight(entry.group).delete(entry.range);
        });
        liveTokenRanges.delete(codeEl);
    }

    /**
     * The language a block is highlighted in, or null when it is not (no or
     * unknown language tag, mermaid, plain block).
     */
    function getLiveTokenLanguage(codeEl) {
        if (codeEl.classList.contains('language-mermaid') || isPlainBlockElement(codeEl)) return null;
        var match = (codeEl.className || '').match(/language-([\w-]+)/);
        return match && isKnownSyntaxHighlightLanguage(match[1]) ? match[1] : null;
    }

    function hasLiveTokenLineBreakInside(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            var breakAt = (node.nodeValue || '').indexOf('\n');
            if (breakAt !== -1 && breakAt < node.nodeValue.length - 1) return true;
        }
        return false;
    }

    /**
     * Bring a block to what the live tokens paint over: plain text, one text
     * node per line. A painted range sits on a node and an offset, so an
     * edit then only moves the ranges of its own line. Typing keeps it so
     * (Enter inserts a <br>). What has to be redone is the text set on load
     * or by a language change (one node), and the spans drawn while the
     * note was still read-only, as the edit lock keeps it until granted
     * (js/note-edit-lock.js): text typed at their edge would land in them.
     * The block is rebuilt off the document and swapped in at once (moving
     * the nodes one by one cost seconds on a long block), and the caret is
     * put back at the same place in the text.
     */
    function prepareLiveTokenBlock(codeEl) {
        if (!codeEl.querySelector('span[class*="hljs-"]') && !hasLiveTokenLineBreakInside(codeEl)) return;

        var caret = computeCaretTextOffset(codeEl);

        var fragment = document.createDocumentFragment();
        (function copy(from, to) {
            for (var child = from.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === Node.ELEMENT_NODE && /(?:^|\s)hljs-/.test(child.getAttribute('class') || '')) {
                    copy(child, to);
                } else {
                    var clone = child.cloneNode(false);
                    to.appendChild(clone);
                    if (child.nodeType === Node.ELEMENT_NODE) copy(child, clone);
                }
            }
        })(codeEl, fragment);
        fragment.normalize();

        var walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, null);
        var lines = [];
        var node;
        while ((node = walker.nextNode())) lines.push(node);
        lines.forEach(function(textNode) {
            var breakAt;
            while ((breakAt = textNode.nodeValue.indexOf('\n')) !== -1 && breakAt < textNode.nodeValue.length - 1) {
                textNode = textNode.splitText(breakAt + 1);
            }
        });

        codeEl.replaceChildren(fragment);
        if (caret !== null) restoreCaretAtSourceOffset(codeEl, caret);
    }

    /**
     * restoreCaretAtTextOffset() for a block that still has its <br>s:
     * counts them as one character, as computeCaretTextOffset() does.
     */
    function restoreCaretAtSourceOffset(codeEl, offset) {
        var textNodes = [];
        var text = '';
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(codeEl.childNodes[i], textNodes, text.length);
        }

        var range = document.createRange();
        range.selectNodeContents(codeEl);
        range.collapse(false);
        for (var n = 0; n < textNodes.length; n++) {
            var length = textNodes[n].node.nodeValue.length;
            // On a boundary, the start of the next node: a line's node ends
            // with its newline, the caret belongs to the next line then. An
            // offset on a <br> lands at the start of the node after it.
            if (offset < textNodes[n].start + length || (n === textNodes.length - 1 && offset <= textNodes[n].start + length)) {
                range.setStart(textNodes[n].node, Math.max(0, offset - textNodes[n].start));
                range.collapse(true);
                break;
            }
        }

        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function paintLiveTokens(codeEl) {
        // Blocks gone with the note they were in
        liveTokenRanges.forEach(function(painted, block) {
            if (!block.isConnected) clearLiveTokens(block);
        });

        var language = getLiveTokenLanguage(codeEl);
        if (!language || !codeEl.isConnected || !codeEl.isContentEditable) {
            clearLiveTokens(codeEl);
            return;
        }

        var startedAt = performance.now();
        prepareLiveTokenBlock(codeEl);
        codeEl.classList.add('hljs');

        var textNodes = [];
        var text = '';
        for (var i = 0; i < codeEl.childNodes.length; i++) {
            text += getTextWithCodeLineBreaks(codeEl.childNodes[i], textNodes, text.length);
        }

        var result = null;
        if (text.trim()) {
            try {
                result = hljs.highlight(text.replace(/\u00A0/g, ' '), { language: language, ignoreIllegals: true });
            } catch (e) {
                console.warn('Highlight.js error:', e);
            }
        }

        // Token segments of the text, each with the colour group of its
        // innermost coloured span
        var segments = [];
        if (result) {
            var position = 0;
            var tokens = document.createElement('template');
            tokens.innerHTML = result.value;
            (function walk(node, group) {
                for (var child = node.firstChild; child; child = child.nextSibling) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        var length = (child.nodeValue || '').length;
                        if (group && group !== 'text' && length) {
                            segments.push({ start: position, end: position + length, group: group });
                        }
                        position += length;
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        walk(child, getLiveTokenGroup(child) || group);
                    }
                }
            })(tokens.content, null);
        }

        // Only what changed goes in and out of the highlights: replacing
        // every range on each keystroke had the browser recompute the whole
        // block, seconds per key in a long one
        var previous = liveTokenRanges.get(codeEl) || new Map();
        var painted = new Map();
        var first = 0;
        segments.forEach(function(segment) {
            // Text nodes come in text order, and so do segments
            while (first < textNodes.length &&
                textNodes[first].start + textNodes[first].node.nodeValue.length <= segment.start) {
                first++;
            }
            if (first >= textNodes.length) return;
            var last = first;
            while (last + 1 < textNodes.length && textNodes[last + 1].start < segment.end) {
                last++;
            }

            var startNode = textNodes[first];
            var endNode = textNodes[last];
            var startOffset = Math.max(0, segment.start - startNode.start);
            var endOffset = Math.min(endNode.node.nodeValue.length, segment.end - endNode.start);
            if (startNode === endNode && startOffset >= endOffset) return;

            var key = segment.group + ':' + getLiveTokenNodeId(startNode.node) + ':' + startOffset +
                ':' + getLiveTokenNodeId(endNode.node) + ':' + endOffset;
            var kept = previous.get(key);
            if (kept) {
                previous.delete(key);
                painted.set(key, kept);
                return;
            }

            // Static: the browser keeps a live Range up to date on every
            // change to the document. The block is painted again after an
            // edit anyway.
            var range = new StaticRange({
                startContainer: startNode.node, startOffset: startOffset,
                endContainer: endNode.node, endOffset: endOffset
            });
            getLiveTokenHighlight(segment.group).add(range);
            painted.set(key, { group: segment.group, range: range });
        });

        previous.forEach(function(entry) {
            getLiveTokenHighlight(entry.group).delete(entry.range);
        });
        liveTokenRanges.set(codeEl, painted);
        liveTokenCost.set(codeEl, performance.now() - startedAt);
    }

    /**
     * The highlighted code block holding the caret, if any. The input event
     * of a contenteditable note targets the .noteentry, never the block.
     */
    function getEditedCodeBlock(host) {
        var selection = window.getSelection ? window.getSelection() : null;
        var node = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
        var el = node && node.nodeType !== 1 ? node.parentElement : node;
        var codeEl = el && el.closest ? el.closest('pre code[class*="language-"]') : null;
        return codeEl && host.contains(codeEl) ? codeEl : null;
    }

    var liveTokenTimer = null;
    var liveTokenPending = new Set();

    function paintPendingLiveTokens() {
        liveTokenTimer = null;
        var blocks = Array.from(liveTokenPending);
        liveTokenPending.clear();
        blocks.forEach(paintLiveTokens);
    }

    /**
     * Paint on the next frame, or once typing slows down when a block takes
     * long to paint (hundreds of lines), so keys never wait on the colours.
     */
    function scheduleLiveTokens(codeEl) {
        liveTokenPending.add(codeEl);
        if (liveTokenTimer !== null) return;

        var cost = 0;
        liveTokenPending.forEach(function(block) {
            cost = Math.max(cost, liveTokenCost.get(block) || 0);
        });
        if (cost < 12) {
            liveTokenTimer = requestAnimationFrame(paintPendingLiveTokens);
        } else {
            liveTokenTimer = setTimeout(paintPendingLiveTokens, Math.min(cost * 4, 600));
        }
    }

    // A note opens read-only and turns editable once its edit lock is
    // granted (js/note-edit-lock.js): its blocks were drawn as spans
    // meanwhile, so they are painted from then on, before any typing
    if (supportsLiveTokens && typeof MutationObserver === 'function') {
        new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                var entry = mutation.target;
                if (entry.classList && entry.classList.contains('noteentry') && entry.isContentEditable &&
                    entry.querySelector('pre code[class*="language-"]')) {
                    applySyntaxHighlighting(entry);
                }
            });
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['contenteditable'], subtree: true });
    }

    // Editable HTML-note blocks drift out of sync while typing (Shift+Enter
    // inserts a BR inside a .code-line wrapper, paste adds newlines, backspace
    // merges lines), so re-sync shortly after the last input.
    var editableRefreshTimer = null;
    // Read by computeCaretTextOffset()
    var lastInputWasLineBreak = false;
    document.addEventListener('input', function(e) {
        // Blocks with a per-block override need re-syncing even when the
        // global setting is off, so this is no longer gated on the body class.
        var host = e.target && e.target.closest ? e.target.closest('.noteentry') : null;
        if (!host || !host.isContentEditable) return;

        lastInputWasLineBreak = e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph';

        // Code just inserted (slash menu, toolbar, paste) before its words get checked
        var selection = window.getSelection ? window.getSelection() : null;
        var editedNode = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
        var editedElement = editedNode && editedNode.nodeType !== 1 ? editedNode.parentElement : editedNode;
        var editedCode = editedElement && editedElement.closest ? editedElement.closest('pre, code') : null;
        if (editedCode && host.contains(editedCode)) disableCodeSpellcheck(editedCode);

        var editedCodeBlock = supportsLiveTokens ? getEditedCodeBlock(host) : null;
        if (editedCodeBlock) scheduleLiveTokens(editedCodeBlock);

        clearTimeout(editableRefreshTimer);
        editableRefreshTimer = setTimeout(function() {
            applyCodeLineNumbers(host);
            // A re-sync rebuilds the lines from copies, taking the painted
            // ranges with the old nodes; a language change ends here too
            liveTokenRanges.forEach(function(painted, codeEl) {
                if (host.contains(codeEl)) scheduleLiveTokens(codeEl);
            });
        }, 250);
    });

    // Arrow up in a numbered block: each line is a display:block .code-line,
    // and Chromium does not stop on one that holds nothing but its newline.
    // Going up, the caret jumped over every blank line (going down it does
    // not). When the line above the caret's row is blank, the caret is put on
    // it here; anything else is left to the browser.
    function isBlankCodeLine(line) {
        return !!line && line.classList && line.classList.contains('code-line') &&
            (line.textContent === '\n' || line.textContent === '');
    }

    function isOnFirstRowOf(line, node, offset) {
        // (a blank line has one row, and no rectangle for a caret on it)
        if (isBlankCodeLine(line)) return true;
        var caret = document.createRange();
        caret.setStart(node, offset);
        caret.collapse(true);
        var caretRect = caret.getClientRects()[0];
        var content = document.createRange();
        content.selectNodeContents(line);
        var firstRow = content.getClientRects()[0];
        if (!caretRect || !firstRow) return false;
        return caretRect.top < firstRow.bottom - 1;
    }

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'ArrowUp' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented || e.isComposing) return;
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.focusNode || (!e.shiftKey && !selection.isCollapsed)) return;
        var focusNode = selection.focusNode;
        var focusElement = focusNode.nodeType === 1 ? focusNode : focusNode.parentElement;
        var line = focusElement && focusElement.closest ? focusElement.closest('code.code-line-numbers > .code-line') : null;
        var host = line ? line.closest('.noteentry') : null;
        if (!host || !host.isContentEditable) return;
        var above = line.previousElementSibling;
        if (!isBlankCodeLine(above) || !isOnFirstRowOf(line, focusNode, selection.focusOffset)) return;

        var target = above.firstChild && above.firstChild.nodeType === 3 ? above.firstChild : above;
        e.preventDefault();
        if (e.shiftKey) {
            selection.extend(target, 0);
        } else {
            selection.collapse(target, 0);
        }
    });

    /**
     * Apply syntax highlighting to all code blocks in a container
     * @param {HTMLElement} container - The container to search for code blocks (optional, defaults to document)
     */
    function applySyntaxHighlighting(container) {
        if (typeof hljs === 'undefined') {
            console.warn('Syntax Highlight: Highlight.js is not loaded');
            return;
        }

        container = container || document;

        // Find all code blocks with a language class
        var codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
        var highlightedAnyBlock = false;
        var liveBlocks = [];

        codeBlocks.forEach(function(codeBlock) {
            // Skip if it's a mermaid block (handled separately)
            if (codeBlock.classList.contains('language-mermaid') ||
                codeBlock.classList.contains('lang-mermaid')) {
                return;
            }

            // Skip if the code block is empty or only has zero-width space
            var text = getCodeBlockSourceText(codeBlock);
            if (!text.trim() || text === '\u200B') {
                return;
            }

            // Get the parent pre element
            var preElement = codeBlock.closest('pre');
            
            // Extract language from code element's class
            var languageMatch = codeBlock.className.match(/language-([\w-]+)/);
            var language = languageMatch ? languageMatch[1] : null;

            if (language && !isKnownSyntaxHighlightLanguage(language)) {
                return;
            }

            // Save the data-language attribute if it exists
            var dataLanguage = codeBlock.getAttribute('data-language') || 
                              (preElement ? preElement.getAttribute('data-language') : null) || 
                              language;

            // Painted once the line numbers below have settled the nodes
            if (supportsLiveTokens && codeBlock.isContentEditable) {
                if (dataLanguage) {
                    codeBlock.setAttribute('data-language', dataLanguage);
                    if (preElement) preElement.setAttribute('data-language', dataLanguage);
                }
                liveBlocks.push(codeBlock);
                return;
            }
            
            // Remove hljs class to allow re-highlighting
            codeBlock.classList.remove('hljs');
            // Remove highlighted dataset to prevent the warning
            delete codeBlock.dataset.highlighted;
            codeBlock.textContent = text;

            try {
                hljs.highlightElement(codeBlock);
                highlightedAnyBlock = true;
                
                // Restore/set data-language on both pre and code elements
                if (dataLanguage) {
                    codeBlock.setAttribute('data-language', dataLanguage);
                    if (preElement) {
                        preElement.setAttribute('data-language', dataLanguage);
                    }
                }
            } catch (e) {
                console.warn('Highlight.js error:', e);
            }
        });

        applyCodeLineNumbers(container);
        liveBlocks.forEach(paintLiveTokens);

        if (highlightedAnyBlock) {
            scheduleSearchHighlightRefresh();
        }
    }

    /**
     * Apply syntax highlighting with auto-detection for code blocks without language class
     * @param {HTMLElement} container - The container to search for code blocks (optional, defaults to document)
     */
    function applyAutoHighlighting(container) {
        if (typeof hljs === 'undefined') {
            console.warn('Highlight.js is not loaded');
            return;
        }

        container = container || document;

        // Find all code blocks in pre elements
        var codeBlocks = container.querySelectorAll('pre code:not([class*="language-"]):not(.hljs)');
        var highlightedAnyBlock = false;
        
        codeBlocks.forEach(function(codeBlock) {
            if (isExplicitPlainCodeBlock(codeBlock) || isPlainBlockElement(codeBlock)) {
                return;
            }

            // Skip if the code block is empty or only has zero-width space
            var text = getCodeBlockSourceText(codeBlock);
            if (!text.trim() || text === '\u200B') {
                return;
            }

            // Only auto-highlight if there's substantial code (at least 10 chars)
            if (text.trim().length < 10) {
                return;
            }

            try {
                // Auto-detect language
                var result = hljs.highlightAuto(text);
                if (result.language && result.relevance > 5) {
                    codeBlock.textContent = text;
                    codeBlock.innerHTML = result.value;
                    codeBlock.classList.add('hljs');
                    codeBlock.classList.add('language-' + result.language);
                    // Auto-detected, not tagged by the user: keep the block out
                    // of the line-number gutter (see isUntaggedCodeBlock).
                    codeBlock.setAttribute('data-auto-language', result.language);
                    highlightedAnyBlock = true;
                }
            } catch (e) {
                console.warn('Highlight.js auto-detect error:', e);
            }
        });

        applyCodeLineNumbers(container);

        if (highlightedAnyBlock) {
            scheduleSearchHighlightRefresh();
        }
    }

    /**
     * Initialize syntax highlighting when DOM is ready
     */
    function initSyntaxHighlighting() {
        applySyntaxHighlighting(document);
    }

    /**
     * Re-highlight code blocks (useful after dynamic content changes)
     * @param {HTMLElement} container - The container to re-highlight (optional)
     */
    function refreshSyntaxHighlighting(container) {
        container = container || document;
        
        // Remove hljs class to allow re-highlighting
        var highlighted = container.querySelectorAll('pre code.hljs');
        highlighted.forEach(function(codeBlock) {
            // Don't remove if it has data-language (explicitly set)
            if (!codeBlock.hasAttribute('data-highlighted')) {
                codeBlock.classList.remove('hljs');
            }
        });

        applySyntaxHighlighting(container);
    }

    // Export functions globally
    window.getCodeBlockSourceText = window.getCodeBlockSourceText || getCodeBlockSourceText;
    window.applySyntaxHighlighting = applySyntaxHighlighting;
    window.applyAutoHighlighting = applyAutoHighlighting;
    window.applyCodeLineNumbers = applyCodeLineNumbers;
    window.unwrapCodeLineNumbers = unwrapCodeLineNumbers;
    window.refreshSyntaxHighlighting = refreshSyntaxHighlighting;
    window.initSyntaxHighlighting = initSyntaxHighlighting;

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyntaxHighlighting);
    } else {
        initSyntaxHighlighting();
    }

    // Hook into reinitializeNoteContent to apply highlighting after note loads
    var hookRetries = 0;
    function hookReinitializeNoteContent() {
        if (typeof window.reinitializeNoteContent === 'function') {
            var originalReinitializeNoteContent = window.reinitializeNoteContent;
            window.reinitializeNoteContent = function() {
                originalReinitializeNoteContent.apply(this, arguments);
                // Apply syntax highlighting after note content is reinitialized
                setTimeout(function() {
                    applySyntaxHighlighting(document);
                }, 100);
            };
        } else if (hookRetries < 20) {
            hookRetries++;
            setTimeout(hookReinitializeNoteContent, 100);
        }
    }

    // Hook after a short delay to ensure other scripts have loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(hookReinitializeNoteContent, 200);
        });
    } else {
        setTimeout(hookReinitializeNoteContent, 200);
    }

    // Only what was added gets highlighted, in one batch. This used to run a
    // pass over the whole note for each added block, and a markdown preview
    // render adds all the note's blocks at once: a note with N code blocks got
    // N full passes (N x N highlights), which pinned the CPU for minutes and
    // ran again on every split-mode re-render.
    var pendingHighlightRoots = new Set();
    var pendingHighlightTimer = null;

    function scheduleHighlight(root) {
        pendingHighlightRoots.add(root);
        if (pendingHighlightTimer !== null) return;

        pendingHighlightTimer = setTimeout(function() {
            pendingHighlightTimer = null;
            var roots = Array.from(pendingHighlightRoots);
            pendingHighlightRoots.clear();
            roots.forEach(function(root) {
                // Replaced by a later render in the meantime
                if (!root.isConnected) return;
                applySyntaxHighlighting(root);
            });
        }, 50);
    }

    // Listen for content changes in note entries (for live preview)
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        // Check if it's a code block or contains code blocks
                        if (node.tagName === 'PRE' ||
                            (node.querySelectorAll && node.querySelectorAll('pre code[class*="language-"]').length > 0)) {
                            scheduleHighlight(node);
                        } else if (node.tagName === 'CODE' && node.closest('pre')) {
                            // applySyntaxHighlighting() looks below its root
                            scheduleHighlight(node.closest('pre'));
                        }
                    }
                });
            }
        });
    });

    // Start observing when DOM is ready
    function startObserving() {
        var noteContainers = document.querySelectorAll('.noteentry, .markdown-preview, .note-content');
        noteContainers.forEach(function(container) {
            observer.observe(container, { childList: true, subtree: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }
})();

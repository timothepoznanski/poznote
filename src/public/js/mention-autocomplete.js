/**
 * Mention autocomplete (discussion #1621)
 *
 * In a note of a shared workspace, typing "@" opens a small menu of the
 * workspace's other members next to the caret; Enter, Tab or a click writes
 * "@username". The mention is that plain text and nothing more: the server
 * finds it by reading the note (lib/mentions.php), so one typed by hand,
 * pasted or written through the API counts just the same.
 *
 * window.PoznoteMentionMembers (index.php) lists who can be mentioned; it is
 * empty in a workspace shared with nobody, where this script does nothing.
 * Same editors and same menu as js/emoji-autocomplete.js, whose styles it
 * reuses.
 */
(function () {
    'use strict';

    var MAX_RESULTS = 8;
    // "@query" at the caret. The "@" must not follow a character an email
    // address could hold before it, as on the server.
    var QUERY_RE = /(^|[^\w.@/-])@([A-Za-z0-9._-]{0,60})$/;

    var menuEl = null;
    var matches = [];
    var selectedIndex = 0;
    var suppressInput = false;
    // { type:'dom', root, node, start, end } or { type:'cm', editor, start, end }
    var ctx = null;

    function getMembers() {
        return Array.isArray(window.PoznoteMentionMembers) ? window.PoznoteMentionMembers : [];
    }

    function getCmApi() {
        return window.PoznoteMarkdownCodeMirror || null;
    }

    function findMatches(query) {
        var q = query.toLowerCase();
        var ranked = [];
        getMembers().forEach(function (name, i) {
            var lower = String(name).toLowerCase();
            var rank = q === '' ? 1 : lower.indexOf(q) === 0 ? 0 : lower.indexOf(q) > 0 ? 2 : -1;
            // Nothing left to complete once the whole name is typed
            if (rank !== -1 && lower !== q) ranked.push({ name: String(name), r: rank, i: i });
        });
        ranked.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
        return ranked.slice(0, MAX_RESULTS);
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // --- Insertion ---

    function replaceInTextNode(root, node, start, end, replacement) {
        var text = node.textContent;
        if (start < 0 || end > text.length) return;

        suppressInput = true;
        var inserted = false;
        try {
            var sel = window.getSelection();
            var range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            sel.removeAllRanges();
            sel.addRange(range);
            // execCommand keeps the browser undo stack and fires the native
            // input event the autosave listens for
            inserted = document.execCommand('insertText', false, replacement);
        } catch (err) {
            inserted = false;
        }
        if (!inserted) {
            node.textContent = text.slice(0, start) + replacement + text.slice(end);
            try {
                var caretRange = document.createRange();
                caretRange.setStart(node, start + replacement.length);
                caretRange.collapse(true);
                var sel2 = window.getSelection();
                sel2.removeAllRanges();
                sel2.addRange(caretRange);
            } catch (err2) { /* caret stays where the browser put it */ }
            root.dispatchEvent(new Event('input', { bubbles: true }));
        }
        suppressInput = false;
    }

    function insertSelected(index) {
        if (!ctx || !matches.length) return;
        var mention = '@' + matches[Math.max(0, Math.min(index, matches.length - 1))].name + ' ';
        if (ctx.type === 'cm') {
            var api = getCmApi();
            if (api && typeof api.replaceRange === 'function') {
                suppressInput = true;
                api.replaceRange(ctx.editor, ctx.start, ctx.end, mention);
                suppressInput = false;
            }
        } else {
            replaceInTextNode(ctx.root, ctx.node, ctx.start, ctx.end, mention);
        }
        hideMenu();
    }

    // --- Menu ---

    function hideMenu() {
        if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
        menuEl = null;
        matches = [];
        selectedIndex = 0;
        ctx = null;
    }

    function updateSelectedClass() {
        if (!menuEl) return;
        var items = menuEl.querySelectorAll('.emoji-autocomplete-item');
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('selected', i === selectedIndex);
        }
    }

    function showMenu(rect) {
        if (!menuEl) {
            menuEl = document.createElement('div');
            menuEl.className = 'emoji-autocomplete-menu mention-autocomplete-menu';
            menuEl.addEventListener('mousedown', function (e) {
                // keep focus and selection in the editor
                e.preventDefault();
            });
            menuEl.addEventListener('click', function (e) {
                var item = e.target.closest ? e.target.closest('.emoji-autocomplete-item') : null;
                if (item) insertSelected(parseInt(item.getAttribute('data-index'), 10) || 0);
            });
            menuEl.addEventListener('mouseover', function (e) {
                var item = e.target.closest ? e.target.closest('.emoji-autocomplete-item') : null;
                if (item) {
                    selectedIndex = parseInt(item.getAttribute('data-index'), 10) || 0;
                    updateSelectedClass();
                }
            });
            document.body.appendChild(menuEl);
        }

        var html = '';
        for (var i = 0; i < matches.length; i++) {
            html += '<div class="emoji-autocomplete-item' + (i === selectedIndex ? ' selected' : '') + '" data-index="' + i + '">' +
                '<span class="emoji-autocomplete-emoji"><i class="lucide lucide-at-sign"></i></span>' +
                '<span class="emoji-autocomplete-name">' + escapeHtml(matches[i].name) + '</span>' +
                '</div>';
        }
        menuEl.innerHTML = html;

        var menuRect = menuEl.getBoundingClientRect();
        var margin = 6;
        var left = Math.max(8, Math.min(rect.left, window.innerWidth - menuRect.width - 8));
        var top = rect.bottom + margin;
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, rect.top - menuRect.height - margin);
        }
        menuEl.style.left = left + 'px';
        menuEl.style.top = top + 'px';
    }

    function getDomCaretRect(range, fallbackEl) {
        var rects = range.getClientRects();
        if (rects && rects.length) return rects[0];
        var rect = range.getBoundingClientRect();
        if (rect && (rect.top || rect.left || rect.height)) return rect;
        return fallbackEl.getBoundingClientRect();
    }

    // --- Trigger detection ---

    function handleEditableInput(noteEntry) {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) { hideMenu(); return; }
        var range = sel.getRangeAt(0);
        if (!range.collapsed) { hideMenu(); return; }
        var node = range.startContainer;
        if (node.nodeType !== 3) { hideMenu(); return; }
        var parentEl = node.parentElement;
        if (!parentEl || !parentEl.isContentEditable || parentEl.closest('pre, code')) { hideMenu(); return; }

        var offset = range.startOffset;
        var m = node.textContent.substring(0, offset).match(QUERY_RE);
        if (!m) { hideMenu(); return; }
        matches = findMatches(m[2]);
        if (!matches.length) { hideMenu(); return; }

        selectedIndex = 0;
        ctx = { type: 'dom', root: noteEntry, node: node, start: offset - m[2].length - 1, end: offset };
        showMenu(getDomCaretRect(range, noteEntry));
    }

    function handleCodeMirrorInput(editor) {
        var api = getCmApi();
        if (!api || typeof api.getSelectionOffsets !== 'function' || typeof api.getLineAt !== 'function') return;
        var selOff = api.getSelectionOffsets(editor);
        if (!selOff || selOff.start !== selOff.end) { hideMenu(); return; }
        var line = api.getLineAt(editor, selOff.end);
        if (!line) { hideMenu(); return; }
        var cursor = Math.max(line.from, Math.min(selOff.end, line.to));
        var m = line.text.slice(0, cursor - line.from).match(QUERY_RE);
        if (!m) { hideMenu(); return; }
        matches = findMatches(m[2]);
        if (!matches.length) { hideMenu(); return; }

        selectedIndex = 0;
        ctx = { type: 'cm', editor: editor, start: cursor - m[2].length - 1, end: cursor };
        var coords = typeof api.getCoordsAtPos === 'function' ? api.getCoordsAtPos(editor, cursor) : null;
        showMenu(coords || editor.getBoundingClientRect());
    }

    function handleInput(e) {
        if (suppressInput || !getMembers().length) return;
        var target = e.target;
        if (!target || !target.closest) return;

        var cmHost = target.closest('.markdown-codemirror-host');
        var api = getCmApi();
        if (cmHost && api && typeof api.isCodeMirrorEditor === 'function' && api.isCodeMirrorEditor(cmHost)) {
            handleCodeMirrorInput(cmHost);
            return;
        }

        var noteEntry = target.closest('.noteentry');
        if (!noteEntry) {
            if (menuEl) hideMenu();
            return;
        }
        handleEditableInput(noteEntry);
    }

    function handleKeydown(e) {
        if (!menuEl) return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex + 1) % matches.length;
                updateSelectedClass();
                break;
            case 'ArrowUp':
                e.preventDefault();
                e.stopPropagation();
                selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
                updateSelectedClass();
                break;
            case 'Enter':
            case 'Tab':
                e.preventDefault();
                e.stopPropagation();
                insertSelected(selectedIndex);
                break;
            case 'Escape':
                e.preventDefault();
                e.stopPropagation();
                hideMenu();
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
            case 'Home':
            case 'End':
            case 'PageUp':
            case 'PageDown':
                hideMenu();
                break;
        }
    }

    function init() {
        document.addEventListener('input', handleInput, true);
        // window capture, like the emoji menu: Enter must not reach the list
        // and slash-command handlers while the menu is open
        window.addEventListener('keydown', handleKeydown, true);
        document.addEventListener('mousedown', function (e) {
            if (menuEl && !menuEl.contains(e.target)) hideMenu();
        }, true);
        document.addEventListener('scroll', function (e) {
            if (menuEl && !menuEl.contains(e.target)) hideMenu();
        }, true);
        window.addEventListener('blur', hideMenu);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

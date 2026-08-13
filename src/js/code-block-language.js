/**
 * Code block language modal.
 *
 * Clicking the language badge of a code block in an HTML note opens a modal
 * that lets the user switch the block to another language or drop the tag
 * entirely (which turns it into a plain block: no badge, no highlighting and
 * no line numbers).
 *
 * The badge itself is a CSS ::before pseudo-element and cannot receive clicks,
 * so a transparent button is overlaid on it, hosted in the same
 * .code-block-actions-host wrapper as the copy/delete buttons
 * (js/copy-code-on-focus.js). Like those buttons it is pure decoration and is
 * stripped before the note is stored (stripSearchHighlights in js/notes.js).
 */
(function () {
    'use strict';

    var LANG_BTN_CLASS = 'code-block-lang-btn';
    var MODAL_ID = 'codeBlockLanguageModal';

    // The code block currently being edited, set when the modal opens
    var activeBlock = null;

    function tl(key, fallback, vars) {
        if (typeof window.t === 'function') {
            return window.t(key, vars || null, fallback);
        }
        return fallback;
    }

    function getPreElement(block) {
        if (!block) return null;
        return block.tagName === 'PRE' ? block : (block.closest ? block.closest('pre') : null);
    }

    /**
     * The language shown on the badge, or '' for an untagged block.
     * Both the PRE and the CODE carry data-language (see slash-command.js),
     * except for toolbar-inserted blocks (js/toolbar.js) where the .code-block
     * class alone makes the CSS draw a "CODE" badge.
     */
    function getBlockLanguage(block) {
        var pre = getPreElement(block);
        if (!pre) return '';

        var code = pre.querySelector('code');
        var lang = pre.getAttribute('data-language') ||
            (code ? code.getAttribute('data-language') : '') || '';
        lang = String(lang).trim();

        if (!lang && pre.classList.contains('code-block') &&
            !pre.classList.contains('plain-block')) {
            return 'CODE';
        }
        return lang;
    }

    /**
     * Only editable HTML notes get the button: markdown blocks are generated
     * from their source, so the language must be edited in the markdown itself.
     */
    function isEditableHtmlCodeBlock(block) {
        var pre = getPreElement(block);
        if (!pre) return false;
        if (pre.closest('.markdown-preview')) return false;

        var noteentry = pre.closest('.noteentry');
        return !!(noteentry && noteentry.isContentEditable);
    }

    /**
     * The badge may carry an alias of the listed language (a block tagged "js"
     * is the "javascript" entry), so aliases are resolved through highlight.js
     * before comparing.
     */
    function canonicalLanguage(lang) {
        var normalized = String(lang || '').trim().toLowerCase();
        if (!normalized) return '';

        if (typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function') {
            var definition = hljs.getLanguage(normalized);
            if (definition && definition.name) {
                return String(definition.name).toLowerCase();
            }
        }
        return normalized;
    }

    /* ---------------------------------------------------------------- *
     * Applying a language to a block
     * ---------------------------------------------------------------- */

    function isSyntaxHighlightLanguage(lang) {
        var normalized = String(lang || '').trim().toLowerCase();
        return !!(normalized && typeof hljs !== 'undefined' && hljs &&
            typeof hljs.getLanguage === 'function' && hljs.getLanguage(normalized));
    }

    /**
     * Reset a code block to its raw text so it can be re-tagged: highlight.js
     * markup and line-number wrappers are rebuilt from scratch afterwards.
     */
    function resetCodeElement(code) {
        if (!code) return;

        var text = '';
        if (typeof window.getCodeBlockSourceText === 'function') {
            text = window.getCodeBlockSourceText(code);
        } else {
            text = code.textContent || '';
        }

        if (typeof window.unwrapCodeLineNumbers === 'function') {
            window.unwrapCodeLineNumbers(code);
        }

        code.textContent = text;
        code.className = '';
        code.removeAttribute('data-language');
        code.removeAttribute('data-auto-language');
        code.removeAttribute('data-highlighted');
        code.removeAttribute('style');
        if (!code.getAttribute('class')) code.removeAttribute('class');
    }

    /**
     * Retag a block. An empty language turns it into a plain block.
     */
    function applyLanguage(block, lang) {
        var pre = getPreElement(block);
        if (!pre) return;

        var code = pre.querySelector('code');
        if (!code) return;

        var noteentry = pre.closest('.noteentry');
        resetCodeElement(code);

        var normalized = String(lang || '').trim();

        if (!normalized) {
            // Plain block: no badge, no highlighting, no line numbers.
            // .code-block (set by the toolbar button, js/toolbar.js) draws a
            // "CODE" badge on its own, so it has to go too or the tag would
            // survive its own removal.
            pre.removeAttribute('data-language');
            pre.classList.remove('code-block');
            pre.classList.add('plain-block');
        } else {
            pre.classList.remove('plain-block');

            var isPlainTag = normalized.toLowerCase() === 'code';
            var badge = isPlainTag ? 'CODE' : normalized;

            pre.setAttribute('data-language', badge);
            code.setAttribute('data-language', badge);

            if (!isPlainTag && isSyntaxHighlightLanguage(normalized)) {
                code.className = 'language-' + normalized.toLowerCase();
                if (typeof window.applySyntaxHighlighting === 'function') {
                    window.applySyntaxHighlighting(pre);
                }
            }
        }

        if (typeof window.applyCodeLineNumbers === 'function') {
            window.applyCodeLineNumbers(noteentry || document);
        }

        refreshLanguageButton(pre);

        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
        if (noteentry) {
            noteentry.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /* ---------------------------------------------------------------- *
     * The clickable badge overlay
     * ---------------------------------------------------------------- */

    function removeLanguageButton(host) {
        if (!host) return;
        var existing = host.querySelector ? host.querySelector('.' + LANG_BTN_CLASS) : null;
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    /**
     * Add (or refresh) the invisible button sitting on top of the badge.
     * Untagged blocks draw no badge, so they get no button.
     */
    function refreshLanguageButton(block) {
        var pre = getPreElement(block);
        if (!pre) return;

        var host = pre.parentElement;
        if (!host || !host.classList || !host.classList.contains('code-block-actions-host')) {
            return;
        }

        var lang = getBlockLanguage(pre);
        if (!lang || !isEditableHtmlCodeBlock(pre)) {
            removeLanguageButton(host);
            return;
        }

        var btn = host.querySelector('.' + LANG_BTN_CLASS);
        if (!btn) {
            btn = document.createElement('button');
            btn.className = LANG_BTN_CLASS;
            btn.setAttribute('type', 'button');
            btn.setAttribute('contenteditable', 'false');
            host.appendChild(btn);
        }

        var label = tl('editor.code_block_language.button', 'Change the language of this code block');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        // Sized on the badge so the hit area matches what the user sees
        btn.style.width = Math.max(String(lang).length, 2) + 'ch';
    }

    function refreshAllLanguageButtons(root) {
        var scope = (root && root.querySelectorAll) ? root : document;
        var hosts = scope.querySelectorAll('.code-block-actions-host');

        for (var i = 0; i < hosts.length; i++) {
            var pre = hosts[i].querySelector('pre');
            if (pre) refreshLanguageButton(pre);
        }
    }

    /* ---------------------------------------------------------------- *
     * Modal
     * ---------------------------------------------------------------- */

    /**
     * Score an entry against the filter, matching the label, the language id
     * and the highlight.js aliases so "js" finds JavaScript and "c#" finds C#.
     * Returns 0 when nothing matches; higher is a better match, so an exact
     * alias ("rs") outranks a mid-word one ("PoweRShell").
     */
    function matchFilterScore(entry, needle) {
        var haystack = [String(entry.label || ''), String(entry.lang || '')];

        if (typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function') {
            var definition = hljs.getLanguage(String(entry.lang || '').toLowerCase());
            if (definition) {
                if (definition.name) haystack.push(String(definition.name));
                if (definition.aliases) haystack = haystack.concat(definition.aliases);
            }
        }

        var best = 0;
        for (var i = 0; i < haystack.length; i++) {
            var candidate = String(haystack[i]).toLowerCase();
            var at = candidate.indexOf(needle);
            if (at === -1) continue;

            var score = 1;
            if (at === 0) score = candidate === needle ? 3 : 2;
            if (score > best) best = score;
        }
        return best;
    }

    function getLanguageEntries() {
        return [{
            lang: 'code',
            label: tl('editor.code_block_language.plain_code', 'Code (no highlighting)')
        }].concat(window.CODE_BLOCK_LANGUAGES || []);
    }

    /**
     * Render the language list, keeping only the entries matching `filter`
     * and showing the best matches first.
     */
    function renderLanguageList(currentLang, filter) {
        var container = document.getElementById('codeBlockLanguageList');
        if (!container) return;

        container.textContent = '';

        var normalized = String(currentLang || '').trim().toLowerCase();
        var canonical = canonicalLanguage(normalized);
        var needle = String(filter || '').trim().toLowerCase();

        var visible = [];
        getLanguageEntries().forEach(function (entry, index) {
            var score = needle ? matchFilterScore(entry, needle) : 1;
            if (score > 0) visible.push({ entry: entry, score: score, index: index });
        });

        // Best match first, original order preserved within a score
        visible.sort(function (a, b) {
            return b.score - a.score || a.index - b.index;
        });

        visible.forEach(function (row) {
            var entry = row.entry;
            var entryLang = String(entry.lang).toLowerCase();

            var item = document.createElement('button');
            item.className = 'code-block-language-item';
            item.setAttribute('type', 'button');
            item.setAttribute('data-lang', entry.lang);

            if (entryLang === normalized ||
                (!!canonical && canonicalLanguage(entryLang) === canonical)) {
                item.classList.add('selected');
            }

            item.textContent = String(entry.label || '');
            container.appendChild(item);
        });

        if (!visible.length) {
            var empty = document.createElement('div');
            empty.className = 'code-block-language-empty';
            empty.textContent = tl('editor.code_block_language.no_match', 'No matching language');
            container.appendChild(empty);
        }
    }

    function openModal(block) {
        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;

        activeBlock = block;

        var filterInput = document.getElementById('codeBlockLanguageFilter');
        if (filterInput) filterInput.value = '';

        renderLanguageList(getBlockLanguage(block), '');
        modal.style.display = 'flex';

        if (filterInput) {
            // Let the modal paint before focusing, otherwise mobile keyboards
            // and the click that opened the modal fight over the focus.
            setTimeout(function () { filterInput.focus(); }, 0);
        }
    }

    function closeModalSafe() {
        activeBlock = null;
        if (typeof window.closeModal === 'function') {
            window.closeModal(MODAL_ID);
            return;
        }
        var modal = document.getElementById(MODAL_ID);
        if (modal) modal.style.display = 'none';
    }

    /* ---------------------------------------------------------------- *
     * Wiring
     * ---------------------------------------------------------------- */

    document.addEventListener('click', function (e) {
        // Open the modal from the badge overlay
        var langBtn = e.target.closest ? e.target.closest('.' + LANG_BTN_CLASS) : null;
        if (langBtn) {
            e.preventDefault();
            e.stopPropagation();

            var host = langBtn.closest('.code-block-actions-host');
            var pre = host ? host.querySelector('pre') : null;
            if (pre) openModal(pre);
            return;
        }

        // Pick a language
        var item = e.target.closest ? e.target.closest('.code-block-language-item') : null;
        if (item) {
            e.preventDefault();
            var block = activeBlock;
            closeModalSafe();
            if (block) applyLanguage(block, item.getAttribute('data-lang'));
            return;
        }

        // Remove the tag
        var action = e.target.closest ? e.target.closest('[data-action="remove-code-block-language"]') : null;
        if (action) {
            e.preventDefault();
            var target = activeBlock;
            closeModalSafe();
            if (target) applyLanguage(target, '');
        }
    });

    document.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'codeBlockLanguageFilter') return;
        renderLanguageList(getBlockLanguage(activeBlock), e.target.value);
    });

    document.addEventListener('keydown', function (e) {
        if (!e.target || e.target.id !== 'codeBlockLanguageFilter') return;
        if (e.key !== 'Enter') return;

        // Enter applies the first (or only) match, like a quick picker
        e.preventDefault();
        var first = document.querySelector('#codeBlockLanguageList .code-block-language-item');
        if (!first) return;

        var block = activeBlock;
        closeModalSafe();
        if (block) applyLanguage(block, first.getAttribute('data-lang'));
    });

    window.refreshCodeBlockLanguageButtons = refreshAllLanguageButtons;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            refreshAllLanguageButtons(document);
        });
    } else {
        refreshAllLanguageButtons(document);
    }
})();

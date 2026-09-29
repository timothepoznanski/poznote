/**
 * Text Selection Module
 * Manages formatting toolbar visibility based on text selection context
 */

// Text selection management for formatting toolbar
function initTextSelectionHandlers() {
    var selectionTimeout;
    var wasMobileKeyboardOpen = false;
    var pendingKeyboardCloseBlurTimer = null;
    var plainCodeBlockedButtonClasses = ['btn-link', 'btn-text-height', 'btn-inline-code', 'btn-code'];

    function getSelectionOffsetsWithinMarkdownEditor(editor, range) {
        if (!editor || !range) return null;

        if (typeof getRangeOffsetsWithinEditor === 'function') {
            var existingOffsets = getRangeOffsetsWithinEditor(editor, range);
            if (existingOffsets) return existingOffsets;
        }

        try {
            if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
                return null;
            }

            var startRange = range.cloneRange();
            startRange.selectNodeContents(editor);
            startRange.setEnd(range.startContainer, range.startOffset);

            var endRange = range.cloneRange();
            endRange.selectNodeContents(editor);
            endRange.setEnd(range.endContainer, range.endOffset);

            return {
                start: Math.min(startRange.toString().length, endRange.toString().length),
                end: Math.max(startRange.toString().length, endRange.toString().length)
            };
        } catch (e) {
            return null;
        }
    }

    function getMarkdownEditorPlainText(editor) {
        if (!editor) return '';

        if (typeof getMarkdownEditorText === 'function') {
            return getMarkdownEditorText(editor);
        }

        return editor.innerText || editor.textContent || '';
    }

    function isPlainCodeBlockLanguage(language) {
        var normalizedLanguage = String(language || '').trim().toLowerCase();
        return normalizedLanguage === 'code' || normalizedLanguage === 'normal';
    }

    function isSyntaxHighlightLanguage(language) {
        var normalizedLanguage = String(language || '').trim().toLowerCase();
        if (!normalizedLanguage) return false;
        if (normalizedLanguage === 'mermaid') return true;

        if (typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function') {
            return !!hljs.getLanguage(normalizedLanguage);
        }

        var fallbackLanguages = {
            bash: true, sh: true, c: true, cpp: true, 'c++': true, csharp: true, cs: true, 'c#': true,
            css: true, diff: true, patch: true, go: true, graphql: true, gql: true, ini: true,
            java: true, javascript: true, js: true, jsx: true, mjs: true, cjs: true, json: true,
            kotlin: true, less: true, lua: true, makefile: true, markdown: true, md: true,
            objectivec: true, objc: true, perl: true, php: true, 'php-template': true,
            plaintext: true, text: true, txt: true, python: true, py: true, gyp: true, ipython: true,
            'python-repl': true, pycon: true, r: true, ruby: true, rb: true, rust: true, rs: true,
            scss: true, shell: true, console: true, shellsession: true, sql: true, swift: true,
            typescript: true, ts: true, tsx: true, mts: true, cts: true, vbnet: true, wasm: true,
            xml: true, html: true, xhtml: true, svg: true, yaml: true, yml: true
        };

        return !!fallbackLanguages[normalizedLanguage];
    }

    function isPlainFormattingCodeBlockLanguage(language) {
        var normalizedLanguage = String(language || '').trim().toLowerCase();
        return isPlainCodeBlockLanguage(normalizedLanguage) || !isSyntaxHighlightLanguage(normalizedLanguage);
    }

    function rangesOverlap(startA, endA, startB, endB) {
        return startA < endB && endA > startB;
    }

    function getSelectionCodeBlockType(editor, range) {
        var offsets = getSelectionOffsetsWithinMarkdownEditor(editor, range);
        if (!offsets) return null;

        var selectionStart = Math.min(offsets.start, offsets.end);
        var selectionEnd = Math.max(offsets.start, offsets.end);
        if (selectionStart === selectionEnd) return null;

        var text = getMarkdownEditorPlainText(editor);
        var lines = text.split('\n');
        var position = 0;
        var inFence = false;
        var blockStart = 0;
        var blockHasLanguage = false;
        var blockIsPlainCode = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var lineStart = position;
            var lineEnd = lineStart + line.length;
            var fenceMatch = line.match(/^[ \t]*```([^`]*)$/);

            if (fenceMatch) {
                if (!inFence) {
                    var language = (fenceMatch[1] || '').trim();
                    inFence = true;
                    blockStart = lineStart;
                    blockHasLanguage = language !== '' && isSyntaxHighlightLanguage(language);
                    blockIsPlainCode = isPlainFormattingCodeBlockLanguage(language);
                } else {
                    if (rangesOverlap(selectionStart, selectionEnd, blockStart, lineEnd)) {
                        if (blockHasLanguage) return 'language';
                        if (blockIsPlainCode) return 'plain';
                    }
                    inFence = false;
                    blockHasLanguage = false;
                    blockIsPlainCode = false;
                }
            }

            position = lineEnd + 1;
        }

        if (inFence && rangesOverlap(selectionStart, selectionEnd, blockStart, text.length)) {
            if (blockHasLanguage) return 'language';
            if (blockIsPlainCode) return 'plain';
        }

        return null;
    }

    // Classify a markdown selection: type is 'task' | 'ul' | 'ol' when every
    // non-empty selected line is that list type, null otherwise. insideItemText
    // is true when the selection stays within one item's text, after its marker
    function getMarkdownListSelectionType(editor, range) {
        var offsets = getSelectionOffsetsWithinMarkdownEditor(editor, range);
        if (!offsets) return null;

        var selectionStart = Math.min(offsets.start, offsets.end);
        var selectionEnd = Math.max(offsets.start, offsets.end);

        var text = getMarkdownEditorPlainText(editor);
        var lines = text.split('\n');
        var position = 0;
        var selectionType = null;
        var selectedLineCount = 0;
        var insideItemText = false;

        for (var i = 0; i < lines.length; i++) {
            var lineStart = position;
            var lineEnd = lineStart + lines[i].length;

            if (lineStart <= selectionEnd && lineEnd >= selectionStart) {
                if (lines[i].trim() !== '') {
                    var lineType = null;
                    var marker = lines[i].match(/^\s*[-*+]\s+\[[ xX]\]\s*/);
                    if (marker) {
                        lineType = 'task';
                    } else if ((marker = lines[i].match(/^\s*[-*+]\s+/))) {
                        lineType = 'ul';
                    } else if ((marker = lines[i].match(/^\s*\d+(?:\.\d+)*\.\s+/))) {
                        lineType = 'ol';
                    }
                    if (!lineType) return null;
                    if (selectionType && selectionType !== lineType) return null;
                    selectionType = lineType;
                    selectedLineCount++;
                    insideItemText = selectionStart >= lineStart + marker[0].length
                        && selectionEnd <= lineEnd;
                }
            }

            if (lineStart > selectionEnd) break;
            position = lineEnd + 1;
        }

        if (!selectionType) return null;

        return {
            type: selectionType,
            insideItemText: selectedLineCount === 1 && insideItemText
        };
    }

    function isListSelectionAllowedButton(button, selectionType) {
        if (!button || !button.classList) return false;

        // Search and replace acts on the whole note, keep it available everywhere
        if (button.classList.contains('btn-search-replace-format')) return true;

        if (button.classList.contains('btn-task-remove')) {
            return selectionType === 'task';
        }

        return button.classList.contains('btn-task-list')
            || button.classList.contains('btn-list-ul')
            || button.classList.contains('btn-list-ol');
    }

    function getElementFromNode(node) {
        if (!node) return null;
        return node.nodeType === 3 ? node.parentElement : node;
    }

    function getHtmlCodeBlockLanguage(pre) {
        if (!pre) return '';

        var code = pre.querySelector ? pre.querySelector('code') : null;
        var language = (code && code.getAttribute('data-language')) || pre.getAttribute('data-language') || '';

        if (!language) {
            var classSource = String((code && code.className) || '') + ' ' + String(pre.className || '');
            var classLanguageMatch = classSource.match(/(?:^|\s)language-([\w-]+)/);
            language = classLanguageMatch ? classLanguageMatch[1] : '';
        }

        return String(language || '').trim();
    }

    function getHtmlCodeBlockType(pre) {
        if (!pre) return null;

        var language = getHtmlCodeBlockLanguage(pre);
        if (!language || isPlainFormattingCodeBlockLanguage(language)) {
            return 'plain';
        }

        return 'language';
    }

    function rangeIntersectsNode(range, node) {
        if (!range || !node || typeof range.intersectsNode !== 'function') return false;

        try {
            return range.intersectsNode(node);
        } catch (e) {
            return false;
        }
    }

    function getSelectionHtmlCodeBlockType(editor, range) {
        if (!editor || !range) return null;

        var startElement = getElementFromNode(range.startContainer);
        var endElement = getElementFromNode(range.endContainer);
        var candidatePres = [];
        var startPre = startElement && startElement.closest ? startElement.closest('pre') : null;
        var endPre = endElement && endElement.closest ? endElement.closest('pre') : null;

        if (startPre && editor.contains(startPre)) candidatePres.push(startPre);
        if (endPre && endPre !== startPre && editor.contains(endPre)) candidatePres.push(endPre);

        if (editor.querySelectorAll) {
            var allPres = editor.querySelectorAll('pre');
            for (var i = 0; i < allPres.length; i++) {
                if (candidatePres.indexOf(allPres[i]) === -1 && rangeIntersectsNode(range, allPres[i])) {
                    candidatePres.push(allPres[i]);
                }
            }
        }

        var selectionType = null;
        for (var j = 0; j < candidatePres.length; j++) {
            var codeBlockType = getHtmlCodeBlockType(candidatePres[j]);
            if (codeBlockType === 'language') return 'language';
            if (codeBlockType === 'plain') selectionType = 'plain';
        }

        return selectionType;
    }

    function isPlainCodeBlockedButton(button) {
        if (!button || !button.classList) return false;

        for (var i = 0; i < plainCodeBlockedButtonClasses.length; i++) {
            if (button.classList.contains(plainCodeBlockedButtonClasses[i])) {
                return true;
            }
        }

        return false;
    }

    function isMobileFormattingViewport() {
        try {
            return window.matchMedia && window.matchMedia('(max-width: 800px)').matches;
        } catch (e) {
            return window.innerWidth <= 800;
        }
    }

    function setMobileFormattingToolbarActive(active) {
        if (!document.body) return;

        syncMobileViewportToolbarState();

        var shouldActivate = !!active && isMobileFormattingViewport();
        document.body.classList.toggle('mobile-formatting-toolbar-active', shouldActivate);
        syncMobileNoteHeaderMetrics();
    }

    function getMobileViewportKeyboardInset() {
        var visualViewport = window.visualViewport;
        if (!visualViewport) return 0;

        var layoutHeight = document.documentElement ? document.documentElement.clientHeight : window.innerHeight;
        var currentHeight = Math.round(visualViewport.height || window.innerHeight || 0);
        var baselineHeight = window.__poznoteMobileViewportBaselineHeight || 0;

        if (!baselineHeight || currentHeight > baselineHeight || layoutHeight > baselineHeight) {
            baselineHeight = Math.max(currentHeight, layoutHeight);
            window.__poznoteMobileViewportBaselineHeight = baselineHeight;
        }

        // Only the height shrink indicates the keyboard. Do NOT subtract visualViewport.offsetTop:
        // when the caret is low and the browser pans to reveal it, offsetTop grows and would make
        // an open keyboard look closed, causing the toolbar to jump and the editor to blur.
        return Math.max(0, Math.round(baselineHeight - currentHeight));
    }

    function getActiveMobileEditableElement() {
        var activeElement = document.activeElement;
        if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
            var activeEditable = getMobileEditableRoot(activeElement);
            if (activeEditable) return activeEditable;
        }

        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.rangeCount === 0) return null;

        var node = selection.anchorNode;
        var element = node && node.nodeType === 3 ? node.parentElement : node;
        return getMobileEditableRoot(element);
    }

    function getMobileEditableRoot(element) {
        if (!element || !element.closest) return null;

        if (element.matches && element.matches('input, textarea, select, [contenteditable="true"]')) {
            return element;
        }

        return element.closest('.noteentry, .markdown-editor, .css-title, .editable-tags-container, .tag-input');
    }

    function clearCollapsedSelectionInside(element) {
        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

        var node = selection.anchorNode;
        var anchorElement = node && node.nodeType === 3 ? node.parentElement : node;
        if (anchorElement && element && (anchorElement === element || (element.contains && element.contains(anchorElement)))) {
            selection.removeAllRanges();
        }
    }

    function blurMobileEditorAfterKeyboardClose() {
        var editableElement = getActiveMobileEditableElement();
        if (!editableElement) return;

        if (typeof editableElement.blur === 'function') {
            editableElement.blur();
        }

        clearCollapsedSelectionInside(editableElement);
        setMobileFormattingToolbarActive(false);
    }

    function hasActiveTextSelection() {
        var selection = window.getSelection ? window.getSelection() : null;
        return !!(selection && selection.rangeCount > 0 && !selection.isCollapsed
            && selection.toString().trim().length > 0);
    }

    function scheduleMobileEditorBlurOnKeyboardClose() {
        if (pendingKeyboardCloseBlurTimer) {
            clearTimeout(pendingKeyboardCloseBlurTimer);
        }

        // The visual viewport jitters while the keyboard animates open, which can
        // momentarily look like a close. Re-verify after the animation settles so we
        // only blur on a genuine keyboard close (e.g. Android back button).
        pendingKeyboardCloseBlurTimer = setTimeout(function () {
            pendingKeyboardCloseBlurTimer = null;
            if (!isMobileFormattingViewport()) return;
            if (getMobileViewportKeyboardInset() > 120) return;
            // Selecting text closes the keyboard on many mobile browsers; keep the
            // formatting toolbar and selection intact instead of blurring it away.
            if (hasActiveTextSelection()) return;
            blurMobileEditorAfterKeyboardClose();
        }, 400);
    }

    function syncMobileViewportToolbarState() {
        if (!document.documentElement || !document.body) return;

        var visualViewport = window.visualViewport;
        var viewportTop = 0;
        var keyboardInset = 0;
        var viewportHeight = 0;

        if (visualViewport && isMobileFormattingViewport()) {
            viewportTop = Math.max(0, Math.round(visualViewport.offsetTop || 0));
            keyboardInset = getMobileViewportKeyboardInset();
            viewportHeight = Math.max(0, Math.round(visualViewport.height || 0));
        }

        var isKeyboardOpen = keyboardInset > 120;
        document.documentElement.style.setProperty('--mobile-visual-viewport-top', viewportTop + 'px');
        if (viewportHeight > 0) {
            document.documentElement.style.setProperty('--mobile-visual-viewport-height', viewportHeight + 'px');
        } else {
            document.documentElement.style.removeProperty('--mobile-visual-viewport-height');
        }
        document.body.classList.toggle('mobile-keyboard-open', isKeyboardOpen);
        syncMobileNoteHeaderMetrics();

        if (isKeyboardOpen && pendingKeyboardCloseBlurTimer) {
            clearTimeout(pendingKeyboardCloseBlurTimer);
            pendingKeyboardCloseBlurTimer = null;
        }

        if (wasMobileKeyboardOpen && !isKeyboardOpen && isMobileFormattingViewport()) {
            scheduleMobileEditorBlurOnKeyboardClose();
        }
        wasMobileKeyboardOpen = isKeyboardOpen;
    }

    function syncMobileNoteHeaderMetrics() {
        if (!document.documentElement) return;

        if (!isMobileFormattingViewport()) {
            document.documentElement.style.removeProperty('--mobile-note-header-height');
            return;
        }

        var noteHeader = document.querySelector('#right_col .note-header');
        if (!noteHeader) {
            document.documentElement.style.removeProperty('--mobile-note-header-height');
            return;
        }

        var headerHeight = Math.ceil(noteHeader.getBoundingClientRect().height || 0);
        if (headerHeight > 0) {
            document.documentElement.style.setProperty('--mobile-note-header-height', headerHeight + 'px');
        }
    }

    function initializeMobileViewportToolbarState() {
        if (window.__poznoteMobileViewportToolbarStateInitialized) return;
        window.__poznoteMobileViewportToolbarStateInitialized = true;

        syncMobileViewportToolbarState();

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncMobileViewportToolbarState);
            window.visualViewport.addEventListener('scroll', syncMobileViewportToolbarState);
        }

        window.addEventListener('resize', syncMobileViewportToolbarState);
        window.addEventListener('orientationchange', function () {
            window.__poznoteMobileViewportBaselineHeight = 0;
            setTimeout(syncMobileViewportToolbarState, 250);
        });
        document.addEventListener('focusin', syncMobileViewportToolbarState);
        document.addEventListener('focusout', function () {
            setTimeout(syncMobileViewportToolbarState, 120);
        });
    }

    function updateFormatActiveStates(editableElement) {
        var isMarkdown = editableElement && (
            editableElement.classList.contains('markdown-editor') ||
            editableElement.classList.contains('cm-content') ||
            (editableElement.closest && editableElement.closest('.markdown-editor'))
        );

        var formats = [
            { selector: '.btn-bold',          action: 'exec-bold',          md: ['**', '**'],    rte: 'bold'          },
            { selector: '.btn-italic',        action: 'exec-italic',        md: ['*',  '*' ],    rte: 'italic'        },
            { selector: '.btn-underline',     action: 'exec-underline',     md: ['<u>', '</u>'], rte: 'underline'     },
            { selector: '.btn-strikethrough', action: 'exec-strikethrough', md: ['~~', '~~'],    rte: 'strikeThrough' },
        ];

        formats.forEach(function (fmt) {
            var btn = document.querySelector(fmt.selector + '.show-on-selection');
            // Its twin in the mobile editor bar (mobile_editor_bar.php)
            var barButton = document.querySelector('#mobileEditorBar [data-action="' + fmt.action + '"]');
            if (!btn && !(barButton && isMobileFormattingViewport())) return;

            var isActive = false;
            if (isMarkdown && typeof window.isMarkdownSelectionWrapped === 'function') {
                isActive = window.isMarkdownSelectionWrapped(fmt.md[0], fmt.md[1]);
                // Single * also matches inside **: treat italic as active only when not bold
                if (fmt.md[0] === '*' && isActive) {
                    isActive = !window.isMarkdownSelectionWrapped('**', '**');
                }
            } else {
                try { isActive = document.queryCommandState(fmt.rte); } catch (e) { /* ignore */ }
            }

            if (btn) btn.classList.toggle('is-format-active', isActive);
            if (barButton) barButton.classList.toggle('is-format-active', isActive);
        });
    }

    function clearFormatActiveStates() {
        document.querySelectorAll('.btn-bold, .btn-italic, .btn-underline, .btn-strikethrough, #mobileEditorBar .is-format-active')
            .forEach(function (btn) { btn.classList.remove('is-format-active'); });
    }

    // Floating formatting toolbar (format_toolbar_mode = 'floating', #1420).
    // On a computer the formatting buttons of a note leave the toolbar row for
    // a menu floating above the selection, and the note actions stay in place.
    // The wrapper sits where the buttons were, inside .note-edit-toolbar, so
    // their handlers, the Customize hiding rules and the icon colours still
    // apply, and the show-on-selection classes pick the buttons as before.
    // It stays on one line: the buttons that do not fit, keeping FLOATING_EDGE
    // free on each side of the note column, are listed in its own "…" menu,
    // whose entries click the hidden button like the toolbar's (trigger-mobile-action).
    var FLOATING_GAP = 8;               // px between the selection and the menu
    var FLOATING_EDGE = 16;             // px kept free on each side of the column
    var FLOATING_OVERFLOWED = 'floating-format-overflowed';
    var floatingFormatToolbar = null;   // the wrapper on screen
    var isPointerSelecting = false;     // left button held down in a note
    var floatingRepositionQueued = false;
    var floatingRelayoutQueued = false;

    function isFloatingFormatToolbarMode() {
        if (isMobileFormattingViewport()) return false;
        var value = typeof window.getPoznoteInitialSetting === 'function'
            ? window.getPoznoteInitialSetting('format_toolbar_mode')
            : null;
        return value === 'floating';
    }

    function getFloatingFormatToolbar(editableElement) {
        var noteCard = editableElement && editableElement.closest ? editableElement.closest('.notecard') : null;
        var toolbar = noteCard ? noteCard.querySelector('.note-edit-toolbar') : null;
        if (!toolbar) return null;

        var bar = toolbar.querySelector(':scope > .floating-format-toolbar');
        var buttons = toolbar.querySelectorAll(':scope > .text-format-btn');
        if (!bar) {
            if (!buttons.length) return null;
            bar = document.createElement('div');
            bar.className = 'floating-format-toolbar';
            bar.setAttribute('role', 'toolbar');
            bar.hidden = true;
            // Keep the selection and the editor focus: the buttons act on them
            bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
            toolbar.insertBefore(bar, buttons[0]);
        }
        var moreAnchor = bar.querySelector(':scope > .floating-format-more');
        Array.prototype.forEach.call(buttons, function (button) {
            button.classList.remove('is-toolbar-overflowed');
            bar.insertBefore(button, moreAnchor);
        });
        return bar;
    }

    // Back to the toolbar row, where the wrapper stands: the window got narrow
    // enough for the mobile bar
    function restoreFloatingFormatButtons() {
        document.querySelectorAll('.note-edit-toolbar > .floating-format-toolbar').forEach(function (bar) {
            Array.prototype.forEach.call(bar.querySelectorAll(':scope > .text-format-btn'), function (button) {
                button.classList.remove(FLOATING_OVERFLOWED);
                bar.parentNode.insertBefore(button, bar);
            });
            bar.remove();
        });
        floatingFormatToolbar = null;
    }

    function translate(key, fallback) {
        return typeof window.t === 'function' ? window.t(key, null, fallback) : fallback;
    }

    function setFloatingMoreMenuOpen(bar, open) {
        var anchor = bar ? bar.querySelector(':scope > .floating-format-more') : null;
        if (!anchor) return;
        var button = anchor.querySelector('.btn-floating-format-more');
        var menu = anchor.querySelector('.floating-format-more-menu');
        menu.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) fitFloatingMoreMenu(menu, button);
    }

    // Under the "…" button, scrolling inside when the window is too short
    // for every entry
    function fitFloatingMoreMenu(menu, button) {
        var MENU_MARGIN = 8;
        if (typeof window.positionToolbarDropdown === 'function') {
            window.positionToolbarDropdown(menu, button);
        }
        var top = parseFloat(menu.style.top) || button.getBoundingClientRect().bottom;
        menu.style.maxHeight = Math.max(0, window.innerHeight - top - MENU_MARGIN) + 'px';
    }

    function ensureFloatingMoreAnchor(bar) {
        var anchor = bar.querySelector(':scope > .floating-format-more');
        if (anchor) return anchor;

        anchor = document.createElement('div');
        anchor.className = 'floating-format-more';
        anchor.hidden = true;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'toolbar-btn btn-floating-format-more';
        button.title = translate('editor.toolbar.more', 'More');
        button.setAttribute('aria-haspopup', 'true');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<i class="lucide lucide-more-horizontal"></i>';
        var menu = document.createElement('div');
        menu.className = 'dropdown-menu floating-format-more-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        anchor.appendChild(button);
        anchor.appendChild(menu);

        button.addEventListener('click', function (e) {
            e.stopPropagation();
            setFloatingMoreMenuOpen(bar, menu.hidden);
        });
        // An entry runs its action through the document handler, after this
        menu.addEventListener('click', function (e) {
            if (e.target.closest('.dropdown-item')) setFloatingMoreMenuOpen(bar, false);
        });

        bar.appendChild(anchor);
        return anchor;
    }

    function floatingMoreEntry(button) {
        var key = Array.prototype.find.call(button.classList, function (cls) {
            return cls.indexOf('btn-') === 0;
        });
        if (!key) return null;
        var entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'dropdown-item mobile-toolbar-item';
        entry.setAttribute('role', 'menuitem');
        entry.setAttribute('data-action', 'trigger-mobile-action');
        entry.setAttribute('data-selector', '.' + key);
        var icon = button.querySelector('i');
        if (icon) entry.appendChild(icon.cloneNode(false));
        entry.appendChild(document.createTextNode(' ' + (button.getAttribute('title') || button.getAttribute('aria-label') || '')));
        return entry;
    }

    // The note column, less what the note toolbar covers at its top
    function getFloatingArea(bar) {
        var toolbar = bar.parentElement;
        var column = (toolbar && toolbar.closest('#right_col')) || document.documentElement;
        var columnRect = column.getBoundingClientRect();
        return {
            top: Math.max(columnRect.top, toolbar ? toolbar.getBoundingClientRect().bottom : 0, 0),
            bottom: Math.min(columnRect.bottom, window.innerHeight),
            left: Math.max(columnRect.left, 0),
            right: Math.min(columnRect.right, window.innerWidth)
        };
    }

    // One line: the buttons past the room left in the column go to "…"
    function layoutFloatingFormatToolbar(bar) {
        var anchor = ensureFloatingMoreAnchor(bar);
        var menu = anchor.querySelector('.floating-format-more-menu');

        setFloatingMoreMenuOpen(bar, false);
        Array.prototype.forEach.call(bar.querySelectorAll('.' + FLOATING_OVERFLOWED), function (button) {
            button.classList.remove(FLOATING_OVERFLOWED);
        });
        menu.textContent = '';
        anchor.hidden = true;

        var area = getFloatingArea(bar);
        var available = area.right - area.left - 2 * FLOATING_EDGE;
        var style = getComputedStyle(bar);
        var gap = parseFloat(style.columnGap) || 0;
        var frame = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
            + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
        var buttons = Array.prototype.filter.call(bar.children, function (el) {
            return el !== anchor && el.offsetWidth > 0;
        });
        var total = frame + buttons.reduce(function (sum, el) {
            return sum + el.getBoundingClientRect().width;
        }, 0) + gap * Math.max(0, buttons.length - 1);
        if (total <= available + 0.5) return;

        anchor.hidden = false;
        var budget = available - frame - anchor.getBoundingClientRect().width;
        var used = 0;
        var overflowing = false;
        buttons.forEach(function (button) {
            var width = button.getBoundingClientRect().width + gap;
            if (!overflowing && used + width <= budget + 0.5) {
                used += width;
                return;
            }
            overflowing = true;
            button.classList.add(FLOATING_OVERFLOWED);
            var entry = floatingMoreEntry(button);
            if (entry) menu.appendChild(entry);
        });
    }

    function getSelectionClientRects(range) {
        var rects = Array.prototype.filter.call(range.getClientRects(), function (rect) {
            return rect.width > 0 || rect.height > 0;
        });
        if (!rects.length) {
            var box = range.getBoundingClientRect();
            if (!box.width && !box.height) return null;
            rects = [box];
        }
        var bounds = range.getBoundingClientRect();
        return { first: rects[0], last: rects[rects.length - 1], bounds: bounds };
    }

    function positionFloatingFormatToolbar() {
        var bar = floatingFormatToolbar;
        if (!bar || bar.hidden) return;

        var selection = window.getSelection ? window.getSelection() : null;
        if (!selection || selection.rangeCount === 0) return;
        var rects = getSelectionClientRects(selection.getRangeAt(0));
        if (!rects) return;

        var area = getFloatingArea(bar);

        // Selection scrolled out of the note: out of sight until it comes back
        var inView = rects.bounds.bottom > area.top && rects.bounds.top < area.bottom;
        bar.style.visibility = inView ? '' : 'hidden';
        if (!inView) {
            setFloatingMoreMenuOpen(bar, false);
            return;
        }

        var width = bar.offsetWidth;
        var height = bar.offsetHeight;

        // Above the first line, under the last one when there is no room
        var top = rects.first.top - height - FLOATING_GAP;
        if (top < area.top + FLOATING_GAP) {
            top = rects.last.bottom + FLOATING_GAP;
        }
        top = Math.max(area.top + FLOATING_GAP, Math.min(top, area.bottom - height - FLOATING_GAP));

        var left = rects.bounds.left + (rects.bounds.width / 2) - (width / 2);
        left = Math.max(area.left + FLOATING_EDGE, Math.min(left, area.right - width - FLOATING_EDGE));

        bar.style.top = Math.round(top) + 'px';
        bar.style.left = Math.round(left) + 'px';

        var menu = bar.querySelector('.floating-format-more-menu');
        if (menu && !menu.hidden) setFloatingMoreMenuOpen(bar, true);
    }

    // Scrolling moves the menu, a resize may also change what fits in it
    function queueFloatingFormatToolbarPosition(relayout) {
        if (!floatingFormatToolbar) return;
        if (relayout === true) floatingRelayoutQueued = true;
        if (floatingRepositionQueued) return;
        floatingRepositionQueued = true;
        requestAnimationFrame(function () {
            floatingRepositionQueued = false;
            if (floatingRelayoutQueued && floatingFormatToolbar) {
                layoutFloatingFormatToolbar(floatingFormatToolbar);
            }
            floatingRelayoutQueued = false;
            positionFloatingFormatToolbar();
        });
    }

    function hideFloatingFormatToolbar() {
        if (floatingFormatToolbar) {
            setFloatingMoreMenuOpen(floatingFormatToolbar, false);
            floatingFormatToolbar.hidden = true;
        }
        floatingFormatToolbar = null;
    }

    function showFloatingFormatToolbar(editableElement) {
        var bar = getFloatingFormatToolbar(editableElement);
        if (floatingFormatToolbar && floatingFormatToolbar !== bar) hideFloatingFormatToolbar();
        // Still dragging the selection: shown once the button is released
        if (!bar || isPointerSelecting) {
            hideFloatingFormatToolbar();
            return;
        }

        bar.hidden = false;
        // Every button hidden (Customize, list-only selection in a code block...)
        var hasButton = Array.prototype.some.call(bar.querySelectorAll(':scope > .text-format-btn'), function (button) {
            return button.offsetWidth > 0;
        });
        if (!hasButton) {
            bar.hidden = true;
            if (floatingFormatToolbar === bar) floatingFormatToolbar = null;
            return;
        }
        floatingFormatToolbar = bar;
        layoutFloatingFormatToolbar(bar);
        positionFloatingFormatToolbar();
    }

    // Which formatting buttons of the mobile editor bar suit the selection
    // (js/mobile-editor-bar.js): a test on the matching note toolbar button,
    // or null for every button the note type has
    function setMobileEditorBarSelectionRule(rule) {
        if (typeof window.setMobileEditorBarSelectionRule === 'function') {
            window.setMobileEditorBarSelectionRule(rule);
        }
    }

    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function () {
            var selection = window.getSelection();

            var floatingMode = isFloatingFormatToolbarMode();
            if (!floatingMode && document.querySelector('.floating-format-toolbar')) {
                restoreFloatingFormatButtons();
            }

            // On a phone the formatting buttons live in the bar above the
            // keyboard (js/mobile-editor-bar.js): the note toolbar stays as it is
            var mobileMode = isMobileFormattingViewport();
            var keepNoteToolbar = floatingMode || mobileMode;

            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            // The floating toolbar and the mobile bar leave the note actions where they are
            var noteActionButtons = keepNoteToolbar ? [] : document.querySelectorAll('.note-action-btn');
            if (keepNoteToolbar) {
                document.querySelectorAll('.note-action-btn.hide-on-selection').forEach(function (button) {
                    button.classList.remove('hide-on-selection');
                });
            }

            // Check if the selection contains text
            if (selection && selection.rangeCount > 0 && selection.toString().trim().length > 0) {
                var range = selection.getRangeAt(0);
                var container = range.commonAncestorContainer;

                // Helper function to check if element is title or tag field
                function isTitleOrTagElement(elem) {
                    if (!elem) return false;
                    if (elem.classList && elem.classList.contains('one_note_title')) return true;
                    if (elem.classList && elem.classList.contains('tags')) return true;
                    if (elem.id === 'search') return true;
                    if (elem.classList && elem.classList.contains('searchbar')) return true;
                    if (elem.classList && elem.classList.contains('searchtrash')) return true;
                    return false;
                }

                // Improve detection of editable area
                var currentElement = container.nodeType === 3 ? container.parentElement : container; // Node.TEXT_NODE
                var editableElement = null;
                var isLanguageCodeSelection = false;
                var isPlainCodeSelection = false;

                // Go up the DOM tree to find an editable area
                var isTitleOrTagField = false;
                while (currentElement && currentElement !== document.body) {

                    if (isTitleOrTagElement(currentElement)) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a markdown editor, allow formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-editor')) {
                        editableElement = currentElement;
                        var codeBlockType = getSelectionCodeBlockType(currentElement, range);
                        isLanguageCodeSelection = codeBlockType === 'language';
                        isPlainCodeSelection = codeBlockType === 'plain';
                        break;
                    }
                    // If selection is inside a markdown preview (read-only), hide formatting toolbar
                    if (currentElement.classList && currentElement.classList.contains('markdown-preview')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside a task list, treat it as non-editable for formatting
                    try {
                        if (currentElement && currentElement.closest && currentElement.closest('.task-list-container, .tasks-list, .task-item, .task-text')) {
                            // Consider as not editable so formatting buttons won't appear
                            editableElement = null;
                            isTitleOrTagField = true;
                            break;
                        }
                    } catch (err) {
                        console.debug('events-text-selection: isTitleOrTagElement() failed:', err);
                    }
                    // Treat selection inside the note metadata subline as title-like (do not toggle toolbar)
                    if (currentElement.classList && currentElement.classList.contains('note-subline')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    // If selection is inside an indented pre block, hide formatting toolbar
                    if (currentElement.tagName === 'PRE' && currentElement.classList && currentElement.classList.contains('indented-pre')) {
                        isTitleOrTagField = true;
                        break;
                    }
                    if (currentElement.classList && currentElement.classList.contains('noteentry')) {
                        editableElement = currentElement;
                        var htmlCodeBlockType = getSelectionHtmlCodeBlockType(currentElement, range);
                        isLanguageCodeSelection = htmlCodeBlockType === 'language';
                        isPlainCodeSelection = htmlCodeBlockType === 'plain';
                        break;
                    }
                    if (currentElement.contentEditable === 'true') {
                        editableElement = currentElement;
                        // CodeMirror carries contenteditable on .cm-content, inside the
                        // .markdown-editor host, so the walk stops here before reaching the
                        // markdown branch above. A fence is only visible in the markdown
                        // source: reading the rendered HTML instead found no code block at
                        // all and left the whole toolbar up inside a fenced block.
                        var markdownHost = currentElement.closest
                            ? currentElement.closest('.markdown-editor')
                            : null;
                        var editableCodeBlockType = markdownHost
                            ? getSelectionCodeBlockType(markdownHost, range)
                            : getSelectionHtmlCodeBlockType(currentElement, range);
                        isLanguageCodeSelection = editableCodeBlockType === 'language';
                        isPlainCodeSelection = editableCodeBlockType === 'plain';
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }

                if (isTitleOrTagField || isLanguageCodeSelection) {
                    // Keep normal state for fields and language code blocks (actions visible, formatting hidden)
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.remove('hide-on-selection');
                    }
                    hideFloatingFormatToolbar();
                    // A language code block takes no formatting, from the bar either
                    setMobileEditorBarSelectionRule(isLanguageCodeSelection && mobileMode
                        ? function () { return false; }
                        : null);
                    setMobileFormattingToolbarActive(false);
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    // (a computer with the classic toolbar only)
                    // With CodeMirror the walk stops on .cm-content, so resolve the host editor
                    var listSelectionEditor = editableElement.closest
                        ? editableElement.closest('.markdown-editor')
                        : null;
                    var listSelection = listSelectionEditor
                        ? getMarkdownListSelectionType(listSelectionEditor, range)
                        : null;
                    var listSelectionType = listSelection ? listSelection.type : null;
                    // Words picked inside one item get the full toolbar (#1420), whole
                    // lines or several items get the list-only one
                    var isListOnlySelection = !!listSelection && !listSelection.insideItemText;
                    var isButtonForSelection = function (button) {
                        if (isPlainCodeSelection && isPlainCodeBlockedButton(button)) return false;
                        // List-only selection: keep just the list conversion/toggle buttons
                        if (isListOnlySelection && !isListSelectionAllowedButton(button, listSelectionType)) return false;
                        // Remove-checkboxes only makes sense on a checkbox selection
                        if (listSelectionType !== 'task' && button.classList.contains('btn-task-remove')) return false;
                        return true;
                    };
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.toggle('show-on-selection',
                            !mobileMode && isButtonForSelection(textFormatButtons[i]));
                    }
                    // On a phone the same choice applies to the bar above the keyboard
                    setMobileEditorBarSelectionRule(mobileMode ? isButtonForSelection : null);
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                    updateFormatActiveStates(editableElement);
                    if (floatingMode) {
                        showFloatingFormatToolbar(editableElement);
                    }
                    setMobileFormattingToolbarActive(true);
                } else {
                    // Text selected but not in an editable area: hide everything
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                    clearFormatActiveStates();
                    hideFloatingFormatToolbar();
                    setMobileEditorBarSelectionRule(null);
                    setMobileFormattingToolbarActive(false);
                }
            } else {
                // No text selection: show actions, hide formatting
                for (var i = 0; i < textFormatButtons.length; i++) {
                    textFormatButtons[i].classList.remove('show-on-selection');
                }
                for (var i = 0; i < noteActionButtons.length; i++) {
                    noteActionButtons[i].classList.remove('hide-on-selection');
                }
                clearFormatActiveStates();
                hideFloatingFormatToolbar();
                setMobileEditorBarSelectionRule(null);
                setMobileFormattingToolbarActive(false);
            }

        }, 50); // Short delay to avoid too frequent calls
    }

    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);

    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', function (e) {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });

    // The floating toolbar waits for the end of a mouse selection, then
    // follows the selection while the note scrolls or the window resizes
    document.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest('.floating-format-toolbar')) return;
        if (floatingFormatToolbar) setFloatingMoreMenuOpen(floatingFormatToolbar, false);
        isPointerSelecting = true;
    }, true);
    document.addEventListener('mouseup', function () {
        if (!isPointerSelecting) return;
        isPointerSelecting = false;
        handleSelectionChange();
    }, true);
    window.addEventListener('scroll', function (e) {
        // The "…" menu scrolling its own entries moves nothing
        var target = e.target;
        if (target && target.closest && target.closest('.floating-format-toolbar')) return;
        queueFloatingFormatToolbarPosition(false);
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !floatingFormatToolbar) return;
        var menu = floatingFormatToolbar.querySelector('.floating-format-more-menu');
        if (menu && !menu.hidden) setFloatingMoreMenuOpen(floatingFormatToolbar, false);
    });
    window.addEventListener('resize', function () { queueFloatingFormatToolbarPosition(true); });

    initializeMobileViewportToolbarState();
}

// Expose to global scope
window.initTextSelectionHandlers = initTextSelectionHandlers;

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

    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function () {
            var selection = window.getSelection();

            // Desktop handling (existing code)
            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            var noteActionButtons = document.querySelectorAll('.note-action-btn');

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
                    } catch (err) { }
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
                        var editableCodeBlockType = getSelectionHtmlCodeBlockType(currentElement, range);
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
                    setMobileFormattingToolbarActive(false);
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        if (isPlainCodeSelection && isPlainCodeBlockedButton(textFormatButtons[i])) {
                            textFormatButtons[i].classList.remove('show-on-selection');
                        } else {
                            textFormatButtons[i].classList.add('show-on-selection');
                        }
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
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

    initializeMobileViewportToolbarState();
}

// Expose to global scope
window.initTextSelectionHandlers = initTextSelectionHandlers;

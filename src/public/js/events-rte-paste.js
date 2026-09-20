/**
 * Rich text editing: paste and focus.
 * 
 * Cleaning up pasted content before it enters a note, and the focus management that
 * decides which element ends up with the caret.
 */

// ============================================================================
// PASTE HANDLERS
// ============================================================================

/**
 * Domains an embed may come from. Must stay the same list as
 * ALLOWED_IFRAME_DOMAINS in lib/html-sanitize.php and as the frame-src of the
 * Content-Security-Policy: an iframe this file lets through but the server
 * refuses is inserted, blocked by the browser, then deleted by the next save.
 */
var PASTE_ALLOWED_EMBED_DOMAINS = [
    'youtube.com',
    'www.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
    'player.bilibili.com',
    'www.bilibili.com',
    'bilibili.com'
];

/**
 * Same rule as poznoteIframeSrcIsTrusted() server-side: exact host match (or a
 * subdomain of an allowed domain) over http(s), plus same-origin relative
 * paths. A trusted name anywhere else in the URL does not count.
 * @param {string} src - The iframe src attribute
 * @returns {boolean} True when the embed may be inserted
 */
function isTrustedEmbedSrc(src) {
    src = (src || '').trim();
    if (src === '') return false;

    if (src.indexOf('//') === 0) return false;
    if (src.charAt(0) === '/' || src.indexOf('./') === 0) return true;

    var url;
    try {
        url = new URL(src, window.location.href);
    } catch (e) {
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    var host = url.hostname.toLowerCase();
    return PASTE_ALLOWED_EMBED_DOMAINS.some(function (domain) {
        return host === domain || host.slice(-(domain.length + 1)) === '.' + domain;
    });
}

/**
 * Check if pasted content is iframe HTML (YouTube, Bilibili)
 * @param {string} plainText - The pasted plain text
 * @returns {boolean} True if iframe is allowed and inserted
 */
function handleIframePaste(plainText) {
    var iframeMatch = plainText.match(/<iframe\s+([^>]+)>\s*<\/iframe>/i);
    if (!iframeMatch) return false;

    var iframeHtml = iframeMatch[0];
    var srcMatch = iframeHtml.match(/src\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) return false;

    var src = srcMatch[1];

    if (!isTrustedEmbedSrc(src)) {
        console.warn('Iframe domain not in whitelist:', src);
        return false;
    }

    // Create iframe element
    var tempContainer = document.createElement('div');
    tempContainer.innerHTML = iframeHtml;
    var iframeElement = tempContainer.querySelector('iframe');
    if (!iframeElement) return false;

    // Insert iframe at cursor
    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();

    var fragment = document.createDocumentFragment();

    // Add spacing around iframe
    var lineBefore = document.createElement('div');
    lineBefore.innerHTML = '<br>';
    fragment.appendChild(lineBefore);
    fragment.appendChild(iframeElement);

    var lineAfter = document.createElement('div');
    lineAfter.innerHTML = '<br>';
    fragment.appendChild(lineAfter);

    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Check if pasted content is code from VS Code or similar editors
 * @param {string} htmlData - The pasted HTML data
 * @param {string} plainText - The pasted plain text
 * @returns {boolean} True if code paste was handled
 */
function handleCodePaste(htmlData, plainText) {
    if (!htmlData) return false;

    // Code editors (VS Code, Monaco, etc.) put the whole snippet in a single
    // container styled inline with a monospace font and white-space: pre.
    // Only that exact shape counts as code: web pages that merely contain a
    // code example (monospace font somewhere in the payload) must keep their
    // tables, headings and lists intact (see discussion #1170).
    var doc = new DOMParser().parseFromString(htmlData, 'text/html');
    if (doc.body.children.length !== 1) return false;

    var rootStyle = (doc.body.children[0].getAttribute('style') || '').toLowerCase();
    var monospaceFonts = ['consolas', 'monaco', 'courier new', 'monospace', 'menlo', 'segoe ui mono'];
    var isCode = /white-space:\s*pre/.test(rootStyle) && monospaceFonts.some(function (font) {
        return rootStyle.indexOf(font) !== -1;
    });

    if (!isCode) return false;

    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();

    // Split into lines and create monospace structure
    var lines = (plainText || '').split('\n');
    var fragment = document.createDocumentFragment();

    lines.forEach(function (line, index) {
        // Just use text nodes for "normal text" as requested by user
        fragment.appendChild(document.createTextNode(line));

        if (index < lines.length - 1) {
            fragment.appendChild(document.createElement('br'));
        }
    });

    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Check if pasted text is a URL and convert to link
 * @param {string} plainText - The pasted plain text
 * @param {string} htmlData - The pasted HTML data
 * @returns {boolean} True if URL paste was handled
 */
function handleUrlPaste(plainText, htmlData) {
    // Only handle if plain text without HTML
    if (!plainText || htmlData) return false;

    var trimmedText = plainText.trim();
    var urlRegex = /^(https?:\/\/|ftp:\/\/)[^\s]+$/i;

    if (!urlRegex.test(trimmedText)) return false;

    var link = document.createElement('a');
    link.href = trimmedText;
    link.textContent = trimmedText;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    var selection = window.getSelection();
    if (selection.rangeCount === 0) return false;

    var range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(link);

    // Add space after link
    var space = document.createTextNode(' ');
    range.setStartAfter(link);
    range.insertNode(space);
    range.setStartAfter(space);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    triggerNoteSave();
    return true;
}

/**
 * Find the first image file sitting on the clipboard
 * @param {DataTransferItemList} items - Clipboard items
 * @returns {File|null} The image file, or null when the clipboard has none
 */
function getClipboardImageFile(items) {
    if (!items) return null;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && item.kind === 'file' && item.type && item.type.startsWith('image/')) {
            var file = item.getAsFile();
            if (file) return file;
        }
    }

    return null;
}

/**
 * Handle image paste from clipboard
 * @param {File} file - The image file found on the clipboard
 * @param {HTMLElement} note - The note entry element
 * @returns {boolean} True if the image was handled
 */
function handleImagePaste(file, note) {
    if (!file || typeof handleImageFilesAndInsert !== 'function') return false;

    handleImageFilesAndInsert([file], note);
    return true;
}

/**
 * Decide whether the clipboard HTML must win over an image file present on
 * the clipboard at the same time.
 *
 * OneNote, Outlook or Excel put two flavours of the same selection on the
 * clipboard: the content itself as text/html, and a bitmap of the whole
 * selection. Inserting that bitmap turned a page of text and pictures into
 * one flat image, no longer editable and invisible to the search (#1467).
 *
 * The bitmap still wins where it is the only real content: a screenshot
 * (no HTML at all) and an image copied on its own from a web page, whose
 * HTML is just the <img> tag. Keeping the file there uploads a local copy
 * instead of pointing the note at someone else's server.
 *
 * @param {string} htmlData - The text/html flavour of the clipboard
 * @returns {boolean} True when the HTML carries more than the picture
 */
function clipboardHtmlBeatsImage(htmlData) {
    if (!htmlData || htmlData.trim() === '') return false;

    var doc = new DOMParser().parseFromString(htmlData, 'text/html');
    if (!doc || !doc.body) return false;

    // Office clipboards ship their own <style> rules and comments inside the
    // fragment; drop them first so they do not read as copied text
    doc.body.querySelectorAll('script, style, noscript, template, title').forEach(function (el) {
        el.remove();
    });

    // Zero-width characters are not text either, and trim() keeps them: a
    // lone picture padded with one would win here, then lose its only image
    // to the cleanup and paste as an invisible character
    var text = (doc.body.textContent || '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
    if (text !== '') return true;

    // No text at all: several pictures still beat one flattened bitmap
    return doc.body.querySelectorAll('img').length > 1;
}

/**
 * Decide whether an <img> src can load once inside a note.
 *
 * Relative and protocol-relative URLs are fine; an explicit scheme has to be
 * one the page can fetch. Content copied from OneNote, Word or a mail client
 * points its pictures at the source machine (file:///...) or at an email
 * store (cid:...), which would be saved as a permanently broken image. Same
 * for blob: URLs (WhatsApp Web, Teams): they only resolve inside the page
 * that created them, and Poznote never writes one into a note itself.
 *
 * @param {string} src - The img src attribute
 * @returns {boolean} True when the image is worth keeping
 */
function isLoadableImageSrc(src) {
    src = (src || '').trim();
    if (src === '') return false;

    var scheme = /^([a-z][a-z0-9+.-]*):/i.exec(src);
    if (!scheme) return true;

    return ['http', 'https', 'data'].indexOf(scheme[1].toLowerCase()) !== -1;
}

var pasteDroppedImagesToastTimeout = null;

/**
 * Tell the user that pictures were left out of a paste.
 *
 * Dropping them silently hid the loss: the broken image icon they used to
 * leave behind was at least a hint that something belonged there. Copying a
 * picture on its own puts its bitmap on the clipboard, which does paste.
 *
 * @param {number} count - How many images the cleanup removed
 */
function showPasteDroppedImagesToast(count) {
    if (!document.body) return;

    var fallback = count === 1
        ? '1 image could not be pasted. Copy it on its own to add it.'
        : '{{count}} images could not be pasted. Copy them one by one to add them.';
    var key = count === 1 ? 'editor.paste.images_dropped_one' : 'editor.paste.images_dropped_other';
    var message = (typeof window.t === 'function')
        ? window.t(key, { count: count }, fallback)
        : fallback.replace('{{count}}', String(count));

    var toast = document.getElementById('paste-dropped-images-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'paste-dropped-images-toast';
        toast.className = 'pz-toast pz-toast--message';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.remove('pz-toast--hidden');
    toast.classList.add('pz-toast--visible');

    // A full sentence, so it stays longer than the one-word state labels
    clearTimeout(pasteDroppedImagesToastTimeout);
    pasteDroppedImagesToastTimeout = setTimeout(function () {
        toast.classList.remove('pz-toast--visible');
        toast.classList.add('pz-toast--hidden');
    }, 6000);
}

/**
 * Handle rich text paste - clean up styles that might conflict with theme
 * @param {string} htmlData - The pasted HTML data
 * @returns {boolean} True if paste was handled
 */
function handleRichTextPaste(htmlData) {
    if (!htmlData || htmlData.trim() === '') return false;

    // If content was copied from a Poznote HTML note, preserve all formatting as-is
    var poznoteMarker = '<!-- poznote-internal -->';
    if (htmlData.includes(poznoteMarker)) {
        var fullHtml = htmlData.replace(poznoteMarker, '').replace('<!-- poznote-table-cells -->', '');
        if (!fullHtml || fullHtml.trim() === '') return false;
        document.execCommand('insertHTML', false, fullHtml);
        triggerNoteSave();
        return true;
    }

    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlData, 'text/html');

    // Drop what the server-side sanitizer refuses to store anyway. A page
    // copied from the web carries its own <style> rules (which would restyle
    // the whole app until the next reload) and third-party embeds (blocked by
    // the Content-Security-Policy, then deleted by the save): keeping them
    // here only shows the user content that will not survive.
    doc.body.querySelectorAll(
        'script, style, noscript, template, link, meta, base, ' +
        'object, embed, applet, param, canvas, select, textarea, datalist'
    ).forEach(function (el) {
        el.remove();
    });
    doc.body.querySelectorAll('iframe').forEach(function (el) {
        if (!isTrustedEmbedSrc(el.getAttribute('src'))) el.remove();
    });

    // Same for pictures the browser cannot fetch from here: an Office or
    // mail clipboard points them at the source machine, and the sanitizer
    // stores such a src happily, leaving a broken image in the note forever.
    var droppedImages = 0;
    doc.body.querySelectorAll('img').forEach(function (el) {
        if (!isLoadableImageSrc(el.getAttribute('src'))) {
            el.remove();
            droppedImages++;
        }
    });

    // Remove conflicting attributes from all elements
    var elements = doc.body.querySelectorAll('*');

    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];

        // Remove style attributes that set color or background
        if (el.hasAttribute('style')) {
            // Using the style object is more robust than regex for removing specific properties
            el.style.color = '';
            el.style.backgroundColor = '';
            el.style.background = '';
            el.style.backgroundImage = '';
            el.style.fontFamily = '';
            el.style.fontSize = '';
            el.style.lineHeight = '';

            // Clean up empty style attribute
            var styleAttr = el.getAttribute('style').trim();
            if (styleAttr === '' || el.style.length === 0 || /^;+$/.test(styleAttr)) {
                el.removeAttribute('style');
            }
        }

        // Remove legacy attributes. Keep width/height on media elements:
        // stripping them made pasted images lose their dimensions.
        el.removeAttribute('bgcolor');
        el.removeAttribute('color');
        el.removeAttribute('face');
        var isMediaElement = el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME';
        if (!isMediaElement) {
            el.removeAttribute('width');
            el.removeAttribute('height');
        }
    }

    var cleanHtml = doc.body.innerHTML;
    if (!cleanHtml || cleanHtml.trim() === '') return false;

    // Insert cleaned HTML and signal success to prevent browser default paste
    document.execCommand('insertHTML', false, cleanHtml);
    triggerNoteSave();

    // Said only once the rest went in: when nothing survives, the caller
    // falls back to the clipboard bitmap and no picture is missing
    if (droppedImages > 0) showPasteDroppedImagesToast(droppedImages);
    return true;
}

/**
 * Rebuild the ancestor context that Range.cloneContents() drops.
 *
 * cloneContents() never includes the ancestors of the range boundaries, so a
 * selection living entirely inside one block loses that block: two <li> of the
 * same list come out without their <ul> (pasting then produces orphan <li>),
 * a fully selected heading comes out as bare text, and text inside a styled
 * <span> loses its color. The native copy the handler below replaces rebuilds
 * this context; do the same by wrapping the fragment in shallow clones of the
 * relevant ancestors, from the range's common ancestor up to the note root.
 *
 * @param {DocumentFragment} fragment - The cloned selection contents
 * @param {Range} range - The selection range the fragment came from
 * @param {HTMLElement} note - The .noteentry containing the selection
 * @returns {DocumentFragment} The fragment, wrapped as needed
 */
function wrapCopiedFragmentWithAncestors(fragment, range, note) {
    // Inline formatting ancestors are always kept (they carry the visible style)
    var inlineTags = {
        B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1,
        CODE: 1, A: 1, MARK: 1, FONT: 1, SUB: 1, SUP: 1, KBD: 1
    };
    // Block ancestors kept only when the selection spans their entire text
    var fullTextBlockTags = {
        LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
        BLOCKQUOTE: 1, PRE: 1, DETAILS: 1
    };

    function fragmentHasTopLevel(tags) {
        for (var child = fragment.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 1 && tags[child.tagName]) return true;
        }
        return false;
    }

    function isChecklistNode(el) {
        return !!(el.classList && (
            el.classList.contains('checklist-item') || el.classList.contains('task-list-item') ||
            el.classList.contains('checklist') || el.classList.contains('task-list')));
    }

    function wrapIn(el) {
        var wrapper = el.cloneNode(false);
        wrapper.appendChild(fragment);
        fragment = document.createDocumentFragment();
        fragment.appendChild(wrapper);
    }

    var selectionText = range.toString();
    var node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentNode;

    while (node && node !== note && note.contains(node) && node.tagName) {
        var tag = node.tagName;

        // Checklist items need their <label><input> structure; wrapping the
        // bare text in their li/ul clones would produce a malformed checklist
        if (isChecklistNode(node)) {
            node = node.parentNode;
            continue;
        }

        if (inlineTags[tag]) {
            wrapIn(node);
        } else if (tag === 'SPAN' && node.getAttribute('style')) {
            // Plain spans are structural noise, styled spans carry formatting
            wrapIn(node);
        } else if (tag === 'UL' || tag === 'OL') {
            if (fragmentHasTopLevel({ LI: 1 })) wrapIn(node);
        } else if (tag === 'TR') {
            if (fragmentHasTopLevel({ TD: 1, TH: 1 })) wrapIn(node);
        } else if (tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' || tag === 'TABLE') {
            if (fragmentHasTopLevel({ TR: 1, THEAD: 1, TBODY: 1, TFOOT: 1 })) wrapIn(node);
        } else if (fullTextBlockTags[tag]) {
            // Keep the block (bullet, heading level, quote...) when the whole
            // line was selected; a partial selection pastes as inline text
            if (node.textContent === selectionText) wrapIn(node);
        }

        node = node.parentNode;
    }

    return fragment;
}

/**
 * Serialise the current note selection to the clipboard with the
 * Poznote-internal marker, so the paste handler can preserve all styles.
 * Shared by the copy and cut handlers.
 *
 * @param {ClipboardEvent} e - The copy or cut event
 * @returns {boolean} True when the clipboard was written (default prevented)
 */
function writeNoteSelectionToClipboard(e) {
    var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
    if (!note) return false;

    var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';
    if (isMarkdownNote) return false;

    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    // Serialise the selection into HTML, restoring the block/inline
    // ancestors that cloneContents() drops (list wrapper, heading tag,
    // styled spans...) so pasting reproduces the copied structure
    var range = selection.getRangeAt(0);
    var fragment = wrapCopiedFragmentWithAncestors(range.cloneContents(), range, note);
    var tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    var htmlContent = tempDiv.innerHTML;
    if (!htmlContent) return false;

    // Prepend the marker so the paste handler knows this came from Poznote
    e.clipboardData.setData('text/html', '<!-- poznote-internal -->' + htmlContent);
    e.clipboardData.setData('text/plain', selection.toString());
    e.preventDefault();
    return true;
}

/**
 * Setup paste event handling for rich text and images
 */
function setupPasteHandling() {
    document.body.addEventListener('copy', function (e) {
        try {
            writeNoteSelectionToClipboard(e);
        } catch (err) {
            console.error('Copy handling error:', err);
        }
    });

    // Cut must go through the same serialisation as copy: the browser's
    // native cut has no Poznote-internal marker, so pasting the cut content
    // back fell into the external-paste cleanup that strips colors,
    // highlights and font sizes (moving text lost its formatting).
    document.body.addEventListener('cut', function (e) {
        try {
            if (writeNoteSelectionToClipboard(e)) {
                // preventDefault suppressed the native deletion as well;
                // execCommand keeps the removal on the undo stack
                document.execCommand('delete');
                triggerNoteSave();
            }
        } catch (err) {
            console.error('Cut handling error:', err);
        }
    });

    document.body.addEventListener('paste', function (e) {
        try {
            // Skip paste handling for input fields
            if (e.target && (
                e.target.classList.contains('task-input') ||
                e.target.classList.contains('task-edit-input') ||
                e.target.tagName === 'INPUT'
            )) {
                return;
            }

            var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
            if (!note) return;

            var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';
            var items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : null;
            var htmlData = e.clipboardData ? e.clipboardData.getData('text/html') : '';

            // Handle image paste. An image file and the HTML can describe the
            // same selection (OneNote, Outlook, Excel), and the HTML wins
            // then: it keeps the text editable and searchable. Markdown notes
            // stay on the image, having no rich text paste path to fall back
            // on.
            var imageFile = getClipboardImageFile(items);
            var htmlWins = !isMarkdownNote && !!imageFile && clipboardHtmlBeatsImage(htmlData);
            if (!htmlWins && handleImagePaste(imageFile, note)) {
                e.preventDefault();
                return;
            }

            // Skip rich text processing for markdown notes
            if (isMarkdownNote) return;

            var plainText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';

            // Windows editors (VS Code, Notepad++) put CRLF on the clipboard.
            // The handlers below split on \n, which would leave a stray CR at
            // the end of every line: invisible until the note is reloaded, at
            // which point the HTML parser turns each CR into a real newline and
            // every line break shows up twice inside a code block.
            plainText = plainText.replace(/\r\n?/g, '\n');

            // Try different paste handlers
            if (handleIframePaste(plainText)) {
                e.preventDefault();
                return;
            }

            if (handleCodePaste(htmlData, plainText)) {
                e.preventDefault();
                return;
            }

            if (handleUrlPaste(plainText, htmlData)) {
                e.preventDefault();
                return;
            }

            // Handle rich text paste (cleanup styles like black text in dark mode)
            if (htmlData && handleRichTextPaste(htmlData)) {
                e.preventDefault();
                return;
            }

            // The HTML won but nothing survived its cleanup (every picture
            // pointed at the source machine, say): the flattened bitmap is
            // still better than pasting nothing
            if (htmlWins && handleImagePaste(imageFile, note)) {
                e.preventDefault();
                return;
            }

        } catch (err) {
            console.error('Paste handling error:', err);
        }
    });
}

/**
 * Setup syntax highlighting trigger on code block input
 */
function setupCodeBlockHighlighting() {
    // Helper function to trigger syntax highlighting
    function triggerHighlighting(target) {
        var codeElement = target.tagName === 'CODE' ? target : null;
        var preElement = target.tagName === 'PRE' ? target : (codeElement ? codeElement.closest('pre') : null);

        if (!codeElement && preElement) {
            codeElement = preElement.querySelector('code[class*="language-"]');
        }

        if (codeElement && codeElement.className && codeElement.className.includes('language-')) {
            setTimeout(function () {
                if (typeof window.applySyntaxHighlighting === 'function') {
                    var pre = codeElement.closest('pre');
                    if (pre) {
                        window.applySyntaxHighlighting(pre);
                    }
                }
            }, 50);
        }
    }

    // Listen for input events (typing)
    document.body.addEventListener('input', function (e) {
        var target = e.target;

        // Check if editing code element with language class
        if (target.tagName === 'CODE' && target.className && target.className.includes('language-')) {
            triggerHighlighting(target);
        }

        // Check if editing pre element
        if (target.tagName === 'PRE') {
            var codeElement = target.querySelector('code[class*="language-"]');
            if (codeElement) {
                triggerHighlighting(target);
            }
        }
    });

    // Listen for paste events
    document.body.addEventListener('paste', function (e) {
        var target = e.target;

        // Check if pasting into code block
        var codeElement = null;
        if (target.tagName === 'CODE') {
            codeElement = target;
        } else if (target.closest) {
            codeElement = target.closest('code');
        }

        if (codeElement && codeElement.className && codeElement.className.includes('language-')) {
            setTimeout(function () {
                triggerHighlighting(codeElement);
            }, 100);
        }
    });
}

/**
 * Setup all link-related events
 */
function setupLinkEvents() {
    setupLinkClickHandling();
    setupPasteHandling();
    setupCodeBlockHighlighting();
}

// ============================================================================
// FOCUS MANAGEMENT
// ============================================================================

/**
 * Check if a note entry is empty
 * @param {HTMLElement} noteEntry - The note entry element
 * @returns {boolean} True if empty
 */
function isNoteEntryEmpty(noteEntry) {
    var textContent = noteEntry.textContent.trim();
    var hasImages = noteEntry.querySelector('img') !== null;
    var isMarkdownPreview = noteEntry.classList.contains('markdown-preview');

    return textContent === '' && !hasImages && !isMarkdownPreview;
}

/**
 * Auto-focus empty notes when clicked in right column
 */
function setupAutoFocusEmpty() {
    document.addEventListener('click', function (e) {
        var rightCol = e.target.closest('#right_col');
        if (!rightCol) return;

        // Ignore clicks on interactive elements. [data-action] covers the
        // delegated controls (e.g. the folder breadcrumb in the note header),
        // which must not pull focus into the note and open the mobile keyboard.
        if (e.target.closest('button, a, input, select, textarea, [role="button"], [data-action]')) {
            return;
        }

        // Find target note entry
        var noteEntry = null;
        var card = e.target.closest('.notecard');

        if (card) {
            // Clicked on specific note card
            noteEntry = card.querySelector('.noteentry');
        } else {
            // Clicked on background - try to find current note
            var selectedNoteId = window.noteid;
            if (selectedNoteId !== -1 && selectedNoteId !== null) {
                noteEntry = document.querySelector('#note' + selectedNoteId + ' .noteentry');
            }

            // Fallback to first note entry
            if (!noteEntry) {
                noteEntry = rightCol.querySelector('.noteentry');
            }
        }

        if (!noteEntry || noteEntry.getAttribute('contenteditable') !== 'true') return;

        // Only auto-focus if empty
        if (!isNoteEntryEmpty(noteEntry)) return;

        // Update note ID
        var noteIdFromEntry = window.extractNoteIdFromEntry
            ? window.extractNoteIdFromEntry(noteEntry)
            : null;

        if (noteIdFromEntry) {
            window.noteid = noteIdFromEntry;
        }

        // Focus and place cursor at start
        if (document.activeElement !== noteEntry) {
            noteEntry.focus();
            setCursorPosition(noteEntry, 0, false);
        }
    });
}

/**
 * Setup focus management and auto-focus for empty notes
 */
function setupFocusEvents() {
    document.body.addEventListener('focusin', function (e) {
        if (e.target.classList.contains('searchbar') ||
            e.target.id === 'search' ||
            e.target.classList.contains('searchtrash')) {
            window.noteid = -1;
        }
    });

    setupAutoFocusEmpty();
}

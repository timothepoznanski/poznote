// Markdown handler for Poznote
// Simple markdown parser and renderer

// Shared utility: escape HTML special characters
function _mdEscapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper function to normalize content from contentEditable
function normalizeContentEditableText(element) {
    // More robust content extraction that handles contentEditable quirks
    var content = '';

    // Try to walk through the DOM structure to better preserve formatting
    if (element.childNodes.length > 0) {
        var parts = [];

        for (var i = 0; i < element.childNodes.length; i++) {
            var node = element.childNodes[i];

            if (node.nodeType === Node.TEXT_NODE) {
                // Preserve newlines that are already in the text node
                var textContent = node.textContent || node.nodeValue || '';
                parts.push(textContent);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                var tagName = node.tagName;

                if (['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].indexOf(tagName) !== -1) {
                    // Block elements
                    var divText = node.textContent || '';
                    var isEmpty = (divText === '' && node.querySelector('br'));

                    // Ensure preceding newline check
                    if (parts.length > 0) {
                        var lastPart = parts[parts.length - 1];
                        if (lastPart && !lastPart.endsWith('\n')) {
                            parts.push('\n');
                        }
                    }

                    if (isEmpty) {
                        parts.push('\n');
                    } else {
                        parts.push(divText);
                        parts.push('\n');
                    }
                } else if (tagName === 'BR') {
                    // BR = line break
                    parts.push('\n');
                } else {
                    // Other inline elements, get their text content
                    parts.push(node.textContent || '');
                }
            }
        }

        // Join parts simply - logic is now handled during pushed parts
        content = parts.join('');
    } else {
        // Fallback to innerText/textContent
        content = element.innerText || element.textContent || '';
    }

    // Handle different line ending styles
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Fix excessive blank lines logic REMOVED to preserve user's intentional empty lines
    // content = content.replace(/\n{3,}/g, '\n\n');

    // Remove trailing newlines (but preserve intentional spacing)
    content = content.replace(/\n+$/, '');

    return content;
}

function initMermaid(retryCount) {
    retryCount = retryCount || 0;
    if (typeof mermaid === 'undefined') {
        // Mermaid may be loaded async; retry a few times without delaying normal rendering.
        if (retryCount < 10) {
            setTimeout(function () {
                initMermaid(retryCount + 1);
            }, 200);
        }
        return;
    }
    var escapeHtml = _mdEscapeHtml;

    function renderMermaidError(node, err, source) {
        var msg = 'Mermaid: syntax error.';
        try {
            if (err) {
                if (typeof err === 'string') msg = err;
                else if (err.str) msg = err.str;
                else if (err.message) msg = err.message;
            }
        } catch (e) { }

        // Replace with readable error output using existing code block styling
        node.classList.remove('mermaid');
        node.innerHTML =
            '<pre><code class="language-text">' +
            escapeHtml(msg) +
            (source ? ('\n\n' + escapeHtml(source)) : '') +
            '</code></pre>';
    }

    // Also support Mermaid blocks rendered as regular code blocks
    // e.g. <pre><code class="language-mermaid">...</code></pre>
    try {
        var codeNodes = document.querySelectorAll('pre > code, code');
        for (var i = 0; i < codeNodes.length; i++) {
            var codeNode = codeNodes[i];
            if (!codeNode || !codeNode.classList) continue;

            var isMermaidCode = codeNode.classList.contains('language-mermaid') ||
                codeNode.classList.contains('lang-mermaid') ||
                codeNode.classList.contains('mermaid');

            if (!isMermaidCode) continue;

            // If it's already inside a .mermaid container, leave it alone
            if (codeNode.closest && codeNode.closest('.mermaid')) continue;

            var pre = codeNode.parentElement && codeNode.parentElement.tagName === 'PRE'
                ? codeNode.parentElement
                : (codeNode.closest ? codeNode.closest('pre') : null);

            var diagramText = codeNode.textContent || '';
            if (!diagramText.trim()) continue;

            var mermaidDiv = document.createElement('div');
            mermaidDiv.className = 'mermaid';
            mermaidDiv.textContent = diagramText;
            // Persist the original diagram source so re-renders don't try to parse the rendered SVG.
            mermaidDiv.setAttribute('data-mermaid-source', diagramText.trim());

            if (pre && pre.parentNode) {
                pre.parentNode.replaceChild(mermaidDiv, pre);
            } else if (codeNode.parentNode) {
                codeNode.parentNode.replaceChild(mermaidDiv, codeNode);
            }
        }
    } catch (e0) {
        // Non-fatal: continue with normal Mermaid initialization
    }

    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';

    // Initialize Mermaid only once per theme to prevent issues with re-initialization
    if (!window.mermaidInitialized || window.mermaidTheme !== theme) {
        mermaid.initialize({ startOnLoad: false, theme: theme });
        window.mermaidInitialized = true;
        window.mermaidTheme = theme;
    }

    // Validate diagrams first (gives a clearer error than Mermaid's default icon)
    var mermaidNodes = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
    if (mermaidNodes.length === 0) return;

    // Build a list of nodes that actually need rendering.
    // Important: if a node is already rendered (SVG / data-processed) but the source is missing,
    // do NOT try to re-parse its textContent (it will be SVG/CSS text and will error).
    var nodesToRender = [];
    for (var j = 0; j < mermaidNodes.length; j++) {
        var n = mermaidNodes[j];
        var existingSource = (n.getAttribute('data-mermaid-source') || '').trim();
        var alreadyRendered = false;
        try {
            alreadyRendered = !!(n.getAttribute && n.getAttribute('data-processed')) ||
                (n.querySelector && n.querySelector('svg')) ||
                (typeof n.innerHTML === 'string' && n.innerHTML.indexOf('<svg') !== -1);
        } catch (eRenderCheck) {
            alreadyRendered = false;
        }

        var renderedTheme = '';
        try {
            renderedTheme = (n.getAttribute('data-mermaid-render-theme') || '').trim();
        } catch (eThemeRead) {
            renderedTheme = '';
        }

        // If already rendered and theme hasn't changed, leave it alone.
        // This prevents re-parsing SVG textContent and avoids flicker.
        if (alreadyRendered && renderedTheme === theme) {
            continue;
        }

        // If we don't have a saved source, only try fallback for NOT-rendered nodes.
        // Rendered nodes without a source must stay as-is.
        if (!existingSource) {
            if (alreadyRendered) {
                continue;
            }
            var fallbackSource = (n.textContent || '').trim();
            if (!fallbackSource) continue;
            n.setAttribute('data-mermaid-source', fallbackSource);
            existingSource = fallbackSource;
        }

        // At this point, we have a source and we want to (re)render.
        // Mermaid will skip nodes marked as processed, so clear it when re-rendering.
        try {
            n.removeAttribute('data-processed');
        } catch (eProcessed) { }

        n.textContent = existingSource;
        nodesToRender.push(n);
    }

    if (nodesToRender.length === 0) return;

    try {
        // If mermaid.parse is available, validate each diagram and render only valid ones
        if (typeof mermaid.parse === 'function' && typeof Promise !== 'undefined') {
            var validNodes = [];
            var checks = nodesToRender.map(function (node) {
                var src = node.getAttribute('data-mermaid-source') || '';
                if (!src.trim()) return Promise.resolve();
                return Promise.resolve(mermaid.parse(src))
                    .then(function () {
                        // Ensure the node contains only the source text when (re)rendering
                        // and that it won't be skipped due to a stale processed flag.
                        try { node.removeAttribute('data-processed'); } catch (eDp1) { }
                        node.textContent = src;
                        validNodes.push(node);
                    })
                    .catch(function (err) {
                        renderMermaidError(node, err, src);
                    });
            });

            Promise.all(checks).then(function () {
                if (!validNodes.length) return;
                return mermaid.run({
                    nodes: validNodes,
                    suppressErrors: true
                }).then(function () {
                    for (var k = 0; k < validNodes.length; k++) {
                        try {
                            validNodes[k].setAttribute('data-mermaid-render-theme', theme);
                        } catch (eSetTheme1) { }
                    }
                });
            }).catch(function (e1) {
                console.error('Mermaid rendering failed', e1);
            });
        } else {
            mermaid.run({
                nodes: nodesToRender,
                suppressErrors: true
            }).then(function () {
                for (var k2 = 0; k2 < nodesToRender.length; k2++) {
                    try {
                        nodesToRender[k2].setAttribute('data-mermaid-render-theme', theme);
                    } catch (eSetTheme2) { }
                }
            });
        }
    } catch (e) {
        // Fallback for older versions
        try {
            if (!window.mermaidInitialized || window.mermaidTheme !== theme) {
                mermaid.initialize({ startOnLoad: false, theme: theme });
                window.mermaidInitialized = true;
                window.mermaidTheme = theme;
            }
            mermaid.init(undefined, nodesToRender);
            for (var k3 = 0; k3 < nodesToRender.length; k3++) {
                try {
                    nodesToRender[k3].setAttribute('data-mermaid-render-theme', theme);
                } catch (eSetTheme3) { }
            }
        } catch (e2) {
            console.error('Mermaid initialization failed', e2);
        }
    }

    // Render math equations with KaTeX
    if (typeof renderMathInElement === 'function') {
        try {
            renderMathInElement(document.body);
        } catch (mathError) {
            console.error('Math rendering failed', mathError);
        }
    }
}

function parseMarkdown(text) {
    if (!text) return '';

    var escapeHtml = _mdEscapeHtml;

    function tryParseInternalNoteId(url) {
        if (!url) return null;

        // Accept common internal patterns like:
        // - index.php?note=123
        // - /index.php?note=123
        // - index.php?workspace=Foo&note=123
        // - ?note=123
        const match = String(url).match(/(?:^|\/)?index\.php\?[^\s#]*\bnote=(\d+)\b|^\?[^\s#]*\bnote=(\d+)\b/);
        const id = match ? (match[1] || match[2]) : null;
        return id ? parseInt(id, 10) : null;
    }

    // Extract and protect math equations first (before HTML escaping)
    let protectedMathBlocks = [];
    let mathBlockIndex = 0;

    // Protect display math $$...$$
    text = text.replace(/(?<!\\)\$\$(.+?)(?<!\\)\$\$/gs, function (match, math) {
        let placeholder = '\x00MATHBLOCK' + mathBlockIndex + '\x00';
        protectedMathBlocks[mathBlockIndex] = math.trim();
        mathBlockIndex++;
        return '\n' + placeholder + '\n';
    });

    // Protect inline math $...$
    let protectedMathInline = [];
    let mathInlineIndex = 0;

    // Only match $ if not preceded by \ or $ (to allow escaping and avoid matching $$)
    // and if not followed by a space (opening) and content doesn't end with a space (closing)
    // also ensures it's not followed by a digit to avoid matching currency like $10 and $20
    text = text.replace(/(?<![\\$])\$(?!\$)([^\s$](?:[^\$]*?[^\s$])?)\$(?!\d)/g, function (match, math) {
        let placeholder = '\x00MATHINLINE' + mathInlineIndex + '\x00';
        protectedMathInline[mathInlineIndex] = math.trim();
        mathInlineIndex++;
        return placeholder;
    });

    // Extract and protect images and links from HTML escaping
    // We'll use placeholders and restore them later
    let protectedElements = [];
    let protectedIndex = 0;

    // Protect images first ![alt](url "title")
    text = text.replace(/!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, function (match, alt, url, title) {
        let placeholder = '\x00PIMG' + protectedIndex + '\x00';
        let imgTag;
        // Add lazy loading and async decoding for better performance with many images
        if (title) {
            imgTag = '<img src="' + url + '" alt="' + alt + '" title="' + title + '" loading="lazy" decoding="async">';
        } else {
            imgTag = '<img src="' + url + '" alt="' + alt + '" loading="lazy" decoding="async">';
        }
        protectedElements[protectedIndex] = imgTag;
        protectedIndex++;
        return placeholder;
    });

    // Protect links [text](url "title")
    text = text.replace(/\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, function (match, linkText, url, title) {
        let placeholder = '\x00PLNK' + protectedIndex + '\x00';
        let linkTag;

        const internalNoteId = tryParseInternalNoteId(url);
        if (internalNoteId) {
            // Internal note link: keep navigation in-app (handled by note-reference.js)
            // Do not force target=_blank.
            if (title) {
                linkTag = '<a href="' + url + '" class="note-internal-link" data-note-id="' + internalNoteId + '" data-note-reference="true" title="' + title + '">' + linkText + '</a>';
            } else {
                linkTag = '<a href="' + url + '" class="note-internal-link" data-note-id="' + internalNoteId + '" data-note-reference="true">' + linkText + '</a>';
            }
        } else if (title) {
            linkTag = '<a href="' + url + '" title="' + title + '" target="_blank" rel="noopener">' + linkText + '</a>';
        } else {
            linkTag = '<a href="' + url + '" target="_blank" rel="noopener">' + linkText + '</a>';
        }
        protectedElements[protectedIndex] = linkTag;
        protectedIndex++;
        return placeholder;
    });

    // Protect inline span tags with style attributes (for colors, backgrounds, etc.)
    // Match: <span style="...">content</span>
    text = text.replace(/<span\s+style="([^"]+)">([^<]*)<\/span>/gi, function (match, styleAttr, content) {
        let placeholder = '\x00PSPAN' + protectedIndex + '\x00';
        let spanTag = '<span style="' + styleAttr + '">' + content + '</span>';
        protectedElements[protectedIndex] = spanTag;
        protectedIndex++;
        return placeholder;
    });

    // Protect details and summary tags
    text = text.replace(/<(details|summary)([^>]*)>/gi, function (match, tag, attrs) {
        let placeholder = '\x00PTAG' + protectedIndex + '\x00';
        protectedElements[protectedIndex] = '<' + tag + attrs + '>';
        protectedIndex++;
        return placeholder;
    });
    text = text.replace(/<\/(details|summary)>/gi, function (match, tag) {
        let placeholder = '\x00PTAG' + protectedIndex + '\x00';
        protectedElements[protectedIndex] = '</' + tag + '>';
        protectedIndex++;
        return placeholder;
    });

    // Protect video tags for local or http(s) sources
    text = text.replace(/<video\s+([^>]+)>\s*<\/video>/gis, function (match, attrs) {
        const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch) return match;

        const src = srcMatch[1];
        const isAllowed = /^https?:\/\//i.test(src) || src.startsWith('/') || src.startsWith('./') || src.startsWith('../');
        if (!isAllowed) return match;

        const placeholder = '\x00PVIDEO' + protectedIndex + '\x00';

        const safeAttrs = [];
        const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;
        let attrMatch;

        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const attrName = attrMatch[1].toLowerCase();
            const attrValue = attrMatch[2];
            if (['src', 'width', 'height', 'preload', 'poster', 'class', 'style'].includes(attrName)) {
                safeAttrs.push(attrName + '="' + attrValue + '"');
            }
        }

        if (/\bcontrols\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('controls'))) {
            safeAttrs.push('controls');
        }
        if (/\bmuted\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('muted'))) {
            safeAttrs.push('muted');
        }
        if (/\bplaysinline\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('playsinline'))) {
            safeAttrs.push('playsinline');
        }
        if (/\bloop\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('loop'))) {
            safeAttrs.push('loop');
        }

        const videoTag = '<video ' + safeAttrs.join(' ') + '></video>';
        protectedElements[protectedIndex] = videoTag;
        protectedIndex++;
        return placeholder;
    });

    // Protect audio tags for local or http(s) sources
    text = text.replace(/<audio\s+([^>]+)>\s*<\/audio>/gis, function (match, attrs) {
        const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
        if (!srcMatch) return match;

        const src = srcMatch[1];
        const isAllowed = /^https?:\/\//i.test(src) || src.startsWith('/') || src.startsWith('./') || src.startsWith('../');
        if (!isAllowed) return match;

        const placeholder = '\x00PAUDIO' + protectedIndex + '\x00';

        const safeAttrs = [];
        const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;
        let attrMatch;

        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            const attrName = attrMatch[1].toLowerCase();
            const attrValue = attrMatch[2];
            if (['src', 'preload', 'class', 'style'].includes(attrName)) {
                safeAttrs.push(attrName + '="' + attrValue + '"');
            }
        }

        if (/\bcontrols\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('controls'))) {
            safeAttrs.push('controls');
        }
        if (/\bmuted\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('muted'))) {
            safeAttrs.push('muted');
        }
        if (/\bloop\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('loop'))) {
            safeAttrs.push('loop');
        }
        if (/\bautoplay\b/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('autoplay'))) {
            safeAttrs.push('autoplay');
        }

        const audioTag = '<audio ' + safeAttrs.join(' ') + '></audio>';
        protectedElements[protectedIndex] = audioTag;
        protectedIndex++;
        return placeholder;
    });

    // Protect iframe tags (for YouTube, Vimeo, and other embeds)
    // Only allow iframes from trusted sources for security
    text = text.replace(/<iframe\s+([^>]+)>\s*<\/iframe>/gis, function (match, attrs) {
        // Extract src attribute to validate the source
        const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/i);
        if (srcMatch) {
            const src = srcMatch[1];

            // Whitelist of allowed iframe sources (trusted embed providers)
            // Synchronized with PHP's ALLOWED_IFRAME_DOMAINS via window object
            const allowedDomains = window.ALLOWED_IFRAME_DOMAINS || [];

            // Check if the src matches any allowed domain or local audio player
            const isLocalAudioPlayer =
                src.startsWith('/audio_player.php') ||
                src.startsWith('./audio_player.php') ||
                src.startsWith('../audio_player.php');

            const isAllowed = isLocalAudioPlayer || allowedDomains.some(domain =>
                src.includes('//' + domain) || src.includes('.' + domain)
            );

            if (isAllowed) {
                const placeholder = '\x00PIFRAME' + protectedIndex + '\x00';

                // Sanitize attributes: only allow safe attributes
                const safeAttrs = [];
                const attrRegex = /(\w+)\s*=\s*["']([^"']*)["']/g;
                let attrMatch;

                while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                    const attrName = attrMatch[1].toLowerCase();
                    const attrValue = attrMatch[2];

                    // Only allow safe attributes
                    if (['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title', 'loading', 'referrerpolicy', 'sandbox', 'style', 'class'].includes(attrName)) {
                        safeAttrs.push(attrName + '="' + attrValue + '"');
                    }
                }

                // Handle boolean attributes like allowfullscreen
                if (/allowfullscreen/i.test(attrs) && !safeAttrs.some(attr => attr.startsWith('allowfullscreen'))) {
                    safeAttrs.push('allowfullscreen');
                }

                const iframeTag = '<iframe ' + safeAttrs.join(' ') + '></iframe>';
                protectedElements[protectedIndex] = iframeTag;
                protectedIndex++;
                return placeholder;
            }
        }

        // If not allowed, return the original (will be escaped)
        return match;
    });

    // Now escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\(\$)/g, '$1');

    // Helper function to apply inline styles (bold, italic, code, etc.)
    function applyInlineStyles(text) {
        function linkifyPlainUrls(input) {
            var urlRegex = /(^|[\s(])((?:https?:\/\/)[^\s<]+)/g;
            return input.replace(urlRegex, function (match, prefix, url) {
                var trailing = '';
                while (/[),.;!?]$/.test(url)) {
                    trailing = url.slice(-1) + trailing;
                    url = url.slice(0, -1);
                }
                if (!url) return match;
                return prefix + '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>' + trailing;
            });
        }

        // First, protect inline code content from other replacements
        let protectedCode = [];
        let codeIndex = 0;
        text = text.replace(/`([^`]+)`/g, function (match, code) {
            let placeholder = '\x00CODE' + codeIndex + '\x00';
            protectedCode[codeIndex] = '<code>' + code + '</code>';
            codeIndex++;
            return placeholder;
        });

        // Handle angle bracket URLs <https://example.com>
        text = text.replace(/&lt;(https?:\/\/[^>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

        // Bold and italic
        text = text.replace(/\*\*\*([^\*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        text = text.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
        text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
        text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

        // Strikethrough
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // Auto-link plain URLs like GitHub-style markdown behavior
        text = linkifyPlainUrls(text);

        // Restore protected code elements
        text = text.replace(/\x00CODE(\d+)\x00/g, function (match, index) {
            return protectedCode[parseInt(index)] || match;
        });

        // Restore protected elements (images, links, spans, tags, iframes, videos, and audio)
        text = text.replace(/\x00P(IMG|LNK|SPAN|TAG|IFRAME|VIDEO|AUDIO)(\d+)\x00/g, function (match, type, index) {
            return protectedElements[parseInt(index)] || match;
        });

        // Restore protected inline math
        text = text.replace(/\x00MATHINLINE(\d+)\x00/g, function (match, index) {
            var mathContent = protectedMathInline[parseInt(index)];
            if (mathContent) {
                return '<span class="math-inline" data-math="' + escapeHtml(mathContent) + '"></span>';
            }
            return match;
        });

        return text;
    }

    // Process line by line for block-level elements
    let lines = html.split('\n');
    let result = [];
    let currentParagraph = [];
    let paragraphStartLine = -1;
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeBlockContent = [];
    let codeBlockStartLine = -1;

    function flushParagraph() {
        if (currentParagraph.length > 0) {
            // Process line breaks according to GitHub Flavored Markdown rules:
            // - Single line breaks become <br> (visible line breaks)
            // - Lines ending with 2+ spaces also become <br> (redundant but consistent)
            let processedLines = [];
            for (let i = 0; i < currentParagraph.length; i++) {
                let line = currentParagraph[i];
                if (i < currentParagraph.length - 1) {
                    // Check if line ends with 2+ spaces (remove trailing spaces, add <br>)
                    if (line.match(/\s{2,}$/)) {
                        processedLines.push(line.replace(/\s{2,}$/, '') + '<br>');
                    } else {
                        // GitHub style: single line breaks become <br>
                        processedLines.push(line + '<br>');
                    }
                } else {
                    // Last line - no <br> needed
                    processedLines.push(line);
                }
            }
            let para = processedLines.join('');
            para = applyInlineStyles(para);
            result.push('<p data-line="' + paragraphStartLine + '">' + para + '</p>');
            currentParagraph = [];
            paragraphStartLine = -1;
        }
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Handle code blocks
        if (line.match(/^\s*```/)) {
            flushParagraph();
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLang = line.replace(/^\s*```/, '').trim();
                codeBlockContent = [];
            } else {
                inCodeBlock = false;
                let codeContent = codeBlockContent.join('\n');
                // Check for mermaid, handling potential whitespace or case issues
                if (codeBlockLang && codeBlockLang.trim().toLowerCase() === 'mermaid') {
                    // Unescape HTML for mermaid to ensure arrows and other symbols work
                    let unescapedContent = codeContent
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .replace(/&#039;/g, "'");
                    result.push('<div class="mermaid">' + unescapedContent + '</div>');
                } else {
                    // Restore span color placeholders inside code blocks to allow coloring
                    codeContent = codeContent.replace(/\x00PSPAN(\d+)\x00/g, function (match, index) {
                        let elem = protectedElements[parseInt(index)];
                        if (elem) {
                            // Force font-family to inherit so it stays monospace inside code block
                            return elem.replace(/style="/i, 'style="font-family:inherit; ');
                        }
                        return match;
                    });
                    if (codeBlockLang) {
                        result.push('<pre data-language="' + codeBlockLang + '"><code class="language-' + codeBlockLang + '">' + codeContent + '</code></pre>');
                    } else {
                        result.push('<pre><code>' + codeContent + '</code></pre>');
                    }
                }
                codeBlockContent = [];
                codeBlockLang = '';
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Check for math block placeholders
        if (line.match(/\x00MATHBLOCK\d+\x00/)) {
            flushParagraph();
            line = line.replace(/\x00MATHBLOCK(\d+)\x00/g, function (match, index) {
                var mathContent = protectedMathBlocks[parseInt(index)];
                if (mathContent) {
                    return '<span class="math-block" data-math="' + escapeHtml(mathContent) + '"></span>';
                }
                return match;
            });
            result.push(line);
            continue;
        }

        // Check for protected HTML block tags (details, summary) to prevent wrapping in <p>
        // This ensures they are treated as block-level elements
        let ptagMatch = line.match(/^\x00PTAG(\d+)\x00/);
        if (ptagMatch) {
            let index = parseInt(ptagMatch[1]);
            let tagContent = protectedElements[index];
            if (tagContent && (
                tagContent.toLowerCase().startsWith('<details') ||
                tagContent.toLowerCase().startsWith('</details') ||
                tagContent.toLowerCase().startsWith('<summary') ||
                tagContent.toLowerCase().startsWith('</summary')
            )) {
                flushParagraph();
                result.push(applyInlineStyles(line));
                continue;
            }
        }

        // Empty line - paragraph separator
        if (line.trim() === '') {
            flushParagraph();
            continue;
        }

        // Headers (h1-h6)
        var headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            var level = headingMatch[1].length;
            var content = headingMatch[2];
            result.push('<h' + level + ' data-line="' + i + '">' + applyInlineStyles(content) + '</h' + level + '>');
            continue;
        }

        // Horizontal rules - allow spaces and require at least 3 characters
        if (line.trim().match(/^(\*{3,}|-{3,}|_{3,})$/)) {
            flushParagraph();
            result.push('<hr>');
            continue;
        }

        // Blockquotes - collect multi-line blockquotes
        if (line.match(/^(&gt;|>)\s*(.*)$/)) {
            flushParagraph();
            let blockquoteLines = [];
            let quoteContent = line.replace(/^(&gt;|>)\s*(.*)$/, '$2');
            blockquoteLines.push(quoteContent);

            // Continue collecting consecutive blockquote lines
            while (i + 1 < lines.length && lines[i + 1].match(/^(&gt;|>)\s*(.*)$/)) {
                i++;
                let nextContent = lines[i].replace(/^(&gt;|>)\s*(.*)$/, '$2');
                blockquoteLines.push(nextContent);
            }

            // Detect GitHub-style callouts (Note, Tip, Important, Warning, Caution)
            let firstLine = blockquoteLines.length > 0 ? blockquoteLines[0].trim() : '';
            let calloutMatch = firstLine.match(/^\s*(?:\*\*|__)?(Note|Tip|Important|Warning|Caution)(?:\*\*|__)?(?:[:\s\-]+(.*))?$/i);

            if (calloutMatch) {
                let calloutType = calloutMatch[1].toLowerCase();
                let calloutRemainder = calloutMatch[2] ? calloutMatch[2].trim() : '';

                // Build body lines
                let bodyLines = [];
                if (calloutRemainder) {
                    bodyLines.push(calloutRemainder);
                }
                for (let bi = 1; bi < blockquoteLines.length; bi++) {
                    bodyLines.push(blockquoteLines[bi]);
                }

                let defaultTitle = calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
                let titleHtml = (window.t ? window.t('slash_menu.callout_' + calloutType, null, defaultTitle) : defaultTitle);
                let bodyHtml = bodyLines.map(l => applyInlineStyles(l)).join('<br>');

                // GitHub-style callout icons
                let iconSvg = '';
                switch (calloutType) {
                    case 'note':
                        iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
                        break;
                    case 'tip':
                        iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>';
                        break;
                    case 'important':
                        iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.75v4.5a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"></path></svg>';
                        break;
                    case 'warning':
                        iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';
                        break;
                    case 'caution':
                        iconSvg = '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.75.75 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
                        break;
                }

                result.push('<aside class="callout callout-' + calloutType + '">' +
                    '<div class="callout-title">' + iconSvg + '<span class="callout-title-text">' + applyInlineStyles(titleHtml) + '</span></div>' +
                    '<div class="callout-body">' + bodyHtml + '</div>' +
                    '</aside>');
            } else {
                // Regular blockquote
                let content = blockquoteLines.map(l => applyInlineStyles(l)).join('<br>');
                result.push('<blockquote>' + content + '</blockquote>');
            }
            continue;
        }

        // Helper function to parse nested lists
        function parseNestedList(startIndex, isTaskList = false) {
            let listItems = [];
            let currentIndex = startIndex;
            let baseIndent = null;
            let baseMarkerType = null; // 'bullet' or 'number'

            while (currentIndex < lines.length) {
                let currentLine = lines[currentIndex];

                // Skip blank lines within lists - they should not break the list
                if (currentLine.trim() === '' && baseIndent !== null) {
                    // Only skip blank lines if we've already started a list
                    // Look ahead to see if there's another list item of the same type
                    let lookAheadIndex = currentIndex + 1;
                    let foundContinuation = false;

                    while (lookAheadIndex < lines.length) {
                        let lookAheadLine = lines[lookAheadIndex];

                        // If we hit another blank line, keep looking
                        if (lookAheadLine.trim() === '') {
                            lookAheadIndex++;
                            continue;
                        }

                        // Check if this is a list item that continues our list
                        let lookMatch;
                        let lookMarkerType = null;

                        if (isTaskList) {
                            lookMatch = lookAheadLine.match(/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/);
                        } else {
                            lookMatch = lookAheadLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                            if (lookMatch) {
                                let lookMarker = lookMatch[2];
                                lookMarkerType = lookMarker.match(/\d+\./) ? 'number' : 'bullet';
                            }
                        }

                        // If we found a list item of the same type and indentation (baseIndent)
                        if (lookMatch && baseIndent !== null && lookMatch[1].length === baseIndent &&
                            (isTaskList || lookMarkerType === baseMarkerType)) {
                            foundContinuation = true;
                        }

                        // Stop looking after we find non-blank content
                        break;
                    }

                    if (foundContinuation) {
                        // Skip this blank line and continue parsing
                        currentIndex++;
                        continue;
                    } else {
                        // No continuation found, end the list
                        break;
                    }
                }

                // Check if this is a list item
                let listMatch;
                let marker = null;
                let markerType = null;

                if (isTaskList) {
                    listMatch = currentLine.match(/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/);
                } else {
                    listMatch = currentLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                    if (listMatch) {
                        marker = listMatch[2];
                        markerType = marker.match(/\d+\./) ? 'number' : 'bullet';
                    }
                }

                if (!listMatch) {
                    break; // Not a list item, end of list
                }

                let indent = listMatch[1].length;
                let content = isTaskList ? listMatch[3] : listMatch[3];

                // If this is the first item, set the base indentation and marker type
                if (baseIndent === null) {
                    baseIndent = indent;
                    baseMarkerType = markerType;
                }

                // If marker type changed at SAME indentation level at root (indent=0),
                // treat it as nested under the last item (Poznote-specific behavior)
                if (!isTaskList && indent === 0 && baseIndent === 0 &&
                    markerType !== baseMarkerType && listItems.length > 0) {
                    // Collect all consecutive items with this different marker type
                    let nestedItems = [];
                    let nestedListTag = (markerType === 'number') ? 'ol' : 'ul';
                    let tempIndex = currentIndex;

                    while (tempIndex < lines.length) {
                        let tempLine = lines[tempIndex];
                        let tempMatch = tempLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                        if (!tempMatch) break;

                        let tempIndent = tempMatch[1].length;
                        let tempMarker = tempMatch[2];
                        let tempMarkerType = tempMarker.match(/\d+\./) ? 'number' : 'bullet';

                        // Stop if we're back to the base marker type or different indentation
                        if (tempIndent !== 0 || tempMarkerType !== markerType) {
                            break;
                        }

                        nestedItems.push('<li>' + applyInlineStyles(tempMatch[3]) + '</li>');
                        tempIndex++;
                    }

                    // Add nested list to last item
                    if (nestedItems.length > 0) {
                        let lastIdx = listItems.length - 1;
                        listItems[lastIdx] = listItems[lastIdx].replace(/<\/li>$/, '');
                        listItems[lastIdx] += '<' + nestedListTag + '>' + nestedItems.join('') + '</' + nestedListTag + '></li>';
                        currentIndex = tempIndex;
                        continue;
                    }
                }

                // If marker type changed at SAME indentation level (non-root), this is a different list
                if (!isTaskList && indent === baseIndent && markerType !== baseMarkerType) {
                    break; // Different list type at same level
                }

                if (indent === baseIndent) {
                    // Same level item
                    let itemHtml;
                    if (isTaskList) {
                        let isChecked = listMatch[2].toLowerCase() === 'x';
                        // Add data-line attribute for interactive checkbox toggling
                        let checkbox = '<input type="checkbox" class="markdown-task-checkbox" data-line="' + currentIndex + '" ' + (isChecked ? 'checked ' : '') + '>';
                        itemHtml = '<li class="task-list-item" data-line="' + currentIndex + '">' + checkbox + ' <span>' + applyInlineStyles(content) + '</span>';
                    } else {
                        itemHtml = '<li data-line="' + currentIndex + '">' + applyInlineStyles(content);
                    }

                    // Check if next items are more indented (nested)
                    let nextIndex = currentIndex + 1;
                    if (nextIndex < lines.length) {
                        let nextLine = lines[nextIndex];
                        let nextMatch;
                        if (isTaskList) {
                            nextMatch = nextLine.match(/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/);
                        } else {
                            nextMatch = nextLine.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
                        }

                        if (nextMatch && nextMatch[1].length > indent) {
                            // Parse nested list
                            let nestedResult = parseNestedList(nextIndex, isTaskList);
                            let isOrderedNested = !isTaskList && nextMatch[2].match(/\d+\./);
                            let listTag = isOrderedNested ? 'ol' : 'ul';
                            let listClass = isTaskList ? ' class="task-list"' : '';
                            itemHtml += '<' + listTag + listClass + '>' + nestedResult.items.join('') + '</' + listTag + '>';
                            currentIndex = nestedResult.endIndex;
                        }
                    }

                    itemHtml += '</li>';
                    listItems.push(itemHtml);
                } else if (indent < baseIndent) {
                    // Less indented, end of current list
                    break;
                } else {
                    // This shouldn't happen if we're parsing correctly
                    break;
                }

                currentIndex++;
            }

            return {
                items: listItems,
                endIndex: currentIndex - 1
            };
        }

        // Task lists (checkboxes) - must be checked before unordered lists
        if (line.match(/^\s*[\*\-\+]\s+\[([ xX])\]\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, true);
            result.push('<ul class="task-list">' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }

        // Unordered lists
        if (line.match(/^\s*[\*\-\+]\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, false);
            result.push('<ul>' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }

        // Ordered lists
        if (line.match(/^\s*\d+\.\s+(.+)$/)) {
            flushParagraph();
            let listResult = parseNestedList(i, false);
            result.push('<ol>' + listResult.items.join('') + '</ol>');
            i = listResult.endIndex;
            continue;
        }

        // Tables - detect table rows (lines with | separators)
        if (line.match(/^\s*\|.+\|\s*$/)) {
            flushParagraph();

            let tableRows = [];
            let isFirstRow = true;
            let hasHeaderSeparator = false;

            // Collect all consecutive table rows
            while (i < lines.length && lines[i].match(/^\s*\|.+\|\s*$/)) {
                let currentLine = lines[i].trim();

                // Check if this is a header separator line (|---|---|)
                if (currentLine.match(/^\|[\s\-:|]+\|$/)) {
                    hasHeaderSeparator = true;
                    i++;
                    continue;
                }

                // Parse table cells
                let cells = currentLine
                    .split('|')
                    .slice(1, -1) // Remove first and last empty elements
                    .map(cell => cell.trim());

                tableRows.push({
                    cells: cells,
                    isHeader: isFirstRow && !hasHeaderSeparator
                });

                if (isFirstRow) {
                    isFirstRow = false;
                }

                i++;
            }
            i--; // Adjust because the for loop will increment

            // Generate HTML table
            if (tableRows.length > 0) {
                let tableHTML = '<table>';
                let hasHeader = hasHeaderSeparator || tableRows[0].isHeader;

                // Process rows
                for (let r = 0; r < tableRows.length; r++) {
                    let row = tableRows[r];
                    let isHeaderRow = (r === 0 && hasHeader);
                    let cellTag = isHeaderRow ? 'th' : 'td';

                    tableHTML += '<tr>';
                    for (let c = 0; c < row.cells.length; c++) {
                        let cellContent = applyInlineStyles(row.cells[c]);
                        tableHTML += '<' + cellTag + '>' + cellContent + '</' + cellTag + '>';
                    }
                    tableHTML += '</tr>';
                }

                tableHTML += '</table>';
                result.push(tableHTML);
            }
            continue;
        }

        // Regular text - add to current paragraph
        if (paragraphStartLine === -1) {
            paragraphStartLine = i;
        }
        currentParagraph.push(line);
    }

    // Flush any remaining paragraph
    flushParagraph();

    // Handle unclosed code block
    if (inCodeBlock && codeBlockContent.length > 0) {
        let codeContent = codeBlockContent.join('\n');
        if (codeBlockLang) {
            result.push('<pre><code class="language-' + codeBlockLang + '">' + codeContent + '</code></pre>');
        } else {
            result.push('<pre><code>' + codeContent + '</code></pre>');
        }
    }

    return result.join('\n');
}

/**
 * Render markdown content into a preview div, with optional post-processing
 * (Mermaid, math, syntax highlighting, interactivity).
 */
function renderMarkdownPreview(previewDiv, markdownContent, noteId, options) {
    options = options || {};
    var placeholder = options.placeholder || (window.t ? window.t('editor.messages.preview_mode_hint', null, 'You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.') : 'You are in preview mode. Switch to edit mode using the button in the toolbar to start writing markdown.');
    var postProcess = options.postProcess !== false;
    var delay = options.delay || 100;

    if (markdownContent.trim() === '') {
        previewDiv.innerHTML = '<div class="markdown-preview-placeholder">' + placeholder + '</div>';
        previewDiv.classList.add('empty');
    } else {
        previewDiv.innerHTML = parseMarkdown(markdownContent);
        previewDiv.classList.remove('empty');
        if (postProcess && noteId) {
            setTimeout(function () {
                initMermaid();
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(previewDiv);
                }
                if (typeof applySyntaxHighlighting === 'function') {
                    applySyntaxHighlighting(previewDiv);
                }
                setupPreviewInteractivity(noteId);
            }, delay);
        }
    }
}

/**
 * Initialize markdown note functionality
 */
function initializeMarkdownNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') {
        return;
    }

    // Check for corrupted content (both editor and preview elements present)
    var existingEditor = noteEntry.querySelector('.markdown-editor');
    var existingPreview = noteEntry.querySelector('.markdown-preview');

    // Also check for escaped HTML content that contains editor/preview elements
    var htmlContent = noteEntry.innerHTML;
    var hasEscapedEditor = htmlContent.includes('&lt;div class="markdown-editor"');
    var hasEscapedPreview = htmlContent.includes('&lt;div class="markdown-preview"');

    // Declare markdownContent variable once
    var markdownContent = '';

    // Only treat as corrupted if we have ESCAPED HTML (not real elements)
    if (hasEscapedEditor && hasEscapedPreview) {
        // Create a temporary element to safely decode the escaped HTML
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // The browser's innerHTML parsing of escaped HTML will put the escaped string as text content
        var decodedHtml = tempDiv.textContent || tempDiv.innerText || '';

        // Now decodedHtml is something like '<div class="markdown-editor">...</div>'
        // We can parse THIS as HTML to extract the content correctly
        tempDiv.innerHTML = decodedHtml;
        var recreatedEditor = tempDiv.querySelector('.markdown-editor');

        if (recreatedEditor) {
            // Use our robust normalization function which preserves line breaks
            markdownContent = normalizeContentEditableText(recreatedEditor);
        } else {
            // Fallback: if we couldn't find the editor div, just use textContent
            markdownContent = tempDiv.textContent || '';
        }

        // Clear the corrupted HTML and restore clean content
        noteEntry.innerHTML = '';
        noteEntry.textContent = markdownContent;

        // Update the data attribute with clean content
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    } else if (existingEditor && existingPreview) {

        // Real markdown elements exist - extract content and re-initialize

        // Extract the markdown content from the existing editor
        markdownContent = normalizeContentEditableText(existingEditor);

        // Store in data attribute
        noteEntry.setAttribute('data-markdown-content', markdownContent);

        // Clear existing elements to re-initialize cleanly
        noteEntry.innerHTML = '';
        noteEntry.textContent = markdownContent;
    } else {
        // No existing elements - get content from data attribute or text
        markdownContent = noteEntry.getAttribute('data-markdown-content') || noteEntry.textContent || '';
    }

    // Store the original markdown in a data attribute
    if (!noteEntry.getAttribute('data-markdown-content')) {
        noteEntry.setAttribute('data-markdown-content', markdownContent);
    }

    // Try to restore saved view mode (global for all notes)
    var savedMode = null;
    try {
        savedMode = localStorage.getItem('poznote-markdown-view-mode');
    } catch (e) {
        console.warn('Could not read view mode from localStorage:', e);
    }

    // Determine initial mode: edit or preview
    var isEmpty = markdownContent.trim() === '';
    var startInEditMode;
    var startInSplitMode = false;

    // Always start in edit mode for empty notes (new notes)
    if (isEmpty) {
        startInEditMode = true;
    } else if (savedMode && savedMode === 'split') {
        startInSplitMode = true;
        startInEditMode = false;
    } else if (savedMode && (savedMode === 'edit' || savedMode === 'preview')) {
        startInEditMode = (savedMode === 'edit');
    } else {
        // Default: preview mode if content exists
        startInEditMode = false;
    }

    // Create preview and editor containers
    var previewDiv = document.createElement('div');
    previewDiv.className = 'markdown-preview';
    // Set preview content or placeholder if empty
    renderMarkdownPreview(previewDiv, markdownContent, noteId, { postProcess: false });

    // Create container for editor
    var editorContainer = document.createElement('div');
    editorContainer.className = 'markdown-editor-container';

    var editorDiv = document.createElement('div');
    editorDiv.className = 'markdown-editor';
    editorDiv.contentEditable = true;
    editorDiv.textContent = markdownContent;
    var isMobileViewport = false;
    try {
        isMobileViewport = (window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    } catch (e) {
        isMobileViewport = false;
    }
    const mobilePlaceholder = window.t ? window.t('editor.markdown_placeholder_mobile', null, 'Write your markdown here...') : 'Write your markdown here...';
    const desktopPlaceholder = window.t ? window.t('editor.markdown_placeholder', null, 'Write your markdown or use / to open commands menu here...') : 'Write your markdown or use / to open commands menu here...';
    editorDiv.setAttribute('data-ph', isMobileViewport ? mobilePlaceholder : desktopPlaceholder);

    // Update placeholder when translations load
    document.addEventListener('poznote:i18n:loaded', function () {
        const mobilePh = window.t('editor.markdown_placeholder_mobile', null, 'Write your markdown here...');
        const desktopPh = window.t('editor.markdown_placeholder', null, 'Write your markdown or use / to open commands menu here...');
        editorDiv.setAttribute('data-ph', isMobileViewport ? mobilePh : desktopPh);
    });

    editorContainer.appendChild(editorDiv);

    // Ensure proper line break handling in contentEditable
    editorDiv.style.whiteSpace = 'pre-wrap';

    // Handle paste to ensure plain text only
    editorDiv.addEventListener('paste', function (e) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData('text/plain');

        // Normalize line endings
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        document.execCommand('insertText', false, text);
    });

    // Set initial display states using setProperty to override any CSS !important rules
    if (startInSplitMode) {
        // Split mode: show both editor and preview side by side
        noteEntry.classList.add('markdown-split-mode');
        editorContainer.style.setProperty('display', 'flex', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
    } else if (startInEditMode) {
        // Edit mode: show editor, hide preview
        editorContainer.style.setProperty('display', 'flex', 'important');
        previewDiv.style.setProperty('display', 'none', 'important');
    } else {
        // Preview mode: show preview, hide editor
        editorContainer.style.setProperty('display', 'none', 'important');
        previewDiv.style.setProperty('display', 'block', 'important');
    }

    // Replace note content with preview and editor
    noteEntry.innerHTML = '';
    noteEntry.appendChild(editorContainer);
    noteEntry.appendChild(previewDiv);
    noteEntry.contentEditable = false;

    // Initialize Mermaid diagrams and Math equations if in preview mode or split mode
    if ((!startInEditMode || startInSplitMode) && !isEmpty) {
        setTimeout(function () {
            initMermaid();
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(previewDiv);
            }
            // Apply syntax highlighting to code blocks
            if (typeof applySyntaxHighlighting === 'function') {
                applySyntaxHighlighting(previewDiv);
            }
            // Setup checkbox and click-to-navigate handlers
            setupPreviewInteractivity(noteId);
        }, 100);
    }

    var toolbar = document.querySelector('#note' + noteId + ' .note-edit-toolbar');
    if (toolbar) {
        // Hide separator button for markdown notes
        var separatorBtn = toolbar.querySelector('.btn-separator');
        if (separatorBtn) {
            separatorBtn.style.display = 'none';
        }

        // Check if view mode toggle button already exists, if not create it
        var existingViewModeBtn = toolbar.querySelector('.markdown-view-mode-btn');
        if (!existingViewModeBtn) {
            // Create unified view mode toggle button that cycles through: Edit -> Preview
            var viewModeBtn = document.createElement('button');
            viewModeBtn.type = 'button';
            viewModeBtn.className = 'toolbar-btn markdown-view-mode-btn note-action-btn';

            // Determine current view mode and set icon/title
            var currentMode;
            if (startInSplitMode) {
                currentMode = 'split';
                viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                viewModeBtn.style.display = 'none'; // Hide in split mode
            } else if (startInEditMode) {
                currentMode = 'edit';
                viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
            } else {
                currentMode = 'preview';
                viewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
                viewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
            }

            viewModeBtn.setAttribute('data-current-mode', currentMode);

            viewModeBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                toggleMarkdownMode(noteId);
            };

            toolbar.insertBefore(viewModeBtn, toolbar.firstChild);

            // Create markdown help button

            // Create split view button
            var splitBtn = document.createElement('button');
            splitBtn.type = 'button';
            splitBtn.className = 'toolbar-btn markdown-split-btn note-action-btn';
            splitBtn.innerHTML = '<i class="lucide lucide-columns-2"></i>';
            splitBtn.title = window.t('editor.toolbar.split_view', null, 'Toggle split view');
            splitBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();

                var noteEntry = document.getElementById('entry' + noteId);
                if (noteEntry && noteEntry.classList.contains('markdown-split-mode')) {
                    exitSplitMode(noteId);
                    splitBtn.classList.remove('active');
                } else {
                    switchToSplitMode(noteId);
                    splitBtn.classList.add('active');
                }
            };

            // Set initial state based on split mode
            if (startInSplitMode) {
                splitBtn.classList.add('active');
            }

            // Insert split button before favorite button (star)
            var favoriteBtn = toolbar.querySelector('.btn-favorite');
            if (favoriteBtn) {
                toolbar.insertBefore(splitBtn, favoriteBtn);
            } else {
                toolbar.appendChild(splitBtn);
            }
        } else {
            // Update existing button based on current state
            var currentMode;
            if (startInSplitMode) {
                currentMode = 'split';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = 'none'; // Hide in split mode
            } else if (startInEditMode) {
                currentMode = 'edit';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = '';
            } else {
                currentMode = 'preview';
                existingViewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
                existingViewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
                existingViewModeBtn.classList.remove('active');
                existingViewModeBtn.style.display = '';
            }
            existingViewModeBtn.setAttribute('data-current-mode', currentMode);
        }
    }

    // Setup live preview update if starting in split mode
    if (startInSplitMode) {
        setupSplitModePreviewUpdate(noteId);
    }

    // Setup event listeners for the editor
    setupMarkdownEditorListeners(noteId);

    // Set the global noteid
    noteid = noteId;
    window.noteid = noteId;
}

function switchToEditMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');

    if (!previewDiv || !editorDiv) return;

    // Save scroll position of the container before layout changes
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    // Switch to edit mode - use setProperty to override !important rules
    previewDiv.style.setProperty('display', 'none', 'important');
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'block', 'important');
    } else {
        editorDiv.style.setProperty('display', 'block', 'important');
    }

    // Determine scroll ratio based on source mode
    // If preview was scrollable (Split Mode), use its internal scroll
    // If preview was expanded (Preview Mode), use page scroll
    var scrollRatio = 0;
    var previewIsScrollable = previewDiv.scrollHeight > previewDiv.clientHeight &&
        window.getComputedStyle(previewDiv).overflowY !== 'visible';

    if (previewIsScrollable) {
        var pHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
        scrollRatio = pHeight > 0 ? previewDiv.scrollTop / pHeight : 0;
    } else {
        var cHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
        scrollRatio = cHeight > 0 ? savedScrollTop / cHeight : 0;
    }

    // Restore scroll position in editor using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                // In normal Edit Mode, editor expands and main container scrolls
                if (scrollContainer) {
                    var containerScrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                    if (containerScrollHeight > 0) {
                        scrollContainer.scrollTop = scrollRatio * containerScrollHeight;
                    }
                }

                // If editor happens to be scrollable internally (e.g. still in split mode or minimal height)
                var editorScrollHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
                if (editorScrollHeight > 0) {
                    editorDiv.scrollTop = scrollRatio * editorScrollHeight;
                }
            }, 50);
        });
    });

    // Show preview button, hide edit button (legacy support)
    if (editBtn) editBtn.style.display = 'none';
    if (previewBtn) previewBtn.style.display = '';

    // Update view mode button
    updateViewModeButton(noteId, 'edit');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'edit');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }
}

function switchToPreviewMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    // Read previous content BEFORE we overwrite the attribute below
    var previousContent = noteEntry.getAttribute('data-markdown-content') || '';

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');
    var editBtn = document.querySelector('#note' + noteId + ' .markdown-edit-btn');
    var previewBtn = document.querySelector('#note' + noteId + ' .markdown-preview-btn');

    if (!previewDiv || !editorDiv) return;

    // Save scroll position of the container before layout changes
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;



    // Switch to preview mode
    // Use helper function to properly normalize content
    var markdownContent = normalizeContentEditableText(editorDiv);
    var isEmpty = markdownContent.trim() === '';

    renderMarkdownPreview(previewDiv, markdownContent, noteId);

    noteEntry.setAttribute('data-markdown-content', markdownContent);

    // Use setProperty to override !important rules
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'none', 'important');
    } else {
        editorDiv.style.setProperty('display', 'none', 'important');
    }
    previewDiv.style.setProperty('display', 'block', 'important');

    // Determine scroll ratio based on source mode
    // If editor was scrollable (Split Mode), use its internal scroll
    // If editor was expanded (Edit Mode), use page scroll
    var scrollRatio = 0;
    var editorIsScrollable = editorDiv.scrollHeight > editorDiv.clientHeight &&
        window.getComputedStyle(editorDiv).overflowY !== 'visible';

    if (editorIsScrollable) {
        var eHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
        scrollRatio = eHeight > 0 ? editorDiv.scrollTop / eHeight : 0;
    } else {
        var cHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
        scrollRatio = cHeight > 0 ? savedScrollTop / cHeight : 0;
    }

    // Restore scroll position in preview using proportional scroll
    // Use multiple animation frames to ensure layout is complete
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                // In Normal Preview Mode, preview expands and main container scrolls
                if (scrollContainer) {
                    var containerScrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                    if (containerScrollHeight > 0) {
                        scrollContainer.scrollTop = scrollRatio * containerScrollHeight;
                    }
                }

                // If preview happens to be scrollable internally
                var previewScrollHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
                if (previewScrollHeight > 0) {
                    previewDiv.scrollTop = scrollRatio * previewScrollHeight;
                }
            }, 50);
        });
    });

    // Show edit button, hide preview button (legacy support)
    if (editBtn) editBtn.style.display = '';
    if (previewBtn) previewBtn.style.display = 'none';

    // Update view mode button
    updateViewModeButton(noteId, 'preview');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'preview');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }

    // Only mark as edited and trigger save if content has changed
    if (previousContent !== markdownContent) {
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    }
}

function toggleMarkdownMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');

    if (!previewDiv || !editorDiv) return;

    // Check which element is visible: editor container or preview
    var elementToCheck = editorContainer || editorDiv;
    var isPreviewMode = window.getComputedStyle(elementToCheck).display === 'none';

    if (isPreviewMode) {
        switchToEditMode(noteId);
    } else {
        switchToPreviewMode(noteId);
    }
}

// Override the global getMarkdownContent to be accessible
function getMarkdownContentForNote(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    var noteType = noteEntry.getAttribute('data-note-type');
    if (noteType !== 'markdown') return null;

    // Check if we're in edit mode or preview mode
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv && editorDiv.style.display !== 'none') {
        // In edit mode, get content from editor
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }

    // In preview mode, get from data attribute
    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Listen to input events in markdown editor to mark note as edited
function setupMarkdownEditorListeners(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!editorDiv) return;

    // Get the scrollable parent container
    var scrollContainer = document.getElementById('right_col');
    var preventScroll = false;
    var savedScrollTop = 0;

    // Set noteid on focus (like normal notes)
    editorDiv.addEventListener('focus', function () {
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        // Also set it globally for compatibility
        window.noteid = noteId;
    });

    // Before keydown, save scroll position
    editorDiv.addEventListener('keydown', function (e) {
        if (scrollContainer) {
            savedScrollTop = scrollContainer.scrollTop;
            preventScroll = true;

            // After a short delay, stop preventing scroll
            setTimeout(function () {
                preventScroll = false;
            }, 100);
        }
    });

    // Prevent unwanted scroll during input
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', function (e) {
            if (preventScroll) {
                // Restore the scroll position
                scrollContainer.scrollTop = savedScrollTop;
            }
        }, { passive: false });
    }

    editorDiv.addEventListener('input', function () {
        // Update the data attribute with current content
        // Use helper function to properly normalize content
        var content = normalizeContentEditableText(editorDiv);
        noteEntry.setAttribute('data-markdown-content', content);

        // Make sure noteid is set
        if (typeof noteid !== 'undefined') {
            noteid = noteId;
        }
        window.noteid = noteId;

        // Mark as edited
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    });
}

// Save markdown content when updating note
function getMarkdownContent(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (editorDiv) {
        // Use helper function to properly normalize content
        return normalizeContentEditableText(editorDiv);
    }

    return noteEntry.getAttribute('data-markdown-content') || '';
}

// Helper function to update view mode button icon and title
function updateViewModeButton(noteId, mode) {
    var viewModeBtn = document.querySelector('#note' + noteId + ' .markdown-view-mode-btn');
    if (!viewModeBtn) return;

    viewModeBtn.setAttribute('data-current-mode', mode);

    if (mode === 'edit') {
        viewModeBtn.innerHTML = '<i class="lucide lucide-file-code"></i>';
        viewModeBtn.title = window.t('editor.toolbar.switch_to_preview', null, 'Switch to preview mode');
        viewModeBtn.classList.remove('active');
        viewModeBtn.style.display = '';
    } else if (mode === 'preview') {
        viewModeBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
        viewModeBtn.title = window.t('editor.toolbar.switch_to_edit', null, 'Switch to edit mode');
        viewModeBtn.classList.remove('active');
        viewModeBtn.style.display = '';
    } else if (mode === 'split') {
        // Hide the view mode button in split mode
        viewModeBtn.style.display = 'none';
    }
}

// Switch to split view mode (editor on left, preview on right)
function switchToSplitMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var editorContainer = noteEntry.querySelector('.markdown-editor-container');

    if (!previewDiv || !editorDiv) return;

    // Calculate scroll ratio relative to the content content (approximated by right_col scroll)
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    var scrollHeight = scrollContainer ? (scrollContainer.scrollHeight - scrollContainer.clientHeight) : 0;
    var scrollRatio = (scrollHeight > 0) ? (savedScrollTop / scrollHeight) : 0;

    // Update preview content before showing
    var markdownContent = normalizeContentEditableText(editorDiv);
    var isEmpty = markdownContent.trim() === '';

    renderMarkdownPreview(previewDiv, markdownContent, noteId, {
        placeholder: window.t ? window.t('editor.messages.split_preview_placeholder', null, 'Preview will appear here as you type...') : 'Preview will appear here as you type...'
    });

    noteEntry.setAttribute('data-markdown-content', markdownContent);

    // Add split mode class to note entry
    noteEntry.classList.add('markdown-split-mode');

    // Show both editor and preview
    if (editorContainer) {
        editorContainer.style.setProperty('display', 'flex', 'important');
    } else {
        editorDiv.style.setProperty('display', 'block', 'important');
    }
    previewDiv.style.setProperty('display', 'block', 'important');

    // Restore scroll position after layout changes
    // In split mode, the right_col becomes hidden overflow, and panels scroll internally.
    // We must reset right_col to 0 to show the toolbar, and scroll the panels instead.
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            setTimeout(function () {
                if (scrollContainer) {
                    // Reset main container scroll so toolbar (sticky/relative) is visible at top
                    scrollContainer.scrollTop = 0;
                }

                // Apply proportional scroll to editor and preview
                if (scrollRatio > 0) {
                    // Scroll editor
                    var editorScrollable = editorContainer || editorDiv; // Container scrolls in split mode? No, editorDiv usually
                    // Check logic in CSS: .noteentry.markdown-split-mode .markdown-editor { overflow-y: auto }
                    // So editorDiv is the scroll target

                    if (editorDiv) {
                        var eHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
                        editorDiv.scrollTop = scrollRatio * eHeight;
                    }

                    // Scroll preview
                    if (previewDiv) {
                        var pHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
                        previewDiv.scrollTop = scrollRatio * pHeight;
                    }
                }
            }, 50);
        });
    });

    // Update view mode button
    updateViewModeButton(noteId, 'split');

    // Save mode to localStorage
    try {
        localStorage.setItem('poznote-markdown-view-mode', 'split');
    } catch (e) {
        console.warn('Could not save view mode to localStorage:', e);
    }

    // Setup live preview update on input
    setupSplitModePreviewUpdate(noteId);
}

// Exit split view mode (return to edit mode)
function exitSplitMode(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    // Save scroll position of the container before layout changes
    var scrollContainer = document.getElementById('right_col');
    var savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    // Remove split mode class
    noteEntry.classList.remove('markdown-split-mode');

    // Remove split mode input listener
    if (editorDiv && editorDiv._splitModeInputListener) {
        editorDiv.removeEventListener('input', editorDiv._splitModeInputListener);
        editorDiv._splitModeInputListener = null;
    }

    // Hide preview
    if (previewDiv) {
        previewDiv.style.setProperty('display', 'none', 'important');
    }

    // Switch to preview mode instead of edit mode
    switchToPreviewMode(noteId);
}

// Setup live preview update in split mode
function setupSplitModePreviewUpdate(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    if (!editorDiv || !previewDiv) return;

    // Remove existing listener if any
    if (editorDiv._splitModeInputListener) {
        editorDiv.removeEventListener('input', editorDiv._splitModeInputListener);
    }

    // Create debounced update function
    var updateTimeout;
    editorDiv._splitModeInputListener = function () {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(function () {
            var content = normalizeContentEditableText(editorDiv);
            var isEmpty = content.trim() === '';

            renderMarkdownPreview(previewDiv, content, noteId, {
                placeholder: 'Preview will appear here as you type...',
                delay: 50
            });
        }, 300); // 300ms debounce
    };

    editorDiv.addEventListener('input', editorDiv._splitModeInputListener);
}

// Update toggle function to handle split mode
function toggleMarkdownModeSplit(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var viewModeBtn = document.querySelector('#note' + noteId + ' .markdown-view-mode-btn');
    if (!viewModeBtn) return;

    var currentMode = viewModeBtn.getAttribute('data-current-mode');

    // Cycle through: edit -> preview -> edit
    if (currentMode === 'edit') {
        switchToPreviewMode(noteId);
    } else {
        switchToEditMode(noteId);
    }
}

/**
 * Toggle a markdown checkbox and update the source content
 * @param {HTMLInputElement} checkbox - The checkbox element that was clicked
 * @param {number} lineNumber - The line number in the markdown source
 */
function toggleMarkdownCheckbox(checkbox, lineNumber) {
    // Find the note entry containing this checkbox
    var noteEntry = checkbox.closest('.noteentry');
    if (!noteEntry) return;

    var noteId = noteEntry.id.replace('entry', '');
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    var previewDiv = noteEntry.querySelector('.markdown-preview');

    if (!editorDiv) return;

    // Get the current markdown content
    var content = normalizeContentEditableText(editorDiv);
    var lines = content.split('\n');

    // Validate line number
    if (lineNumber < 0 || lineNumber >= lines.length) {
        console.warn('Invalid line number for checkbox toggle:', lineNumber);
        return;
    }

    var line = lines[lineNumber];

    // Toggle the checkbox in the markdown source
    if (checkbox.checked) {
        // Changed from unchecked to checked
        lines[lineNumber] = line.replace(/\[([ ])\]/, '[x]');
    } else {
        // Changed from checked to unchecked
        lines[lineNumber] = line.replace(/\[([xX])\]/, '[ ]');
    }

    // Update the editor content
    var newContent = lines.join('\n');
    editorDiv.textContent = newContent;
    noteEntry.setAttribute('data-markdown-content', newContent);

    // Mark the note as modified
    if (typeof window.markNoteAsModified === 'function') {
        window.markNoteAsModified();
    }

    // Set the global noteid
    if (typeof noteid !== 'undefined') {
        noteid = noteId;
    }
    window.noteid = noteId;

    // If in split mode, update the preview (but preserve checkbox states that just changed)
    if (noteEntry.classList.contains('markdown-split-mode') && previewDiv) {
        // Re-render the preview
        renderMarkdownPreview(previewDiv, newContent, noteId, { delay: 50 });
    }
}

/**
 * Navigate to a specific line in the markdown editor
 * @param {number} lineNumber - The line number to navigate to
 * @param {HTMLElement} noteEntry - The note entry element
 */
function navigateToEditorLine(lineNumber, noteEntry) {
    var editorDiv = noteEntry.querySelector('.markdown-editor');
    if (!editorDiv) return;

    var content = editorDiv.textContent || '';
    var lines = content.split('\n');

    // Calculate character offset for the target line
    var charOffset = 0;
    for (var i = 0; i < lineNumber && i < lines.length; i++) {
        charOffset += lines[i].length + 1; // +1 for newline
    }

    // Focus the editor
    editorDiv.focus();

    // Set cursor position using Selection API
    try {
        var textNode = editorDiv.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            var range = document.createRange();
            var selection = window.getSelection();

            // Clamp the offset to valid range
            var maxOffset = textNode.textContent.length;
            charOffset = Math.min(charOffset, maxOffset);

            range.setStart(textNode, charOffset);
            range.collapse(true);

            selection.removeAllRanges();
            selection.addRange(range);

            // Scroll the editor to show the cursor
            // Calculate approximate scroll position
            var lineHeight = parseInt(window.getComputedStyle(editorDiv).lineHeight) || 20;
            var scrollTop = lineNumber * lineHeight - editorDiv.clientHeight / 2;
            editorDiv.scrollTop = Math.max(0, scrollTop);
        }
    } catch (e) {
        console.warn('Could not set cursor position:', e);
    }
}

/**
 * Setup interactivity for markdown preview (checkbox toggling and click-to-navigate)
 * @param {number} noteId - The note ID
 */
function setupPreviewInteractivity(noteId) {
    var noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    var previewDiv = noteEntry.querySelector('.markdown-preview');
    if (!previewDiv) return;

    if (typeof window.processNoteReferences === 'function') {
        try {
            window.processNoteReferences(previewDiv);
        } catch (e) {
            console.error('Error processing note references in markdown preview:', e);
        }
    }

    var isInSplitMode = noteEntry.classList.contains('markdown-split-mode');

    // Setup checkbox click handlers
    var checkboxes = previewDiv.querySelectorAll('.markdown-task-checkbox');
    checkboxes.forEach(function (checkbox) {
        // Remove any existing listener
        checkbox.removeEventListener('click', checkbox._checkboxClickHandler);
        checkbox.removeEventListener('change', checkbox._checkboxChangeHandler);

        // Add click handler
        checkbox._checkboxChangeHandler = function (e) {
            var lineNumber = parseInt(checkbox.getAttribute('data-line'));
            toggleMarkdownCheckbox(checkbox, lineNumber);
        };

        checkbox.addEventListener('change', checkbox._checkboxChangeHandler);
    });

    // Setup click-to-navigate only in split mode
    if (isInSplitMode) {
        // Find all elements with data-line attributes
        var lineElements = previewDiv.querySelectorAll('[data-line]');
        lineElements.forEach(function (element) {
            // Skip checkboxes (they have their own handler)
            if (element.classList.contains('markdown-task-checkbox')) return;

            // Skip details and summary elements (they have native toggle functionality)
            if (element.tagName === 'DETAILS' || element.tagName === 'SUMMARY') return;

            // Remove any existing listener
            element.removeEventListener('click', element._navigateClickHandler);

            // Add click handler for navigation
            element._navigateClickHandler = function (e) {
                // Don't navigate if clicking a link, checkbox, or toggle elements
                if (e.target.tagName === 'A' || e.target.tagName === 'INPUT') return;
                if (e.target.closest('summary, details')) return;

                var lineNumber = parseInt(element.getAttribute('data-line'));
                navigateToEditorLine(lineNumber, noteEntry);
            };

            element.addEventListener('click', element._navigateClickHandler);
            element.style.cursor = 'pointer';
        });
    }
}

// Make functions globally available
window.initializeMarkdownNote = initializeMarkdownNote;
window.toggleMarkdownMode = toggleMarkdownModeSplit;
window.switchToEditMode = switchToEditMode;
window.switchToPreviewMode = switchToPreviewMode;
window.switchToSplitMode = switchToSplitMode;
window.exitSplitMode = exitSplitMode;
window.getMarkdownContent = getMarkdownContent;
window.getMarkdownContentForNote = getMarkdownContentForNote;
window.parseMarkdown = parseMarkdown;
window.setupMarkdownEditorListeners = setupMarkdownEditorListeners;
window.updateViewModeButton = updateViewModeButton;
window.setupSplitModePreviewUpdate = setupSplitModePreviewUpdate;
window.toggleMarkdownCheckbox = toggleMarkdownCheckbox;
window.navigateToEditorLine = navigateToEditorLine;
window.setupPreviewInteractivity = setupPreviewInteractivity;

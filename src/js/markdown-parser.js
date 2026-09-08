// Markdown parser for Poznote.
//
// parseMarkdown() turns markdown source into preview HTML. It runs in three
// stages:
//   1. protect  raw elements that must survive HTML escaping (fenced code,
//               math, images, links, spans, media, Excalidraw, task embeds)
//               are swapped for \x00PLACEHOLDER\x00 markers;
//   2. escape   everything left is HTML-escaped, so nothing user-authored can
//               inject markup;
//   3. render   the text is walked line by line for block elements, and the
//               placeholders are restored inside applyInlineStyles().
//
// Elements carry data-line / data-start-line attributes pointing back at the
// source line, which is what the split-view scroll sync and the interactive
// checkboxes rely on.
//
// The _md-prefixed helpers below are the stateless parts, kept at module scope
// so the parser body reads as the block grammar. The prefix matters: index_js.php
// concatenates every js/*.js into one scope.

function initMermaid(retryCount) {
    retryCount = retryCount || 0;
    if (typeof mermaid === 'undefined') {
        // Nothing to render on this page: skip entirely, so the 2.7 MB Mermaid
        // library is never fetched for notes without diagrams.
        if (!document.querySelector('.mermaid, code.language-mermaid, code.lang-mermaid, code.mermaid')) {
            return;
        }

        // Load the library on demand (deduped by lazy-libs.js), then render.
        if (typeof window.poznoteEnsureMermaid === 'function') {
            if (!initMermaid._loading) {
                initMermaid._loading = true;
                window.poznoteEnsureMermaid().then(function () {
                    initMermaid._loading = false;
                    initMermaid();
                }, function (error) {
                    initMermaid._loading = false;
                    console.error('Could not load Mermaid:', error);
                });
            }
            return;
        }

        // Fallback for pages that include Mermaid statically (async/defer tag).
        if (retryCount < 10) {
            setTimeout(function () {
                initMermaid(retryCount + 1);
            }, 200);
        }
        return;
    }
    var _mdEscapeHtml = _mdEscapeHtml;

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
            _mdEscapeHtml(msg) +
            (source ? ('\n\n' + _mdEscapeHtml(source)) : '') +
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
        mermaid.initialize({
            startOnLoad: false,
            theme: theme,
            flowchart: {
                htmlLabels: false
            }
        });
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

        n.textContent = _mdNormalizeMermaidSourceForRendering(existingSource);
        nodesToRender.push(n);
    }

    if (nodesToRender.length === 0) return;

    try {
        // If mermaid.parse is available, validate each diagram and render only valid ones
        if (typeof mermaid.parse === 'function' && typeof Promise !== 'undefined') {
            var validNodes = [];
            var checks = nodesToRender.map(function (node) {
                var src = node.getAttribute('data-mermaid-source') || '';
                var renderSrc = _mdNormalizeMermaidSourceForRendering(src);
                if (!src.trim()) return Promise.resolve();
                return Promise.resolve(mermaid.parse(renderSrc))
                    .then(function () {
                        // Ensure the node contains only the source text when (re)rendering
                        // and that it won't be skipped due to a stale processed flag.
                        try { node.removeAttribute('data-processed'); } catch (eDp1) { }
                        node.textContent = renderSrc;
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
                mermaid.initialize({
                    startOnLoad: false,
                    theme: theme,
                    flowchart: {
                        htmlLabels: false
                    }
                });
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

/*
 * Pure helpers used by parseMarkdown(). They hold no parser state, so they live
 * at module scope: defining them once (instead of on every parseMarkdown call)
 * keeps the parser body about the block grammar itself. The _md prefix is
 * required, not cosmetic: index_js.php concatenates every js/*.js file into a
 * single scope, where plain names like _mdDecodeHtmlEntities would collide with
 * another module (js/excalidraw.js defines its own).
 */

function _mdTryParseInternalNoteId(url) {
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

function _mdIsPlainCodeBlockLanguage(language) {
    const normalizedLanguage = language ? language.trim().toLowerCase() : '';
    return normalizedLanguage === 'normal' || normalizedLanguage === 'code';
}

function _mdIsSyntaxHighlightLanguage(language) {
    const normalizedLanguage = language ? language.trim().toLowerCase() : '';
    if (!normalizedLanguage) return false;

    if (typeof hljs !== 'undefined' && hljs && typeof hljs.getLanguage === 'function') {
        return !!hljs.getLanguage(normalizedLanguage);
    }

    const fallbackLanguages = {
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

function _mdIsPlainFormattingCodeBlockLanguage(language) {
    const normalizedLanguage = language ? language.trim().toLowerCase() : '';
    return normalizedLanguage !== '' && (_mdIsPlainCodeBlockLanguage(normalizedLanguage) || !_mdIsSyntaxHighlightLanguage(normalizedLanguage));
}

function _mdGetPlainCodeBlockDisplayLanguage(language) {
    if (_mdIsPlainCodeBlockLanguage(language)) {
        return 'CODE';
    }

    return language ? language.trim() : 'CODE';
}

function _mdApplyPlainCodeInlineStyles(html) {
    return String(html || '')
        .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)(?=\S)([\s\S]*?\S)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
        .replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>')
        .replace(/&lt;u&gt;(?=\S)([\s\S]*?\S)&lt;\/u&gt;/gi, '<u>$1</u>');
}

function _mdRenderPlainCodeBlockContent(code) {
    var protectedSpans = [];
    var spanIndex = 0;
    var text = String(code || '').replace(/<span\s+style=(["'])(.*?)\1>([^<]*)<\/span>/gi, function (match, quote, styleAttr, content) {
        var placeholder = '\x00MDCODESPAN' + spanIndex + '\x00';
        var spanContent = _mdApplyPlainCodeInlineStyles(_mdEscapeHtml(content));
        protectedSpans[spanIndex] = '<span style="' + _mdEscapeHtml(styleAttr) + '">' + spanContent + '</span>';
        spanIndex++;
        return placeholder;
    });

    var html = _mdApplyPlainCodeInlineStyles(_mdEscapeHtml(text));
    return html.replace(/\x00MDCODESPAN(\d+)\x00/g, function (match, index) {
        return protectedSpans[parseInt(index, 10)] || match;
    });
}

function _mdIsSafeExcalidrawUrl(src) {
    var value = String(src || '').trim();
    return /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(value) || /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(value);
}

function _mdIsDangerousExcalidrawAttributeValue(value) {
    return /javascript:|vbscript:|data:(?!image\/)/i.test(String(value || ''));
}

function _mdGetSafeExcalidrawAttrs(element, allowedAttrs) {
    var attrs = [];
    for (var i = 0; i < allowedAttrs.length; i++) {
        var attrName = allowedAttrs[i];
        if (!element.hasAttribute(attrName)) {
            continue;
        }

        var attrValue = element.getAttribute(attrName) || '';
        if (attrName === 'src' && !_mdIsSafeExcalidrawUrl(attrValue)) {
            continue;
        }
        if (attrName !== 'data-excalidraw' && _mdIsDangerousExcalidrawAttributeValue(attrValue)) {
            continue;
        }

        attrs.push(attrName + '="' + _mdEscapeHtml(attrValue) + '"');
    }
    return attrs.length ? ' ' + attrs.join(' ') : '';
}

function _mdSanitizeExcalidrawContainerHtml(html, markdownExcalidrawIndex) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    var container = template.content.firstElementChild;
    if (!container || container.tagName !== 'DIV' || !container.classList.contains('excalidraw-container')) {
        return _mdEscapeHtml(html);
    }

    var divAttrs = _mdGetSafeExcalidrawAttrs(container, ['id', 'class', 'style', 'data-diagram-id', 'data-excalidraw', 'contenteditable']);
        if (typeof markdownExcalidrawIndex === 'number' && !isNaN(markdownExcalidrawIndex)) {
            divAttrs += ' data-markdown-excalidraw-index="' + markdownExcalidrawIndex + '"';
        }
    var childHtml = '';

    Array.prototype.forEach.call(container.childNodes, function (child) {
        if (child.nodeType === Node.TEXT_NODE) {
            childHtml += _mdEscapeHtml(child.textContent || '');
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        var tagName = child.tagName.toLowerCase();
        if (tagName === 'img') {
            childHtml += '<img' + _mdGetSafeExcalidrawAttrs(child, ['src', 'alt', 'title', 'class', 'style', 'width', 'height', 'data-is-excalidraw', 'data-excalidraw-note-id', 'loading', 'decoding']) + '>';
        } else if (tagName === 'i') {
            childHtml += '<i' + _mdGetSafeExcalidrawAttrs(child, ['class', 'style']) + '></i>';
        } else if (tagName === 'p') {
            childHtml += '<p' + _mdGetSafeExcalidrawAttrs(child, ['class', 'style']) + '>' + _mdEscapeHtml(child.textContent || '') + '</p>';
        } else if (tagName === 'div' && child.classList.contains('excalidraw-data')) {
            childHtml += '<div' + _mdGetSafeExcalidrawAttrs(child, ['class', 'style']) + '>' + _mdEscapeHtml(child.textContent || '') + '</div>';
        }
    });

    return '<div' + divAttrs + '>' + childHtml + '</div>';
}

// Rebuild an embedded task-list marker from scratch (only the numeric id
// and the fallback label are kept), so no attacker-controlled markup from
// the markdown source survives.
function _mdSanitizeTaskListEmbedHtml(html) {
    var template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    var container = template.content.firstElementChild;
    var embedNoteId = container ? (container.getAttribute('data-task-embed') || '') : '';
    if (!container || container.tagName !== 'DIV' || !/^\d+$/.test(embedNoteId)) {
        return _mdEscapeHtml(html);
    }
    var link = container.querySelector('a');
    var label = link ? (link.textContent || '') : '';
    return '<div class="tasklist-embed" data-task-embed="' + embedNoteId + '" contenteditable="false">'
        + '<a class="tasklist-embed-link" href="index.php?note=' + embedNoteId + '">' + _mdEscapeHtml(label) + '</a></div>';
}

// Attributes kept on raw <details>/<summary>/<u> tags: only `class`
// (safe token characters) and, for <details>, the boolean `open`. Inline
// event handlers, style, id, ... are dropped before the tag is re-emitted
// into innerHTML.
function _mdSanitizePassthroughTagAttrs(tag, attrs) {
    var safe = '';
    var classMatch = attrs.match(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (classMatch) {
        var cls = (classMatch[1] || classMatch[2] || classMatch[3] || '').replace(/[^\w\s-]/g, '').trim();
        if (cls) safe += ' class="' + _mdEscapeHtml(cls) + '"';
    }
    if (tag === 'details' && /(?:^|\s)open(?=\s|=|\/|$)/i.test(attrs)) {
        safe += ' open';
    }
    return safe;
}

function _mdDecodeHtmlEntities(value) {
    if (!value || value.indexOf('&') === -1) return value || '';
    var namedEntities = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' '
    };

    return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, function (match, entity) {
        var normalized = entity.toLowerCase();
        if (normalized.charAt(0) === '#') {
            var codePoint = normalized.charAt(1) === 'x'
                ? parseInt(normalized.slice(2), 16)
                : parseInt(normalized.slice(1), 10);

            if (Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
                return String.fromCodePoint(codePoint);
            }

            return match;
        }

        return Object.prototype.hasOwnProperty.call(namedEntities, normalized) ? namedEntities[normalized] : match;
    });
}

function _mdGetTagAttribute(attrs, name) {
    var escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp("(?:^|\\s)" + escapedName + "\\s*=\\s*([\"'])(.*?)\\1", 'i');
    var match = attrs.match(re);
    return match ? match[2] : '';
}

function _mdIsAllowedIframeSrc(src) {
    src = (src || '').trim();
    if (!src) return false;

    var lowerSrc = src.toLowerCase();
    var isLocalAudioPlayer = /^(?:\/|\.\/|\.\.\/)?audio_player\.php(?:[?#]|$)/.test(lowerSrc);
    if (isLocalAudioPlayer) return true;

    var allowedDomains = window.ALLOWED_IFRAME_DOMAINS || [];
    try {
        var parsed = new URL(src, window.location.origin);
        var host = parsed.hostname.toLowerCase();
        return allowedDomains.some(function (domain) {
            domain = String(domain).toLowerCase();
            return host === domain || host.endsWith('.' + domain);
        });
    } catch (e) {
        // Unparsable URL: never fall back to a substring match
        return false;
    }
}

/*
 * GitHub-style callout icons, keyed by callout type. Unknown/custom types fall
 * back to the note (info) icon.
 */
var _MD_CALLOUT_ICONS = {
    note: '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
    tip: '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
    important: '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.75v4.5a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-1.5 0ZM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"></path></svg>',
    warning: '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
    caution: '<svg class="callout-icon-svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.75.75 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
};

var _MD_CALLOUT_FOLD_ICON = '<svg class="callout-fold-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.72a.749.749 0 0 1 1.06 0Z"></path></svg>';

function _mdGetCalloutIconSvg(calloutType) {
    return _MD_CALLOUT_ICONS[calloutType] || _MD_CALLOUT_ICONS.note;
}
function _mdIsMermaidCodeBlockLanguage(language) {
    return !!language && language.trim().toLowerCase() === 'mermaid';
}

// Mermaid needs the raw arrows and quotes back: the source reaches this point
// already HTML-escaped, and mermaid parses the text itself.
function _mdUnescapeMermaidSource(codeContent) {
    return String(codeContent)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

/*
 * Renders one fenced code block (mermaid excluded, the caller handles that).
 * `withLanguageAttr` says whether a syntax-highlighted <pre> also carries
 * data-language: the closed-fence path emits it, the unclosed-fence fallback
 * historically does not. That difference is preserved here on purpose.
 */
function _mdRenderFencedCodeBlockHtml(codeContent, codeBlockLang, codeBlockStartLine, withLanguageAttr) {
    var codeLineAttr = ' data-line="' + codeBlockStartLine + '"';

    if (_mdIsPlainFormattingCodeBlockLanguage(codeBlockLang)) {
        var plainCodeBlockLang = _mdEscapeHtml(_mdGetPlainCodeBlockDisplayLanguage(codeBlockLang));
        return '<pre' + codeLineAttr + ' data-language="' + plainCodeBlockLang + '"><code data-language="' + plainCodeBlockLang + '">' + _mdRenderPlainCodeBlockContent(codeContent) + '</code></pre>';
    }

    if (codeBlockLang && _mdIsSyntaxHighlightLanguage(codeBlockLang)) {
        var escapedCodeBlockLang = _mdEscapeHtml(codeBlockLang || '');
        var languageAttr = withLanguageAttr ? ' data-language="' + escapedCodeBlockLang + '"' : '';
        return '<pre' + codeLineAttr + languageAttr + '><code class="language-' + escapedCodeBlockLang + '">' + _mdEscapeHtml(codeContent) + '</code></pre>';
    }

    return '<pre' + codeLineAttr + '><code>' + _mdEscapeHtml(codeContent) + '</code></pre>';
}

/*
 * Builds the <table> markup from the collected rows. `renderCell` renders a
 * cell's inline markdown (parseMarkdown passes its applyInlineStyles closure).
 */
function _mdRenderTableHtml(tableRows, tableAlignments, tableStartLine, renderCell) {
    var tableHtml = '<table data-start-line="' + tableStartLine + '">';

    for (var r = 0; r < tableRows.length; r++) {
        var row = tableRows[r];
        var cellTag = (r === 0 && row.isHeader) ? 'th' : 'td';

        tableHtml += '<tr>';
        for (var c = 0; c < row.cells.length; c++) {
            var alignment = tableAlignments[c];
            var alignAttr = alignment ? ' style="text-align: ' + alignment + ';"' : '';
            tableHtml += '<' + cellTag + alignAttr + '>' + renderCell(row.cells[c]) + '</' + cellTag + '>';
        }
        tableHtml += '</tr>';
    }

    return tableHtml + '</table>';
}

/*
 * Reads a blockquote's first line as a GitHub/Obsidian callout header. Returns
 * null when it is not one, otherwise { type, remainder, customTitle, fold }:
 *   [!TYPE]         any type is accepted; unknown ones fall back to the note look
 *   [!TYPE]+ / -    fold marker ("+" collapsible & open, "-" collapsible &
 *                   collapsed); text after it is the custom title, not the body
 *   Note: ...       bare keyword syntax; trailing text is the body
 */
function _mdParseCalloutHeader(firstLine) {
    var bracketMatch = firstLine.match(/^\s*\[!([A-Za-z][A-Za-z0-9_-]*)\]([+-])?\s*(.*)$/);
    if (bracketMatch) {
        var customTitle = bracketMatch[3] ? bracketMatch[3].trim() : '';
        return {
            type: bracketMatch[1].toLowerCase(),
            remainder: '',
            customTitle: customTitle ? customTitle : null,
            fold: bracketMatch[2] || null
        };
    }

    var calloutMatch = firstLine.match(/^\s*(?:\*\*|__)?(Note|Tip|Important|Warning|Caution)(?:\*\*|__)?(?:[:\s\-]+(.*))?$/i);
    if (calloutMatch) {
        return {
            type: calloutMatch[1].toLowerCase(),
            remainder: calloutMatch[2] ? calloutMatch[2].trim() : '',
            customTitle: null,
            fold: null
        };
    }

    return null;
}

var _MD_TASK_LIST_LINE_REGEX = /^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/;

/*
 * Renders one (possibly nested) markdown list starting at `startIndex`, and
 * returns { items, endIndex }: the <li> markup and the index of the last source
 * line it consumed. It recurses for nested levels.
 *
 * `ctx` is what the list needs from parseMarkdown:
 *   lines                the HTML-escaped source lines being walked
 *   renderInline         renders an item's inline markdown (applyInlineStyles)
 *   getSourceLineOffset  how many source lines have been collapsed into
 *                        placeholders so far. Read through a getter rather than
 *                        copied, because the caller keeps advancing it as it
 *                        walks, and data-line values must stay anchored to the
 *                        original markdown source.
 */
function _mdParseNestedList(startIndex, isTaskList, ctx) {
    let listItems = [];
    let currentIndex = startIndex;
    let baseIndent = null;
    let baseMarkerType = null; // 'bullet' or 'number'

    while (currentIndex < ctx.lines.length) {
        let currentLine = ctx.lines[currentIndex];

        // Skip blank lines within lists - they should not break the list
        if (currentLine.trim() === '' && baseIndent !== null) {
            // Only skip blank lines if we've already started a list
            // Look ahead to see if there's another list item of the same type
            let lookAheadIndex = currentIndex + 1;
            let foundContinuation = false;

            while (lookAheadIndex < ctx.lines.length) {
                let lookAheadLine = ctx.lines[lookAheadIndex];

                // If we hit another blank line, keep looking
                if (lookAheadLine.trim() === '') {
                    lookAheadIndex++;
                    continue;
                }

                // Check if this is a list item that continues our list
                let lookMatch;
                let lookMarkerType = null;

                if (isTaskList) {
                    lookMatch = lookAheadLine.match(_MD_TASK_LIST_LINE_REGEX);
                } else {
                    let lookTaskMatch = lookAheadLine.match(_MD_TASK_LIST_LINE_REGEX);
                    if (lookTaskMatch && baseIndent !== null && lookTaskMatch[1].length === baseIndent) {
                        break;
                    }

                    lookMatch = lookAheadLine.match(/^(\s*)([\*\-\+]|\d+(?:\.\d+)*\.)\s+(.+)$/);
                    if (lookMatch) {
                        let lookMarker = lookMatch[2];
                        lookMarkerType = lookMarker.match(/\d+(?:\.\d+)*\./) ? 'number' : 'bullet';
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
            listMatch = currentLine.match(_MD_TASK_LIST_LINE_REGEX);
        } else {
            let taskLineMatch = currentLine.match(_MD_TASK_LIST_LINE_REGEX);
            if (taskLineMatch && baseIndent !== null && taskLineMatch[1].length <= baseIndent) {
                break;
            }

            listMatch = currentLine.match(/^(\s*)([\*\-\+]|\d+(?:\.\d+)*\.)\s+(.+)$/);
            if (!listMatch) {
                // A bare dotted marker like "2.1." with nothing after it is an
                // empty hierarchical item, not continuation text.
                let bareMatch = currentLine.match(/^(\s*)(\d+(?:\.\d+)+\.)[ \t]*$/);
                if (bareMatch) {
                    listMatch = [bareMatch[0], bareMatch[1], bareMatch[2], ''];
                }
            }
            if (listMatch) {
                marker = listMatch[2];
                markerType = marker.match(/\d+(?:\.\d+)*\./) ? 'number' : 'bullet';
            }
        }

        if (!listMatch) {
            // Wrapped continuation line (issue #1312): a non-blank line with no
            // list marker, indented deeper than the list's base indent, joins the
            // previous item instead of ending the list.
            if (baseIndent !== null && listItems.length > 0 && currentLine.trim() !== '' &&
                !currentLine.match(/^(\s*)([\*\-\+]|\d+(?:\.\d+)*\.)\s+(.+)$/)) {
                let contIndent = currentLine.match(/^\s*/)[0].length;
                if (contIndent > baseIndent) {
                    let lastIdx = listItems.length - 1;
                    listItems[lastIdx] = listItems[lastIdx].replace(/<\/li>$/, '') +
                        ' ' + ctx.renderInline(currentLine.trim()) + '</li>';
                    currentIndex++;
                    continue;
                }
            }
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

            while (tempIndex < ctx.lines.length) {
                let tempLine = ctx.lines[tempIndex];
                let tempMatch = tempLine.match(/^(\s*)([\*\-\+]|\d+(?:\.\d+)*\.)\s+(.+)$/);
                if (!tempMatch) break;

                let tempIndent = tempMatch[1].length;
                let tempMarker = tempMatch[2];
                let tempMarkerType = tempMarker.match(/\d+(?:\.\d+)*\./) ? 'number' : 'bullet';

                // Stop if we're back to the base marker type or different indentation
                if (tempIndent !== 0 || tempMarkerType !== markerType) {
                    break;
                }

                nestedItems.push('<li>' + ctx.renderInline(tempMatch[3]) + '</li>');
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
                let checkbox = '<input type="checkbox" class="markdown-task-checkbox" data-line="' + (currentIndex + ctx.getSourceLineOffset()) + '" ' + (isChecked ? 'checked ' : '') + '>';
                itemHtml = '<li class="task-list-item" data-line="' + (currentIndex + ctx.getSourceLineOffset()) + '">' + checkbox + ' <span>' + ctx.renderInline(content) + '</span>';
            } else {
                itemHtml = '<li data-line="' + (currentIndex + ctx.getSourceLineOffset()) + '">' + ctx.renderInline(content);
            }

            // Check if next items are more indented (nested)
            let nextIndex = currentIndex + 1;
            if (nextIndex < ctx.lines.length) {
                let nextLine = ctx.lines[nextIndex];
                let nextMatch;
                let nextIsTaskList = false;
                if (isTaskList) {
                    nextMatch = nextLine.match(_MD_TASK_LIST_LINE_REGEX);
                } else {
                    nextMatch = nextLine.match(_MD_TASK_LIST_LINE_REGEX);
                    nextIsTaskList = !!nextMatch;
                    if (!nextMatch) {
                        nextMatch = nextLine.match(/^(\s*)([\*\-\+]|\d+(?:\.\d+)*\.)\s+(.+)$/);
                    }
                }

                if (nextMatch && nextMatch[1].length > indent) {
                    // Parse nested list
                    let nestedResult = _mdParseNestedList(nextIndex, isTaskList || nextIsTaskList, ctx);
                    let isOrderedNested = !isTaskList && !nextIsTaskList && nextMatch[2].match(/\d+(?:\.\d+)*\./);
                    let listTag = isOrderedNested ? 'ol' : 'ul';
                    let listClass = (isTaskList || nextIsTaskList) ? ' class="task-list"' : '';
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
            // Deeper-indented item reached at loop top: continuation lines
            // separated it from its parent, so the parent's nested-list
            // lookahead never saw it. Attach it to the last item.
            if (listItems.length === 0) {
                break;
            }
            let nestedIsTask = !isTaskList && !!currentLine.match(_MD_TASK_LIST_LINE_REGEX);
            let nestedResult = _mdParseNestedList(currentIndex, isTaskList || nestedIsTask, ctx);
            let isOrderedNested = !isTaskList && !nestedIsTask && markerType === 'number';
            let listTag = isOrderedNested ? 'ol' : 'ul';
            let listClass = (isTaskList || nestedIsTask) ? ' class="task-list"' : '';
            let lastIdx = listItems.length - 1;
            listItems[lastIdx] = listItems[lastIdx].replace(/<\/li>$/, '') +
                '<' + listTag + listClass + '>' + nestedResult.items.join('') + '</' + listTag + '></li>';
            currentIndex = nestedResult.endIndex + 1;
            continue;
        }

        currentIndex++;
    }

    return {
        items: listItems,
        endIndex: currentIndex - 1
    };
}

function parseMarkdown(text) {
    if (!text) return '';

    var escapeHtml = _mdEscapeHtml;













    // Raw markdown source of every inline placeholder, so contexts that must print
    // the source verbatim (indented code blocks) can restore it instead of leaking
    // the placeholder (PLNK0) or the rendered element.
    let placeholderSources = {};

    function rememberPlaceholderSource(placeholder, source) {
        placeholderSources[placeholder] = source;
        return placeholder;
    }

    // Replaces placeholders in already HTML-escaped text with their escaped source.
    // Sources can themselves contain placeholders (a link whose text has a backslash
    // escape), hence the bounded passes.
    function restorePlaceholderSources(escapedText) {
        var output = String(escapedText || '');
        for (var pass = 0; pass < 5; pass++) {
            var changed = false;
            output = output.replace(/\x00[A-Z]+\d+\x00/g, function (match) {
                if (!Object.prototype.hasOwnProperty.call(placeholderSources, match)) return match;
                changed = true;
                return escapeHtml(placeholderSources[match]);
            });
            if (!changed) break;
        }
        return output;
    }

    // Extract and protect fenced code blocks first so they are not processed by other rules
    let protectedFencedCode = [];
    let fencedCodeIndex = 0;
    // Match: ```lang [newline] content [newline] ```
    // Also match code blocks that are at the very start of the text
    text = text.replace(/(^|\n)([ \t]*```[^\n]*\n[\s\S]*?\n[ \t]*```)(?=\n|$)/g, function (match, prefix, block) {
        let placeholder = '\x00FENCEDCODE' + fencedCodeIndex + '\x00';
        protectedFencedCode[fencedCodeIndex] = block;
        fencedCodeIndex++;
        return prefix + placeholder;
    });

    // Protect inline code spans so their content is not consumed by math regexes
    let protectedRawCode = [];
    let rawCodeIndex = 0;
    text = text.replace(/(?<!\\)`([^`\n]+?)(?<!\\)`/g, function (match, code) {
        let placeholder = '\x00RAWCODE' + rawCodeIndex + '\x00';
        protectedRawCode[rawCodeIndex] = code;
        rawCodeIndex++;
        return rememberPlaceholderSource(placeholder, match);
    });

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
        return rememberPlaceholderSource(placeholder, match);
    });

    let protectedMarkdownEscapes = [];
    let markdownEscapeIndex = 0;

    function protectMarkdownBackslashEscapes(input) {
        return input.replace(/\\([!"#$%&'()*+,\-.\/:;<=>?@\[\\\]\\^_`{|}~])(\1*)/g, function (match, escapedChar, repeatedChars) {
            let placeholder = '\x00MDESC' + markdownEscapeIndex + '\x00';
            protectedMarkdownEscapes[markdownEscapeIndex] = escapeHtml(escapedChar + (repeatedChars || ''));
            markdownEscapeIndex++;
            return rememberPlaceholderSource(placeholder, match);
        });
    }

    function restoreMarkdownBackslashEscapes(input) {
        return input.replace(/\x00MDESC(\d+)\x00/g, function (match, index) {
            return protectedMarkdownEscapes[parseInt(index, 10)] || match;
        });
    }

    text = protectMarkdownBackslashEscapes(text);

    // Extract and protect images and links from HTML escaping
    // We'll use placeholders and restore them later
    let protectedElements = [];
    let protectedIndex = 0;

    let markdownImageIndex = 0;

    // Protect images first ![alt](url "title") with optional {.img-with-border} attributes
    text = text.replace(_mdGetMarkdownImageRegex(), function (match, alt, url, title, attrBlock) {
        let placeholder = '\x00PIMG' + protectedIndex + '\x00';
        let imageAttrs = ' src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '"';
        const borderClass = _mdGetMarkdownImageBorderClass(attrBlock);
        const imageWidth = _mdGetMarkdownImageWidth(attrBlock);

        if (title) {
            imageAttrs += ' title="' + escapeHtml(title) + '"';
        }
        if (borderClass) {
            imageAttrs += ' class="' + borderClass + '"';
        }
        if (imageWidth) {
            imageAttrs += ' width="' + imageWidth + '" style="width: ' + imageWidth + 'px;"';
        }
        imageAttrs += ' loading="lazy" decoding="async" data-markdown-image-index="' + markdownImageIndex + '"';

        let imgTag = '<img' + imageAttrs + '>';
        protectedElements[protectedIndex] = imgTag;
        markdownImageIndex++;
        protectedIndex++;
        return rememberPlaceholderSource(placeholder, match);
    });

    // Protect links [text](url "title")
    text = text.replace(/\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, function (match, linkText, url, title) {
        let placeholder = '\x00PLNK' + protectedIndex + '\x00';
        let linkTag;

        const internalNoteId = _mdTryParseInternalNoteId(url);
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
        return rememberPlaceholderSource(placeholder, match);
    });

    // Protect Poznote-generated Excalidraw containers as safe block HTML.
    var markdownExcalidrawIndex = 0;
    // Maps protectedIndex → { sourceLine, lineCount } for scroll sync data-line correction
    var excalidrawSourceLines = {};
    text = text.replace(/<div\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bexcalidraw-container\b[^"']*\1)[^>]*>[\s\S]*?<\/div>/gi, function (match, _p1, offset) {
        let placeholder = '\x00PEXCALIDRAW' + protectedIndex + '\x00';
        protectedElements[protectedIndex] = _mdSanitizeExcalidrawContainerHtml(match, markdownExcalidrawIndex);
        var sourceLine = (text.slice(0, offset).match(/\n/g) || []).length;
        var matchLineCount = (match.match(/\n/g) || []).length;
        excalidrawSourceLines[protectedIndex] = { sourceLine: sourceLine, lineCount: matchLineCount };
        protectedIndex++;
        markdownExcalidrawIndex++;
        return '\n' + placeholder + '\n';
    });

    // Protect embedded task-list markers as safe block HTML; tasklist-embed.js
    // hydrates them into interactive widgets in the preview
    text = text.replace(/<div\b(?=[^>]*\bdata-task-embed\s*=\s*(["'])\d+\1)[^>]*>[\s\S]*?<\/div>/gi, function (match) {
        let placeholder = '\x00PTASKEMBED' + protectedIndex + '\x00';
        protectedElements[protectedIndex] = _mdSanitizeTaskListEmbedHtml(match);
        protectedIndex++;
        return '\n' + placeholder + '\n';
    });

    // Protect inline span tags with style attributes (for colors, backgrounds, etc.)
    // Match: <span style="...">content</span>
    // Only the opening/closing tags are protected: the inner content is left in the
    // stream so nested markdown (links, bold, ...) still gets parsed. Protecting the
    // whole span would emit already-protected placeholders (PLNK0) as literal text.
    text = text.replace(/<span\s+style="([^"]+)">((?:(?!<\/?span\b)[\s\S])*)<\/span>/gi, function (match, styleAttr, content) {
        let openTag = '<span style="' + styleAttr + '">';
        let openTagSource = match.slice(0, match.indexOf('>') + 1);

        function protect(html, source) {
            let placeholder = '\x00PSPAN' + protectedIndex + '\x00';
            protectedElements[protectedIndex] = html;
            protectedIndex++;
            return rememberPlaceholderSource(placeholder, source);
        }

        // A span whose content spans several markdown blocks must be closed and
        // reopened around each blank line, otherwise the paragraph builder emits
        // the opening and closing tags in different <p> elements and the browser
        // auto-closes the span at the first block boundary.
        let blocks = content.split(/(\r?\n[ \t]*\r?\n)/);
        let result = '';
        blocks.forEach(function (block, i) {
            if (i % 2 === 1) {
                result += block; // the blank-line separator itself
                return;
            }
            if (block === '') {
                return;
            }
            result += protect(openTag, openTagSource) + block + protect('</span>', '</span>');
        });

        return result;
    });


    // Protect details, summary, br, and underline tags
    text = text.replace(/<(details|summary|br|u)(?=[\s\/>])([^>]*)>/gi, function (match, tag, attrs) {
        tag = tag.toLowerCase();
        let placeholder = '\x00PTAG' + protectedIndex + '\x00';
        if (tag === 'br') {
            protectedElements[protectedIndex] = '<br>';
        } else {
            protectedElements[protectedIndex] = '<' + tag + _mdSanitizePassthroughTagAttrs(tag, attrs) + '>';
        }
        protectedIndex++;
        return rememberPlaceholderSource(placeholder, match);
    });
    text = text.replace(/<\/(details|summary|u)>/gi, function (match, tag) {
        let placeholder = '\x00PTAG' + protectedIndex + '\x00';
        protectedElements[protectedIndex] = '</' + tag + '>';
        protectedIndex++;
        return rememberPlaceholderSource(placeholder, match);
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
        return rememberPlaceholderSource(placeholder, match);
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
        return rememberPlaceholderSource(placeholder, match);
    });




    function protectIframeTag(attrs, original) {
        attrs = _mdDecodeHtmlEntities(attrs);
        var src = _mdGetTagAttribute(attrs, 'src');
        if (!_mdIsAllowedIframeSrc(src)) return original;

        var placeholder = '\x00PIFRAME' + protectedIndex + '\x00';
        var safeAttrs = [];
        var allowedAttrs = [
            'src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen',
            'title', 'loading', 'referrerpolicy', 'sandbox', 'style', 'class',
            'scrolling', 'contenteditable', 'data-is-audio', 'data-audio-src',
            'data-converted-from-audio'
        ];
        var attrRegex = /([\w-]+)\s*=\s*["']([^"']*)["']/g;
        var attrMatch;

        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            var attrName = attrMatch[1].toLowerCase();
            var attrValue = attrMatch[2];
            if (allowedAttrs.includes(attrName)) {
                safeAttrs.push(attrName + '="' + escapeHtml(attrValue) + '"');
            }
        }

        if (/allowfullscreen/i.test(attrs) && !safeAttrs.some(function (attr) { return attr.startsWith('allowfullscreen'); })) {
            safeAttrs.push('allowfullscreen');
        }

        protectedElements[protectedIndex] = '<iframe ' + safeAttrs.join(' ') + '></iframe>';
        protectedIndex++;
        return rememberPlaceholderSource(placeholder, original);
    }

    // Protect iframe tags (YouTube, Bilibili, and Poznote audio player embeds).
    text = text.replace(/<iframe\s+([^>]+)>\s*<\/iframe>/gis, function (match, attrs) {
        return protectIframeTag(attrs, match);
    });

    // Some saved/draft Markdown content can contain escaped media HTML.
    // Decode only validated iframe tags; everything else remains escaped below.
    text = text.replace(/&lt;iframe\s+([\s\S]*?)&gt;\s*&lt;\/iframe&gt;/gi, function (match, attrs) {
        return protectIframeTag(attrs, match);
    });

    // Now escape HTML to prevent XSS
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\\(\$)/g, '$1');

    // Restore protected fenced code blocks BEFORE line-by-line processing
    html = html.replace(/\x00FENCEDCODE(\d+)\x00/g, function (match, index) {
        return protectedFencedCode[parseInt(index)] || match;
    });

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
        text = text.replace(/(^|[^A-Za-z0-9_])___(?=\S)([\s\S]*?\S)___(?![A-Za-z0-9_])/g, '$1<strong><em>$2</em></strong>');
        text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/(^|[^A-Za-z0-9_])__(?=\S)([\s\S]*?\S)__(?![A-Za-z0-9_])/g, '$1<strong>$2</strong>');
        text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
        text = text.replace(/(^|[^A-Za-z0-9_])_(?=\S)([\s\S]*?\S)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');

        // Strikethrough
        text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

        // Highlight
        text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');

        // Auto-link plain URLs like GitHub-style markdown behavior
        text = linkifyPlainUrls(text);

        // Support for <br> in markdown preview while keeping the source text clean
        text = text.replace(/&lt;br\s*\/??&gt;/gi, '<br>');

        // Restore protected code elements
        text = text.replace(/\x00CODE(\d+)\x00/g, function (match, index) {
            return protectedCode[parseInt(index)] || match;
        });

        text = text.replace(/\x00RAWCODE(\d+)\x00/g, function (match, index) {
            var code = protectedRawCode[parseInt(index, 10)];
            return (typeof code !== 'undefined') ? '<code>' + escapeHtml(code) + '</code>' : match;
        });

        // Restore protected elements (images, links, spans, tags, iframes, videos, audio, and Excalidraw)
        text = text.replace(/\x00P(IMG|LNK|SPAN|TAG|IFRAME|VIDEO|AUDIO|EXCALIDRAW)(\d+)\x00/g, function (match, type, index) {
            return protectedElements[parseInt(index)] || match;
        });

        text = text.replace(/\x00RAWCODE(\d+)\x00/g, function (match, index) {
            var code = protectedRawCode[parseInt(index, 10)];
            return (typeof code !== 'undefined') ? '<code>' + escapeHtml(code) + '</code>' : match;
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

    // Render the collected lines of a blockquote/callout body: heading and
    // horizontal-rule lines become real <h1>-<h6>/<hr> elements, everything
    // else keeps the historical inline-styles-joined-by-<br> behavior. Blank
    // lines adjacent to those blocks are dropped since the block provides its
    // own spacing.
    function renderQuoteLines(quoteLines) {
        let htmlParts = [];
        let textRun = [];
        let skipBlankAfterBlock = false;
        function flushRun() {
            if (textRun.length) {
                htmlParts.push(textRun.map(l => applyInlineStyles(l)).join('<br>'));
                textRun = [];
            }
        }
        function trimTrailingBlanks() {
            while (textRun.length && textRun[textRun.length - 1].trim() === '') textRun.pop();
        }
        for (let ql of quoteLines) {
            let hm = ql.match(/^(#{1,6})\s+(.+)$/);
            if (hm) {
                trimTrailingBlanks();
                flushRun();
                let level = hm[1].length;
                htmlParts.push('<h' + level + '>' + applyInlineStyles(hm[2]) + '</h' + level + '>');
                skipBlankAfterBlock = true;
            } else if (ql.match(/^\s*(\*{3,}|-{3,}|_{3,})\s*$/)) {
                trimTrailingBlanks();
                flushRun();
                htmlParts.push('<hr>');
                skipBlankAfterBlock = true;
            } else if (skipBlankAfterBlock && ql.trim() === '') {
                continue;
            } else {
                skipBlankAfterBlock = false;
                textRun.push(ql);
            }
        }
        flushRun();
        return htmlParts.join('');
    }

    // Renders a collected blockquote body: a callout when its first line declares
    // one, a plain <blockquote> otherwise.
    function renderBlockquoteHtml(blockquoteLines) {
        let firstLine = blockquoteLines.length > 0 ? blockquoteLines[0].trim() : '';
        let callout = _mdParseCalloutHeader(firstLine);
        if (!callout) {
            return '<blockquote>' + renderQuoteLines(blockquoteLines) + '</blockquote>';
        }

        let bodyLines = callout.remainder ? [callout.remainder] : [];
        for (let bi = 1; bi < blockquoteLines.length; bi++) {
            bodyLines.push(blockquoteLines[bi]);
        }

        let titleHtml = callout.customTitle;
        if (titleHtml === null) {
            let defaultTitle = callout.type.charAt(0).toUpperCase() + callout.type.slice(1);
            titleHtml = (window.t ? window.t('slash_menu.callout_' + callout.type, null, defaultTitle) : defaultTitle);
        }
        let bodyHtml = renderQuoteLines(bodyLines);
        let titleInner = _mdGetCalloutIconSvg(callout.type) +
            '<span class="callout-title-text">' + applyInlineStyles(titleHtml) + '</span>';

        if (callout.fold) {
            return '<details class="callout callout-' + callout.type + '"' + (callout.fold === '+' ? ' open' : '') + '>' +
                '<summary class="callout-title">' + titleInner + _MD_CALLOUT_FOLD_ICON + '</summary>' +
                '<div class="callout-body">' + bodyHtml + '</div>' +
                '</details>';
        }

        return '<aside class="callout callout-' + callout.type + '">' +
            '<div class="callout-title">' + titleInner + '</div>' +
            '<div class="callout-body">' + bodyHtml + '</div>' +
            '</aside>';
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
    // Tracks how many source lines have been collapsed into placeholders so far,
    // so that data-line values reflect positions in the original markdown source.
    let sourceLineOffset = 0;

    // Handed to _mdParseNestedList so list rendering does not need the parser's
    // whole closure. sourceLineOffset is read through a getter: it keeps moving
    // as the loop below walks the source.
    let listContext = {
        lines: lines,
        renderInline: applyInlineStyles,
        getSourceLineOffset: function () { return sourceLineOffset; }
    };

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
                codeBlockStartLine = i + sourceLineOffset;
            } else {
                inCodeBlock = false;
                let codeContent = codeBlockContent.join('\n');
                if (_mdIsMermaidCodeBlockLanguage(codeBlockLang)) {
                    result.push(_mdRenderMermaidBlock(_mdUnescapeMermaidSource(codeContent), codeBlockStartLine));
                } else {
                    result.push(_mdRenderFencedCodeBlockHtml(codeContent, codeBlockLang, codeBlockStartLine, true));
                }
                codeBlockContent = [];
                codeBlockLang = '';
                codeBlockStartLine = -1;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Indented code blocks: lines starting with 4 spaces or a tab
        if (line.match(/^(    |\t)/)) {
            flushParagraph();
            let indentedBlockStartLine = i + sourceLineOffset;
            let indentedLines = [];
            while (i < lines.length && (lines[i].match(/^(    |\t)/) || lines[i].trim() === '')) {
                indentedLines.push(lines[i].replace(/^(    |\t)/, ''));
                i++;
            }
            // Remove trailing blank lines
            while (indentedLines.length > 0 && indentedLines[indentedLines.length - 1].trim() === '') {
                indentedLines.pop();
            }
            i--; // The for loop will increment
            // Lines are already HTML-escaped at this point; only the placeholders
            // still need to be swapped back for their (escaped) markdown source.
            result.push('<pre class="indented-pre" data-line="' + indentedBlockStartLine + '">' + restorePlaceholderSources(indentedLines.join('\n')) + '</pre>');
            continue;
        }

        let excalidrawMatch = line.match(/^\s*\x00PEXCALIDRAW(\d+)\x00\s*$/);
        if (excalidrawMatch) {
            flushParagraph();
            let index = parseInt(excalidrawMatch[1], 10);
            let excalidrawHtml = protectedElements[index] || line;
            let excalidrawInfo = excalidrawSourceLines[index];
            let sourceLine = excalidrawInfo ? excalidrawInfo.sourceLine : (i + sourceLineOffset);
            excalidrawHtml = excalidrawHtml.replace(/^(<div\b)/, '$1 data-line="' + sourceLine + '"');
            result.push(excalidrawHtml);
            // Account for the lines that were collapsed into this placeholder
            if (excalidrawInfo) {
                sourceLineOffset += excalidrawInfo.lineCount;
            }
            continue;
        }

        let taskEmbedMatch = line.match(/^\s*\x00PTASKEMBED(\d+)\x00\s*$/);
        if (taskEmbedMatch) {
            flushParagraph();
            result.push(protectedElements[parseInt(taskEmbedMatch[1], 10)] || line);
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

            // Preserve consecutive blank lines in preview so intentional spacing stays visible.
            let blankLineCount = 1;
            while (i + 1 < lines.length && lines[i + 1].trim() === '') {
                blankLineCount++;
                i++;
            }

            let previousResult = result.length > 0 ? result[result.length - 1] : '';
            let isPreviousCodeBlockElement = /^<pre\b/.test(previousResult) || /^<div class="mermaid"\b/.test(previousResult);
            let isPreviousTaskEmbed = /^<div class="tasklist-embed"/.test(previousResult);
            let isNextTaskEmbed = (i + 1 < lines.length) && /^\s*\x00PTASKEMBED\d+\x00\s*$/.test(lines[i + 1]);

            // Avoid adding a full blank placeholder right before block elements,
            // because those already contribute their own top spacing.
            let nextNonEmptyIndex = i + 1;
            let isNextBlockElement = false;
            if (nextNonEmptyIndex < lines.length) {
                let nextLine = lines[nextNonEmptyIndex];
                isNextBlockElement = (
                    /^\s*```/.test(nextLine) ||                      // Code block fence
                    /^(    |\t)/.test(nextLine) ||                   // Indented code block
                    /^\s*\x00PEXCALIDRAW\d+\x00\s*$/.test(nextLine) || // Excalidraw block placeholder
                    /^\s*\x00PTASKEMBED\d+\x00\s*$/.test(nextLine) || // Task-list embed placeholder
                    /\x00MATHBLOCK\d+\x00/.test(nextLine) ||        // Math block placeholder
                    /^\x00PTAG\d+\x00/.test(nextLine) ||            // Protected HTML tags
                    /^#{1,6}\s+/.test(nextLine) ||                   // Headers
                    /^(\*{3,}|-{3,}|_{3,})$/.test(nextLine.trim()) || // Horizontal rules
                    /^(&gt;|>)\s/.test(nextLine) ||                  // Blockquotes
                    /^\s*[\*\-\+]\s+\[([ xX])\]\s+/.test(nextLine) || // Task lists
                    /^\s*[\*\-\+]\s+/.test(nextLine) ||          // Unordered lists
                    /^\s*\d+(?:\.\d+)*\.\s+/.test(nextLine) ||    // Ordered lists
                    isMarkdownTableStart(nextLine, lines[nextNonEmptyIndex + 1] || '') // Tables
                );
            }

            // Block elements already contribute their own spacing; regular text keeps
            // authored blank lines visible unless the previous block was a code block.
            let placeholdersToAdd = (isNextBlockElement || isPreviousCodeBlockElement) ? Math.max(blankLineCount - 1, 0) : blankLineCount;
            // The task-embed protection adds a synthetic newline on each side
            // of the marker; swallow it plus the single authored blank line so
            // the widget sits flush against the surrounding text (no spacer
            // above or below the widget)
            if (isNextTaskEmbed) {
                placeholdersToAdd = Math.max(blankLineCount - 2, 0);
            }
            if (isPreviousTaskEmbed) {
                placeholdersToAdd = Math.max(placeholdersToAdd - 2, 0);
            }
            for (let bl = 0; bl < placeholdersToAdd; bl++) {
                result.push('<p class="blank-line">&nbsp;</p>');
            }
            continue;
        }

        // Headers (h1-h6)
        var headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            var level = headingMatch[1].length;
            var content = headingMatch[2];
            result.push('<h' + level + ' data-line="' + (i + sourceLineOffset) + '">' + applyInlineStyles(content) + '</h' + level + '>');
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

            result.push(renderBlockquoteHtml(blockquoteLines));
            continue;
        }

        // Task lists (checkboxes) - must be checked before unordered lists
        if (line.match(_MD_TASK_LIST_LINE_REGEX)) {
            flushParagraph();
            let listResult = _mdParseNestedList(i, true, listContext);
            result.push('<ul class="task-list">' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }

        // Unordered lists
        if (line.match(/^\s*[\*\-\+]\s+(.+)$/)) {
            flushParagraph();
            let listResult = _mdParseNestedList(i, false, listContext);
            result.push('<ul>' + listResult.items.join('') + '</ul>');
            i = listResult.endIndex;
            continue;
        }

        // Ordered lists
        if (line.match(/^\s*\d+(?:\.\d+)*\.\s+(.+)$/)) {
            flushParagraph();
            let listResult = _mdParseNestedList(i, false, listContext);
            result.push('<ol>' + listResult.items.join('') + '</ol>');
            i = listResult.endIndex;
            continue;
        }

        // Tables - require a header separator row so plain pipe-delimited text stays editable as text.
        if (isMarkdownTableStart(line, lines[i + 1] || '')) {
            flushParagraph();

            let tableStartLine = i + sourceLineOffset;
            let tableRows = [];
            let tableAlignments = [];
            let isFirstRow = true;

            // Collect all consecutive table rows
            while (i < lines.length && isMarkdownTableRowLine(lines[i])) {
                let currentLine = lines[i].trim();

                // Check if this is a header separator line (|---|---|)
                if (isMarkdownTableSeparatorLine(currentLine)) {
                    tableAlignments = getMarkdownTableCells(currentLine)
                        .map(function (cell) {
                            let marker = cell.trim();
                            let alignLeft = marker.startsWith(':');
                            let alignRight = marker.endsWith(':');
                            if (alignLeft && alignRight) return 'center';
                            if (alignRight) return 'right';
                            if (alignLeft) return 'left';
                            return '';
                        });
                    i++;
                    continue;
                }

                let logicalRow = currentLine;
                while (!/\|\s*$/.test(logicalRow) && i + 1 < lines.length) {
                    let nextLine = lines[i + 1].trim();
                    if (nextLine === '' || isMarkdownTableRowLine(nextLine)) {
                        break;
                    }

                    i++;
                    logicalRow += '\n' + nextLine;
                }

                // Parse table cells
                let cells = getMarkdownTableCells(logicalRow);

                tableRows.push({
                    cells: cells,
                    isHeader: isFirstRow
                });

                if (isFirstRow) {
                    isFirstRow = false;
                }

                i++;
            }
            i--; // Adjust because the for loop will increment

            if (tableRows.length > 0) {
                result.push(_mdRenderTableHtml(tableRows, tableAlignments, tableStartLine, applyInlineStyles));
            }
            continue;
        }

        // Regular text - add to current paragraph
        if (paragraphStartLine === -1) {
            paragraphStartLine = i + sourceLineOffset;
        }
        currentParagraph.push(line);
    }

    // Flush any remaining paragraph
    flushParagraph();

    // Handle unclosed code block. Note it passes withLanguageAttr=false: an
    // unclosed highlighted fence has never carried data-language on its <pre>,
    // unlike the closed-fence path above.
    if (inCodeBlock && codeBlockContent.length > 0) {
        result.push(_mdRenderFencedCodeBlockHtml(codeBlockContent.join('\n'), codeBlockLang, codeBlockStartLine, false));
    }

    return restoreMarkdownBackslashEscapes(result.join('\n'));
}

/**
 * Render markdown content into a preview div, with optional post-processing
 * (Mermaid, math, syntax highlighting, interactivity).
 */

// Public API of this file.
window.parseMarkdown = parseMarkdown;

// Shared with markdown-view-modes.js. Listed explicitly so the cross-file
// surface of this module is visible here, and so renaming one of them fails
// the lint rather than silently breaking a caller in another file.
window.initMermaid = initMermaid;

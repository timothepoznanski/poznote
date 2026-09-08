// Markdown source-text helpers for Poznote.
//
// Pure string surgery on the markdown source: HTML escaping, reading and
// rewriting image attributes ({.img-with-border}, {width=...}), mutating and
// deleting embedded Excalidraw blocks, and the mermaid/Excalidraw block markers.
// Nothing here touches the DOM or the editor; the parser and the note actions
// both build on it.

// Shared utility: escape HTML special characters
function _mdEscapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _mdEscapeHtmlAttribute(str) {
    return _mdEscapeHtml(str).replace(/\r\n|\r|\n/g, '&#10;');
}

function _mdGetMarkdownImageRegex() {
    return /!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)(?:\{((?=[^}]*(?:\.img-with-border(?:-no-padding)?(?=\s|})|\bwidth\s*=))[^}]*)\})?/g;
}

function _mdNormalizeMarkdownImageBorderClass(borderClass) {
    return ['img-with-border', 'img-with-border-no-padding'].indexOf(borderClass) !== -1 ? borderClass : '';
}

function _mdGetMarkdownImageBorderClass(attrBlock) {
    var attrs = String(attrBlock || '');
    if (/(^|\s)\.img-with-border-no-padding(?=\s|$)/.test(attrs)) {
        return 'img-with-border-no-padding';
    }
    if (/(^|\s)\.img-with-border(?=\s|$)/.test(attrs)) {
        return 'img-with-border';
    }
    return '';
}

function _mdNormalizeMarkdownImageWidth(width) {
    var parsedWidth = parseInt(String(width || '').replace(/px$/i, ''), 10);
    return isFinite(parsedWidth) && parsedWidth > 0 ? Math.round(parsedWidth) : null;
}

function _mdGetMarkdownImageWidth(attrBlock) {
    var attrs = String(attrBlock || '');
    var match = attrs.match(/(?:^|\s)width\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
    if (!match) {
        return null;
    }

    return _mdNormalizeMarkdownImageWidth(match[1] || match[2] || match[3]);
}

function _mdGetMarkdownImageParts(markdownImage) {
    var match = String(markdownImage || '').match(/^([\s\S]*?\))(?:\{([^}]*)\})?$/);
    if (!match) {
        return null;
    }

    return {
        baseImage: match[1],
        attrBlock: match[2] || ''
    };
}

function _mdGetPassthroughMarkdownImageAttrTokens(attrBlock) {
    var attrs = String(attrBlock || '')
        .replace(/(?:^|\s)\.img-with-border(?:-no-padding)?(?=\s|$)/g, ' ')
        .replace(/(?:^|\s)width\s*=\s*(?:"[^"]+"|'[^']+'|[^\s]+)/ig, ' ')
        .trim();

    return attrs ? attrs.split(/\s+/) : [];
}

function _mdBuildMarkdownImageWithAttrs(markdownImage, borderClass, width) {
    var parts = _mdGetMarkdownImageParts(markdownImage);
    if (!parts) {
        return markdownImage;
    }

    var attrTokens = _mdGetPassthroughMarkdownImageAttrTokens(parts.attrBlock);
    var normalizedBorderClass = _mdNormalizeMarkdownImageBorderClass(borderClass);
    var normalizedWidth = _mdNormalizeMarkdownImageWidth(width);

    if (normalizedBorderClass) {
        attrTokens.push('.' + normalizedBorderClass);
    }
    if (normalizedWidth) {
        attrTokens.push('width=' + normalizedWidth);
    }

    return attrTokens.length ? parts.baseImage + '{' + attrTokens.join(' ') + '}' : parts.baseImage;
}

function _mdSetMarkdownImageBorderClass(markdownImage, borderClass) {
    var parts = _mdGetMarkdownImageParts(markdownImage);
    if (!parts) {
        return markdownImage;
    }

    return _mdBuildMarkdownImageWithAttrs(markdownImage, borderClass, _mdGetMarkdownImageWidth(parts.attrBlock));
}

function _mdSetMarkdownImageWidth(markdownImage, width) {
    var parts = _mdGetMarkdownImageParts(markdownImage);
    if (!parts) {
        return markdownImage;
    }

    return _mdBuildMarkdownImageWithAttrs(markdownImage, _mdGetMarkdownImageBorderClass(parts.attrBlock), width);
}

function _mdGetIgnoredMarkdownImageRanges(content) {
    var ranges = [];
    var rawContent = String(content || '');
    var fencedRegex = /(?:^|\n)(\s*```[^\n]*\n[\s\S]*?\n\s*```)(?=\n|$)/g;
    var inlineCodeRegex = /(?<!\\)`([^`\n]+?)(?<!\\)`/g;
    var match;

    while ((match = fencedRegex.exec(rawContent)) !== null) {
        ranges.push({ start: match.index, end: fencedRegex.lastIndex });
    }

    while ((match = inlineCodeRegex.exec(rawContent)) !== null) {
        ranges.push({ start: match.index, end: inlineCodeRegex.lastIndex });
    }

    return ranges;
}

function _mdIsOffsetInRanges(offset, ranges) {
    for (var i = 0; i < ranges.length; i++) {
        if (offset >= ranges[i].start && offset < ranges[i].end) {
            return true;
        }
    }
    return false;
}

function _mdIsEscapedMarkdownImage(content, offset) {
    var slashCount = 0;
    for (var i = offset - 1; i >= 0 && content.charAt(i) === '\\'; i--) {
        slashCount++;
    }
    return slashCount % 2 === 1;
}

function _mdUpdateMarkdownImageBorderAtIndex(content, targetImageIndex, borderClass) {
    var rawContent = String(content || '');
    var imageRegex = _mdGetMarkdownImageRegex();
    var ignoredRanges = _mdGetIgnoredMarkdownImageRanges(rawContent);
    var renderedImageIndex = 0;
    var match;

    while ((match = imageRegex.exec(rawContent)) !== null) {
        if (_mdIsOffsetInRanges(match.index, ignoredRanges) || _mdIsEscapedMarkdownImage(rawContent, match.index)) {
            continue;
        }

        if (renderedImageIndex === targetImageIndex) {
            var updatedImage = _mdSetMarkdownImageBorderClass(match[0], borderClass);
            return rawContent.slice(0, match.index) + updatedImage + rawContent.slice(imageRegex.lastIndex);
        }

        renderedImageIndex++;
    }

    return null;
}

function _mdUpdateMarkdownImageWidthAtIndex(content, targetImageIndex, width) {
    var rawContent = String(content || '');
    var imageRegex = _mdGetMarkdownImageRegex();
    var ignoredRanges = _mdGetIgnoredMarkdownImageRanges(rawContent);
    var renderedImageIndex = 0;
    var match;

    while ((match = imageRegex.exec(rawContent)) !== null) {
        if (_mdIsOffsetInRanges(match.index, ignoredRanges) || _mdIsEscapedMarkdownImage(rawContent, match.index)) {
            continue;
        }

        if (renderedImageIndex === targetImageIndex) {
            var updatedImage = _mdSetMarkdownImageWidth(match[0], width);
            return rawContent.slice(0, match.index) + updatedImage + rawContent.slice(imageRegex.lastIndex);
        }

        renderedImageIndex++;
    }

    return null;
}

function _mdRemoveMarkdownImageMatch(rawContent, start, end) {
    var lineStart = rawContent.lastIndexOf('\n', start - 1) + 1;
    var nextLineBreak = rawContent.indexOf('\n', end);
    var lineEnd = nextLineBreak === -1 ? rawContent.length : nextLineBreak;
    var beforeOnLine = rawContent.slice(lineStart, start);
    var afterOnLine = rawContent.slice(end, lineEnd);

    if (/^[\t ]*$/.test(beforeOnLine) && /^[\t ]*$/.test(afterOnLine)) {
        if (nextLineBreak !== -1) {
            return rawContent.slice(0, lineStart) + rawContent.slice(nextLineBreak + 1);
        }
        if (lineStart > 0) {
            return rawContent.slice(0, lineStart - 1);
        }
        return '';
    }

    return rawContent.slice(0, start) + rawContent.slice(end);
}

function _mdDeleteMarkdownImageAtIndex(content, targetImageIndex) {
    var rawContent = String(content || '');
    var imageRegex = _mdGetMarkdownImageRegex();
    var ignoredRanges = _mdGetIgnoredMarkdownImageRanges(rawContent);
    var renderedImageIndex = 0;
    var match;

    while ((match = imageRegex.exec(rawContent)) !== null) {
        if (_mdIsOffsetInRanges(match.index, ignoredRanges) || _mdIsEscapedMarkdownImage(rawContent, match.index)) {
            continue;
        }

        if (renderedImageIndex === targetImageIndex) {
            return _mdRemoveMarkdownImageMatch(rawContent, match.index, imageRegex.lastIndex);
        }

        renderedImageIndex++;
    }

    return null;
}

function _mdSetExcalidrawImageBorderClass(imageElement, borderClass) {
    if (!imageElement) {
        return;
    }

    var normalizedBorderClass = _mdNormalizeMarkdownImageBorderClass(borderClass);
    var classNames = (imageElement.getAttribute('class') || '')
        .split(/\s+/)
        .filter(function (className, index, allClassNames) {
            return !!className &&
                className !== 'img-with-border' &&
                className !== 'img-with-border-no-padding' &&
                allClassNames.indexOf(className) === index;
        });

    if (normalizedBorderClass) {
        classNames.push(normalizedBorderClass);
    }

    if (classNames.length > 0) {
        imageElement.setAttribute('class', classNames.join(' '));
    } else {
        imageElement.removeAttribute('class');
    }
}

function _mdSetExcalidrawImageWidth(imageElement, width) {
    var normalizedWidth = _mdNormalizeMarkdownImageWidth(width);
    if (!imageElement || !normalizedWidth) {
        return;
    }

    imageElement.setAttribute('width', String(normalizedWidth));
    imageElement.removeAttribute('height');
    imageElement.style.width = normalizedWidth + 'px';
    imageElement.style.maxWidth = '100%';
    imageElement.style.height = 'auto';
}

function _mdMutateExcalidrawBlockHtml(blockHtml, mutator) {
    var template = document.createElement('template');
    template.innerHTML = String(blockHtml || '').trim();
    var container = template.content.firstElementChild;
    if (!container || container.tagName !== 'DIV' || !container.classList.contains('excalidraw-container')) {
        return blockHtml;
    }

    var imageElement = container.querySelector('img');
    if (!imageElement) {
        return blockHtml;
    }

    if (typeof mutator === 'function') {
        mutator(container, imageElement);
    }

    container.removeAttribute('data-markdown-excalidraw-index');
    Array.prototype.forEach.call(container.querySelectorAll('[data-markdown-excalidraw-index]'), function (node) {
        node.removeAttribute('data-markdown-excalidraw-index');
    });

    return container.outerHTML;
}

function _mdUpdateExcalidrawBlockAtIndex(content, targetBlockIndex, mutator) {
    var rawContent = String(content || '');
    var excalidrawRegex = _mdGetExcalidrawBlockRegex();
    var ignoredRanges = _mdGetIgnoredMarkdownImageRanges(rawContent);
    var renderedBlockIndex = 0;
    var match;

    while ((match = excalidrawRegex.exec(rawContent)) !== null) {
        if (_mdIsOffsetInRanges(match.index, ignoredRanges)) {
            continue;
        }

        if (renderedBlockIndex === targetBlockIndex) {
            var updatedBlock = _mdMutateExcalidrawBlockHtml(match[0], mutator);
            return rawContent.slice(0, match.index) + updatedBlock + rawContent.slice(excalidrawRegex.lastIndex);
        }

        renderedBlockIndex++;
    }

    return null;
}

function _mdUpdateExcalidrawImageBorderAtIndex(content, targetBlockIndex, borderClass) {
    return _mdUpdateExcalidrawBlockAtIndex(content, targetBlockIndex, function (container, imageElement) {
        _mdSetExcalidrawImageBorderClass(imageElement, borderClass);
    });
}

function _mdUpdateExcalidrawImageWidthAtIndex(content, targetBlockIndex, width) {
    var normalizedWidth = _mdNormalizeMarkdownImageWidth(width);
    if (!normalizedWidth) {
        return null;
    }

    return _mdUpdateExcalidrawBlockAtIndex(content, targetBlockIndex, function (container, imageElement) {
        _mdSetExcalidrawImageWidth(imageElement, normalizedWidth);
    });
}

function _mdDeleteExcalidrawBlockAtIndex(content, targetBlockIndex) {
    var rawContent = String(content || '');
    var excalidrawRegex = _mdGetExcalidrawBlockRegex();
    var ignoredRanges = _mdGetIgnoredMarkdownImageRanges(rawContent);
    var renderedBlockIndex = 0;
    var match;

    while ((match = excalidrawRegex.exec(rawContent)) !== null) {
        if (_mdIsOffsetInRanges(match.index, ignoredRanges)) {
            continue;
        }

        if (renderedBlockIndex === targetBlockIndex) {
            return _mdRemoveMarkdownImageMatch(rawContent, match.index, excalidrawRegex.lastIndex);
        }

        renderedBlockIndex++;
    }

    return null;
}

function _mdNormalizeMermaidSourceForRendering(source) {
    return String(source || '')
        .replace(/\\n/g, '<br/>')
        .replace(/<br\s*\/?>/gi, '<br/>');
}

function _mdRenderMermaidBlock(source, lineNumber) {
    var mermaidSource = String(source || '').trim();
    var escapedSource = _mdEscapeHtml(mermaidSource);
    var lineAttr = (typeof lineNumber === 'number') ? ' data-line="' + lineNumber + '"' : '';
    return '<div class="mermaid"' + lineAttr + ' data-mermaid-source="' + _mdEscapeHtmlAttribute(mermaidSource) + '">' + escapedSource + '</div>';
}

function _mdGetExcalidrawBlockRegex() {
    return /<div\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bexcalidraw-container\b[^"']*\1)[^>]*>[\s\S]*?<\/div>/gi;
}

function _mdIsExcalidrawEditorPlaceholder(node) {
    return !!(node && node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('markdown-excalidraw-placeholder'));
}

function _mdGetExcalidrawEditorPlaceholderSource(node) {
    if (!_mdIsExcalidrawEditorPlaceholder(node)) {
        return '';
    }
    return node.getAttribute('data-markdown-source') || node.textContent || '';
}

function _mdBuildExcalidrawEditorSummary(rawHtml) {
    var diagramIdMatch = String(rawHtml || '').match(/\bdata-diagram-id=(['"])(.*?)\1/i);
    var diagramId = diagramIdMatch && diagramIdMatch[2] ? (' #' + diagramIdMatch[2]) : '';
    return 'Excalidraw' + diagramId + ' ...';
}

function _mdCreateExcalidrawEditorPlaceholder(rawHtml) {
    var placeholder = document.createElement('span');
    placeholder.className = 'markdown-excalidraw-placeholder';
    placeholder.contentEditable = 'false';
    placeholder.setAttribute('spellcheck', 'false');
    placeholder.setAttribute('data-markdown-source', rawHtml);
    placeholder.setAttribute('data-summary', _mdBuildExcalidrawEditorSummary(rawHtml));
    return placeholder;
}

// Pipe-table recognition on the raw source. Shared by the parser (which turns
// tables into HTML) and by markdown-lists-tables.js (which reformats them as
// you type), so it lives here rather than in either of them.
function isMarkdownTableRowLine(line) {
    return getMarkdownTableCells(line).length > 0;
}

function isMarkdownTableSeparatorLine(line) {
    var trimmed = String(line || '').trim();
    if (!trimmed || trimmed.indexOf('|') === -1) {
        return false;
    }

    var cells = getMarkdownTableCells(trimmed);
    return cells.length > 0 && cells.every(function (cell) {
        return /^:?-+:?$/.test(cell.trim());
    });
}

function getMarkdownTableCells(line) {
    var trimmed = String(line || '').trim();
    if (!trimmed || trimmed.indexOf('|') === -1) {
        return [];
    }

    if (trimmed.charAt(0) === '|') {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.charAt(trimmed.length - 1) === '|') {
        trimmed = trimmed.slice(0, -1);
    }

    return trimmed
        .split('|')
        .map(function (cell) {
            return cell.trim();
        });
}

function isMarkdownTableStart(line, nextLine) {
    if (!isMarkdownTableRowLine(line) || isMarkdownTableSeparatorLine(line) || !isMarkdownTableSeparatorLine(nextLine)) {
        return false;
    }

    return getMarkdownTableCells(line).length === getMarkdownTableCells(nextLine).length;
}

// Shared with markdown-parser.js, markdown-editor.js and markdown-actions.js.
// Listed explicitly so the cross-file surface of this module is visible here,
// and so renaming one of them fails the lint rather than silently breaking a
// caller in another file.
window._mdRenderMermaidBlock = _mdRenderMermaidBlock;
window._mdNormalizeMermaidSourceForRendering = _mdNormalizeMermaidSourceForRendering;
window.isMarkdownTableStart = isMarkdownTableStart;
window._mdUpdateMarkdownImageBorderAtIndex = _mdUpdateMarkdownImageBorderAtIndex;
window._mdUpdateMarkdownImageWidthAtIndex = _mdUpdateMarkdownImageWidthAtIndex;
window._mdDeleteMarkdownImageAtIndex = _mdDeleteMarkdownImageAtIndex;
window._mdUpdateExcalidrawImageBorderAtIndex = _mdUpdateExcalidrawImageBorderAtIndex;
window._mdUpdateExcalidrawImageWidthAtIndex = _mdUpdateExcalidrawImageWidthAtIndex;
window._mdDeleteExcalidrawBlockAtIndex = _mdDeleteExcalidrawBlockAtIndex;
window._mdGetExcalidrawEditorPlaceholderSource = _mdGetExcalidrawEditorPlaceholderSource;
window._mdCreateExcalidrawEditorPlaceholder = _mdCreateExcalidrawEditorPlaceholder;

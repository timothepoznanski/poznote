// Keeps the reader's place when a markdown note switches view mode (#1409).
//
// The editor and the preview share one coordinate: parseMarkdown() stamps
// block elements with the source line they came from (data-line, or
// data-start-line on tables). Before a switch, the spot the reader is looking
// at is turned into a source position (a line number plus the fraction of the
// line or block above it) together with its height on screen. After the
// switch, the same source position is scrolled back to that height on the
// other side and a short marker points at it.
//
// The spot is the caret when it is on screen, otherwise the top of the visible
// area. Going to the editor, a text selection made in the preview is selected
// in the source when it can be found there, and a caret left off screen moves
// to the anchored line so typing does not jump back to it.
//
// The previous code scrolled both sides by the same ratio, which drifted as
// soon as images, diagrams or code blocks made one side taller than the other.
// Those also change height after the switch (lazy images, mermaid and math
// render late), so the alignment is re-applied for a short while and dropped
// as soon as the user scrolls, clicks or types.
//
// Only the CodeMirror editor is supported. Its contenteditable fallback, used
// when CodeMirror fails to load, returns no position and the callers keep
// their ratio-based scrolling.

var _MD_POSITION_HOLD_MS = 1600;
var _MD_POSITION_RETRY_DELAYS = [0, 60, 150, 300, 600, 1000, 1500];
var _MD_POSITION_MARKER_MS = 1400;

function _mdPositionIsTouchLayout() {
    try {
        return !!(window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    } catch (e) {
        return false;
    }
}

function _mdPositionCodeMirrorApi(editorDiv) {
    if (!isCodeMirrorMarkdownEditor(editorDiv)) return null;
    var api = getMarkdownCodeMirrorApi();
    if (!api || typeof api.getCoordsAtPos !== 'function' || typeof api.getPosAtCoords !== 'function') {
        return null;
    }
    return api;
}

function _mdPositionPreviewScroller(previewDiv) {
    if (isElementVerticallyScrollable(previewDiv)) return previewDiv;
    return document.getElementById('right_col') || previewDiv;
}

// The part of a scroll container the reader actually sees: the note toolbar
// is sticky at the top of #right_col and covers the content scrolling under it.
function _mdPositionVisibleBand(scroller, noteEntry) {
    var rect = scroller.getBoundingClientRect();
    var top = Math.max(rect.top, 0);
    var bottom = Math.min(rect.bottom, window.innerHeight || rect.bottom);

    if (scroller.id === 'right_col' && noteEntry) {
        var card = noteEntry.closest('.notecard') || noteEntry.parentNode;
        var header = card ? card.querySelector('.note-header') : null;
        if (header) {
            var headerRect = header.getBoundingClientRect();
            if (headerRect.bottom > top && headerRect.top <= top + 1) {
                top = headerRect.bottom;
            }
        }
    }

    return { top: top, bottom: Math.max(top, bottom) };
}

function _mdPositionLineStarts(editorDiv) {
    var content = normalizeContentEditableText(editorDiv);
    return { content: content, starts: getMarkdownLineStartOffsets(content) };
}

function _mdPositionLineLength(source, line) {
    var starts = source.starts;
    var end = line + 1 < starts.length ? starts[line + 1] - 1 : source.content.length;
    return Math.max(0, end - starts[line]);
}

// Character offset -> fractional source line, and back.
function _mdPositionFromOffset(source, offset) {
    var line = getMarkdownLineIndexForOffset(source.starts, offset);
    var length = _mdPositionLineLength(source, line);
    var fraction = length > 0 ? Math.min(0.999, (offset - source.starts[line]) / length) : 0;
    return line + Math.max(0, fraction);
}

function _mdPositionToOffset(source, position) {
    var line = Math.max(0, Math.min(Math.floor(position), source.starts.length - 1));
    var fraction = Math.max(0, Math.min(1, position - line));
    return source.starts[line] + Math.round(fraction * _mdPositionLineLength(source, line));
}

// The preview's anchors in document order, each with the source lines it
// covers and the part of the screen it covers. A block whose next anchor sits
// inside it (a list item holding a sub-list) only owns the part above that
// anchor. Blank lines before the next block are not part of this one.
function _mdPositionPreviewAnchors(previewDiv, source) {
    var nodes = previewDiv.querySelectorAll('[data-line], table[data-start-line]');
    var anchors = [];

    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.classList.contains('markdown-task-checkbox')) continue;
        var line = getMarkdownPreviewAnchorLine(node);
        if (line === null) continue;
        var rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        anchors.push({ line: line, top: rect.top, bottom: rect.bottom });
    }

    var lines = source.content.split('\n');
    for (var j = 0; j < anchors.length; j++) {
        var anchor = anchors[j];
        var endLine = lines.length;
        for (var k = j + 1; k < anchors.length; k++) {
            if (anchors[k].line > anchor.line) {
                endLine = anchors[k].line;
                break;
            }
        }
        while (endLine - 1 > anchor.line && lines[endLine - 1] !== undefined && lines[endLine - 1].trim() === '') {
            endLine--;
        }
        anchor.endLine = Math.max(anchor.line + 1, endLine);

        var next = anchors[j + 1];
        anchor.segmentBottom = (next && next.top > anchor.top && next.top < anchor.bottom) ? next.top : anchor.bottom;
    }

    return anchors;
}

function _mdPositionPreviewY(anchors, position) {
    var best = null;
    for (var i = 0; i < anchors.length; i++) {
        if (anchors[i].line <= position && (!best || anchors[i].line >= best.line)) {
            best = anchors[i];
        }
    }
    if (!best) {
        return anchors.length ? anchors[0].top : null;
    }

    var span = best.endLine - best.line;
    var fraction = Math.max(0, Math.min(1, (position - best.line) / span));
    return best.top + fraction * (best.segmentBottom - best.top);
}

function _mdPositionAtPreviewY(anchors, y) {
    var best = null;
    for (var i = 0; i < anchors.length; i++) {
        var anchor = anchors[i];
        if (anchor.top <= y && y < anchor.segmentBottom && (!best || anchor.top >= best.top)) {
            best = anchor;
        }
    }

    if (best) {
        var height = best.segmentBottom - best.top;
        var fraction = height > 0 ? (y - best.top) / height : 0;
        return { position: best.line + fraction * (best.endLine - best.line), y: y };
    }

    // In a gap between blocks: anchor on the next block down.
    for (var j = 0; j < anchors.length; j++) {
        if (anchors[j].top > y) {
            return { position: anchors[j].line, y: anchors[j].top };
        }
    }
    return null;
}

function _mdPositionEditorContentLeft(editorDiv) {
    var content = editorDiv.querySelector('.cm-content') || editorDiv;
    var rect = content.getBoundingClientRect();
    var paddingLeft = parseFloat(window.getComputedStyle(content).paddingLeft) || 0;
    return rect.left + paddingLeft + 2;
}

// Switching back and forth without scrolling must be a no-op. Re-reading the
// top of the view does not give that: a tall image is a single source line, so
// the fraction read back differs and each switch moves the view further. The
// position last put on screen is kept with the scroll and caret it left, and
// reused as long as neither has changed.
function _mdPositionCaretKey(editorDiv) {
    var selection = getSelectionOffsetsInTextElement(editorDiv);
    return selection ? selection.start + ':' + selection.end : '';
}

function _mdPositionRemember(noteEntry, side, position, y, scroller, editorDiv) {
    noteEntry._mdPositionLast = {
        side: side,
        split: noteEntry.classList.contains('markdown-split-mode'),
        position: position.position,
        y: y,
        scroller: scroller,
        scrollTop: scroller.scrollTop,
        caret: _mdPositionCaretKey(editorDiv)
    };
}

function _mdPositionRecall(noteEntry, side, scroller, editorDiv) {
    var last = noteEntry._mdPositionLast;
    if (!last || last.side !== side || last.scroller !== scroller
        || last.split !== noteEntry.classList.contains('markdown-split-mode')
        || Math.abs(scroller.scrollTop - last.scrollTop) > 1
        || last.caret !== _mdPositionCaretKey(editorDiv)) {
        return null;
    }
    return { position: last.position, y: last.y, keepCaret: true };
}

/**
 * Where the reader is in the editor, before it is hidden or resized.
 * Returns null when the editor is not on screen or not CodeMirror.
 */
function captureMarkdownEditorPosition(noteEntry) {
    var editorDiv = noteEntry && noteEntry.querySelector('.markdown-editor');
    if (!editorDiv || !isMarkdownEditorDisplayed(noteEntry, editorDiv)) return null;
    var api = _mdPositionCodeMirrorApi(editorDiv);
    if (!api) return null;

    var scroller = getMarkdownEditorScrollContainer(editorDiv);
    if (!scroller) return null;
    var recalled = _mdPositionRecall(noteEntry, 'editor', scroller, editorDiv);
    if (recalled) return recalled;
    var band = _mdPositionVisibleBand(scroller, noteEntry);
    var source = _mdPositionLineStarts(editorDiv);

    var selection = getSelectionOffsetsInTextElement(editorDiv);
    if (selection) {
        var caretRect = api.getCoordsAtPos(editorDiv, selection.end, 1);
        if (caretRect && caretRect.top >= band.top && caretRect.bottom <= band.bottom) {
            return { position: _mdPositionFromOffset(source, selection.end), y: caretRect.top, keepCaret: true };
        }
    }

    var offset = api.getPosAtCoords(editorDiv, _mdPositionEditorContentLeft(editorDiv), band.top + 4);
    if (offset === null) return null;
    var rect = api.getCoordsAtPos(editorDiv, offset, 1);
    // The editor keeps its caret when it only changes size (edit <-> split).
    return {
        position: _mdPositionFromOffset(source, offset),
        y: rect ? Math.max(rect.top, band.top) : band.top,
        keepCaret: true
    };
}

/**
 * Where the reader is in the preview, before it is hidden.
 * Returns null when the preview is not on screen or the editor is not
 * CodeMirror (the position could not be restored there).
 */
function captureMarkdownPreviewPosition(noteEntry) {
    var previewDiv = noteEntry && noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry && noteEntry.querySelector('.markdown-editor');
    if (!previewDiv || !editorDiv || !_mdPositionCodeMirrorApi(editorDiv)) return null;
    if (window.getComputedStyle(previewDiv).display === 'none') return null;

    var scroller = _mdPositionPreviewScroller(previewDiv);
    var band = _mdPositionVisibleBand(scroller, noteEntry);
    var source = _mdPositionLineStarts(editorDiv);
    var anchors = _mdPositionPreviewAnchors(previewDiv, source);
    if (!anchors.length) return null;

    // 1. Text selected in the preview: select the same text in the source.
    var domSelection = window.getSelection ? window.getSelection() : null;
    if (domSelection && domSelection.rangeCount > 0 && !domSelection.isCollapsed) {
        var range = domSelection.getRangeAt(0);
        if (previewDiv.contains(range.startContainer)) {
            var selectedRect = range.getClientRects()[0] || range.getBoundingClientRect();
            if (selectedRect && selectedRect.top >= band.top && selectedRect.top < band.bottom) {
                var atSelection = _mdPositionAtPreviewY(anchors, selectedRect.top + 1);
                if (atSelection) {
                    atSelection.y = selectedRect.top;
                    atSelection.selection = _mdPositionFindSourceText(source, atSelection.position, domSelection.toString());
                    return atSelection;
                }
            }
        }
    }

    // 2. Nothing moved since this position was restored here.
    var recalled = _mdPositionRecall(noteEntry, 'preview', scroller, editorDiv);
    if (recalled) return recalled;

    // 3. The editor's own caret, kept while it was hidden, if it is on screen.
    var caret = getSelectionOffsetsInTextElement(editorDiv);
    if (caret) {
        var caretPosition = _mdPositionFromOffset(source, caret.end);
        var caretY = _mdPositionPreviewY(anchors, caretPosition);
        if (caretY !== null && caretY >= band.top && caretY < band.bottom) {
            return { position: caretPosition, y: caretY, keepCaret: true };
        }
    }

    // 4. The top of the visible area.
    return _mdPositionAtPreviewY(anchors, band.top + 4);
}

// Offsets of the selected preview text in the source, searched from the start
// of the block it was selected in. Inline markup (**bold**, links...) makes
// the rendered text differ from the source; the caret then goes to the line.
function _mdPositionFindSourceText(source, position, text) {
    text = String(text || '').split('\n')[0].trim();
    if (!text) return null;

    var from = source.starts[Math.max(0, Math.min(Math.floor(position), source.starts.length - 1))];
    var searchEnd = Math.min(source.content.length, from + 4000);
    var index = source.content.slice(from, searchEnd).indexOf(text);
    if (index === -1) return null;
    return { start: from + index, end: from + index + text.length };
}

// Re-applies align() until layout settles, then gives up. The first user
// gesture on the page cancels it, so it never fights a scroll.
//
// Blocks that grow late (images loading, a mermaid diagram or math rendering)
// are caught by a ResizeObserver, whose callback runs after layout and before
// paint, so the anchor is put back in the same frame instead of visibly
// jumping away and back. The timers are a safety net for changes it misses.
// key names the pane ('editor' or 'preview'): split mode holds both at once.
function _mdPositionHold(noteEntry, key, align, onFirstAlign) {
    // Scrolling CodeMirror redraws its lines on the spot, which resizes what
    // the observer watches while it is still delivering ("ResizeObserver loop
    // completed with undelivered notifications"). The editor waits a frame;
    // scrolling the preview changes no size, so it can answer in the same one.
    var onResize = key === 'editor'
        ? function () { requestAnimationFrame(run); }
        : run;
    var holds = noteEntry._mdPositionHolds || (noteEntry._mdPositionHolds = {});
    if (holds[key]) {
        holds[key]();
    }

    var done = false;
    var timers = [];
    var aligned = false;
    var observer = null;
    var events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];

    function run() {
        if (done) return;
        var ok = false;
        try {
            ok = align();
        } catch (e) {
            console.debug('markdown-position: align failed:', e);
        }
        if (ok && !aligned) {
            aligned = true;
            if (onFirstAlign) onFirstAlign();
        }
    }

    function cancel() {
        if (done) return;
        done = true;
        timers.forEach(function (id) { clearTimeout(id); });
        events.forEach(function (type) { window.removeEventListener(type, cancel, true); });
        if (observer) observer.disconnect();
        if (holds[key] === cancel) {
            holds[key] = null;
        }
    }

    events.forEach(function (type) { window.addEventListener(type, cancel, true); });
    holds[key] = cancel;

    if (typeof window.ResizeObserver === 'function') {
        observer = new ResizeObserver(onResize);
        observer.observe(noteEntry);
        // Split panes keep their own size while their content grows, so the
        // blocks inside are watched too.
        var preview = noteEntry.querySelector('.markdown-preview');
        if (preview) {
            for (var i = 0; i < preview.children.length; i++) {
                observer.observe(preview.children[i]);
            }
        }
        var editorContent = noteEntry.querySelector('.markdown-editor .cm-content');
        if (editorContent) observer.observe(editorContent);
    }

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            _MD_POSITION_RETRY_DELAYS.forEach(function (delay) {
                timers.push(setTimeout(run, delay));
            });
            timers.push(setTimeout(cancel, _MD_POSITION_HOLD_MS));
        });
    });
}

// The height to put the anchor back at: where it was, unless the new layout
// (a split pane, a shorter view) puts that off screen.
function _mdPositionTargetY(y, band) {
    if (y >= band.top && y < band.bottom - 24) return y;
    var margin = Math.min(48, (band.bottom - band.top) / 4);
    return Math.max(band.top + margin, Math.min(band.bottom - margin, y));
}

/**
 * True while the preview is being held on a restored position. The split-mode
 * caret sync (js/markdown-split-view.js) steps aside meanwhile: placing the
 * caret fires it, and it would pull the pane to the caret's whole block.
 */
function isMarkdownPreviewPositionHeld(noteEntry) {
    return !!(noteEntry && noteEntry._mdPositionHolds && noteEntry._mdPositionHolds.preview);
}

/**
 * Scroll the now visible preview so position.position sits where the reader
 * saw it, and point at it (unless options.marker is false).
 */
function restoreMarkdownPreviewPosition(noteEntry, position, options) {
    options = options || {};
    var previewDiv = noteEntry && noteEntry.querySelector('.markdown-preview');
    var editorDiv = noteEntry && noteEntry.querySelector('.markdown-editor');
    if (!previewDiv || !editorDiv || !position) return false;

    var source = _mdPositionLineStarts(editorDiv);

    function locate() {
        var y = _mdPositionPreviewY(_mdPositionPreviewAnchors(previewDiv, source), position.position);
        return y === null ? null : { y: y, left: previewDiv.getBoundingClientRect().left };
    }

    _mdPositionHold(noteEntry, 'preview', function () {
        var spot = locate();
        if (!spot) return false;
        // Looked up on every pass: a split pane only becomes the scroller
        // once it has its height.
        var scroller = _mdPositionPreviewScroller(previewDiv);
        var targetY = _mdPositionTargetY(position.y, _mdPositionVisibleBand(scroller, noteEntry));
        var delta = spot.y - targetY;
        if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
        _mdPositionRemember(noteEntry, 'preview', position, targetY, scroller, editorDiv);
        return true;
    }, options.marker === false ? null : function () {
        _mdPositionShowMarker(noteEntry, _mdPositionPreviewScroller(previewDiv), function () {
            var spot = locate();
            return spot ? { top: spot.y, height: 22, left: spot.left } : null;
        });
    });
    return true;
}

/**
 * Scroll the now visible editor so position.position sits where the reader
 * saw it, move the caret there (unless told to keep it), and point at it.
 */
function restoreMarkdownEditorPosition(noteEntry, position, options) {
    options = options || {};
    var editorDiv = noteEntry && noteEntry.querySelector('.markdown-editor');
    var api = editorDiv && _mdPositionCodeMirrorApi(editorDiv);
    if (!api || !position) return false;

    var source = _mdPositionLineStarts(editorDiv);
    var offset = _mdPositionToOffset(source, position.position);

    // No caret moves on phones: focusing the editor opens the keyboard.
    var editable = !isMarkdownEntryReadOnly(noteEntry);
    if (options.placeCaret !== false && editable && !_mdPositionIsTouchLayout()) {
        if (position.keepCaret) {
            api.focus(editorDiv);
        } else if (position.selection) {
            api.setSelection(editorDiv, position.selection.start, position.selection.end);
            offset = position.selection.start;
        } else {
            var lineStart = source.starts[Math.max(0, Math.min(Math.floor(position.position), source.starts.length - 1))];
            api.setSelection(editorDiv, lineStart, lineStart);
        }
    }

    var revealed = false;

    function locate() {
        var rect = api.getCoordsAtPos(editorDiv, offset, 1);
        if (!rect || !isFinite(rect.top)) return null;
        return { top: rect.top, height: Math.max(16, rect.bottom - rect.top) };
    }

    _mdPositionHold(noteEntry, 'editor', function () {
        var scroller = getMarkdownEditorScrollContainer(editorDiv);
        if (!scroller) return false;
        var spot = locate();
        if (!spot) {
            // CodeMirror only draws the lines around its viewport: bring the
            // target into it first, align on the next pass.
            if (!revealed && typeof api.revealPos === 'function') {
                revealed = true;
                api.revealPos(editorDiv, offset, 'center');
            }
            return false;
        }
        var targetY = _mdPositionTargetY(position.y, _mdPositionVisibleBand(scroller, noteEntry));
        var delta = spot.top - targetY;
        if (Math.abs(delta) >= 1) scroller.scrollTop += delta;
        _mdPositionRemember(noteEntry, 'editor', position, targetY, scroller, editorDiv);
        return true;
    }, function () {
        _mdPositionShowMarker(noteEntry, getMarkdownEditorScrollContainer(editorDiv), function () {
            var spot = locate();
            return spot ? { top: spot.top, height: spot.height, left: _mdPositionEditorContentLeft(editorDiv) } : null;
        });
    });
    return true;
}

// A short bar left of the anchored line, fading out, like the indicator Zed
// shows after switching views. It follows the line while the page scrolls.
function _mdPositionShowMarker(noteEntry, scroller, locate) {
    var previous = document.querySelector('.markdown-position-marker');
    if (previous) previous.remove();

    var marker = document.createElement('div');
    marker.className = 'markdown-position-marker';
    marker.setAttribute('aria-hidden', 'true');
    document.body.appendChild(marker);

    function place() {
        var spot = locate();
        var band = scroller ? _mdPositionVisibleBand(scroller, noteEntry) : null;
        if (!spot || (band && (spot.top < band.top || spot.top > band.bottom))) {
            marker.style.visibility = 'hidden';
            return;
        }
        var scrollerLeft = scroller ? scroller.getBoundingClientRect().left : 0;
        marker.style.visibility = '';
        marker.style.top = Math.round(spot.top) + 'px';
        marker.style.height = Math.round(spot.height) + 'px';
        marker.style.left = Math.round(Math.max(scrollerLeft + 2, spot.left - 12)) + 'px';
    }

    place();
    document.addEventListener('scroll', place, true);
    setTimeout(function () {
        document.removeEventListener('scroll', place, true);
        marker.remove();
    }, _MD_POSITION_MARKER_MS);
}

// Public API of this file.
window.captureMarkdownEditorPosition = captureMarkdownEditorPosition;
window.captureMarkdownPreviewPosition = captureMarkdownPreviewPosition;
window.restoreMarkdownEditorPosition = restoreMarkdownEditorPosition;
window.restoreMarkdownPreviewPosition = restoreMarkdownPreviewPosition;
window.isMarkdownPreviewPositionHeld = isMarkdownPreviewPositionHeld;

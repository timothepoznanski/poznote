// Three-way merge of markdown sources for Poznote.
//
// Used by js/live-refresh.js when a note changed on the server while this tab
// holds unsaved edits: both sides are compared with the version this tab last
// saved (the base) and, when they did not touch the same lines, the two sets
// of changes are folded into one document. Overlapping changes are reported
// as a conflict (null) and left to the user, as before.
//
// Line based, like diff3: a line is the unit of change, and two edits count as
// overlapping when the unstable regions they produce touch. Markdown only, the
// caller checks the note type; a rich-text note is one serialized document
// with no unit worth merging on.
//
// Pure string work, nothing here touches the DOM or the editor.

// Beyond these sizes the merge gives up (null) rather than freezing the tab.
var _MD_MERGE_MAX_LINES = 20000;
var _MD_MERGE_MAX_EDIT_DISTANCE = 1000;

function _mdSplitLines(text) {
    return String(text === null || text === undefined ? '' : text).split('\n');
}

/**
 * Myers diff on two arrays of lines. Returns an array of a.length where
 * entry i is the index in b matched with a[i], or -1 when a[i] has no
 * counterpart; null when the inputs are too large or too different.
 */
function _mdLineMatches(a, b) {
    var n = a.length;
    var m = b.length;
    var matches = [];
    var i;
    for (i = 0; i < n; i++) {
        matches.push(-1);
    }

    // Common prefix and suffix first: an edit is usually local, and this keeps
    // the quadratic part of the work to the lines around it.
    var start = 0;
    while (start < n && start < m && a[start] === b[start]) {
        matches[start] = start;
        start++;
    }
    var endA = n;
    var endB = m;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
        matches[endA] = endB;
    }

    var A = a.slice(start, endA);
    var B = b.slice(start, endB);
    var N = A.length;
    var M = B.length;
    if (N === 0 || M === 0) {
        return matches;
    }
    if (N + M > _MD_MERGE_MAX_LINES) {
        return null;
    }

    var max = Math.min(N + M, _MD_MERGE_MAX_EDIT_DISTANCE);
    var offset = max + 1;
    var v = new Int32Array(2 * max + 3);
    var trace = [];
    var d, k, x, y, found = false;

    for (d = 0; d <= max && !found; d++) {
        trace.push(v.slice());
        for (k = -d; k <= d; k += 2) {
            if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
                x = v[offset + k + 1];
            } else {
                x = v[offset + k - 1] + 1;
            }
            y = x - k;
            while (x < N && y < M && A[x] === B[y]) {
                x++;
                y++;
            }
            v[offset + k] = x;
            if (x >= N && y >= M) {
                found = true;
                break;
            }
        }
    }
    if (!found) {
        return null;
    }

    // Walk the trace back: diagonal moves are the matched lines.
    x = N;
    y = M;
    for (d = trace.length - 1; d >= 0; d--) {
        var vd = trace[d];
        k = x - y;
        var prevK;
        if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }
        var prevX = vd[offset + prevK];
        var prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            x--;
            y--;
            matches[start + x] = start + y;
        }
        if (d > 0) {
            x = prevX;
            y = prevY;
        }
    }

    return matches;
}

function _mdSameLines(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Merge two edits of the same base text. Returns the merged text, or null
 * when a region was changed differently on both sides (or the texts are too
 * large to compare).
 */
function mergeMarkdownThreeWay(base, local, server) {
    var baseLines = _mdSplitLines(base);
    var localLines = _mdSplitLines(local);
    var serverLines = _mdSplitLines(server);

    if (_mdSameLines(localLines, serverLines)) {
        return localLines.join('\n');
    }
    if (_mdSameLines(baseLines, localLines)) {
        return serverLines.join('\n');
    }
    if (_mdSameLines(baseLines, serverLines)) {
        return localLines.join('\n');
    }

    var ma = _mdLineMatches(baseLines, localLines);
    var mb = _mdLineMatches(baseLines, serverLines);
    if (!ma || !mb) {
        return null;
    }

    // diff3: walk the base, alternating stable runs (the same line matched
    // on both sides) and unstable regions, and resolve each unstable region
    // from whichever side changed it.
    var out = [];
    var i = 0, j = 0, k = 0;
    var n = baseLines.length;

    function resolve(i2, j2, k2) {
        var bs = baseLines.slice(i, i2);
        var ls = localLines.slice(j, j2);
        var ss = serverLines.slice(k, k2);
        if (_mdSameLines(ls, bs)) {
            out.push.apply(out, ss);
            return true;
        }
        if (_mdSameLines(ss, bs) || _mdSameLines(ls, ss)) {
            out.push.apply(out, ls);
            return true;
        }
        return false;
    }

    while (true) {
        var i2 = i;
        while (i2 < n && !(ma[i2] >= 0 && mb[i2] >= 0)) {
            i2++;
        }
        if (i2 >= n) {
            if (!resolve(n, localLines.length, serverLines.length)) {
                return null;
            }
            break;
        }
        var j2 = ma[i2];
        var k2 = mb[i2];
        if (i2 > i || j2 > j || k2 > k) {
            if (!resolve(i2, j2, k2)) {
                return null;
            }
        }
        var run = 0;
        while (i2 + run < n && ma[i2 + run] === j2 + run && mb[i2 + run] === k2 + run) {
            out.push(baseLines[i2 + run]);
            run++;
        }
        i = i2 + run;
        j = j2 + run;
        k = k2 + run;
    }

    return out.join('\n');
}

/**
 * Where a caret placed at `offset` in `before` lands once the text is
 * replaced by `after`: same line when it survived, else the same distance
 * below the nearest surviving line above it. Column kept, clamped.
 */
function mapMarkdownOffsetAfterMerge(before, after, offset) {
    before = String(before || '');
    after = String(after || '');
    offset = Math.max(0, Math.min(Number(offset) || 0, before.length));

    var beforeLines = _mdSplitLines(before);
    var afterLines = _mdSplitLines(after);
    var line = 0;
    var column = offset;
    while (line < beforeLines.length - 1 && column > beforeLines[line].length) {
        column -= beforeLines[line].length + 1;
        line++;
    }

    var matches = _mdLineMatches(beforeLines, afterLines);
    var target;
    if (!matches) {
        target = line;
    } else if (matches[line] >= 0) {
        target = matches[line];
    } else {
        var p = line - 1;
        while (p >= 0 && matches[p] < 0) {
            p--;
        }
        target = p >= 0 ? matches[p] + (line - p) : line;
    }
    target = Math.max(0, Math.min(target, afterLines.length - 1));

    var result = 0;
    for (var l = 0; l < target; l++) {
        result += afterLines[l].length + 1;
    }
    return result + Math.min(column, afterLines[target].length);
}

// Public API of this file.
window.mergeMarkdownThreeWay = mergeMarkdownThreeWay;
window.mapMarkdownOffsetAfterMerge = mapMarkdownOffsetAfterMerge;

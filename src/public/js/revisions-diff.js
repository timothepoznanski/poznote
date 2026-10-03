// Line and word diff for the Revisions page (revisions.php).
//
// Pure string work: nothing here touches the DOM, the page script renders the
// result. Exposed as window.PoznoteDiff.
//
// Lines are compared with Myers' algorithm, as js/markdown-merge.js does for
// the three-way merge, but that one gives up past 1000 edits because a merge
// must stay exact. A revision diff only has to be readable, so when two
// versions are too far apart this falls back to a patience diff: lines that
// occur once on each side anchor the comparison and Myers runs again between
// anchors, so even a rewritten 20 000-line note gives a usable answer.

(function () {
    'use strict';

    // Myers keeps one row per edit step, the row growing with the step:
    // memory is quadratic in the edit distance. 2000 steps is ~16 MB.
    var MAX_EDIT_DISTANCE = 2000;
    // Word diff of one pair of changed lines. Past these sizes the pair is
    // shown as removed then added, without inner highlighting.
    var MAX_WORD_TOKENS = 4000;
    var MAX_WORD_EDIT_DISTANCE = 400;

    /**
     * Myers diff on two arrays of strings. Returns the edit script as an array
     * of {type: 'equal'|'delete'|'insert', aIndex, bIndex}, or null when the
     * edit distance exceeds maxD.
     */
    function myers(a, b, maxD) {
        var n = a.length;
        var m = b.length;
        var max = Math.min(n + m, maxD);
        var offset = max + 1;
        var v = new Int32Array(2 * max + 3);
        var trace = [];
        var d, k, x, y;
        var found = n === 0 && m === 0;

        for (d = 0; d <= max && !found; d++) {
            // Only diagonals -d..d are reachable at step d: keep that slice
            trace.push(v.slice(offset - d - 1, offset + d + 2));
            for (k = -d; k <= d; k += 2) {
                if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
                    x = v[offset + k + 1];
                } else {
                    x = v[offset + k - 1] + 1;
                }
                y = x - k;
                while (x < n && y < m && a[x] === b[y]) {
                    x++;
                    y++;
                }
                v[offset + k] = x;
                if (x >= n && y >= m) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            return null;
        }

        // Walk the trace back from the end
        var ops = [];
        x = n;
        y = m;
        for (d = trace.length - 1; d >= 0; d--) {
            var row = trace[d];
            var base = -d - 1;
            var get = function (diag) {
                return row[diag - base];
            };
            k = x - y;
            var prevK;
            if (k === -d || (k !== d && get(k - 1) < get(k + 1))) {
                prevK = k + 1;
            } else {
                prevK = k - 1;
            }
            var prevX = d === 0 ? 0 : get(prevK);
            var prevY = prevX - prevK;
            while (x > prevX && y > prevY) {
                x--;
                y--;
                ops.push({ type: 'equal', aIndex: x, bIndex: y });
            }
            if (d > 0) {
                if (x === prevX) {
                    y--;
                    ops.push({ type: 'insert', aIndex: x, bIndex: y });
                } else {
                    x--;
                    ops.push({ type: 'delete', aIndex: x, bIndex: y });
                }
            }
        }
        ops.reverse();
        return ops;
    }

    /**
     * Longest increasing subsequence of pairs sorted by a, on b. Used by the
     * patience diff to keep the unique lines that appear in the same order.
     */
    function longestIncreasing(pairs) {
        var tails = [];
        var prev = new Int32Array(pairs.length);
        for (var i = 0; i < pairs.length; i++) {
            var lo = 0;
            var hi = tails.length;
            while (lo < hi) {
                var mid = (lo + hi) >> 1;
                if (pairs[tails[mid]].b < pairs[i].b) lo = mid + 1;
                else hi = mid;
            }
            prev[i] = lo > 0 ? tails[lo - 1] : -1;
            tails[lo] = i;
        }
        var out = [];
        var at = tails.length ? tails[tails.length - 1] : -1;
        while (at !== -1) {
            out.push(pairs[at]);
            at = prev[at];
        }
        return out.reverse();
    }

    /**
     * Diff of a[aStart..aEnd) against b[bStart..bEnd), appended to ops with
     * absolute indexes. Myers first; patience when Myers gives up.
     */
    function diffRange(a, b, aStart, aEnd, bStart, bEnd, ops) {
        // Common prefix and suffix: an edit is usually local
        while (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
            ops.push({ type: 'equal', aIndex: aStart++, bIndex: bStart++ });
        }
        var tail = [];
        while (aEnd > aStart && bEnd > bStart && a[aEnd - 1] === b[bEnd - 1]) {
            aEnd--;
            bEnd--;
            tail.push({ type: 'equal', aIndex: aEnd, bIndex: bEnd });
        }

        if (aStart < aEnd || bStart < bEnd) {
            var sliceA = a.slice(aStart, aEnd);
            var sliceB = b.slice(bStart, bEnd);
            var script = myers(sliceA, sliceB, MAX_EDIT_DISTANCE);
            if (script) {
                for (var i = 0; i < script.length; i++) {
                    ops.push({
                        type: script[i].type,
                        aIndex: script[i].aIndex + aStart,
                        bIndex: script[i].bIndex + bStart
                    });
                }
            } else {
                patience(a, b, aStart, aEnd, bStart, bEnd, ops);
            }
        }

        for (var t = tail.length - 1; t >= 0; t--) {
            ops.push(tail[t]);
        }
    }

    function patience(a, b, aStart, aEnd, bStart, bEnd, ops) {
        var counts = Object.create(null);
        var i;
        for (i = aStart; i < aEnd; i++) {
            var ca = counts[a[i]] || (counts[a[i]] = { a: 0, b: 0, ai: -1, bi: -1 });
            ca.a++;
            ca.ai = i;
        }
        for (i = bStart; i < bEnd; i++) {
            var cb = counts[b[i]];
            if (!cb) continue;
            cb.b++;
            cb.bi = i;
        }
        var pairs = [];
        for (i = aStart; i < aEnd; i++) {
            var c = counts[a[i]];
            if (c && c.a === 1 && c.b === 1) {
                pairs.push({ a: c.ai, b: c.bi });
            }
        }
        var anchors = longestIncreasing(pairs);

        if (anchors.length === 0) {
            // Nothing in common worth anchoring on: all removed, all added
            for (i = aStart; i < aEnd; i++) ops.push({ type: 'delete', aIndex: i, bIndex: bStart });
            for (i = bStart; i < bEnd; i++) ops.push({ type: 'insert', aIndex: aEnd, bIndex: i });
            return;
        }

        var pa = aStart;
        var pb = bStart;
        for (i = 0; i < anchors.length; i++) {
            diffRange(a, b, pa, anchors[i].a, pb, anchors[i].b, ops);
            ops.push({ type: 'equal', aIndex: anchors[i].a, bIndex: anchors[i].b });
            pa = anchors[i].a + 1;
            pb = anchors[i].b + 1;
        }
        diffRange(a, b, pa, aEnd, pb, bEnd, ops);
    }

    /**
     * Diff two arrays of lines. Returns [{type, aIndex, bIndex}] in document
     * order; aIndex is meaningful for 'equal' and 'delete', bIndex for
     * 'equal' and 'insert'.
     */
    function diffLines(a, b) {
        var ops = [];
        diffRange(a, b, 0, a.length, 0, b.length, ops);
        return normalizeChangeOrder(ops);
    }

    /**
     * Within each run of changes, removals first then additions, so a block
     * reads as "this became that".
     */
    function normalizeChangeOrder(ops) {
        var out = [];
        var dels = [];
        var ins = [];
        function flush() {
            Array.prototype.push.apply(out, dels);
            Array.prototype.push.apply(out, ins);
            dels = [];
            ins = [];
        }
        for (var i = 0; i < ops.length; i++) {
            if (ops[i].type === 'equal') {
                flush();
                out.push(ops[i]);
            } else if (ops[i].type === 'delete') {
                dels.push(ops[i]);
            } else {
                ins.push(ops[i]);
            }
        }
        flush();
        return out;
    }

    var WORD_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

    function tokenize(text) {
        return String(text).match(WORD_RE) || [];
    }

    /**
     * Word diff of one changed line against its new version. Returns
     * {a: [{text, changed}], b: [{text, changed}], ratio} where ratio is the
     * share of unchanged text (0..1), or null when the line is too long.
     */
    function diffWords(oldText, newText) {
        var a = tokenize(oldText);
        var b = tokenize(newText);
        if (a.length + b.length > MAX_WORD_TOKENS) return null;

        var script = myers(a, b, MAX_WORD_EDIT_DISTANCE);
        if (!script) return null;

        var outA = [];
        var outB = [];
        var same = 0;
        var total = 0;
        function push(list, text, changed) {
            var last = list[list.length - 1];
            if (last && last.changed === changed) {
                last.text += text;
            } else {
                list.push({ text: text, changed: changed });
            }
        }
        for (var i = 0; i < script.length; i++) {
            var op = script[i];
            if (op.type === 'equal') {
                var tok = a[op.aIndex];
                push(outA, tok, false);
                push(outB, tok, false);
                if (/\S/.test(tok)) same += tok.length * 2;
                total += /\S/.test(tok) ? tok.length * 2 : 0;
            } else if (op.type === 'delete') {
                push(outA, a[op.aIndex], true);
                if (/\S/.test(a[op.aIndex])) total += a[op.aIndex].length;
            } else {
                push(outB, b[op.bIndex], true);
                if (/\S/.test(b[op.bIndex])) total += b[op.bIndex].length;
            }
        }
        // A changed run that is only whitespace between unchanged words reads
        // as noise: show it plain
        [outA, outB].forEach(function (list) {
            list.forEach(function (part) {
                if (part.changed && !/\S/.test(part.text)) part.changed = false;
            });
        });

        return { a: outA, b: outB, ratio: total === 0 ? 1 : same / total };
    }

    /**
     * Group a line edit script into hunks with `context` unchanged lines
     * around each change. Returns
     * [{type: 'hunk', ops: [...]} | {type: 'gap', ops: [...]}] covering every
     * op in order, so a renderer can fold the gaps and still unfold them.
     */
    function groupHunks(ops, context) {
        var keep = new Uint8Array(ops.length);
        var i, j;
        for (i = 0; i < ops.length; i++) {
            if (ops[i].type === 'equal') continue;
            for (j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) {
                keep[j] = 1;
            }
        }
        var groups = [];
        var current = null;
        for (i = 0; i < ops.length; i++) {
            var type = keep[i] ? 'hunk' : 'gap';
            if (!current || current.type !== type) {
                current = { type: type, ops: [] };
                groups.push(current);
            }
            current.ops.push(ops[i]);
        }
        return groups;
    }

    function countChanges(ops) {
        var added = 0;
        var removed = 0;
        for (var i = 0; i < ops.length; i++) {
            if (ops[i].type === 'insert') added++;
            else if (ops[i].type === 'delete') removed++;
        }
        return { added: added, removed: removed };
    }

    window.PoznoteDiff = {
        diffLines: diffLines,
        diffWords: diffWords,
        groupHunks: groupHunks,
        countChanges: countChanges
    };
})();

// ============================================================================
// Favorites section: ten rows, the rest scrolled
// ============================================================================
// The Favorites section of the notes tree (notes_list.php) shows at most ten
// rows; the others are reached by scrolling inside the section, whose
// scrollbar stays hidden (css/folders/system-folders.css).
//
// The height is measured rather than set in CSS: a row's height follows the
// font size and icon scale settings. The cap is the top of the eleventh row,
// so the ten rows keep their spacing. It is measured again when the section
// opens (it has no height while folded), when a row changes size, and after a
// sidebar refresh, which replaces the whole tree.

(function () {
    'use strict';

    var MAX_ROWS = 10;
    var SECTION = '.folder-header.system-folder[data-folder="Favorites"] > .folder-content';

    var watched = null;
    var resizeObserver = null;

    function rowsOf(content) {
        return Array.prototype.filter.call(content.children, function (child) {
            return child.classList.contains('note-list-item');
        });
    }

    function cap(content) {
        var rows = rowsOf(content);
        // Folded (no layout box): measured again when it opens
        if (content.offsetParent === null) return;
        if (rows.length <= MAX_ROWS) {
            content.classList.remove('favorites-capped');
            if (content.style.maxHeight) content.style.maxHeight = '';
            return;
        }
        var height = rows[MAX_ROWS].getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
        if (height <= 0) return;
        content.classList.add('favorites-capped');
        if (content.style.maxHeight !== height + 'px') content.style.maxHeight = height + 'px';

        // The open note, when it sits below the tenth row, is scrolled into
        // the section rather than left out of sight
        var selected = content.querySelector('.selected-note');
        var row = selected ? selected.closest('.note-list-item') : null;
        if (row && !content.dataset.favoritesScrolled) {
            content.dataset.favoritesScrolled = '1';
            var top = row.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop;
            if (top + row.offsetHeight > content.scrollTop + height) {
                content.scrollTop = top + row.offsetHeight - height;
            }
        }
    }

    function bind() {
        var content = document.querySelector(SECTION);
        if (content === watched) {
            if (content) cap(content);
            return;
        }
        watched = content;
        if (resizeObserver) resizeObserver.disconnect();
        if (!content) return;

        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(function () { cap(content); });
            resizeObserver.observe(content);
            var first = rowsOf(content)[0];
            if (first) resizeObserver.observe(first);
        }
        cap(content);
    }

    function start() {
        bind();
        var root = document.getElementById('left_col') || document.body;
        var pending = false;
        new MutationObserver(function () {
            if (pending) return;
            pending = true;
            window.requestAnimationFrame(function () {
                pending = false;
                bind();
            });
        }).observe(root, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

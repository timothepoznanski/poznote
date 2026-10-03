/* mermaid-zoom.js
   Full-screen viewer for Mermaid diagrams (issue #1551). Inline, a large
   diagram is shrunk to the width of the note and the browser zoom scales the
   whole app, so every rendered diagram gets an Enlarge button that opens it
   over the page with its own zoom and pan: wheel or pinch to zoom around the
   pointer, drag to pan, +/-/0 and the arrow keys from the keyboard. The
   browser's Back button closes it and returns to the note.

   Renderers call window.poznoteMermaidZoom.decorate(nodes) once Mermaid has
   drawn the nodes (js/markdown-parser.js, js/public-note.js). A re-render
   replaces the node's content, so decorate() is safe to call again.
*/
(function () {
    'use strict';

    var MIN_SCALE = 0.05;
    var MAX_SCALE = 10;
    var STEP = 1.25;
    var FIT_PADDING = 24;
    var KEY_PAN = 60;

    var viewer = null;
    var historyPushed = false; // a history entry of ours sits on top
    var poppingSelf = false;   // we asked for the history.back() in close()

    function tl(key, fallback) {
        return window.t ? window.t(key, {}, fallback) : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function renderedSvg(node) {
        for (var i = 0; i < node.children.length; i++) {
            if (node.children[i].tagName.toLowerCase() === 'svg') return node.children[i];
        }
        return null;
    }

    /**
     * Add the Enlarge button to every rendered diagram among `nodes` (all the
     * page's diagrams when omitted). The button is left out of editable
     * content, where it would be saved with the note.
     */
    function decorate(nodes) {
        var list = nodes ? Array.prototype.slice.call(nodes) : Array.prototype.slice.call(document.querySelectorAll('.mermaid'));
        var label = tl('mermaid_zoom.open', 'Enlarge diagram');
        list.forEach(function (node) {
            if (!node || !node.classList || !node.classList.contains('mermaid')) return;
            if (node.isContentEditable || !renderedSvg(node)) return;
            if (node.querySelector(':scope > .mermaid-zoom-btn')) return;

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mermaid-zoom-btn';
            btn.setAttribute('contenteditable', 'false');
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
            btn.innerHTML = '<i class="lucide lucide-maximize-2" aria-hidden="true"></i>';
            node.classList.add('mermaid-zoomable');
            node.appendChild(btn);
        });
    }

    /**
     * Copy of the diagram for the viewer. Mermaid scopes its <style> and its
     * arrow markers by the svg id, so the copy gets an id of its own: two
     * elements sharing it would point url(#...) at the original.
     */
    function cloneSvg(svg) {
        var markup = svg.outerHTML;
        var oldId = svg.id;
        if (oldId) {
            markup = markup.split(oldId).join(oldId + '-zoom');
        }
        var holder = document.createElement('div');
        holder.innerHTML = markup;
        var copy = holder.firstElementChild;
        copy.removeAttribute('width');
        copy.removeAttribute('height');
        copy.style.maxWidth = 'none';
        copy.style.maxHeight = 'none';
        return copy;
    }

    var LABEL_SELECTOR = 'foreignObject, foreignObject *, text, tspan';
    var LABEL_FONT = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing'];

    /**
     * Mermaid sized every label box for the font the labels had in the note,
     * and the note's stylesheets force their own font onto the labels (Inter
     * at the note's size, over Mermaid's). Out of the note the copy would fall
     * back to Mermaid's font and clip its labels, so it takes the computed
     * font of each label from the original.
     */
    function copyLabelFonts(source, copy) {
        var from = source.querySelectorAll(LABEL_SELECTOR);
        var to = copy.querySelectorAll(LABEL_SELECTOR);
        if (from.length !== to.length) return;
        var styles = [];
        for (var i = 0; i < from.length; i++) {
            styles.push(window.getComputedStyle(from[i]));
        }
        for (var j = 0; j < to.length; j++) {
            for (var k = 0; k < LABEL_FONT.length; k++) {
                to[j].style.setProperty(LABEL_FONT[k], styles[j].getPropertyValue(LABEL_FONT[k]), 'important');
            }
        }
    }

    function naturalSize(svg) {
        var box = svg.viewBox && svg.viewBox.baseVal;
        if (box && box.width > 0 && box.height > 0) {
            return { width: box.width, height: box.height };
        }
        var rect = svg.getBoundingClientRect();
        return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    }

    function makeButton(className, icon, label) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mermaid-viewer-btn ' + className;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        if (icon) btn.innerHTML = '<i class="lucide ' + icon + '" aria-hidden="true"></i>';
        return btn;
    }

    function applyTransform() {
        var v = viewer;
        v.svg.style.width = (v.size.width * v.scale) + 'px';
        v.svg.style.height = (v.size.height * v.scale) + 'px';
        v.canvas.style.transform = 'translate(' + v.x + 'px, ' + v.y + 'px)';
        v.level.textContent = Math.round(v.scale * 100) + '%';
        v.zoomOut.disabled = v.scale <= MIN_SCALE;
        v.zoomIn.disabled = v.scale >= MAX_SCALE;
    }

    /** Zoom to `scale`, keeping the stage point (px, py) under the pointer. */
    function zoomTo(scale, px, py) {
        var v = viewer;
        var next = clamp(scale, MIN_SCALE, MAX_SCALE);
        if (px === undefined) {
            var rect = v.stage.getBoundingClientRect();
            px = rect.width / 2;
            py = rect.height / 2;
        }
        v.x = px - (px - v.x) * next / v.scale;
        v.y = py - (py - v.y) * next / v.scale;
        v.scale = next;
        applyTransform();
    }

    /** Scale and centre the diagram so all of it shows. */
    function fit() {
        var v = viewer;
        var rect = v.stage.getBoundingClientRect();
        var toolbar = v.toolbar.getBoundingClientRect();
        var top = toolbar.bottom - rect.top;
        var availW = Math.max(1, rect.width - FIT_PADDING * 2);
        var availH = Math.max(1, rect.height - top - FIT_PADDING * 2);
        v.scale = clamp(Math.min(availW / v.size.width, availH / v.size.height), MIN_SCALE, MAX_SCALE);
        v.x = (rect.width - v.size.width * v.scale) / 2;
        v.y = top + FIT_PADDING + (availH - v.size.height * v.scale) / 2;
        applyTransform();
    }

    function actualSize() {
        zoomTo(1);
    }

    function stagePoint(event) {
        var rect = viewer.stage.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onWheel(event) {
        event.preventDefault();
        var delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 16;
        else if (event.deltaMode === 2) delta *= 400;
        // A trackpad pinch arrives as a wheel event with ctrlKey and small deltas.
        var factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015));
        var point = stagePoint(event);
        zoomTo(viewer.scale * factor, point.x, point.y);
    }

    function pointerPair() {
        var ids = Object.keys(viewer.pointers);
        var a = viewer.pointers[ids[0]];
        var b = viewer.pointers[ids[1]];
        return {
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        };
    }

    function startGesture() {
        var v = viewer;
        var count = Object.keys(v.pointers).length;
        v.gesture = null;
        if (count === 1) {
            var p = v.pointers[Object.keys(v.pointers)[0]];
            v.gesture = { type: 'pan', startX: p.x, startY: p.y, x: v.x, y: v.y };
        } else if (count === 2) {
            var pair = pointerPair();
            v.gesture = { type: 'pinch', distance: pair.distance, cx: pair.x, cy: pair.y, scale: v.scale, x: v.x, y: v.y };
        }
        v.stage.classList.toggle('is-panning', !!v.gesture);
    }

    function onPointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target.closest('.mermaid-viewer-toolbar')) return;
        event.preventDefault();
        try { viewer.stage.setPointerCapture(event.pointerId); } catch (e) { /* pointer already gone */ }
        viewer.pointers[event.pointerId] = stagePoint(event);
        startGesture();
    }

    function onPointerMove(event) {
        var v = viewer;
        if (!v.pointers[event.pointerId] || !v.gesture) return;
        v.pointers[event.pointerId] = stagePoint(event);
        var g = v.gesture;
        if (g.type === 'pan') {
            var p = v.pointers[event.pointerId];
            v.x = g.x + p.x - g.startX;
            v.y = g.y + p.y - g.startY;
            applyTransform();
        } else if (g.type === 'pinch' && Object.keys(v.pointers).length >= 2) {
            var pair = pointerPair();
            var next = clamp(g.scale * pair.distance / g.distance, MIN_SCALE, MAX_SCALE);
            // The point under the fingers' midpoint at the start follows the midpoint.
            v.x = pair.x - (g.cx - g.x) * next / g.scale;
            v.y = pair.y - (g.cy - g.y) * next / g.scale;
            v.scale = next;
            applyTransform();
        }
    }

    function onPointerUp(event) {
        if (!viewer.pointers[event.pointerId]) return;
        delete viewer.pointers[event.pointerId];
        startGesture();
    }

    function onDoubleClick(event) {
        if (event.target.closest('.mermaid-viewer-toolbar')) return;
        var point = stagePoint(event);
        zoomTo(viewer.scale * (event.shiftKey ? 1 / 2 : 2), point.x, point.y);
    }

    function onKeyDown(event) {
        if (!viewer) return;
        var handled = true;
        switch (event.key) {
            case 'Escape': close(); break;
            case '+': case '=': zoomTo(viewer.scale * STEP); break;
            case '-': case '_': zoomTo(viewer.scale / STEP); break;
            case '0': fit(); break;
            case '1': actualSize(); break;
            case 'ArrowLeft': viewer.x += KEY_PAN; applyTransform(); break;
            case 'ArrowRight': viewer.x -= KEY_PAN; applyTransform(); break;
            case 'ArrowUp': viewer.y += KEY_PAN; applyTransform(); break;
            case 'ArrowDown': viewer.y -= KEY_PAN; applyTransform(); break;
            case 'Tab': keepFocusInside(event); handled = false; break;
            default: handled = false;
        }
        if (handled) {
            event.preventDefault();
        }
        // The app's own shortcuts must not act on the note behind the viewer.
        event.stopPropagation();
    }

    function keepFocusInside(event) {
        var buttons = Array.prototype.slice.call(viewer.root.querySelectorAll('button:not(:disabled)'));
        if (!buttons.length) return;
        var first = buttons[0];
        var last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        } else if (!viewer.root.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        }
    }

    function onResize() {
        if (viewer && !viewer.moved) fit();
    }

    function open(node) {
        var source = node && renderedSvg(node);
        if (!source || viewer) return;

        var root = document.createElement('div');
        root.className = 'mermaid-viewer';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', tl('mermaid_zoom.dialog', 'Diagram'));

        var stage = document.createElement('div');
        stage.className = 'mermaid-viewer-stage';
        var canvas = document.createElement('div');
        canvas.className = 'mermaid-viewer-canvas';
        var svg = cloneSvg(source);
        copyLabelFonts(source, svg);
        canvas.appendChild(svg);
        stage.appendChild(canvas);

        var toolbar = document.createElement('div');
        toolbar.className = 'mermaid-viewer-toolbar';
        var zoomOut = makeButton('mermaid-viewer-zoom-out', 'lucide-minus', tl('mermaid_zoom.zoom_out', 'Zoom out'));
        var level = makeButton('mermaid-viewer-level', '', tl('mermaid_zoom.actual_size', 'Actual size'));
        var zoomIn = makeButton('mermaid-viewer-zoom-in', 'lucide-plus', tl('mermaid_zoom.zoom_in', 'Zoom in'));
        var fitBtn = makeButton('mermaid-viewer-fit', 'lucide-maximize', tl('mermaid_zoom.fit', 'Fit to screen'));
        var closeBtn = makeButton('mermaid-viewer-close', 'lucide-x', tl('common.close', 'Close'));
        [zoomOut, level, zoomIn, fitBtn, closeBtn].forEach(function (btn) { toolbar.appendChild(btn); });

        root.appendChild(stage);
        root.appendChild(toolbar);
        document.body.appendChild(root);

        viewer = {
            root: root,
            stage: stage,
            canvas: canvas,
            svg: svg,
            toolbar: toolbar,
            level: level,
            zoomIn: zoomIn,
            zoomOut: zoomOut,
            size: naturalSize(source),
            scale: 1,
            x: 0,
            y: 0,
            pointers: {},
            gesture: null,
            moved: false,
            returnFocus: document.activeElement
        };

        zoomOut.addEventListener('click', function () { viewer.moved = true; zoomTo(viewer.scale / STEP); });
        zoomIn.addEventListener('click', function () { viewer.moved = true; zoomTo(viewer.scale * STEP); });
        level.addEventListener('click', function () { viewer.moved = true; actualSize(); });
        fitBtn.addEventListener('click', function () { viewer.moved = false; fit(); });
        closeBtn.addEventListener('click', function () { close(); });

        stage.addEventListener('wheel', function (e) { viewer.moved = true; onWheel(e); }, { passive: false });
        stage.addEventListener('pointerdown', function (e) { viewer.moved = true; onPointerDown(e); });
        stage.addEventListener('pointermove', onPointerMove);
        stage.addEventListener('pointerup', onPointerUp);
        stage.addEventListener('pointercancel', onPointerUp);
        stage.addEventListener('dblclick', function (e) { viewer.moved = true; onDoubleClick(e); });
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResize);
        document.documentElement.classList.add('mermaid-viewer-open');

        // An entry of our own on the same URL, so Back closes the viewer
        // instead of leaving the note.
        try {
            history.pushState({ poznoteMermaidViewer: true }, '', window.location.href);
            historyPushed = true;
        } catch (e) { /* no history entry: Back keeps its usual meaning */ }

        fit();
        closeBtn.focus();
    }

    /** fromBack: the Back button already dropped our history entry. */
    function close(fromBack) {
        if (!viewer) return;
        var v = viewer;
        viewer = null;
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', onResize);
        document.documentElement.classList.remove('mermaid-viewer-open');
        if (v.root.parentNode) v.root.parentNode.removeChild(v.root);
        if (v.returnFocus && document.contains(v.returnFocus) && typeof v.returnFocus.focus === 'function') {
            v.returnFocus.focus();
        }
        if (fromBack !== true && historyPushed) {
            // Closed from the viewer itself: drop the entry pushed in open().
            poppingSelf = true;
            try {
                history.back();
            } catch (e) {
                poppingSelf = false;
                historyPushed = false;
            }
        }
    }

    // Registered while this file is parsed, ahead of the app's own popstate
    // listeners, so the entry we own never reaches them (they would reload
    // the note).
    window.addEventListener('popstate', function (event) {
        if (poppingSelf) {
            poppingSelf = false;
            historyPushed = false;
            event.stopImmediatePropagation();
            return;
        }
        if (!historyPushed) return;
        historyPushed = false;
        close(true);
        event.stopImmediatePropagation();
    });

    // Capture phase, so the click never reaches the note's own handlers.
    document.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('.mermaid-zoom-btn') : null;
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        open(btn.closest('.mermaid'));
    }, true);

    window.poznoteMermaidZoom = {
        decorate: decorate,
        open: function (node) { open(node); },
        close: function () { close(); }
    };
})();

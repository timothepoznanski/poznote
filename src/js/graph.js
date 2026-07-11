// Graph view — force-directed visualization of note connections
// Requires: navigation.js (getPageWorkspace, goBackToNotes, goBackToHome),
//           globals.js (buildNoteNavigationUrl)
(function () {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* --------------------------------------------------------------------- */
    /* Colors                                                                  */
    /* --------------------------------------------------------------------- */

    // Categorical palette (8 slots), separate steps for light and dark
    // surfaces. Folders beyond 8 fall back to the neutral color; the note
    // title label and tooltip always carry identity, never color alone.
    var PALETTE_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
    var PALETTE_DARK  = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'];
    var NEUTRAL_NODE  = '#898781';

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function nodeColor(node) {
        if (node.folderSlot === -1) {
            return NEUTRAL_NODE;
        }
        return (isDarkTheme() ? PALETTE_DARK : PALETTE_LIGHT)[node.folderSlot];
    }

    /* --------------------------------------------------------------------- */
    /* State                                                                   */
    /* --------------------------------------------------------------------- */

    var nodes = [];            // {id, title, folder, folderSlot, degree, x, y, vx, vy, el, labelEl, circleEl, orphan}
    var edges = [];            // {source: node, target: node, el}
    var nodeById = {};
    var neighbors = {};        // id -> {otherId: true}

    var svg, viewport, edgesGroup, nodesGroup, tooltip, wrapper;
    var width = 0, height = 0;

    // Pan/zoom transform
    var tx = 0, ty = 0, scale = 1;
    var userInteracted = false;

    // Simulation
    var alpha = 0;
    var running = false;
    var SPRING_LENGTH = 90;
    var SPRING_STRENGTH = 0.5;
    var CHARGE = 1500;
    var GRAVITY = 0.04;
    var VELOCITY_RETAIN = 0.6;

    var showOrphans = true;
    var showLabels = true;
    var searchTerm = '';
    var hoveredNode = null;

    /* --------------------------------------------------------------------- */
    /* Data loading                                                            */
    /* --------------------------------------------------------------------- */

    function buildGraphUrl() {
        var url = '/api/v1/graph';
        var workspace = getPageWorkspace();
        if (workspace) {
            url += '?workspace=' + encodeURIComponent(workspace);
        }
        return url;
    }

    function loadGraph() {
        fetch(buildGraphUrl(), {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (response) {
            return response.ok ? response.json() : null;
        })
        .then(function (data) {
            document.getElementById('graphLoading').classList.add('initially-hidden');
            if (!data || !data.success || !data.nodes || data.nodes.length === 0) {
                document.getElementById('graphEmpty').classList.remove('initially-hidden');
                return;
            }
            buildGraph(data.nodes, data.edges || []);
        })
        .catch(function () {
            document.getElementById('graphLoading').classList.add('initially-hidden');
            document.getElementById('graphEmpty').classList.remove('initially-hidden');
        });
    }

    /* --------------------------------------------------------------------- */
    /* Graph construction                                                      */
    /* --------------------------------------------------------------------- */

    function buildGraph(rawNodes, rawEdges) {
        // Assign palette slots to folders in alphabetical order (fixed order,
        // never cycled); folders beyond the 8 slots use the neutral color.
        var folderNames = {};
        rawNodes.forEach(function (n) {
            if (n.folder) { folderNames[n.folder] = true; }
        });
        var sortedFolders = Object.keys(folderNames).sort(function (a, b) {
            return a.localeCompare(b);
        });
        var folderSlots = {};
        sortedFolders.forEach(function (name, i) {
            folderSlots[name] = i < PALETTE_LIGHT.length ? i : -1;
        });

        // Initial positions on a spiral so the simulation starts untangled
        var n = rawNodes.length;
        var spread = Math.sqrt(n) * 26 + 40;
        rawNodes.forEach(function (raw, i) {
            var angle = i * 2.39996;             // golden angle
            var radius = spread * Math.sqrt((i + 1) / n);
            var node = {
                id: raw.id,
                title: raw.title,
                folder: raw.folder || '',
                folderSlot: raw.folder ? folderSlots[raw.folder] : -1,
                degree: 0,
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                vx: 0,
                vy: 0
            };
            nodes.push(node);
            nodeById[node.id] = node;
            neighbors[node.id] = {};
        });

        rawEdges.forEach(function (raw) {
            var source = nodeById[raw.source];
            var target = nodeById[raw.target];
            if (!source || !target) { return; }
            edges.push({ source: source, target: target });
            source.degree++;
            target.degree++;
            neighbors[source.id][target.id] = true;
            neighbors[target.id][source.id] = true;
        });

        nodes.forEach(function (node) {
            node.orphan = node.degree === 0;
            node.radius = Math.min(16, 4 + 2.2 * Math.sqrt(node.degree));
        });

        renderSvg();
        updateStats();
        fitView();
        initLabelDefault();
        startSimulation(1);
    }

    /* --------------------------------------------------------------------- */
    /* SVG rendering                                                           */
    /* --------------------------------------------------------------------- */

    function renderSvg() {
        edges.forEach(function (edge) {
            var line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('class', 'graph-edge');
            edge.el = line;
            edgesGroup.appendChild(line);
        });

        nodes.forEach(function (node) {
            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'graph-node');
            g.setAttribute('data-id', String(node.id));

            var circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('r', String(node.radius));
            circle.setAttribute('fill', nodeColor(node));

            var label = document.createElementNS(SVG_NS, 'text');
            label.setAttribute('class', 'graph-label');
            label.textContent = node.title.length > 24 ? node.title.slice(0, 23) + '…' : node.title;

            g.appendChild(circle);
            g.appendChild(label);
            node.el = g;
            node.circleEl = circle;
            node.labelEl = label;
            nodesGroup.appendChild(g);
        });

        updateLabelTransforms();
        updateLabelVisibility();
        updateOrphanVisibility();
    }

    function recolorNodes() {
        nodes.forEach(function (node) {
            node.circleEl.setAttribute('fill', nodeColor(node));
        });
    }

    function updateLabelVisibility() {
        // The checkbox is authoritative; hover and search always reveal labels
        viewport.classList.toggle('labels-hidden', !showLabels);
    }

    function isGraphCrowded() {
        // True when the average on-screen distance between nodes is too small
        // for labels to be readable. Only used to pick the checkbox default.
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var visible = 0;
        nodes.forEach(function (node) {
            if (node.orphan && !showOrphans) { return; }
            visible++;
            if (node.x < minX) { minX = node.x; }
            if (node.x > maxX) { maxX = node.x; }
            if (node.y < minY) { minY = node.y; }
            if (node.y > maxY) { maxY = node.y; }
        });
        if (visible <= 1) { return false; }
        var area = Math.max(1, (maxX - minX) * (maxY - minY));
        return Math.sqrt(area / visible) * scale < 95;
    }

    function initLabelDefault() {
        showLabels = !isGraphCrowded();
        var toggle = document.getElementById('graphShowLabels');
        if (toggle) { toggle.checked = showLabels; }
        updateLabelVisibility();
    }

    function updateOrphanVisibility() {
        nodes.forEach(function (node) {
            var hidden = node.orphan && !showOrphans;
            node.el.classList.toggle('initially-hidden', hidden);
        });
        updateLabelVisibility();
        updateStats();
    }

    function updateStats() {
        var statsEl = document.getElementById('graphStats');
        var template = statsEl.getAttribute('data-txt-stats') || '{{notes}} · {{links}}';
        var visibleNodes = showOrphans ? nodes.length : nodes.filter(function (n) { return !n.orphan; }).length;
        statsEl.textContent = template
            .replace('{{notes}}', String(visibleNodes))
            .replace('{{links}}', String(edges.length));
    }

    /* --------------------------------------------------------------------- */
    /* Force simulation                                                        */
    /* --------------------------------------------------------------------- */

    function startSimulation(newAlpha) {
        alpha = Math.max(alpha, newAlpha);
        if (!running) {
            running = true;
            requestAnimationFrame(tick);
        }
    }

    function tick() {
        simulate();
        draw();
        if (!userInteracted) {
            fitView();
        }
        alpha *= 0.985;
        if (alpha > 0.005) {
            requestAnimationFrame(tick);
        } else {
            running = false;
        }
    }

    function simulate() {
        var i, j, node, other, dx, dy, dist2, dist, force;

        // Repulsion between nodes: exact within the local grid neighborhood,
        // approximated against cell centroids farther away.
        var cellSize = 180;
        var cells = {};
        for (i = 0; i < nodes.length; i++) {
            node = nodes[i];
            var key = Math.floor(node.x / cellSize) + ':' + Math.floor(node.y / cellSize);
            var cell = cells[key];
            if (!cell) {
                cell = { x: 0, y: 0, count: 0, members: [], cx: Math.floor(node.x / cellSize), cy: Math.floor(node.y / cellSize) };
                cells[key] = cell;
            }
            cell.x += node.x;
            cell.y += node.y;
            cell.count++;
            cell.members.push(node);
        }
        var cellList = Object.keys(cells).map(function (k) { return cells[k]; });
        cellList.forEach(function (cell) {
            cell.x /= cell.count;
            cell.y /= cell.count;
        });

        for (i = 0; i < nodes.length; i++) {
            node = nodes[i];
            var nodeCx = Math.floor(node.x / cellSize);
            var nodeCy = Math.floor(node.y / cellSize);

            for (j = 0; j < cellList.length; j++) {
                var c = cellList[j];
                if (Math.abs(c.cx - nodeCx) <= 1 && Math.abs(c.cy - nodeCy) <= 1) {
                    // Near cell: node-by-node repulsion
                    for (var m = 0; m < c.members.length; m++) {
                        other = c.members[m];
                        if (other === node) { continue; }
                        dx = node.x - other.x;
                        dy = node.y - other.y;
                        dist2 = dx * dx + dy * dy;
                        if (dist2 < 1) { dx = (i % 2 ? 1 : -1); dy = 1; dist2 = 2; }
                        force = CHARGE * alpha / dist2;
                        dist = Math.sqrt(dist2);
                        node.vx += (dx / dist) * force;
                        node.vy += (dy / dist) * force;
                    }
                } else {
                    // Far cell: repulsion from its centroid, weighted by size
                    dx = node.x - c.x;
                    dy = node.y - c.y;
                    dist2 = dx * dx + dy * dy;
                    if (dist2 < 1) { continue; }
                    force = CHARGE * c.count * alpha / dist2;
                    dist = Math.sqrt(dist2);
                    node.vx += (dx / dist) * force;
                    node.vy += (dy / dist) * force;
                }
            }
        }

        // Link springs
        for (i = 0; i < edges.length; i++) {
            var edge = edges[i];
            dx = edge.target.x - edge.source.x;
            dy = edge.target.y - edge.source.y;
            dist = Math.sqrt(dx * dx + dy * dy) || 1;
            force = (dist - SPRING_LENGTH) / dist * SPRING_STRENGTH * alpha;
            var fx = dx * force;
            var fy = dy * force;
            // Heavier (higher-degree) endpoints move less
            var total = edge.source.degree + edge.target.degree;
            var sourceShare = edge.target.degree / total;
            edge.source.vx += fx * sourceShare;
            edge.source.vy += fy * sourceShare;
            edge.target.vx -= fx * (1 - sourceShare);
            edge.target.vy -= fy * (1 - sourceShare);
        }

        // Gravity toward the center + integration
        for (i = 0; i < nodes.length; i++) {
            node = nodes[i];
            node.vx += -node.x * GRAVITY * alpha;
            node.vy += -node.y * GRAVITY * alpha;
            if (node.dragging) {
                node.vx = 0;
                node.vy = 0;
                continue;
            }
            node.x += node.vx;
            node.y += node.vy;
            node.vx *= VELOCITY_RETAIN;
            node.vy *= VELOCITY_RETAIN;
        }
    }

    function draw() {
        var i;
        for (i = 0; i < edges.length; i++) {
            var edge = edges[i];
            edge.el.setAttribute('x1', edge.source.x.toFixed(1));
            edge.el.setAttribute('y1', edge.source.y.toFixed(1));
            edge.el.setAttribute('x2', edge.target.x.toFixed(1));
            edge.el.setAttribute('y2', edge.target.y.toFixed(1));
        }
        for (i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            node.el.setAttribute('transform', 'translate(' + node.x.toFixed(1) + ',' + node.y.toFixed(1) + ')');
        }
    }

    /* --------------------------------------------------------------------- */
    /* Pan / zoom / fit                                                        */
    /* --------------------------------------------------------------------- */

    function applyTransform() {
        viewport.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + scale + ')');
        updateLabelTransforms();
        updateLabelVisibility();
    }

    function updateLabelTransforms() {
        // Counter-scale labels so they keep a constant on-screen size
        var inv = 1 / scale;
        nodes.forEach(function (node) {
            if (!node.labelEl) { return; }
            node.labelEl.setAttribute('transform', 'scale(' + inv + ')');
            node.labelEl.setAttribute('y', String(node.radius * scale + 14));
        });
    }

    function fitView() {
        if (nodes.length === 0) { return; }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(function (node) {
            if (node.orphan && !showOrphans) { return; }
            if (node.x < minX) { minX = node.x; }
            if (node.x > maxX) { maxX = node.x; }
            if (node.y < minY) { minY = node.y; }
            if (node.y > maxY) { maxY = node.y; }
        });
        if (minX === Infinity) { return; }
        var pad = 60;
        var graphW = Math.max(1, maxX - minX + pad * 2);
        var graphH = Math.max(1, maxY - minY + pad * 2);
        scale = Math.min(2, Math.min(width / graphW, height / graphH));
        tx = width / 2 - (minX + maxX) / 2 * scale;
        ty = height / 2 - (minY + maxY) / 2 * scale;
        applyTransform();
    }

    function zoomAt(clientX, clientY, factor) {
        var rect = svg.getBoundingClientRect();
        var mx = clientX - rect.left;
        var my = clientY - rect.top;
        var newScale = Math.max(0.1, Math.min(5, scale * factor));
        tx = mx - (mx - tx) * (newScale / scale);
        ty = my - (my - ty) * (newScale / scale);
        scale = newScale;
        userInteracted = true;
        applyTransform();
    }

    function setupPanZoom() {
        svg.addEventListener('wheel', function (e) {
            e.preventDefault();
            zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.002));
        }, { passive: false });

        var pointers = {};       // pointerId -> {x, y}
        var panStart = null;     // {x, y, tx, ty}
        var pinchStart = null;   // {dist, scale, cx, cy}
        var dragNode = null;
        var dragMoved = 0;

        svg.addEventListener('pointerdown', function (e) {
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            var pointerCount = Object.keys(pointers).length;

            if (pointerCount === 2) {
                // Pinch zoom takes over from pan/drag
                var ids = Object.keys(pointers);
                var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
                pinchStart = {
                    dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
                    scale: scale,
                    tx: tx, ty: ty,
                    cx: (p1.x + p2.x) / 2,
                    cy: (p1.y + p2.y) / 2
                };
                panStart = null;
                if (dragNode) { dragNode.dragging = false; dragNode = null; }
                return;
            }

            var nodeEl = e.target.closest('.graph-node');
            if (nodeEl) {
                dragNode = nodeById[parseInt(nodeEl.getAttribute('data-id'), 10)];
                dragNode.dragging = true;
                dragMoved = 0;
            } else {
                panStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
            }
            svg.setPointerCapture(e.pointerId);
        });

        svg.addEventListener('pointermove', function (e) {
            if (!pointers[e.pointerId]) {
                handleHover(e);
                return;
            }
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

            if (pinchStart) {
                var ids = Object.keys(pointers);
                if (ids.length >= 2) {
                    var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
                    var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
                    var factor = dist / pinchStart.dist;
                    scale = Math.max(0.1, Math.min(5, pinchStart.scale * factor));
                    tx = pinchStart.cx - (pinchStart.cx - pinchStart.tx) * (scale / pinchStart.scale);
                    ty = pinchStart.cy - (pinchStart.cy - pinchStart.ty) * (scale / pinchStart.scale);
                    userInteracted = true;
                    applyTransform();
                }
                return;
            }

            if (dragNode) {
                var rect = svg.getBoundingClientRect();
                dragNode.x = (e.clientX - rect.left - tx) / scale;
                dragNode.y = (e.clientY - rect.top - ty) / scale;
                dragMoved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
                userInteracted = true;
                startSimulation(0.3);
                return;
            }

            if (panStart) {
                tx = panStart.tx + (e.clientX - panStart.x);
                ty = panStart.ty + (e.clientY - panStart.y);
                userInteracted = true;
                applyTransform();
            }
        });

        function endPointer(e) {
            delete pointers[e.pointerId];
            if (Object.keys(pointers).length < 2) {
                pinchStart = null;
            }
            if (dragNode) {
                dragNode.dragging = false;
                if (dragMoved < 5) {
                    openNote(dragNode);
                }
                dragNode = null;
            }
            panStart = null;
        }
        svg.addEventListener('pointerup', endPointer);
        svg.addEventListener('pointercancel', endPointer);
    }

    /* --------------------------------------------------------------------- */
    /* Hover, tooltip, navigation                                              */
    /* --------------------------------------------------------------------- */

    function openNote(node) {
        var workspace = getPageWorkspace();
        window.location.href = buildNoteNavigationUrl(node.id, workspace);
    }

    function handleHover(e) {
        var nodeEl = e.target.closest ? e.target.closest('.graph-node') : null;
        var node = nodeEl ? nodeById[parseInt(nodeEl.getAttribute('data-id'), 10)] : null;
        if (node === hoveredNode) {
            if (node) { moveTooltip(e); }
            return;
        }
        hoveredNode = node;
        if (node) {
            highlightNeighborhood(node);
            showTooltip(node, e);
        } else {
            clearHighlight();
            hideTooltip();
        }
    }

    function highlightNeighborhood(node) {
        svg.classList.add('has-highlight');
        nodes.forEach(function (other) {
            var isNeighbor = other === node || neighbors[node.id][other.id] === true;
            other.el.classList.toggle('hl', isNeighbor);
        });
        edges.forEach(function (edge) {
            edge.el.classList.toggle('hl', edge.source === node || edge.target === node);
        });
    }

    function clearHighlight() {
        svg.classList.remove('has-highlight');
        nodes.forEach(function (node) { node.el.classList.remove('hl'); });
        edges.forEach(function (edge) { edge.el.classList.remove('hl'); });
    }

    function showTooltip(node, e) {
        tooltip.textContent = '';
        var title = document.createElement('div');
        title.className = 'graph-tooltip-title';
        title.textContent = node.title;
        tooltip.appendChild(title);

        var meta = document.createElement('div');
        meta.className = 'graph-tooltip-meta';
        var parts = [];
        if (node.folder) { parts.push(node.folder); }
        var template = tooltip.getAttribute('data-txt-links') || '{{count}} links';
        parts.push(template.replace('{{count}}', String(node.degree)));
        meta.textContent = parts.join(' · ');
        tooltip.appendChild(meta);

        tooltip.classList.remove('initially-hidden');
        moveTooltip(e);
    }

    function moveTooltip(e) {
        var rect = wrapper.getBoundingClientRect();
        var x = e.clientX - rect.left + 14;
        var y = e.clientY - rect.top + 14;
        // Keep the tooltip inside the canvas
        if (x + tooltip.offsetWidth > rect.width - 8) {
            x = e.clientX - rect.left - tooltip.offsetWidth - 14;
        }
        if (y + tooltip.offsetHeight > rect.height - 8) {
            y = e.clientY - rect.top - tooltip.offsetHeight - 14;
        }
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }

    function hideTooltip() {
        tooltip.classList.add('initially-hidden');
    }

    /* --------------------------------------------------------------------- */
    /* Search                                                                  */
    /* --------------------------------------------------------------------- */

    function applySearch() {
        var term = searchTerm.trim().toLowerCase();
        svg.classList.toggle('has-search', term !== '');
        nodes.forEach(function (node) {
            var hit = term !== '' && node.title.toLowerCase().indexOf(term) !== -1;
            node.el.classList.toggle('search-hit', hit);
        });
    }

    /* --------------------------------------------------------------------- */
    /* Init                                                                    */
    /* --------------------------------------------------------------------- */

    function resize() {
        width = wrapper.clientWidth;
        height = wrapper.clientHeight;
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        if (!userInteracted) {
            fitView();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        wrapper = document.getElementById('graphCanvasWrapper');
        svg = document.getElementById('graphSvg');
        tooltip = document.getElementById('graphTooltip');

        viewport = document.createElementNS(SVG_NS, 'g');
        edgesGroup = document.createElementNS(SVG_NS, 'g');
        nodesGroup = document.createElementNS(SVG_NS, 'g');
        viewport.appendChild(edgesGroup);
        viewport.appendChild(nodesGroup);
        svg.appendChild(viewport);

        var backBtn = document.getElementById('backToNotesBtn');
        if (backBtn) { backBtn.addEventListener('click', goBackToNotes); }
        var backHomeBtn = document.getElementById('backToHomeBtn');
        if (backHomeBtn) { backHomeBtn.addEventListener('click', goBackToHome); }

        var searchInput = document.getElementById('graphSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                searchTerm = searchInput.value;
                applySearch();
            });
        }

        var orphansToggle = document.getElementById('graphShowOrphans');
        if (orphansToggle) {
            orphansToggle.addEventListener('change', function () {
                showOrphans = orphansToggle.checked;
                updateOrphanVisibility();
            });
        }

        var labelsToggle = document.getElementById('graphShowLabels');
        if (labelsToggle) {
            labelsToggle.addEventListener('change', function () {
                showLabels = labelsToggle.checked;
                updateLabelVisibility();
            });
        }

        svg.addEventListener('pointerleave', function () {
            hoveredNode = null;
            clearHighlight();
            hideTooltip();
        });

        // Recolor nodes when the theme changes
        new MutationObserver(recolorNodes).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        window.addEventListener('resize', resize);
        resize();
        setupPanZoom();
        loadGraph();
    });
})();

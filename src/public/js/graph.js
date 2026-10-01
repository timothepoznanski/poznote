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
                               // a folder hub adds {isFolder: true, noteCount, ring}, its id is 'f' + folder id
    var edges = [];            // {source: node, target: node, el}; {membership: true} ties a note or subfolder to its folder
    var nodeById = {};
    var hubs = [];             // the folder nodes
    var neighbors = {};        // id -> {otherId: true}
    var rawData = null;        // last /api/v1/graph response, kept to rebuild when folders are toggled

    var svg, viewport, edgesGroup, nodesGroup, tooltip, wrapper;
    var width = 0, height = 0;

    // Pan/zoom transform
    var tx = 0, ty = 0, scale = 1;
    var userInteracted = false;

    // Simulation
    var alpha = 0;
    var running = false;
    var SPRING_LENGTH = 90;
    var HUB_GAP = 40;          // room left between the wheels of two folder hubs
    var GROUP_GAP = 70;        // room left between two groups laid out by "Separate groups"
    var LONE_SPACING = 50;     // distance between two unlinked notes in the block they form there
    var TREE_COLUMN = 200;     // tree view: distance between two levels, when the canvas has the room
    var TREE_ROW = 26;         // tree view: distance between two notes
    var TREE_LABEL_ROOM = 190; // tree view: screen width kept for the note titles
    var TREE_PAD = 24;         // tree view: margin around the tree
    var TREE_MIN_SCALE = 0.85; // tree view: below this a folder name runs into the row above
    var SPRING_STRENGTH = 0.5;
    var CHARGE = 1500;
    var GRAVITY = 0.04;
    var VELOCITY_RETAIN = 0.6;

    var showOrphans = true;
    var showLabels = true;
    var showFolders = false;
    var treeMode = false;      // tree view: folders, subfolders and notes in columns, no simulation
    var searchTerm = '';
    var folderFilter = '';     // '' = all folders
    var hoveredNode = null;

    var PREF_SHOW_ORPHANS = 'graph-show-orphans';
    var PREF_SHOW_LABELS = 'graph-show-labels';
    var PREF_SHOW_FOLDERS = 'graph-show-folders';
    var PREF_TREE_LAYOUT = 'graph-tree-layout';
    var PREF_POSITIONS = 'graph-positions';

    function prefStorage() {
        return window.__poznoteUserStorage || window.localStorage;
    }

    function readPref(key) {
        try {
            var value = prefStorage().getItem(key);
            return value === null ? null : value === '1';
        } catch (e) {
            return null;
        }
    }

    function savePref(key, value) {
        try {
            prefStorage().setItem(key, value ? '1' : '0');
        } catch (e) { /* storage unavailable */ }
    }

    /* --------------------------------------------------------------------- */
    /* Saved positions (pinned nodes)                                          */
    /* --------------------------------------------------------------------- */

    function positionsKey() {
        var workspace = getPageWorkspace();
        return PREF_POSITIONS + (workspace ? ':' + workspace : '');
    }

    function loadSavedPositions() {
        try {
            var raw = prefStorage().getItem(positionsKey());
            var parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    // The tree view is built on the folders, whatever the "Folders" box says
    function hubsShown() {
        return showFolders || treeMode;
    }

    function isFolderId(id) {
        return String(id).charAt(0) === 'f';
    }

    function savePinnedPositions() {
        var positions = {};
        var any = false;
        if (!hubsShown()) {
            // The hubs are not on screen: keep where they were dropped
            var saved = loadSavedPositions();
            Object.keys(saved).forEach(function (id) {
                if (isFolderId(id)) {
                    positions[id] = saved[id];
                    any = true;
                }
            });
        }
        nodes.forEach(function (node) {
            if (node.pinned) {
                positions[node.id] = [Math.round(node.x * 10) / 10, Math.round(node.y * 10) / 10];
                any = true;
            }
        });
        try {
            if (any) {
                prefStorage().setItem(positionsKey(), JSON.stringify(positions));
            } else {
                prefStorage().removeItem(positionsKey());
            }
        } catch (e) { /* storage unavailable */ }
    }

    function clearSavedPositions() {
        try {
            prefStorage().removeItem(positionsKey());
        } catch (e) { /* storage unavailable */ }
    }

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
            rawData = data;
            initFoldersToggle(data.folders || []);
            initTreeToggle(data.folders || []);
            populateFolderFilter(folderNamesOf(data.nodes));
            buildGraph(false);
            fitView();
            initLabelDefault();
            startSimulation(1);
        })
        .catch(function () {
            document.getElementById('graphLoading').classList.add('initially-hidden');
            document.getElementById('graphEmpty').classList.remove('initially-hidden');
        });
    }

    /* --------------------------------------------------------------------- */
    /* Graph construction                                                      */
    /* --------------------------------------------------------------------- */

    function folderNamesOf(rawNodes) {
        var folderNames = {};
        rawNodes.forEach(function (n) {
            if (n.folder) { folderNames[n.folder] = true; }
        });
        return Object.keys(folderNames).sort(function (a, b) {
            return a.localeCompare(b);
        });
    }

    // Builds the nodes, edges and SVG from rawData. Runs again when the
    // folder hubs or the tree view are toggled. keepPositions leaves the
    // notes where they are, which is right when the hubs are hidden; showing
    // them lays the graph out again, each folder's notes around its hub (a
    // layout settled without the hubs does not untangle into wheels).
    function buildGraph(keepPositions) {
        var rawNodes = rawData.nodes;
        var rawEdges = rawData.edges || [];
        var rawFolders = hubsShown() ? (rawData.folders || []) : [];

        var previous = keepPositions ? nodeById : {};
        nodes = [];
        edges = [];
        nodeById = {};
        neighbors = {};
        hoveredNode = null;
        edgesGroup.textContent = '';
        nodesGroup.textContent = '';
        svg.classList.remove('has-highlight');
        hideTooltip();

        // Assign palette slots to folders in alphabetical order (fixed order,
        // never cycled); folders beyond the 8 slots use the neutral color.
        var folderSlots = {};
        folderNamesOf(rawNodes).forEach(function (name, i) {
            folderSlots[name] = i < PALETTE_LIGHT.length ? i : -1;
        });

        function addNode(node) {
            var before = previous[node.id];
            if (before) {
                node.x = before.x;
                node.y = before.y;
            }
            node.degree = 0;
            node.vx = 0;
            node.vy = 0;
            nodes.push(node);
            nodeById[node.id] = node;
            neighbors[node.id] = {};
        }

        function addEdge(source, target, extra) {
            var edge = { source: source, target: target };
            if (extra) {
                edge.membership = true;
                edge.length = extra.length;
            }
            edges.push(edge);
            source.degree++;
            target.degree++;
            neighbors[source.id][target.id] = true;
            neighbors[target.id][source.id] = true;
        }

        // Initial positions on a spiral so the simulation starts untangled
        var n = rawNodes.length;
        var spread = Math.sqrt(n) * 26 + 40;
        rawNodes.forEach(function (raw, i) {
            var angle = i * 2.39996;             // golden angle
            var radius = spread * Math.sqrt((i + 1) / n);
            addNode({
                id: raw.id,
                title: raw.title,
                folder: raw.folder || '',
                folderId: raw.folder_id,
                folderSlot: raw.folder && folderSlots[raw.folder] !== undefined ? folderSlots[raw.folder] : -1,
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius
            });
        });

        rawEdges.forEach(function (raw) {
            var source = nodeById[raw.source];
            var target = nodeById[raw.target];
            if (!source || !target) { return; }
            addEdge(source, target);
        });

        // Tooltips count the links between notes, not the tie to the folder
        nodes.forEach(function (node) {
            node.linkCount = node.degree;
        });

        // Folder hubs: one node per folder, tied to its notes and to its
        // parent folder. Top-level hubs start on a wide spiral, a subfolder
        // next to its parent, and the notes of a folder in a ring around it.
        var members = {};          // folder id -> [note node]
        rawNodes.forEach(function (raw) {
            if (raw.folder_id === null || raw.folder_id === undefined) { return; }
            (members[raw.folder_id] = members[raw.folder_id] || []).push(nodeById[raw.id]);
        });
        var subfolders = {};       // parent folder id ('' = top level) -> [raw folder]
        rawFolders.forEach(function (raw) {
            var parentKey = raw.parent_id === null || raw.parent_id === undefined ? '' : raw.parent_id;
            (subfolders[parentKey] = subfolders[parentKey] || []).push(raw);
        });
        function placeFolder(raw, x, y, outward) {
            if (nodeById['f' + raw.id]) { return; }
            var notes = members[raw.id] || [];
            var ring = wheelRadius(notes.length);
            addNode({
                id: 'f' + raw.id,
                title: raw.name,
                folder: raw.name,
                folderSlot: folderSlots[raw.name] !== undefined ? folderSlots[raw.name] : -1,
                isFolder: true,
                parentId: raw.parent_id,
                noteCount: notes.length,
                ring: ring,
                x: x,
                y: y
            });
            notes.forEach(function (note, i) {
                var angle = i * 2 * Math.PI / notes.length;
                note.x = x + Math.cos(angle) * ring;
                note.y = y + Math.sin(angle) * ring;
            });
            // Subfolders fan out away from the center of the graph
            var children = subfolders[raw.id] || [];
            children.forEach(function (child, i) {
                var angle = outward + (i - (children.length - 1) / 2) * 0.9;
                var reach = ring + wheelRadius((members[child.id] || []).length) + HUB_GAP;
                placeFolder(child, x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, angle);
            });
        }
        var widest = 0;
        rawFolders.forEach(function (raw) {
            widest = Math.max(widest, wheelRadius((members[raw.id] || []).length));
        });
        (subfolders[''] || []).forEach(function (raw, i) {
            var angle = i * 2.39996;
            var radius = (widest * 2 + HUB_GAP) * Math.sqrt(i);
            placeFolder(raw, Math.cos(angle) * radius, Math.sin(angle) * radius, angle);
        });
        // Whatever is left has a broken parent chain: place it on its own
        rawFolders.forEach(function (raw, i) {
            placeFolder(raw, (i + 1) * 40, -(i + 1) * 40, 0);
        });
        rawFolders.forEach(function (raw) {
            var hub = nodeById['f' + raw.id];
            (members[raw.id] || []).forEach(function (note) {
                addEdge(note, hub, { length: hub.ring });
                note.anchored = true;
            });
            var parent = raw.parent_id === null || raw.parent_id === undefined ? null : nodeById['f' + raw.parent_id];
            if (parent && parent !== hub) {
                addEdge(hub, parent, { length: hub.ring + parent.ring + HUB_GAP });
            }
        });

        hubs = nodes.filter(function (node) { return node.isFolder; });

        nodes.forEach(function (node) {
            node.orphan = node.degree === 0;
            node.radius = node.isFolder
                ? Math.min(18, 7 + 1.4 * Math.sqrt(node.degree))
                : Math.min(16, 4 + 2.2 * Math.sqrt(node.degree));
        });

        assignComponents();
        restorePinnedPositions();
        updateSeparateButton();

        renderSvg();
        applySearch();
    }

    // Distance between a folder hub and its notes: the usual link length,
    // wider for a folder holding more notes than fit on that circle.
    function wheelRadius(noteCount) {
        if (noteCount === 0) { return SPRING_LENGTH / 3; }
        return Math.min(SPRING_LENGTH * 3, Math.max(SPRING_LENGTH, noteCount * 2.5));
    }

    function initFoldersToggle(rawFolders) {
        var toggle = document.getElementById('graphShowFolders');
        if (!toggle || rawFolders.length === 0) { return; }
        showFolders = readPref(PREF_SHOW_FOLDERS) === true;
        toggle.checked = showFolders;
        toggle.parentNode.classList.remove('initially-hidden');
        toggle.addEventListener('change', function () {
            showFolders = toggle.checked;
            savePref(PREF_SHOW_FOLDERS, showFolders);
            buildGraph(!showFolders);
            if (!userInteracted) {
                fitView();
            }
            startSimulation(0.8);
        });
    }

    /* --------------------------------------------------------------------- */
    /* Tree view                                                               */
    /* --------------------------------------------------------------------- */

    function initTreeToggle(rawFolders) {
        var btn = document.getElementById('graphTreeLayout');
        if (!btn || rawFolders.length === 0) { return; }
        treeMode = readPref(PREF_TREE_LAYOUT) === true;
        btn.classList.remove('initially-hidden');
        syncTreeUi();
        btn.addEventListener('click', function () {
            treeMode = !treeMode;
            savePref(PREF_TREE_LAYOUT, treeMode);
            // A tree without its titles says nothing: show them, unless the
            // box was unticked on purpose.
            if (treeMode && readPref(PREF_SHOW_LABELS) === null) {
                showLabels = true;
                var labelsToggle = document.getElementById('graphShowLabels');
                if (labelsToggle) { labelsToggle.checked = true; }
            }
            syncTreeUi();
            alpha = 0;
            buildGraph(false);
            userInteracted = false;
            fitView();
            startSimulation(1);
        });
    }

    // The tree is laid out by rule: nothing to drag, pin, reset or separate,
    // and the folders are always part of it.
    function syncTreeUi() {
        var btn = document.getElementById('graphTreeLayout');
        if (btn) { btn.setAttribute('aria-pressed', treeMode ? 'true' : 'false'); }
        wrapper.classList.toggle('tree-layout', treeMode);
        var foldersToggle = document.getElementById('graphShowFolders');
        if (foldersToggle) { foldersToggle.parentNode.classList.toggle('initially-hidden', treeMode); }
    }

    // Columns from left to right, as in a file explorer: what a folder holds
    // (subfolders first, then notes) sits one column after it, one note per
    // row, and the folder at mid-height of it all. Notes outside any folder
    // come last, in the first column. Only what is on screen takes room.
    function layoutTree() {
        var subfolders = {};       // hub id -> [hub]
        var notes = {};            // hub id -> [note]
        var roots = [];
        var loose = [];
        nodes.forEach(function (node) {
            if (!node.visible) { return; }
            var parent = nodeById['f' + (node.isFolder ? node.parentId : node.folderId)];
            if (!parent || !parent.visible || parent === node) {
                (node.isFolder ? roots : loose).push(node);
            } else {
                var map = node.isFolder ? subfolders : notes;
                (map[parent.id] = map[parent.id] || []).push(node);
            }
        });
        function byTitle(a, b) {
            return a.title.localeCompare(b.title);
        }

        var depthOf = {};
        function measure(hub, depth) {
            if (depthOf[hub.id] !== undefined) { return; }
            depthOf[hub.id] = depth;
            (subfolders[hub.id] || []).forEach(function (child) { measure(child, depth + 1); });
        }
        roots.sort(byTitle).forEach(function (hub) { measure(hub, 0); });
        // A folder left out has a broken parent chain: it starts a tree
        nodes.forEach(function (node) {
            if (node.isFolder && node.visible && depthOf[node.id] === undefined) {
                roots.push(node);
                measure(node, 0);
            }
        });

        // A column is as wide as the canvas allows, the titles need their
        // room, and never narrower than the longest folder name written in
        // it: on a narrow screen the tree runs off to the right instead.
        var widths = [];
        nodes.forEach(function (node) {
            var depth = depthOf[node.id];
            if (!node.isFolder || depth === undefined) { return; }
            var name = node.labelEl.getComputedTextLength() || node.labelEl.textContent.length * 7;
            widths[depth] = Math.max(widths[depth] || 0, name / TREE_MIN_SCALE + node.radius + 22);
        });
        var share = Math.min(TREE_COLUMN, (width - treeLabelRoom() - TREE_PAD * 2) / Math.max(1, widths.length));
        var columnX = [0];
        widths.forEach(function (nameWidth, depth) {
            columnX[depth + 1] = columnX[depth] + Math.max(nameWidth, share);
        });

        var row = 0;
        var placed = {};
        function place(hub) {
            if (placed[hub.id]) { return null; }
            placed[hub.id] = true;
            var top = Infinity;
            var bottom = -Infinity;
            (subfolders[hub.id] || []).sort(byTitle).forEach(function (child) {
                var span = place(child);
                if (!span) { return; }
                top = Math.min(top, span.top);
                bottom = Math.max(bottom, span.bottom);
                row += 0.5;
            });
            (notes[hub.id] || []).sort(byTitle).forEach(function (note) {
                note.x = columnX[depthOf[hub.id] + 1];
                note.y = row * TREE_ROW;
                top = Math.min(top, note.y);
                bottom = Math.max(bottom, note.y);
                row++;
            });
            if (top === Infinity) {
                top = bottom = row * TREE_ROW;
                row++;
            }
            hub.x = columnX[depthOf[hub.id]];
            hub.y = (top + bottom) / 2;
            return { top: top, bottom: bottom };
        }
        roots.forEach(function (hub) {
            if (place(hub)) { row++; }
        });
        loose.sort(byTitle).forEach(function (note) {
            note.x = 0;
            note.y = row * TREE_ROW;
            row++;
        });
    }

    function treeLabelRoom() {
        return showLabels ? Math.min(TREE_LABEL_ROOM, width * 0.4) : 0;
    }

    // Tree view: a folder reaches what it holds through a horizontal line, a
    // vertical trunk shared by all its children, and a horizontal line again;
    // a link between two notes bows out to the right of them.
    function treeEdgePath(edge) {
        var from = edge.target;
        var to = edge.source;
        if (edge.membership) {
            return 'M' + from.x.toFixed(1) + ' ' + from.y.toFixed(1) +
                'H' + ((from.x + to.x) / 2).toFixed(1) +
                'V' + to.y.toFixed(1) +
                'H' + to.x.toFixed(1);
        }
        var bow = Math.min(140, 24 + Math.abs(to.y - from.y) * 0.3);
        return 'M' + from.x.toFixed(1) + ' ' + from.y.toFixed(1) +
            'C' + (from.x + bow).toFixed(1) + ' ' + from.y.toFixed(1) +
            ' ' + (to.x + bow).toFixed(1) + ' ' + to.y.toFixed(1) +
            ' ' + to.x.toFixed(1) + ' ' + to.y.toFixed(1);
    }

    // The folder filter: a button showing the current choice, which opens a
    // dialog listing the folders under a field that narrows the list.
    function populateFolderFilter(folderNames) {
        var btn = document.getElementById('graphFolderFilterBtn');
        var label = document.getElementById('graphFolderFilterLabel');
        var modal = document.getElementById('graphFolderModal');
        var search = document.getElementById('graphFolderSearch');
        var list = document.getElementById('graphFolderList');
        var closeBtn = document.getElementById('graphFolderModalClose');
        if (!btn || !label || !modal || !search || !list || folderNames.length === 0) { return; }
        var allLabel = label.textContent;

        function isOpen() {
            return modal.style.display === 'flex';
        }

        function close() {
            modal.style.display = 'none';
            btn.focus();
        }

        function choose(name) {
            folderFilter = name;
            label.textContent = name === '' ? allLabel : name;
            btn.classList.toggle('is-filtering', name !== '');
            close();
            updateVisibility();
            // Refit so the filtered subgraph fills the canvas.
            userInteracted = false;
            fitView();
        }

        function buildOption(name, text, icon) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'graph-folder-option';
            if (name === folderFilter) {
                option.classList.add('is-selected');
                option.setAttribute('aria-current', 'true');
            }
            var iconEl = document.createElement('i');
            iconEl.className = 'lucide ' + icon;
            var textEl = document.createElement('span');
            textEl.textContent = text;
            option.appendChild(iconEl);
            option.appendChild(textEl);
            option.addEventListener('click', function () { choose(name); });
            return option;
        }

        function render() {
            var term = search.value.trim().toLowerCase();
            list.textContent = '';
            if (term === '' || allLabel.toLowerCase().indexOf(term) !== -1) {
                list.appendChild(buildOption('', allLabel, 'lucide-layers'));
            }
            folderNames.forEach(function (name) {
                if (term === '' || name.toLowerCase().indexOf(term) !== -1) {
                    list.appendChild(buildOption(name, name, 'lucide-folder'));
                }
            });
            if (!list.firstChild) {
                var empty = document.createElement('p');
                empty.className = 'graph-folder-empty';
                empty.textContent = list.getAttribute('data-txt-empty') || '';
                list.appendChild(empty);
            }
        }

        btn.classList.remove('initially-hidden');
        btn.addEventListener('click', function () {
            search.value = '';
            render();
            modal.style.display = 'flex';
            search.focus();
            var selected = list.querySelector('.is-selected');
            if (selected) { selected.scrollIntoView({ block: 'nearest' }); }
        });
        search.addEventListener('input', render);
        search.addEventListener('keydown', function (e) {
            // Enter takes the first folder left by the filter
            if (e.key !== 'Enter') { return; }
            var first = list.querySelector('.graph-folder-option');
            if (first) {
                e.preventDefault();
                first.click();
            }
        });
        if (closeBtn) { closeBtn.addEventListener('click', close); }
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { close(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) { close(); }
        });
    }

    // Flood-fill so every node knows its connected component; dragging a
    // node moves the whole component as one rigid group.
    function assignComponents() {
        var next = 0;
        nodes.forEach(function (node) {
            if (node.component !== undefined) { return; }
            var queue = [node];
            node.component = next;
            while (queue.length) {
                var current = queue.pop();
                Object.keys(neighbors[current.id]).forEach(function (otherId) {
                    var other = nodeById[otherId];
                    if (other && other.component === undefined) {
                        other.component = next;
                        queue.push(other);
                    }
                });
            }
            next++;
        });
    }

    function componentNodes(node) {
        return nodes.filter(function (other) { return other.component === node.component; });
    }

    function restorePinnedPositions() {
        var saved = loadSavedPositions();
        nodes.forEach(function (node) {
            var pos = saved[node.id];
            if (pos && pos.length === 2 && isFinite(pos[0]) && isFinite(pos[1])) {
                node.x = pos[0];
                node.y = pos[1];
                node.pinned = true;
            }
        });
        updateResetButton();
    }

    function resetLayout() {
        clearSavedPositions();
        nodes.forEach(function (node) {
            node.pinned = false;
            node.vx = 0;
            node.vy = 0;
        });
        userInteracted = false;
        updateResetButton();
        startSimulation(1);
    }

    function updateResetButton() {
        var btn = document.getElementById('graphResetLayout');
        if (!btn) { return; }
        var anyPinned = nodes.some(function (node) { return node.pinned; });
        btn.classList.toggle('initially-hidden', !anyPinned || treeMode);
    }

    // Lays the connected groups out side by side in rows, the ones on screen
    // first. A group moves as one block, so its own arrangement is kept, and
    // is pinned where it lands, exactly as if it had been dragged there:
    // "Reset layout" undoes it. The notes linked to nothing are not a group
    // each: they stay together, as one block of dots placed last.
    function separateGroups() {
        // Groups are packed by their extent: let a running simulation settle
        while (alpha > 0.005) {
            simulate();
            alpha *= 0.985;
        }

        var byComponent = {};
        var groups = [];
        nodes.forEach(function (node) {
            var group = byComponent[node.component];
            if (!group) {
                group = { nodes: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, visible: false };
                byComponent[node.component] = group;
                groups.push(group);
            }
            group.nodes.push(node);
            group.minX = Math.min(group.minX, node.x);
            group.minY = Math.min(group.minY, node.y);
            group.maxX = Math.max(group.maxX, node.x);
            group.maxY = Math.max(group.maxY, node.y);
            if (node.visible) { group.visible = true; }
        });
        if (groups.length < 2) { return; }

        var lone = groups.filter(function (group) { return group.nodes.length === 1; });
        if (lone.length > 1) {
            groups = groups.filter(function (group) { return group.nodes.length > 1; });
            lone.sort(function (a, b) { return b.visible - a.visible; });
            var columns = Math.ceil(Math.sqrt(lone.length * width / Math.max(1, height)));
            var block = { nodes: [], minX: 0, minY: 0, maxX: 0, maxY: 0, visible: lone[0].visible, last: true };
            lone.forEach(function (group, i) {
                var node = group.nodes[0];
                node.x = (i % columns) * LONE_SPACING;
                node.y = Math.floor(i / columns) * LONE_SPACING;
                block.nodes.push(node);
                block.maxX = Math.max(block.maxX, node.x);
                block.maxY = Math.max(block.maxY, node.y);
            });
            groups.push(block);
        }

        // Tallest first, so that a row holds groups of similar height
        var area = 0;
        var widest = 0;
        groups.forEach(function (group) {
            group.w = group.maxX - group.minX + GROUP_GAP;
            group.h = group.maxY - group.minY + GROUP_GAP;
            area += group.w * group.h;
            widest = Math.max(widest, group.w);
        });
        groups.sort(function (a, b) {
            return (b.visible - a.visible) || ((a.last ? 1 : 0) - (b.last ? 1 : 0)) || (b.h - a.h) || (b.w - a.w);
        });

        // Rows as wide as the canvas is, relative to its height
        var rowWidth = Math.max(widest, Math.sqrt(area * width / Math.max(1, height)));
        var rows = [];
        var row = null;
        groups.forEach(function (group) {
            if (!row || row.w + group.w > rowWidth) {
                row = { groups: [], w: 0, h: 0 };
                rows.push(row);
            }
            row.groups.push(group);
            row.w += group.w;
            row.h = Math.max(row.h, group.h);
        });

        var y = 0;
        rows.forEach(function (current) {
            var x = 0;
            current.groups.forEach(function (group) {
                var dx = x + GROUP_GAP / 2 - group.minX;
                var dy = y + (current.h - group.h + GROUP_GAP) / 2 - group.minY;
                group.nodes.forEach(function (node) {
                    node.x += dx;
                    node.y += dy;
                    node.vx = 0;
                    node.vy = 0;
                    node.pinned = true;
                });
                x += group.w;
            });
            y += current.h;
        });

        savePinnedPositions();
        updateResetButton();
        draw();
        userInteracted = false;
        fitView();
    }

    function updateSeparateButton() {
        var btn = document.getElementById('graphSeparateGroups');
        if (!btn) { return; }
        var several = nodes.some(function (node) { return node.component > 0; });
        btn.classList.toggle('initially-hidden', !several || treeMode);
    }

    /* --------------------------------------------------------------------- */
    /* SVG rendering                                                           */
    /* --------------------------------------------------------------------- */

    function renderSvg() {
        edges.forEach(function (edge) {
            var line = document.createElementNS(SVG_NS, 'path');
            line.setAttribute('class', edge.membership ? 'graph-edge graph-edge-folder' : 'graph-edge');
            edge.el = line;
            edgesGroup.appendChild(line);
        });

        nodes.forEach(function (node) {
            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', node.isFolder ? 'graph-node is-folder' : 'graph-node');
            g.setAttribute('data-id', String(node.id));

            var circle = document.createElementNS(SVG_NS, 'circle');
            circle.setAttribute('r', String(node.radius));
            paintNode(node, g, circle);

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
        updateVisibility();
    }

    // A note is a filled dot; a folder hub is a ring in the folder color
    // (css/graph.css strokes it with currentColor).
    function paintNode(node, groupEl, circleEl) {
        if (node.isFolder) {
            groupEl.style.color = nodeColor(node);
        } else {
            circleEl.setAttribute('fill', nodeColor(node));
        }
    }

    function recolorNodes() {
        nodes.forEach(function (node) {
            paintNode(node, node.el, node.circleEl);
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
            if (!node.visible) { return; }
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
        var saved = readPref(PREF_SHOW_LABELS);
        showLabels = saved === null ? (treeMode || !isGraphCrowded()) : saved;
        var toggle = document.getElementById('graphShowLabels');
        if (toggle) { toggle.checked = showLabels; }
        updateLabelVisibility();
    }

    function nodeMatchesFolder(node) {
        return folderFilter === '' || node.folder === folderFilter;
    }

    function updateVisibility() {
        // An edge remains visible only when both endpoints belong to the
        // selected folder. Nodes without visible links follow the orphan
        // toggle, just as they do without a folder filter.
        var visibleDegree = {};
        edges.forEach(function (edge) {
            edge.visible = nodeMatchesFolder(edge.source) && nodeMatchesFolder(edge.target);
            edge.el.classList.toggle('initially-hidden', !edge.visible);
            if (edge.visible) {
                visibleDegree[edge.source.id] = (visibleDegree[edge.source.id] || 0) + 1;
                visibleDegree[edge.target.id] = (visibleDegree[edge.target.id] || 0) + 1;
            }
        });
        nodes.forEach(function (node) {
            node.visible = nodeMatchesFolder(node) && (showOrphans || (visibleDegree[node.id] || 0) > 0);
            node.el.classList.toggle('initially-hidden', !node.visible);
        });
        updateLabelVisibility();
        updateStats();
        if (treeMode) {
            layoutTree();
            draw();
        }
    }

    function updateStats() {
        var statsEl = document.getElementById('graphStats');
        var template = statsEl.getAttribute('data-txt-stats') || '{{notes}} · {{links}}';
        // Folder hubs and their ties are neither notes nor links
        var visibleNodes = nodes.filter(function (n) { return n.visible && !n.isFolder; }).length;
        var visibleEdges = edges.filter(function (e) { return e.visible && !e.membership; }).length;
        statsEl.textContent = template
            .replace('{{notes}}', String(visibleNodes))
            .replace('{{links}}', String(visibleEdges));
    }

    /* --------------------------------------------------------------------- */
    /* Force simulation                                                        */
    /* --------------------------------------------------------------------- */

    function startSimulation(newAlpha) {
        if (treeMode) { return; }
        alpha = Math.max(alpha, newAlpha);
        if (!running) {
            running = true;
            requestAnimationFrame(tick);
        }
    }

    function tick() {
        if (treeMode) {
            running = false;
            return;
        }
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
        var i, j, node, other, dx, dy, dist2, dist, force, spacing;

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

        // Folder hubs keep a wheel's width between them, so the notes of
        // two folders do not end up interleaved.
        for (i = 0; i < hubs.length; i++) {
            for (j = i + 1; j < hubs.length; j++) {
                node = hubs[i];
                other = hubs[j];
                dx = node.x - other.x;
                dy = node.y - other.y;
                dist = Math.sqrt(dx * dx + dy * dy) || 1;
                spacing = node.ring + other.ring + HUB_GAP;
                if (dist >= spacing) { continue; }
                force = (spacing - dist) / dist * SPRING_STRENGTH * alpha / 2;
                node.vx += dx * force;
                node.vy += dy * force;
                other.vx -= dx * force;
                other.vy -= dy * force;
            }
        }

        // Link springs
        for (i = 0; i < edges.length; i++) {
            var edge = edges[i];
            dx = edge.target.x - edge.source.x;
            dy = edge.target.y - edge.source.y;
            dist = Math.sqrt(dx * dx + dy * dy) || 1;
            force = (dist - (edge.length || SPRING_LENGTH)) / dist * SPRING_STRENGTH * alpha;
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
            // A note tied to a folder hub is held by the hub alone: pulled
            // to the center as well, the notes would all sit on the inner
            // side of their hub instead of around it.
            if (!node.anchored) {
                node.vx += -node.x * GRAVITY * alpha;
                node.vy += -node.y * GRAVITY * alpha;
            }
            if (node.dragging || node.pinned) {
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
            edge.el.setAttribute('d', treeMode ? treeEdgePath(edge) :
                'M' + edge.source.x.toFixed(1) + ' ' + edge.source.y.toFixed(1) +
                'L' + edge.target.x.toFixed(1) + ' ' + edge.target.y.toFixed(1));
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
            if (treeMode) {
                // Beside the dot: a note title on its row, a folder name
                // above the line that leaves it
                node.labelEl.setAttribute('x', String(node.radius * scale + 6));
                node.labelEl.setAttribute('y', node.isFolder ? '-7' : '4');
            } else {
                node.labelEl.setAttribute('y', String(node.radius * scale + 14));
            }
        });
    }

    function fitView() {
        if (nodes.length === 0) { return; }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(function (node) {
            if (!node.visible) { return; }
            if (node.x < minX) { minX = node.x; }
            if (node.x > maxX) { maxX = node.x; }
            if (node.y < minY) { minY = node.y; }
            if (node.y > maxY) { maxY = node.y; }
        });
        if (minX === Infinity) { return; }
        var pad = treeMode ? TREE_PAD : 60;
        var graphW = Math.max(1, maxX - minX + pad * 2);
        var graphH = Math.max(1, maxY - minY + pad * 2);
        if (treeMode) {
            // The titles run to the right of the last column. A tree too
            // big for the canvas is not shrunk until it fits: it stays
            // readable and starts at its top left corner.
            var room = Math.max(1, width - treeLabelRoom());
            scale = Math.max(TREE_MIN_SCALE, Math.min(1.3, room / graphW, height / graphH));
            tx = graphW * scale > room ? (pad - minX) * scale : (room - (minX + maxX) * scale) / 2;
            ty = graphH * scale > height ? (pad - minY) * scale : height / 2 - (minY + maxY) / 2 * scale;
            applyTransform();
            return;
        }
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
        var dragGroup = null;    // [{node, startX, startY}] moved together
        var dragOrigin = null;   // pointer position in graph coords at drag start
        var dragStartClient = null;
        var dragMoved = 0;
        var tapNode = null;      // tree view: node under the pointer, opened on a click

        function graphCoords(e) {
            var rect = svg.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left - tx) / scale,
                y: (e.clientY - rect.top - ty) / scale
            };
        }

        function releaseDrag() {
            if (!dragGroup) { return; }
            dragGroup.forEach(function (entry) { entry.node.dragging = false; });
            dragNode = null;
            dragGroup = null;
            dragOrigin = null;
        }

        // Chrome starts its own HTML5 drag on the SVG text/shapes, which
        // cancels our pointer capture mid-drag and leaves a "no-drop" cursor.
        svg.addEventListener('dragstart', function (e) { e.preventDefault(); });

        svg.addEventListener('pointerdown', function (e) {
            // Suppress the native drag and the text selection it grows from.
            e.preventDefault();
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
                tapNode = null;
                releaseDrag();
                return;
            }

            var nodeEl = e.target.closest('.graph-node');
            if (nodeEl && treeMode) {
                // The tree places the nodes itself: a press pans the view
                tapNode = nodeById[nodeEl.getAttribute('data-id')];
                panStart = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
            } else if (nodeEl) {
                dragNode = nodeById[nodeEl.getAttribute('data-id')];
                // Dragging moves the whole connected group; Ctrl/Cmd or Shift
                // restricts the move to the grabbed node alone.
                var single = e.ctrlKey || e.metaKey || e.shiftKey;
                var group = single ? [dragNode] : componentNodes(dragNode);
                dragGroup = group.map(function (node) {
                    node.dragging = true;
                    return { node: node, startX: node.x, startY: node.y };
                });
                dragOrigin = graphCoords(e);
                dragStartClient = { x: e.clientX, y: e.clientY };
                dragMoved = 0;
                // Stop auto-fit right away so the drag frame of reference
                // cannot shift between pointerdown and the first move.
                userInteracted = true;
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

            if (dragGroup) {
                var pos = graphCoords(e);
                var dx = pos.x - dragOrigin.x;
                var dy = pos.y - dragOrigin.y;
                dragGroup.forEach(function (entry) {
                    entry.node.x = entry.startX + dx;
                    entry.node.y = entry.startY + dy;
                });
                dragMoved = Math.max(dragMoved,
                    Math.abs(e.clientX - dragStartClient.x) + Math.abs(e.clientY - dragStartClient.y));
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

        function endPointer(e, cancelled) {
            delete pointers[e.pointerId];
            if (Object.keys(pointers).length < 2) {
                pinchStart = null;
            }
            if (dragGroup) {
                // An aborted gesture is never a click: don't open the note.
                var clicked = (!cancelled && dragMoved < 5) ? dragNode : null;
                if (!clicked) {
                    // Keep the group exactly where it was dropped: pin every
                    // moved node and remember the positions for next time.
                    dragGroup.forEach(function (entry) { entry.node.pinned = true; });
                }
                releaseDrag();
                if (clicked) {
                    // A folder hub has no page of its own to open
                    if (!clicked.isFolder) { openNote(clicked); }
                } else {
                    savePinnedPositions();
                    updateResetButton();
                }
            }
            if (tapNode) {
                var tapped = !cancelled && panStart &&
                    Math.abs(e.clientX - panStart.x) + Math.abs(e.clientY - panStart.y) < 5;
                if (tapped && !tapNode.isFolder) { openNote(tapNode); }
                tapNode = null;
            }
            panStart = null;
        }
        svg.addEventListener('pointerup', function (e) { endPointer(e, false); });
        svg.addEventListener('pointercancel', function (e) { endPointer(e, true); });
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
        var node = nodeEl ? nodeById[nodeEl.getAttribute('data-id')] : null;
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
        var template;
        if (node.isFolder) {
            template = tooltip.getAttribute('data-txt-folder') || '{{count}} notes';
            parts.push(template.replace('{{count}}', String(node.noteCount)));
        } else {
            if (node.folder) { parts.push(node.folder); }
            template = tooltip.getAttribute('data-txt-links') || '{{count}} links';
            parts.push(template.replace('{{count}}', String(node.linkCount)));
        }
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
        if (treeMode && nodes.length) {
            // The tree columns follow the width of the canvas
            layoutTree();
            draw();
        }
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
            var savedOrphans = readPref(PREF_SHOW_ORPHANS);
            if (savedOrphans !== null) {
                showOrphans = savedOrphans;
                orphansToggle.checked = savedOrphans;
            }
            orphansToggle.addEventListener('change', function () {
                showOrphans = orphansToggle.checked;
                savePref(PREF_SHOW_ORPHANS, showOrphans);
                updateVisibility();
                // Notes coming back may sit outside the current view
                if (!userInteracted) {
                    fitView();
                }
            });
        }

        var resetLayoutBtn = document.getElementById('graphResetLayout');
        if (resetLayoutBtn) {
            resetLayoutBtn.addEventListener('click', resetLayout);
        }

        var separateBtn = document.getElementById('graphSeparateGroups');
        if (separateBtn) {
            separateBtn.addEventListener('click', separateGroups);
        }

        var labelsToggle = document.getElementById('graphShowLabels');
        if (labelsToggle) {
            labelsToggle.addEventListener('change', function () {
                showLabels = labelsToggle.checked;
                savePref(PREF_SHOW_LABELS, showLabels);
                updateLabelVisibility();
                if (treeMode) {
                    // The columns leave more or less room for the titles
                    layoutTree();
                    draw();
                    if (!userInteracted) { fitView(); }
                }
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

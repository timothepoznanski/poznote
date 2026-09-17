/**
 * "Other accounts" block at the bottom of the notes list (notes_list.php).
 *
 * One collapsible block per account the signed-in person can open besides
 * the active one. Expanding a block fetches that account's outline from
 * account_tree.php (workspaces, folders, live notes, no content) and renders
 * it read-only. Clicking a note switches to that account and opens the note;
 * the arrow next to the account name switches without choosing a note, and a
 * workspace heading opens the account in that workspace. All go through
 * window.poznoteSwitchAccount (js/profile.js), which posts to
 * switch_account.php.
 *
 * The active account gets the same row above its own tree, which the chevron
 * folds as a whole (#currentAccountTree).
 *
 * The expanded state of each block, and the folded state of the own tree,
 * are remembered per user (window.__poznoteUserStorage, js/theme-init.js).
 * Folders inside a block start collapsed and are toggled in place, no second
 * request.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'other_accounts_expanded';
    var CURRENT_KEY = 'current_account_collapsed';

    var tr = function (key, vars, fallback) {
        if (typeof window.t === 'function') return window.t(key, vars, fallback);
        return fallback || key;
    };

    function storage() {
        return window.__poznoteUserStorage || {
            getItem: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
            setItem: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
        };
    }

    function readExpanded() {
        try {
            var raw = storage().getItem(STORAGE_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list.map(String) : [];
        } catch (e) {
            return [];
        }
    }

    function writeExpanded(list) {
        try { storage().setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* not critical */ }
    }

    function rememberExpanded(accountId, expanded) {
        var list = readExpanded().filter(function (id) { return id !== String(accountId); });
        if (expanded) list.push(String(accountId));
        writeExpanded(list);
    }

    function switchTo(accountId, landing) {
        if (typeof window.poznoteSwitchAccount !== 'function') return;
        window.poznoteSwitchAccount(accountId, landing);
    }

    function icon(name) {
        var i = document.createElement('i');
        i.className = 'lucide ' + name;
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function row(className, iconName, label, title) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'other-account-row ' + className;
        btn.appendChild(icon(iconName));
        var text = document.createElement('span');
        text.textContent = label;
        btn.appendChild(text);
        btn.title = title || label;
        return btn;
    }

    function status(message) {
        var div = document.createElement('div');
        div.className = 'other-account-status';
        div.textContent = message;
        return div;
    }

    // Folders collapsed by default, toggled in place; notes as plain buttons
    // (never links: index.php?note=<id> would open that id in the ACTIVE
    // account, so a middle click must not have anywhere to go).
    function renderFolder(accountId, folder) {
        var wrap = document.createElement('div');
        wrap.className = 'other-account-folder';

        var header = row('other-account-row-folder', 'lucide-folder', folder.name);
        header.setAttribute('aria-expanded', 'false');
        wrap.appendChild(header);

        var children = document.createElement('div');
        children.className = 'other-account-children';
        children.hidden = true;
        renderInto(children, accountId, folder);
        wrap.appendChild(children);

        header.addEventListener('click', function () {
            var open = children.hidden;
            children.hidden = !open;
            header.setAttribute('aria-expanded', open ? 'true' : 'false');
            var glyph = header.querySelector('.lucide');
            if (glyph) glyph.className = 'lucide ' + (open ? 'lucide-folder-open' : 'lucide-folder');
        });

        return wrap;
    }

    function renderNote(accountId, note) {
        var title = note.title || tr('index.note.new_note', {}, 'New note');
        var btn = row('other-account-row-note', note.type === 'tasklist' ? 'lucide-check-square' : 'lucide-file-alt', title);
        btn.addEventListener('click', function () {
            switchTo(accountId, { note: note.id });
        });
        return btn;
    }

    function renderInto(container, accountId, node) {
        (node.folders || []).forEach(function (folder) {
            container.appendChild(renderFolder(accountId, folder));
        });
        (node.notes || []).forEach(function (note) {
            container.appendChild(renderNote(accountId, note));
        });
    }

    function renderTree(container, accountId, workspaces) {
        container.innerHTML = '';
        var total = 0;
        workspaces.forEach(function (ws) {
            total += (ws.folders || []).length + (ws.notes || []).length;
        });
        if (!total) {
            container.appendChild(status(tr('sidebar.other_accounts.empty', {}, 'No notes')));
            return;
        }

        var several = workspaces.length > 1;
        workspaces.forEach(function (ws) {
            if ((ws.folders || []).length + (ws.notes || []).length === 0) return;
            var section = document.createElement('div');
            section.className = 'other-account-workspace';
            if (several) {
                // A workspace heading opens the account in that workspace.
                var heading = row('other-account-row-workspace', 'lucide-layers', ws.name, tr('sidebar.other_accounts.open', {}, 'Open this account'));
                heading.addEventListener('click', function () {
                    switchTo(accountId, { workspace: ws.name });
                });
                section.appendChild(heading);
            }
            var body = document.createElement('div');
            body.className = several ? 'other-account-children' : 'other-account-root';
            renderInto(body, accountId, ws);
            section.appendChild(body);
            container.appendChild(section);
        });
    }

    function load(block) {
        var tree = block.querySelector('.other-account-tree');
        var accountId = block.getAttribute('data-account-id');
        if (!tree || block.getAttribute('data-loaded') === '1') return;
        block.setAttribute('data-loaded', '1');

        tree.innerHTML = '';
        tree.appendChild(status(tr('common.loading', {}, 'Loading...')));

        var endpoint = (block.parentElement && block.parentElement.getAttribute('data-endpoint')) || 'account_tree.php';
        fetch(endpoint + '?account=' + encodeURIComponent(accountId), {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data || !data.success || !Array.isArray(data.workspaces)) {
                    throw new Error('bad response');
                }
                renderTree(tree, accountId, data.workspaces);
            })
            .catch(function () {
                // Let a later expansion retry.
                block.removeAttribute('data-loaded');
                tree.innerHTML = '';
                tree.appendChild(status(tr('sidebar.other_accounts.error', {}, 'Could not load the notes of this account')));
            });
    }

    function setExpanded(block, expanded, remember) {
        var toggle = block.querySelector('[data-other-account="toggle"]');
        var tree = block.querySelector('.other-account-tree');
        if (!toggle || !tree) return;
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        block.classList.toggle('other-account-expanded', expanded);
        tree.hidden = !expanded;
        if (expanded) load(block);
        if (remember) rememberExpanded(block.getAttribute('data-account-id'), expanded);
    }

    function initCurrentAccount() {
        var toggle = document.querySelector('[data-current-account="toggle"]');
        var tree = document.getElementById('currentAccountTree');
        if (!toggle || !tree) return;
        var header = toggle.closest('.current-account-header');

        function apply(collapsed) {
            tree.hidden = collapsed;
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            if (header) header.classList.toggle('current-account-collapsed', collapsed);
        }

        apply(storage().getItem(CURRENT_KEY) === '1');
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var collapsed = !tree.hidden;
            apply(collapsed);
            try { storage().setItem(CURRENT_KEY, collapsed ? '1' : '0'); } catch (err) { /* not critical */ }
        });
    }

    function init() {
        initCurrentAccount();

        var root = document.getElementById('otherAccounts');
        if (!root) return;

        var expanded = readExpanded();
        root.querySelectorAll('.other-account').forEach(function (block) {
            var accountId = block.getAttribute('data-account-id');
            if (expanded.indexOf(String(accountId)) !== -1) {
                setExpanded(block, true, false);
            }
        });

        root.addEventListener('click', function (e) {
            var control = e.target.closest('[data-other-account]');
            if (!control || !root.contains(control)) return;
            var block = control.closest('.other-account');
            if (!block) return;
            e.preventDefault();
            e.stopPropagation();

            if (control.getAttribute('data-other-account') === 'open') {
                control.disabled = true;
                switchTo(block.getAttribute('data-account-id'));
                return;
            }
            var isOpen = control.getAttribute('aria-expanded') === 'true';
            setExpanded(block, !isOpen, true);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

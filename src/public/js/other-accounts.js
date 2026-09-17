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
 * What is unfolded follows the account, not its place in the list: switching
 * accounts moves the active one to the top and the previous one down here,
 * and each keeps its unfolded row and its unfolded folders.
 * - Account rows: one open/closed state per account id (ROWS_KEY, per login
 *   through window.__poznoteUserStorage, js/theme-init.js).
 * - Folders: the main tree keeps reading and writing its unscoped
 *   localStorage keys (folder_folder-12 = open, js/utils-folder-tree.js and
 *   seven other files), but folder ids repeat from one account to the next.
 *   So those keys always belong to one account, recorded in
 *   FOLDER_OWNER_KEY; when a page shows another account, they are put away
 *   under the account that owned them and the new account's are put back,
 *   before the tree reads them on DOMContentLoaded (this file runs earlier,
 *   in the deferred bundle). The trees rendered here read and write the same
 *   put-away states of their account.
 */
(function () {
    'use strict';

    var ROWS_KEY = 'account_rows_state';
    // Before ROWS_KEY: a list of the expanded other accounts, and one flag for
    // whichever account was active. Read once as defaults, never written.
    var LEGACY_EXPANDED_KEY = 'other_accounts_expanded';
    var LEGACY_CURRENT_KEY = 'current_account_collapsed';

    var FOLDER_PREFIX = 'folder_';
    var FOLDER_OWNER_KEY = 'pz_folder_states_account';
    var ACCOUNT_FOLDERS_PREFIX = 'pz_account_folder_states:';

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

    function readJson(store, key, fallback) {
        try {
            var raw = store.getItem(key);
            var value = raw ? JSON.parse(raw) : null;
            return value && typeof value === 'object' ? value : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(store, key, value) {
        try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* not critical */ }
    }

    // ========== Account rows ==========

    // 'open', 'closed', or null when this account's row was never shown.
    function readRowState(accountId) {
        var states = readJson(storage(), ROWS_KEY, {});
        var state = states[String(accountId)];
        return state === 'open' || state === 'closed' ? state : null;
    }

    function rememberRowState(accountId, open) {
        var states = readJson(storage(), ROWS_KEY, {});
        states[String(accountId)] = open ? 'open' : 'closed';
        writeJson(storage(), ROWS_KEY, states);
    }

    function legacyOtherExpanded(accountId) {
        var list = readJson(storage(), LEGACY_EXPANDED_KEY, []);
        return Array.isArray(list) && list.map(String).indexOf(String(accountId)) !== -1;
    }

    // ========== Folders, per account ==========

    function readAccountFolders(accountId) {
        return readJson(localStorage, ACCOUNT_FOLDERS_PREFIX + accountId, {});
    }

    function writeAccountFolders(accountId, states) {
        writeJson(localStorage, ACCOUNT_FOLDERS_PREFIX + accountId, states);
    }

    function liveFolderKeys() {
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(FOLDER_PREFIX) === 0) keys.push(key);
        }
        return keys;
    }

    // Puts the unscoped folder keys of the account shown before away, and
    // brings back those of the account this page shows.
    function adoptFolderStatesFor(accountId) {
        try {
            var owner = localStorage.getItem(FOLDER_OWNER_KEY);
            if (owner === accountId) return;

            // No owner yet: the keys predate this, they belong to the account
            // on screen.
            if (owner) {
                var keys = liveFolderKeys();
                var saved = {};
                keys.forEach(function (key) {
                    saved[key.slice(FOLDER_PREFIX.length)] = localStorage.getItem(key);
                });
                writeAccountFolders(owner, saved);
                keys.forEach(function (key) { localStorage.removeItem(key); });

                var restored = readAccountFolders(accountId);
                Object.keys(restored).forEach(function (domId) {
                    if (restored[domId] === 'open' || restored[domId] === 'closed') {
                        localStorage.setItem(FOLDER_PREFIX + domId, restored[domId]);
                    }
                });
            }
            localStorage.setItem(FOLDER_OWNER_KEY, accountId);
        } catch (e) {
            console.debug('other-accounts: folder states not swapped:', e);
        }
    }

    function isFolderOpenIn(accountId, folderId) {
        return readAccountFolders(accountId)['folder-' + folderId] === 'open';
    }

    function rememberFolderIn(accountId, folderId, open) {
        var states = readAccountFolders(accountId);
        states['folder-' + folderId] = open ? 'open' : 'closed';
        writeAccountFolders(accountId, states);
    }

    // Runs while the deferred bundle executes, before any DOMContentLoaded
    // handler restores the tree from the unscoped keys.
    (function () {
        var tree = document.getElementById('currentAccountTree');
        var accountId = tree ? tree.getAttribute('data-account-id') : '';
        if (accountId) adoptFolderStatesFor(accountId);
    })();

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

    // Folders open as they were left in that account, here or in its own tree,
    // collapsed otherwise; toggled in place. Notes are plain buttons (never
    // links: index.php?note=<id> would open that id in the ACTIVE account, so
    // a middle click must not have anywhere to go).
    function renderFolder(accountId, folder) {
        var wrap = document.createElement('div');
        wrap.className = 'other-account-folder';

        var header = row('other-account-row-folder', 'lucide-folder', folder.name);
        wrap.appendChild(header);

        var children = document.createElement('div');
        children.className = 'other-account-children';
        renderInto(children, accountId, folder);
        wrap.appendChild(children);

        function show(open) {
            children.hidden = !open;
            header.setAttribute('aria-expanded', open ? 'true' : 'false');
            var glyph = header.querySelector('.lucide');
            if (glyph) glyph.className = 'lucide ' + (open ? 'lucide-folder-open' : 'lucide-folder');
        }

        show(isFolderOpenIn(accountId, folder.id));
        header.addEventListener('click', function () {
            var open = children.hidden;
            show(open);
            rememberFolderIn(accountId, folder.id, open);
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

    // Outlines already fetched on this page, by account id. The notes list is
    // rebuilt from the server after folder actions and live refreshes
    // (refreshNotesListAfterFolderAction in js/share.js), which would
    // otherwise refetch and flash "Loading..." in every unfolded block.
    var outlines = {};

    function load(block) {
        var tree = block.querySelector('.other-account-tree');
        var accountId = block.getAttribute('data-account-id');
        if (!tree || block.getAttribute('data-loaded') === '1') return;
        block.setAttribute('data-loaded', '1');

        if (outlines[accountId]) {
            renderTree(tree, accountId, outlines[accountId]);
            return;
        }

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
                outlines[accountId] = data.workspaces;
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
        if (remember) rememberRowState(block.getAttribute('data-account-id'), expanded);
    }

    function initCurrentAccount() {
        var toggle = document.querySelector('[data-current-account="toggle"]');
        var tree = document.getElementById('currentAccountTree');
        if (!toggle || !tree) return;
        var header = toggle.closest('.current-account-header');
        var accountId = tree.getAttribute('data-account-id') || '';

        function apply(collapsed) {
            tree.hidden = collapsed;
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            if (header) header.classList.toggle('current-account-collapsed', collapsed);
        }

        // Unfolded unless this account's row was folded, here or down in the
        // other accounts. The state is recorded as it is shown, so the row is
        // still unfolded once another account takes the top.
        var state = accountId ? readRowState(accountId) : null;
        if (state === null) {
            state = storage().getItem(LEGACY_CURRENT_KEY) === '1' ? 'closed' : 'open';
            if (accountId) rememberRowState(accountId, state === 'open');
        }
        apply(state === 'closed');

        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var collapsed = !tree.hidden;
            apply(collapsed);
            if (accountId) rememberRowState(accountId, !collapsed);
        });
    }

    function init() {
        initCurrentAccount();

        var root = document.getElementById('otherAccounts');
        if (!root) return;

        root.querySelectorAll('.other-account').forEach(function (block) {
            var accountId = block.getAttribute('data-account-id');
            var state = readRowState(accountId);
            var open = state === null ? legacyOtherExpanded(accountId) : state === 'open';
            if (open) setExpanded(block, true, false);
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

    // The account rows live inside #left_col, whose markup js/share.js
    // replaces after folder actions and live refreshes: it calls this again
    // so the new rows get their listeners and their unfolded states.
    window.reinitializeAccountRows = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

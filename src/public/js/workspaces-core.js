// Workspace switching.
// 
// The current workspace, the workspace menu, switching between workspaces and
// refreshing the left column for the one now selected.

// Global workspace state
var selectedWorkspace = '';

// Names shown the last time the sidebar workspace menu was populated. Used to
// reject a duplicate in the create modal before the round trip.
var knownWorkspaceNames = [];

// Use global translation function from globals.js
var wsTr = window.t || function (key, vars, fallback) {
    return fallback || key;
};

function initializeWorkspaces() {
    var wsSelector = document.getElementById('workspaceSelector');

    // Use window.selectedWorkspace (set by PHP from URL or database settings)
    // This ensures the workspace selector matches the actual page workspace
    if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
        selectedWorkspace = window.selectedWorkspace;
    }

    // Validate that workspace exists in selector
    if (wsSelector) {
        var existsInSelect = false;
        for (var i = 0; i < wsSelector.options.length; i++) {
            if (wsSelector.options[i].value === selectedWorkspace) {
                existsInSelect = true;
                break;
            }
        }

        if (!existsInSelect) {
            // Workspace not found, select the first available one
            if (wsSelector.options.length > 0) {
                selectedWorkspace = wsSelector.options[0].value;
            } else {
                selectedWorkspace = '';
            }
            // Save to database
            if (typeof saveLastOpenedWorkspace === 'function') {
                saveLastOpenedWorkspace(selectedWorkspace);
            }
        }

        wsSelector.value = selectedWorkspace;
        wsSelector.addEventListener('change', onWorkspaceChange);
    }
}

// Helper function to get the selected search scopes for workspace navigation
function getCurrentSearchTypes() {
    if (window.searchManager && typeof window.searchManager.getActiveSearchTypes === 'function') {
        // Try the desktop searchbar first, then the mobile one
        var desktopTypes = window.searchManager.getActiveSearchTypes(false);
        if (desktopTypes && desktopTypes.length) return desktopTypes;

        var mobileTypes = window.searchManager.getActiveSearchTypes(true);
        if (mobileTypes && mobileTypes.length) return mobileTypes;
    }
    return ['notes']; // default
}

// Carry the selected search scopes over to a workspace navigation URL
function applySearchTypesToUrl(url) {
    var types = getCurrentSearchTypes();

    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');

    if (types.indexOf('notes') !== -1) url.searchParams.set('preserve_notes', '1');
    if (types.indexOf('tags') !== -1) url.searchParams.set('preserve_tags', '1');
}

function onWorkspaceChange() {
    var wsSelector = document.getElementById('workspaceSelector');
    if (!wsSelector) return;

    var val = wsSelector.value;
    selectedWorkspace = val;

    // Save last opened workspace to database
    if (typeof saveLastOpenedWorkspace === 'function') {
        saveLastOpenedWorkspace(val);
    }

    // Reload workspace background if function exists
    if (typeof window.reloadWorkspaceBackground === 'function') {
        window.reloadWorkspaceBackground();
    }

    // Reload the page with the new workspace
    var url = new URL(window.location.href);
    applySearchTypesToUrl(url);

    url.searchParams.set('workspace', val);
    window.location.href = url.toString();
}

function toggleWorkspaceMenu(event) {
    event.stopPropagation();

    // Try both mobile and desktop menus to ensure it works
    var mobileMenu = document.getElementById('workspaceMenuMobile');
    var desktopMenu = document.getElementById('workspaceMenu');

    // Use a more flexible mobile detection
    // Determine mobile/compact layout purely from the CSS breakpoint.
    var isMobile = isMobileDevice();
    var preferredMenu = isMobile ? mobileMenu : desktopMenu;
    var menu = preferredMenu || mobileMenu || desktopMenu;

    if (!menu) {
        return;
    }

    // Close the other menu if it exists
    var otherMenu = (menu === mobileMenu) ? desktopMenu : mobileMenu;
    if (otherMenu) {
        otherMenu.style.display = 'none';
    }

    if (menu.style.display === 'none' || menu.style.display === '') {
        loadAndShowWorkspaceMenu(menu);
    } else {
        menu.style.display = 'none';
    }
}

function loadAndShowWorkspaceMenu(menu) {
    menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-loader-2 lucide-spin"></i>' + wsTr('workspaces.menu.loading', {}, 'Loading workspaces...') + '</div>';
    menu.style.display = 'block';

    fetch('/api/v1/workspaces', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data.success) {
                displayWorkspaceMenu(menu, data.workspaces, data.username, data.acting_as);
            } else {
                menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-alert-triangle"></i>' + wsTr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
            }
        })
        .catch(function (error) {
            menu.innerHTML = '<div class="workspace-menu-item"><i class="lucide lucide-alert-triangle"></i>' + wsTr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
        });
}

function escapeWorkspaceMenuText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// The menu can be re-rendered for another account (see below) without a
// second round trip for the active account's own workspaces.
var ownWorkspaceMenuData = null;

function displayWorkspaceMenu(menu, workspaces, username, actingAs) {
    ownWorkspaceMenuData = { workspaces: workspaces, username: username, actingAs: actingAs };
    renderWorkspaceMenu(menu, { workspaces: workspaces, account: null });
}

// One rendering for two states. With no account (or the active one) the
// menu lists the active account's workspaces, each a link into it, plus the
// management entries. With another account chosen in the Accounts section,
// it lists THAT account's workspaces instead (fetched from account_tree.php,
// see chooseWorkspaceMenuAccount), and picking one opens the account in that
// workspace, through switch_account.php. The menu stays open in between: the
// account is the wider scope, the workspace the narrower, and both are chosen
// in the same place.
//
// Workspaces other accounts share with this login (workspaces.php > Share)
// are listed under "Shared with me", each opened through switch_account.php
// as well: the owner's account then opens confined to that workspace
// (auth.php, shared workspace scope). Inside such a workspace the menu has no
// Workspaces section (the owner's list would hold that one workspace, already
// ticked under "Shared with me"), the Accounts section is the way back to the
// person's own account, and the management entries act on that own account:
// they switch back to it first (switch_account.php, 'next').

function isSharedWorkspaceScope() {
    var accountSwitch = window.PoznoteAccountSwitch;
    var shared = accountSwitch && Array.isArray(accountSwitch.sharedWorkspaces) ? accountSwitch.sharedWorkspaces : [];
    return shared.some(function (row) { return !!row.current; });
}

function renderWorkspaceMenu(menu, state) {
    // Use window.selectedWorkspace first (set by PHP), then fall back to selectedWorkspace variable
    var currentWorkspace = (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : (selectedWorkspace || '');
    var workspaces = state.workspaces || [];
    var foreignAccount = state.account || null;
    var menuHtml = '';

    if (!foreignAccount) {
        // Check if current workspace exists in the list
        var workspaceExists = false;
        for (var k = 0; k < workspaces.length; k++) {
            if (workspaces[k].name === currentWorkspace) {
                workspaceExists = true;
                break;
            }
        }

        // If current workspace doesn't exist, select first one
        if (!workspaceExists && workspaces.length > 0) {
            currentWorkspace = workspaces[0].name;
        }

        // The API already returns them in the order set on workspaces.php (the
        // arrows on each row), so the list is shown as it comes.
        knownWorkspaceNames = workspaces.map(function (w) { return w.name; });
    }

    // Accounts this login can open (icon_sidebar.php sets
    // window.PoznoteAccountSwitch when there are several: the login's own
    // account and the ones granted to it) come first, since the account is
    // the wider scope; the workspaces of the chosen account follow under
    // their own heading.
    var accountSwitch = window.PoznoteAccountSwitch;
    var accounts = accountSwitch && Array.isArray(accountSwitch.accounts) ? accountSwitch.accounts : [];
    var sharedWorkspaces = accountSwitch && Array.isArray(accountSwitch.sharedWorkspaces) ? accountSwitch.sharedWorkspaces : [];
    var inSharedScope = isSharedWorkspaceScope();
    var canSwitch = typeof window.poznoteSwitchAccount === 'function';
    // A single account is only worth listing as the way back from a shared
    // workspace.
    var hasAccounts = canSwitch && (accounts.length > 1 || (accounts.length === 1 && inSharedScope));
    if (hasAccounts) {
        menuHtml += '<div class="workspace-menu-label">' + escapeWorkspaceMenuText(wsTr('workspaces.menu.accounts', {}, 'Accounts')) + '</div>';
        accounts.forEach(function (account) {
            var selected = foreignAccount ? String(account.id) === String(foreignAccount.id) : !!account.current;
            var accountIcon = selected ? 'lucide-check-circle' : (account.own ? 'lucide-user' : 'lucide-users');
            menuHtml += '<div class="workspace-menu-item workspace-menu-account' + (selected ? ' current-workspace' : '') + '" data-account-id="' + escapeWorkspaceMenuText(account.id) + '"' + (account.current ? ' data-account-current="1"' : '') + '>'
                + '<i class="' + accountIcon + '"></i>'
                + '<span>' + escapeWorkspaceMenuText(account.username) + '</span>'
                + '</div>';
        });
        menuHtml += '<div class="workspace-menu-divider"></div>';
    }

    var showWorkspaces = !(inSharedScope && !foreignAccount);
    if (showWorkspaces) {
        menuHtml += '<div class="workspace-menu-label">' + escapeWorkspaceMenuText(wsTr('workspaces.menu.title', {}, 'Workspaces')) + '</div>';

        if (state.loading) {
            menuHtml += '<div class="workspace-menu-item"><i class="lucide lucide-loader-2 lucide-spin"></i>' + escapeWorkspaceMenuText(wsTr('workspaces.menu.loading', {}, 'Loading workspaces...')) + '</div>';
        } else if (state.error) {
            menuHtml += '<div class="workspace-menu-item"><i class="lucide lucide-alert-triangle"></i>' + escapeWorkspaceMenuText(wsTr('workspaces.menu.error_loading', {}, 'Error loading workspaces')) + '</div>';
        }

        // Create menu elements
        for (var i = 0; i < workspaces.length; i++) {
            var workspace = workspaces[i];
            var isCurrent = !foreignAccount && workspace.name === currentWorkspace;
            var currentClass = isCurrent ? ' current-workspace' : '';
            var icon = isCurrent ? 'lucide-check-circle' : 'lucide-layers';
            var safeName = escapeWorkspaceMenuText(workspace.name);
            // A colored workspace (workspaces.php > Color) shows its dot in the
            // icon slot, as on the dashboard; the current one is still told apart
            // by its bold accent label
            var mark = workspace.color_hex
                ? '<span class="workspace-menu-dot" style="background-color:' + escapeWorkspaceMenuText(workspace.color_hex) + '"></span>'
                : '<i class="' + icon + '"></i>';

            menuHtml += '<div class="workspace-menu-item' + currentClass + '" data-workspace-name="' + safeName + '">';
            menuHtml += mark;
            menuHtml += '<span>' + safeName + '</span>';
            menuHtml += '</div>';
        }
    }

    // Workspaces other accounts share with this login follow the account's
    // own ones, still above the management entries.
    if (canSwitch && sharedWorkspaces.length > 0) {
        if (showWorkspaces) {
            menuHtml += '<div class="workspace-menu-divider"></div>';
        }
        menuHtml += '<div class="workspace-menu-label">' + escapeWorkspaceMenuText(wsTr('workspaces.menu.shared_with_me', {}, 'Shared with me')) + '</div>';
        sharedWorkspaces.forEach(function (row, index) {
            var selected = !foreignAccount && !!row.current;
            menuHtml += '<div class="workspace-menu-item workspace-menu-shared' + (selected ? ' current-workspace' : '') + '" data-shared-index="' + index + '"' + (row.current ? ' data-shared-current="1"' : '') + '>'
                + '<i class="' + (selected ? 'lucide-check-circle' : 'lucide-users') + '"></i>'
                + '<span>' + escapeWorkspaceMenuText(row.workspace) + '</span>'
                + '<span class="workspace-menu-shared-owner">' + escapeWorkspaceMenuText(row.ownerUsername) + '</span>'
                + '</div>';
        });
    }

    // Management entries, always the last ones: the menu opens even when the
    // account has a single workspace (or none), so these stay reachable. The
    // data-action values are the wsmenu:* keys of the UI Customization modal,
    // which hides them through .workspace-menu-item[data-action="..."]. They
    // act on the active account only, so another account's list goes
    // without. In a workspace shared with this login they lead back to the
    // login's own account instead (see the click handlers below).
    var ownAccount = null;
    accounts.forEach(function (account) { if (account.own) ownAccount = account; });
    if (!foreignAccount && (!inSharedScope || (ownAccount && canSwitch))) {
        var uiCustomization = window.PoznoteUiCustomization;
        var editHidden = !!(uiCustomization && uiCustomization.isHidden('wsmenu:edit-workspaces'));
        var createHidden = !!(uiCustomization && uiCustomization.isHidden('wsmenu:new-workspace'));
        if (menuHtml !== '' && !(editHidden && createHidden)) {
            menuHtml += '<div class="workspace-menu-divider"></div>';
        }
        menuHtml += workspaceMenuActionHtml('data-workspace-action', 'create', 'new-workspace', 'lucide-plus-circle', wsTr('workspaces.menu.new_workspace', {}, 'New workspace'));
        menuHtml += workspaceMenuActionHtml('data-workspace-url', 'workspaces.php', 'edit-workspaces', 'lucide-settings', wsTr('workspaces.menu.edit_workspaces', {}, 'Edit workspaces'));
    }

    menu.innerHTML = menuHtml;

    // Add event listeners using delegation
    menu.querySelectorAll('.workspace-menu-item[data-workspace-name]').forEach(function (item) {
        item.addEventListener('click', function () {
            var name = this.getAttribute('data-workspace-name');
            if (foreignAccount) {
                var label = this.querySelector('span');
                if (label) label.textContent = wsTr('profile.logout.switch_in_progress', {}, 'Switching account...');
                window.poznoteSwitchAccount(foreignAccount.id, { workspace: name });
                return;
            }
            switchToWorkspace(name);
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-workspace-url]').forEach(function (item) {
        item.addEventListener('click', function () {
            var url = this.getAttribute('data-workspace-url');
            closeWorkspaceMenus();
            if (inSharedScope && ownAccount) {
                window.poznoteSwitchAccount(ownAccount.id, { next: 'workspaces' });
                return;
            }
            window.location.href = url;
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-workspace-action="create"]').forEach(function (item) {
        item.addEventListener('click', function () {
            closeWorkspaceMenus();
            if (inSharedScope && ownAccount) {
                window.poznoteSwitchAccount(ownAccount.id, { next: 'new_workspace' });
                return;
            }
            openCreateWorkspaceModal();
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-shared-index]').forEach(function (item) {
        item.addEventListener('click', function () {
            if (this.getAttribute('data-shared-current') === '1' && !foreignAccount) {
                closeWorkspaceMenus();
                return;
            }
            var row = sharedWorkspaces[parseInt(this.getAttribute('data-shared-index'), 10)];
            if (!row) return;
            var label = this.querySelector('span');
            if (label) label.textContent = wsTr('profile.logout.switch_in_progress', {}, 'Switching account...');
            window.poznoteSwitchAccount(row.ownerId, { workspace: row.workspace });
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-account-id]').forEach(function (item) {
        item.addEventListener('click', function (event) {
            // The menu re-renders under the pointer: without this the document
            // click handler (js/ui.js) no longer finds the target inside the
            // menu and closes it.
            event.stopPropagation();
            chooseWorkspaceMenuAccount(menu, this.getAttribute('data-account-id'));
        });
    });
}

// Account picked in the menu: the active one brings back its own workspaces,
// another one lists that account's workspaces (name and colour only, from
// account_tree.php) so one of them can be opened in it.
function chooseWorkspaceMenuAccount(menu, accountId) {
    var accountSwitch = window.PoznoteAccountSwitch;
    var accounts = accountSwitch && Array.isArray(accountSwitch.accounts) ? accountSwitch.accounts : [];
    var account = null;
    for (var i = 0; i < accounts.length; i++) {
        if (String(accounts[i].id) === String(accountId)) account = accounts[i];
    }
    if (!account) return;

    if (account.current) {
        renderWorkspaceMenu(menu, { workspaces: ownWorkspaceMenuData ? ownWorkspaceMenuData.workspaces : [], account: null });
        return;
    }

    // From inside a shared workspace, the login's own account is opened
    // straight away: its workspaces are not the menu's to list here.
    if (account.own && isSharedWorkspaceScope()) {
        closeWorkspaceMenus();
        window.poznoteSwitchAccount(account.id, {});
        return;
    }

    renderWorkspaceMenu(menu, { workspaces: [], account: account, loading: true });
    menu.setAttribute('data-menu-account', String(account.id));

    fetch('account_tree.php?account=' + encodeURIComponent(account.id) + '&workspaces_only=1', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            // A later choice wins over a slower answer.
            if (menu.getAttribute('data-menu-account') !== String(account.id)) return;
            if (!data || !data.success || !Array.isArray(data.workspaces)) throw new Error('bad response');
            renderWorkspaceMenu(menu, { workspaces: data.workspaces, account: account });
        })
        .catch(function () {
            if (menu.getAttribute('data-menu-account') !== String(account.id)) return;
            renderWorkspaceMenu(menu, { workspaces: [], account: account, error: true });
        });
}

function workspaceMenuActionHtml(attribute, value, action, icon, label) {
    return '<div class="workspace-menu-item workspace-menu-action" ' + attribute + '="' + escapeWorkspaceMenuText(value) + '" data-action="' + escapeWorkspaceMenuText(action) + '">'
        + '<i class="' + icon + '"></i>'
        + '<span>' + escapeWorkspaceMenuText(label) + '</span>'
        + '</div>';
}

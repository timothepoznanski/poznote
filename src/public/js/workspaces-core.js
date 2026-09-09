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

function displayWorkspaceMenu(menu, workspaces, username, actingAs) {
    // Use window.selectedWorkspace first (set by PHP), then fall back to selectedWorkspace variable
    var currentWorkspace = (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : (selectedWorkspace || '');
    var menuHtml = '';

    // Check if current workspace exists in the list
    var workspaceExists = false;
    for (var i = 0; i < workspaces.length; i++) {
        if (workspaces[i].name === currentWorkspace) {
            workspaceExists = true;
            break;
        }
    }

    // If current workspace doesn't exist, select first one
    if (!workspaceExists && workspaces.length > 0) {
        currentWorkspace = workspaces[0].name;
    }

    // Sort workspaces alphabetically
    workspaces.sort(function (a, b) {
        return a.name.localeCompare(b.name);
    });

    knownWorkspaceNames = workspaces.map(function (w) { return w.name; });

    // Create menu elements
    for (var i = 0; i < workspaces.length; i++) {
        var workspace = workspaces[i];
        var isCurrent = workspace.name === currentWorkspace;
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

    // Management entries, always the last ones: the menu opens even when the
    // account has a single workspace (or none), so these stay reachable. The
    // data-action values are the wsmenu:* keys of the UI Customization modal,
    // which hides them through .workspace-menu-item[data-action="..."].
    var uiCustomization = window.PoznoteUiCustomization;
    var editHidden = !!(uiCustomization && uiCustomization.isHidden('wsmenu:edit-workspaces'));
    var createHidden = !!(uiCustomization && uiCustomization.isHidden('wsmenu:new-workspace'));
    if (menuHtml !== '' && !(editHidden && createHidden)) {
        menuHtml += '<div class="workspace-menu-divider"></div>';
    }
    menuHtml += workspaceMenuActionHtml('data-workspace-url', 'workspaces.php', 'edit-workspaces', 'lucide-settings', wsTr('workspaces.menu.edit_workspaces', {}, 'Edit workspaces'));
    menuHtml += workspaceMenuActionHtml('data-workspace-action', 'create', 'new-workspace', 'lucide-plus-circle', wsTr('workspaces.menu.new_workspace', {}, 'New workspace'));

    menu.innerHTML = menuHtml;

    // Add event listeners using delegation
    menu.querySelectorAll('.workspace-menu-item[data-workspace-name]').forEach(function (item) {
        item.addEventListener('click', function () {
            switchToWorkspace(this.getAttribute('data-workspace-name'));
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-workspace-url]').forEach(function (item) {
        item.addEventListener('click', function () {
            var url = this.getAttribute('data-workspace-url');
            closeWorkspaceMenus();
            window.location.href = url;
        });
    });

    menu.querySelectorAll('.workspace-menu-item[data-workspace-action="create"]').forEach(function (item) {
        item.addEventListener('click', function () {
            closeWorkspaceMenus();
            openCreateWorkspaceModal();
        });
    });
}

function workspaceMenuActionHtml(attribute, value, action, icon, label) {
    return '<div class="workspace-menu-item workspace-menu-action" ' + attribute + '="' + escapeWorkspaceMenuText(value) + '" data-action="' + escapeWorkspaceMenuText(action) + '">'
        + '<i class="' + icon + '"></i>'
        + '<span>' + escapeWorkspaceMenuText(label) + '</span>'
        + '</div>';
}

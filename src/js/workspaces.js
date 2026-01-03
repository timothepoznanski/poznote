// Workspace management

function tr(key, vars, fallback) {
    try {
        if (window.t) return window.t(key, vars || {}, fallback);
    } catch (e) {}
    var out = (fallback != null ? String(fallback) : String(key));
    if (vars) {
        for (var k in vars) {
            if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
            out = out.split('{{' + k + '}}').join(String(vars[k]));
        }
    }
    return out;
}

function initializeWorkspaces() {
    var wsSelector = document.getElementById('workspaceSelector');
    
    // First priority: use window.selectedWorkspace (set by PHP from URL or default_workspace setting)
    // This ensures the workspace selector matches the actual page workspace
    if (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) {
        selectedWorkspace = window.selectedWorkspace;
    } else {
        // Second priority: load workspace from localStorage
        try {
            var stored = localStorage.getItem('poznote_selected_workspace');
            if (stored) selectedWorkspace = stored;
        } catch(e) {}
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
            try { 
                localStorage.setItem('poznote_selected_workspace', selectedWorkspace); 
            } catch(e) {}
        }
        
        wsSelector.value = selectedWorkspace;
        wsSelector.addEventListener('change', onWorkspaceChange);
    }
}

function onWorkspaceChange() {
    var wsSelector = document.getElementById('workspaceSelector');
    if (!wsSelector) return;
    
    var val = wsSelector.value;
    selectedWorkspace = val;
    
    try { 
        localStorage.setItem('poznote_selected_workspace', val); 
    } catch(e) {}
    
    // Reload the page with the new workspace
    var url = new URL(window.location.href);
    
    // Preserve current search type when switching workspace
    var currentSearchType = 'notes'; // default
    if (window.searchManager) {
        // Try to get active search type from desktop first, then mobile
        var desktopActiveType = window.searchManager.getActiveSearchType(false);
        var mobileActiveType = window.searchManager.getActiveSearchType(true);
        
        // Use non-default type if available
        if (desktopActiveType !== 'notes') {
            currentSearchType = desktopActiveType;
        } else if (mobileActiveType !== 'notes') {
            currentSearchType = mobileActiveType;
        } else {
            currentSearchType = desktopActiveType; // fallback to desktop
        }
    }
    
    // Clear existing preserve parameters
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');

    // Set appropriate preserve parameter based on current search type
    if (currentSearchType === 'tags') {
        url.searchParams.set('preserve_tags', '1');
    } else {
        url.searchParams.set('preserve_notes', '1');
    }
    
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
    menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-spinner fa-spin"></i>' + tr('workspaces.menu.loading', {}, 'Loading workspaces...') + '</div>';
    menu.style.display = 'block';
    
    fetch('api_workspaces.php?action=list')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                displayWorkspaceMenu(menu, data.workspaces);
            } else {
                menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-exclamation-triangle"></i>' + tr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
            }
        })
        .catch(function(error) {
            menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-exclamation-triangle"></i>' + tr('workspaces.menu.error_loading', {}, 'Error loading workspaces') + '</div>';
        });
}

function displayWorkspaceMenu(menu, workspaces) {
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
    workspaces.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });
    
    // Create menu elements
    for (var i = 0; i < workspaces.length; i++) {
        var workspace = workspaces[i];
        var isCurrent = workspace.name === currentWorkspace;
        var currentClass = isCurrent ? ' current-workspace' : '';
        var icon = isCurrent ? 'fa-check-light-full' : 'fa-layer-group';
        
        menuHtml += '<div class="workspace-menu-item' + currentClass + '" onclick="switchToWorkspace(\'' + workspace.name + '\')">';
        menuHtml += '<i class="' + icon + '"></i>';
        menuHtml += '<span>' + workspace.name + '</span>';
        menuHtml += '</div>';
    }
    
    // Add management link
    menuHtml += '<div class="workspace-menu-divider"></div>';
    menuHtml += '<div class="workspace-menu-item" onclick="window.location.href=\'workspaces.php\';">';
    menuHtml += '<i class="fa-cog"></i>';
    menuHtml += '<span>' + tr('settings.cards.workspaces', {}, 'Workspaces') + '</span>';
    menuHtml += '</div>';
    // Add Logout right after Settings
    menuHtml += '<div class="workspace-menu-item" onclick="window.location.href=\'logout.php\';">';
    menuHtml += '<i class="fa-sign-out-alt"></i>';
    menuHtml += '<span>' + tr('workspaces.menu.logout', {}, 'Logout') + '</span>';
    menuHtml += '</div>';
    
    menu.innerHTML = menuHtml;
}

function switchToWorkspace(workspaceName) {
    if (workspaceName === selectedWorkspace) {
        closeWorkspaceMenus();
        return;
    }
    
    closeWorkspaceMenus();
    updateWorkspaceNameInHeaders(workspaceName);
    selectedWorkspace = workspaceName;
    
    try { 
        localStorage.setItem('poznote_selected_workspace', workspaceName); 
    } catch(e) {}
    
    // Clear the right column when switching workspace
    clearRightColumn();
    
    var url = new URL(window.location.href);
    url.searchParams.delete('note');
    
    // Preserve current search type when switching workspace
    var currentSearchType = 'notes'; // default
    if (window.searchManager) {
        // Try to get active search type from desktop first, then mobile
        var desktopActiveType = window.searchManager.getActiveSearchType(false);
        var mobileActiveType = window.searchManager.getActiveSearchType(true);
        
        // Use non-default type if available
        if (desktopActiveType !== 'notes') {
            currentSearchType = desktopActiveType;
        } else if (mobileActiveType !== 'notes') {
            currentSearchType = mobileActiveType;
        } else {
            currentSearchType = desktopActiveType; // fallback to desktop
        }
    }
    
    // Clear existing preserve parameters
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');

    // Set appropriate preserve parameter based on current search type
    if (currentSearchType === 'tags') {
        url.searchParams.set('preserve_tags', '1');
    } else {
        url.searchParams.set('preserve_notes', '1');
    }
    
    url.searchParams.set('workspace', workspaceName);
    
    history.pushState({workspace: workspaceName}, '', url.toString());
    refreshLeftColumnForWorkspace(workspaceName);
}

function closeWorkspaceMenus() {
    var menu1 = document.getElementById('workspaceMenu');
    var menu2 = document.getElementById('workspaceMenuMobile');
    if (menu1) menu1.style.display = 'none';
    if (menu2) menu2.style.display = 'none';
}

function updateWorkspaceNameInHeaders(workspaceName) {
    var desktopElement = document.getElementById('workspaceNameDesktop');
    var mobileElement = document.getElementById('workspaceNameMobile');
    
    if (desktopElement) {
        desktopElement.textContent = workspaceName;
    }
    if (mobileElement) {
        mobileElement.textContent = workspaceName;
    }
}

function refreshLeftColumnForWorkspace(workspaceName) {
    var url = new URL(window.location.href);
    url.searchParams.delete('note');
    // Don't delete preserve parameters - they should be maintained
    // url.searchParams.delete('preserve_notes');
    // url.searchParams.delete('preserve_tags');
    url.searchParams.set('workspace', workspaceName);
    
    fetch(url.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function(response) { return response.text(); })
    .then(function(html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newLeftCol = doc.getElementById('left_col');
        var currentLeftCol = document.getElementById('left_col');
        
        if (newLeftCol && currentLeftCol) {
            currentLeftCol.innerHTML = newLeftCol.innerHTML;
            
            // Reinitialize components after workspace change
            try {
                // Reinitialize workspace menus
                if (typeof initializeWorkspaceMenu === 'function') {
                    initializeWorkspaceMenu();
                }
                
                // Reinitialize search manager
                if (window.searchManager) {
                    window.searchManager.initializeSearch();
                    // Ensure at least one button is active
                    window.searchManager.ensureAtLeastOneButtonActive();
                }
                
                // Reinitialize other components that might depend on left column content
                if (typeof reinitializeClickableTagsAfterAjax === 'function') {
                    reinitializeClickableTagsAfterAjax();
                }
                
                // Reinitialize note click handlers for mobile scroll functionality
                if (typeof window.initializeNoteClickHandlers === 'function') {
                    window.initializeNoteClickHandlers();
                }
            } catch (error) {
                console.error('Error reinitializing after workspace change:', error);
            }
        }
    })
    .catch(function(err) {
        console.log('Error during refresh:', err);
    });
}

function clearRightColumn() {
    // Clear the right column content when switching workspace
    var rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.innerHTML = '';
    }
    
    // Reset global note variables
    if (typeof noteid !== 'undefined') {
        noteid = -1;
    }
    // Auto-save system handles all state management automatically
}

// Modal management functions for workspaces
function closeMoveModal() {
    document.getElementById('moveNotesModal').style.display = 'none';
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
}

function closeDeleteModal() {
    document.getElementById('deleteModal').style.display = 'none';
    document.getElementById('confirmDeleteInput').value = '';
    document.getElementById('confirmDeleteBtn').disabled = true;
}

function showAjaxAlert(msg, type) {
    // Prefer topAlert if available so messages appear in the same place as server messages
    if (typeof showTopAlert === 'function') {
        showTopAlert(msg, type === 'success' ? 'success' : 'danger');
        return;
    }
    var el = document.getElementById('ajaxAlert');
    el.style.display = 'block';
    el.className = 'alert alert-' + (type === 'success' ? 'success' : 'danger');
    el.innerHTML = msg;
    // auto-hide after 4s
    setTimeout(function(){ el.style.display = 'none'; }, 4000);
}

// Validation: only allow letters, digits, dash and underscore
function isValidWorkspaceName(name) {
    return /^[A-Za-z0-9_-]+$/.test(name);
}

function validateCreateWorkspaceForm(){
    var el = document.getElementById('workspace-name');
    if (!el) return true;
    var v = el.value.trim();
    if (v === '') { showTopAlert(tr('workspaces.validation.enter_name', {}, 'Enter a workspace name'), 'danger'); scrollToTopAlert(); return false; }
    if (!isValidWorkspaceName(v)) { showTopAlert(tr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, dash or underscore only'), 'danger'); scrollToTopAlert(); return false; }
    return true;
}

// Helper to display messages in the top alert container (same place as server-side messages)
function showTopAlert(message, type) {
    var el = document.getElementById('topAlert');
    if (!el) return showAjaxAlert(message, type === 'danger' ? 'danger' : (type === 'error' ? 'danger' : 'success'));
    el.style.display = 'block';
    el.className = 'alert ' + (type === 'danger' || type === 'Error' ? 'alert-danger' : 'alert-success');
    el.innerHTML = message;
    // auto-hide for success messages after 3s
    if (!(type === 'danger' || type === 'Error')) {
        setTimeout(function(){ el.style.display = 'none'; }, 3000);
    }
}

function scrollToTopAlert(){
    try { var el = document.getElementById('topAlert'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(e) {}
}

// Handle rename button clicks
function handleRenameButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-rename')) {
        var currentName = e.target.getAttribute('data-ws');
        if (!currentName || e.target.disabled) return;

        // Populate modal with current name
        document.getElementById('renameSource').textContent = currentName;
        document.getElementById('renameNewName').value = currentName;

        // Show modal
        document.getElementById('renameModal').style.display = 'flex';

        // Set up confirm button handler
        document.getElementById('confirmRenameBtn').onclick = function() {
            var newName = document.getElementById('renameNewName').value.trim();
            if (!newName) {
                showTopAlert(tr('workspaces.validation.enter_new_name', {}, 'Please enter a new name'), 'danger');
                return;
            }
            if (!isValidWorkspaceName(newName)) {
                showTopAlert(tr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, dash or underscore only'), 'danger');
                return;
            }
            if (newName === currentName) {
                showTopAlert(tr('workspaces.validation.new_name_must_differ', {}, 'New name must be different from current name'), 'danger');
                return;
            }

            // Disable button to prevent double clicks
            try { document.getElementById('confirmRenameBtn').disabled = true; } catch(e) {}

            var params = new URLSearchParams({
                action: 'rename',
                name: currentName,
                new_name: newName
            });

            fetch('workspaces.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: params.toString()
            })
            .then(function(resp) { return resp.json(); })
            .then(function(json) {
                // Re-enable button
                try { document.getElementById('confirmRenameBtn').disabled = false; } catch(e) {}

                if (json && json.success) {
                    showAjaxAlert(tr('workspaces.alerts.renamed_success', {}, 'Workspace renamed successfully'), 'success');
                    // Close modal
                    try { closeRenameModal(); } catch(e) {}
                    
                    // Update localStorage if the renamed workspace was selected
                    try {
                        var stored = localStorage.getItem('poznote_selected_workspace');
                        if (stored === currentName) {
                            localStorage.setItem('poznote_selected_workspace', newName);
                        }
                    } catch(e) {}
                    
                    // Reload page to show updated workspace name
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    showAjaxAlert(tr('workspaces.alerts.error_prefix', { error: (json.error || tr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                }
            })
            .catch(function() {
                try { document.getElementById('confirmRenameBtn').disabled = false; } catch(e) {}
                showAjaxAlert(tr('workspaces.alerts.rename_error', {}, 'Error renaming workspace'), 'danger');
            });
        };
    }
}

// Handle select button clicks
function handleSelectButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-select')) {
        var name = e.target.getAttribute('data-ws');
        if (!name) return;
        try { localStorage.setItem('poznote_selected_workspace', name); } catch(err) {}
        try {
            var leftHeader = document.querySelector('.left-header-text'); if (leftHeader) leftHeader.textContent = name;
        } catch(err) {}
        // navigate to main notes page with workspace filter
        window.location = 'index.php?workspace=' + encodeURIComponent(name);
    }
}

// Handle delete button clicks
function handleDeleteButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-delete')) {
        var workspaceName = e.target.getAttribute('data-ws');
        if (!workspaceName || e.target.disabled) return;

        // Populate modal with workspace name
        document.getElementById('deleteWorkspaceName').textContent = workspaceName;
        document.getElementById('confirmDeleteInput').value = '';

        // Show modal
        document.getElementById('deleteModal').style.display = 'flex';

        // Set up input validation
        var inputEl = document.getElementById('confirmDeleteInput');
        var confirmBtn = document.getElementById('confirmDeleteBtn');

        function checkInput() {
            confirmBtn.disabled = inputEl.value.trim() !== workspaceName;
        }

        inputEl.addEventListener('input', checkInput);
        checkInput(); // initial check

        // Set up confirm button handler
        confirmBtn.onclick = function() {
            if (inputEl.value.trim() !== workspaceName) return;

            // Disable button to prevent double clicks
            confirmBtn.disabled = true;

            var params = new URLSearchParams({
                action: 'delete',
                name: workspaceName
            });

            fetch('workspaces.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: params.toString()
            })
            .then(function(resp) { return resp.json(); })
            .then(function(json) {
                if (json && json.success) {
                    showAjaxAlert(tr('workspaces.alerts.deleted_success', {}, 'Workspace deleted successfully'), 'success');
                    // Close modal
                    try { closeDeleteModal(); } catch(e) {}
                    // If the deleted workspace was the one stored in localStorage, find another workspace
                    try {
                        var stored = localStorage.getItem('poznote_selected_workspace');
                        if (stored && stored === workspaceName) {
                            // Find another workspace from the page
                            var newWorkspace = null;
                            var items = document.querySelectorAll('.workspace-name-item');
                            for (var i = 0; i < items.length; i++) {
                                var wsName = items[i].textContent.trim();
                                if (wsName !== workspaceName) {
                                    newWorkspace = wsName;
                                    break;
                                }
                            }
                            if (newWorkspace) {
                                localStorage.setItem('poznote_selected_workspace', newWorkspace);
                            }
                        }
                    } catch (e) {}
                    // Additionally clean any folder-related localStorage keys left by this workspace
                    try {
                        // Remove keys by prefix
                        var keysToRemove = [];
                        try {
                            for (var i = 0; i < localStorage.length; i++) {
                                var key = localStorage.key(i);
                                if (!key) continue;
                                    if (key.indexOf('folder_') === 0) {
                                    keysToRemove.push(key);
                                }
                            }
                        } catch(e) { keysToRemove = []; }

                        for (var j = 0; j < keysToRemove.length; j++) {
                            try { localStorage.removeItem(keysToRemove[j]); } catch(e) {}
                        }

                    } catch(e) {}
                    // Update the default workspace dropdown if needed
                    try {
                        // If there's a loadDefaultWorkspaceSetting function available, call it to refresh the dropdown
                        if (typeof window.loadDefaultWorkspaceSetting === 'function') {
                            window.loadDefaultWorkspaceSetting();
                        }
                    } catch (e) {}
                    
                    // Reload page to show updated workspace list
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    showAjaxAlert(tr('workspaces.alerts.error_prefix', { error: (json.error || tr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                    confirmBtn.disabled = false; // re-enable on error
                }
            })
            .catch(function() {
                confirmBtn.disabled = false; // re-enable on error
                showAjaxAlert(tr('workspaces.alerts.delete_error', {}, 'Error deleting workspace'), 'danger');
            });
        };
    }
}

// ========== Workspaces Page Functions ==========
// These functions are used on workspaces.php management page

function formatNotesCount(num) {
    if (num === 0) return tr('workspaces.count.notes_0', {}, '0 notes');
    if (num === 1) return tr('workspaces.count.notes_1', {}, '1 note');
    return tr('workspaces.count.notes_n', { count: num }, '{{count}} notes');
}

// Handle workspace creation with AJAX
function handleCreateWorkspace(event) {
    event.preventDefault();
    
    var nameInput = document.getElementById('workspace-name');
    var name = nameInput.value.trim();
    
    // Validate
    if (name === '') {
        showTopAlert(tr('workspaces.validation.enter_name', {}, 'Enter a workspace name'), 'danger');
        scrollToTopAlert();
        return false;
    }
    if (!isValidWorkspaceName(name)) {
        showTopAlert(tr('workspaces.validation.invalid_name', {}, 'Invalid name: use letters, numbers, dash or underscore only'), 'danger');
        scrollToTopAlert();
        return false;
    }
    
    // Disable button to prevent double clicks
    var createBtn = document.getElementById('createWorkspaceBtn');
    if (createBtn) createBtn.disabled = true;
    
    var params = new URLSearchParams({
        action: 'create',
        name: name
    });
    
    fetch('workspaces.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        body: params.toString()
    })
    .then(function(resp) { return resp.json(); })
    .then(function(json) {
        // Re-enable button
        if (createBtn) createBtn.disabled = false;
        
        if (json && json.success) {
            showAjaxAlert(tr('workspaces.messages.created', {}, 'Workspace created'), 'success');
            
            // Clear input
            nameInput.value = '';
            
            // Reload page to show the new workspace in the list
            setTimeout(function() {
                window.location.reload();
            }, 1000);
        } else {
            showAjaxAlert(tr('workspaces.alerts.error_prefix', { error: (json.error || tr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
        }
    })
    .catch(function() {
        if (createBtn) createBtn.disabled = false;
        showAjaxAlert(tr('workspaces.alerts.create_error', {}, 'Error creating workspace'), 'danger');
    });
    
    return false;
}

// Handle move button clicks
function handleMoveButtonClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('btn-move')) {
        // Prevent action if button is disabled
        if (e.target.disabled) {
            return;
        }
        
        var source = e.target.getAttribute('data-ws');
        if (!source) return;
        
        document.getElementById('moveSourceName').textContent = source;
        
        // Populate targets from data attribute on body
        var sel = document.getElementById('moveTargetSelect');
        sel.innerHTML = '';
        
        var workspacesList = [];
        try {
            workspacesList = JSON.parse(document.body.getAttribute('data-workspaces') || '[]');
        } catch(e) {
            workspacesList = [];
        }
        
        workspacesList.forEach(function(w) {
            if (w !== source) {
                var opt = document.createElement('option');
                opt.value = w;
                opt.text = w;
                sel.appendChild(opt);
            }
        });
        
        document.getElementById('moveNotesModal').style.display = 'flex';
        
        // confirm handler
        document.getElementById('confirmMoveBtn').onclick = function() {
            var target = sel.value;
            if (!target) { 
                alert(tr('workspaces.move.choose_target', {}, 'Choose a target')); 
                return; 
            }
            
            // disable to prevent double clicks
            var confirmBtn = document.getElementById('confirmMoveBtn');
            try { confirmBtn.disabled = true; } catch(e) {}
            
            var params = new URLSearchParams({ action: 'move_notes', name: source, target: target });
            fetch('workspaces.php', {
                method: 'POST',
                headers: {
                    'Content-Type':'application/x-www-form-urlencoded',
                    'X-Requested-With':'XMLHttpRequest',
                    'Accept':'application/json'
                },
                body: params.toString()
            })
            .then(function(resp){ 
                if (!resp.ok) {
                    throw new Error('HTTP error ' + resp.status);
                }
                return resp.json(); 
            })
            .then(function(json){
                // Re-enable button
                try { confirmBtn.disabled = false; } catch(e) {}
                if (json && json.success) {
                    showAjaxAlert(tr('workspaces.move.moved_to', { count: (json.moved||0), target: json.target }, 'Moved {{count}} notes to {{target}}'), 'success');
                    // Update counts in the displayed workspace list
                    try {
                        (function(){
                            var moved = parseInt(json.moved || 0, 10);
                            if (!moved) return;
                            var src = (source || '').trim();
                            var tgt = (json.target || '').trim();
                            function adjustCountFor(name, delta) {
                                var rows = document.querySelectorAll('.ws-name-row');
                                for (var i = 0; i < rows.length; i++) {
                                    var nEl = rows[i].querySelector('.workspace-name-item');
                                    var cEl = rows[i].querySelector('.workspace-count');
                                    if (!nEl || !cEl) continue;
                                    if (nEl.textContent.trim() === name) {
                                        var text = cEl.textContent.trim();
                                        var num = parseInt(text, 10);
                                        if (isNaN(num)) {
                                            var m = text.match(/(\d+)/);
                                            num = m ? parseInt(m[1], 10) : 0;
                                        }
                                        num = Math.max(0, num + delta);
                                        cEl.textContent = formatNotesCount(num);
                                        break;
                                    }
                                }
                            }
                            if (src) adjustCountFor(src, -moved);
                            if (tgt) adjustCountFor(tgt, moved);
                        })();
                    } catch (e) {
                        // non-fatal UI update error
                    }
                    // Persist the selected workspace so returning to notes shows destination
                    try { localStorage.setItem('poznote_selected_workspace', json.target); } catch(e) {}
                    // Update any Back to Notes links on this page to include the workspace param
                    try {
                        var backLinks = document.querySelectorAll('a.btn.btn-secondary');
                        for (var i = 0; i < backLinks.length; i++) {
                            var href = backLinks[i].getAttribute('href') || '';
                            if (href.indexOf('index.php') !== -1) {
                                backLinks[i].setAttribute('href', 'index.php?workspace=' + encodeURIComponent(json.target));
                            }
                        }
                    } catch(e) {}
                    // Close the modal on success
                    try { closeMoveModal(); } catch(e) {}
                } else {
                    showAjaxAlert(tr('workspaces.alerts.error_prefix', { error: (json.error || tr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error: {{error}}'), 'danger');
                }
            }).catch(function(err){
                try { confirmBtn.disabled = false; } catch(e) {}
                showAjaxAlert(tr('workspaces.move.error_moving_notes', { error: (err.message || tr('workspaces.alerts.unknown_error', {}, 'Unknown error')) }, 'Error moving notes: {{error}}'), 'danger');
            });
        };
    }
}

// Default Workspace Management
function loadDefaultWorkspaceSetting() {
    var select = document.getElementById('defaultWorkspaceSelect');
    if (!select) return;
    
    var lastOpenedLabel = document.body.getAttribute('data-txt-last-opened') || 'Last workspace opened';
    
    // Populate select with workspaces from data attribute
    select.innerHTML = '';
    
    // Add special option for last workspace opened
    var optLast = document.createElement('option');
    optLast.value = '__last_opened__';
    optLast.textContent = '🕐 ' + lastOpenedLabel;
    select.appendChild(optLast);
    
    var workspacesList = [];
    try {
        workspacesList = JSON.parse(document.body.getAttribute('data-workspaces') || '[]');
    } catch(e) {
        workspacesList = [];
    }
    
    // Add separator if there are workspaces
    if (workspacesList.length > 0) {
        var optSep = document.createElement('option');
        optSep.disabled = true;
        optSep.textContent = '──────────────';
        select.appendChild(optSep);
    }
    
    workspacesList.forEach(function(w) {
        var opt = document.createElement('option');
        opt.value = w;
        opt.textContent = '📁 ' + w;
        select.appendChild(opt);
    });
    
    // Load current default workspace setting
    var form = new FormData();
    form.append('action', 'get');
    form.append('key', 'default_workspace');
    
    fetch('api_settings.php', {method: 'POST', body: form})
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (j && j.success && j.value) {
                select.value = j.value;
            } else {
                // Default to "Last workspace opened" if not set
                select.value = '__last_opened__';
            }
        })
        .catch(function() {
            select.value = '__last_opened__';
        });
}

function saveDefaultWorkspaceSetting() {
    var select = document.getElementById('defaultWorkspaceSelect');
    var status = document.getElementById('defaultWorkspaceStatus');
    if (!select) return;
    
    var lastOpenedLabel = document.body.getAttribute('data-txt-last-opened') || 'Last workspace opened';
    var selectedWorkspace = select.value;
    var setForm = new FormData();
    setForm.append('action', 'set');
    setForm.append('key', 'default_workspace');
    setForm.append('value', selectedWorkspace);
    
    fetch('api_settings.php', {method: 'POST', body: setForm})
        .then(function(r) { return r.json(); })
        .then(function(result) {
            if (result && result.success) {
                if (status) {
                    var displayText = selectedWorkspace === '__last_opened__' 
                        ? lastOpenedLabel
                        : selectedWorkspace;
                    status.textContent = tr('workspaces.default.status_set_to', { workspace: displayText }, '✓ Default workspace set to: {{workspace}}');
                    status.style.display = 'block';
                    setTimeout(function() {
                        status.style.display = 'none';
                    }, 3000);
                }
            } else {
                alert(tr('workspaces.default.error_saving', {}, 'Error saving default workspace'));
            }
        })
        .catch(function() {
            alert(tr('workspaces.default.error_saving', {}, 'Error saving default workspace'));
        });
}

// Initialize workspaces management page
function initializeWorkspacesPage() {
    // Only run on workspaces.php page
    if (!document.getElementById('create-workspace-form')) return;
    
    // Handle clear workspace redirect (when workspace was deleted and need to redirect)
    var clearWs = document.body.getAttribute('data-clear-workspace');
    if (clearWs) {
        try {
            var firstWs = JSON.parse(clearWs);
            localStorage.setItem('poznote_selected_workspace', firstWs);
            window.location = 'index.php?workspace=' + encodeURIComponent(firstWs);
            return; // Exit early, redirect will happen
        } catch(e) {}
    }
    
    // Add event listeners for buttons
    document.addEventListener('click', handleRenameButtonClick);
    document.addEventListener('click', handleSelectButtonClick);
    document.addEventListener('click', handleDeleteButtonClick);
    document.addEventListener('click', handleMoveButtonClick);
    
    // Create workspace form
    var createForm = document.getElementById('create-workspace-form');
    if (createForm) {
        createForm.addEventListener('submit', handleCreateWorkspace);
    }
    
    // Update back link with stored workspace
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        var a = document.getElementById('backToNotesLink');
        if (a && stored) {
            var exists = false;
            try {
                var items = document.querySelectorAll('.workspace-name-item');
                for (var i = 0; i < items.length; i++) {
                    if (items[i].textContent.trim() === stored) { exists = true; break; }
                }
            } catch (e) {
                exists = false;
            }

            if (exists) {
                a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
            } else {
                var firstWsName = document.querySelector('.workspace-name-item');
                var fallbackWs = firstWsName ? firstWsName.textContent.trim() : '';
                try { localStorage.setItem('poznote_selected_workspace', fallbackWs); } catch(e) {}
                a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(fallbackWs));
            }
        }
    } catch(e) {}
    
    // Initialize default workspace dropdown
    loadDefaultWorkspaceSetting();
    
    // Attach save button handler
    var saveBtn = document.getElementById('saveDefaultWorkspaceBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveDefaultWorkspaceSetting);
    }
}

// Expose functions globally
window.loadDefaultWorkspaceSetting = loadDefaultWorkspaceSetting;
window.handleCreateWorkspace = handleCreateWorkspace;

// Auto-initialize workspaces page on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initializeWorkspacesPage);
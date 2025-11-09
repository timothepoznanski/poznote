// Workspace management

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
            selectedWorkspace = 'Poznote';
            try { 
                localStorage.setItem('poznote_selected_workspace', 'Poznote'); 
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
    menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-spinner fa-spin"></i>Loading workspaces...</div>';
    menu.style.display = 'block';
    
    fetch('api_workspaces.php?action=list')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                displayWorkspaceMenu(menu, data.workspaces);
            } else {
                menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-exclamation-triangle"></i>Error loading workspaces</div>';
            }
        })
        .catch(function(error) {
            menu.innerHTML = '<div class="workspace-menu-item"><i class="fa-exclamation-triangle"></i>Error loading workspaces</div>';
        });
}

function displayWorkspaceMenu(menu, workspaces) {
    // Use window.selectedWorkspace first (set by PHP), then fall back to selectedWorkspace variable
    var currentWorkspace = (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : (selectedWorkspace || 'Poznote');
    var menuHtml = '';
    
    // Add default workspace if it's not in the list
    var workspaceExists = false;
    for (var i = 0; i < workspaces.length; i++) {
        if (workspaces[i].name === currentWorkspace) {
            workspaceExists = true;
            break;
        }
    }
    
    if (!workspaceExists && currentWorkspace === 'Poznote') {
        workspaces.unshift({ name: 'Poznote', created: null });
    }
    
    // Sort workspaces: Poznote first, then alphabetically
    workspaces.sort(function(a, b) {
        if (a.name === 'Poznote') return -1;
        if (b.name === 'Poznote') return 1;
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
    menuHtml += '<span>Workspaces</span>';
    menuHtml += '</div>';
    // Add Logout right after Settings
    menuHtml += '<div class="workspace-menu-item" onclick="window.location.href=\'logout.php\';">';
    menuHtml += '<i class="fa-sign-out-alt"></i>';
    menuHtml += '<span>Logout</span>';
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
    if (v === '') { showTopAlert('Enter a workspace name', 'danger'); scrollToTopAlert(); return false; }
    if (!isValidWorkspaceName(v)) { showTopAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger'); scrollToTopAlert(); return false; }
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
                showTopAlert('Please enter a new name', 'danger');
                return;
            }
            if (!isValidWorkspaceName(newName)) {
                showTopAlert('Invalid name: use letters, numbers, dash or underscore only', 'danger');
                return;
            }
            if (newName === currentName) {
                showTopAlert('New name must be different from current name', 'danger');
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
                    showAjaxAlert('Workspace renamed successfully', 'success');
                    // Close modal
                    try { closeRenameModal(); } catch(e) {}
                    // Reload page to show updated workspace name
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    showAjaxAlert('Error: ' + (json.error || 'Unknown error'), 'danger');
                }
            })
            .catch(function() {
                try { document.getElementById('confirmRenameBtn').disabled = false; } catch(e) {}
                showAjaxAlert('Error renaming workspace', 'danger');
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
                    showAjaxAlert('Workspace deleted successfully', 'success');
                    // Close modal
                    try { closeDeleteModal(); } catch(e) {}
                    // If the deleted workspace was the one stored in localStorage, clear it so other pages don't link to a removed workspace
                    try {
                        var stored = localStorage.getItem('poznote_selected_workspace');
                        if (stored && stored === workspaceName) {
                            localStorage.setItem('poznote_selected_workspace', 'Poznote');
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
                    // Reload page to show updated workspace list
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    showAjaxAlert('Error: ' + (json.error || 'Unknown error'), 'danger');
                    confirmBtn.disabled = false; // re-enable on error
                }
            })
            .catch(function() {
                confirmBtn.disabled = false; // re-enable on error
                showAjaxAlert('Error deleting workspace', 'danger');
            });
        };
    }
}
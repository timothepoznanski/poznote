// Gestion des workspaces

function initializeWorkspaces() {
    var wsSelector = document.getElementById('workspaceSelector');
    
    // Charger le workspace depuis localStorage
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) selectedWorkspace = stored;
    } catch(e) {}

    // Valider que le workspace existe dans le sélecteur
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

    // Charger les paramètres du dossier par défaut
    loadDefaultFolderSettings();
}

function onWorkspaceChange() {
    var wsSelector = document.getElementById('workspaceSelector');
    if (!wsSelector) return;
    
    var val = wsSelector.value;
    selectedWorkspace = val;
    
    try { 
        localStorage.setItem('poznote_selected_workspace', val); 
    } catch(e) {}
    
    // Recharger la page avec le nouveau workspace
    var url = new URL(window.location.href);
    url.searchParams.set('workspace', val);
    window.location.href = url.toString();
}

function loadDefaultFolderSettings() {
    fetch("api_default_folder_settings.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "action=get_default_folder_name&workspace=" + encodeURIComponent(selectedWorkspace || 'Poznote')
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            updateDefaultFolderName(data.default_folder_name);
        }
    })
    .catch(function(error) {
        console.log('Erreur lors du chargement des paramètres du dossier:', error);
    });
}

function toggleWorkspaceMenu(event) {
    event.stopPropagation();
    
    var isMobile = window.innerWidth <= 768;
    var menuId = isMobile ? 'workspaceMenuMobile' : 'workspaceMenu';
    var menu = document.getElementById(menuId);
    
    if (!menu) return;
    
    // Fermer l'autre menu s'il existe
    var otherMenuId = isMobile ? 'workspaceMenu' : 'workspaceMenuMobile';
    var otherMenu = document.getElementById(otherMenuId);
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
    menu.innerHTML = '<div class="workspace-menu-item"><i class="fas fa-spinner fa-spin"></i>Loading workspaces...</div>';
    menu.style.display = 'block';
    
    fetch('api_workspaces.php?action=list')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                displayWorkspaceMenu(menu, data.workspaces);
            } else {
                menu.innerHTML = '<div class="workspace-menu-item"><i class="fas fa-exclamation-triangle"></i>Error loading workspaces</div>';
            }
        })
        .catch(function(error) {
            menu.innerHTML = '<div class="workspace-menu-item"><i class="fas fa-exclamation-triangle"></i>Error loading workspaces</div>';
        });
}

function displayWorkspaceMenu(menu, workspaces) {
    var currentWorkspace = selectedWorkspace || 'Poznote';
    var menuHtml = '';
    
    // Ajouter le workspace par défaut s'il n'est pas dans la liste
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
    
    // Trier les workspaces: Poznote en premier, puis alphabétiquement
    workspaces.sort(function(a, b) {
        if (a.name === 'Poznote') return -1;
        if (b.name === 'Poznote') return 1;
        return a.name.localeCompare(b.name);
    });
    
    // Créer les éléments du menu
    for (var i = 0; i < workspaces.length; i++) {
        var workspace = workspaces[i];
        var isCurrent = workspace.name === currentWorkspace;
        var currentClass = isCurrent ? ' current-workspace' : '';
        var icon = isCurrent ? 'fas fa-check' : 'fas fa-layer-group';
        
        menuHtml += '<div class="workspace-menu-item' + currentClass + '" onclick="switchToWorkspace(\'' + workspace.name + '\')">';
        menuHtml += '<i class="' + icon + '"></i>';
        menuHtml += '<span>' + workspace.name + '</span>';
        menuHtml += '</div>';
    }
    
    // Ajouter le lien de gestion
    menuHtml += '<div class="workspace-menu-divider"></div>';
    menuHtml += '<div class="workspace-menu-item" onclick="window.location.href=\'manage_workspaces.php\';">';
    menuHtml += '<i class="fas fa-cog"></i>';
    menuHtml += '<span>Workspaces</span>';
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
    
    var url = new URL(window.location.href);
    url.searchParams.delete('note');
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');
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
    url.searchParams.delete('preserve_notes');
    url.searchParams.delete('preserve_tags');
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
        }
    })
    .catch(function(err) {
        console.log('Erreur lors du rafraîchissement:', err);
    });
}

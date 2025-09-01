// Interface utilisateur (menus, modales, notifications)

function showNotificationPopup(message, type) {
    type = type || 'success';
    
    var popup = document.getElementById('notificationPopup');
    var overlay = document.getElementById('notificationOverlay');
    
    if (!popup || !overlay) {
        // Fallback si les éléments n'existent pas
        alert(message);
        return;
    }
    
    popup.innerText = message;
    
    // Supprimer les classes existantes
    popup.classList.remove('notification-success', 'notification-error');
    
    // Ajouter la classe appropriée
    if (type === 'error') {
        popup.classList.add('notification-error');
    } else {
        popup.classList.add('notification-success');
    }
    
    // Afficher
    overlay.style.display = 'block';
    popup.style.display = 'block';

    // Fonction pour masquer
    function hideNotification() {
        overlay.style.display = 'none';
        popup.style.display = 'none';
        overlay.removeEventListener('click', hideNotification);
        popup.removeEventListener('click', hideNotification);
    }

    // Permettre la fermeture en cliquant
    overlay.addEventListener('click', hideNotification);
    popup.addEventListener('click', hideNotification);
    
    // Fermeture automatique après 3 secondes pour les succès
    if (type === 'success') {
        setTimeout(hideNotification, 3000);
    }
}

function toggleNoteMenu(noteId) {
    var menu = document.getElementById('note-menu-' + noteId);
    var button = document.getElementById('settings-btn-' + noteId);
    
    if (!menu || !button) return;
    
    // Fermer tous les autres menus
    var allMenus = document.querySelectorAll('.dropdown-menu');
    for (var i = 0; i < allMenus.length; i++) {
        var otherMenu = allMenus[i];
        if (otherMenu.id !== 'note-menu-' + noteId) {
            otherMenu.style.display = 'none';
        }
    }
    
    // Basculer le menu actuel
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        button.classList.add('active');
        
        // Fermer le menu en cliquant ailleurs
        setTimeout(function() {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && !button.contains(e.target)) {
                    menu.style.display = 'none';
                    button.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    } else {
        menu.style.display = 'none';
        button.classList.remove('active');
    }
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Actions spéciales pour certaines modales
    if (modalId === 'attachmentModal') {
        hideAttachmentError();
        resetAttachmentForm();
    }
}

function resetAttachmentForm() {
    var fileInput = document.getElementById('attachmentFile');
    var fileNameDiv = document.getElementById('selectedFileName');
    var uploadButtonContainer = document.querySelector('.upload-button-container');
    
    if (fileInput) fileInput.value = '';
    if (fileNameDiv) fileNameDiv.textContent = '';
    if (uploadButtonContainer) {
        uploadButtonContainer.classList.remove('show');
    }
}

function displaySavingInProgress() {
    var elem = document.getElementById('lastupdated' + noteid);
    if (elem) {
        elem.innerHTML = '<span style="color:#FF0000;">Sauvegarde en cours...</span>';
    }
    setSaveButtonRed(true);
}

function displayEditInProgress() {
    var elem = document.getElementById('lastupdated' + noteid);
    if (elem) {
        elem.innerHTML = '<span>Modification en cours...</span>';
    }
    setSaveButtonRed(true);
}

function setSaveButtonRed(isRed) {
    // Chercher le bouton de sauvegarde
    var saveBtn = document.querySelector('.toolbar-btn > .fa-save');
    if (saveBtn) {
        saveBtn = saveBtn.parentElement;
    }
    
    if (!saveBtn) {
        // Fallback: chercher parmi tous les boutons
        var btns = document.querySelectorAll('.toolbar-btn');
        for (var i = 0; i < btns.length; i++) {
            var btn = btns[i];
            if (btn.querySelector('.fa-save')) {
                saveBtn = btn;
                break;
            }
        }
    }
    
    if (saveBtn) {
        if (isRed) {
            saveBtn.style.color = '#FF0000';
            saveBtn.style.fontWeight = 'bold';
        } else {
            saveBtn.style.color = '';
            saveBtn.style.fontWeight = '';
        }
    }
}

function showContactPopup() {
    var modal = document.getElementById('contactModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeContactModal() {
    var modal = document.getElementById('contactModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function initializeWorkspaceMenu() {
    // Fermer le menu workspace en cliquant ailleurs
    document.addEventListener('click', function(e) {
        var workspaceMenus = document.querySelectorAll('.workspace-menu');
        for (var i = 0; i < workspaceMenus.length; i++) {
            var menu = workspaceMenus[i];
            if (!menu.parentElement.contains(e.target)) {
                menu.style.display = 'none';
            }
        }
    });
}

// Gestion de l'historique du navigateur pour les workspaces
function initializeBrowserHistory() {
    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.workspace) {
            var workspaceName = event.state.workspace;
            updateWorkspaceNameInHeaders(workspaceName);
            selectedWorkspace = workspaceName;
            refreshLeftColumnForWorkspace(workspaceName);
        }
    });
}

// Gestion du menu des paramètres
function toggleSettingsMenu(event) {
    event.stopPropagation();
    
    // Essayer de trouver le menu disponible (mobile ou desktop)
    var menu = document.getElementById('settingsMenuMobile');
    if (!menu) {
        menu = document.getElementById('settingsMenu');
    }
    
    // Check that menu exists
    if (!menu) {
        console.error('No settings menu element found');
        return;
    }
    
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        
        // Fermer le menu en cliquant ailleurs
        setTimeout(function() {
            document.addEventListener('click', function closeSettingsMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeSettingsMenu);
                }
            });
        }, 100);
    } else {
        menu.style.display = 'none';
    }
}

// Replier tous les dossiers
function foldAllFolders() {
    var folderContents = document.querySelectorAll('.folder-content');
    var folderIcons = document.querySelectorAll('.folder-icon');
    
    for (var i = 0; i < folderContents.length; i++) {
        var content = folderContents[i];
        content.style.display = 'none';
        try {
            localStorage.setItem('folder_' + content.id, 'closed');
        } catch(e) {}
    }
    
    for (var i = 0; i < folderIcons.length; i++) {
        var icon = folderIcons[i];
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    }
    
    // Fermer le menu des paramètres
    closeSettingsMenus();
}

// Déplier tous les dossiers
function unfoldAllFolders() {
    var folderContents = document.querySelectorAll('.folder-content');
    var folderIcons = document.querySelectorAll('.folder-icon');
    
    for (var i = 0; i < folderContents.length; i++) {
        var content = folderContents[i];
        content.style.display = 'block';
        try {
            localStorage.setItem('folder_' + content.id, 'open');
        } catch(e) {}
    }
    
    for (var i = 0; i < folderIcons.length; i++) {
        var icon = folderIcons[i];
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    }
    
    // Fermer le menu des paramètres
    closeSettingsMenus();
}

// Fermer les menus de paramètres
function closeSettingsMenus() {
    var settingsMenu = document.getElementById('settingsMenu');
    var settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
}

// Afficher le prompt pour modifier le nom d'affichage de connexion
function showLoginDisplayNamePrompt() {
    var modal = document.getElementById('loginDisplayModal');
    var input = document.getElementById('loginDisplayInput');
    var saveBtn = document.getElementById('saveLoginDisplayBtn');
    
    if (!modal || !input || !saveBtn) {
        console.warn('Éléments de modal de login manquants', {modal: !!modal, input: !!input, saveBtn: !!saveBtn});
        // Fallback vers un prompt si la modal n'est pas présente
        var val = prompt('Nom d\'affichage de connexion (vide pour effacer):');
        if (val === null) return;
        
        var params = new URLSearchParams({ action: 'set', key: 'login_display_name', value: val });
        fetch('api_settings.php', { 
            method: 'POST', 
            headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
            body: params.toString() 
        })
        .then(function(r) { return r.json(); })
        .then(function(resp) { 
            if (resp && resp.success) {
                alert('Saved'); 
            } else {
                alert('Save error'); 
            }
        })
        .catch(function() { 
            alert('Network error'); 
        });
        return;
    }

    // Fonction helper pour gérer les réponses du serveur
    function doSet(value) {
        var params = new URLSearchParams({ action: 'set', key: 'login_display_name', value: value });
        return fetch('api_settings.php', { 
            method: 'POST', 
            credentials: 'same-origin', 
            headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
            body: params.toString() 
        })
        .then(function(r) {
            if (!r.ok) {
                console.error('Erreur api_settings SET', r.status);
                showNotificationPopup('Server error', 'error');
                return null;
            }
            return r.json();
        })
        .catch(function(e) { 
            console.error('Erreur api_settings SET parse', e); 
            return null; 
        });
    }

    // Charger la valeur actuelle et afficher la modal
    fetch('api_settings.php', { 
        method: 'POST', 
        credentials: 'same-origin', 
        headers: { 'Content-Type':'application/x-www-form-urlencoded' }, 
        body: 'action=get&key=login_display_name' 
    })
    .then(function(r) {
        if (!r.ok) {
            console.error('Erreur api_settings GET', r.status);
            showNotificationPopup('Server error', 'error');
            return null;
        }
        return r.json();
    })
    .then(function(res) {
        if (!res) return;
        
        input.value = (res && res.success) ? (res.value || '') : '';
        modal.style.display = 'flex';
        
        // Attacher le gestionnaire
        saveBtn.onclick = function() {
            var val = input.value.trim();
            if (!val) {
                showNotificationPopup('Display name is required', 'error');
                return;
            }
            
            doSet(val).then(function(resp) {
                if (!resp) return;
                
                if (resp && resp.success) {
                    modal.style.display = 'none';
                } else {
                    showNotificationPopup('Save error', 'error');
                }
            })
            .catch(function() {
                showNotificationPopup('Network error', 'error'); 
            });
        };
    })
    .catch(function() {
        input.value = '';
        modal.style.display = 'flex';
        
        saveBtn.onclick = function() {
            var val = input.value.trim();
            if (!val) {
                showNotificationPopup('Display name is required', 'error');
                return;
            }
            
            doSet(val).then(function(resp) { 
                if (!resp) return; 
                
                if (resp && resp.success) { 
                    modal.style.display = 'none'; 
                } else { 
                    showNotificationPopup('Save error', 'error'); 
                } 
            })
            .catch(function() { 
                showNotificationPopup('Network error', 'error'); 
            });
        };
    });
}

// Fermer la modal de nom d'affichage de connexion
function closeLoginDisplayModal() {
    var modal = document.getElementById('loginDisplayModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fonctions de modal de confirmation
var confirmedActionCallback = null;

function showConfirmModal(title, message, callback) {
    var modal = document.getElementById('confirmModal');
    var titleElement = document.getElementById('confirmTitle');
    var messageElement = document.getElementById('confirmMessage');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    confirmedActionCallback = callback;
    
    modal.style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmedActionCallback = null;
}

function executeConfirmedAction() {
    if (confirmedActionCallback) {
        confirmedActionCallback();
    }
    closeConfirmModal();
}

// Fonctions pour les modales d'input stylées (remplace window.prompt)
var inputModalCallback = null;

function showInputModal(title, placeholder, defaultValue, callback) {
    // Créer la modale si elle n'existe pas
    var modal = document.getElementById('inputModal');
    if (!modal) {
        createInputModal();
        modal = document.getElementById('inputModal');
    }
    
    var titleElement = document.getElementById('inputModalTitle');
    var inputElement = document.getElementById('inputModalInput');
    
    titleElement.textContent = title;
    inputElement.placeholder = placeholder || '';
    inputElement.value = defaultValue || '';
    inputModalCallback = callback;
    
    modal.style.display = 'flex';
    setTimeout(function() {
        inputElement.focus();
        inputElement.select();
    }, 100);
}

function createInputModal() {
    var modalHtml = '<div id="inputModal" class="modal" style="display: none;">' +
        '<div class="modal-content">' +
        '<div class="modal-header">' +
        '<h3 id="inputModalTitle">Title</h3>' +
        '<span class="close" onclick="closeInputModal()">&times;</span>' +
        '</div>' +
        '<div class="modal-body">' +
        '<input type="text" id="inputModalInput" placeholder="Enter text" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button type="button" class="btn btn-secondary" onclick="closeInputModal()">Cancel</button>' +
        '<button type="button" class="btn btn-primary" onclick="executeInputModalAction()">OK</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Ajouter l'event listener pour Enter
    var input = document.getElementById('inputModalInput');
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            executeInputModalAction();
        }
    });
}

function closeInputModal() {
    document.getElementById('inputModal').style.display = 'none';
    inputModalCallback = null;
}

function executeInputModalAction() {
    var inputValue = document.getElementById('inputModalInput').value.trim();
    var callback = inputModalCallback;
    
    closeInputModal();
    
    if (callback) {
        callback(inputValue);
    }
}

// Link modal functionality
var linkModalCallback = null;

function showLinkModal(defaultUrl, defaultText, callback) {
    // Create modal if it doesn't exist
    var modal = document.getElementById('linkModal');
    
    if (!modal) {
        createLinkModal();
        modal = document.getElementById('linkModal');
    }
    
    var urlInput = document.getElementById('linkModalUrl');
    var textInput = document.getElementById('linkModalText');
    
    urlInput.value = defaultUrl || 'https://';
    textInput.value = defaultText || '';
    linkModalCallback = callback;
    
    modal.style.display = 'flex';
    setTimeout(function() {
        urlInput.focus();
        urlInput.select();
    }, 100);
}

function createLinkModal() {
    var modalHtml = '<div id="linkModal" class="modal" style="display: none;">' +
        '<div class="modal-content">' +
        '<div class="modal-header">' +
        '<h3>Add Link</h3>' +
        '<span class="close">&times;</span>' +
        '</div>' +
        '<div class="modal-body">' +
        '<div style="margin-bottom: 10px;">' +
        '<label for="linkModalUrl" style="display: block; font-weight: bold; margin-bottom: 5px;">URL:</label>' +
        '<input type="url" id="linkModalUrl" placeholder="https://example.com" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">' +
        '</div>' +
        '<div>' +
        '<label for="linkModalText" style="display: block; font-weight: bold; margin-bottom: 5px;">Link text (optional):</label>' +
        '<input type="text" id="linkModalText" placeholder="Displayed text" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">' +
        '</div>' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button type="button" class="btn btn-secondary" id="linkModalCancel">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="linkModalAdd">Add</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Attach event listeners to buttons
    var closeBtn = document.querySelector('#linkModal .close');
    var cancelBtn = document.getElementById('linkModalCancel');
    var addBtn = document.getElementById('linkModalAdd');
    
    closeBtn.addEventListener('click', function() {
        closeModal('linkModal');
    });
    
    cancelBtn.addEventListener('click', function() {
        closeModal('linkModal');
    });
    
    addBtn.addEventListener('click', function() {
        executeLinkModalAction();
    });
    
    // Attach event listeners for Enter key
    var urlInput = document.getElementById('linkModalUrl');
    var textInput = document.getElementById('linkModalText');
    
    [urlInput, textInput].forEach(function(input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                executeLinkModalAction();
            }
        });
    });
}

function closeLinkModal() {
    closeModal('linkModal');
    linkModalCallback = null;
}

function executeLinkModalAction() {
    var url = document.getElementById('linkModalUrl').value.trim();
    var text = document.getElementById('linkModalText').value.trim();
    var callback = linkModalCallback;
    
    // Reset callback BEFORE calling it to avoid re-entry
    linkModalCallback = null;
    
    if (callback && url) {
        callback(url, text || url);
    }
    
    // Close modal with a slight delay to allow DOM operations to complete
    setTimeout(function() {
        var modal = document.getElementById('linkModal');
        if (modal) {
            modal.remove();
        }
    }, 50);
}

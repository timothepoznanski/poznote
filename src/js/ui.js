// User interface (menus, modals, notifications)

function showNotificationPopup(message, type) {
    type = type || 'success';
    
    var popup = document.getElementById('notificationPopup');
    var overlay = document.getElementById('notificationOverlay');
    
    if (!popup || !overlay) {
        // Fallback if elements don't exist
        alert(message);
        return;
    }
    
    popup.innerText = message;
    
    // Remove existing classes
    popup.classList.remove('notification-success', 'notification-error');
    
    // Add appropriate class
    if (type === 'error') {
        popup.classList.add('notification-error');
    } else {
        popup.classList.add('notification-success');
    }
    
    // Show
    overlay.style.display = 'block';
    popup.style.display = 'block';

    // Function to hide
    function hideNotification() {
        overlay.style.display = 'none';
        popup.style.display = 'none';
        overlay.removeEventListener('click', hideNotification);
        popup.removeEventListener('click', hideNotification);
    }

    // Allow closing by clicking
    overlay.addEventListener('click', hideNotification);
    popup.addEventListener('click', hideNotification);
    
    // Auto close after 3 seconds for success
    if (type === 'success') {
        setTimeout(hideNotification, 3000);
    }
}

function toggleNoteMenu(noteId) {
    var menu = document.getElementById('note-menu-' + noteId);
    var button = document.getElementById('settings-btn-' + noteId);
    
    if (!menu || !button) return;
    
    // Close all other menus
    var allMenus = document.querySelectorAll('.dropdown-menu');
    for (var i = 0; i < allMenus.length; i++) {
        var otherMenu = allMenus[i];
        if (otherMenu.id !== 'note-menu-' + noteId) {
            otherMenu.style.display = 'none';
        }
    }
    
    // Toggle the current menu
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        button.classList.add('active');
        
        // Close menu when clicking elsewhere
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
    
    // Special actions for certain modals
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
        elem.innerHTML = '<span style="color:#FF0000;">Saving in progress...</span>';
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
    // Search the save button
    var saveBtn = document.querySelector('.toolbar-btn > .fa-save');
    if (saveBtn) {
        saveBtn = saveBtn.parentElement;
    }
    
    if (!saveBtn) {
        // Fallback: search among all buttons
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
    // Close workspace menu when clicking elsewhere
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

// Browser history management for workspaces
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

// Settings menu management
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
        
        // Close menu when clicking elsewhere
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

// Close settings menus
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
        console.warn('Missing login modal elements', {modal: !!modal, input: !!input, saveBtn: !!saveBtn});
        // Fallback to prompt if modal is not present
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

    // Helper function to handle server responses
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
        
        // Attach the handler
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

// Close the login display name modal
function closeLoginDisplayModal() {
    var modal = document.getElementById('loginDisplayModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Confirmation modal functions
var confirmedActionCallback = null;

function showConfirmModal(title, message, callback, options) {
    var modal = document.getElementById('confirmModal');
    var titleElement = document.getElementById('confirmTitle');
    var messageElement = document.getElementById('confirmMessage');
    var confirmBtn = document.getElementById('confirmButton');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    confirmedActionCallback = callback;

    // Reset button classes first
    if (confirmBtn) {
        confirmBtn.classList.remove('btn-danger');
        confirmBtn.classList.add('btn-primary');
    }

    // If options specify danger, mark button as dangerous
    if (options && options.danger && confirmBtn) {
        confirmBtn.classList.remove('btn-primary');
        confirmBtn.classList.add('btn-danger');
        // Also set inline styles as a fallback if CSS is overridden elsewhere
        try {
            confirmBtn.style.backgroundColor = '#e04b4b';
            confirmBtn.style.color = '#ffffff';
            confirmBtn.style.border = 'none';
        } catch (e) {
            // ignore
        }
    }
    else if (confirmBtn) {
        // ensure any inline danger styles are cleared when not dangerous
        try {
            confirmBtn.style.backgroundColor = '';
            confirmBtn.style.color = '';
            confirmBtn.style.border = '';
        } catch (e) {}
    }
    
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

// Functions for styled input modals (replaces window.prompt)
var inputModalCallback = null;

function showInputModal(title, placeholder, defaultValue, callback) {
    // Create the modal if it does not exist
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
    
    // Add event listener for Enter key
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

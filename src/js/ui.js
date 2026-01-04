// User interface (menus, modals, notifications)

function showNotificationPopup(message, type) {
    type = type || 'success';
    
    // Use the modal alert system for better styling
    if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
        // Map type to modal alert type
        var alertType = 'info';
        var title = (typeof window.t === 'function') ? window.t('common.notification') : 'Notification';
        
        if (type === 'error') {
            alertType = 'error';
            title = (typeof window.t === 'function') ? window.t('common.error') : 'Error';
        } else if (type === 'warning') {
            alertType = 'warning';
            title = (typeof window.t === 'function') ? window.t('common.warning') : 'Warning';
        } else if (type === 'success') {
            alertType = 'success';
            title = (typeof window.t === 'function') ? window.t('common.success') : 'Success';
        }
        
        window.modalAlert.alert(message, alertType, title);
        return;
    }
    
    // Fallback to old notification system if modalAlert is not available
    var popup = document.getElementById('notificationPopup');
    var overlay = document.getElementById('notificationOverlay');
    
    if (!popup || !overlay) {
        // Final fallback
        alert(message);
        return;
    }
    
    // Allow displayed newlines (\n) in messages to render as line breaks
    popup.style.whiteSpace = 'pre-wrap';
    popup.innerText = message;
    
    // Remove existing classes
    popup.classList.remove('notification-success', 'notification-error', 'notification-warning');
    
    // Add appropriate class
    if (type === 'error') {
        popup.classList.add('notification-error');
    } else if (type === 'warning') {
        popup.classList.add('notification-warning');
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

function setSaveButtonRed(isRed) {
    // Auto-save is now automatic - log status to console only
    if (isRed) {
        console.log('[Poznote Auto-Save] Changes detected for note #' + noteid);
    } else {
        console.log('[Poznote Auto-Save] Note #' + noteid + ' saved successfully');
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
    
    // Try to find the available menu (mobile or desktop)
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
        var promptText = (typeof window.t === 'function') ? window.t('ui.login_display.prompt') : 'Login display name (empty to clear):';
        var val = prompt(promptText);
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
                alert((typeof window.t === 'function') ? window.t('ui.alerts.saved') : 'Saved');
            } else {
                alert((typeof window.t === 'function') ? window.t('ui.alerts.save_error') : 'Save error');
            }
        })
        .catch(function() { 
            alert((typeof window.t === 'function') ? window.t('ui.alerts.network_error') : 'Network error');
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
                    // Refresh settings.php if we're on that page
                    if (window.location.pathname.includes('settings.php')) {
                        if (typeof window.refreshLoginDisplayBadge === 'function') {
                            window.refreshLoginDisplayBadge();
                        }
                    }
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
var saveAndExitActionCallback = null;

function showConfirmModal(title, message, callback, options, saveAndExitCallback) {
    var modal = document.getElementById('confirmModal');
    var titleElement = document.getElementById('confirmTitle');
    var messageElement = document.getElementById('confirmMessage');
    var confirmBtn = document.getElementById('confirmButton');
    var saveAndExitBtn = document.getElementById('saveAndExitButton');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    confirmedActionCallback = callback;
    saveAndExitActionCallback = saveAndExitCallback;

    // Set button text from options or use defaults
    if (confirmBtn) {
        confirmBtn.textContent = (options && options.confirmText) ? options.confirmText : 'Exit without saving';
    }
    if (saveAndExitBtn) {
        saveAndExitBtn.textContent = (options && options.saveAndExitText) ? options.saveAndExitText : 'Save and Exit';
    }

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
    
    // Show or hide the save and exit button
    if (saveAndExitBtn) {
        if (saveAndExitCallback && !(options && options.hideSaveAndExit)) {
            saveAndExitBtn.style.display = 'inline-block';
            saveAndExitBtn.style.visibility = 'visible';
        } else {
            saveAndExitBtn.style.display = 'none';
            saveAndExitBtn.style.visibility = 'hidden';
            // Force hide with important style to override any CSS
            saveAndExitBtn.setAttribute('style', 'display: none !important; visibility: hidden !important;');
        }
    }
    
    modal.style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmedActionCallback = null;
    saveAndExitActionCallback = null;
}

function executeConfirmedAction() {
    if (confirmedActionCallback) {
        confirmedActionCallback();
    }
    closeConfirmModal();
}

function executeSaveAndExitAction() {
    if (saveAndExitActionCallback) {
        saveAndExitActionCallback();
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
    var confirmBtn = document.getElementById('inputModalConfirmBtn');
    var labelElem = document.getElementById('inputModalLabel');

    titleElement.textContent = title;
    // Use placeholder as the field label when provided (eg. 'New folder name')
    // if (labelElem) labelElem.textContent = (placeholder && placeholder.length) ? placeholder : title;
    inputElement.placeholder = placeholder || '';
    inputElement.value = defaultValue || '';
    inputModalCallback = callback;

    // Optional confirm button text: 5th argument
    var confirmText = arguments.length >= 5 ? arguments[4] : 'OK';
    if (confirmBtn) confirmBtn.textContent = confirmText;
    
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
        '<label id="inputModalLabel" for="inputModalInput" style="display:block; margin-bottom:6px; font-weight:600;"></label>' +
        '<input type="text" id="inputModalInput" placeholder="' + (window.t ? window.t('modals.input.placeholder', null, 'Enter text') : 'Enter text') + '" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">' +
        '</div>' +
        '<div class="modal-buttons">' +
        '<button type="button" class="btn-cancel" onclick="closeInputModal()">Cancel</button>' +
        '<button type="button" id="inputModalConfirmBtn" class="btn-primary" onclick="executeInputModalAction()">OK</button>' +
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
    var removeLinkBtn = document.getElementById('linkModalRemove');
    var modalTitle = modal.querySelector('.modal-header h3');
    
    urlInput.value = defaultUrl || 'https://';
    textInput.value = defaultText || '';
    linkModalCallback = callback;
    
    // Update modal title and enable/disable remove button based on whether we're editing an existing link
    var isEditingLink = defaultUrl && defaultUrl !== 'https://';
    if (modalTitle) {
        modalTitle.textContent = isEditingLink ? 
            (typeof window.t === 'function' ? window.t('editor.link.title') : 'Manage Link') : 
            (typeof window.t === 'function' ? window.t('editor.link.add_title') : 'Add Link');
    }
    if (removeLinkBtn) {
        if (isEditingLink) {
            removeLinkBtn.disabled = false;
            removeLinkBtn.classList.remove('btn-disabled');
            removeLinkBtn.classList.add('btn-danger');
        } else {
            removeLinkBtn.disabled = true;
            removeLinkBtn.classList.add('btn-disabled');
            removeLinkBtn.classList.remove('btn-danger');
        }
    }
    
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
        '<h3>' + (window.t ? window.t('editor.link.title', null, 'Manage Link') : 'Manage Link') + '</h3>' +
        '</div>' +
        '<div class="modal-body">' +
        '<div style="margin-bottom: 10px;">' +
        '<label for="linkModalUrl" style="display: block; font-weight: bold; margin-bottom: 5px;">' + (window.t ? window.t('editor.link.url_label', null, 'URL:') : 'URL:') + '</label>' +
        '<input type="url" id="linkModalUrl" placeholder="' + (window.t ? window.t('editor.link.url_placeholder', null, 'https://example.com') : 'https://example.com') + '" />' +
        '</div>' +
        '<div>' +
        '<label for="linkModalText" style="display: block; font-weight: bold; margin-bottom: 5px;">' + (window.t ? window.t('editor.link.text_label', null, 'Link text (optional):') : 'Link text (optional):') + '</label>' +
        '<input type="text" id="linkModalText" placeholder="' + (window.t ? window.t('editor.link.text_placeholder', null, 'Displayed text') : 'Displayed text') + '" />' +
        '</div>' +
        '</div>' +
    '<div class="modal-buttons" style="justify-content: space-between;">' +
    '<button type="button" class="btn btn-disabled" id="linkModalRemove" disabled>' + (window.t ? window.t('editor.link.remove', null, 'Remove link') : 'Remove link') + '</button>' +
    '<div style="display: flex; gap: 10px;">' +
    '<button type="button" class="btn btn-cancel" id="linkModalCancel">' + (window.t ? window.t('editor.link.cancel', null, 'Cancel') : 'Cancel') + '</button>' +
    '<button type="button" class="btn btn-primary" id="linkModalAdd">' + (window.t ? window.t('editor.link.save', null, 'Save') : 'Save') + '</button>' +
    '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Attach event listeners to buttons
    var cancelBtn = document.getElementById('linkModalCancel');
    var addBtn = document.getElementById('linkModalAdd');
    var removeBtn = document.getElementById('linkModalRemove');
    
    cancelBtn.addEventListener('click', function() {
        closeModal('linkModal');
    });
    
    addBtn.addEventListener('click', function() {
        executeLinkModalAction();
    });
    
    removeBtn.addEventListener('click', function() {
        executeLinkModalRemove();
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

function executeLinkModalRemove() {
    var callback = linkModalCallback;
    
    // Reset callback BEFORE calling it to avoid re-entry
    linkModalCallback = null;
    
    // Call the callback with null to signal link removal
    if (callback) {
        callback(null, null);
    }
    
    // Close modal with a slight delay to allow DOM operations to complete
    setTimeout(function() {
        var modal = document.getElementById('linkModal');
        if (modal) {
            modal.remove();
        }
    }, 50);
}

// Expose setSaveButtonRed globally for use in other modules
window.setSaveButtonRed = setSaveButtonRed;

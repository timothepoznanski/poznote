// Gestion des événements et interactions utilisateur

function initializeEventListeners() {
    // Événements pour la modification des notes
    setupNoteEditingEvents();
    
    // Événements pour les fichiers attachés
    setupAttachmentEvents();
    
    // Événements pour le drag & drop d'images
    setupDragDropEvents();
    
    // Événements pour la gestion des liens
    setupLinkEvents();
    
    // Événements de focus
    setupFocusEvents();
    
    // Vérification automatique des modifications
    setupAutoSaveCheck();
    
    // Avertissement avant fermeture
    setupPageUnloadWarning();
    
    // Événements pour la recherche de dossiers (déplacement de notes)
    setupFolderSearchEvents();
}

function setupNoteEditingEvents() {
    var eventTypes = ['keyup', 'input', 'paste'];
    
    for (var i = 0; i < eventTypes.length; i++) {
        var eventType = eventTypes[i];
        document.body.addEventListener(eventType, function(e) {
            handleNoteEditEvent(e);
        });
    }
    
    // Gestion spéciale pour les tags avec la barre d'espace
    document.body.addEventListener('keydown', function(e) {
        handleTagsKeydown(e);
    });
}

function handleNoteEditEvent(e) {
    var target = e.target;
    
    if (target.classList.contains('name_doss')) {
        if (updateNoteEnCours == 1) {
            showNotificationPopup("Save in progress...");
        } else {
            updateNote();
        }
    } else if (target.classList.contains('noteentry')) {
        if (updateNoteEnCours == 1) {
            showNotificationPopup("Auto-save in progress, please do not modify the note.");
        } else {
            updateNote();
        }
    } else if (target.tagName === 'INPUT') {
        // Ignorer les champs de recherche
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }
        
        // Traiter les champs de note
        if (target.classList.contains('css-title') ||
            (target.id && target.id.startsWith('inp')) ||
            (target.id && target.id.startsWith('tags'))) {
            if (updateNoteEnCours == 1) {
                showNotificationPopup("Save in progress...");
            } else {
                updateNote();
            }
        }
    }
}

function handleTagsKeydown(e) {
    var target = e.target;
    
    // Vérifier si c'est un champ de tags classique
    if (target.tagName === 'INPUT' && 
        target.id && 
        target.id.startsWith('tags') &&
        !target.classList.contains('tag-input')) {
        
        if (e.key === ' ') {
            var input = target;
            var currentValue = input.value;
            var cursorPos = input.selectionStart;
            
            var textBeforeCursor = currentValue.substring(0, cursorPos);
            var lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
            var currentTag = textBeforeCursor.substring(lastSpaceIndex + 1).trim();
            
            if (currentTag && currentTag.length > 0) {
                e.preventDefault();
                
                var charAfterCursor = currentValue.charAt(cursorPos);
                if (charAfterCursor !== ' ' && charAfterCursor !== '') {
                    input.value = currentValue.substring(0, cursorPos) + ' ' + currentValue.substring(cursorPos);
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                } else {
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                }
                
                updateNote();
            }
        }
    }
}

function setupAttachmentEvents() {
    document.addEventListener('DOMContentLoaded', function() {
        var fileInput = document.getElementById('attachmentFile');
        var fileNameDiv = document.getElementById('selectedFileName');
        var uploadButtonContainer = document.querySelector('.upload-button-container');
        
        if (fileInput && fileNameDiv) {
            fileInput.addEventListener('change', function() {
                if (fileInput.files && fileInput.files.length > 0) {
                    fileNameDiv.textContent = fileInput.files[0].name;
                    if (uploadButtonContainer) {
                        uploadButtonContainer.classList.add('show');
                    }
                } else {
                    fileNameDiv.textContent = '';
                    if (uploadButtonContainer) {
                        uploadButtonContainer.classList.remove('show');
                    }
                }
            });
        }
    });
}

function setupDragDropEvents() {
    document.body.addEventListener('dragenter', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
            }
        } catch (err) {}
    });

    document.body.addEventListener('dragover', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
        } catch (err) {}
    });

    document.body.addEventListener('drop', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var note = el && el.closest ? el.closest('.noteentry') : null;
            
            if (!note && e.target && e.target.closest) {
                note = e.target.closest('.noteentry');
            }
            
            if (!note) return;

            e.preventDefault();
            e.stopPropagation();

            var dt = e.dataTransfer;
            if (!dt) return;

            if (dt.files && dt.files.length > 0) {
                handleImageFilesAndInsert(dt.files, note);
            }
        } catch (err) {
            console.log('Erreur lors du drop:', err);
        }
    });
}

function setupLinkEvents() {
    document.addEventListener('click', function(e) {
        // Rendre les liens cliquables dans les zones contenteditable
        if (e.target.tagName === 'A' && e.target.closest('[contenteditable="true"]')) {
            e.preventDefault();
            e.stopPropagation();
            window.open(e.target.href, '_blank');
        }
    });
    
    // Gestion du collage d'images
    document.body.addEventListener('paste', function(e) {
        try {
            var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
            if (!note) return;
            
            var items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : null;
            if (!items) return;
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item && item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                    e.preventDefault();
                    var file = item.getAsFile();
                    if (file) {
                        handleImageFilesAndInsert([file], note);
                    }
                    break;
                }
            }
        } catch (err) {
            console.log('Erreur lors du collage:', err);
        }
    });
}

function setupFocusEvents() {
    document.body.addEventListener('focusin', function(e) {
        if (e.target.classList.contains('searchbar') || 
            e.target.id === 'search' || 
            e.target.classList.contains('searchtrash')) {
            noteid = -1;
        }
    });
}

function setupAutoSaveCheck() {
    if (editedButNotSaved == 0) {
        setInterval(function() {
            checkAndAutoSave();
        }, 2000);
    }
}

function setupPageUnloadWarning() {
    window.addEventListener('beforeunload', function (e) {
        if (editedButNotSaved === 1 &&
            updateNoteEnCours === 0 &&
            noteid !== -1 &&
            noteid !== 'search') {
            var confirmationMessage = 'Unsaved changes will be lost. Do you really want to leave this page?';
            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });
}

// Fonctions utilitaires
function updateNote() {
    if (noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    editedButNotSaved = 1;
    var curdate = new Date();
    var curtime = curdate.getTime();
    lastudpdate = curtime;
    displayEditInProgress();
}

function checkAndAutoSave() {
    if (noteid == -1) return;
    
    var curdate = new Date();
    var curtime = curdate.getTime();
    
    // Si modifié depuis plus de 15 secondes et pas de sauvegarde en cours
    if (updateNoteEnCours == 0 && editedButNotSaved == 1 && curtime - lastudpdate > 15000) {
        displaySavingInProgress();
        saveNoteToServer();
    }
}

// Fonctions pour les IDs des éléments
function updateidsearch(el) {
    noteid = el.id.substr(5);
}

function updateidhead(el) {
    noteid = el.id.substr(3); // 3 pour 'inp'
}

function updateidtags(el) {
    noteid = el.id.substr(4);
}

function updateidfolder(el) {
    noteid = el.id.substr(6); // 6 pour 'folder'
}

function updateident(el) {
    noteid = el.id.substr(5);
}

// Alias pour compatibilité
function newnote() {
    createNewNote();
}

function updatenote() {
    saveNoteToServer();
}

function saveFocusedNoteJS() {
    saveNote();
}

// Gestion de la sélection de texte pour la barre d'outils de formatage
function initTextSelectionHandlers() {
    // Check if we're in desktop mode
    if (window.innerWidth <= 800) {
        return; // Don't activate on mobile
    }
    
    var selectionTimeout;
    
    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function() {
            var selection = window.getSelection();
            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            var noteActionButtons = document.querySelectorAll('.note-action-btn');
            
            // Check if the selection contains text
            if (selection && selection.toString().trim().length > 0) {
                var range = selection.getRangeAt(0);
                var container = range.commonAncestorContainer;
                
                // Improve detection of editable area
                var currentElement = container.nodeType === 3 ? container.parentElement : container; // Node.TEXT_NODE
                var editableElement = null;
                
                // Go up the DOM tree to find an editable area
                var isTitleOrTagField = false;
                while (currentElement && currentElement !== document.body) {
                    
                    // Check the current element and its direct children for title/tag fields
                    function checkElementAndChildren(element) {
                        // Check the element itself
                        if (element.classList && 
                            (element.classList.contains('css-title') || 
                             element.classList.contains('add-margin') ||
                             (element.id && (element.id.indexOf('inp') === 0 || element.id.indexOf('tags') === 0)))) {
                            return true;
                        }
                        
                        // Check direct children (for the case <h4><input class="css-title"...></h4>)
                        if (element.children) {
                            for (var i = 0; i < element.children.length; i++) {
                                var child = element.children[i];
                                if (child.classList && 
                                    (child.classList.contains('css-title') || 
                                     child.classList.contains('add-margin') ||
                                     (child.id && (child.id.indexOf('inp') === 0 || child.id.indexOf('tags') === 0)))) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }
                    
                    if (checkElementAndChildren(currentElement)) {
                        isTitleOrTagField = true;
                        break;
                    }
                    if (currentElement.classList && currentElement.classList.contains('noteentry')) {
                        editableElement = currentElement;
                        break;
                    }
                    if (currentElement.contentEditable === 'true') {
                        editableElement = currentElement;
                        break;
                    }
                    currentElement = currentElement.parentElement;
                }
                
                if (isTitleOrTagField) {
                    // Text selected in a title or tags field: keep normal state (actions visible, formatting hidden)
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.remove('hide-on-selection');
                    }
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.add('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                } else {
                    // Text selected but not in an editable area: hide everything
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.add('hide-on-selection');
                    }
                }
            } else {
                // No text selection: show actions, hide formatting
                for (var i = 0; i < textFormatButtons.length; i++) {
                    textFormatButtons[i].classList.remove('show-on-selection');
                }
                for (var i = 0; i < noteActionButtons.length; i++) {
                    noteActionButtons[i].classList.remove('hide-on-selection');
                }
            }
        }, 50); // Short delay to avoid too frequent calls
    }
    
    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', function(e) {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });
    
    // Handle window resizing
    window.addEventListener('resize', function() {
        if (window.innerWidth <= 800) {
            // If switching to mobile mode, reset button state
            var textFormatButtons = document.querySelectorAll('.text-format-btn');
            var noteActionButtons = document.querySelectorAll('.note-action-btn');
            for (var i = 0; i < textFormatButtons.length; i++) {
                textFormatButtons[i].classList.remove('show-on-selection');
            }
            for (var i = 0; i < noteActionButtons.length; i++) {
                noteActionButtons[i].classList.remove('hide-on-selection');
            }
        } else {
            // If switching to desktop mode, apply selection logic
            handleSelectionChange();
        }
    });
}

function setupFolderSearchEvents() {
    // Événements pour la recherche de dossiers dans le modal de déplacement
    var folderSearchInput = document.getElementById('folderSearchInput');
    if (folderSearchInput) {
        folderSearchInput.addEventListener('input', handleFolderSearch);
        folderSearchInput.addEventListener('keydown', handleFolderKeydown);
    }
    
    // Fermer dropdown en cliquant à l'extérieur
    document.addEventListener('click', function(event) {
        var dropdown = document.getElementById('folderDropdown');
        var input = document.getElementById('folderSearchInput');
        
        if (dropdown && input && !dropdown.contains(event.target) && !input.contains(event.target)) {
            dropdown.classList.remove('show');
            highlightedIndex = -1;
        }
    });
}

function handleFolderKeydown(event) {
    var dropdown = document.getElementById('folderDropdown');
    var options = dropdown.querySelectorAll('.folder-option');
    
    if (!dropdown.classList.contains('show') || options.length === 0) {
        return;
    }
    
    switch(event.key) {
        case 'ArrowDown':
            event.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
            updateHighlight(options);
            break;
        case 'ArrowUp':
            event.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            updateHighlight(options);
            break;
        case 'Enter':
            event.preventDefault();
            if (highlightedIndex >= 0 && options[highlightedIndex]) {
                options[highlightedIndex].click();
            }
            break;
        case 'Escape':
            dropdown.classList.remove('show');
            highlightedIndex = -1;
            break;
    }
}

function updateHighlight(options) {
    for (var i = 0; i < options.length; i++) {
        options[i].classList.remove('highlighted');
    }
    if (highlightedIndex >= 0 && options[highlightedIndex]) {
        options[highlightedIndex].classList.add('highlighted');
    }
}

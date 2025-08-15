// Download function (popup)
function startDownload() {
    window.location = 'exportEntries.php';
}

var editedButNotSaved = 0;  // Flag indicating that the note has been edited set to 1
var lastudpdate;
var noteid=-1;
var updateNoteEnCours = 0;
var selectedFolder = 'Uncategorized'; // Track currently selected folder
var currentNoteFolder = null; // Track current folder of note being moved
var currentNoteIdForAttachments = null; // Track current note for attachments

// Function to toggle the note settings dropdown menu
function toggleNoteMenu(noteId) {
    const menu = document.getElementById('note-menu-' + noteId);
    const button = document.getElementById('settings-btn-' + noteId);
    
    // Close all other open menus
    document.querySelectorAll('.dropdown-menu').forEach(otherMenu => {
        if (otherMenu.id !== 'note-menu-' + noteId) {
            otherMenu.style.display = 'none';
        }
    });
    
    // Toggle current menu
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        button.classList.add('active');
        
        // Close menu when clicking outside
        setTimeout(() => {
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

// Function to show note information with complete details
function showNoteInfo(noteId, created, updated, folder, favorite, tags, attachmentsCount) {
    try {
        // Clean and format the dates
        let createdText = "Non disponible";
        let updatedText = "Non disponible";
        
        // Try to parse and format created date
        if (created) {
            try {
                const createdDate = new Date(created);
                if (!isNaN(createdDate.getTime())) {
                    createdText = createdDate.toLocaleString('fr-FR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            } catch (e) {
                createdText = created; // Use raw value as fallback
            }
        }
        
        // Try to parse and format updated date
        if (updated) {
            try {
                const updatedDate = new Date(updated);
                if (!isNaN(updatedDate.getTime())) {
                    updatedText = updatedDate.toLocaleString('fr-FR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            } catch (e) {
                updatedText = updated; // Use raw value as fallback
            }
        }
        
        // Process additional data
        let folderText = folder || "Non classé";
        let isFavorite = parseInt(favorite) === 1;
        let tagsText = tags && tags.trim() !== '' ? tags : "Aucun tag";
        let attachmentsCountText = parseInt(attachmentsCount) || 0;
        
        // Show the information in a styled modal
        showNoteModal(noteId, createdText, updatedText, folderText, isFavorite, tagsText, attachmentsCountText);
        
    } catch (error) {
        console.error("Error in showNoteInfo:", error);
        alert("Erreur lors de l'affichage des informations de la note: " + error.message);
    }
}

// Function to show note information in a styled modal with complete details
function showNoteModal(noteId, createdText, updatedText, folderText, isFavorite, tagsText, attachmentsCount) {
    // Remove existing modal if any
    const existingModal = document.getElementById('noteInfoModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create simple text list
    const favoriteText = isFavorite ? 'Oui' : 'Non';
    
    // Create ultra simple modal
    const modalHTML = `
        <div id="noteInfoModal" class="modal" style="display: flex;">
            <div style="background: #fefefe; margin: 10% auto; padding: 20px; border-radius: 8px; width: auto; min-width: 250px; max-width: 400px; font-family: 'Inter', sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <h3 style="margin-top: 0; margin-bottom: 15px; color: #007DB8; font-size: 18px; font-weight: 600;">Note #${noteId}</h3>
                <div style="line-height: 1.8; margin: 15px 0;">
                    <div style="margin: 8px 0;"><strong>Dossier:</strong> ${folderText}</div>
                    <div style="margin: 8px 0;"><strong>Favoris:</strong> ${favoriteText}</div>
                    <div style="margin: 8px 0;"><strong>Pièces jointes:</strong> ${attachmentsCount}</div>
                    <div style="margin: 8px 0;"><strong>Tags:</strong> ${tagsText}</div>
                    <div style="margin: 8px 0;"><strong>Créée:</strong> ${createdText}</div>
                    <div style="margin: 8px 0;"><strong>Modifiée:</strong> ${updatedText}</div>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button onclick="closeNoteInfoModal()" style="background: #007DB8; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px;">Fermer</button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add click outside to close
    const modal = document.getElementById('noteInfoModal');
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeNoteInfoModal();
        }
    });
}

// Function to close the note info modal
function closeNoteInfoModal() {
    const modal = document.getElementById('noteInfoModal');
    if (modal) {
        modal.remove();
    }
}

// Function to toggle the vertical toolbar menu (legacy - keeping for compatibility)
function toggleToolbarMenu(noteId) {
    const menu = document.getElementById('toolbarMenu' + noteId);
    const settingsBtn = document.querySelector('.btn-settings');
    
    if (menu && (menu.style.display === 'none' || menu.style.display === '')) {
        // Close any other open menus first
        document.querySelectorAll('.toolbar-vertical-menu').forEach(otherMenu => {
            otherMenu.style.display = 'none';
        });
        document.querySelectorAll('.btn-settings').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Open this menu
        menu.style.display = 'block';
        settingsBtn.classList.add('active');
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && !settingsBtn.contains(e.target)) {
                    menu.style.display = 'none';
                    settingsBtn.classList.remove('active');
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    } else if (menu) {
        // Close menu
        menu.style.display = 'none';
        settingsBtn.classList.remove('active');
    }
}

// Add attachment functionality
// Display the chosen file name below the button in the attachment modal
document.addEventListener('DOMContentLoaded', function() {
    var fileInput = document.getElementById('attachmentFile');
    var fileNameDiv = document.getElementById('selectedFileName');
    if (fileInput && fileNameDiv) {
        fileInput.addEventListener('change', function() {
            if (fileInput.files && fileInput.files.length > 0) {
                fileNameDiv.textContent = fileInput.files[0].name;
            } else {
                fileNameDiv.textContent = 'No file chosen';
            }
        });
    }
});
function showAttachmentDialog(noteId) {
    currentNoteIdForAttachments = noteId;
    document.getElementById('attachmentModal').style.display = 'block';
    hideAttachmentError(); // Clear any previous error messages
    loadAttachments(noteId);
}

// Functions to handle attachment modal error messages
function showAttachmentError(message) {
    const errorElement = document.getElementById('attachmentErrorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideAttachmentError() {
    const errorElement = document.getElementById('attachmentErrorMessage');
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    
    // Clear error messages when closing attachment modal
    if (modalId === 'attachmentModal') {
        hideAttachmentError();
        // Also reset the file input display
        const fileInput = document.getElementById('attachmentFile');
        const fileNameDiv = document.getElementById('selectedFileName');
        if (fileInput) fileInput.value = '';
        if (fileNameDiv) fileNameDiv.textContent = 'No file chosen';
    }
}

function uploadAttachment() {
    const fileInput = document.getElementById('attachmentFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showAttachmentError('Please select a file');
        return;
    }
    
    if (!currentNoteIdForAttachments) {
        showAttachmentError('No note selected');
        return;
    }
    
    // Check file size (200MB limit)
    const maxSize = 200 * 1024 * 1024; // 200MB in bytes
    if (file.size > maxSize) {
        showAttachmentError('File too large. Maximum size is 200MB.');
        return;
    }
    
    // Clear any previous error messages
    hideAttachmentError();
    
    // Show upload progress
    const uploadButton = document.querySelector('.attachment-upload button');
    const originalText = uploadButton.textContent;
    uploadButton.textContent = 'Uploading...';
    uploadButton.disabled = true;
    
    const formData = new FormData();
    formData.append('action', 'upload');
    formData.append('note_id', currentNoteIdForAttachments);
    formData.append('file', file);
    
    fetch('api_attachments.php', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text(); // Get text first to check for HTML errors
    })
    .then(text => {
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Invalid JSON response:', text);
            throw new Error('Server returned invalid response');
        }
        
        if (data.success) {
            fileInput.value = ''; // Clear input
            document.getElementById('selectedFileName').textContent = 'No file chosen'; // Reset filename display
            loadAttachments(currentNoteIdForAttachments); // Reload list
            updateAttachmentCountInMenu(currentNoteIdForAttachments); // Update count in menu
            // showNotificationPopup('File uploaded successfully'); // Removed notification
        } else {
            showAttachmentError('Upload failed: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Upload error:', error);
        showAttachmentError('Upload failed: ' + error.message);
    })
    .finally(() => {
        // Reset button state
        uploadButton.textContent = originalText;
        uploadButton.disabled = false;
    });
}

function loadAttachments(noteId) {
    fetch(`api_attachments.php?action=list&note_id=${noteId}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayAttachments(data.attachments);
        } else {
            console.error('Failed to load attachments:', data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function displayAttachments(attachments) {
    const container = document.getElementById('attachmentsList');
    
    if (attachments.length === 0) {
        container.innerHTML = '<p>No attachments</p>';
        return;
    }
    
    let html = '';
    attachments.forEach(attachment => {
        const fileSize = formatFileSize(attachment.file_size);
        const uploadDate = new Date(attachment.uploaded_at).toLocaleDateString();
        
        html += `
            <div class="attachment-item">
                <div class="attachment-info">
                    <strong>${attachment.original_filename}</strong>
                    <br>
                    <small>${fileSize} - ${uploadDate}</small>
                </div>
                <div class="attachment-actions">
                    <button onclick="downloadAttachment('${attachment.id}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="deleteAttachment('${attachment.id}')" title="Delete" class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function downloadAttachment(attachmentId) {
    if (!currentNoteIdForAttachments) {
        showNotificationPopup('No note selected', 'error');
        return;
    }
    window.open(`api_attachments.php?action=download&note_id=${currentNoteIdForAttachments}&attachment_id=${attachmentId}`, '_blank');
}

function deleteAttachment(attachmentId) {
    if (!currentNoteIdForAttachments) {
        showNotificationPopup('No note selected', 'error');
        return;
    }
    
    const formData = new FormData();
    formData.append('action', 'delete');
    formData.append('note_id', currentNoteIdForAttachments);
    formData.append('attachment_id', attachmentId);
    
    fetch('api_attachments.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadAttachments(currentNoteIdForAttachments); // Reload list
            updateAttachmentCountInMenu(currentNoteIdForAttachments); // Update count in menu
            // showNotificationPopup('Attachment deleted successfully'); // Removed notification
        } else {
            showNotificationPopup('Delete failed: ' + data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotificationPopup('Delete failed', 'error');
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to update attachment count in dropdown menu
function updateAttachmentCountInMenu(noteId) {
    fetch(`api_attachments.php?action=list&note_id=${noteId}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const count = data.attachments.length;
            const hasAttachments = count > 0;
            
            // Update dropdown menu count
            const menu = document.getElementById('note-menu-' + noteId);
            if (menu) {
                // Find the attachments menu item and update its text and class
                const attachmentItems = menu.querySelectorAll('.dropdown-item');
                attachmentItems.forEach(item => {
                    if (item.innerHTML.includes('fa-paperclip')) {
                        const icon = item.querySelector('i.fas.fa-paperclip');
                        if (icon) {
                            item.innerHTML = `<i class="fas fa-paperclip"></i> Attachments (${count})`;
                            // Re-add the onclick handler as innerHTML replaces it
                            item.onclick = function() { showAttachmentDialog(noteId); };
                            // Update has-attachments class
                            if (hasAttachments) {
                                item.classList.add('has-attachments');
                            } else {
                                item.classList.remove('has-attachments');
                            }
                        }
                    }
                });
            }
            
            // Update settings button (gear icon) class
            const settingsBtn = document.getElementById('settings-btn-' + noteId);
            if (settingsBtn) {
                if (hasAttachments) {
                    settingsBtn.classList.add('has-attachments');
                } else {
                    settingsBtn.classList.remove('has-attachments');
                }
            }
            
            // Update attachment button class (mobile)
            const attachmentBtns = document.querySelectorAll('.btn-attachment[onclick*="' + noteId + '"]');
            attachmentBtns.forEach(btn => {
                if (hasAttachments) {
                    btn.classList.add('has-attachments');
                } else {
                    btn.classList.remove('has-attachments');
                }
            });
        }
    })
    .catch(error => {
        console.error('Error updating attachment count:', error);
    });
}

// Make links clickable in contenteditable areas
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(e) {
        // Check if clicked element is a link inside a contenteditable area
        if (e.target.tagName === 'A' && e.target.closest('[contenteditable="true"]')) {
            e.preventDefault();
            e.stopPropagation();
            
            // Open link directly in new tab
            window.open(e.target.href, '_blank');
        }
    });
});

// Function to toggle favorite status
function toggleFavorite(noteId) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api_favorites.php', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    // Update the star icon
                    const starIcon = document.querySelector(`button[onclick*="toggleFavorite('${noteId}')"] i`);
                    if (starIcon) {
                        starIcon.style.color = '#007DB8'; // Always blue
                        
                        // Simple logic: full star if favorite, empty star if not favorite
                        if (response.is_favorite) {
                            starIcon.classList.remove('far');
                            starIcon.classList.add('fas'); // Full star for favorite
                        } else {
                            starIcon.classList.remove('fas');
                            starIcon.classList.add('far'); // Empty star for non-favorite
                        }
                    }
                    
                    // Refresh to update favorites folder (no notification)
                    window.location.reload();
                } else {
                    showNotificationPopup('Error: ' + response.message);
                }
            } catch (e) {
                showNotificationPopup('Error updating favorites');
            }
        }
    };
    
    xhr.send('action=toggle_favorite&note_id=' + encodeURIComponent(noteId));
}

function updateidsearch(el)
{
    noteid = el.id.substr(5);
}

function updateidhead(el)
{
    noteid = el.id.substr(3); // 3 stands for inp
}

function updateidtags(el)
{
    noteid = el.id.substr(4);
}

function updateidfolder(el)
{
    noteid = el.id.substr(6); // 6 stands for folder
}

function updateident(el)
{
    noteid = el.id.substr(5);
}


function updatenote(){
    updateNoteEnCours = 1;
    var headi = document.getElementById("inp"+noteid).value;
    var entryElem = document.getElementById("entry"+noteid);
    var ent = entryElem ? entryElem.innerHTML : "";
    // console.log("RESULT :" + ent);
    ent = ent.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    var entcontent = entryElem ? entryElem.textContent : "";
    // console.log("entcontent:" + entcontent);
    // console.log("ent:" + ent);
    var tags = document.getElementById("tags"+noteid).value;
    var folderElem = document.getElementById("folder"+noteid);
    var folder = folderElem ? folderElem.value : 'Uncategorized';

    var params = new URLSearchParams({
        id: noteid,
        tags: tags,
        folder: folder,
        heading: headi,
        entry: ent,
        entrycontent: entcontent,
        now: (new Date().getTime()/1000)-new Date().getTimezoneOffset()*60
    });
    fetch("updatenote.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        try {
            // Try to parse as JSON first (for error responses)
            var jsonData = JSON.parse(data);
            if (jsonData.status === 'error') {
                showNotificationPopup('Error saving note: ' + jsonData.message, 'error');
                editedButNotSaved = 1; // Keep the edited flag since save failed
                updateNoteEnCours = 0;
                setSaveButtonRed(true); // Keep save button red to indicate unsaved changes
                return;
            }
        } catch(e) {
            // If not JSON, treat as normal response (date string or '1')
            if(data=='1') {
                editedButNotSaved = 0;
                var lastUpdatedElem = document.getElementById('lastupdated'+noteid);
                if (lastUpdatedElem) lastUpdatedElem.innerHTML = 'Last Saved Today';
            } else {
                editedButNotSaved = 0;
                var lastUpdatedElem = document.getElementById('lastupdated'+noteid);
                if (lastUpdatedElem) lastUpdatedElem.innerHTML = data;
            }
            updateNoteEnCours = 0;
            setSaveButtonRed(false);
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error while saving: ' + error.message, 'error');
        editedButNotSaved = 1; // Keep the edited flag since save failed
        updateNoteEnCours = 0;
        setSaveButtonRed(true); // Keep save button red to indicate unsaved changes
    });
    var newNotesElem = document.getElementById('newnotes');
    if (newNotesElem) {
        newNotesElem.style.display = 'none';
        // Force reflow and show again
        void newNotesElem.offsetWidth;
        newNotesElem.style.display = '';
    }
}

function newnote(){
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000)-new Date().getTimezoneOffset()*60,
        folder: selectedFolder
    });
    fetch("insertnew.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        try {
            var res = typeof data === 'string' ? JSON.parse(data) : data;
            if(res.status === 1) {
                window.scrollTo(0, 0);
                window.location.href = "index.php?note=" + encodeURIComponent(res.heading);
            } else {
                showNotificationPopup(res.error || data, 'error');
            }
        } catch(e) {
            showNotificationPopup('Error creating note: ' + data, 'error');
        }
    });
}

function deleteNote(iid){
    var params = new URLSearchParams({ id: iid });
    fetch("deletenote.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.text())
    .then(function(data) {
        var trimmed = (data || '').trim();
        // Fast path: legacy success response '1'
        if (trimmed === '1') {
            window.location.href = "index.php";
            return;
        }
        // Try to parse JSON (could be error or a structured success in future)
        try {
            var jsonData = JSON.parse(trimmed);
            // Case where backend still returns bare 1 (parsed as number) – already handled above, but safety:
            if (jsonData === 1) {
                window.location.href = "index.php";
                return;
            }
            if (jsonData && jsonData.status === 'error') {
                showNotificationPopup('Error deleting note: ' + (jsonData.message || 'Unknown error'), 'error');
                return;
            }
            // Allow for future success shape {status: 'ok'} or similar
            if (jsonData && (jsonData.status === 'ok' || jsonData.status === 'success')) {
                window.location.href = "index.php";
                return;
            }
            // Fallback: not recognized structure -> redirect if optimistic
            window.location.href = "index.php";
        } catch(e) {
            // Not JSON and not '1' -> show error
            showNotificationPopup('Error deleting note: ' + trimmed, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error while deleting: ' + error.message, 'error');
    });
}


// The functions below trigger the `update()` function when a note is modified. This simply sets a flag indicating that the note has been modified, but it does not save the changes.


// Triggers update() on keyup, input, and paste in .noteentry
['keyup', 'input', 'paste'].forEach(eventType => {
  document.body.addEventListener(eventType, function(e) {
    if (e.target.classList.contains('name_doss')) {
      if(updateNoteEnCours==1){
        showNotificationPopup("Save in progress.");
      } else {
        update();
      }
    } else if (e.target.classList.contains('noteentry')) {
      if(updateNoteEnCours==1){
        showNotificationPopup("Automatic save in progress, please do not modify the note.");
      } else {
        update();
      }
    } else if (e.target.tagName === 'INPUT') {
      // Only trigger update() for note inputs
      if (
        e.target.classList.contains('searchbar') ||
        e.target.id === 'search' ||
        e.target.classList.contains('searchtrash') ||
        e.target.id === 'myInputFiltrerTags'
      ) {
        return;
      }
      // We trigger update() for note fields: title and tags
      if (
        e.target.classList.contains('css-title') ||
        (e.target.id && e.target.id.startsWith('inp')) ||
        (e.target.id && e.target.id.startsWith('tags'))
      ) {
        if(updateNoteEnCours==1){
          showNotificationPopup("Automatic save in progress, please do not modify the note.");
        } else {
          update();
        }
      }
    }
  });
});

// Reset noteid when the search bar receives focus
document.body.addEventListener('focusin', function(e) {
  if (e.target.classList.contains('searchbar') || e.target.id === 'search' || e.target.classList.contains('searchtrash')) {
    noteid = -1;
  }
});

function update(){
    if(noteid=='search' || noteid==-1) return;
    editedButNotSaved = 1;  // We set the flag to indicate that the note has been modified.
    var curdate = new Date();
    var curtime = curdate.getTime();
    lastudpdate = curtime;
    displayEditInProgress(); // We display that an action has been taken to edit the note.
}

function displaySavingInProgress(){
    var elem = document.getElementById('lastupdated'+noteid);
    if (elem) elem.innerHTML = '<span style="color:#FF0000";>Saving in progress...</span>';
    setSaveButtonRed(true);
}

function displayModificationsDone(){
    var elem = document.getElementById('lastupdated'+noteid);
    if (elem) elem.innerHTML = '<span style="color:#FF0000";>Note modified</span>';
    setSaveButtonRed(true);
}

function displayEditInProgress(){
    var elem = document.getElementById('lastupdated'+noteid);
    if (elem) elem.innerHTML = '<span>Editing in progress...</span>';
    setSaveButtonRed(true);
}

// Update the color of the save button
function setSaveButtonRed(isRed) {
    // Take the first .toolbar-btn that contains .fa-save
    var saveBtn = document.querySelector('.toolbar-btn > .fa-save')?.parentElement;
    if (!saveBtn) {
        // fallback: button with save icon
        var btns = document.querySelectorAll('.toolbar-btn');
        btns.forEach(function(btn){
            if(btn.querySelector && btn.querySelector('.fa-save')) saveBtn = btn;
        });
    }
    if (saveBtn) {
        if (isRed) {
            saveBtn.classList.add('save-modified');
        } else {
            saveBtn.classList.remove('save-modified');
        }
    }
}

// Every X seconds (5000 = 5s), we call the `checkedit()` function and display "Note modified" if there have been changes, or "Saving in progress..." if the note is being saved.
document.addEventListener('DOMContentLoaded', function() {
    if(editedButNotSaved==0){
        setInterval(function(){
            checkedit();
            if(editedButNotSaved==1){displayModificationsDone();}
            if(updateNoteEnCours==1){displaySavingInProgress();}
        }, 2000);
    }

    // Warn user if note is modified but not saved when leaving the page
    window.addEventListener('beforeunload', function (e) {
        // Only warn if a note is selected and not in search mode
        if (
            editedButNotSaved === 1 &&
            updateNoteEnCours === 0 &&
            noteid !== -1 &&
            noteid !== 'search'
        ) {
            var confirmationMessage = 'You have unsaved changes in your note. Are you sure you want to leave without saving?';
            (e || window.event).returnValue = confirmationMessage; // For old browsers
            return confirmationMessage; // For modern browsers
        }
    });
});

function checkedit(){
    if(noteid==-1) return ;
    var curdate = new Date();
    var curtime = curdate.getTime();
    // If there has been a modification and more than X seconds (1000 = 1s) have passed, and the note is not currently being saved (update), then update the note in the database and the HTML file.
    //if(editedButNotSaved==1 && curtime-lastudpdate > 5000)  // If we don't control the `updateNoteEnCours` flag, it will create excessive requests if the network is slow.
    if(updateNoteEnCours==0 && editedButNotSaved==1 && curtime-lastudpdate > 15000)
    {
        displaySavingInProgress();
        updatenote();
    }
    else{
        //alert("test");
    }
}

function saveFocusedNoteJS(){
    //console.log("noteid = " + noteid);
    //if(noteid==-1) return ;
    if(noteid == -1){
        showNotificationPopup("Click anywhere in the note to be saved, then try again.");
        return ;
    }
    //console.log("updateNoteEnCours = " + editedButNotSaved / "editedButNotSaved = " + editedButNotSaved);
    if(updateNoteEnCours==0 && editedButNotSaved==1)
    {
        displaySavingInProgress();
        updatenote();
    }
    else{
        if(updateNoteEnCours==1){
            showNotificationPopup("Save already in progress.");
        }
        else{
            if(editedButNotSaved==0){showNotificationPopup("Nothing to save.");}
        }
    }
}

function showNotificationPopup(message, type = 'success') {
    var popup = document.getElementById('notificationPopup');
    var overlay = document.getElementById('notificationOverlay');
    popup.innerText = message;
    
    // Remove existing type classes
    popup.classList.remove('notification-success', 'notification-error');
    
    // Add appropriate type class
    if (type === 'error') {
        popup.classList.add('notification-error');
    } else {
        popup.classList.add('notification-success');
    }
    
    // Show overlay and popup
    overlay.style.display = 'block';
    popup.style.display = 'block';

    // Function to hide notification
    function hideNotification() {
        popup.style.display = 'none';
        overlay.style.display = 'none';
        overlay.removeEventListener('click', hideNotification);
        popup.removeEventListener('click', hideNotification);
    }

    // Allow closing by clicking on overlay or popup
    overlay.addEventListener('click', hideNotification);
    popup.addEventListener('click', hideNotification);
}

// Function to show contact popup
function showContactPopup() {
    var contactModal = `
        <div id="contactModal" class="modal" style="display: block;">
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <span class="close" onclick="closeContactModal()" style="float: right; font-size: 28px; font-weight: bold; cursor: pointer;">&times;</span>
                <div style="margin: 20px 0;">
                    <i class="fas fa-envelope" style="color: #007DB8; font-size: 24px; margin-bottom: 10px;"></i>
                    <p style="font-size: 18px; font-weight: bold; color: #007DB8; margin: 15px 0;">
                        <a href="mailto:contact.poznote@gmail.com" style="color: #007DB8; text-decoration: none;">
                            contact.poznote@gmail.com
                        </a>
                    </p>
                </div>
                <div class="modal-buttons" style="margin-top: 20px;">
                    <button onclick="closeContactModal()" style="background: #007DB8; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing contact modal if any
    var existingModal = document.getElementById('contactModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', contactModal);
    
    // Close modal when clicking outside
    document.getElementById('contactModal').addEventListener('click', function(e) {
        if (e.target.id === 'contactModal') {
            closeContactModal();
        }
    });
}

// Function to close contact popup
function closeContactModal() {
    var modal = document.getElementById('contactModal');
    if (modal) {
        modal.remove();
    }
}

// Folder management functions
function newFolder() {
    document.getElementById('newFolderModal').style.display = 'block';
    document.getElementById('newFolderName').focus();
}

function createFolder() {
    var folderName = document.getElementById('newFolderName').value.trim();
    if (!folderName) {
        showNotificationPopup('Please enter a folder name', 'error');
        return;
    }
    
    var params = new URLSearchParams({
        action: 'create',
        folder_name: folderName
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        console.log('Create folder response:', data); // Debug
        if (data.success) {
            closeModal('newFolderModal');
            document.getElementById('newFolderName').value = ''; // Clear input
            showNotificationPopup('Folder "' + folderName + '" created successfully');
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Error creating folder:', error);
        showNotificationPopup('Error creating folder: ' + error, 'error');
    });
}

function toggleFolder(folderId) {
    var content = document.getElementById(folderId);
    var icon = document.querySelector(`[data-folder-id="${folderId}"] .folder-icon`);
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
        localStorage.setItem('folder_' + folderId, 'open');
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
        localStorage.setItem('folder_' + folderId, 'closed');
    }
}

function selectFolder(folderName, element) {
    // Remove previous selection
    // document.querySelectorAll('.folder-header').forEach(el => el.classList.remove('selected-folder'));
    
    // Add selection to clicked folder
    // element.classList.add('selected-folder');
    
    // Update selected folder
    selectedFolder = folderName;
    
    console.log('Selected folder:', selectedFolder);
}

function editFolderName(oldName) {
    document.getElementById('editFolderModal').style.display = 'block';
    document.getElementById('editFolderName').value = oldName;
    document.getElementById('editFolderName').dataset.oldName = oldName;
    document.getElementById('editFolderName').focus();
}

function saveFolderName() {
    var newName = document.getElementById('editFolderName').value.trim();
    var oldName = document.getElementById('editFolderName').dataset.oldName;
    
    if (!newName) {
        showNotificationPopup('Please enter a folder name', 'error');
        return;
    }
    
    if (newName === oldName) {
        closeModal('editFolderModal');
        return;
    }
    
    var params = new URLSearchParams({
        action: 'rename',
        old_name: oldName,
        new_name: newName
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            closeModal('editFolderModal');
            showNotificationPopup('Folder renamed successfully');
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error renaming folder: ' + error, 'error');
    });
}

function deleteFolder(folderName) {
    // First, check how many notes are in this folder
    var params = new URLSearchParams({
        action: 'count_notes_in_folder',
        folder_name: folderName
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            var noteCount = data.count || 0;
            
            // If folder is empty, delete without confirmation
            if (noteCount === 0) {
                // Proceed directly with deletion for empty folders
                var deleteParams = new URLSearchParams({
                    action: 'delete',
                    folder_name: folderName
                });
                
                fetch("folder_operations.php", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: deleteParams.toString()
                })
                .then(response => response.json())
                .then(function(data) {
                    if (data.success) {
                        showNotificationPopup('Folder deleted successfully');
                        location.reload();
                    } else {
                        showNotificationPopup('Error: ' + data.error, 'error');
                    }
                })
                .catch(error => {
                    showNotificationPopup('Error deleting folder: ' + error, 'error');
                });
                return;
            }
            
            // For folders with notes, show confirmation modal
            var confirmMessage = `Are you sure you want to delete the folder "${folderName}"? \n${noteCount} note${noteCount > 1 ? 's' : ''} will be moved to "Uncategorized".\n\nIf you want to delete all the notes of this folder instead, you can move them to "Uncategorized" folder then empty it.`;
            
            showDeleteFolderModal(folderName, confirmMessage);
        } else {
            showNotificationPopup('Error checking folder contents: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error checking folder contents: ' + error, 'error');
    });
}

let currentFolderToDelete = null;

function showDeleteFolderModal(folderName, message) {
    currentFolderToDelete = folderName;
    document.getElementById('deleteFolderMessage').textContent = message;
    document.getElementById('deleteFolderModal').style.display = 'block';
}

function executeDeleteFolder() {
    if (currentFolderToDelete) {
        // Proceed with deletion
        var deleteParams = new URLSearchParams({
            action: 'delete',
            folder_name: currentFolderToDelete
        });
        
        fetch("folder_operations.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: deleteParams.toString()
        })
        .then(response => response.json())
        .then(function(data) {
            if (data.success) {
                showNotificationPopup('Folder deleted successfully');
                location.reload();
            } else {
                showNotificationPopup('Error: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showNotificationPopup('Error deleting folder: ' + error, 'error');
        });
    }
    
    closeModal('deleteFolderModal');
    currentFolderToDelete = null;
}

function emptyFolder(folderName) {
    showConfirmModal(
        'Empty Folder',
        `Are you sure you want to move all notes from "${folderName}" to trash?`,
        function() {
            executeEmptyFolder(folderName);
        }
    );
}

function executeEmptyFolder(folderName) {
    var params = new URLSearchParams({
        action: 'empty_folder',
        folder_name: folderName
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            showNotificationPopup(`All notes moved to trash from folder: ${folderName}`);
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error emptying folder: ' + error, 'error');
    });
}

function filterMoveFolders() {
    const filterText = document.getElementById('moveFolderFilter').value.toLowerCase();
    const foldersList = document.getElementById('foldersSelectionList');
    const folderOptions = document.querySelectorAll('.folder-option');
    
    // Show/hide the folders list based on whether user is typing
    if (filterText.length === 0) {
        foldersList.style.display = 'none';
        return;
    } else {
        foldersList.style.display = 'block';
    }
    
    let visibleCount = 0;
    
    folderOptions.forEach(function(option) {
        const folderName = option.querySelector('.folder-name').textContent.toLowerCase();
        const actualFolderName = option.querySelector('.folder-name').textContent;
        
        // Skip the current folder of the note
        if (actualFolderName === currentNoteFolder) {
            option.style.display = 'none';
            return;
        }
        
        if (folderName.includes(filterText)) {
            option.style.display = 'flex';
            visibleCount++;
        } else {
            option.style.display = 'none';
        }
    });
    
    // Show "create folder" option if no folders match
    let noFoldersMsg = foldersList.querySelector('.no-folders-found');
    let createFolderOption = foldersList.querySelector('.create-folder-option');
    
    if (visibleCount === 0 && filterText.length > 0) {
        // Hide the "no folders found" message
        if (noFoldersMsg) {
            noFoldersMsg.style.display = 'none';
        }
        
        // Show or create the "create folder" option
        if (!createFolderOption) {
            createFolderOption = document.createElement('div');
            createFolderOption.className = 'create-folder-option folder-option';
            createFolderOption.innerHTML = `
                <i class="fas fa-plus-circle" style="color: #007DB8; margin-right: 8px;"></i>
                <span class="folder-name">Create folder: "<strong id="new-folder-name">${filterText}</strong>"</span>
            `;
            createFolderOption.onclick = function() {
                createAndSelectNewFolder(filterText);
            };
            foldersList.appendChild(createFolderOption);
        } else {
            document.getElementById('new-folder-name').textContent = filterText;
            createFolderOption.style.display = 'flex';
        }
    } else {
        // Hide the create folder option when not needed
        if (createFolderOption) {
            createFolderOption.style.display = 'none';
        }
        
        // Show regular "no folders found" message if needed (when filterText is empty)
        if (visibleCount === 0 && filterText.length === 0) {
            if (!noFoldersMsg) {
                noFoldersMsg = document.createElement('div');
                noFoldersMsg.className = 'no-folders-found';
                noFoldersMsg.textContent = 'No folders available';
                foldersList.appendChild(noFoldersMsg);
            } else {
                noFoldersMsg.textContent = 'No folders available';
                noFoldersMsg.style.display = 'block';
            }
        } else if (noFoldersMsg) {
            noFoldersMsg.style.display = 'none';
        }
    }
}

function createAndSelectNewFolder(folderName) {
    // Create the new folder via API
    fetch('api_create_folder.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'folder_name=' + encodeURIComponent(folderName)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update the move folder input with the new folder name
            document.getElementById('moveFolderFilter').value = folderName;
            
            // Hide the folders list
            document.getElementById('foldersSelectionList').style.display = 'none';
            
            // Refresh the folders list for future use
            refreshFoldersList();
            
            // Show success message
            showNotificationPopup(`Folder "${folderName}" created successfully!`, 'success');
        } else {
            showNotificationPopup('Error creating folder: ' + (data.error || 'Unknown error'), 'error');
        }
    })
    .catch(error => {
        console.error('Error creating folder:', error);
        showNotificationPopup('Error creating folder: ' + error, 'error');
    });
}

function refreshFoldersList() {
    // Get the current note ID from the modal
    const noteId = document.getElementById('moveNoteModal').dataset.noteId;
    
    if (!noteId) return;
    
    var params = new URLSearchParams({
        action: 'get_folders'
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            loadFoldersIntoSelectionList(data.folders, noteId);
        }
    })
    .catch(error => {
        console.error('Error refreshing folders list:', error);
    });
}

function selectFolderForMove(folderName, element) {
    // Remove selection from all folders (both regular and suggested)
    document.querySelectorAll('.folder-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelectorAll('.suggested-folder-option').forEach(opt => opt.classList.remove('selected'));
    
    // Select clicked folder
    element.classList.add('selected');
    
    // Store selected folder
    element.dataset.selectedFolder = folderName;
    
    // Update the search input to show the selected folder
    document.getElementById('moveFolderFilter').value = folderName;
    
    // Hide the folders list after selection
    document.getElementById('foldersSelectionList').style.display = 'none';
    
    // Hide any error message
    hideMoveFolderError();
}

function showCreateNewFolderInput() {
    document.getElementById('createFolderSection').style.display = 'block';
    document.getElementById('createNewFolderBtn').style.display = 'none';
    document.getElementById('moveNewFolderName').focus();
}

function cancelCreateNewFolder() {
    document.getElementById('createFolderSection').style.display = 'none';
    document.getElementById('createNewFolderBtn').style.display = 'inline-block';
    document.getElementById('moveNewFolderName').value = '';
}

function createAndMoveToNewFolder() {
    const newFolderName = document.getElementById('moveNewFolderName').value.trim();
    if (!newFolderName) {
        showNotificationPopup('Please enter a folder name', 'error');
        return;
    }
    
    // Move note to the new folder
    moveNoteToSelectedFolder(newFolderName);
}

function moveNoteToSelectedFolder(targetFolder = null) {
    // Check if a valid note is selected
    if (!noteid || noteid == -1 || noteid == '' || noteid == null) {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    let folderToMoveTo = targetFolder;
    
    if (!folderToMoveTo) {
        // Get selected folder from either suggested or regular list
        const selectedFolder = document.querySelector('.folder-option.selected, .suggested-folder-option.selected');
        if (!selectedFolder) {
            showMoveFolderError('Please select a folder from the suggestions above or search for one.');
            return;
        }
        folderToMoveTo = selectedFolder.dataset.selectedFolder;
    }
    
    const params = new URLSearchParams({
        action: 'move_note',
        note_id: noteid,
        folder: folderToMoveTo
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            closeModal('moveNoteFolderModal');
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error moving note: ' + error);
    });
}

// Smart folder search functions
let allFolders = [];
let selectedFolderOption = null;
let highlightedIndex = -1;

// Recent folders management
function getRecentFolders() {
    const recent = localStorage.getItem('poznote_recent_folders');
    return recent ? JSON.parse(recent) : [];
}

function addToRecentFolders(folderName) {
    let recentFolders = getRecentFolders();
    
    // Remove if already exists
    recentFolders = recentFolders.filter(folder => folder !== folderName);
    
    // Add to beginning
    recentFolders.unshift(folderName);
    
    // Keep only last 2
    recentFolders = recentFolders.slice(0, 2);
    
    // Save to localStorage
    localStorage.setItem('poznote_recent_folders', JSON.stringify(recentFolders));
}

function loadRecentFolders(currentFolder) {
    const recentFolders = getRecentFolders();
    const recentFoldersList = document.getElementById('recentFoldersList');
    const recentFoldersSection = document.getElementById('recentFoldersSection');
    
    // Filter out the current folder
    const availableRecent = recentFolders.filter(folder => folder !== currentFolder);
    
    if (availableRecent.length === 0) {
        recentFoldersSection.style.display = 'none';
        return;
    }
    
    recentFoldersSection.style.display = 'block';
    recentFoldersList.innerHTML = '';
    
    availableRecent.forEach(folder => {
        const folderItem = document.createElement('div');
        folderItem.className = 'recent-folder-item';
        folderItem.innerHTML = `
            <span class="recent-folder-icon">📁</span>
            <span>${folder}</span>
        `;
        folderItem.onclick = () => selectRecentFolder(folder);
        recentFoldersList.appendChild(folderItem);
    });
}

function selectRecentFolder(folderName) {
    const input = document.getElementById('folderSearchInput');
    const dropdown = document.getElementById('folderDropdown');
    
    input.value = folderName;
    selectedFolderOption = folderName;
    dropdown.classList.remove('show');
    updateMoveButton(folderName, true);
    hideMoveFolderError();
}

function handleFolderSearch() {
    const input = document.getElementById('folderSearchInput');
    const dropdown = document.getElementById('folderDropdown');
    const searchTerm = input.value.trim();
    
    if (searchTerm.length === 0) {
        dropdown.classList.remove('show');
        updateMoveButton('');
        return;
    }
    
    // Filter folders that match the search term
    const matchingFolders = allFolders.filter(folder => 
        folder.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Update dropdown content
    updateDropdown(matchingFolders, searchTerm);
    
    // Update button text based on exact match
    const exactMatch = allFolders.find(folder => 
        folder.toLowerCase() === searchTerm.toLowerCase()
    );
    
    updateMoveButton(searchTerm, exactMatch);
    
    // Show dropdown if there are matches or if we want to show create option
    dropdown.classList.add('show');
}

function updateDropdown(matchingFolders, searchTerm) {
    const dropdown = document.getElementById('folderDropdown');
    dropdown.innerHTML = '';
    highlightedIndex = -1;
    selectedFolderOption = null;
    
    // Add matching folders
    matchingFolders.forEach((folder, index) => {
        const option = document.createElement('div');
        option.className = 'folder-option';
        option.innerHTML = `
            <span class="folder-option-icon">📁</span>
            <span>${folder}</span>
        `;
        option.onclick = () => selectFolder(folder);
        dropdown.appendChild(option);
    });
    
    // Add "Create new folder" option if no exact match
    const exactMatch = allFolders.find(folder => 
        folder.toLowerCase() === searchTerm.toLowerCase()
    );
    
    if (searchTerm && !exactMatch) {
        const createOption = document.createElement('div');
        createOption.className = 'folder-option create-folder-option';
        createOption.innerHTML = `
            <span class="folder-option-icon">➕</span>
            <span>Create folder "${searchTerm}"</span>
        `;
        createOption.onclick = () => selectCreateFolder(searchTerm);
        dropdown.appendChild(createOption);
    }
}

function updateMoveButton(searchTerm, exactMatch = false) {
    const button = document.getElementById('moveActionButton');
    
    if (!searchTerm) {
        button.textContent = 'Move';
        button.disabled = true;
    } else if (exactMatch) {
        button.textContent = 'Move';
        button.disabled = false;
    } else {
        button.textContent = 'Create & Move';
        button.disabled = false;
    }
}

function selectFolder(folderName) {
    const input = document.getElementById('folderSearchInput');
    const dropdown = document.getElementById('folderDropdown');
    
    input.value = folderName;
    selectedFolderOption = folderName;
    dropdown.classList.remove('show');
    updateMoveButton(folderName, true);
    hideMoveFolderError();
}

function selectCreateFolder(folderName) {
    selectedFolderOption = folderName;
    document.getElementById('folderDropdown').classList.remove('show');
    updateMoveButton(folderName, false);
    hideMoveFolderError();
}

function handleFolderKeydown(event) {
    const dropdown = document.getElementById('folderDropdown');
    const options = dropdown.querySelectorAll('.folder-option');
    
    if (!dropdown.classList.contains('show') || options.length === 0) {
        return;
    }
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
            updateHighlight(options);
            break;
            
        case 'ArrowUp':
            event.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, -1);
            updateHighlight(options);
            break;
            
        case 'Enter':
            event.preventDefault();
            if (highlightedIndex >= 0) {
                options[highlightedIndex].click();
            } else {
                executeFolderAction();
            }
            break;
            
        case 'Escape':
            dropdown.classList.remove('show');
            highlightedIndex = -1;
            break;
    }
}

function updateHighlight(options) {
    options.forEach((option, index) => {
        option.classList.toggle('highlighted', index === highlightedIndex);
    });
}

function executeFolderAction() {
    // Check if a valid note is selected
    if (!noteid || noteid == -1 || noteid == '' || noteid == null) {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    const searchTerm = document.getElementById('folderSearchInput').value.trim();
    
    if (!searchTerm) {
        showMoveFolderError('Please enter a folder name');
        return;
    }
    
    const folderToMoveTo = selectedFolderOption || searchTerm;
    
    const params = new URLSearchParams({
        action: 'move_note',
        note_id: noteid,
        folder: folderToMoveTo
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            // Add to recent folders
            addToRecentFolders(folderToMoveTo);
            
            closeModal('moveNoteFolderModal');
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error moving note: ' + error);
    });
}

function showMoveFolderError(message) {
    const errorDiv = document.getElementById('moveFolderErrorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideMoveFolderError() {
    const errorDiv = document.getElementById('moveFolderErrorMessage');
    errorDiv.style.display = 'none';
}

function showMoveFolderDialog(noteId) {
    // Check if a valid note is selected
    if (!noteId || noteId == -1 || noteId == '' || noteId == null) {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    noteid = noteId; // Set the current note ID
    
    // Get current folder of the note
    const currentFolder = document.getElementById('folder' + noteId).value;
    
    // Load folders
    const params = new URLSearchParams({
        action: 'get_folders'
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            // Store all folders (excluding current folder)
            allFolders = data.folders.filter(folder => folder !== currentFolder);
            
            // Load recent folders
            loadRecentFolders(currentFolder);
            
            // Reset the interface
            const input = document.getElementById('folderSearchInput');
            const dropdown = document.getElementById('folderDropdown');
            
            input.value = '';
            dropdown.classList.remove('show');
            dropdown.innerHTML = '';
            
            selectedFolderOption = null;
            highlightedIndex = -1;
            
            updateMoveButton('');
            hideMoveFolderError();
            
            // Show the modal and focus on input
            document.getElementById('moveNoteFolderModal').style.display = 'block';
            setTimeout(() => {
                input.focus();
            }, 100);
        }
    })
    .catch(error => {
        showNotificationPopup('Error loading folders: ' + error);
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('folderDropdown');
    const input = document.getElementById('folderSearchInput');
    
    if (dropdown && input && !dropdown.contains(event.target) && !input.contains(event.target)) {
        dropdown.classList.remove('show');
        highlightedIndex = -1;
    }
});

// Functions to handle folder selection error messages
function showMoveFolderError(message) {
    const errorElement = document.getElementById('moveFolderErrorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideMoveFolderError() {
    const errorElement = document.getElementById('moveFolderErrorMessage');
    errorElement.style.display = 'none';
}

function loadFoldersIntoSelectionList(folders, noteId) {
    const foldersList = document.getElementById('foldersSelectionList');
    foldersList.innerHTML = '';
    
    // Get current folder of the note to pre-select it
    const currentFolder = document.getElementById('folder' + noteId).value;
    
    // Count notes in each folder for display
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "action=get_folder_counts"
    })
    .then(response => response.json())
    .then(function(countData) {
        const folderCounts = countData.success ? countData.counts : {};
        
        folders.forEach(function(folder) {
            // Skip the current folder of the note
            if (folder === currentFolder) {
                return;
            }
            
            const folderOption = document.createElement('div');
            folderOption.className = 'folder-option';
            folderOption.dataset.selectedFolder = folder;
            
            // Add click handler
            folderOption.onclick = function() {
                selectFolderForMove(folder, this);
            };
            
            // Create folder icon
            let folderIcon = 'fas fa-folder';
            if (folder === 'Favorites') {
                folderIcon = 'fas fa-star';
            }
            
            // Get note count
            const noteCount = folderCounts[folder] || 0;
            
            folderOption.innerHTML = `
                <i class="${folderIcon}"></i>
                <span class="folder-name">${folder}</span>
                <span class="note-count">(${noteCount})</span>
            `;
            
            foldersList.appendChild(folderOption);
        });
    })
    .catch(error => {
        console.error('Error loading folder counts:', error);
        // Fallback: load folders without counts
        folders.forEach(function(folder) {
            const folderOption = document.createElement('div');
            folderOption.className = 'folder-option';
            folderOption.dataset.selectedFolder = folder;
            
            if (folder === currentFolder) {
                folderOption.classList.add('selected');
            }
            
            folderOption.onclick = function() {
                selectFolderForMove(folder, this);
            };
            
            let folderIcon = 'fas fa-folder';
            if (folder === 'Favorites') {
                folderIcon = 'fas fa-star';
            }
            
            folderOption.innerHTML = `
                <i class="${folderIcon}"></i>
                <span class="folder-name">${folder}</span>
                <span class="note-count"></span>
            `;
            
            foldersList.appendChild(folderOption);
        });
    });
}

function loadSuggestedFolders(noteId) {
    const suggestedFoldersList = document.getElementById('suggestedFoldersList');
    suggestedFoldersList.innerHTML = '';
    
    // Get current folder of the note to exclude it from suggestions
    const currentFolder = document.getElementById('folder' + noteId).value;
    
    // Load suggested folders
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "action=get_suggested_folders"
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            data.folders.forEach(function(folder) {
                // Skip the current folder
                if (folder === currentFolder) {
                    return;
                }
                
                const suggestedOption = document.createElement('div');
                suggestedOption.className = 'suggested-folder-option';
                suggestedOption.dataset.selectedFolder = folder;
                
                // Add click handler
                suggestedOption.onclick = function() {
                    selectFolderForMove(folder, this);
                };
                
                // Create folder icon
                let folderIcon = 'fas fa-folder';
                if (folder === 'Favorites') {
                    folderIcon = 'fas fa-star';
                } else if (folder === 'Uncategorized') {
                    folderIcon = 'fas fa-folder-open';
                }
                
                suggestedOption.innerHTML = `
                    <i class="${folderIcon}"></i>
                    <span class="folder-name">${folder}</span>
                `;
                
                suggestedFoldersList.appendChild(suggestedOption);
            });
        }
    })
    .catch(error => {
        console.error('Error loading suggested folders:', error);
    });
}

function moveCurrentNoteToFolder() {
    // This function is called by the old interface, redirect to new logic
    moveNoteToSelectedFolder();
}

function showMoveNoteDialog(noteHeading) {
    event.preventDefault();
    event.stopPropagation();
    
    // Check if a valid note heading is provided
    if (!noteHeading || noteHeading.trim() === '' || noteHeading === 'Untitled note') {
        showNotificationPopup('Please select a note first before moving it to a folder.');
        return;
    }
    
    document.getElementById('moveNoteTitle').textContent = noteHeading;
    document.getElementById('moveNoteModal').dataset.noteHeading = noteHeading;
    
    // Load folders
    var params = new URLSearchParams({
        action: 'get_folders'
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            var select = document.getElementById('moveNoteFolder');
            select.innerHTML = '';
            data.folders.forEach(function(folder) {
                var option = document.createElement('option');
                option.value = folder;
                option.textContent = folder;
                select.appendChild(option);
            });
            document.getElementById('moveNoteModal').style.display = 'block';
        }
    });
}

function moveNoteToFolder() {
    var noteHeading = document.getElementById('moveNoteModal').dataset.noteHeading;
    var targetFolder = document.getElementById('moveNoteFolder').value;
    
    var params = new URLSearchParams({
        action: 'move_note',
        note_heading: noteHeading,
        target_folder: targetFolder
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(response => response.json())
    .then(function(data) {
        if (data.success) {
            closeModal('moveNoteModal');
            location.reload();
        } else {
            showNotificationPopup('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showNotificationPopup('Error moving note: ' + error);
    });
}

function updateNoteFolder(noteId) {
    // This will be handled by the regular update mechanism
    update();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Close modals when clicking outside
window.onclick = function(event) {
    var modals = document.getElementsByClassName('modal');
    for (var i = 0; i < modals.length; i++) {
        if (event.target == modals[i]) {
            modals[i].style.display = 'none';
        }
    }
}

// Restore folder states on page load
document.addEventListener('DOMContentLoaded', function() {
    var folderToggles = document.querySelectorAll('.folder-toggle');
    folderToggles.forEach(function(toggle) {
        var folderId = toggle.dataset.folderId;
        
        // Don't restore localStorage state if in search mode or if a note is selected
        // The PHP already set the correct initial state
        if (!window.isSearchMode && !window.currentNoteFolder) {
            var state = localStorage.getItem('folder_' + folderId);
            if (state === 'closed') {
                var content = document.getElementById(folderId);
                var icon = toggle.querySelector('.folder-icon');
                if (content && icon) {
                    content.style.display = 'none';
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-right');
                }
            }
        }
    });
});

// Settings menu functions
function toggleSettingsMenu(event) {
    event.stopPropagation();
    
    // Try to find the available menu (mobile or desktop)
    let menu = document.getElementById('settingsMenuMobile');
    if (!menu) {
        menu = document.getElementById('settingsMenu');
    }
    
    // Check if menu exists to prevent null reference error
    if (!menu) {
        console.error('No settings menu element found (neither mobile nor desktop)');
        return;
    }
    
    if (menu.style.display === 'none' || menu.style.display === '') {
        menu.style.display = 'block';
        
        // Close menu when clicking outside
        setTimeout(() => {
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

function foldAllFolders() {
    const folderContents = document.querySelectorAll('.folder-content');
    const folderIcons = document.querySelectorAll('.folder-icon');
    
    folderContents.forEach(content => {
        content.style.display = 'none';
    });
    
    folderIcons.forEach(icon => {
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    });
    
    // Close settings menu (both mobile and desktop)
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
}

function unfoldAllFolders() {
    const folderContents = document.querySelectorAll('.folder-content');
    const folderIcons = document.querySelectorAll('.folder-icon');
    
    folderContents.forEach(content => {
        content.style.display = 'block';
    });
    
    folderIcons.forEach(icon => {
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    });
    
    // Close settings menu (both mobile and desktop)
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
}

function koFiAction() {
    // Open Ko-fi page in a new tab
    window.open('https://ko-fi.com/Q5Q61IECOW', '_blank');
    
    // Close settings menu (both mobile and desktop)
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
}

// Function to download a file
function downloadFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to add copy buttons to code blocks
function addCopyButtonsToCodeBlocks() {
    const codeBlocks = document.querySelectorAll('.code-block, pre.code-block, .noteentry pre');
    
    codeBlocks.forEach(codeBlock => {
        // Check if copy button already exists
        if (codeBlock.querySelector('.copy-code-btn')) {
            return;
        }
        
        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-code-btn';
        copyBtn.innerHTML = 'Copy';
        copyBtn.title = 'Copy code';
        
        // Add click event
        copyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            copyCodeToClipboard(codeBlock, copyBtn);
        });
        
        // Add button to code block
        codeBlock.style.position = 'relative';
        codeBlock.appendChild(copyBtn);
    });
}

// Function to copy code to clipboard
function copyCodeToClipboard(codeBlock, button) {
    console.log('Copy button clicked'); // Debug log
    
    // Clone the code block and remove the copy button from the clone
    const clonedBlock = codeBlock.cloneNode(true);
    const copyBtn = clonedBlock.querySelector('.copy-code-btn');
    if (copyBtn) {
        copyBtn.remove();
    }
    
    const text = clonedBlock.textContent || clonedBlock.innerText;
    console.log('Text to copy:', text); // Debug log
    
    // Use the modern Clipboard API first, then fallback
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Clipboard API success'); // Debug log
            showCopySuccess(button);
        }).catch((err) => {
            console.log('Clipboard API failed, using fallback:', err); // Debug log
            fallbackCopyToClipboard(text, button);
        });
    } else {
        console.log('Using fallback copy method directly'); // Debug log
        fallbackCopyToClipboard(text, button);
    }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text, button) {
    console.log('Using fallback copy method'); // Debug log
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
        const successful = document.execCommand('copy');
        console.log('Copy command successful:', successful); // Debug log
        if (successful) {
            showCopySuccess(button);
        } else {
            showCopyError(button);
        }
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showCopyError(button);
    }
    
    document.body.removeChild(textarea);
}

// Show success feedback
function showCopySuccess(button) {
    const originalContent = button.innerHTML;
    button.innerHTML = 'Copied!';
    button.classList.add('copied');
    
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('copied');
    }, 2000);
}

// Show error feedback
function showCopyError(button) {
    const originalContent = button.innerHTML;
    button.innerHTML = 'Error';
    button.style.backgroundColor = '#dc3545';
    button.style.color = 'white';
    
    setTimeout(() => {
        button.innerHTML = originalContent;
        button.style.backgroundColor = '';
        button.style.color = '';
    }, 2000);
}

// Initialize copy buttons when page loads
document.addEventListener('DOMContentLoaded', function() {
    addCopyButtonsToCodeBlocks();
    
    // Also try after a short delay to catch any dynamically loaded content
    setTimeout(() => {
        addCopyButtonsToCodeBlocks();
    }, 1000);
    
    // Also add copy buttons when content changes (using MutationObserver)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        // Check if the added node is a code block or contains code blocks
                        if (node.matches && (node.matches('.code-block') || node.matches('pre.code-block') || node.matches('.noteentry pre'))) {
                            addCopyButtonsToCodeBlocks();
                        } else if (node.querySelectorAll) {
                            const codeBlocks = node.querySelectorAll('.code-block, pre.code-block, .noteentry pre');
                            if (codeBlocks.length > 0) {
                                addCopyButtonsToCodeBlocks();
                            }
                        }
                    }
                });
            }
        });
    });
    
    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Also try to initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
    // DOM is still loading
} else {
    // DOM is already loaded
    addCopyButtonsToCodeBlocks();
}

// Handling the display of formatting buttons based on text selection (desktop only)
function initTextSelectionHandlers() {
    // Check if we're in desktop mode
    if (window.innerWidth <= 800) {
        return; // Don't activate on mobile
    }
    
    let selectionTimeout;
    
    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(() => {
            const selection = window.getSelection();
            const textFormatButtons = document.querySelectorAll('.text-format-btn');
            const noteActionButtons = document.querySelectorAll('.note-action-btn');
            
            // Check if the selection contains text
            if (selection && selection.toString().trim().length > 0) {
                const range = selection.getRangeAt(0);
                const container = range.commonAncestorContainer;
                
                // Improve detection of editable area
                let currentElement = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                let editableElement = null;
                
                // Go up the DOM tree to find an editable area
                let isTitleOrTagField = false;
                while (currentElement && currentElement !== document.body) {
                    
                    // Check the current element and its direct children for title/tag fields
                    function checkElementAndChildren(element) {
                        // Check the element itself
                        if (element.classList && 
                            (element.classList.contains('css-title') || 
                             element.classList.contains('add-margin') ||
                             (element.id && (element.id.startsWith('inp') || element.id.startsWith('tags'))))) {
                            return true;
                        }
                        
                        // Check direct children (for the case <h4><input class="css-title"...></h4>)
                        if (element.children) {
                            for (let child of element.children) {
                                if (child.classList && 
                                    (child.classList.contains('css-title') || 
                                     child.classList.contains('add-margin') ||
                                     (child.id && (child.id.startsWith('inp') || child.id.startsWith('tags'))))) {
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
                    textFormatButtons.forEach(btn => {
                        btn.classList.remove('show-on-selection');
                    });
                    noteActionButtons.forEach(btn => {
                        btn.classList.remove('hide-on-selection');
                    });
                } else if (editableElement) {
                    // Text selected in an editable area: show formatting buttons, hide actions
                    textFormatButtons.forEach(btn => {
                        btn.classList.add('show-on-selection');
                    });
                    noteActionButtons.forEach(btn => {
                        btn.classList.add('hide-on-selection');
                    });
                } else {
                    // Text selected but not in an editable area: hide everything
                    textFormatButtons.forEach(btn => {
                        btn.classList.remove('show-on-selection');
                    });
                    noteActionButtons.forEach(btn => {
                        btn.classList.add('hide-on-selection');
                    });
                }
            } else {
                // No text selection: show actions, hide formatting
                textFormatButtons.forEach(btn => {
                    btn.classList.remove('show-on-selection');
                });
                noteActionButtons.forEach(btn => {
                    btn.classList.remove('hide-on-selection');
                });
            }
        }, 50); // Short delay to avoid too frequent calls
    }
    
    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', (e) => {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });
    
    // Handle window resizing
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 800) {
            // If switching to mobile mode, reset button state
            const textFormatButtons = document.querySelectorAll('.text-format-btn');
            const noteActionButtons = document.querySelectorAll('.note-action-btn');
            textFormatButtons.forEach(btn => {
                btn.classList.remove('show-on-selection');
            });
            noteActionButtons.forEach(btn => {
                btn.classList.remove('hide-on-selection');
            });
        } else {
            // If switching to desktop mode, apply selection logic
            handleSelectionChange();
        }
    });
}

// Text selection handlers are disabled
// to avoid automatic hiding of the toolbar
document.addEventListener('DOMContentLoaded', initTextSelectionHandlers);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTextSelectionHandlers);
} else {
    initTextSelectionHandlers();
}

// Global function for manual testing
window.testCopyButtons = function() {
    addCopyButtonsToCodeBlocks();
};

// Global function to test copy functionality directly
window.testCopyFunction = function(text) {
    if (!text) text = "Test copy functionality";
    
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotificationPopup('Copy test successful!');
        }).catch((err) => {
            showNotificationPopup('Copy test failed: ' + err, 'error');
        });
    } else {
        showNotificationPopup('Clipboard API not available', 'error');
    }
};

// Function to clear search and return to main view
function clearSearch() {
    window.location.href = 'index.php';
}

// UPDATE CHECK FUNCTIONS

// Automatic version check (once per day)
function silentVersionCheck() {
    // Check if we should run the check (once per day)
    const lastCheck = localStorage.getItem('lastVersionCheck');
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
    if (lastCheck && (now - parseInt(lastCheck)) < oneDayMs) {
        // Already checked today, skip
        return;
    }
        
    // Perform silent check
    fetch('check_updates.php')
        .then(response => response.json())
        .then(data => {
            // Store the check timestamp
            localStorage.setItem('lastVersionCheck', now.toString());
            
            if (!data.error && data.has_updates) {
                // Show the same modal as manual check - update available
                showUpdateBadge(); // Still show badge on menu icon
                showUpdateInstructions(); // Show the standard update modal
            } else {
                console.log('No update available or error occurred');
            }
            // If no update or error, do nothing (silent)
        })
        .catch(error => {
            // Silent failure - don't bother the user
            console.log('Silent version check failed:', error);
        });
}

// Hide the update badge (simplified since we removed the notification element)
function hideUpdateNotification() {
    // This function is now only used to hide the badge when user dismisses update 
    hideUpdateBadge();
}

// Show update badge on menu icons
function showUpdateBadge() {
    // Add badge to desktop menu icon
    const desktopIcon = document.getElementById('update-icon-desktop');
    const desktopItem = document.getElementById('update-check-item');
    if (desktopIcon && desktopItem && !desktopItem.querySelector('.update-badge')) {
        desktopItem.style.position = 'relative';
        const badge = document.createElement('div');
        badge.className = 'update-badge';
        badge.innerHTML = '!';
        desktopItem.appendChild(badge);
    }
    
    // Add badge to mobile menu icon
    const mobileIcon = document.getElementById('update-icon-mobile');
    const mobileItem = document.getElementById('update-check-item-mobile');
    if (mobileIcon && mobileItem && !mobileItem.querySelector('.update-badge')) {
        mobileItem.style.position = 'relative';
        const badge = document.createElement('div');
        badge.className = 'update-badge';
        badge.innerHTML = '!';
        mobileItem.appendChild(badge);
    }
}

// Hide update badge from menu icons
function hideUpdateBadge() {
    // Remove badge from desktop menu
    const desktopItem = document.getElementById('update-check-item');
    if (desktopItem) {
        const badge = desktopItem.querySelector('.update-badge');
        if (badge) {
            badge.remove();
        }
    }
    
    // Remove badge from mobile menu
    const mobileItem = document.getElementById('update-check-item-mobile');
    if (mobileItem) {
        const badge = mobileItem.querySelector('.update-badge');
        if (badge) {
            badge.remove();
        }
    }
}

// Function to check for updates (manual check from settings menu)
function checkForUpdates() {
    // Close settings menus
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsMenuMobile = document.getElementById('settingsMenuMobile');
    if (settingsMenu) settingsMenu.style.display = 'none';
    if (settingsMenuMobile) settingsMenuMobile.style.display = 'none';
    
    // Remove update badge since user is manually checking
    hideUpdateBadge();
    
    // Show the checking modal
    showUpdateCheckModal();
    
    fetch('check_updates.php')
        .then(response => response.json()) 
        .then(data => {
            if (data.error) {
                // Update checking modal with error
                showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection.', 'error');
            } else if (data.has_updates) {
                // Close checking modal and show update modal
                closeUpdateCheckModal();
                showUpdateInstructions();
            } else {
                // Update checking modal with success
                showUpdateCheckResult('✅ You\'re up to date!', `Current version: ${data.current_version}`, 'success');
            }
        })
        .catch(error => {
            console.error('Update check failed:', error);
            // Update checking modal with error
            showUpdateCheckResult('❌ Failed to check for updates', 'Please check your internet connection.', 'error');
        });
}

// Function to show update instructions
function showUpdateInstructions() {
    // Show the update modal instead of notification popup
    document.getElementById('updateModal').style.display = 'block';
}

// Function to close update modal
function closeUpdateModal() {
    document.getElementById('updateModal').style.display = 'none';
}

// Function to go to update instructions on GitHub
function goToUpdateInstructions() {
    window.open('https://github.com/timothepoznanski/poznote?tab=readme-ov-file#update-poznote-application', '_blank');
    closeUpdateModal();
}

// Function to show update check modal
function showUpdateCheckModal() {
    const modal = document.getElementById('updateCheckModal');
    const statusElement = document.getElementById('updateCheckStatus');
    const buttonsElement = document.getElementById('updateCheckButtons');
    
    // Reset modal state
    modal.querySelector('h3').textContent = 'Checking for Updates...';
    statusElement.textContent = 'Please wait while we check for updates...';
    statusElement.style.color = '#555';
    buttonsElement.style.display = 'none';
    
    modal.style.display = 'block';
}

// Function to show update check result
function showUpdateCheckResult(title, message, type) {
    const modal = document.getElementById('updateCheckModal');
    const titleElement = modal.querySelector('h3');
    const statusElement = document.getElementById('updateCheckStatus');
    const buttonsElement = document.getElementById('updateCheckButtons');
    
    // Update content
    titleElement.textContent = title;
    statusElement.textContent = message;
    
    // Update colors based on type
    if (type === 'error') {
        titleElement.style.color = '#e53935';
        statusElement.style.color = '#e53935';
    } else if (type === 'success') {
        titleElement.style.color = '#007DB8';
        statusElement.style.color = '#007DB8';
    }
    
    // Show buttons
    buttonsElement.style.display = 'flex';
}

// Function to close update check modal
function closeUpdateCheckModal() {
    document.getElementById('updateCheckModal').style.display = 'none';
}

// Confirmation Modal Functions
let confirmedActionCallback = null;

function showConfirmModal(title, message, callback) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    
    titleElement.textContent = title;
    messageElement.textContent = message;
    confirmedActionCallback = callback;
    
    modal.style.display = 'block';
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

// Function to show notification popup with HTML support
function showNotificationPopupWithHTML(message, type = 'success', autoHide = true) {
    var popup = document.getElementById('notificationPopup');
    var overlay = document.getElementById('notificationOverlay');
    popup.innerHTML = message; // Use innerHTML instead of innerText for HTML support
    
    // Remove existing type classes
    popup.classList.remove('notification-success', 'notification-error');
    
    // Add appropriate type class
    if (type === 'error') {
        popup.classList.add('notification-error');
    } else {
        popup.classList.add('notification-success');
    }
    
    // Show overlay and popup
    overlay.style.display = 'block';
    popup.style.display = 'block';

    // Function to hide notification
    function hideNotification() {
        popup.style.display = 'none';
        overlay.style.display = 'none';
        overlay.removeEventListener('click', hideNotification);
        popup.removeEventListener('click', hideNotification);
    }

    // Hide when clicking overlay or popup (but not on links)
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            hideNotification();
        }
    });
    
    popup.addEventListener('click', function(e) {
        if (e.target.tagName !== 'A') { // Don't hide when clicking links
            hideNotification();
        }
    });

    // Auto-hide only if requested
    if (autoHide) {
        setTimeout(hideNotification, 10000);
    }
}

// Auto-setup for modals on page load
document.addEventListener('DOMContentLoaded', function() {
    // Close update modal when clicking outside
    window.addEventListener('click', function(event) {
        const updateModal = document.getElementById('updateModal');
        const updateCheckModal = document.getElementById('updateCheckModal');
        const confirmModal = document.getElementById('confirmModal');
        const noteInfoModal = document.getElementById('noteInfoModal');
        
        if (event.target === updateModal) {
            closeUpdateModal();
        }
        
        if (event.target === updateCheckModal) {
            closeUpdateCheckModal();
        }
        
        if (event.target === confirmModal) {
            closeConfirmModal();
        }
        
        if (event.target === noteInfoModal) {
            closeNoteInfoModal();
        }
    });
    
    // Automatic daily version checking
    // Delay initial check by 3 seconds to allow page to fully load
    setTimeout(function() {
        silentVersionCheck();
    }, 3000);
    
    // Add temporary test function for development (can be removed in production)
    window.testUpdateCheck = function() {
        console.log('Manual trigger of silent version check for testing');
        localStorage.removeItem('lastVersionCheck'); // Force check regardless of timing
        silentVersionCheck();
    };
});
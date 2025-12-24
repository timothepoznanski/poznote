/**
 * index-page.js
 * Scripts specific to the main index.php page
 */

// Create menu functionality - opens unified modal
function toggleCreateMenu() {
    // Show the unified create modal instead of dropdown menu
    if (typeof showCreateModal === 'function') {
        showCreateModal();
    } else {
        console.error('showCreateModal function not available');
    }
}

// Make function globally available
window.toggleCreateMenu = toggleCreateMenu;

// Close menu when clicking outside
document.addEventListener('click', function(e) {
    var menu = document.getElementById('header-create-menu');
    var plusBtn = document.querySelector('.sidebar-plus');
    if (menu && plusBtn && !plusBtn.contains(e.target) && !menu.contains(e.target)) {
        menu.remove();
        plusBtn.setAttribute('aria-expanded', 'false');
    }
});

// Task list creation function
function createTaskListNote() {
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder: selectedFolder,
        workspace: selectedWorkspace || 'Poznote',
        type: 'tasklist'
    });
    
    fetch("api_insert_new.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        try {
            var res = JSON.parse(data);
            if(res.status === 1) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
            } else {
                showNotificationPopup(res.error || (window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list'), 'error');
            }
        } catch(e) {
            console.error('Error creating task list:', e);
            showNotificationPopup(window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list', 'error');
        }
    })
    .catch(function(error) {
        console.error('Task list creation failed:', error);
        showNotificationPopup(window.t ? window.t('index.errors.create_task_list', null, 'Error creating task list') : 'Error creating task list', 'error');
    });
}

window.createTaskListNote = createTaskListNote;

// Navigate to note info edit page
function openNoteInfoEdit(noteId) {
    var url = 'info.php?note_id=' + encodeURIComponent(noteId) + '&edit_subheading=1';
    if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
        url += '&workspace=' + encodeURIComponent(window.selectedWorkspace);
    }
    window.location.href = url;
}

window.openNoteInfoEdit = openNoteInfoEdit;

// Navigate to display.php or settings.php with current workspace and note parameters
function navigateToDisplayOrSettings(page) {
    var url = page;
    var params = [];
    
    // Add workspace parameter if selected
    if (window.selectedWorkspace && window.selectedWorkspace !== 'Poznote') {
        params.push('workspace=' + encodeURIComponent(window.selectedWorkspace));
    }
    
    // Add note parameter if available
    var currentNoteId = getCurrentNoteId();
    if (currentNoteId) {
        params.push('note=' + encodeURIComponent(currentNoteId));
    }
    
    // Build final URL
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    window.location.href = url;
}

window.navigateToDisplayOrSettings = navigateToDisplayOrSettings;

// Helper to get current note ID
function getCurrentNoteId() {
    var noteEntry = document.querySelector('.noteentry[data-note-id]');
    if (noteEntry) {
        return noteEntry.getAttribute('data-note-id');
    }
    return null;
}

// Mobile navigation functionality
function scrollToRightColumn() {
    const rightCol = document.getElementById('right_col');
    if (rightCol) {
        rightCol.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'start'
        });
    }
}

function scrollToLeftColumn() {
    const leftCol = document.getElementById('left_col');
    if (leftCol) {
        leftCol.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'start'
        });
    }
}

window.scrollToRightColumn = scrollToRightColumn;
window.scrollToLeftColumn = scrollToLeftColumn;

// Subheading edit functionality
function startEditSubheading(noteId) {
    var disp = document.getElementById('subheading-display-' + noteId);
    var input = document.getElementById('subheading-input-' + noteId);
    var editBtn = document.getElementById('edit-subheading-' + noteId);
    var saveBtn = document.getElementById('save-subheading-' + noteId);
    var cancelBtn = document.getElementById('cancel-subheading-' + noteId);
    if (!disp || !input) return;
    
    disp.style.display = 'none';
    input.style.display = 'inline-block';
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'inline-block';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    input.focus();
}

function saveSubheading(noteId) {
    var input = document.getElementById('subheading-input-' + noteId);
    if (!input) return;
    
    var newSubheading = input.value;
    fetch('api_update_subheading.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'note_id=' + encodeURIComponent(noteId) + '&subheading=' + encodeURIComponent(newSubheading)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            var disp = document.getElementById('subheading-display-' + noteId);
            if (disp) disp.textContent = newSubheading;
            cancelEditSubheading(noteId);
        } else {
            alert(data.error || 'Failed to update subheading');
        }
    })
    .catch(function(err) {
        console.error(err);
        alert('Error updating subheading');
    });
}

function cancelEditSubheading(noteId) {
    var disp = document.getElementById('subheading-display-' + noteId);
    var input = document.getElementById('subheading-input-' + noteId);
    var editBtn = document.getElementById('edit-subheading-' + noteId);
    var saveBtn = document.getElementById('save-subheading-' + noteId);
    var cancelBtn = document.getElementById('cancel-subheading-' + noteId);
    if (!disp || !input) return;
    
    disp.style.display = 'inline';
    input.style.display = 'none';
    if (editBtn) editBtn.style.display = 'inline-block';
    if (saveBtn) saveBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    input.value = disp.textContent;
}

window.startEditSubheading = startEditSubheading;
window.saveSubheading = saveSubheading;
window.cancelEditSubheading = cancelEditSubheading;

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Restore folder states from localStorage
    try {
        var folderContents = document.querySelectorAll('.folder-content');
        for (var i = 0; i < folderContents.length; i++) {
            var content = folderContents[i];
            var folderId = content.id;
            var savedState = localStorage.getItem('folder_' + folderId);
            
            if (savedState === 'open') {
                content.style.display = 'block';
                var header = content.previousElementSibling;
                if (header && header.classList.contains('folder-header')) {
                    var icon = header.querySelector('.folder-icon i');
                    if (icon) {
                        icon.classList.remove('fa-chevron-right');
                        icon.classList.add('fa-chevron-down');
                    }
                }
            }
        }
    } catch (e) {
        console.error('Error restoring folder states:', e);
    }
    
    // Track the currently opened note for recent notes list
    var noteEntry = document.querySelector('.noteentry[data-note-id]');
    if (noteEntry && typeof window.trackNoteOpened === 'function') {
        var noteId = noteEntry.getAttribute('data-note-id');
        var heading = noteEntry.getAttribute('data-note-heading');
        if (noteId && heading) {
            window.trackNoteOpened(noteId, heading);
        }
    }
    
    // Process note references [[Note Title]] in rendered content
    if (typeof window.processNoteReferences === 'function') {
        var noteEntries = document.querySelectorAll('.noteentry');
        noteEntries.forEach(function(entry) {
            // Only process for view mode or after markdown rendering
            window.processNoteReferences(entry);
        });
    }
});

// Initialize tasklists if needed
function initializeTaskLists(tasklistIds) {
    if (!tasklistIds || tasklistIds.length === 0) return;
    
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initializeTaskList === 'function') {
            tasklistIds.forEach(function(id) {
                initializeTaskList(id, 'tasklist');
            });
        }
    });
}

window.initializeTaskLists = initializeTaskLists;

// Initialize markdown notes if needed
function initializeMarkdownNotes(markdownIds) {
    if (!markdownIds || markdownIds.length === 0) return;
    
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof initializeMarkdownNote === 'function') {
            markdownIds.forEach(function(id) {
                initializeMarkdownNote(id);
            });
        }
    });
}

window.initializeMarkdownNotes = initializeMarkdownNotes;

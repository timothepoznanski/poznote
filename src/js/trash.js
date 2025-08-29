// JavaScript for trash page

document.addEventListener('DOMContentLoaded', function() {
    // Trash notes search management
    const searchInput = document.getElementById('searchInput'); 
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const noteCards = document.querySelectorAll('.trash-notecard');
            let visibleCount = 0;
            
            noteCards.forEach(card => {
                const title = card.querySelector('.css-title');
                const content = card.querySelector('.noteentry');
                
                let titleText = title ? title.textContent.toLowerCase() : '';
                let contentText = content ? content.textContent.toLowerCase() : '';
                
                if (titleText.includes(searchTerm) || contentText.includes(searchTerm)) {
                    card.style.display = 'block';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Display number of results
            updateSearchResults(visibleCount, searchTerm);
        });
    }
    
    // Management of restore and permanent delete buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('icon_restore_trash')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid) {
                showRestoreConfirmModal(noteid);
            }
        }
        
        if (e.target.classList.contains('icon_trash_trash')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid) {
                showDeleteConfirmModal(noteid);
            }
        }
    });
    
    // Management of "Empty trash" button
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    if (emptyTrashBtn) {
        emptyTrashBtn.addEventListener('click', function(e) {
            e.preventDefault();
            showEmptyTrashConfirmModal();
        });
    }
});

function updateSearchResults(count, searchTerm) {
    let resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'searchResults';
        resultsDiv.className = 'trash-search-results';
        
        const searchContainer = document.querySelector('.trash-search-input').parentNode;
        searchContainer.appendChild(resultsDiv);
    }
    
    if (searchTerm.trim() === '') {
        resultsDiv.style.display = 'none';
    } else {
        resultsDiv.style.display = 'block';
        resultsDiv.textContent = `${count} note(s) found for "${searchTerm}"`;
    }
}

function restoreNote(noteid) {
    const wsBody = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? '&workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('put_back.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'id=' + encodeURIComponent(noteid) + wsBody
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Visually remove note from list
            const noteElement = document.getElementById('note' + noteid);
            if (noteElement) {
                noteElement.style.display = 'none';
            }
        } else {
            showInfoModal('Restore Error', 'Error restoring the note: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during restoration:', error);
        showInfoModal('Restore Error', 'Error restoring the note');
    });
}

function permanentlyDeleteNote(noteid) {
    const wsBodyDel = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? '&workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('permanent_delete.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'id=' + encodeURIComponent(noteid) + wsBodyDel
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Visually remove note from list
            const noteElement = document.getElementById('note' + noteid);
            if (noteElement) {
                noteElement.style.display = 'none';
            }
        } else {
            showInfoModal('Delete Error', 'Error during permanent deletion: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during deletion:', error);
        showInfoModal('Delete Error', 'Error during permanent deletion of the note');
    });
}

function emptyTrash() {
    const wsEmpty = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? 'workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('empty_trash.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        ,
        body: wsEmpty
    })
    .then(response => response.text())
    .then(data => {
        if (data === '1') {
            // Success - redirect to trash.php to refresh page
            window.location.href = 'trash.php' + (typeof pageWorkspace !== 'undefined' && pageWorkspace ? '?workspace=' + encodeURIComponent(pageWorkspace) : '');
        } else {
            showInfoModal('Empty Trash Error', 'Error emptying trash: ' + data);
        }
    })
    .catch(error => {
        console.error('Error during trash emptying:', error);
        showInfoModal('Empty Trash Error', 'Error emptying trash');
    });
}

// Modal management for restore and delete confirmations
let currentNoteIdForAction = null;

function showInfoModal(title, message) {
    document.getElementById('infoModalTitle').textContent = title;
    document.getElementById('infoModalMessage').textContent = message;
    document.getElementById('infoModal').style.display = 'flex';
}

function closeInfoModal() {
    document.getElementById('infoModal').style.display = 'none';
}

function showEmptyTrashConfirmModal() {
    document.getElementById('emptyTrashConfirmModal').style.display = 'flex';
}

function closeEmptyTrashConfirmModal() {
    document.getElementById('emptyTrashConfirmModal').style.display = 'none';
}

function executeEmptyTrash() {
    emptyTrash();
    closeEmptyTrashConfirmModal();
}

function showRestoreConfirmModal(noteId) {
    currentNoteIdForAction = noteId;
    document.getElementById('restoreConfirmModal').style.display = 'flex';
}

function closeRestoreConfirmModal() {
    document.getElementById('restoreConfirmModal').style.display = 'none';
    currentNoteIdForAction = null;
}

function executeRestoreNote() {
    if (currentNoteIdForAction) {
        restoreNote(currentNoteIdForAction);
    }
    closeRestoreConfirmModal();
}

function showDeleteConfirmModal(noteId) {
    currentNoteIdForAction = noteId;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteConfirmModal() {
    document.getElementById('deleteConfirmModal').style.display = 'none';
    currentNoteIdForAction = null;
}

function executePermanentDelete() {
    if (currentNoteIdForAction) {
        permanentlyDeleteNote(currentNoteIdForAction);
    }
    closeDeleteConfirmModal();
}

// Close modals when clicking outside
window.addEventListener('click', function(event) {
    const restoreModal = document.getElementById('restoreConfirmModal');
    const deleteModal = document.getElementById('deleteConfirmModal');
    const infoModal = document.getElementById('infoModal');
    const emptyTrashModal = document.getElementById('emptyTrashConfirmModal');
    
    if (event.target === restoreModal) {
        closeRestoreConfirmModal();
    }
    
    if (event.target === deleteModal) {
        closeDeleteConfirmModal();
    }
    
    if (event.target === infoModal) {
        closeInfoModal();
    }
    
    if (event.target === emptyTrashModal) {
        closeEmptyTrashConfirmModal();
    }
});

// Mobile optimization: scroll management
if (window.innerWidth <= 800) {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}

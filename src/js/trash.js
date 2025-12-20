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
        if (e.target.classList.contains('fa-trash-restore-alt')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid) {
                showRestoreConfirmModal(noteid);
            }
        }
        
        if (e.target.classList.contains('fa-trash')) {
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
        const term = String(searchTerm).trim();
        if (count === 1) {
            resultsDiv.textContent = (window.t ? window.t('trash.search.results_one', { count, term }, '1 note found for "{{term}}"') : `1 note found for "${term}"`);
        } else {
            resultsDiv.textContent = (window.t ? window.t('trash.search.results_other', { count, term }, '{{count}} notes found for "{{term}}"') : `${count} notes found for "${term}"`);
        }
    }
}

function restoreNote(noteid) {
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    const requestBody = {
        id: noteid
    };
    
    if (workspace) {
        requestBody.workspace = workspace;
    }
    
    fetch('api_restore_note.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
    .then(data => {
        if (data && data.success) {
            // Visually remove note from list
            const noteElement = document.getElementById('note' + noteid);
            if (noteElement) {
                noteElement.style.display = 'none';
            }
        } else {
            const title = (window.t ? window.t('trash.alerts.restore_error_title', {}, 'Restore Error') : 'Restore Error');
            const unknown = (window.t ? window.t('common.unknown_error', {}, 'Unknown error') : 'Unknown error');
            const msgPrefix = (window.t ? window.t('trash.alerts.restore_error_prefix', {}, 'Error restoring the note: ') : 'Error restoring the note: ');
            showInfoModal(title, msgPrefix + (data.error || data.message || unknown));
        }
    })
    .catch(error => {
        console.error('Error during restoration:', error);
        const title = (window.t ? window.t('trash.alerts.restore_error_title', {}, 'Restore Error') : 'Restore Error');
        const msg = (window.t ? window.t('trash.alerts.restore_error_generic', {}, 'Error restoring the note') : 'Error restoring the note');
        showInfoModal(title, msg);
    });
}

function permanentlyDeleteNote(noteid) {
    const wsBodyDel = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? '&workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('api_permanent_delete.php', {
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
            const title = (window.t ? window.t('trash.alerts.delete_error_title', {}, 'Delete Error') : 'Delete Error');
            const msgPrefix = (window.t ? window.t('trash.alerts.delete_error_prefix', {}, 'Error during permanent deletion: ') : 'Error during permanent deletion: ');
            showInfoModal(title, msgPrefix + data);
        }
    })
    .catch(error => {
        console.error('Error during deletion:', error);
        const title = (window.t ? window.t('trash.alerts.delete_error_title', {}, 'Delete Error') : 'Delete Error');
        const msg = (window.t ? window.t('trash.alerts.delete_error_generic', {}, 'Error during permanent deletion of the note') : 'Error during permanent deletion of the note');
        showInfoModal(title, msg);
    });
}

function emptyTrash() {
    const wsEmpty = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? 'workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('api_empty_trash.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        ,
        body: wsEmpty
    })
    .then(response => response.json())
    .then(data => {
        if (data.success === true) {
            // Success - redirect to trash.php to refresh page
            window.location.href = 'trash.php' + (typeof pageWorkspace !== 'undefined' && pageWorkspace ? '?workspace=' + encodeURIComponent(pageWorkspace) : '');
        } else {
            const title = (window.t ? window.t('trash.alerts.empty_error_title', {}, 'Empty Trash Error') : 'Empty Trash Error');
            const unknown = (window.t ? window.t('common.unknown_error', {}, 'Unknown error') : 'Unknown error');
            const msgPrefix = (window.t ? window.t('trash.alerts.empty_error_prefix', {}, 'Error emptying trash: ') : 'Error emptying trash: ');
            showInfoModal(title, msgPrefix + (data.error || unknown));
        }
    })
    .catch(error => {
        console.error('Error during trash emptying:', error);
        const title = (window.t ? window.t('trash.alerts.empty_error_title', {}, 'Empty Trash Error') : 'Empty Trash Error');
        const msg = (window.t ? window.t('trash.alerts.empty_error_generic', {}, 'Error emptying trash') : 'Error emptying trash');
        showInfoModal(title, msg);
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
if (isMobileDevice()) {
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
}

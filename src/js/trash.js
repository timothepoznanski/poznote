// JavaScript for trash page
// Requires: navigation.js (for getPageWorkspace, getEffectiveWorkspace, goBackToNotes)

// Clear search and return to trash page
function clearSearchAndReturn() {
    navigateToPage('trash.php');
}

document.addEventListener('DOMContentLoaded', function () {
    // Set global pageWorkspace for compatibility with other functions
    window.pageWorkspace = getPageWorkspace();

    // Back to notes button
    var backBtn = document.getElementById('backToNotesBtn');
    if (backBtn) {
        backBtn.addEventListener('click', goBackToNotes);
    }

    // Back to home button
    var backHomeBtn = document.getElementById('backToHomeBtn');
    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', goBackToHome);
    }

    // Clear search button
    var clearSearchBtn = document.getElementById('clearTrashSearchBtn') || document.querySelector('.trash-clear-search');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function () {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = '';
                // If it's a server-side search (search param in URL), we need to reload
                if (window.location.search.includes('search=')) {
                    clearSearchAndReturn();
                } else {
                    // Just clear client-side filter
                    searchInput.dispatchEvent(new Event('input'));
                    this.parentElement.style.display = 'none';
                }
            } else {
                clearSearchAndReturn();
            }
        });
    }

    // Trash notes search management
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
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
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('lucide-undo-2')) {
            e.preventDefault();
            const noteid = e.target.getAttribute('data-noteid');
            if (noteid) {
                showRestoreConfirmModal(noteid);
            }
        }

        if (e.target.classList.contains('lucide-trash-2')) {
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
        emptyTrashBtn.addEventListener('click', function (e) {
            e.preventDefault();
            showEmptyTrashConfirmModal();
        });
    }

    // Modal button event listeners
    // Empty trash modal
    var emptyTrashCancelBtn = document.querySelector('#emptyTrashConfirmModal .btn-cancel');
    if (emptyTrashCancelBtn) {
        emptyTrashCancelBtn.addEventListener('click', closeEmptyTrashConfirmModal);
    }
    var emptyTrashConfirmBtn = document.querySelector('#emptyTrashConfirmModal .btn-danger');
    if (emptyTrashConfirmBtn) {
        emptyTrashConfirmBtn.addEventListener('click', executeEmptyTrash);
    }

    // Info modal
    var infoModalCloseBtn = document.querySelector('#infoModal .btn-primary');
    if (infoModalCloseBtn) {
        infoModalCloseBtn.addEventListener('click', closeInfoModal);
    }

    // Restore modal
    var restoreCancelBtn = document.querySelector('#restoreConfirmModal .btn-cancel');
    if (restoreCancelBtn) {
        restoreCancelBtn.addEventListener('click', closeRestoreConfirmModal);
    }
    var restoreConfirmBtn = document.querySelector('#restoreConfirmModal .btn-primary');
    if (restoreConfirmBtn) {
        restoreConfirmBtn.addEventListener('click', executeRestoreNote);
    }

    // Delete modal
    var deleteCancelBtn = document.querySelector('#deleteConfirmModal .btn-cancel');
    if (deleteCancelBtn) {
        deleteCancelBtn.addEventListener('click', closeDeleteConfirmModal);
    }
    var deleteConfirmBtn = document.querySelector('#deleteConfirmModal .btn-danger');
    if (deleteConfirmBtn) {
        deleteConfirmBtn.addEventListener('click', executePermanentDelete);
    }
});

function updateSearchResults(count, searchTerm) {
    let resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'searchResults';
        resultsDiv.className = 'trash-search-results';

        const filterBar = document.querySelector('.trash-filter-bar');
        if (filterBar) {
            filterBar.appendChild(resultsDiv);
        }
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
    const requestBody = {};

    if (workspace) {
        requestBody.workspace = workspace;
    }

    // Use RESTful API: POST /api/v1/notes/{id}/restore
    fetch('/api/v1/notes/' + noteid + '/restore', {
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
    const wsParam = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? '?workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('/api/v1/trash/' + encodeURIComponent(noteid) + wsParam, {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
        },
        credentials: 'same-origin'
    })
        .then(response => response.json())
        .then(data => {
            if (data && data.success === true) {
                // Visually remove note from list
                const noteElement = document.getElementById('note' + noteid);
                if (noteElement) {
                    noteElement.style.display = 'none';
                }
            } else {
                const title = (window.t ? window.t('trash.alerts.delete_error_title', {}, 'Delete Error') : 'Delete Error');
                const msgPrefix = (window.t ? window.t('trash.alerts.delete_error_prefix', {}, 'Error during permanent deletion: ') : 'Error during permanent deletion: ');
                showInfoModal(title, msgPrefix + (data.error || 'Unknown error'));
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
    const wsParam = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? '?workspace=' + encodeURIComponent(pageWorkspace) : '';
    fetch('/api/v1/trash' + wsParam, {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json',
        },
        credentials: 'same-origin'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success === true) {
                // Success - redirect to home page
                window.location.href = 'index.php' + (typeof pageWorkspace !== 'undefined' && pageWorkspace ? '?workspace=' + encodeURIComponent(pageWorkspace) : '');
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
window.addEventListener('click', function (event) {
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

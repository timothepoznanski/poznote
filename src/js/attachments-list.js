// JavaScript for attachments list page
// Requires: navigation.js (for getPageWorkspace, goBackToNotes)

let allRows = [];
let filteredRows = [];
let filterText = '';

document.addEventListener('DOMContentLoaded', function() {
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const backToNotesBtn = document.getElementById('backToNotesBtn');
    
    if (backToNotesBtn) {
        backToNotesBtn.addEventListener('click', goBackToNotes);
    }
    
    if (filterInput) {
        filterInput.addEventListener('input', function() {
            filterText = this.value.trim().toLowerCase();
            applyFilter();
            if (clearFilterBtn) {
                clearFilterBtn.style.display = filterText ? 'flex' : 'none';
            }
        });
        
        filterInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                filterInput.value = '';
                filterText = '';
                applyFilter();
                if (clearFilterBtn) {
                    clearFilterBtn.style.display = 'none';
                }
            }
        });
    }
    
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            if (filterInput) {
                filterInput.value = '';
                filterText = '';
                applyFilter();
                this.style.display = 'none';
                filterInput.focus();
            }
        });
    }
    
    loadAttachments();
});

async function loadAttachments() {
    const spinner = document.getElementById('loadingSpinner');
    const container = document.getElementById('attachmentsContainer');
    const emptyMessage = document.getElementById('emptyMessage');
    const workspace = getPageWorkspace();
    
    try {
        const response = await fetch('api_list_notes_with_attachments.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : ''), {
            credentials: 'same-origin'
        });
        
        if (!response.ok) throw new Error('HTTP error ' + response.status);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        if (spinner) spinner.style.display = 'none';
        
        // Get translations from data attributes
        const untitledText = document.body.getAttribute('data-txt-untitled') || 'Untitled';
        
        // Group: one row per note with all its attachments
        allRows = (data.notes || []).map(note => ({
            noteId: note.id,
            noteName: note.heading || untitledText,
            attachments: (note.attachments || []).map(att => ({
                id: att.id,
                filename: att.original_filename || att.filename
            }))
        }));
        
        if (allRows.length === 0) {
            if (emptyMessage) emptyMessage.style.display = 'block';
            return;
        }
        
        applyFilter();
    } catch (error) {
        if (spinner) spinner.style.display = 'none';
        if (container) {
            container.innerHTML = '<div class="error-message"><i class="fa-exclamation-triangle"></i> Error: ' + escapeHtml(error.message) + '</div>';
        }
    }
}

function applyFilter() {
    filteredRows = filterText 
        ? allRows.filter(r => {
                const nameMatch = r.noteName.toLowerCase().includes(filterText);
                const fileMatch = r.attachments.some(att => att.filename.toLowerCase().includes(filterText));
                return nameMatch || fileMatch;
            })
        : [...allRows];
    
    renderRows();
    
    const statsDiv = document.getElementById('filterStats');
    if (statsDiv) {
        if (filterText && filteredRows.length < allRows.length) {
            statsDiv.textContent = filteredRows.length + ' / ' + allRows.length;
            statsDiv.style.display = 'block';
        } else {
            statsDiv.style.display = 'none';
        }
    }
}

function renderRows() {
    const container = document.getElementById('attachmentsContainer');
    const emptyMessage = document.getElementById('emptyMessage');
    const workspace = getPageWorkspace();
    const noResultsText = document.body.getAttribute('data-txt-no-results') || 'No results.';
    
    if (!container) return;
    
    if (filteredRows.length === 0) {
        container.innerHTML = filterText 
            ? '<div class="empty-message"><p>' + escapeHtml(noResultsText) + '</p></div>'
            : '';
        if (emptyMessage) {
            emptyMessage.style.display = filterText ? 'none' : 'block';
        }
        return;
    }
    
    if (emptyMessage) emptyMessage.style.display = 'none';
    
    container.innerHTML = filteredRows.map(row => {
        const attachmentsList = row.attachments.map(att => 
            `<div class="attachment-file-item">
                <i class="fa-paperclip"></i>
                <a href="#" class="attachment-file-link" data-attachment-id="${att.id}" data-note-id="${row.noteId}" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</a>
            </div>`
        ).join('');
        
        return `
            <div class="attachment-row">
                <a href="index.php?note=${row.noteId}${workspace ? '&workspace=' + encodeURIComponent(workspace) : ''}" class="attachment-note-name" title="${escapeHtml(row.noteName)}">
                    ${escapeHtml(row.noteName)}
                </a>
                <div class="attachment-files-list">
                    ${attachmentsList}
                </div>
            </div>
        `;
    }).join('');
    
    // Attach click listeners using event delegation
    container.addEventListener('click', handleAttachmentClick);
}

function handleAttachmentClick(e) {
    const link = e.target.closest('.attachment-file-link');
    if (link) {
        e.preventDefault();
        const attachmentId = link.getAttribute('data-attachment-id');
        const noteId = link.getAttribute('data-note-id');
        downloadAttachment(attachmentId, noteId);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadAttachment(attachmentId, noteId) {
    if (!noteId || !attachmentId) {
        console.error('Missing noteId or attachmentId');
        return;
    }
    window.open('api_attachments.php?action=download&note_id=' + noteId + '&attachment_id=' + attachmentId, '_blank');
}

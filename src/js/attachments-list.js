// JavaScript for attachments list page
// Requires: navigation.js (for getPageWorkspace, goBackToNotes)

let allRows = [];
let filteredRows = [];
let filterText = '';

document.addEventListener('DOMContentLoaded', function () {
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const backToNotesBtn = document.getElementById('backToNotesBtn');
    const backToHomeBtn = document.getElementById('backToHomeBtn');

    if (backToNotesBtn) {
        backToNotesBtn.addEventListener('click', goBackToNotes);
    }

    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', goBackToHome);
    }

    if (filterInput) {
        filterInput.addEventListener('input', function () {
            filterText = this.value.trim().toLowerCase();
            applyFilter();
            if (clearFilterBtn) {
                clearFilterBtn.style.display = filterText ? 'flex' : 'none';
            }
        });

        filterInput.addEventListener('keydown', function (e) {
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
        clearFilterBtn.addEventListener('click', function () {
            if (filterInput) {
                filterInput.value = '';
                filterText = '';
                applyFilter();
                this.style.display = 'none';
                filterInput.focus();
            }
        });
    }

    const showThumbnailsToggle = document.getElementById('showThumbnailsToggle');
    if (showThumbnailsToggle) {
        const saved = localStorage.getItem('attachments_list_show_thumbnails');
        if (saved !== null) {
            showThumbnailsToggle.checked = saved === 'true';
        }
        showThumbnailsToggle.addEventListener('change', function () {
            localStorage.setItem('attachments_list_show_thumbnails', this.checked);
            renderRows();
        });
    }

    const showImagesToggle = document.getElementById('showImagesToggle');
    if (showImagesToggle) {
        showImagesToggle.addEventListener('change', function () {
            const isChecked = this.checked;
            // Key: 'show_inline_attachments_in_list'. Logic: '1' SHOWS everything, '0' HIDES inline ones.
            const valToSet = isChecked ? '1' : '0';

            fetch('/api/v1/settings/show_inline_attachments_in_list', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ value: valToSet })
            })
                .then(r => r.json())
                .then(result => {
                    if (result && result.success) {
                        window.location.reload();
                    }
                })
                .catch(e => console.error('Error saving setting:', e));
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
        const response = await fetch('/api/v1/notes/with-attachments' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : ''), {
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
            noteContent: note.entry || '',
            attachments: (note.attachments || []).map(att => ({
                id: att.id,
                filename: att.original_filename || att.filename,
                type: att.file_type || att.type
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
            container.innerHTML = '<div class="error-message"><i class="lucide lucide-alert-triangle"></i> Error: ' + escapeHtml(error.message) + '</div>';
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
    const showThumbnailsToggle = document.getElementById('showThumbnailsToggle');
    const showImagesToggle = document.getElementById('showImagesToggle');
    const showThumbnails = showThumbnailsToggle ? showThumbnailsToggle.checked : true;
    const showInlineEverything = showImagesToggle ? showImagesToggle.checked : true;

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

    const rowsHtmlArray = filteredRows.map(row => {
        // Filter attachments based on visibility settings
        const visibleAttachments = row.attachments.filter(att => {
            const isInline = row.noteContent && row.noteContent.includes('attachments/' + att.id);
            return showInlineEverything || !isInline;
        });

        if (visibleAttachments.length === 0) return null;

        const attachmentsList = visibleAttachments.map(att => {
            const isImage = att.type && att.type.startsWith('image/');
            let preview = '';

            if (isImage && showThumbnails) {
                let fileUrl = `/api/v1/notes/${row.noteId}/attachments/${att.id}`;
                if (workspace) fileUrl += `?workspace=${encodeURIComponent(workspace)}`;
                preview = `<div class="attachment-image-preview"><img src="${fileUrl}" alt="" loading="lazy"></div>`;
            }

            return `<div class="attachment-file-item">
                <i class="lucide lucide-paperclip"></i>
                <div class="attachment-file-content">
                    <a href="#" class="attachment-file-link" data-attachment-id="${att.id}" data-note-id="${row.noteId}" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</a>
                    ${preview}
                </div>
            </div>`;
        }).join('');

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
    }).filter(h => h !== null);

    if (rowsHtmlArray.length === 0) {
        container.innerHTML = '<div class="empty-message"><p>' + escapeHtml(noResultsText) + '</p></div>';
        return;
    }

    container.innerHTML = rowsHtmlArray.join('');

    // Attach click listeners using event delegation (Only once)
    if (!container.dataset.listenerAttached) {
        container.addEventListener('click', handleAttachmentClick);
        container.dataset.listenerAttached = 'true';
    }
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
    window.open('/api/v1/notes/' + noteId + '/attachments/' + attachmentId, '_blank');
}

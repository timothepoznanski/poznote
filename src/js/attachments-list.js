// JavaScript for attachments list page
// Requires: navigation.js (for getPageWorkspace, goBackToNotes)

let allRows = [];
let filteredRows = [];
let filterText = '';
let selectedFileType = '';

document.addEventListener('DOMContentLoaded', function () {
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const fileTypeFilter = document.getElementById('fileTypeFilter');
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

    if (fileTypeFilter) {
        fileTypeFilter.addEventListener('change', function () {
            selectedFileType = this.value;
            applyFilter();
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
                filename: att.original_filename || att.filename || '',
                type: att.file_type || att.mime_type || att.type,
                extension: getAttachmentExtension(att)
            }))
        }));

        populateFileTypeFilter(allRows);

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

function getAttachmentExtension(attachment) {
    const filename = String(attachment.original_filename || attachment.filename || '').trim();
    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex > -1 && lastDotIndex < filename.length - 1) {
        return filename.slice(lastDotIndex + 1).toLowerCase();
    }

    const mimeType = String(attachment.file_type || attachment.mime_type || attachment.type || '').toLowerCase();
    if (!mimeType.includes('/')) return '';

    const subtype = mimeType.split('/')[1].split(';')[0].trim();
    const mimeExtensionMap = {
        'jpeg': 'jpg',
        'svg+xml': 'svg',
        'x-zip-compressed': 'zip'
    };

    return mimeExtensionMap[subtype] || subtype;
}

function populateFileTypeFilter(rows) {
    const fileTypeFilter = document.getElementById('fileTypeFilter');
    if (!fileTypeFilter) return;

    const extensionSet = new Set();
    rows.forEach(row => {
        getDisplayableAttachments(row).forEach(att => {
            if (att.extension) extensionSet.add(att.extension);
        });
    });
    const extensions = Array.from(extensionSet).sort((a, b) => a.localeCompare(b));

    const allTypesText = document.body.getAttribute('data-txt-all-file-types') || 'All types';
    fileTypeFilter.innerHTML = '<option value="">' + escapeHtml(allTypesText) + '</option>' +
        extensions.map(extension => (
            '<option value="' + escapeHtml(extension) + '">' + escapeHtml(extension.toUpperCase()) + '</option>'
        )).join('');

    if (selectedFileType && !extensions.includes(selectedFileType)) {
        selectedFileType = '';
    }

    fileTypeFilter.value = selectedFileType;
    fileTypeFilter.disabled = extensions.length === 0;
    fileTypeFilter.style.display = extensions.length === 0 ? 'none' : 'block';
}

function getDisplayableAttachments(row) {
    return row.attachments.filter(att => !isEmbeddedImageAttachment(row, att));
}

function isEmbeddedImageAttachment(row, attachment) {
    if (!isImageAttachment(attachment) || !row.noteContent || !attachment.id) return false;

    const attachmentRefPattern = 'attachments\\/' + escapeRegExp(String(attachment.id)) + '(?:[?#][^\\s"\'<>)]*)?(?=$|[\\s"\'<>\\)])';
    const htmlImagePattern = new RegExp('<img\\b[^>]*' + attachmentRefPattern, 'i');
    const markdownImagePattern = new RegExp('!\\[[^\\]]*\\]\\([^)]*' + attachmentRefPattern + '[^)]*\\)', 'i');
    const noteContent = String(row.noteContent);

    return htmlImagePattern.test(noteContent) || markdownImagePattern.test(noteContent);
}

function isImageAttachment(attachment) {
    const mimeType = String(attachment.type || '').toLowerCase();
    if (mimeType.startsWith('image/')) return true;

    const imageExtensions = ['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jpg', 'jpeg', 'png', 'svg', 'webp'];
    return imageExtensions.includes(attachment.extension);
}

function applyFilter() {
    const hasTextFilter = filterText !== '';
    const hasTypeFilter = selectedFileType !== '';

    filteredRows = allRows.filter(row => {
        const displayableAttachments = getDisplayableAttachments(row);
        const matchingTypeAttachments = hasTypeFilter
            ? displayableAttachments.filter(att => att.extension === selectedFileType)
            : displayableAttachments;

        if (matchingTypeAttachments.length === 0) return false;
        if (!hasTextFilter) return true;

        const nameMatch = row.noteName.toLowerCase().includes(filterText);
        const fileMatch = matchingTypeAttachments.some(att => att.filename.toLowerCase().includes(filterText));
        return nameMatch || fileMatch;
    });

    renderRows();

    const statsDiv = document.getElementById('filterStats');
    if (statsDiv) {
        const displayableRowCount = allRows.filter(row => getDisplayableAttachments(row).length > 0).length;
        if ((hasTextFilter || hasTypeFilter) && filteredRows.length < displayableRowCount) {
            statsDiv.textContent = filteredRows.length + ' / ' + displayableRowCount;
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
    const showThumbnails = showThumbnailsToggle ? showThumbnailsToggle.checked : true;
    const hasActiveFilters = filterText !== '' || selectedFileType !== '';

    if (!container) return;

    if (filteredRows.length === 0) {
        container.innerHTML = hasActiveFilters
            ? '<div class="empty-message"><p>' + escapeHtml(noResultsText) + '</p></div>'
            : '';
        if (emptyMessage) {
            emptyMessage.style.display = hasActiveFilters ? 'none' : 'block';
        }
        return;
    }

    if (emptyMessage) emptyMessage.style.display = 'none';

    const rowsHtmlArray = filteredRows.map(row => {
        // Filter attachments based on visibility settings
        const displayableAttachments = getDisplayableAttachments(row);
        const typeFilteredAttachments = selectedFileType
            ? displayableAttachments.filter(att => att.extension === selectedFileType)
            : displayableAttachments;

        const noteNameMatchesFilter = filterText !== '' && row.noteName.toLowerCase().includes(filterText);
        const visibleAttachments = filterText !== '' && !noteNameMatchesFilter
            ? typeFilteredAttachments.filter(att => att.filename.toLowerCase().includes(filterText))
            : typeFilteredAttachments;

        if (visibleAttachments.length === 0) return null;

        const attachmentsList = visibleAttachments.map(att => {
            const isImage = isImageAttachment(att);
            let preview = '';

            if (isImage && showThumbnails) {
                let fileUrl = `/api/v1/notes/${row.noteId}/attachments/${att.id}`;
                if (workspace) fileUrl += `?workspace=${encodeURIComponent(workspace)}`;
                preview = `<div class="attachment-image-preview"><img data-src="${fileUrl}" alt="" class="lazy-thumb"></div>`;
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

    initLazyThumbnails(container);

    // Attach click listeners using event delegation (Only once)
    if (!container.dataset.listenerAttached) {
        container.addEventListener('click', handleAttachmentClick);
        container.dataset.listenerAttached = 'true';
    }
}

let thumbObserver = null;

function initLazyThumbnails(container) {
    if (thumbObserver) {
        thumbObserver.disconnect();
        thumbObserver = null;
    }

    const pendingQueue = [];
    let activeCount = 0;
    let scheduledTimer = null;
    const MAX_CONCURRENT = 2;
    const DELAY_MS = 150; // min delay between launching requests

    function scheduleNext() {
        if (scheduledTimer !== null || activeCount >= MAX_CONCURRENT || pendingQueue.length === 0) return;
        scheduledTimer = setTimeout(() => {
            scheduledTimer = null;
            if (activeCount >= MAX_CONCURRENT || pendingQueue.length === 0) return;
            const img = pendingQueue.shift();
            activeCount++;
            img.src = img.dataset.src;
            const done = () => { activeCount--; scheduleNext(); };
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            scheduleNext(); // schedule the next slot if capacity allows
        }, DELAY_MS);
    }

    thumbObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                thumbObserver.unobserve(entry.target);
                pendingQueue.push(entry.target);
                scheduleNext();
            }
        });
    }, { rootMargin: '50px' });

    container.querySelectorAll('img.lazy-thumb').forEach(img => {
        thumbObserver.observe(img);
    });
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

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function downloadAttachment(attachmentId, noteId) {
    if (!noteId || !attachmentId) {
        console.error('Missing noteId or attachmentId');
        return;
    }
    window.open('/api/v1/notes/' + noteId + '/attachments/' + attachmentId, '_blank');
}

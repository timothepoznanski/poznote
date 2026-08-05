// JavaScript for backup export page

document.addEventListener('DOMContentLoaded', function () {
    // Update back to notes link with workspace from PHP global
    try {
        var workspace = (typeof getSelectedWorkspace === 'function') ? getSelectedWorkspace() :
            (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace :
                (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;
        if (workspace) {
            var a = document.getElementById('backToNotesLink');
            if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(workspace));
        }
    } catch (e) { }

    // Attach structured export button listener
    var structuredExportBtn = document.getElementById('structuredExportBtn');
    if (structuredExportBtn) {
        structuredExportBtn.addEventListener('click', function () {
            if (typeof startStructuredExport === 'function') {
                startStructuredExport();
            }
        });
    }

    // Attach attachments export button listener
    var attachmentsExportBtn = document.getElementById('attachmentsExportBtn');
    if (attachmentsExportBtn) {
        attachmentsExportBtn.addEventListener('click', function () {
            if (typeof startAttachmentsDownload === 'function') {
                startAttachmentsDownload();
            }
        });
    }
});

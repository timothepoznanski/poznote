/**
 * Backup Export Page JavaScript
 * Handles backup and export functionality
 */

/**
 * Download notes as ZIP file
 */
function startDownload() {
    // Create a direct link to the export script
    window.location.href = 'export_entries.php';
}

/**
 * Download attachments as ZIP file
 */
function startAttachmentsDownload() {
    // Create a direct link to the attachments export script
    window.location.href = 'export_attachments.php';
}

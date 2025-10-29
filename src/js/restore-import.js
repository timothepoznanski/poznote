/**
 * Restore Import Page JavaScript
 * Handles database, notes, and attachments import functionality
 */

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('import-confirm-modal') || e.target.classList.contains('custom-alert')) {
            e.target.style.display = 'none';
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideImportConfirmation();
            hideNotesImportConfirmation();
            hideAttachmentsImportConfirmation();
            hideIndividualNotesImportConfirmation();
            hideCompleteRestoreConfirmation();
            hideChunkedRestoreConfirmation();
            hideCustomAlert();
        }
    });
});

// Complete Restore Functions
function showCompleteRestoreConfirmation() {
    const fileInput = document.getElementById('complete_backup_file');
    if (!fileInput.files.length) {
        showCustomAlert('No ZIP File Selected', 'Please select a complete backup ZIP file before proceeding with the restore.');
        return;
    }
    
    const file = fileInput.files[0];
    const sizeMB = file.size / (1024 * 1024);
    
    // Update modal content based on file size
    const modal = document.getElementById('completeRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');
    
    if (sizeMB > 500) {
        warningText.innerHTML = '<strong>Warning:</strong> This file is ' + sizeMB.toFixed(1) + 'MB. Standard upload may be slow or fail for large files. Consider using chunked upload instead.<br><br><strong>This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</strong>';
    } else {
        warningText.innerHTML = '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.';
    }
    
    modal.style.display = 'flex';
}

function hideCompleteRestoreConfirmation() {
    document.getElementById('completeRestoreConfirmModal').style.display = 'none';
}

function proceedWithCompleteRestore() {
    const forms = document.querySelectorAll('form[method="post"]');
    const completeForm = Array.from(forms).find(form => 
        form.querySelector('input[name="action"][value="complete_restore"]')
    );
    if (completeForm) {
        // Hide confirmation modal first
        hideCompleteRestoreConfirmation();
        // Show spinner immediately
        showRestoreSpinner();
        // Submit the form
        completeForm.submit();
    } else {
        alert('Complete restore form not found. Please try again.');
    }
}

// Advanced Import Toggle Function
function toggleAdvancedImport() {
    const advancedOptions = document.getElementById('advancedImportOptions');
    const toggleButton = document.querySelector('button[onclick="toggleAdvancedImport()"]');
    
    if (advancedOptions.style.display === 'none') {
        advancedOptions.style.display = 'block';
        toggleButton.innerHTML = '<i class="fa-chevron-up"></i> Hide Advanced Import Options';
    } else {
        advancedOptions.style.display = 'none';
        toggleButton.innerHTML = '<i class="fa-chevron-down"></i> Show Advanced Import Options';
    }
}

// Database Import Functions
function showImportConfirmation() {
    const fileInput = document.getElementById('backup_file');
    if (!fileInput.files.length) {
        showCustomAlert('No SQL File Selected', 'Please select a SQL file before proceeding with the database import.');
        return;
    }
    document.getElementById('importConfirmModal').style.display = 'flex';
}

function hideImportConfirmation() {
    document.getElementById('importConfirmModal').style.display = 'none';
}

function proceedWithImport() {
    const form = document.querySelector('form[method="post"]');
    if (form) {
        const actionInput = form.querySelector('input[name="action"]');
        if (actionInput) {
            actionInput.value = 'restore';
        }
        form.submit();
    } else {
        alert('Form not found. Please try again.');
    }
}

// Notes Import Functions
function showNotesImportConfirmation() {
    const fileInput = document.getElementById('notes_file');
    if (!fileInput.files.length) {
        showCustomAlert('No ZIP File Selected', 'Please select a ZIP file containing HTML notes before proceeding with the import.');
        return;
    }
    document.getElementById('notesImportConfirmModal').style.display = 'flex';
}

function hideNotesImportConfirmation() {
    document.getElementById('notesImportConfirmModal').style.display = 'none';
}

function proceedWithNotesImport() {
    const forms = document.querySelectorAll('form[method="post"]');
    const notesForm = Array.from(forms).find(form => 
        form.querySelector('input[name="action"][value="import_notes"]')
    );
    if (notesForm) {
        notesForm.submit();
    }
}

// Attachments Import Functions
function showAttachmentsImportConfirmation() {
    const fileInput = document.getElementById('attachments_file');
    if (!fileInput.files.length) {
        showCustomAlert('No ZIP File Selected', 'Please select a ZIP file containing attachments before proceeding with the import.');
        return;
    }
    document.getElementById('attachmentsImportConfirmModal').style.display = 'flex';
}

function hideAttachmentsImportConfirmation() {
    document.getElementById('attachmentsImportConfirmModal').style.display = 'none';
}

function proceedWithAttachmentsImport() {
    const forms = document.querySelectorAll('form[method="post"]');
    const attachmentsForm = Array.from(forms).find(form => 
        form.querySelector('input[name="action"][value="import_attachments"]')
    );
    if (attachmentsForm) {
        attachmentsForm.submit();
    }
}

// Individual Notes Import Functions
function showIndividualNotesImportConfirmation() {
    const fileInput = document.getElementById('individual_notes_files');
    
    if (!fileInput.files.length) {
        showCustomAlert('No Files Selected', 'Please select one or more HTML or Markdown files before proceeding with the import.');
        return;
    }
    
    // Check file count limit
    const maxFiles = 20;
    const fileCount = fileInput.files.length;
    
    if (fileCount > maxFiles) {
        showCustomAlert('Too Many Files Selected', `You can import a maximum of ${maxFiles} files at once. You have selected ${fileCount} files. Please select fewer files and try again.`);
        return;
    }
    
    // Update summary text
    const fileText = fileCount === 1 ? '1 note' : `${fileCount} notes`;
    const summary = `This will import ${fileText} into the Default folder of the Poznote workspace.`;
    document.getElementById('individualNotesImportSummary').textContent = summary;
    
    document.getElementById('individualNotesImportConfirmModal').style.display = 'flex';
}

function hideIndividualNotesImportConfirmation() {
    document.getElementById('individualNotesImportConfirmModal').style.display = 'none';
}

function proceedWithIndividualNotesImport() {
    const form = document.getElementById('individualNotesForm');
    if (form) {
        hideIndividualNotesImportConfirmation();
        form.submit();
    }
}

// Chunked Restore Functions
function showChunkedRestoreConfirmation() {
    const fileInput = document.getElementById('chunked_backup_file');
    if (!fileInput.files.length) {
        showCustomAlert('No ZIP File Selected', 'Please select a complete backup ZIP file before proceeding with the chunked restore.');
        return;
    }
    
    const file = fileInput.files[0];
    const sizeMB = file.size / (1024 * 1024);
    
    // Update modal content based on file size
    const modal = document.getElementById('chunkedRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');
    
    if (sizeMB < 500) {
        warningText.innerHTML = '<strong>Note:</strong> This file is ' + sizeMB.toFixed(1) + 'MB. Standard upload is usually faster for small files, but chunked upload will work too.<br><br><strong>This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</strong>';
    } else {
        warningText.innerHTML = '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.';
    }
    
    modal.style.display = 'flex';
}

function hideChunkedRestoreConfirmation() {
    document.getElementById('chunkedRestoreConfirmModal').style.display = 'none';
}

function proceedWithChunkedRestore() {
    hideChunkedRestoreConfirmation();
    // Call the actual chunked restore function
    startChunkedRestore();
}

// Custom Alert Functions
function showCustomAlert(title = 'No File Selected', message = 'Please select a file before proceeding with the import.') {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('customAlert').style.display = 'flex';
}

function hideCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}

// Restore spinner functions
function showRestoreSpinner() {
    try {
        var spinner = document.getElementById('restoreSpinner');
        var btn = document.getElementById('completeRestoreBtn');
        if (spinner) {
            spinner.style.display = 'inline-flex';
            spinner.setAttribute('aria-hidden', 'false');
        }
        if (btn) {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
        }
    } catch (e) { /* ignore */ }
}

function hideRestoreSpinner() {
    try {
        var spinner = document.getElementById('restoreSpinner');
        var btn = document.getElementById('completeRestoreBtn');
        if (spinner) {
            spinner.style.display = 'none';
            spinner.setAttribute('aria-hidden', 'true');
        }
        if (btn) {
            btn.disabled = false;
            btn.setAttribute('aria-disabled', 'false');
        }
    } catch (e) { /* ignore */ }
}

// Chunked restore function (called after confirmation)
function startChunkedRestore() {
    const fileInput = document.getElementById('chunked_backup_file');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a backup file first.');
        return;
    }

    // Show progress UI
    document.getElementById('chunkedUploadForm').style.display = 'none';
    document.getElementById('chunkedUploadStatus').style.display = 'block';
    
    const progressBar = document.getElementById('chunkedProgress');
    const statusText = document.getElementById('chunkedStatusText');
    
    // Initialize uploader
    chunkedUploader = new ChunkedUploader({
        chunkSize: 5 * 1024 * 1024, // 5MB chunks
        onProgress: (percent) => {
            progressBar.style.width = percent + '%';
            progressBar.textContent = Math.round(percent) + '%';
            statusText.textContent = `Uploading... ${Math.round(percent)}% complete`;
        },
        onComplete: () => {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            statusText.textContent = 'Restoration completed successfully!';
            
            // Add a success message and manual reload option instead of auto-reload
            setTimeout(() => {
                const successMsg = document.createElement('div');
                successMsg.className = 'alert alert-success';
                successMsg.innerHTML = '<strong>Success!</strong> Your backup has been restored. <button class="btn btn-primary btn-sm" onclick="location.reload()" style="margin-left: 10px;">Refresh Page</button>';
                document.getElementById('chunkedUploadStatus').appendChild(successMsg);
            }, 500);
        },
        onError: (error) => {
            statusText.textContent = `Error: ${error.message}`;
            progressBar.style.backgroundColor = '#dc3545';
            
            // Show retry option
            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn btn-secondary';
            retryBtn.textContent = 'Retry';
            retryBtn.onclick = () => {
                location.reload();
            };
            document.getElementById('chunkedUploadStatus').appendChild(retryBtn);
        }
    });

    // Start upload
    chunkedUploader.uploadFile(file, 'api_chunked_restore.php');
}

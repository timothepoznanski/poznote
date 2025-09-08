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
            hideCompleteRestoreConfirmation();
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
    document.getElementById('completeRestoreConfirmModal').style.display = 'flex';
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
        toggleButton.innerHTML = '<i class="fas fa-chevron-up"></i> Hide Advanced Import Options';
    } else {
        advancedOptions.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-chevron-down"></i> Show Advanced Import Options';
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

// Custom Alert Functions
function showCustomAlert(title = 'No File Selected', message = 'Please select a file before proceeding with the import.') {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('customAlert').style.display = 'flex';
}

function hideCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}

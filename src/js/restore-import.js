/**
 * Restore Import Page JavaScript
 * Handles database, notes, and attachments import functionality
 */

function tr(key, fallback, vars) {
    if (window.t) return window.t(key, vars || null, fallback);
    if (vars && typeof vars === 'object') {
        for (const k in vars) fallback = String(fallback).split('{{' + k + '}}').join(String(vars[k]));
    }
    return fallback;
}

// Custom alert helpers (used by inline onclick and this script)
if (typeof window.showCustomAlert !== 'function') {
    window.showCustomAlert = function (title, message) {
        const alertEl = document.getElementById('customAlert');
        const titleEl = document.getElementById('alertTitle');
        const messageEl = document.getElementById('alertMessage');

        if (titleEl) titleEl.textContent = title != null ? String(title) : '';
        if (messageEl) messageEl.textContent = message != null ? String(message) : '';

        if (alertEl) {
            alertEl.style.display = 'flex';
        } else {
            // Fallback if markup is missing
            alert((title ? title + '\n\n' : '') + (message || ''));
        }
    };
}

if (typeof window.hideCustomAlert !== 'function') {
    window.hideCustomAlert = function () {
        const alertEl = document.getElementById('customAlert');
        if (alertEl) alertEl.style.display = 'none';
    };
}

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
            hideDirectCopyRestoreConfirmation();
            hideCustomAlert();
        }
    });
    
    // Load workspaces for individual notes import
    loadWorkspacesForImport();
});

// Complete Restore Functions
function showCompleteRestoreConfirmation() {
    const fileInput = document.getElementById('complete_backup_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_restore', 'Please select a complete backup ZIP file before proceeding with the restore.')
        );
        return;
    }
    
    const file = fileInput.files[0];
    const sizeMB = file.size / (1024 * 1024);
    
    // Update modal content based on file size
    const modal = document.getElementById('completeRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');
    
    if (sizeMB > 500) {
        warningText.innerHTML = tr(
            'restore_import.modals.complete_restore.warning_large_html',
            '<strong>Warning:</strong> This file is {{size}}MB. Standard upload may be slow or fail for large files. Consider using chunked upload instead.<br><br><strong>This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</strong>',
            { size: sizeMB.toFixed(1) }
        );
    } else {
        warningText.innerHTML = tr(
            'restore_import.modals.complete_restore.warning_html',
            '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.',
            null
        );
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
        alert(tr('restore_import.errors.complete_restore_form_not_found', 'Complete restore form not found. Please try again.'));
    }
}

// Advanced Import Toggle Function
function toggleAdvancedImport() {
    const advancedOptions = document.getElementById('advancedImportOptions');
    const toggleButton = document.querySelector('button[onclick="toggleAdvancedImport()"]');
    
    if (advancedOptions.style.display === 'none') {
        advancedOptions.style.display = 'block';
        toggleButton.innerHTML = '<i class="fa-chevron-up"></i> ' + tr('restore_import.advanced.hide', 'Hide Advanced Import Options');
    } else {
        advancedOptions.style.display = 'none';
        toggleButton.innerHTML = '<i class="fa-chevron-down"></i> ' + tr('restore_import.advanced.show', 'Show Advanced Import Options');
    }
}

// Database Import Functions
function showImportConfirmation() {
    const fileInput = document.getElementById('backup_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_sql_selected_title', 'No SQL File Selected'),
            tr('restore_import.alerts.no_sql_selected_body', 'Please select a SQL file before proceeding with the database import.')
        );
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
        alert(tr('restore_import.errors.form_not_found', 'Form not found. Please try again.'));
    }
}

// Notes Import Functions
function showNotesImportConfirmation() {
    const fileInput = document.getElementById('notes_file');
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_notes', 'Please select a ZIP file containing HTML notes before proceeding with the import.')
        );
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
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_attachments', 'Please select a ZIP file containing attachments before proceeding with the import.')
        );
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
    const workspaceSelect = document.getElementById('target_workspace_select');
    const folderSelect = document.getElementById('target_folder_select');
    
    if (!fileInput.files.length) {
        showCustomAlert(
            tr('restore_import.alerts.no_files_selected_title', 'No Files Selected'),
            tr('restore_import.alerts.no_files_selected_body', 'Please select one or more HTML, Markdown files, or a ZIP archive before proceeding with the import.')
        );
        return;
    }
    
    // Validate workspace selection
    if (!workspaceSelect.value) {
        showCustomAlert(
            tr('restore_import.alerts.no_workspace_title', 'No Workspace Selected'),
            tr('restore_import.alerts.no_workspace_body', 'Please select a workspace for the imported notes.')
        );
        return;
    }
    
    const fileCount = fileInput.files.length;
    const workspace = workspaceSelect.options[workspaceSelect.selectedIndex].text;
    const folder = folderSelect.value ? folderSelect.options[folderSelect.selectedIndex].text : tr('restore_import.sections.individual_notes.no_folder', 'No folder (root level)');
    
    // Check if it's a single ZIP file
    const isSingleZip = fileCount === 1 && fileInput.files[0].name.toLowerCase().endsWith('.zip');
    
    let summary = '';
    
    if (isSingleZip) {
        // For ZIP files, show different confirmation message
        summary = tr(
            'restore_import.individual_notes.summary_zip_with_location',
            'This will extract and import all HTML and Markdown files from the ZIP archive into workspace "{{workspace}}", folder "{{folder}}".',
            { workspace: workspace, folder: folder }
        );
    } else {
        // Check file count limit for non-ZIP uploads
        const maxFiles = 50;
        
        if (fileCount > maxFiles) {
            showCustomAlert(
                tr('restore_import.alerts.too_many_files_title', 'Too Many Files Selected'),
                tr(
                    'restore_import.alerts.too_many_files_body',
                    'You can import a maximum of {{max}} files at once. You have selected {{count}} files. Please select fewer files and try again.',
                    { max: maxFiles, count: fileCount }
                )
            );
            return;
        }
        
        // Update summary text for individual files
        const fileText = fileCount === 1
            ? tr('restore_import.individual_notes.file_count_one', '1 note')
            : tr('restore_import.individual_notes.file_count_many', '{{count}} notes', { count: fileCount });

        summary = tr(
            'restore_import.individual_notes.summary_with_location',
            'This will import {{fileText}} into workspace "{{workspace}}", folder "{{folder}}".',
            { fileText: fileText, workspace: workspace, folder: folder }
        );
    }
    
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
        showCustomAlert(
            tr('restore_import.alerts.no_zip_selected_title', 'No ZIP File Selected'),
            tr('restore_import.alerts.no_zip_selected_chunked', 'Please select a complete backup ZIP file before proceeding with the chunked restore.')
        );
        return;
    }
    
    const file = fileInput.files[0];
    const sizeMB = file.size / (1024 * 1024);
    
    // Update modal content based on file size
    const modal = document.getElementById('chunkedRestoreConfirmModal');
    const modalContent = modal.querySelector('.import-confirm-modal-content');
    const warningText = modalContent.querySelector('p');
    
    if (sizeMB < 500) {
        warningText.innerHTML = tr(
            'restore_import.modals.chunked_restore.note_small_html',
            '<strong>Note:</strong> This file is {{size}}MB. Standard upload is usually faster for small files, but chunked upload will work too.<br><br><strong>This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.</strong>',
            { size: sizeMB.toFixed(1) }
        );
    } else {
        warningText.innerHTML = tr(
            'restore_import.modals.chunked_restore.warning_html',
            '<strong>Warning:</strong> This will replace your database, restore all notes, and attachments for <span style="color: #dc3545; font-weight: bold;">all workspaces</span>.',
            null
        );
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

// Direct Copy Restore Functions
function showDirectCopyRestoreConfirmation() {
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'flex';
}

function hideDirectCopyRestoreConfirmation() {
    document.getElementById('directCopyRestoreConfirmModal').style.display = 'none';
}

function proceedWithDirectCopyRestore() {
    hideDirectCopyRestoreConfirmation();
    // Submit the direct copy restore form
    let form = document.getElementById('directCopyRestoreForm');
    if (!form) {
        // Create the form if it doesn't exist
        form = document.createElement('form');
        form.method = 'post';
        form.id = 'directCopyRestoreForm';
        form.style.display = 'none';
        
        const actionInput = document.createElement('input');
        actionInput.type = 'hidden';
        actionInput.name = 'action';
        actionInput.value = 'restore_cli_upload';
        
        form.appendChild(actionInput);
        document.body.appendChild(form);
    }
    form.submit();
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
        alert(tr('restore_import.errors.select_backup_first', 'Please select a backup file first.'));
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
            statusText.textContent = tr(
                'restore_import.chunked.status_uploading',
                'Uploading... {{percent}}% complete',
                { percent: Math.round(percent) }
            );
        },
        onComplete: () => {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            statusText.textContent = tr('restore_import.chunked.status_completed', 'Restoration completed successfully!');
            
            // Add a success message and manual reload option instead of auto-reload
            setTimeout(() => {
                const successMsg = document.createElement('div');
                successMsg.className = 'alert alert-success';
                successMsg.innerHTML = tr(
                    'restore_import.chunked.success_html',
                    '<strong>Success!</strong> Your backup has been restored. <button class="btn btn-primary btn-sm" onclick="location.reload()" style="margin-left: 10px;">Refresh Page</button>'
                );
                document.getElementById('chunkedUploadStatus').appendChild(successMsg);
            }, 500);
        },
        onError: (error) => {
            statusText.textContent = tr('restore_import.chunked.status_error', 'Error: {{message}}', { message: error.message });
            progressBar.style.backgroundColor = '#dc3545';
            
            // Show retry option
            const retryBtn = document.createElement('button');
            retryBtn.className = 'btn btn-secondary';
            retryBtn.textContent = tr('restore_import.chunked.retry', 'Retry');
            retryBtn.onclick = () => {
                location.reload();
            };
            document.getElementById('chunkedUploadStatus').appendChild(retryBtn);
        }
    });

    // Start upload
    chunkedUploader.uploadFile(file, 'api_chunked_restore.php');
}

// Load workspaces for individual notes import
function loadWorkspacesForImport() {
    const workspaceSelect = document.getElementById('target_workspace_select');
    if (!workspaceSelect) return;
    
    fetch('api_workspaces.php?action=list')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.workspaces) {
                workspaceSelect.innerHTML = '';
                
                // Add workspaces to select
                data.workspaces.forEach(workspace => {
                    const option = document.createElement('option');
                    option.value = workspace.name;
                    option.textContent = workspace.name;
                    
                    // Select 'Poznote' by default if it exists
                    if (workspace.name === 'Poznote') {
                        option.selected = true;
                    }
                    
                    workspaceSelect.appendChild(option);
                });
                
                // Load folders for the default selected workspace
                const selectedWorkspace = workspaceSelect.value;
                if (selectedWorkspace) {
                    loadFoldersForImport(selectedWorkspace);
                }
            } else {
                console.error('Failed to load workspaces:', data);
                workspaceSelect.innerHTML = '<option value="Poznote">Poznote</option>';
            }
        })
        .catch(error => {
            console.error('Error loading workspaces:', error);
            workspaceSelect.innerHTML = '<option value="Poznote">Poznote</option>';
        });
}

// Load folders for selected workspace
function loadFoldersForImport(workspace) {
    const folderSelect = document.getElementById('target_folder_select');
    if (!folderSelect) return;
    
    // Reset to "No folder" option
    folderSelect.innerHTML = '<option value="">' + 
        tr('restore_import.sections.individual_notes.no_folder', 'No folder (root level)') + 
        '</option>';
    
    if (!workspace) return;
    
    // Fetch folders for the selected workspace
    fetch('api_folders.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'list',
            workspace: workspace
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.folders) {
                // Flatten the hierarchical structure for simple display
                const flattenFolders = (folders, prefix = '') => {
                    let result = [];
                    folders.forEach(folder => {
                        const displayName = prefix + folder.name;
                        result.push({ name: folder.name, displayName: displayName });
                        
                        if (folder.children && folder.children.length > 0) {
                            result = result.concat(flattenFolders(folder.children, displayName + ' / '));
                        }
                    });
                    return result;
                };
                
                const flatFolders = flattenFolders(data.folders);
                
                flatFolders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder.name;
                    option.textContent = folder.displayName;
                    folderSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading folders:', error);
        });
}

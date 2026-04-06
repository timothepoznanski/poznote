<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';
require_once 'export_helpers.php';

// Start output buffering to prevent any unwanted output
ob_start();

// Get the correct entries path using our centralized function
$rootPath = getEntriesPath();

// Debug: Check if entries directory exists
if (!$rootPath) {
    ob_end_clean();
    die('Entries directory not found in any expected location');
}

$fileCount = 0;
$workspace = $_GET['workspace'] ?? null;

// Get workspace name if workspace is specified
$workspaceName = 'all';
if ($workspace !== null) {
    $stmt_ws = $con->prepare('SELECT name FROM workspaces WHERE name = ?');
    $stmt_ws->execute([$workspace]);
    $ws_row = $stmt_ws->fetch(PDO::FETCH_ASSOC);
    if ($ws_row) {
        $workspaceName = $ws_row['name'];
    }
}

// Generate filename with workspace name and date
$tempDir = sys_get_temp_dir();
$dateStr = date('Y-m-d_His');
// Sanitize workspace name: replace spaces and special characters with underscores
$safeWorkspaceName = preg_replace('/\s+/', '_', $workspaceName); // Replace spaces with underscores
$safeWorkspaceName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $safeWorkspaceName); // Replace other special chars
$safeWorkspaceName = preg_replace('/_+/', '_', $safeWorkspaceName); // Replace multiple underscores with single
$safeWorkspaceName = trim($safeWorkspaceName, '_'); // Remove leading/trailing underscores
$zipFileName = $tempDir . '/poznote_structured_' . $safeWorkspaceName . '_' . $dateStr . '.zip';

$zip = new ZipArchive();
$result = $zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE);
if ($result !== TRUE) {
    ob_end_clean();
    die('Cannot create ZIP file. Error code: ' . $result);
}

// Build folder tree
$folderTree = buildFolderTree($con, $workspace);
$folderMap = $folderTree['folderMap'];
$allFolders = $folderTree['folders'];

// Create README in the root explaining the structure
$readmeContent = "# Poznote Structured Export\n\n";
$readmeContent .= "This archive contains your Poznote notes organized in folders matching your Poznote folder structure.\n\n";

// Add workspace name
$readmeContent .= "**Workspace:** " . $workspaceName . "\n\n";

// Add export date
$readmeContent .= "**Export date:** " . date('Y-m-d H:i:s') . "\n\n";

$readmeContent .= "## Structure\n\n";
$readmeContent .= "- Each folder from Poznote is represented as a directory in this archive\n";
$readmeContent .= "- Notes are saved with their original type (.html or .md)\n";
$readmeContent .= "- Markdown files include YAML front matter with metadata (title, tags, etc.)\n";
$readmeContent .= "- Notes without a folder are placed in the 'Uncategorized' directory\n\n";

$zip->addFromString('README.md', $readmeContent);

// Build a mapping of note IDs to their attachment extensions for URL conversion
$noteAttachments = [];
$query_attachments = 'SELECT id, attachments FROM entries WHERE trash = 0 AND attachments IS NOT NULL AND attachments != \'\' AND attachments != \'[]\'';
$att_params = [];
if ($workspace !== null) {
    $query_attachments .= ' AND workspace = ?';
    $att_params[] = $workspace;
}
$stmt_att = $con->prepare($query_attachments);
$stmt_att->execute($att_params);

while ($row_att = $stmt_att->fetch(PDO::FETCH_ASSOC)) {
    $attachments = json_decode($row_att['attachments'], true);
    if (is_array($attachments)) {
        $attachmentExtensions = [];
        foreach ($attachments as $attachment) {
            if (isset($attachment['id']) && isset($attachment['filename'])) {
                $ext = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                $attachmentExtensions[$attachment['id']] = $ext ? '.' . $ext : '';
            }
        }
        $noteAttachments[$row_att['id']] = $attachmentExtensions;
    }
}

// Query all notes (excluding trash)
$query_notes = 'SELECT * FROM entries WHERE trash = 0';
$notes_params = [];
if ($workspace !== null) {
    $query_notes .= ' AND workspace = ?';
    $notes_params[] = $workspace;
}
$query_notes .= ' ORDER BY folder_id, heading';
$stmt_notes = $con->prepare($query_notes);
$stmt_notes->execute($notes_params);
$res_notes = $stmt_notes;

// Track folders that have been created in the ZIP to avoid duplicates
$createdFolders = [];
$allNoteAttachments = []; // Collect all attachments to add to ZIP later

// Process each note
while ($row = $res_notes->fetch(PDO::FETCH_ASSOC)) {
    $noteId = $row['id'];
    $heading = $row['heading'] ?: 'New note';
    $folder_id = $row['folder_id'] ?? null;
    $noteType = $row['type'] ?? 'note';
    
    // Determine file extension
    $fileExtension = ($noteType === 'markdown' || $noteType === 'tasklist') ? 'md' : 'html';
    
    // Get the folder path in the ZIP
    $zipFolderPath = getFolderZipPath($folder_id, $folderMap);
    
    // If no folder, use "Uncategorized"
    if (empty($zipFolderPath)) {
        $zipFolderPath = 'Uncategorized/';
    }
    
    // Mark folder as created
    if (!isset($createdFolders[$zipFolderPath])) {
        $createdFolders[$zipFolderPath] = true;
    }
    
    // Create a safe filename from the heading
    $safeHeading = sanitizeFilename($heading);
    
    // Set the filename
    $noteFileName = $zipFolderPath . $safeHeading . '.' . $fileExtension;
    
    // Get the note content from the file
    $entryFilePath = getEntryFilename($noteId, $noteType);
    
    if (file_exists($entryFilePath) && is_readable($entryFilePath)) {
        $content = file_get_contents($entryFilePath);
        
        // For Markdown files, add front matter with metadata
        if ($fileExtension === 'md') {
            // Convert tasklist JSON to Markdown checkbox format before adding front matter
            if ($noteType === 'tasklist') {
                $content = convertTasklistToMarkdown($content);
            }
            $content = addFrontMatterToMarkdown($content, $row, $con);
            
            // Convert Markdown image URLs if this note has attachments
            if (isset($noteAttachments[$noteId])) {
                $content = preg_replace_callback(
                    '#\!\[([^\]]*)\]\(/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)\)#',
                    function($matches) use ($noteAttachments, $noteId) {
                        $altText = $matches[1];
                        $attachmentId = $matches[2];
                        $extension = $noteAttachments[$noteId][$attachmentId] ?? '';
                        return '![' . $altText . '](../attachments/' . $attachmentId . $extension . ')';
                    },
                    $content
                );
            }
        } else {
            $content = removeCopyButtonsFromHtml($content);
            
            // Convert HTML image URLs if this note has attachments
            if (isset($noteAttachments[$noteId])) {
                $content = preg_replace_callback(
                    '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)#',
                    function($matches) use ($noteAttachments, $noteId) {
                        $attachmentId = $matches[1];
                        $extension = $noteAttachments[$noteId][$attachmentId] ?? '';
                        return '../attachments/' . $attachmentId . $extension;
                    },
                    $content
                );
            }
        }
        
        $zip->addFromString($noteFileName, $content);
        $fileCount++;
        
        // Collect attachments for this note
        if (isset($noteAttachments[$noteId])) {
            $attachmentsData = json_decode($row['attachments'], true);
            if (is_array($attachmentsData)) {
                foreach ($attachmentsData as $attachment) {
                    if (isset($attachment['id']) && isset($attachment['filename'])) {
                        $allNoteAttachments[$attachment['id']] = $attachment['filename'];
                    }
                }
            }
        }
    }
}

// Add attachments to ZIP in the attachments/ folder
if (!empty($allNoteAttachments)) {
    $attachmentsPath = getAttachmentsPath();
    
    foreach ($allNoteAttachments as $attachmentId => $filename) {
        $attachmentFile = $attachmentsPath . '/' . $filename;
        
        if (file_exists($attachmentFile) && is_readable($attachmentFile)) {
            $ext = pathinfo($filename, PATHINFO_EXTENSION);
            $zipAttachmentName = 'attachments/' . $attachmentId . ($ext ? '.' . $ext : '');
            $zip->addFile($attachmentFile, $zipAttachmentName);
        }
    }
}

// Add empty .gitkeep files to empty folders to ensure they're preserved
foreach ($allFolders as $folder) {
    $zipPath = getFolderZipPath($folder['id'], $folderMap);
    if (!empty($zipPath) && !isset($createdFolders[$zipPath])) {
        // Check if this folder has any child folders with notes
        $hasContent = false;
        foreach ($createdFolders as $path => $val) {
            if (strpos($path, $zipPath) === 0 && $path !== $zipPath) {
                $hasContent = true;
                break;
            }
        }
        
        // Add .gitkeep to preserve empty folders
        if (!$hasContent) {
            $zip->addFromString($zipPath . '.gitkeep', '');
        }
    }
}

$zip->close();

// Clear any output buffer
ob_end_clean();

// Check if ZIP file was created successfully
if (!file_exists($zipFileName)) {
    die('Export file could not be created - ZIP file not found');
}

if (filesize($zipFileName) == 0) {
    unlink($zipFileName);
    die('Export file could not be created - ZIP file is empty');
}

// Send file to browser
$downloadFileName = 'poznote_structured_' . $safeWorkspaceName . '_' . $dateStr . '.zip';
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $downloadFileName . '"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>

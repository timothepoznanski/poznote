<?php
require 'auth.php';
requireApiAuth();

require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';
require_once 'export_helpers.php';

// Start output buffering to prevent any unwanted output
ob_start();

$folder_id = $_GET['folder_id'] ?? null;

if ($folder_id === null || !is_numeric($folder_id)) {
    ob_end_clean();
    die('Invalid folder ID');
}

$stmt = $con->prepare('SELECT name, workspace FROM folders WHERE id = ?');
$stmt->execute([$folder_id]);
$folder = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$folder) {
    ob_end_clean();
    die('Folder not found');
}

$folder_name = $folder['name'];
$workspace = $folder['workspace'];

$rootPath = getEntriesPath();

if (!$rootPath) {
    ob_end_clean();
    die('Entries directory not found in any expected location');
}

$zip = new ZipArchive();
$tempDir = sys_get_temp_dir();
$zipFileName = $tempDir . '/poznote_folder_' . uniqid() . '.zip';

$result = $zip->open($zipFileName, ZipArchive::CREATE | ZipArchive::OVERWRITE);
if ($result !== TRUE) {
    ob_end_clean();
    die('Cannot create ZIP file. Error code: ' . $result);
}

// Build folder tree
$folderTree = buildFolderTree($con, $workspace);
$folderMap = $folderTree['folderMap'];
$allFolders = $folderTree['folders'];

// Get all child folders of the target folder (including the target itself)
$targetFolderIds = [$folder_id];
$targetFolderIds = array_merge($targetFolderIds, getChildFolderIds($folder_id, $allFolders));

// Create README in the root explaining the structure
$readmeContent = "# Poznote Folder Export: " . $folder_name . "\n\n";
$readmeContent .= "This archive contains the folder '" . $folder_name . "' and all its contents from Poznote.\n\n";
$readmeContent .= "Export date: " . date('Y-m-d H:i:s') . "\n\n";
$readmeContent .= "## Structure\n\n";
$readmeContent .= "- Subfolders are preserved in the archive\n";
$readmeContent .= "- Notes are saved with their original type (.html or .md)\n";
$readmeContent .= "- Markdown files include YAML front matter with metadata (title, tags, etc.)\n\n";

$zip->addFromString('README.md', $readmeContent);

// Query all notes in this folder and its subfolders (excluding trash)
$placeholders = implode(',', array_fill(0, count($targetFolderIds), '?'));
$query_notes = "SELECT * FROM entries WHERE trash = 0 AND folder_id IN ($placeholders) ORDER BY folder_id, heading";
$stmt = $con->prepare($query_notes);
$stmt->execute($targetFolderIds);

// Build a mapping of note IDs to their attachment extensions for URL conversion
$noteAttachments = [];
$stmt_attachments = $con->prepare("SELECT id, attachments FROM entries WHERE trash = 0 AND folder_id IN ($placeholders) AND attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
$stmt_attachments->execute($targetFolderIds);

while ($row_att = $stmt_attachments->fetch(PDO::FETCH_ASSOC)) {
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

// Track folders that have been created in the ZIP to avoid duplicates
$createdFolders = [];
$allNoteAttachments = []; // Collect all attachments to add to ZIP later

// Process each note
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $noteId = $row['id'];
    $heading = $row['heading'] ?: 'New note';
    $note_folder_id = $row['folder_id'] ?? null;
    $noteType = $row['type'] ?? 'note';
    
    $fileExtension = ($noteType === 'markdown') ? 'md' : 'html';
    
    $zipFolderPath = getFolderZipPath($note_folder_id, $folderMap, $folder_id);
    
    if (!isset($createdFolders[$zipFolderPath])) {
        $createdFolders[$zipFolderPath] = true;
    }
    
    $safeHeading = sanitizeFilename($heading);
    $noteFileName = $zipFolderPath . $safeHeading . '_' . $noteId . '.' . $fileExtension;
    
    $entryFilePath = getEntryFilename($noteId, $noteType);
    
    if (file_exists($entryFilePath) && is_readable($entryFilePath)) {
        $content = file_get_contents($entryFilePath);
        
        if ($fileExtension === 'md') {
            $content = addFrontMatterToMarkdown($content, $row, $con);
            
            // Convert Markdown image URLs if this note has attachments
            if (isset($noteAttachments[$noteId])) {
                $content = preg_replace_callback(
                    '#\!\[([^\]]*)\]\(/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)\)#',
                    function($matches) use ($noteAttachments, $noteId) {
                        $altText = $matches[1];
                        $attachmentId = $matches[2];
                        $extension = $noteAttachments[$noteId][$attachmentId] ?? '';
                        return '![' . $altText . '](attachments/' . $attachmentId . $extension . ')';
                    },
                    $content
                );
            }
        } else if ($fileExtension === 'html') {
            // Convert HTML image URLs if this note has attachments
            if (isset($noteAttachments[$noteId])) {
                $content = preg_replace_callback(
                    '#/api/v1/notes/' . preg_quote($noteId, '#') . '/attachments/([a-zA-Z0-9_]+)#',
                    function($matches) use ($noteAttachments, $noteId) {
                        $attachmentId = $matches[1];
                        $extension = $noteAttachments[$noteId][$attachmentId] ?? '';
                        return 'attachments/' . $attachmentId . $extension;
                    },
                    $content
                );
            }
        }
        
        $zip->addFromString($noteFileName, $content);
        
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

// Add empty .gitkeep files to empty subfolders to ensure they're preserved
foreach ($allFolders as $folder) {
    if (!in_array($folder['id'], $targetFolderIds) || $folder['id'] == $folder_id) {
        continue;
    }
    
    $zipPath = getFolderZipPath($folder['id'], $folderMap, $folder_id);
    if (!empty($zipPath) && !isset($createdFolders[$zipPath])) {
        $hasContent = false;
        foreach ($createdFolders as $path => $val) {
            if (strpos($path, $zipPath) === 0 && $path !== $zipPath) {
                $hasContent = true;
                break;
            }
        }
        
        if (!$hasContent) {
            $zip->addFromString($zipPath . '.gitkeep', '');
        }
    }
}

$zip->close();

ob_end_clean();

if (!file_exists($zipFileName)) {
    die('Export file could not be created - ZIP file not found');
}

if (filesize($zipFileName) == 0) {
    unlink($zipFileName);
    die('Export file could not be created - ZIP file is empty');
}

$safeFilename = sanitizeFilename($folder_name);

header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $safeFilename . '_export.zip"');
header('Content-Length: ' . filesize($zipFileName));
header('Cache-Control: no-cache, must-revalidate');
header('Expires: 0');

readfile($zipFileName);
unlink($zipFileName);
?>

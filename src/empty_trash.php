<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	include 'functions.php';
	require_once 'config.php';
	include 'db_connect.php';
    
    // Respect optional workspace parameter: only operate on that workspace if provided
    $workspace = $_POST['workspace'] ?? null;

    // Delete all files and attachments from trash entries (scoped by workspace when provided)
    if ($workspace) {
        $res_stmt = $con->prepare('SELECT id, attachments, type FROM entries WHERE trash = 1 AND (workspace = ? OR (workspace IS NULL AND ? = \'Poznote\'))');
        $res_stmt->execute([$workspace, $workspace]);
        $rows = $res_stmt->fetchAll(PDO::FETCH_ASSOC);
    } else {
        $res = $con->query('SELECT id, attachments, type FROM entries WHERE trash = 1');
        $rows = $res ? $res->fetchAll(PDO::FETCH_ASSOC) : [];
    }
    foreach($rows as $row) {
        // Delete file with appropriate extension
        $file_path = getEntryFilename($row["id"], $row["type"] ?? 'note');
        if(file_exists($file_path)) unlink($file_path);
        
        // Delete attachment files
        $attachments = $row['attachments'] ? json_decode($row['attachments'], true) : [];
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $attachmentFile = getAttachmentsRelativePath() . $attachment['filename'];
                    if (file_exists($attachmentFile)) {
                        unlink($attachmentFile);
                    }
                }
            }
        }
    }
    
    // Delete all trash entries from database (scoped by workspace when provided)
    if ($workspace) {
        $del_stmt = $con->prepare("DELETE FROM entries WHERE trash = 1 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $ok = $del_stmt->execute([$workspace, $workspace]);
        echo $ok ? 1 : $del_stmt->errorInfo()[2];
    } else {
        $del_stmt = $con->prepare("DELETE FROM entries WHERE trash = 1");
        echo $del_stmt->execute() ? 1 : $del_stmt->errorInfo()[2];
    }
?>

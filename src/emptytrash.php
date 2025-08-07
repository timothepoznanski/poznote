<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	include 'functions.php';
	require_once 'config.php';
	include 'db_connect.php';
    
    // Delete all files and attachments from trash entries
    $res = $con->query('SELECT id, attachments FROM entries WHERE trash = 1');
    while($row = mysqli_fetch_array($res, MYSQLI_ASSOC)) {
        // Delete HTML file
        $file_path = getEntriesRelativePath() . $row["id"] . ".html";
        if(file_exists($file_path)) unlink($file_path);
        
        // Delete attachment files
        $attachments = $row['attachments'] ? json_decode($row['attachments'], true) : [];
        if (is_array($attachments) && !empty($attachments)) {
            foreach ($attachments as $attachment) {
                if (isset($attachment['filename'])) {
                    $attachmentFile = 'attachments/' . $attachment['filename'];
                    if (file_exists($attachmentFile)) {
                        unlink($attachmentFile);
                    }
                }
            }
        }
    }
    
    // Delete all trash entries from database
	echo $con->query("DELETE FROM entries WHERE trash = 1") ? 1 : mysqli_error($con);
?>

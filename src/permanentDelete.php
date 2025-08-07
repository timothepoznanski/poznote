<?php
	require 'auth.php';
	requireAuth();
	
	include 'functions.php';
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	
	// Get note data before deletion to access attachments
	$stmt = $con->prepare("SELECT attachments FROM entries WHERE id = ?");
	$stmt->bind_param("i", $id);
	$stmt->execute();
	$result = $stmt->get_result();
	
	if ($result->num_rows > 0) {
		$row = $result->fetch_assoc();
		$attachments = $row['attachments'] ? json_decode($row['attachments'], true) : [];
		
		// Delete attachment files from filesystem
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
	
	// Delete HTML file
	$filename = getEntriesRelativePath() . $id . ".html";
	if (file_exists($filename)) unlink($filename);
	
	// Delete database entry
	echo $con->query("DELETE FROM entries WHERE id = $id") ? 1 : 'Database error occurred';
?>

<?php
	require 'auth.php';
	requireAuth();
	
	include 'functions.php';
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	
	// Get note data before deletion to access attachments
	$workspace = $_POST['workspace'] ?? null;

	if ($workspace) {
		$stmt = $con->prepare("SELECT attachments FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		$stmt->execute([$id, $workspace, $workspace]);
	} else {
		$stmt = $con->prepare("SELECT attachments FROM entries WHERE id = ?");
		$stmt->execute([$id]);
	}
	$result = $stmt->fetch(PDO::FETCH_ASSOC);
	
	if ($result) {
		$attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
		
		// Delete attachment files from filesystem
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
	
	// Delete HTML file
	$filename = getEntriesRelativePath() . $id . ".html";
	if (file_exists($filename)) unlink($filename);
	
	// Delete database entry (respect workspace if provided)
	if ($workspace) {
		$stmt = $con->prepare("DELETE FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		echo $stmt->execute([$id, $workspace, $workspace]) ? 1 : 'Database error occurred';
	} else {
		$stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
		echo $stmt->execute([$id]) ? 1 : 'Database error occurred';
	}
?>

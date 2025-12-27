<?php
	require 'auth.php';
	requireAuth();
	
	include 'functions.php';
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	
	// Get note data and check if it's protected
	$workspace = $_POST['workspace'] ?? null;

	// First check the heading to see if it's protected
	if ($workspace) {
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND workspace = ?");
		$checkStmt->execute([$id, $workspace]);
	} else {
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
		$checkStmt->execute([$id]);
	}
	$heading = $checkStmt->fetchColumn();

	// Get note data before deletion to access attachments and type

	if ($workspace) {
		$stmt = $con->prepare("SELECT attachments, type FROM entries WHERE id = ? AND workspace = ?");
		$stmt->execute([$id, $workspace]);
	} else {
		$stmt = $con->prepare("SELECT attachments, type FROM entries WHERE id = ?");
		$stmt->execute([$id]);
	}
	$result = $stmt->fetch(PDO::FETCH_ASSOC);
	
	if ($result) {
		$attachments = $result['attachments'] ? json_decode($result['attachments'], true) : [];
		$noteType = $result['type'] ?? 'note';
		
		// Delete attachment files from filesystem
		if (is_array($attachments) && !empty($attachments)) {
			foreach ($attachments as $attachment) {
				if (isset($attachment['filename'])) {
					$attachmentFile = getAttachmentsPath() . '/' . $attachment['filename'];
					if (file_exists($attachmentFile)) {
						unlink($attachmentFile);
					}
				}
			}
		}
	
		// Delete file with appropriate extension
		$filename = getEntryFilename($id, $noteType);
		if (file_exists($filename)) unlink($filename);
	}
	
	// Delete database entry (respect workspace if provided)
	if ($workspace) {
		$stmt = $con->prepare("DELETE FROM entries WHERE id = ? AND workspace = ?");
		echo $stmt->execute([$id, $workspace]) ? 1 : 'Database error occurred';
	} else {
		$stmt = $con->prepare("DELETE FROM entries WHERE id = ?");
		echo $stmt->execute([$id]) ? 1 : 'Database error occurred';
	}
?>

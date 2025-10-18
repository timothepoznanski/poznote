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
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		$checkStmt->execute([$id, $workspace, $workspace]);
	} else {
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
		$checkStmt->execute([$id]);
	}
	$heading = $checkStmt->fetchColumn();
	
	// Protection: Prevent deletion of the special "THINGS TO KNOW BEFORE TESTING" note
	if ($heading === 'THINGS TO KNOW BEFORE TESTING') {
		echo 'This note is protected and cannot be deleted';
		exit;
	}

	// Get note data before deletion to access attachments

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

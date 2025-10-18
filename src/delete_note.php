<?php
	require 'auth.php';
	requireAuth();
	
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	$workspace = $_POST['workspace'] ?? null;

	// Protection: Prevent deletion of the special "THINGS TO KNOW BEFORE TESTING" note
	// Check the note's heading first
	if ($workspace) {
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		$checkStmt->execute([$id, $workspace, $workspace]);
	} else {
		$checkStmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
		$checkStmt->execute([$id]);
	}
	$heading = $checkStmt->fetchColumn();
	
	if ($heading === 'THINGS TO KNOW BEFORE TESTING') {
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'This note is protected and cannot be deleted'
		]);
		exit;
	}

	if ($workspace) {
		$stmt = $con->prepare("UPDATE entries SET trash = 1 WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		$result = $stmt->execute([$id, $workspace, $workspace]);
	} else {
		$stmt = $con->prepare("UPDATE entries SET trash = 1 WHERE id = ?");
		$result = $stmt->execute([$id]);
	}
	if ($result) {
		echo '1';
	} else {
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'Database error: ' . $stmt->errorInfo()[2]
		]);
	}
?>
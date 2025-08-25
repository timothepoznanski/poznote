<?php
	require 'auth.php';
	requireAuth();
	
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	$workspace = $_POST['workspace'] ?? null;

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
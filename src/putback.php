<?php
	require 'auth.php';
	requireAuth();
	
	require_once 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	$workspace = $_POST['workspace'] ?? null;

	if ($workspace) {
		$stmt = $con->prepare("UPDATE entries SET trash = 0 WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
		echo $stmt->execute([$id, $workspace, $workspace]) ? 1 : 'Database error occurred';
	} else {
		$stmt = $con->prepare("UPDATE entries SET trash = 0 WHERE id = ?");
		echo $stmt->execute([$id]) ? 1 : 'Database error occurred';
	}
?>
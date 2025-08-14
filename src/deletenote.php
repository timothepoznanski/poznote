<?php
	require 'auth.php';
	requireAuth();
	
	require_once 'config.php';
	include 'db_connect.php';
	
	$stmt = $con->prepare("UPDATE entries SET trash = 1 WHERE id = ?");
	$result = $stmt->execute([$_POST['id']]);
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
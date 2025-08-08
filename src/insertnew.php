<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'db_connect.php';
	
	$now = $_POST['now'];
	$folder = $_POST['folder'] ?? 'Uncategorized';
	$created_date = date("Y-m-d H:i:s", (int)$now);
	
// Insert the new note
$query = "INSERT INTO entries (heading, entry, folder, created, updated) VALUES ('Untitled note', '', ?, '$created_date', '$created_date')";
$stmt = $con->prepare($query);
$stmt->bind_param("s", $folder);

if ($stmt->execute()) {
	$id = $con->insert_id;
	// Return both the heading and the id (for future-proofing)
	echo json_encode([
		'status' => 1,
		'heading' => 'Untitled note',
		'id' => $id
	]);
} else {
	echo json_encode([
		'status' => 0,
		'error' => 'Database error: ' . $con->error
	]);
}
?>

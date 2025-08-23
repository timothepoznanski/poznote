<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'functions.php';
	include 'db_connect.php';
	require_once 'default_folder_settings.php';
	
	$now = $_POST['now'];
	$folder = $_POST['folder'] ?? getDefaultFolderForNewNotes();
	$created_date = date("Y-m-d H:i:s", (int)$now);
	
	// Generate unique title for Untitled notes
	$uniqueTitle = generateUniqueTitle('Untitled note');
	
// Insert the new note
$query = "INSERT INTO entries (heading, entry, folder, created, updated) VALUES (?, '', ?, ?, ?)";
$stmt = $con->prepare($query);

if ($stmt->execute([$uniqueTitle, $folder, $created_date, $created_date])) {
	$id = $con->lastInsertId();
	// Return both the heading and the id (for future-proofing)
	echo json_encode([
		'status' => 1,
		'heading' => $uniqueTitle,
		'id' => $id
	]);
} else {
	echo json_encode([
		'status' => 0,
		'error' => 'Database error: ' . $stmt->errorInfo()[2]
	]);
}
?>

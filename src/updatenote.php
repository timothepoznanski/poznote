<?php
	require 'auth.php';
	requireAuth();

// ini_set('display_errors',1);
// ini_set('display_startup_errors',1);
// error_reporting(-1);
                       
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'functions.php';
	include 'db_connect.php';
	
	if (!isset($_POST['id'])) {
		die("No ID provided");
	}
	
	$id = $_POST['id'];
	$heading = trim($_POST['heading'] ?? '');
	$entry = $_POST['entry'] ?? ''; // Save the HTML content (including images) in an HTML file.
	$entrycontent = $_POST['entrycontent'] ?? ''; // Save the text content (without images) in the database.
	$folder = $_POST['folder'] ?? 'Uncategorized';
	
	$now = $_POST['now'];
	$seconds = (int)$now;
	
    $tags = str_replace(' ', ',', $_POST['tags'] ?? '');	
	
	$query = "SELECT * FROM entries WHERE id = ?";
	$stmt = $con->prepare($query);
	$stmt->execute([$id]);
	$row = $stmt->fetch(PDO::FETCH_ASSOC);
	
	if (!$row) {
		die('Note not found');
	}
	
    $filename = getEntriesRelativePath() . $id . ".html";
	
	// Write HTML content to file
	file_put_contents($filename, $entry);
    
	$updated_date = date("Y-m-d H:i:s", $seconds);
	
	$query = "UPDATE entries SET heading = ?, entry = ?, created = created, updated = ?, tags = ?, folder = ? WHERE id = ?";
	$stmt = $con->prepare($query);
    
	if($stmt->execute([$heading, $entrycontent, $updated_date, $tags, $folder, $id])) {
		die(formatDateTime(strtotime($updated_date))); // If writing the query in base is ok then we exit
	} else {
		// Return error details as JSON
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'Database error: ' . $stmt->errorInfo()[2],
			'query_error' => $stmt->errorInfo()[2]
		]);
		die();
	}
?>

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
	
	$query = "SELECT * FROM entries WHERE id = $id";
	$res = $con->query($query);
	$row = mysqli_fetch_array($res, MYSQLI_ASSOC);
	
	if (!$row) {
		die('Note not found');
	}
	
    $filename = getEntriesRelativePath() . $id . ".html";
	
	// Write HTML content to file
	file_put_contents($filename, $entry);
    
	$updated_date = date("Y-m-d H:i:s", $seconds);
	
	$query = "UPDATE entries SET heading = '" . mysqli_real_escape_string($con, $heading) . "', entry = '" . mysqli_real_escape_string($con, $entrycontent) . "', created = created, updated = '$updated_date', tags = '" . mysqli_real_escape_string($con, $tags) . "', folder = '" . mysqli_real_escape_string($con, $folder) . "' WHERE id = $id";
    
	if($con->query($query)) {
		die(formatDateTime(strtotime($updated_date))); // If writing the query in base is ok then we exit
	} else {
		// Return error details as JSON
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'Database error: ' . $con->error,
			'query_error' => mysqli_error($con)
		]);
		die();
	}
?>

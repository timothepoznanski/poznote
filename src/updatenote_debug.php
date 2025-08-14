<?php
	require 'auth.php';
	requireAuth();

// Activer l'affichage des erreurs pour le débogage
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
                       
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'functions.php';
	include 'db_connect.php';
	
	// Log de débogage
	error_log("=== DEBUG updatenote.php START ===");
	error_log("POST data: " . print_r($_POST, true));
	
	if (!isset($_POST['id'])) {
		error_log("ERROR: No ID provided");
		die("No ID provided");
	}
	
	$id = $_POST['id'];
	$heading = trim($_POST['heading'] ?? '');
	$entry = $_POST['entry'] ?? ''; // Save the HTML content (including images) in an HTML file.
	$entrycontent = $_POST['entrycontent'] ?? ''; // Save the text content (without images) in the database.
	$folder = $_POST['folder'] ?? 'Uncategorized';
	
	error_log("Note ID: $id");
	error_log("Heading: $heading");
	error_log("Entry length: " . strlen($entry));
	error_log("Entry content length: " . strlen($entrycontent));
	error_log("Folder: $folder");
	
	$now = $_POST['now'];
	$seconds = (int)$now;
	
    $tags = str_replace(' ', ',', $_POST['tags'] ?? '');	
	
	$query = "SELECT * FROM entries WHERE id = ?";
	$stmt = $con->prepare($query);
	$stmt->execute([$id]);
	$row = $stmt->fetch(PDO::FETCH_ASSOC);
	
	if (!$row) {
		error_log("ERROR: Note not found for ID: $id");
		die('Note not found');
	}
	
	error_log("Note found in database: " . print_r($row, true));
	
    $filename = getEntriesRelativePath() . $id . ".html";
    error_log("Target filename: $filename");
    error_log("Entries relative path: " . getEntriesRelativePath());
    
    // Vérifications avant écriture
    $dir = dirname($filename);
    error_log("Directory: $dir");
    error_log("Directory exists: " . (is_dir($dir) ? 'YES' : 'NO'));
    error_log("Directory readable: " . (is_readable($dir) ? 'YES' : 'NO'));
    error_log("Directory writable: " . (is_writable($dir) ? 'YES' : 'NO'));
    
    if (file_exists($filename)) {
        error_log("File already exists, size: " . filesize($filename) . " bytes");
        error_log("File writable: " . (is_writable($filename) ? 'YES' : 'NO'));
    }
	
	// Write HTML content to file with detailed error checking
	error_log("Attempting to write " . strlen($entry) . " bytes to $filename");
	$write_result = file_put_contents($filename, $entry);
	
	if ($write_result === false) {
		error_log("CRITICAL: Failed to write HTML file: $filename");
		error_log("Entry content length: " . strlen($entry));
		error_log("Directory exists: " . (is_dir(dirname($filename)) ? 'yes' : 'no'));
		error_log("Directory writable: " . (is_writable(dirname($filename)) ? 'yes' : 'no'));
		
		// Get detailed error
		$error = error_get_last();
		if ($error) {
			error_log("Last PHP error: " . print_r($error, true));
		}
		
		// Return error to client
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'Failed to save HTML content',
			'file_error' => 'Cannot write to file: ' . $filename,
			'debug' => [
				'filename' => $filename,
				'dir_exists' => is_dir(dirname($filename)),
				'dir_writable' => is_writable(dirname($filename)),
				'entry_length' => strlen($entry),
				'last_error' => $error
			]
		]);
		die();
	} else {
		error_log("SUCCESS: Wrote $write_result bytes to $filename");
		
		// Vérifier que le fichier a bien été écrit
		if (file_exists($filename)) {
			$actual_size = filesize($filename);
			error_log("File verification: exists, size = $actual_size bytes");
			
			// Vérifier le contenu
			$read_back = file_get_contents($filename);
			if ($read_back === $entry) {
				error_log("Content verification: SUCCESS - content matches");
			} else {
				error_log("Content verification: WARNING - content differs");
				error_log("Expected length: " . strlen($entry));
				error_log("Actual length: " . strlen($read_back));
			}
		} else {
			error_log("WARNING: File does not exist after write operation");
		}
	}
    
	$updated_date = date("Y-m-d H:i:s", $seconds);
	error_log("Updating database with date: $updated_date");
	
	$query = "UPDATE entries SET heading = ?, entry = ?, created = created, updated = ?, tags = ?, folder = ? WHERE id = ?";
	$stmt = $con->prepare($query);
    
	if($stmt->execute([$heading, $entrycontent, $updated_date, $tags, $folder, $id])) {
		error_log("Database update successful");
		error_log("=== DEBUG updatenote.php SUCCESS ===");
		die(formatDateTime(strtotime($updated_date))); // If writing the query in base is ok then we exit
	} else {
		error_log("Database update failed: " . print_r($stmt->errorInfo(), true));
		error_log("=== DEBUG updatenote.php DB ERROR ===");
		
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

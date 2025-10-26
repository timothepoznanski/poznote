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
	require_once 'default_folder_settings.php';
	
	if (!isset($_POST['id'])) {
		die("No ID provided");
	}
	
	$id = $_POST['id'];
	$originalHeading = trim($_POST['heading'] ?? '');
	$entry = $_POST['entry'] ?? ''; // Save the HTML content (including images) in an HTML file.
	$entrycontent = $_POST['entrycontent'] ?? ''; // Save the text content (without images) in the database.
	$workspace = $_POST['workspace'] ?? null; // optional
	$folder = $_POST['folder'] ?? getDefaultFolderForNewNotes($workspace);
	
	// Check if this is an Excalidraw note - in the new unified system, treat as regular HTML
	$isExcalidrawNote = false;
	$originalEntryContent = $entrycontent;
	
	// Clean Excalidraw JSON data from entrycontent if present
	// This happens when user edits text around Excalidraw diagrams
	if (strpos($entry, 'excalidraw-data') !== false) {
		// This note contains Excalidraw content
		// Remove any JSON data that may have leaked into entrycontent
		$cleaned_entrycontent = preg_replace('/\{"elements":\[.*?\]\}/', '', $entrycontent);
		$entrycontent = trim($cleaned_entrycontent);
	}
	
	// Enforce uniqueness: if another non-trashed note in the same workspace has the same heading, fail.
	// Allow the same heading if it belongs to this note (by id).
	$heading = $originalHeading;
	$checkQuery = "SELECT id FROM entries WHERE heading = ? AND trash = 0 AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
	$checkStmt = $con->prepare($checkQuery);
	$checkStmt->execute([$heading, $workspace ?? 'Poznote', $workspace ?? 'Poznote']);
	$conflictId = $checkStmt->fetchColumn();
	if ($conflictId !== false && $conflictId !== null && $conflictId != $id) {
		header('Content-Type: application/json');
		echo json_encode(['status' => 'error', 'message' => 'Another note with the same title exists in this workspace']);
		die();
	}
	
	$now = $_POST['now'];
	$seconds = (int)$now;
	
    $tags = str_replace(' ', ',', $_POST['tags'] ?? '');	
    
    // Validation des tags : supprimer les tags qui contiennent des espaces
    if (!empty($tags)) {
        $tagsArray = array_map('trim', explode(',', $tags));
        $validTags = [];
        foreach ($tagsArray as $tag) {
            if (!empty($tag)) {
                // Remplacer les espaces par des underscores si nécessaire
                $tag = str_replace(' ', '_', $tag);
                $validTags[] = $tag;
            }
        }
        $tags = implode(',', $validTags);
    }
	
	if ($workspace !== null) {
		$query = "SELECT * FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
		$stmt = $con->prepare($query);
		$stmt->execute([$id, $workspace, $workspace]);
	} else {
		$query = "SELECT * FROM entries WHERE id = ?";
		$stmt = $con->prepare($query);
		$stmt->execute([$id]);
	}
	$row = $stmt->fetch(PDO::FETCH_ASSOC);
	
	if (!$row) {
		die('Note not found');
	}
	
    $filename = getEntryFilename($id, $row['type'] ?? 'note');
	
	// Ensure the entries directory exists
	$entriesDir = dirname($filename);
	if (!is_dir($entriesDir)) {
		mkdir($entriesDir, 0755, true);
	}
	
	// Write HTML content to file with error checking
	$write_result = file_put_contents($filename, $entry);
	if ($write_result === false) {
		error_log("Failed to write HTML file: $filename");
		error_log("Entry content length: " . strlen($entry));
		error_log("Directory exists: " . (is_dir(dirname($filename)) ? 'yes' : 'no'));
		error_log("Directory writable: " . (is_writable(dirname($filename)) ? 'yes' : 'no'));
		
		// Return error to client
		header('Content-Type: application/json');
		echo json_encode([
			'status' => 'error',
			'message' => 'Failed to save HTML content',
			'file_error' => 'Cannot write to file: ' . $filename
		]);
		die();
	}
    
	$updated_date = date("Y-m-d H:i:s", $seconds);
	
	// If workspace provided, include it in update
	if ($workspace !== null) {
		$query = "UPDATE entries SET heading = ?, entry = ?, created = created, updated = ?, tags = ?, folder = ?, workspace = ? WHERE id = ?";
		$stmt = $con->prepare($query);
		$executeParams = [$heading, $entrycontent, $updated_date, $tags, $folder, $workspace, $id];
	} else {
		$query = "UPDATE entries SET heading = ?, entry = ?, created = created, updated = ?, tags = ?, folder = ? WHERE id = ?";
		$stmt = $con->prepare($query);
		$executeParams = [$heading, $entrycontent, $updated_date, $tags, $folder, $id];
	}
	
	if($stmt->execute($executeParams)) {
		// Return both date and title (in case it was modified to be unique)
		$response = [
			'date' => formatDateTime(strtotime($updated_date)),
			'title' => $heading,
			'original_title' => $originalHeading
		];
		
		// If title was changed to make it unique, return JSON
		if ($heading !== $originalHeading) {
			header('Content-Type: application/json');
			echo json_encode($response);
		} else {
			// Legacy format - just return the date
			echo $response['date'];
		}
		die();
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

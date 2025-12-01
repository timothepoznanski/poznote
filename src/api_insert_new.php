<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'functions.php';
	include 'db_connect.php';
	
	// Enable error reporting for debugging
	error_reporting(E_ALL);
	ini_set('display_errors', 0);
	ini_set('log_errors', 1);
	
	try {
		$now = $_POST['now'];
		$workspace = $_POST['workspace'] ?? 'Poznote';
		$folder_id = isset($_POST['folder_id']) ? intval($_POST['folder_id']) : null;
		// If folder_id is 0, treat it as null
		if ($folder_id === 0) {
			$folder_id = null;
		}
		$folder = $_POST['folder'] ?? null;
		$type = $_POST['type'] ?? 'note';
		
// Get current timestamp in UTC
$now = time();
$created_date = gmdate("Y-m-d H:i:s", $now);	// Validate workspace exists
	if (!empty($workspace)) {
		$wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
		$wsStmt->execute([$workspace]);
		if ($wsStmt->fetchColumn() == 0) {
			header('Content-Type: application/json; charset=utf-8');
			echo json_encode(['status' => 0, 'error' => 'Workspace not found']);
			exit;
		}
	}

	// Legacy behavior: folder_id and folder both remain null if not specified
	
	// If folder_id is provided, verify it exists and fetch the folder name
	if ($folder_id !== null && $folder_id > 0) {
		if ($workspace) {
			$fStmt = $con->prepare("SELECT name FROM folders WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
			$fStmt->execute([$folder_id, $workspace, $workspace]);
		} else {
			$fStmt = $con->prepare("SELECT name FROM folders WHERE id = ?");
			$fStmt->execute([$folder_id]);
		}
		$folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
		if ($folderData) {
			$folder = $folderData['name'];
		} else {
			// Folder ID provided but doesn't exist - reset to null to avoid FK constraint violation
			$folder_id = null;
			$folder = null;
		}
	} elseif ($folder !== null && $folder !== '') {
		// If folder name is provided, get folder_id
		if ($workspace) {
			$fStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
			$fStmt->execute([$folder, $workspace, $workspace]);
		} else {
			$fStmt = $con->prepare("SELECT id FROM folders WHERE name = ?");
			$fStmt->execute([$folder]);
		}
		$folderData = $fStmt->fetch(PDO::FETCH_ASSOC);
		if ($folderData) {
			$folder_id = (int)$folderData['id'];
    }
    // Note: If folder not found in folders table but folder name is set, 
    // folder_id will remain null (note without folder)
  }	// Generate unique title for new notes (folder-aware and workspace-aware)
	$uniqueTitle = generateUniqueTitle('New note', null, $workspace, $folder_id);

	// Insert the new note (include workspace, type, and folder_id)
	$query = "INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, created, updated) VALUES (?, '', ?, ?, ?, ?, ?, ?)";
	$stmt = $con->prepare($query);

	if ($stmt->execute([$uniqueTitle, $folder, $folder_id, $workspace, $type, $created_date, $created_date])) {
		$id = $con->lastInsertId();

		// Create the file for the note content with appropriate extension
		$filename = getEntryFilename($id, $type);
		
		// Ensure the entries directory exists
		$entriesDir = dirname($filename);
		if (!is_dir($entriesDir)) {
			mkdir($entriesDir, 0755, true);
		}
		
		// Write empty content to file (new notes start empty)
		$write_result = file_put_contents($filename, '');
		if ($write_result === false) {
			// Log error but don't fail since DB entry was successful
			error_log("Failed to write file for new note ID $id: $filename");
		}

		// Detect AJAX/Fetch requests (prefer JSON response) versus direct browser open
		$isAjax = false;
		if (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') {
			$isAjax = true;
		}
		if (!$isAjax && !empty($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
			$isAjax = true;
		}

		if ($isAjax) {
			// Return JSON for fetch/AJAX clients
			header('Content-Type: application/json; charset=utf-8');
			echo json_encode([
				'status' => 1,
				'heading' => $uniqueTitle,
				'id' => $id
			]);
		} else {
			// If opened directly in browser, redirect to the editor/view for the new note
			$redirectUrl = 'index.php?note=' . urlencode($id);
			header('Location: ' . $redirectUrl);
			exit;
		}
	} else {
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode([
			'status' => 0,
			'error' => 'Database error: ' . $stmt->errorInfo()[2]
		]);
	}
	
	} catch (Exception $e) {
		header('Content-Type: application/json; charset=utf-8');
		http_response_code(500);
		echo json_encode([
			'status' => 0,
			'error' => 'Server error: ' . $e->getMessage(),
			'file' => $e->getFile(),
			'line' => $e->getLine()
		]);
	}
?>

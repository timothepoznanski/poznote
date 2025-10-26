<?php
	require 'auth.php';
	requireAuth();
	
	date_default_timezone_set('UTC');
	require_once 'config.php';
	include 'functions.php';
	include 'db_connect.php';
	require_once 'default_folder_settings.php';
	
	$now = $_POST['now'];
	$workspace = $_POST['workspace'] ?? 'Poznote';
	$folder = $_POST['folder'] ?? getDefaultFolderForNewNotes($workspace);
	$type = $_POST['type'] ?? 'note';
	$created_date = date("Y-m-d H:i:s", (int)$now);

	// Validate workspace exists
	if (!empty($workspace)) {
		$wsStmt = $con->prepare("SELECT COUNT(*) FROM workspaces WHERE name = ?");
		$wsStmt->execute([$workspace]);
		if ($wsStmt->fetchColumn() == 0) {
			header('Content-Type: application/json; charset=utf-8');
			echo json_encode(['status' => 0, 'error' => 'Workspace not found']);
			exit;
		}
	}

	// Validate folder existence for non-default folders
	if (!isDefaultFolder($folder, $workspace)) {
		if ($workspace) {
			$fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
			$fStmt->execute([$folder, $workspace, $workspace]);
		} else {
			$fStmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
			$fStmt->execute([$folder]);
		}
		$folderExists = $fStmt->fetchColumn() > 0;
		if (!$folderExists) {
			// check if folder exists in entries table
			if ($workspace) {
				$eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
				$eStmt->execute([$folder, $workspace, $workspace]);
			} else {
				$eStmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
				$eStmt->execute([$folder]);
			}
			$folderExists = $eStmt->fetchColumn() > 0;
		}
		if (!$folderExists) {
			header('Content-Type: application/json; charset=utf-8');
			echo json_encode(['status' => 0, 'error' => 'Folder not found']);
			exit;
		}
	}
	
	// Generate unique title for new notes (workspace-aware)
	$uniqueTitle = generateUniqueTitle('New note', null, $workspace);

	// Insert the new note (include workspace and type)
	$query = "INSERT INTO entries (heading, entry, folder, workspace, type, created, updated) VALUES (?, '', ?, ?, ?, ?, ?)";
	$stmt = $con->prepare($query);

	if ($stmt->execute([$uniqueTitle, $folder, $workspace, $type, $created_date, $created_date])) {
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
?>

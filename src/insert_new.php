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
	$created_date = date("Y-m-d H:i:s", (int)$now);
	
	// Generate unique title for Untitled notes (workspace-aware)
	$uniqueTitle = generateUniqueTitle('Untitled note', null, $workspace);

	// Insert the new note (include workspace)
	$query = "INSERT INTO entries (heading, entry, folder, workspace, created, updated) VALUES (?, '', ?, ?, ?, ?)";
	$stmt = $con->prepare($query);

	if ($stmt->execute([$uniqueTitle, $folder, $workspace, $created_date, $created_date])) {
		$id = $con->lastInsertId();

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

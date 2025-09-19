<?php
require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

// Helper: convert plain-text URLs into safe HTML anchors
function linkify_html($text) {
	if ($text === null || $text === '') return '';
	// escape first to avoid XSS
	$escaped = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
	// Use # as regex delimiter to make quoting easier. Matches http(s)://... or www....
	$regex = '#\b(?:https?://|www\.)[^\s"\'<>]+#i';
	$result = preg_replace_callback($regex, function($m) {
		$url = $m[0];
		$href = preg_match('/^https?:/i', $url) ? $url : 'http://' . $url;
		$h = htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
		$label = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
		return '<a href="' . $h . '" target="_blank" rel="noopener noreferrer">' . $label . '</a>';
	}, $escaped);
	return $result;
}

$search = trim($_POST['search'] ?? $_GET['search'] ?? '');
$pageWorkspace = trim($_GET['workspace'] ?? $_POST['workspace'] ?? '');
?>
<!DOCTYPE html>
<html lang="fr">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
<title>Trash - Poznote</title>
	<link type="text/css" rel="stylesheet" href="css/index.css"/>
	<link type="text/css" rel="stylesheet" href="css/modal.css"/>
	<link rel="stylesheet" href="css/images.css" />
	<link type="text/css" rel="stylesheet" href="css/index-mobile.css"/>
	<link type="text/css" rel="stylesheet" href="css/trash.css"/>
	<link type="text/css" rel="stylesheet" href="css/trash-mobile.css"/>
</head>
<body class="trash-page">
	<div class="trash-container">
		<h2 class="trash-header">Trash</h2>
		
	<?php if (!empty($search)): ?>
			<div class="trash-search-notice">
				Results for "<?php echo htmlspecialchars($search); ?>"
		<span class="trash-clear-search" onclick="window.location='trash.php<?php echo $pageWorkspace ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>'">
					<i class="fas fa-times"></i>
				</span>
			</div>
		<?php endif; ?>
		
		<form action="trash.php" method="POST" class="trash-search-form">
			<input 
				type="text" 
				name="search" 
				id="searchInput"
				class="trash-search-input"
				placeholder="Search in trash..." 
				value="<?php echo htmlspecialchars($search); ?>"
				autocomplete="off"
			>
		</form>
		
		<div class="trash-buttons-container">
			<div class="trash-button trash-back-button" onclick="window.location = 'index.php<?php echo $pageWorkspace ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>';" title="Back to notes">
				<i class="fas fa-arrow-circle-left trash-button-icon"></i>
			</div>
			<div class="trash-button trash-empty-button" id="emptyTrashBtn" title="Empty trash">
				<i class="fa fa-trash-alt trash-button-icon"></i>
			</div>
		</div>
		
		<div class="trash-content">
		<?php
	// Build search condition supporting multiple terms (AND)
	$search_params = [];
	$search_condition = '';
	if ($search) {
		$terms = array_filter(array_map('trim', preg_split('/\s+/', $search)));
		if (count($terms) <= 1) {
			$search_condition = " AND (heading LIKE ? OR entry LIKE ?)";
			$search_params[] = "%{$search}%";
			$search_params[] = "%{$search}%";
		} else {
			$parts = [];
			foreach ($terms as $t) {
				$parts[] = "(heading LIKE ? OR entry LIKE ?)";
				$search_params[] = "%{$t}%";
				$search_params[] = "%{$t}%";
			}
			$search_condition = " AND (" . implode(" AND ", $parts) . ")";
		}
	}
	$workspace_condition = $pageWorkspace ? " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))" : '';
	$sql = "SELECT * FROM entries WHERE trash = 1" . $search_condition . $workspace_condition . " ORDER BY updated DESC LIMIT 50";

	// Execute with appropriate parameters order (search params first, then workspace if any)
	if (!empty($search_params)) {
		if ($pageWorkspace) {
			$stmt = $con->prepare($sql);
			$execute_params = array_merge($search_params, [$pageWorkspace, $pageWorkspace]);
			$stmt->execute($execute_params);
		} else {
			$stmt = $con->prepare($sql);
			$stmt->execute($search_params);
		}
	} else {
		if ($pageWorkspace) {
			$stmt = $con->prepare($sql);
			$stmt->execute([$pageWorkspace, $pageWorkspace]);
		} else {
			$stmt = $con->query($sql);
		}
	}
		
		if ($stmt) {
			while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
				$id = $row['id'];
				$filename = getEntriesRelativePath() . $id . ".html";
				$entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
				$heading = $row['heading'];
				$updated = formatDateTime(strtotime($row['updated']));
				
				// If this is a tasklist type, try to parse the stored JSON and render a readable task list
				$displayContent = $entryfinal;
				if (isset($row['type']) && $row['type'] === 'tasklist') {
					$decoded = json_decode($entryfinal, true);
					if (is_array($decoded)) {
						$tasksHtml = '<div class="task-list-container">';
						$tasksHtml .= '<div class="tasks-list">';
						foreach ($decoded as $task) {
							$text = isset($task['text']) ? linkify_html($task['text']) : '';
							$completed = !empty($task['completed']) ? ' completed' : '';
							$checked = !empty($task['completed']) ? ' checked' : '';
							$tasksHtml .= '<div class="task-item'.$completed.'">';
							$tasksHtml .= '<input type="checkbox" disabled'.$checked.' /> ';
							$tasksHtml .= '<span class="task-text">'.$text.'</span>';
							$tasksHtml .= '</div>';
						}
						$tasksHtml .= '</div></div>';
						$displayContent = $tasksHtml;
					} else {
						// If JSON parse fails, escape raw content
						$displayContent = htmlspecialchars($entryfinal, ENT_QUOTES);
					}
				} else {
					// non-tasklist: keep raw HTML content
					$displayContent = $entryfinal;
				}

				echo '<div id="note'.$id.'" class="trash-notecard">'
					.'<div class="trash-innernote">'
					.'<div class="trash-action-icons">'
					.'<i title="Restore this note" class="fa fa-trash-restore-alt icon_restore_trash" data-noteid="'.$id.'"></i>'
					.'<i title="Delete permanently" class="fas fa-trash icon_trash_trash" data-noteid="'.$id.'"></i>'
					.'</div>'
					.'<div class="lastupdated">Last modified on '.$updated.'</div>'
					.'<h3 class="css-title">'.htmlspecialchars($heading, ENT_QUOTES).'</h3>'
					.'<hr>'
					.'<div class="noteentry">'.$displayContent.'</div>'
					.'</div></div>';
			}
		} else {
			echo '<div class="trash-no-notes">No notes in trash.</div>';
		}
		?>
		</div>
	</div>
	
	<!-- Empty Trash Confirmation Modal -->
	<div id="emptyTrashConfirmModal" class="modal">
		<div class="modal-content">
			<h3>Empty Trash</h3>
			<p>Do you want to empty the trash completely? This action cannot be undone.</p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" onclick="closeEmptyTrashConfirmModal()">Cancel</button>
				<button type="button" class="btn-danger" onclick="executeEmptyTrash()">Empty Trash</button>
			</div>
		</div>
	</div>
	
	<!-- Information Modal -->
	<div id="infoModal" class="modal">
		<div class="modal-content">
			<h3 id="infoModalTitle">Information</h3>
			<p id="infoModalMessage"></p>
			<div class="modal-buttons">
				<button type="button" class="btn-primary" onclick="closeInfoModal()">Close</button>
			</div>
		</div>
	</div>
	
	<!-- Restore Confirmation Modal -->
	<div id="restoreConfirmModal" class="modal">
		<div class="modal-content">
			<h3>Restore Note</h3>
			<p>Do you want to restore this note?</p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" onclick="closeRestoreConfirmModal()">Cancel</button>
				<button type="button" class="btn-primary" onclick="executeRestoreNote()">Restore</button>
			</div>
		</div>
	</div>
	
	<!-- Delete Confirmation Modal -->
	<div id="deleteConfirmModal" class="modal">
		<div class="modal-content">
			<h3>Permanently Delete Note</h3>
			<p>Do you want to permanently delete this note? This action cannot be undone.</p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" onclick="closeDeleteConfirmModal()">Cancel</button>
				<button type="button" class="btn-danger" onclick="executePermanentDelete()">Delete Forever</button>
			</div>
		</div>
	</div>
	
	<!-- Modules refactorisés de script.js -->
	<script src="js/globals.js"></script>
	<script src="js/workspaces.js"></script>
	<script src="js/notes.js"></script>
	<script src="js/ui.js"></script>
	<script src="js/attachments.js"></script>
	<script src="js/events.js"></script>
	<script src="js/utils.js"></script>
	<script src="js/search-highlight.js"></script>
	<script src="js/toolbar.js"></script>
	<script src="js/main.js"></script>
	<script src="js/trash.js"></script>
	<script>
		var pageWorkspace = <?php echo $pageWorkspace ? json_encode($pageWorkspace) : 'undefined'; ?>;
	</script>
</body>
</html>

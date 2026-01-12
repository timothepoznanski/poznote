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
$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?> - <?php echo t_h('app.name'); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/trash.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="trash-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
	<div class="trash-container">
		<h2 class="trash-header"><?php echo t_h('notes_list.system_folders.trash', [], 'Trash'); ?></h2>
		
	<?php if (!empty($search)): ?>
			<div class="trash-search-notice">
				<?php echo t_h('trash.search.results_for', ['term' => htmlspecialchars($search, ENT_QUOTES)], 'Results for "{{term}}"'); ?>
		<span class="trash-clear-search">
					<i class="fa-times"></i>
				</span>
			</div>
		<?php endif; ?>
		
		<form action="trash.php" method="POST" class="trash-search-form">
			<input 
				type="text" 
				name="search" 
				id="searchInput"
				class="trash-search-input"
				placeholder="<?php echo t_h('trash.search.placeholder', [], 'Search in trash...'); ?>" 
				value="<?php echo htmlspecialchars($search); ?>"
				autocomplete="off"
			>
		</form>
		
		<div class="trash-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button class="btn btn-danger" id="emptyTrashBtn" title="<?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?>">
				<?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?>
			</button>
		</div>
		
		<div class="trash-content">
		<?php
	// Build search condition supporting multiple terms (AND) with accent-insensitive search
	$search_params = [];
	$search_condition = '';
	if ($search) {
		$terms = array_filter(array_map('trim', preg_split('/\s+/', $search)));
		if (count($terms) <= 1) {
			$search_condition = " AND (remove_accents(heading) LIKE remove_accents(?) OR remove_accents(entry) LIKE remove_accents(?))";
			$search_params[] = "%{$search}%";
			$search_params[] = "%{$search}%";
		} else {
			$parts = [];
			foreach ($terms as $t) {
				$parts[] = "(remove_accents(heading) LIKE remove_accents(?) OR remove_accents(entry) LIKE remove_accents(?))";
				$search_params[] = "%{$t}%";
				$search_params[] = "%{$t}%";
			}
			$search_condition = " AND (" . implode(" AND ", $parts) . ")";
		}
	}
	$workspace_condition = $pageWorkspace ? " AND workspace = ?" : '';
	$sql = "SELECT * FROM entries WHERE trash = 1" . $search_condition . $workspace_condition . " ORDER BY updated DESC LIMIT 50";

	// Execute with appropriate parameters order (search params first, then workspace if any)
	if (!empty($search_params)) {
		if ($pageWorkspace) {
			$stmt = $con->prepare($sql);
			$execute_params = array_merge($search_params, [$pageWorkspace]);
			$stmt->execute($execute_params);
		} else {
			$stmt = $con->prepare($sql);
			$stmt->execute($search_params);
		}
	} else {
		if ($pageWorkspace) {
			$stmt = $con->prepare($sql);
			$stmt->execute([$pageWorkspace]);
		} else {
			$stmt = $con->query($sql);
		}
	}
		
		if ($stmt) {
			while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
				$id = $row['id'];
				$filename = getEntryFilename($id, $row['type'] ?? 'note');
				$entryfinal = file_exists($filename) ? file_get_contents($filename) : '';
				$heading = $row['heading'];
				$updated = formatDateTime(strtotime($row['updated']));
				$lastModifiedLabel = t_h('trash.note.last_modified_on', ['date' => $updated], 'Last modified on {{date}}');
				
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
					// For all other note types (HTML, Markdown), use the HTML file content
					$displayContent = $entryfinal;
				}

				echo '<div id="note'.$id.'" class="trash-notecard">'
					.'<div class="trash-innernote">'
					.'<div class="trash-action-icons">'
					.'<i title="'.t_h('trash.actions.restore_note_tooltip', [], 'Restore this note').'" class="fa-trash-restore-alt" data-noteid="'.$id.'"></i>'
					.'<i title="'.t_h('trash.actions.delete_permanently_tooltip', [], 'Delete permanently').'" class="fa-trash" data-noteid="'.$id.'"></i>'
					.'</div>'
					.'<div class="lastupdated">'.$lastModifiedLabel.'</div>'
					.'<h3 class="css-title">'.htmlspecialchars($heading, ENT_QUOTES).'</h3>'
					.'<hr>'
					.'<div class="noteentry">'.$displayContent.'</div>'
					.'</div></div>';
			}
		} else {
			echo '<div class="trash-no-notes">' . t_h('trash.empty', [], 'No notes in trash.') . '</div>';
		}
		?>
		</div>
	</div>
	
	<!-- Empty Trash Confirmation Modal -->
	<div id="emptyTrashConfirmModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('trash.modals.empty.title', [], 'Empty Trash'); ?></h3>
			<p><?php echo t_h('trash.modals.empty.message', [], 'Do you want to empty the trash completely? This action cannot be undone.'); ?></p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-danger"><?php echo t_h('trash.actions.empty_trash', [], 'Empty trash'); ?></button>
			</div>
		</div>
	</div>
	
	<!-- Information Modal -->
	<div id="infoModal" class="modal">
		<div class="modal-content">
			<h3 id="infoModalTitle"><?php echo t_h('common.information'); ?></h3>
			<p id="infoModalMessage"></p>
			<div class="modal-buttons">
				<button type="button" class="btn-primary"><?php echo t_h('common.close'); ?></button>
			</div>
		</div>
	</div>
	
	<!-- Restore Confirmation Modal -->
	<div id="restoreConfirmModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('trash.modals.restore.title', [], 'Restore Note'); ?></h3>
			<p><?php echo t_h('trash.modals.restore.message', [], 'Do you want to restore this note?'); ?></p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-primary"><?php echo t_h('trash.actions.restore', [], 'Restore'); ?></button>
			</div>
		</div>
	</div>
	
	<!-- Delete Confirmation Modal -->
	<div id="deleteConfirmModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('trash.modals.delete.title', [], 'Permanently Delete Note'); ?></h3>
			<p><?php echo t_h('trash.modals.delete.message', [], 'Do you want to permanently delete this note? This action cannot be undone.'); ?></p>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-danger"><?php echo t_h('trash.actions.delete_forever', [], 'Delete Forever'); ?></button>
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
	<script src="js/checklist.js?v=<?php echo $v; ?>"></script>
	<script src="js/bulletlist.js?v=<?php echo $v; ?>"></script>
	<script src="js/main.js"></script>
	<script src="js/navigation.js"></script>
	<script src="js/trash.js"></script>
</body>
</html>

<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Respect optional workspace parameter
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

// Build query to get folders with kanban enabled
$select_query = "SELECT f.id, f.name, f.icon, f.icon_color, 
                 (SELECT COUNT(*) FROM entries e WHERE e.folder_id = f.id AND e.trash = 0) as note_count
                 FROM folders f
                 WHERE f.kanban_enabled = 1";

$search_params = [];

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " AND f.workspace = ?";
	$search_params[] = $workspace;
}

$select_query .= " ORDER BY f.name";

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$kanban_folders = [];
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$kanban_folders[] = $row;
}

$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<?php
	require_once 'users/db_master.php';
	$login_display_name = getGlobalSetting('login_display_name', '');
	$pageTitle = ($login_display_name && trim($login_display_name) !== '') ? htmlspecialchars($login_display_name) : t_h('app.name');
	?>
	<title><?php echo $pageTitle; ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/solid.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/regular.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<style>
		.kanban-board-item {
			cursor: pointer;
			transition: background-color 0.2s;
		}
		.kanban-board-item:hover {
			background-color: var(--bg-hover) !important;
		}
		.kanban-board-item:hover .shared-folder-icon i {
			color: #ef4444 !important;
		}
		.shared-folder-icon i {
			transition: color 0.15s ease;
		}
	</style>
	<script src="js/theme-manager.js"></script>
</head>
<body class="shared-page" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
		</div>
		
		<h1 class="shared-header"><?php echo t_h('home.kanban_boards', [], 'Kanban Boards'); ?></h1>

		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput"
					class="filter-input"
					placeholder="<?php echo t_h('kanban.list.filter_placeholder', [], 'Filter by board name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="shared-content">
			<div id="kanbanBoardsList" class="shared-notes-list">
			<?php
			if (empty($kanban_folders)) {
				echo '<div class="empty-message">';
				echo '<p>' . t_h('kanban.list.no_boards', [], 'No Kanban boards yet.') . '</p>';
				echo '<p class="empty-hint">' . t_h('kanban.list.hint', [], 'Enable Kanban view on a folder to see it here.') . '</p>';
				echo '</div>';
			} else {
			foreach($kanban_folders as $folder) {
				$folder_id = htmlspecialchars($folder['id'], ENT_QUOTES);
				$folder_name = htmlspecialchars($folder['name'], ENT_QUOTES);
				$folder_icon = !empty($folder['icon']) ? htmlspecialchars($folder['icon'], ENT_QUOTES) : 'fa-folder';
				$icon_color = !empty($folder['icon_color']) ? htmlspecialchars($folder['icon_color'], ENT_QUOTES) : '';
				$note_count = (int)$folder['note_count'];
				
				$kanban_url = 'index.php?kanban=' . $folder_id . '&workspace=' . urlencode($workspace);
				
				echo '<div class="shared-note-item kanban-board-item" onclick="window.location.href=\'' . $kanban_url . '\'" data-folder-name="' . $folder_name . '" style="cursor: pointer; padding: 15px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">';
				
				echo '<div class="note-name-container" style="display: flex; align-items: center; gap: 12px; flex: 1;">';
				$icon_style = $icon_color ? 'style="color: ' . $icon_color . ' !important;"' : '';
				echo '<div class="shared-folder-icon" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--icon-bg, rgba(0, 123, 255, 0.1)); border-radius: 8px;">';
				echo '<i class="fas ' . $folder_icon . '" ' . $icon_style . '></i>';
				echo '</div>';
				echo '<span class="folder-name-text" style="font-weight: 500; font-size: 16px;">' . $folder_name . ' <span style="font-size: 14px; color: var(--text-muted); font-weight: 400;">(' . $note_count . ')</span></span>';
				echo '</div>';
				
				echo '<div class="note-actions">';
				echo '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); window.location.href=\'' . $kanban_url . '\'"><i class="fa-external-link"></i></button>';
				echo '</div>';
				
				echo '</div>';
				}
			}
			?>
			</div>
		</div>
	</div>
	
	<script src="js/globals.js"></script>
	<script src="js/navigation.js"></script>
	<script>
		document.addEventListener('DOMContentLoaded', function() {
			const filterInput = document.getElementById('filterInput');
			const clearFilterBtn = document.getElementById('clearFilterBtn');
			const boardItems = document.querySelectorAll('.kanban-board-item');
			const filterStats = document.getElementById('filterStats');

			if (filterInput) {
				filterInput.addEventListener('input', function() {
					const query = this.value.toLowerCase().trim();
					let visibleCount = 0;

					boardItems.forEach(item => {
						const name = item.getAttribute('data-folder-name').toLowerCase();
						if (name.includes(query)) {
							item.style.display = 'flex';
							visibleCount++;
						} else {
							item.style.display = 'none';
						}
					});

					if (query.length > 0) {
						clearFilterBtn.classList.remove('initially-hidden');
						filterStats.classList.remove('initially-hidden');
						filterStats.textContent = visibleCount + ' ' + (visibleCount > 1 ? 'boards' : 'board');
					} else {
						clearFilterBtn.classList.add('initially-hidden');
						filterStats.classList.add('initially-hidden');
					}
				});
			}

			if (clearFilterBtn) {
				clearFilterBtn.addEventListener('click', function() {
					filterInput.value = '';
					filterInput.dispatchEvent(new Event('input'));
					filterInput.focus();
				});
			}

			// Back buttons
			const backToNotesBtn = document.getElementById('backToNotesBtn');
			if (backToNotesBtn) {
				backToNotesBtn.addEventListener('click', function() {
					const workspace = document.body.getAttribute('data-workspace');
					window.location.href = 'index.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
				});
			}

			const backToHomeBtn = document.getElementById('backToHomeBtn');
			if (backToHomeBtn) {
				backToHomeBtn.addEventListener('click', function() {
					const workspace = document.body.getAttribute('data-workspace');
					window.location.href = 'home.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
				});
			}
		});
	</script>
</body>
</html>

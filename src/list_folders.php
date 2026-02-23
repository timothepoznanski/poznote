<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// Respect optional workspace parameter
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

// Build query to get all folders
$select_query = "SELECT f.id, f.name, f.icon, f.icon_color, 
                 (SELECT COUNT(*) FROM entries e WHERE e.folder_id = f.id AND e.trash = 0) as note_count
                 FROM folders f";

$search_params = [];

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " WHERE f.workspace = ?";
	$search_params[] = $workspace;
}

$select_query .= " ORDER BY f.name";

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$folders = [];
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$folders[] = $row;
}

$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/attachments.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/link-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/share-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/notes-list.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/buttons-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/folders-grid.css"/>
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/dark-mode.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/markdown.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/kanban.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css"/>
	<style>
		.folder-item {
			cursor: pointer;
			transition: background-color 0.2s;
		}
		.folder-item:hover {
			background-color: var(--bg-hover) !important;
		}
		.folder-item:hover .shared-folder-icon i {
			color: #ef4444 !important;
		}
		.shared-folder-icon i {
			transition: color 0.15s ease;
		}
		
		/* Mobile simplification: list style instead of cards */
		@media (max-width: 768px) {
			.folder-item {
				padding: 12px 15px !important;
				box-shadow: none !important;
				border-radius: 0 !important;
				border: none !important;
				border-bottom: 1px solid var(--border-color, #e0e0e0) !important;
				margin-bottom: 0 !important;
			}
			.shared-folder-icon {
				width: 32px !important;
				height: 32px !important;
			}
			.folder-name-text {
				font-size: 14px !important;
			}
			.note-actions {
				display: none !important;
			}
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
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput"
					class="filter-input"
					placeholder="<?php echo t_h('folders.filter_placeholder', [], 'Filter by folder name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="shared-content">
			<div id="foldersList" class="shared-notes-list">
			<?php
			if (empty($folders)) {
				echo '<div class="empty-message">';
				echo '<p>' . t_h('folders.no_folders', [], 'No folders yet.') . '</p>';
				echo '</div>';
			} else {
			foreach($folders as $folder) {
				$folder_id = htmlspecialchars($folder['id'], ENT_QUOTES);
				$folder_name = htmlspecialchars($folder['name'], ENT_QUOTES);
				$folder_icon = !empty($folder['icon']) ? htmlspecialchars($folder['icon'], ENT_QUOTES) : 'lucide-folder';
				$icon_color = !empty($folder['icon_color']) ? htmlspecialchars($folder['icon_color'], ENT_QUOTES) : '';
				$note_count = (int)$folder['note_count'];
				
				$kanban_url = 'index.php?kanban=' . $folder_id . '&workspace=' . urlencode($workspace);
				
				echo '<div class="shared-note-item folder-item" onclick="window.location.href=\'' . $kanban_url . '\'" data-folder-name="' . $folder_name . '" style="cursor: pointer; padding: 15px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">';
				
				echo '<div class="note-name-container" style="display: flex; align-items: center; gap: 12px; flex: 1;">';
				$icon_style = $icon_color ? 'style="color: ' . $icon_color . ' !important;"' : '';
				echo '<div class="shared-folder-icon" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--icon-bg, rgba(0, 123, 255, 0.1)); border-radius: 8px;">';
				echo '<i class="' . $folder_icon . '" ' . $icon_style . '></i>';
				echo '</div>';
				echo '<span class="folder-name-text" style="font-weight: 500; font-size: 16px;">' . $folder_name . ' <span style="font-size: 14px; color: var(--text-muted); font-weight: 400;">(' . $note_count . ')</span></span>';
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
	<script src="js/list_folders.js"></script>
</body>
</html>

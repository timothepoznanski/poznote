<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// Respect optional workspace parameter
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

// Build query to get shared folders with folder information and note count
$select_query = "SELECT sf.id, sf.folder_id, sf.token, sf.created, sf.indexable, sf.password, 
                 f.name as folder_name, f.icon as folder_icon,
                 (SELECT COUNT(*) FROM entries e WHERE e.folder_id = sf.folder_id AND e.trash = 0) as note_count
                 FROM shared_folders sf
                 INNER JOIN folders f ON sf.folder_id = f.id";

$search_params = [];

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " WHERE f.workspace = ?";
	$search_params[] = $workspace;
}

$select_query .= " ORDER BY f.name";

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$shared_folders = [];
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$shared_folders[] = $row;
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
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
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
	<link type="text/css" rel="stylesheet" href="css/shared/fontawesome.css"/>
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
	<script src="js/theme-manager.js"></script>
</head>
<body class="shared-page" 
      data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-edit-token="<?php echo t_h('public.edit_token', [], 'Click to edit token'); ?>"
      data-txt-token-update-failed="<?php echo t_h('public.token_update_failed', [], 'Failed to update token'); ?>"
      data-txt-indexable="<?php echo t_h('public.indexable', [], 'Indexable'); ?>"
      data-txt-password-protected="<?php echo t_h('public.password_protected', [], 'Password protected'); ?>"
      data-txt-add-password-title="<?php echo t_h('public.add_password_title', [], 'Add password protection'); ?>"
      data-txt-change-password-title="<?php echo t_h('public.change_password_title', [], 'Change Password'); ?>"
      data-txt-password-remove-hint="<?php echo t_h('public.password_remove_hint', [], 'Leave empty to remove password protection.'); ?>"
      data-txt-enter-new-password="<?php echo t_h('public.enter_new_password', [], 'Enter new password'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-txt-save="<?php echo t_h('common.save', [], 'Save'); ?>"
      data-txt-confirm-revoke="<?php echo t_h('shared_folders.confirm_revoke', [], 'Are you sure you want to revoke sharing for this folder? All notes in this folder will also be unshared.'); ?>">
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
			<button id="publicNotesBtn" class="btn btn-shared" title="<?php echo t_h('public.view_public_notes', [], 'View shared notes'); ?>">
				<?php echo t_h('public.button', [], 'Shared Notes'); ?>
			</button>
		</div>
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput"
					class="filter-input"
					placeholder="<?php echo t_h('shared_folders.filter_placeholder', [], 'Filter by folder name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="shared-content">
			<div id="sharedFoldersList" class="shared-notes-list">
			<?php
			if (empty($shared_folders)) {
				echo '<div class="empty-message">';
				echo '<p>' . t_h('shared_folders.page.no_shared_folders', [], 'No shared folders yet.') . '</p>';
				echo '<p class="empty-hint">' . t_h('shared_folders.page.shared_folders_hint', [], 'Share a folder by clicking the cloud button in the folder toolbar.') . '</p>';
				echo '</div>';
			} else {
			foreach($shared_folders as $folder) {
				$folder_id = htmlspecialchars($folder['folder_id'], ENT_QUOTES);
				$folder_name = htmlspecialchars($folder['folder_name'], ENT_QUOTES);
				$folder_icon = !empty($folder['folder_icon']) ? htmlspecialchars($folder['folder_icon'], ENT_QUOTES) : 'fa-folder';
				$token = htmlspecialchars($folder['token'], ENT_QUOTES);
				$has_password = !empty($folder['password']);
				$indexable = (int)$folder['indexable'] === 1;
				$note_count = (int)$folder['note_count'];
				
				// Build public URL
				$base_url = getBaseUrl();
				$public_url = $base_url . '/folder/' . urlencode($folder['token']);
				
				echo '<div class="shared-note-item shared-folder-row" data-folder-id="' . $folder_id . '" data-folder-name="' . $folder_name . '" data-has-password="' . ($has_password ? '1' : '0') . '">';
				
				// Folder name container
				echo '<div class="note-name-container">';
				echo '<span class="folder-name-text">' . $folder_name . ' (' . $note_count . ')</span>';
				echo '</div>';
				
				// Token (editable like note-token)
				echo '<span class="note-token folder-token" contenteditable="true" data-folder-id="' . $folder_id . '" data-original-token="' . $token . '" title="' . t_h('public.edit_token', [], 'Click to edit token') . '">' . $token . '</span>';
				
				// Indexable toggle (like note-indexable)
				echo '<div class="note-indexable">';
				echo '<label class="indexable-toggle-label">';
				echo '<span class="indexable-label-text">' . t_h('public.indexable', [], 'Indexable') . '</span>';
				echo '<label class="toggle-switch">';
				echo '<input type="checkbox" class="indexable-checkbox" data-folder-id="' . $folder_id . '"' . ($indexable ? ' checked' : '') . '>';
				echo '<span class="toggle-slider"></span>';
				echo '</label>';
				echo '</label>';
				echo '</div>';
				
				// Actions (like note-actions)
				echo '<div class="note-actions">';
				
				// Password button
				if ($has_password) {
					echo '<button class="btn btn-sm btn-password" data-folder-id="' . $folder_id . '" data-has-password="1" title="' . t_h('public.password_protected', [], 'Password protected') . '"><i class="fa-lock"></i></button>';
				} else {
					echo '<button class="btn btn-sm btn-password" data-folder-id="' . $folder_id . '" data-has-password="0" title="' . t_h('public.add_password_title', [], 'Add password protection') . '"><i class="fa-lock-open"></i></button>';
				}
				
				// Open button
				echo '<button class="btn btn-sm btn-secondary btn-open" data-url="' . htmlspecialchars($public_url, ENT_QUOTES) . '" title="' . t_h('public.actions.open', [], 'Open public view') . '"><i class="fa-external-link"></i></button>';
				
				// Revoke button
				echo '<button class="btn btn-sm btn-danger btn-revoke" data-folder-id="' . $folder_id . '" title="' . t_h('public.actions.revoke', [], 'Revoke') . '"><i class="fa-ban"></i></button>';
				
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
	<script src="js/list_shared_folders.js"></script>
</body>
</html>

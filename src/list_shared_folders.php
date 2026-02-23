<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

// Respect optional workspace parameter
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

// Get all folders (filtered by workspace if needed)
$query = "SELECT id, name, parent_id, workspace, icon FROM folders";
$params = [];
if (!empty($workspace)) {
	$query .= " WHERE workspace = ?";
	$params[] = $workspace;
}
$stmt = $con->prepare($query);
$stmt->execute($params);
$allFolders = [];
while ($f = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$allFolders[$f['id']] = $f;
}

// Get all entries in shared_folders
$stmt = $con->query("SELECT * FROM shared_folders");
$sharedEntries = [];
while ($se = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$sharedEntries[$se['folder_id']] = $se;
}

// For each folder, check if it's shared directly or via ancestor
$shared_folders = [];
foreach ($allFolders as $fid => $f) {
	$directEntry = $sharedEntries[$fid] ?? null;
	$viaEntry = null;
	
	// Check ancestors
	$curr = $f;
	$maxDepth = 20;
	$depth = 0;
	while ($curr['parent_id'] !== null && $depth < $maxDepth) {
		$parentId = $curr['parent_id'];
		if (isset($sharedEntries[$parentId])) {
			$viaEntry = $sharedEntries[$parentId];
			break;
		}
		if (!isset($allFolders[$parentId])) {
			// Parent might be in another workspace or not loaded? 
			// Attempt to fetch it if not in allFolders
			$stmtP = $con->prepare("SELECT id, name, parent_id, workspace, icon FROM folders WHERE id = ?");
			$stmtP->execute([$parentId]);
			$pCell = $stmtP->fetch(PDO::FETCH_ASSOC);
			if ($pCell) {
				if (isset($sharedEntries[$pCell['id']])) {
					$viaEntry = $sharedEntries[$pCell['id']];
					break;
				}
				$curr = $pCell;
			} else {
				break;
			}
		} else {
			$curr = $allFolders[$parentId];
		}
		$depth++;
	}
	
	if ($directEntry || $viaEntry) {
		$entry = $directEntry ?: $viaEntry;
		// Count notes in THIS folder
		$stmtNote = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder_id = ? AND trash = 0");
		$stmtNote->execute([$fid]);
		$noteCount = $stmtNote->fetchColumn();
		
		$shared_folders[] = [
			'id' => $directEntry ? $directEntry['id'] : null,
			'folder_id' => $fid,
			'token' => $entry['token'],
			'created' => $entry['created'],
			'indexable' => $entry['indexable'],
			'password' => $entry['password'],
			'folder_name' => $f['name'],
			'folder_icon' => $f['icon'],
			'note_count' => $noteCount,
			'is_direct' => (bool)$directEntry,
			'shared_via_name' => $viaEntry ? ($allFolders[$viaEntry['folder_id']]['name'] ?? 'Parent') : null,
			'folder_path' => getFolderPath($fid, $con)
		];
	}
}

// Sort by path
usort($shared_folders, function($a, $b) {
	return strcasecmp($a['folder_path'], $b['folder_path']);
});

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
					<i class="lucide lucide-x"></i>
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
				$folder_id = htmlspecialchars($folder['folder_id'] ?? '', ENT_QUOTES);
				$folder_name = htmlspecialchars($folder['folder_name'] ?? '', ENT_QUOTES);
				$folder_path = htmlspecialchars($folder['folder_path'] ?? '', ENT_QUOTES);
				$folder_icon_raw = !empty($folder['folder_icon']) ? $folder['folder_icon'] : null;
				$folder_icon = $folder_icon_raw ? htmlspecialchars(convertFontAwesomeToLucide($folder_icon_raw), ENT_QUOTES) : 'lucide-folder';
				$token = htmlspecialchars($folder['token'] ?? '', ENT_QUOTES);
				$has_password = !empty($folder['password']);
				$indexable = (int)$folder['indexable'] === 1;
				$note_count = (int)$folder['note_count'];
				$is_direct = $folder['is_direct'] ?? false;
				$shared_via_name = htmlspecialchars($folder['shared_via_name'] ?? '', ENT_QUOTES);
				
				// Build public URL
				// Use relative URL to avoid issues with incorrect base URL detection behind proxies
				$public_url = '/folder/' . urlencode($folder['token']);
				
				$rowClass = 'shared-note-item shared-folder-row';
				if (!$is_direct) $rowClass .= ' shared-via-parent';

				echo '<div class="' . $rowClass . '" data-folder-id="' . $folder_id . '" data-folder-name="' . $folder_name . '" data-has-password="' . ($has_password ? '1' : '0') . '">';
				
				// Folder name container
				echo '<div class="note-name-container">';
				echo '<span class="folder-name-path" title="' . $folder_path . '"><i class="lucide lucide-folder"></i> ' . $folder_path . ' (' . $note_count . ')</span>';
				echo '</div>';
				
				// Token (editable if direct)
				echo '<span class="note-token folder-token' . ($is_direct ? '' : ' read-only') . '" ' . ($is_direct ? 'contenteditable="true"' : '') . ' data-folder-id="' . $folder_id . '" data-original-token="' . $token . '" title="' . ($is_direct ? t_h('public.edit_token', [], 'Click to edit token') : '') . '">' . $token . '</span>';
				
				// Actions (like note-actions)
				echo '<div class="note-actions">';
				
				// Password button
				if ($is_direct) {
					if ($has_password) {
						echo '<button class="btn btn-sm btn-password" data-folder-id="' . $folder_id . '" data-has-password="1" title="' . t_h('public.password_protected', [], 'Password protected') . '"><i class="lucide lucide-lock"></i></button>';
					} else {
						echo '<button class="btn btn-sm btn-password" data-folder-id="' . $folder_id . '" data-has-password="0" title="' . t_h('public.add_password_title', [], 'Add password protection') . '"><i class="lucide lucide-lock-open"></i></button>';
					}
				}
				
				// Open button
				echo '<button class="btn btn-sm btn-secondary btn-open" data-url="' . htmlspecialchars($public_url, ENT_QUOTES) . '" title="' . t_h('public.actions.open', [], 'Open public view') . '"><i class="lucide lucide-external-link"></i></button>';
				
				// Revoke button
				if ($is_direct) {
					echo '<button class="btn btn-sm btn-danger btn-revoke" data-folder-id="' . $folder_id . '" title="' . t_h('public.actions.revoke', [], 'Revoke') . '"><i class="lucide lucide-ban"></i></button>';
				}
				
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

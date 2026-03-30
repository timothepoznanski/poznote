<?php
/**
 * Unified Shares page - Shows both shared notes and shared folders
 * with a filter bar to search and toggle between notes/folders/all.
 */
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// ── Fetch shared folders server-side for the unified shares page ──
$workspace = $pageWorkspace;

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

$stmt = $con->query("SELECT * FROM shared_folders");
$sharedEntries = [];
while ($se = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$sharedEntries[$se['folder_id']] = $se;
}

$shared_folders = [];
foreach ($allFolders as $fid => $f) {
	$directEntry = $sharedEntries[$fid] ?? null;
	$viaEntry = null;

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
		$stmtNote = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder_id = ? AND trash = 0");
		$stmtNote->execute([$fid]);
		$noteCount = $stmtNote->fetchColumn();

		$shared_folders[] = [
			'id'              => $directEntry ? $directEntry['id'] : null,
			'folder_id'       => $fid,
			'parent_id'       => $f['parent_id'] !== null ? (int)$f['parent_id'] : null,
			'token'           => $entry['token'],
			'created'         => $entry['created'],
			'indexable'       => $entry['indexable'],
			'password'        => !empty($entry['password']),
			'allowed_users'   => !empty($entry['allowed_users']) ? json_decode($entry['allowed_users'], true) : null,
			'folder_name'     => $f['name'],
			'note_count'      => (int)$noteCount,
			'is_direct'       => (bool)$directEntry,
			'folder_path'     => getFolderPath($fid, $con),
			'public_url'      => '/folder/' . urlencode($entry['token']),
		];
	}
}

usort($shared_folders, function($a, $b) {
	return strcasecmp($a['folder_path'], $b['folder_path']);
});
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
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-current-user-id="<?php echo (int)$_SESSION['user_id']; ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
	data-txt-edit-token="<?php echo t_h('index.public_modal.manage', [], 'Edit'); ?>"
      data-txt-token-update-failed="<?php echo t_h('public.token_update_failed', [], 'Failed to update token'); ?>"
	data-txt-custom-token="<?php echo t_h('public.table.token', [], 'Token'); ?>"
	data-txt-custom-token-placeholder="<?php echo t_h('index.public_modal.custom_token_placeholder', [], 'my_custom_token-1'); ?>"
	data-txt-use-https="<?php echo t_h('index.folder_share_modal.use_https', [], 'HTTPS'); ?>"
	data-txt-search-indexable="<?php echo t_h('index.public_modal.indexable', [], 'Allow indexing by search engines'); ?>"
	data-txt-search-indexable-mobile="<?php echo t_h('index.public_modal.indexable_mobile', [], 'Allow indexing'); ?>"
	data-txt-password-label="<?php echo t_h('index.public_modal.password', [], 'Password (optional)'); ?>"
      data-txt-password-placeholder="<?php echo t_h('index.public_modal.password_placeholder', [], 'Enter a password'); ?>"
	data-txt-show-password="<?php echo t_h('login.show_password', [], 'Show password'); ?>"
	data-txt-hide-password="<?php echo t_h('login.hide_password', [], 'Hide password'); ?>"
      data-txt-network-error="<?php echo t_h('common.network_error', [], 'Network error'); ?>"
	data-txt-renew="<?php echo t_h('index.public_modal.renew_token', [], 'Renew token'); ?>"
      data-txt-open="<?php echo t_h('public.actions.open', [], 'Open public view'); ?>"
      data-txt-revoke="<?php echo t_h('public.actions.revoke', [], 'Revoke'); ?>"
	data-txt-task-permissions="<?php echo t_h('index.task_permissions.title', [], 'Permissions'); ?>"
	data-txt-task-read-only="<?php echo t_h('index.task_permissions.read_only', [], 'Read only'); ?>"
	data-txt-task-check-only="<?php echo t_h('index.task_permissions.check_only', [], 'Check or uncheck only'); ?>"
	data-txt-task-full="<?php echo t_h('index.task_permissions.full', [], 'Full edit'); ?>"
	data-txt-note-shared-through-folder="<?php echo t_h('public.note_shared_through_folder', [], 'Note shared through folder'); ?>"
	data-txt-folder-shared-through-parent="<?php echo t_h('public.folder_shared_through_parent', [], 'Folder shared through parent folder'); ?>"
      data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
	data-txt-table-name="<?php echo t_h('public.table.name', [], 'Name'); ?>"
	data-txt-table-folder="<?php echo t_h('public.table.path', [], 'Path'); ?>"
	data-txt-table-token="<?php echo t_h('public.table.token', [], 'Token'); ?>"
	data-txt-token-help="<?php echo t_h('public.token_help', [], 'The token is the unique identifier used in a public share URL. Example: https://your-domain.example/public_note.php?token=my-note-share'); ?>"
	data-txt-table-actions="<?php echo t_h('public.table.actions', [], 'Actions'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-txt-save="<?php echo t_h('common.save', [], 'Save'); ?>"
      data-txt-via-folder="<?php echo t_h('public.via_folder', [], 'Shared via folder'); ?>"
      data-txt-filter-all="<?php echo t_h('public.filter_all', [], 'All'); ?>"
      data-txt-filter-notes="<?php echo t_h('public.filter_notes', [], 'Notes'); ?>"
      data-txt-filter-folders="<?php echo t_h('public.filter_folders', [], 'Folders'); ?>"
	data-txt-no-shared-notes="<?php echo t_h('public.no_shared_notes', [], 'No shared notes yet.'); ?>"
	data-txt-no-shared-folders="<?php echo t_h('public.no_shared_folders', [], 'No shared folders yet.'); ?>"
	data-txt-restrict-users="<?php echo t_h('public.restrict_users', [], 'Restrict to specific users'); ?>"
	data-txt-restrict-users-mobile="<?php echo t_h('public.restrict_users_mobile', [], 'Restrict'); ?>"
      data-txt-restricted-badge="<?php echo t_h('public.restricted_badge', [], 'Restricted'); ?>"
      data-txt-restricted-help="<?php echo t_h('public.restricted_help', [], 'When restricted, only the listed users can access this share after logging in.'); ?>"
      data-txt-no-users-found="<?php echo t_h('public.no_users_found', [], 'No other users found'); ?>"
      data-txt-users-loading="<?php echo t_h('public.users_loading', [], 'Loading users...'); ?>"
      data-txt-shared-by="<?php echo t_h('public.shared_by', [], 'Shared by'); ?>"
      data-txt-no-shared-with-me="<?php echo t_h('public.no_shared_with_me', [], 'Nothing has been shared with you yet.'); ?>"
      data-txt-copy-url="<?php echo t_h('public.actions.copy_url', [], 'Copy URL'); ?>"
      data-txt-url-copied="<?php echo t_h('public.actions.url_copied', [], 'URL copied!'); ?>"
      data-txt-login-required-title="<?php echo t_h('public.login_required_title', [], 'Login Required'); ?>"
      data-txt-access-denied-title="<?php echo t_h('public.access_denied_title', [], 'Access Denied'); ?>">

	<!-- Shared folders data from PHP -->
	<script>
		window.__sharedFoldersData = <?php echo json_encode($shared_folders, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
	</script>

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
			<div class="filter-type-buttons">
				<button class="filter-type-btn active" data-filter="all">
					<i class="lucide lucide-layers"></i>
					<?php echo t_h('public.filter_all', [], 'All'); ?>
				</button>
				<button class="filter-type-btn" data-filter="notes">
					<i class="lucide lucide-sticky-note"></i>
					<?php echo t_h('public.filter_notes', [], 'Notes'); ?>
				</button>
			<button class="filter-type-btn" data-filter="folders">
					<i class="lucide lucide-folder"></i>
					<?php echo t_h('public.filter_folders', [], 'Folders'); ?>
				</button>
				<button class="filter-type-btn" data-filter="shared_with_me">
					<i class="lucide lucide-users"></i>
					<?php echo t_h('public.shared_with_me', [], 'Shared with me'); ?>
				</button>
			</div>
			<div class="filter-search-row">
				<div class="filter-input-wrapper">
					<input 
						type="text" 
						id="filterInput" 
						class="filter-input" 
						placeholder="<?php echo t_h('public.filter_placeholder', [], 'Filter by title or folder name...'); ?>"
					/>
					<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
						<i class="lucide lucide-x"></i>
					</button>
				</div>
				<div id="filterStats" class="filter-stats initially-hidden"></div>
			</div>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="lucide lucide-loader-2 lucide-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="sharedItemsContainer"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<p><?php echo t_h('public.no_shares', [], 'No shares yet.'); ?></p>
				<p class="empty-hint"><?php echo t_h('public.no_shares_hint', [], 'Share a note or folder by clicking the cloud button in the toolbar.'); ?></p>
			</div>
		</div>
	</div>
	
	<script src="js/navigation.js"></script>
	<script src="js/shared-page.js"></script>
</body>
</html>

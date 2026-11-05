<?php
/**
 * Unified Shares page - Shows both shared notes and shared folders
 * with a filter bar to search and toggle between notes/folders/all.
 */
require_once __DIR__ . '/../page_bootstrap.php';
require_once __DIR__ . '/../share_passwords.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// ── Fetch shared folders server-side for the unified shares page ──
$workspace = $pageWorkspace;

$query = "SELECT id, name, parent_id, workspace, icon, display_order FROM folders";
$params = [];
if (!empty($workspace)) {
	$query .= " WHERE workspace = ?";
	$params[] = $workspace;
}
$query .= " ORDER BY CASE WHEN display_order > 0 THEN 0 ELSE 1 END, display_order, name COLLATE NOCASE";
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
			$stmtP = $con->prepare("SELECT id, name, parent_id, workspace, icon, display_order FROM folders WHERE id = ?");
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
			'passwordValue'   => poznoteDecryptSharePassword($entry['password_encrypted'] ?? ''),
			'allowed_users'   => !empty($entry['allowed_users']) ? json_decode($entry['allowed_users'], true) : null,
			'disabled'        => (int)($entry['disabled'] ?? 0),
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
	<script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<script src="js/session-guard.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderStylesheets('shared'); ?>
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderBrandIcons(); ?>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="shared-page shared-table-page has-icon-sidebar"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
	data-txt-edit-token="<?php echo t_h('index.public_modal.manage', [], 'Edit'); ?>"
	data-txt-password-label="<?php echo t_h('index.public_modal.password', [], 'Password (optional)'); ?>"
      data-txt-network-error="<?php echo t_h('common.network_error', [], 'Network error'); ?>"
      data-txt-open="<?php echo t_h('public.actions.open', [], 'Open public view'); ?>"
      data-txt-revoke="<?php echo t_h('public.actions.revoke', [], 'Revoke'); ?>"
      data-txt-revoke-modal-text-via-folder="<?php echo t_h('public.revoke_modal.text_via_folder', [], 'This note is shared through a folder. You can make just this note inaccessible; the folder share and its other notes are not affected.'); ?>"
      data-txt-revoke-modal-text-via-folder-disabled="<?php echo t_h('public.revoke_modal.text_via_folder_disabled', [], 'This note is currently inaccessible. You can make it accessible again through its folder share.'); ?>"
      data-txt-revoke-modal-text-via-folder-parent-disabled="<?php echo t_h('public.revoke_modal.text_via_folder_parent_disabled', [], 'This note is inaccessible because its folder share has been made inaccessible. Make the folder share accessible again to restore access.'); ?>"
      data-txt-share-disabled-badge="<?php echo t_h('public.disabled_badge', [], 'Inaccessible'); ?>"
      data-txt-share-disabled-help="<?php echo t_h('public.disabled_help', [], 'This share is inaccessible: the link no longer works until you make it accessible again.'); ?>"
	data-txt-note-shared-through-folder="<?php echo t_h('public.note_shared_through_folder', [], 'Note shared through folder'); ?>"
	data-txt-folder-shared-through-parent="<?php echo t_h('public.folder_shared_through_parent', [], 'Folder shared through parent folder'); ?>"
      data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
	data-txt-table-name="<?php echo t_h('public.table.name', [], 'Name'); ?>"
	data-txt-table-token="<?php echo t_h('public.table.token', [], 'Token'); ?>"
	data-txt-token-help="<?php echo t_h('public.token_help', [], 'The token is the unique part you choose in the public link. For example, using project-2026 gives https://your-domain.example/project-2026 for a note, or https://your-domain.example/folder/project-2026 for a folder.'); ?>"
	data-txt-table-actions="<?php echo t_h('public.table.actions', [], 'Actions'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-txt-via-folder="<?php echo t_h('public.via_folder', [], 'Shared via folder'); ?>"
	data-txt-restricted-badge="<?php echo t_h('public.restricted_badge', [], 'Restricted'); ?>"
	data-txt-restricted-help="<?php echo t_h('public.restricted_help', [], 'When restricted, only the listed users can access this share after logging in.'); ?>"
      data-txt-shared-by="<?php echo t_h('public.shared_by', [], 'Shared by'); ?>"
      data-txt-copy-url="<?php echo t_h('public.actions.copy_url', [], 'Copy URL'); ?>"
      data-txt-url-copied="<?php echo t_h('public.actions.url_copied', [], 'URL copied!'); ?>"
      data-txt-login-required-title="<?php echo t_h('public.login_required_title', [], 'Login Required'); ?>"
	data-txt-access-denied-title="<?php echo t_h('public.access_denied_title', [], 'Access Denied'); ?>"
	data-txt-expand-folder="<?php echo t_h('public.expand_folder', [], 'Expand folder'); ?>"
	data-txt-collapse-folder="<?php echo t_h('public.collapse_folder', [], 'Collapse folder'); ?>"
	data-txt-expand-all="<?php echo t_h('public.expand_all', [], 'Expand all'); ?>"
	data-txt-collapse-all="<?php echo t_h('public.collapse_all', [], 'Collapse all'); ?>">

	<!-- Shared folders data from PHP -->
	<script>
		window.__sharedFoldersData = <?php echo json_encode($shared_folders, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;
	</script>

	<?php include __DIR__ . '/../icon_sidebar.php'; ?>
	<?php include __DIR__ . '/../share_settings_config.php'; ?>

	<div class="shared-container">
		<h1 class="poznote-page-title"><span class="poznote-page-title-name"><i class="lucide lucide-share-2"></i> <?php echo t_h('home.shares', [], 'Shares'); ?></span> <?php echo poznoteRenderPageTitleWorkspace($pageWorkspace); ?></h1>

		
		<div class="shared-filter-bar initially-hidden" id="sharedFilterBar">
			<?php // As on offline_notes.php: the magnifier of the filter (js/search-toggle.js), the
			// sort, then the expand/collapse chevron ?>
			<div class="filter-type-buttons pz-search-row">
				<?php echo poznoteRenderSearchToggle('sharedFilterWrapper', t('public.filter_placeholder', [], 'Filter by name or token...')); ?>
				<div class="filter-input-wrapper pz-search-collapsible is-search-collapsed" id="sharedFilterWrapper">
					<input 
						type="text" 
						id="filterInput" 
						class="filter-input" 
						placeholder="<?php echo t_h('public.filter_placeholder', [], 'Filter by name or token...'); ?>"
					/>
					<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
						<i class="lucide lucide-x"></i>
					</button>
				</div>
				<?php // Right of the magnifier ?>
				<select id="sharedSortSelect" class="shared-sort-select" aria-label="<?php echo t_h('public.sort_label', [], 'Sort shares'); ?>">
					<option value="name"><?php echo t_h('public.sort_name', [], 'Sort by name'); ?></option>
					<option value="updated"><?php echo t_h('public.sort_updated', [], 'Sort by last edit'); ?></option>
					<option value="shared"><?php echo t_h('public.sort_shared', [], 'Sort by share date'); ?></option>
				</select>
				<?php // Its chevron alone, its label in the tooltip (js/shared-page.js) ?>
				<div class="shared-filter-tree-actions initially-hidden" id="sharedTreeToolbar">
					<button type="button" id="toggleAllFoldersBtn" class="btn btn-secondary" title="<?php echo t_h('public.expand_all', [], 'Expand all'); ?>" aria-label="<?php echo t_h('public.expand_all', [], 'Expand all'); ?>">
						<i class="lucide lucide-chevron-down"></i>
					</button>
				</div>
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
	
	<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/pwa-helpers.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/share-settings-modal.js'); ?>"></script>
	<script src="js/shared-page.js?v=<?php echo @filemtime('js/shared-page.js') ?: time(); ?>"></script>
	<script src="<?php echo poznoteAsset('js/search-toggle.js'); ?>"></script>
</body>
</html>

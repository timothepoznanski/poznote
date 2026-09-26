<?php
/**
 * Offline page - the notes and folders kept offline, laid out like the Shares
 * page (shared.php): a filter bar, folders as a tree with their notes, and
 * why each note is kept (lib/offline.php). The list comes from
 * GET /api/v1/offline/list (the manifest's rules); js/offline-list.js adds
 * which notes this browser does not hold yet.
 */
require_once __DIR__ . '/../page_bootstrap.php';

// Offline mode turned off (Settings > Offline notes): the page is not offered
if (!poznoteOfflineModeEnabled()) {
	header('Location: index.php');
	exit;
}

$pageWorkspace = trim(getWorkspaceFilter());
if ($pageWorkspace === '__last_opened__') {
	$pageWorkspace = '';
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
	<script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<script src="js/session-guard.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderStylesheets('shared'); ?>
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="shared-page offline-list-page has-icon-sidebar"
	data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
	data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
	data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
	data-txt-table-name="<?php echo t_h('public.table.name', [], 'Name'); ?>"
	data-txt-table-reason="<?php echo t_h('offline.page.column_reason', [], 'Reason'); ?>"
	data-txt-table-actions="<?php echo t_h('public.table.actions', [], 'Actions'); ?>"
	data-txt-reason-note="<?php echo t_h('offline.page.reason_note', [], 'Kept offline'); ?>"
	data-txt-reason-folder="<?php echo t_h('offline.page.reason_folder', [], 'In a folder kept offline'); ?>"
	data-txt-reason-favorite="<?php echo t_h('offline.page.reason_favorite', [], 'Favorite'); ?>"
	data-txt-reason-recent="<?php echo t_h('offline.page.reason_recent', [], 'Modified in the last {{days}} days'); ?>"
	data-txt-reason-recent-one="<?php echo t_h('offline.page.reason_recent_one', [], 'Modified in the last day'); ?>"
	data-txt-folder-direct="<?php echo t_h('offline.page.folder_direct', [], 'Kept offline'); ?>"
	data-txt-folder-parent="<?php echo t_h('offline.page.folder_parent', [], 'Via a parent folder'); ?>"
	data-txt-keep="<?php echo t_h('notes_list.note_actions.keep_offline', [], 'Keep offline'); ?>"
	data-txt-stop="<?php echo t_h('notes_list.note_actions.stop_offline', [], 'Stop keeping offline'); ?>"
	data-txt-keep-error="<?php echo t_h('offline.keep.error', [], 'The offline setting could not be saved.'); ?>"
	data-txt-not-in-browser="<?php echo t_h('notes_list.note_actions.not_available_offline', [], 'Not available offline in this browser'); ?>"
	data-txt-unsupported="<?php echo t_h('offline.unsupported', [], 'This browser cannot keep notes offline.'); ?>"
	data-txt-empty="<?php echo t_h('offline.page.empty', [], 'Nothing is available offline yet.'); ?>"
	data-txt-empty-hint="<?php echo t_h('offline.page.empty_hint', [], 'Choose "Keep offline" in the menu of a note or a folder. Your favorites and the notes modified in the last {{days}} days are kept too.'); ?>"
	data-txt-disabled="<?php echo t_h('offline.page.disabled', [], 'Offline notes are turned off.'); ?>"
	data-txt-disabled-hint="<?php echo t_h('offline.page.disabled_hint', [], 'Choose how many days of notes to keep in Settings, Offline notes.'); ?>"
	data-txt-no-notes="<?php echo t_h('offline.page.no_notes', [], 'No notes available offline.'); ?>"
	data-txt-no-folders="<?php echo t_h('offline.page.no_folders', [], 'No folders kept offline.'); ?>"
	data-txt-own-account-only="<?php echo t_h('offline.page.own_account_only', [], 'Offline copies are only kept for your own account.'); ?>"
	data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
	data-txt-expand-folder="<?php echo t_h('public.expand_folder', [], 'Expand folder'); ?>"
	data-txt-collapse-folder="<?php echo t_h('public.collapse_folder', [], 'Collapse folder'); ?>"
	data-txt-expand-all="<?php echo t_h('public.expand_all', [], 'Expand all'); ?>"
	data-txt-collapse-all="<?php echo t_h('public.collapse_all', [], 'Collapse all'); ?>">

	<?php include __DIR__ . '/../icon_sidebar.php'; ?>

	<div class="shared-container">
		<h1 class="poznote-page-title"><i class="lucide lucide-wifi-off"></i> <?php echo t_h('offline.page.title', [], 'Offline'); ?> <?php echo poznoteRenderPageTitleWorkspace($pageWorkspace); ?></h1>

		<div class="shared-filter-bar initially-hidden" id="sharedFilterBar">
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
			</div>
			<div class="filter-search-row">
				<div class="filter-input-wrapper">
					<input
						type="text"
						id="filterInput"
						class="filter-input"
						placeholder="<?php echo t_h('offline.page.filter_placeholder', [], 'Filter by name or folder...'); ?>"
					/>
					<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
						<i class="lucide lucide-x"></i>
					</button>
				</div>
				<div id="filterStats" class="filter-stats initially-hidden"></div>
				<div class="shared-filter-tree-actions initially-hidden" id="sharedTreeToolbar">
					<button type="button" id="toggleAllFoldersBtn" class="btn btn-secondary">
						<i class="lucide lucide-chevron-down" style="margin-right: 6px;"></i>
						<span id="toggleAllFoldersLabel"><?php echo t_h('public.expand_all', [], 'Expand all'); ?></span>
					</button>
				</div>
			</div>
		</div>

		<p id="offlineDeviceNotice" class="offline-list-notice initially-hidden"></p>

		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="lucide lucide-loader-2 lucide-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="sharedItemsContainer"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<p id="emptyMessageText"></p>
				<p id="emptyMessageHint" class="empty-hint"></p>
			</div>
		</div>
	</div>

	<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/pwa-helpers.js'); ?>"></script>
	<?php // Brings this browser's copies up to date, after a change made here too (writes-only mode) ?>
	<script src="<?php echo poznoteAsset('js/offline-store.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/offline-sync.js'); ?>" data-offline-mode="writes"></script>
	<script src="<?php echo poznoteAsset('js/offline-list.js'); ?>"></script>
</body>
</html>

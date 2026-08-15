<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'folders_display.php';
require_once 'version_helper.php';

// Respect optional workspace parameter, falling back to the default workspace
// like the other pages do. Reading the parameter directly left data-workspace
// empty when the page was opened without one, and the folder actions then
// called the API with an empty workspace, which 404s.
$workspace = trim(getWorkspaceFilter());

// Build query to get all folders
$select_query = "SELECT f.id, f.name, f.icon, f.icon_color, f.display_order, f.parent_id,
                 f.sort_setting, f.favorite,
                 (SELECT COUNT(*) FROM entries e WHERE e.folder_id = f.id AND e.trash = 0) as note_count
                 FROM folders f";

$search_params = [];

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " WHERE f.workspace = ?";
	$search_params[] = $workspace;
}

$select_query .= " ORDER BY CASE WHEN f.display_order > 0 THEN 0 ELSE 1 END, f.display_order, f.name COLLATE NOCASE";

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$folders = [];
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$folders[(int)$row['id']] = $row;
}

// Folders are listed as a tree (same parent_id hierarchy as the sidebar in
// index.php) rather than flat, so subfolders read as belonging to their parent.
$folderTree = buildFolderHierarchy($folders);

// Folders shared publicly: the actions menu shows the matching share variant
$sharedFolderIds = [];
try {
	$sharedStmt = $con->query('SELECT folder_id FROM shared_folders');
	while ($sharedRow = $sharedStmt->fetch(PDO::FETCH_ASSOC)) {
		$sharedFolderIds[(int)$sharedRow['folder_id']] = true;
	}
} catch (Exception $e) {
	$sharedFolderIds = [];
}

/**
 * The folder actions, in the order they appear.
 *
 * Drives both the inline icon buttons of each row (desktop) and the actions
 * modal (mobile), so the two stay in sync. Mirrors the folder actions dropdown
 * of index.php, minus the create entry and the ones needing its notes list DOM.
 *
 * @return array List of action descriptors
 */
function folderListInlineActions() {
	return [
		[
			'action' => 'open-kanban-view',
			'icon' => 'lucide-columns-2',
			'label' => t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view'),
		],
		[
			'action' => 'show-only-folder',
			'icon' => 'lucide-filter',
			'label' => t_h('notes_list.folder_actions.show_only', [], 'Show only this folder'),
		],
		[
			'action' => 'move-folder-files',
			'icon' => 'lucide-folder-open',
			'label' => t_h('notes_list.folder_actions.move_all_files', [], 'Move all files'),
			'requires_notes' => true,
		],
		[
			'action' => 'move-entire-folder',
			'icon' => 'lucide-folder-output',
			'label' => t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder'),
		],
		[
			'action' => 'download-folder',
			'icon' => 'lucide-download',
			'label' => t_h('notes_list.folder_actions.download_folder', [], 'Download folder'),
			'requires_notes' => true,
		],
		[
			'action' => 'share-folder',
			'icon' => 'lucide-share-2',
			'label' => t_h('notes_list.folder_actions.is_public', [], 'Is public'),
			'when_shared' => true,
		],
		[
			'action' => 'share-folder',
			'icon' => 'lucide-share-2',
			'label' => t_h('notes_list.folder_actions.share_folder', [], 'Make public'),
			'when_shared' => false,
		],
		[
			'action' => 'favorite-folder',
			'icon' => 'lucide-star',
			'label' => t_h('notes_list.folder_actions.remove_favorite', [], 'Remove from favorites'),
			'when_favorite' => true,
		],
		[
			'action' => 'favorite-folder',
			'icon' => 'lucide-star',
			'label' => t_h('notes_list.folder_actions.add_favorite', [], 'Add to favorites'),
			'when_favorite' => false,
		],
		[
			'action' => 'rename-folder',
			'icon' => 'lucide-pencil',
			'label' => t_h('notes_list.folder_actions.rename_folder', [], 'Rename'),
		],
		[
			'action' => 'change-folder-icon',
			'icon' => 'lucide-palette',
			'label' => t_h('notes_list.folder_actions.change_icon', [], 'Change icon'),
		],
		[
			'action' => 'delete-folder',
			'icon' => 'lucide-trash-2',
			'label' => t_h('notes_list.folder_actions.delete_folder', [], 'Delete'),
			'danger' => true,
		],
	];
}

/**
 * Render one folder row and, recursively, its children.
 *
 * @param int $folderId Folder ID
 * @param array $folder Folder row enriched with a 'children' array
 * @param int $depth Nesting depth, drives the row indentation
 * @param string $workspace Current workspace
 * @param array $sharedFolderIds Map of publicly shared folder ids
 */
function renderFolderListRow($folderId, $folder, $depth, $workspace, $sharedFolderIds) {
	$folder_id = htmlspecialchars((string)$folder['id'], ENT_QUOTES);
	$folder_name = htmlspecialchars($folder['name'], ENT_QUOTES);
	$folder_icon_raw = !empty($folder['icon']) ? $folder['icon'] : null;
	$folder_icon = $folder_icon_raw ? htmlspecialchars(convertFontAwesomeToLucide($folder_icon_raw), ENT_QUOTES) : 'lucide-folder';
	$icon_color = !empty($folder['icon_color']) ? htmlspecialchars($folder['icon_color'], ENT_QUOTES) : '';
	$note_count = (int)$folder['note_count'];
	$is_shared = isset($sharedFolderIds[(int)$folder['id']]) ? '1' : '0';
	$is_favorite = !empty($folder['favorite']) ? '1' : '0';
	$current_sort = htmlspecialchars((string)($folder['sort_setting'] ?? ''), ENT_QUOTES);

	$kanban_url = 'index.php?kanban=' . $folder_id . '&workspace=' . urlencode($workspace);

	echo '<div class="shared-note-item folder-item" data-action="open-folder-kanban" data-kanban-url="' . htmlspecialchars($kanban_url, ENT_QUOTES) . '" data-folder-name="' . $folder_name . '" data-depth="' . (int)$depth . '" style="cursor: pointer; padding: 8px 15px; padding-left: ' . (15 + $depth * 22) . 'px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; box-shadow: none !important;">';

	echo '<div class="note-name-container" style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">';
	$icon_style = 'style="' . ($icon_color ? 'color: ' . $icon_color . ' !important; ' : '') . 'filter: none !important;"';
	echo '<div class="shared-folder-icon" style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent !important; border-radius: 8px; flex: 0 0 auto;">';
	echo '<i class="' . $folder_icon . '" ' . $icon_style . '></i>';
	echo '</div>';
	echo '<span class="folder-name-text" style="font-weight: 500; font-size: 16px; color: var(--text-color, var(--dm-text, #333333));">' . $folder_name . ' <span style="font-size: 14px; color: var(--text-muted, var(--dm-text-muted, #6c757d)); font-weight: 400;">(' . $note_count . ')</span></span>';
	echo '</div>';

	// Folder identity, carried by every action button of the row
	$folderAttrs = ' data-folder-id="' . $folder_id . '" data-folder-name="' . $folder_name . '"'
		. ' data-note-count="' . $note_count . '" data-shared="' . $is_shared . '"'
		. ' data-favorite="' . $is_favorite . '" data-current-sort="' . $current_sort . '"';

	echo '<div class="folder-list-actions">';

	// Desktop: every action as its own icon. Mobile keeps only the three-dot
	// button below, which opens the same actions in a modal.
	echo '<div class="folder-inline-actions">';
	foreach (folderListInlineActions() as $action) {
		// Items depending on the folder state are hidden the same way the
		// modal hides them
		$classes = 'folder-inline-action-btn';
		// Actions needing notes keep their slot when the folder is empty, so
		// the icon columns stay aligned from one row to the next
		$isPlaceholder = !empty($action['requires_notes']) && $note_count === 0;
		if ($isPlaceholder) {
			$classes .= ' is-placeholder';
		}
		if (isset($action['when_shared']) && $action['when_shared'] !== ($is_shared === '1')) {
			continue;
		}
		if (isset($action['when_favorite']) && $action['when_favorite'] !== ($is_favorite === '1')) {
			continue;
		}
		if (!empty($action['danger'])) {
			// folder-actions-danger opts the icon out of the dark-mode grey
			// filter (excluded in css/dark-mode/icons.css) so it stays red
			$classes .= ' danger folder-actions-danger';
		}

		$label = $action['label'];
		echo '<button type="button" class="' . $classes . '"'
			. ($isPlaceholder
				? ' disabled aria-hidden="true" tabindex="-1"'
				: ' data-action="' . $action['action'] . '"' . $folderAttrs . ' title="' . $label . '" aria-label="' . $label . '"')
			. '>';
		echo '<i class="lucide ' . $action['icon'] . '"></i>';
		echo '</button>';
	}
	echo '</div>';

	echo '<button type="button" class="folder-list-menu-btn" data-action="open-folder-actions-modal"'
		. $folderAttrs
		. ' title="' . t_h('notes_list.folder_actions.menu', [], 'Actions') . '"'
		. ' aria-label="' . t_h('notes_list.folder_actions.menu', [], 'Actions') . '">';
	echo '<i class="lucide lucide-more-vertical"></i>';
	echo '</button>';
	echo '</div>';

	echo '</div>';

	if (!empty($folder['children'])) {
		foreach ($folder['children'] as $childId => $childFolder) {
			renderFolderListRow($childId, $childFolder, $depth + 1, $workspace, $sharedFolderIds);
		}
	}
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
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/attachments.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/share-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/notes-list.css"/>
	<!-- Base styling of the folder action items reused in the actions modal -->
	<link type="text/css" rel="stylesheet" href="css/folders/actions-menu.css"/>
	<!-- Icon picker opened by the "Change icon" action -->
	<link type="text/css" rel="stylesheet" href="css/folder-icon-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/buttons-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo rawurlencode(getAppVersion()); ?>"/>
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/dark-mode.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/markdown.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/kanban.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css"/>
	<link type="text/css" rel="stylesheet" href="css/icon-sidebar.css"/>
	<link type="text/css" rel="stylesheet" href="css/icon-sidebar-page.css"/>
	<style>
		.shared-container {
			background: transparent !important;
		}
		.folder-item {
			cursor: pointer;
			transition: background-color 0.15s ease;
		}
		/* Row hover highlight. --bg-hover is not defined on this page, so the
		   fallback is what actually paints the selection background. */
		.folder-item:hover {
			background-color: var(--bg-hover, rgba(0, 125, 184, 0.07)) !important;
		}
		html[data-theme='dark'] .folder-item:hover,
		body.dark-mode .folder-item:hover {
			background-color: rgba(255, 255, 255, 0.07) !important;
		}
		.shared-folder-icon i {
			transition: color 0.15s ease;
		}
		.folder-list-actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			flex: 0 0 auto;
		}
		/* Desktop shows every action as an icon; mobile falls back to the
		   three-dot button opening the actions modal (see the media query). */
		.folder-inline-actions {
			display: flex;
			align-items: center;
			gap: 2px;
		}
		/* Row action buttons: bare icons, no button chrome */
		.folder-inline-action-btn,
		.folder-list-menu-btn,
		.folder-delete-btn {
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			padding: 0 !important;
			border: none;
			background: transparent;
			border-radius: 4px;
			cursor: pointer;
			transition: background-color 0.15s ease, color 0.15s ease;
		}
		.folder-inline-action-btn,
		.folder-delete-btn {
			display: inline-flex;
		}
		/* Replaced by the inline icons on desktop */
		.folder-list-menu-btn {
			display: none;
			color: var(--text-muted, #6b7280);
		}
		.folder-inline-action-btn {
			color: var(--text-muted, #6b7280);
		}
		/* Keeps the column width of an action the folder cannot use */
		.folder-inline-action-btn.is-placeholder {
			visibility: hidden;
			pointer-events: none;
		}
		.folder-inline-action-btn:hover {
			background-color: rgba(107, 114, 128, 0.12);
			color: #007DB8;
		}
		/* Delete is the one destructive action, so it stays red */
		.folder-inline-action-btn.danger {
			color: #dc2626;
		}
		.folder-inline-action-btn.danger:hover {
			background-color: rgba(220, 38, 38, 0.12);
			color: #b91c1c;
		}
		html[data-theme='dark'] .folder-inline-action-btn,
		body.dark-mode .folder-inline-action-btn {
			color: var(--dm-text-muted, #9ca3af);
		}
		html[data-theme='dark'] .folder-inline-action-btn:hover,
		body.dark-mode .folder-inline-action-btn:hover {
			background-color: rgba(255, 255, 255, 0.08);
			color: #38bdf8;
		}
		html[data-theme='dark'] .folder-inline-action-btn.danger,
		body.dark-mode .folder-inline-action-btn.danger {
			color: #f87171;
		}
		html[data-theme='dark'] .folder-inline-action-btn.danger:hover,
		body.dark-mode .folder-inline-action-btn.danger:hover {
			background-color: rgba(248, 113, 113, 0.15);
			color: #fca5a5;
		}
		/* css/dark-mode/icons.css greys every Lucide icon with an !important
		   filter; the delete icon has to opt out to stay red */
		/* .folder-actions-danger opts these icons out of the blanket grey
		   filter of css/dark-mode/icons.css (see its :not() list), so the
		   currentColor red set above actually shows */
		html[data-theme='dark'] .folder-actions-danger [class*="lucide-"],
		body.dark-mode .folder-actions-danger [class*="lucide-"] {
			background-color: currentColor;
		}
		.folder-list-menu-btn:hover {
			background-color: rgba(107, 114, 128, 0.12);
			color: #007DB8;
		}
		.folder-inline-action-btn i,
		.folder-list-menu-btn i {
			font-size: 14px;
			line-height: 1;
			/* Lucide icons are CSS masks: the mask needs background-color too */
			background-color: currentColor;
		}
		html[data-theme='dark'] .folder-list-menu-btn,
		body.dark-mode .folder-list-menu-btn {
			color: var(--dm-text-muted, #9ca3af);
		}
		html[data-theme='dark'] .folder-list-menu-btn:hover,
		body.dark-mode .folder-list-menu-btn:hover {
			background-color: rgba(255, 255, 255, 0.08);
			color: #38bdf8;
		}
		/* Nested folders: the row keeps a guide line at each depth level */
		.folder-item[data-depth]:not([data-depth="0"]) .note-name-container::before {
			content: '';
			flex: 0 0 auto;
			align-self: stretch;
			width: 2px;
			margin-right: 2px;
			background: var(--border-color, #e0e0e0);
			border-radius: 1px;
		}
		html[data-theme='dark'] .folder-item[data-depth]:not([data-depth="0"]) .note-name-container::before,
		body.dark-mode .folder-item[data-depth]:not([data-depth="0"]) .note-name-container::before {
			background: rgba(255, 255, 255, 0.15);
		}

		/* Rename modal: a single-field dialog, so the input spans the modal
		   and the modal itself stays compact */
		#editFolderModal .modal-content {
			max-width: 400px;
		}
		#editFolderModal input {
			width: 100%;
		}

		/* Folder actions modal: reuses the shared folder action items */
		#folderActionsModal .modal-content {
			padding: 0;
			width: 100%;
			max-width: 380px;
			overflow: hidden;
			display: flex;
			flex-direction: column;
			max-height: min(86vh, 640px);
		}
		#folderActionsModal .folder-actions-modal-header {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 15px 18px;
			border-bottom: 1px solid var(--border-color, #e5e7eb);
			font-weight: 600;
			font-size: 15px;
			line-height: 1.3;
			/* Long folder names wrap instead of stretching the modal */
			overflow-wrap: anywhere;
		}
		#folderActionsModal .folder-actions-modal-header i {
			flex: 0 0 auto;
			font-size: 17px;
			color: var(--text-muted, #6b7280);
			background-color: currentColor;
		}
		#folderActionsModal .folder-actions-modal-body {
			flex: 1 1 auto;
			overflow-y: auto;
			padding: 8px 0;
		}
		/* Inside the modal the shared menu is a plain block, not a dropdown */
		#folderActionsModal .folder-actions-menu {
			position: static;
			display: block;
			border: none;
			box-shadow: none;
			background: transparent;
			min-width: 0;
			padding: 0;
			z-index: auto;
		}
		#folderActionsModal .folder-actions-menu-item {
			padding: 11px 18px;
			gap: 12px;
			font-size: 0.95em;
		}
		#folderActionsModal .folder-actions-menu-item i {
			width: 18px;
			font-size: 15px;
			text-align: center;
			flex: 0 0 auto;
			background-color: currentColor;
		}
		/* Separate the destructive action from the rest */
		#folderActionsModal .folder-actions-menu-item.danger {
			margin-top: 8px;
			padding-top: 15px;
			border-top: 1px solid var(--border-color, #e5e7eb);
		}
		/* Full-width footer instead of a lone floating button */
		#folderActionsModal .modal-buttons {
			flex: 0 0 auto;
			margin: 0;
			padding: 12px 18px;
			border-top: 1px solid var(--border-color, #e5e7eb);
			background: var(--bg-subtle, rgba(0, 0, 0, 0.02));
		}
		#folderActionsModal .modal-buttons .btn-cancel {
			width: 100%;
			margin: 0;
		}
		/* Light mode: red cancel button */
		html:not([data-theme='dark']) body:not(.dark-mode) #folderActionsModal .modal-buttons .btn-cancel {
			background-color: #dc2626;
			border-color: #dc2626;
			color: #ffffff;
		}
		html:not([data-theme='dark']) body:not(.dark-mode) #folderActionsModal .modal-buttons .btn-cancel:hover {
			background-color: #b91c1c;
			border-color: #b91c1c;
			color: #ffffff;
		}
		html[data-theme='dark'] #folderActionsModal .folder-actions-modal-header,
		body.dark-mode #folderActionsModal .folder-actions-modal-header,
		html[data-theme='dark'] #folderActionsModal .modal-buttons,
		body.dark-mode #folderActionsModal .modal-buttons,
		html[data-theme='dark'] #folderActionsModal .folder-actions-menu-item.danger,
		body.dark-mode #folderActionsModal .folder-actions-menu-item.danger {
			border-color: rgba(255, 255, 255, 0.12);
		}
		html[data-theme='dark'] #folderActionsModal .modal-buttons,
		body.dark-mode #folderActionsModal .modal-buttons {
			background: rgba(255, 255, 255, 0.03);
		}

		/* Mobile simplification: list style instead of cards */
		@media (max-width: 768px) {
			/* Too narrow for a row of icons: collapse them back into the
			   three-dot button opening the actions modal */
			.folder-inline-actions {
				display: none;
			}
			.folder-list-menu-btn {
				display: inline-flex;
			}
			.shared-container {
				padding: 10px !important;
			}
			.folder-item {
				/* padding-left carries the per-row indentation of nested
				   folders (set inline), so it is left out of the !important
				   shorthand that would otherwise flatten the hierarchy */
				padding-top: 8px !important;
				padding-right: 15px !important;
				padding-bottom: 8px !important;
				box-shadow: none !important;
				border-radius: 0 !important;
				border: none !important;
				border-bottom: 1px solid var(--border-color, #e0e0e0) !important;
				margin-bottom: 0 !important;
				background-color: transparent !important;
			}
			html[data-theme='dark'] .folder-item,
			body.dark-mode .folder-item {
				border-bottom-color: rgba(255, 255, 255, 0.1) !important;
			}
			.shared-folder-icon {
				width: 32px !important;
				height: 32px !important;
				background: transparent !important;
			}
			.folder-name-text {
				font-size: 14px !important;
			}
			.folder-list-actions {
				margin-left: auto;
			}
		}
	</style>
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="shared-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<?php $iconSidebarWorkspace = $workspace; include 'icon_sidebar.php'; ?>
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary dashboard-nav-btn" title="<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>">
				<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>
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
				foreach($folderTree as $rootId => $rootFolder) {
					renderFolderListRow($rootId, $rootFolder, 0, $workspace, $sharedFolderIds);
				}
			}
			?>
			</div>
		</div>
	</div>

	<!-- Folder actions modal: opened by the three-dot button of each row.
	     Holds the action items of the folder actions dropdown of index.php
	     (rendered by renderFolderActionsMenu), minus the create entry and the
	     ones needing the notes list DOM of index.php (open all in tabs, sort). -->
	<div id="folderActionsModal" class="modal">
		<div class="modal-content">
			<div class="folder-actions-modal-header">
				<i class="lucide lucide-folder" id="folderActionsModalIcon"></i>
				<span id="folderActionsModalTitle"></span>
			</div>
			<div class="folder-actions-modal-body">
				<div class="folder-actions-menu show" id="folder-actions-menu">
					<div class="folder-actions-menu-item" data-action="open-kanban-view">
						<i class="lucide lucide-columns-2"></i>
						<span><?php echo t_h('notes_list.folder_actions.kanban_view', [], 'Kanban view'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="show-only-folder">
						<i class="lucide lucide-filter"></i>
						<span><?php echo t_h('notes_list.folder_actions.show_only', [], 'Show only this folder'); ?></span>
					</div>
					<div class="folder-actions-menu-item requires-notes" data-action="move-folder-files">
						<i class="lucide lucide-folder-open"></i>
						<span><?php echo t_h('notes_list.folder_actions.move_all_files', [], 'Move all files'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="move-entire-folder">
						<i class="lucide lucide-folder-output"></i>
						<span><?php echo t_h('notes_list.folder_actions.move_folder', [], 'Move to subfolder'); ?></span>
					</div>
					<div class="folder-actions-menu-item requires-notes" data-action="download-folder">
						<i class="lucide lucide-download"></i>
						<span><?php echo t_h('notes_list.folder_actions.download_folder', [], 'Download folder'); ?></span>
					</div>
					<div class="folder-actions-menu-item shared share-state-shared" data-action="share-folder">
						<i class="lucide lucide-share-2"></i>
						<span><?php echo t_h('notes_list.folder_actions.is_public', [], 'Is public'); ?></span>
					</div>
					<div class="folder-actions-menu-item share-state-not-shared" data-action="share-folder">
						<i class="lucide lucide-share-2"></i>
						<span><?php echo t_h('notes_list.folder_actions.share_folder', [], 'Make public'); ?></span>
					</div>
					<div class="folder-actions-menu-item favorite-state-favorite" data-action="favorite-folder">
						<i class="lucide lucide-star"></i>
						<span><?php echo t_h('notes_list.folder_actions.remove_favorite', [], 'Remove from favorites'); ?></span>
					</div>
					<div class="folder-actions-menu-item favorite-state-not-favorite" data-action="favorite-folder">
						<i class="lucide lucide-star"></i>
						<span><?php echo t_h('notes_list.folder_actions.add_favorite', [], 'Add to favorites'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="rename-folder">
						<i class="lucide lucide-pencil"></i>
						<span><?php echo t_h('notes_list.folder_actions.rename_folder', [], 'Rename'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="change-folder-icon">
						<i class="lucide lucide-palette"></i>
						<span><?php echo t_h('notes_list.folder_actions.change_icon', [], 'Change icon'); ?></span>
					</div>
					<div class="folder-actions-menu-item danger folder-actions-danger" data-action="delete-folder">
						<i class="lucide lucide-trash-2"></i>
						<span><?php echo t_h('notes_list.folder_actions.delete_folder', [], 'Delete'); ?></span>
					</div>
				</div>
			</div>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="close-modal" data-modal="folderActionsModal"><?php echo t_h('common.cancel'); ?></button>
			</div>
		</div>
	</div>

	<div id="deleteFolderModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('modals.folder.delete_title'); ?></h3>
			<div id="deleteFolderMessage" class="delete-folder-message">
				<p id="deleteFolderMainMessage" class="delete-folder-main-message"></p>
				<ul id="deleteFolderDetails" class="delete-folder-details">
				</ul>
				<p id="deleteFolderNote" class="delete-folder-note"></p>
			</div>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="close-modal" data-modal="deleteFolderModal"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-danger" data-action="execute-delete-folder"><?php echo t_h('modals.folder.delete_folder'); ?></button>
			</div>
		</div>
	</div>

	<!-- Modal for editing folder name (same markup as modals.php) -->
	<div id="editFolderModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('modals.folder.rename_title'); ?></h3>
			<input type="text" id="editFolderName" placeholder="<?php echo t_h('modals.folder.rename_placeholder'); ?>" maxlength="255">
			<div class="modal-buttons">
				<button data-action="save-folder-name"><?php echo t_h('common.save'); ?></button>
				<button data-action="close-modal" data-modal="editFolderModal"><?php echo t_h('common.cancel'); ?></button>
			</div>
		</div>
	</div>

	<!-- Modal for moving all files from one folder to another (same markup as modals.php) -->
	<div id="moveFolderFilesModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('modals.move_folder_files.title', [], 'Move All Files'); ?></h3>
			<p><?php echo t_h('modals.move_folder_files.prompt_prefix', [], 'Move all files from'); ?> "<span id="sourceFolderName"></span>" <?php echo t_h('modals.move_folder_files.prompt_suffix', [], 'to:'); ?></p>
			<select id="moveFolderFilesTargetSelect">
				<option value=""><?php echo t_h('modals.move_folder_files.select_target', [], 'Select target folder...'); ?></option>
			</select>
			<div id="folderFilesCount" class="modal-info-message">
				<span id="filesCountText"></span>
			</div>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveFolderFilesModal"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-primary" data-action="execute-move-all-files"><?php echo t_h('modals.move_folder_files.move_all', [], 'Move All Files'); ?></button>
			</div>
			<div id="moveFilesErrorMessage" class="modal-error-message"></div>
		</div>
	</div>

	<!-- Move Folder to Subfolder Modal (same markup as modals.php) -->
	<div id="moveFolderModal" class="modal">
		<div class="modal-content">
			<h3><?php echo t_h('modals.move_folder.title', [], 'Move Folder'); ?></h3>
			<p><?php echo t_h('modals.move_folder.prompt_prefix', [], 'Move folder'); ?> "<span id="moveFolderSourceName"></span>" <?php echo t_h('modals.move_folder.prompt_suffix', [], 'into:'); ?></p>

			<div class="form-group" style="margin-bottom: 15px;">
				<label for="moveFolderWorkspaceSelect" style="display: block; margin-bottom: 5px; font-weight: 500; font-size: 0.9em;"><?php echo t_h('modals.move_folder.workspace', [], 'Target Workspace'); ?></label>
				<select id="moveFolderWorkspaceSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background-color: var(--card-bg, #fff); color: var(--text-color, #333); display: block; -webkit-appearance: menulist; -moz-appearance: menulist; appearance: menulist;">
				</select>
			</div>

			<div class="form-group" style="margin-bottom: 15px;">
				<label for="moveFolderTargetSelect" style="display: block; margin-bottom: 5px; font-weight: 500; font-size: 0.9em;"><?php echo t_h('modals.move_folder.parent', [], 'Target Parent Folder'); ?></label>
				<select id="moveFolderTargetSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background-color: var(--card-bg, #fff); color: var(--text-color, #333); display: block; -webkit-appearance: menulist; -moz-appearance: menulist; appearance: menulist;">
					<option value=""><?php echo t_h('modals.move_folder.select_target', [], 'Select parent folder...'); ?></option>
				</select>
			</div>

			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="close-modal" data-modal="moveFolderModal"><?php echo t_h('common.cancel'); ?></button>
				<button type="button" class="btn-primary" data-action="execute-move-folder-to-subfolder"><?php echo t_h('modals.move_folder.move', [], 'Move Folder'); ?></button>
			</div>
			<div id="moveFolderErrorMessage" class="modal-error-message"></div>
		</div>
	</div>

	<?php
	// Folder icon picker markup, shared with index.php
	include 'modals/folder_icon_modal.php';
	?>

	<script src="js/globals.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/navigation.js"></script>
	<script src="js/icon-sidebar-toggle.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/modal-alerts.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/ui.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/utils.js?v=<?php echo file_exists(__DIR__ . '/js/utils.js') ? filemtime(__DIR__ . '/js/utils.js') : getAppVersion(); ?>"></script>
	<!-- Folder action implementations reused from index.php: share modal, icon
	     picker and the modal confirm-button delegation. Load order follows
	     index_js.php (utils.js before share.js/folder-icon.js). -->
	<script src="js/share.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/folder-icon.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/modals-events.js?v=<?php echo getAppVersion(); ?>"></script>
	<script src="js/list_folders.js?v=<?php echo file_exists(__DIR__ . '/js/list_folders.js') ? filemtime(__DIR__ . '/js/list_folders.js') : getAppVersion(); ?>"></script>
</body>
</html>

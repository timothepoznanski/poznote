<?php
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../folders_display.php';
require_once __DIR__ . '/../version_helper.php';

// Respect optional workspace parameter, falling back to the default workspace
// like the other pages do. Reading the parameter directly left data-workspace
// empty when the page was opened without one, and the folder actions then
// called the API with an empty workspace, which 404s.
$workspace = trim(getWorkspaceFilter());

// Build query to get all folders
$select_query = "SELECT f.id, f.name, f.icon, f.icon_color, f.display_order, f.parent_id,
                 f.created, f.favorite, f.offline,
                 (SELECT COUNT(*) FROM entries e WHERE e.folder_id = f.id AND e.trash = 0) as note_count
                 FROM folders f";

$search_params = [];

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " WHERE f.workspace = ?";
	$search_params[] = $workspace;
}

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$folders = [];
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$folders[(int)$row['id']] = $row;
}

// Same order as the sidebar tree: the one global sort mode (#1442)
$folders = sortFolders($folders, poznoteNormalizeNoteSort(getSetting('note_list_sort', POZNOTE_NOTE_SORT_DEFAULT)));

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
 * Whether the "Archive folder" action applies to folders of $workspace
 */
function canArchiveFoldersFrom($workspace) {
	return trim((string)$workspace) !== POZNOTE_ARCHIVE_WORKSPACE
		&& (!function_exists('isSharedWorkspaceScopeActive') || !isSharedWorkspaceScopeActive());
}

/**
 * The folder actions, in the order they appear.
 *
 * On desktop the 'inline' ones are icon buttons of each row and the others
 * fill the dropdown of the row's three-dot button. Mirrors the folder actions
 * dropdown of index.php, minus the create entry and the ones needing its
 * notes list DOM.
 *
 * @return array List of action descriptors
 */
function folderListActions() {
	return [
		[
			'action' => 'favorite-folder',
			'icon' => 'lucide-star',
			'label' => t_h('notes_list.folder_actions.remove_favorite', [], 'Remove from favorites'),
			'when_favorite' => true,
			'inline' => true,
			'active' => true,
		],
		[
			'action' => 'favorite-folder',
			'icon' => 'lucide-star',
			'label' => t_h('notes_list.folder_actions.add_favorite', [], 'Add to favorites'),
			'when_favorite' => false,
			'inline' => true,
		],
		[
			'action' => 'share-folder',
			'icon' => 'lucide-share-2',
			'label' => t_h('notes_list.folder_actions.is_public', [], 'Is public'),
			'when_shared' => true,
			'inline' => true,
			'active' => true,
		],
		[
			'action' => 'share-folder',
			'icon' => 'lucide-share-2',
			'label' => t_h('notes_list.folder_actions.share_folder', [], 'Make public'),
			'when_shared' => false,
			'inline' => true,
		],
		[
			'action' => 'rename-folder',
			'icon' => 'lucide-pencil',
			'label' => t_h('notes_list.folder_actions.rename_folder', [], 'Rename'),
			'inline' => true,
		],
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
		// Keep offline: the folder's notes, subfolders included, stay in the
		// browser whatever their date (Offline Copies). Two variants, the one
		// matching the folder state is shown (state_class, list_folders.js).
		[
			'action' => 'offline-folder',
			'icon' => 'lucide-wifi-off',
			'label' => t_h('notes_list.folder_actions.stop_offline', [], 'Stop keeping offline'),
			'state_class' => 'offline-state-kept',
			'undo' => true,
		],
		[
			'action' => 'offline-folder',
			'icon' => 'lucide-wifi-off',
			'label' => t_h('notes_list.folder_actions.keep_offline', [], 'Keep offline'),
			'state_class' => 'offline-state-not-kept',
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
			'action' => 'duplicate-folder',
			'icon' => 'lucide-copy',
			'label' => t_h('notes_list.folder_actions.duplicate_folder', [], 'Duplicate folder'),
		],
		[
			'action' => 'download-folder',
			'icon' => 'lucide-download',
			'label' => t_h('notes_list.folder_actions.download_folder', [], 'Download folder'),
			'requires_notes' => true,
		],
		[
			'action' => 'tag-folder-notes',
			'icon' => 'lucide-tag',
			'label' => t_h('modals.tag_folder_notes.title', [], 'Tag all notes'),
			'requires_notes' => true,
		],
		[
			'action' => 'change-folder-icon',
			'icon' => 'lucide-palette',
			'label' => t_h('notes_list.folder_actions.change_icon', [], 'Change icon'),
		],
		// Archive folder, dropped where index.php's folder menu drops it
		// (renderFolderActionsMenu): inside the archive workspace, and in a
		// session confined to a workspace shared with it
		...(canArchiveFoldersFrom($GLOBALS['workspace'] ?? '') ? [[
			'action' => 'archive-folder',
			'icon' => 'lucide-archive',
			'label' => t_h('archive.folder_menu_item', [], 'Archive folder'),
		]] : []),
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
	$icon_color = htmlspecialchars(poznoteIconColorCss($folder['icon_color'] ?? ''), ENT_QUOTES);
	$note_count = (int)$folder['note_count'];
	$is_shared = isset($sharedFolderIds[(int)$folder['id']]) ? '1' : '0';
	$is_favorite = !empty($folder['favorite']) ? '1' : '0';
	$is_offline = !empty($folder['offline']) ? '1' : '0';

	$kanban_url = 'index.php?kanban=' . $folder_id . '&workspace=' . urlencode($workspace);

	echo '<div class="shared-note-item folder-item" data-action="open-folder-kanban" data-kanban-url="' . htmlspecialchars($kanban_url, ENT_QUOTES) . '" data-folder-name="' . $folder_name . '" data-depth="' . (int)$depth . '" style="cursor: pointer; padding: 6px 15px; padding-left: ' . (15 + $depth * 22) . 'px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; box-shadow: none !important;">';

	echo '<div class="note-name-container" style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">';
	$icon_style = 'style="' . ($icon_color ? 'color: ' . $icon_color . ' !important; ' : '') . 'filter: none !important;"';
	echo '<div class="shared-folder-icon" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent !important; border-radius: 8px; flex: 0 0 auto;">';
	echo '<i class="' . $folder_icon . '" ' . $icon_style . '></i>';
	echo '</div>';
	echo '<span class="folder-name-text" style="font-weight: 500; font-size: 16px; color: var(--pz-text);">' . $folder_name . ' <span style="font-size: 14px; color: var(--pz-text-muted); font-weight: 400;">(' . $note_count . ')</span></span>';
	echo '</div>';

	// Folder identity, carried by every action button of the row
	$folderAttrs = ' data-folder-id="' . $folder_id . '" data-folder-name="' . $folder_name . '"'
		. ' data-note-count="' . $note_count . '" data-shared="' . $is_shared . '"'
		. ' data-favorite="' . $is_favorite . '" data-offline="' . $is_offline . '"';

	echo '<div class="folder-list-actions">';

	// Desktop: the inline actions as icons, the others in the dropdown of the
	// three-dot button. Mobile keeps only the three-dot button, which opens
	// every action in a modal.
	echo '<div class="folder-inline-actions">';
	foreach (folderListActions() as $action) {
		if (empty($action['inline'])) {
			continue;
		}
		// Only the variant matching the folder state is rendered
		if (isset($action['when_shared']) && $action['when_shared'] !== ($is_shared === '1')) {
			continue;
		}
		if (isset($action['when_favorite']) && $action['when_favorite'] !== ($is_favorite === '1')) {
			continue;
		}

		$classes = 'folder-inline-action-btn' . (!empty($action['active']) ? ' is-active' : '');
		$label = $action['label'];
		echo '<button type="button" class="' . $classes . '"'
			. ' title="' . $label . '" aria-label="' . $label . '"'
			. ' data-action="' . $action['action'] . '"' . $folderAttrs . '>';
		echo '<i class="lucide ' . $action['icon'] . '"></i>';
		echo '</button>';
	}
	echo '</div>';

	echo '<button type="button" class="folder-list-menu-btn" data-action="open-folder-actions-modal"'
		. $folderAttrs
		. ' title="' . t_h('notes_list.folder_actions.menu', [], 'Folder actions') . '"'
		. ' aria-label="' . t_h('notes_list.folder_actions.menu', [], 'Folder actions') . '">';
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
	<script src="js/session-guard.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderStylesheets('list_folders'); ?>
	<!-- Base styling of the folder action items reused in the actions modal -->
	<!-- Icon picker opened by the "Change icon" action -->
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
		/* css/shared/notes-list.css pads the name cell for the notes table;
		   a folder row takes its vertical spacing from its own padding only */
		.folder-item .note-name-container {
			padding-top: 0;
			padding-bottom: 0;
		}
		.folder-list-actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 4px;
			flex: 0 0 auto;
		}
		/* Desktop shows the frequent actions as icons next to the three-dot
		   button; mobile keeps only the button (see the media query). */
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
		.folder-list-menu-btn,
		.folder-delete-btn {
			display: inline-flex;
		}
		.folder-inline-action-btn,
		.folder-list-menu-btn {
			color: var(--text-muted, #6b7280);
		}
		.folder-inline-action-btn:hover {
			background-color: rgba(107, 114, 128, 0.12);
			color: #007DB8;
		}
		/* A favorite or publicly shared folder: its star or share icon is lit */
		.folder-inline-action-btn.is-active {
			color: var(--pz-accent-text);
		}
		html[data-theme='dark'] .folder-inline-action-btn,
		body.dark-mode .folder-inline-action-btn {
			color: var(--pz-text-muted, #9ca3af);
		}
		html[data-theme='dark'] .folder-inline-action-btn.is-active,
		body.dark-mode .folder-inline-action-btn.is-active {
			color: var(--pz-accent-text);
		}
		html[data-theme='dark'] .folder-inline-action-btn:hover,
		body.dark-mode .folder-inline-action-btn:hover {
			background-color: rgba(255, 255, 255, 0.08);
			color: #38bdf8;
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
		/* .open: its dropdown is showing */
		.folder-list-menu-btn:hover,
		.folder-list-menu-btn.open {
			background-color: rgba(107, 114, 128, 0.12);
			color: #007DB8;
		}
		.folder-inline-action-btn i,
		.folder-list-menu-btn i {
			font-size: 14px;
			line-height: 1;
			/* css/dark-mode/icons.css gives every Lucide icon a colour of its
			   own, which would beat the button colour set above */
			color: inherit;
			/* Lucide icons are CSS masks: the mask needs background-color too */
			background-color: currentColor;
		}
		html[data-theme='dark'] .folder-list-menu-btn,
		body.dark-mode .folder-list-menu-btn {
			color: var(--pz-text-muted, #9ca3af);
		}
		html[data-theme='dark'] .folder-list-menu-btn:hover,
		body.dark-mode .folder-list-menu-btn:hover,
		html[data-theme='dark'] .folder-list-menu-btn.open,
		body.dark-mode .folder-list-menu-btn.open {
			background-color: rgba(255, 255, 255, 0.08);
			color: #38bdf8;
		}
		/* Half the page width for the filter bar and the list alike: spanning
		   the whole page left them mostly empty, the row icons far from the
		   folder names. Mobile keeps the full width. */
		@media (min-width: 801px) {
			.shared-filter-bar,
			#foldersList {
				max-width: calc(min(var(--shared-content-max-width, 980px), 100%) / 2);
			}
			/* Rows edge to edge with the filter bar: the uneven side padding
			   of css/shared/notes-list.css is laid out for the shared notes table */
			#foldersList {
				padding-left: 0;
				padding-right: 0;
			}
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
			/* Too narrow for a row of icons: every action goes through the
			   three-dot button, which opens the actions modal here */
			.folder-inline-actions {
				display: none;
			}
			.shared-container {
				padding: 10px !important;
			}
			.folder-item {
				/* padding-left carries the per-row indentation of nested
				   folders (set inline), so it is left out of the !important
				   shorthand that would otherwise flatten the hierarchy */
				padding-top: 6px !important;
				padding-right: 15px !important;
				padding-bottom: 6px !important;
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
				width: 28px !important;
				height: 28px !important;
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
<body class="shared-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>" data-archive-workspace="<?php echo htmlspecialchars(POZNOTE_ARCHIVE_WORKSPACE, ENT_QUOTES, 'UTF-8'); ?>">
	<?php $iconSidebarWorkspace = $workspace; include __DIR__ . '/../icon_sidebar.php'; ?>
	<div class="shared-container">
		<h1 class="poznote-page-title"><i class="lucide lucide-folder-open"></i> <?php echo t_h('home.folders', [], 'Folders'); ?> <?php echo poznoteRenderPageTitleWorkspace($workspace); ?></h1>

		
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

	<!-- Desktop dropdown of the three-dot button of each row: the actions that
	     are not row icons. Shares the look of the index.php folder dropdown
	     (css/folders/actions-menu.css); list_folders.js places it and carries
	     the folder identity onto its items. -->
	<div class="folder-actions-menu" id="folderRowActionsMenu">
		<?php
		foreach (folderListActions() as $action) {
			if (!empty($action['inline'])) {
				continue;
			}
			$classes = 'folder-actions-menu-item';
			if (!empty($action['requires_notes'])) {
				$classes .= ' requires-notes';
			}
			if (!empty($action['state_class'])) {
				$classes .= ' ' . $action['state_class'];
			}
			if (!empty($action['undo'])) {
				// Undoing a state reads in red, as removing a favorite does
				$classes .= ' danger';
			}
			if (!empty($action['danger'])) {
				// Set the destructive action apart from the rest
				echo '<div class="folder-actions-menu-separator"></div>';
				$classes .= ' danger';
			}
			echo '<div class="' . $classes . '" data-action="' . $action['action'] . '">';
			echo '<i class="lucide ' . $action['icon'] . '"></i>';
			echo '<span>' . $action['label'] . '</span>';
			echo '</div>';
		}
		?>
	</div>

	<!-- Folder actions modal: opened by the three-dot button of each row on mobile.
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
					<div class="folder-actions-menu-item" data-action="duplicate-folder">
						<i class="lucide lucide-copy"></i>
						<span><?php echo t_h('notes_list.folder_actions.duplicate_folder', [], 'Duplicate folder'); ?></span>
					</div>
					<div class="folder-actions-menu-item requires-notes" data-action="download-folder">
						<i class="lucide lucide-download"></i>
						<span><?php echo t_h('notes_list.folder_actions.download_folder', [], 'Download folder'); ?></span>
					</div>
					<div class="folder-actions-menu-item requires-notes" data-action="tag-folder-notes">
						<i class="lucide lucide-tag"></i>
						<span><?php echo t_h('modals.tag_folder_notes.title', [], 'Tag all notes'); ?></span>
					</div>
					<div class="folder-actions-menu-item active-state share-state-shared" data-action="share-folder">
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
					<div class="folder-actions-menu-item offline-state-kept danger" data-action="offline-folder">
						<i class="lucide lucide-wifi-off"></i>
						<span><?php echo t_h('notes_list.folder_actions.stop_offline', [], 'Stop keeping offline'); ?></span>
					</div>
					<div class="folder-actions-menu-item offline-state-not-kept" data-action="offline-folder">
						<i class="lucide lucide-wifi-off"></i>
						<span><?php echo t_h('notes_list.folder_actions.keep_offline', [], 'Keep offline'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="rename-folder">
						<i class="lucide lucide-pencil"></i>
						<span><?php echo t_h('notes_list.folder_actions.rename_folder', [], 'Rename'); ?></span>
					</div>
					<div class="folder-actions-menu-item" data-action="change-folder-icon">
						<i class="lucide lucide-palette"></i>
						<span><?php echo t_h('notes_list.folder_actions.change_icon', [], 'Change icon'); ?></span>
					</div>
					<?php if (canArchiveFoldersFrom($workspace)): ?>
					<div class="folder-actions-menu-item" data-action="archive-folder">
						<i class="lucide lucide-archive"></i>
						<span><?php echo t_h('archive.folder_menu_item', [], 'Archive folder'); ?></span>
					</div>
					<?php endif; ?>
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
	include __DIR__ . '/../modals/folder_icon_modal.php';
	include __DIR__ . '/../modals/tag_folder_notes_modal.php';
	?>

	<script src="<?php echo poznoteAsset('js/globals.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/modal-alerts.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/ui.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-note-create.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-folders.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-updates.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-move-folder.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-folder-tree.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-move-note.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-export-create.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-menus.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-note-rename.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/utils-kanban.js'); ?>"></script>
	<!-- Folder action implementations reused from index.php: share modal, icon
	     picker and the modal confirm-button delegation. Load order follows
	     index_js.php (the utils-*.js set before share.js/folder-icon.js). -->
	<!-- share.js reads the public URL protocol from pwa-helpers.js: without
	     it the share status lookup threw and an already shared folder was
	     offered a new share -->
	<script src="<?php echo poznoteAsset('js/pwa-helpers.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/share.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/color-palette.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/folder-icon.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/modals-events.js'); ?>"></script>
	<?php // "Keep offline" brings this browser's copies up to date at once (writes-only mode) ?>
	<script src="<?php echo poznoteAsset('js/offline-store.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/offline-sync.js'); ?>" data-offline-mode="writes"></script>
	<script src="<?php echo poznoteAsset('js/list_folders.js'); ?>"></script>
	<?php // Marks the notes and folders kept offline in this browser ?>
	<script src="<?php echo poznoteAsset('js/offline-marks.js'); ?>" defer
		data-note-title="<?php echo t_h('notes_list.note_actions.available_offline', [], 'Available offline in this browser'); ?>"
		data-folder-title="<?php echo t_h('notes_list.folder_actions.kept_offline', [], 'Kept offline in this browser'); ?>"></script>
</body>
</html>

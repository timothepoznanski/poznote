<?php
/**
 * Notes - All notes in a filterable, hierarchical list with bulk operations
 */
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
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
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/favorites.css"/>
	<link type="text/css" rel="stylesheet" href="css/notes-manager.css"/>
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
<body class="notes-manager-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
      data-txt-loading="<?php echo t_h('common.loading', [], 'Loading...'); ?>"
      data-txt-no-folder="<?php echo t_h('notes_list.system_folders.no_folder', [], 'No folder'); ?>"
      data-txt-select-folder="<?php echo t_h('notes_manager.select_folder', [], 'Select a target folder'); ?>"
      data-txt-move="<?php echo t_h('notes_manager.move', [], 'Move'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-txt-selected="<?php echo t_h('notes_manager.selected', [], 'selected'); ?>"
      data-txt-select-all="<?php echo t_h('notes_manager.select_all', [], 'Select all'); ?>"
      data-txt-deselect-all="<?php echo t_h('notes_manager.deselect_all', [], 'Deselect all'); ?>"
      data-txt-move-to="<?php echo t_h('notes_manager.move_to', [], 'Move to...'); ?>"
	data-txt-choose-action="<?php echo t_h('notes_manager.choose_action', [], 'Choose an action...'); ?>"
	data-txt-add-tag="<?php echo t_h('notes_manager.add_tag', [], 'Add tag'); ?>"
	data-txt-remove-tag="<?php echo t_h('notes_manager.remove_tag', [], 'Remove tag'); ?>"
	data-txt-add-favorite="<?php echo t_h('notes_manager.add_favorite', [], 'Add to favorites'); ?>"
	data-txt-remove-favorite="<?php echo t_h('notes_manager.remove_favorite', [], 'Remove from favorites'); ?>"
	data-txt-trash="<?php echo t_h('notes_manager.move_to_trash', [], 'Move to trash'); ?>"
	data-txt-trash-confirm="<?php echo t_h('notes_manager.trash_confirm', [], 'Move the selected notes to trash?'); ?>"
	data-txt-enter-tag="<?php echo t_h('notes_manager.enter_tag', [], 'Enter at least one tag'); ?>"
	data-txt-tags-placeholder="<?php echo t_h('notes_manager.tags_placeholder', [], 'tag1, tag2'); ?>"
	data-txt-applying="<?php echo t_h('notes_manager.applying', [], 'Applying...'); ?>"
      data-txt-moving="<?php echo t_h('notes_manager.moving', [], 'Moving...'); ?>"
      data-txt-moved="<?php echo t_h('notes_manager.moved', [], 'Moved successfully'); ?>"
      data-txt-root="<?php echo t_h('notes_manager.root', [], 'Root (no folder)'); ?>">

	<div class="notes-manager-container">

		<!-- Navigation buttons -->
		<div class="favorites-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<i class="lucide lucide-home" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
		</div>

		<h1 class="notes-manager-title">
			<?php if ($pageWorkspace): ?>
				<span class="notes-manager-workspace-badge"><?php echo htmlspecialchars($pageWorkspace); ?></span>
			<?php endif; ?>
		</h1>

		<!-- Filter bar -->
		<div class="nm-filter-bar">
			<div class="filter-input-wrapper">
				<i class="lucide lucide-search nm-filter-icon"></i>
				<input
					type="text"
					id="nmFilterInput"
					class="filter-input"
					placeholder="<?php echo t_h('notes_manager.filter_placeholder', [], 'Filter notes by title or tags...'); ?>"
					autocomplete="off"
				/>
				<button id="nmClearFilter" class="clear-filter-btn initially-hidden" title="<?php echo t_h('search.clear', [], 'Clear'); ?>">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			<div id="nmFilterStats" class="filter-stats initially-hidden"></div>
		</div>

		<!-- Bulk action bar (hidden by default) -->
		<div id="nmBulkBar" class="nm-bulk-bar nm-bulk-bar-hidden">
			<div class="nm-bulk-count-wrap">
				<span id="nmSelectedCount" class="nm-selected-count"></span>
			</div>
			<div class="nm-bulk-actions">
				<button id="nmSelectAllBtn" class="btn btn-sm btn-secondary nm-bulk-btn">
					<?php echo t_h('notes_manager.select_all', [], 'Select all visible'); ?>
				</button>
				<button id="nmDeselectAllBtn" class="btn btn-sm btn-secondary nm-bulk-btn">
					<?php echo t_h('notes_manager.deselect_all', [], 'Deselect all'); ?>
				</button>
				<select
					id="nmBulkActionSelect"
					class="nm-bulk-select"
					disabled
					aria-label="<?php echo t_h('notes_manager.actions', [], 'Bulk actions'); ?>"
				>
					<option value=""><?php echo t_h('notes_manager.choose_action', [], 'Choose an action...'); ?></option>
					<option value="move"><?php echo t_h('notes_manager.move_to', [], 'Move to...'); ?></option>
					<option value="add-tag"><?php echo t_h('notes_manager.add_tag', [], 'Add tag'); ?></option>
					<option value="remove-tag"><?php echo t_h('notes_manager.remove_tag', [], 'Remove tag'); ?></option>
					<option value="add-favorite"><?php echo t_h('notes_manager.add_favorite', [], 'Add to favorites'); ?></option>
					<option value="remove-favorite"><?php echo t_h('notes_manager.remove_favorite', [], 'Remove from favorites'); ?></option>
					<option value="trash"><?php echo t_h('notes_manager.move_to_trash', [], 'Move to trash'); ?></option>
				</select>
			</div>
			</div>
		</div>

		<!-- Notes list -->
		<div class="nm-content">
			<div id="nmSpinner" class="loading-spinner">
				<i class="lucide lucide-loader-2 lucide-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="nmNotesContainer"></div>
			<div id="nmEmptyMessage" class="empty-message initially-hidden">
				<p><?php echo t_h('notes_manager.empty', [], 'No notes found.'); ?></p>
			</div>
		</div>

	</div>

	<!-- Move to folder modal -->
	<div id="nmMoveModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="nmMoveModalTitle">
		<div class="modal-content">
			<div class="modal-header">
				<h3 id="nmMoveModalTitle">
					<?php echo t_h('notes_manager.move_to', [], 'Move to folder'); ?>
				</h3>
			</div>
			<div class="modal-body">
				<div class="nm-folder-search-wrap">
					<input type="text" id="nmFolderSearch" class="filter-input" placeholder="<?php echo t_h('notes_manager.filter_folders', [], 'Filter folders...'); ?>" autocomplete="off" style="width: 100%; margin-bottom: 10px;" />
				</div>
				<div id="nmFolderList" class="nm-folder-list">
					<!-- Folder options rendered by JS -->
				</div>
			</div>
			<div class="modal-buttons">
				<button id="nmConfirmMove" class="btn-primary" disabled>
					<?php echo t_h('notes_manager.move', [], 'Move'); ?>
				</button>
				<button id="nmCancelMove" class="btn-cancel">
					<?php echo t_h('common.cancel', [], 'Cancel'); ?>
				</button>
			</div>
		</div>
	</div>

	<!-- Tag modal -->
	<div id="nmTagModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="nmTagModalTitle">
		<div class="modal-content">
			<div class="modal-header">
				<h3 id="nmTagModalTitle">
					<?php echo t_h('notes_manager.add_tag', [], 'Add tag'); ?>
				</h3>
			</div>
			<div class="modal-body">
				<input
					type="text"
					id="nmTagInput"
					class="nm-modal-input"
					placeholder="<?php echo t_h('notes_manager.tags_placeholder', [], 'tag1, tag2'); ?>"
					autocomplete="off"
				/>
			</div>
			<div class="modal-buttons">
				<button id="nmConfirmTag" class="btn-primary" disabled>
					<?php echo t_h('notes_manager.add_tag', [], 'Add tag'); ?>
				</button>
				<button id="nmCancelTag" class="btn-cancel">
					<?php echo t_h('common.cancel', [], 'Cancel'); ?>
				</button>
			</div>
		</div>
	</div>

	<script src="js/navigation.js"></script>
	<script src="js/notes-manager.js"></script>
</body>
</html>

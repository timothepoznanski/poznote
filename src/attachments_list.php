<?php
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
	<script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/notes-list.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/buttons-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/lucide.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/dark-mode.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/attachments_list.css"/>
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
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
</head>
<body class="shared-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>" data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>" data-txt-no-results="<?php echo t_h('attachments.list.no_filter_results', [], 'No results.'); ?>" data-txt-all-file-types="<?php echo t_h('attachments.list.all_file_types', [], 'All types'); ?>">
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary">
				<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>">
				<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>
			</button>
		</div>

		
		<div class="shared-filter-bar attachments-filter-bar">
			<div class="filter-input-wrapper">
				<input type="text" id="filterInput" class="filter-input" placeholder="<?php echo t_h('attachments.list.filter_placeholder', [], 'Filter by note title or attachment name...'); ?>"/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			<select id="fileTypeFilter" class="file-type-filter initially-hidden" aria-label="<?php echo t_h('attachments.list.file_type_filter', [], 'Filter by file type'); ?>" title="<?php echo t_h('attachments.list.file_type_filter', [], 'Filter by file type'); ?>"></select>
			<label class="toggle-checkbox thumbnails-toggle">
				<input type="checkbox" id="showThumbnailsToggle" checked>
				<span class="toggle-label"><?php echo t_h('attachments.list.show_thumbnails', [], 'Show thumbnails in this list'); ?></span>
			</label>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="lucide lucide-loader-2 lucide-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="attachmentsContainer" class="attachments-list-container"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<i class="lucide lucide-paperclip"></i>
				<p><?php echo t_h('attachments.list.no_attachments', [], 'No notes with attachments yet.'); ?></p>
			</div>
		</div>
	</div>
	
	<script src="js/navigation.js"></script>
	<script src="js/attachments-list.js"></script>
</body>
</html>

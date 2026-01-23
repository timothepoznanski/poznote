<?php
require 'auth.php';
requireAuth();

@ob_start();
include 'functions.php';
require_once 'config.php';
include 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo t_h('attachments.list.title', [], 'Notes with Attachments'); ?> - <?php echo t_h('app.name'); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/attachments_list.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="shared-page" data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>" data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>" data-txt-no-results="<?php echo t_h('attachments.list.no_filter_results', [], 'No results.'); ?>">
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
		</div>
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input type="text" id="filterInput" class="filter-input" placeholder="<?php echo t_h('attachments.list.filter_placeholder'); ?>"/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats"></div>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="fa-spinner fa-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="attachmentsContainer" class="attachments-list-container"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<i class="fa-paperclip"></i>
				<p><?php echo t_h('attachments.list.no_attachments', [], 'No notes with attachments yet.'); ?></p>
			</div>
		</div>
	</div>
	
	<script src="js/navigation.js"></script>
	<script src="js/attachments-list.js"></script>
</body>
</html>

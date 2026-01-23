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
	<?php
	require_once 'users/db_master.php';
	$login_display_name = getGlobalSetting('login_display_name', '');
	$pageTitle = ($login_display_name && trim($login_display_name) !== '') ? htmlspecialchars($login_display_name) : t_h('app.name');
	?>
	<title><?php echo $pageTitle; ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/favorites.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="favorites-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
      data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
      data-txt-today="<?php echo t_h('common.date.today', [], 'Today'); ?>"
      data-txt-yesterday="<?php echo t_h('common.date.yesterday', [], 'Yesterday'); ?>"
      data-txt-days-ago="<?php echo t_h('common.date.days_ago', [], 'days ago'); ?>">
	<div class="favorites-container">
		<div class="favorites-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
		</div>
		
		<div class="favorites-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput" 
					class="filter-input" 
					placeholder="<?php echo t_h('public.filter_placeholder', [], 'Filter by title or folder name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="fa fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="favorites-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="fa fa-spinner fa-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="favoritesNotesContainer"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<p><?php echo t_h('favorites.empty', [], 'No favorite notes yet.'); ?></p>
			</div>
		</div>
	</div>
	
	<script src="js/navigation.js"></script>
	<script src="js/favorites-page.js"></script>
</body>
</html>

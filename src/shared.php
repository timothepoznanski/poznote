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
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/shared.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="shared-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
      data-txt-edit-token="<?php echo t_h('public.edit_token', [], 'Click to edit token'); ?>"
      data-txt-token-update-failed="<?php echo t_h('public.token_update_failed', [], 'Failed to update token'); ?>"
      data-txt-network-error="<?php echo t_h('common.network_error', [], 'Network error'); ?>"
      data-txt-indexable="<?php echo t_h('public.indexable', [], 'Indexable'); ?>"
      data-txt-password-protected="<?php echo t_h('public.password_protected', [], 'Password protected'); ?>"
      data-txt-add-password-title="<?php echo t_h('public.add_password_title', [], 'Add password protection'); ?>"
      data-txt-change-password-title="<?php echo t_h('public.change_password_title', [], 'Change Password'); ?>"
      data-txt-password-remove-hint="<?php echo t_h('public.password_remove_hint', [], 'Leave empty to remove password protection.'); ?>"
      data-txt-enter-new-password="<?php echo t_h('public.enter_new_password', [], 'Enter new password'); ?>"
      data-txt-open="<?php echo t_h('public.actions.open', [], 'Open public view'); ?>"
      data-txt-revoke="<?php echo t_h('public.actions.revoke', [], 'Revoke'); ?>"
      data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
      data-txt-today="<?php echo t_h('common.date.today', [], 'Today'); ?>"
      data-txt-yesterday="<?php echo t_h('common.date.yesterday', [], 'Yesterday'); ?>"
      data-txt-days-ago="<?php echo t_h('common.date.days_ago', [], 'days ago'); ?>"
      data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
      data-txt-save="<?php echo t_h('common.save', [], 'Save'); ?>"
      data-txt-via-folder="<?php echo t_h('public.via_folder', [], 'Shared via folder'); ?>">
	<div class="shared-container">
		<div class="shared-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
				<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
			</button>
			<button id="sharedFoldersBtn" class="btn btn-shared" title="<?php echo t_h('shared_folders.view_shared_folders', [], 'View shared folders'); ?>">
				<?php echo t_h('shared_folders.button', [], 'Shared Folders'); ?>
			</button>
		</div>
		
		<div class="shared-filter-bar">
			<div class="filter-input-wrapper">
				<input 
					type="text" 
					id="filterInput" 
					class="filter-input" 
					placeholder="<?php echo t_h('public.filter_placeholder', [], 'Filter by title or folder name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="fa-times"></i>
				</button>
			</div>
			<div id="filterStats" class="filter-stats initially-hidden"></div>
		</div>
		
		<div class="shared-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="fa-spinner fa-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="sharedNotesContainer"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
			<p><?php echo t_h('public.page.no_public_notes', [], 'No shared notes yet.'); ?></p>
				<p class="empty-hint"><?php echo t_h('public.page.public_hint', [], 'Share a note by clicking the cloud button in the note toolbar.'); ?></p>
			</div>
		</div>
	</div>
	
	<script src="js/navigation.js"></script>
	<script src="js/shared-page.js"></script>
</body>
</html>

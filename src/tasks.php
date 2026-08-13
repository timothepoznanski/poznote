<?php
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

$rawVersion = @file_get_contents('version.txt');
if ($rawVersion === false) $rawVersion = '0.0.0';
$cache_v = urlencode(poznoteBuildAssetCacheVersion(trim($rawVersion)));
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
	<link type="text/css" rel="stylesheet" href="css/modals/reminders.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/share-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/slash-commands.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/note-reference.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/tasks-page.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css"/>
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="tasks-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-date-time-format="<?php echo htmlspecialchars(getUserDateTimeFormat(), ENT_QUOTES, 'UTF-8'); ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-untitled="<?php echo t_h('common.untitled', [], 'Untitled'); ?>"
      data-txt-progress="<?php echo t_h('tasks_page.progress', [], '{{completed}} of {{total}} tasks completed'); ?>"
      data-txt-no-filter-results="<?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?>"
      data-txt-empty-filtered="<?php echo t_h('tasks_page.empty_filtered', [], 'No tasks match this filter.'); ?>"
      data-txt-collapse="<?php echo t_h('tasks_page.collapse', [], 'Collapse'); ?>"
      data-txt-expand="<?php echo t_h('tasks_page.expand', [], 'Expand'); ?>"
      data-txt-due="<?php echo t_h('tasklist.due_date', [], 'Due date'); ?>"
      data-txt-due-remove="<?php echo t_h('tasklist.due_remove', [], 'Remove due date'); ?>"
      data-txt-due-remove-time="<?php echo t_h('tasklist.due_remove_time', [], 'Remove time'); ?>"
      data-txt-cal-no-tasks="<?php echo t_h('tasks_page.calendar_no_tasks', [], 'No tasks on this day.'); ?>">
	<div class="tasks-container">
		<div class="tasks-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
				<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<button id="backToHomeBtn" class="btn btn-secondary dashboard-nav-btn" title="<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>">
				<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
				<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>
			</button>
		</div>

		<div id="tasksProgressSection" class="tasks-progress-section initially-hidden">
			<div class="tasks-progress-header">
				<h1 class="tasks-title"><i class="lucide lucide-list-todo"></i> <?php echo t_h('tasks_page.title', [], 'Tasks'); ?></h1>
				<span id="tasksProgressLabel" class="tasks-progress-label"></span>
			</div>
			<div class="tasks-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" id="tasksProgressBar">
				<div class="tasks-progress-fill" id="tasksProgressFill"></div>
			</div>
		</div>

		<div class="tasks-filter-bar">
			<div class="tasks-filter-chips" id="tasksFilterChips">
				<button type="button" class="tasks-filter-chip active" data-filter="all"><?php echo t_h('tasks_page.filter_all', [], 'All'); ?></button>
				<button type="button" class="tasks-filter-chip" data-filter="open"><?php echo t_h('tasks_page.filter_open', [], 'To do'); ?></button>
				<button type="button" class="tasks-filter-chip" data-filter="important"><?php echo t_h('tasks_page.filter_important', [], 'Important'); ?></button>
				<button type="button" class="tasks-filter-chip" data-filter="overdue"><?php echo t_h('tasks_page.filter_overdue', [], 'Overdue'); ?></button>
				<button type="button" class="tasks-filter-chip" data-filter="dated"><?php echo t_h('tasks_page.filter_dated', [], 'With due date'); ?></button>
				<button type="button" class="tasks-filter-chip" data-filter="completed"><?php echo t_h('tasks_page.filter_completed', [], 'Completed'); ?></button>
			</div>
			<div class="filter-input-wrapper">
				<input
					type="text"
					id="filterInput"
					class="filter-input"
					placeholder="<?php echo t_h('tasks_page.filter_placeholder', [], 'Filter by task, title or folder name...'); ?>"
				/>
				<button id="clearFilterBtn" class="clear-filter-btn initially-hidden">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			<div class="tasks-view-toggle" id="tasksViewToggle" role="group">
				<button type="button" class="tasks-view-btn active" data-view="list" title="<?php echo t_h('tasks_page.view_list', [], 'List view'); ?>">
					<i class="lucide lucide-layout-list"></i>
				</button>
				<button type="button" class="tasks-view-btn" data-view="calendar" title="<?php echo t_h('tasks_page.view_calendar', [], 'Calendar view'); ?>">
					<i class="lucide lucide-calendar"></i>
				</button>
			</div>
			<div class="tasks-collapse-actions">
				<button id="collapseAllBtn" class="tasks-collapse-btn" title="<?php echo t_h('tasks_page.collapse_all', [], 'Collapse all'); ?>">
					<i class="lucide lucide-chevron-up"></i>
				</button>
				<button id="expandAllBtn" class="tasks-collapse-btn" title="<?php echo t_h('tasks_page.expand_all', [], 'Expand all'); ?>">
					<i class="lucide lucide-chevron-down"></i>
				</button>
			</div>
		</div>

		<div class="tasks-content">
			<div id="loadingSpinner" class="loading-spinner">
				<i class="lucide lucide-loader-2 lucide-spin"></i>
				<?php echo t_h('common.loading', [], 'Loading...'); ?>
			</div>
			<div id="tasksNotesContainer"></div>
			<div id="emptyMessage" class="empty-message initially-hidden">
				<p><?php echo t_h('tasks_page.empty', [], 'No tasks yet. Create a task list note to get started.'); ?></p>
			</div>
		</div>
	</div>

	<?php include 'task_due_modal.php'; ?>

	<!-- Calendar view: modal listing the clicked day's tasks -->
	<div id="calDayModal" class="modal">
		<div class="modal-content">
			<h3 id="calDayModalTitle"></h3>
			<div id="calDayModalList"></div>
			<div class="modal-buttons">
				<button type="button" class="btn-cancel" data-action="close-modal" data-modal="calDayModal"><?php echo t_h('common.close', [], 'Close'); ?></button>
			</div>
		</div>
	</div>

	<script>
	window.calendarTranslations = {
		months: <?php echo json_encode(array_map(static function ($m) {
			return t('calendar.months.' . $m);
		}, ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])); ?>,
		weekdays: <?php echo json_encode(array_map(static function ($d) {
			return t('calendar.weekdays.' . $d);
		}, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])); ?>,
		previousMonth: <?php echo json_encode(t('calendar.buttons.previous_month')); ?>,
		nextMonth: <?php echo json_encode(t('calendar.buttons.next_month')); ?>,
		today: <?php echo json_encode(t('calendar.buttons.today')); ?>,
		apply: <?php echo json_encode(t('common.apply', [], 'Apply')); ?>
	};
	</script>
	<script src="js/navigation.js"></script>
	<script src="js/note-reference.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/date-time-format.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/date-picker-popup.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/task-due-modal.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/tasks-page.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>

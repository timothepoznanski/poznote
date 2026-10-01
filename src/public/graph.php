<?php
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../version_helper.php';

// Respect optional workspace parameter to scope the graph
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

$currentLang = getUserLanguage();
$cache_v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" class="graph-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/session-guard.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderStylesheets('graph'); ?>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="graph-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
    <?php include __DIR__ . '/../icon_sidebar.php'; ?>
	<div class="graph-container">
		<h1 class="poznote-page-title"><span class="poznote-page-title-name"><i class="lucide lucide-network"></i> <?php echo t_h('home.graph', [], 'Graph'); ?></span> <?php echo poznoteRenderPageTitleWorkspace($workspace); ?></h1>

		<div class="graph-toolbar">
			<button type="button" id="graphViewToggle" class="graph-reset-btn graph-icon-btn initially-hidden" data-txt-view="<?php echo t_h('graph.view_toggle', [], 'View'); ?>" data-txt-network="<?php echo t_h('graph.view_network', [], 'Network'); ?>" data-txt-tree="<?php echo t_h('graph.view_tree', [], 'Tree'); ?>">
				<i class="lucide lucide-share-2"></i>
			</button>
			<button type="button" id="graphSearchBtn" class="graph-reset-btn graph-icon-btn" aria-expanded="false" aria-controls="graphSearchWrapper" aria-label="<?php echo t_h('graph.search.placeholder', [], 'Find a note...'); ?>" title="<?php echo t_h('graph.search.placeholder', [], 'Find a note...'); ?>">
				<i class="lucide lucide-search"></i>
			</button>
			<div class="graph-search-wrapper initially-hidden" id="graphSearchWrapper">
				<input
					type="text"
					id="graphSearchInput"
					class="home-search-input graph-search-input"
					placeholder="<?php echo t_h('graph.search.placeholder', [], 'Find a note...'); ?>"
					autocomplete="off"
				>
				<button type="button" id="graphSearchClear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			<button type="button" id="graphFolderFilterBtn" class="graph-reset-btn graph-icon-btn graph-folder-btn initially-hidden" aria-haspopup="dialog" data-txt-all="<?php echo t_h('graph.folder_filter_all', [], 'All folders'); ?>" aria-label="<?php echo t_h('graph.folder_filter_hint', [], 'Show only the notes of one folder'); ?>" title="<?php echo t_h('graph.folder_filter_hint', [], 'Show only the notes of one folder'); ?>">
				<i class="lucide lucide-folder"></i>
			</button>
			<div class="graph-options">
				<button type="button" id="graphSeparateGroups" class="graph-reset-btn graph-icon-btn" disabled aria-label="<?php echo t_h('graph.separate_groups', [], 'Separate groups'); ?>" title="<?php echo t_h('graph.separate_groups_hint', [], 'Lay out each group of linked notes apart from the others'); ?>">
					<i class="lucide lucide-boxes"></i>
				</button>
				<button type="button" id="graphResetLayout" class="graph-reset-btn graph-icon-btn" aria-label="<?php echo t_h('graph.reset_layout', [], 'Reset layout'); ?>" title="<?php echo t_h('graph.reset_layout_hint', [], 'Forget the saved positions and rearrange the graph automatically'); ?>">
					<i class="lucide lucide-rotate-ccw"></i>
				</button>
				<button type="button" id="graphInfoBtn" class="graph-reset-btn graph-icon-btn" aria-haspopup="dialog" aria-label="<?php echo t_h('graph.info', [], 'Information'); ?>" title="<?php echo t_h('graph.info', [], 'Information'); ?>">
					<i class="lucide lucide-info"></i>
				</button>
			</div>
			<div class="graph-checks">
				<label class="graph-orphans-toggle" title="<?php echo t_h('graph.show_orphans_hint', [], 'Show notes that have no links'); ?>">
					<input type="checkbox" id="graphShowOrphans" checked>
					<span><?php echo t_h('graph.show_orphans', [], 'Unlinked notes'); ?></span>
				</label>
				<label class="graph-orphans-toggle" title="<?php echo t_h('graph.show_labels_hint', [], 'Show note titles under the dots'); ?>">
					<input type="checkbox" id="graphShowLabels" checked>
					<span><?php echo t_h('graph.show_labels', [], 'Note titles'); ?></span>
				</label>
				<label class="graph-orphans-toggle initially-hidden" title="<?php echo t_h('graph.show_icons_hint', [], 'Show the icon chosen in the sidebar in place of the dot'); ?>">
					<input type="checkbox" id="graphShowIcons" checked>
					<span><?php echo t_h('graph.show_icons', [], 'Custom icons'); ?></span>
				</label>
				<label class="graph-orphans-toggle initially-hidden" title="<?php echo t_h('graph.show_folders_hint', [], 'Show each folder as a hub linked to its notes'); ?>">
					<input type="checkbox" id="graphShowFolders">
					<span><?php echo t_h('graph.show_folders', [], 'Folders'); ?></span>
				</label>
			</div>
		</div>
		<div class="graph-canvas-wrapper" id="graphCanvasWrapper">
			<div class="graph-loading" id="graphLoading">
				<i class="lucide lucide-network"></i>
				<span><?php echo t_h('graph.loading', [], 'Building graph...'); ?></span>
			</div>
			<div class="graph-empty initially-hidden" id="graphEmpty">
				<i class="lucide lucide-network"></i>
				<p><?php echo t_h('graph.empty', [], 'No notes to display.'); ?></p>
				<p class="graph-empty-hint"><?php echo t_h('graph.empty_hint', [], 'Link notes together with [[Note Title]] to see connections here.'); ?></p>
			</div>
			<svg id="graphSvg" role="img" aria-label="<?php echo t_h('graph.title', [], 'Note graph'); ?>"></svg>
			<div class="graph-tooltip initially-hidden" id="graphTooltip" data-txt-links="<?php echo t_h('graph.tooltip.links', [], '{{count}} links'); ?>" data-txt-folder="<?php echo t_h('graph.tooltip.folder_notes', [], 'Folder · {{count}} notes'); ?>"></div>
		</div>
	</div>

	<!-- Folder filter: pick the folder the graph is narrowed to -->
	<div id="graphFolderModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="graphFolderModalTitle">
		<div class="modal-content">
			<div class="modal-header">
				<h3 id="graphFolderModalTitle"><?php echo t_h('graph.folder_modal_title', [], 'Choose a folder'); ?></h3>
			</div>
			<div class="modal-body">
				<input type="text" id="graphFolderSearch" class="graph-folder-search" placeholder="<?php echo t_h('notes_manager.filter_folders', [], 'Filter folders...'); ?>" autocomplete="off">
				<div id="graphFolderList" class="graph-folder-list" data-txt-empty="<?php echo t_h('graph.folder_modal_empty', [], 'No matching folder.'); ?>"></div>
			</div>
			<div class="modal-buttons">
				<button type="button" id="graphFolderModalClose" class="btn-cancel"><?php echo t_h('common.close', [], 'Close'); ?></button>
			</div>
		</div>
	</div>

	<!-- Information: what the page shows, and what the mouse does on it -->
	<div id="graphInfoModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="graphInfoModalTitle">
		<div class="modal-content">
			<div class="modal-header">
				<h3 id="graphInfoModalTitle"><?php echo t_h('graph.info', [], 'Information'); ?></h3>
			</div>
			<div class="modal-body">
				<p class="graph-stats" id="graphStats" data-txt-stats="<?php echo t_h('graph.stats', [], '{{notes}} notes · {{links}} links'); ?>"></p>
				<ul class="graph-info-help">
					<li><?php echo t_h('graph.help_ctrl_drag', [], 'Ctrl + drag moves a dot on its own, independently of its links'); ?></li>
					<li><?php echo t_h('graph.help_ctrl_drag_line', [], 'Ctrl + drag on a line moves the folder it comes from with everything in it'); ?></li>
					<li><?php echo t_h('graph.help_scroll', [], 'Scroll moves the view up and down'); ?></li>
					<li><?php echo t_h('graph.help_zoom', [], 'Ctrl + scroll zooms in and out'); ?></li>
				</ul>
			</div>
			<div class="modal-buttons">
				<button type="button" id="graphInfoModalClose" class="btn-cancel"><?php echo t_h('common.close', [], 'Close'); ?></button>
			</div>
		</div>
	</div>

	<script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/color-palette.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/graph.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
</body>
</html>

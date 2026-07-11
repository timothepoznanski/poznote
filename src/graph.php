<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'version_helper.php';

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
	<link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/graph.css?v=<?php echo $cache_v; ?>"/>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
</head>
<body class="graph-page" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<div class="graph-container">
		<div class="graph-toolbar">
			<div class="graph-actions">
				<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
					<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
					<?php echo t_h('common.back_to_notes'); ?>
				</button>
				<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>">
					<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
					<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>
				</button>
			</div>
			<div class="graph-search-wrapper">
				<input
					type="text"
					id="graphSearchInput"
					class="home-search-input graph-search-input"
					placeholder="<?php echo t_h('graph.search.placeholder', [], 'Find a note...'); ?>"
					autocomplete="off"
				>
			</div>
			<div class="graph-options">
				<label class="graph-orphans-toggle" title="<?php echo t_h('graph.show_orphans_hint', [], 'Show notes that have no links'); ?>">
					<input type="checkbox" id="graphShowOrphans" checked>
					<span><?php echo t_h('graph.show_orphans', [], 'Unlinked notes'); ?></span>
				</label>
				<span class="graph-stats" id="graphStats" data-txt-stats="<?php echo t_h('graph.stats', [], '{{notes}} notes · {{links}} links'); ?>"></span>
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
			<div class="graph-tooltip initially-hidden" id="graphTooltip" data-txt-links="<?php echo t_h('graph.tooltip.links', [], '{{count}} links'); ?>"></div>
		</div>
	</div>

	<script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/graph.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>

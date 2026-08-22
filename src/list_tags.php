<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';
require_once 'version_helper.php';

// Build query with folder exclusions like in index.php
$where_conditions = ["trash = 0"];
$search_params = [];

// Scope the tag list to the effective workspace, like every other secondary
// page: getWorkspaceFilter() honours ?workspace= first, then the default /
// last-opened setting. Reading the parameter directly left the page listing
// the tags of every workspace whenever it was missing, while the search behind
// a tag click stayed workspace-scoped.
$workspace = trim((string)getWorkspaceFilter());
if ($workspace === '__last_opened__') {
	$workspace = '';
}

$where_clause = implode(" AND ", $where_conditions);

// Execute query with proper parameters
$select_query = "SELECT tags FROM entries WHERE $where_clause";

// Add workspace condition if provided
if (!empty($workspace)) {
	$select_query .= " AND workspace = ?";
	$search_params[] = $workspace;
}

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$tags_list = []; // tag => note count

while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
	$words = explode(',', $row['tags']);
	foreach($words as $word) {
		$word = trim($word);
		if (!empty($word)) {
			$tags_list[$word] = ($tags_list[$word] ?? 0) + 1;
		}
	}
}

$count_tags = count($tags_list);

uksort($tags_list, function($a, $b) {
	return strnatcasecmp($a, $b);
});

$currentLang = getUserLanguage();
$cache_v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" class="tags-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
	<link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/search.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/cards.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/buttons.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/dark-mode.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/responsive.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/list_tags.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/icon-sidebar.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/icon-sidebar-page.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/icon-sidebar-mobile.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/attachments.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/share-modal.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/menus.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/editor.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/markdown.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/kanban.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/icons.css?v=<?php echo $cache_v; ?>"/>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="tags-page has-icon-sidebar" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<?php
	$iconSidebarWorkspace = $workspace;
	include 'icon_sidebar.php';
	?>
	<div class="tags-container">
		<h1 class="poznote-page-title"><i class="lucide lucide-tags"></i> <?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?></h1>

		
		
		<div class="home-search-container">
			<div class="home-search-wrapper">
				<input 
					type="text" 
					id="tagsSearchInput"
					class="home-search-input tags-search-no-icon"
					placeholder="<?php echo t_h('tags.search.placeholder', [], 'Filter tags...'); ?>"
					autocomplete="off"
				>
			</div>
		</div>
		
		<?php
		// Resolve every tag's color up front: the grid needs it for the dots, and
		// the color filter bar only offers colors that are actually in use.
		$tagColorsMap = getTagColorsMap();
		$tagHexes = [];
		$hasUncoloredTag = false;
		foreach ($tags_list as $tag => $count) {
			if (trim((string)$tag) === '') {
				continue;
			}
			// Lowercased so the swatch values and the grid's data-color, which the
			// JS filter compares directly, always agree.
			$hex = strtolower(resolveTagColorHex($tag, $tagColorsMap));
			$tagHexes[$tag] = $hex;
			if ($hex === '') {
				$hasUncoloredTag = true;
			}
		}
		$usedHexes = array_values(array_unique(array_filter($tagHexes, static function ($hex) {
			return $hex !== '';
		})));
		sort($usedHexes);
		?>
		<?php // Always rendered (hidden while empty) so JS can repopulate it after a recolor. ?>
		<div class="tags-color-filter<?php echo empty($usedHexes) ? ' initially-hidden' : ''; ?>" id="tagsColorFilter" role="group" aria-label="<?php echo t_h('tags.color_filter.label', [], 'Filter by color'); ?>">
			<?php foreach ($usedHexes as $hex): ?>
			<button type="button"
					class="tag-color-filter-swatch"
					data-color-filter="<?php echo htmlspecialchars($hex, ENT_QUOTES); ?>"
					style="--filter-color: <?php echo htmlspecialchars($hex, ENT_QUOTES); ?>;"
					aria-pressed="false"
					title="<?php echo htmlspecialchars($hex, ENT_QUOTES); ?>"></button>
			<?php endforeach; ?>
			<?php if ($hasUncoloredTag): ?>
			<button type="button"
					class="tag-color-filter-swatch tag-color-filter-none"
					data-color-filter="__none__"
					aria-pressed="false"
					title="<?php echo t_h('tags.color_filter.none', [], 'No color'); ?>"></button>
			<?php endif; ?>
			<button type="button" class="tag-color-filter-clear initially-hidden" id="tagsColorFilterClear">
				<?php echo t_h('tags.color_filter.clear', [], 'Clear color filter'); ?>
			</button>
		</div>

		<div class="tags-info">
			<?php
				if ($count_tags === 1) {
					echo t_h('tags.count.one', ['count' => $count_tags], 'There is {{count}} tag total');
				} else {
					echo t_h('tags.count.other', ['count' => $count_tags], 'There are {{count}} tags total');
				}
			?>
		</div>

		<div class="tags-grid" id="tagsList">
		<?php
		if (empty($tags_list)) {
			echo '<div class="no-tags">' . t_h('tags.empty', [], 'No tags found.') . '</div>';
		} else {
			foreach($tags_list as $tag => $count) {
				if (!empty(trim($tag))) {
					$tagHex = $tagHexes[$tag] ?? '';
					$dot = $tagHex !== ''
						? '<span class="tag-color-dot" style="background: ' . htmlspecialchars($tagHex, ENT_QUOTES) . ';"></span>'
						: '';
					echo '<div class="tag-item" data-tag="' . htmlspecialchars($tag, ENT_QUOTES) . '" data-color="' . htmlspecialchars($tagHex, ENT_QUOTES) . '" data-count="' . $count . '">
						<div class="tag-name">' . $dot . htmlspecialchars($tag).'<span class="tag-note-count">('.$count.')</span></div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script>
	window.TAG_COLORS = <?php echo json_encode(getTagColorsMap(), JSON_UNESCAPED_UNICODE | JSON_FORCE_OBJECT); ?>;
	window.NOTE_COLOR_PALETTE = <?php echo json_encode(getNoteColorPalette(), JSON_UNESCAPED_UNICODE); ?>;
	</script>
	<script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/list_tags.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/clickable-tags.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>

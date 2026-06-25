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

// Respect optional workspace parameter to scope tags
$workspace = isset($_GET['workspace']) ? trim($_GET['workspace']) : (isset($_POST['workspace']) ? trim($_POST['workspace']) : '');

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
	<link type="text/css" rel="stylesheet" href="css/modals/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/attachments.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/link-modal.css?v=<?php echo $cache_v; ?>"/>
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
</head>
<body class="tags-page" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<div class="tags-container">
		<div class="tags-buttons-container">
			<div class="tags-actions">
				<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
					<i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
					<?php echo t_h('common.back_to_notes'); ?>
				</button>
				<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>">
					<i class="lucide lucide-layout-dashboard" style="margin-right: 5px;"></i>
					<?php echo t_h('common.back_to_home', [], 'Dashboard'); ?>
				</button>
			</div>
		</div>
		
		
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
					echo '<div class="tag-item" data-tag="' . htmlspecialchars($tag, ENT_QUOTES) . '" data-count="' . $count . '">
						<div class="tag-name">'.htmlspecialchars($tag).'<span class="tag-note-count">('.$count.')</span></div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/list_tags.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/clickable-tags.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>

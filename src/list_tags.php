<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

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

$tags_list = [];

while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {   
	$words = explode(',', $row['tags']);
	foreach($words as $word) {
		$word = trim($word); // Clean spaces
		if (!empty($word)) { // Verify that tag is not empty
			if (!in_array($word, $tags_list)) {
				$tags_list[] = $word;
			}
		}		
	}
}

$count_tags = count($tags_list);

sort($tags_list, SORT_NATURAL | SORT_FLAG_CASE);

$currentLang = getUserLanguage();
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" class="tags-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js"></script>
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/search.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/alerts.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/cards.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/buttons.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/fontawesome.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/dark-mode.css"/>
	<link type="text/css" rel="stylesheet" href="css/home/responsive.css"/>
	<link type="text/css" rel="stylesheet" href="css/list_tags.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/specific-modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/attachments.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/link-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/share-modal.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/alerts-utilities.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals/responsive.css"/>
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
<body class="tags-page" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<div class="tags-container">
		<div class="tags-buttons-container">
			<div class="tags-actions">
				<button id="backToNotesBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_notes'); ?>">
					<?php echo t_h('common.back_to_notes'); ?>
				</button>
				<button id="backToHomeBtn" class="btn btn-secondary" title="<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>">
					<?php echo t_h('common.back_to_home', [], 'Back to Home'); ?>
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
			foreach($tags_list as $tag) {
				if (!empty(trim($tag))) {
					$tag_encoded = urlencode($tag);
					echo '<div class="tag-item" data-tag="' . htmlspecialchars($tag_encoded, ENT_QUOTES) . '">
						<div class="tag-name">'.htmlspecialchars($tag).'</div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script src="js/globals.js"></script>
	<script src="js/navigation.js"></script>
	<script src="js/list_tags.js"></script>
	<script src="js/clickable-tags.js"></script>
</body>
</html>

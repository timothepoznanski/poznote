<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

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
	<title><?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?> - <?php echo t_h('app.name'); ?></title>
<script>(function(){try{var t=localStorage.getItem('poznote-theme');if(!t){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t==='dark'?'dark':'light';r.style.backgroundColor=t==='dark'?'#1a1a1a':'#ffffff';}catch(e){}})();</script>
<meta name="color-scheme" content="dark light">
	<link type="text/css" rel="stylesheet" href="css/fontawesome.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/light.min.css"/>
	<link type="text/css" rel="stylesheet" href="css/list_tags.css"/>
	<link type="text/css" rel="stylesheet" href="css/modals.css"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode.css"/>
	<script src="js/theme-manager.js"></script>
</head>
<body class="tags-page">
	<div class="tags-container">
		<div class="tags-buttons-container">
			<button id="backToNotesBtn" class="btn btn-secondary" onclick="goBackToNotes()" title="<?php echo t_h('common.back_to_notes'); ?>">
				<?php echo t_h('common.back_to_notes'); ?>
			</button>
			<h1 class="tags-header"><?php echo t_h('notes_list.system_folders.tags', [], 'Tags'); ?></h1>
		</div>
		
        
		
		<form class="tags-search-form">
			<input 
				type="text" 
				id="tagsSearchInput"
				class="tags-search-input"
				placeholder="<?php echo t_h('tags.search.placeholder', [], 'Filter tags...'); ?>"
				autocomplete="off"
			>
		</form>
		
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
					echo '<div class="tag-item" onclick="redirectToTag(\'' . htmlspecialchars($tag_encoded, ENT_QUOTES) . '\')">
						<div class="tag-name">'.htmlspecialchars($tag).'</div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script>
		// Expose current workspace to the tags page JS so redirects include it
		var pageWorkspace = <?php echo json_encode($workspace); ?>;
	</script>
	<script src="js/globals.js"></script>
	<script src="js/list_tags.js"></script>
	<script src="js/clickable-tags.js"></script>
	<script>
		
		function goBackToNotes() {
			// Build return URL with workspace from localStorage
			var url = 'index.php';
			var params = [];
			
			// Get workspace from localStorage first, fallback to PHP value
			try {
				var workspace = localStorage.getItem('poznote_selected_workspace');
				if (!workspace || workspace === '') {
					workspace = pageWorkspace;
				}
				if (workspace && workspace !== '') {
					params.push('workspace=' + encodeURIComponent(workspace));
				}
			} catch(e) {
				// Fallback to PHP workspace if localStorage fails
				if (pageWorkspace && pageWorkspace !== '') {
					params.push('workspace=' + encodeURIComponent(pageWorkspace));
				}
			}
			
			// Build final URL
			if (params.length > 0) {
				url += '?' + params.join('&');
			}
			
			window.location.href = url;
		}
	</script>
</body>
</html>

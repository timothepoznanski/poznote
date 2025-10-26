<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Build query with folder exclusions like in index.php
$where_conditions = ["trash = 0"];
$search_params = [];

// Respect optional workspace parameter to scope tags
$workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? 'Poznote';

$where_clause = implode(" AND ", $where_conditions);

// Execute query with proper parameters
$select_query = "SELECT tags FROM entries WHERE $where_clause";

// If workspace is provided and not the default, add workspace condition to where clause and params
if ($workspace !== null && $workspace !== 'Poznote') {
	// Append workspace condition to where clause and parameters
	// We add it now because $where_clause was already built without workspace
	$select_query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
	$search_params[] = $workspace;
	$search_params[] = $workspace;
} else {
	// For Poznote workspace, include entries with no workspace or explicit Poznote workspace
	$select_query .= " AND (workspace IS NULL OR workspace = 'Poznote')";
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
?>
<!DOCTYPE html>
<html lang="en" class="tags-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tags - Poznote</title>
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
			<button id="backToNotesBtn" class="btn btn-secondary" onclick="goBackToNotes()" title="Back to notes">
				Back to notes
			</button>
			<h1 class="tags-header">Tags</h1>
		</div>
		
        
		
		<form class="tags-search-form">
			<input 
				type="text" 
				id="tagsSearchInput"
				class="tags-search-input"
				placeholder="Filter tags..."
				autocomplete="off"
			>
		</form>
		
		<div class="tags-info">
			There <?php echo ($count_tags == 1) ? 'is' : 'are'; ?> <?php echo $count_tags; ?> tag<?php echo ($count_tags == 1) ? '' : 's'; ?> total
		</div>
		
		<div class="tags-grid" id="tagsList">
		<?php
		if (empty($tags_list)) {
			echo '<div class="no-tags">No tags found.</div>';
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

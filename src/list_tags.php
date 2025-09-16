<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Build query with folder exclusions like in index.php
$where_conditions = ["trash = 0"];
$search_params = [];

// Respect optional workspace parameter to scope tags
$workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? null;

// Get excluded folders from POST (if coming from a form submission)
$excluded_folders = [];
if (isset($_POST['excluded_folders']) && !empty($_POST['excluded_folders'])) {
    $excluded_folders = json_decode($_POST['excluded_folders'], true);
    if (!is_array($excluded_folders)) {
        $excluded_folders = [];
    }
}

// Apply folder exclusions
if (!empty($excluded_folders)) {
    $exclude_placeholders = [];
    $exclude_favorite = false;
    
    foreach ($excluded_folders as $excludedFolder) {
        if ($excludedFolder === 'Favorites') {
            $exclude_favorite = true;
        } else {
            $exclude_placeholders[] = "?";
            $search_params[] = $excludedFolder;
        }
    }
    
    // Add folder exclusion condition
    if (!empty($exclude_placeholders)) {
        $where_conditions[] = "(folder IS NULL OR folder NOT IN (" . implode(", ", $exclude_placeholders) . "))";
    }
    
    // Add favorite exclusion condition
    if ($exclude_favorite) {
        $where_conditions[] = "(favorite IS NULL OR favorite != 1)";
    }
}

$where_clause = implode(" AND ", $where_conditions);

// Execute query with proper parameters
$select_query = "SELECT tags FROM entries WHERE $where_clause";

// If workspace is provided, add workspace condition to where clause and params
if ($workspace !== null) {
	// Append workspace condition to where clause and parameters
	// We add it now because $where_clause was already built without workspace
	$select_query .= " AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))";
	$search_params[] = $workspace;
	$search_params[] = $workspace;
}

$stmt = $con->prepare($select_query);
$stmt->execute($search_params);

$tags_list = [];
$count_tags = 0;

while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {   
	$words = explode(',', $row['tags']);
	foreach($words as $word) {
		$word = trim($word); // Clean spaces
		if (!empty($word)) { // Verify that tag is not empty
			$count_tags++;
			if (!in_array($word, $tags_list)) {
				$tags_list[] = $word;
			}
		}		
	}
}

sort($tags_list, SORT_NATURAL | SORT_FLAG_CASE);
?>
<!DOCTYPE html>
<html lang="en" class="tags-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tags - Poznote</title>
	<link type="text/css" rel="stylesheet" href="css/index.css"/>
	<link type="text/css" rel="stylesheet" href="css/modal.css"/>
	<link rel="stylesheet" href="vendor/fontawesome/local-icons.css" />
	<link type="text/css" rel="stylesheet" href="css/index-mobile.css"/>
	<link type="text/css" rel="stylesheet" href="css/listtags.css"/>
	<link type="text/css" rel="stylesheet" href="css/listtags-mobile.css"/>
</head>
<body class="tags-page"<?php echo !empty($excluded_folders) ? ' data-has-exclusions="true"' : ''; ?>>
	<div class="tags-container">
		<div class="trash-buttons-container">
			<div class="trash-button trash-back-button" onclick="window.location = 'index.php<?php echo $workspace ? '?workspace=' . urlencode($workspace) : ''; ?>';" title="Back to notes">
				<i class="fas fa-arrow-circle-left trash-button-icon"></i>
			</div>
			<h1 class="tags-header">Tags</h1>
		</div>
		
		<!-- Show excluded folders info if any -->
		<?php if (!empty($excluded_folders)): ?>
		<div class="excluded-folders-info" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 8px 12px; margin-bottom: 15px; font-size: 0.9em;">
			<i class="fas fa-info-circle" style="color: #856404; margin-right: 5px;"></i>
			<strong>Folder exclusions active:</strong> <?php echo htmlspecialchars(implode(', ', $excluded_folders)); ?>
		</div>
		<?php endif; ?>
		
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
			There are <?php echo $count_tags; ?> tags total<?php echo !empty($excluded_folders) ? ' (excluding filtered folders)' : ''; ?>
		</div>
		
		<div class="tags-grid" id="tagsList">
		<?php
		if (empty($tags_list)) {
			echo '<div class="no-tags">No tags found.</div>';
		} else {
			foreach($tags_list as $tag) {
				if (!empty(trim($tag))) {
					$tag_encoded = urlencode($tag);
					echo '<div class="tag-item" onclick="redirectToTagWithExclusions(\'' . htmlspecialchars($tag_encoded, ENT_QUOTES) . '\')">
						<div class="tag-name">'.htmlspecialchars($tag).'</div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script src="js/listtags.js"></script>
	<script>
		// Expose current workspace to the tags page JS so redirects include it
		var pageWorkspace = <?php echo $workspace !== null ? json_encode($workspace) : 'undefined'; ?>;
	</script>
</body>
</html>

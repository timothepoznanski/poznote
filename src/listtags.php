<?php
require 'auth.php';
requireAuth();

require 'config.php';
include 'db_connect.php';

$res = $con->query('SELECT tags FROM entries');
$tags_list = [];
$count_tags = 0;

while($row = mysqli_fetch_array($res, MYSQLI_ASSOC)) {   
	$words = explode(',', $row['tags']);
	foreach($words as $word) {
		$count_tags++;
		if (!in_array($word, $tags_list)) {
			$tags_list[] = $word;
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
	<title>Tags</title>
	<link type="text/css" rel="stylesheet" href="css/index.css"/>
	<link rel="stylesheet" href="css/font-awesome.css" />
	<link type="text/css" rel="stylesheet" href="css/index-mobile.css"/>
	<link type="text/css" rel="stylesheet" href="css/listtags.css"/>
	<link type="text/css" rel="stylesheet" href="css/listtags-mobile.css"/>
</head>
<body class="tags-page">
	<div class="tags-container">
		<h1 class="tags-header">Tags</h1>
		
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
			There are <?php echo $count_tags; ?> tags total
		</div>
		
		<div class="tags-grid" id="tagsList">
		<?php
		if (empty($tags_list)) {
			echo '<div class="no-tags">No tags found.</div>';
		} else {
			foreach($tags_list as $tag) {
				if (!empty(trim($tag))) {
					echo '<div class="tag-item" onclick="window.location.href=\'index.php?tags_search_from_list='.urlencode($tag).'\'">
						<div class="tag-name">'.htmlspecialchars($tag).'</div>
					</div>';
				}
			}
		}
		?>
		</div>
	</div>
	
	<script src="js/listtags.js"></script>
</body>
</html>

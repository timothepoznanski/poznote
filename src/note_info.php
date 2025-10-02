<?php
// Backwards-compatible redirect to new file name
// This preserves any bookmarks or external links to note_info.php
$qs = $_SERVER['QUERY_STRING'] ? ('?' . $_SERVER['QUERY_STRING']) : '';
header('Location: info.php' . $qs, true, 302);
exit;

<?php
date_default_timezone_set('UTC');
function formatDate($t) {
	return date('j M Y',$t);
}
function formatDateTime($t) {
	return formatDate($t)." à ".date('H:i',$t);
}
?>

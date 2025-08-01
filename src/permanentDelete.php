<?php
	require 'auth.php';
	requireAuth();
	
	require 'config.php';
	include 'db_connect.php';
	
	$id = $_POST['id'];
	$filename = "entries/" . $id . ".html";
	if (file_exists($filename)) unlink($filename);
	
	echo $con->query("DELETE FROM entries WHERE id = $id") ? 1 : 'Database error occurred';
?>

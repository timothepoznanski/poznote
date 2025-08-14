<?php
	require 'auth.php';
	requireAuth();
	
	require_once 'config.php';
	include 'db_connect.php';
	
	$stmt = $con->prepare("UPDATE entries SET trash = 0 WHERE id = ?");
	echo $stmt->execute([$_POST['id']]) ? 1 : 'Database error occurred';
?>
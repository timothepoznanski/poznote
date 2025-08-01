<?php
require 'auth.php';
requireAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

$sql = "SELECT id, heading, tags, folder, updated FROM entries ORDER BY folder, updated DESC";
$result = $con->query($sql);

$notes = array();
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $notes[] = $row;
    }
}

echo json_encode($notes);

?>

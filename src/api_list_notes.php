<?php
require 'auth.php';
requireApiAuth();

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);
// error_reporting(E_ALL);

header('Content-Type: application/json');
require_once 'config.php';
require_once 'db_connect.php';

$workspace = $_GET['workspace'] ?? $_POST['workspace'] ?? null;

if ($workspace) {
    $stmt = $con->prepare("SELECT id, heading, tags, folder, workspace, updated FROM entries WHERE workspace = ? ORDER BY folder, updated DESC");
    $stmt->execute([$workspace]);
    $result = $stmt;
} else {
    $sql = "SELECT id, heading, tags, folder, workspace, updated FROM entries ORDER BY folder, updated DESC";
    $result = $con->query($sql);
}

$notes = array();
if ($result) {
    while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
        $notes[] = $row;
    }
}

echo json_encode($notes);

?>

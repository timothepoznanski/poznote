<?php
require_once 'config.php';
require_once 'db_connect.php';

$stmt = $con->prepare('UPDATE settings SET value = "mistral" WHERE key = "ai_provider"');
$stmt->execute();
echo 'AI provider set to Mistral' . "\n";
?>

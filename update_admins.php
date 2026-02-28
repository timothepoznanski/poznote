<?php
require_once __DIR__ . '/src/users/db_master.php';

try {
    $con = getMasterConnection();
    $stmt = $con->prepare("UPDATE users SET is_admin = 0 WHERE id != 1");
    $stmt->execute();
    echo "Database updated successfully. " . $stmt->rowCount() . " users modified.\n";
} catch (Exception $e) {
    echo "Error updating database: " . $e->getMessage() . "\n";
}

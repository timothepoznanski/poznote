<?php
/**
 * Debug script to check current session state
 */
require_once __DIR__ . '/auth.php';

echo "<!DOCTYPE html><html><head><title>Session Debug</title></head><body>";
echo "<h1>Session Debug Information</h1>";
echo "<pre>";

echo "Is Authenticated: " . (isAuthenticated() ? 'YES' : 'NO') . "\n\n";

echo "Session Data:\n";
print_r($_SESSION);

echo "\n\nCurrent User:\n";
$currentUser = getCurrentUser();
print_r($currentUser);

echo "\n\nCurrent User ID: ";
$userId = getCurrentUserId();
var_dump($userId);

$dataDir = __DIR__ . '/../data';
$masterDbPath = $dataDir . '/master.db';
$usersDir = $dataDir . '/users';

echo "\n\n__DIR__: " . __DIR__;
echo "\nData Directory: " . $dataDir;
echo "\nData Directory (realpath): " . (realpath($dataDir) ?: 'failed');
echo "\nMaster Database Path: " . $masterDbPath;
echo "\nMaster Database Exists: " . (file_exists($masterDbPath) ? 'YES' : 'NO');
if (file_exists($masterDbPath)) {
    echo " (size: " . filesize($masterDbPath) . " bytes)";
}
echo "\nUsers Directory Exists: " . (is_dir($usersDir) ? 'YES' : 'NO');

if (file_exists($masterDbPath)) {
    require_once __DIR__ . '/users/db_master.php';
    $profiles = getAllUserProfiles();
    echo "\n\nUser Profiles in Database:\n";
    print_r($profiles);
} else {
    echo "\n\nWARNING: Master database not found! Migration may not have run yet.";
}

echo "</pre>";
echo "<p><a href='logout.php'>Logout</a> | <a href='login.php'>Login</a> | <a href='index.php'>Index</a></p>";
echo "</body></html>";

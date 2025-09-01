<?php
// Test simple pour voir si nous sommes authentifiés
require 'auth.php';

header('Content-Type: application/json');

echo json_encode([
    'authenticated' => isAuthenticated(),
    'session' => $_SESSION,
    'method' => $_SERVER['REQUEST_METHOD'],
    'headers' => getallheaders()
]);
?>

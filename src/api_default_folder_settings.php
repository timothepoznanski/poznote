<?php
require 'auth.php';
requireAuth();

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';

switch($action) {
    case 'get_default_folder_name':
        // Default folder concept has been removed
        echo json_encode(['success' => false, 'error' => 'Default folder concept is no longer supported']);
        break;
        
    case 'set_default_folder_name':
        // Default folder concept has been removed
        echo json_encode(['success' => false, 'error' => 'Default folder concept is no longer supported']);
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>

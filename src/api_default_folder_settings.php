<?php
require 'auth.php';
requireAuth();

require_once 'default_folder_settings.php';

header('Content-Type: application/json');

$action = $_POST['action'] ?? '';
// optional workspace param
$workspace = $_POST['workspace'] ?? null;

switch($action) {
    case 'get_default_folder_name':
        $defaultName = getDefaultFolderName($workspace);
        echo json_encode(['success' => true, 'default_folder_name' => $defaultName]);
        break;
        
    case 'set_default_folder_name':
        // Changing the default folder name is disabled. Return explicit error.
        echo json_encode(['success' => false, 'error' => 'Renaming the default folder is not allowed']);
        exit;
        break;
        
    default:
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
        break;
}
?>

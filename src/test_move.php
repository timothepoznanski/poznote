<?php
// Test du déplacement de note
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Simuler une session utilisateur
session_start();
$_SESSION['authenticated'] = true;
$_SESSION['username'] = 'test_user';

// Simuler une requête POST pour move_to
$_POST = [
    'action' => 'move_to',
    'note_id' => '1', // Utiliser un ID de note existant
    'folder' => 'Test Folder'
];

echo "=== Test de déplacement de note ===\n";
echo "Action: " . $_POST['action'] . "\n";
echo "Note ID: " . $_POST['note_id'] . "\n";
echo "Folder: " . $_POST['folder'] . "\n\n";

// Capturer la sortie
ob_start();

try {
    include 'folder_operations.php';
} catch (Exception $e) {
    echo "Exception: " . $e->getMessage() . "\n";
}

$output = ob_get_contents();
ob_end_clean();

echo "Output length: " . strlen($output) . " bytes\n";
echo "Content: '" . $output . "'\n";

// Test si c'est du JSON valide
$json_test = json_decode($output, true);
if ($json_test === null && json_last_error() !== JSON_ERROR_NONE) {
    echo "JSON Error: " . json_last_error_msg() . "\n";
} else {
    echo "JSON is valid: ";
    print_r($json_test);
}
?>

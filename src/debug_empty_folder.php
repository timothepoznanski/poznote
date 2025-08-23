<?php
// Test complet avec simulation de session
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Simuler une session utilisateur
session_start();
$_SESSION['authenticated'] = true;
$_SESSION['username'] = 'test_user';

// Simuler une requête POST
$_POST = [
    'action' => 'empty_folder',
    'folder_name' => 'Test Folder'
];

echo "=== Test avec session simulée ===\n";

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
echo "Content:\n";
echo "'" . $output . "'\n";

// Test si c'est du JSON valide
$json_test = json_decode($output, true);
if ($json_test === null && json_last_error() !== JSON_ERROR_NONE) {
    echo "JSON Error: " . json_last_error_msg() . "\n";
} else {
    echo "JSON is valid: ";
    print_r($json_test);
}
?>

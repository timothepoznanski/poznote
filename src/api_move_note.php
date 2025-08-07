<?php
require 'auth.php';
require 'db_connect.php';

// Vérifier l'authentification
if (!isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

// Vérifier la méthode HTTP
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// Lire les données JSON
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Valider les données
if (!isset($data['note_id']) || empty(trim($data['note_id']))) {
    http_response_code(400);
    echo json_encode(['error' => 'note_id is required']);
    exit;
}

if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['error' => 'folder_name is required']);
    exit;
}

$note_id = trim($data['note_id']);
$folder_name = trim($data['folder_name']);

try {
    // Vérifier que la note existe
    $stmt = $con->prepare("SELECT heading, folder FROM entries WHERE id = ?");
    $stmt->bind_param("s", $note_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $note = $result->fetch_assoc();
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    $current_folder = $note['folder'];
    
    // Vérifier que le dossier de destination existe (dans la table folders ou comme dossier utilisé dans entries)
    $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
    $stmt->bind_param("s", $folder_name);
    $stmt->execute();
    $result = $stmt->get_result();
    $folder_exists = $result->fetch_row()[0] > 0;
    
    if (!$folder_exists) {
        // Vérifier si le dossier existe déjà dans les entries
        $stmt = $con->prepare("SELECT COUNT(*) FROM entries WHERE folder = ?");
        $stmt->bind_param("s", $folder_name);
        $stmt->execute();
        $result = $stmt->get_result();
        $folder_exists = $result->fetch_row()[0] > 0;
        
        if (!$folder_exists && $folder_name !== 'Uncategorized') {
            http_response_code(404);
            echo json_encode(['error' => 'Folder not found']);
            exit;
        }
    }
    
    // Déterminer les chemins des fichiers
    $old_file_path = __DIR__ . '/entries/' . ($current_folder !== 'Uncategorized' ? $current_folder . '/' : '') . $note_id . '.html';
    $new_folder_path = __DIR__ . '/entries/' . ($folder_name !== 'Uncategorized' ? $folder_name : '');
    $new_file_path = $new_folder_path . '/' . $note_id . '.html';
    
    // Si le dossier de destination est 'Uncategorized', placer le fichier à la racine
    if ($folder_name === 'Uncategorized') {
        $new_file_path = __DIR__ . '/entries/' . $note_id . '.html';
    }
    
    // Vérifier que le fichier de la note existe
    if (!file_exists($old_file_path)) {
        http_response_code(404);
        echo json_encode(['error' => 'Note file not found at: ' . $old_file_path]);
        exit;
    }
    
    // Créer le dossier de destination s'il n'existe pas physiquement
    if ($folder_name !== 'Uncategorized' && !file_exists($new_folder_path)) {
        if (!mkdir($new_folder_path, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create destination folder directory']);
            exit;
        }
    }
    
    // Déplacer le fichier
    if (!rename($old_file_path, $new_file_path)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to move note file']);
        exit;
    }
    
    // Mettre à jour la base de données
    $stmt = $con->prepare("UPDATE entries SET folder = ?, updated = NOW() WHERE id = ?");
    $stmt->bind_param("ss", $folder_name, $note_id);
    $stmt->execute();
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Note moved successfully',
        'note' => [
            'id' => $note_id,
            'title' => $note['heading'],
            'old_folder' => $current_folder,
            'new_folder' => $folder_name,
            'old_path' => $old_file_path,
            'new_path' => $new_file_path
        ]
    ]);
    
} catch (Exception $e) {
    // En cas d'erreur, essayer de remettre le fichier à sa place
    if (isset($new_file_path) && isset($old_file_path) && file_exists($new_file_path) && !file_exists($old_file_path)) {
        rename($new_file_path, $old_file_path);
    }
    
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>

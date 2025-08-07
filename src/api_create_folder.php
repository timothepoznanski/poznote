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
if (!isset($data['folder_name']) || empty(trim($data['folder_name']))) {
    http_response_code(400);
    echo json_encode(['error' => 'folder_name is required']);
    exit;
}

$folder_name = trim($data['folder_name']);

// Vérifier que le nom du dossier est valide
if (strlen($folder_name) > 255) {
    http_response_code(400);
    echo json_encode(['error' => 'Folder name too long (max 255 characters)']);
    exit;
}

// Caractères interdits dans les noms de dossiers
$forbidden_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
foreach ($forbidden_chars as $char) {
    if (strpos($folder_name, $char) !== false) {
        http_response_code(400);
        echo json_encode(['error' => "Folder name contains forbidden character: $char"]);
        exit;
    }
}

try {
    // Vérifier si le dossier existe déjà
    $stmt = $con->prepare("SELECT COUNT(*) FROM folders WHERE name = ?");
    $stmt->bind_param("s", $folder_name);
    $stmt->execute();
    $result = $stmt->get_result();
    $count = $result->fetch_row()[0];
    
    if ($count > 0) {
        http_response_code(409);
        echo json_encode(['error' => 'Folder already exists']);
        exit;
    }
    
    // Créer le dossier dans la base de données
    $stmt = $con->prepare("INSERT INTO folders (name, created) VALUES (?, NOW())");
    $stmt->bind_param("s", $folder_name);
    $stmt->execute();
    
    $folder_id = $con->insert_id;
    
    // Créer le dossier physique
    $folder_path = __DIR__ . '/entries/' . $folder_name;
    if (!file_exists($folder_path)) {
        if (!mkdir($folder_path, 0755, true)) {
            // Rollback de la base de données si la création du dossier échoue
            $stmt = $con->prepare("DELETE FROM folders WHERE id = ?");
            $stmt->bind_param("i", $folder_id);
            $stmt->execute();
            
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create folder directory']);
            exit;
        }
    }
    
    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Folder created successfully',
        'folder' => [
            'id' => $folder_id,
            'name' => $folder_name,
            'path' => $folder_path
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
?>

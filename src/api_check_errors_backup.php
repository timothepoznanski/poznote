<?php
header('Content-Type: application/json');

// Disable output buffering for this API response
if (ob_get_level()) {
    ob_end_clean();
}

require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';

// Check request method
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['note_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Note ID is required']);
    exit;
}

$note_id = $input['note_id'];
$workspace = isset($input['workspace']) ? trim($input['workspace']) : null;

try {
    // Get the note metadata (respect workspace if provided)
    if ($workspace) {
        $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
        $stmt->execute([$note_id, $workspace, $workspace]);
    } else {
        $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
        $stmt->execute([$note_id]);
    }
    $note = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$note) {
        http_response_code(404);
        echo json_encode(['error' => 'Note not found']);
        exit;
    }
    
    // Get note content from HTML file
    include_once 'functions.php';
    $entries_path = getEntriesPath();
    $html_file = $entries_path . '/' . $note_id . '.html';
    
    if (!file_exists($html_file)) {
        http_response_code(404);
        echo json_encode(['error' => 'Note content file not found']);
        exit;
    }
    
    $html_content = file_get_contents($html_file);
    if ($html_content === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Could not read note content']);
        exit;
    }
    
    // Get OpenAI API key from settings
    $stmt = $con->prepare("SELECT value FROM settings WHERE key = ?");
    $stmt->execute(['openai_api_key']);
    $api_key = $stmt->fetchColumn();
    
    if (!$api_key) {
        http_response_code(400);
        echo json_encode(['error' => 'OpenAI API key not configured. Please configure it in Settings.']);
        exit;
    }
    
    // Prepare the content for OpenAI
    $content = strip_tags($html_content); // Remove HTML tags
    $content = html_entity_decode($content, ENT_QUOTES, 'UTF-8'); // Decode HTML entities
    $content = preg_replace('/\s+/', ' ', $content); // Normalize whitespace
    $content = trim($content);
    
    if (empty($content)) {
        http_response_code(400);
        echo json_encode(['error' => 'Note content is empty']);
        exit;
    }
    
    // Limit content length to avoid token limits
    if (strlen($content) > 12000) {
        $content = substr($content, 0, 12000) . '...';
    }
    
    $title = $note['heading'] ?: 'Untitled';
    
    // Prepare OpenAI request
    $openai_data = [
        'model' => 'gpt-4o-mini',
        'messages' => [
            [
                'role' => 'system',
                'content' => 'Tu es un vérificateur de faits EXPERT et IMPITOYABLE. Tu dois détecter TOUTES les erreurs factuelles, contradictions et incohérences.

MISSION: Analyser la véracité et la cohérence du contenu.

À DÉTECTER ABSOLUMENT:
• ERREURS FACTUELLES (ex: "dauphins volants", "Paris capitale de l\'Italie")
• CONTRADICTIONS internes dans le texte
• AFFIRMATIONS IMPOSSIBLES ou absurdes
• INFORMATIONS fausses ou obsolètes
• INCOHÉRENCES logiques
• DONNÉES incorrectes

IGNORE COMPLÈTEMENT:
❌ Orthographe et grammaire 
❌ Ponctuation et syntaxe
❌ Style d\'écriture

FORMAT OBLIGATOIRE:
- Erreur factuelle: [description précise du problème]
- Contradiction: [description de l\'incohérence]
- Information douteuse: [explication]

EXEMPLES d\'erreurs À DÉTECTER:
- Erreur factuelle: "Les dauphins sont des mammifères volants" (ils sont marins)
- Erreur factuelle: "La Lune est plus grande que le Soleil"
- Contradiction: "Il fait chaud" puis "la température est de -10°C"

Si AUCUNE erreur factuelle: "Le contenu semble cohérent et factuellement correct."

ATTENTION: Sois ULTRA-CRITIQUE sur les faits, même les erreurs subtiles!'
            ],
            [
                'role' => 'user',
                'content' => "VÉRIFICATION FACTUELLE IMPITOYABLE:

Titre: \"$title\"
Contenu: \"$content\"

TÂCHE CRITIQUE: Trouve TOUTES les erreurs factuelles et contradictions.

CHERCHE SPÉCIFIQUEMENT:

1. ERREURS FACTUELLES ÉVIDENTES:
   - \"dauphins volants\" (ils sont marins!)
   - \"Paris capitale de l'Allemagne\" 
   - \"eau bout à 200°C\"

2. CONTRADICTIONS INTERNES:
   - \"Il fait chaud\" vs \"température -10°C\"
   - Informations qui se contredisent

3. AFFIRMATIONS IMPOSSIBLES:
   - Claims scientifiquement fausses
   - Données incorrectes
   - Faits historiques erronés

FORMAT DE RÉPONSE:
- Erreur factuelle: [description précise]
- Contradiction: [explication détaillée]
- Information douteuse: [pourquoi c'est problématique]

EXEMPLE pour \"dauphins volants\":
- Erreur factuelle: \"mammifères volants\" - les dauphins sont des mammifères marins, pas volants

Si AUCUNE erreur factuelle trouvée: \"Le contenu semble cohérent et factuellement correct.\"

IMPORTANT: Ignore l'orthographe/grammaire, concentre-toi sur les FAITS!"
            ]
        ],
        'max_tokens' => 2000,
        'temperature' => 0.2
    ];
    
    // Make request to OpenAI
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($openai_data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $api_key
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if (curl_errno($ch)) {
        $error = curl_error($ch);
        curl_close($ch);
        http_response_code(500);
        echo json_encode(['error' => 'Request failed: ' . $error]);
        exit;
    }
    
    curl_close($ch);
    
    if ($http_code !== 200) {
        $error_response = json_decode($response, true);
        $error_message = 'OpenAI API error';
        
        if (isset($error_response['error']['message'])) {
            $error_message = $error_response['error']['message'];
        }
        
        http_response_code($http_code);
        echo json_encode(['error' => $error_message]);
        exit;
    }
    
    $openai_response = json_decode($response, true);
    
    if (!$openai_response || !isset($openai_response['choices'][0]['message']['content'])) {
        http_response_code(500);
        echo json_encode(['error' => 'Invalid response from OpenAI']);
        exit;
    }
    
    $error_check = trim($openai_response['choices'][0]['message']['content']);
    
    // Return the error check result
    echo json_encode([
        'success' => true,
        'error_check' => $error_check,
        'note_title' => $title
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>

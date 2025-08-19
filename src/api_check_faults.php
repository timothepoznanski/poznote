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

try {
    // Get the note metadata
    $stmt = $con->prepare("SELECT heading FROM entries WHERE id = ?");
    $stmt->execute([$note_id]);
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
                'content' => 'Tu es un correcteur orthographique EXPERT et IMPITOYABLE. Tu DOIS détecter TOUTES les erreurs linguistiques.

RÈGLES ABSOLUES:
❌ Ne JAMAIS corriger
❌ Ne JAMAIS donner la bonne version  
✅ SEULEMENT signaler les erreurs trouvées

ATTENTION CRITIQUE aux:
• CONJUGAISONS: "ils mange" → ERREUR (doit être "ils mangent")
• PLURIELS avec DE: "de poisson" → ERREUR (doit être "de poissons")
• ACCORDS: "les chat" → ERREUR (doit être "les chats")
• ORTHOGRAPHE: "apartement" → ERREUR (doit être "appartement")

CAS SPÉCIAUX À SURVEILLER:
• "ils/elles" + verbe → vérifier la terminaison en -ent
• "de" + nom → souvent au pluriel (de livres, de poissons, de voitures)
• Participes passés avec avoir/être

FORMAT STRICT:
- Erreur de [type]: "[texte exact incorrect]"

EXEMPLES CONCRETS:
- Erreur de conjugaison: "ils chasse"
- Erreur d\'accord: "de poisson" 
- Erreur d\'accord: "de calmar"

Si aucune erreur: "Aucune erreur linguistique détectée."

MISSION: Trouve CHAQUE erreur, sois SANS PITIÉ!'
            ],
            [
                'role' => 'user',
                'content' => "ANALYSE IMPITOYABLE DE CE TEXTE:

Titre: \"$title\"
Contenu: \"$content\"

CHERCHE SPÉCIFIQUEMENT CES ERREURS:

1. CONJUGAISONS INCORRECTES:
   - \"ils chasse\" au lieu de \"ils chassent\"
   - \"elles mange\" au lieu de \"elles mangent\"

2. ACCORDS AU PLURIEL avec DE:
   - \"de poisson\" au lieu de \"de poissons\"
   - \"de calmar\" au lieu de \"de calmars\"
   - \"de livre\" au lieu de \"de livres\"

3. AUTRES ACCORDS:
   - \"les chat\" au lieu de \"les chats\"
   - \"des voiture\" au lieu de \"des voitures\"

4. FAUTES D'ORTHOGRAPHE:
   - \"apartement\" au lieu de \"appartement\"

FORMAT DE RÉPONSE:
- Erreur de conjugaison: \"[mot mal conjugué]\"
- Erreur d'accord: \"[accord incorrect]\"
- Faute d'orthographe: \"[mot mal écrit]\"

EXEMPLES ATTENDUS pour ton texte:
- Erreur de conjugaison: \"qu'ils chasse\"
- Erreur d'accord: \"de poisson\"
- Erreur d'accord: \"de calmar\"

Si aucune erreur: \"Aucune erreur linguistique détectée.\"

ATTENTION: Je veux TOUTES les erreurs, même les plus subtiles!"
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
    
    $fault_check = trim($openai_response['choices'][0]['message']['content']);
    
    // Return the fault check result
    echo json_encode([
        'success' => true,
        'fault_check' => $fault_check,
        'note_title' => $title
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>

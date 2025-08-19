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
    if (strlen($content) > 8000) {
        $content = substr($content, 0, 8000) . '...';
    }
    
    $title = $note['heading'] ?: 'Untitled';
    
    // Prepare OpenAI request
    $openai_data = [
        'model' => 'gpt-3.5-turbo',
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You are an expert fact-checker and content reviewer. Your role is to analyze the coherence, logic, and accuracy of content.

WHAT TO CHECK:
- Factual accuracy and verifiable information
- Logical consistency and coherence
- Contradictory statements
- Outdated or questionable information
- Missing context or incomplete arguments
- Biased or misleading claims

WHAT NOT TO CHECK:
- Do NOT check spelling or grammar
- Do NOT check punctuation or syntax
- Do NOT check language form or style

RESPONSE FORMAT:
If you find issues with content accuracy or logic:
- [Issue type]: [explanation of the problem]
- [Issue type]: [explanation of the problem]

If content appears accurate and coherent:
"Le contenu semble cohérent et factuellement correct."

CRITICAL LANGUAGE REQUIREMENT: You MUST detect the primary language of the text content and respond EXCLUSIVELY in that same language.

FOCUS: Content accuracy, logic, and coherence - NOT language form!'
            ],
            [
                'role' => 'user',
                'content' => "Analyse ce contenu pour sa véracité et sa cohérence: \"$title\"\n\n$content\n\nTâche: Vérifier la logique, la cohérence et l'exactitude factuelle de ce contenu.

À vérifier:
- Exactitude des faits présentés
- Cohérence logique des arguments
- Contradictions internes
- Informations potentiellement obsolètes
- Affirmations douteuses ou non vérifiables
- Biais ou informations trompeuses

NE PAS vérifier:
- Orthographe ou grammaire
- Ponctuation ou syntaxe
- Style ou forme linguistique

Format de réponse:
Si tu trouves des problèmes:
- [Type de problème]: [explication du problème]
- [Type de problème]: [explication du problème]

Si le contenu semble correct:
\"Le contenu semble cohérent et factuellement correct.\"

IMPORTANT: Concentre-toi sur le CONTENU et sa véracité, pas sur la forme linguistique!"
            ]
        ],
        'max_tokens' => 800,
        'temperature' => 0.1
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

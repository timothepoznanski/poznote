<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');

// Disable output buffering for this API response
if (ob_get_level()) {
    ob_end_clean();
}

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors in output

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
    if (strlen($content) > 6000) {
        $content = substr($content, 0, 6000) . '...';
    }
    
    $title = $note['heading'] ?: 'Untitled';
    
    // Simple language detection based on common words
    $language = 'English'; // Default
    $french_indicators = ['le ', 'la ', 'les ', 'de ', 'du ', 'des ', 'et ', 'à ', 'pour ', 'dans ', 'avec ', 'sur ', 'par ', 'une ', 'un ', 'ce ', 'cette ', 'ces ', 'que ', 'qui ', 'est ', 'sont ', 'avoir ', 'être'];
    $content_lower = strtolower($content);
    $french_count = 0;
    foreach ($french_indicators as $indicator) {
        if (strpos($content_lower, $indicator) !== false) {
            $french_count++;
        }
    }
    if ($french_count >= 3) {
        $language = 'French';
    }

    // Prepare OpenAI request
    $openai_data = [
        'model' => 'gpt-3.5-turbo',
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You are an expert proofreader and grammar checker. Your task is to correct grammar, spelling, punctuation, and syntax errors in text while:
1. Fixing all grammatical errors
2. Correcting spelling mistakes
3. Improving punctuation
4. Fixing syntax issues
5. Maintaining the original meaning and style
6. Preserving the original language completely

CRITICAL RULES:
- NEVER translate the content to another language
- If the text is in French, your response must be 100% in French
- If the text is in English, your response must be 100% in English
- Only fix errors, do not rewrite or restructure significantly
- Maintain the original tone and style
- Preserve line breaks and formatting structure
- Focus specifically on correcting faults, not improving content

RESPONSE FORMAT:
- Return ONLY the corrected text
- Do NOT add any introduction, explanation, or commentary
- Do NOT add phrases like "Voici un texte..." or "Here is the corrected text..."
- Do NOT mention the title or describe what you are doing
- Start your response directly with the corrected content

IMPORTANT: You must detect and maintain the original language. Do not translate or change the language under any circumstances.'
            ],
            [
                'role' => 'user',
                'content' => "$content\n\nIMPORTANT: Return ONLY the corrected text without any introduction, explanation, or commentary. The original appears to be in $language, so respond in $language. Do not add phrases like \"Voici un texte intitulé\" or \"Here is the corrected text\". Start your response directly with the corrected content."
            ]
        ],
        'max_tokens' => 1000,
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
    $curl_error = curl_error($ch);
    curl_close($ch);
    
    if ($curl_error) {
        http_response_code(500);
        echo json_encode(['error' => 'Connection error: ' . $curl_error]);
        exit;
    }
    
    if ($http_code !== 200) {
        http_response_code($http_code);
        $error_response = json_decode($response, true);
        $error_message = isset($error_response['error']['message']) ? $error_response['error']['message'] : 'OpenAI API error';
        echo json_encode(['error' => $error_message]);
        exit;
    }
    
    $response_data = json_decode($response, true);
    
    if (!$response_data || !isset($response_data['choices'][0]['message']['content'])) {
        http_response_code(500);
        echo json_encode(['error' => 'Invalid response from OpenAI']);
        exit;
    }
    
    $corrected_content = trim($response_data['choices'][0]['message']['content']);
    
    // Remove common introduction phrases that AI might add despite instructions
    $intro_patterns = [
        '/^Voici un texte intitulé[^:]*:\s*/i',
        '/^Voici le texte corrigé[^:]*:\s*/i',
        '/^Here is the corrected text[^:]*:\s*/i',
        '/^Here\'s the corrected version[^:]*:\s*/i',
        '/^Corrected text[^:]*:\s*/i',
        '/^Texte corrigé[^:]*:\s*/i'
    ];
    
    foreach ($intro_patterns as $pattern) {
        $corrected_content = preg_replace($pattern, '', $corrected_content);
    }
    
    $corrected_content = trim($corrected_content);
    
    if (empty($corrected_content)) {
        http_response_code(500);
        echo json_encode(['error' => 'Empty response from OpenAI']);
        exit;
    }
    
    // Return the corrected content
    echo json_encode([
        'success' => true,
        'corrected_content' => $corrected_content,
        'original_title' => $title
    ]);
    
} catch (PDOException $e) {
    error_log("Database error in api_correct_faults.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    error_log("General error in api_correct_faults.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
} catch (Error $e) {
    error_log("Fatal error in api_correct_faults.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Fatal error: ' . $e->getMessage()]);
}

// Ensure we always output valid JSON
if (!headers_sent()) {
    // If we reach here without outputting anything, output a generic error
    http_response_code(500);
    echo json_encode(['error' => 'Unknown error occurred']);
}
?>

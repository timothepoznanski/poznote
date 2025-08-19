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
                'content' => 'You are an assistant that helps improve notes by enhancing their structure, clarity, and content. Your task is to take a note and make it better by:
1. Improving grammar and spelling IN THE SAME LANGUAGE
2. Enhancing clarity and readability IN THE SAME LANGUAGE
3. Better organization and structure IN THE SAME LANGUAGE
4. Adding relevant details where appropriate IN THE SAME LANGUAGE
5. Improving formatting and flow IN THE SAME LANGUAGE

CRITICAL RULES:
- NEVER translate the content to another language
- If the note is in French, your response must be 100% in French
- If the note is in English, your response must be 100% in English
- If the note is in Spanish, your response must be 100% in Spanish
- PRESERVE the original language at all costs
- Only improve the content quality while keeping the exact same language

IMPORTANT: You must detect and maintain the original language. Do not translate or change the language under any circumstances.'
            ],
            [
                'role' => 'user',
                'content' => "Here is a note titled \"$title\" that needs improvement (detected language: $language):\n\n$content\n\nIMPORTANT: Improve this note while keeping it in the EXACT SAME LANGUAGE as the original. Do not translate it. The original appears to be in $language, so respond in $language. Enhance structure, clarity, grammar, and overall quality while preserving the original language completely."
            ]
        ],
        'max_tokens' => 1000,
        'temperature' => 0.3
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
    curl_setopt($ch, CURLOPT_TIMEOUT, 45);
    
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
    
    $improved_content = trim($openai_response['choices'][0]['message']['content']);
    
    // Return the improved content
    echo json_encode([
        'success' => true,
        'improved_content' => $improved_content,
        'note_title' => $title
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>

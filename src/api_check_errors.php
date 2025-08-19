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
                'content' => 'You are an expert fact-checker and content reviewer. Your role is to carefully analyze the provided note content and identify any potential errors, inaccuracies, inconsistencies, or misleading information. You should check for: factual errors, logical inconsistencies, contradictory statements, outdated information, grammatical errors, spelling mistakes, formatting issues, or any other problems. 

CRITICAL LANGUAGE REQUIREMENT: You MUST detect the primary language of the note content and respond EXCLUSIVELY in that same language. Follow these rules strictly:
1. If the note content is primarily in English, you MUST respond entirely in English
2. If the note content is primarily in French, you MUST respond entirely in French  
3. If the note content is primarily in Spanish, you MUST respond entirely in Spanish
4. If the note content is primarily in German, you MUST respond entirely in German
5. For any other language, respond in that detected language
6. NEVER mix languages in your response
7. NEVER translate the content or change its language
8. Your entire response must be in the same language as the predominant language of the input

This language matching is absolutely mandatory and non-negotiable.'
            ],
            [
                'role' => 'user',
                'content' => "IMPORTANT: First, analyze the primary language of this note content, then respond ONLY in that detected language.

Here is a note titled \"$title\":\n\n$content\n\nPlease carefully review this note and identify any potential errors, inaccuracies, inconsistencies, or problems. If you find issues, explain what they are and suggest corrections. If the note appears to be accurate and well-written, mention that as well. Please be thorough but constructive in your analysis. 

CRITICAL: Your entire response must be written in the same primary language as the note content above. Do not translate, do not mix languages, and do not respond in any other language than the one predominantly used in the note content."
            ]
        ],
        'max_tokens' => 500,
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

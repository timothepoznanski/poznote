<?php

require_once __DIR__ . '/ai_provider.php';

/**
 * OpenAI provider implementation
 */
class OpenAIProvider extends AIProvider {
    private $api_url = 'https://api.openai.com/v1/chat/completions';
    
    public function __construct($api_key, $model = 'gpt-4o-mini') {
        parent::__construct($api_key, $model);
    }
    
    public function generateSummary($content, $title) {
        $messages = [
            [
                'role' => 'system',
                'content' => 'You are an assistant that helps summarize notes. Create a concise and informative summary of the provided note. The summary should capture the key points and important information. 

Rules:
- Keep the summary concise but informative (2-4 sentences)
- Focus on the main ideas and key information
- Use the same language as the original note
- Do not include personal opinions or interpretations
- Make it clear and easy to understand

CRITICAL: Your entire response must be written in the same primary language as the note content above. Do not translate, do not mix languages, and do not respond in any other language than the one predominantly used in the note content.'
            ],
            [
                'role' => 'user',
                'content' => "Here is a note titled \"$title\":\n\n$content\n\nProvide a concise summary of this note."
            ]
        ];
        
        return $this->makeRequest($messages, 300, 0.5);
    }
    
    public function generateTags($content, $title) {
        $messages = [
            [
                'role' => 'system',
                'content' => 'You are an assistant that generates relevant tags for notes. Your task is to analyze the content and create a list of 3-8 relevant tags that best describe the main topics, themes, and subjects covered in the note. 

Rules:
- Generate between 3 to 8 tags maximum
- Tags MUST be single words only (no spaces allowed)
- If a concept requires multiple words, use camelCase or underscores (e.g., "machineLearning" or "machine_learning")
- Tags should be in the same language as the note content
- Focus on the main topics, concepts, and themes
- Avoid generic tags like "note" or "text"
- Make tags specific and meaningful
- Use lowercase for consistency
- Return only the tags as a comma-separated list, nothing else'
            ],
            [
                'role' => 'user',
                'content' => "Here is a note titled \"$title\":\n\n$content\n\nGenerate relevant single-word tags for this note. Return only the tags as a comma-separated list."
            ]
        ];
        
        $result = $this->makeRequest($messages, 100, 0.3);
        
        if (isset($result['error'])) {
            return $result;
        }
        
        // Parse tags from comma-separated response
        $tags_text = trim($result['content']);
        $tags = array_map('trim', explode(',', $tags_text));
        $tags = array_filter($tags, function($tag) {
            // Filter out empty tags and tags with spaces
            return !empty($tag) && strlen($tag) > 1 && !preg_match('/\s/', $tag);
        });
        
        // If any tag contains spaces, replace them with underscores
        $tags = array_map(function($tag) {
            return str_replace(' ', '_', $tag);
        }, $tags);
        
        // Limit to maximum 8 tags
        $tags = array_slice($tags, 0, 8);
        
        return ['tags' => $tags];
    }
    
    public function checkErrors($content, $title) {
        $messages = [
            [
                'role' => 'system',
                'content' => 'Tu es un assistant expert en correction de texte. Analyse le contenu fourni et identifie les erreurs factuelles, les incohérences logiques, les contradictions et les informations potentiellement incorrectes.

RÈGLES IMPORTANTES:
- Ignore complètement l\'orthographe, la grammaire et la syntaxe
- Concentre-toi UNIQUEMENT sur les erreurs FACTUELLES et logiques
- Identifie les contradictions internes dans le texte
- Signale les affirmations qui semblent factuellement incorrectes
- Mentionne les dates, chiffres ou faits qui paraissent erronés
- Indique les incohérences logiques dans le raisonnement

Format de réponse:
- Si tu trouves des erreurs factuelles: liste-les clairement avec des explications
- Si aucune erreur factuelle: réponds simplement "Aucune erreur factuelle détectée."
- Utilise la même langue que le contenu analysé

IMPORTANT: Ignore l\'orthographe/grammaire, concentre-toi sur les FAITS!'
            ],
            [
                'role' => 'user',
                'content' => "Titre: \"$title\"\n\nContenu:\n$content\n\nAnalyse ce contenu pour détecter les erreurs factuelles, contradictions et incohérences logiques (ignore l'orthographe et la grammaire):"
            ]
        ];
        
        $result = $this->makeRequest($messages, 2000, 0.2);
        
        if (isset($result['error'])) {
            return $result;
        }
        
        return ['corrections' => $result['content']];
    }
    
    public function getProviderName() {
        return 'OpenAI';
    }
    
    public function getAvailableModels() {
        return [
            'gpt-4o-mini' => 'GPT-4o Mini (Recommended)',
            'gpt-4o' => 'GPT-4o',
            'gpt-4-turbo' => 'GPT-4 Turbo',
            'gpt-3.5-turbo' => 'GPT-3.5 Turbo'
        ];
    }
    
    public function testConnection() {
        $messages = [
            [
                'role' => 'user',
                'content' => 'Hello, this is a test message. Please respond with "Connection successful".'
            ]
        ];
        
        $result = $this->makeRequest($messages, 50, 0.1);
        
        if (isset($result['error'])) {
            return ['success' => false, 'error' => $result['error']];
        }
        
        return ['success' => true, 'response' => $result['content']];
    }
    
    private function makeRequest($messages, $max_tokens, $temperature) {
        $data = [
            'model' => $this->model,
            'messages' => $messages,
            'max_tokens' => $max_tokens,
            'temperature' => $temperature
        ];
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->api_url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->api_key
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            return ['error' => 'Request failed: ' . $error];
        }
        
        curl_close($ch);
        
        if ($http_code !== 200) {
            $error_response = json_decode($response, true);
            $error_message = 'OpenAI API error';
            
            if (isset($error_response['error']['message'])) {
                $error_message = $error_response['error']['message'];
            }
            
            return ['error' => $error_message];
        }
        
        $api_response = json_decode($response, true);
        
        if (!$api_response || !isset($api_response['choices'][0]['message']['content'])) {
            return ['error' => 'Invalid response from OpenAI'];
        }
        
        return ['content' => trim($api_response['choices'][0]['message']['content'])];
    }
}

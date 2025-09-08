<?php

require_once __DIR__ . '/ai_provider.php';

/**
 * OpenAI provider implementation
 */
class OpenAIProvider extends AIProvider {
    private $api_url = 'https://api.openai.com/v1/chat/completions';
    
    public function __construct($api_key, $model = 'gpt-4o-mini', $language = 'en') {
        parent::__construct($api_key, $model, $language);
    }
    
    public function generateSummary($content, $title) {
        $language_instruction = $this->getLanguageInstruction();
        
        if ($this->language === 'fr') {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'Tu es un assistant qui aide à résumer des notes. Crée un résumé concis et informatif de la note fournie. Le résumé doit capturer les points clés et les informations importantes.

Règles :
- Garde le résumé concis mais informatif (2-4 phrases)
- Concentre-toi sur les idées principales et les informations clés
- N\'inclus pas d\'opinions personnelles ou d\'interprétations
- Rends-le clair et facile à comprendre
- N\'utilise JAMAIS de formatage Markdown dans ta réponse
- Réponds en texte brut uniquement

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Voici une note intitulée \"$title\" :\n\n$content\n\nFournis un résumé concis de cette note."
                ]
            ];
        } else {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'You are an assistant that helps summarize notes. Create a concise and informative summary of the provided note. The summary should capture the key points and important information.

Rules:
- Keep the summary concise but informative (2-4 sentences)
- Focus on the main ideas and key information
- Do not include personal opinions or interpretations
- Make it clear and easy to understand
- NEVER use Markdown formatting in your response
- Respond in plain text only

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Here is a note titled \"$title\":\n\n$content\n\nProvide a concise summary of this note."
                ]
            ];
        }
        
        return $this->makeRequest($messages, 300, 0.5);
    }
    
    public function generateTags($content, $title) {
        $language_instruction = $this->getLanguageInstruction();
        
        if ($this->language === 'fr') {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'Tu es un assistant qui génère des tags pertinents pour les notes. Ta tâche est d\'analyser le contenu et de créer une liste de 3 à 8 tags pertinents qui décrivent le mieux les sujets principaux, thèmes et sujets couverts dans la note.

Règles :
- Génère entre 3 et 8 tags maximum
- Les tags DOIVENT être des mots uniques seulement (pas d\'espaces autorisés)
- Si un concept nécessite plusieurs mots, utilise camelCase ou des underscores (ex: "apprentissageAutomatique" ou "apprentissage_automatique")
- Concentre-toi sur les sujets principaux, concepts et thèmes
- Évite les tags génériques comme "note" ou "texte"
- Rends les tags spécifiques et significatifs
- Utilise des minuscules pour la cohérence
- Retourne seulement les tags sous forme de liste séparée par des virgules, rien d\'autre
- N\'utilise JAMAIS de formatage Markdown dans ta réponse
- Réponds en texte brut uniquement

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Voici une note intitulée \"$title\" :\n\n$content\n\nGénère des tags pertinents composés d'un seul mot pour cette note. Retourne seulement les tags sous forme de liste séparée par des virgules."
                ]
            ];
        } else {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'You are an assistant that generates relevant tags for notes. Your task is to analyze the content and create a list of 3-8 relevant tags that best describe the main topics, themes, and subjects covered in the note. 

Rules:
- Generate between 3 to 8 tags maximum
- Tags MUST be single words only (no spaces allowed)
- If a concept requires multiple words, use camelCase or underscores (e.g., "machineLearning" or "machine_learning")
- Focus on the main topics, concepts, and themes
- Avoid generic tags like "note" or "text"
- Make tags specific and meaningful
- Use lowercase for consistency
- Return only the tags as a comma-separated list, nothing else
- NEVER use Markdown formatting in your response
- Respond in plain text only

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Here is a note titled \"$title\":\n\n$content\n\nGenerate relevant single-word tags for this note. Return only the tags as a comma-separated list."
                ]
            ];
        }
        
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
        $language_instruction = $this->getLanguageInstruction();
        
        if ($this->language === 'fr') {
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
- N\'utilise JAMAIS de formatage Markdown dans ta réponse
- Réponds en texte brut uniquement

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Titre: \"$title\"\n\nContenu:\n$content\n\nAnalyse ce contenu pour détecter les erreurs factuelles, contradictions et incohérences logiques (ignore l'orthographe et la grammaire):"
                ]
            ];
        } else {
            $messages = [
                [
                    'role' => 'system',
                    'content' => 'You are an expert assistant for text correction. Analyze the provided content and identify factual errors, logical inconsistencies, contradictions, and potentially incorrect information.

IMPORTANT RULES:
- Completely ignore spelling, grammar, and syntax
- Focus ONLY on FACTUAL and logical errors
- Identify internal contradictions in the text
- Flag statements that seem factually incorrect
- Mention dates, numbers, or facts that appear erroneous
- Indicate logical inconsistencies in the reasoning

Response format:
- If you find factual errors: list them clearly with explanations
- If no factual errors: simply respond "No factual errors detected."
- NEVER use Markdown formatting in your response
- Respond in plain text only

' . $language_instruction
                ],
                [
                    'role' => 'user',
                    'content' => "Title: \"$title\"\n\nContent:\n$content\n\nAnalyze this content for factual errors, contradictions, and logical inconsistencies (ignore spelling and grammar):"
                ]
            ];
        }
        
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
    
    private function getLanguageInstruction() {
        $language_map = [
            'en' => 'CRITICAL: Your entire response must be written in English. Do not use any other language.',
            'fr' => 'CRITICAL: Your entire response must be written in French. Do not use any other language.'
        ];
        
        return isset($language_map[$this->language]) ? $language_map[$this->language] : $language_map['en'];
    }
}

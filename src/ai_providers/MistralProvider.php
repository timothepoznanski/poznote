<?php

require_once __DIR__ . '/AIProvider.php';

/**
 * Mistral AI provider implementation
 */
class MistralProvider extends AIProvider {
    private $api_url = 'https://api.mistral.ai/v1/chat/completions';
    
    public function __construct($api_key, $model = 'mistral-large-latest') {
        parent::__construct($api_key, $model);
    }
    
    public function generateSummary($content, $title) {
        $messages = [
            [
                'role' => 'system',
                'content' => 'Tu es un assistant qui aide à résumer des notes. Crée un résumé concis et informatif de la note fournie. Le résumé doit capturer les points clés et les informations importantes.

Règles :
- Garde le résumé concis mais informatif (2-4 phrases)
- Concentre-toi sur les idées principales et les informations clés
- Utilise la même langue que la note originale
- N\'inclus pas d\'opinions personnelles ou d\'interprétations
- Rends-le clair et facile à comprendre

CRITIQUE : Toute ta réponse doit être écrite dans la même langue principale que le contenu de la note ci-dessus. Ne traduis pas, ne mélange pas les langues, et ne réponds dans aucune autre langue que celle utilisée principalement dans le contenu de la note.'
            ],
            [
                'role' => 'user',
                'content' => "Voici une note intitulée \"$title\" :\n\n$content\n\nFournis un résumé concis de cette note."
            ]
        ];
        
        return $this->makeRequest($messages, 300, 0.5);
    }
    
    public function generateTags($content, $title) {
        $messages = [
            [
                'role' => 'system',
                'content' => 'Tu es un assistant qui génère des tags pertinents pour les notes. Ta tâche est d\'analyser le contenu et de créer une liste de 3 à 8 tags pertinents qui décrivent le mieux les sujets principaux, thèmes et sujets couverts dans la note.

Règles :
- Génère entre 3 et 8 tags maximum
- Les tags DOIVENT être des mots uniques seulement (pas d\'espaces autorisés)
- Si un concept nécessite plusieurs mots, utilise camelCase ou des underscores (ex: "apprentissageAutomatique" ou "apprentissage_automatique")
- Les tags doivent être dans la même langue que le contenu de la note
- Concentre-toi sur les sujets principaux, concepts et thèmes
- Évite les tags génériques comme "note" ou "texte"
- Rends les tags spécifiques et significatifs
- Utilise des minuscules pour la cohérence
- Retourne seulement les tags sous forme de liste séparée par des virgules, rien d\'autre'
            ],
            [
                'role' => 'user',
                'content' => "Voici une note intitulée \"$title\" :\n\n$content\n\nGénère des tags pertinents composés d'un seul mot pour cette note. Retourne seulement les tags sous forme de liste séparée par des virgules."
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
        return 'Mistral AI';
    }
    
    public function getAvailableModels() {
        return [
            'mistral-large-latest' => 'Mistral Large (Recommandé)',
            'mistral-medium-latest' => 'Mistral Medium',
            'mistral-small-latest' => 'Mistral Small',
            'open-mistral-7b' => 'Open Mistral 7B',
            'open-mixtral-8x7b' => 'Open Mixtral 8x7B',
            'open-mixtral-8x22b' => 'Open Mixtral 8x22B'
        ];
    }
    
    public function testConnection() {
        $messages = [
            [
                'role' => 'user',
                'content' => 'Bonjour, ceci est un message de test. Réponds avec "Connexion réussie".'
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
            $error_message = 'Mistral AI API error';
            
            if (isset($error_response['error']['message'])) {
                $error_message = $error_response['error']['message'];
            } elseif (isset($error_response['message'])) {
                $error_message = $error_response['message'];
            }
            
            return ['error' => $error_message . ' (Code: ' . $http_code . ')'];
        }
        
        $api_response = json_decode($response, true);
        
        if (!$api_response || !isset($api_response['choices'][0]['message']['content'])) {
            return ['error' => 'Invalid response from Mistral AI'];
        }
        
        return ['content' => trim($api_response['choices'][0]['message']['content'])];
    }
}

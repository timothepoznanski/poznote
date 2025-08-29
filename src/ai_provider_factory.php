<?php

require_once __DIR__ . '/open_ai_provider.php';
require_once __DIR__ . '/mistral_provider.php';

/**
 * Factory class to create AI provider instances
 */
class AIProviderFactory {
    /**
     * Create an AI provider instance based on configuration
     * @param PDO $database Database connection
     * @return AIProvider|null
     */
    public static function create($database) {
        try {
            // Get AI configuration from settings
            $stmt = $database->prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)");
            $stmt->execute(['ai_enabled', 'ai_provider', 'openai_api_key', 'mistral_api_key']);
            
            $settings = [];
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $settings[$row['key']] = $row['value'];
            }
            
            // Check if AI is enabled
            if (!isset($settings['ai_enabled']) || $settings['ai_enabled'] !== '1') {
                return null;
            }
            
            $provider = isset($settings['ai_provider']) ? $settings['ai_provider'] : 'openai';
            
            switch ($provider) {
                case 'mistral':
                    if (!isset($settings['mistral_api_key']) || empty($settings['mistral_api_key'])) {
                        throw new Exception('Mistral API key not configured');
                    }
                    
                    // Get Mistral model from settings
                    $stmt = $database->prepare("SELECT value FROM settings WHERE key = ?");
                    $stmt->execute(['mistral_model']);
                    $model = $stmt->fetchColumn() ?: 'mistral-large-latest';
                    
                    return new MistralProvider($settings['mistral_api_key'], $model);
                    
                case 'openai':
                default:
                    if (!isset($settings['openai_api_key']) || empty($settings['openai_api_key'])) {
                        throw new Exception('OpenAI API key not configured');
                    }
                    
                    // Get OpenAI model from settings
                    $stmt = $database->prepare("SELECT value FROM settings WHERE key = ?");
                    $stmt->execute(['openai_model']);
                    $model = $stmt->fetchColumn() ?: 'gpt-4o-mini';
                    
                    return new OpenAIProvider($settings['openai_api_key'], $model);
            }
            
        } catch (Exception $e) {
            error_log('AI Provider Factory Error: ' . $e->getMessage());
            return null;
        }
    }
    
    /**
     * Get available providers
     * @return array
     */
    public static function getAvailableProviders() {
        return [
            'openai' => 'OpenAI',
            'mistral' => 'Mistral AI'
        ];
    }
    
    /**
     * Get models for a specific provider
     * @param string $provider Provider name
     * @return array
     */
    public static function getModelsForProvider($provider) {
        switch ($provider) {
            case 'mistral':
                $mistralProvider = new MistralProvider('dummy', 'mistral-large-latest');
                return $mistralProvider->getAvailableModels();
                
            case 'openai':
            default:
                $openaiProvider = new OpenAIProvider('dummy', 'gpt-4o-mini');
                return $openaiProvider->getAvailableModels();
        }
    }
}

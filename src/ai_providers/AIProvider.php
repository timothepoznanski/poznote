<?php

/**
 * Abstract class for AI providers
 * This class defines the interface that all AI providers must implement
 */
abstract class AIProvider {
    protected $api_key;
    protected $model;
    
    public function __construct($api_key, $model = null) {
        $this->api_key = $api_key;
        $this->model = $model;
    }
    
    /**
     * Generate a summary for the given content
     * @param string $content The content to summarize
     * @param string $title The title of the note
     * @return array Response with 'content' key or 'error' key
     */
    abstract public function generateSummary($content, $title);
    
    /**
     * Generate tags for the given content
     * @param string $content The content to generate tags for
     * @param string $title The title of the note
     * @return array Response with 'tags' key (array) or 'error' key
     */
    abstract public function generateTags($content, $title);
    
    /**
     * Check for errors and suggest corrections
     * @param string $content The content to check
     * @param string $title The title of the note
     * @return array Response with 'corrections' key or 'error' key
     */
    abstract public function checkErrors($content, $title);
    
    /**
     * Get the provider name
     * @return string
     */
    abstract public function getProviderName();
    
    /**
     * Get available models for this provider
     * @return array
     */
    abstract public function getAvailableModels();
    
    /**
     * Test the API connection
     * @return array Response with 'success' boolean and optional 'error' message
     */
    abstract public function testConnection();
}

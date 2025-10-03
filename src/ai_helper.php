<?php

require_once __DIR__ . '/ai_provider_factory.php';

/**
 * AI Helper class to simplify AI operations
 */
class AIHelper {
    
    /**
     * Get an AI provider instance
     * @param PDO $database Database connection
     * @return AIProvider|null
     */
    public static function getProvider($database) {
        return AIProviderFactory::create($database);
    }
    
    /**
     * Check if AI is enabled and properly configured
     * @param PDO $database Database connection
     * @return array Result with 'enabled' boolean and optional 'error' message
     */
    public static function checkAIStatus($database) {
        try {
            $provider = self::getProvider($database);
            
            if ($provider === null) {
                return ['enabled' => false, 'error' => 'AI features are disabled or not configured. See settings to enable.'];
            }
            
            return ['enabled' => true, 'provider' => $provider->getProviderName()];
            
        } catch (Exception $e) {
            return ['enabled' => false, 'error' => $e->getMessage()];
        }
    }
    
    /**
     * Generate a summary for a note
     * @param int $note_id Note ID
     * @param PDO $database Database connection
     * @return array Result array
     */
    public static function generateSummary($note_id, $database, $workspace = null) {
        // Check AI status
        $status = self::checkAIStatus($database);
        if (!$status['enabled']) {
            return ['error' => $status['error']];
        }
        
        // Get note
        if ($workspace) {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$note_id, $workspace, $workspace]);
        } else {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ?");
            $stmt->execute([$note_id]);
        }
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$note) {
            return ['error' => 'Note not found'];
        }
        
        // Get note content
        include_once __DIR__ . '/functions.php';
        $entries_path = getEntriesPath();
        $html_file = $entries_path . '/' . $note_id . '.html';
        
        if (!file_exists($html_file)) {
            return ['error' => 'Note content file not found'];
        }
        
        $html_content = file_get_contents($html_file);
        if ($html_content === false) {
            return ['error' => 'Could not read note content'];
        }
        
        // Prepare content
        $content = strip_tags($html_content);
        $content = html_entity_decode($content, ENT_QUOTES, 'UTF-8');
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            return ['error' => 'Note content is empty'];
        }
        
        // Limit content length
        if (strlen($content) > 8000) {
            $content = substr($content, 0, 8000) . '...';
        }
        
        $title = $note['heading'] ?: 'Untitled';
        
        // Generate summary
        $provider = self::getProvider($database);
        $result = $provider->generateSummary($content, $title);
        
        if (isset($result['error'])) {
            return $result;
        }
        
        return ['summary' => $result['content']];
    }
    
    /**
     * Generate tags for a note
     * @param int $note_id Note ID
     * @param PDO $database Database connection
     * @return array Result array
     */
    public static function generateTags($note_id, $database, $workspace = null) {
        // Check AI status
        $status = self::checkAIStatus($database);
        if (!$status['enabled']) {
            return ['error' => $status['error']];
        }
        
        // Get note
        if ($workspace) {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$note_id, $workspace, $workspace]);
        } else {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ?");
            $stmt->execute([$note_id]);
        }
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$note) {
            return ['error' => 'Note not found'];
        }
        
        // Get note content
        include_once __DIR__ . '/functions.php';
        $entries_path = getEntriesPath();
        $html_file = $entries_path . '/' . $note_id . '.html';
        
        if (!file_exists($html_file)) {
            return ['error' => 'Note content file not found'];
        }
        
        $html_content = file_get_contents($html_file);
        if ($html_content === false) {
            return ['error' => 'Could not read note content'];
        }
        
        // Prepare content
        $content = strip_tags($html_content);
        $content = html_entity_decode($content, ENT_QUOTES, 'UTF-8');
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            return ['error' => 'Note content is empty'];
        }
        
        // Limit content length
        if (strlen($content) > 4000) {
            $content = substr($content, 0, 4000) . '...';
        }
        
        $title = $note['heading'] ?: 'Untitled';
        
        // Generate tags
        $provider = self::getProvider($database);
        return $provider->generateTags($content, $title);
    }
    
    /**
     * Check errors in a note
     * @param int $note_id Note ID
     * @param PDO $database Database connection
     * @return array Result array
     */
    public static function checkErrors($note_id, $database, $workspace = null) {
        // Check AI status
        $status = self::checkAIStatus($database);
        if (!$status['enabled']) {
            return ['error' => $status['error']];
        }
        
        // Get note
        if ($workspace) {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ? AND (workspace = ? OR (workspace IS NULL AND ? = 'Poznote'))");
            $stmt->execute([$note_id, $workspace, $workspace]);
        } else {
            $stmt = $database->prepare("SELECT * FROM entries WHERE id = ?");
            $stmt->execute([$note_id]);
        }
        $note = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$note) {
            return ['error' => 'Note not found'];
        }
        
        // Get note content
        include_once __DIR__ . '/functions.php';
        $entries_path = getEntriesPath();
        $html_file = $entries_path . '/' . $note_id . '.html';
        
        if (!file_exists($html_file)) {
            return ['error' => 'Note content file not found'];
        }
        
        $html_content = file_get_contents($html_file);
        if ($html_content === false) {
            return ['error' => 'Could not read note content'];
        }
        
        // Prepare content
        $content = strip_tags($html_content);
        $content = html_entity_decode($content, ENT_QUOTES, 'UTF-8');
        $content = preg_replace('/\s+/', ' ', $content);
        $content = trim($content);
        
        if (empty($content)) {
            return ['error' => 'Note content is empty'];
        }
        
        // Limit content length
        if (strlen($content) > 12000) {
            $content = substr($content, 0, 12000) . '...';
        }
        
        $title = $note['heading'] ?: 'Untitled';
        
        // Check errors
        $provider = self::getProvider($database);
        return $provider->checkErrors($content, $title);
    }
}

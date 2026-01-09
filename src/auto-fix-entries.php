#!/usr/bin/env php
<?php
/**
 * Auto-fix empty entry columns on startup
 * This script runs at container startup to fix any notes with empty entry columns
 */

$projectRoot = dirname(__DIR__);
$dbPath = $projectRoot . '/data/database/poznote.db';
$entriesPath = $projectRoot . '/data/entries';

echo "[Poznote] Checking for notes with empty entry columns...\n";

/**
 * Clean content for search by removing base64 images and other heavy data
 */
function cleanContentForSearch($content) {
    // Remove base64 images (data:image/...)
    $content = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $content);
    
    // Remove Excalidraw containers with embedded data
    $content = preg_replace('/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s', '[Excalidraw diagram]', $content);
    
    return $content;
}

try {
    // Connect to database
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Count notes with empty entry
    $total = $pdo->query("SELECT COUNT(*) FROM entries WHERE (entry IS NULL OR entry = '')")->fetchColumn();
    
    if ($total == 0) {
        echo "[Poznote] All notes OK - no empty entry columns found.\n";
        exit(0);
    }
    
    echo "[Poznote] Found $total notes with empty entry columns. Fixing...\n";
    
    // Get notes with empty entry
    $selectStmt = $pdo->query("SELECT id, type FROM entries WHERE (entry IS NULL OR entry = '')");
    $notes = $selectStmt->fetchAll(PDO::FETCH_ASSOC);
    
    $fixed = 0;
    $skipped = 0;
    
    // Process each note
    foreach ($notes as $note) {
        $id = $note['id'];
        
        // Find file by ID regardless of extension
        $pattern = $entriesPath . '/' . $id . '.*';
        $files = glob($pattern);
        
        if (empty($files) || !is_file($files[0])) {
            $skipped++;
            continue;
        }
        
        $filePath = $files[0];
        $content = file_get_contents($filePath);
        
        if ($content === false || $content === '') {
            $skipped++;
            continue;
        }
        
        // Clean content for search (remove base64 images, etc.)
        $cleanedContent = cleanContentForSearch($content);
        
        try {
            $updateStmt = $pdo->prepare("UPDATE entries SET entry = ? WHERE id = ?");
            $updateStmt->execute([$cleanedContent, $id]);
            $fixed++;
        } catch (Exception $e) {
            $skipped++;
        }
    }
    
    echo "[Poznote] Fixed $fixed notes, skipped $skipped notes.\n";
    
} catch (PDOException $e) {
    echo "[Poznote] Warning: Could not fix empty entries - " . $e->getMessage() . "\n";
    exit(0); // Don't fail the startup
}

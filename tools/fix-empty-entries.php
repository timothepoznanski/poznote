#!/usr/bin/env php
<?php
/**
 * fix-empty-entries.php
 * 
 * Script to fix notes that have empty 'entry' column in the database.
 * This can happen after importing notes from non-Poznote ZIP files.
 * The script reads the content from the file system and updates the database.
 *
 * Usage:
 *   php fix-empty-entries.php [workspace]
 *
 * Arguments:
 *   workspace  (optional) Only fix notes in this specific workspace
 *
 * Examples:
 *   php fix-empty-entries.php              # Fix all notes with empty entry
 *   php fix-empty-entries.php aaaaaaa      # Fix only notes in workspace 'aaaaaaa'
 */

// Determine paths
$scriptDir = __DIR__;
$projectRoot = dirname($scriptDir);
$dbPath = $projectRoot . '/data/database/poznote.db';
$entriesPath = $projectRoot . '/data/entries';

// Colors for output
$colors = [
    'red' => "\033[0;31m",
    'green' => "\033[0;32m",
    'yellow' => "\033[1;33m",
    'nc' => "\033[0m"
];

echo "========================================\n";
echo "Poznote - Fix Empty Entry Columns\n";
echo "========================================\n";
echo "\n";
echo "Database: $dbPath\n";
echo "Entries:  $entriesPath\n";

// Check if database exists
if (!file_exists($dbPath)) {
    echo $colors['red'] . "Error: Database not found at $dbPath" . $colors['nc'] . "\n";
    exit(1);
}

// Check if entries directory exists
if (!is_dir($entriesPath)) {
    echo $colors['red'] . "Error: Entries directory not found at $entriesPath" . $colors['nc'] . "\n";
    exit(1);
}

// Get optional workspace filter
$workspaceFilter = $argv[1] ?? null;

if ($workspaceFilter) {
    echo "Workspace filter: $workspaceFilter\n";
}
echo "\n";

try {
    // Connect to database
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Build query
    if ($workspaceFilter) {
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM entries WHERE (entry IS NULL OR entry = '') AND workspace = ?");
        $countStmt->execute([$workspaceFilter]);
        $total = $countStmt->fetchColumn();
        
        $selectStmt = $pdo->prepare("SELECT id, type, workspace FROM entries WHERE (entry IS NULL OR entry = '') AND workspace = ?");
        $selectStmt->execute([$workspaceFilter]);
    } else {
        $total = $pdo->query("SELECT COUNT(*) FROM entries WHERE (entry IS NULL OR entry = '')")->fetchColumn();
        $selectStmt = $pdo->query("SELECT id, type, workspace FROM entries WHERE (entry IS NULL OR entry = '')");
    }
    
    if ($total == 0) {
        echo $colors['green'] . "No notes with empty entry column found. Nothing to fix!" . $colors['nc'] . "\n";
        exit(0);
    }
    
    echo $colors['yellow'] . "Found $total notes with empty entry column." . $colors['nc'] . "\n";
    echo "\n";
    echo "Do you want to fix them? (y/N) ";
    
    $handle = fopen("php://stdin", "r");
    $line = fgets($handle);
    fclose($handle);
    
    if (strtolower(trim($line)) !== 'y') {
        echo "Aborted.\n";
        exit(0);
    }
    
    echo "\nProcessing...\n";
    
    // Counters
    $fixed = 0;
    $skipped = 0;
    $errors = 0;
    
    // Process each note
    $notes = $selectStmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($notes as $note) {
        $id = $note['id'];
        $type = $note['type'];
        
        // Find file by ID regardless of extension
        $pattern = $entriesPath . '/' . $id . '.*';
        $files = glob($pattern);
        
        if (empty($files) || !is_file($files[0])) {
            $skipped++;
            echo $colors['yellow'] . "⊘" . $colors['nc'] . " Skipped note #$id (file not found)\n";
            continue;
        }
        
        $filePath = $files[0];
        $content = file_get_contents($filePath);
        
        if ($content === false || $content === '') {
            $skipped++;
            echo $colors['yellow'] . "⊘" . $colors['nc'] . " Skipped note #$id (empty or unreadable file)\n";
            continue;
        }
        
        try {
            $updateStmt = $pdo->prepare("UPDATE entries SET entry = ? WHERE id = ?");
            $updateStmt->execute([$content, $id]);
            
            $fixed++;
            echo $colors['green'] . "✓" . $colors['nc'] . " Fixed note #$id ($type)\n";
        } catch (Exception $e) {
            $errors++;
            echo $colors['red'] . "✗" . $colors['nc'] . " Error updating note #$id: " . $e->getMessage() . "\n";
        }
    }
    
    echo "\n";
    echo "========================================\n";
    echo "Summary\n";
    echo "========================================\n";
    echo $colors['green'] . "Fixed:   $fixed" . $colors['nc'] . "\n";
    echo $colors['yellow'] . "Skipped: $skipped" . $colors['nc'] . "\n";
    echo $colors['red'] . "Errors:  $errors" . $colors['nc'] . "\n";
    echo "\n";
    
    if ($fixed > 0) {
        echo $colors['green'] . "Done! Search should now work on the fixed notes." . $colors['nc'] . "\n";
    }
    
} catch (PDOException $e) {
    echo $colors['red'] . "Database error: " . $e->getMessage() . $colors['nc'] . "\n";
    exit(1);
}

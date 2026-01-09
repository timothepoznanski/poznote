<?php
/**
 * Migration script: Move subheading content to first line of note content
 * 
 * This script checks all notes with non-empty subheading column,
 * prepends the subheading to the note content, and clears the subheading column.
 * 
 * Run this script once to migrate existing subheadings.
 */

// Prevent web access
if (php_sapi_name() !== 'cli') {
    die('This script can only be run from the command line.');
}

// Use same database path logic as config.php
$dbPath = $_ENV['SQLITE_DATABASE'] ?? dirname(__DIR__) . '/data/database/poznote.db';
$entriesDir = dirname($dbPath) . '/../entries';

if (!file_exists($dbPath)) {
    echo "Database not found at $dbPath - skipping subheading migration\n";
    exit(0);
}

try {
    $con = new PDO("sqlite:$dbPath");
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Check if subheading column exists
    $columns = $con->query("PRAGMA table_info(entries)")->fetchAll(PDO::FETCH_ASSOC);
    $hasSubheading = false;
    foreach ($columns as $col) {
        if ($col['name'] === 'subheading') {
            $hasSubheading = true;
            break;
        }
    }
    
    if (!$hasSubheading) {
        echo "No subheading column found - skipping migration\n";
        exit(0);
    }
    
    // Find all notes with non-empty subheading
    $stmt = $con->prepare("SELECT id, subheading, type FROM entries WHERE subheading IS NOT NULL AND subheading != '' AND trim(subheading) != ''");
    $stmt->execute();
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (count($notes) === 0) {
        echo "No notes with subheadings found - nothing to migrate\n";
        exit(0);
    }
    
    echo "Found " . count($notes) . " note(s) with subheadings to migrate\n";
    
    $migratedCount = 0;
    $errorCount = 0;
    
    foreach ($notes as $note) {
        $noteId = $note['id'];
        $subheading = trim($note['subheading']);
        $noteType = $note['type'] ?? 'note';
        
        // Determine the file path and extension
        $filePath = "$entriesDir/$noteId.html";
        if (!file_exists($filePath)) {
            echo "Warning: Entry file not found for note $noteId - skipping\n";
            $errorCount++;
            continue;
        }
        
        // Read current content
        $content = file_get_contents($filePath);
        if ($content === false) {
            echo "Error: Could not read file for note $noteId - skipping\n";
            $errorCount++;
            continue;
        }
        
        // For HTML notes, we need to insert the subheading after <body> tag
        // For markdown notes, we prepend it at the beginning
        if ($noteType === 'markdown') {
            // Markdown: simple prepend with line break
            $newContent = $subheading . "\n\n" . $content;
        } else {
            // HTML: Insert after <body> tag
            if (preg_match('/(<body[^>]*>)/i', $content, $matches)) {
                // Insert subheading as first paragraph after body tag
                $subheadingHtml = '<div>' . htmlspecialchars($subheading) . '</div><div>&nbsp;</div>';
                $newContent = preg_replace('/(<body[^>]*>)/i', '$1' . "\n" . $subheadingHtml, $content, 1);
            } else {
                // No body tag found, prepend as HTML
                $subheadingHtml = '<div>' . htmlspecialchars($subheading) . '</div><div>&nbsp;</div>';
                $newContent = $subheadingHtml . "\n" . $content;
            }
        }
        
        // Write updated content
        if (file_put_contents($filePath, $newContent) === false) {
            echo "Error: Could not write file for note $noteId - skipping\n";
            $errorCount++;
            continue;
        }
        
        // Clear the subheading column for this note
        $updateStmt = $con->prepare("UPDATE entries SET subheading = '' WHERE id = ?");
        $updateStmt->execute([$noteId]);
        
        echo "Migrated subheading for note $noteId\n";
        $migratedCount++;
    }
    
    echo "\nMigration complete: $migratedCount note(s) migrated";
    if ($errorCount > 0) {
        echo ", $errorCount error(s)";
    }
    echo "\n";
    
} catch (PDOException $e) {
    echo "Database error: " . $e->getMessage() . "\n";
    exit(1);
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}

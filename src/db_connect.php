<?php

// SQLite connection
try {
    // Ensure the database directory exists
    $dbPath = SQLITE_DATABASE;
    $dbDir = dirname($dbPath);
    if (!is_dir($dbDir)) {
        mkdir($dbDir, 0755, true);
    }
    
    $con = new PDO('sqlite:' . $dbPath);
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->exec('PRAGMA foreign_keys = ON');
        
    // Register custom SQLite function to clean HTML content for search
    $con->sqliteCreateFunction('search_clean_entry', function($html) {
        if (empty($html)) {
            return '';
        }
        
        // Remove Excalidraw containers with their data-excalidraw attributes and base64 images
        $html = preg_replace(
            '/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s',
            '[Excalidraw diagram]',
            $html
        );
        
        // Remove any remaining base64 image data
        $html = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $html);
        
        // Strip remaining HTML tags but keep the text content
        $text = strip_tags($html);
        
        // Clean up extra whitespace
        $text = preg_replace('/\s+/', ' ', $text);
        $text = trim($text);
        
        return $text;
    }, 1);
    
    // Create entries table
    $con->exec('CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trash INTEGER DEFAULT 0,
        heading TEXT,
        subheading TEXT,
        location TEXT,
        entry TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME,
        tags TEXT,
        folder TEXT DEFAULT "Default",
        folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        workspace TEXT DEFAULT "Poznote",
        favorite INTEGER DEFAULT 0,
        attachments TEXT,
        type TEXT DEFAULT "note"
    )');

    // Add missing columns to entries if they don't exist (migration for old backups)
    try {
        $cols = $con->query("PRAGMA table_info(entries)")->fetchAll(PDO::FETCH_ASSOC);
        $existingColumns = array_column($cols, 'name');
        
        // Add 'folder_id' column if missing
        if (!in_array('folder_id', $existingColumns)) {
            $con->exec("ALTER TABLE entries ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL");
        }
        // Add 'location' column if missing
        if (!in_array('location', $existingColumns)) {
            $con->exec("ALTER TABLE entries ADD COLUMN location TEXT");
        }
        // Add 'subheading' column if missing
        if (!in_array('subheading', $existingColumns)) {
            $con->exec("ALTER TABLE entries ADD COLUMN subheading TEXT");
        }
        // Add 'type' column if missing
        if (!in_array('type', $existingColumns)) {
            $con->exec("ALTER TABLE entries ADD COLUMN type TEXT DEFAULT 'note'");
        }
    } catch (Exception $e) {
        error_log('Could not add missing columns to entries: ' . $e->getMessage());
    }

    // Create folders table for empty folders (scoped by workspace)
    // Note: For new installations this creates the full schema.
    // For old backups, this does nothing since table exists (migrations below handle missing columns)
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT DEFAULT "Poznote",
        parent_id INTEGER DEFAULT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    )');

    // === MIGRATIONS FOR OLD BACKUPS ===
    // These MUST run BEFORE any indexes that use these columns
    
    // Add missing columns to folders if they don't exist (migration for old backups)
    try {
        $cols = $con->query("PRAGMA table_info(folders)")->fetchAll(PDO::FETCH_ASSOC);
        $existingColumns = array_column($cols, 'name');
        
        // Add 'parent_id' column if missing (for subfolder support)
        if (!in_array('parent_id', $existingColumns)) {
            $con->exec("ALTER TABLE folders ADD COLUMN parent_id INTEGER DEFAULT NULL");
        }
        // Add 'icon' column if missing (for custom folder icons)
        if (!in_array('icon', $existingColumns)) {
            $con->exec("ALTER TABLE folders ADD COLUMN icon TEXT");
        }
    } catch (Exception $e) {
        error_log('Could not add missing columns to folders: ' . $e->getMessage());
    }

    // === END MIGRATIONS ===

    // Ensure unique folder names per workspace and parent
    // These indexes use parent_id, so they MUST come AFTER the migration above
    // For subfolders (parent_id IS NOT NULL): same name allowed in different parents
    $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_parent_notnull 
                ON folders(name, workspace, parent_id) 
                WHERE parent_id IS NOT NULL');
    
    // For root folders (parent_id IS NULL): same name NOT allowed
    $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_root 
                ON folders(name, workspace) 
                WHERE parent_id IS NULL');

    // Create workspaces table
    $con->exec('CREATE TABLE IF NOT EXISTS workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP
    )');

    // Insert default workspace only if no workspaces exist
    $wsCount = $con->query("SELECT COUNT(*) FROM workspaces")->fetchColumn();
    if ((int)$wsCount === 0) {
        $con->exec("INSERT OR IGNORE INTO workspaces (name) VALUES ('Poznote')");
    }

    // Create settings table for configuration
    $con->exec('CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )');

    // Table for public shared notes (token based)
    $con->exec('CREATE TABLE IF NOT EXISTS shared_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires DATETIME,
        FOREIGN KEY(note_id) REFERENCES entries(id) ON DELETE CASCADE
    )');

    // Add missing columns to shared_notes if they don't exist (migration for old backups)
    try {
        $cols = $con->query("PRAGMA table_info(shared_notes)")->fetchAll(PDO::FETCH_ASSOC);
        $existingColumns = array_column($cols, 'name');
        
        // Add 'theme' column if missing (for storing chosen display mode)
        if (!in_array('theme', $existingColumns)) {
            $con->exec("ALTER TABLE shared_notes ADD COLUMN theme TEXT");
        }
        // Add 'indexable' column if missing (controls whether the page can be indexed by search engines)
        if (!in_array('indexable', $existingColumns)) {
            $con->exec("ALTER TABLE shared_notes ADD COLUMN indexable INTEGER DEFAULT 0");
        }
        // Add 'password' column if missing (optional password protection for shared notes)
        if (!in_array('password', $existingColumns)) {
            $con->exec("ALTER TABLE shared_notes ADD COLUMN password TEXT");
        }
    } catch (Exception $e) {
        error_log('Could not add missing columns to shared_notes: ' . $e->getMessage());
    }

    // Set default settings
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('note_font_size', '15')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('emoji_icons_enabled', '1')");
    // UI language (default: English)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'en')");
    // Controls to show/hide metadata under note title in notes list (enabled by default)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_created', '1')");
    // Renamed setting: show_note_subheading (was show_note_location)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_subheading', '1')");
    // Folder counts hidden by default
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('hide_folder_counts', '0')");

    // Ensure required data directories exist
    // $dbDir points to data/database, so we need to go up one level to get data/
    $dataDir = dirname($dbDir);
    $requiredDirs = ['attachments', 'database', 'entries'];
    foreach ($requiredDirs as $dir) {
        $fullPath = $dataDir . '/' . $dir;
        if (!is_dir($fullPath)) {
            if (!mkdir($fullPath, 0755, true)) {
                error_log("Failed to create directory: $fullPath");
                continue;
            }
            // Set proper ownership if running as root (Docker context)
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                chown($fullPath, 'www-data');
                chgrp($fullPath, 'www-data');
            }
        }
    }

    // Create welcome note and Getting Started folder if no notes exist (first installation)
    try {
        // Check if ANY notes exist (including in trash) - only create welcome note on true first installation
        $totalNoteCount = $con->query("SELECT COUNT(*) FROM entries")->fetchColumn();
        
        if ($totalNoteCount == 0) {
            // Create "Getting Started" folder first
            $con->exec("INSERT OR IGNORE INTO folders (name, workspace, created) VALUES ('Getting Started', 'Poznote', datetime('now'))");
            
            // Get the folder ID
            $folderStmt = $con->query("SELECT id FROM folders WHERE name = 'Getting Started' AND workspace = 'Poznote'");
            $folderData = $folderStmt->fetch(PDO::FETCH_ASSOC);
            $folderId = $folderData ? (int)$folderData['id'] : null;
            
            // Create welcome note content (kept in a separate template file)
            $welcomeTemplateFile = __DIR__ . '/welcome_note.html';
            $welcomeContent = @file_get_contents($welcomeTemplateFile);

            // Fallback in case the template file is missing
            if ($welcomeContent === false || trim($welcomeContent) === '') {
                $welcomeContent = '<p>Welcome to Poznote.</p>';
            }

            // Insert the welcome note
            $now_utc = gmdate('Y-m-d H:i:s', time());
            $stmt = $con->prepare("INSERT INTO entries (heading, entry, folder, folder_id, workspace, type, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute(['👋 Welcome to Poznote', '', 'Getting Started', $folderId, 'Poznote', 'note', $now_utc, $now_utc]);
            
            $welcomeNoteId = $con->lastInsertId();
            
            // Create the HTML file for the welcome note
            $dataDir = dirname($dbDir);
            $entriesDir = $dataDir . '/entries';
            if (!is_dir($entriesDir)) {
                mkdir($entriesDir, 0755, true);
            }
            
            $welcomeFile = $entriesDir . '/' . $welcomeNoteId . '.html';
            file_put_contents($welcomeFile, $welcomeContent);
            chmod($welcomeFile, 0644);
            
            // Set proper ownership if running as root
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                chown($welcomeFile, 'www-data');
                chgrp($welcomeFile, 'www-data');
            }
        }
    } catch(Exception $e) {
        // Log error but don't fail database connection
        error_log("Failed to create welcome note: " . $e->getMessage());
    }

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

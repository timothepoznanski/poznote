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
    
    // Note: Database schema migrations are handled by init-permissions.sh at container startup
    // This ensures the migration happens before any PHP processes start, avoiding locking issues
    
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
        entry TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME,
        tags TEXT,
        folder TEXT DEFAULT "Default",
        workspace TEXT DEFAULT "Poznote",
        favorite INTEGER DEFAULT 0,
        attachments TEXT,
        type TEXT DEFAULT "note"
    )');

    // Add location column if it doesn't exist (for backward compatibility)
    try {
        $con->exec('ALTER TABLE entries ADD COLUMN location TEXT');
    } catch(PDOException $e) {
        // Column might already exist, ignore error
    }

    // Add subheading column (renamed from location) for new code paths. Keep location for compatibility.
    try {
        $con->exec('ALTER TABLE entries ADD COLUMN subheading TEXT');
    } catch(PDOException $e) {
        // ignore if already exists
    }

    // Add type column for note types (regular note, tasklist, etc.)
    try {
        $con->exec('ALTER TABLE entries ADD COLUMN type TEXT DEFAULT "note"');
    } catch(PDOException $e) {
        // ignore if already exists
    }

    // Migrate existing values: if subheading empty and location present, copy location -> subheading
    try {
        $con->exec("UPDATE entries SET subheading = location WHERE (subheading IS NULL OR subheading = '') AND (location IS NOT NULL AND location <> '')");
    } catch(PDOException $e) {
        // ignore migration errors
    }

    // Add folder_id column to reference folders by ID instead of name
    try {
        $con->exec('ALTER TABLE entries ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL');
    } catch(PDOException $e) {
        // ignore if already exists
    }

    // Ensure all folder names from entries exist in folders table (one-time migration)
    // DISABLED: This auto-creation causes duplicates with subfolder support
    // Now that we use folder_id, we should not auto-create folders based on names
    /*
    try {
        // Use INSERT OR IGNORE to create missing folders in one query per folder
        $con->exec("
            INSERT OR IGNORE INTO folders (name, workspace)
            SELECT DISTINCT 
                folder as name, 
                COALESCE(workspace, 'Poznote') as workspace
            FROM entries 
            WHERE folder IS NOT NULL 
            AND folder != '' 
            AND folder != 'Favorites'
        ");
    } catch(PDOException $e) {
        error_log("Folder creation warning: " . $e->getMessage());
    }
    */
    
    // Migrate existing folder names to folder_id
    try {
        // For each unique folder name in entries, find or create a corresponding folder ID
        $con->exec("
            UPDATE entries 
            SET folder_id = (
                SELECT f.id 
                FROM folders f 
                WHERE f.name = entries.folder 
                AND (f.workspace = entries.workspace OR (f.workspace IS NULL AND entries.workspace = 'Poznote'))
                LIMIT 1
            )
            WHERE folder_id IS NULL AND folder IS NOT NULL AND folder != ''
        ");
    } catch(PDOException $e) {
        // ignore migration errors
        error_log("folder_id migration warning: " . $e->getMessage());
    }

    // Create folders table for empty folders (scoped by workspace)
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT DEFAULT "Poznote",
        parent_id INTEGER DEFAULT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    )');

    // Drop old index if it exists
    $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace');
    $con->exec('DROP INDEX IF EXISTS idx_folders_name_workspace_parent');

    // Ensure unique folder names per workspace and parent
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

    // Insert default workspace
    $con->exec("INSERT OR IGNORE INTO workspaces (name) VALUES ('Poznote')");

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

    // Set default settings
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('note_font_size', '15')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('emoji_icons_enabled', '1')");
    // Controls to show/hide metadata under note title in notes list (enabled by default)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_created', '1')");
    // Renamed setting: show_note_subheading (was show_note_location)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_subheading', '1')");

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
            
            // Create welcome note content
            $welcomeContent = <<<'HTML'
<p>Poznote is your personal note-taking workspace designed for simplicity and efficiency.</p>

<h3>🚀 Quick Start</h3>
<ul>
<li><strong>Create Notes</strong>: Click the "+ New" button to create HTML notes, Markdown notes, or Task Lists</li>
<li><strong>Organize</strong>: Use folders and workspaces to keep your notes organized</li>
<li><strong>Search</strong>: Find anything instantly with tags and full-text search</li>
</ul>

<h3>💡 Learn More</h3>
<p>For pro tips, click the <strong>Display menu</strong> (eye icon in the top bar) and select <strong>"Tips and Tricks"</strong>.</p>

<p><em>You can delete this welcome note once you're comfortable with Poznote. Happy note-taking! ✨</em></p>
HTML;

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

// Do NOT set timezone here - keep PHP in UTC so datetime('now') stores UTC timestamps
// Timezone conversion should only happen when displaying dates to the user
// The user's timezone preference is loaded from settings table when needed for display
/*
// Set timezone from database settings or use default
try {
    $timezone = DEFAULT_TIMEZONE;
    if (isset($con)) {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute(['timezone']);
        $saved_timezone = $stmt->fetchColumn();
        if ($saved_timezone && $saved_timezone !== '') {
            $timezone = $saved_timezone;
        }
    }
    date_default_timezone_set($timezone);
} catch (Exception $e) {
    // Ignore errors, use default timezone
    date_default_timezone_set(DEFAULT_TIMEZONE);
}
*/

?>

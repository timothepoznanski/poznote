<?php

/**
 * Database Connection
 * 
 * Connects to the current user's personal database.
 * Each user profile has their own isolated database and files.
 */

// Include auto-migration to ensure multi-user structure exists
require_once __DIR__ . '/auto_migrate.php';

// Determine database path based on authenticated user
$dbPath = SQLITE_DATABASE; // Default path (fallback)
$activeUserId = null;

// Use user-specific database if authenticated
if (isset($_SESSION['user_id']) && $_SESSION['user_id']) {
    $activeUserId = (int)$_SESSION['user_id'];
    require_once __DIR__ . '/users/UserDataManager.php';
    $userDataManager = new UserDataManager($activeUserId);
    $dbPath = $userDataManager->getUserDatabasePath();
    
    // Ensure user directories exist
    if (!$userDataManager->userDirectoriesExist()) {
        $userDataManager->initializeUserDirectories();
    }
} else {
    // Check if this is a public shared link access
    $publicToken = $_GET['token'] ?? null;
    
    // Also check pretty URLs (tokens are usually alphanumeric/hex)
    if (!$publicToken && !empty($_SERVER['REQUEST_URI'])) {
        $uri = trim($_SERVER['REQUEST_URI'], '/');
        $parts = explode('/', $uri);
        $lastPart = end($parts);
        if ($lastPart && preg_match('/^[a-f0-9]{32}$|^[a-zA-Z0-9\-_.]{4,128}$/', $lastPart)) {
            $publicToken = $lastPart;
        }
    }
    
    if ($publicToken) {
        // Public access - lookup owner from shared_links registry
        require_once __DIR__ . '/users/db_master.php';
        try {
            $masterCon = getMasterConnection();
            $stmt = $masterCon->prepare("SELECT user_id FROM shared_links WHERE token = ? LIMIT 1");
            $stmt->execute([$publicToken]);
            $ownerId = $stmt->fetchColumn();
            
            if ($ownerId) {
                $activeUserId = (int)$ownerId;
                require_once __DIR__ . '/users/UserDataManager.php';
                $userDataManager = new UserDataManager($activeUserId);
                $dbPath = $userDataManager->getUserDatabasePath();
            }
        } catch (Exception $e) {
            error_log("Public routing failed: " . $e->getMessage());
        }
    } else {
        // Not authenticated and not a public link
        // If master.db exists (migration done), default to user 1's database
        // This ensures migrated data is accessible before first login
        $dataDir = __DIR__ . '/data';
        $masterDbPath = $dataDir . '/master.db';
        $user1DbPath = $dataDir . '/users/1/database/poznote.db';
        
        if (file_exists($masterDbPath) && file_exists($user1DbPath)) {
            $activeUserId = 1;
            require_once __DIR__ . '/users/UserDataManager.php';
            $userDataManager = new UserDataManager($activeUserId);
            $dbPath = $userDataManager->getUserDatabasePath();
        }
    }
}

// SQLite connection
try {
    // Ensure the database directory exists
    $dbDir = dirname($dbPath);
    if (!is_dir($dbDir)) {
        mkdir($dbDir, 0755, true);
    }
    
    $con = new PDO('sqlite:' . $dbPath);
    $con->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $con->exec('PRAGMA busy_timeout = 5000');
    $con->exec('PRAGMA foreign_keys = ON');
        
    // Register custom SQLite function to remove accents for accent-insensitive search
    $con->sqliteCreateFunction('remove_accents', function($text) {
        if (empty($text)) {
            return '';
        }
        
        // Convert to lowercase for case-insensitive comparison
        $text = mb_strtolower($text, 'UTF-8');
        
        // Replace accented characters with their non-accented equivalents
        $accents = [
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ã' => 'a', 'å' => 'a', 'ā' => 'a',
            'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'ē' => 'e', 'ė' => 'e', 'ę' => 'e',
            'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ī' => 'i', 'į' => 'i',
            'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o', 'ø' => 'o', 'ō' => 'o',
            'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ū' => 'u', 'ų' => 'u',
            'ý' => 'y', 'ÿ' => 'y',
            'ñ' => 'n', 'ń' => 'n',
            'ç' => 'c', 'ć' => 'c', 'č' => 'c',
            'ş' => 's', 'š' => 's', 'ś' => 's',
            'ž' => 'z', 'ź' => 'z', 'ż' => 'z',
            'ł' => 'l',
            'æ' => 'ae', 'œ' => 'oe'
        ];
        
        return strtr($text, $accents);
    }, 1);
    
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

    // Create folders table for empty folders (scoped by workspace)
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT DEFAULT "Poznote",
        parent_id INTEGER DEFAULT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    )');

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

    // Table for public shared folders (token based)
    $con->exec('CREATE TABLE IF NOT EXISTS shared_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires DATETIME,
        theme TEXT,
        indexable INTEGER DEFAULT 0,
        password TEXT,
        FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
    )');

    // --- Schema versioning: skip migrations & indexes if already up to date ---
    $CURRENT_SCHEMA_VERSION = 3;
    $currentVersion = 0;
    try {
        $svStmt = $con->query("SELECT value FROM settings WHERE key = 'schema_version'");
        $svResult = $svStmt->fetchColumn();
        if ($svResult !== false) {
            $currentVersion = (int)$svResult;
        }
    } catch (Exception $e) {
        // settings table might not exist yet for very old databases
    }

    if ($currentVersion < $CURRENT_SCHEMA_VERSION) {
        // === COLUMN MIGRATIONS ===

        // Add missing columns to entries if they don't exist (migration for old backups)
        try {
            $cols = $con->query("PRAGMA table_info(entries)")->fetchAll(PDO::FETCH_ASSOC);
            $existingColumns = array_column($cols, 'name');
            if (!in_array('folder_id', $existingColumns)) {
                $con->exec("ALTER TABLE entries ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL");
            }
            if (!in_array('location', $existingColumns)) {
                $con->exec("ALTER TABLE entries ADD COLUMN location TEXT");
            }
            if (!in_array('subheading', $existingColumns)) {
                $con->exec("ALTER TABLE entries ADD COLUMN subheading TEXT");
            }
            if (!in_array('type', $existingColumns)) {
                $con->exec("ALTER TABLE entries ADD COLUMN type TEXT DEFAULT 'note'");
            }
            if (!in_array('linked_note_id', $existingColumns)) {
                $con->exec("ALTER TABLE entries ADD COLUMN linked_note_id INTEGER REFERENCES entries(id) ON DELETE SET NULL");
            }
        } catch (Exception $e) {
            error_log('Could not add missing columns to entries: ' . $e->getMessage());
        }

        // Add missing columns to folders
        try {
            $cols = $con->query("PRAGMA table_info(folders)")->fetchAll(PDO::FETCH_ASSOC);
            $existingColumns = array_column($cols, 'name');
            if (!in_array('parent_id', $existingColumns)) {
                $con->exec("ALTER TABLE folders ADD COLUMN parent_id INTEGER DEFAULT NULL");
            }
            if (!in_array('icon', $existingColumns)) {
                $con->exec("ALTER TABLE folders ADD COLUMN icon TEXT");
            }
            if (!in_array('icon_color', $existingColumns)) {
                $con->exec("ALTER TABLE folders ADD COLUMN icon_color TEXT");
            }
            if (!in_array('kanban_enabled', $existingColumns)) {
                $con->exec("ALTER TABLE folders ADD COLUMN kanban_enabled INTEGER DEFAULT 0");
            }
            if (!in_array('sort_setting', $existingColumns)) {
                $con->exec("ALTER TABLE folders ADD COLUMN sort_setting TEXT");
            }
        } catch (Exception $e) {
            error_log('Could not add missing columns to folders: ' . $e->getMessage());
        }

        // Add missing columns to shared_notes
        try {
            $cols = $con->query("PRAGMA table_info(shared_notes)")->fetchAll(PDO::FETCH_ASSOC);
            $existingColumns = array_column($cols, 'name');
            if (!in_array('theme', $existingColumns)) {
                $con->exec("ALTER TABLE shared_notes ADD COLUMN theme TEXT");
            }
            if (!in_array('indexable', $existingColumns)) {
                $con->exec("ALTER TABLE shared_notes ADD COLUMN indexable INTEGER DEFAULT 0");
            }
            if (!in_array('password', $existingColumns)) {
                $con->exec("ALTER TABLE shared_notes ADD COLUMN password TEXT");
            }
        } catch (Exception $e) {
            error_log('Could not add missing columns to shared_notes: ' . $e->getMessage());
        }

        // === INDEXES ===
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_parent_notnull 
                    ON folders(name, workspace, parent_id) 
                    WHERE parent_id IS NOT NULL');
        $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace_root 
                    ON folders(name, workspace) 
                    WHERE parent_id IS NULL');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name COLLATE NOCASE)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_trash_workspace ON entries(trash, workspace)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated DESC)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created DESC)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_folder_id ON entries(folder_id)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_favorite ON entries(favorite)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_tags ON entries(tags)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_trash_workspace_updated ON entries(trash, workspace, updated DESC)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_entries_heading ON entries(heading COLLATE NOCASE)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_shared_notes_note_id ON shared_notes(note_id)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_shared_notes_token ON shared_notes(token)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_shared_folders_folder_id ON shared_folders(folder_id)');
        $con->exec('CREATE INDEX IF NOT EXISTS idx_shared_folders_token ON shared_folders(token)');

        // === DEFAULT SETTINGS ===
        $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('note_font_size', '15')");
        $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('emoji_icons_enabled', '1')");
        $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'en')");
        $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_created', '1')");
        $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('hide_folder_counts', '0')");

        // === Update schema version ===
        $con->exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', '$CURRENT_SCHEMA_VERSION')");
    }
    // --- End schema versioning ---

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
            $stmt->execute(['Welcome to Poznote', '', 'Getting Started', $folderId, 'Poznote', 'note', $now_utc, $now_utc]);
            
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
        // Legacy migration: ensure folder_id is populated and entries are fixed
        if (function_exists('repairDatabaseEntries')) {
            repairDatabaseEntries($con);
        }
    } catch(Exception $e) {
        // Log error but don't fail database connection
        error_log("Failed to create welcome note: " . $e->getMessage());
    }

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

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

    // Create folders table for empty folders (scoped by workspace)
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT DEFAULT "Poznote",
        created DATETIME DEFAULT CURRENT_TIMESTAMP
    )');
    
    // Ensure unique folder names per workspace
    $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace ON folders(name, workspace)');

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

    // Set default settings
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_enabled', '1')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_language', 'en')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('note_font_size_desktop', '16')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('note_font_size_mobile', '16')");
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('emoji_icons_enabled', '1')");
    // Controls to show/hide metadata under note title in notes list (enabled by default)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_created', '1')");
    // Renamed setting: show_note_subheading (was show_note_location)
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('show_note_subheading', '1')");

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

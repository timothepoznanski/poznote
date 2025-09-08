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
        attachments TEXT
    )');

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

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

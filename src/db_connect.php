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
    
    // Create table if not exists (entries). If the table already exists but lacks the
    // `workspace` column (imported old DB), add it via ALTER TABLE and backfill.
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

    // If entries exists but doesn't have a workspace column (older exports)
    try {
        $hasWorkspace = false;
        $cols = $con->query("PRAGMA table_info(entries)")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cols as $c) {
            if (isset($c['name']) && $c['name'] === 'workspace') {
                $hasWorkspace = true;
                break;
            }
        }
        if (!$hasWorkspace) {
            // Add column and set default workspace for existing rows
            $con->exec("ALTER TABLE entries ADD COLUMN workspace TEXT DEFAULT 'Poznote'");
            $con->exec("UPDATE entries SET workspace = 'Poznote' WHERE workspace IS NULL");
        }
    } catch (Exception $e) {
        // Non-fatal: best-effort migration for old DBs
    }

    // Create folders table for empty folders (scoped by workspace)
    // Note: uniqueness is per (name, workspace)
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        workspace TEXT DEFAULT "Poznote",
        created DATETIME DEFAULT CURRENT_TIMESTAMP
    )');
    // Ensure folders table has workspace column for older DB imports
    try {
        $hasWorkspaceF = false;
        $colsF = $con->query("PRAGMA table_info(folders)")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($colsF as $c) {
            if (isset($c['name']) && $c['name'] === 'workspace') {
                $hasWorkspaceF = true;
                break;
            }
        }
        if (!$hasWorkspaceF) {
            $con->exec("ALTER TABLE folders ADD COLUMN workspace TEXT DEFAULT 'Poznote'");
            $con->exec("UPDATE folders SET workspace = 'Poznote' WHERE workspace IS NULL");
        }
    } catch (Exception $e) {
        // ignore
    }
    // Ensure unique per workspace
    $con->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_name_workspace ON folders(name, workspace)');

    // Create workspaces table
    $con->exec('CREATE TABLE IF NOT EXISTS workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP
    )');

    // Ensure default workspace exists
    $con->exec("INSERT OR IGNORE INTO workspaces (name) VALUES ('Poznote')");

    // Create settings table for configuration
    $con->exec('CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )');

    // Set default AI enabled setting for new installations
    $con->exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_enabled', '1')");

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

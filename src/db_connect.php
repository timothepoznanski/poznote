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
    
    // Create table if not exists
    $con->exec('CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trash INTEGER DEFAULT 0,
        heading TEXT,
        entry TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME,
        tags TEXT,
        folder TEXT DEFAULT "Uncategorized",
        favorite INTEGER DEFAULT 0,
        attachments TEXT
    )');

    // Create folders table for empty folders
    $con->exec('CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created DATETIME DEFAULT CURRENT_TIMESTAMP
    )');

} catch(PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}

?>

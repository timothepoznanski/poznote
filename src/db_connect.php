<?php

// SQLite connection
try {
    $con = new PDO('sqlite:' . SQLITE_DATABASE);
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

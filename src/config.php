<?php
    // SQLite configuration
    define("SQLITE_DATABASE", $_ENV['SQLITE_DATABASE'] ?? dirname(__DIR__) . '/data/database/poznote.db');
    define("SERVER_NAME", $_ENV['SERVER_NAME'] ?? 'localhost');
    
    // Default timezone (will be overridden by database setting if available)
    define("DEFAULT_TIMEZONE", 'Europe/Paris');
?>
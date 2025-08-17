<?php
    // SQLite configuration
    define("SQLITE_DATABASE", $_ENV['SQLITE_DATABASE'] ?? dirname(__DIR__) . '/data/database/poznote.db');
    define("SERVER_NAME", $_ENV['SERVER_NAME'] ?? 'localhost');
?>
<?php
    // SQLite configuration
    define("SQLITE_DATABASE", $_ENV['SQLITE_DATABASE'] ?? '/var/www/html/data/database/poznote.db');
    define("SERVER_NAME", $_ENV['SERVER_NAME'] ?? 'localhost');
?>
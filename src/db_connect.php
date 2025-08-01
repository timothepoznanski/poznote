<?php

// Single connection with database creation
$con = new mysqli(MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD);
if ($con->connect_error) {
	die("Connection failed: " . $con->connect_error);
}

// Create database if not exists
$con->query("CREATE DATABASE IF NOT EXISTS " . MYSQL_DATABASE);
$con->select_db(MYSQL_DATABASE);
$con->query("SET NAMES 'utf8'");

// Create table if not exists
$con->query('CREATE TABLE IF NOT EXISTS entries (id int(11) UNSIGNED AUTO_INCREMENT PRIMARY KEY, trash int(11) DEFAULT 0, heading text, entry mediumtext, created TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated TIMESTAMP, tags text, folder varchar(255) DEFAULT "Uncategorized", favorite TINYINT(1) DEFAULT 0)');

// Create folders table for empty folders
$con->query('CREATE TABLE IF NOT EXISTS folders (id int(11) UNSIGNED AUTO_INCREMENT PRIMARY KEY, name varchar(255) UNIQUE NOT NULL, created TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

?>

<?php
session_start();

// Configuration des identifiants - vous pouvez changer ces valeurs
define("AUTH_USERNAME", $_ENV['POZNOTE_USERNAME'] ?? 'admin');
define("AUTH_PASSWORD", $_ENV['POZNOTE_PASSWORD'] ?? 'admin123');

function isAuthenticated() {
    return isset($_SESSION['authenticated']) && $_SESSION['authenticated'] === true;
}

function authenticate($username, $password) {
    if ($username === AUTH_USERNAME && $password === AUTH_PASSWORD) {
        $_SESSION['authenticated'] = true;
        return true;
    }
    return false;
}

function logout() {
    session_destroy();
    header('Location: login.php');
    exit;
}

function requireAuth() {
    if (!isAuthenticated()) {
        header('Location: login.php');
        exit;
    }
}
?>

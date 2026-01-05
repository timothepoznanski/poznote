<?php
require 'auth.php';
// Read-only endpoint; no auth required.

require_once 'config.php';
require_once 'db_connect.php';
require_once 'functions.php';

header('Content-Type: application/json');

try {
    $lang = getUserLanguage();

    // Optional override for debugging/testing (kept minimal)
    if (isset($_GET['lang'])) {
        $req = strtolower(trim((string)$_GET['lang']));
        if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $req)) {
            $lang = $req;
        }
    }

    $en = loadI18nDictionary('en');
    $active = ($lang === 'en') ? $en : loadI18nDictionary($lang);

    // Deep-merge active over en
    $merge = function($base, $over) use (&$merge) {
        if (!is_array($base)) $base = [];
        if (!is_array($over)) return $base;
        foreach ($over as $k => $v) {
            if (is_array($v) && isset($base[$k]) && is_array($base[$k])) {
                $base[$k] = $merge($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        }
        return $base;
    };

    $strings = $merge($en, $active);

    echo json_encode([
        'success' => true,
        'lang' => $lang,
        'strings' => $strings
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'internal error'
    ]);
}

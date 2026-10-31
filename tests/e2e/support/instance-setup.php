<?php
// Points the throwaway instance at the mock server, see mock-server.php. The
// settings pages would do the same, but the suite must not depend on them to
// test what comes after them.

require_once '/var/www/html/config.php';
require_once '/var/www/html/users/db_master.php';

$mock = 'http://127.0.0.1:9912/v1';
foreach ([
    'ai_chat_enabled' => '1',
    'ai_chat_provider' => 'custom',
    'ai_chat_url' => $mock,
    'ai_chat_model' => 'mock-model',
    'ai_chat_api_key' => 'mock-key',
    'stt_enabled' => '1',
    'stt_provider' => 'custom',
    'stt_url' => $mock,
    'stt_model' => 'whisper-1',
    'stt_api_key' => 'mock-key',
] as $key => $value) {
    setGlobalSetting($key, $value);
}

$master = getMasterConnection();
$master->exec('UPDATE users SET ai_chat_enabled = 1, stt_enabled = 1 WHERE id = 1');
echo "instance configured\n";

<?php
// Mounted into the throwaway instance only, as auto_prepend_file (php-e2e.ini):
// records which pages and routes the run really reached, for lib/coverage.js.
if (PHP_SAPI === 'fpm-fcgi') {
    register_shutdown_function(static function (): void {
        $line = json_encode([$_SERVER['REQUEST_METHOD'] ?? '', $_SERVER['REQUEST_URI'] ?? '', http_response_code()]);
        @file_put_contents('/tmp/poznote-e2e-hits.log', $line . "\n", FILE_APPEND | LOCK_EX);
    });
}

<?php
require_once __DIR__ . '/bootstrap.php';

$files = glob(__DIR__ . '/*.test.php');
sort($files);
foreach ($files as $f) {
    require_once $f;
}

if (TestRunner::$failures === []) {
    printf("✅ %d assertions passed across %d files\n", TestRunner::$passed, count($files));
    exit(0);
}

printf("❌ %d failed, %d passed\n\n", count(TestRunner::$failures), TestRunner::$passed);
foreach (TestRunner::$failures as [$name, $message]) {
    printf("  %s\n      %s\n", $name, $message);
}
exit(1);

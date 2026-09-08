<?php
/**
 * Entry point for the integration suite. See bootstrap.php for what it needs.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/fixtures.php';

$baseUrl = rtrim(env('POZNOTE_TEST_URL', 'http://127.0.0.1:8042'), '/');
$adminUser = env('POZNOTE_TEST_USER', 'admin');
$adminPassword = env('POZNOTE_TEST_PASSWORD');

$admin = new ApiClient($baseUrl, $adminUser, $adminPassword);

// Fail on the setup rather than in the middle of the matrix, where a
// connection refused would read like a hundred isolation failures.
$reachable = @file_get_contents($baseUrl . '/api/health');
if ($reachable === false) {
    fwrite(STDERR, "Cannot reach $baseUrl. Start the dev instance, or set POZNOTE_TEST_URL.\n");
    exit(2);
}

$whoami = $admin->get('/admin/users', ['query' => ['limit' => 1]]);
if ($whoami->status !== 200) {
    fwrite(STDERR, "$adminUser cannot use the admin API at $baseUrl: " . $whoami->summary() . "\n"
        . "The suite creates and deletes accounts, so it needs administrator credentials.\n");
    exit(2);
}

printf("Poznote isolation suite against %s as %s\n", $baseUrl, $adminUser);

$factory = new Fixtures($baseUrl, $admin);

// Registered before the accounts exist so an exception, a fatal or a Ctrl-C
// still takes the throwaway profiles with it.
register_shutdown_function(function () use ($factory) {
    $factory->cleanup();
});

$owner = $factory->createAccount('iso-owner');
$stranger = $factory->createAccount('iso-stranger');
printf("owner #%d, stranger #%d\n", $owner->id, $stranger->id);

require_once __DIR__ . '/isolation.test.php';

$context = new IsolationContext($baseUrl, $factory, $owner, $stranger, $admin);
runIsolationTests($context);

$factory->cleanup();

if (TestRunner::$failures === []) {
    printf("\n✅ %d isolation assertions passed\n", TestRunner::$passed);
    exit(0);
}

printf("\n❌ %d failed, %d passed\n\n", count(TestRunner::$failures), TestRunner::$passed);
foreach (TestRunner::$failures as [$name, $message]) {
    printf("  %s\n      %s\n", $name, $message);
}
exit(1);

<?php
/**
 * A test runner in eighty lines, on purpose.
 *
 * Poznote ships no Composer dependencies and this is not the place to start:
 * the suite runs anywhere PHP does, including the php:8.4-cli container CI
 * already uses for linting. Add a file named *.test.php in this directory and
 * run.php will pick it up.
 *
 * These tests cover the pure functions in src/lib. They deliberately need no
 * database, no session and no config, which is only possible because those
 * modules were split out of functions.php and made loadable on their own.
 */

final class TestRunner
{
    public static array $failures = [];
    public static int $passed = 0;
    public static string $current = '';
}

function test(string $name, callable $body): void
{
    TestRunner::$current = $name;
    try {
        $body();
        TestRunner::$passed++;
    } catch (Throwable $e) {
        TestRunner::$failures[] = [$name, $e->getMessage()];
    }
}

function fail(string $message): void
{
    throw new RuntimeException($message);
}

function assertSame($expected, $actual, string $what = ''): void
{
    if ($expected !== $actual) {
        fail(sprintf('%sexpected %s, got %s', $what !== '' ? $what . ': ' : '',
            var_export($expected, true), var_export($actual, true)));
    }
}

function assertTrue($actual, string $what = ''): void
{
    if ($actual !== true) {
        fail(($what !== '' ? $what . ': ' : '') . 'expected true, got ' . var_export($actual, true));
    }
}

function assertFalse($actual, string $what = ''): void
{
    if ($actual !== false) {
        fail(($what !== '' ? $what . ': ' : '') . 'expected false, got ' . var_export($actual, true));
    }
}

function assertContains(string $needle, string $haystack, string $what = ''): void
{
    if (strpos($haystack, $needle) === false) {
        fail(sprintf('%sexpected to find %s in %s', $what !== '' ? $what . ': ' : '',
            var_export($needle, true), var_export(substr($haystack, 0, 200), true)));
    }
}

function assertNotContains(string $needle, string $haystack, string $what = ''): void
{
    if (strpos($haystack, $needle) !== false) {
        fail(sprintf('%sdid NOT expect %s in %s', $what !== '' ? $what . ': ' : '',
            var_export($needle, true), var_export(substr($haystack, 0, 200), true)));
    }
}

/** Loads one module from src/lib without any application bootstrap. */
function lib(string ...$modules): void
{
    foreach ($modules as $m) {
        require_once dirname(__DIR__) . '/src/lib/' . $m . '.php';
    }
}

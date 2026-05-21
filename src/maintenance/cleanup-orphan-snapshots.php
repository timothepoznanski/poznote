<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$dataDir = $argv[1] ?? getenv('POZNOTE_DATA_DIR');
if (!$dataDir) {
    $dataDir = dirname(__DIR__) . '/data';
}
$dataDir = rtrim((string) $dataDir, "/\\");
$usersDir = $dataDir . '/users';

function snapshotCleanupLog(string $message): void
{
    fwrite(STDOUT, '[snapshot-cleanup] ' . $message . PHP_EOL);
}

function snapshotCleanupDeletePath(string $path, int &$deletedFiles): void
{
    if (is_dir($path)) {
        $entries = scandir($path);
        if ($entries !== false) {
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') {
                    continue;
                }

                snapshotCleanupDeletePath($path . '/' . $entry, $deletedFiles);
            }
        }

        @rmdir($path);
        return;
    }

    if (@unlink($path)) {
        $deletedFiles++;
    }
}

function snapshotCleanupUserRow(string $userId, string $userPath): array
{
    return [
        'user_id' => $userId,
        'snapshot_dirs_scanned' => 0,
        'orphan_dirs_deleted' => 0,
        'snapshot_files_deleted' => 0,
        'skipped_db' => !is_file($userPath . '/database/poznote.db'),
        'errors' => [],
    ];
}

function snapshotCleanupUser(string $userId, string $userPath): array
{
    $row = snapshotCleanupUserRow($userId, $userPath);
    if ($row['skipped_db']) {
        return $row;
    }

    $snapshotRoot = $userPath . '/snapshots';
    if (!is_dir($snapshotRoot)) {
        return $row;
    }

    try {
        $pdo = new PDO('sqlite:' . $userPath . '/database/poznote.db');
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA busy_timeout = 10000');

        $noteIds = [];
        $stmt = $pdo->query('SELECT id FROM entries');
        while ($note = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $noteIds[(int) $note['id']] = true;
        }

        $entries = scandir($snapshotRoot);
        if ($entries === false) {
            $row['errors'][] = 'Cannot read snapshot directory';
            return $row;
        }

        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }

            $fullPath = $snapshotRoot . '/' . $entry;
            if (!is_dir($fullPath) || !ctype_digit($entry)) {
                continue;
            }

            $row['snapshot_dirs_scanned']++;
            if (isset($noteIds[(int) $entry])) {
                continue;
            }

            snapshotCleanupDeletePath($fullPath, $row['snapshot_files_deleted']);
            $row['orphan_dirs_deleted']++;
        }
    } catch (Throwable $e) {
        $row['errors'][] = $e->getMessage();
    }

    return $row;
}

function snapshotCleanupUsers(string $usersDir): array
{
    if (!is_dir($usersDir)) {
        return [];
    }

    $userIds = array_values(array_filter(
        scandir($usersDir) ?: [],
        fn($name) => ctype_digit($name) && is_dir($usersDir . '/' . $name)
    ));
    sort($userIds, SORT_NUMERIC);

    $results = [];
    foreach ($userIds as $userId) {
        $results[] = snapshotCleanupUser($userId, $usersDir . '/' . $userId);
    }

    return $results;
}

function snapshotCleanupTotals(array $results): array
{
    $totals = [
        'users_scanned' => 0,
        'users_skipped' => 0,
        'snapshot_dirs_scanned' => 0,
        'orphan_dirs_deleted' => 0,
        'snapshot_files_deleted' => 0,
        'errors' => 0,
    ];

    foreach ($results as $row) {
        if ($row['skipped_db']) {
            $totals['users_skipped']++;
        } else {
            $totals['users_scanned']++;
        }

        foreach (['snapshot_dirs_scanned', 'orphan_dirs_deleted', 'snapshot_files_deleted'] as $key) {
            $totals[$key] += $row[$key];
        }

        $totals['errors'] += count($row['errors']);
    }

    return $totals;
}

snapshotCleanupLog('Scanning ' . $usersDir . ' for orphan snapshot directories.');
$results = snapshotCleanupUsers($usersDir);
$totals = snapshotCleanupTotals($results);

foreach ($results as $row) {
    if ($row['orphan_dirs_deleted'] === 0 && $row['errors'] === []) {
        continue;
    }

    snapshotCleanupLog(
        'User ' . $row['user_id']
        . ': scanned ' . $row['snapshot_dirs_scanned']
        . ' snapshot director' . ($row['snapshot_dirs_scanned'] === 1 ? 'y' : 'ies')
        . ', deleted ' . $row['orphan_dirs_deleted']
        . ' orphan director' . ($row['orphan_dirs_deleted'] === 1 ? 'y' : 'ies')
        . ', removed ' . $row['snapshot_files_deleted'] . ' file(s)'
    );

    foreach ($row['errors'] as $error) {
        snapshotCleanupLog('User ' . $row['user_id'] . ' warning: ' . $error);
    }
}

snapshotCleanupLog(
    'Done. Users scanned: ' . $totals['users_scanned']
    . ', users skipped: ' . $totals['users_skipped']
    . ', snapshot directories scanned: ' . $totals['snapshot_dirs_scanned']
    . ', orphan directories deleted: ' . $totals['orphan_dirs_deleted']
    . ', files removed: ' . $totals['snapshot_files_deleted']
    . ', warnings: ' . $totals['errors']
);
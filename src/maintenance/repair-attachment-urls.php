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
$dataDir = rtrim((string)$dataDir, "/\\");
$usersDir = $dataDir . '/users';

function repairAttachmentLog(string $message): void
{
    fwrite(STDOUT, '[attachment-url-repair] ' . $message . PHP_EOL);
}

function repairAttachmentBuildMap($attachmentsJson, int &$invalidJson, int &$ambiguousPrefixes): array
{
    $attachmentsJson = (string)($attachmentsJson ?? '');
    if ($attachmentsJson === '' || $attachmentsJson === '[]') {
        return [];
    }

    $attachments = json_decode($attachmentsJson, true);
    if (!is_array($attachments)) {
        $invalidJson++;
        return [];
    }

    $idsByPrefix = [];
    foreach ($attachments as $attachment) {
        if (!is_array($attachment) || empty($attachment['id'])) {
            continue;
        }

        $fullId = (string)$attachment['id'];
        if (strpos($fullId, '.') === false) {
            continue;
        }

        $prefix = strstr($fullId, '.', true);
        if ($prefix === false || $prefix === '') {
            continue;
        }

        $idsByPrefix[$prefix][$fullId] = true;
    }

    $repairMap = [];
    foreach ($idsByPrefix as $prefix => $fullIds) {
        $fullIds = array_keys($fullIds);
        if (count($fullIds) === 1) {
            $repairMap[$prefix] = $fullIds[0];
        } else {
            $ambiguousPrefixes++;
        }
    }

    return $repairMap;
}

function repairAttachmentReplaceRefs(string $content, int $noteId, string $prefix, string $fullId, int &$replacements): string
{
    $notePattern = preg_quote((string)$noteId, '~');
    $prefixPattern = preg_quote($prefix, '~');
    $boundary = '(?=$|[^A-Za-z0-9._-])';
    $urlPart = '[^"\'<>\s)\]]*';

    $patterns = [
        '~((?:/)?api/v1/notes/' . $notePattern . '/attachments/)' . $prefixPattern . $boundary . '~',
        '~(api_attachments\.php\?' . $urlPart . '\bnote_id=' . $notePattern . '\b' . $urlPart . '\battachment_id=)' . $prefixPattern . $boundary . '~',
        '~(api_attachments\.php\?' . $urlPart . '\battachment_id=)' . $prefixPattern . $boundary . '(' . $urlPart . '\bnote_id=' . $notePattern . '\b' . $urlPart . ')~',
    ];

    $content = preg_replace_callback($patterns[0], function (array $matches) use ($fullId, &$replacements): string {
        $replacements++;
        return $matches[1] . $fullId;
    }, $content);

    $content = preg_replace_callback($patterns[1], function (array $matches) use ($fullId, &$replacements): string {
        $replacements++;
        return $matches[1] . $fullId;
    }, $content);

    return preg_replace_callback($patterns[2], function (array $matches) use ($fullId, &$replacements): string {
        $replacements++;
        return $matches[1] . $fullId . $matches[2];
    }, $content);
}

function repairAttachmentApplyMap(string $content, int $noteId, array $repairMap, int &$replacements): string
{
    foreach ($repairMap as $prefix => $fullId) {
        $content = repairAttachmentReplaceRefs($content, $noteId, $prefix, $fullId, $replacements);
    }

    return $content;
}

function repairAttachmentUserRow(string $userId, string $userPath): array
{
    return [
        'user_id' => $userId,
        'notes_scanned' => 0,
        'notes_with_refs' => 0,
        'refs_found' => 0,
        'refs_repaired' => 0,
        'files_updated' => 0,
        'db_rows_updated' => 0,
        'invalid_json' => 0,
        'ambiguous_prefixes' => 0,
        'skipped_db' => !is_file($userPath . '/database/poznote.db'),
        'errors' => [],
    ];
}

function repairAttachmentUser(string $userId, string $userPath): array
{
    $row = repairAttachmentUserRow($userId, $userPath);
    if ($row['skipped_db']) {
        return $row;
    }

    $dbPath = $userPath . '/database/poznote.db';
    $entriesPath = $userPath . '/entries';

    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA busy_timeout = 10000');

        $stmt = $pdo->query('SELECT id, entry, attachments FROM entries');
        $updateEntry = $pdo->prepare('UPDATE entries SET entry = :entry WHERE id = :id');

        while ($entry = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['notes_scanned']++;
            $noteId = (int)$entry['id'];
            $repairMap = repairAttachmentBuildMap($entry['attachments'] ?? '', $row['invalid_json'], $row['ambiguous_prefixes']);
            if ($repairMap === []) {
                continue;
            }

            $noteRefs = 0;
            $entryContent = (string)($entry['entry'] ?? '');
            if ($entryContent !== '') {
                $entryReplacements = 0;
                $updatedEntry = repairAttachmentApplyMap($entryContent, $noteId, $repairMap, $entryReplacements);
                $noteRefs += $entryReplacements;
                $row['refs_found'] += $entryReplacements;

                if ($entryReplacements > 0 && $updatedEntry !== $entryContent) {
                    $updateEntry->execute([':entry' => $updatedEntry, ':id' => $noteId]);
                    $row['db_rows_updated']++;
                    $row['refs_repaired'] += $entryReplacements;
                }
            }

            $noteFiles = glob($entriesPath . '/' . $noteId . '.*') ?: [];
            foreach ($noteFiles as $noteFile) {
                if (!is_file($noteFile) || !preg_match('/\.(?:html|md|markdown)$/i', $noteFile)) {
                    continue;
                }

                $fileContent = file_get_contents($noteFile);
                if ($fileContent === false) {
                    $row['errors'][] = 'Note ' . $noteId . ': cannot read ' . basename($noteFile);
                    continue;
                }

                $fileReplacements = 0;
                $updatedFileContent = repairAttachmentApplyMap($fileContent, $noteId, $repairMap, $fileReplacements);
                $noteRefs += $fileReplacements;
                $row['refs_found'] += $fileReplacements;

                if ($fileReplacements > 0 && $updatedFileContent !== $fileContent) {
                    if (file_put_contents($noteFile, $updatedFileContent) === false) {
                        $row['errors'][] = 'Note ' . $noteId . ': cannot write ' . basename($noteFile);
                        continue;
                    }

                    @chmod($noteFile, 0664);
                    $row['files_updated']++;
                    $row['refs_repaired'] += $fileReplacements;
                }
            }

            if ($noteRefs > 0) {
                $row['notes_with_refs']++;
            }
        }
    } catch (Throwable $e) {
        $row['errors'][] = $e->getMessage();
    }

    return $row;
}

function repairAttachmentUsers(string $usersDir): array
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
        $results[] = repairAttachmentUser($userId, $usersDir . '/' . $userId);
    }

    return $results;
}

function repairAttachmentTotals(array $results): array
{
    $totals = [
        'users_scanned' => 0,
        'users_skipped' => 0,
        'notes_scanned' => 0,
        'notes_with_refs' => 0,
        'refs_found' => 0,
        'refs_repaired' => 0,
        'files_updated' => 0,
        'db_rows_updated' => 0,
        'invalid_json' => 0,
        'ambiguous_prefixes' => 0,
        'errors' => 0,
    ];

    foreach ($results as $row) {
        if ($row['skipped_db']) {
            $totals['users_skipped']++;
        } else {
            $totals['users_scanned']++;
        }

        foreach (['notes_scanned', 'notes_with_refs', 'refs_found', 'refs_repaired', 'files_updated', 'db_rows_updated', 'invalid_json', 'ambiguous_prefixes'] as $key) {
            $totals[$key] += $row[$key];
        }

        $totals['errors'] += count($row['errors']);
    }

    return $totals;
}

repairAttachmentLog('Scanning ' . $usersDir . ' for truncated attachment image URLs.');
$results = repairAttachmentUsers($usersDir);
$totals = repairAttachmentTotals($results);

foreach ($results as $row) {
    if ($row['refs_found'] === 0 && $row['errors'] === [] && $row['invalid_json'] === 0 && $row['ambiguous_prefixes'] === 0) {
        continue;
    }

    repairAttachmentLog(
        'user=' . $row['user_id'] .
        ' notes=' . $row['notes_scanned'] .
        ' truncated_refs=' . $row['refs_found'] .
        ' repaired=' . $row['refs_repaired'] .
        ' files_updated=' . $row['files_updated'] .
        ' db_rows_updated=' . $row['db_rows_updated'] .
        ' invalid_json=' . $row['invalid_json'] .
        ' ambiguous_prefixes=' . $row['ambiguous_prefixes'] .
        ' errors=' . count($row['errors'])
    );

    foreach ($row['errors'] as $error) {
        repairAttachmentLog('user=' . $row['user_id'] . ' error=' . $error);
    }
}

repairAttachmentLog(
    'Summary: users_scanned=' . $totals['users_scanned'] .
    ' users_skipped=' . $totals['users_skipped'] .
    ' notes_scanned=' . $totals['notes_scanned'] .
    ' notes_with_truncated_refs=' . $totals['notes_with_refs'] .
    ' truncated_refs=' . $totals['refs_found'] .
    ' repaired=' . $totals['refs_repaired'] .
    ' files_updated=' . $totals['files_updated'] .
    ' db_rows_updated=' . $totals['db_rows_updated'] .
    ' invalid_json=' . $totals['invalid_json'] .
    ' ambiguous_prefixes=' . $totals['ambiguous_prefixes'] .
    ' errors=' . $totals['errors']
);

exit(0);
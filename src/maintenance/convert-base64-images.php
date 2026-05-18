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

function base64ImageLog(string $message): void
{
    fwrite(STDOUT, '[base64-image-conversion] ' . $message . PHP_EOL);
}

function base64ImageAttribute(string $tag, string $attribute): ?string
{
    $pattern = '~\b' . preg_quote($attribute, '~') . '\s*=\s*(["\'])(.*?)\1~is';
    if (!preg_match($pattern, $tag, $matches)) {
        return null;
    }

    return html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function base64ImageReplaceAttribute(string $tag, string $attribute, string $value): string
{
    $escapedValue = htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $pattern = '~\b' . preg_quote($attribute, '~') . '\s*=\s*(["\'])(.*?)\1~is';

    return preg_replace($pattern, $attribute . '="' . $escapedValue . '"', $tag, 1) ?? $tag;
}

function base64ImageEnsureAttribute(string $tag, string $attribute, string $value): string
{
    if (preg_match('~\b' . preg_quote($attribute, '~') . '\s*=~i', $tag)) {
        return $tag;
    }

    $escapedValue = htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return preg_replace_callback('~\s*/?>$~', fn(array $matches): string => ' ' . $attribute . '="' . $escapedValue . '"' . $matches[0], $tag, 1) ?? $tag;
}

function base64ImageCreateAttachmentFromDataUri(string $dataUri, int $noteId, string $attachmentsPath, string $originalNameBase, array &$attachments, int &$found, int &$converted, array &$errors): ?string
{
    $dataUri = html_entity_decode($dataUri, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (!preg_match('~^data:image/([a-zA-Z0-9+]+);base64,(.+)$~is', $dataUri, $matches)) {
        return null;
    }

    $found++;

    $imageType = strtolower($matches[1]);
    $base64Data = preg_replace('/\s+/', '', $matches[2]) ?? $matches[2];
    $imageData = base64_decode($base64Data, true);
    if ($imageData === false) {
        $errors[] = 'Note ' . $noteId . ': invalid base64 image data';
        return null;
    }

    $extensionMap = [
        'jpeg' => 'jpg',
        'jpg' => 'jpg',
        'png' => 'png',
        'gif' => 'gif',
        'webp' => 'webp',
        'svg+xml' => 'svg',
        'bmp' => 'bmp',
    ];
    $extension = $extensionMap[$imageType] ?? 'png';
    $mimeType = 'image/' . ($imageType === 'svg+xml' ? 'svg+xml' : $imageType);

    if (!is_dir($attachmentsPath) && !mkdir($attachmentsPath, 0775, true) && !is_dir($attachmentsPath)) {
        $errors[] = 'Note ' . $noteId . ': cannot create attachments directory';
        return null;
    }

    $attachmentId = uniqid();
    $filename = $attachmentId . '_' . time() . '.' . $extension;
    $filePath = $attachmentsPath . '/' . $filename;

    if (file_put_contents($filePath, $imageData) === false) {
        $errors[] = 'Note ' . $noteId . ': cannot write attachment file';
        return null;
    }
    @chmod($filePath, 0664);

    $originalNameBase = trim($originalNameBase);
    $attachments[] = [
        'id' => $attachmentId,
        'filename' => $filename,
        'original_filename' => $originalNameBase !== '' ? $originalNameBase . '.' . $extension : $filename,
        'file_size' => strlen($imageData),
        'file_type' => $mimeType,
        'uploaded_at' => date('Y-m-d H:i:s'),
    ];
    $converted++;

    return '/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId;
}

function base64ImageConvertTag(string $tag, int $noteId, string $attachmentsPath, array &$attachments, int &$found, int &$converted, array &$errors): string
{
    $src = base64ImageAttribute($tag, 'src');
    if ($src === null || stripos($src, 'data:image/') !== 0) {
        return $tag;
    }

    $altText = trim((string)(base64ImageAttribute($tag, 'alt') ?? ''));
    $attachmentUrl = base64ImageCreateAttachmentFromDataUri($src, $noteId, $attachmentsPath, $altText, $attachments, $found, $converted, $errors);
    if ($attachmentUrl === null) {
        return $tag;
    }

    $updatedTag = base64ImageReplaceAttribute($tag, 'src', $attachmentUrl);
    $updatedTag = base64ImageEnsureAttribute($updatedTag, 'loading', 'lazy');
    return base64ImageEnsureAttribute($updatedTag, 'decoding', 'async');
}

function base64ImageConvertUnclosedImgSources(string $content, int $noteId, string $attachmentsPath, array &$attachments, int &$found, int &$converted, array &$errors): string
{
    return preg_replace_callback(
        '~(<img\b[^<]*?\bsrc\s*=\s*)(["\'])(data:image/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=\s]+)(?:\2)?~is',
        function (array $matches) use ($noteId, $attachmentsPath, &$attachments, &$found, &$converted, &$errors): string {
            $attachmentUrl = base64ImageCreateAttachmentFromDataUri($matches[3], $noteId, $attachmentsPath, '', $attachments, $found, $converted, $errors);
            if ($attachmentUrl === null) {
                return $matches[0];
            }

            return $matches[1] . $matches[2] . htmlspecialchars($attachmentUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . $matches[2];
        },
        $content
    ) ?? $content;
}

function base64ImageConvertCssUrls(string $content, int $noteId, string $attachmentsPath, array &$attachments, int &$found, int &$converted, array &$errors): string
{
    $quoted = preg_replace_callback(
        '~url\(\s*(&quot;|&#34;|["\'])(data:image/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=\s]+)\1\s*\)~is',
        function (array $matches) use ($noteId, $attachmentsPath, &$attachments, &$found, &$converted, &$errors): string {
            $attachmentUrl = base64ImageCreateAttachmentFromDataUri($matches[2], $noteId, $attachmentsPath, '', $attachments, $found, $converted, $errors);
            if ($attachmentUrl === null) {
                return $matches[0];
            }

            return 'url(' . $matches[1] . htmlspecialchars($attachmentUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . $matches[1] . ')';
        },
        $content
    ) ?? $content;

    return preg_replace_callback(
        '~url\(\s*(data:image/[a-zA-Z0-9+]+;base64,[A-Za-z0-9+/=\s]+)\s*\)~is',
        function (array $matches) use ($noteId, $attachmentsPath, &$attachments, &$found, &$converted, &$errors): string {
            $attachmentUrl = base64ImageCreateAttachmentFromDataUri($matches[1], $noteId, $attachmentsPath, '', $attachments, $found, $converted, $errors);
            if ($attachmentUrl === null) {
                return $matches[0];
            }

            return 'url(' . htmlspecialchars($attachmentUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . ')';
        },
        $quoted
    ) ?? $quoted;
}

function base64ImageProcessContent(string $content, int $noteId, string $attachmentsPath, array &$errors): array
{
    $found = 0;
    $converted = 0;
    $attachments = [];

    $updatedContent = preg_replace_callback(
        '/<img\b[^>]*>/is',
        function (array $matches) use ($noteId, $attachmentsPath, &$attachments, &$found, &$converted, &$errors): string {
            return base64ImageConvertTag($matches[0], $noteId, $attachmentsPath, $attachments, $found, $converted, $errors);
        },
        $content
    );

    $updatedContent = base64ImageConvertUnclosedImgSources($updatedContent ?? $content, $noteId, $attachmentsPath, $attachments, $found, $converted, $errors);
    $updatedContent = base64ImageConvertCssUrls($updatedContent, $noteId, $attachmentsPath, $attachments, $found, $converted, $errors);

    return [
        'content' => $updatedContent ?? $content,
        'found' => $found,
        'converted' => $converted,
        'attachments' => $attachments,
    ];
}

function base64ImageUserRow(string $userId, string $userPath): array
{
    return [
        'user_id' => $userId,
        'notes_scanned' => 0,
        'notes_with_base64' => 0,
        'images_found' => 0,
        'images_converted' => 0,
        'files_updated' => 0,
        'db_rows_updated' => 0,
        'invalid_attachment_json' => 0,
        'skipped_db' => !is_file($userPath . '/database/poznote.db'),
        'errors' => [],
    ];
}

function base64ImageUser(string $userId, string $userPath): array
{
    $row = base64ImageUserRow($userId, $userPath);
    if ($row['skipped_db']) {
        return $row;
    }

    $dbPath = $userPath . '/database/poznote.db';
    $entriesPath = $userPath . '/entries';
    $attachmentsPath = $userPath . '/attachments';

    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->exec('PRAGMA busy_timeout = 10000');

        $stmt = $pdo->prepare("SELECT id, entry, attachments FROM entries WHERE (type = 'note' OR type IS NULL OR type = '') AND trash = 0");
        $stmt->execute();
        $updateEntry = $pdo->prepare('UPDATE entries SET entry = :entry, attachments = :attachments WHERE id = :id');

        while ($note = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $row['notes_scanned']++;
            $noteId = (int)$note['id'];
            $htmlFile = $entriesPath . '/' . $noteId . '.html';
            $fileExists = is_file($htmlFile);
            $content = $fileExists ? file_get_contents($htmlFile) : (string)($note['entry'] ?? '');

            if (!is_string($content) || stripos($content, 'data:image/') === false) {
                continue;
            }

            $noteErrors = [];
            $result = base64ImageProcessContent($content, $noteId, $attachmentsPath, $noteErrors);
            if ($result['found'] === 0) {
                continue;
            }

            $row['notes_with_base64']++;
            $row['images_found'] += $result['found'];

            foreach ($noteErrors as $error) {
                $row['errors'][] = $error;
            }

            if ($result['converted'] === 0 || $result['attachments'] === []) {
                continue;
            }

            $existingAttachments = [];
            $attachmentsJson = (string)($note['attachments'] ?? '');
            if ($attachmentsJson !== '' && $attachmentsJson !== '[]') {
                $decodedAttachments = json_decode($attachmentsJson, true);
                if (is_array($decodedAttachments)) {
                    $existingAttachments = $decodedAttachments;
                } else {
                    $row['invalid_attachment_json']++;
                }
            }

            $mergedAttachments = array_merge($existingAttachments, $result['attachments']);
            $encodedAttachments = json_encode($mergedAttachments, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($encodedAttachments === false) {
                $row['errors'][] = 'Note ' . $noteId . ': cannot encode attachments JSON';
                continue;
            }

            if ($fileExists) {
                if (file_put_contents($htmlFile, $result['content']) === false) {
                    $row['errors'][] = 'Note ' . $noteId . ': cannot write HTML file';
                    continue;
                }
                @chmod($htmlFile, 0664);
                $row['files_updated']++;
            }

            $updateEntry->execute([
                ':entry' => $result['content'],
                ':attachments' => $encodedAttachments,
                ':id' => $noteId,
            ]);
            $row['db_rows_updated']++;
            $row['images_converted'] += $result['converted'];
        }
    } catch (Throwable $e) {
        $row['errors'][] = $e->getMessage();
    }

    return $row;
}

function base64ImageUsers(string $usersDir): array
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
        $results[] = base64ImageUser($userId, $usersDir . '/' . $userId);
    }

    return $results;
}

function base64ImageTotals(array $results): array
{
    $totals = [
        'users_scanned' => 0,
        'users_skipped' => 0,
        'notes_scanned' => 0,
        'notes_with_base64' => 0,
        'images_found' => 0,
        'images_converted' => 0,
        'files_updated' => 0,
        'db_rows_updated' => 0,
        'invalid_attachment_json' => 0,
        'errors' => 0,
    ];

    foreach ($results as $row) {
        if ($row['skipped_db']) {
            $totals['users_skipped']++;
        } else {
            $totals['users_scanned']++;
        }

        foreach (['notes_scanned', 'notes_with_base64', 'images_found', 'images_converted', 'files_updated', 'db_rows_updated', 'invalid_attachment_json'] as $key) {
            $totals[$key] += $row[$key];
        }

        $totals['errors'] += count($row['errors']);
    }

    return $totals;
}

base64ImageLog('Scanning ' . $usersDir . ' for inline base64 images.');
$results = base64ImageUsers($usersDir);
$totals = base64ImageTotals($results);

foreach ($results as $row) {
    if ($row['images_found'] === 0 && $row['errors'] === [] && $row['invalid_attachment_json'] === 0) {
        continue;
    }

    base64ImageLog(
        'user=' . $row['user_id'] .
        ' notes=' . $row['notes_scanned'] .
        ' notes_with_base64=' . $row['notes_with_base64'] .
        ' images_found=' . $row['images_found'] .
        ' converted=' . $row['images_converted'] .
        ' files_updated=' . $row['files_updated'] .
        ' db_rows_updated=' . $row['db_rows_updated'] .
        ' invalid_attachment_json=' . $row['invalid_attachment_json'] .
        ' errors=' . count($row['errors'])
    );

    foreach ($row['errors'] as $error) {
        base64ImageLog('user=' . $row['user_id'] . ' error=' . $error);
    }
}

base64ImageLog(
    'Summary: users_scanned=' . $totals['users_scanned'] .
    ' users_skipped=' . $totals['users_skipped'] .
    ' notes_scanned=' . $totals['notes_scanned'] .
    ' notes_with_base64=' . $totals['notes_with_base64'] .
    ' images_found=' . $totals['images_found'] .
    ' converted=' . $totals['images_converted'] .
    ' files_updated=' . $totals['files_updated'] .
    ' db_rows_updated=' . $totals['db_rows_updated'] .
    ' invalid_attachment_json=' . $totals['invalid_attachment_json'] .
    ' errors=' . $totals['errors']
);

exit(0);
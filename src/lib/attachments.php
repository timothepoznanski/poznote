<?php
/**
 * Attachment identity, storage, URLs, rendering and upload validation.
 *
 * Extracted from functions.php, which had grown to 6 360 lines and mixed
 * every layer of the app. Loaded through functions.php, so no caller had
 * to change.
 */

/**
 * Resolve an attachment reference against known attachment IDs.
 * Older exports may contain only the prefix before a dotted attachment ID.
 */
function resolveAttachmentReferenceId($attachmentId, array $attachmentExtensions) {
    $attachmentId = (string)$attachmentId;
    if (array_key_exists($attachmentId, $attachmentExtensions)) {
        return $attachmentId;
    }

    if (strpos($attachmentId, '.') !== false) {
        return $attachmentId;
    }

    $resolvedId = null;
    foreach ($attachmentExtensions as $knownId => $_extension) {
        $knownId = (string)$knownId;
        if (strpos($knownId, '.') === false) {
            continue;
        }

        $prefix = strstr($knownId, '.', true);
        if ($prefix === $attachmentId) {
            if ($resolvedId !== null) {
                return $attachmentId;
            }
            $resolvedId = $knownId;
        }
    }

    return $resolvedId ?? $attachmentId;
}

function poznoteAttachmentOriginalFilename(array $attachment) {
    return (string)($attachment['original_filename'] ?? $attachment['filename'] ?? '');
}

function poznoteAttachmentExtension(array $attachment) {
    $filename = poznoteAttachmentOriginalFilename($attachment);
    return strtolower(pathinfo($filename, PATHINFO_EXTENSION));
}

function poznoteAttachmentMimeType(array $attachment) {
    $mimeType = strtolower(trim((string)($attachment['file_type'] ?? $attachment['mime_type'] ?? $attachment['type'] ?? '')));
    if ($mimeType !== '') {
        return $mimeType;
    }

    $extension = poznoteAttachmentExtension($attachment);
    $extensionMimeMap = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'bmp' => 'image/bmp',
        'pdf' => 'application/pdf',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'm4v' => 'video/x-m4v',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'ogg' => 'audio/ogg',
        'm4a' => 'audio/mp4',
        'flac' => 'audio/flac',
    ];

    return $extensionMimeMap[$extension] ?? '';
}

function poznoteAttachmentPreviewKind(array $attachment) {
    $mimeType = poznoteAttachmentMimeType($attachment);
    $extension = poznoteAttachmentExtension($attachment);

    if (poznoteAttachmentIsImage($attachment)) {
        return 'image';
    }
    if ($mimeType === 'application/pdf' || $extension === 'pdf') {
        return 'pdf';
    }
    if (strpos($mimeType, 'video/') === 0 || in_array($extension, ['mp4', 'webm', 'mov', 'm4v'], true)) {
        return 'video';
    }
    if (strpos($mimeType, 'audio/') === 0 || in_array($extension, ['mp3', 'wav', 'ogg', 'm4a', 'flac'], true)) {
        return 'audio';
    }

    return 'file';
}

function poznoteAttachmentIsImage(array $attachment) {
    $mimeType = poznoteAttachmentMimeType($attachment);
    if (strpos($mimeType, 'image/') === 0) {
        return true;
    }

    return in_array(poznoteAttachmentExtension($attachment), ['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jpg', 'jpeg', 'png', 'svg', 'webp'], true);
}

function poznoteAttachmentIsSvg(array $attachment) {
    if (strpos(poznoteAttachmentMimeType($attachment), 'svg') !== false) {
        return true;
    }

    return in_array(poznoteAttachmentExtension($attachment), ['svg', 'svgz'], true);
}

function poznoteSendSvgAttachmentSecurityHeaders() {
    // Unlike raster images, SVG is an active XML document: opened directly it
    // runs <script> in the app's origin. Sandbox it and block everything but
    // its own inline styles; an <img>-embedded SVG never ran scripts anyway.
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
}

function poznoteAttachmentIsReferencedInContent(array $attachment, $content) {
    $attachmentId = (string)($attachment['id'] ?? '');
    if ($attachmentId === '') {
        return false;
    }

    $content = (string)$content;
    if ($content === '') {
        return false;
    }

    $pathFragment = 'attachments/' . $attachmentId;
    return strpos($content, $pathFragment) !== false
        || strpos($content, urlencode($pathFragment)) !== false
        || strpos($content, rawurlencode($pathFragment)) !== false;
}

function poznoteAttachmentIsEmbeddedImageInContent(array $attachment, $content) {
    $attachmentId = (string)($attachment['id'] ?? '');
    $content = (string)$content;

    if ($attachmentId === '' || $content === '' || !poznoteAttachmentIsImage($attachment)) {
        return false;
    }

    $references = [
        'attachments/' . $attachmentId,
        urlencode('attachments/' . $attachmentId),
        rawurlencode('attachments/' . $attachmentId),
    ];

    foreach (array_unique($references) as $reference) {
        $referencePattern = preg_quote($reference, '~') . '(?:[?#][^\s"\'<>)]*)?(?=$|[\s"\'<>\)])';
        if (preg_match('~<img\b[^>]*' . $referencePattern . '~i', $content)) {
            return true;
        }
        if (preg_match('~!\[[^\]]*\]\([^)]*' . $referencePattern . '[^)]*\)~i', $content)) {
            return true;
        }
    }

    return false;
}

function poznoteDecodeAttachments($attachments) {
    if (is_string($attachments)) {
        $decoded = json_decode($attachments, true);
        return is_array($decoded) ? $decoded : [];
    }

    return is_array($attachments) ? $attachments : [];
}

/**
 * An attachment removed from its note but kept on disk because a snapshot
 * still references it. It is served on request (snapshot preview, restore)
 * and hidden everywhere else; poznotePruneSnapshotOnlyAttachments() deletes
 * it once no snapshot references it any more.
 */
function poznoteAttachmentIsSnapshotOnly($attachment) {
    return is_array($attachment) && !empty($attachment['snapshot_only']);
}

function poznoteFilterVisibleAttachments($attachments) {
    return array_values(array_filter(poznoteDecodeAttachments($attachments), function ($attachment) {
        return is_array($attachment) && !poznoteAttachmentIsSnapshotOnly($attachment);
    }));
}

function poznoteCountDisplayableAttachments($attachments, $content = '') {
    $count = 0;
    foreach (poznoteFilterVisibleAttachments($attachments) as $attachment) {
        if (empty($attachment['id'])) {
            continue;
        }
        if (poznoteAttachmentIsEmbeddedImageInContent($attachment, $content)) {
            continue;
        }
        $count++;
    }

    return $count;
}

/**
 * Breakdown of how the given attachment files are used by the notes of the
 * database: shown in the attachments row of a note, or embedded as an image
 * inside the note content. Trashed notes count too. Returns
 * ['attached' => n, 'embedded' => n] or null.
 */
function poznoteCountAttachmentUsageFromDatabase($databaseConnection, $existingFilenames = null) {
    if (!$databaseConnection instanceof PDO) {
        return null;
    }

    $filenameSet = null;
    if (is_array($existingFilenames)) {
        $filenameSet = [];
        foreach ($existingFilenames as $filename) {
            $normalizedFilename = poznoteNormalizeAttachmentFilename((string)$filename);
            if ($normalizedFilename !== '') {
                $filenameSet[$normalizedFilename] = true;
            }
        }
    }

    $query = "SELECT entry, attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'";
    $stmt = $databaseConnection->query($query);
    $usage = ['attached' => 0, 'embedded' => 0];

    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $attachments = poznoteDecodeAttachments($row['attachments'] ?? '');
        if ($filenameSet !== null) {
            $attachments = array_values(array_filter($attachments, function($attachment) use ($filenameSet) {
                if (!is_array($attachment) || empty($attachment['filename'])) {
                    return false;
                }

                return isset($filenameSet[poznoteNormalizeAttachmentFilename((string)$attachment['filename'])]);
            }));
        }

        foreach ($attachments as $attachment) {
            if (!is_array($attachment) || empty($attachment['id']) || poznoteAttachmentIsSnapshotOnly($attachment)) {
                continue;
            }
            if (poznoteAttachmentIsEmbeddedImageInContent($attachment, $row['entry'] ?? '')) {
                $usage['embedded']++;
            } else {
                $usage['attached']++;
            }
        }
    }

    return $usage;
}

function poznoteGetActiveDatabasePath() {
    global $dbPath;

    if (!empty($dbPath)) {
        return $dbPath;
    }

    if (isset($_SESSION['user_id']) && $_SESSION['user_id']) {
        require_once __DIR__ . '/../users/UserDataManager.php';
        $dataManager = new UserDataManager((int)$_SESSION['user_id']);
        return $dataManager->getUserDatabasePath();
    }

    return defined('SQLITE_DATABASE') ? SQLITE_DATABASE : '';
}

function poznoteCountAttachmentUsageInActiveDatabase($existingFilenames = null) {
    $activeDbPath = poznoteGetActiveDatabasePath();
    if ($activeDbPath === '' || !is_file($activeDbPath)) {
        return null;
    }

    try {
        $databaseConnection = new PDO('sqlite:' . $activeDbPath);
        $databaseConnection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return poznoteCountAttachmentUsageFromDatabase($databaseConnection, $existingFilenames);
    } catch (Throwable $e) {
        error_log('Failed to count restored attachment usage: ' . $e->getMessage());
        return null;
    }
}

function poznoteFormatAttachmentSize($bytes) {
    $bytes = (int)$bytes;
    if ($bytes <= 0) {
        return '';
    }

    $units = ['B', 'KB', 'MB', 'GB'];
    $index = 0;
    $size = (float)$bytes;
    while ($size >= 1024 && $index < count($units) - 1) {
        $size /= 1024;
        $index++;
    }

    $precision = $index === 0 ? 0 : 1;
    return rtrim(rtrim(number_format($size, $precision, '.', ''), '0'), '.') . ' ' . $units[$index];
}

/**
 * Raw megabyte figure for the storage statistics pages, e.g. "12.40".
 *
 * Deliberately unitless: the storage tables render the "MB" header once per
 * column. Use poznoteFormatAttachmentSize() above when the unit has to travel
 * with the number.
 */
function poznoteFormatMb(int $bytes): string {
    return number_format($bytes / (1024 * 1024), 2);
}

function poznoteBuildAttachmentUrl($noteId, $attachmentId, $workspace = '', $forceDownload = false) {
    $query = [];
    $workspace = trim((string)$workspace);
    if ($workspace !== '') {
        $query['workspace'] = $workspace;
    }
    if ($forceDownload) {
        $query['download'] = '1';
    }

    $url = '/api/v1/notes/' . rawurlencode((string)$noteId) . '/attachments/' . rawurlencode((string)$attachmentId);
    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    return $url;
}

function poznoteBuildAudioPlayerUrl($noteId, $attachmentId, $workspace = '') {
    $query = [
        'note' => (string)$noteId,
        'attachment' => (string)$attachmentId,
    ];
    $workspace = trim((string)$workspace);
    if ($workspace !== '') {
        $query['workspace'] = $workspace;
    }

    return '/audio_player.php?' . http_build_query($query);
}

function poznoteRenderAttachmentPreviews($noteId, $attachments, $workspace = '', $content = '') {
    if (is_string($attachments)) {
        $decoded = json_decode($attachments, true);
        $attachments = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($attachments) || empty($attachments)) {
        return '';
    }

    $cards = [];
    foreach ($attachments as $attachment) {
        if (!is_array($attachment) || empty($attachment['id']) || poznoteAttachmentIsSnapshotOnly($attachment)) {
            continue;
        }
        if (poznoteAttachmentIsReferencedInContent($attachment, $content)) {
            continue;
        }

        $attachmentId = (string)$attachment['id'];
        $filename = poznoteAttachmentOriginalFilename($attachment);
        if ($filename === '') {
            $filename = (string)($attachment['filename'] ?? $attachmentId);
        }

        $kind = poznoteAttachmentPreviewKind($attachment);
        $safeKind = htmlspecialchars($kind, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeId = htmlspecialchars($attachmentId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeFilename = htmlspecialchars($filename, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $fileUrl = poznoteBuildAttachmentUrl($noteId, $attachmentId, $workspace, false);
        $downloadUrl = poznoteBuildAttachmentUrl($noteId, $attachmentId, $workspace, true);
        $safeFileUrl = htmlspecialchars($fileUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeDownloadUrl = htmlspecialchars($downloadUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $sizeLabel = poznoteFormatAttachmentSize($attachment['file_size'] ?? 0);
        $safeSize = htmlspecialchars($sizeLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        switch ($kind) {
            case 'image':
                $iconClass = 'lucide lucide-file-image';
                break;
            case 'video':
                $iconClass = 'lucide lucide-file-video';
                break;
            case 'audio':
                $iconClass = 'lucide lucide-music';
                break;
            default:
                $iconClass = 'lucide lucide-file-text';
                break;
        }

        $mediaHtml = '';
        if ($kind === 'image') {
            $mediaHtml = '<a class="note-attachment-preview-media" href="' . $safeFileUrl . '" target="_blank" rel="noopener noreferrer">'
                . '<img src="' . $safeFileUrl . '" alt="' . $safeFilename . '" loading="lazy" decoding="async">'
                . '</a>';
        } elseif ($kind === 'pdf') {
            $mediaHtml = '<iframe class="note-attachment-preview-media note-attachment-preview-frame" src="' . $safeFileUrl . '" title="' . $safeFilename . '" loading="lazy"></iframe>';
        } elseif ($kind === 'video') {
            $mediaHtml = '<div class="note-attachment-preview-media"><video controls preload="metadata" playsinline src="' . $safeFileUrl . '"></video></div>';
        } elseif ($kind === 'audio') {
            $audioPlayerUrl = htmlspecialchars(poznoteBuildAudioPlayerUrl($noteId, $attachmentId, $workspace), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $mediaHtml = '<iframe class="note-attachment-preview-media note-attachment-preview-audio-frame" src="' . $audioPlayerUrl . '" title="' . $safeFilename . '" scrolling="no" frameborder="0" allow="autoplay" loading="lazy"></iframe>';
        } else {
            $mediaHtml = '<a class="note-attachment-preview-file-card" href="' . $safeDownloadUrl . '" title="' . t_h('attachments.actions.download', ['filename' => $filename], 'Download {{filename}}') . '">'
                . '<i class="' . $iconClass . '"></i>'
                . '<span class="note-attachment-preview-file-meta">'
                . '<span class="note-attachment-preview-file-name">' . $safeFilename . '</span>';
            if ($safeSize !== '') {
                $mediaHtml .= '<span class="note-attachment-preview-size">' . $safeSize . '</span>';
            }
            $mediaHtml .= '</span>'
                . '</a>';
        }

        $caption = '';
        if ($kind !== 'file') {
            $caption = '<figcaption class="note-attachment-preview-caption">'
                . '<i class="' . $iconClass . '"></i>'
                . '<a href="' . $safeDownloadUrl . '" title="' . t_h('attachments.actions.download', ['filename' => $filename], 'Download {{filename}}') . '">' . $safeFilename . '</a>';
            if ($safeSize !== '') {
                $caption .= '<span class="note-attachment-preview-size">' . $safeSize . '</span>';
            }
            $caption .= '</figcaption>';
        }

        $cards[] = '<figure class="note-attachment-preview note-attachment-preview-' . $safeKind . '" data-attachment-id="' . $safeId . '" contenteditable="false">'
            . $mediaHtml
            . $caption
            . '</figure>';
    }

    if (empty($cards)) {
        return '';
    }

    $safeNoteId = htmlspecialchars((string)$noteId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<div id="attachment-previews-' . $safeNoteId . '" class="note-attachment-previews" data-note-id="' . $safeNoteId . '" contenteditable="false">'
        . implode('', $cards)
        . '</div>';
}

/**
 * Attachment storage facade for the active user: local disk by default, or
 * the admin-configured S3-compatible bucket (settings > S3 storage).
 * All attachment file reads/writes/deletes must go through these helpers.
 */
function poznoteAttachmentStorage(): AttachmentStorage {
    require_once __DIR__ . '/../storage/AttachmentStorage.php';
    return AttachmentStorage::current();
}

/** Whether NEW attachments are written to S3 for this instance. */
function poznoteAttachmentsAreRemote(): bool {
    return poznoteAttachmentStorage()->isRemote();
}

/**
 * Whether the bucket may still hold attachments, regardless of the master
 * switch. Read and cleanup paths use this so files left in the bucket after
 * S3 storage was turned off are still found; only write paths care about
 * poznoteAttachmentsAreRemote().
 */
function poznoteAttachmentsBucketMayHoldFiles(): bool {
    require_once __DIR__ . '/../storage/AttachmentStorage.php';
    return AttachmentStorage::isConfigured();
}

/**
 * A readable local path for an attachment, or null when it does not exist.
 * In S3 mode the file is fetched to a per-request temp file, so ZIP exports
 * and inline embedding keep working unchanged.
 */
function poznoteAttachmentLocalFile($filename): ?string {
    if (!is_string($filename) || $filename === '') {
        return null;
    }
    return poznoteAttachmentStorage()->localFile($filename);
}

/**
 * Like poznoteAttachmentLocalFile() but never downloads from the bucket.
 * Used by exports whose lighter-zip option deliberately leaves S3-stored
 * attachments out of the archive.
 */
function poznoteAttachmentLocalOnlyFile($filename): ?string {
    if (!is_string($filename) || $filename === '') {
        return null;
    }
    return poznoteAttachmentStorage()->localFileIfOnDisk($filename);
}

/** Store an on-disk file (uploaded or generated) as an attachment. */
function poznoteStoreAttachmentFromPath(string $sourcePath, string $filename, string $contentType = 'application/octet-stream', bool $isUploadedFile = false): bool {
    return poznoteAttachmentStorage()->storeFile($sourcePath, $filename, $contentType, $isUploadedFile);
}

/** Store in-memory content (excalidraw previews, converted base64 images). */
function poznoteStoreAttachmentContent(string $content, string $filename, string $contentType = 'application/octet-stream'): bool {
    return poznoteAttachmentStorage()->storeContent($content, $filename, $contentType);
}

/** Delete an attachment file wherever it lives (bucket and/or local disk). */
function poznoteDeleteAttachmentFile($filename): void {
    if (is_string($filename) && $filename !== '') {
        poznoteAttachmentStorage()->delete($filename);
    }
}

function poznoteBlockedAttachmentExtensions(): array {
    return [
        'asp' => true,
        'aspx' => true,
        'bat' => true,
        'bash' => true,
        'cgi' => true,
        'cmd' => true,
        'com' => true,
        'dll' => true,
        'dylib' => true,
        'exe' => true,
        'fcgi' => true,
        'fish' => true,
        'jar' => true,
        'jsp' => true,
        'jspx' => true,
        'ksh' => true,
        'pht' => true,
        'phtml' => true,
        'phar' => true,
        'pl' => true,
        'ps1' => true,
        'psm1' => true,
        'py' => true,
        'rb' => true,
        'shtml' => true,
        'sh' => true,
        'so' => true,
        'zsh' => true,
    ];
}

function poznoteAttachmentExtensionIsBlocked(string $extension): bool {
    $extension = strtolower(ltrim($extension, '.'));
    if ($extension === '') {
        return false;
    }

    if (preg_match('/^php[0-9]*$/', $extension)) {
        return true;
    }

    $blockedExtensions = poznoteBlockedAttachmentExtensions();
    return isset($blockedExtensions[$extension]);
}

function poznoteBlockedAttachmentMimeTypes(): array {
    return [
        'application/java-archive' => true,
        'application/php' => true,
        'application/vnd.microsoft.portable-executable' => true,
        'application/x-cgi' => true,
        'application/x-dosexec' => true,
        'application/x-executable' => true,
        'application/x-httpd-cgi' => true,
        'application/x-httpd-php' => true,
        'application/x-java-archive' => true,
        'application/x-mach-binary' => true,
        'application/x-ms-dos-executable' => true,
        'application/x-msdownload' => true,
        'application/x-perl' => true,
        'application/x-php' => true,
        'application/x-python' => true,
        'application/x-python-code' => true,
        'application/x-ruby' => true,
        'application/x-sh' => true,
        'application/x-sharedlib' => true,
        'application/x-shellscript' => true,
        'text/x-cgi' => true,
        'text/x-perl' => true,
        'text/x-php' => true,
        'text/x-python' => true,
        'text/x-ruby' => true,
        'text/x-script.python' => true,
        'text/x-sh' => true,
        'text/x-shellscript' => true,
    ];
}

function poznoteAttachmentMimeTypeIsBlocked(?string $mimeType): bool {
    if (!is_string($mimeType) || trim($mimeType) === '') {
        return false;
    }

    $mimeType = strtolower(trim(explode(';', $mimeType, 2)[0]));
    $blockedMimeTypes = poznoteBlockedAttachmentMimeTypes();

    return isset($blockedMimeTypes[$mimeType]);
}

function poznoteNormalizeAttachmentFilename(string $filename): string {
    return trim(basename(str_replace('\\', '/', $filename)));
}

function poznoteSanitizeAttachmentDisplayName(string $filename): string {
    $name = trim(str_replace(['<', '>', '"'], '', poznoteNormalizeAttachmentFilename($filename)));
    return $name !== '' ? $name : 'attachment';
}

function poznoteValidateAttachmentFilename(string $filename): array {
    $baseFilename = poznoteNormalizeAttachmentFilename($filename);

    if ($baseFilename === '' || $baseFilename === '.' || $baseFilename === '..') {
        return ['success' => false, 'error' => 'Invalid attachment filename'];
    }

    if ($baseFilename[0] === '.') {
        return ['success' => false, 'error' => 'Hidden attachment filenames are not allowed'];
    }

    if (preg_match('/[\x00-\x1F\x7F]/', $baseFilename)) {
        return ['success' => false, 'error' => 'Attachment filename contains invalid characters'];
    }

    if (strlen($baseFilename) > 255) {
        return ['success' => false, 'error' => 'Attachment filename is too long'];
    }

    $segments = explode('.', $baseFilename);
    foreach (array_slice($segments, 1) as $extensionSegment) {
        if (poznoteAttachmentExtensionIsBlocked($extensionSegment)) {
            return ['success' => false, 'error' => 'Attachment file type is not allowed'];
        }
    }

    return ['success' => true, 'filename' => $baseFilename];
}

function poznoteDetectAttachmentMimeType(?string $filePath = null, ?string $content = null): ?string {
    if (!class_exists('finfo') || !defined('FILEINFO_MIME_TYPE')) {
        return null;
    }

    try {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        if ($content !== null) {
            $mimeType = $finfo->buffer($content);
            return is_string($mimeType) && $mimeType !== '' ? $mimeType : null;
        }

        if ($filePath !== null && is_file($filePath)) {
            $mimeType = $finfo->file($filePath);
            return is_string($mimeType) && $mimeType !== '' ? $mimeType : null;
        }
    } catch (Throwable $e) {
        error_log('Attachment MIME detection failed: ' . $e->getMessage());
    }

    return null;
}

function poznoteValidateAttachmentFile(string $filename, ?string $filePath = null, ?string $content = null): array {
    $filenameValidation = poznoteValidateAttachmentFilename($filename);
    if (!$filenameValidation['success']) {
        return $filenameValidation;
    }

    $mimeType = poznoteDetectAttachmentMimeType($filePath, $content);
    if (poznoteAttachmentMimeTypeIsBlocked($mimeType)) {
        return ['success' => false, 'error' => 'Attachment MIME type is not allowed'];
    }

    return [
        'success' => true,
        'filename' => $filenameValidation['filename'],
        'mime_type' => $mimeType ?: 'application/octet-stream',
    ];
}

function poznoteAttachmentValidationErrorForDisplay(string $error): string {
    $translationMap = [
        'Invalid attachment filename' => 'restore_import.skipped_attachments.reasons.invalid_filename',
        'Hidden attachment filenames are not allowed' => 'restore_import.skipped_attachments.reasons.hidden_filename',
        'Attachment filename contains invalid characters' => 'restore_import.skipped_attachments.reasons.invalid_characters',
        'Attachment filename is too long' => 'restore_import.skipped_attachments.reasons.filename_too_long',
        'Attachment file type is not allowed' => 'restore_import.skipped_attachments.reasons.blocked_extension',
        'Attachment MIME type is not allowed' => 'restore_import.skipped_attachments.reasons.blocked_mime',
    ];

    if (isset($translationMap[$error])) {
        return t($translationMap[$error], [], $error);
    }

    return $error;
}

function poznoteFormatSkippedAttachmentDetails(array $skippedFiles): string {
    if (empty($skippedFiles)) {
        return '';
    }

    $lines = [t('restore_import.skipped_attachments.header', [], 'Skipped blocked attachment files:')];

    foreach ($skippedFiles as $skippedFile) {
        $sourcePath = (string)($skippedFile['source_path'] ?? t('restore_import.skipped_attachments.unknown_path', [], 'unknown path'));
        $targetFilename = (string)($skippedFile['target_filename'] ?? '');
        $originalFilename = (string)($skippedFile['original_filename'] ?? '');
        $noteId = (string)($skippedFile['note_id'] ?? '');
        $noteHeading = (string)($skippedFile['note_heading'] ?? '');
        $reason = poznoteAttachmentValidationErrorForDisplay((string)($skippedFile['reason'] ?? t('restore_import.skipped_attachments.default_reason', [], 'blocked by attachment security policy')));

        $line = '- ' . $sourcePath;
        if ($targetFilename !== '' && basename($sourcePath) !== $targetFilename) {
            $line .= ' -> ' . $targetFilename;
        }
        if ($originalFilename !== '' && $originalFilename !== $targetFilename) {
            $line .= ' (' . t('restore_import.skipped_attachments.original_filename', [], 'original') . ': ' . $originalFilename . ')';
        }
        if ($noteId !== '' || $noteHeading !== '') {
            $noteParts = [];
            if ($noteId !== '') {
                $noteParts[] = '#' . $noteId;
            }
            if ($noteHeading !== '') {
                $noteParts[] = '"' . $noteHeading . '"';
            }
            $noteLabel = implode(' ', $noteParts);
            $line .= ' [' . t('restore_import.skipped_attachments.note', [], 'note') . ': ' . $noteLabel . ']';
        }
        $line .= ': ' . $reason;

        $lines[] = $line;
    }

    $lines[] = t('restore_import.skipped_attachments.recovery_hint', [], 'These files were left in the source ZIP and were not restored as active attachments for security reasons. You can recover them manually from the ZIP. A direct re-import will still be blocked while the file keeps a forbidden type; store it inside an allowed archive such as .zip, or convert/rename it to an allowed type only if you trust the file.');

    return implode("\n", $lines);
}

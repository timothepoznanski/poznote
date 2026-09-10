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

/**
 * Attachment types are refused at two different levels.
 *
 * SERVER level: the file could be executed by a web server that ends up
 * serving the data volume. Poznote's own nginx keeps data/ out of the docroot
 * and denies it explicitly, but self-hosted setups put all sorts of things in
 * front of the volume, so these stay refused unconditionally.
 *
 * EXECUTABLE level: the file can only run on the machine of whoever downloads
 * it, which on a personal instance is the owner themselves. Storing .ps1,
 * .sh or .exe files next to the notes that document them is a legitimate use
 * (discussion 1355), so this level is refused by default and is lifted for the
 * whole instance by an administrator, through the allow_executable_attachments
 * global setting. Instance-wide on purpose: on a shared instance the files
 * become downloadable by everyone the notes are shared with, so the decision
 * belongs to whoever runs the server, not to each account.
 */
const POZNOTE_ATTACHMENT_BLOCK_SERVER = 'server';
const POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE = 'executable';

/** Extensions a web server may execute. Never uploadable. */
function poznoteServerExecutableAttachmentExtensions(): array {
    return [
        'asp' => true,
        'aspx' => true,
        'cgi' => true,
        'fcgi' => true,
        'jsp' => true,
        'jspx' => true,
        'phar' => true,
        'pht' => true,
        'phtml' => true,
        'shtml' => true,
    ];
}

/** Extensions that only run on the downloader's machine. Unlockable. */
function poznoteExecutableAttachmentExtensions(): array {
    return [
        'bash' => true,
        'bat' => true,
        'cmd' => true,
        'com' => true,
        'dll' => true,
        'dylib' => true,
        'exe' => true,
        'fish' => true,
        'jar' => true,
        'ksh' => true,
        'pl' => true,
        'ps1' => true,
        'psm1' => true,
        'py' => true,
        'rb' => true,
        'sh' => true,
        'so' => true,
        'zsh' => true,
    ];
}

/** MIME types a web server may execute. Never uploadable. */
function poznoteServerExecutableAttachmentMimeTypes(): array {
    return [
        'application/php' => true,
        'application/x-cgi' => true,
        'application/x-httpd-cgi' => true,
        'application/x-httpd-php' => true,
        'application/x-php' => true,
        'text/x-cgi' => true,
        'text/x-php' => true,
    ];
}

/** MIME types that only run on the downloader's machine. Unlockable. */
function poznoteExecutableAttachmentMimeTypes(): array {
    return [
        'application/java-archive' => true,
        'application/vnd.microsoft.portable-executable' => true,
        'application/x-dosexec' => true,
        'application/x-executable' => true,
        'application/x-java-archive' => true,
        'application/x-mach-binary' => true,
        'application/x-ms-dos-executable' => true,
        'application/x-msdownload' => true,
        'application/x-perl' => true,
        'application/x-python' => true,
        'application/x-python-code' => true,
        'application/x-ruby' => true,
        'application/x-sh' => true,
        'application/x-sharedlib' => true,
        'application/x-shellscript' => true,
        'text/x-perl' => true,
        'text/x-python' => true,
        'text/x-ruby' => true,
        'text/x-script.python' => true,
        'text/x-sh' => true,
        'text/x-shellscript' => true,
    ];
}

/**
 * Whether this instance accepts script and executable attachments.
 *
 * Read through config.php's resolver, so the admin toggle in the master
 * database wins and POZNOTE_ALLOW_EXECUTABLE_ATTACHMENTS still configures an
 * instance that has never opened the settings page. Defaults to no, including
 * when neither layer is available (CLI workers, unit tests), so the permissive
 * path is never the accidental one.
 */
function poznoteExecutableAttachmentsAllowed(): bool {
    if (function_exists('poznoteResolveGlobalSetting')) {
        $value = poznoteResolveGlobalSetting('allow_executable_attachments', 'POZNOTE_ALLOW_EXECUTABLE_ATTACHMENTS', '0');
    } elseif (function_exists('getGlobalSetting')) {
        $value = getGlobalSetting('allow_executable_attachments', '0');
    } else {
        return false;
    }

    return filter_var($value, FILTER_VALIDATE_BOOL);
}

/** Block level of an extension, or null when it is not restricted at all. */
function poznoteAttachmentExtensionBlockLevel(string $extension): ?string {
    $extension = strtolower(ltrim($extension, '.'));
    if ($extension === '') {
        return null;
    }

    if (preg_match('/^php[0-9]*$/', $extension)) {
        return POZNOTE_ATTACHMENT_BLOCK_SERVER;
    }

    if (isset(poznoteServerExecutableAttachmentExtensions()[$extension])) {
        return POZNOTE_ATTACHMENT_BLOCK_SERVER;
    }

    if (isset(poznoteExecutableAttachmentExtensions()[$extension])) {
        return POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE;
    }

    return null;
}

/** Block level of a MIME type, or null when it is not restricted at all. */
function poznoteAttachmentMimeTypeBlockLevel(?string $mimeType): ?string {
    if (!is_string($mimeType) || trim($mimeType) === '') {
        return null;
    }

    $mimeType = strtolower(trim(explode(';', $mimeType, 2)[0]));

    if (isset(poznoteServerExecutableAttachmentMimeTypes()[$mimeType])) {
        return POZNOTE_ATTACHMENT_BLOCK_SERVER;
    }

    if (isset(poznoteExecutableAttachmentMimeTypes()[$mimeType])) {
        return POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE;
    }

    return null;
}

/**
 * Whether a block level refuses the file for this account right now.
 * $executablesAllowed defaults to the account setting; pass it explicitly to
 * decide against a known state instead of reading the database.
 */
function poznoteAttachmentBlockLevelApplies(?string $blockLevel, ?bool $executablesAllowed = null): bool {
    if ($blockLevel === null) {
        return false;
    }
    if ($blockLevel === POZNOTE_ATTACHMENT_BLOCK_SERVER) {
        return true;
    }
    if ($executablesAllowed === null) {
        $executablesAllowed = poznoteExecutableAttachmentsAllowed();
    }
    return !$executablesAllowed;
}

function poznoteAttachmentExtensionIsBlocked(string $extension, ?bool $executablesAllowed = null): bool {
    return poznoteAttachmentBlockLevelApplies(poznoteAttachmentExtensionBlockLevel($extension), $executablesAllowed);
}

function poznoteAttachmentMimeTypeIsBlocked(?string $mimeType, ?bool $executablesAllowed = null): bool {
    return poznoteAttachmentBlockLevelApplies(poznoteAttachmentMimeTypeBlockLevel($mimeType), $executablesAllowed);
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

    // Every dotted segment is tested, not just the last one: "report.exe.txt"
    // is still an executable to a Windows shell that hides known extensions.
    $segments = explode('.', $baseFilename);
    foreach (array_slice($segments, 1) as $extensionSegment) {
        $blockLevel = poznoteAttachmentExtensionBlockLevel($extensionSegment);
        if (poznoteAttachmentBlockLevelApplies($blockLevel)) {
            return [
                'success' => false,
                'error' => 'Attachment file type is not allowed',
                'block_level' => $blockLevel,
                'blocked_extension' => strtolower(ltrim($extensionSegment, '.')),
            ];
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
    $mimeBlockLevel = poznoteAttachmentMimeTypeBlockLevel($mimeType);
    if (poznoteAttachmentBlockLevelApplies($mimeBlockLevel)) {
        return [
            'success' => false,
            'error' => 'Attachment MIME type is not allowed',
            'block_level' => $mimeBlockLevel,
            'blocked_mime' => strtolower(trim(explode(';', (string) $mimeType, 2)[0])),
        ];
    }

    return [
        'success' => true,
        'filename' => $filenameValidation['filename'],
        'mime_type' => $mimeType ?: 'application/octet-stream',
    ];
}

/**
 * User-facing message for a failed attachment validation.
 *
 * A refusal an administrator can lift names the setting, and says who can
 * reach it: the toggle is instance-wide, so a regular account is told to ask
 * rather than sent hunting through its own settings. A refusal that can never
 * be lifted says why instead.
 */
function poznoteAttachmentValidationMessage(array $validation): string {
    $error = (string) ($validation['error'] ?? '');
    $blockLevel = $validation['block_level'] ?? null;
    $unlockable = ($blockLevel === POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE);
    $isAdmin = function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();

    $blockedExtension = (string) ($validation['blocked_extension'] ?? '');
    if ($blockedExtension !== '') {
        $extension = '.' . $blockedExtension;
        if (!$unlockable) {
            return t('attachments.errors.blocked_extension_locked', ['ext' => $extension],
                $extension . ' files can be executed by a web server and can never be attached.');
        }
        return $isAdmin
            ? t('attachments.errors.blocked_extension_unlockable', ['ext' => $extension],
                $extension . ' files are blocked by default. You can allow them in Settings > Admin Tools > Script and executable attachments.')
            : t('attachments.errors.blocked_extension_unlockable_user', ['ext' => $extension],
                $extension . ' files are blocked on this instance. An administrator can allow them in Settings > Admin Tools > Script and executable attachments.');
    }

    $blockedMime = (string) ($validation['blocked_mime'] ?? '');
    if ($blockedMime !== '') {
        if (!$unlockable) {
            return t('attachments.errors.blocked_mime_locked', ['mime' => $blockedMime],
                'This file is detected as ' . $blockedMime . ', which a web server can execute, so it can never be attached.');
        }
        return $isAdmin
            ? t('attachments.errors.blocked_mime_unlockable', ['mime' => $blockedMime],
                'This file is detected as ' . $blockedMime . ' and is blocked by default. You can allow scripts and executables in Settings > Admin Tools > Script and executable attachments.')
            : t('attachments.errors.blocked_mime_unlockable_user', ['mime' => $blockedMime],
                'This file is detected as ' . $blockedMime . ' and is blocked on this instance. An administrator can allow scripts and executables in Settings > Admin Tools > Script and executable attachments.');
    }

    return poznoteAttachmentValidationErrorForDisplay($error);
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

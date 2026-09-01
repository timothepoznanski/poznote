<?php
date_default_timezone_set('UTC');

/**
 * Trusted domains allowed for iframe embeds.
 * Used by both unescapeIframesInHtml() and the Markdown parser.
 */
if (!defined('ALLOWED_IFRAME_DOMAINS')) {
    define('ALLOWED_IFRAME_DOMAINS', [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
        'player.bilibili.com',
        'www.bilibili.com',
        'bilibili.com',
    ]);
}

/**
 * Decide whether an iframe `src` points at a trusted origin.
 *
 * Uses parse_url() with EXACT host matching (plus subdomains of an allowed
 * domain) so look-alike hosts such as `www.youtube.com.evil.test`, or a
 * trusted domain smuggled into the query string (`/x?u=//youtube.com`), are
 * rejected. Only http(s) and same-origin relative paths are accepted;
 * protocol-relative, javascript:, data: and other schemes are refused.
 */
function poznoteIframeSrcIsTrusted($src): bool {
    $src = trim((string) $src);
    if ($src === '') {
        return false;
    }

    // Reject any explicit scheme that is not http/https (javascript:, data:, ...).
    if (preg_match('#^([a-z][a-z0-9+.\-]*):#i', $src, $schemeMatch)) {
        if (!in_array(strtolower($schemeMatch[1]), ['http', 'https'], true)) {
            return false;
        }
    }

    $host = parse_url($src, PHP_URL_HOST);
    if ($host === null || $host === false || $host === '') {
        // No host -> relative/local path only. A leading "//" with no resolvable
        // host is treated as untrusted.
        if (strpos($src, '//') === 0) {
            return false;
        }
        return $src[0] === '/'
            || strpos($src, './') === 0
            || preg_match('~^audio_player\.php(?:[?#]|$)~i', $src) === 1;
    }

    $host = strtolower($host);
    foreach (ALLOWED_IFRAME_DOMAINS as $domain) {
        $domain = strtolower(trim((string) $domain));
        if ($domain === '') {
            continue;
        }
        if ($host === $domain || substr($host, -(strlen($domain) + 1)) === '.' . $domain) {
            return true;
        }
    }

    return false;
}

/**
 * Decide whether an <audio>/<video> src (or poster) is acceptable:
 * http(s) or a same-origin relative path. Any other scheme is refused.
 */
function poznoteMediaSrcIsTrusted($src): bool {
    $src = trim((string) $src);
    if ($src === '') {
        return false;
    }
    if (preg_match('#^([a-z][a-z0-9+.\-]*):#i', $src, $schemeMatch)) {
        return in_array(strtolower($schemeMatch[1]), ['http', 'https'], true);
    }
    return $src[0] === '/' || strpos($src, './') === 0 || strpos($src, '../') === 0;
}

/**
 * Rebuild an <iframe>, <video> or <audio> tag from a raw attribute string,
 * keeping ONLY allow-listed attributes with re-encoded values.
 *
 * This is the single place that decides which media attributes may reach the
 * page: every path that turns an attribute string back into markup
 * (unescaping stored `&lt;iframe ...&gt;` text, the Markdown parser, ...)
 * must go through it so that inline event handlers or unexpected attributes
 * can never be re-emitted verbatim.
 *
 * @param string $tagName 'iframe', 'video' or 'audio'
 * @param string $attrs   Decoded attribute string (e.g. `src="..." width="560"`)
 * @return string|null    The rebuilt tag, or null when the src is missing/untrusted
 */
function poznoteRebuildMediaTag(string $tagName, string $attrs): ?string {
    static $allowedAttrs = [
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'title', 'sandbox', 'loading', 'referrerpolicy', 'style', 'class', 'scrolling', 'contenteditable', 'data-is-audio', 'data-audio-src', 'data-converted-from-audio'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'],
    ];
    static $booleanAttrs = ['allowfullscreen', 'allowtransparency', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'];

    $tagName = strtolower($tagName);
    if (!isset($allowedAttrs[$tagName])) {
        return null;
    }

    // Tokenize name[=value] pairs the way a browser would (double-quoted,
    // single-quoted or bare values). Anything that does not parse is dropped.
    preg_match_all('/([a-zA-Z][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/', $attrs, $matches, PREG_SET_ORDER);

    $safeAttrs = [];
    $src = null;
    foreach ($matches as $m) {
        $name = strtolower($m[1]);
        if (!in_array($name, $allowedAttrs[$tagName], true) || isset($safeAttrs[$name])) {
            continue;
        }
        $value = ($m[2] ?? '') !== '' ? $m[2] : ((($m[3] ?? '') !== '') ? $m[3] : ($m[4] ?? ''));

        if (in_array($name, $booleanAttrs, true)) {
            $safeAttrs[$name] = $name;
            continue;
        }
        if ($name === 'src') {
            $src = $value;
        } elseif ($name === 'poster' || $name === 'data-audio-src') {
            if (!poznoteMediaSrcIsTrusted($value)) {
                continue;
            }
        } elseif ($name === 'style') {
            if (preg_match('/expression\s*\(|javascript:|behavior\s*:|@import/i', $value)) {
                continue;
            }
        }
        $safeAttrs[$name] = $name . '="' . htmlspecialchars($value, ENT_QUOTES, 'UTF-8') . '"';
    }

    $srcTrusted = $src !== null && ($tagName === 'iframe'
        ? poznoteIframeSrcIsTrusted($src)
        : poznoteMediaSrcIsTrusted($src));
    if (!$srcTrusted) {
        return null;
    }

    return '<' . $tagName . ' ' . implode(' ', $safeAttrs) . '></' . $tagName . '>';
}

/**
 * Helper function to create directory with proper permissions
 * Centralizes the logic for creating directories and setting ownership
 * 
 * @param string $path The directory path to create
 * @param int $permissions The permissions to set (default: 0755)
 * @param bool $recursive Whether to create parent directories (default: true)
 * @return bool True on success, false on failure
 */
function createDirectoryWithPermissions($path, $permissions = 0755, $recursive = true) {
    // Directory already exists
    if (is_dir($path)) {
        return true;
    }
    
    // Try to create directory
    if (!mkdir($path, $permissions, $recursive)) {
        error_log("Failed to create directory: $path");
        return false;
    }
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
    
    return true;
}

/**
 * Helper function to set file permissions and ownership
 * Centralizes the logic for setting file ownership
 * 
 * @param string $path The file or directory path
 * @param int $permissions The permissions to set
 * @return void
 */
function setFilePermissions($path, $permissions = 0644) {
    if (!file_exists($path)) {
        return;
    }
    
    chmod($path, $permissions);
    
    // Set proper ownership if running as root (Docker context)
    if (function_exists('posix_getuid') && posix_getuid() === 0) {
        chown($path, 'www-data');
        chgrp($path, 'www-data');
    }
}

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

function poznoteCountDisplayableAttachments($attachments, $content = '') {
    $count = 0;
    foreach (poznoteDecodeAttachments($attachments) as $attachment) {
        if (!is_array($attachment) || empty($attachment['id'])) {
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
            if (!is_array($attachment) || empty($attachment['id'])) {
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
        require_once __DIR__ . '/users/UserDataManager.php';
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
        if (!is_array($attachment) || empty($attachment['id'])) {
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
 * Detect if the current request is using HTTPS
 * Supports reverse proxy headers (X-Forwarded-Proto, X-Forwarded-SSL)
 */
function isSecureConnection() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
    || (!empty($_SERVER['HTTP_X_FORWARDED_PORT']) && $_SERVER['HTTP_X_FORWARDED_PORT'] === '443')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
}

/**
 * Get the current Git provider name for display (GitHub or Forgejo)
 */
function getGitProviderName($provider = null) {
    if ($provider === null) {
        $provider = defined('GIT_PROVIDER') ? GIT_PROVIDER : 'github';
    }
    return ($provider === 'github') ? 'GitHub' : (($provider === 'forgejo') ? 'Forgejo' : 'Git');
}

/**
 * Get the current protocol (http or https), supporting reverse proxies
 */
function getProtocol() {
    return isSecureConnection() ? 'https' : 'http';
}

/**
 * Get the external request host, preserving a forwarded non-default port when provided.
 */
function getExternalHostWithPort() {
    $forwardedHost = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''));
    if ($forwardedHost !== '') {
        $forwardedHostParts = array_values(array_filter(array_map('trim', explode(',', $forwardedHost)), 'strlen'));
        $host = $forwardedHostParts ? (string)$forwardedHostParts[0] : '';
    } else {
        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost')));
    }

    if ($host === '') {
        $host = 'localhost';
    }

    // If host already contains a port, don't try to append another one
    if (strpos($host, ':') !== false && preg_match('/:\d+$/', $host)) {
        return $host;
    }

    // Only trust a port explicitly forwarded by a reverse proxy. Never fall
    // back to SERVER_PORT: inside the container it is the port nginx listens
    // on (80, or 8080 for the rootless image), which says nothing about the
    // port the visitor used since Docker port mappings and reverse proxies
    // both hide it. When the visitor did use a non-default port, the Host
    // header already carries it (handled above).
    $forwardedPort = trim((string)($_SERVER['HTTP_X_FORWARDED_PORT'] ?? ''));
    if ($forwardedPort === '') {
        return $host;
    }
    $forwardedPortParts = array_values(array_filter(array_map('trim', explode(',', $forwardedPort)), 'strlen'));
    $port = $forwardedPortParts ? (string)$forwardedPortParts[0] : '';

    if ($port === '' || !ctype_digit($port)) {
        return $host;
    }

    // A proxy reporting port 80 on an HTTPS request is describing its own
    // upstream hop to nginx, not the visitor's port: adding :80 would be wrong.
    $isSecure = getProtocol() === 'https';
    if ($port === '80' && $isSecure) {
        return $host;
    }

    $defaultPort = $isSecure ? '443' : '80';
    if ($port === $defaultPort) {
        return $host;
    }

    return $host . ':' . $port;
}

/**
 * Convert Font Awesome icon classes to Lucide icon classes
 * This handles the migration from Font Awesome to Lucide icons
 * 
 * @param string|null $iconClass The Font Awesome icon class (e.g., 'fas fa-home')
 * @return string|null The converted Lucide icon class (e.g., 'lucide-home') or null if empty
 */
function convertFontAwesomeToLucide($iconClass) {
    if (empty($iconClass)) {
        return null;
    }
    
    // Mapping from Font Awesome to Lucide icon names
    $faToLucideMap = [
        'fa-briefcase' => 'lucide-briefcase',
        'fa-home' => 'lucide-home',
        'fa-star' => 'lucide-star',
        'fa-heart' => 'lucide-heart',
        'fa-lightbulb' => 'lucide-lightbulb',
        'fa-image' => 'lucide-image',
        'fa-video' => 'lucide-video',
        'fa-music' => 'lucide-music',
        'fa-book' => 'lucide-book',
        'fa-graduation-cap' => 'lucide-graduation-cap',
        'fa-code' => 'lucide-code',
        'fa-rocket' => 'lucide-rocket',
        'fa-plane' => 'lucide-plane',
        'fa-map-marker-alt' => 'lucide-map-pin',
        'fa-calendar-alt' => 'lucide-calendar',
        'fa-clock' => 'lucide-clock',
        'fa-user' => 'lucide-user',
        'fa-users' => 'lucide-users',
        'fa-cog' => 'lucide-settings',
        'fa-wrench' => 'lucide-wrench',
        'fa-paint-brush' => 'lucide-brush',
        'fa-palette' => 'lucide-palette',
        'fa-camera' => 'lucide-camera',
        'fa-shield' => 'lucide-shield',
        'fa-lock' => 'lucide-lock',
        'fa-key' => 'lucide-key',
        'fa-envelope' => 'lucide-mail',
        'fa-inbox' => 'lucide-inbox',
        'fa-archive' => 'lucide-archive',
        'fa-box' => 'lucide-box',
        'fa-shopping-cart' => 'lucide-shopping-cart',
        'fa-credit-card' => 'lucide-credit-card',
        'fa-chart-line' => 'lucide-trending-up',
        'fa-chart-bar' => 'lucide-bar-chart',
        'fa-database' => 'lucide-database',
        'fa-server' => 'lucide-server',
        'fa-cloud' => 'lucide-cloud',
        'fa-download' => 'lucide-download',
        'fa-upload' => 'lucide-upload',
        'fa-tasks' => 'lucide-list-todo',
        'fa-clipboard' => 'lucide-clipboard',
        'fa-file-alt' => 'lucide-file-text',
        'fa-copy' => 'lucide-copy',
        'fa-gamepad' => 'lucide-gamepad-2',
        'fa-trophy' => 'lucide-trophy',
        'fa-gift' => 'lucide-gift',
        'fa-birthday-cake' => 'lucide-cake',
        'fa-coffee' => 'lucide-coffee',
        'fa-pizza-slice' => 'lucide-pizza',
        'fa-utensils' => 'lucide-utensils-crossed',
        'fa-medkit' => 'lucide-briefcase-medical',
        'fa-heartbeat' => 'lucide-activity',
        'fa-dumbbell' => 'lucide-dumbbell',
        'fa-bicycle' => 'lucide-bike',
        'fa-tree' => 'lucide-tree-deciduous',
        'fa-leaf' => 'lucide-leaf',
        'fa-seedling' => 'lucide-sprout',
        'fa-paw' => 'lucide-paw-print',
        'fa-bug' => 'lucide-bug',
        'fa-flask' => 'lucide-flask-conical',
        'fa-atom' => 'lucide-atom',
        'fa-magnet' => 'lucide-magnet',
        'fa-fire' => 'lucide-flame',
        'fa-sun' => 'lucide-sun',
        'fa-moon' => 'lucide-moon',
        'fa-umbrella' => 'lucide-umbrella',
        'fa-snowflake' => 'lucide-snowflake',
        'fa-bolt' => 'lucide-zap',
        'fa-flag' => 'lucide-flag',
        'fa-bookmark' => 'lucide-bookmark',
        'fa-thumbs-up' => 'lucide-thumbs-up',
        'fa-smile' => 'lucide-smile',
        'fa-layer-group' => 'lucide-layers',
        'fa-terminal' => 'lucide-terminal',
        'fa-at' => 'lucide-at-sign',
        'fa-hashtag' => 'lucide-hash',
        'fa-question-circle' => 'lucide-help-circle',
        'fa-times-circle' => 'lucide-x-circle',
        'fa-eye' => 'lucide-eye',
        'fa-anchor' => 'lucide-anchor',
        'fa-apple-alt' => 'lucide-apple',
        'fa-award' => 'lucide-award',
        'fa-bell' => 'lucide-bell',
        'fa-binoculars' => 'lucide-binoculars',
        'fa-book-open' => 'lucide-book-open',
        'fa-briefcase-medical' => 'lucide-briefcase-medical',
        'fa-brush' => 'lucide-brush',
        'fa-building' => 'lucide-building',
        'fa-bus' => 'lucide-bus',
        'fa-calculator' => 'lucide-calculator',
        'fa-candy-cane' => 'lucide-candy',
        'fa-car' => 'lucide-car',
        'fa-certificate' => 'lucide-badge-check',
        'fa-chart-network' => 'lucide-network',
        'fa-chart-pie' => 'lucide-pie-chart',
        'fa-chess' => 'lucide-crown',
        'fa-clipboard-list' => 'lucide-clipboard-list',
        'fa-cloud-sun' => 'lucide-cloud-sun',
        'fa-coins' => 'lucide-coins',
        'fa-comment' => 'lucide-message-circle',
        'fa-compass' => 'lucide-compass',
        'fa-crown' => 'lucide-crown',
        'fa-cube' => 'lucide-box',
        'fa-cubes' => 'lucide-boxes',
        'fa-desktop' => 'lucide-monitor',
        'fa-diploma' => 'lucide-scroll',
        'fa-dna' => 'lucide-dna',
        'fa-dollar-sign' => 'lucide-dollar-sign',
        'fa-dragon' => 'lucide-flame',
        'fa-drum' => 'lucide-drum',
        'fa-elephant' => 'lucide-paw-print',
        'fa-euro-sign' => 'lucide-euro',
        'fa-feather' => 'lucide-feather',
        'fa-file-code' => 'lucide-file-code',
        'fa-film' => 'lucide-film',
        'fa-fingerprint' => 'lucide-fingerprint',
        'fa-folder-tree' => 'lucide-folder-tree',
        'fa-gem' => 'lucide-gem',
        'fa-glasses' => 'lucide-glasses',
        'fa-globe-americas' => 'lucide-globe',
        'fa-globe-asia' => 'lucide-globe',
        'fa-globe-europe' => 'lucide-globe',
        'fa-guitar' => 'lucide-guitar',
        'fa-hamburger' => 'lucide-hamburger',
        'fa-hammer' => 'lucide-hammer',
        'fa-hard-hat' => 'lucide-hard-hat',
        'fa-headphones' => 'lucide-headphones',
        'fa-headset' => 'lucide-headset',
        'fa-hiking' => 'lucide-mountain',
        'fa-hospital' => 'lucide-hospital',
        'fa-icons' => 'lucide-shapes',
        'fa-id-badge' => 'lucide-id-card',
        'fa-id-card' => 'lucide-id-card',
        'fa-industry' => 'lucide-factory',
        'fa-infinity' => 'lucide-infinity',
        'fa-sword' => 'lucide-swords',
        'fa-laptop' => 'lucide-laptop',
        'fa-map' => 'lucide-map',
        'fa-medal' => 'lucide-medal',
        'fa-microphone' => 'lucide-mic',
        'fa-microscope' => 'lucide-microscope',
        'fa-money-bill' => 'lucide-banknote',
        'fa-mountain' => 'lucide-mountain',
        'fa-mug-hot' => 'lucide-coffee',
        'fa-network-wired' => 'lucide-network',
        'fa-passport' => 'lucide-passport',
        'fa-pen' => 'lucide-pen',
        'fa-pencil-alt' => 'lucide-pencil',
        'fa-pepper-hot' => 'lucide-pepper',
        'fa-phone' => 'lucide-phone',
        'fa-piggy-bank' => 'lucide-piggy-bank',
        'fa-plane-departure' => 'lucide-plane-takeoff',
        'fa-plug' => 'lucide-plug',
        'fa-print' => 'lucide-printer',
        'fa-puzzle-piece' => 'lucide-puzzle',
        'fa-receipt' => 'lucide-receipt',
        'fa-robot' => 'lucide-bot',
        'fa-running' => 'lucide-person-standing',
        'fa-satellite' => 'lucide-satellite',
        'fa-satellite-dish' => 'lucide-satellite-dish',
        'fa-school' => 'lucide-school',
        'fa-scroll' => 'lucide-scroll',
        'fa-shopping-bag' => 'lucide-shopping-bag',
        'fa-sign' => 'lucide-signpost',
        'fa-code-branch' => 'lucide-git-branch',
        'fa-spa' => 'lucide-flower',
        'fa-stamp' => 'lucide-stamp',
        'fa-stethoscope' => 'lucide-stethoscope',
        'fa-store' => 'lucide-store',
        'fa-wave' => 'lucide-waves',
        'fa-sync' => 'lucide-refresh-cw',
        'fa-syringe' => 'lucide-syringe',
        'fa-tablet' => 'lucide-tablet',
        'fa-tachometer-alt' => 'lucide-gauge',
        'fa-tag' => 'lucide-tag',
        'fa-tags' => 'lucide-tags',
        'fa-theater-masks' => 'lucide-drama',
        'fa-tools' => 'lucide-tools',
        'fa-tractor' => 'lucide-tractor',
        'fa-trash-alt' => 'lucide-trash-alt',
        'fa-tree-alt' => 'lucide-tree-alt',
        'fa-truck' => 'lucide-truck',
        'fa-tv' => 'lucide-tv',
        'fa-umbrella-beach' => 'lucide-umbrella-beach',
        'fa-university' => 'lucide-school',
        'fa-user-graduate' => 'lucide-graduation-cap',
        'fa-utensil-spoon' => 'lucide-utensil-spoon',
        'fa-vial' => 'lucide-vial',
        'fa-walking' => 'lucide-walking',
        'fa-wallet' => 'lucide-wallet',
        'fa-warehouse' => 'lucide-warehouse',
        'fa-water' => 'lucide-waves',
        'fa-weight' => 'lucide-weight',
        'fa-wifi' => 'lucide-wifi',
        'fa-wind' => 'lucide-wind',
        'fa-yen-sign' => 'lucide-yen-sign',
        'fa-columns' => 'lucide-columns',
    ];
    
    // If already using Lucide format, return as is
    if (strpos($iconClass, 'lucide-') !== false || strpos($iconClass, 'lucide lucide-') !== false) {
        return $iconClass;
    }
    
    // Remove 'fas', 'far', 'fab' prefixes and extract the icon name
    $iconClass = preg_replace('/\b(fas|far|fab)\s+/', '', $iconClass);
    $iconClass = trim($iconClass);
    
    // Check if we have a mapping for this icon
    if (isset($faToLucideMap[$iconClass])) {
        return $faToLucideMap[$iconClass];
    }
    
    // If no mapping found but it looks like a FA icon, try to convert it generically
    if (strpos($iconClass, 'fa-') === 0) {
        $iconName = str_replace('fa-', '', $iconClass);
        return 'lucide-' . $iconName;
    }
    
    // Return original if no conversion applies
    return $iconClass;
}

function buildNoteIconClass($iconClass, $defaultIcon = 'lucide-file-text') {
    $converted = !empty($iconClass) ? convertFontAwesomeToLucide($iconClass) : $defaultIcon;
    $converted = trim((string)($converted ?: $defaultIcon));
    $classes = preg_split('/\s+/', $converted);
    $hasLucideBase = in_array('lucide', $classes, true);
    $hasLucideIcon = false;

    foreach ($classes as $class) {
        if (strpos($class, 'lucide-') === 0) {
            $hasLucideIcon = true;
            break;
        }
    }

    if (!$hasLucideBase) {
        array_unshift($classes, 'lucide');
    }
    if (!$hasLucideIcon) {
        $classes[] = $defaultIcon;
    }

    return implode(' ', array_unique(array_filter($classes)));
}

/**
 * Default icon for a note that has no custom icon of its own.
 *
 * Task lists and markdown notes get a type-specific icon so they can be told
 * apart from plain HTML notes at a glance in the notes list. Gated by the
 * 'type_based_note_icons' setting (enabled by default); when it is off, every
 * note falls back to the generic file icon as before.
 *
 * Mirrors getNoteTypeIcon() in js/notes-manager.js; js/folder-icon.js does not
 * duplicate the mapping, it reads the resolved default from the
 * data-default-icon attribute stamped by renderEditableNoteIcon() below.
 */
function defaultNoteIconForType($noteType) {
    $setting = getSetting('type_based_note_icons', '1');
    if ($setting === '0' || $setting === 'false') {
        return 'lucide-file-text';
    }

    switch (strtolower((string)($noteType ?: 'note'))) {
        case 'tasklist':
            return 'lucide-list-todo';
        case 'markdown':
            return 'lucide-file-code';
        default:
            return 'lucide-file-text';
    }
}

function renderEditableNoteIcon($noteId, $noteTitle, $iconClass = '', $iconColor = '', $extraClasses = '', $noteType = 'note') {
    $hasCustomNoteIcon = !empty($iconClass);
    $defaultIcon = defaultNoteIconForType($noteType);
    $noteIconClass = buildNoteIconClass($hasCustomNoteIcon ? $iconClass : $defaultIcon, $defaultIcon);
    $noteIconColor = !empty($iconColor) ? (string)$iconColor : '';
    $classes = trim($noteIconClass . ' note-icon ' . (string)$extraClasses);
    $iconStyle = $noteIconColor ? " style='color: " . htmlspecialchars($noteIconColor, ENT_QUOTES) . " !important;'" : "";
    $iconColorAttr = $noteIconColor ? " data-icon-color='" . htmlspecialchars($noteIconColor, ENT_QUOTES) . "'" : "";
    $changeIconTitle = t_h('notes_list.folder_actions.change_note_icon', [], 'Change note icon');
    // Exposed so the icon picker can restore the right default when the user resets the icon.
    $defaultIconAttr = " data-default-icon='" . htmlspecialchars($defaultIcon, ENT_QUOTES) . "'";

    return "<i class='" . htmlspecialchars($classes, ENT_QUOTES) . "' data-custom-icon='" . ($hasCustomNoteIcon ? 'true' : 'false') . "' data-action='open-note-icon-picker' data-note-id='" . htmlspecialchars((string)$noteId, ENT_QUOTES) . "' data-note-title='" . htmlspecialchars((string)$noteTitle, ENT_QUOTES) . "'$iconColorAttr$defaultIconAttr title='" . $changeIconTitle . "' aria-label='" . $changeIconTitle . "'$iconStyle></i>";
}

/* ---------------------------------------------------------------------------
 * Note colors
 *
 * A note stores a single value in entries.color:
 *   - a palette id ('blue', 'green', ...)  -> resolved through the user palette,
 *     so editing the palette instantly recolors every note using that id;
 *   - a literal '#rrggbb'                  -> a per-note custom override;
 *   - NULL / ''                            -> no color, appearance unchanged.
 * ------------------------------------------------------------------------- */

define('NOTE_COLOR_PALETTE_SETTING', 'note_color_palette');

/**
 * English names of the factory palette, keyed by id. They are what a palette
 * saved before the names became translatable still holds in the database, so
 * localizeNoteColorPalette() uses them to tell an untouched entry from one the
 * user renamed on purpose.
 */
function getDefaultNoteColorNames() {
    return [
        'blue'   => 'Blue',
        'green'  => 'Green',
        'yellow' => 'Yellow',
        'orange' => 'Orange',
        'red'    => 'Red',
        'purple' => 'Purple',
        'pink'   => 'Pink',
        'gray'   => 'Gray',
    ];
}

/**
 * Factory palette, used when the user has never customized theirs.
 * Ids are stable identifiers; names are localized for display.
 */
function getDefaultNoteColorPalette() {
    $hex = [
        'blue'   => '#3b82f6',
        'green'  => '#22c55e',
        'yellow' => '#eab308',
        'orange' => '#f97316',
        'red'    => '#ef4444',
        'purple' => '#a855f7',
        'pink'   => '#ec4899',
        'gray'   => '#6b7280',
    ];

    $palette = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $palette[] = [
            'id'   => $id,
            'name' => t('note_color.names.' . $id, [], $englishName),
            'hex'  => $hex[$id],
        ];
    }
    return $palette;
}

/**
 * id => name of the built-in colors in the current user's language.
 */
function getLocalizedNoteColorNames() {
    $names = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $names[$id] = t('note_color.names.' . $id, [], $englishName);
    }
    return $names;
}

/**
 * id => every name a built-in color goes by across the shipped languages,
 * lowercased. A stored palette entry whose name is in this list was never
 * renamed by the user, only saved in whatever language was active at the time,
 * so it is safe to re-translate.
 */
function getKnownNoteColorNames() {
    static $known = null;
    if ($known !== null) {
        return $known;
    }

    $known = [];
    foreach (getDefaultNoteColorNames() as $id => $englishName) {
        $known[$id] = [mb_strtolower($englishName)];
    }
    foreach (glob(__DIR__ . '/i18n/*.json') ?: [] as $file) {
        $dict = loadI18nDictionary(basename($file, '.json'));
        foreach (array_keys($known) as $id) {
            $translated = i18nGet($dict, 'note_color.names.' . $id);
            if ($translated !== null) {
                $known[$id][] = mb_strtolower($translated);
            }
        }
    }
    foreach ($known as $id => $names) {
        $known[$id] = array_values(array_unique($names));
    }

    return $known;
}

/**
 * Translate the names of built-in palette entries the user never renamed.
 * A deliberate rename such as "Bleu client" is always left alone.
 */
function localizeNoteColorPalette($palette) {
    $known = getKnownNoteColorNames();
    $localized = getLocalizedNoteColorNames();

    foreach ($palette as &$entry) {
        $id = $entry['id'] ?? '';
        if (!isset($known[$id])) {
            continue;
        }
        if (in_array(mb_strtolower((string)($entry['name'] ?? '')), $known[$id], true)) {
            $entry['name'] = $localized[$id];
        }
    }
    unset($entry);

    return $palette;
}

/**
 * True when $value is a valid #rgb / #rrggbb literal.
 */
function isNoteColorHex($value) {
    return is_string($value) && preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', trim($value)) === 1;
}

/**
 * Normalize a hex color to lowercase #rrggbb, or '' when invalid.
 */
function normalizeNoteColorHex($value) {
    $value = strtolower(trim((string)$value));
    if (!isNoteColorHex($value)) {
        return '';
    }
    if (strlen($value) === 4) {
        // #abc -> #aabbcc
        $value = '#' . $value[1] . $value[1] . $value[2] . $value[2] . $value[3] . $value[3];
    }
    return $value;
}

/**
 * Validate and clean a palette structure coming from user input or storage.
 * Returns a list of ['id','name','hex'] entries, or [] when nothing is usable.
 */
function sanitizeNoteColorPalette($palette) {
    if (is_string($palette)) {
        $palette = json_decode($palette, true);
    }
    if (!is_array($palette)) {
        return [];
    }

    $clean = [];
    $seenIds = [];
    foreach ($palette as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $hex = normalizeNoteColorHex($entry['hex'] ?? '');
        if ($hex === '') {
            continue;
        }
        $id = strtolower(trim((string)($entry['id'] ?? '')));
        // Ids are used verbatim in CSS class-like data attributes and in the DB.
        $id = preg_replace('/[^a-z0-9_-]/', '', $id);
        if ($id === '' || isset($seenIds[$id])) {
            continue;
        }
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '') {
            $name = ucfirst($id);
        }
        $seenIds[$id] = true;
        $clean[] = [
            'id'   => $id,
            'name' => mb_substr($name, 0, 40),
            'hex'  => $hex,
        ];
        if (count($clean) >= 24) {
            break; // keep the picker and the settings editor manageable
        }
    }

    return $clean;
}

/**
 * The palette in effect for the current user, falling back to the defaults.
 */
function getNoteColorPalette() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $stored = sanitizeNoteColorPalette(getSetting(NOTE_COLOR_PALETTE_SETTING, ''));
    $cached = !empty($stored) ? localizeNoteColorPalette($stored) : getDefaultNoteColorPalette();
    return $cached;
}

/**
 * Resolve a stored entries.color value to a concrete hex color.
 * Returns '' when the note has no color, or when its palette id no longer
 * exists (a deleted palette entry simply renders as uncolored).
 */
function resolveNoteColorHex($storedColor, $palette = null) {
    $storedColor = trim((string)$storedColor);
    if ($storedColor === '') {
        return '';
    }
    if (isNoteColorHex($storedColor)) {
        return normalizeNoteColorHex($storedColor);
    }

    $palette = $palette ?? getNoteColorPalette();
    foreach ($palette as $entry) {
        if ($entry['id'] === strtolower($storedColor)) {
            return $entry['hex'];
        }
    }
    return '';
}

/**
 * Validate a value destined for entries.color. Returns the value to store
 * (palette id or normalized hex), or null to clear the color.
 */
function normalizeStoredNoteColor($value, $palette = null) {
    $value = trim((string)$value);
    if ($value === '') {
        return null;
    }
    if (isNoteColorHex($value)) {
        return normalizeNoteColorHex($value);
    }

    $value = strtolower($value);
    $palette = $palette ?? getNoteColorPalette();
    foreach ($palette as $entry) {
        if ($entry['id'] === $value) {
            return $entry['id'];
        }
    }
    return null;
}

/* ---------------------------------------------------------------------------
 * Tag colors
 *
 * The 'tag_colors' setting stores a JSON object mapping a lowercased tag name
 * to a color value with the same semantics as entries.color: a palette id
 * ('blue', ...) resolved through the user palette, or a literal '#rrggbb'.
 * Tags without an entry render with the neutral default chip style.
 * ------------------------------------------------------------------------- */

define('TAG_COLORS_SETTING', 'tag_colors');

/**
 * Validate and clean a tag => color map coming from user input or storage.
 * Returns [lowercased tag => palette id or '#rrggbb'], dropping invalid rows.
 */
function sanitizeTagColorsMap($value, $palette = null) {
    if (is_string($value)) {
        $value = json_decode($value, true);
    }
    if (!is_array($value)) {
        return [];
    }

    $clean = [];
    foreach ($value as $tag => $color) {
        $tag = mb_strtolower(trim((string)$tag));
        if ($tag === '' || mb_strlen($tag) > 100) {
            continue;
        }
        $stored = normalizeStoredNoteColor($color, $palette);
        if ($stored === null) {
            continue;
        }
        $clean[$tag] = $stored;
        if (count($clean) >= 500) {
            break;
        }
    }

    return $clean;
}

/**
 * The tag => color map in effect for the current user.
 */
function getTagColorsMap() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $cached = sanitizeTagColorsMap(getSetting(TAG_COLORS_SETTING, ''));
    return $cached;
}

/**
 * Resolve a tag name to a concrete hex color, or '' when the tag has no
 * color (or its palette id no longer exists).
 */
function resolveTagColorHex($tag, $map = null, $palette = null) {
    $tag = mb_strtolower(trim((string)$tag));
    if ($tag === '') {
        return '';
    }

    $map = $map ?? getTagColorsMap();
    if (!isset($map[$tag])) {
        return '';
    }
    return resolveNoteColorHex($map[$tag], $palette);
}

/**
 * Global settings cache - loads all settings in one query and caches them
 * This dramatically reduces database queries when settings are accessed multiple times
 */
function getSetting($key, $default = null) {
    static $cache = null;
    
    // Load all settings on first call
    if ($cache === null) {
        $cache = [];
        global $con;
        if (isset($con)) {
            try {
                $stmt = $con->query("SELECT key, value FROM settings");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $cache[$row['key']] = $row['value'];
                }
            } catch (Exception $e) {
                // Ignore errors, cache remains empty
            }
        }
    }
    
    return isset($cache[$key]) ? $cache[$key] : $default;
}

function poznoteGetNonHideableUiKeys() {
    return [
        'card:home-support-card' => true,
        // Dropped from the UI Customization modal: hiding the whole icon rail or
        // its Settings icon left no way back into the settings page. Listed here
        // so preferences saved before the removal stop applying.
        'card:icon_sidebar' => true,
        'card:iconSidebarSettingsBtn' => true,
    ];
}

/**
 * Map UI customization keys that were renamed to the name in use today, so
 * preferences saved under the old key keep working.
 *
 * toolbar:btn-share became toolbar:btn-publish because the AdGuard Social
 * Media list carries an unscoped "##.btn-share" cosmetic rule, which hid the
 * button in every browser running that list.
 */
function poznoteNormalizeHiddenUiKey($key) {
    static $renamed = [
        'toolbar:btn-share' => 'toolbar:btn-publish',
        // Notifications and AI chat moved from the icon rail to the sidebar header.
        'card:iconSidebarNotificationsBtn' => 'card:sidebarNotificationsBtn',
        'card:iconSidebarAiChatBtn' => 'card:sidebarAiChatBtn',
    ];

    return $renamed[$key] ?? $key;
}

/**
 * Interface languages this instance ships a dictionary for (src/i18n/*.json).
 *
 * Single source of truth: the login page, the settings API validation and the
 * login-time language sync must agree, otherwise a code accepted in one place
 * renders as raw translation keys in another.
 */
function poznoteSupportedLanguages(): array {
    return ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh-cn'];
}

/**
 * Normalize a language code to one this instance actually supports.
 *
 * Returns null when the value matches nothing, so callers can decide between
 * keeping their current value and falling back to English.
 */
function poznoteNormalizeLanguageCode($lang): ?string {
    $lang = strtolower(trim((string)$lang));
    if ($lang === '') {
        return null;
    }
    return in_array($lang, poznoteSupportedLanguages(), true) ? $lang : null;
}

/**
 * Pick the best supported language from an Accept-Language header.
 *
 * Used on pre-auth pages (the login page), where no user preference exists yet.
 * Entries are ranked by their q-value, highest first; for each one an exact
 * match wins, otherwise the primary subtag is tried so "fr-CA" still selects
 * "fr". Returns null when nothing matches, leaving the caller's default in place.
 *
 * @param string $header        Raw Accept-Language header value.
 * @param array  $allowedLangs  Supported language codes, lowercase.
 */
function poznoteDetectBrowserLanguage(string $header, array $allowedLangs): ?string {
    $header = trim($header);
    if ($header === '' || empty($allowedLangs)) {
        return null;
    }

    $candidates = [];
    foreach (explode(',', $header) as $index => $part) {
        $bits = explode(';', $part);
        $tag = strtolower(trim($bits[0]));
        if ($tag === '' || $tag === '*') {
            continue;
        }

        // Quality defaults to 1 when the q= parameter is absent or malformed.
        $quality = 1.0;
        for ($i = 1; $i < count($bits); $i++) {
            $param = trim($bits[$i]);
            if (stripos($param, 'q=') === 0) {
                $value = substr($param, 2);
                if (is_numeric($value)) {
                    $quality = (float)$value;
                }
                break;
            }
        }
        if ($quality <= 0) {
            continue; // q=0 explicitly rejects that language.
        }

        // Keep the header order as tie-breaker between equal q-values.
        $candidates[] = ['tag' => $tag, 'q' => $quality, 'order' => $index];
    }

    usort($candidates, function ($a, $b) {
        return $a['q'] === $b['q'] ? ($a['order'] <=> $b['order']) : ($b['q'] <=> $a['q']);
    });

    foreach ($candidates as $candidate) {
        $tag = $candidate['tag'];
        if (in_array($tag, $allowedLangs, true)) {
            return $tag;
        }

        // "fr-CA" -> "fr". Also lets "zh" reach a "zh-cn" style code when that
        // is the only variant this instance ships.
        $primary = explode('-', $tag)[0];
        if ($primary !== $tag && in_array($primary, $allowedLangs, true)) {
            return $primary;
        }
        foreach ($allowedLangs as $allowed) {
            if (explode('-', $allowed)[0] === $primary) {
                return $allowed;
            }
        }
    }

    return null;
}

/**
 * Reconcile the active user's interface language at the start of a session.
 *
 * Two things happen here:
 *  - As long as the user has never picked a language in the settings
 *    (settings.language_source is not 'user'), the browser's Accept-Language
 *    header drives the interface, so a brand new account opens in the visitor's
 *    own language instead of English. The moment the language is changed in the
 *    settings the source flips to 'user' and the browser stops overriding it.
 *  - The resulting language is mirrored into master.users.language, so
 *    consumers that never open the per-user database (mailing tools, admin
 *    exports) can read it from the profile.
 *
 * Called from db_connect.php before anything reads getSetting(), so the value
 * written here is the one the request's static settings cache picks up.
 */
function poznoteSyncUserLanguage(PDO $con, int $userId): void {
    if ($userId <= 0) {
        return;
    }

    try {
        $stmt = $con->query("SELECT key, value FROM settings WHERE key IN ('language', 'language_source')");
        $rows = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $rows[$row['key']] = $row['value'];
        }

        $language = poznoteNormalizeLanguageCode($rows['language'] ?? '');
        $source = (string)($rows['language_source'] ?? '');

        if ($source !== 'user') {
            $detected = poznoteDetectBrowserLanguage(
                $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '',
                poznoteSupportedLanguages()
            );
            if ($detected !== null && $detected !== $language) {
                $update = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $update->execute(['language', $detected]);
                // The generated welcome note follows the browser-driven
                // language too (no-op once the user edited the note, and on
                // the very first bootstrap where no note exists yet).
                poznoteRelocalizeWelcomeNote($con, $detected);
                $language = $detected;
            }
        }

        if ($language === null) {
            $language = 'en';
        }

        require_once __DIR__ . '/users/db_master.php';
        setUserProfileLanguage($userId, $language);
    } catch (Exception $e) {
        // Never let a language sync failure break page rendering.
        error_log('Poznote: user language sync failed: ' . $e->getMessage());
    }
}

function poznoteGetGlobalHiddenUiElements() {
    static $globalHiddenKeys = null;

    if ($globalHiddenKeys !== null) {
        return $globalHiddenKeys;
    }

    $globalHiddenKeys = [];

    try {
        require_once __DIR__ . '/users/db_master.php';
        if (!function_exists('getGlobalSetting')) {
            return $globalHiddenKeys;
        }
        $rawValue = getGlobalSetting('hidden_ui_elements_global', '[]');
    } catch (Exception $e) {
        return $globalHiddenKeys;
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return $globalHiddenKeys;
    }

    $nonHideable = poznoteGetNonHideableUiKeys();
    $seen = [];
    foreach ($decoded as $key) {
        if (!is_string($key)) {
            continue;
        }

        $key = poznoteNormalizeHiddenUiKey($key);
        if (isset($nonHideable[$key])) {
            continue;
        }

        $seen[$key] = true;
    }

    $globalHiddenKeys = array_keys($seen);
    return $globalHiddenKeys;
}

function poznoteGetEnforcedGlobalHiddenUiElements() {
    // Administrators are exempt from the instance-wide hidden set.
    if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
        return [];
    }

    return poznoteGetGlobalHiddenUiElements();
}

function poznoteGetHiddenUiElements() {
    static $hiddenKeys = null;

    if ($hiddenKeys !== null) {
        return $hiddenKeys;
    }

    // Effective hidden set: admin-enforced (non-admin users) keys merged with
    // the current user's personal preferences.
    $merged = [];
    foreach (poznoteGetEnforcedGlobalHiddenUiElements() as $key) {
        $merged[$key] = true;
    }

    $rawValue = getSetting('hidden_ui_elements', '[]');
    $decoded = json_decode((string)$rawValue, true);
    if (is_array($decoded)) {
        $nonHideable = poznoteGetNonHideableUiKeys();
        foreach ($decoded as $key) {
            if (!is_string($key)) {
                continue;
            }

            $key = poznoteNormalizeHiddenUiKey($key);
            if (isset($nonHideable[$key])) {
                continue;
            }

            $merged[$key] = true;
        }
    }

    $hiddenKeys = array_keys($merged);
    return $hiddenKeys;
}

/**
 * User-chosen order of the icon rail's navigation entries, as a list of the
 * button ids declared in icon_sidebar.php.
 *
 * Stored under the 'icon_sidebar_order' user setting by the Icon Sidebar Order
 * card in settings.php. Only the scrolling navigation group is reorderable:
 * the account group at the bottom of the rail (Profile, Settings, About,
 * Logout) is fixed, so a user cannot bury the way back into settings.
 */
function poznoteGetIconSidebarOrder() {
    static $order = null;

    if ($order !== null) {
        return $order;
    }

    $order = [];
    $decoded = json_decode((string)getSetting('icon_sidebar_order', '[]'), true);
    if (is_array($decoded)) {
        $seen = [];
        foreach ($decoded as $id) {
            if (!is_string($id) || $id === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $order[] = $id;
        }
    }

    return $order;
}

/**
 * Apply a saved order to a list of rail items keyed by their 'id'.
 *
 * Ids the preference does not mention keep their declared position relative to
 * one another and follow the ordered ones, so an entry added by a later release
 * appears at the end rather than vanishing, and a stale id is simply ignored.
 */
function poznoteApplyIconSidebarOrder(array $items, array $order) {
    if (!$order) {
        return $items;
    }

    $byId = [];
    foreach ($items as $item) {
        if (isset($item['id'])) {
            $byId[$item['id']] = $item;
        }
    }

    $ordered = [];
    $placed = [];
    foreach ($order as $id) {
        if (isset($byId[$id]) && !isset($placed[$id])) {
            $placed[$id] = true;
            $ordered[] = $byId[$id];
        }
    }

    foreach ($items as $item) {
        if (!isset($item['id']) || !isset($placed[$item['id']])) {
            $ordered[] = $item;
        }
    }

    return $ordered;
}

function poznoteBuildUiCustomizationRules(array $hiddenKeys) {
    $createModalOptionSelectors = [
        'card:create-note-card' => '.create-note-option[data-type="html"]',
        'card:create-markdown-note-card' => '.create-note-option[data-type="markdown"]',
        'card:create-task-list-card' => '.create-note-option[data-type="list"]',
        'card:create-linked-note-card' => '.create-note-option[data-type="linked"]',
        'card:create-template-card' => '.create-note-option[data-type="template"]',
        'card:create-folder-card' => '.create-note-option[data-type="folder"]',
        'card:create-subfolder-card' => '.create-note-option[data-type="subfolder"]',
        'card:create-kanban-card' => '.create-note-option[data-type="kanban"]',
        'card:create-workspace-card' => '.create-note-option[data-type="workspace"]',
    ];

    $rules = [];

    foreach ($hiddenKeys as $key) {
        $parts = explode(':', $key, 2);
        if (count($parts) !== 2) {
            continue;
        }

        [$type, $id] = $parts;

        if ($type === 'card') {
            if ($id === 'ui-customization-card') {
                continue;
            }

            $rules[] = '#' . $id . ' { display: none !important; }';
            if (isset($createModalOptionSelectors[$key])) {
                $rules[] = '#createModal ' . $createModalOptionSelectors[$key] . ' { display: none !important; }';
            }
        } elseif ($type === 'toolbar') {
            $rules[] = '.note-edit-toolbar .' . $id . ', .note-edit-toolbar .' . $id . ':not(.hide-on-selection) { display: none !important; }';
            $rules[] = '.mobile-toolbar-menu [data-selector=".' . $id . '"] { display: none !important; }';
            if ($id === 'btn-snapshot') {
                $rules[] = '.mobile-toolbar-menu [data-action="show-snapshot"] { display: none !important; }';
            } elseif ($id === 'btn-split-view') {
                $rules[] = '.note-edit-toolbar .markdown-split-btn, .note-edit-toolbar .markdown-split-btn:not(.hide-on-selection) { display: none !important; }';
            } elseif ($id === 'btn-tasklist-actions') {
                $rules[] = '.tasklist-actions-dropdown { display: none !important; }';
            } elseif ($id === 'btn-audio') {
                $rules[] = '.mobile-toolbar-menu [data-action="insert-audio-file"] { display: none !important; }';
            } elseif ($id === 'btn-clear-completed') {
                $rules[] = '.mobile-toolbar-menu [data-action="clear-completed-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-uncheck-all') {
                $rules[] = '.mobile-toolbar-menu [data-action="uncheck-all-tasks"] { display: none !important; }';
            } elseif ($id === 'btn-print') {
                $rules[] = '.mobile-toolbar-menu [data-action="print-note"] { display: none !important; }';
            }
        } elseif ($type === 'wsmenu') {
            $rules[] = '.workspace-menu-item[data-action="' . $id . '"] { display: none !important; }';
        } elseif ($type === 'folder') {
            $rules[] = '.folder-actions-menu-item[data-action="' . $id . '"] { display: none !important; }';
            if ($id === 'toggle-sort-submenu') {
                $rules[] = '.sort-submenu { display: none !important; }';
            }
        } elseif ($type === 'panel') {
            if ($id === 'mini-calendar') {
                $rules[] = '.mini-calendar-container { display: none !important; }';
            } elseif ($id === 'folder-actions-toggle') {
                // The ⋮ button on folder rows. The menu itself is shared and
                // stays in the DOM: with no toggle it can no longer be opened.
                $rules[] = '.folder-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-actions-toggle') {
                // The ⋮ button on note rows. body.note-actions-hidden gives the
                // titles back the strip reserved for it (css/tabs.css).
                $rules[] = '.note-actions-toggle { display: none !important; }';
            } elseif ($id === 'note-created-date') {
                // Creation date under the note title. Overrides
                // body.show-note-created in css/notes/subline.css, which the
                // note_display.php markup still sets.
                $rules[] = '.note-subline { display: none !important; }';
            } elseif ($id === 'note-icons') {
                // Icon before the note title, in the sidebar list and in the
                // note header. Both are rendered by renderEditableNoteIcon(),
                // which always emits .note-icon.
                $rules[] = '.note-icon { display: none !important; }';
            } elseif ($id === 'folder-note-count') {
                // The (n) after a folder name. !important beats the
                // .hide-folder-counts hover-reveal in css/sidebar.css, which
                // otherwise brings the count back on hover.
                $rules[] = '.folder-note-count { display: none !important; }';
            } elseif ($id === 'outline-panel') {
                $rules[] = '#outline-panel { display: none !important; }';
                $rules[] = '#outlineResizeHandle { display: none !important; }';
                $rules[] = '#outlineMobileBackdrop { display: none !important; }';
            } elseif ($id === 'tasklist-progress') {
                $rules[] = '.tasklist-progress { display: none !important; }';
            }
        } elseif ($type === 'share') {
            // Share dialog blocks are built in JS. The CSS rule covers pages that
            // do not load the customization runtime (shared.php, workspaces.php);
            // the JS guards keep the hidden controls out of the saved payload.
            if ($id === 'restrict-users') {
                $rules[] = '.share-restrict-users-wrap { display: none !important; }';
            } elseif ($id === 'protocol-toggle') {
                $rules[] = '.share-protocol-wrap { display: none !important; }';
            }
        }
    }

    return implode("\n", $rules);
}

function poznoteRenderUiCustomizationBootstrap() {
    $hiddenKeys = poznoteGetHiddenUiElements();
    $encodedHiddenKeys = json_encode($hiddenKeys, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedHiddenKeys === false) {
        $encodedHiddenKeys = '[]';
    }

    $encodedGlobalHiddenKeys = json_encode(poznoteGetEnforcedGlobalHiddenUiElements(), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
    if ($encodedGlobalHiddenKeys === false) {
        $encodedGlobalHiddenKeys = '[]';
    }

    echo '<script>window.__POZNOTE_HIDDEN_UI_ELEMENTS__ = ' . $encodedHiddenKeys . ';window.__POZNOTE_GLOBAL_HIDDEN_UI_ELEMENTS__ = ' . $encodedGlobalHiddenKeys . ';</script>' . "\n";

    $rules = poznoteBuildUiCustomizationRules($hiddenKeys);
    if ($rules !== '') {
        echo '<style id="ui-customization-styles">' . htmlspecialchars($rules, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</style>' . "\n";
    }
}

function poznoteUsesFolderIconKanban() {
    return !in_array('panel:folder-icon-kanban', poznoteGetHiddenUiElements(), true);
}

/**
 * True when the given UI customization key is hidden for the current user.
 * Used by pages that build share dialogs in JS and read the state from a
 * body data-attribute instead of the customization runtime.
 */
function poznoteIsUiElementHidden($key) {
    return in_array($key, poznoteGetHiddenUiElements(), true);
}

/**
 * True when the current request may target other accounts of the instance by id
 * (share restrictions, user directory). Tenant isolation turns an instance into
 * a SaaS: a non-admin must not be able to learn that the other accounts exist,
 * so naming them is refused server-side and not merely hidden in the UI.
 * Admins keep the capability so they can still manage the instance.
 */
function poznoteCanTargetOtherUsers() {
    if (!defined('TENANT_ISOLATION') || !TENANT_ISOLATION) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * True when the given tenant isolation feature is blocked on this instance
 * (for non-admin users; the per-request admin exemption is up to the caller).
 */
function poznoteTenantIsolationBlocks($feature) {
    return defined('TENANT_ISOLATION_FEATURES')
        && in_array($feature, TENANT_ISOLATION_FEATURES, true);
}

/**
 * True when the current user may manage personal webhooks. Blocked for
 * non-admin users when tenant isolation blocks the user_webhooks feature:
 * webhooks relay note metadata to arbitrary endpoints, which a SaaS operator
 * may not want to offer to tenants. Admins keep the capability.
 */
function poznoteCanUseUserWebhooks() {
    if (!poznoteTenantIsolationBlocks('user_webhooks')) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * Clean content for search by removing base64 images and other heavy data
 * This is used to keep the database entry column lightweight for search functionality
 */
function cleanContentForSearch($content) {
    // Remove base64 images (data:image/...)
    $content = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $content);
    
    // Remove Excalidraw containers with embedded data
    $content = preg_replace('/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s', '[Excalidraw diagram]', $content);
    
    return $content;
}

/**
 * Internationalization (i18n)
 * - Uses JSON dictionaries in src/i18n/{lang}.json
 * - Active language stored in settings table key: 'language'
 * - Fallback to English when a key is missing
 */

function getUserLanguage() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $lang = getSetting('language', 'en');
    if ($lang && is_string($lang)) {
        $lang = strtolower(trim($lang));
        // Basic allowlist: keep it simple and safe
        if (preg_match('/^[a-z]{2}(-[a-z]{2})?$/', $lang)) {
            $cached = $lang;
            return $cached;
        }
    }
    
    $cached = 'en';
    return $cached;
}

function loadI18nDictionary($lang) {
    static $cache = [];

    $lang = strtolower(trim((string)$lang));
    if ($lang === '') $lang = 'en';
    if (isset($cache[$lang])) return $cache[$lang];

    $file = __DIR__ . '/i18n/' . $lang . '.json';
    $json = @file_get_contents($file);
    if ($json === false) {
        $cache[$lang] = [];
        return $cache[$lang];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) $data = [];
    $cache[$lang] = $data;
    return $data;
}

function i18nGet($dict, $key) {
    if (!is_array($dict)) return null;
    $parts = explode('.', $key);
    $cur = $dict;
    foreach ($parts as $p) {
        if (!is_array($cur) || !array_key_exists($p, $cur)) return null;
        $cur = $cur[$p];
    }
    return is_string($cur) ? $cur : null;
}

function t($key, $vars = [], $default = null, $lang = null) {
    if ($lang === null) {
        $lang = getUserLanguage();
    }

    $dict = loadI18nDictionary($lang);
    $en = ($lang === 'en') ? $dict : loadI18nDictionary('en');

    $text = i18nGet($dict, $key);
    if ($text === null) $text = i18nGet($en, $key);
    if ($text === null) $text = ($default !== null ? (string)$default : (string)$key);

    if (is_array($vars) && !empty($vars)) {
        foreach ($vars as $k => $v) {
            $text = str_replace('{{' . $k . '}}', (string)$v, $text);
        }
    }
    return $text;
}

function t_h($key, $vars = [], $default = null, $lang = null) {
    return htmlspecialchars(t($key, $vars, $default, $lang), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Localized content of the generated welcome note, with the same fallback
 * chain as the first-run creation in db_connect.php: dictionary entry first,
 * then the static welcome_note.html template (incomplete/custom dictionary),
 * then a minimal hardcoded paragraph (template missing too).
 */
function poznoteWelcomeNoteContent(string $lang): string {
    $content = t('welcome_note.content', [], '', $lang);
    if (trim($content) === '') {
        $content = (string)@file_get_contents(__DIR__ . '/welcome_note.html');
    }
    if (trim($content) === '') {
        $content = '<p>Welcome to Poznote.</p>';
    }
    return $content;
}

/**
 * Rewrite the generated welcome note in $newLang when the user has not
 * touched it, so the note follows the interface language instead of staying
 * frozen in whatever language was active when the account was bootstrapped
 * (the first-run wizard lets the user pick a different language seconds
 * after the note is created).
 *
 * The note carries no marker of its own, so it is recognized by fingerprint:
 * heading and file content must both still match what the bootstrap would
 * generate for one of the supported languages. An edited, renamed or deleted
 * welcome note never matches and is left alone.
 */
function poznoteRelocalizeWelcomeNote(PDO $con, string $newLang): void {
    $newLang = strtolower(trim($newLang));
    if (!in_array($newLang, poznoteSupportedLanguages(), true)) {
        return;
    }

    try {
        $titles = [];
        foreach (poznoteSupportedLanguages() as $lang) {
            $titles[$lang] = t('welcome_note.title', [], 'Welcome to Poznote', $lang);
        }

        $placeholders = implode(',', array_fill(0, count($titles), '?'));
        $stmt = $con->prepare("SELECT id, heading FROM entries WHERE trash = 0 AND type = 'note' AND heading IN ($placeholders)");
        $stmt->execute(array_values($titles));
        $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$candidates) {
            return;
        }

        $template = trim((string)@file_get_contents(__DIR__ . '/welcome_note.html'));

        foreach ($candidates as $row) {
            $file = getEntryFilename($row['id'], 'note');
            $current = @file_get_contents($file);
            if ($current === false) {
                continue;
            }
            $current = trim($current);

            foreach ($titles as $lang => $title) {
                if ($row['heading'] !== $title) {
                    continue;
                }

                // Everything the bootstrap could have written for $lang.
                $pristine = [trim(poznoteWelcomeNoteContent($lang)), '<p>Welcome to Poznote.</p>'];
                if ($template !== '') {
                    $pristine[] = $template;
                }
                if (!in_array($current, $pristine, true)) {
                    continue;
                }

                if ($lang === $newLang) {
                    return;
                }

                $content = poznoteWelcomeNoteContent($newLang);
                if (file_put_contents($file, $content) === false) {
                    return;
                }
                setFilePermissions($file, 0644);

                // Same search snippet shape as repairDatabaseEntries().
                $snippet = mb_substr(strip_tags(cleanContentForSearch($content)), 0, 500);
                $update = $con->prepare('UPDATE entries SET heading = ?, entry = ?, updated = ? WHERE id = ?');
                $update->execute([
                    t('welcome_note.title', [], 'Welcome to Poznote', $newLang),
                    $snippet,
                    gmdate('Y-m-d H:i:s'),
                    $row['id'],
                ]);
                return;
            }
        }
    } catch (Exception $e) {
        // Cosmetic best-effort operation: never let it break a language change.
        error_log('Poznote: welcome note relocalization failed: ' . $e->getMessage());
    }
}

function normalizeDateOnlyFilter($value) {
    $date = trim((string)$value);
    if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return '';
    }

    $dt = DateTime::createFromFormat('!Y-m-d', $date);
    $errors = DateTime::getLastErrors();
    if ($dt === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return '';
    }

    return $dt->format('Y-m-d') === $date ? $date : '';
}

function dateOnlyFilterToUtcBoundary($value, $endOfDay = false) {
    $date = normalizeDateOnlyFilter($value);
    if ($date === '') {
        return null;
    }

    try {
        $timezone = new DateTimeZone(getUserTimezone());
        $time = $endOfDay ? '23:59:59' : '00:00:00';
        $dt = DateTime::createFromFormat('!Y-m-d H:i:s', $date . ' ' . $time, $timezone);
        if ($dt === false) {
            return null;
        }
        $dt->setTimezone(new DateTimeZone('UTC'));
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get the page title for the application
 * Uses custom display name from settings if available, otherwise uses app name from i18n
 * @return string The HTML-escaped page title
 */
function getPageTitle() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $login_display_name = getGlobalSetting('login_display_name', '');
    
    if ($login_display_name && trim($login_display_name) !== '') {
        $cached = htmlspecialchars($login_display_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    } else {
        $cached = t_h('app.name');
    }
    
    return $cached;
}

/**
 * Get the user's configured timezone from the database
 * Returns 'UTC' if no timezone is configured
 * @return string The timezone identifier (e.g., 'Europe/Paris')
 */
function getUserTimezone() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    // Use the global settings cache
    $timezone = trim((string) getSetting('timezone', ''));
    if ($timezone !== '') {
        try {
            new DateTimeZone($timezone);
            $cached = $timezone;
            return $cached;
        } catch (Exception $e) {
            // Fall back below if an old or manually edited setting is invalid.
        }
    }
    
    $fallbackTimezone = defined('DEFAULT_TIMEZONE') ? DEFAULT_TIMEZONE : 'UTC';
    try {
        new DateTimeZone($fallbackTimezone);
        $cached = $fallbackTimezone;
    } catch (Exception $e) {
        $cached = 'UTC';
    }
    return $cached;
}

/**
 * Date/time display formats supported by the user preference.
 */
function getDateTimeFormatPatterns() {
    return [
        'default' => 'Y-m-d H:i',
        'ymd_hi' => 'Y-m-d H:i',
        'ymd_his' => 'Y-m-d H:i:s',
        'dmy_hi' => 'd/m/Y H:i',
        'mdy_hia' => 'm/d/Y h:i A',
    ];
}

function isCustomDateTimeFormat($format) {
    return is_string($format) && strpos($format, 'custom:') === 0;
}

function getCustomDateTimeFormatPattern($format) {
    return trim(substr((string) $format, 7));
}

function normalizeCustomDateTimePattern($pattern) {
    $pattern = trim((string) $pattern);
    $pattern = preg_replace('/\\b(HH|hh|h):MM:SS\\b/', '$1:mm:ss', $pattern);
    $pattern = preg_replace('/\\b(HH|hh|h):MM\\b/', '$1:mm', $pattern);
    return $pattern;
}

function customDateTimePatternToPhpFormat($pattern) {
    $pattern = normalizeCustomDateTimePattern($pattern);
    $tokens = [
        'YYYY' => 'Y',
        'YY' => 'y',
        'MM' => 'm',
        'DD' => 'd',
        'HH' => 'H',
        'hh' => 'h',
        'h' => 'g',
        'mm' => 'i',
        'ss' => 's',
        'SS' => 's',
        'A' => 'A',
        'a' => 'a',
    ];

    $format = '';
    $length = strlen($pattern);
    for ($i = 0; $i < $length; $i++) {
        $matched = false;
        foreach ($tokens as $token => $phpToken) {
            $tokenLength = strlen($token);
            if (substr($pattern, $i, $tokenLength) === $token) {
                $format .= $phpToken;
                $i += $tokenLength - 1;
                $matched = true;
                break;
            }
        }
        if ($matched) {
            continue;
        }

        $char = $pattern[$i];
        $format .= ctype_alpha($char) ? '\\' . $char : $char;
    }

    return $format;
}

function getUserDateTimeFormat() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $format = getSetting('date_time_format', 'default');
    $patterns = getDateTimeFormatPatterns();
    if (isCustomDateTimeFormat($format) && getCustomDateTimeFormatPattern($format) !== '') {
        $cached = $format;
        return $cached;
    }

    $cached = array_key_exists($format, $patterns) ? $format : 'default';
    return $cached;
}

function getUserDateTimeFormatPattern() {
    $format = getUserDateTimeFormat();
    if (isCustomDateTimeFormat($format)) {
        return customDateTimePatternToPhpFormat(getCustomDateTimeFormatPattern($format));
    }

    $patterns = getDateTimeFormatPatterns();
    return $patterns[$format] ?? null;
}

/**
 * Convert a UTC datetime string to the user's configured timezone
 * @param string $utcDatetime The UTC datetime string (e.g., '2025-11-07 10:52:00')
 * @param string $format The output format (default: 'Y-m-d H:i:s')
 * @return string The datetime in the user's timezone
 */
function convertUtcToUserTimezone($utcDatetime, $format = 'Y-m-d H:i:s') {
    if (empty($utcDatetime)) return '';
    try {
        $userTz = getUserTimezone();
        $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($userTz));
        return $date->format($format);
    } catch (Exception $e) {
        return $utcDatetime; // Return original on error
    }
}

/**
 * Format a UTC datetime string for display using the user's timezone and format preference.
 */
function formatUtcDateTimeForDisplay($utcDatetime, $defaultFormat = 'Y-m-d H:i') {
    if (empty($utcDatetime)) return '';
    try {
        $userTz = getUserTimezone();
        $date = new DateTime($utcDatetime, new DateTimeZone('UTC'));
        $date->setTimezone(new DateTimeZone($userTz));
        $pattern = getUserDateTimeFormatPattern();
        return $date->format($pattern ?: $defaultFormat);
    } catch (Exception $e) {
        return '';
    }
}

/**
 * Format a timestamp for display (with i18n support)
 * @param int $timestamp Unix timestamp
 * @param string $format Date format (default: 'j M Y H:i')
 * @return string Formatted date string
 */
function formatDateTime($timestamp) {
    $timezone = getUserTimezone();
    try {
        $date = new DateTime('@' . $timestamp);
        $date->setTimezone(new DateTimeZone($timezone));
        $pattern = getUserDateTimeFormatPattern();
        if ($pattern) {
            return $date->format($pattern);
        }
        return $date->format('j M Y') . ' ' . t('common.at', [], 'at') . ' ' . $date->format('H:i');
    } catch (Exception $e) {
        $pattern = getUserDateTimeFormatPattern();
        return date($pattern ?: 'j M Y H:i', $timestamp);
    }
}

/**
 * Get a user data directory path by type.
 * @param string $type One of 'entries', 'attachments', 'backups'
 * @return string The directory path
 */
function getDataPath(string $type): string {
    global $activeUserId, $forcePublicTokenRouting;
    // Public share requests are routed to the share owner's data (see
    // db_connect.php): the visitor may be logged in as a different user, so
    // their session user_id must not win over the resolved owner id.
    $userId = !empty($forcePublicTokenRouting)
        ? $activeUserId
        : ($_SESSION['user_id'] ?? $activeUserId);

    $methodMap = [
        'entries' => 'getUserEntriesPath',
        'attachments' => 'getUserAttachmentsPath',
        'backups' => 'getUserBackupsPath',
    ];

    if ($userId && isset($methodMap[$type])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($userId);
        return $dataManager->{$methodMap[$type]}();
    }
    // Fallback for unauthenticated access
    return __DIR__ . '/data/' . $type;
}

function getEntriesPath() { return getDataPath('entries'); }
function getAttachmentsPath() { return getDataPath('attachments'); }
function getBackupsPath() { return getDataPath('backups'); }

/**
 * Attachment storage facade for the active user: local disk by default, or
 * the admin-configured S3-compatible bucket (settings > S3 storage).
 * All attachment file reads/writes/deletes must go through these helpers.
 */
function poznoteAttachmentStorage(): AttachmentStorage {
    require_once __DIR__ . '/storage/AttachmentStorage.php';
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
    require_once __DIR__ . '/storage/AttachmentStorage.php';
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
 * Whether the SaaS-mode storage usage notices are shown (red "note-taking
 * app, not media storage" reminders on the attachment pages, the user
 * storage statistics page and the S3 attachments settings). Hidden by
 * default; the admin enables them from the SaaS mode settings page.
 */
function poznoteSaasNoticesEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_storage_notices', '0') === '1';
}

/**
 * Whether the "contact the administrator" card is shown to every user in
 * the About section of the settings page. Hidden by default; enabled from
 * the SaaS mode settings page.
 */
function poznoteSaasAdminContactEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_admin_contact', '0') === '1';
}

/**
 * URL where users should post general questions, as configured on the SaaS
 * settings page. Empty string when not configured: the Help card then skips
 * the community block (and disappears entirely when the contact email is
 * empty too).
 */
function poznoteSaasCommunityUrl(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_community_url', ''));
}

/**
 * Email address shown on the Help card, as configured on the SaaS settings
 * page. Empty string when not configured: the card then only offers the
 * community space link.
 */
function poznoteSaasAdminContactEmail(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_admin_contact_email', ''));
}

/**
 * Total bytes of the attachments recorded in the active user's database.
 * Used for quotas and stats in S3 mode, where nothing is on disk to scan.
 */
function poznoteSumDbAttachmentBytes(): int {
    global $con;
    if (!isset($con)) {
        return 0;
    }
    $total = 0;
    try {
        $stmt = $con->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach (poznoteDecodeAttachments($row['attachments'] ?? '') as $attachment) {
                $total += max(0, (int)($attachment['file_size'] ?? 0));
            }
        }
    } catch (Exception $e) {
        // Stats/quota input only: never break the caller
    }
    return $total;
}

/**
 * Per-user quota limits: the administrator's global settings, overridden by
 * the active user's per-user values when set (admin storage-stats page).
 * 0 means no limit.
 * @return array Keys: max_notes (int), max_storage_bytes (int),
 *               max_storage_s3_bytes (int), max_backups_s3_bytes (int)
 */
function poznoteGetUserQuotaLimits(): array {
    static $limits = null;
    if ($limits !== null) {
        return $limits;
    }

    global $activeUserId;
    $limits = ['max_notes' => 0, 'max_storage_bytes' => 0, 'max_storage_s3_bytes' => 0, 'max_backups_s3_bytes' => 0];
    try {
        require_once __DIR__ . '/users/db_master.php';
        if (function_exists('getGlobalSetting')) {
            $limits['max_notes'] = max(0, (int) getGlobalSetting('user_max_notes', '0'));
            $limits['max_storage_bytes'] = max(0, (int) getGlobalSetting('user_max_storage_mb', '0')) * 1024 * 1024;
            $limits['max_storage_s3_bytes'] = max(0, (int) getGlobalSetting('user_max_storage_s3_mb', '0')) * 1024 * 1024;
            $limits['max_backups_s3_bytes'] = max(0, (int) getGlobalSetting('user_max_backups_s3_mb', '0')) * 1024 * 1024;
        }

        $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
        if ($userId > 0 && function_exists('getUserQuotaOverrides')) {
            $overrides = getUserQuotaOverrides($userId);
            if ($overrides['max_notes'] !== null) {
                $limits['max_notes'] = max(0, (int) $overrides['max_notes']);
            }
            if ($overrides['max_storage_mb'] !== null) {
                $limits['max_storage_bytes'] = max(0, (int) $overrides['max_storage_mb']) * 1024 * 1024;
            }
            if ($overrides['max_storage_s3_mb'] !== null) {
                $limits['max_storage_s3_bytes'] = max(0, (int) $overrides['max_storage_s3_mb']) * 1024 * 1024;
            }
            if ($overrides['max_backups_s3_mb'] !== null) {
                $limits['max_backups_s3_bytes'] = max(0, (int) $overrides['max_backups_s3_mb']) * 1024 * 1024;
            }
        }
    } catch (Exception $e) {
        // Master database unavailable: fail open, quotas are an admin comfort
        // feature and must never take the app down.
    }
    return $limits;
}

/**
 * True when S3 backups are switched on and their bucket is configured.
 *
 * Mirrors S3BackupService::isEnabled() from the global settings alone, for
 * callers that only need the visibility flag: loading the service pulls in the
 * complete backup ZIP builder, too heavy for a page that merely shows or hides
 * a field. Keep both in sync.
 */
function poznoteS3BackupConfigured(): bool {
    try {
        require_once __DIR__ . '/users/db_master.php';
        if (!function_exists('getGlobalSetting') || getGlobalSetting('s3_backup_enabled', '1') !== '1') {
            return false;
        }
        foreach (['s3_backup_endpoint', 's3_backup_bucket', 's3_backup_access_key', 's3_backup_secret_key'] as $key) {
            if ((string) getGlobalSetting($key, '') === '') {
                return false;
            }
        }
        return true;
    } catch (Exception $e) {
        // Visibility check only: hide the feature rather than break the page
        return false;
    }
}

/**
 * Quotas restrict regular users; administrators are exempt.
 */
function poznoteUserQuotasApply(): bool {
    return !(function_exists('isCurrentUserAdmin') && isCurrentUserAdmin());
}

/**
 * Disk usage of the active account, same perimeter as the admin storage-stats
 * page: database + note files + attachments. Backups are excluded.
 * Cached per request; pass $addBytes to keep the cache accurate after a write.
 */
function poznoteGetActiveUserStorageUsageBytes(int $addBytes = 0): int {
    global $poznoteQuotaUsageCache, $activeUserId;

    if (isset($poznoteQuotaUsageCache)) {
        $poznoteQuotaUsageCache += max(0, $addBytes);
        return $poznoteQuotaUsageCache;
    }

    $poznoteQuotaUsageCache = 0;
    $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
    if ($userId <= 0) {
        return $poznoteQuotaUsageCache;
    }

    require_once __DIR__ . '/users/UserDataManager.php';
    $dataManager = new UserDataManager($userId);
    $dirs = [
        dirname($dataManager->getUserDatabasePath()),
        $dataManager->getUserEntriesPath(),
        $dataManager->getUserAttachmentsPath(),
    ];
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            continue;
        }
        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)
            );
            foreach ($it as $file) {
                if ($file->isFile()) {
                    $poznoteQuotaUsageCache += $file->getSize();
                }
            }
        } catch (Exception $e) {
            // Unreadable directory: count as 0
        }
    }

    $poznoteQuotaUsageCache += max(0, $addBytes);
    return $poznoteQuotaUsageCache;
}

/**
 * Bytes of the active user's attachments stored in the S3 bucket: the sizes
 * recorded in the database for files that are not on the local disk (those
 * still on disk belong to the local storage perimeter above).
 * Cached per request; pass $addBytes to keep the cache accurate after a write.
 */
function poznoteGetActiveUserS3UsageBytes(int $addBytes = 0): int {
    global $poznoteQuotaS3UsageCache;

    if (isset($poznoteQuotaS3UsageCache)) {
        $poznoteQuotaS3UsageCache += max(0, $addBytes);
        return $poznoteQuotaS3UsageCache;
    }

    $poznoteQuotaS3UsageCache = 0;
    global $con;
    if (!isset($con) || !poznoteAttachmentsAreRemote()) {
        return $poznoteQuotaS3UsageCache;
    }

    $attachmentsPath = getAttachmentsPath();
    try {
        $stmt = $con->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != '' AND attachments != '[]'");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            foreach (poznoteDecodeAttachments($row['attachments'] ?? '') as $attachment) {
                $filename = (string)($attachment['filename'] ?? '');
                if ($filename === '' || file_exists($attachmentsPath . '/' . basename($filename))) {
                    continue;
                }
                $poznoteQuotaS3UsageCache += max(0, (int)($attachment['file_size'] ?? 0));
            }
        }
    } catch (Exception $e) {
        // Quota input only: never break the caller
    }

    $poznoteQuotaS3UsageCache += max(0, $addBytes);
    return $poznoteQuotaS3UsageCache;
}

/**
 * Best-effort quota.* webhook when an action is refused by a quota, so the
 * operator learns which users are blocked. Throttled to one delivery per
 * user, event and hour: a blocked autosave or bulk import retries the same
 * refused action many times in a row. Must never break the caller.
 */
function poznoteNotifyQuotaReached(string $event, array $quota): void {
    global $activeUserId;
    static $sentThisRequest = [];

    $userId = (int) ($_SESSION['user_id'] ?? $activeUserId ?? 0);
    if ($userId <= 0 || isset($sentThisRequest[$event])) {
        return;
    }
    $sentThisRequest[$event] = true;

    try {
        require_once __DIR__ . '/users/db_master.php';
        if (empty(listActiveWebhooksForEvent($event))) {
            return;
        }

        $throttleKey = 'webhook_last_' . str_replace('.', '_', $event) . '_user_' . $userId;
        if (time() - (int) getGlobalSetting($throttleKey, '0') < 3600) {
            return;
        }
        setGlobalSetting($throttleKey, (string) time());

        require_once __DIR__ . '/WebhookDispatcher.php';
        (new WebhookDispatcher())->dispatchQuotaReached($event, $userId, $quota);
    } catch (Throwable $e) {
        error_log('Webhook dispatch failed for ' . $event . ': ' . $e->getMessage());
    }
}

/**
 * Check the per-user note count limit before creating $newNotes more notes.
 * Trashed notes count too: they still exist and can be restored.
 * @return string|null A user-facing error message, or null when allowed.
 */
function poznoteCheckNoteQuota(PDO $con, int $newNotes = 1): ?string {
    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_notes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }

    try {
        $count = (int) $con->query('SELECT COUNT(*) FROM entries')->fetchColumn();
    } catch (Exception $e) {
        return null;
    }

    if ($count + $newNotes > $limits['max_notes']) {
        poznoteNotifyQuotaReached('quota.notes_reached', [
            'max_notes' => $limits['max_notes'],
            'note_count' => $count,
        ]);
        return t('api.errors.note_quota_reached', ['max' => $limits['max_notes']],
            'Note limit reached: this instance allows at most ' . $limits['max_notes'] . ' notes for this user (trash included).');
    }
    return null;
}

/**
 * Check the per-user storage limit before writing $additionalBytes more bytes.
 * Negative deltas (content shrinking) are always allowed so a user over quota
 * can still edit notes to free space.
 * @return string|null A user-facing error message, or null when allowed.
 */
function poznoteCheckStorageQuota(int $additionalBytes = 0): ?string {
    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_storage_bytes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }
    if ($additionalBytes <= 0) {
        return null;
    }

    if (poznoteGetActiveUserStorageUsageBytes() + $additionalBytes > $limits['max_storage_bytes']) {
        $maxMb = (int) round($limits['max_storage_bytes'] / (1024 * 1024));
        poznoteNotifyQuotaReached('quota.storage_reached', [
            'max_storage_bytes' => $limits['max_storage_bytes'],
            'used_bytes' => poznoteGetActiveUserStorageUsageBytes(),
            'requested_bytes' => $additionalBytes,
        ]);
        return t('api.errors.storage_quota_reached', ['max' => $maxMb],
            'Storage limit reached: this instance allows at most ' . $maxMb . ' MB of storage for this user.');
    }
    return null;
}

/**
 * Quota check for an attachment upload. Attachments count against the S3
 * quota when they are stored in the bucket, against the local storage quota
 * otherwise. Returns an error message, or null when the upload is allowed.
 */
function poznoteCheckAttachmentStorageQuota(int $additionalBytes = 0): ?string {
    if (!poznoteAttachmentsAreRemote()) {
        return poznoteCheckStorageQuota($additionalBytes);
    }

    $limits = poznoteGetUserQuotaLimits();
    if ($limits['max_storage_s3_bytes'] <= 0 || !poznoteUserQuotasApply()) {
        return null;
    }
    if ($additionalBytes <= 0) {
        return null;
    }

    if (poznoteGetActiveUserS3UsageBytes() + $additionalBytes > $limits['max_storage_s3_bytes']) {
        $maxMb = (int) round($limits['max_storage_s3_bytes'] / (1024 * 1024));
        poznoteNotifyQuotaReached('quota.storage_reached', [
            'pool' => 's3',
            'max_storage_bytes' => $limits['max_storage_s3_bytes'],
            'used_bytes' => poznoteGetActiveUserS3UsageBytes(),
            'requested_bytes' => $additionalBytes,
        ]);
        return t('api.errors.storage_s3_quota_reached', ['max' => $maxMb],
            'S3 storage limit reached: this instance allows at most ' . $maxMb . ' MB of S3 storage for this user.');
    }
    return null;
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

// Display name stored as original_filename. Uses the validated basename and drops
// characters that are meaningless in a filename but significant in HTML, as
// defense in depth: every renderer must still escape the value.
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

function deleteNoteSnapshots($noteId) {
    $noteId = (int) $noteId;
    if ($noteId <= 0) {
        return;
    }

    $snapshotDir = dirname(getEntriesPath()) . '/snapshots/' . $noteId;
    if (!is_dir($snapshotDir)) {
        return;
    }

    $deletePath = static function (string $path) use (&$deletePath): void {
        if (is_dir($path)) {
            $entries = scandir($path);
            if ($entries !== false) {
                foreach ($entries as $entry) {
                    if ($entry === '.' || $entry === '..') {
                        continue;
                    }

                    $deletePath($path . '/' . $entry);
                }
            }

            @rmdir($path);
            return;
        }

        @unlink($path);
    };

    $deletePath($snapshotDir);
}

/**
 * Get the appropriate file extension based on note type
 * @param string $type The note type (note, markdown, tasklist)
 * @return string The file extension (.md or .html)
 */
function getFileExtensionForType($type) {
    return ($type === 'markdown') ? '.md' : '.html';
}

/**
 * Get the full filename for a note entry
 * @param int $id The note ID
 * @param string $type The note type
 * @return string The complete filename with path and extension
 */
function getEntryFilename($id, $type) {
    $extension = getFileExtensionForType($type);
    return getEntriesPath() . '/' . $id . $extension;
}

/**
 * Normalize tasklist storage content to a JSON array string.
 *
 * Older tasklists may be wrapped in HTML/XML markup while the database entry
 * still contains valid raw JSON. This helper extracts and normalizes the JSON
 * payload so callers can safely prefer a valid representation.
 *
 * @param mixed $content Raw stored tasklist content.
 * @return string Normalized JSON array string, or an empty string when invalid.
 */
function normalizeTasklistJsonContent($content) {
    if (!is_string($content)) {
        return '';
    }

    $candidates = [];
    $seen = [];

    $addCandidate = static function ($value) use (&$candidates, &$seen) {
        if (!is_string($value)) {
            return;
        }

        $value = preg_replace('/^\xEF\xBB\xBF/', '', $value);
        $value = trim($value);

        if ($value === '' || isset($seen[$value])) {
            return;
        }

        $seen[$value] = true;
        $candidates[] = $value;
    };

    $extractJsonSegments = static function ($value) use (&$addCandidate) {
        if (!is_string($value) || $value === '') {
            return;
        }

        $firstBracket = strpos($value, '[');
        $lastBracket = strrpos($value, ']');
        if ($firstBracket !== false && $lastBracket !== false && $lastBracket > $firstBracket) {
            $addCandidate(substr($value, $firstBracket, $lastBracket - $firstBracket + 1));
        }

        $firstBrace = strpos($value, '{');
        $lastBrace = strrpos($value, '}');
        if ($firstBrace !== false && $lastBrace !== false && $lastBrace > $firstBrace) {
            $addCandidate(substr($value, $firstBrace, $lastBrace - $firstBrace + 1));
        }
    };

    $decodedHtml = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $withoutXml = preg_replace('/<\?xml[^>]*\?>/i', '', $decodedHtml);
    $strippedText = trim(strip_tags($withoutXml));

    $addCandidate($content);
    $addCandidate($decodedHtml);
    $addCandidate($strippedText);
    $extractJsonSegments($content);
    $extractJsonSegments($decodedHtml);
    $extractJsonSegments($strippedText);

    foreach ($candidates as $candidate) {
        $decoded = json_decode($candidate, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            continue;
        }

        if (is_array($decoded) && isset($decoded['tasks']) && is_array($decoded['tasks'])) {
            $decoded = $decoded['tasks'];
        }

        if (!is_array($decoded)) {
            continue;
        }

        if ($decoded !== [] && !isset($decoded[0])) {
            continue;
        }

        $decoded = array_values(array_map(static function ($task) {
            if (!is_array($task)) {
                return $task;
            }

            $task['completed'] = !empty($task['completed']) || !empty($task['checked']) || !empty($task['done']);

            if (!isset($task['text']) && isset($task['content'])) {
                $task['text'] = (string) $task['content'];
            }

            unset($task['checked'], $task['done']);

            return $task;
        }, $decoded));

        $normalized = json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($normalized !== false) {
            return $normalized;
        }
    }

    return '';
}

/**
 * Pick the first valid tasklist payload between file storage and database.
 *
 * @param mixed $primaryContent Preferred content, typically file storage.
 * @param mixed $fallbackContent Fallback content, typically database storage.
 * @return string Best-effort tasklist content.
 */
function resolveTasklistStoredContent($primaryContent, $fallbackContent = '') {
    $normalizedPrimary = normalizeTasklistJsonContent($primaryContent);
    if ($normalizedPrimary !== '') {
        return $normalizedPrimary;
    }

    $normalizedFallback = normalizeTasklistJsonContent($fallbackContent);
    if ($normalizedFallback !== '') {
        return $normalizedFallback;
    }

    return (string) ($fallbackContent !== '' ? $fallbackContent : $primaryContent);
}

/**
 * Workspace the "Archive note" action files notes into, created on first use.
 *
 * Deliberately not translated: the name is stored in the database, so a
 * language change must not strand already archived notes in a workspace the
 * action no longer points at.
 */
if (!defined('POZNOTE_ARCHIVE_WORKSPACE')) {
    define('POZNOTE_ARCHIVE_WORKSPACE', 'Archives');
}

/**
 * Get the first available workspace name from the database
 * Used as fallback when no specific workspace is selected
 * 
 * @return string The first workspace name, or empty string if none exists
 */
function getFirstWorkspaceName() {
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }

    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['name'])) {
                return $row['name'];
            }
        } catch (Exception $e) {
            // Continue to default
        }
    }
    return '';
}

/**
 * Get the current workspace filter from GET/POST parameters
 * Priority order:
 * 1. GET/POST parameter (highest priority)
 * 2. Database setting 'default_workspace' (if set to a specific workspace name)
 *    Special value '__last_opened__' means use last_opened_workspace from database
 * 3. Database setting 'last_opened_workspace' (the last workspace the user opened)
 * 4. Fallback to first available workspace
 * 
 * @return string The workspace name
 */
function getWorkspaceFilter() {
    static $cached = null;

    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }
    
    // First check URL parameters - but ignore if empty
    // These are dynamic, so don't cache if found
    if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace']) && $_POST['workspace'] !== '') {
        return $_POST['workspace'];
    }
    
    // Return cached value if we already computed it
    if ($cached !== null) {
        return $cached;
    }
    
    // If no parameter or empty parameter, check for default workspace setting in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $defaultWorkspace = $stmt->fetchColumn();
            // Only use defaultWorkspace if it's a real workspace name (not __last_opened__ or empty)
            if ($defaultWorkspace !== false && $defaultWorkspace !== '' && $defaultWorkspace !== '__last_opened__') {
                // Verify workspace exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$defaultWorkspace]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $defaultWorkspace;
                    return $cached;
                }
            }
            
            // Check for last_opened_workspace setting (used when default_workspace is '__last_opened__' or empty)
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['last_opened_workspace']);
            $lastOpened = $stmt->fetchColumn();
            if ($lastOpened !== false && $lastOpened !== '') {
                // Verify the workspace still exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$lastOpened]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $lastOpened;
                    return $cached;
                }
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
        }
    }
    
    // Final fallback: get first available workspace
    $cached = getFirstWorkspaceName();
    return $cached;
}

/**
 * Return a filesystem-safe, deterministic segment for workspace background files.
 */
function getWorkspaceBackgroundSegment($workspace) {
    $workspace = trim((string)$workspace);
    if ($workspace === '') {
        return 'default';
    }

    $segment = preg_replace('/[^A-Za-z0-9_-]/', '_', $workspace);
    $segment = trim((string)$segment, '_');

    if ($segment === '') {
        $segment = 'workspace';
    }

    if ($segment !== $workspace) {
        $segment .= '_' . substr(hash('sha256', $workspace), 0, 8);
    }

    return $segment;
}

/**
 * Save the last opened workspace to the database
 * This is called when a workspace is opened/selected
 * 
 * @param string $workspace The workspace name to save
 * @return bool Whether the save was successful
 */
function saveLastOpenedWorkspace($workspace) {
    global $con;
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return false;
    }

    if (!isset($con) || empty($workspace)) {
        return false;
    }
    
    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return $stmt->execute(['last_opened_workspace', $workspace]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Default note titles as they may already be stored in existing databases,
 * derived from src/i18n/* index.note.new_note values.
 */
function getDefaultNoteTitles(): array {
    static $titles = null;

    if ($titles === null) {
        $titles = [];
        foreach (glob(__DIR__ . '/i18n/*.json') ?: [] as $file) {
            $lang = basename($file, '.json');
            $dict = loadI18nDictionary($lang);
            $title = i18nGet($dict, 'index.note.new_note');
            if ($title !== null && trim($title) !== '') {
                $titles[] = $title;
            }
        }

        $titles = array_values(array_unique($titles));
        if (empty($titles)) {
            $titles = ['New note'];
        }
    }

    return $titles;
}

/**
 * Safe JSON payload for exposing default note titles to client scripts.
 */
function getDefaultNoteTitlesJson(): string {
    return json_encode(
        getDefaultNoteTitles(),
        JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
    ) ?: '["New note"]';
}

/**
 * Return metadata when a title is one of the localized default note titles,
 * optionally with a numeric suffix like " (2)".
 */
function matchDefaultNoteTitle($title): ?array {
    $normalizedTitle = trim((string)$title);
    if ($normalizedTitle === '') {
        return null;
    }

    foreach (getDefaultNoteTitles() as $defaultTitle) {
        $pattern = '/^' . preg_quote($defaultTitle, '/') . '(?: \((\d+)\))?$/u';
        if (preg_match($pattern, $normalizedTitle, $matches)) {
            return [
                'title' => $defaultTitle,
                'number' => $matches[1] ?? null,
            ];
        }
    }

    return null;
}

/**
 * Translate stored default note titles to the current UI language.
 */
function translateDefaultNoteTitle($title): string {
    $match = matchDefaultNoteTitle($title);
    if ($match === null) {
        return (string)$title;
    }

    if ($match['number'] !== null && $match['number'] !== '') {
        return t('index.note.new_note_numbered', ['number' => $match['number']], 'New note (' . $match['number'] . ')');
    }

    return t('index.note.new_note', [], 'New note');
}

/**
 * Generate a unique note title to prevent duplicates
 * Default to "New note" when empty.
 * If a title already exists, add a numeric suffix like " (1)", " (2)", ...
 */
function generateUniqueTitle($originalTitle, $excludeId = null, $workspace = null, $folder_id = null) {
    global $con;
    
    // Clean the original title
    $title = trim($originalTitle);
    if (empty($title)) {
        $title = t('index.note.new_note', [], 'New note');
    }
    
    // Check if title already exists (excluding the current note if updating)
    // Uniqueness is scoped to folder + workspace
    $query = "SELECT COUNT(*) FROM entries WHERE heading = ? AND trash = 0";
    $params = [$title];

    // Check uniqueness within the same folder
    if ($folder_id !== null) {
        $query .= " AND folder_id = ?";
        $params[] = $folder_id;
    } else {
        $query .= " AND folder_id IS NULL";
    }

    // If workspace specified, restrict uniqueness to that workspace
    if ($workspace !== null) {
        $query .= " AND workspace = ?";
        $params[] = $workspace;
    }
    
    if ($excludeId !== null) {
        $query .= " AND id != ?";
        $params[] = $excludeId;
    }
    
    $stmt = $con->prepare($query);
    $stmt->execute($params);
    $count = $stmt->fetchColumn();
    
    // If no duplicate, return the title as is
    if ($count == 0) {
        return $title;
    }
    
    // If duplicate exists, add a number suffix
    $counter = 1;
    $baseTitle = $title;
    
    do {
        $title = $baseTitle . ' (' . $counter . ')';
        
    $stmt = $con->prepare($query);
    $params[0] = $title; // Update the title in params
    $stmt->execute($params);
        $count = $stmt->fetchColumn();
        
        $counter++;
    } while ($count > 0);
    
    return $title;
}

/**
 * Report restore progress to an optional observer.
 *
 * The background restore worker (workers/job-runner.php) registers a
 * callable in $GLOBALS['poznote_restore_progress_hook'] to surface the
 * pipeline's milestones to the browser's progress bar; the synchronous
 * flows leave it unset and this is a no-op. The observer must never be
 * able to break a restore, so its failures are swallowed.
 *
 * @param string $stage One of extracting, preparing, database, notes,
 *        attachments
 * @param int|null $done Items processed so far in this stage, when the
 *        stage has countable items
 * @param int|null $total Total items of this stage
 */
function poznoteRestoreReportProgress(string $stage, ?int $done = null, ?int $total = null): void {
    $hook = $GLOBALS['poznote_restore_progress_hook'] ?? null;
    if (is_callable($hook)) {
        try {
            $hook($stage, $done, $total);
        } catch (Throwable $e) {
            // observer only
        }
    }
}

/**
 * Restore a complete backup from ZIP file
 * Handles database, notes, and attachments restoration
 */
function restoreCompleteBackup($uploadedFile, $isLocalFile = false) {
    // Check file type
    if (!preg_match('/\.zip$/i', $uploadedFile['name'])) {
        return ['success' => false, 'error' => 'File type not allowed. Use a .zip file'];
    }
    
    $tempFile = '/tmp/poznote_complete_restore_' . uniqid() . '.zip';
    $tempExtractDir = null;
    
    try {
        // Move/copy uploaded file
        if ($isLocalFile) {
            // For locally created files
            if (!copy($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error copying local file'];
            }
        } else {
            // For HTTP uploaded files
            if (!move_uploaded_file($uploadedFile['tmp_name'], $tempFile)) {
                return ['success' => false, 'error' => 'Error uploading file'];
            }
        }
        
        // Extract ZIP to temporary directory
        $tempExtractDir = '/tmp/poznote_restore_' . uniqid();
        if (!createDirectoryWithPermissions($tempExtractDir)) {
            unlink($tempFile);
            return ['success' => false, 'error' => 'Cannot create temporary directory'];
        }
        
        // Ensure required data directories exist
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            if (!$dataManager->userDirectoriesExist()) {
                $dataManager->initializeUserDirectories();
            }
        } else {
            // Fallback for non-user mode (old structure compatibility)
            $dataDir = __DIR__ . '/data';
            $requiredDirs = ['attachments', 'database', 'entries'];
            foreach ($requiredDirs as $dir) {
                $fullPath = $dataDir . '/' . $dir;
                if (!is_dir($fullPath)) {
                    mkdir($fullPath, 0755, true);
                    if (function_exists('posix_getuid') && posix_getuid() === 0) {
                        $current_uid = posix_getuid();
                        $current_gid = posix_getgid();
                        chown($fullPath, $current_uid);
                        chgrp($fullPath, $current_gid);
                    }
                }
            }
        }
        
        $zip = new ZipArchive;
        $res = $zip->open($tempFile);
        
        if ($res !== TRUE) {
            unlink($tempFile);
            rmdir($tempExtractDir);
            return ['success' => false, 'error' => 'Cannot open ZIP file'];
        }
        
        poznoteRestoreReportProgress('extracting');
        // A failed extraction (a full disk mid-way is the realistic case)
        // must not fall through to the wipe-and-restore below with only some
        // of the files on disk: the SQL dump is validated and executed, then
        // notes/attachments whose files never extracted would be silently
        // missing. Refuse before touching any existing data.
        if (!$zip->extractTo($tempExtractDir)) {
            $zip->close();
            unlink($tempFile);
            deleteDirectory($tempExtractDir);
            return ['success' => false, 'error' => 'Cannot extract the ZIP file (the server may be out of disk space). Nothing was restored.'];
        }
        $zip->close();
        unlink($tempFile);
        $tempFile = null; // Mark as cleaned

        // VALIDATE BACKUP CONTENT BEFORE ANY DESTRUCTIVE OPERATION
        // A complete backup must contain the SQL dump; refuse anything else
        // so a wrong ZIP never wipes existing data.
        $sqlFile = $tempExtractDir . '/database/poznote_backup.sql';
        if (!file_exists($sqlFile)) {
            deleteDirectory($tempExtractDir);
            $tempExtractDir = null;
            return [
                'success' => false,
                'error' => 'Invalid backup file: database/poznote_backup.sql not found in ZIP. Nothing was restored.',
                'message' => ''
            ];
        }

        // The dump is executed as SQL later on, so it must contain nothing
        // but the statements a Poznote backup is made of. Checked before the
        // wipe: a refused dump must leave the existing data untouched.
        require_once __DIR__ . '/backup_sql_restore.php';
        $parsedDump = poznoteParseBackupSql((string)file_get_contents($sqlFile));
        if (!$parsedDump['success']) {
            deleteDirectory($tempExtractDir);
            $tempExtractDir = null;
            return [
                'success' => false,
                'error' => 'Invalid backup file: database/poznote_backup.sql is not a Poznote database dump (' . $parsedDump['error'] . '). Nothing was restored.',
                'message' => ''
            ];
        }
        $dumpStatements = $parsedDump['statements'];
        unset($parsedDump);

        // A backup made with the lighter-zip option references attachments in
        // its metadata but does not carry all of the files (none of them in
        // pure S3 mode, only the not-yet-migrated ones in a partially
        // migrated state). Restoring it while S3 storage is active would
        // purge the bucket below and lose every file the zip does not carry,
        // so refuse before wiping anything unless the zip has a file for
        // EVERY attachment its metadata references. Checking for "at least
        // one file" is not enough: one unmigrated file in the zip would let
        // the purge destroy all the migrated ones.
        // Mirrors the purge condition below: it only guards against wiping
        // the bucket, so it must not block restores that never purge.
        if (poznoteAttachmentsAreRemote()) {
            $backupAttachmentsDir = $tempExtractDir . '/attachments';
            $backupMetadataFile = $backupAttachmentsDir . '/poznote_attachments_metadata.json';
            if (file_exists($backupMetadataFile)) {
                $backupMetadata = json_decode((string)file_get_contents($backupMetadataFile), true);
                if (is_array($backupMetadata) && count($backupMetadata) > 0) {
                    // Files present in the zip, addressable the two ways
                    // restoreAttachmentsFromDir() resolves them: by attachment
                    // id ({id}.{ext}, complete-backup naming) or by storage
                    // filename (attachments-export naming, rebuilt archives)
                    $presentBasenames = [];
                    $presentIds = [];
                    $backupFiles = new RecursiveIteratorIterator(
                        new RecursiveDirectoryIterator($backupAttachmentsDir, RecursiveDirectoryIterator::SKIP_DOTS)
                    );
                    foreach ($backupFiles as $backupFile) {
                        if ($backupFile->isFile() && $backupFile->getFilename() !== 'poznote_attachments_metadata.json') {
                            $presentBasenames[$backupFile->getFilename()] = true;
                            $presentIds[pathinfo($backupFile->getFilename(), PATHINFO_FILENAME)] = true;
                        }
                    }

                    $referencedCount = 0;
                    $missingCount = 0;
                    foreach ($backupMetadata as $metadataItem) {
                        $attachmentId = (string)($metadataItem['attachment_data']['id'] ?? '');
                        $attachmentFilename = (string)($metadataItem['attachment_data']['filename'] ?? '');
                        if ($attachmentId === '' && $attachmentFilename === '') {
                            continue;
                        }
                        $referencedCount++;
                        if (($attachmentId !== '' && isset($presentIds[$attachmentId]))
                            || ($attachmentFilename !== '' && isset($presentBasenames[$attachmentFilename]))) {
                            continue;
                        }
                        $missingCount++;
                    }

                    if ($missingCount > 0) {
                        deleteDirectory($tempExtractDir);
                        $tempExtractDir = null;
                        return [
                            'success' => false,
                            'error' => 'This backup is missing ' . $missingCount . ' of the ' . $referencedCount . ' attachment file(s) it references (they were stored in S3 when it was created), and restoring it while S3 storage is enabled would remove every attachment from the bucket. Two options: turn off S3 storage in the settings (keep the credentials), restore this backup, then turn it back on, so attachments still in the bucket keep being served; or add the missing files to the attachments/ folder of the ZIP (the attachments export contains them) and restore the rebuilt zip. Nothing was modified: your notes, your attachments and the bucket content are untouched.',
                            'message' => ''
                        ];
                    }
                }
            }
        }

        // The restore below purges the user's bucket objects and rewrites the
        // archive's attachments through the bucket. Probe it first: wiping
        // the local files while the bucket is unreachable would leave the
        // attachments stored nowhere, with the upload failures only visible
        // in the server logs.
        if (poznoteAttachmentsAreRemote()) {
            try {
                $bucketProbe = AttachmentStorage::makeClient(AttachmentStorage::getConfig())->testConnection();
            } catch (Exception $bucketProbeError) {
                $bucketProbe = ['success' => false, 'error' => $bucketProbeError->getMessage()];
            }
            if (empty($bucketProbe['success'])) {
                deleteDirectory($tempExtractDir);
                $tempExtractDir = null;
                return [
                    'success' => false,
                    'error' => 'The S3 bucket cannot be reached (' . (string)($bucketProbe['error'] ?? 'unknown error') . '). This restore stores the attachments in the bucket, so nothing was restored. Check the S3 storage settings or try again once the bucket is reachable.',
                    'message' => ''
                ];
            }
        }

        // CLEAR ENTRIES DIRECTORY BEFORE RESTORATION
        poznoteRestoreReportProgress('preparing');
        $entriesPath = getEntriesPath();
        if (is_dir($entriesPath)) {
            // Delete all files in entries directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($entriesPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $entriesCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $entriesCleared++;
            }
            error_log("CLEARED $entriesCleared files from entries directory");
        } else {
            // Create entries directory if it doesn't exist
            createDirectoryWithPermissions($entriesPath);
        }
        
        // CLEAR ATTACHMENTS DIRECTORY BEFORE RESTORATION
        $attachmentsPath = getAttachmentsPath();
        if (is_dir($attachmentsPath)) {
            // Delete all files in attachments directory
            $files = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($attachmentsPath, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::CHILD_FIRST
            );
            
            $attachmentsCleared = 0;
            foreach ($files as $fileinfo) {
                $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                $todo($fileinfo->getRealPath());
                $attachmentsCleared++;
            }
            error_log("CLEARED $attachmentsCleared files from attachments directory");
        } else {
            // Create attachments directory if it doesn't exist
            createDirectoryWithPermissions($attachmentsPath);
        }

        // A full restore replaces all attachments, so purge the user's
        // objects from the bucket as well.
        //
        // Deliberately gated on the active mode, NOT on the credentials:
        // the restore rewrites files through storeFile(), which follows the
        // active mode too. Purging on credentials alone would empty the
        // bucket and then rewrite everything to local disk, destroying
        // objects nothing puts back.
        if (poznoteAttachmentsAreRemote()) {
            $remoteCleared = poznoteAttachmentStorage()->deleteAllRemote();
            error_log("CLEARED $remoteCleared attachment objects from S3 bucket");
        }
        
        $results = [];
        $hasErrors = false;
        $databaseRestored = false;
        $skippedAttachments = [];
        
        // Restore database (the SQL file was validated before the wipe)
        poznoteRestoreReportProgress('database');
        $dbResult = restoreDatabaseFromFile($sqlFile, $dumpStatements);
        unset($dumpStatements);
        if ($dbResult['success']) {
            $dbLabel = basename(poznoteGetActiveDatabasePath());
            $dbSummary = '';
            try {
                $statsCon = new PDO('sqlite:' . poznoteGetActiveDatabasePath());
                $statsCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $noteCount = (int)$statsCon->query('SELECT COUNT(*) FROM entries WHERE trash = 0')->fetchColumn();
                $trashCount = (int)$statsCon->query('SELECT COUNT(*) FROM entries WHERE trash != 0')->fetchColumn();
                $folderCount = (int)$statsCon->query('SELECT COUNT(*) FROM folders')->fetchColumn();
                $workspaceCount = (int)$statsCon->query('SELECT COUNT(*) FROM workspaces')->fetchColumn();
                $dbSummary = ' (' . $noteCount . ' note' . ($noteCount === 1 ? '' : 's')
                    . ($trashCount > 0 ? ' + ' . $trashCount . ' in trash' : '')
                    . ', ' . $folderCount . ' folder' . ($folderCount === 1 ? '' : 's')
                    . ', ' . $workspaceCount . ' workspace' . ($workspaceCount === 1 ? '' : 's') . ')';
                $statsCon = null;
            } catch (Throwable $statsError) {
                $dbSummary = '';
            }
            $results[] = 'Database: Restored ' . ($dbLabel !== '' ? $dbLabel : 'successfully') . $dbSummary;
        } else {
            $results[] = 'Database: Failed - ' . $dbResult['error'];
        }
        if (!$dbResult['success']) $hasErrors = true;
        $databaseRestored = $dbResult['success'];
        
        // Restore entries if entries directory exists in backup
        $entriesDir = $tempExtractDir . '/entries';
        if (is_dir($entriesDir)) {
            $entriesResult = restoreEntriesFromDir($entriesDir);
            $results[] = 'Notes: ' . ($entriesResult['success'] ? 'Restored ' . $entriesResult['count'] . ' note files (HTML/Markdown)' : 'Failed - ' . $entriesResult['error']);
            if (!$entriesResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Notes: No entries directory found in backup (entries directory cleared)';
        }
        
        // Restore attachments if attachments directory exists in backup
        $attachmentsDir = $tempExtractDir . '/attachments';
        if (is_dir($attachmentsDir)) {
            $attachmentsResult = restoreAttachmentsFromDir($attachmentsDir);
            if ($attachmentsResult['success']) {
                $skippedAttachments = $attachmentsResult['skipped_files'] ?? [];
                $restoredFilesCount = (int)$attachmentsResult['count'];
                $attachmentUsage = $databaseRestored
                    ? poznoteCountAttachmentUsageInActiveDatabase($attachmentsResult['filenames'] ?? [])
                    : null;
                $attachmentsMessage = 'Restored ' . $restoredFilesCount . ' file' . ($restoredFilesCount === 1 ? '' : 's');
                if (is_array($attachmentUsage)) {
                    $usageParts = [];
                    $usageParts[] = $attachmentUsage['attached'] . ' attached to notes';
                    if ($attachmentUsage['embedded'] > 0) {
                        $usageParts[] = $attachmentUsage['embedded'] . ' embedded in notes as images';
                    }
                    $unreferencedCount = $restoredFilesCount - $attachmentUsage['attached'] - $attachmentUsage['embedded'];
                    if ($unreferencedCount > 0) {
                        $usageParts[] = $unreferencedCount . ' not linked to any note';
                    }
                    $attachmentsMessage .= ' (' . implode(', ', $usageParts) . ')';
                }
                if (!empty($attachmentsResult['skipped'])) {
                    $attachmentsMessage .= ', skipped ' . $attachmentsResult['skipped'] . ' blocked files';
                    $skippedDetailsMessage = poznoteFormatSkippedAttachmentDetails($skippedAttachments);
                    if ($skippedDetailsMessage !== '') {
                        $attachmentsMessage .= "\n" . $skippedDetailsMessage;
                    }
                }
                if (!empty($attachmentsResult['failed'])) {
                    // Storage failures (bucket upload refused, disk full, ...)
                    // must fail the restore visibly: the archive still has the
                    // files, so the user can fix the storage and restore again
                    $attachmentsMessage .= ', FAILED to store ' . $attachmentsResult['failed'] . ' file(s), see the server logs; fix the storage (disk space, S3 bucket) and restore this backup again';
                    $hasErrors = true;
                }
                $results[] = 'Attachments: ' . $attachmentsMessage;
            } else {
                $results[] = 'Attachments: Failed - ' . $attachmentsResult['error'];
            }
            if (!$attachmentsResult['success']) $hasErrors = true;
        } else {
            $results[] = 'Attachments: No attachments directory found in backup (attachments directory cleared)';
        }

        // Fix orphaned folders and missing entry snippets, now that both the
        // database and the note files are restored. Use a fresh connection to
        // the restored database: the global $con still points at the deleted
        // pre-restore database file and must not be used for writes here.
        if ($databaseRestored) {
            try {
                $repairCon = new PDO('sqlite:' . poznoteGetActiveDatabasePath());
                $repairCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $repairCon->exec('PRAGMA busy_timeout = 5000');
                $repairResult = repairDatabaseEntries($repairCon);
                // Housekeeping the user cannot act on: log it instead of
                // reporting it as a restore result
                if ($repairResult['success'] && ($repairResult['folders_fixed'] > 0 || $repairResult['entries_fixed'] > 0)) {
                    error_log("Post-restore repair: fixed {$repairResult['folders_fixed']} folders and {$repairResult['entries_fixed']} entry snippets");
                }
                $repairCon = null;
            } catch (Throwable $e) {
                error_log('Post-restore repair failed: ' . $e->getMessage());
            }
        }

        // Clean up temporary directory
        deleteDirectory($tempExtractDir);
        $tempExtractDir = null; // Mark as cleaned
        
        // Ensure proper permissions after restoration
        ensureDataPermissions();
        
        return [
            'success' => !$hasErrors,
            'message' => implode("\n", $results),
            'error' => $hasErrors ? 'Some components failed to restore' : '',
            'skipped_attachments' => $skippedAttachments
        ];
        
    } catch (Exception $e) {
        // Clean up on error
        if ($tempFile && file_exists($tempFile)) {
            unlink($tempFile);
        }
        if ($tempExtractDir && is_dir($tempExtractDir)) {
            deleteDirectory($tempExtractDir);
        }
        return ['success' => false, 'error' => 'Exception during restore: ' . $e->getMessage()];
    }
}

/**
 * Restore database from SQL file
 *
 * The dump comes from a user-supplied archive, so it is never executed as-is:
 * it is parsed into DROP TABLE / CREATE TABLE / INSERT statements first and
 * anything else (ATTACH, PRAGMA, triggers...) is refused. See
 * backup_sql_restore.php.
 *
 * @param string $sqlFile Path of the dump
 * @param array|null $statements Statements already validated by
 *        poznoteParseBackupSql(), to avoid parsing the file twice
 */
function restoreDatabaseFromFile($sqlFile, $statements = null) {
    require_once __DIR__ . '/backup_sql_restore.php';

    if ($statements === null) {
        $content = file_get_contents($sqlFile);
        if (!$content) {
            return ['success' => false, 'error' => 'Cannot read SQL file'];
        }
        $parsed = poznoteParseBackupSql($content);
        unset($content);
        if (!$parsed['success']) {
            return ['success' => false, 'error' => 'Invalid SQL dump: ' . $parsed['error']];
        }
        $statements = $parsed['statements'];
    }

    // Use the active database path from db_connect.php or determine it for the current user
    global $dbPath; 
    if (!isset($dbPath) || empty($dbPath)) {
        if (isset($_SESSION['user_id'])) {
            require_once __DIR__ . '/users/UserDataManager.php';
            $dataManager = new UserDataManager($_SESSION['user_id']);
            $dbPath = $dataManager->getUserDatabasePath();
        } else {
            $dbPath = SQLITE_DATABASE;
        }
    }
    
    // Remove current database
    if (file_exists($dbPath)) {
        if (!unlink($dbPath)) {
            // If unlink fails (e.g. open handle), try to truncate the file
            if (file_put_contents($dbPath, '') === false) {
                return ['success' => false, 'error' => 'Failed to delete or clear existing database file. Please check permissions or restarting the service.'];
            }
        }
    }
    // Remove leftover WAL/SHM files so the old connection's journal cannot
    // be replayed into the freshly restored database
    foreach (['-wal', '-shm'] as $suffix) {
        if (file_exists($dbPath . $suffix)) {
            @unlink($dbPath . $suffix);
        }
    }
    
    $executed = poznoteExecuteBackupSql($dbPath, $statements);
    if (!$executed['success']) {
        return ['success' => false, 'error' => $executed['error']];
    }

    // Ensure proper permissions on restored database
    setFilePermissions($dbPath, 0664);

    return ['success' => true];
}

// Note: schema migrations are handled at runtime by db_connect.php

/**
 * Restore entries from directory
 */
function restoreEntriesFromDir($sourceDir) {
    $entriesPath = getEntriesPath();
    
    if (!$entriesPath || !is_dir($entriesPath)) {
        return ['success' => false, 'error' => 'Cannot find entries directory'];
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    // Total for the progress observer (cheap directory walk)
    $totalFiles = iterator_count(new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    ));
    $processedFiles = 0;
    poznoteRestoreReportProgress('notes', 0, $totalFiles);

    $importedCount = 0;

    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $processedFiles++;
            if ($processedFiles % 20 === 0 || $processedFiles === $totalFiles) {
                poznoteRestoreReportProgress('notes', $processedFiles, $totalFiles);
            }
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $extension = pathinfo($relativePath, PATHINFO_EXTENSION);
            
            // Include both HTML and Markdown files
            if ($extension === 'html' || $extension === 'md') {
                $content = file_get_contents($filePath);
                
                if ($content !== false) {
                    // Get note ID from filename (e.g., "123.html" -> "123")
                    $noteId = pathinfo($relativePath, PATHINFO_FILENAME);
                    
                    // Convert relative attachment paths back to API URLs
                    if ($extension === 'html') {
                        // Convert ../attachments/{attachmentId}.ext to /api/v1/notes/{noteId}/attachments/{attachmentId}
                        $content = preg_replace_callback(
                            '#\.\./attachments/([^"\'\s<>]+)#',
                            function($matches) use ($noteId) {
                                $attachmentId = preg_replace('/\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|mov|webm|mp3|wav|ogg|m4a|txt|md|markdown|json|csv|xml|zip|tar|gz|7z|rar)$/i', '', basename($matches[1]));
                                return '/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId;
                            },
                            $content
                        );
                    } else if ($extension === 'md') {
                        // Convert ![alt](../attachments/{attachmentId}.ext) to ![alt](/api/v1/notes/{noteId}/attachments/{attachmentId})
                        $content = preg_replace_callback(
                            '#\!\[([^\]]*)\]\(\.\./attachments/([^\)]+)\)#',
                            function($matches) use ($noteId) {
                                $attachmentId = preg_replace('/\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|mp4|mov|webm|mp3|wav|ogg|m4a|txt|md|markdown|json|csv|xml|zip|tar|gz|7z|rar)$/i', '', basename($matches[2]));
                                return '![' . $matches[1] . '](/api/v1/notes/' . $noteId . '/attachments/' . $attachmentId . ')';
                            },
                            $content
                        );
                    }
                    
                    $targetFile = $entriesPath . '/' . basename($relativePath);
                    if (file_put_contents($targetFile, $content) !== false) {
                        chmod($targetFile, 0644);
                        $importedCount++;
                    }
                } else {
                    // If reading fails, just copy the file as-is
                    $targetFile = $entriesPath . '/' . basename($relativePath);
                    if (copy($filePath, $targetFile)) {
                        chmod($targetFile, 0644);
                        $importedCount++;
                    }
                }
            }
        }
    }
    
    return ['success' => true, 'count' => $importedCount];
}

/**
 * Restore attachments from directory
 */
function restoreAttachmentsFromDir($sourceDir) {
    $attachmentsPath = getAttachmentsPath();
    
    if (!$attachmentsPath || !is_dir($attachmentsPath)) {
        return ['success' => false, 'error' => 'Cannot find attachments directory'];
    }
    
    // Read metadata file to get original filenames
    $metadataFile = $sourceDir . '/poznote_attachments_metadata.json';
    $idToAttachmentMap = [];
    
    if (file_exists($metadataFile)) {
        $metadataContent = file_get_contents($metadataFile);
        $metadata = json_decode($metadataContent, true);
        
        if (is_array($metadata)) {
            foreach ($metadata as $item) {
                if (isset($item['attachment_data']['id']) && isset($item['attachment_data']['filename'])) {
                    $idToAttachmentMap[$item['attachment_data']['id']] = [
                        'filename' => $item['attachment_data']['filename'],
                        'original_filename' => $item['attachment_data']['original_filename'] ?? '',
                        'note_id' => $item['note_id'] ?? '',
                        'note_heading' => $item['note_heading'] ?? ''
                    ];
                }
            }
        }
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    // Total for the progress observer: attachments are the long pole of a
    // big restore (each one can be a slow bucket upload), so they are
    // reported file by file.
    $totalFiles = iterator_count(new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    ));
    $processedFiles = 0;
    poznoteRestoreReportProgress('attachments', 0, $totalFiles);

    $importedCount = 0;
    $skippedCount = 0;
    $failedCount = 0;
    $restoredFilenames = [];
    $skippedFiles = [];

    foreach ($files as $name => $file) {
        if (!$file->isDir()) {
            $processedFiles++;
            poznoteRestoreReportProgress('attachments', $processedFiles, $totalFiles);
            $filePath = $file->getRealPath();
            $relativePath = substr($filePath, strlen($sourceDir) + 1);
            $basename = basename($relativePath);

            // Skip metadata file
            if ($basename === 'poznote_attachments_metadata.json') {
                continue;
            }
            
            // Check if this file is named with an attachment ID (e.g., "abc123.jpg")
            // Extract ID without extension
            $filenameWithoutExt = pathinfo($basename, PATHINFO_FILENAME);
            
            // If we have a mapping for this ID, use the real filename
            $attachmentMetadata = $idToAttachmentMap[$filenameWithoutExt] ?? [];
            if (!empty($attachmentMetadata['filename'])) {
                $targetFilename = $attachmentMetadata['filename'];
            } else {
                // Otherwise, use the original basename (for backwards compatibility)
                $targetFilename = $basename;
            }
            
            $validation = poznoteValidateAttachmentFile($targetFilename, $filePath);
            if (!$validation['success']) {
                $skippedCount++;
                $sourcePath = 'attachments/' . str_replace('\\', '/', $relativePath);
                $skippedFiles[] = [
                    'source_path' => $sourcePath,
                    'target_filename' => $targetFilename,
                    'original_filename' => $attachmentMetadata['original_filename'] ?? '',
                    'note_id' => $attachmentMetadata['note_id'] ?? '',
                    'note_heading' => $attachmentMetadata['note_heading'] ?? '',
                    'reason' => $validation['error']
                ];
                error_log('Skipped blocked attachment during restore: ' . $sourcePath . ' -> ' . $targetFilename . ' - ' . $validation['error']);
                continue;
            }

            // Store on local disk or in the S3 bucket
            if (poznoteStoreAttachmentFromPath($filePath, $validation['filename'], $validation['mime_type'] ?? 'application/octet-stream')) {
                $importedCount++;
                $restoredFilenames[] = $validation['filename'];
            } else {
                // Disk full, bucket upload refused, ...: the file is in the
                // archive but could not be stored. Counted so the caller can
                // report a failed restore instead of a quietly partial one.
                $failedCount++;
                error_log('Failed to store attachment during restore: ' . $relativePath . ' -> ' . $validation['filename']);
            }
        }
    }

    return [
        'success' => true,
        'count' => $importedCount,
        'skipped' => $skippedCount,
        'failed' => $failedCount,
        'filenames' => $restoredFilenames,
        'skipped_files' => $skippedFiles
    ];
}

/**
 * Delete directory recursively
 */
function deleteDirectory($dir) {
    if (!is_dir($dir)) {
        return;
    }
    
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    
    foreach ($files as $fileinfo) {
        $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
        $todo($fileinfo->getRealPath());
    }
    
    rmdir($dir);
}

// Helper function to ensure proper permissions on data directory
function ensureDataPermissions() {
    if (isset($_SESSION['user_id'])) {
        require_once __DIR__ . '/users/UserDataManager.php';
        $dataManager = new UserDataManager($_SESSION['user_id']);
        $userDir = $dataManager->getUserBasePath();
        $dbPath = $dataManager->getUserDatabasePath();
        
        if (is_dir($userDir)) {
            if (function_exists('posix_getuid') && posix_getuid() === 0) {
                // Use shell command for recursive chown
                exec('chown -R www-data:www-data ' . escapeshellarg($userDir) . ' 2>/dev/null');
            }
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    } else {
        $dataDir = __DIR__ . '/data';
        if (is_dir($dataDir)) {
            // Recursively set ownership to match the data directory owner
            $dataOwner = fileowner($dataDir);
            $dataGroup = filegroup($dataDir);
            
            // Use shell command for recursive chown
            exec('chown -R ' . (int)$dataOwner . ':' . (int)$dataGroup . ' ' . escapeshellarg($dataDir) . ' 2>/dev/null');
            
            // Ensure database file has write permissions
            $dbPath = $dataDir . '/database/poznote.db';
            if (file_exists($dbPath)) {
                chmod($dbPath, 0664);
            }
        }
    }
}

/**
 * Get the complete folder path including parent folders
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return string The complete folder path (e.g., "Parent/Child")
 */
function getFolderPath($folder_id, $con) {
    static $cache = [];
    static $folderData = null;
    
    if ($folder_id === null || $folder_id === 0) {
        return 'Default';
    }
    
    // Return cached path if available
    if (isset($cache[$folder_id])) {
        return $cache[$folder_id];
    }
    
    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }
    
    $path = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;
    
    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        
        // Add folder name to the beginning of the path
        array_unshift($path, $folder['name']);
        
        // Move to parent
        $currentId = $folder['parent_id'];
        $depth++;
    }
    
    $result = !empty($path) ? implode('/', $path) : 'Default';
    $cache[$folder_id] = $result;
    return $result;
}

/**
 * Get the complete folder path as individual segments (root first)
 * @param int $folder_id The folder ID
 * @param PDO $con Database connection
 * @return array Array of ['id' => int, 'name' => string] from root folder down to the folder itself
 */
function getFolderPathSegments($folder_id, $con) {
    static $folderData = null;

    if ($folder_id === null || $folder_id === 0) {
        return [];
    }

    // Pre-load ALL folders on first call to avoid N+1 queries
    if ($folderData === null) {
        $folderData = [];
        try {
            $stmt = $con->query("SELECT id, name, parent_id FROM folders");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $folderData[(int)$row['id']] = [
                    'name' => $row['name'],
                    'parent_id' => $row['parent_id'] !== null ? (int)$row['parent_id'] : null
                ];
            }
        } catch (Exception $e) {
            $folderData = [];
        }
    }

    $segments = [];
    $currentId = (int)$folder_id;
    $maxDepth = 50; // Prevent infinite loops
    $depth = 0;

    while ($currentId !== null && isset($folderData[$currentId]) && $depth < $maxDepth) {
        $folder = $folderData[$currentId];
        array_unshift($segments, ['id' => $currentId, 'name' => $folder['name']]);
        $currentId = $folder['parent_id'];
        $depth++;
    }

    return $segments;
}

/**
 * Fix database inconsistencies in notes:
 * 1. Populates folder_id from legacy folder (TEXT) column.
 * 2. Re-generates search snippets (entry column) from physical files if empty.
 * 
 * @param PDO $con The database connection
 * @return array Results of the repair operation
 */
function repairDatabaseEntries($con) {
    if (!$con) return ['success' => false, 'error' => 'No database connection'];
    
    $fixedFolders = 0;
    $createdFolders = 0;
    $fixedEntries = 0;
    
    try {
        // --- PART 1: FOLDERS MIGRATION ---
        // Only repair notes that are NOT in trash to avoid re-creating deleted folders
        $stmt = $con->query("SELECT id, folder, workspace FROM entries WHERE folder IS NOT NULL AND folder != '' AND folder_id IS NULL AND trash = 0");
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($notes as $note) {
            $noteId = $note['id'];
            $folderName = $note['folder'];
            $workspace = $note['workspace'] ?: 'Poznote';
            
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? LIMIT 1");
            $checkStmt->execute([$folderName, $workspace]);
            $folder = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                $folderId = $folder['id'];
            } else {
                $insertStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                $insertStmt->execute([$folderName, $workspace]);
                $folderId = $con->lastInsertId();
                $createdFolders++;
            }
            
            $updateStmt = $con->prepare("UPDATE entries SET folder_id = ? WHERE id = ?");
            $updateStmt->execute([$folderId, $noteId]);
            $fixedFolders++;
        }

        // --- PART 2: EMPTY ENTRY SNIPPETS (FOR SEARCH) ---
        $stmt = $con->query("SELECT id, type FROM entries WHERE (entry IS NULL OR entry = '') AND trash = 0");
        $emptyNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($emptyNotes as $note) {
            $noteId = $note['id'];
            $type = $note['type'] ?: 'note';
            $filePath = getEntryFilename($noteId, $type);
            
            if (file_exists($filePath)) {
                $content = file_get_contents($filePath);
                if ($content !== false) {
                    // Extract a clean snippet for search
                    $snippet = cleanContentForSearch($content);
                    $snippet = strip_tags($snippet);
                    $snippet = mb_substr($snippet, 0, 500); // Limit to 500 chars for DB performance
                    
                    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$snippet, $noteId]);
                    $fixedEntries++;
                }
            }
        }
        return [
            'success' => true, 
            'folders_fixed' => $fixedFolders, 
            'folders_created' => $createdFolders,
            'entries_fixed' => $fixedEntries
        ];
    } catch (Exception $e) {
        error_log("Error in repairDatabaseEntries: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Unescape iframe HTML entities in content
 * This fixes notes that were created with HTML-escaped iframe tags
 * (e.g., &lt;iframe&gt; becomes <iframe>)
 *
 * Escaped tags are inert text for sanitizeHtml(), so anything re-emitted here
 * reaches the page unsanitized: the tag is rebuilt from an attribute
 * allow-list (poznoteRebuildMediaTag) and only for trusted iframe origins.
 * Anything else stays escaped.
 */
function unescapeIframesInHtml($content) {
    if (empty($content)) {
        return $content;
    }

    return preg_replace_callback('/&lt;iframe\s([\s\S]*?)&gt;\s*&lt;\/iframe&gt;/i', function($matches) {
        $attrs = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $tag = poznoteRebuildMediaTag('iframe', $attrs);
        // If not whitelisted, keep it escaped for security
        return $tag ?? $matches[0];
    }, $content);
}

/**
 * Unescape audio/video tags that were saved as escaped HTML
 * Keeps the escaped tag if the src is not a safe URL. Same allow-list
 * rebuild as iframes: no attribute is passed through verbatim.
 */
function unescapeMediaInHtml($content) {
    if (empty($content)) {
        return $content;
    }

    // Unescape iframes first (keeps existing behavior)
    $content = unescapeIframesInHtml($content);

    foreach (['audio', 'video'] as $tagName) {
        $content = preg_replace_callback('/&lt;' . $tagName . '\s([\s\S]*?)&gt;\s*&lt;\/' . $tagName . '&gt;/i', function($matches) use ($tagName) {
            $attrs = html_entity_decode($matches[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $tag = poznoteRebuildMediaTag($tagName, $attrs);
            return $tag ?? $matches[0];
        }, $content);
    }

    return $content;
}

/**
 * Resolve folder path to ID, optionally creating missing segments
 * 
 * @param string $workspace The workspace name
 * @param string $folderPath The full folder path (e.g., "A/B/C")
 * @param bool $createIfMissing Whether to create folders if they don't exist
 * @param PDO $con Database connection
 * @return int|null The resolved folder ID or null if not found/created
 */
function resolveFolderPathToId($workspace, $folderPath, $createIfMissing = false, $con = null) {
    if ($con === null) {
        global $con;
    }
    if (!$con) return null;

    $folderPath = trim($folderPath);
    if ($folderPath === '' || strtolower($folderPath) === 'default') return null;
    
    $segments = array_values(array_filter(array_map('trim', explode('/', $folderPath)), fn($s) => $s !== ''));
    if (empty($segments)) return null;
    
    $parentId = null;
    foreach ($segments as $seg) {
        $sql = "SELECT id FROM folders WHERE name = ? AND workspace = ?";
        $params = [$seg, $workspace];
        if ($parentId === null) {
            $sql .= " AND parent_id IS NULL";
        } else {
            $sql .= " AND parent_id = ?";
            $params[] = $parentId;
        }
        
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($row) {
            $parentId = (int)$row['id'];
        } elseif ($createIfMissing) {
            // Create the folder segment
            $stmt = $con->prepare("INSERT INTO folders (name, workspace, parent_id, created) VALUES (?, ?, ?, datetime('now'))");
            $stmt->execute([$seg, $workspace, $parentId]);
            $parentId = (int)$con->lastInsertId();
        } else {
            return null;
        }
    }
    
    return $parentId;
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * 
 * This function removes dangerous HTML tags and attributes that could be used
 * for Cross-Site Scripting (XSS) attacks while preserving safe formatting.
 * 
 * @param string $html The HTML content to sanitize
 * @return string The sanitized HTML content
 */
function sanitizeHtml($html) {
    if (empty($html)) {
        return $html;
    }
    
    // Allowed HTML tags (safe formatting tags)
    $allowedTags = [
        'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'blockquote', 'pre', 'code', 'hr',
        'img', 'figure', 'figcaption',
        'details', 'summary',
        'mark', 'small', 'sub', 'sup',
        'abbr', 'cite', 'q', 'time',
        'input', 'label', // For task lists
        'iframe', // For YouTube, Vimeo embeds (validated separately)
        'video', // For MP4 embeds
        'audio', // For audio embeds
        'button', 'i', // For Excalidraw buttons and icons
        'aside', // For callout/quote blocks
        'svg', 'path', 'rect', 'polyline' // For callout icons (SVG)
    ];
    
    // Allowed attributes per tag
    $allowedAttrs = [
        'a' => ['href', 'title', 'target', 'rel'],
        'img' => ['src', 'alt', 'title', 'width', 'height', 'data-is-excalidraw', 'data-excalidraw-note-id'],
        'td' => ['colspan', 'rowspan'],
        'th' => ['colspan', 'rowspan', 'scope'],
        'div' => ['class', 'data-tasklist-json', 'data-markdown-content', 'data-excalidraw', 'data-diagram-id', 'data-task-embed', 'contenteditable'],
        'span' => ['class'],
        'input' => ['type', 'checked', 'disabled'],
        'time' => ['datetime'],
        'blockquote' => ['cite'],
        'q' => ['cite'],
        'pre' => ['data-language', 'data-line-numbers', 'data-auto-language'],
        'code' => ['data-language', 'data-auto-language'],
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'title', 'sandbox', 'loading', 'referrerpolicy', 'style', 'class', 'scrolling', 'contenteditable', 'data-is-audio', 'data-audio-src', 'data-converted-from-audio'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'class', 'style', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'class', 'style', 'controls', 'muted', 'loop', 'autoplay'],
        'button' => ['class', 'data-action'],
        'svg' => ['viewBox', 'width', 'height', 'aria-hidden', 'fill', 'xmlns', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'path' => ['d', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'rect' => ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
        'polyline' => ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']
    ];
    
    // Global allowed attributes (safe for all tags)
    $globalAllowedAttrs = ['id', 'class', 'style'];
    
    // Dangerous patterns to remove
    $dangerousPatterns = [
        // Remove javascript: protocol
        '/javascript:/i',
        // Remove data: protocol (except for images which we'll handle separately)
        '/data:(?!image\/)/i',
        // Remove vbscript: protocol
        '/vbscript:/i'
    ];
    
    // Note: We don't do regex-based removal here because it's blind to context
    // (e.g., it would remove <script> even inside <code> blocks where it's legitimate)
    // Instead, we let DOMDocument handle everything as it understands HTML structure
    
    // Use DOMDocument for more precise sanitization
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->encoding = 'UTF-8';
    
    // Load HTML with UTF-8 encoding
    // Use HTML5 meta tag instead of XML declaration to avoid it appearing in output
    $wrappedHtml = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' . $html . '</body></html>';
    @$dom->loadHTML($wrappedHtml, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    
    $xpath = new DOMXPath($dom);

    // Heading anchors are runtime UI controls added by the outline panel.
    // They must never be persisted as note content.
    $runtimeHeadingAnchors = $xpath->query('//a[contains(concat(" ", normalize-space(@class), " "), " heading-anchor ") or @data-heading-anchor="true"]');
    foreach ($runtimeHeadingAnchors as $anchor) {
        if ($anchor->parentNode) {
            $anchor->parentNode->removeChild($anchor);
        }
    }

    // Embedded task-list widgets are runtime UI rebuilt by tasklist-embed.js
    // from the persisted marker; only the marker div and its fallback link
    // belong in stored content.
    $runtimeTaskEmbedWidgets = $xpath->query('//*[contains(concat(" ", normalize-space(@class), " "), " tasklist-embed-widget ")]');
    foreach ($runtimeTaskEmbedWidgets as $widget) {
        if ($widget->parentNode) {
            $widget->parentNode->removeChild($widget);
        }
    }
    
    // Remove all disallowed tags
    $allElements = $xpath->query('//body//*');
    $elementsToRemove = [];
    
    foreach ($allElements as $element) {
        $tagName = strtolower($element->tagName);
        
        // Check if this element is inside a <code> or <pre> block
        $isInCodeBlock = false;
        $parent = $element->parentNode;
        while ($parent && $parent->nodeType === XML_ELEMENT_NODE) {
            $parentTag = strtolower($parent->tagName);
            if ($parentTag === 'code' || $parentTag === 'pre') {
                $isInCodeBlock = true;
                break;
            }
            $parent = $parent->parentNode;
        }
        
        // If it's a dangerous tag inside a code block, encode it as text instead of removing
        if ($isInCodeBlock && in_array($tagName, ['script', 'iframe', 'object', 'embed', 'applet', 'form', 'style'])) {
            // Convert the element to text (encode it)
            $encodedTag = htmlspecialchars($element->ownerDocument->saveHTML($element), ENT_QUOTES, 'UTF-8');
            $textNode = $element->ownerDocument->createTextNode($encodedTag);
            $element->parentNode->replaceChild($textNode, $element);
            continue;
        }
        
        // If tag is not in allowed list, mark for removal
        if (!in_array($tagName, $allowedTags)) {
            $elementsToRemove[] = $element;
            continue;
        }
        
        // Check and sanitize attributes
        $attributesToRemove = [];
        foreach ($element->attributes as $attr) {
            $attrName = strtolower($attr->name);
            $attrValue = $attr->value;
            
            // Check if attribute is allowed for this tag
            $tagAllowedAttrs = $allowedAttrs[$tagName] ?? [];
            $isAllowed = in_array($attrName, $tagAllowedAttrs) || in_array($attrName, $globalAllowedAttrs);
            
            if (!$isAllowed) {
                $attributesToRemove[] = $attrName;
                continue;
            }
            
            // Check for dangerous patterns in attribute values
            foreach ($dangerousPatterns as $pattern) {
                if (preg_match($pattern, $attrValue)) {
                    $attributesToRemove[] = $attrName;
                    continue 2;
                }
            }
            
            // Special validation for href and src attributes
            if ($attrName === 'href' || $attrName === 'src') {
                // For iframes, validate that src is from trusted domains or local paths
                if ($tagName === 'iframe' && $attrName === 'src') {
                    // Strict host match against ALLOWED_IFRAME_DOMAINS, or a
                    // local/relative path (e.g., /audio_player.php)
                    if (!poznoteIframeSrcIsTrusted($attrValue)) {
                        // Not a trusted iframe source - mark entire element for removal
                        $elementsToRemove[] = $element;
                        break; // Exit attribute loop
                    }
                    continue;
                }
                
                // Allow http, https, mailto, and relative URLs
                // Allow data:image for images
                if ($attrName === 'src' && $tagName === 'img' && strpos($attrValue, 'data:image/') === 0) {
                    // Allow data:image URLs for images
                    continue;
                }
                
                if (!preg_match('/^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i', $attrValue) && 
                    strpos($attrValue, 'data:') !== 0) {
                    // If it doesn't start with allowed protocols, it might be relative - keep it
                    // but if it contains suspicious patterns, remove it
                    if (preg_match('/[<>"\']/', $attrValue)) {
                        $attributesToRemove[] = $attrName;
                    }
                }
            }
        }
        
        // Remove dangerous attributes
        foreach ($attributesToRemove as $attrName) {
            $element->removeAttribute($attrName);
        }
    }
    
    // Remove disallowed elements
    foreach ($elementsToRemove as $element) {
        if ($element->parentNode) {
            $element->parentNode->removeChild($element);
        }
    }
    
    // Get the sanitized HTML (only body content)
    $body = $dom->getElementsByTagName('body')->item(0);
    if ($body) {
        $sanitized = '';
        foreach ($body->childNodes as $child) {
            $sanitized .= $dom->saveHTML($child);
        }
    } else {
        $sanitized = $dom->saveHTML();
    }
    
    // Trim whitespace
    $sanitized = trim($sanitized);
    
    // Clean up any remaining dangerous patterns that might have been encoded
    $sanitized = str_replace(['&lt;script', '&lt;/script'], '', $sanitized);
    
    libxml_clear_errors();
    
    return $sanitized;
}

/**
 * Sanitize Markdown content to prevent XSS attacks
 * 
 * Unlike sanitizeHtml(), this function works on raw Markdown text without
 * using DOMDocument, which would mangle Markdown syntax characters like >.
 * It removes dangerous HTML patterns that could be embedded in Markdown
 * while preserving all Markdown syntax.
 * 
 * @param string $markdown The raw Markdown content to sanitize
 * @return string The sanitized Markdown content
 */
function sanitizeMarkdownContent($markdown) {
    if (empty($markdown)) {
        return $markdown;
    }

    // Remove <script> tags and their content
    $markdown = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $markdown);

    // Remove <style> tags and their content
    $markdown = preg_replace('/<style\b[^>]*>.*?<\/style>/is', '', $markdown);

    // Remove <object>, <embed>, <applet> tags and their content
    $markdown = preg_replace('/<(object|embed|applet)\b[^>]*>.*?<\/\1>/is', '', $markdown);
    $markdown = preg_replace('/<(object|embed|applet)\b[^>]*\/?>/is', '', $markdown);

    // Remove <form> tags and their content
    $markdown = preg_replace('/<form\b[^>]*>.*?<\/form>/is', '', $markdown);

    // Remove on* event handlers from any HTML tags embedded in markdown
    // ("/" is an attribute separator for browsers too: <details/onclick=...>)
    $markdown = preg_replace('/(<[^>]*)[\s\/]+on\w+\s*=\s*(["\']).*?\2/is', '$1', $markdown);
    $markdown = preg_replace('/(<[^>]*)[\s\/]+on\w+\s*=\s*[^\s>]*/is', '$1', $markdown);

    // Remove javascript: and vbscript: protocols from href/src attributes
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*javascript:/is', '$1=$2', $markdown);
    $markdown = preg_replace('/(href|src)\s*=\s*(["\'])\s*vbscript:/is', '$1=$2', $markdown);

    return $markdown;
}

/**
 * Gate access behind the SETTINGS_PASSWORD when configured.
 * Redirects to settings.php if the session has not been unlocked.
 */
function requireSettingsPassword() {
    if (!defined('SETTINGS_PASSWORD') || SETTINGS_PASSWORD === '') {
        return;
    }
    if (!empty($_SESSION['settings_password_authenticated'])) {
        return;
    }
    header('Location: ' . (strpos($_SERVER['SCRIPT_NAME'] ?? '', '/admin/') !== false ? '../' : '') . 'settings.php');
    exit;
}

/**
 * Build a short plain-text excerpt (or task preview) for a note card.
 * Shared by the dashboard and diary board views.
 * @return array{text: string, tasks: ?array, search: string, image: ?string}
 */
function buildNoteCardPreview($noteId, $type) {
    $file = getEntryFilename($noteId, $type);
    if (!is_readable($file)) {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return ['text' => '', 'tasks' => null, 'search' => '', 'image' => null];
    }

    if ($type === 'tasklist') {
        $json = normalizeTasklistJsonContent($raw);
        $items = json_decode($json !== '' ? $json : $raw, true);
        $tasks = [];
        $taskSearch = [];
        if (is_array($items)) {
            foreach ($items as $item) {
                if (!is_array($item)) continue;
                $label = trim((string)($item['text'] ?? ''));
                if ($label === '') continue;
                $taskSearch[] = $label;
                if (count($tasks) < 4) {
                    $tasks[] = ['text' => $label, 'done' => !empty($item['completed'])];
                }
            }
        }
        return ['text' => '', 'tasks' => $tasks, 'search' => implode(' ', $taskSearch), 'image' => null];
    }

    // First image of the note, shown as a card thumbnail. Only attachment
    // URLs, http(s) sources and small data URIs are kept (a multi-MB base64
    // image would bloat the page's embedded JSON).
    $image = null;
    if ($type === 'markdown') {
        if (preg_match('/!\[[^\]]*\]\(\s*([^)\s]+)/', $raw, $im)) {
            $image = $im[1];
        }
    } else {
        if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $raw, $im)) {
            $image = html_entity_decode($im[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    if ($image !== null) {
        $isSmallDataUri = stripos($image, 'data:image/') === 0 && strlen($image) < 65536;
        if (!$isSmallDataUri && !preg_match('#^(/?api/v1/notes/\d+/attachments/|https?://|attachments/)#i', $image)) {
            $image = null;
        }
    }

    if ($type === 'markdown') {
        $text = preg_replace('/```[^\n]*\n([\s\S]*?)```/', ' $1 ', $raw);
        $text = preg_replace('/^#{1,6}\s+/m', '', $text);
        $text = preg_replace('/!\[[^\]]*\]\([^)]*\)/', ' ', $text);
        $text = preg_replace('/\[([^\]]*)\]\([^)]*\)/', '$1', $text);
        $text = str_replace(['**', '__', '*', '`', '> '], ' ', $text);
    } else {
        // HTML notes: turn line-breaking tags into newlines before stripping
        // so the excerpt keeps the note's line structure.
        $text = preg_replace('/<br\s*\/?>/i', "\n", $raw);
        $text = preg_replace('/<\/?(p|div|li|h[1-6]|tr|blockquote|pre|ul|ol|table)(\s[^>]*)?>/i', "\n", $text);
    }

    $text = strip_tags($text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = str_replace("\r", '', $text);
    // Collapse spaces but keep single line breaks: views that want them render
    // the excerpt with white-space: pre-line (diary), others show spaces.
    $text = preg_replace('/[^\S\n]+/u', ' ', $text);
    $text = preg_replace('/ ?\n ?/u', "\n", $text);
    $text = preg_replace('/\n{2,}/u', "\n", $text);
    $text = trim((string)$text);
    $previewText = $text;
    if ($previewText !== '' && mb_strlen($previewText, 'UTF-8') > 220) {
        $previewText = rtrim(mb_substr($previewText, 0, 220, 'UTF-8')) . '…';
    }

    $search = preg_replace('/\s+/u', ' ', $text);
    return ['text' => $previewText, 'tasks' => null, 'search' => $search, 'image' => $image];
}

/**
 * Checklist items of a regular (HTML or markdown) note, in document order,
 * as the global tasks page lists them next to the tasklist notes.
 *
 * Each item is ['index' => int, 'text' => string, 'completed' => bool]. The
 * index is what the client uses to toggle the item back in the note source,
 * so it must be computed the same way on both sides:
 *   - HTML notes: the ordinal of the item's <input class="checklist-checkbox">
 *     among all such inputs of the note (js: input.checklist-checkbox);
 *   - markdown notes: the 0-based line number of the "- [ ] text" line.
 * Items with an empty label are skipped but still consume an index.
 *
 * @return array<int, array{index:int, text:string, completed:bool}>
 */
function extractNoteChecklistItems(string $content, string $type): array {
    if ($type === 'markdown') {
        return extractMarkdownChecklistItems($content);
    }
    if ($type === 'note') {
        return extractHtmlChecklistItems($content);
    }
    return [];
}

/**
 * Checklist items of an HTML note (see extractNoteChecklistItems). The
 * checkbox markup is the one js/checklist.js writes: the checked state lives
 * in data-checked when present (the editor keeps it in sync), otherwise in
 * the checked attribute (the sanitizer only persists the latter). The item
 * label is the text following the checkbox up to the end of its <li>, the
 * start of a nested list, or the next checkbox.
 */
function extractHtmlChecklistItems(string $html): array {
    if ($html === '' || stripos($html, 'checklist-checkbox') === false) {
        return [];
    }
    if (!preg_match_all('/<input\b[^>]*>/i', $html, $matches, PREG_OFFSET_CAPTURE)) {
        return [];
    }

    $items = [];
    $index = 0;
    foreach ($matches[0] as $match) {
        $tag = $match[0];
        if (!preg_match('/\bclass\s*=\s*["\']([^"\']*)["\']/i', $tag, $classMatch)
            || !preg_match('/(?:^|\s)checklist-checkbox(?:\s|$)/', $classMatch[1])) {
            continue;
        }

        $rest = substr($html, $match[1] + strlen($tag));
        $end = preg_match('/<(?:ul|ol)\b|<\/li\s*>|<input\b/i', $rest, $endMatch, PREG_OFFSET_CAPTURE)
            ? $endMatch[0][1]
            : strlen($rest);
        $text = html_entity_decode(strip_tags(substr($rest, 0, $end)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string)preg_replace('/\s+/u', ' ', str_replace(["\u{200B}", "\u{00A0}"], ' ', $text)));

        if (preg_match('/\sdata-checked=["\']?([01])/i', $tag, $dataChecked)) {
            $completed = $dataChecked[1] === '1';
        } else {
            $completed = (bool)preg_match('/\schecked(?=[\s>=\/])/i', $tag);
        }

        if ($text !== '') {
            $items[] = ['index' => $index, 'text' => $text, 'completed' => $completed];
        }
        $index++;
    }

    return $items;
}

/**
 * Task list items of a markdown note (see extractNoteChecklistItems): every
 * "- [ ] text" / "- [x] text" line outside fenced code blocks, matched with
 * the same pattern as markdown_parser.php. The index is the line number in
 * the "\n"-split source, which is how the client addresses the line again.
 */
function extractMarkdownChecklistItems(string $markdown): array {
    if ($markdown === '' || (strpos($markdown, '[ ]') === false && stripos($markdown, '[x]') === false)) {
        return [];
    }

    $items = [];
    $inFence = false;
    $lines = explode("\n", $markdown);
    foreach ($lines as $lineNumber => $rawLine) {
        $line = rtrim($rawLine, "\r");
        if (preg_match('/^\s*(```|~~~)/', $line)) {
            $inFence = !$inFence;
            continue;
        }
        if ($inFence) {
            continue;
        }
        if (!preg_match('/^(\s*)[\*\-\+]\s+\[([ xX])\]\s+(.+)$/', $line, $m)) {
            continue;
        }
        // Plain-text label: links keep their text, emphasis/code markers go
        $text = preg_replace('/!?\[([^\]]*)\]\([^)]*\)/', '$1', $m[3]);
        $text = str_replace(['**', '__', '~~', '`'], '', (string)$text);
        $text = trim((string)preg_replace('/\s+/u', ' ', $text));
        if ($text === '') {
            continue;
        }
        $items[] = [
            'index'     => (int)$lineNumber,
            'text'      => $text,
            'completed' => strtolower($m[2]) === 'x',
        ];
    }

    return $items;
}

/**
 * Render the view controls used by the dashboard and diary boards, next to
 * the filter bar. $prefix namespaces the localStorage keys so each page
 * remembers its own settings. A single toggle cycles through the views
 * (grid small/medium/large, then list); the columns button caps the grid
 * width and is hidden in list layout (board-view-menu.js drives both).
 */
function renderBoardViewMenu(string $prefix) {
    $idPrefix = htmlspecialchars($prefix, ENT_QUOTES, 'UTF-8');
    echo '<div class="board-view-controls" data-view-prefix="' . $idPrefix . '">' .
        '<button type="button" id="' . $idPrefix . 'ViewLayoutBtn" class="board-view-btn board-view-layout-toggle"' .
            ' data-label-grid="' . t_h('dashboard.view.layout_grid', [], 'Grid') . '"' .
            ' data-label-list="' . t_h('dashboard.view.layout_list', [], 'List') . '"' .
            ' data-label-small="' . t_h('dashboard.view.size_small', [], 'Small') . '"' .
            ' data-label-medium="' . t_h('dashboard.view.size_medium', [], 'Medium') . '"' .
            ' data-label-large="' . t_h('dashboard.view.size_large', [], 'Large') . '">' .
            '<i class="lucide lucide-grid"></i>' .
            '<i class="lucide lucide-layout-list"></i>' .
            '<span class="board-view-size-letter"></span>' .
        '</button>' .
        '<button type="button" id="' . $idPrefix . 'ViewColumnsBtn" class="board-view-btn board-view-columns-btn"' .
            ' data-label-columns="' . t_h('dashboard.view.columns', [], 'Maximum columns') . '">' .
            '<span class="board-view-columns-value"></span>' .
        '</button>' .
    '</div>';
}

/**
 * Note type used when creating a diary entry: 'markdown' when the
 * diary_default_note_type setting asks for it, 'note' (HTML) otherwise.
 */
function getDiaryDefaultNoteType(): string {
    return trim((string)getSetting('diary_default_note_type', '')) === 'markdown' ? 'markdown' : 'note';
}

/**
 * Title formats a diary entry can use, keyed by the diary_date_format setting.
 * Each entry holds the PHP date() pattern used to build a title and the regex
 * used to recognize one, with the (year, month, day) capture groups named so
 * the order of the format does not matter to the caller.
 *
 * Every format is always recognized, whatever the setting: changing the
 * preference must not orphan the entries titled with the previous one.
 */
function getDiaryDateFormats(): array {
    return [
        'ymd'       => ['pattern' => 'Y-m-d',  'regex' => '/^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/'],
        'dmy_slash' => ['pattern' => 'd/m/Y',  'regex' => '/^(?<d>\d{2})\/(?<m>\d{2})\/(?<y>\d{4})$/'],
        'mdy_slash' => ['pattern' => 'm/d/Y',  'regex' => '/^(?<m>\d{2})\/(?<d>\d{2})\/(?<y>\d{4})$/'],
        'dmy_dot'   => ['pattern' => 'd.m.Y',  'regex' => '/^(?<d>\d{2})\.(?<m>\d{2})\.(?<y>\d{4})$/'],
        'ymd_slash' => ['pattern' => 'Y/m/d',  'regex' => '/^(?<y>\d{4})\/(?<m>\d{2})\/(?<d>\d{2})$/'],
    ];
}

/**
 * Tokens a custom diary date pattern accepts, with the PHP date() letter they
 * produce and the regex fragment recognizing them again. Longest token first:
 * the compiler consumes greedily, so YYYY must be tried before YY.
 *
 * Only date tokens are offered. A diary title designates a day, so a time part
 * would make two entries of the same day look like different days.
 */
function getDiaryDateCustomTokens(): array {
    return [
        'YYYY' => ['php' => 'Y', 'regex' => '(?<y>\d{4})', 'part' => 'y'],
        'YY'   => ['php' => 'y', 'regex' => '(?<y2>\d{2})', 'part' => 'y'],
        'MMMM' => ['php' => 'F', 'regex' => '(?<mn>[^\d\/.,_\-\s]+)', 'part' => 'm'],
        'MMM'  => ['php' => 'M', 'regex' => '(?<ms>[^\d\/.,_\-\s]+)', 'part' => 'm'],
        'MM'   => ['php' => 'm', 'regex' => '(?<m>\d{2})', 'part' => 'm'],
        'DD'   => ['php' => 'd', 'regex' => '(?<d>\d{2})', 'part' => 'd'],
    ];
}

/**
 * Render the legend of a custom date pattern under its input: the tokens stay
 * literal because the compiler matches them verbatim, only their meaning is
 * translated. $group is 'date_time_format' or 'diary_date_format'.
 */
function renderDateFormatTokenLegend(string $group): string {
    $dict = loadI18nDictionary(getUserLanguage());
    $en = loadI18nDictionary('en');
    $path = ['modals', $group, 'tokens'];

    $tokens = $dict;
    foreach ($path as $part) {
        $tokens = is_array($tokens) && isset($tokens[$part]) ? $tokens[$part] : null;
    }
    if (!is_array($tokens) || empty($tokens)) {
        $tokens = $en;
        foreach ($path as $part) {
            $tokens = is_array($tokens) && isset($tokens[$part]) ? $tokens[$part] : null;
        }
    }
    if (!is_array($tokens) || empty($tokens)) {
        return '';
    }

    $html = '<dl class="date-format-tokens">';
    foreach ($tokens as $token => $meaning) {
        $html .= '<dt><code>' . htmlspecialchars((string)$token, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code></dt>'
               . '<dd>' . htmlspecialchars((string)$meaning, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</dd>';
    }
    $html .= '</dl>';

    return $html;
}

function isCustomDiaryDateFormat($format): bool {
    return is_string($format) && strpos($format, 'custom:') === 0;
}

function getCustomDiaryDatePattern($format): string {
    return trim(substr((string)$format, 7));
}

/**
 * Compile a custom pattern into ['pattern' => <php date()>, 'regex' => <parser>],
 * or null when it could never round-trip. A diary title is an identifier, not
 * just a label: it must rebuild an unambiguous day, so a pattern is rejected
 * unless it carries a year, a month and a day exactly once each.
 */
function compileDiaryDateCustomFormat(string $pattern): ?array {
    $pattern = trim($pattern);
    if ($pattern === '' || strlen($pattern) > 80) return null;
    // Same character class as the date & time custom format, minus ':' since a
    // diary title carries no time part.
    if (!preg_match('/^[A-Za-z0-9\s\/.,_\-()]+$/', $pattern)) return null;

    $tokens = getDiaryDateCustomTokens();
    $php = '';
    $regex = '';
    $seen = [];
    $length = strlen($pattern);

    for ($i = 0; $i < $length; $i++) {
        $matched = false;
        foreach ($tokens as $token => $spec) {
            $tokenLength = strlen($token);
            if (substr($pattern, $i, $tokenLength) === $token) {
                // A part repeated twice (e.g. "DD-DD") would build a regex with
                // duplicate group names, and means nothing as a date anyway.
                if (isset($seen[$spec['part']])) return null;
                $seen[$spec['part']] = true;
                $php .= $spec['php'];
                $regex .= $spec['regex'];
                $i += $tokenLength - 1;
                $matched = true;
                break;
            }
        }
        if ($matched) continue;

        $char = $pattern[$i];
        // Literal text: escaped for date() so it is not read as a format letter,
        // and quoted for the regex.
        $php .= ctype_alpha($char) ? '\\' . $char : $char;
        $regex .= preg_quote($char, '/');
    }

    if (!isset($seen['y']) || !isset($seen['m']) || !isset($seen['d'])) {
        return null;
    }

    return ['pattern' => $php, 'regex' => '/^' . $regex . '$/u'];
}

/**
 * The diary_date_format setting as stored: a key of getDiaryDateFormats(), or
 * 'custom:<pattern>' when a valid custom pattern was saved. Falls back to
 * 'ymd' for anything unknown or malformed.
 */
function getDiaryDateFormat(): string {
    $format = trim((string)getSetting('diary_date_format', ''));
    if (isCustomDiaryDateFormat($format)
        && compileDiaryDateCustomFormat(getCustomDiaryDatePattern($format)) !== null) {
        return $format;
    }
    return array_key_exists($format, getDiaryDateFormats()) ? $format : 'ymd';
}

/**
 * The format spec (['pattern' => ..., 'regex' => ...]) currently in use.
 */
function getDiaryDateFormatSpec(): array {
    $format = getDiaryDateFormat();
    if (isCustomDiaryDateFormat($format)) {
        $compiled = compileDiaryDateCustomFormat(getCustomDiaryDatePattern($format));
        if ($compiled !== null) return $compiled;
    }
    $formats = getDiaryDateFormats();
    return $formats[$format] ?? $formats['ymd'];
}

/**
 * PHP date() pattern used to title new diary entries.
 */
function getDiaryDateFormatPattern(): string {
    return getDiaryDateFormatSpec()['pattern'];
}

/**
 * Title of the diary entry for a day, in the configured format.
 * $date is a DateTimeInterface or a 'YYYY-MM-DD' string.
 */
function formatDiaryEntryTitle($date): string {
    if (!($date instanceof DateTimeInterface)) {
        $parsed = DateTime::createFromFormat('!Y-m-d', (string)$date);
        if ($parsed === false) return (string)$date;
        $date = $parsed;
    }
    return $date->format(getDiaryDateFormatPattern());
}

/**
 * Month number a MMMM/MMM capture designates (1-12), or 0 when the name
 * belongs to no month. Matched against the month names of the active locale
 * as date() would render them, so parsing mirrors formatting.
 */
function diaryMonthNameToNumber(string $name): int {
    $name = mb_strtolower(trim($name));
    if ($name === '') return 0;
    for ($month = 1; $month <= 12; $month++) {
        $ref = new DateTime(sprintf('2000-%02d-01', $month));
        if (mb_strtolower($ref->format('F')) === $name
            || mb_strtolower($ref->format('M')) === $name) {
            return $month;
        }
    }
    return 0;
}

/**
 * Custom patterns this account has titled entries with, most recent first.
 * Built-in formats are always recognized, but a custom one is only known while
 * it is configured, so every pattern ever saved is remembered here: switching
 * away from a custom format must not orphan the entries written under it.
 */
function getDiaryDateFormatHistory(): array {
    $raw = trim((string)getSetting('diary_date_format_history', ''));
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) return [];

    $patterns = [];
    foreach ($decoded as $pattern) {
        if (is_string($pattern) && compileDiaryDateCustomFormat($pattern) !== null) {
            $patterns[] = $pattern;
        }
    }
    return $patterns;
}

/**
 * The history value to store once $pattern has been used, as JSON. Keeps the
 * most recent patterns; the cap only bounds the stored value, as each
 * remembered pattern costs one regex per title parsed. Returns null when there
 * is nothing to record (invalid pattern, or already the most recent one).
 */
function buildDiaryDateFormatHistory(string $pattern): ?string {
    $pattern = trim($pattern);
    if ($pattern === '' || compileDiaryDateCustomFormat($pattern) === null) return null;

    $history = getDiaryDateFormatHistory();
    if (isset($history[0]) && $history[0] === $pattern) return null;

    // Re-saving a known pattern just moves it back to the front.
    $history = array_values(array_filter($history, function ($known) use ($pattern) {
        return $known !== $pattern;
    }));
    array_unshift($history, $pattern);

    return json_encode(array_slice($history, 0, 10));
}

/**
 * The 'YYYY-MM-DD' day a diary title designates, or null when the title is not
 * a date in any supported format. Ambiguous d/m vs m/d titles resolve to the
 * configured format first, so 03/04/2026 keeps the meaning the user picked.
 *
 * Every built-in format is always tried, plus the configured custom one and
 * every custom pattern used before it: changing the preference must not orphan
 * entries titled with the previous one.
 */
function parseDiaryEntryTitle(string $heading): ?string {
    $heading = trim($heading);
    if ($heading === '') return null;

    // The configured format wins ties, then the built-ins in declaration order,
    // then the custom patterns previously used.
    $ordered = [getDiaryDateFormatSpec()];
    foreach (getDiaryDateFormats() as $format) {
        $ordered[] = $format;
    }
    foreach (getDiaryDateFormatHistory() as $pattern) {
        $compiled = compileDiaryDateCustomFormat($pattern);
        if ($compiled !== null) $ordered[] = $compiled;
    }

    foreach ($ordered as $format) {
        if (!preg_match($format['regex'], $heading, $m)) continue;

        // Two-digit years follow date()'s 'y' round-trip: 70-99 => 1970-1999.
        if (isset($m['y']) && $m['y'] !== '') {
            $year = (int)$m['y'];
        } elseif (isset($m['y2']) && $m['y2'] !== '') {
            $year = (int)$m['y2'];
            $year += $year >= 70 ? 1900 : 2000;
        } else {
            continue;
        }

        if (isset($m['m']) && $m['m'] !== '') {
            $month = (int)$m['m'];
        } elseif (isset($m['mn']) && $m['mn'] !== '') {
            $month = diaryMonthNameToNumber($m['mn']);
        } elseif (isset($m['ms']) && $m['ms'] !== '') {
            $month = diaryMonthNameToNumber($m['ms']);
        } else {
            continue;
        }

        $day = isset($m['d']) ? (int)$m['d'] : 0;

        if ($month > 0 && checkdate($month, $day, $year)) {
            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }
    }
    return null;
}

/**
 * Name of the root diary folder. The diary_folder setting wins; otherwise the
 * localized default for the user's language. If a root folder created under
 * another language's default (or the historical "Diary") already exists in
 * the workspace, it keeps being used so the journal is not split in two.
 */
function getDiaryRootFolderName(?PDO $con = null, ?string $workspace = null) {
    $name = trim((string)getSetting('diary_folder', ''));
    if ($name !== '') return $name;

    $localized = trim((string)t('diary.folder_name', [], 'Diary'));
    if ($localized === '') $localized = 'Diary';

    if ($con !== null && $workspace !== null) {
        // All localized defaults (must match diary.folder_name in src/i18n/)
        $candidates = array_values(array_unique(array_merge(
            [$localized],
            ['Diary', 'Journal', 'Tagebuch', 'Diario', 'Diário', 'Дневник', '日记']
        )));
        $placeholders = implode(',', array_fill(0, count($candidates), '?'));
        $stmt = $con->prepare("SELECT name FROM folders WHERE name IN ($placeholders) AND workspace = ? AND parent_id IS NULL");
        $stmt->execute(array_merge($candidates, [$workspace]));
        $existing = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($candidates as $candidate) {
            if (in_array($candidate, $existing, true)) return $candidate;
        }
    }
    return $localized;
}

/**
 * All diaries of a workspace: the root folders flagged is_diary, ordered like
 * the sidebar (explicit display_order first, then alphabetically).
 * Lazy migration: when no folder is flagged yet, the historical name-matched
 * diary root (see getDiaryRootFolderName) is flagged once and returned, so
 * pre-existing journals keep working without a manual step.
 * @return array<int, array{id: int, name: string}>
 */
function getDiaryRoots(PDO $con, string $workspace): array {
    $sql = "SELECT id, name FROM folders WHERE is_diary = 1 AND workspace = ? AND parent_id IS NULL" .
        " ORDER BY (CASE WHEN display_order > 0 THEN display_order ELSE 999999 END), name COLLATE NOCASE";
    $stmt = $con->prepare($sql);
    $stmt->execute([$workspace]);
    $roots = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $roots[] = ['id' => (int)$row['id'], 'name' => (string)$row['name']];
    }
    if (!empty($roots)) {
        return $roots;
    }

    $legacyName = getDiaryRootFolderName($con, $workspace);
    $stmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? AND parent_id IS NULL");
    $stmt->execute([$legacyName, $workspace]);
    $legacyId = $stmt->fetchColumn();
    if ($legacyId === false) {
        return [];
    }
    $con->prepare("UPDATE folders SET is_diary = 1 WHERE id = ?")->execute([(int)$legacyId]);
    return [['id' => (int)$legacyId, 'name' => $legacyName]];
}

/**
 * The diary a folder belongs to: the flagged root reached by walking up the
 * parent chain, or null when the folder is outside every diary subtree.
 * @return array{id: int, name: string}|null
 */
function findDiaryRootForFolder(PDO $con, string $workspace, int $folderId): ?array {
    $roots = getDiaryRoots($con, $workspace);
    if (empty($roots)) {
        return null;
    }
    $rootsById = array_column($roots, null, 'id');
    $current = $folderId;
    $guard = 0;
    while ($guard++ < 100) {
        if (isset($rootsById[$current])) {
            return $rootsById[$current];
        }
        $stmt = $con->prepare("SELECT parent_id FROM folders WHERE id = ? AND workspace = ?");
        $stmt->execute([$current, $workspace]);
        $parent = $stmt->fetchColumn();
        if ($parent === false || $parent === null) {
            return null;
        }
        $current = (int)$parent;
    }
    return null;
}

/**
 * Ids of every folder in the diary subtrees (Diary/YYYY/MM ...) of a
 * workspace: all diaries by default, one when $rootId is given. Returns an
 * empty array when no diary folder exists yet.
 * @return int[]
 */
function getDiaryFolderIds(PDO $con, string $workspace, ?int $rootId = null): array {
    $roots = getDiaryRoots($con, $workspace);
    if ($rootId !== null) {
        $roots = array_values(array_filter($roots, fn($r) => $r['id'] === $rootId));
    }
    if (empty($roots)) {
        return [];
    }

    $stmt = $con->prepare("SELECT id, parent_id FROM folders WHERE workspace = ?");
    $stmt->execute([$workspace]);
    $childrenByParent = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $parent = $row['parent_id'] !== null ? (int)$row['parent_id'] : 0;
        $childrenByParent[$parent][] = (int)$row['id'];
    }

    $diaryFolderIds = [];
    $queue = array_column($roots, 'id');
    $diaryFolderIds = $queue;
    while ($queue) {
        $current = array_shift($queue);
        foreach ($childrenByParent[$current] ?? [] as $childId) {
            $diaryFolderIds[] = $childId;
            $queue[] = $childId;
        }
    }
    return $diaryFolderIds;
}

/**
 * Id of the diary entry for the given YYYY-MM-DD date, or null. The title is
 * matched through parseDiaryEntryTitle, so an entry written under a previously
 * configured title format is still found after the format changed.
 * Searches the whole diary subtree so entries keep working after being
 * re-dated (renamed) or left in an older month folder. Scoped to a single
 * diary when $rootId is given, otherwise the first match across all diaries.
 */
function findDiaryEntryIdForDate(PDO $con, string $workspace, string $date, ?int $rootId = null): ?int {
    $folderIds = getDiaryFolderIds($con, $workspace, $rootId);
    if (empty($folderIds)) {
        return null;
    }
    $placeholders = implode(',', array_fill(0, count($folderIds), '?'));
    $stmt = $con->prepare(
        "SELECT id, heading FROM entries WHERE trash = 0 AND folder_id IN ($placeholders) AND workspace = ?" .
        " ORDER BY id ASC"
    );
    $stmt->execute(array_merge($folderIds, [$workspace]));
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (parseDiaryEntryTitle((string)$row['heading']) === $date) {
            return (int)$row['id'];
        }
    }
    return null;
}

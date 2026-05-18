<?php
/**
 * Shared helper functions for public note and folder pages.
 * Used by public_note.php and public_folder.php.
 */

function getPublicAppPathPrefix() {
    $scriptDir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/\\');
    if ($scriptDir === '' || $scriptDir === '.') {
        return '';
    }

    return $scriptDir;
}

function buildPublicAppHref($path) {
    if ($path === '') {
        return getPublicAppPathPrefix() . '/';
    }

    if (preg_match('#^(?:https?:)?//#i', $path)) {
        return $path;
    }

    return getPublicAppPathPrefix() . '/' . ltrim($path, '/');
}

function getVersionedPublicAppAssetHref($relativePath) {
    $relativePath = ltrim((string)$relativePath, '/');
    $href = getPublicAppPathPrefix() . '/' . $relativePath;
    $path = __DIR__ . '/' . $relativePath;

    if (file_exists($path)) {
        $href .= '?v=' . filemtime($path);
    }

    return $href;
}

function escapePublicStatusText($text) {
    $decoded = html_entity_decode((string)$text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return htmlspecialchars($decoded, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function normalizePublicForcedTheme($theme): ?string {
    $theme = strtolower(trim((string)$theme));
    return in_array($theme, ['dark', 'light'], true) ? $theme : null;
}

function renderPublicForcedThemeScript($theme): void {
    $theme = normalizePublicForcedTheme($theme);
    if ($theme === null) {
        return;
    }

    echo '<script>window.__poznoteForcedTheme=' . json_encode($theme, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) . ';</script>' . "\n";
}

function getPublicHtmlAttributeValue(string $attrs, string $name): string {
    $pattern = '/(?:^|\s)' . preg_quote($name, '/') . '\s*=\s*(["\'])(.*?)\1/is';
    if (!preg_match($pattern, $attrs, $matches)) {
        return '';
    }

    return html_entity_decode($matches[2], ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

function buildPublicAudioAttachmentUrlFromPlayerSrc(string $playerSrc): string {
    $decodedSrc = html_entity_decode(trim($playerSrc), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($decodedSrc === '') {
        return '';
    }

    $parts = parse_url($decodedSrc);
    $path = $parts['path'] ?? '';
    if ($path === '' || !preg_match('#(?:^|/+)audio_player\.php$#i', $path)) {
        return '';
    }

    parse_str($parts['query'] ?? '', $query);
    $noteId = isset($query['note']) ? (int)$query['note'] : 0;
    $attachmentId = isset($query['attachment']) ? trim((string)$query['attachment']) : '';
    if ($noteId <= 0 || $attachmentId === '') {
        return '';
    }

    unset($query['note'], $query['attachment']);

    $url = '/api/v1/notes/' . rawurlencode((string)$noteId) . '/attachments/' . rawurlencode($attachmentId);
    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    return $url;
}

function buildPublicAudioTagFromIframeAttrs(string $attrs): ?string {
    $decodedAttrs = html_entity_decode($attrs, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $classAttr = getPublicHtmlAttributeValue($decodedAttrs, 'class');
    $isAudioEmbed = stripos($decodedAttrs, 'data-is-audio') !== false
        || preg_match('/(?:^|\s)note-audio-embed(?:\s|$)/i', $classAttr);

    if (!$isAudioEmbed) {
        return null;
    }

    $audioSrc = getPublicHtmlAttributeValue($decodedAttrs, 'data-audio-src');
    if ($audioSrc === '') {
        $audioSrc = buildPublicAudioAttachmentUrlFromPlayerSrc(getPublicHtmlAttributeValue($decodedAttrs, 'src'));
    }

    if ($audioSrc === '') {
        return null;
    }

    return '<audio controls preload="metadata" src="' . htmlspecialchars($audioSrc, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"></audio>';
}

function replacePublicAudioEmbedIframes(string $content): string {
    if ($content === '') {
        return $content;
    }

    $replaceCallback = function(array $matches): string {
        $audioTag = buildPublicAudioTagFromIframeAttrs($matches[1] ?? '');
        return $audioTag !== null ? $audioTag : $matches[0];
    };

    $content = preg_replace_callback('/<iframe\b([^>]*)>\s*<\/iframe>/is', $replaceCallback, $content);

    return preg_replace_callback('/&lt;iframe\b([\s\S]*?)&gt;\s*&lt;\/iframe&gt;/i', $replaceCallback, $content);
}

function renderPublicStatusPage($currentLang, array $options = []) {
    http_response_code($options['status'] ?? 403);

    $statusStylesheetHref = getVersionedPublicAppAssetHref('css/public_folder.css');
    $themeInitHref = getVersionedPublicAppAssetHref('js/theme-init.js');
    $title = $options['title'] ?? t_h('common.error', [], 'Error', $currentLang);
    $message = $options['message'] ?? '';
    $hint = $options['hint'] ?? '';
    $actions = $options['actions'] ?? [];
    $forcedTheme = normalizePublicForcedTheme($options['theme'] ?? null);
    ?>
    <!doctype html>
    <html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <title><?php echo escapePublicStatusText($title); ?> - Poznote</title>
        <?php renderPublicForcedThemeScript($forcedTheme); ?>
        <script src="<?php echo htmlspecialchars($themeInitHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"></script>
        <link rel="stylesheet" href="<?php echo htmlspecialchars($statusStylesheetHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
    </head>
    <body class="status-page-body">
        <div class="status-page-shell">
            <main class="status-card" role="main">
                <h1><?php echo escapePublicStatusText($title); ?></h1>
                <p class="status-card-message"><?php echo escapePublicStatusText($message); ?></p>

                <?php if ($hint !== ''): ?>
                    <p class="status-card-hint"><?php echo escapePublicStatusText($hint); ?></p>
                <?php endif; ?>

                <?php if (!empty($actions)): ?>
                    <div class="status-card-actions">
                        <?php foreach ($actions as $action): ?>
                            <a
                                href="<?php echo htmlspecialchars(buildPublicAppHref($action['href']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>"
                                class="status-card-action<?php echo !empty($action['secondary']) ? ' secondary' : ''; ?>"
                            >
                                <?php echo escapePublicStatusText($action['label']); ?>
                            </a>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </main>
        </div>
    </body>
    </html>
    <?php
    exit;
}

function renderLoginRequiredPage($currentLang) {
    renderPublicStatusPage($currentLang, [
        'status' => 403,
        'icon' => '🔒',
        'badge' => t_h('public.login_required_title', [], 'Login Required', $currentLang),
        'title' => t_h('public.login_required_title', [], 'Login Required', $currentLang),
        'message' => t_h('public.login_required_message', [], 'This content is restricted to specific users. Please log in to access it.', $currentLang),
        'hint' => t_h('public.restricted_help', [], 'When restricted, only the listed users can access this share after logging in.', $currentLang),
        'actions' => [
            [
                'href' => '/login.php',
                'label' => t_h('common.login.button', [], 'Log in', $currentLang),
            ],
            [
                'href' => '/index.php',
                'label' => t_h('common.back_to_home', [], 'Dashboard', $currentLang),
                'secondary' => true,
            ],
        ],
    ]);
}

function renderAccessDeniedPage($currentLang) {
    renderPublicStatusPage($currentLang, [
        'status' => 403,
        'icon' => '⛔',
        'badge' => t_h('public.access_denied_title', [], 'Access Denied', $currentLang),
        'title' => t_h('public.access_denied_title', [], 'Access Denied', $currentLang),
        'message' => t_h('public.access_denied_message', [], 'You do not have permission to view this content.', $currentLang),
        'hint' => t_h('public.shared_note_not_found_or_denied', [], 'Shared note not found or access denied. This can happen after a restore. An administrator may need to rebuild the master database in Settings > Administration Tools to repair shared links.', $currentLang),
        'actions' => [
            [
                'href' => '/index.php',
                'label' => t_h('common.back_to_home', [], 'Dashboard', $currentLang),
            ],
        ],
    ]);
}

/**
 * Check user restriction on a shared resource.
 * If the user is not authorized, renders login/access denied page and exits.
 * Returns true if user passed the restriction check, false if no restriction.
 */
function checkPublicUserRestriction($allowedUsersRaw, $activeUserId, $currentLang) {
    if (empty($allowedUsersRaw)) {
        return false;
    }
    
    $allowedUserIds = is_array($allowedUsersRaw) ? $allowedUsersRaw : json_decode($allowedUsersRaw, true);
    if (!is_array($allowedUserIds) || empty($allowedUserIds)) {
        return false;
    }
    
    if (session_status() === PHP_SESSION_NONE) {
        $configured_port = $_ENV['HTTP_WEB_PORT'] ?? '8040';
        session_name('POZNOTE_SESSION_' . $configured_port);
        session_start();
    }
    $currentUserId = $_SESSION['user_id'] ?? null;
    
    // The share owner always has access
    $isOwner = $currentUserId !== null && (int)$currentUserId === (int)$activeUserId;
    if (!$isOwner) {
        if ($currentUserId === null) {
            renderLoginRequiredPage($currentLang);
        }
        if (!in_array((int)$currentUserId, array_map('intval', $allowedUserIds), true)) {
            renderAccessDeniedPage($currentLang);
        }
    }
    
    return true;
}

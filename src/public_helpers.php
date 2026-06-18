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
    return in_array($theme, ['dark', 'light', 'black'], true) ? $theme : null;
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

/**
 * Decide whether an iframe `src` points at a trusted origin.
 *
 * Uses parse_url() with EXACT host matching (plus subdomains of an allowed
 * domain) so look-alike hosts such as `www.youtube.com.evil.test` are rejected.
 * Only http(s) and same-origin relative paths are accepted; protocol-relative,
 * javascript:, data: and other schemes are refused.
 */
function publicNoteIframeSrcIsTrusted(string $src): bool {
    $src = trim($src);
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
        if ($host === $domain || str_ends_with($host, '.' . $domain)) {
            return true;
        }
    }

    return false;
}

/**
 * Sanitize rendered HTML before it is echoed on a public (unauthenticated) page.
 *
 * This performs a real DOM parse + tag/attribute allowlist (not a regex pass),
 * so an attribute value that contains ">" — e.g.
 * `<video src=x title=">" onerror=alert(1)>` — cannot be used to smuggle an
 * event handler or `srcdoc` past the filter. The rules are:
 *   - Only allowlisted tags survive; unknown tags are unwrapped (text kept).
 *   - script/style/object/embed/form/... are dropped together with their content.
 *   - Only allowlisted attributes (plus any data-* / aria-*) are kept; every on*
 *     handler is removed regardless of casing.
 *   - href/src/poster/srcset values using javascript:/vbscript:/data: are
 *     dropped (data: is allowed only for <img> image payloads).
 *   - <iframe> is dropped unless its `src` is a trusted origin; `srcdoc` is
 *     never allowlisted, so it is always stripped.
 *
 * Server-generated markup (e.g. tasklist `data-index`/`data-text`) is preserved
 * because data-* / aria-* / title / class are kept.
 */
function sanitizePublicNoteHtml(string $content): string {
    if (trim($content) === '') {
        return $content;
    }

    static $allowedTags = [
        'p', 'br', 'div', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
        'blockquote', 'pre', 'code', 'hr', 'kbd', 'samp', 'var',
        'img', 'figure', 'figcaption',
        'details', 'summary',
        'mark', 'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'label',
        'input', 'button',
        'iframe', 'video', 'audio', 'source',
        'aside',
        'svg', 'path', 'rect', 'polyline', 'polygon', 'circle', 'ellipse', 'line', 'g',
    ];

    // Removed together with their subtree (never just unwrapped).
    static $forbiddenTags = [
        'script', 'style', 'object', 'embed', 'applet', 'form',
        'link', 'meta', 'base', 'noscript', 'template', 'frame', 'frameset',
    ];

    static $tagAttrs = [
        'a' => ['href', 'target', 'rel', 'name', 'download'],
        'img' => ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
        'source' => ['src', 'srcset', 'type', 'media'],
        'td' => ['colspan', 'rowspan'],
        'th' => ['colspan', 'rowspan', 'scope'],
        'col' => ['span'],
        'colgroup' => ['span'],
        'input' => ['type', 'checked', 'disabled', 'readonly', 'value', 'placeholder'],
        'time' => ['datetime'],
        'blockquote' => ['cite'],
        'q' => ['cite'],
        'button' => ['type'],
        'iframe' => ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'allowtransparency', 'sandbox', 'loading', 'referrerpolicy', 'scrolling'],
        'video' => ['src', 'width', 'height', 'preload', 'poster', 'controls', 'muted', 'playsinline', 'loop', 'autoplay'],
        'audio' => ['src', 'preload', 'controls', 'muted', 'loop', 'autoplay'],
        'svg' => ['viewbox', 'width', 'height', 'fill', 'xmlns', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden'],
        'path' => ['d', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'rect' => ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
        'circle' => ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
        'ellipse' => ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
        'line' => ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
        'polyline' => ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
        'polygon' => ['points', 'fill', 'stroke', 'stroke-width'],
        'g' => ['fill', 'stroke', 'stroke-width', 'opacity'],
    ];

    static $globalAttrs = [
        'id', 'class', 'style', 'title', 'dir', 'lang', 'role', 'tabindex', 'datetime', 'contenteditable',
    ];

    $isSafeUrl = static function (string $value, bool $allowDataImage = false): bool {
        $probe = strtolower((string) preg_replace('/[\s\x00-\x1F]+/', '', $value));
        if ($probe === '') {
            return true;
        }
        if (strncmp($probe, 'javascript:', 11) === 0 || strncmp($probe, 'vbscript:', 9) === 0) {
            return false;
        }
        if (strncmp($probe, 'data:', 5) === 0) {
            return $allowDataImage
                && preg_match('#^data:image/(?:png|jpe?g|gif|webp|svg\+xml|bmp)[;,]#', $probe) === 1;
        }
        return true;
    };

    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->encoding = 'UTF-8';
    $dom->loadHTML(
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' . $content . '</body></html>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
    );
    libxml_clear_errors();

    // Drop dangerous elements together with their subtree first.
    foreach ($forbiddenTags as $tag) {
        foreach (iterator_to_array($dom->getElementsByTagName($tag)) as $node) {
            if ($node->parentNode !== null) {
                $node->parentNode->removeChild($node);
            }
        }
    }

    $xpath = new DOMXPath($dom);
    foreach (iterator_to_array($xpath->query('//body//*')) as $el) {
        if (!($el instanceof DOMElement) || $el->parentNode === null) {
            continue; // detached by an earlier removal/unwrap
        }
        $tag = strtolower($el->nodeName);

        if (!in_array($tag, $allowedTags, true)) {
            // Unwrap unknown element, keeping its (still-to-be-sanitized) children.
            while ($el->firstChild !== null) {
                $el->parentNode->insertBefore($el->firstChild, $el);
            }
            $el->parentNode->removeChild($el);
            continue;
        }

        $allowed = $tagAttrs[$tag] ?? [];
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name = strtolower($attr->name);
            if (strncmp($name, 'on', 2) === 0) {
                $el->removeAttribute($attr->name);
                continue;
            }
            $keep = strncmp($name, 'data-', 5) === 0
                || strncmp($name, 'aria-', 5) === 0
                || in_array($name, $globalAttrs, true)
                || in_array($name, $allowed, true);
            if (!$keep) {
                $el->removeAttribute($attr->name);
                continue;
            }
            if ($name === 'href' || $name === 'src' || $name === 'poster' || $name === 'srcset') {
                if (!$isSafeUrl($attr->value, $tag === 'img')) {
                    $el->removeAttribute($attr->name);
                }
            } elseif ($name === 'style') {
                if (preg_match('/expression\s*\(|javascript\s*:|vbscript\s*:/i', $attr->value)) {
                    $el->removeAttribute($attr->name);
                }
            }
        }

        if ($tag === 'iframe' && !publicNoteIframeSrcIsTrusted($el->getAttribute('src'))) {
            $el->parentNode->removeChild($el);
        }
    }

    $body = $dom->getElementsByTagName('body')->item(0);
    if ($body === null) {
        return '';
    }

    $out = '';
    foreach ($body->childNodes as $child) {
        $out .= $dom->saveHTML($child);
    }

    return trim($out);
}

function renderPublicStatusPage($currentLang, array $options = []) {
    http_response_code($options['status'] ?? 403);

    $statusStylesheetHref = getVersionedPublicAppAssetHref('css/public_folder.css');
    $statusVariablesStylesheetHref = getVersionedPublicAppAssetHref('css/dark-mode/variables.css');
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
        <link rel="stylesheet" href="<?php echo htmlspecialchars($statusVariablesStylesheetHref, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
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

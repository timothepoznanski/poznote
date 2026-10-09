<?php
/**
 * "What's new" popup shown once after an update (discussion 1446).
 *
 * The release notes are the GitHub releases of the project, fetched by the
 * server and cached for every account of the instance. What each user has
 * already seen is one per-user setting, whats_new_seen_version: a release is
 * identified by its version, so "what did I miss" is every release above that
 * version and up to the one installed.
 */

const POZNOTE_WHATS_NEW_RELEASES_URL = 'https://api.github.com/repos/timothepoznanski/poznote/releases?per_page=30';
// Releases shown in one popup; older ones are counted and linked to GitHub
const POZNOTE_WHATS_NEW_MAX_RELEASES = 5;
// The notes of a release are pasted by hand after the tag lands, so a list
// that does not hold the installed version yet is asked again soon
const POZNOTE_WHATS_NEW_TTL_COMPLETE = 43200;
const POZNOTE_WHATS_NEW_TTL_PENDING = 900;
const POZNOTE_WHATS_NEW_TTL_FAILED = 3600;
// An instance that cannot reach GitHub asks twice, an hour apart, then stops
// for the installed version
const POZNOTE_WHATS_NEW_MAX_FAILURES = 2;

function poznoteWhatsNewIsPrerelease(string $version): bool {
    return strpos($version, '-') !== false;
}

/**
 * Keeps what the popup needs from the GitHub releases payload.
 */
function poznoteWhatsNewNormalizeReleases($payload): array {
    $releases = [];
    if (!is_array($payload)) {
        return $releases;
    }
    foreach ($payload as $release) {
        if (!is_array($release) || empty($release['tag_name']) || !empty($release['draft'])) {
            continue;
        }
        $version = ltrim((string)$release['tag_name'], 'v');
        $releases[] = [
            'version' => $version,
            'prerelease' => !empty($release['prerelease']) || poznoteWhatsNewIsPrerelease($version),
            'date' => substr((string)($release['published_at'] ?? ''), 0, 10),
            'url' => (string)($release['html_url'] ?? ''),
            'body' => str_replace("\r\n", "\n", (string)($release['body'] ?? '')),
        ];
    }
    return $releases;
}

/**
 * The releases a user has not seen: above $seenVersion, up to $currentVersion,
 * newest first, pre-releases included.
 * Returns ['releases' => [...], 'more' => number of older ones left out].
 */
function poznoteWhatsNewSelectReleases(array $releases, string $seenVersion, string $currentVersion, int $max = POZNOTE_WHATS_NEW_MAX_RELEASES): array {
    $selected = [];
    foreach ($releases as $release) {
        $version = (string)($release['version'] ?? '');
        if ($version === '' || trim((string)($release['body'] ?? '')) === '') {
            continue;
        }
        if (version_compare($version, $currentVersion, '>')) {
            continue;
        }
        if ($seenVersion !== '' && version_compare($version, $seenVersion, '<=')) {
            continue;
        }
        $selected[] = $release;
    }
    usort($selected, function ($a, $b) {
        return version_compare($b['version'], $a['version']);
    });
    $more = max(0, count($selected) - $max);
    return ['releases' => array_slice($selected, 0, $max), 'more' => $more];
}

/**
 * Release notes as the popup shows them: no title (the popup writes the
 * version itself), no closing support block (the popup has its own links)
 * and, for a non-admin, no "Fixed" section.
 */
function poznoteWhatsNewCleanBody(string $markdown, bool $fullChangelog): string {
    $lines = explode("\n", str_replace("\r\n", "\n", $markdown));

    // Closing block: the last horizontal rule, when a "Support" heading follows it
    for ($i = count($lines) - 1; $i >= 0; $i--) {
        if (preg_match('/^\s*(-{3,}|\*{3,}|_{3,})\s*$/', $lines[$i])) {
            $tail = implode("\n", array_slice($lines, $i + 1));
            if (preg_match('/^#{1,6}\s.*(❤|support|enjoying)/imu', $tail)) {
                $lines = array_slice($lines, 0, $i);
            }
            break;
        }
    }

    $kept = [];
    $skipping = false;
    $titleDropped = false;
    foreach ($lines as $line) {
        if (!$titleDropped && preg_match('/^#\s+/', $line)) {
            $titleDropped = true;
            continue;
        }
        if (preg_match('/^##\s+(.*)$/u', $line, $m)) {
            $titleDropped = true;
            $skipping = !$fullChangelog && preg_match('/🐛|\bfix(ed|es)?\b/iu', $m[1]) === 1;
        }
        if (!$skipping) {
            $kept[] = $line;
        }
    }

    return trim(implode("\n", $kept));
}

/**
 * GitHub release notes hold their screenshots as <img> tags, which the
 * Markdown parser escapes like any other raw HTML: turn them into Markdown
 * images first.
 */
function poznoteWhatsNewImagesToMarkdown(string $markdown): string {
    return preg_replace_callback('/<img\b[^>]*>/i', function ($m) {
        if (!preg_match('/\bsrc\s*=\s*"(https:\/\/[^"\s)]+)"/i', $m[0], $src)) {
            return '';
        }
        $alt = preg_match('/\balt\s*=\s*"([^"]*)"/i', $m[0], $altMatch) ? $altMatch[1] : '';
        $alt = str_replace(['[', ']'], '', $alt);
        return '![' . $alt . '](' . $src[1] . ')';
    }, $markdown);
}

function poznoteWhatsNewCacheFile(): string {
    return rtrim(sys_get_temp_dir(), '/\\') . '/poznote_whats_new_releases.json';
}

/**
 * The releases of the project, from the cache when it is fresh enough.
 * Returns null when GitHub could not be reached (remembered for an hour, so
 * an instance without Internet access does not wait on it at every load).
 * $gaveUp is set once that happened POZNOTE_WHATS_NEW_MAX_FAILURES times in a
 * row for this version: GitHub is not asked again and the caller can stop
 * asking too.
 */
function poznoteWhatsNewLoadReleases(string $currentVersion, &$gaveUp = false): ?array {
    $gaveUp = false;
    $cacheFile = poznoteWhatsNewCacheFile();
    $cache = null;
    if (is_file($cacheFile)) {
        $decoded = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($decoded) && isset($decoded['fetched_at'], $decoded['for_version'])) {
            $cache = $decoded;
        }
    }

    $failures = 0;
    if ($cache !== null && $cache['for_version'] === $currentVersion) {
        $failures = empty($cache['ok']) ? (int)($cache['failures'] ?? 1) : 0;
        if ($failures >= POZNOTE_WHATS_NEW_MAX_FAILURES) {
            $gaveUp = true;
            return null;
        }
        $age = time() - (int)$cache['fetched_at'];
        if (empty($cache['ok'])) {
            $ttl = POZNOTE_WHATS_NEW_TTL_FAILED;
        } else {
            $ttl = !empty($cache['complete']) ? POZNOTE_WHATS_NEW_TTL_COMPLETE : POZNOTE_WHATS_NEW_TTL_PENDING;
        }
        if ($age >= 0 && $age < $ttl) {
            return !empty($cache['ok']) ? (array)($cache['releases'] ?? []) : null;
        }
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => ['User-Agent: Poznote-App/1.0', 'Accept: application/vnd.github.v3+json'],
            'timeout' => 6,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents(POZNOTE_WHATS_NEW_RELEASES_URL, false, $context);
    $payload = $response === false ? null : json_decode($response, true);
    // An error answer (rate limit, ...) is an object with a "message", not a list
    $ok = is_array($payload) && !isset($payload['message']);
    $releases = $ok ? poznoteWhatsNewNormalizeReleases($payload) : [];

    $complete = false;
    foreach ($releases as $release) {
        if ($release['version'] === $currentVersion && trim($release['body']) !== '') {
            $complete = true;
            break;
        }
    }

    $tmp = $cacheFile . '.' . getmypid() . '.tmp';
    $written = @file_put_contents($tmp, json_encode([
        'fetched_at' => time(),
        'for_version' => $currentVersion,
        'ok' => $ok,
        'failures' => $ok ? 0 : $failures + 1,
        'complete' => $complete,
        'releases' => $releases,
    ]));
    if ($written === false || !@rename($tmp, $cacheFile)) {
        @unlink($tmp);
    }

    $gaveUp = !$ok && $failures + 1 >= POZNOTE_WHATS_NEW_MAX_FAILURES;

    return $ok ? $releases : null;
}

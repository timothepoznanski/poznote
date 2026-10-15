<?php
/**
 * Instance statistics: the pure part.
 *
 * GET /api/v1/public/statistics gives a dashboard (Homepage, Homarr, Uptime
 * Kuma...) a read-only summary of the instance: how many users, notes and
 * workspaces, the storage used, when the last backup and Git sync went
 * through, and whether an update is out. Discussion #1638.
 *
 * By default it is not open: an admin generates a statistics token in
 * Settings, and the dashboard sends it. That token unlocks this one summary
 * and nothing else, so it can sit in a dashboard's config file without
 * handing out an account password (an app password would not do: admin
 * routes refuse them). An admin may also choose to serve the summary to
 * anyone (statistics_public, off by default): that is why it holds counts,
 * sizes and dates only, never a username, title or error text, since backup
 * error messages name the accounts and folders they failed on.
 *
 * This file holds what needs no database, so tests/ can cover it. The
 * collection and the token storage live in src/InstanceStatistics.php.
 */

/** Every statistics token starts with this, so it cannot pass for an app password (pzn_). */
const STATISTICS_TOKEN_PREFIX = 'pzs_';

/** Random part of the token: 20 bytes, 160 bits, written as 40 hex digits. */
const STATISTICS_TOKEN_RANDOM_BYTES = 20;

/**
 * A freshly generated token, shown to the admin exactly once.
 */
function generateStatisticsToken(): string
{
    return STATISTICS_TOKEN_PREFIX . bin2hex(random_bytes(STATISTICS_TOKEN_RANDOM_BYTES));
}

/**
 * Whether a string has the exact shape the generator produces.
 */
function isStatisticsToken(string $candidate): bool
{
    $hexLength = STATISTICS_TOKEN_RANDOM_BYTES * 2;
    // \z rather than $: $ also matches before a trailing newline
    return (bool)preg_match('/^' . preg_quote(STATISTICS_TOKEN_PREFIX, '/') . '[0-9a-f]{' . $hexLength . '}\z/', $candidate);
}

/**
 * The value stored in master.db. SHA-256 for the same reason as app
 * passwords: 160 random bits need no slow hash.
 */
function hashStatisticsToken(string $token): string
{
    return hash('sha256', $token);
}

/**
 * What the admin sees of a stored token: its first characters.
 */
function statisticsTokenHint(string $token): string
{
    return substr($token, 0, strlen(STATISTICS_TOKEN_PREFIX) + 4);
}

/**
 * The token a request carries: "Authorization: Bearer <token>" first, then
 * an "X-Poznote-Token" header, then ?token= for the tools that can only
 * call a URL (it ends up in proxy logs, so the headers are preferred).
 *
 * @param array<string,mixed> $server $_SERVER
 * @param array<string,mixed> $query  $_GET
 */
function statisticsTokenFromRequest(array $server, array $query): ?string
{
    $authorization = (string)($server['HTTP_AUTHORIZATION'] ?? $server['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(\S+)\s*\z/i', $authorization, $matches)) {
        return $matches[1];
    }
    $header = trim((string)($server['HTTP_X_POZNOTE_TOKEN'] ?? ''));
    if ($header !== '') {
        return $header;
    }
    $param = $query['token'] ?? null;
    if (is_string($param) && $param !== '') {
        return $param;
    }
    return null;
}

/**
 * Whether $latest is a newer stable release than $current. A pre-release
 * tag (6.120.0-beta) is never offered, like the in-app update check.
 */
function statisticsIsNewerRelease(string $current, ?string $latest): ?bool
{
    $current = ltrim(trim($current), 'v');
    $latest = $latest === null ? '' : ltrim(trim($latest), 'v');
    if ($latest === '' || !preg_match('/^\d+(\.\d+)*$/', $latest)) {
        return null;
    }
    if ($current === '' || !preg_match('/^\d+(\.\d+)*/', $current)) {
        return null;
    }
    return version_compare($current, $latest, '<');
}

/**
 * Short machine-readable warnings for a collected summary, in a fixed
 * order, so a dashboard can show a single "status" field.
 *
 * @param array<string,mixed> $stats
 * @return string[]
 */
function statisticsWarnings(array $stats): array
{
    $warnings = [];
    foreach (['local', 's3'] as $destination) {
        $backup = $stats['backups'][$destination] ?? [];
        if (!empty($backup['enabled']) && ($backup['last_run_success'] ?? null) === false) {
            $warnings[] = $destination . '_backup_failed';
        }
    }
    if (!empty($stats['git_sync']['enabled']) && (int)($stats['git_sync']['last_sync_errors'] ?? 0) > 0) {
        $warnings[] = 'git_sync_errors';
    }
    if (($stats['update_available'] ?? null) === true) {
        $warnings[] = 'update_available';
    }
    return $warnings;
}

/**
 * A unix time or SQLite UTC "Y-m-d H:i:s" as ISO 8601, null when absent.
 *
 * @param int|string|null $value
 */
function statisticsIsoDate($value): ?string
{
    if ($value === null || $value === '' || $value === 0 || $value === '0') {
        return null;
    }
    if (is_int($value) || ctype_digit((string)$value)) {
        return gmdate('Y-m-d\TH:i:s\Z', (int)$value);
    }
    $time = strtotime((string)$value . (preg_match('/[zZ]|[+-]\d\d:?\d\d$/', (string)$value) ? '' : ' UTC'));
    return $time === false ? null : gmdate('Y-m-d\TH:i:s\Z', $time);
}

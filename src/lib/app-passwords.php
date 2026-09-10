<?php
/**
 * App passwords: the pure part.
 *
 * An app password is a second kind of credential for the REST API. A client
 * that cannot sign in through the identity provider (the browser extension,
 * the Android app, curl, an MCP server) sends it in place of the account
 * password, with the account's username, over plain HTTP Basic auth. Nothing
 * on the client side has to change: the credential is password-shaped on
 * purpose.
 *
 * What makes it different from the account password is what it is NOT
 * accepted for. It never opens a browser session, never reaches an admin
 * route, never manages the account it belongs to, and is bound to that one
 * profile, so a leaked extension token cannot escalate past the notes it was
 * created to reach. On an SSO-only instance it is the only credential the
 * API accepts over Basic auth, which is what the feature exists for.
 *
 * This file holds the parts that need no database, so tests/ can cover them:
 * the secret format, its detection, and the hash it is stored under.
 * The storage side lives in src/users/app_passwords.php.
 */

/**
 * Every app password starts with this. Two jobs: the API can tell an app
 * password from an account password without a database round-trip, and a
 * secret-scanning tool can recognise one pasted where it should not be.
 */
const APP_PASSWORD_PREFIX = 'pzn_';

/** Random part of the secret: 20 bytes, 160 bits, written as 40 hex digits. */
const APP_PASSWORD_RANDOM_BYTES = 20;

/** Longest label a user can give an app password. */
const APP_PASSWORD_LABEL_MAX_LENGTH = 60;

/** Most app passwords one profile may hold at once. */
const APP_PASSWORD_MAX_PER_USER = 25;

/** Longest lifetime a caller may ask for, in days (ten years). */
const APP_PASSWORD_MAX_EXPIRY_DAYS = 3650;

/**
 * A freshly generated secret, shown to the user exactly once.
 */
function generateAppPasswordSecret(): string
{
    return APP_PASSWORD_PREFIX . bin2hex(random_bytes(APP_PASSWORD_RANDOM_BYTES));
}

/**
 * Whether a string has the shape of an app password.
 *
 * Strict on purpose: only the exact prefix, length and alphabet the generator
 * produces. A looser check (prefix only) would route any account password
 * that happens to start with "pzn_" into the app-password lookup and refuse
 * it, so the match has to be one an account password cannot make by accident.
 */
function isAppPasswordSecret(string $candidate): bool
{
    $hexLength = APP_PASSWORD_RANDOM_BYTES * 2;
    // \z rather than $: in PCRE, $ also matches before a trailing newline,
    // and a secret pasted with one must not be accepted.
    return (bool)preg_match('/^' . preg_quote(APP_PASSWORD_PREFIX, '/') . '[0-9a-f]{' . $hexLength . '}\z/', $candidate);
}

/**
 * The value stored in the database and compared on every API request.
 *
 * SHA-256 rather than bcrypt, deliberately. bcrypt exists to slow down
 * guessing of low-entropy, human-chosen passwords; this secret is 160 random
 * bits, so guessing is not the threat and the slow hash would only add its
 * cost (tens to hundreds of milliseconds) to every API call. A plain hash is
 * what personal access tokens use everywhere for the same reason, and it
 * still keeps a stolen database from yielding usable credentials.
 */
function hashAppPasswordSecret(string $secret): string
{
    return hash('sha256', $secret);
}

/**
 * The part of a secret safe to keep in clear and show in a list, so the user
 * can match a row against the value pasted in a client: prefix plus the first
 * four hex digits, e.g. "pzn_3f9a".
 */
function appPasswordHint(string $secret): string
{
    return substr($secret, 0, strlen(APP_PASSWORD_PREFIX) + 4);
}

/**
 * Cleans a user-supplied label. Returns null when nothing usable is left.
 */
function normalizeAppPasswordLabel(?string $label): ?string
{
    $label = trim((string)$label);
    // Collapse internal whitespace so a label cannot be padded into something
    // that looks like two columns in the list.
    $label = preg_replace('/\s+/u', ' ', $label) ?? '';
    if ($label === '') {
        return null;
    }
    if (function_exists('mb_substr')) {
        return mb_substr($label, 0, APP_PASSWORD_LABEL_MAX_LENGTH);
    }
    return substr($label, 0, APP_PASSWORD_LABEL_MAX_LENGTH);
}

/**
 * Turns the optional "expires_in_days" request field into a UTC timestamp
 * string for the database, or null for a password that never expires.
 * Returns false for a value that is not a usable number of days.
 *
 * @return string|null|false
 */
function appPasswordExpiryFromDays($days, ?int $now = null)
{
    if ($days === null || $days === '' || $days === 0 || $days === '0') {
        return null;
    }
    if (!is_numeric($days) || (int)$days != $days) {
        return false;
    }
    $days = (int)$days;
    if ($days < 1 || $days > APP_PASSWORD_MAX_EXPIRY_DAYS) {
        return false;
    }
    return gmdate('Y-m-d H:i:s', ($now ?? time()) + $days * 86400);
}

/**
 * Whether a stored expiry (SQLite CURRENT_TIMESTAMP format, UTC) is in the past.
 */
function isAppPasswordExpired(?string $expiresAt, ?int $now = null): bool
{
    if ($expiresAt === null || trim($expiresAt) === '') {
        return false;
    }
    $ts = strtotime($expiresAt . ' UTC');
    if ($ts === false) {
        // An unreadable date must fail closed: a credential whose lifetime
        // cannot be established is not accepted.
        return true;
    }
    return $ts <= ($now ?? time());
}

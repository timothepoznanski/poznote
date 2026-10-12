<?php
/**
 * Login screen turned off (Settings > Admin Tools, discussion #1608).
 *
 * With the option on, a browser that reaches the instance is signed in to one
 * account without being asked for anything. The two questions that decide
 * what that means are answered here, away from the session and the database,
 * so they can be tested on their own: which account is opened, and for which
 * callers.
 */

require_once __DIR__ . '/request-kind.php';

/**
 * The account opened when nobody is asked to sign in: the one recorded when
 * the option was turned on, and only that one. If it is gone or deactivated
 * nobody is signed in and the login form comes back, rather than another
 * account being opened in its place.
 *
 * @param array $profiles  Active profiles (id, username, is_admin).
 * @param int   $accountId The recorded account, 0 when the option is off.
 */
function poznoteResolveAutoLoginProfile(array $profiles, int $accountId): ?array
{
    if ($accountId <= 0) {
        return null;
    }

    foreach ($profiles as $profile) {
        if ((int)($profile['id'] ?? 0) === $accountId) {
            return $profile;
        }
    }

    return null;
}

/**
 * Whether this caller is signed in without credentials.
 *
 * Only a browser is: a page, or a call made by a page's script. An API
 * client (no browser signal at all) keeps authenticating the way it always
 * did, and so does any request that brings credentials of its own, which
 * must be judged on them. This keeps scripts and integrations unchanged and
 * the activity log free of one "login" per API call; it is not a protection,
 * since anyone who can reach the instance can open it in a browser.
 *
 * @param array $server         Typically $_SERVER.
 * @param bool  $hasCredentials The request carries API credentials.
 */
function poznoteRequestQualifiesForAutoLogin(array $server, bool $hasCredentials): bool
{
    if ($hasCredentials) {
        return false;
    }

    return poznoteClassifyRequest($server) !== POZNOTE_REQUEST_CLIENT;
}

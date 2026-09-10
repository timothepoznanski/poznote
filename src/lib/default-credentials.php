<?php
/**
 * Default-credential detection.
 *
 * A fresh install creates the 'admin_change_me' profile with no password hash,
 * so it answers to the hardcoded default of auth.php. The two halves are then
 * changed independently, and each one has to be judged on its own:
 *
 *  - the login page hint spells out both values, so it is only true while both
 *    are untouched, and it hands valid credentials to any visitor while shown;
 *  - the reminder inside the app is a security nag, so it has to stay up while
 *    either half is left at its default, and it is safe there because the page
 *    is already behind authentication.
 */

require_once __DIR__ . '/../users/db_master.php';

if (!defined('POZNOTE_DEFAULT_ADMIN_USERNAME')) {
    define('POZNOTE_DEFAULT_ADMIN_USERNAME', 'admin_change_me');
}

/**
 * Which halves of a profile's credentials are still the shipped defaults.
 *
 * The profile is re-read from the master database rather than taken from the
 * caller: the session copy of the user row survives a rename or a password
 * change made in the same session, and a stale row here means nagging someone
 * who already fixed it.
 *
 * @return array{username: bool, password: bool}
 */
function poznoteDefaultCredentialState(int $userId): array {
    $state = ['username' => false, 'password' => false];
    if ($userId <= 0) {
        return $state;
    }

    $user = getUserProfileById($userId);
    if ($user === null) {
        return $state;
    }

    $state['username'] = ($user['username'] ?? '') === POZNOTE_DEFAULT_ADMIN_USERNAME;

    // No stored hash means verifyUserPassword() falls back to AUTH_PASSWORD /
    // AUTH_USER_PASSWORD. A default nobody can actually sign in with is not an
    // exposure and gets no warning: the profile may be barred from the fallback
    // (auto-provisioned through OIDC), or the whole instance may refuse
    // passwords at login.
    //
    // The hash is read off the row rather than through getUserPasswordHash():
    // this runs on every page render through the icon rail, and the row is
    // already in hand. Empty counts as absent, as it does there.
    $storedHash = $user['password_hash'] ?? null;
    $state['password'] = ($storedHash === null || $storedHash === '')
        && !isPasswordLoginDisabled($user)
        && poznoteInstanceAllowsPasswordLogin();

    return $state;
}

/**
 * Whether this instance accepts a password at sign-in at all.
 *
 * POZNOTE_OIDC_DISABLE_NORMAL_LOGIN is the only switch that turns the password
 * form off, and login.php enforces it server-side, so a default password on an
 * instance that has it set is unreachable.
 */
function poznoteInstanceAllowsPasswordLogin(): bool {
    $oidcPath = __DIR__ . '/../public/oidc.php';
    if (is_file($oidcPath)) {
        require_once $oidcPath;
    }

    return !(function_exists('oidc_is_enabled')
        && oidc_is_enabled()
        && defined('OIDC_DISABLE_NORMAL_LOGIN')
        && OIDC_DISABLE_NORMAL_LOGIN);
}

/**
 * True when either half of the profile's credentials is still a default.
 */
function poznoteHasDefaultCredential(int $userId): bool {
    $state = poznoteDefaultCredentialState($userId);

    return $state['username'] || $state['password'];
}

/**
 * The untouched default profile the login hint is about: default username and
 * default password. Anything else means whoever installed this already changed
 * one of the two and knows their own credentials, so the hint would be wrong
 * as often as right.
 *
 * @return array|null The profile row as getAllUserProfiles() returns it (id,
 *                     username, email, is_admin), or null when there is none.
 */
function poznoteFindPristineDefaultProfile(): ?array {
    try {
        $profiles = getAllUserProfiles();
    } catch (Exception $e) {
        error_log('default-credentials: getAllUserProfiles() failed: ' . $e->getMessage());
        return null;
    }

    foreach ($profiles as $profile) {
        if (($profile['username'] ?? '') !== POZNOTE_DEFAULT_ADMIN_USERNAME) {
            continue;
        }

        // The hint names AUTH_PASSWORD, which is only the default of an admin
        // profile: a non-admin falls back to AUTH_USER_PASSWORD instead.
        // createDefaultUserIfNeeded() only ever creates this name as an admin,
        // so anything else wearing it was made by hand and gets no hint.
        if (empty($profile['is_admin'])) {
            continue;
        }

        $state = poznoteDefaultCredentialState((int)($profile['id'] ?? 0));
        if ($state['username'] && $state['password']) {
            return $profile;
        }
    }

    return null;
}

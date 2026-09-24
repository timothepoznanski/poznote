<?php
/**
 * The PHP session every Poznote page shares.
 *
 * auth.php opens it for the app; the public share pages (public_note.php,
 * public_folder.php) open it themselves because they do not load auth.php.
 * Both must use the same name, cookie flags and storage, or a password typed
 * on a share page and the login of a signed-in visitor end up in two
 * different files for the same cookie.
 */

/**
 * True when the session cookie must be Secure (HTTPS, directly or behind a
 * reverse proxy), unless POZNOTE_FORCE_SECURE_COOKIES says otherwise.
 */
function poznoteSessionCookieIsSecure(): bool {
    $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
             || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
             || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
             || (!empty($_SERVER['HTTP_X_FORWARDED_PORT']) && $_SERVER['HTTP_X_FORWARDED_PORT'] === '443');

    // Allow override via environment variable for edge cases
    $forceSecureCookies = getenv('POZNOTE_FORCE_SECURE_COOKIES');
    if ($forceSecureCookies !== false && $forceSecureCookies !== '') {
        $isSecure = filter_var($forceSecureCookies, FILTER_VALIDATE_BOOLEAN);
    }

    return $isSecure;
}

/**
 * Start the shared session, configured the way auth.php always did. Does
 * nothing when a session is already open.
 */
function poznoteStartSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    // Configure session cookie for reverse proxy compatibility
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => poznoteSessionCookieIsSecure(),
        'httponly' => true,
        'samesite' => 'Lax'
    ]);

    // Configure session name based on configured port to allow multiple instances
    $sessionName = 'POZNOTE_SESSION_' . ($_ENV['HTTP_WEB_PORT'] ?? '8040');
    session_name($sessionName);

    // Sessions live in the data volume, not in the container's /tmp: recreating
    // the container (an update, a rollout) then keeps everyone signed in, since
    // the browser still holds its cookie and the file that cookie names is still
    // there (issue #1389). The directory is created on first use, stays private
    // to the PHP user, and nginx never serves anything under /data/.
    $sessionSavePath = dirname(__DIR__) . '/data/sessions';
    if (!is_dir($sessionSavePath)) {
        @mkdir($sessionSavePath, 0700, true);
    }
    if (is_dir($sessionSavePath) && is_writable($sessionSavePath)) {
        // A session opened before this directory existed is still in the old
        // location: carry it over once, so the update that ships this change is
        // not itself the restart that signs everyone out.
        $currentSessionId = (string)($_COOKIE[$sessionName] ?? '');
        if ($currentSessionId !== '' && preg_match('/^[a-zA-Z0-9,-]{22,256}$/', $currentSessionId)) {
            $legacySessionDir = (string)session_save_path();
            if ($legacySessionDir === '') {
                $legacySessionDir = sys_get_temp_dir();
            }
            $legacySessionFile = rtrim($legacySessionDir, '/') . '/sess_' . $currentSessionId;
            $movedSessionFile = $sessionSavePath . '/sess_' . $currentSessionId;
            if (!is_file($movedSessionFile) && is_file($legacySessionFile) && @copy($legacySessionFile, $movedSessionFile)) {
                @chmod($movedSessionFile, 0600);
                @unlink($legacySessionFile);
            }
        }
        session_save_path($sessionSavePath);
    }

    session_start();
}

<?php
/**
 * OAuth authorization endpoint and consent page, for the MCP server.
 *
 * A chat app (ChatGPT, Claude, Gemini, ...) sends the person here when they
 * add Poznote as a connector. They sign in the usual way if they are not
 * already (password, two-factor or SSO: login.php brings them back), choose
 * the access level, and approve. The app then gets a code it exchanges at
 * token.php. See src/lib/oauth-server.php.
 *
 * The app only ever gets the account of the person who signs in, never one
 * they were given access to (Admin > User Management): approver and account
 * are then always the same person, which is what lets the MCP service token
 * pass the owner checks for that account (isActiveAccountOwnedByAuthenticatedUser()).
 *
 * The request is parked in the session under a short id before anything is
 * shown: the login round trip then carries "oauth/authorize.php?request=<id>"
 * instead of a long URL full of OAuth parameters, and a reload of the consent
 * page keeps working.
 */

require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../functions.php';
require_once __DIR__ . '/../../users/oauth.php';

// Same policy as login.php ('unsafe-inline' for the theme scripts the app
// writes into every page head), minus form-action: approving redirects the
// form post to the app, another origin, and Chrome applies form-action to
// that redirect too.
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';");
header('Referrer-Policy: no-referrer');

const OAUTH_PENDING_TTL = 1800;
const OAUTH_PENDING_MAX = 10;

$authenticated = isAuthenticated();
if ($authenticated) {
    require_once __DIR__ . '/../../db_connect.php';
    $currentLang = getUserLanguage();
} else {
    $currentLang = poznoteDetectBrowserLanguage($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '', poznoteSupportedLanguages())
        ?? strtolower((string)getGlobalSetting('language', 'en'));
}

/**
 * Escaped translation whose {{placeholders}} take HTML the caller has already
 * escaped (t_h() would escape the markup around the app name too).
 */
function oauthAuthorizeT(string $key, array $htmlVars, string $default): string {
    global $currentLang;
    $text = t_h('oauth_authorize.' . $key, [], $default, $currentLang);
    foreach ($htmlVars as $name => $html) {
        $text = str_replace('{{' . $name . '}}', (string)$html, $text);
    }
    return $text;
}

/** A page that cannot send the person back to the app: unknown client or redirect URI. */
function oauthAuthorizeRenderError(string $message): void {
    global $currentLang;
    http_response_code(400);
    oauthAuthorizeRenderPage(
        oauthAuthorizeT('error_title', [], 'This connection cannot continue'),
        '<p class="oauth-message">' . $message . '</p>'
    );
    exit;
}

function oauthAuthorizeRedirect(string $url): void {
    header('Location: ' . $url, true, 302);
    exit;
}

function oauthAuthorizeRenderPage(string $title, string $body): void {
    global $currentLang;
    ?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <meta name="robots" content="noindex">
    <title><?php echo $title; ?></title>
    <script src="../js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <?php poznoteRenderStylesheets('oauth/authorize', ['prefix' => '../']); ?>
    <?php poznoteRenderBrandIcons('../'); ?>
</head>
<body>
    <div class="login-container oauth-container">
        <div class="login-header">
            <div class="logo">
                <?php echo poznoteLogoMark('logo-favicon', 'Poznote', '../'); ?>
            </div>
            <h1 class="login-title oauth-title"><?php echo $title; ?></h1>
        </div>
        <?php echo $body; ?>
    </div>
</body>
</html>
    <?php
}

// --------------------------------------------------------------------------
// 1. A new authorization request: validate it, park it, come back by its id
// --------------------------------------------------------------------------

if (!isset($_GET['request'])) {
    $clientId = is_string($_GET['client_id'] ?? null) ? $_GET['client_id'] : '';
    $client = getOAuthClient($clientId);
    if ($client === null) {
        oauthAuthorizeRenderError(oauthAuthorizeT('error_unknown_client', [], 'The app is not registered with this Poznote instance. Remove the connector from the app and add it again.'));
    }

    $redirectUri = is_string($_GET['redirect_uri'] ?? null) ? $_GET['redirect_uri'] : '';
    if ($redirectUri === '' && count($client['redirect_uris']) === 1) {
        $redirectUri = $client['redirect_uris'][0];
    }
    if ($redirectUri === '' || !oauthRedirectUriMatches($redirectUri, $client['redirect_uris'])) {
        oauthAuthorizeRenderError(oauthAuthorizeT('error_redirect_uri', [], 'The app asked to be sent back to an address it did not register.'));
    }

    // A malformed request is answered here, never by redirecting to the app:
    // anyone can register any https redirect URI, so redirecting before the
    // person has decided anything would make this page an open redirect on
    // Poznote's own address (RFC 9700 section 4.11.2). The app's developer is
    // the only one who ever sees these.
    $state = is_string($_GET['state'] ?? null) ? $_GET['state'] : '';
    $challenge = is_string($_GET['code_challenge'] ?? null) ? $_GET['code_challenge'] : '';
    if (($_GET['response_type'] ?? '') !== 'code'
        || ($_GET['code_challenge_method'] ?? '') !== 'S256' || !oauthIsValidCodeChallenge($challenge)) {
        oauthAuthorizeRenderError(oauthAuthorizeT('error_bad_request', [], 'The app sent an incomplete sign-in request (it must use the authorization code flow with PKCE S256). Report it to the app\'s developer.'));
    }

    // The resource the token is for (RFC 8707). When Poznote knows the MCP
    // server's address it accepts no other, so a token cannot be obtained
    // here for a server that is not this instance's.
    $resource = oauthNormalizeResource($_GET['resource'] ?? null);
    if (is_string($_GET['resource'] ?? null) && $_GET['resource'] !== ''
        && ($resource === '' || !oauthResourceIsThisMcpServer($resource))) {
        oauthAuthorizeRenderError(oauthAuthorizeT('error_bad_resource', [], 'The app asked for access to a server that is not this Poznote instance\'s MCP server.'));
    }

    $pending = is_array($_SESSION['oauth_pending'] ?? null) ? $_SESSION['oauth_pending'] : [];
    $pending = array_filter($pending, static function ($entry) {
        return is_array($entry) && (int)($entry['created_at'] ?? 0) > time() - OAUTH_PENDING_TTL;
    });
    while (count($pending) >= OAUTH_PENDING_MAX) {
        array_shift($pending);
    }
    $requestId = bin2hex(random_bytes(12));
    $pending[$requestId] = [
        'client_id' => $client['client_id'],
        'redirect_uri' => $redirectUri,
        'state' => $state,
        'code_challenge' => $challenge,
        'scope' => oauthNormalizeScope($_GET['scope'] ?? null),
        'resource' => $resource,
        'csrf' => bin2hex(random_bytes(32)),
        'created_at' => time(),
    ];
    $_SESSION['oauth_pending'] = $pending;
    oauthAuthorizeRedirect('authorize.php?request=' . $requestId);
}

// --------------------------------------------------------------------------
// 2. A parked request: sign in first, then consent
// --------------------------------------------------------------------------

$requestId = is_string($_GET['request']) ? $_GET['request'] : '';
$pendingRequest = $_SESSION['oauth_pending'][$requestId] ?? null;
if (!preg_match('/^[a-f0-9]{24}$/', $requestId) || !is_array($pendingRequest)
    || (int)($pendingRequest['created_at'] ?? 0) <= time() - OAUTH_PENDING_TTL) {
    oauthAuthorizeRenderError(oauthAuthorizeT('error_expired', [], 'This connection request has expired. Start again from the app.'));
}

$client = getOAuthClient((string)$pendingRequest['client_id']);
if ($client === null) {
    unset($_SESSION['oauth_pending'][$requestId]);
    oauthAuthorizeRenderError(oauthAuthorizeT('error_unknown_client', [], 'The app is not registered with this Poznote instance. Remove the connector from the app and add it again.'));
}

if (!$authenticated) {
    oauthAuthorizeRedirect('../login.php?redirect=' . rawurlencode('oauth/authorize.php?request=' . $requestId));
}

$loginUserId = (int)(getAuthenticatedUserId() ?? 0);
$account = getUserProfileById($loginUserId);
if (!$account || empty($account['active'])) {
    $account = null;
}

$redirectUri = (string)$pendingRequest['redirect_uri'];
$state = (string)$pendingRequest['state'];

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $csrf = is_string($_POST['csrf_token'] ?? null) ? $_POST['csrf_token'] : '';
    if (!hash_equals((string)$pendingRequest['csrf'], $csrf)) {
        oauthAuthorizeRenderError(oauthAuthorizeT('error_expired', [], 'This connection request has expired. Start again from the app.'));
    }
    unset($_SESSION['oauth_pending'][$requestId]);

    if (($_POST['decision'] ?? '') !== 'allow') {
        oauthAuthorizeRedirect(oauthBuildRedirect($redirectUri, ['error' => 'access_denied', 'state' => $state]));
    }

    // The signed-in person's own account, whatever the form says
    if ($account === null || !oauthGrantAccountStillAllowed($loginUserId, $loginUserId)) {
        oauthAuthorizeRedirect(oauthBuildRedirect($redirectUri, ['error' => 'access_denied', 'state' => $state]));
    }
    $accountId = $loginUserId;
    $level = oauthNormalizeAccessLevel($_POST['access_level'] ?? null);

    $code = createOAuthAuthorizationCode(
        $client,
        $accountId,
        $loginUserId,
        $redirectUri,
        (string)$pendingRequest['code_challenge'],
        (string)$pendingRequest['scope'],
        $level,
        (string)$pendingRequest['resource']
    );
    if ($code === null) {
        oauthAuthorizeRedirect(oauthBuildRedirect($redirectUri, ['error' => 'server_error', 'state' => $state]));
    }

    require_once __DIR__ . '/../../ActivityLog.php';
    logActivity(ACTIVITY_OAUTH_APP_AUTHORIZED, [
        'app' => oauthClientDisplayName($client),
        'account_id' => $accountId,
        'access_level' => $level,
    ], 'web');

    oauthAuthorizeRedirect(oauthBuildRedirect($redirectUri, ['code' => $code, 'state' => $state]));
}

if ($account === null) {
    oauthAuthorizeRenderError(oauthAuthorizeT('error_no_account', [], 'Your sign-in has no active account this app could use.'));
}

// --------------------------------------------------------------------------
// 3. The consent page
// --------------------------------------------------------------------------

$appName = htmlspecialchars(oauthClientDisplayName($client), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$redirectParts = parse_url($redirectUri);
$redirectTarget = !empty($redirectParts['host'])
    ? (string)$redirectParts['host'] . (isset($redirectParts['port']) ? ':' . $redirectParts['port'] : '')
    : (string)($redirectParts['scheme'] ?? '') . '://';

$levels = [
    'read' => [
        oauthAuthorizeT('level_read', [], 'Read only'),
        oauthAuthorizeT('level_read_help', [], 'Read, search and list your notes. Changes nothing.'),
    ],
    'write' => [
        oauthAuthorizeT('level_write', [], 'Read and edit'),
        oauthAuthorizeT('level_write_help', [], 'Also create and edit notes, tasks, reminders and folders, and move notes to the trash.'),
    ],
    'admin' => [
        oauthAuthorizeT('level_admin', [], 'Full access'),
        oauthAuthorizeT('level_admin_help', [], 'Also what cannot be undone: emptying the trash, deleting workspaces, public sharing, settings, backups and Git sync.'),
    ],
];

ob_start();
?>
<form method="POST" action="authorize.php?request=<?php echo htmlspecialchars($requestId, ENT_QUOTES); ?>" class="oauth-consent">
    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars((string)$pendingRequest['csrf'], ENT_QUOTES); ?>">

    <p class="oauth-message">
        <?php echo oauthAuthorizeT('intro', ['app' => '<span class="oauth-app-name">' . $appName . '</span>'], '{{app}} wants to use your Poznote notes.'); ?>
    </p>
    <p class="oauth-redirect">
        <?php echo oauthAuthorizeT('name_unverified', [], 'The app gives this name itself; Poznote does not verify it.'); ?>
        <?php echo oauthAuthorizeT('redirect_note', ['target' => '<code>' . htmlspecialchars($redirectTarget, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</code>'], 'You will be sent back to {{target}}. Only continue if you started this from that app.'); ?>
    </p>

    <fieldset class="oauth-fieldset">
        <legend class="oauth-legend"><?php echo oauthAuthorizeT('account_label', [], 'Account'); ?></legend>
        <div class="oauth-account-single"><?php echo htmlspecialchars((string)$account['username'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></div>
    </fieldset>

    <fieldset class="oauth-fieldset">
        <legend class="oauth-legend"><?php echo oauthAuthorizeT('level_label', [], 'Access'); ?></legend>
        <div class="oauth-choice-list">
            <?php foreach ($levels as $value => [$label, $help]): ?>
                <label class="oauth-choice">
                    <input type="radio" name="access_level" value="<?php echo $value; ?>"<?php echo $value === OAUTH_DEFAULT_ACCESS_LEVEL ? ' checked' : ''; ?>>
                    <span class="oauth-choice-text">
                        <span class="oauth-choice-title"><?php echo $label; ?></span>
                        <span class="oauth-choice-help"><?php echo $help; ?></span>
                    </span>
                </label>
            <?php endforeach; ?>
        </div>
    </fieldset>

    <div class="oauth-actions">
        <button type="submit" name="decision" value="deny" class="login-button oauth-cancel-button"><?php echo oauthAuthorizeT('cancel', [], 'Cancel'); ?></button>
        <button type="submit" name="decision" value="allow" class="login-button oauth-allow-button"><?php echo oauthAuthorizeT('allow', [], 'Allow'); ?></button>
    </div>

    <p class="oauth-footnote"><?php echo oauthAuthorizeT('footnote', [], 'You can disconnect it at any time in Settings, Connected apps.'); ?></p>
</form>
<?php
oauthAuthorizeRenderPage(oauthAuthorizeT('title', [], 'Connect an app'), (string)ob_get_clean());

<?php
/**
 * The first-run startup guide.
 *
 * This used to be a dialog on top of index.php, which also meant it could be
 * relaunched from the settings page. It is neither any more: it is the first
 * screen of a brand new account and nothing else.
 *
 * The 'welcome_setup' setting drives it end to end. db_connect.php seeds it to
 * 'pending' when an account database is created; index.php sends a plain page
 * load here while it says so, and this page flips it to 'done' when the guide
 * is submitted. Only submitting writes that: opening the page and leaving
 * records nothing, so an unfinished guide comes back. After it, both the
 * redirect and this page fall straight through to the notes, and there is no
 * way back into it.
 *
 * What it offers is deliberately short: the username and password to sign in
 * with, and the four preferences that shape every screen after it (language,
 * theme, date format, timezone). Everything else belongs in Settings, and the
 * page says so rather than growing.
 *
 * The choices go through the same endpoints the settings page uses
 * (js/welcome-page.js), so validation, the language webhook and the welcome
 * note's relocalization all happen exactly as they do there.
 */

require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../theme_catalog.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../lib/default-credentials.php';

// One account, one showing. A public-workspace visitor owns none of these
// settings, and neither does someone opening an account that is not theirs.
if (getSetting('welcome_setup', '') !== 'pending'
    || (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive())
    || (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser())) {
    header('Location: index.php');
    exit;
}

$currentLang = getUserLanguage();
$welcomeUserId = (int)(getAuthenticatedUserId() ?? 0);

// The session copy of the user row goes stale as soon as anything renames the
// profile; read it back instead, the way default-credentials.php does.
$welcomeProfile = $welcomeUserId > 0 ? getUserProfileById($welcomeUserId) : null;
$welcomeUsername = (string)($welcomeProfile['username'] ?? ($_SESSION['user']['username'] ?? ''));
$welcomeIsAdmin = (bool)($welcomeProfile['is_admin'] ?? false);

// Whether a local password is of any use here, same two cases as the settings
// page: an SSO-only instance would never accept one, and a profile
// provisioned without a credential has no current password to confirm the
// change with. The section then says so instead of offering dead boxes.
// oidc.php only declares functions, so requiring it costs nothing when the
// instance has no identity provider configured.
$welcomeOidcPath = __DIR__ . '/oidc.php';
if (is_file($welcomeOidcPath)) {
    require_once $welcomeOidcPath;
}
$welcomeSsoOnly = function_exists('oidc_is_enabled')
    && oidc_is_enabled()
    && defined('OIDC_DISABLE_NORMAL_LOGIN')
    && OIDC_DISABLE_NORMAL_LOGIN;
$welcomeHasCustomPassword = function_exists('hasCustomPassword') && hasCustomPassword($welcomeUserId);
$welcomeNoLocalCredential = !$welcomeHasCustomPassword
    && is_array($welcomeProfile)
    && isPasswordLoginDisabled($welcomeProfile);
$welcomePasswordAvailable = !$welcomeSsoOnly && !$welcomeNoLocalCredential;

// Which halves of the shipped credentials are still in place. Naming the
// default password here is the same disclosure the login page already makes
// while both halves are untouched, except this page is behind authentication
// and shows it only to the account it belongs to.
$welcomeDefaults = poznoteDefaultCredentialState($welcomeUserId);
$welcomeDefaultPassword = $welcomeIsAdmin ? AUTH_PASSWORD : AUTH_USER_PASSWORD;

// An account still on the shipped default is the case this guide exists for,
// and the password it answers to is a constant of the build, printed on the
// login page and in the hint below. Asking the owner to retype it would be
// ceremony, so the field is dropped and the page confirms the change with the
// value it already knows. An account an administrator gave a password to is
// the other case: nothing here knows it, so it has to be typed.
$welcomeKnowsCurrentPassword = $welcomePasswordAvailable && $welcomeDefaults['password'];

// The languages this instance ships, named in themselves. An endonym is what
// someone whose interface opened in the wrong language still recognises, which
// is exactly the case the popup below exists for.
$welcomeLanguageNames = [
    'en' => 'English',
    'fr' => 'Français',
    'de' => 'Deutsch',
    'es' => 'Español',
    'pt' => 'Português',
    'ru' => 'Русский',
    'zh-cn' => '简体中文',
];
$welcomeLanguages = [];
foreach (poznoteSupportedLanguages() as $welcomeLanguageCode) {
    $welcomeLanguages[$welcomeLanguageCode] = $welcomeLanguageNames[$welcomeLanguageCode] ?? strtoupper($welcomeLanguageCode);
}

$welcomeTimezone = (string)getSetting('timezone', 'UTC');
$welcomeDateFormat = (string)getSetting('date_time_format', 'default');
$welcomeDateFormats = ['default', 'ymd_his', 'dmy_hi', 'mdy_hia'];

// The themes this instance offers, in the order the rail button walks them,
// so the guide never proposes a theme the admin removed from the list.
$welcomeThemes = [];
foreach (poznoteThemeList() as $welcomeThemeEntry) {
    $welcomeThemeId = (string)($welcomeThemeEntry['id'] ?? '');
    if ($welcomeThemeId === '') {
        continue;
    }
    $welcomeThemeFile = poznoteCustomThemeFile($welcomeThemeId);
    $welcomeThemes[] = [
        'id' => $welcomeThemeId,
        // A custom theme is named by its stylesheet; a built-in one has a
        // translated name, and keeps its key so the language switch can
        // retranslate it without a reload.
        'label' => $welcomeThemeFile !== ''
            ? preg_replace('/\.css$/i', '', $welcomeThemeFile)
            : t('theme.names.' . $welcomeThemeId, [], ucfirst($welcomeThemeId)),
        'key' => $welcomeThemeFile !== '' ? '' : 'theme.names.' . $welcomeThemeId,
    ];
}

$cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo t_h('welcome_page.page_title', [], 'Welcome'); ?> - <?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <?php poznoteRenderStylesheets('welcome'); ?>
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
</head>
<body class="welcome-page welcome-page-locked">
    <!-- The guide opens on this and nothing else: the language decides what
         every word after it says, so it is asked first and the rest of the
         page waits behind it. Picking one retranslates the guide in place
         (js/welcome-page.js) and writes the choice into #welcomeLanguage,
         which stays in the preferences card so it can still be corrected. -->
    <div class="welcome-lang-overlay" id="welcomeLanguageOverlay" role="dialog" aria-modal="true" aria-labelledby="welcomeLanguageTitle">
        <div class="welcome-lang-dialog">
            <h2 class="welcome-lang-title" id="welcomeLanguageTitle"><?php echo t_h('welcome_page.language_modal.title', [], 'Choose your language'); ?></h2>
            <div class="welcome-lang-choices">
                <?php foreach ($welcomeLanguages as $welcomeLanguageCode => $welcomeLanguageName): ?>
                <button type="button" class="welcome-lang-choice<?php echo $welcomeLanguageCode === $currentLang ? ' welcome-lang-choice-current' : ''; ?>"
                        data-welcome-lang="<?php echo htmlspecialchars($welcomeLanguageCode, ENT_QUOTES, 'UTF-8'); ?>"
                        lang="<?php echo htmlspecialchars($welcomeLanguageCode, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($welcomeLanguageName, ENT_QUOTES, 'UTF-8'); ?></button>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <div class="welcome-shell">
        <header class="welcome-hero">
            <h1 class="welcome-title" data-i18n="welcome_page.title"><?php echo t_h('welcome_page.title', [], 'Welcome to Poznote'); ?></h1>
            <p class="welcome-lead" data-i18n="welcome_page.lead"><?php echo t_h('welcome_page.lead', [], 'Happy to have you here. Take a minute to make Poznote yours.'); ?></p>
        </header>

        <form id="welcomeForm" class="welcome-form" autocomplete="on">
            <section class="welcome-card">
                <div class="welcome-grid">
                    <div class="welcome-field">
                        <label for="welcomeLanguage"><i class="lucide lucide-globe"></i><span data-i18n="welcome_page.preferences.language"><?php echo t_h('welcome_page.preferences.language', [], 'Language'); ?></span></label>
                        <select id="welcomeLanguage" name="language">
                            <?php foreach ($welcomeLanguages as $welcomeLanguageCode => $welcomeLanguageName): ?>
                            <option value="<?php echo htmlspecialchars($welcomeLanguageCode, ENT_QUOTES, 'UTF-8'); ?>" lang="<?php echo htmlspecialchars($welcomeLanguageCode, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($welcomeLanguageName, ENT_QUOTES, 'UTF-8'); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="welcome-field">
                        <label for="welcomeTheme"><i class="lucide lucide-palette"></i><span data-i18n="welcome_page.preferences.theme"><?php echo t_h('welcome_page.preferences.theme', [], 'Theme'); ?></span></label>
                        <select id="welcomeTheme" name="theme">
                            <option value="system" data-i18n="welcome_page.preferences.theme_system"><?php echo t_h('welcome_page.preferences.theme_system', [], 'Same as my system'); ?></option>
                            <?php foreach ($welcomeThemes as $welcomeTheme): ?>
                            <option value="<?php echo htmlspecialchars($welcomeTheme['id'], ENT_QUOTES, 'UTF-8'); ?>"<?php echo $welcomeTheme['key'] !== '' ? ' data-i18n="' . htmlspecialchars($welcomeTheme['key'], ENT_QUOTES, 'UTF-8') . '"' : ''; ?>><?php echo htmlspecialchars($welcomeTheme['label'], ENT_QUOTES, 'UTF-8'); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="welcome-field">
                        <label for="welcomeDateFormat"><i class="lucide lucide-calendar"></i><span data-i18n="welcome_page.preferences.date_format"><?php echo t_h('welcome_page.preferences.date_format', [], 'Date and time format'); ?></span></label>
                        <select id="welcomeDateFormat" name="date_time_format">
                            <?php foreach ($welcomeDateFormats as $welcomeFormat): ?>
                            <option value="<?php echo htmlspecialchars($welcomeFormat, ENT_QUOTES, 'UTF-8'); ?>" data-i18n="modals.date_time_format.options.<?php echo htmlspecialchars($welcomeFormat, ENT_QUOTES, 'UTF-8'); ?>"><?php echo t_h('modals.date_time_format.options.' . $welcomeFormat, [], $welcomeFormat); ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="welcome-field">
                        <label for="welcomeTimezone"><i class="lucide lucide-clock"></i><span data-i18n="welcome_page.preferences.timezone"><?php echo t_h('welcome_page.preferences.timezone', [], 'Timezone'); ?></span></label>
                        <select id="welcomeTimezone" name="timezone">
<?php include __DIR__ . '/../timezone_options.php'; ?>
                        </select>
                    </div>
                </div>
            </section>

            <section class="welcome-card">
                <h2 class="welcome-card-title"><i class="lucide lucide-shield"></i><span data-i18n="welcome_page.account.title"><?php echo t_h('welcome_page.account.title', [], 'Your account'); ?></span></h2>
                <p class="welcome-card-hint" data-i18n="welcome_page.account.hint"><?php echo t_h('welcome_page.account.hint', [], 'The username and password you will sign in with.'); ?></p>
                <?php if ($welcomeDefaults['password']): ?>
                <!-- Why this card matters on a fresh install, so it is read
                     before the fields rather than after them. data-i18n-vars
                     carries the password to the language preview, which
                     rebuilds the text from the dictionary and would otherwise
                     print the raw placeholder. -->
                <p class="welcome-password-warning" data-i18n="welcome_page.account.password_default_hint"
                   data-i18n-vars="<?php echo htmlspecialchars(json_encode(['password' => $welcomeDefaultPassword]) ?: '{}', ENT_QUOTES, 'UTF-8'); ?>"><?php
                    echo t_h('welcome_page.account.password_default_hint', ['password' => $welcomeDefaultPassword], 'This account still uses the password it was installed with ({{password}}). Choose your own now.');
                ?></p>
                <?php endif; ?>

                <div class="welcome-grid">
                    <div class="welcome-field welcome-field-wide">
                        <label for="welcomeUsername"><i class="lucide lucide-user"></i><span data-i18n="welcome_page.account.username"><?php echo t_h('welcome_page.account.username', [], 'Username'); ?></span></label>
                        <input type="text" id="welcomeUsername" name="username" autocomplete="username" maxlength="60"
                               value="<?php echo htmlspecialchars($welcomeUsername, ENT_QUOTES, 'UTF-8'); ?>">
                        <p class="welcome-field-hint" data-i18n="<?php echo $welcomeDefaults['username'] ? 'welcome_page.account.username_default_hint' : 'welcome_page.account.username_hint'; ?>"><?php
                            echo $welcomeDefaults['username']
                                ? t_h('welcome_page.account.username_default_hint', [], 'This account still answers to the username it was installed with. Pick your own.')
                                : t_h('welcome_page.account.username_hint', [], 'Letters, digits, dots, underscores and dashes.');
                        ?></p>
                    </div>

                    <?php if ($welcomePasswordAvailable): ?>
                    <div class="welcome-passwords<?php echo $welcomeKnowsCurrentPassword ? ' welcome-passwords-pair' : ''; ?>">
                        <?php if (!$welcomeKnowsCurrentPassword): ?>
                        <div class="welcome-field">
                            <label for="welcomeCurrentPassword"><span data-i18n="welcome_page.account.current_password"><?php echo t_h('welcome_page.account.current_password', [], 'Current password'); ?></span></label>
                            <input type="password" id="welcomeCurrentPassword" name="current_password" autocomplete="current-password">
                        </div>
                        <?php endif; ?>
                        <div class="welcome-field">
                            <label for="welcomeNewPassword"><span data-i18n="welcome_page.account.new_password"><?php echo t_h('welcome_page.account.new_password', [], 'New password'); ?></span></label>
                            <input type="password" id="welcomeNewPassword" name="new_password" autocomplete="new-password">
                        </div>
                        <div class="welcome-field">
                            <label for="welcomeConfirmPassword"><span data-i18n="welcome_page.account.confirm_password"><?php echo t_h('welcome_page.account.confirm_password', [], 'Confirm password'); ?></span></label>
                            <input type="password" id="welcomeConfirmPassword" name="confirm_password" autocomplete="new-password">
                        </div>
                    </div>
                    <?php else: ?>
                    <p class="welcome-field-hint welcome-field-wide" data-i18n="welcome_page.account.password_unavailable"><?php echo t_h('welcome_page.account.password_unavailable', [], 'You sign in through your identity provider, so there is no password to set here.'); ?></p>
                    <?php endif; ?>
                </div>

                <div class="welcome-error" id="welcomeError" hidden>
                    <i class="lucide lucide-alert-triangle"></i>
                    <span id="welcomeErrorText"></span>
                </div>
            </section>

            <!-- The last thing read before the button: what the guide leaves
                 out is not lost, it is in Settings. The text sits in its own
                 span so retranslating it does not take the icon with it. -->
            <p class="welcome-footnote">
                <i class="lucide lucide-settings"></i>
                <span data-i18n="welcome_page.footnote"><?php echo t_h('welcome_page.footnote', [], 'All of this, and a lot more, can be changed later in Settings.'); ?></span>
            </p>
            <div class="welcome-actions">
                <button type="submit" class="btn btn-primary" id="welcomeStartBtn" data-i18n="welcome_page.start"><?php echo t_h('welcome_page.start', [], 'Start using Poznote'); ?></button>
            </div>
        </form>
    </div>

    <script type="application/json" id="welcome-config"><?php
        echo json_encode([
            'timezone' => $welcomeTimezone,
            'dateTimeFormat' => in_array($welcomeDateFormat, $welcomeDateFormats, true) ? $welcomeDateFormat : 'default',
            'language' => $currentLang,
            'passwordAvailable' => $welcomePasswordAvailable,
            // Only set when the field above was dropped, and only ever the
            // build's own default, which the hint next to it already spells
            // out. The API still verifies it: nothing is taken on trust here.
            'currentPassword' => $welcomeKnowsCurrentPassword ? $welcomeDefaultPassword : null,
            'username' => $welcomeUsername,
            // The strings the script produces on its own, in the page's
            // language. Shaped like the dictionary the language preview
            // fetches, which replaces this wholesale.
            'strings' => [
                'welcome_page' => [
                    'saving' => t('welcome_page.saving', [], 'Saving...'),
                    'errors' => [
                        'generic' => t('welcome_page.errors.generic', [], 'Something went wrong. Please try again.'),
                        'username_required' => t('welcome_page.errors.username_required', [], 'A username is required.'),
                        'password_incomplete' => t('welcome_page.errors.password_incomplete', [], 'Fill in the three password boxes, or leave all three empty.'),
                        'password_mismatch' => t('welcome_page.errors.password_mismatch', [], 'The two new passwords do not match.'),
                        'password_too_short' => t('welcome_page.errors.password_too_short', [], 'The password must be at least 4 characters.'),
                    ],
                ],
            ],
        ], JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_HEX_AMP) ?: '{}';
    ?></script>
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <script src="js/welcome-page.js?v=<?php echo $cache_v; ?>"></script>
</body>
</html>

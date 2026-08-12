<?php
/**
 * Outgoing Webhooks - Admin Tool
 *
 * Register HTTP endpoints notified of instance events (e.g. user.created).
 */

require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
requireSettingsPassword();

if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding:20px;font-family:sans-serif;color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;border-radius:4px;margin:20px;">' . htmlspecialchars(t('multiuser.admin.access_denied_admin', [], 'Access denied. Admin privileges required.'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</div>';
    exit;
}

require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../WebhookDispatcher.php';
require_once __DIR__ . '/../version_helper.php';

$v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());

$success = '';
$warning = '';
$error = '';

function webhooks_h($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function webhooks_is_valid_url(string $url): bool {
    return filter_var($url, FILTER_VALIDATE_URL) !== false
        && preg_match('#^https?://#i', $url) === 1;
}

/**
 * Instance URL used to build the direct note links carried by the payloads
 * (data.note.url). Stored in the shared smtp_app_url setting: the reminder
 * email channel and the webhooks both link to the same instance, so there is
 * one value rather than two that could drift apart.
 */
function webhooks_app_url(): string {
    $url = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
    if ($url === '' && function_exists('_env')) {
        $url = rtrim(trim((string)_env('POZNOTE_APP_URL', _env('APP_URL', ''))), '/');
    }
    return $url;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_POST['csrf_token'] ?? '';
    if (!isset($_SESSION['webhooks_csrf_token']) || !hash_equals($_SESSION['webhooks_csrf_token'], $token)) {
        $error = t('webhooks_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'save_app_url') {
            // Same normalisation and validation as the settings API so both
            // entry points can never store a value the dispatcher rejects.
            $appUrl = rtrim(trim((string)($_POST['app_url'] ?? '')), '/');
            if ($appUrl !== '' && !webhooks_is_valid_url($appUrl)) {
                $error = t('webhooks_admin.error_invalid_app_url', [], 'The instance URL must start with http:// or https://.');
            } elseif (setGlobalSetting('smtp_app_url', $appUrl)) {
                $success = $appUrl === ''
                    ? t('webhooks_admin.app_url_cleared', [], 'Instance URL cleared. Payloads will no longer carry a direct note link.')
                    : t('webhooks_admin.app_url_saved', [], 'Instance URL saved.');
            } else {
                $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
            }
        } elseif ($action === 'add') {
            $url = trim((string)($_POST['webhook_url'] ?? ''));
            $secret = trim((string)($_POST['webhook_secret'] ?? ''));
            $description = mb_substr(trim((string)($_POST['webhook_description'] ?? '')), 0, 500);
            $events = $_POST['webhook_events'] ?? [];
            if (!is_array($events)) {
                $events = [];
            }
            $events = array_values(array_intersect(WebhookDispatcher::INSTANCE_EVENTS, array_map('strval', $events)));

            $urlAlreadyRegistered = false;
            foreach (listWebhooks() as $existing) {
                if (trim((string)$existing['url']) === $url) {
                    $urlAlreadyRegistered = true;
                    break;
                }
            }

            if (!webhooks_is_valid_url($url)) {
                $error = t('webhooks_admin.error_invalid_url', [], 'The webhook URL must start with http:// or https://.');
            } elseif (empty($events)) {
                $error = t('webhooks_admin.error_no_events', [], 'Select at least one event.');
            } elseif (createWebhook($url, $secret, $events, null, $description)) {
                if ($urlAlreadyRegistered) {
                    $warning = t('webhooks_admin.added_duplicate', [], 'Webhook added, but this URL was already registered: each entry will receive its own delivery for every event.');
                } else {
                    $success = t('webhooks_admin.added', [], 'Webhook added.');
                }
            } else {
                $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
            }
        } elseif (in_array($action, ['delete', 'enable', 'disable', 'test', 'edit'], true)) {
            $id = (int)($_POST['webhook_id'] ?? 0);
            $webhook = $id > 0 ? getWebhookById($id) : null;
            if ($webhook && !isInstanceWebhook($webhook)) {
                // Reminder webhooks are managed from the primary account's page
                $webhook = null;
            }
            if (!$webhook) {
                $error = t('webhooks_admin.error_not_found', [], 'Webhook not found.');
            } elseif ($action === 'edit') {
                $url = trim((string)($_POST['webhook_url'] ?? ''));
                $secret = trim((string)($_POST['webhook_secret'] ?? ''));
                $description = mb_substr(trim((string)($_POST['webhook_description'] ?? '')), 0, 500);
                $events = $_POST['webhook_events'] ?? [];
                if (!is_array($events)) {
                    $events = [];
                }
                $events = array_values(array_intersect(WebhookDispatcher::INSTANCE_EVENTS, array_map('strval', $events)));

                if (!webhooks_is_valid_url($url)) {
                    $error = t('webhooks_admin.error_invalid_url', [], 'The webhook URL must start with http:// or https://.');
                } elseif (empty($events)) {
                    $error = t('webhooks_admin.error_no_events', [], 'Select at least one event.');
                } elseif (updateWebhook($id, $url, $secret, $events, $description)) {
                    $success = t('webhooks_admin.updated', [], 'Webhook updated.');
                } else {
                    $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
                }
            } elseif ($action === 'delete') {
                if (deleteWebhook($id)) {
                    $success = t('webhooks_admin.deleted', [], 'Webhook deleted.');
                } else {
                    $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
                }
            } elseif ($action === 'enable' || $action === 'disable') {
                if (setWebhookActive($id, $action === 'enable')) {
                    $success = $action === 'enable'
                        ? t('webhooks_admin.enabled', [], 'Webhook enabled.')
                        : t('webhooks_admin.disabled', [], 'Webhook disabled.');
                } else {
                    $error = t('webhooks_admin.error_saving', [], 'Error saving the webhook.');
                }
            } else {
                $delivery = (new WebhookDispatcher())->deliver($webhook, 'ping', [
                    'message' => 'Poznote webhook test',
                ]);
                if ($delivery['success']) {
                    $success = t('webhooks_admin.test_success', ['status' => $delivery['status']], 'Test delivered (HTTP {{status}}).');
                } else {
                    $error = t('webhooks_admin.test_failure', ['status' => $delivery['status']], 'Test delivery failed ({{status}}).');
                }
            }
        }
    }
}

$_SESSION['webhooks_csrf_token'] = bin2hex(random_bytes(32));
// Reminder-only webhooks are managed from the primary account's settings page
$webhooks = array_values(array_filter(listWebhooks(), 'isInstanceWebhook'));

// Read back after the POST so the field shows what was just saved. The stored
// setting is shown on its own: an env-provided fallback is not editable here,
// so the placeholder tells the admin what is in effect instead.
$storedAppUrl = rtrim(trim((string)getGlobalSetting('smtp_app_url', '')), '/');
$effectiveAppUrl = webhooks_app_url();

// Hover help for each event, same bubble pattern as the settings cards.
// i18n keys replace the dots of the event name with underscores.
$eventHelpDefaults = [
    'user.created' => 'A user account was created, by an admin, through the API or an SSO signup. Payload: the user profile and the creation source.',
    'user.updated' => 'A user profile changed: username, email, name or admin role. Payload: the updated profile and the list of changed fields.',
    'user.activated' => 'A previously deactivated user account was re-enabled. Payload: the user profile.',
    'user.deactivated' => 'A user account was deactivated and can no longer sign in. Payload: the user profile.',
    'user.deleted' => 'A user account was deleted. Payload: the profile as it was before deletion.',
    'signup.cap_reached' => 'An SSO signup was refused because the instance reached its maximum number of users. Payload: the cap and the attempted username and email.',
    'quota.notes_reached' => 'A user action was blocked because their notes quota is reached. Payload: the user, the limit and the current count.',
    'quota.storage_reached' => 'A user action was blocked because their storage quota is reached. Payload: the user, the limit and the current usage.',
    'settings.language_changed' => 'A user changed the interface language in the settings. Payload: the user profile, the new language code, the previous one, and whether the change came from the interface or the REST API.',
];
$eventHelp = [];
foreach ($eventHelpDefaults as $eventName => $default) {
    $eventHelp[$eventName] = t('webhooks_admin.event_help.' . str_replace('.', '_', $eventName), [], $default);
}
?>
<!DOCTYPE html>
<html lang="<?php echo webhooks_h($currentLang); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo t_h('webhooks_admin.title', [], 'Webhooks'); ?> - Poznote</title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/workspaces.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/modals/alerts-utilities.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/modal-alerts.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/workspaces-inline.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/webhooks.css?v=<?php echo $v; ?>">
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>
</head>
<body data-workspace="<?php echo webhooks_h($pageWorkspace); ?>">
<div class="settings-container webhooks-page">
    <div class="workspaces-nav">
        <a href="../index.php<?php echo $pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : ''; ?>" class="btn btn-secondary">
            <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
        </a>
        <a href="../settings.php" class="btn btn-secondary">
            <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
            <?php echo t_h('common.back_to_settings', [], 'Settings'); ?>
        </a>
    </div>

    <?php if ($success || $warning || $error): ?>
        <div class="alert-with-margin alert <?php echo $success ? 'alert-success' : ($warning ? 'alert-warning' : 'alert-danger'); ?>">
            <?php echo webhooks_h($success ?: ($warning ?: $error)); ?>
        </div>
    <?php endif; ?>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_app_url', [], 'Instance URL'); ?></h2>
        <p class="webhooks-section-hint">
            <?php echo t_h('webhooks_admin.app_url_description', [], 'Public URL of this Poznote instance, used to build the direct note link sent in the payloads (data.note.url). Leave it empty to send no link. This is the same instance URL as the one used by the reminder emails.'); ?>
        </p>
        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
            <input type="hidden" name="action" value="save_app_url">
            <div class="webhooks-field">
                <label for="app_url"><?php echo t_h('webhooks_admin.fields.app_url', [], 'Instance URL'); ?></label>
                <input type="url" id="app_url" name="app_url" value="<?php echo webhooks_h($storedAppUrl); ?>" placeholder="https://poznote.example.com">
                <?php if ($storedAppUrl === '' && $effectiveAppUrl !== ''): ?>
                    <span class="webhooks-hint">
                        <?php echo t_h('webhooks_admin.hints.app_url_env', ['url' => $effectiveAppUrl], 'Currently provided by the POZNOTE_APP_URL environment variable: {{url}}. Saving a value here overrides it.'); ?>
                    </span>
                <?php elseif ($effectiveAppUrl === ''): ?>
                    <span class="webhooks-hint">
                        <?php echo t_h('webhooks_admin.hints.app_url_unset', [], 'Not set: the payloads currently carry no note link (data.note.url is null).'); ?>
                    </span>
                <?php endif; ?>
            </div>
            <div class="webhooks-add-actions">
                <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </form>
    </div>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_add', [], 'Add a webhook'); ?></h2>
        <p class="webhooks-section-hint">
            <?php echo t_h('webhooks_admin.description', [], 'Poznote sends an HTTP POST request with a JSON payload to each registered endpoint when a subscribed event occurs. If a secret is set, the payload is signed with HMAC-SHA256 in the X-Poznote-Signature-256 header.'); ?>
        </p>
        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
            <input type="hidden" name="action" value="add">
            <div class="webhooks-field">
                <label for="webhook_url"><?php echo t_h('webhooks_admin.fields.url', [], 'Endpoint URL'); ?></label>
                <input type="url" id="webhook_url" name="webhook_url" placeholder="https://example.com/webhook" required>
            </div>
            <div class="webhooks-field">
                <label for="webhook_description"><?php echo t_h('webhooks_admin.fields.description', [], 'Description (optional)'); ?></label>
                <input type="text" id="webhook_description" name="webhook_description" maxlength="500" autocomplete="off" placeholder="<?php echo t_h('webhooks_admin.placeholders.description', [], 'What this webhook is used for'); ?>">
                <span class="webhooks-hint"><?php echo t_h('webhooks_admin.hints.description', [], 'Shown in the list below to tell your endpoints apart. Never sent to the endpoint.'); ?></span>
            </div>
            <div class="webhooks-field">
                <label for="webhook_secret"><?php echo t_h('webhooks_admin.fields.secret', [], 'Secret (optional)'); ?></label>
                <input type="text" id="webhook_secret" name="webhook_secret" autocomplete="off">
                <span class="webhooks-hint"><?php echo t_h('webhooks_admin.hints.secret', [], 'Used to sign the payload so the receiver can verify it comes from this instance.'); ?></span>
            </div>
            <div class="webhooks-field">
                <label><?php echo t_h('webhooks_admin.fields.events', [], 'Events'); ?></label>
                <div class="webhooks-events">
                    <?php foreach (WebhookDispatcher::INSTANCE_EVENTS as $eventName): ?>
                        <span class="webhooks-event">
                            <label class="webhooks-event-label">
                                <input type="checkbox" name="webhook_events[]" value="<?php echo webhooks_h($eventName); ?>" checked>
                                <code><?php echo webhooks_h($eventName); ?></code>
                            </label>
                            <?php if (!empty($eventHelp[$eventName])): ?>
                                <span class="webhooks-event-help" data-tooltip="<?php echo webhooks_h($eventHelp[$eventName]); ?>"><i class="lucide lucide-help-circle"></i></span>
                            <?php endif; ?>
                        </span>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="webhooks-add-actions">
                <button type="submit" class="btn btn-primary"><?php echo t_h('webhooks_admin.add_button', [], 'Add webhook'); ?></button>
            </div>
        </form>
    </div>

    <div class="settings-section webhooks-section">
        <h2><?php echo t_h('webhooks_admin.section_list', [], 'Registered webhooks'); ?></h2>
        <?php if (empty($webhooks)): ?>
            <p class="webhooks-section-hint"><?php echo t_h('webhooks_admin.empty', [], 'No webhook registered yet.'); ?></p>
        <?php else: ?>
            <div class="webhooks-list">
                <?php foreach ($webhooks as $webhook): ?>
                    <?php
                        $webhookId = (int)$webhook['id'];
                        $isActive = !empty($webhook['active']);
                        $lastStatus = trim((string)($webhook['last_status'] ?? ''));
                        $lastAt = trim((string)($webhook['last_delivery_at'] ?? ''));
                        $description = trim((string)($webhook['description'] ?? ''));
                        $webhookEvents = array_values(array_filter(array_map('trim', explode(',', (string)$webhook['events'])), 'strlen'));
                    ?>
                    <div class="webhooks-item" data-webhook-id="<?php echo $webhookId; ?>">
                        <div class="webhooks-item-info">
                            <span class="webhooks-item-url"><?php echo webhooks_h($webhook['url']); ?></span>
                            <?php if ($description !== ''): ?>
                                <span class="webhooks-item-description"><?php echo webhooks_h($description); ?></span>
                            <?php endif; ?>
                            <span class="webhooks-item-events">
                                <?php foreach ($webhookEvents as $webhookEvent): ?>
                                    <code class="webhooks-item-event"><?php echo webhooks_h($webhookEvent); ?></code>
                                <?php endforeach; ?>
                            </span>
                            <span class="webhooks-item-meta">
                                <span class="webhooks-state <?php echo $isActive ? 'is-enabled' : 'is-disabled'; ?>">
                                    <?php echo $isActive ? t_h('common.enabled', [], 'Enabled') : t_h('common.disabled', [], 'Disabled'); ?>
                                </span>
                                <?php if (!empty($webhook['secret'])): ?>
                                    <span><?php echo t_h('webhooks_admin.signed', [], 'Signed'); ?></span>
                                <?php endif; ?>
                                <?php if ($lastStatus !== ''): ?>
                                    <span><?php echo t_h('webhooks_admin.last_delivery', ['status' => $lastStatus, 'date' => $lastAt], 'Last delivery: {{status}} ({{date}} UTC)'); ?></span>
                                <?php endif; ?>
                            </span>
                        </div>
                        <div class="webhooks-item-actions">
                            <div class="webhooks-actions-dropdown">
                                <button type="button" class="btn btn-secondary webhooks-actions-toggle" data-webhook-menu-toggle="<?php echo $webhookId; ?>" aria-haspopup="true" aria-expanded="false" aria-label="<?php echo t_h('webhooks_admin.actions_menu', [], 'Actions'); ?>">
                                    <i class="lucide lucide-more-horizontal"></i>
                                </button>
                                <div class="webhooks-actions-menu" id="webhooks-actions-menu-<?php echo $webhookId; ?>" hidden>
                                    <button type="button" class="webhooks-actions-item" data-webhook-edit="<?php echo $webhookId; ?>">
                                        <i class="lucide lucide-pencil"></i><?php echo t_h('webhooks_admin.edit_button', [], 'Edit'); ?>
                                    </button>
                                    <form method="POST" action="">
                                        <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
                                        <input type="hidden" name="webhook_id" value="<?php echo $webhookId; ?>">
                                        <button type="submit" name="action" value="test" class="webhooks-actions-item">
                                            <i class="lucide lucide-zap"></i><?php echo t_h('webhooks_admin.test_button', [], 'Send test'); ?>
                                        </button>
                                        <button type="submit" name="action" value="<?php echo $isActive ? 'disable' : 'enable'; ?>" class="webhooks-actions-item">
                                            <i class="lucide <?php echo $isActive ? 'lucide-pause' : 'lucide-play'; ?>"></i><?php echo $isActive ? t_h('webhooks_admin.disable_button', [], 'Disable') : t_h('webhooks_admin.enable_button', [], 'Enable'); ?>
                                        </button>
                                        <button type="submit" name="action" value="delete" class="webhooks-actions-item is-danger" data-webhook-delete-confirm="<?php echo t_h('webhooks_admin.delete_confirm', [], 'Delete this webhook? This cannot be undone.'); ?>" data-webhook-delete-title="<?php echo t_h('webhooks_admin.delete_title', [], 'Delete webhook'); ?>" data-webhook-delete-label="<?php echo t_h('common.delete', [], 'Delete'); ?>">
                                            <i class="lucide lucide-trash-2"></i><?php echo t_h('common.delete', [], 'Delete'); ?>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <div class="webhooks-edit" id="webhooks-edit-<?php echo $webhookId; ?>" hidden>
                            <form method="POST" action="">
                                <input type="hidden" name="csrf_token" value="<?php echo webhooks_h($_SESSION['webhooks_csrf_token']); ?>">
                                <input type="hidden" name="action" value="edit">
                                <input type="hidden" name="webhook_id" value="<?php echo $webhookId; ?>">
                                <div class="webhooks-field">
                                    <label for="webhook_url_<?php echo $webhookId; ?>"><?php echo t_h('webhooks_admin.fields.url', [], 'Endpoint URL'); ?></label>
                                    <input type="url" id="webhook_url_<?php echo $webhookId; ?>" name="webhook_url" value="<?php echo webhooks_h($webhook['url']); ?>" required>
                                </div>
                                <div class="webhooks-field">
                                    <label for="webhook_description_<?php echo $webhookId; ?>"><?php echo t_h('webhooks_admin.fields.description', [], 'Description (optional)'); ?></label>
                                    <input type="text" id="webhook_description_<?php echo $webhookId; ?>" name="webhook_description" maxlength="500" autocomplete="off" value="<?php echo webhooks_h($description); ?>" placeholder="<?php echo t_h('webhooks_admin.placeholders.description', [], 'What this webhook is used for'); ?>">
                                </div>
                                <div class="webhooks-field">
                                    <label for="webhook_secret_<?php echo $webhookId; ?>"><?php echo t_h('webhooks_admin.fields.secret', [], 'Secret (optional)'); ?></label>
                                    <input type="text" id="webhook_secret_<?php echo $webhookId; ?>" name="webhook_secret" autocomplete="off" value="<?php echo webhooks_h((string)($webhook['secret'] ?? '')); ?>">
                                    <span class="webhooks-hint"><?php echo t_h('webhooks_admin.hints.secret', [], 'Used to sign the payload so the receiver can verify it comes from this instance.'); ?></span>
                                </div>
                                <div class="webhooks-field">
                                    <label><?php echo t_h('webhooks_admin.fields.events', [], 'Events'); ?></label>
                                    <div class="webhooks-events">
                                        <?php foreach (WebhookDispatcher::INSTANCE_EVENTS as $eventName): ?>
                                            <span class="webhooks-event">
                                                <label class="webhooks-event-label">
                                                    <input type="checkbox" name="webhook_events[]" value="<?php echo webhooks_h($eventName); ?>" <?php echo in_array($eventName, $webhookEvents, true) ? 'checked' : ''; ?>>
                                                    <code><?php echo webhooks_h($eventName); ?></code>
                                                </label>
                                                <?php if (!empty($eventHelp[$eventName])): ?>
                                                    <span class="webhooks-event-help" data-tooltip="<?php echo webhooks_h($eventHelp[$eventName]); ?>"><i class="lucide lucide-help-circle"></i></span>
                                                <?php endif; ?>
                                            </span>
                                        <?php endforeach; ?>
                                    </div>
                                </div>
                                <div class="webhooks-edit-actions">
                                    <button type="button" class="btn btn-secondary" data-webhook-edit-cancel="<?php echo $webhookId; ?>"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
                                </div>
                            </form>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</div>
<script src="../js/modal-alerts.js?v=<?php echo $v; ?>"></script>
<script src="../js/webhooks-page.js?v=<?php echo $v; ?>"></script>
</body>
</html>

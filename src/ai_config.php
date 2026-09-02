<?php
/**
 * Shared AI assistant configuration.
 *
 * Two configurations can feed the in-app AI chat:
 *   - the instance one, stored in master.db (global_settings), managed by an
 *     administrator in ai_settings.php and granted per user through the
 *     allowed-users list;
 *   - a personal one, stored in the user's own database, set by the user in
 *     ai_settings_user.php when the administrator allows personal API keys.
 *
 * A personal configuration always wins over the instance one: a user who took
 * the trouble to enter their own key expects their own provider to answer.
 */

require_once __DIR__ . '/users/db_master.php';

/** Providers offered by both settings pages. */
function poznoteAiProviders(): array {
    return ['ollama', 'lmstudio', 'anthropic', 'openai', 'custom'];
}

/** Providers whose URL is fixed (the URL field is hidden in the UI). */
function poznoteAiFixedUrls(): array {
    return ['anthropic' => 'https://api.anthropic.com', 'openai' => 'https://api.openai.com'];
}

/**
 * Reasoning effort values offered by both settings pages, in display order.
 * 'auto' sends nothing and leaves the choice to the provider; the others are
 * sent verbatim as the reasoning_effort parameter of every chat request
 * (OpenAI GPT-5 / o-series, gpt-oss on Ollama, ...). Some OpenAI models only
 * accept tools when reasoning_effort is 'none', which is why the setting
 * exists (issue #1308).
 */
function poznoteAiReasoningEfforts(): array {
    return ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
}

/** English fallback labels of the reasoning effort options (i18n defaults). */
function poznoteAiReasoningEffortLabels(): array {
    return [
        'auto' => 'Auto (provider default)',
        'none' => 'None',
        'minimal' => 'Minimal',
        'low' => 'Low',
        'medium' => 'Medium',
        'high' => 'High',
        'xhigh' => 'Very high (xhigh)',
    ];
}

/** Unknown or empty values (older configurations) mean 'auto'. */
function poznoteAiNormalizeReasoningEffort($value): string {
    $value = strtolower(trim((string)$value));
    return in_array($value, poznoteAiReasoningEfforts(), true) ? $value : 'auto';
}

/**
 * Derive a 32-byte key from the instance secret, the same file GitSync and
 * share passwords use, so personal API keys are never stored in clear text.
 */
function poznoteAiEncryptionKey(): string {
    $keyFile = __DIR__ . '/data/.app_secret';
    $envSecret = getenv('POZNOTE_APP_SECRET');

    if ($envSecret) {
        if (!file_exists($keyFile)) {
            $dir = dirname($keyFile);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }
            file_put_contents($keyFile, $envSecret);
            chmod($keyFile, 0600);
        }
        return hash('sha256', $envSecret, true);
    }

    if (file_exists($keyFile)) {
        $secret = trim((string)file_get_contents($keyFile));
    } else {
        $dir = dirname($keyFile);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $secret = bin2hex(random_bytes(32));
        file_put_contents($keyFile, $secret);
        chmod($keyFile, 0600);
    }

    return hash('sha256', $secret, true);
}

function poznoteAiEncryptSecret(string $plain): string {
    if ($plain === '' || !function_exists('openssl_encrypt')) {
        return $plain;
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', poznoteAiEncryptionKey(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        return $plain;
    }
    return 'enc1:' . base64_encode($iv . $tag . $cipher);
}

function poznoteAiDecryptSecret(string $stored): string {
    if ($stored === '' || strncmp($stored, 'enc1:', 5) !== 0) {
        // Legacy plaintext value — return as-is
        return $stored;
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }
    $data = base64_decode(substr($stored, 5), true);
    if ($data === false || strlen($data) < 29) {
        return '';
    }
    $iv = substr($data, 0, 12);
    $tag = substr($data, 12, 16);
    $cipher = substr($data, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', poznoteAiEncryptionKey(), OPENSSL_RAW_DATA, $iv, $tag);
    return $plain !== false ? $plain : '';
}

/**
 * True when the administrator lets users configure their own AI provider.
 * This applies to every user: the allowed-users list of ai_settings.php only
 * governs access to the instance configuration.
 */
function poznoteAiUserKeysAllowed(): bool {
    return (string)getGlobalSetting('ai_chat_user_keys_enabled', '0') === '1';
}

/**
 * Instance-wide configuration (master.db), managed by an administrator.
 */
function poznoteAiInstanceConfig(): array {
    return [
        'enabled' => (string)getGlobalSetting('ai_chat_enabled', '0') === '1',
        'provider' => (string)getGlobalSetting('ai_chat_provider', ''),
        'url' => trim((string)getGlobalSetting('ai_chat_url', '')),
        'model' => trim((string)getGlobalSetting('ai_chat_model', '')),
        'api_key' => trim((string)getGlobalSetting('ai_chat_api_key', '')),
        'reasoning_effort' => poznoteAiNormalizeReasoningEffort(getGlobalSetting('ai_chat_reasoning_effort', 'auto')),
    ];
}

/** Keys used in the user database settings table. */
function poznoteAiUserSettingKeys(): array {
    return [
        'enabled' => 'ai_user_enabled',
        'provider' => 'ai_user_provider',
        'url' => 'ai_user_url',
        'model' => 'ai_user_model',
        'api_key' => 'ai_user_api_key',
        'reasoning_effort' => 'ai_user_reasoning_effort',
    ];
}

/**
 * Personal configuration read from the user's own database.
 * The API key comes back decrypted.
 */
function poznoteAiUserConfig(?PDO $con): array {
    $config = ['enabled' => false, 'provider' => '', 'url' => '', 'model' => '', 'api_key' => '', 'reasoning_effort' => 'auto'];
    if (!$con) {
        return $config;
    }
    try {
        $keys = poznoteAiUserSettingKeys();
        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $con->prepare("SELECT key, value FROM settings WHERE key IN ($placeholders)");
        $stmt->execute(array_values($keys));
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $rows[$row['key']] = (string)($row['value'] ?? '');
        }
        $config['enabled'] = ($rows[$keys['enabled']] ?? '0') === '1';
        $config['provider'] = trim($rows[$keys['provider']] ?? '');
        $config['url'] = trim($rows[$keys['url']] ?? '');
        $config['model'] = trim($rows[$keys['model']] ?? '');
        $config['api_key'] = poznoteAiDecryptSecret($rows[$keys['api_key']] ?? '');
        $config['reasoning_effort'] = poznoteAiNormalizeReasoningEffort($rows[$keys['reasoning_effort']] ?? 'auto');
    } catch (Exception $e) {
        // A database without the settings table yet: no personal configuration
    }
    return $config;
}

/**
 * Save the personal configuration. Only the keys present in $config are
 * written, so an omitted api_key keeps the stored one.
 */
function poznoteSaveAiUserConfig(?PDO $con, array $config): bool {
    if (!$con) {
        return false;
    }
    try {
        $keys = poznoteAiUserSettingKeys();
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
        foreach ($keys as $inputKey => $dbKey) {
            if (!array_key_exists($inputKey, $config)) {
                continue;
            }
            $value = trim((string)$config[$inputKey]);
            if ($inputKey === 'api_key') {
                $value = poznoteAiEncryptSecret($value);
            } elseif ($inputKey === 'reasoning_effort') {
                $value = poznoteAiNormalizeReasoningEffort($value);
            }
            $stmt->execute([$dbKey, $value]);
        }
        return true;
    } catch (Exception $e) {
        error_log('Failed to save personal AI configuration: ' . $e->getMessage());
        return false;
    }
}

/** A configuration can answer chat requests once it has a URL and a model. */
function poznoteAiConfigUsable(array $config): bool {
    return !empty($config['enabled']) && trim((string)$config['url']) !== '' && trim((string)$config['model']) !== '';
}

/**
 * The configuration the AI chat must actually use for this user.
 * Returns ['available' => bool, 'source' => 'user'|'instance'|'', 'url', 'model', 'api_key', 'reasoning_effort'].
 */
function poznoteResolveAiChatConfig(?PDO $con, ?int $userId): array {
    $none = ['available' => false, 'source' => '', 'url' => '', 'model' => '', 'api_key' => '', 'reasoning_effort' => 'auto'];

    if (poznoteAiUserKeysAllowed()) {
        $userConfig = poznoteAiUserConfig($con);
        if (poznoteAiConfigUsable($userConfig)) {
            return [
                'available' => true,
                'source' => 'user',
                'url' => $userConfig['url'],
                'model' => $userConfig['model'],
                'api_key' => $userConfig['api_key'],
                'reasoning_effort' => $userConfig['reasoning_effort'],
            ];
        }
    }

    $instance = poznoteAiInstanceConfig();
    // Access to the instance configuration is opt-in, granted per user by an
    // administrator in ai_settings.php
    if (poznoteAiConfigUsable($instance) && isAiChatAllowedForUser($userId)) {
        return [
            'available' => true,
            'source' => 'instance',
            'url' => $instance['url'],
            'model' => $instance['model'],
            'api_key' => $instance['api_key'],
            'reasoning_effort' => $instance['reasoning_effort'],
        ];
    }

    return $none;
}

/**
 * Infer the provider from a URL, for configurations saved before the provider
 * selector existed (and for personal configurations imported by hand).
 */
function poznoteAiGuessProvider(string $provider, string $url): string {
    if (in_array($provider, poznoteAiProviders(), true)) {
        return $provider;
    }
    $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?? ''));
    $port = (int)(parse_url($url, PHP_URL_PORT) ?? 0);
    if ($host === 'anthropic.com' || substr($host, -14) === '.anthropic.com') {
        return 'anthropic';
    }
    if ($host === 'api.openai.com') {
        return 'openai';
    }
    if ($port === 11434) {
        return 'ollama';
    }
    if ($port === 1234) {
        return 'lmstudio';
    }
    return ($url === '') ? 'ollama' : 'custom';
}

/**
 * Best local-server host as seen from inside this container.
 * host.docker.internal exists on Docker Desktop (and on Linux when compose
 * maps it); otherwise the container's default gateway is the Docker host.
 */
function aiChatLocalDefaultHost() {
    if (gethostbyname('host.docker.internal') !== 'host.docker.internal') {
        return 'host.docker.internal';
    }
    $route = @file_get_contents('/proc/net/route');
    if ($route !== false) {
        foreach (explode("\n", $route) as $line) {
            $cols = preg_split('/\s+/', trim($line));
            // Destination 00000000 = default route; gateway is little-endian hex
            if (isset($cols[1], $cols[2]) && $cols[1] === '00000000' && $cols[2] !== '00000000') {
                $ip = implode('.', array_reverse(array_map('hexdec', str_split($cols[2], 2))));
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
    }
    return 'host.docker.internal';
}

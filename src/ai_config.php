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
require_once __DIR__ . '/lib/ai-upstream.php';
require_once __DIR__ . '/lib/ai-mcp.php';

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
 * Custom request headers of a configuration (discussion #1610), stored
 * encrypted like a personal API key: their values are often credentials for
 * a gateway. See lib/ai-upstream.php for the format and the validation.
 */
function poznoteAiStoreHeaders(array $headers): string {
    return poznoteAiEncryptSecret(aiUpstreamEncodeHeaders($headers));
}

function poznoteAiLoadHeaders(string $stored): array {
    return aiUpstreamDecodeHeaders(poznoteAiDecryptSecret($stored));
}

/**
 * Parse the custom headers field of a settings form or of a connection
 * test, for the server at $serverUrl. Every provider takes them: Anthropic
 * wants anthropic-workspace-id with an organization key that is not scoped
 * to a workspace, OpenAI OpenAI-Organization or OpenAI-Project.
 * Returns ['headers' => list, 'error' => '' | translated message].
 */
function poznoteAiReadHeadersField(string $text, array $stored, string $serverUrl = ''): array {
    $parsed = aiUpstreamParseHeaders($text, $stored, aiUpstreamServerReservedHeaders($serverUrl));
    if ($parsed['error'] === null) {
        return ['headers' => $parsed['headers'], 'error' => ''];
    }
    $fallbacks = [
        'format' => 'Custom headers, line {{line}}: write it as "Name: value", in plain ASCII characters.',
        'reserved' => 'Custom headers, line {{line}}: this header is set by Poznote and cannot be changed. The API key field covers Authorization.',
        'duplicate' => 'Custom headers, line {{line}}: this header is already listed above.',
        'masked' => 'Custom headers, line {{line}}: the hidden value is not available, type it again.',
        'too_many' => 'Custom headers: no more than {{max}} headers.',
    ];
    $reason = $parsed['error']['reason'];
    return ['headers' => [], 'error' => t(
        'ai_settings.headers_errors.' . $reason,
        ['line' => $parsed['error']['line'], 'max' => AI_UPSTREAM_HEADERS_MAX],
        $fallbacks[$reason]
    )];
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
        'headers' => poznoteAiLoadHeaders((string)getGlobalSetting('ai_chat_headers', '')),
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
        'headers' => 'ai_user_headers',
    ];
}

/**
 * Personal configuration read from the user's own database.
 * The API key and the custom headers come back decrypted.
 */
function poznoteAiUserConfig(?PDO $con): array {
    $config = ['enabled' => false, 'provider' => '', 'url' => '', 'model' => '', 'api_key' => '', 'reasoning_effort' => 'auto', 'headers' => []];
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
        $config['headers'] = poznoteAiLoadHeaders($rows[$keys['headers']] ?? '');
    } catch (Exception $e) {
        // A database without the settings table yet: no personal configuration
        error_log('ai_config: poznoteAiUserConfig() failed: ' . $e->getMessage());
    }
    return $config;
}

/**
 * Save the personal configuration. Only the keys present in $config are
 * written, so an omitted api_key keeps the stored one. 'headers' is a list
 * as returned by poznoteAiReadHeadersField().
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
            if ($inputKey === 'headers') {
                $stmt->execute([$dbKey, poznoteAiStoreHeaders((array)$config[$inputKey])]);
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

/** Longest custom instructions text kept, in characters. */
const POZNOTE_AI_CUSTOM_INSTRUCTIONS_MAX = 4000;

/**
 * Custom instructions the user wants sent to the model with every request
 * (discussion #1613), read from the user's own database. They apply to
 * whichever configuration answers, the instance one or the personal one.
 */
function poznoteAiCustomInstructions(?PDO $con): string {
    if (!$con) {
        return '';
    }
    try {
        $stmt = $con->prepare("SELECT value FROM settings WHERE key = 'ai_custom_instructions'");
        $stmt->execute();
        $value = trim((string)($stmt->fetchColumn() ?: ''));
        return mb_substr($value, 0, POZNOTE_AI_CUSTOM_INSTRUCTIONS_MAX);
    } catch (Exception $e) {
        error_log('ai_config: poznoteAiCustomInstructions() failed: ' . $e->getMessage());
        return '';
    }
}

function poznoteSaveAiCustomInstructions(?PDO $con, string $instructions): bool {
    if (!$con) {
        return false;
    }
    try {
        $value = str_replace(["\r\n", "\r"], "\n", trim($instructions));
        $value = mb_substr($value, 0, POZNOTE_AI_CUSTOM_INSTRUCTIONS_MAX);
        $stmt = $con->prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_custom_instructions', ?)");
        $stmt->execute([$value]);
        return true;
    } catch (Exception $e) {
        error_log('Failed to save AI custom instructions: ' . $e->getMessage());
        return false;
    }
}

/**
 * External tools (discussion #1611): remote MCP servers whose tools the
 * assistant may call next to its own, see lib/ai-mcp.php. Off until an
 * administrator turns them on. Servers come from two places, like the
 * configurations above: the instance ones (master.db), offered to the users
 * allowed to use the instance assistant, and the user's own (their
 * database), when the administrator lets users add some. Both lists are
 * stored encrypted, as they hold API keys.
 */
function poznoteAiMcpEnabled(): bool {
    return (string)getGlobalSetting('ai_chat_mcp_enabled', '0') === '1';
}

/** True when users may connect servers of their own. */
function poznoteAiMcpUserServersAllowed(): bool {
    return poznoteAiMcpEnabled() && (string)getGlobalSetting('ai_chat_mcp_user_servers_enabled', '0') === '1';
}

function poznoteAiMcpInstanceServers(): array {
    return aiMcpDecodeServers(poznoteAiDecryptSecret((string)getGlobalSetting('ai_chat_mcp_servers', '')));
}

function poznoteSaveAiMcpInstanceServers(array $servers): bool {
    return setGlobalSetting('ai_chat_mcp_servers', poznoteAiEncryptSecret(aiMcpEncodeServers($servers)));
}

function poznoteAiMcpUserServers(?PDO $con): array {
    return aiMcpDecodeServers(poznoteAiDecryptSecret(poznoteAiUserSetting($con, 'ai_user_mcp_servers')));
}

function poznoteSaveAiMcpUserServers(?PDO $con, array $servers): bool {
    return poznoteSaveAiUserSetting($con, 'ai_user_mcp_servers', poznoteAiEncryptSecret(aiMcpEncodeServers($servers)));
}

/**
 * The servers whose tools a chat request of this user may call: the enabled
 * ones the user has a right to, the instance ones first.
 */
function poznoteAiMcpServersForChat(?PDO $con, ?int $userId): array {
    if (!poznoteAiMcpEnabled()) {
        return [];
    }
    $servers = isAiChatAllowedForUser($userId) ? poznoteAiMcpInstanceServers() : [];
    if (poznoteAiMcpUserServersAllowed()) {
        $servers = array_merge($servers, poznoteAiMcpUserServers($con));
    }
    return array_values(array_filter($servers, function (array $server): bool {
        return $server['enabled'] && in_array(true, array_column($server['tools'], 'enabled'), true);
    }));
}

/**
 * Names of the assistant's own tools this user turned off (the names of
 * aiToolHandlers() in lib/ai-tools.php), for instance every tool that
 * changes a note while external tools are connected.
 */
function poznoteAiDisabledTools(?PDO $con): array {
    $names = json_decode(poznoteAiUserSetting($con, 'ai_user_disabled_tools'), true);
    return is_array($names) ? array_values(array_filter($names, 'is_string')) : [];
}

function poznoteSaveAiDisabledTools(?PDO $con, array $names): bool {
    return poznoteSaveAiUserSetting($con, 'ai_user_disabled_tools', (string)json_encode(array_values($names)));
}

/** One value of the user's own settings table, '' when it is not set. */
function poznoteAiUserSetting(?PDO $con, string $key): string {
    if (!$con) {
        return '';
    }
    try {
        $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
        $stmt->execute([$key]);
        return (string)($stmt->fetchColumn() ?: '');
    } catch (Exception $e) {
        error_log('ai_config: poznoteAiUserSetting() failed: ' . $e->getMessage());
        return '';
    }
}

function poznoteSaveAiUserSetting(?PDO $con, string $key, string $value): bool {
    if (!$con) {
        return false;
    }
    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return $stmt->execute([$key, $value]);
    } catch (Exception $e) {
        error_log('ai_config: poznoteSaveAiUserSetting() failed: ' . $e->getMessage());
        return false;
    }
}

/** A configuration can answer chat requests once it has a URL and a model. */
function poznoteAiConfigUsable(array $config): bool {
    return !empty($config['enabled']) && trim((string)$config['url']) !== '' && trim((string)$config['model']) !== '';
}

/**
 * The configuration the AI chat must actually use for this user.
 * Returns ['available' => bool, 'source' => 'user'|'instance'|'', 'url', 'model', 'api_key', 'reasoning_effort', 'headers'].
 */
function poznoteResolveAiChatConfig(?PDO $con, ?int $userId): array {
    $none = ['available' => false, 'source' => '', 'url' => '', 'model' => '', 'api_key' => '', 'reasoning_effort' => 'auto', 'headers' => []];

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
                'headers' => $userConfig['headers'],
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
            'headers' => $instance['headers'],
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
    if (aiUpstreamIsAnthropicUrl($url)) {
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

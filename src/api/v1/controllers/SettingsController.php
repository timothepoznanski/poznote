<?php
/**
 * SettingsController - RESTful API controller for app settings
 * 
 * Endpoints:
 *   GET  /api/v1/settings         - Get setting values, optionally filtered with ?keys=a,b
 *   GET  /api/v1/settings/{key}   - Get a setting value
 *   PUT  /api/v1/settings/{key}   - Set a setting value
 */

class SettingsController {
    private $con;
    
    // Global settings that should be stored in master database
    private $globalSettings = [
        'login_display_name',
        'custom_css_path',
        'git_sync_enabled',
        'import_max_individual_files',
        'import_max_zip_files',
        'mcp_user_id',
        'mcp_default_workspace',
        'mcp_debug',
        'smtp_enabled',
        'smtp_host',
        'smtp_port',
        'smtp_security',
        'smtp_username',
        'smtp_password',
        'smtp_from_email',
        'smtp_from_name',
        'smtp_app_url',
        'smtp_reminder_cutoff_at',
    ];
    
    public function __construct($con) {
        $this->con = $con;
    }

    private function isGlobalSetting(string $key): bool {
        return in_array($key, $this->globalSettings, true);
    }

    private function getRequestedKeys(): ?array {
        if (!array_key_exists('keys', $_GET) || $_GET['keys'] === '') {
            return null;
        }

        $rawKeys = $_GET['keys'];
        if (!is_array($rawKeys)) {
            $rawKeys = explode(',', (string) $rawKeys);
        }

        $keys = [];
        foreach ($rawKeys as $rawKey) {
            $key = trim(urldecode((string) $rawKey));
            if ($key === '') {
                continue;
            }

            $keys[$key] = true;
            if (count($keys) > 200) {
                throw new InvalidArgumentException('too many setting keys requested', 400);
            }
        }

        return array_keys($keys);
    }

    private function requireGlobalSettingsAdmin(): void {
        if (!function_exists('isCurrentUserAdmin') || !isCurrentUserAdmin()) {
            throw new RuntimeException('admin privileges required', 403);
        }
    }

    private function requireActiveAccountOwner(): void {
        if (function_exists('isActiveAccountOwnedByAuthenticatedUser') && !isActiveAccountOwnedByAuthenticatedUser()) {
            $message = function_exists('getActiveAccountOwnerRequiredMessage')
                ? getActiveAccountOwnerRequiredMessage()
                : 'This account\'s settings are not accessible because you are not the owner of this account.';
            throw new RuntimeException($message, 403);
        }
    }

    private function normalizeSettingValue(string $key, $value): string {
        if ($key === 'custom_css_path') {
            $normalized = poznoteNormalizeCustomCssPath($value);
            if ($normalized === '' && trim((string) $value) !== '') {
                throw new InvalidArgumentException('invalid custom css path', 400);
            }
            return $normalized;
        }

        if ($key === 'git_sync_enabled') {
            return filter_var($value, FILTER_VALIDATE_BOOL) ? '1' : '0';
        }

        if ($key === 'attachment_previews_in_note') {
            return filter_var($value, FILTER_VALIDATE_BOOL) ? '1' : '0';
        }

        if ($key === 'import_max_individual_files' || $key === 'import_max_zip_files') {
            $intVal = (int) $value;
            if ($intVal < 1 || $intVal > 100000) {
                throw new InvalidArgumentException('value must be between 1 and 100000', 400);
            }
            return (string) $intVal;
        }

        if ($key === 'note_age_filter_days') {
            $intVal = (int) $value;
            if ($intVal < 0 || $intVal > 36500) {
                throw new InvalidArgumentException('value must be between 0 and 36500', 400);
            }
            return (string) $intVal;
        }

        if ($key === 'date_time_format') {
            $normalized = trim((string) $value);
            $allowedFormats = ['default', 'ymd_hi', 'ymd_his', 'dmy_hi', 'mdy_hia'];
            if (strpos($normalized, 'custom:') === 0) {
                $customPattern = trim(substr($normalized, 7));
                if ($customPattern === '' || strlen($customPattern) > 80) {
                    throw new InvalidArgumentException('invalid date time format', 400);
                }
                if (!preg_match('/^[A-Za-z0-9\\s:\\/.,_\\-()]+$/', $customPattern)) {
                    throw new InvalidArgumentException('invalid date time format', 400);
                }
                return 'custom:' . $customPattern;
            }
            if (!in_array($normalized, $allowedFormats, true)) {
                throw new InvalidArgumentException('invalid date time format', 400);
            }
            return $normalized;
        }

        if ($key === 'timezone') {
            $normalized = trim((string) $value);
            if ($normalized === '') {
                return '';
            }
            try {
                new DateTimeZone($normalized);
            } catch (Exception $e) {
                throw new InvalidArgumentException('invalid timezone', 400);
            }
            return $normalized;
        }

        if ($key === 'mcp_user_id') {
            $intVal = (int) $value;
            if ($intVal < 1) {
                throw new InvalidArgumentException('mcp_user_id must be a positive integer', 400);
            }
            return (string) $intVal;
        }

        if ($key === 'mcp_debug') {
            return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
        }

        if ($key === 'mcp_default_workspace') {
            return substr(trim((string) $value), 0, 255);
        }

        if ($key === 'smtp_enabled') {
            return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
        }

        if ($key === 'smtp_port') {
            $intVal = (int) $value;
            if ($intVal < 1 || $intVal > 65535) {
                throw new InvalidArgumentException('smtp_port must be between 1 and 65535', 400);
            }
            return (string) $intVal;
        }

        if ($key === 'smtp_security') {
            $normalized = strtolower(trim((string) $value));
            if (!in_array($normalized, ['none', 'tls', 'ssl'], true)) {
                throw new InvalidArgumentException('invalid smtp_security', 400);
            }
            return $normalized;
        }

        if ($key === 'smtp_from_email') {
            $email = trim((string) $value);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('invalid smtp_from_email', 400);
            }
            return $email;
        }

        if ($key === 'smtp_app_url') {
            $url = rtrim(trim((string) $value), '/');
            if ($url !== '') {
                $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
                if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array($scheme, ['http', 'https'], true)) {
                    throw new InvalidArgumentException('smtp_app_url must start with http:// or https://', 400);
                }
            }
            return $url;
        }

        if (in_array($key, ['smtp_host', 'smtp_username', 'smtp_password', 'smtp_from_name', 'smtp_reminder_cutoff_at'], true)) {
            return substr(trim((string) $value), 0, 1000);
        }

        return is_string($value) ? $value : (string) $value;
    }

    private function loadUserSettings(?array $keys): array {
        if (!$this->con) {
            throw new Exception('Database connection not available');
        }

        $settings = [];

        if ($keys === null) {
            $stmt = $this->con->query('SELECT key, value FROM settings');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $settings[$row['key']] = $row['value'];
            }
            return $settings;
        }

        if (empty($keys)) {
            return [];
        }

        foreach ($keys as $key) {
            $settings[$key] = '';
        }

        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $this->con->prepare("SELECT key, value FROM settings WHERE key IN ($placeholders)");
        $stmt->execute($keys);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $settings[$row['key']] = $row['value'];
        }

        return $settings;
    }

    private function loadGlobalSettings(?array $keys): array {
        $this->requireGlobalSettingsAdmin();
        require_once dirname(__DIR__, 3) . '/users/db_master.php';

        $settings = [];
        $masterCon = getMasterConnection();

        if ($keys === null) {
            $keys = $this->globalSettings;
        }

        if (empty($keys)) {
            return [];
        }

        foreach ($keys as $key) {
            $settings[$key] = '';
        }

        $placeholders = implode(',', array_fill(0, count($keys), '?'));
        $stmt = $masterCon->prepare("SELECT key, value FROM global_settings WHERE key IN ($placeholders)");
        $stmt->execute($keys);
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $value = $row['value'];
            if ($row['key'] === 'smtp_password' && $value !== '') {
                $value = '';
            }
            $settings[$row['key']] = $value;
        }

        return $settings;
    }

    /**
     * GET /api/v1/settings
     * Get setting values. Optional query: ?keys=key1,key2 or repeated keys[].
     */
    public function index() {
        try {
            $this->requireActiveAccountOwner();
            $requestedKeys = $this->getRequestedKeys();

            if ($requestedKeys === null) {
                $settings = $this->loadUserSettings(null);
                if (function_exists('isCurrentUserAdmin') && isCurrentUserAdmin()) {
                    $settings = array_merge($settings, $this->loadGlobalSettings(null));
                }

                echo json_encode(['success' => true, 'settings' => $settings]);
                return;
            }

            $userKeys = [];
            $globalKeys = [];
            foreach ($requestedKeys as $key) {
                if ($this->isGlobalSetting($key)) {
                    $globalKeys[] = $key;
                } else {
                    $userKeys[] = $key;
                }
            }

            $loaded = [];
            if (!empty($userKeys)) {
                $loaded = array_merge($loaded, $this->loadUserSettings($userKeys));
            }
            if (!empty($globalKeys)) {
                $loaded = array_merge($loaded, $this->loadGlobalSettings($globalKeys));
            }

            $settings = [];
            foreach ($requestedKeys as $key) {
                $settings[$key] = $loaded[$key] ?? '';
            }

            echo json_encode(['success' => true, 'settings' => $settings]);
        } catch (Exception $e) {
            error_log('SettingsController::index error: ' . $e->getMessage());
            $statusCode = (int) $e->getCode();
            if ($statusCode < 400 || $statusCode > 599) {
                $statusCode = 500;
            }
            http_response_code($statusCode);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    }
    
    /**
     * GET /api/v1/settings/{key}
     * Get a setting value
     */
    public function show($key) {
        $key = urldecode($key);
        
        if ($key === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'key is required']);
            return;
        }
        
        try {
            $this->requireActiveAccountOwner();

            // For global settings, use getGlobalSetting function
            if ($this->isGlobalSetting($key)) {
                $this->requireGlobalSettingsAdmin();
                require_once dirname(__DIR__, 3) . '/users/db_master.php';
                $value = getGlobalSetting($key, '');
                if ($key === 'smtp_password' && $value !== '') {
                    $value = '';
                }
            } else {
                // For user settings, use the user database
                if (!$this->con) {
                    throw new Exception('Database connection not available');
                }
                $stmt = $this->con->prepare('SELECT value FROM settings WHERE key = ?');
                $stmt->execute([$key]);
                $value = $stmt->fetchColumn();
                if ($value === false) {
                    $value = '';
                }
            }
            
            echo json_encode(['success' => true, 'key' => $key, 'value' => $value]);
            
        } catch (Exception $e) {
            error_log("SettingsController::show error for key '$key': " . $e->getMessage());
            $statusCode = (int) $e->getCode();
            if ($statusCode < 400 || $statusCode > 599) {
                $statusCode = 500;
            }
            http_response_code($statusCode);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    }
    
    /**
     * PUT /api/v1/settings/{key}
     * Set a setting value (requires auth)
     * Body: { "value": "setting_value" }
     */
    public function update($key) {
        $key = urldecode($key);
        
        if ($key === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'key is required']);
            return;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $value = $input['value'] ?? '';
        
        try {
            $this->requireActiveAccountOwner();

            $value = $this->normalizeSettingValue($key, $value);

            // For global settings, use setGlobalSetting function
            if ($this->isGlobalSetting($key)) {
                $this->requireGlobalSettingsAdmin();
                require_once dirname(__DIR__, 3) . '/users/db_master.php';
                setGlobalSetting($key, $value);
            } else {
                // For user settings, use the user database
                $stmt = $this->con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $stmt->execute([$key, $value]);
            }
            
            echo json_encode(['success' => true, 'key' => $key, 'value' => $value]);
            
        } catch (Exception $e) {
            $statusCode = (int) $e->getCode();
            if ($statusCode < 400 || $statusCode > 599) {
                $statusCode = 500;
            }
            http_response_code($statusCode);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    }
}

<?php
/**
 * SettingsController - RESTful API controller for app settings
 * 
 * Endpoints:
 *   GET  /api/v1/settings/{key}   - Get a setting value
 *   PUT  /api/v1/settings/{key}   - Set a setting value
 */

class SettingsController {
    private $con;
    
    // Global settings that should be stored in master database
    private $globalSettings = ['login_display_name'];
    
    public function __construct($con) {
        $this->con = $con;
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
            // For global settings, use getGlobalSetting function
            if (in_array($key, $this->globalSettings)) {
                require_once dirname(__DIR__, 3) . '/users/db_master.php';
                $value = getGlobalSetting($key, '');
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
            http_response_code(500);
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
            // For global settings, use setGlobalSetting function
            if (in_array($key, $this->globalSettings)) {
                require_once dirname(__DIR__, 3) . '/users/db_master.php';
                setGlobalSetting($key, $value);
            } else {
                // For user settings, use the user database
                $stmt = $this->con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
                $stmt->execute([$key, $value]);
            }
            
            echo json_encode(['success' => true, 'key' => $key, 'value' => $value]);
            
        } catch (Exception $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
    }
}

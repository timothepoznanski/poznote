<?php
/**
 * Master Database Connection for Multi-User Mode
 * 
 * In this simplified multi-user mode:
 * - One global password for everyone (same as single-user mode)
 * - Multiple user profiles, each with their own data space
 * - User selects their profile on login
 */

// Ensure config is loaded
if (!defined('SQLITE_DATABASE')) {
    require_once __DIR__ . '/../config.php';
}

// Include auto-migration to ensure multi-user structure exists
require_once __DIR__ . '/../auto_migrate.php';

// Master database path
define('MASTER_DATABASE', $_ENV['POZNOTE_MASTER_DATABASE'] ?? dirname(__DIR__) . '/data/master.db');

/**
 * Get connection to master database
 */
function getMasterConnection(): PDO {
    static $masterCon = null;
    
    if ($masterCon !== null) {
        return $masterCon;
    }
    
    try {
        $dbPath = MASTER_DATABASE;
        $dbDir = dirname($dbPath);
        if (!is_dir($dbDir)) {
            mkdir($dbDir, 0755, true);
        }
        
        $masterCon = new PDO('sqlite:' . $dbPath);
        $masterCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $masterCon->exec('PRAGMA foreign_keys = ON');
        
        initializeMasterDatabase($masterCon);
        
        return $masterCon;
    } catch (PDOException $e) {
        error_log("Master database connection failed: " . $e->getMessage());
        throw $e;
    }
}

/**
 * Initialize the master database schema
 */
function initializeMasterDatabase(PDO $con): void {
    // User profiles table - no passwords, just profiles
    $con->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,

            active INTEGER DEFAULT 1,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )
    ");
    
    // Global settings table
    $con->exec("
        CREATE TABLE IF NOT EXISTS global_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ");
    
    // Shared links registry (for public routing)
    $con->exec("
        CREATE TABLE IF NOT EXISTS shared_links (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            target_type TEXT NOT NULL, -- 'note' or 'folder'
            target_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ");
    
    // Create indexes
    $con->exec("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_users_active ON users(active)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_token ON shared_links(token)");
    $con->exec("CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id)");
    
    // Create default user if none exist
    createDefaultUserIfNeeded($con);
}

/**
 * Create default user profile if none exist
 */
function createDefaultUserIfNeeded(PDO $con): void {
    $stmt = $con->query("SELECT COUNT(*) FROM users");
    if ($stmt->fetchColumn() == 0) {
        $stmt = $con->prepare("
            INSERT INTO users (username, is_admin, active)
            VALUES (?, 1, 1)
        ");
        $stmt->execute(['admin']);
    }
}

/**
 * Get all active user profiles for login selector
 */
function getAllUserProfiles(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, is_admin 
            FROM users 
            WHERE active = 1 
            ORDER BY username
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        error_log("Error getting user profiles: " . $e->getMessage());
        return [];
    }
}

/**
 * Get user profile by ID
 */
function getUserProfileById(int $id): ?array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ?: null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Get user profile by username
 */
function getUserProfileByUsername(string $username): ?array {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        return $user ?: null;
    } catch (Exception $e) {
        return null;
    }
}

/**
 * Update user last login timestamp
 */
function updateUserLastLogin(int $userId): void {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$userId]);
    } catch (Exception $e) {
        // Ignore errors
    }
}

/**
 * Create a new user profile
 */

function createUserProfile(string $username): array {
    try {
        $con = getMasterConnection();
        
        // Check if username exists
        $stmt = $con->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            return ['success' => false, 'error' => 'Username already exists'];
        }
        
        $stmt = $con->prepare("
            INSERT INTO users (username, active)
            VALUES (?, 1)
        ");
        $stmt->execute([
            $username
        ]);
        
        return ['success' => true, 'user_id' => $con->lastInsertId()];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Update a user profile
 */
function updateUserProfile(int $id, array $data): array {
    try {
        $con = getMasterConnection();
        
        $allowedFields = ['username', 'active', 'is_admin'];
        $updates = [];
        $params = [];
        
        foreach ($data as $key => $value) {
            if (in_array($key, $allowedFields)) {
                $updates[] = "$key = ?";
                $params[] = $value;
            }
        }
        
        if (empty($updates)) {
            return ['success' => false, 'error' => 'No valid fields to update'];
        }
        
        $updates[] = "updated_at = CURRENT_TIMESTAMP";
        $params[] = $id;
        
        $sql = "UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?";
        $stmt = $con->prepare($sql);
        $stmt->execute($params);
        
        return ['success' => true];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Delete a user profile
 */
function deleteUserProfile(int $id, bool $deleteData = false): array {
    try {
        $con = getMasterConnection();
        
        // Don't allow deleting the last admin
        $stmt = $con->query("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND active = 1");
        $adminCount = $stmt->fetchColumn();
        
        $stmt = $con->prepare("SELECT is_admin FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user && $user['is_admin'] && $adminCount <= 1) {
            return ['success' => false, 'error' => 'Cannot delete the last admin user'];
        }
        
        // Delete user data if requested
        if ($deleteData) {
            require_once __DIR__ . '/UserDataManager.php';
            $dataManager = new UserDataManager($id);
            $dataManager->deleteAllUserData();
        }
        
        // Delete user's shared links from global registry
        $stmt = $con->prepare("DELETE FROM shared_links WHERE user_id = ?");
        $stmt->execute([$id]);
        
        $stmt = $con->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$id]);
        
        return ['success' => true];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * List all user profiles (for admin)
 */
function listAllUserProfiles(): array {
    try {
        $con = getMasterConnection();
        $stmt = $con->query("
            SELECT id, username, is_admin, active, created_at, last_login
            FROM users 
            ORDER BY username
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return [];
    }
}

/**
 * Get a global setting
 */
function getGlobalSetting(string $key, $default = null) {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("SELECT value FROM global_settings WHERE key = ?");
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();
        return $value !== false ? $value : $default;
    } catch (Exception $e) {
        return $default;
    }
}

/**
 * Set a global setting
 */
function setGlobalSetting(string $key, $value): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("
            INSERT OR REPLACE INTO global_settings (key, value)
            VALUES (?, ?)
        ");
        return $stmt->execute([$key, $value]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Register a shared link in the global registry
 */
function registerSharedLink(string $token, int $userId, string $targetType, int $targetId): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("
            INSERT OR REPLACE INTO shared_links (token, user_id, target_type, target_id)
            VALUES (?, ?, ?, ?)
        ");
        return $stmt->execute([$token, $userId, $targetType, $targetId]);
    } catch (Exception $e) {
        error_log("Failed to register shared link: " . $e->getMessage());
        return false;
    }
}

/**
 * Unregister a shared link from the global registry
 */
function unregisterSharedLink(string $token): bool {
    try {
        $con = getMasterConnection();
        $stmt = $con->prepare("DELETE FROM shared_links WHERE token = ?");
        return $stmt->execute([$token]);
    } catch (Exception $e) {
        error_log("Failed to unregister shared link: " . $e->getMessage());
        return false;
    }
}

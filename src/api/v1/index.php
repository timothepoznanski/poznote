<?php
/**
 * Poznote REST API v1 Router
 * 
 * This is the main entry point for the RESTful API.
 * All requests to /api/v1/* are routed through this file.
 * 
 * Endpoints:
 *   GET    /api/v1/notes              - List all notes
 *   GET    /api/v1/notes/{id}         - Get a specific note
 *   POST   /api/v1/notes              - Create a new note
 *   PATCH  /api/v1/notes/{id}         - Update a note
 *   DELETE /api/v1/notes/{id}         - Delete a note (soft delete by default)
 *   POST   /api/v1/notes/{id}/restore - Restore a note from trash
 *   PUT    /api/v1/notes/{id}/tags    - Apply/replace tags on a note
 */

// Enable error reporting for development (disable in production)
// ini_set('display_errors', 1);
// error_reporting(E_ALL);

// Set content type for all responses
header('Content-Type: application/json; charset=utf-8');

// Handle CORS preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

// Include required files (order matters!)
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../auth.php';

// Check if this is an admin/user endpoint that doesn't need X-User-ID
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$isAdminEndpoint = strpos($uri, '/api/v1/admin') !== false;
$isPublicProfilesEndpoint = strpos($uri, '/api/v1/users/profiles') !== false;
$isMeEndpoint = strpos($uri, '/api/v1/users/me') !== false;
$isLookupEndpoint = strpos($uri, '/api/v1/users/lookup/') !== false;
$isSystemEndpoint = strpos($uri, '/api/v1/system') !== false;
$isSharedEndpoint = strpos($uri, '/api/v1/shared') !== false;
$isPublicApiEndpoint = strpos($uri, '/api/v1/public') !== false;

// Require authentication (with X-User-ID for data endpoints, without for admin/public endpoints)
if ($isPublicApiEndpoint) {
    // No additional authentication required (token validation happens in controller)
} elseif ($isAdminEndpoint || $isPublicProfilesEndpoint || $isMeEndpoint || $isLookupEndpoint || $isSystemEndpoint || $isSharedEndpoint) {
    // Admin endpoints only need credential validation, not X-User-ID
    requireApiAuthAdmin();
} else {
    // Data endpoints require X-User-ID to know which user's data to access
    requireApiAuth();
}

// Now load db_connect.php AFTER session is set up with user_id
// This ensures the correct user database is used
require_once __DIR__ . '/../../db_connect.php';
require_once __DIR__ . '/../../functions.php';

// Include controllers
require_once __DIR__ . '/controllers/NotesController.php';
require_once __DIR__ . '/controllers/FoldersController.php';
require_once __DIR__ . '/controllers/TrashController.php';
require_once __DIR__ . '/controllers/WorkspacesController.php';
require_once __DIR__ . '/controllers/TagsController.php';
require_once __DIR__ . '/controllers/AttachmentsController.php';
require_once __DIR__ . '/controllers/ShareController.php';
require_once __DIR__ . '/controllers/FolderShareController.php';
require_once __DIR__ . '/controllers/SettingsController.php';
require_once __DIR__ . '/controllers/BackupController.php';
require_once __DIR__ . '/controllers/SystemController.php';
require_once __DIR__ . '/controllers/GitHubSyncController.php';
require_once __DIR__ . '/controllers/PublicController.php';

/**
 * Simple Router class for handling RESTful routes
 */
class Router {
    private $routes = [];
    private $basePath = '/api/v1';
    
    /**
     * Register a route
     */
    public function addRoute(string $method, string $pattern, callable $handler): void {
        $this->routes[] = [
            'method' => strtoupper($method),
            'pattern' => $pattern,
            'handler' => $handler
        ];
    }
    
    /**
     * Convenience methods for HTTP verbs
     */
    public function get(string $pattern, callable $handler): void {
        $this->addRoute('GET', $pattern, $handler);
    }
    
    public function post(string $pattern, callable $handler): void {
        $this->addRoute('POST', $pattern, $handler);
    }
    
    public function put(string $pattern, callable $handler): void {
        $this->addRoute('PUT', $pattern, $handler);
    }
    
    public function patch(string $pattern, callable $handler): void {
        $this->addRoute('PATCH', $pattern, $handler);
    }
    
    public function delete(string $pattern, callable $handler): void {
        $this->addRoute('DELETE', $pattern, $handler);
    }
    
    /**
     * Parse the request URI and match against routes
     */
    public function dispatch(): void {
        $method = $_SERVER['REQUEST_METHOD'];
        $uri = $_SERVER['REQUEST_URI'];
        
        // Remove query string from URI
        $uri = parse_url($uri, PHP_URL_PATH);
        
        // Remove base path from URI
        if (strpos($uri, $this->basePath) === 0) {
            $uri = substr($uri, strlen($this->basePath));
        }
        
        // Ensure URI starts with /
        if (empty($uri)) {
            $uri = '/';
        } elseif ($uri[0] !== '/') {
            $uri = '/' . $uri;
        }
        
        // Remove trailing slash (except for root)
        if ($uri !== '/' && substr($uri, -1) === '/') {
            $uri = rtrim($uri, '/');
        }
        
        // Try to match a route
        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            
            $params = $this->matchRoute($route['pattern'], $uri);
            if ($params !== false) {
                try {
                    call_user_func($route['handler'], $params);
                    return;
                } catch (Exception $e) {
                    error_log("API Error: " . $e->getMessage());
                    $this->sendError(500, 'Internal server error');
                    return;
                }
            }
        }
        
        // No route matched
        $this->sendError(404, 'Endpoint not found');
    }
    
    /**
     * Match a route pattern against a URI
     * Returns array of params on match, false otherwise
     */
    private function matchRoute(string $pattern, string $uri): array|false {
        // Convert pattern to regex
        // {param} becomes a named capture group
        $regex = preg_replace('/\{([a-zA-Z_]+)\}/', '(?P<$1>[^/]+)', $pattern);
        $regex = '#^' . $regex . '$#';
        
        if (preg_match($regex, $uri, $matches)) {
            // Filter out numeric keys, keep only named params
            $params = array_filter($matches, function($key) {
                return !is_numeric($key);
            }, ARRAY_FILTER_USE_KEY);
            return $params;
        }
        
        return false;
    }
    
    /**
     * Send an error response
     */
    private function sendError(int $code, string $message): void {
        http_response_code($code);
        echo json_encode([
            'success' => false,
            'error' => $message
        ]);
    }
}

// Create router instance
$router = new Router();

// Create controller instances
$notesController = new NotesController($con);
$foldersController = new FoldersController($con);
$trashController = new TrashController($con);
$workspacesController = new WorkspacesController($con);
$tagsController = new TagsController($con);
$attachmentsController = new AttachmentsController($con);
$shareController = new ShareController($con);
$folderShareController = new FolderShareController($con);
$settingsController = new SettingsController($con);
$backupController = new BackupController($con);
$systemController = new SystemController($con);
$githubSyncController = new GitHubSyncController($con);
$publicController = new PublicController($con);

// ======================
// Notes Routes
// ======================

// Resolve a note reference (must come before /notes/{id})
$router->get('/notes/resolve', function($params) use ($notesController) {
    $notesController->resolveReference();
});

// Search notes (must come before /notes/{id})
$router->get('/notes/search', function($params) use ($notesController) {
    $notesController->search();
});

// List notes with attachments
$router->get('/notes/with-attachments', function($params) use ($notesController) {
    $notesController->listWithAttachments();
});

// List all notes
$router->get('/notes', function($params) use ($notesController) {
    $notesController->index();
});

// Get a specific note
$router->get('/notes/{id}', function($params) use ($notesController) {
    $notesController->show($params['id']);
});

// Create a new note
$router->post('/notes', function($params) use ($notesController) {
    $notesController->create();
});

// Update a note
$router->patch('/notes/{id}', function($params) use ($notesController) {
    $notesController->update($params['id']);
});

// Delete a note
$router->delete('/notes/{id}', function($params) use ($notesController) {
    $notesController->delete($params['id']);
});

// Restore a note from trash
$router->post('/notes/{id}/restore', function($params) use ($notesController) {
    $notesController->restore($params['id']);
});

// Emergency save via sendBeacon (accepts FormData)
$router->post('/notes/{id}/beacon', function($params) use ($notesController) {
    $notesController->beaconSave($params['id']);
});

// Apply/replace tags on a note
$router->put('/notes/{id}/tags', function($params) use ($notesController) {
    $notesController->updateTags($params['id']);
});

// Toggle favorite status for a note
$router->post('/notes/{id}/favorite', function($params) use ($notesController) {
    $notesController->toggleFavorite($params['id']);
});

// Duplicate a note
$router->post('/notes/{id}/duplicate', function($params) use ($notesController) {
    $notesController->duplicate($params['id']);
});

// Create a template from a note
$router->post('/notes/{id}/create-template', function($params) use ($notesController) {
    $notesController->createTemplate($params['id']);
});

// Convert note type (markdown <-> html)
$router->post('/notes/{id}/convert', function($params) use ($notesController) {
    $notesController->convert($params['id']);
});

// Get share status for a note
$router->get('/notes/{id}/share', function($params) use ($shareController) {
    $shareController->show($params['id']);
});

// Create/renew share link
$router->post('/notes/{id}/share', function($params) use ($shareController) {
    $shareController->store($params['id']);
});

// Update share settings
$router->patch('/notes/{id}/share', function($params) use ($shareController) {
    $shareController->update($params['id']);
});

// Revoke share link
$router->delete('/notes/{id}/share', function($params) use ($shareController) {
    $shareController->destroy($params['id']);
});

// Move a note to a folder
$router->post('/notes/{id}/folder', function($params) use ($foldersController) {
    $foldersController->moveNoteToFolder($params['id']);
});

// Remove a note from its folder (move to root)
$router->post('/notes/{id}/remove-folder', function($params) use ($foldersController) {
    $foldersController->removeNoteFromFolder($params['id']);
});

// ======================
// Folders Routes
// ======================

// Get folder counts (must be before {id} routes)
$router->get('/folders/counts', function($params) use ($foldersController) {
    $foldersController->counts();
});

// Get suggested folders
$router->get('/folders/suggested', function($params) use ($foldersController) {
    $foldersController->suggested();
});

// Move files between folders
$router->post('/folders/move-files', function($params) use ($foldersController) {
    $foldersController->moveFiles();
});

// Create a Kanban structure
$router->post('/folders/kanban-structure', function($params) use ($foldersController) {
    $foldersController->createKanbanStructure();
});

// List all folders
$router->get('/folders', function($params) use ($foldersController) {
    $foldersController->index();
});

// Get a specific folder
$router->get('/folders/{id}', function($params) use ($foldersController) {
    $foldersController->show($params['id']);
});

// Create a new folder
$router->post('/folders', function($params) use ($foldersController) {
    $foldersController->create();
});

// Update/rename a folder
$router->patch('/folders/{id}', function($params) use ($foldersController) {
    $foldersController->update($params['id']);
});

// Delete a folder
$router->delete('/folders/{id}', function($params) use ($foldersController) {
    $foldersController->delete($params['id']);
});

// Move folder to new parent
$router->post('/folders/{id}/move', function($params) use ($foldersController) {
    $foldersController->move($params['id']);
});

// Empty folder (move notes to trash)
$router->post('/folders/{id}/empty', function($params) use ($foldersController) {
    $foldersController->empty($params['id']);
});

// Update folder icon
$router->put('/folders/{id}/icon', function($params) use ($foldersController) {
    $foldersController->updateIcon($params['id']);
});

// Get note count in folder
$router->get('/folders/{id}/notes', function($params) use ($foldersController) {
    $foldersController->noteCount($params['id']);
});

// Get folder path
$router->get('/folders/{id}/path', function($params) use ($foldersController) {
    $foldersController->path($params['id']);
});

// Get share status for a folder
$router->get('/folders/{id}/share', function($params) use ($folderShareController) {
    $folderShareController->show($params['id']);
});

// Create/renew folder share link
$router->post('/folders/{id}/share', function($params) use ($folderShareController) {
    $folderShareController->store($params['id']);
});

// Update folder share settings
$router->patch('/folders/{id}/share', function($params) use ($folderShareController) {
    $folderShareController->update($params['id']);
});

// Revoke folder share link
$router->delete('/folders/{id}/share', function($params) use ($folderShareController) {
    $folderShareController->destroy($params['id']);
});

// ======================
// Trash Routes
// ======================

// List all notes in trash
$router->get('/trash', function($params) use ($trashController) {
    $trashController->index();
});

// Empty trash (delete all)
$router->delete('/trash', function($params) use ($trashController) {
    $trashController->empty();
});

// Permanently delete a specific note from trash
$router->delete('/trash/{id}', function($params) use ($trashController) {
    $trashController->destroy($params['id']);
});

// ======================
// Workspaces Routes
// ======================

// List all workspaces
$router->get('/workspaces', function($params) use ($workspacesController) {
    $workspacesController->index();
});

// Create a new workspace
$router->post('/workspaces', function($params) use ($workspacesController) {
    $workspacesController->store();
});

// Rename a workspace
$router->patch('/workspaces/{name}', function($params) use ($workspacesController) {
    $workspacesController->update($params['name']);
});

// Delete a workspace
$router->delete('/workspaces/{name}', function($params) use ($workspacesController) {
    $workspacesController->destroy($params['name']);
});

// ======================
// Tags Routes
// ======================

// List all unique tags
$router->get('/tags', function($params) use ($tagsController) {
    $tagsController->index();
});

// ======================
// Attachments Routes
// ======================

// List all attachments for a note
$router->get('/notes/{noteId}/attachments', function($params) use ($attachmentsController) {
    $attachmentsController->index($params['noteId']);
});

// Upload an attachment to a note
$router->post('/notes/{noteId}/attachments', function($params) use ($attachmentsController) {
    $attachmentsController->store($params['noteId']);
});

// Download an attachment
$router->get('/notes/{noteId}/attachments/{attachmentId}', function($params) use ($attachmentsController) {
    $attachmentsController->show($params['noteId'], $params['attachmentId']);
});

// Delete an attachment
$router->delete('/notes/{noteId}/attachments/{attachmentId}', function($params) use ($attachmentsController) {
    $attachmentsController->destroy($params['noteId'], $params['attachmentId']);
});

// ======================
// Settings Routes
// ======================

// Get a setting value
$router->get('/settings/{key}', function($params) use ($settingsController) {
    $settingsController->show($params['key']);
});

// Set a setting value
$router->put('/settings/{key}', function($params) use ($settingsController) {
    $settingsController->update($params['key']);
});

// ======================
// Backup Routes
// ======================

// List all backups
$router->get('/backups', function($params) use ($backupController) {
    echo json_encode($backupController->index());
});

// Create a new backup
$router->post('/backups', function($params) use ($backupController) {
    echo json_encode($backupController->create());
});

// Download a backup file
$router->get('/backups/{filename}', function($params) use ($backupController) {
    echo json_encode($backupController->download($params['filename']));
});

// Delete a backup file
$router->delete('/backups/{filename}', function($params) use ($backupController) {
    echo json_encode($backupController->destroy($params['filename']));
});

// Restore a backup file
$router->post('/backups/{filename}/restore', function($params) use ($backupController) {
    echo json_encode($backupController->restore($params['filename']));
});

// ======================
// System Routes
// ======================

// Get version info
$router->get('/system/version', function($params) use ($systemController) {
    echo json_encode($systemController->version());
});

// Check for updates
$router->get('/system/updates', function($params) use ($systemController) {
    echo json_encode($systemController->checkUpdates());
});

// Get translations
$router->get('/system/i18n', function($params) use ($systemController) {
    echo json_encode($systemController->i18n());
});

// Verify settings password
$router->post('/system/verify-password', function($params) use ($systemController) {
    echo json_encode($systemController->verifyPassword());
});

// List shared notes
$router->get('/shared', function($params) use ($systemController) {
    echo json_encode($systemController->listShared());
});

// ======================
// GitHub Sync Routes
// ======================

// Get GitHub sync status
$router->get('/github-sync/status', function($params) use ($githubSyncController) {
    $githubSyncController->status();
});

// Test GitHub connection
$router->post('/github-sync/test', function($params) use ($githubSyncController) {
    $githubSyncController->test();
});

// Push notes to GitHub
$router->post('/github-sync/push', function($params) use ($githubSyncController) {
    $githubSyncController->push();
});

// Pull notes from GitHub
$router->post('/github-sync/pull', function($params) use ($githubSyncController) {
    $githubSyncController->pull();
});

// ======================
// User Profile Routes
// ======================

require_once __DIR__ . '/controllers/UsersController.php';
$usersController = new UsersController($con);

// Get available user profiles for login selector (public endpoint)
$router->get('/users/profiles', function($params) use ($usersController) {
    echo json_encode($usersController->profiles());
});

// Get current authenticated user's profile
$router->get('/users/me', function($params) use ($usersController) {
    echo json_encode($usersController->me());
});

// Get user ID by username (admin only, used by backup scripts)
$router->get('/users/lookup/{username}', function($params) use ($usersController) {
    echo json_encode($usersController->lookup($params['username']));
});

// Admin: System stats
$router->get('/admin/stats', function($params) use ($usersController) {
    echo json_encode($usersController->stats());
});

// Admin: List all user profiles
$router->get('/admin/users', function($params) use ($usersController) {
    echo json_encode($usersController->list($_GET));
});

// Admin: Get a specific user profile
$router->get('/admin/users/{id}', function($params) use ($usersController) {
    echo json_encode($usersController->get($params['id']));
});

// Admin: Create a new user profile
$router->post('/admin/users', function($params) use ($usersController) {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    echo json_encode($usersController->create($data));
});

// Admin: Update a user profile
$router->patch('/admin/users/{id}', function($params) use ($usersController) {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    echo json_encode($usersController->update($params['id'], $data));
});

// Admin: Repair system (rebuild master registry)
$router->post('/admin/repair', function($params) use ($usersController) {
    echo json_encode($usersController->repair());
});

// Admin: Delete a user profile
$router->delete('/admin/users/{id}', function($params) use ($usersController) {
    echo json_encode($usersController->delete($params['id'], $_GET));
});

// ======================
// Public Routes
// ======================

$router->patch('/public/tasks/{id}', function($params) use ($publicController) {
    $publicController->updateTask($params['id']);
});

$router->post('/public/tasks', function($params) use ($publicController) {
    $publicController->addTask();
});

$router->delete('/public/tasks/{id}', function($params) use ($publicController) {
    $publicController->deleteTask($params['id']);
});

// Dispatch the request
$router->dispatch();

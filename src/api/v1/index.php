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

// Include required files
require_once __DIR__ . '/../../auth.php';
require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../db_connect.php';
require_once __DIR__ . '/../../functions.php';

// Require authentication
requireApiAuth();

// Include controllers
require_once __DIR__ . '/controllers/NotesController.php';
require_once __DIR__ . '/controllers/FoldersController.php';
require_once __DIR__ . '/controllers/TrashController.php';
require_once __DIR__ . '/controllers/WorkspacesController.php';

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

// ======================
// Notes Routes
// ======================

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

// Dispatch the request
$router->dispatch();

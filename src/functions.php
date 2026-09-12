<?php
date_default_timezone_set('UTC');

// ---------------------------------------------------------------------------
// Extracted modules. functions.php is still the single entry point every page
// requires, so nothing downstream changed; it is now a facade over these files
// instead of a 6 360-line pile.
// ---------------------------------------------------------------------------
require_once __DIR__ . '/lib/html-sanitize.php';
require_once __DIR__ . '/lib/attachments.php';
require_once __DIR__ . '/lib/backup-restore.php';
require_once __DIR__ . '/lib/diary.php';
require_once __DIR__ . '/lib/datetime.php';
require_once __DIR__ . '/lib/note-colors.php';
require_once __DIR__ . '/lib/quotas.php';
require_once __DIR__ . '/lib/snapshots.php';
require_once __DIR__ . '/lib/ui-customization.php';
require_once __DIR__ . '/lib/i18n.php';
require_once __DIR__ . '/lib/icons.php';
require_once __DIR__ . '/lib/workspaces.php';
require_once __DIR__ . '/lib/paths.php';
require_once __DIR__ . '/lib/folders.php';
require_once __DIR__ . '/lib/note-titles.php';
require_once __DIR__ . '/lib/checklists.php';
require_once __DIR__ . '/lib/tasklists.php';





























/**
 * Detect if the current request is using HTTPS
 * Supports reverse proxy headers (X-Forwarded-Proto, X-Forwarded-SSL)
 */
function isSecureConnection() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
        || (!empty($_SERVER['HTTP_X_FORWARDED_SSL']) && $_SERVER['HTTP_X_FORWARDED_SSL'] === 'on')
    || (!empty($_SERVER['HTTP_X_FORWARDED_PORT']) && $_SERVER['HTTP_X_FORWARDED_PORT'] === '443')
        || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
}

/**
 * Get the current Git provider name for display (GitHub, GitLab or Forgejo)
 */
function getGitProviderName($provider = null) {
    if ($provider === null) {
        $provider = defined('GIT_PROVIDER') ? GIT_PROVIDER : 'github';
    }
    $names = ['github' => 'GitHub', 'gitlab' => 'GitLab', 'forgejo' => 'Forgejo'];
    return $names[$provider] ?? 'Git';
}

/**
 * Get the current protocol (http or https), supporting reverse proxies
 */
function getProtocol() {
    return isSecureConnection() ? 'https' : 'http';
}

/**
 * Get the external request host, preserving a forwarded non-default port when provided.
 */
function getExternalHostWithPort() {
    $forwardedHost = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''));
    if ($forwardedHost !== '') {
        $forwardedHostParts = array_values(array_filter(array_map('trim', explode(',', $forwardedHost)), 'strlen'));
        $host = $forwardedHostParts ? (string)$forwardedHostParts[0] : '';
    } else {
        $host = trim((string)($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost')));
    }

    if ($host === '') {
        $host = 'localhost';
    }

    // If host already contains a port, don't try to append another one
    if (strpos($host, ':') !== false && preg_match('/:\d+$/', $host)) {
        return $host;
    }

    // Only trust a port explicitly forwarded by a reverse proxy. Never fall
    // back to SERVER_PORT: inside the container it is the port nginx listens
    // on (80, or 8080 for the rootless image), which says nothing about the
    // port the visitor used since Docker port mappings and reverse proxies
    // both hide it. When the visitor did use a non-default port, the Host
    // header already carries it (handled above).
    $forwardedPort = trim((string)($_SERVER['HTTP_X_FORWARDED_PORT'] ?? ''));
    if ($forwardedPort === '') {
        return $host;
    }
    $forwardedPortParts = array_values(array_filter(array_map('trim', explode(',', $forwardedPort)), 'strlen'));
    $port = $forwardedPortParts ? (string)$forwardedPortParts[0] : '';

    if ($port === '' || !ctype_digit($port)) {
        return $host;
    }

    // A proxy reporting port 80 on an HTTPS request is describing its own
    // upstream hop to nginx, not the visitor's port: adding :80 would be wrong.
    $isSecure = getProtocol() === 'https';
    if ($port === '80' && $isSecure) {
        return $host;
    }

    $defaultPort = $isSecure ? '443' : '80';
    if ($port === $defaultPort) {
        return $host;
    }

    return $host . ':' . $port;
}





/* ---------------------------------------------------------------------------
 * Note colors
 *
 * A note stores a single value in entries.color:
 *   - a palette id ('blue', 'green', ...)  -> resolved through the user palette,
 *     so editing the palette instantly recolors every note using that id;
 *   - a literal '#rrggbb'                  -> a per-note custom override;
 *   - NULL / ''                            -> no color, appearance unchanged.
 * ------------------------------------------------------------------------- */

define('NOTE_COLOR_PALETTE_SETTING', 'note_color_palette');












/* ---------------------------------------------------------------------------
 * Tag colors
 *
 * The 'tag_colors' setting stores a JSON object mapping a lowercased tag name
 * to a color value with the same semantics as entries.color: a palette id
 * ('blue', ...) resolved through the user palette, or a literal '#rrggbb'.
 * Tags without an entry render with the neutral default chip style.
 * ------------------------------------------------------------------------- */

define('TAG_COLORS_SETTING', 'tag_colors');




/**
 * Global settings cache - loads all settings in one query and caches them
 * This dramatically reduces database queries when settings are accessed multiple times
 */
function getSetting($key, $default = null) {
    static $cache = null;
    
    // Load all settings on first call
    if ($cache === null) {
        $cache = [];
        global $con;
        if (isset($con)) {
            try {
                $stmt = $con->query("SELECT key, value FROM settings");
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $cache[$row['key']] = $row['value'];
                }
            } catch (Exception $e) {
                // Ignore errors, cache remains empty
                error_log('functions: getSetting() failed: ' . $e->getMessage());
            }
        }
    }
    
    return isset($cache[$key]) ? $cache[$key] : $default;
}










/**
 * Token a saved icon rail order uses for a separator line between two entries.
 * It can appear any number of times, unlike the button ids around it. Never a
 * button id itself: those all end in "Btn".
 */
const POZNOTE_ICON_SIDEBAR_DIVIDER = 'divider';







/**
 * True when the current request may target other accounts of the instance by id
 * (share restrictions, user directory). Tenant isolation turns an instance into
 * a SaaS: a non-admin must not be able to learn that the other accounts exist,
 * so naming them is refused server-side and not merely hidden in the UI.
 * Admins keep the capability so they can still manage the instance.
 */
function poznoteCanTargetOtherUsers() {
    if (!defined('TENANT_ISOLATION') || !TENANT_ISOLATION) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * True when the given tenant isolation feature is blocked on this instance
 * (for non-admin users; the per-request admin exemption is up to the caller).
 */
function poznoteTenantIsolationBlocks($feature) {
    return defined('TENANT_ISOLATION_FEATURES')
        && in_array($feature, TENANT_ISOLATION_FEATURES, true);
}

/**
 * True when the current user may manage personal webhooks. Blocked for
 * non-admin users when tenant isolation blocks the user_webhooks feature:
 * webhooks relay note metadata to arbitrary endpoints, which a SaaS operator
 * may not want to offer to tenants. Admins keep the capability.
 */
function poznoteCanUseUserWebhooks() {
    if (!poznoteTenantIsolationBlocks('user_webhooks')) {
        return true;
    }

    return function_exists('isCurrentUserAdmin') && isCurrentUserAdmin();
}

/**
 * Clean content for search by removing base64 images and other heavy data
 * This is used to keep the database entry column lightweight for search functionality
 */
function cleanContentForSearch($content) {
    // Remove base64 images (data:image/...)
    $content = preg_replace('/data:image\/[^;]+;base64,[A-Za-z0-9+\/=]+/', '[image]', $content);
    
    // Remove Excalidraw containers with embedded data
    $content = preg_replace('/<div[^>]*class="excalidraw-container"[^>]*>.*?<\/div>/s', '[Excalidraw diagram]', $content);
    
    return $content;
}

/**
 * Internationalization (i18n)
 * - Uses JSON dictionaries in src/i18n/{lang}.json
 * - Active language stored in settings table key: 'language'
 * - Fallback to English when a key is missing
 */










/**
 * Get the page title for the application
 * Uses custom display name from settings if available, otherwise uses app name from i18n
 * @return string The HTML-escaped page title
 */
function getPageTitle() {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    
    require_once __DIR__ . '/users/db_master.php';
    $login_display_name = getGlobalSetting('login_display_name', '');
    
    if ($login_display_name && trim($login_display_name) !== '') {
        $cached = htmlspecialchars($login_display_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    } else {
        $cached = t_h('app.name');
    }
    
    return $cached;
}





















/**
 * Whether the SaaS-mode storage usage notices are shown (red "note-taking
 * app, not media storage" reminders on the attachment pages, the user
 * storage statistics page and the S3 attachments settings). Hidden by
 * default; the admin enables them from the SaaS mode settings page.
 */
function poznoteSaasNoticesEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_storage_notices', '0') === '1';
}

/**
 * Whether the "contact the administrator" card is shown to every user in
 * the About section of the settings page. Hidden by default; enabled from
 * the SaaS mode settings page.
 */
function poznoteSaasAdminContactEnabled(): bool {
    require_once __DIR__ . '/users/db_master.php';
    return getGlobalSetting('saas_show_admin_contact', '0') === '1';
}

/**
 * URL where users should post general questions, as configured on the SaaS
 * settings page. Empty string when not configured: the Help card then skips
 * the community block (and disappears entirely when the contact email is
 * empty too).
 */
function poznoteSaasCommunityUrl(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_community_url', ''));
}

/**
 * Email address shown on the Help card, as configured on the SaaS settings
 * page. Empty string when not configured: the card then only offers the
 * community space link.
 */
function poznoteSaasAdminContactEmail(): string {
    require_once __DIR__ . '/users/db_master.php';
    return trim((string)getGlobalSetting('saas_admin_contact_email', ''));
}
















// Display name stored as original_filename. Uses the validated basename and drops
// characters that are meaningless in a filename but significant in HTML, as
// defense in depth: every renderer must still escape the value.






// "Highlight current folder tree": how much the rows outside the active
// hierarchy fade, in percent. The user picks a value on the settings slider;
// index.php turns it into --folder-tree-dim-opacity (css/folders/tree-highlight.css).
const POZNOTE_FOLDER_TREE_DIM_DEFAULT = 35;
const POZNOTE_FOLDER_TREE_DIM_MIN = 10;
const POZNOTE_FOLDER_TREE_DIM_MAX = 90;
const POZNOTE_FOLDER_TREE_DIM_STEP = 5;

const POZNOTE_SNAPSHOTS_DEFAULT_COUNT = 3;
const POZNOTE_SNAPSHOTS_MIN_COUNT = 1;
const POZNOTE_SNAPSHOTS_MAX_COUNT = 30;
const POZNOTE_SNAPSHOTS_MAX_AGE_DAYS = 30;
// Snapshots taken before an AI assistant / MCP edit kept per note (newest
// first). The default of the snapshots_safety_keep_count setting: an instance
// whose MCP server does a lot of editing rolls through 20 in an afternoon.
const POZNOTE_SNAPSHOTS_SAFETY_DEFAULT_COUNT = 20;
const POZNOTE_SNAPSHOTS_SAFETY_MIN_COUNT = 1;
const POZNOTE_SNAPSHOTS_SAFETY_MAX_COUNT = 200;








/**
 * Remove everything a permanently deleted note leaves on disk: every attachment
 * file listed in its attachments JSON (visible or kept for snapshots only) and
 * its snapshots. Every code path that deletes an entries row for good must go
 * through here.
 */
function deleteNoteFilesForGood($noteId, $attachments) {
    foreach (poznoteDecodeAttachments($attachments) as $attachment) {
        if (is_array($attachment) && !empty($attachment['filename'])) {
            poznoteDeleteAttachmentFile($attachment['filename']);
        }
    }

    deleteNoteSnapshots($noteId);
}


/**
 * Get the appropriate file extension based on note type
 * @param string $type The note type (note, markdown, tasklist)
 * @return string The file extension (.md or .html)
 */
function getFileExtensionForType($type) {
    return ($type === 'markdown') ? '.md' : '.html';
}

/**
 * Get the full filename for a note entry
 * @param int $id The note ID
 * @param string $type The note type
 * @return string The complete filename with path and extension
 */
function getEntryFilename($id, $type) {
    $extension = getFileExtensionForType($type);
    return getEntriesPath() . '/' . $id . $extension;
}

/**
 * Clone one note (row, content file and attachments) into a new entry.
 *
 * Shared by the note duplicate endpoint and the recursive folder duplicate,
 * so both produce the same kind of copy: same type, tags, icon, color and
 * width, a fresh created/updated timestamp, never trashed or favorite, and
 * attachments copied under new ids with the content rewritten to point at
 * them. The heading is made unique in the target folder ("Title (1)").
 *
 * Quotas are NOT checked here; callers check them before cloning so a folder
 * duplicate can be refused as a whole instead of half-way through.
 *
 * @param PDO   $con     Database connection
 * @param int   $noteId  Source note id (must not be in the trash)
 * @param array $options Optional overrides:
 *   'folderId'      => int|null Target folder id (omit to keep the source folder)
 *   'folderName'    => string   Target folder name (used with folderId)
 *   'headingPrefix' => string   Prefix added to the copied heading
 *   'actorUserId'   => int      User recorded as creator of the copy
 * @return array|null ['id' => int, 'heading' => string], or null when the
 *                    source note does not exist
 * @throws Exception on database or file errors
 */
function poznoteCloneNoteRecord(PDO $con, int $noteId, array $options = []): ?array {
    $headingPrefix  = (string)($options['headingPrefix'] ?? '');
    $overrideFolder = array_key_exists('folderId', $options);
    $actorUserId    = (int)($options['actorUserId'] ?? 0);

    $stmt = $con->prepare("SELECT heading, entry, tags, folder, folder_id, workspace, type, attachments, icon, icon_color, color, content_width FROM entries WHERE id = ? AND trash = 0");
    $stmt->execute([$noteId]);
    $originalNote = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$originalNote) {
        return null;
    }

    $workspace  = $originalNote['workspace'];
    $folderId   = $overrideFolder ? ($options['folderId'] ?? null) : $originalNote['folder_id'];
    $folderName = $overrideFolder ? ($options['folderName'] ?? null) : $originalNote['folder'];

    // Generate unique heading
    $originalHeading = $originalNote['heading'] ?: t('index.note.new_note', [], 'New note');
    $newHeading = generateUniqueTitle($headingPrefix . $originalHeading, null, $workspace, $folderId);

    // Duplicate attachments
    $newAttachments = null;
    $attachmentIdMapping = [];
    $originalAttachments = $originalNote['attachments'] ? json_decode($originalNote['attachments'], true) : [];

    if (!empty($originalAttachments)) {
        $duplicatedAttachments = [];

        foreach ($originalAttachments as $attachment) {
            if (poznoteAttachmentIsSnapshotOnly($attachment)) {
                continue;
            }

            // Readable local path (fetched from the bucket in S3 mode)
            $originalFilePath = poznoteAttachmentLocalFile($attachment['filename'] ?? '');

            if ($originalFilePath !== null) {
                $fileExtension = pathinfo($attachment['filename'], PATHINFO_EXTENSION);
                $newFilename = uniqid() . '_' . time() . '.' . $fileExtension;
                $oldAttachmentId = $attachment['id'];
                $newAttachmentId = uniqid();

                if (poznoteStoreAttachmentFromPath($originalFilePath, $newFilename, $attachment['file_type'] ?? 'application/octet-stream')) {
                    $attachmentIdMapping[$oldAttachmentId] = $newAttachmentId;

                    $duplicatedAttachments[] = [
                        'id' => $newAttachmentId,
                        'filename' => $newFilename,
                        'original_filename' => $attachment['original_filename'],
                        'file_size' => $attachment['file_size'],
                        'file_type' => $attachment['file_type'],
                        'uploaded_at' => date('Y-m-d H:i:s')
                    ];
                }
            }
        }

        $newAttachments = !empty($duplicatedAttachments) ? json_encode($duplicatedAttachments) : null;
    }

    // Read original content and update attachment references
    $originalFilename = getEntryFilename($noteId, $originalNote['type']);
    $content = $originalNote['entry'] ?? '';
    if (is_readable($originalFilename)) {
        $fileContent = file_get_contents($originalFilename);
        if ($fileContent !== false) {
            $content = $fileContent;
        }
    }
    foreach ($attachmentIdMapping as $oldId => $newId) {
        $content = str_replace($oldId, $newId, $content);
    }

    // Insert new note
    $insertStmt = $con->prepare("INSERT INTO entries (heading, entry, tags, folder, folder_id, workspace, type, attachments, icon, icon_color, color, content_width, created, updated, trash, favorite, created_by_user_id, updated_by_user_id) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 0, 0, ?, ?)");
    $insertStmt->execute([
        $newHeading,
        $originalNote['tags'],
        $folderName,
        $folderId,
        $workspace,
        $originalNote['type'],
        $newAttachments,
        $originalNote['icon'],
        $originalNote['icon_color'],
        $originalNote['color'],
        $originalNote['content_width'],
        $actorUserId,
        $actorUserId
    ]);

    $newId = (int)$con->lastInsertId();

    // Update note ID references in attachment URLs
    // Replace /api/v1/notes/{oldNoteId}/attachments/ with /api/v1/notes/{newNoteId}/attachments/
    if (!empty($content) && !empty($attachmentIdMapping)) {
        $content = str_replace(
            '/api/v1/notes/' . $noteId . '/attachments/',
            '/api/v1/notes/' . $newId . '/attachments/',
            $content
        );
    }

    // Write file
    $newFilename = getEntryFilename($newId, $originalNote['type']);
    if (!empty($content)) {
        file_put_contents($newFilename, $content);
        chmod($newFilename, 0644);
    }

    $updateEntryStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
    $updateEntryStmt->execute([$content, $newId]);

    return ['id' => $newId, 'heading' => $newHeading];
}



/**
 * Workspace the "Archive note" action files notes into, created on first use.
 *
 * Deliberately not translated: the name is stored in the database, so a
 * language change must not strand already archived notes in a workspace the
 * action no longer points at.
 */
if (!defined('POZNOTE_ARCHIVE_WORKSPACE')) {
    define('POZNOTE_ARCHIVE_WORKSPACE', 'Archives');
}














// Note: schema migrations are handled at runtime by db_connect.php




// Helper function to ensure proper permissions on data directory



/**
 * Fix database inconsistencies in notes:
 * 1. Populates folder_id from legacy folder (TEXT) column.
 * 2. Re-generates search snippets (entry column) from physical files if empty.
 * 
 * @param PDO $con The database connection
 * @return array Results of the repair operation
 */
function repairDatabaseEntries($con) {
    if (!$con) return ['success' => false, 'error' => 'No database connection'];
    
    $fixedFolders = 0;
    $createdFolders = 0;
    $fixedEntries = 0;
    
    try {
        // --- PART 1: FOLDERS MIGRATION ---
        // Only repair notes that are NOT in trash to avoid re-creating deleted folders
        $stmt = $con->query("SELECT id, folder, workspace FROM entries WHERE folder IS NOT NULL AND folder != '' AND folder_id IS NULL AND trash = 0");
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($notes as $note) {
            $noteId = $note['id'];
            $folderName = $note['folder'];
            $workspace = $note['workspace'] ?: 'Poznote';
            
            $checkStmt = $con->prepare("SELECT id FROM folders WHERE name = ? AND workspace = ? LIMIT 1");
            $checkStmt->execute([$folderName, $workspace]);
            $folder = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($folder) {
                $folderId = $folder['id'];
            } else {
                $insertStmt = $con->prepare("INSERT INTO folders (name, workspace) VALUES (?, ?)");
                $insertStmt->execute([$folderName, $workspace]);
                $folderId = $con->lastInsertId();
                $createdFolders++;
            }
            
            $updateStmt = $con->prepare("UPDATE entries SET folder_id = ? WHERE id = ?");
            $updateStmt->execute([$folderId, $noteId]);
            $fixedFolders++;
        }

        // --- PART 2: EMPTY ENTRY SNIPPETS (FOR SEARCH) ---
        $stmt = $con->query("SELECT id, type FROM entries WHERE (entry IS NULL OR entry = '') AND trash = 0");
        $emptyNotes = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($emptyNotes as $note) {
            $noteId = $note['id'];
            $type = $note['type'] ?: 'note';
            $filePath = getEntryFilename($noteId, $type);
            
            if (file_exists($filePath)) {
                $content = file_get_contents($filePath);
                if ($content !== false) {
                    // Extract a clean snippet for search
                    $snippet = cleanContentForSearch($content);
                    $snippet = strip_tags($snippet);
                    $snippet = mb_substr($snippet, 0, 500); // Limit to 500 chars for DB performance
                    
                    $updateStmt = $con->prepare("UPDATE entries SET entry = ? WHERE id = ?");
                    $updateStmt->execute([$snippet, $noteId]);
                    $fixedEntries++;
                }
            }
        }
        return [
            'success' => true, 
            'folders_fixed' => $fixedFolders, 
            'folders_created' => $createdFolders,
            'entries_fixed' => $fixedEntries
        ];
    } catch (Exception $e) {
        error_log("Error in repairDatabaseEntries: " . $e->getMessage());
        return ['success' => false, 'error' => $e->getMessage()];
    }
}








/**
 * Gate access behind the SETTINGS_PASSWORD when configured.
 * Redirects to settings.php if the session has not been unlocked.
 */
function requireSettingsPassword() {
    if (!defined('SETTINGS_PASSWORD') || SETTINGS_PASSWORD === '') {
        return;
    }
    if (!empty($_SESSION['settings_password_authenticated'])) {
        return;
    }
    header('Location: ' . (strpos($_SERVER['SCRIPT_NAME'] ?? '', '/admin/') !== false ? '../' : '') . 'settings.php');
    exit;
}





/**
 * Render the view controls used by the dashboard and diary boards, next to
 * the filter bar. $prefix namespaces the localStorage keys so each page
 * remembers its own settings. A single toggle cycles through the views
 * (grid small/medium/large, then list); the columns button caps the grid
 * width and is hidden in list layout (board-view-menu.js drives both).
 */
// ============================================================================
// Workspace tags and multi-workspace scope
// ============================================================================
//
// workspaces.tags holds a comma-separated list of labels ("school,psycho").
// Tags group workspaces on pages that can show several of them at once: the
// dashboard scope selector lists them and "scope=tag&tag=school" opens every
// workspace carrying that tag.






function renderBoardViewMenu(string $prefix) {
    $idPrefix = htmlspecialchars($prefix, ENT_QUOTES, 'UTF-8');
    echo '<div class="board-view-controls" data-view-prefix="' . $idPrefix . '">' .
        '<button type="button" id="' . $idPrefix . 'ViewLayoutBtn" class="board-view-btn board-view-layout-toggle"' .
            ' data-label-grid="' . t_h('dashboard.view.layout_grid', [], 'Grid') . '"' .
            ' data-label-list="' . t_h('dashboard.view.layout_list', [], 'List') . '"' .
            ' data-label-small="' . t_h('dashboard.view.size_small', [], 'Small') . '"' .
            ' data-label-medium="' . t_h('dashboard.view.size_medium', [], 'Medium') . '"' .
            ' data-label-large="' . t_h('dashboard.view.size_large', [], 'Large') . '"' .
            ' data-label-wide="' . t_h('dashboard.view.size_wide', [], 'Wide') . '">' .
            '<i class="lucide lucide-grid"></i>' .
            '<i class="lucide lucide-layout-list"></i>' .
            '<span class="board-view-size-letter"></span>' .
        '</button>' .
        '<button type="button" id="' . $idPrefix . 'ViewColumnsBtn" class="board-view-btn board-view-columns-btn"' .
            ' data-label-columns="' . t_h('dashboard.view.columns', [], 'Maximum columns') . '">' .
            '<span class="board-view-columns-value"></span>' .
        '</button>' .
    '</div>';
}





















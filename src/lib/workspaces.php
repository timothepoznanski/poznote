<?php
/**
 * Workspace resolution, filtering, tags, colours and the page title chip.
 *
 * Extracted from functions.php. Loaded through it, so no caller changed.
 */

/**
 * Get the first available workspace name from the database
 * Used as fallback when no specific workspace is selected
 * 
 * @return string The first workspace name, or empty string if none exists
 */
function getFirstWorkspaceName() {
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }

    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->query("SELECT name FROM workspaces ORDER BY name LIMIT 1");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && !empty($row['name'])) {
                return $row['name'];
            }
        } catch (Exception $e) {
            // Continue to default
            error_log('functions: getFirstWorkspaceName() failed: ' . $e->getMessage());
        }
    }
    return '';
}

/**
 * Get the current workspace filter from GET/POST parameters
 * Priority order:
 * 1. GET/POST parameter (highest priority)
 * 2. Database setting 'default_workspace' (if set to a specific workspace name)
 *    Special value '__last_opened__' means use last_opened_workspace from database
 * 3. Database setting 'last_opened_workspace' (the last workspace the user opened)
 * 4. Fallback to first available workspace
 * 
 * @return string The workspace name
 */
function getWorkspaceFilter() {
    static $cached = null;

    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return getPublicWorkspaceName() ?? '';
    }
    
    // First check URL parameters - but ignore if empty
    // These are dynamic, so don't cache if found
    if (isset($_GET['workspace']) && $_GET['workspace'] !== '') {
        return $_GET['workspace'];
    }
    if (isset($_POST['workspace']) && $_POST['workspace'] !== '') {
        return $_POST['workspace'];
    }
    
    // Return cached value if we already computed it
    if ($cached !== null) {
        return $cached;
    }
    
    // If no parameter or empty parameter, check for default workspace setting in database
    global $con;
    if (isset($con)) {
        try {
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['default_workspace']);
            $defaultWorkspace = $stmt->fetchColumn();
            // Only use defaultWorkspace if it's a real workspace name (not __last_opened__ or empty)
            if ($defaultWorkspace !== false && $defaultWorkspace !== '' && $defaultWorkspace !== '__last_opened__') {
                // Verify workspace exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$defaultWorkspace]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $defaultWorkspace;
                    return $cached;
                }
            }
            
            // Check for last_opened_workspace setting (used when default_workspace is '__last_opened__' or empty)
            $stmt = $con->prepare('SELECT value FROM settings WHERE key = ?');
            $stmt->execute(['last_opened_workspace']);
            $lastOpened = $stmt->fetchColumn();
            if ($lastOpened !== false && $lastOpened !== '') {
                // Verify the workspace still exists
                $checkStmt = $con->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
                $checkStmt->execute([$lastOpened]);
                if ((int)$checkStmt->fetchColumn() > 0) {
                    $cached = $lastOpened;
                    return $cached;
                }
            }
        } catch (Exception $e) {
            // If settings table doesn't exist or query fails, continue to default
            error_log('functions: getWorkspaceFilter() failed: ' . $e->getMessage());
        }
    }
    
    // Final fallback: get first available workspace
    $cached = getFirstWorkspaceName();
    return $cached;
}

/**
 * Render the current workspace as a small chip after a page title.
 *
 * The workspace-scoped pages (Notes, Folders, Tags, Tasks, ...) all show the
 * same heading whatever workspace is open, so the name is the only thing that
 * tells two visits apart. The chip carries the workspace colour (a layers
 * glyph when it has none), the name and a chevron: a button whose chevron opens a menu
 * listing every workspace as a link to this same page (page.php?workspace=X),
 * plus a shortcut to workspaces.php, so the page can be re-scoped in place.
 * js/page-title-workspace-menu.js (loaded by icon_sidebar.php) opens and
 * positions the menu; it is rendered here rather than fetched so it needs no
 * i18n runtime, which half of these pages never load.
 *
 * Returns an empty string when there is no workspace to name, which leaves
 * pages reached without one untouched. A public (password-protected) workspace
 * visitor gets the plain name: there is no other workspace to switch to.
 *
 * @param string|null $workspace Workspace name; defaults to getWorkspaceFilter().
 *                               A page whose scope is wider than one workspace
 *                               (dashboard.php) passes its scope label instead:
 *                               it is shown as is and, matching no workspace,
 *                               ticks no entry.
 * @param array $options 'query' extra query parameters carried by every
 *                               workspace link (dashboard.php: scope=single, so
 *                               the choice overrides a remembered multi-scope);
 *                       'items' action entries appended after the workspaces,
 *                               each ['icon', 'label', 'action'], rendered as a
 *                               button carrying data-action for the page's own
 *                               handler (dashboard.php: its scope modal).
 * @return string HTML fragment, or '' when there is nothing to show.
 */
function poznoteRenderPageTitleWorkspace($workspace = null, array $options = []) {
    if ($workspace === null) {
        $workspace = getWorkspaceFilter();
    }
    $workspace = trim((string)$workspace);
    if ($workspace === '' || $workspace === '__last_opened__') {
        return '';
    }

    $esc = static function ($value): string {
        return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    $escaped = $esc($workspace);

    global $con;
    $colors = isset($con) ? poznoteGetWorkspaceColorsMap($con) : [];
    $colorOf = static function ($name) use ($colors): string {
        $hex = isset($colors[$name]) ? (string)$colors[$name]['hex'] : '';
        return preg_match('/^#[0-9a-f]{3,8}$/i', $hex) ? $hex : '';
    };

    // The chip leads with the workspace colour (workspaces.php) when it has
    // one, else with a layers glyph; the dashboard's multi-workspace labels
    // ("All workspaces") match no workspace and get the glyph too.
    $chipHex = $colorOf($workspace);
    $chipLead = $chipHex !== ''
        ? '<span class="poznote-page-title-workspace-dot" style="background-color: ' . $esc($chipHex) . '"></span>'
        : '<i class="lucide lucide-layers poznote-page-title-workspace-icon" aria-hidden="true"></i>';
    $chipName = '<span class="poznote-page-title-workspace-name">' . $escaped . '</span>';

    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return '<span class="poznote-page-title-workspace poznote-page-title-workspace-static" title="' . $escaped . '">' . $chipLead . $chipName . '</span>';
    }

    // A page can take the whole switch over ('button_action'): the chip then
    // fires that action straight away instead of opening the menu below. The
    // dashboard uses it so one click lands on its scope modal, which already
    // offers a single workspace, several, all of them, or a tag.
    if (!empty($options['button_action'])) {
        return '<button type="button" class="poznote-page-title-workspace" id="poznotePageTitleWorkspaceBtn"'
            . ' data-action="' . $esc($options['button_action']) . '"'
            . ' title="' . $esc($options['button_title'] ?? t('page_title.switch_workspace', [], 'Switch workspace')) . '"'
            . ' aria-haspopup="dialog">'
            . $chipLead . $chipName
            . '<i class="lucide lucide-chevron-down poznote-page-title-workspace-chevron" aria-hidden="true"></i>'
            . '</button>';
    }

    $names = [];
    if (isset($con)) {
        try {
            $stmt = $con->query('SELECT name FROM workspaces ORDER BY name COLLATE NOCASE');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $name = (string)$row['name'];
                if ($name !== '') {
                    $names[] = $name;
                }
            }
        } catch (Exception $e) {
            $names = [];
        }
    }
    // Dots only when there is a colour to show: an empty slot on every row
    // would just indent the names.
    $showDots = !empty($colors);

    // Same page, only the workspace changes. The other parameters (a search, a
    // folder, a date) belong to the workspace being left; the rail's links drop
    // them the same way.
    $page = basename((string)parse_url($_SERVER['SCRIPT_NAME'] ?? '', PHP_URL_PATH));
    if ($page === '') {
        $page = 'index.php';
    }

    $html = '<button type="button" class="poznote-page-title-workspace" id="poznotePageTitleWorkspaceBtn"'
        . ' title="' . $esc(t('page_title.switch_workspace', [], 'Switch workspace')) . '"'
        . ' aria-haspopup="menu" aria-expanded="false" aria-controls="poznotePageTitleWorkspaceMenu">'
        . $chipLead . $chipName
        . '<i class="lucide lucide-chevron-down poznote-page-title-workspace-chevron" aria-hidden="true"></i>'
        . '</button>';

    // <span>s throughout: the fragment sits inside an <h1>, which only takes
    // phrasing content. The script moves the menu under <body> anyway.
    $html .= '<span class="poznote-page-title-workspace-menu" id="poznotePageTitleWorkspaceMenu" role="menu"'
        . ' aria-label="' . $esc(t('page_title.workspaces', [], 'Workspaces')) . '">';
    foreach ($names as $name) {
        $isCurrent = $name === $workspace;
        $hex = $colorOf($name);
        $html .= '<a class="poznote-page-title-workspace-item' . ($isCurrent ? ' poznote-page-title-workspace-item-current' : '') . '"'
            . ' role="menuitemradio" aria-checked="' . ($isCurrent ? 'true' : 'false') . '"'
            . ' href="' . $esc($page . '?' . http_build_query(array_merge($options['query'] ?? [], ['workspace' => $name]))) . '"'
            . ' data-workspace="' . $esc($name) . '">';
        if ($showDots) {
            $html .= $hex !== ''
                ? '<span class="poznote-page-title-workspace-dot" style="background-color: ' . $esc($hex) . '"></span>'
                : '<span class="poznote-page-title-workspace-dot poznote-page-title-workspace-dot-none"></span>';
        }
        $html .= '<span class="poznote-page-title-workspace-item-name">' . $esc($name) . '</span>'
            . ($isCurrent ? '<i class="lucide lucide-check" aria-hidden="true"></i>' : '')
            . '</a>';
    }
    $html .= '<span class="poznote-page-title-workspace-menu-sep" role="separator"></span>';
    foreach (($options['items'] ?? []) as $item) {
        $html .= '<button type="button" class="poznote-page-title-workspace-item poznote-page-title-workspace-item-action" role="menuitem"'
            . (!empty($item['action']) ? ' data-action="' . $esc($item['action']) . '"' : '') . '>'
            . (!empty($item['icon']) ? '<i class="lucide ' . $esc($item['icon']) . '" aria-hidden="true"></i>' : '')
            . '<span class="poznote-page-title-workspace-item-name">' . $esc($item['label'] ?? '') . '</span>'
            . '</button>';
    }
    $html .= '<a class="poznote-page-title-workspace-item poznote-page-title-workspace-item-manage" role="menuitem" href="workspaces.php">'
        . '<i class="lucide lucide-layers" aria-hidden="true"></i>'
        . '<span class="poznote-page-title-workspace-item-name">' . $esc(t('page_title.manage_workspaces', [], 'Manage workspaces')) . '</span>'
        . '</a>'
        . '</span>';

    return $html;
}

/**
 * Return a filesystem-safe, deterministic segment for workspace background files.
 */
function getWorkspaceBackgroundSegment($workspace) {
    $workspace = trim((string)$workspace);
    if ($workspace === '') {
        return 'default';
    }

    $segment = preg_replace('/[^A-Za-z0-9_-]/', '_', $workspace);
    $segment = trim((string)$segment, '_');

    if ($segment === '') {
        $segment = 'workspace';
    }

    if ($segment !== $workspace) {
        $segment .= '_' . substr(hash('sha256', $workspace), 0, 8);
    }

    return $segment;
}

/**
 * Save the last opened workspace to the database
 * This is called when a workspace is opened/selected
 * 
 * @param string $workspace The workspace name to save
 * @return bool Whether the save was successful
 */
function saveLastOpenedWorkspace($workspace) {
    global $con;
    if (function_exists('isPublicWorkspaceAccessActive') && isPublicWorkspaceAccessActive()) {
        return false;
    }

    if (!isset($con) || empty($workspace)) {
        return false;
    }
    
    try {
        $stmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        return $stmt->execute(['last_opened_workspace', $workspace]);
    } catch (Exception $e) {
        return false;
    }
}

/**
 * Normalize a raw tags value (array or comma-separated string) into a clean
 * list: trimmed, non-empty, deduplicated case-insensitively, capped in size.
 */
function poznoteParseWorkspaceTags($raw): array {
    $parts = is_array($raw) ? $raw : explode(',', (string)$raw);
    $tags = [];
    $seen = [];
    foreach ($parts as $part) {
        $tag = trim((string)preg_replace('/\s+/u', ' ', (string)$part));
        if ($tag === '') continue;
        $tag = mb_substr($tag, 0, 50);
        $key = mb_strtolower($tag);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $tags[] = $tag;
        if (count($tags) >= 20) break;
    }
    return $tags;
}

function poznoteSerializeWorkspaceTags(array $tags): string {
    return implode(',', poznoteParseWorkspaceTags($tags));
}

/**
 * Tags of every workspace, keyed by workspace name (workspace list order).
 */
function poznoteGetWorkspaceTagsMap(PDO $con): array {
    $map = [];
    try {
        $stmt = $con->query('SELECT name, tags FROM workspaces ORDER BY name COLLATE NOCASE');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $map[(string)$row['name']] = poznoteParseWorkspaceTags($row['tags'] ?? '');
        }
    } catch (Exception $e) {
        // Column missing on a not-yet-migrated database: no tags
        try {
            $stmt = $con->query('SELECT name FROM workspaces ORDER BY name COLLATE NOCASE');
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $map[(string)$row['name']] = [];
            }
        } catch (Exception $e2) {
            error_log('functions: poznoteGetWorkspaceTagsMap() failed: ' . $e2->getMessage());
        }
    }
    return $map;
}

/**
 * Color of every colored workspace, keyed by name: the stored value (palette
 * id or '#rrggbb', same semantics as entries.color) and the hex it resolves
 * to. Workspaces without a color, or whose palette entry was deleted, are
 * absent.
 */
function poznoteGetWorkspaceColorsMap(PDO $con): array {
    $map = [];
    try {
        $stmt = $con->query("SELECT name, color FROM workspaces WHERE color IS NOT NULL AND color != ''");
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $hex = resolveNoteColorHex((string)$row['color']);
            if ($hex !== '') {
                $map[(string)$row['name']] = ['color' => (string)$row['color'], 'hex' => $hex];
            }
        }
    } catch (Exception $e) {
        // Column missing on a not-yet-migrated database: no colors
        error_log('functions: poznoteGetWorkspaceColorsMap() failed: ' . $e->getMessage());
    }
    return $map;
}

/**
 * Resolve which workspaces a multi-workspace page shows, from its request
 * parameters:
 *   workspace=X                 one workspace (the default)
 *   scope=all                   every workspace
 *   scope=tag&tag=T             every workspace carrying tag T
 *   scope=list&ws[]=A&ws[]=B    an explicit list (one name falls back to single)
 *
 * Returns:
 *   mode        'single' | 'all' | 'tag' | 'list'
 *   workspaces  matching workspace names, in workspace list order
 *   tag         the requested tag (tag mode)
 *   query       the URL parameters reproducing this scope
 *   key         a short stable identifier for per-scope client preferences
 *   tags_map    name => tags for every workspace (for selectors)
 *   colors_map  name => ['color' => stored value, 'hex' => resolved] for colored workspaces
 */
function poznoteResolveWorkspaceScope(PDO $con, array $params, string $fallbackWorkspace): array {
    $mode = isset($params['scope']) ? strtolower(trim((string)$params['scope'])) : '';
    $tagsMap = poznoteGetWorkspaceTagsMap($con);
    $allNames = array_keys($tagsMap);

    $scope = ['mode' => 'single', 'workspaces' => [], 'tag' => '', 'query' => [], 'key' => '', 'tags_map' => $tagsMap, 'colors_map' => poznoteGetWorkspaceColorsMap($con)];

    if ($mode === 'all' && !empty($allNames)) {
        $scope['mode'] = 'all';
        $scope['workspaces'] = $allNames;
        $scope['query'] = ['scope' => 'all'];
        $scope['key'] = 'all';
    } elseif ($mode === 'tag') {
        $tag = trim((string)($params['tag'] ?? ''));
        if ($tag !== '') {
            $needle = mb_strtolower($tag);
            $matches = [];
            foreach ($tagsMap as $name => $tags) {
                foreach ($tags as $candidate) {
                    if (mb_strtolower($candidate) === $needle) {
                        $matches[] = $name;
                        break;
                    }
                }
            }
            // Kept even without a match so the page can say so
            $scope['mode'] = 'tag';
            $scope['tag'] = $tag;
            $scope['workspaces'] = $matches;
            $scope['query'] = ['scope' => 'tag', 'tag' => $tag];
            $scope['key'] = 'tag:' . $needle;
        }
    } elseif ($mode === 'list') {
        $wanted = $params['ws'] ?? [];
        if (!is_array($wanted)) $wanted = [$wanted];
        $wanted = array_map('strval', $wanted);
        $matches = array_values(array_filter($allNames, fn($n) => in_array($n, $wanted, true)));
        if (count($matches) === 1) {
            $scope['workspaces'] = $matches;
        } elseif (count($matches) > 1) {
            $scope['mode'] = 'list';
            $scope['workspaces'] = $matches;
            $scope['query'] = ['scope' => 'list', 'ws' => $matches];
            $scope['key'] = 'list:' . implode('|', $matches);
        }
    }

    if ($scope['mode'] === 'single') {
        if (empty($scope['workspaces']) && $fallbackWorkspace !== '') {
            $scope['workspaces'] = [$fallbackWorkspace];
        }
        $scope['query'] = !empty($scope['workspaces']) ? ['workspace' => $scope['workspaces'][0]] : [];
    }

    return $scope;
}

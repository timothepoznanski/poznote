<?php

function publicSlugNormalizeWorkspaceName(string $workspaceName): string {
    $workspaceName = trim($workspaceName);
    if ($workspaceName === '') {
        return '';
    }

    return function_exists('mb_strtolower')
        ? mb_strtolower($workspaceName, 'UTF-8')
        : strtolower($workspaceName);
}

function publicSlugResolvesToSharedWorkspace(string $workspaceName): bool {
    $normalizedWorkspaceName = publicSlugNormalizeWorkspaceName($workspaceName);
    if ($normalizedWorkspaceName === '') {
        return false;
    }

    require_once __DIR__ . '/../config.php';
    require_once __DIR__ . '/../users/db_master.php';
    require_once __DIR__ . '/../users/UserDataManager.php';

    try {
        $masterCon = getMasterConnection();
        $stmt = $masterCon->prepare("SELECT user_id, target_id FROM shared_links WHERE token = ? AND target_type = 'workspace' LIMIT 1");
        $stmt->execute(['workspace:' . $normalizedWorkspaceName]);
        $registryRow = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$registryRow) {
            return false;
        }

        $userId = (int)$registryRow['user_id'];
        $targetId = (int)$registryRow['target_id'];
        if ($userId <= 0 || $targetId <= 0) {
            return false;
        }

        $user = getUserProfileById($userId);
        if (!$user || !(bool)($user['active'] ?? false)) {
            return false;
        }

        $userDataManager = new UserDataManager($userId);
        $dbPath = $userDataManager->getUserDatabasePath();
        if (!is_file($dbPath)) {
            return false;
        }

        $userCon = new PDO('sqlite:' . $dbPath);
        $userCon->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $userCon->exec('PRAGMA busy_timeout = 5000');

        $stmt = $userCon->prepare('SELECT workspace_name FROM shared_workspaces WHERE id = ? LIMIT 1');
        $stmt->execute([$targetId]);
        $sharedWorkspace = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$sharedWorkspace) {
            return false;
        }

        $resolvedWorkspaceName = trim((string)($sharedWorkspace['workspace_name'] ?? ''));
        if ($resolvedWorkspaceName === '' || publicSlugNormalizeWorkspaceName($resolvedWorkspaceName) !== $normalizedWorkspaceName) {
            return false;
        }

        $stmt = $userCon->prepare('SELECT COUNT(*) FROM workspaces WHERE name = ?');
        $stmt->execute([$resolvedWorkspaceName]);
        return (int)$stmt->fetchColumn() > 0;
    } catch (Exception $e) {
        error_log('Poznote public workspace slug routing failed: ' . $e->getMessage());
        return false;
    }
}

function publicSlugBuildScriptName(string $scriptName): string {
    $currentScriptName = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    $scriptDir = str_replace('\\', '/', dirname($currentScriptName));
    if ($scriptDir === '/' || $scriptDir === '\\' || $scriptDir === '.') {
        return $scriptName;
    }

    return rtrim($scriptDir, '/') . $scriptName;
}

$slug = isset($_GET['slug']) && is_string($_GET['slug']) ? trim($_GET['slug']) : '';
$workspaceName = rawurldecode($slug);

if ($workspaceName !== '' && strpos($workspaceName, '/') === false) {
    if (publicSlugResolvesToSharedWorkspace($workspaceName)) {
        $_GET['workspace'] = $workspaceName;
        $_REQUEST['workspace'] = $workspaceName;
        $_GET['public_workspace'] = '1';
        $_REQUEST['public_workspace'] = '1';
        $_SERVER['POZNOTE_PUBLIC_WORKSPACE_SLUG'] = '1';
        $_SERVER['SCRIPT_NAME'] = publicSlugBuildScriptName('/index.php');
        $_SERVER['PHP_SELF'] = publicSlugBuildScriptName('/index.php');

        require_once __DIR__ . '/index.php';
        exit;
    }
}

if ($slug !== '' && strpos($slug, '/') === false) {
    $_GET['token'] = $slug;
    $_REQUEST['token'] = $slug;
}

require_once __DIR__ . '/public_note.php';

<?php
/**
 * User Profiles Administration Page
 *
 * Manage user profiles.
 * Note: This is NOT about passwords - there's one global password.
 * This is about user profiles that each have their own data space.
 */

// === Authentication & Authorization ===
require_once __DIR__ . '/../auth.php';
requireAuth();
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
requireSettingsPassword();
require_once __DIR__ . '/../db_connect.php';

// Only admins can access this page
if (!isCurrentUserAdmin()) {
    header('HTTP/1.1 403 Forbidden');
    echo '<div style="padding: 20px; font-family: sans-serif; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; margin: 20px;">' . t_h('multiuser.admin.access_denied_admin', [], 'Access denied. Admin privileges required.') . '</div>';
    exit;
}

// === Dependencies ===
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../version_helper.php';

// === Initialize Variables ===
$currentLang = getUserLanguage();
$pageWorkspace = trim(getWorkspaceFilter());
$currentAuthUserId = (int)(getAuthenticatedUserId() ?? getCurrentUserId() ?? 0);
$error = '';

// Flash left by a POST that had to redirect (post/redirect/get) but still has
// something to report, e.g. an account deleted with a failed S3 cleanup.
if (!empty($_SESSION['admin_users_flash_error'])) {
    $error = (string)$_SESSION['admin_users_flash_error'];
    unset($_SESSION['admin_users_flash_error']);
}

if (empty($_SESSION['admin_users_csrf_token'])) {
    $_SESSION['admin_users_csrf_token'] = bin2hex(random_bytes(32));
}
$adminUsersCsrfToken = $_SESSION['admin_users_csrf_token'];

// === Handle Form Actions ===
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postedCsrfToken = $_POST['csrf_token'] ?? '';

    if (!is_string($postedCsrfToken) || !hash_equals($adminUsersCsrfToken, $postedCsrfToken)) {
        $error = t('oidc_admin.error_csrf', [], 'Invalid form submission. Please try again.');
    } else {
        $action = $_POST['action'] ?? '';

        switch ($action) {
            // Create new user profile
            case 'create':
                $username = trim($_POST['username'] ?? '');
                $email = trim($_POST['email'] ?? '');

                if (empty($username)) {
                    $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                    break;
                }

                $result = createUserProfile($username, $email);

                if ($result['success']) {
                    // Best-effort: notify outgoing webhooks of the new account.
                    try {
                        require_once __DIR__ . '/../WebhookDispatcher.php';
                        (new WebhookDispatcher())->dispatchUserCreated((int)$result['user_id'], 'admin');
                    } catch (Throwable $e) {
                        error_log('Webhook dispatch failed after admin user creation: ' . $e->getMessage());
                    }

                    // Redirect to refresh the page and show the new user
                    header('Location: ' . $_SERVER['PHP_SELF']);
                    exit;
                } else {
                    $error = $result['error'];
                }
                break;

            // Update existing user profile (username, name, email, OIDC subject)
            case 'update_profile':
                $userId = (int)($_POST['user_id'] ?? 0);
                $username = trim($_POST['username'] ?? '');
                $firstName = trim($_POST['first_name'] ?? '');
                $lastName = trim($_POST['last_name'] ?? '');
                $email = trim($_POST['email'] ?? '');
                $oidcSubject = trim($_POST['oidc_subject'] ?? '');

                if (empty($username)) {
                    $error = t('multiuser.admin.errors.username_required', [], 'Username is required');
                    break;
                }

                $profileBefore = getUserProfileById($userId);

                $result = updateUserProfile($userId, [
                    'username' => $username,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $email,
                    // Admin-set emails are trusted for OIDC account matching.
                    'email_verified' => 1,
                    'oidc_subject' => $oidcSubject
                ]);

                if ($result['success']) {
                    // Best-effort: notify outgoing webhooks of the change.
                    try {
                        require_once __DIR__ . '/../WebhookDispatcher.php';
                        (new WebhookDispatcher())->dispatchUserProfileChanged($userId, 'admin', $profileBefore);
                    } catch (Throwable $e) {
                        error_log('Webhook dispatch failed after admin profile update: ' . $e->getMessage());
                    }

                    // Redirect to refresh the page
                    header('Location: ' . $_SERVER['PHP_SELF']);
                    exit;
                } else {
                    $error = $result['error'];
                }
                break;

            // Delete user profile and all associated data
            case 'delete':
                $userId = (int)($_POST['user_id'] ?? 0);
                $deleteData = true; // Always delete data when deleting a user

                // Cannot delete yourself
                if ($userId === $currentAuthUserId) {
                    $error = t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile');
                    break;
                }

                // Captured before deletion: the profile row is gone afterwards.
                $deletedProfile = getUserProfileById($userId);

                // The typed confirmation is re-checked here: the disabled
                // button only guards the UI, and this POST can be forged.
                // Both sides are trimmed so accounts created before usernames
                // were normalized (stray whitespace) stay deletable.
                $confirmUsername = trim((string)($_POST['confirm_username'] ?? ''));
                if (!$deletedProfile || $confirmUsername !== trim((string)$deletedProfile['username'])) {
                    $error = t(
                        'multiuser.admin.errors.confirm_username_mismatch',
                        [],
                        'The username you typed does not match the account to delete. Nothing was deleted.'
                    );
                    break;
                }

                // Deleting an account always wipes everything it owns,
                // S3 attachments and backup archives included.
                $result = deleteUserProfile($userId, $deleteData);

                if ($result['success']) {
                    // Logged with the deleted account as subject, not the admin
                    // performing it: the log answers "what happened to this
                    // account", and source='admin' records who acted.
                    require_once __DIR__ . '/../ActivityLog.php';
                    [, $actingAdminName] = currentActivityActor();
                    // s3_objects_deleted records what actually happened;
                    // s3_error is written on partial failure so the audit
                    // trail never claims a cleanup that did not complete.
                    $deletionLogDetails = [
                        'deleted_data' => $deleteData,
                        's3_objects_deleted' => (int)($result['s3_deleted'] ?? 0),
                        'performed_by' => $actingAdminName,
                    ];
                    if (!empty($result['s3_error'])) {
                        $deletionLogDetails['s3_error'] = $result['s3_error'];
                    }
                    logActivity(
                        ACTIVITY_ACCOUNT_DELETED,
                        $deletionLogDetails,
                        'admin',
                        $userId,
                        $deletedProfile['username'] ?? null
                    );

                    // Best-effort: notify outgoing webhooks of the deletion.
                    if ($deletedProfile) {
                        try {
                            require_once __DIR__ . '/../WebhookDispatcher.php';
                            (new WebhookDispatcher())->dispatchUserDeleted($deletedProfile, 'admin');
                        } catch (Throwable $e) {
                            error_log('Webhook dispatch failed after admin user deletion: ' . $e->getMessage());
                        }
                    }

                    // The account is gone either way, but objects left behind
                    // in a bucket need a human: carry the warning through the
                    // redirect (a flash rendered on the next GET) instead of
                    // skipping the redirect — the account no longer exists, so
                    // an F5 re-POST would only produce a misleading error.
                    if (!empty($result['s3_error'])) {
                        $_SESSION['admin_users_flash_error'] = t(
                            'multiuser.admin.errors.s3_cleanup_failed',
                            ['error' => $result['s3_error']],
                            'The account was deleted, but its files could not be removed from the S3 buckets: {{error}}. Delete them manually.'
                        );
                    }

                    // Redirect to refresh the page
                    header('Location: ' . $_SERVER['PHP_SELF']);
                    exit;
                } else {
                    $error = $result['error'];
                }
                break;

            // Toggle user status or admin role
            case 'toggle_status':
                $userId = (int)($_POST['user_id'] ?? 0);
                $field = $_POST['field'] ?? '';
                $value = $_POST['value'] ?? 0;

                // Cannot modify yourself
                if ($userId === $currentAuthUserId) {
                    $error = t('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role');
                    break;
                }

                // Only allow toggling active/admin fields
                if ($field === 'active' || $field === 'is_admin') {
                    $profileBefore = getUserProfileById($userId);

                    $data = [$field => (int)$value];
                    $result = updateUserProfile($userId, $data);

                    if ($result['success']) {
                        // Best-effort: notify outgoing webhooks of the change.
                        try {
                            require_once __DIR__ . '/../WebhookDispatcher.php';
                            (new WebhookDispatcher())->dispatchUserProfileChanged($userId, 'admin', $profileBefore);
                        } catch (Throwable $e) {
                            error_log('Webhook dispatch failed after admin status toggle: ' . $e->getMessage());
                        }

                        // Redirect to refresh the page
                        header('Location: ' . $_SERVER['PHP_SELF']);
                        exit;
                    } else {
                        $error = $result['error'];
                    }
                }
                break;

            // Update which note accounts this user can open after login
            case 'update_account_access':
                $userId = (int)($_POST['user_id'] ?? 0);
                $allowedUserIds = $_POST['allowed_user_ids'] ?? [];
                if (!is_array($allowedUserIds)) {
                    $allowedUserIds = [];
                }

                // setUserAccountAccessTargets replaces the whole grant list, so
                // the before/after sets have to be diffed here to tell an added
                // grant from a removed one.
                $accessBefore = [];
                try {
                    $beforeStmt = getMasterConnection()->prepare(
                        'SELECT target_user_id FROM user_account_access WHERE accessor_user_id = ?'
                    );
                    $beforeStmt->execute([$userId]);
                    $accessBefore = array_map('intval', $beforeStmt->fetchAll(PDO::FETCH_COLUMN));
                } catch (Throwable $e) {
                    error_log('Could not read account access before update: ' . $e->getMessage());
                }

                $result = setUserAccountAccessTargets($userId, $allowedUserIds);

                if ($result['success']) {
                    require_once __DIR__ . '/../ActivityLog.php';
                    logAccountAccessChange($userId, $accessBefore);

                    header('Location: ' . $_SERVER['PHP_SELF']);
                    exit;
                } else {
                    $error = $result['error'];
                }
                break;
        }
    }
}

// === Users Table Sort (persisted in the settings table) ===
// 'access' is computed from the account-access map, so it is sorted in PHP below;
// every other column is sorted in SQL by listAllUserProfiles().
$sortableUsersColumns = ['id', 'status', 'username', 'admin', 'first_name', 'last_name', 'email', 'access', 'created', 'last_login'];
$allowedUsersSorts = [];
foreach ($sortableUsersColumns as $sortableColumn) {
    $allowedUsersSorts[] = $sortableColumn . '_asc';
    $allowedUsersSorts[] = $sortableColumn . '_desc';
}
$requestedSort = $_GET['sort'] ?? '';
if (in_array($requestedSort, $allowedUsersSorts, true)) {
    $usersSort = $requestedSort;
    try {
        $sortStmt = $con->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        $sortStmt->execute(['admin_users_sort', $usersSort]);
    } catch (Exception $e) {
        // Non-fatal: the requested sort still applies for this request.
    }
} else {
    $storedSort = getSetting('admin_users_sort');
    $usersSort = in_array($storedSort, $allowedUsersSorts, true) ? $storedSort : 'id_asc';
}
$usersSortColumn = substr($usersSort, 0, strrpos($usersSort, '_'));
$usersSortDir = substr($usersSort, strrpos($usersSort, '_') + 1);

/**
 * Render a sortable column header as a link that toggles the sort direction,
 * with a chevron showing the current direction on the active column.
 */
function renderUsersSortHeader(string $column, string $escapedLabel, string $currentColumn, string $currentDir): string {
    $isActive = $column === $currentColumn;
    $nextSort = $column . '_' . (($isActive && $currentDir === 'asc') ? 'desc' : 'asc');
    $icon = ($isActive && $currentDir === 'asc') ? 'lucide-chevron-up' : 'lucide-chevron-down';
    return '<a class="users-sort-link' . ($isActive ? ' users-sort-active' : '') . '" href="?sort=' . $nextSort . '">'
        . $escapedLabel
        . '<i class="lucide ' . $icon . ' users-sort-icon"></i></a>';
}

// === Get User List ===
$users = listAllUserProfiles($usersSort);
$accountAccessMap = getUserAccountAccessMap();

// "Note access" is derived from the access map, so it cannot be sorted in SQL:
// order by how many extra accounts the user can open, then by username.
if ($usersSortColumn === 'access') {
    usort($users, function ($a, $b) use ($accountAccessMap, $usersSortDir) {
        $countA = count($accountAccessMap[(int)$a['id']] ?? []);
        $countB = count($accountAccessMap[(int)$b['id']] ?? []);
        $cmp = $countA <=> $countB;
        if ($cmp === 0) {
            return strcasecmp((string)$a['username'], (string)$b['username']);
        }
        return $usersSortDir === 'desc' ? -$cmp : $cmp;
    });
}
$userNamesById = [];
foreach ($users as $listedUser) {
    $userNamesById[(int)$listedUser['id']] = (string)$listedUser['username'];
}

?>
<?php
// Cache busting: version based on app version to force reload on updates
$v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo getPageTitle(); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="../js/theme-init.js?v=<?php echo $v; ?>"></script>
    <link rel="stylesheet" href="../css/lucide.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/settings.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/home/search.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/users.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/menus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/editor.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/pages.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/markdown.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/kanban.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="../css/dark-mode/icons.css?v=<?php echo $v; ?>">
    <style>
        /* The 11-column table needs ~1660px, more than the shared 1400px
           admin cap: size the container to its content so wide screens
           show the whole table instead of empty side margins + a scrollbar. */
        .admin-container {
            max-width: fit-content;
        }
        /* Pull the filter bar closer to the nav (users.css leaves 45px). */
        .admin-header {
            margin-bottom: 0;
        }
        /* Tighter rows without separator lines; the ≤768px card view
           re-asserts its own padding/borders with !important. */
        .users-table td {
            border-bottom: none;
            padding: 8px 15px;
        }
        .user-current {
            color: #2E8CFA;
        }
        [data-theme='dark'] .user-current {
            color: #4a9eff;
        }
        /* The wrapper is height-capped by JS to the viewport so the
           horizontal scrollbar is always on screen; rows scroll vertically
           inside it instead. Not applied to the ≤768px card view. */
        @media screen and (min-width: 769px) {
            .table-responsive {
                overflow: auto;
            }
            /* Collapsed borders make Chromium paint row content over the
               sticky header; separate borders render identically here (the
               row separators are td border-bottoms). */
            .users-table {
                border-collapse: separate;
                border-spacing: 0;
            }
            /* Keep headers readable while rows scroll under them; the
               transparent th background would let rows show through, and
               collapsed-table borders don't stick, hence the box-shadow. */
            .users-table thead th {
                position: sticky;
                top: 0;
                z-index: 2;
                background: var(--bg-color, #fff);
                box-shadow: 0 1px 0 var(--border-color, #eee);
            }
        }
    </style>
    <link rel="icon" href="../favicon.ico" type="image/x-icon">
    <script src="../js/theme-manager.js?v=<?php echo $v; ?>"></script>

    <script>
    /**
     * Helper function to submit a form via POST
     * @param {Object} formData - Key-value pairs for form fields
     */
    function submitForm(formData) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.style.display = 'none';

        if (!Object.prototype.hasOwnProperty.call(formData, 'csrf_token')) {
            formData.csrf_token = document.body.dataset.csrfToken || '';
        }

        for (const [name, value] of Object.entries(formData)) {
            const input = document.createElement('input');
            input.name = name;
            input.value = value;
            form.appendChild(input);
        }

        document.body.appendChild(form);
        form.submit();
    }

    /**
     * Toggle user status (admin, active) via AJAX-style form submission
     */
    function toggleUserStatus(userId, field, newValue, force = false, username = '') {
        // If promoting to admin and not forced, show confirmation modal
        if (field === 'is_admin' && newValue === 1 && !force) {
            openAdminConfirmModal(userId, username);
            return;
        }

        submitForm({
            action: 'toggle_status',
            user_id: userId,
            field: field,
            value: newValue
        });
    }

    /**
     * Open the admin promotion confirmation modal
     */
    function openAdminConfirmModal(userId, username) {
        document.getElementById('admin_confirm_user_id').value = userId;
        const messageTemplate = <?php echo json_encode(t('multiuser.admin.confirm_admin.message', ['username' => 'NAME_HOLDER'], 'Are you sure you want to grant administrator privileges to "NAME_HOLDER"?')); ?>;
        document.getElementById('admin_confirm_message').textContent = messageTemplate.replace('NAME_HOLDER', username);
        document.getElementById('adminConfirmModal').classList.add('active');
    }

    /**
     * Confirm admin promotion from modal
     */
    function confirmAdminPromotion() {
        const userId = document.getElementById('admin_confirm_user_id').value;
        toggleUserStatus(userId, 'is_admin', 1, true);
    }

    /**
     * Open the rename/edit user modal with current user data
     */
    function updateRenameModalTitle(username) {
        document.getElementById('rename_title_user').textContent = username || '';
    }

    function renameUser(userId, currentUsername, currentEmail, currentOidcSubject, currentFirstName, currentLastName) {
        document.getElementById('rename_user_id').value = userId;
        document.getElementById('rename_username').value = currentUsername;
        document.getElementById('rename_first_name').value = currentFirstName || '';
        document.getElementById('rename_last_name').value = currentLastName || '';
        document.getElementById('rename_email').value = currentEmail || '';
        document.getElementById('rename_oidc_subject').value = currentOidcSubject || '';
        updateRenameModalTitle(currentUsername);
        document.getElementById('renameModal').classList.add('active');
    }

    /**
     * Submit the rename form with updated user profile data
     */
    function submitRename() {
        submitForm({
            action: 'update_profile',
            user_id: document.getElementById('rename_user_id').value,
            username: document.getElementById('rename_username').value,
            first_name: document.getElementById('rename_first_name').value,
            last_name: document.getElementById('rename_last_name').value,
            email: document.getElementById('rename_email').value,
            oidc_subject: document.getElementById('rename_oidc_subject').value
        });
    }

    /**
     * Filter the users table rows against the search input value
     */
    function initUsersFilter() {
        const input = document.getElementById('users-filter-input');
        if (!input) return;

        input.addEventListener('input', function () {
            const query = this.value.trim().toLowerCase();
            document.querySelectorAll('.users-table tbody tr').forEach(function (row) {
                // A class (not inline style) so it also wins over the mobile
                // card view's "display: flex !important" row rule.
                row.classList.toggle('filter-hidden', query !== '' && !row.textContent.toLowerCase().includes(query));
            });
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && this.value !== '') {
                this.value = '';
                this.dispatchEvent(new Event('input'));
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initUsersFilter);

    /* Cap the scroll wrapper to the viewport so its horizontal scrollbar
       never ends up below the fold; rows scroll vertically inside instead.
       The ≤768px card view has no horizontal scrollbar: leave it uncapped. */
    function sizeUsersTableScroll() {
        const scroller = document.querySelector('.table-responsive');
        if (!scroller) return;
        if (window.matchMedia('(max-width: 768px)').matches) {
            scroller.style.maxHeight = '';
            return;
        }
        const top = scroller.getBoundingClientRect().top + window.scrollY;
        scroller.style.maxHeight = Math.max(240, window.innerHeight - top - 24) + 'px';
    }

    document.addEventListener('DOMContentLoaded', sizeUsersTableScroll);
    window.addEventListener('resize', sizeUsersTableScroll);

    /**
     * Mobile card view: tapping the user line collapses/expands the card.
     * On desktop the class has no effect (the CSS lives in the mobile media query).
     */
    function initMobileUserCards() {
        const mobileView = window.matchMedia('(max-width: 768px)');
        document.querySelectorAll('.users-table tbody td.user-username-cell').forEach(function (cell) {
            cell.addEventListener('click', function () {
                if (!mobileView.matches) return;
                cell.closest('tr').classList.toggle('user-card-expanded');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', initMobileUserCards);

    /**
     * Bold every value in the sorted column, not just its header. The sort is
     * server-side, so the active header (rendered with .users-sort-active) is
     * what tells us which column index to mark.
     */
    function markSortedUsersColumn() {
        const table = document.querySelector('.users-table');
        const activeHeader = table ? table.querySelector('thead .users-sort-active') : null;
        if (!activeHeader) return;

        const columnIndex = activeHeader.closest('th').cellIndex;
        table.querySelectorAll('tbody tr').forEach(function (row) {
            const cell = row.cells[columnIndex];
            if (cell) cell.classList.add('sorted-column-cell');
        });
    }

    document.addEventListener('DOMContentLoaded', markSortedUsersColumn);

    function openAccessModal(userId, username, accessIds) {
        const normalizedAccessIds = (Array.isArray(accessIds) ? accessIds : []).map(Number);
        document.getElementById('access_user_id').value = userId;
        document.getElementById('access_title_user').textContent = username || '';

        document.querySelectorAll('#accessModal input[name="allowed_user_ids[]"]').forEach(function (checkbox) {
            const accountId = Number(checkbox.value);
            const isOwnAccount = accountId === Number(userId);
            const isInactiveAccount = checkbox.dataset.active !== '1';
            checkbox.checked = isOwnAccount || (!isInactiveAccount && normalizedAccessIds.includes(accountId));
            checkbox.disabled = isOwnAccount || isInactiveAccount;

            const option = checkbox.closest('.account-access-option');
            if (option) {
                option.classList.toggle('account-access-own', isOwnAccount);
                option.classList.toggle('account-access-inactive', isInactiveAccount);
            }
        });

        document.getElementById('accessModal').classList.add('active');
    }
    </script>
</head>
<body data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>"
      data-csrf-token="<?php echo htmlspecialchars($adminUsersCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
    <!-- ========================================
         ADMIN CONTAINER - User Management
         ======================================== -->
    <div class="admin-container">
        <!-- Header with navigation and actions -->
        <div class="admin-header">
            <div>
                <div class="admin-nav" style="justify-content: center;">
                    <a id="backToNotesLink" href="../index.php<?php echo $pageWorkspace !== '' ? ('?workspace=' . urlencode($pageWorkspace)) : ''; ?>" class="btn btn-secondary btn-margin-right">
                        <i class="lucide lucide-sticky-note" style="margin-right: 5px;"></i>
                        <?php echo t_h('common.back_to_notes'); ?>
                    </a>
                    <a href="../settings.php" class="btn btn-secondary btn-margin-right">
                        <i class="lucide lucide-settings" style="margin-right: 5px;"></i>
                        <?php echo t_h('common.back_to_settings'); ?>
                    </a>
                    <button class="btn btn-primary" onclick="openCreateModal()">
                        <i class="lucide lucide-plus" style="margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.create_user', [], 'Create Profile'); ?>
                    </button>
                </div>
            </div>
        </div>

        <!-- Error Messages -->
        <?php if ($error): ?>
            <div class="message message-error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>

        <!-- Filter Bar -->
        <div class="home-search-container">
            <div class="home-search-wrapper">
                <i class="lucide lucide-search home-search-icon"></i>
                <input type="text" id="users-filter-input" class="home-search-input" placeholder="<?php echo t_h('multiuser.admin.filter_placeholder', [], 'Filter users...'); ?>" autocomplete="off">
            </div>
        </div>

        <!-- Users Table -->
        <div class="table-responsive">
            <table class="users-table">
                <thead>
                    <tr>
                        <th class="text-center col-id"><?php echo renderUsersSortHeader('id', t_h('multiuser.admin.id', [], 'ID'), $usersSortColumn, $usersSortDir); ?></th>
                        <th class="text-center"><?php echo renderUsersSortHeader('status', t_h('multiuser.admin.status', [], 'Status'), $usersSortColumn, $usersSortDir); ?></th>
                        <th><?php echo renderUsersSortHeader('username', t_h('multiuser.admin.username', [], 'User'), $usersSortColumn, $usersSortDir); ?></th>
                        <th class="text-center"><?php echo renderUsersSortHeader('admin', t_h('multiuser.admin.administrator_short', [], 'Admin'), $usersSortColumn, $usersSortDir); ?></th>
                        <th><?php echo renderUsersSortHeader('first_name', t_h('multiuser.admin.first_name', [], 'First name'), $usersSortColumn, $usersSortDir); ?></th>
                        <th><?php echo renderUsersSortHeader('last_name', t_h('multiuser.admin.last_name', [], 'Last name'), $usersSortColumn, $usersSortDir); ?></th>
                        <th>
                            <span class="users-table-header-with-help">
                                <?php echo renderUsersSortHeader('email', t_h('multiuser.admin.email', [], 'Email'), $usersSortColumn, $usersSortDir); ?>
                                <span class="users-header-help" tabindex="0" role="img" aria-label="<?php echo t_h('multiuser.admin.email_usage_note', [], 'Users can sign in with their email address instead of their username. Email addresses are also used for OIDC authentication and reminder emails when configured.'); ?>">
                                    <i class="lucide lucide-help-circle"></i>
                                    <span class="users-header-help-tooltip">
                                        <?php echo t_h('multiuser.admin.email_usage_note', [], 'Users can sign in with their email address instead of their username. Email addresses are also used for OIDC authentication and reminder emails when configured.'); ?>
                                    </span>
                                </span>
                            </span>
                        </th>
                        <th><?php echo renderUsersSortHeader('access', t_h('multiuser.admin.account_access.column', [], 'Note access'), $usersSortColumn, $usersSortDir); ?></th>
                        <th class="text-center"><?php echo renderUsersSortHeader('created', t_h('multiuser.admin.created_at', [], 'Created'), $usersSortColumn, $usersSortDir); ?></th>
                        <th class="text-center"><?php echo renderUsersSortHeader('last_login', t_h('multiuser.admin.last_login', [], 'Last login'), $usersSortColumn, $usersSortDir); ?></th>
                        <th class="text-center"><?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($users as $user): ?>
                        <tr class="<?php echo ($user['id'] === getCurrentUserId()) ? 'user-current' : ''; ?>">
                            <td class="text-center user-id-cell" data-label="<?php echo t_h('multiuser.admin.id', [], 'ID'); ?>">
                                <?php echo $user['id']; ?>
                            </td>

                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.status', [], 'Status'); ?>">
                                <?php if ($user['id'] === $currentAuthUserId): ?>
                                    <span class="badge badge-active badge-not-allowed" title="<?php echo t_h('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role'); ?>">
                                        <?php echo t_h('multiuser.admin.active', [], 'Active'); ?>
                                    </span>
                                <?php else: ?>
                                    <?php if ($user['active']): ?>
                                        <span class="badge badge-active clickable-badge"
                                              title="<?php echo t_h('multiuser.admin.click_to_deactivate', [], 'Click to deactivate'); ?>"
                                              onclick="toggleUserStatus(<?php echo $user['id']; ?>, 'active', 0)">
                                            <?php echo t_h('multiuser.admin.active', [], 'Active'); ?>
                                        </span>
                                    <?php else: ?>
                                        <span class="badge badge-inactive clickable-badge"
                                              title="<?php echo t_h('multiuser.admin.click_to_activate', [], 'Click to activate'); ?>"
                                              onclick="toggleUserStatus(<?php echo $user['id']; ?>, 'active', 1)">
                                            <?php echo t_h('multiuser.admin.inactive', [], 'Inactive'); ?>
                                        </span>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </td>

                            <td data-label="<?php echo t_h('multiuser.admin.username', [], 'User'); ?>" class="user-username-cell">
                                <div class="user-info">
                                    <div class="user-username">
                                        <?php echo htmlspecialchars($user['username']); ?>
                                    </div>
                                </div>
                            </td>

                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.administrator_short', [], 'Admin'); ?>">
                                <input
                                    type="checkbox"
                                    <?php echo $user['is_admin'] ? 'checked' : ''; ?>
                                    <?php echo ($user['id'] === 1 || $user['id'] === $currentAuthUserId) ? 'disabled' : ''; ?>
                                    title="<?php echo htmlspecialchars(
                                        $user['id'] === 1
                                            ? t('multiuser.admin.admin_id_1_locked', [], 'Administrator role cannot be removed from user ID 1')
                                            : ($user['id'] === $currentAuthUserId
                                                ? t('multiuser.admin.errors.cannot_change_self', [], 'You cannot change your own status/role')
                                                : t('multiuser.admin.toggle_admin', [], 'Grant or revoke administrator privileges')),
                                        ENT_QUOTES,
                                        'UTF-8'
                                    ); ?>"
                                    onchange="this.checked ? toggleUserStatus(<?php echo (int)$user['id']; ?>, 'is_admin', 1, false, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>) : toggleUserStatus(<?php echo (int)$user['id']; ?>, 'is_admin', 0); if(!this.checked) { /* unchecking is direct */ } else { this.checked = false; }">
                            </td>
                            <?php
                                $userFirstName = trim((string)($user['first_name'] ?? ''));
                                $userLastName = trim((string)($user['last_name'] ?? ''));
                            ?>
                            <td data-label="<?php echo t_h('multiuser.admin.first_name', [], 'First name'); ?>" class="<?php echo $userFirstName === '' ? 'user-name-empty' : ''; ?>">
                                <div class="user-name-value"><?php echo htmlspecialchars($userFirstName); ?></div>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.last_name', [], 'Last name'); ?>" class="<?php echo $userLastName === '' ? 'user-name-empty' : ''; ?>">
                                <div class="user-name-value"><?php echo htmlspecialchars($userLastName); ?></div>
                            </td>
                            <td data-label="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>">
                                <div class="user-email <?php echo empty($user['email']) ? 'user-email-empty' : ''; ?>">
                                    <?php echo !empty($user['email']) ? htmlspecialchars($user['email']) : '<em>' . t_h('multiuser.admin.not_defined', [], 'not defined') . '</em>'; ?>
                                </div>
                            </td>

                            <td data-label="<?php echo t_h('multiuser.admin.account_access.column', [], 'Note access'); ?>">
                                <?php
                                    $accessIds = $accountAccessMap[(int)$user['id']] ?? [];
                                    $accessNames = [];
                                    foreach ($accessIds as $accessId) {
                                        if (isset($userNamesById[(int)$accessId])) {
                                            $accessNames[] = $userNamesById[(int)$accessId];
                                        }
                                    }
                                ?>
                                <?php
                                    if (empty($accessNames)) {
                                        $accessSummary = t('multiuser.admin.account_access.own_only', [], 'Own account only');
                                    } else {
                                        array_unshift($accessNames, t('multiuser.admin.account_access.own_account', [], 'Own account'));
                                        $accessSummary = implode(', ', $accessNames);
                                    }
                                ?>
                                <div class="account-access-summary" title="<?php echo htmlspecialchars($accessSummary, ENT_QUOTES, 'UTF-8'); ?>">
                                    <?php echo htmlspecialchars($accessSummary, ENT_QUOTES, 'UTF-8'); ?>
                                </div>
                            </td>

                            <td class="text-center user-created-cell" data-label="<?php echo t_h('multiuser.admin.created_at', [], 'Created'); ?>">
                                <?php
                                    $userCreatedDate = convertUtcToUserTimezone((string)($user['created_at'] ?? ''), 'Y-m-d');
                                    $userCreatedFull = formatUtcDateTimeForDisplay((string)($user['created_at'] ?? ''), 'Y-m-d H:i');
                                ?>
                                <?php if ($userCreatedDate !== ''): ?>
                                    <span class="user-created-date" title="<?php echo htmlspecialchars($userCreatedFull, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($userCreatedDate); ?></span>
                                <?php else: ?>
                                    <em class="user-created-date"><?php echo t_h('multiuser.admin.not_defined', [], 'not defined'); ?></em>
                                <?php endif; ?>
                            </td>

                            <td class="text-center user-created-cell" data-label="<?php echo t_h('multiuser.admin.last_login', [], 'Last login'); ?>">
                                <?php
                                    $userLastLoginDate = convertUtcToUserTimezone((string)($user['last_login'] ?? ''), 'Y-m-d');
                                    $userLastLoginFull = formatUtcDateTimeForDisplay((string)($user['last_login'] ?? ''), 'Y-m-d H:i');
                                ?>
                                <?php if ($userLastLoginDate !== ''): ?>
                                    <span class="user-created-date" title="<?php echo htmlspecialchars($userLastLoginFull, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($userLastLoginDate); ?></span>
                                <?php else: ?>
                                    <em class="user-created-date"><?php echo t_h('multiuser.admin.never_connected', [], 'Never'); ?></em>
                                <?php endif; ?>
                            </td>

                            <td class="text-center" data-label="<?php echo t_h('multiuser.admin.actions', [], 'Actions'); ?>">
                                <div class="actions actions-center">
                                        <button class="btn btn-secondary btn-small" title="<?php echo t_h('multiuser.admin.account_access.manage', [], 'Manage note access'); ?>"
                                            onclick="openAccessModal(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($accessIds), ENT_QUOTES); ?>)">
                                        <i class="lucide-users"></i>
                                    </button>

                                        <button class="btn btn-secondary btn-small" title="<?php echo t_h('multiuser.admin.edit_user', [], 'Edit User'); ?>"
                                            onclick="renameUser(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['email'] ?? ''), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['oidc_subject'] ?? ''), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['first_name'] ?? ''), ENT_QUOTES); ?>, <?php echo htmlspecialchars(json_encode($user['last_name'] ?? ''), ENT_QUOTES); ?>)">
                                        <i class="lucide-pencil"></i>
                                    </button>

                                        <button type="button" class="btn btn-secondary btn-small password-action-btn" title="<?php echo t_h('multiuser.admin.password_management.reset_password', [], 'Reset Password'); ?>"
                                            data-user-id="<?php echo (int)$user['id']; ?>"
                                            data-username="<?php echo htmlspecialchars($user['username'], ENT_QUOTES, 'UTF-8'); ?>">
                                        <i class="lucide-key"></i>
                                    </button>

                                    <?php if ($user['id'] !== 1 && $user['id'] !== $currentAuthUserId): ?>
                                        <button class="btn btn-danger btn-small" title="<?php echo t_h('common.delete', [], 'Delete'); ?>"
                                            onclick="openDeleteModal(<?php echo (int)$user['id']; ?>, <?php echo htmlspecialchars(json_encode($user['username']), ENT_QUOTES); ?>)">
                                            <i class="lucide-trash-2"></i>
                                        </button>
                                    <?php else: ?>
                                        <button class="btn btn-danger btn-small disabled" title="<?php echo htmlspecialchars($user['id'] === 1
                                            ? t('multiuser.admin.delete_id_1_locked', [], 'User ID 1 cannot be deleted')
                                            : t('multiuser.admin.errors.cannot_delete_self', [], 'You cannot delete your own profile'), ENT_QUOTES, 'UTF-8'); ?>" disabled>
                                            <i class="lucide-trash-2"></i>
                                        </button>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- ========================================
         MODALS
         ======================================== -->

    <!-- Create User Modal -->
    <div class="modal" id="createModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.create_user', [], 'Create User Profile'); ?></h2>
            <form method="POST">
                <input type="hidden" name="action" value="create">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($adminUsersCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">

                <div class="form-group">
                    <input type="text" id="create_username" name="username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?> *" required>
                </div>
                <div class="form-group">
                    <input type="email" id="create_email" name="email" placeholder="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>">
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('createModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.create', [], 'Create'); ?></button>
                </div>
            </form>
        </div>
    </div>

    <!-- Rename/Edit User Modal -->
    <div class="modal" id="renameModal">
        <div class="modal-content profile-modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.edit_user', [], 'Edit User Profile'); ?>&nbsp;: <span id="rename_title_user"></span></h2>
            <div class="form-group profile-modal-fields">
                <input type="hidden" id="rename_user_id">
                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.username', [], 'Username'); ?>&nbsp;:</label>
                <input type="text" id="rename_username" placeholder="<?php echo t_h('multiuser.admin.username', [], 'Username'); ?>" oninput="updateRenameModalTitle(this.value)" onkeydown="if(event.key==='Enter') submitRename()">

                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.first_name', [], 'First name'); ?>&nbsp;:</label>
                <input type="text" id="rename_first_name" maxlength="100" placeholder="<?php echo t_h('multiuser.admin.first_name', [], 'First name'); ?>" onkeydown="if(event.key==='Enter') submitRename()">

                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.last_name', [], 'Last name'); ?>&nbsp;:</label>
                <input type="text" id="rename_last_name" maxlength="100" placeholder="<?php echo t_h('multiuser.admin.last_name', [], 'Last name'); ?>" onkeydown="if(event.key==='Enter') submitRename()">

                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.email', [], 'Email'); ?>&nbsp;:</label>
                <input type="email" id="rename_email" placeholder="<?php echo t_h('multiuser.admin.email', [], 'Email'); ?>" onkeydown="if(event.key==='Enter') submitRename()">

                <label class="profile-modal-label"><?php echo t_h('multiuser.admin.oidc_subject', [], 'OIDC Subject (UUID)'); ?>&nbsp;:</label>
                <small class="profile-modal-help">
                    <?php echo t_h('multiuser.admin.oidc_subject_help', [], 'Optional: UUID from your OIDC provider (LLDAP, Authelia, etc.)'); ?>
                </small>
                <input type="text" id="rename_oidc_subject" placeholder="<?php echo t_h('multiuser.admin.oidc_subject_placeholder', [], 'e.g., 510ec799-02f8-42e0-...');?>" onkeydown="if(event.key==='Enter') submitRename()">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-danger" onclick="closeModal('renameModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-primary" onclick="submitRename()"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </div>
    </div>

    <!-- Account Access Modal -->
    <div class="modal" id="accessModal">
        <div class="modal-content account-access-modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.account_access.title', [], 'Note access'); ?>&nbsp;: <span id="access_title_user"></span></h2>
            <p class="account-access-help">
                <?php echo t_h('multiuser.admin.account_access.help', [], 'Choose which note accounts this user can open after login.'); ?>
            </p>
            <form method="POST">
                <input type="hidden" name="action" value="update_account_access">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($adminUsersCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="user_id" id="access_user_id">

                <div class="account-access-list">
                    <?php foreach ($users as $accessUser): ?>
                        <label class="account-access-option">
                            <input type="checkbox" name="allowed_user_ids[]" value="<?php echo (int)$accessUser['id']; ?>" data-active="<?php echo !empty($accessUser['active']) ? '1' : '0'; ?>">
                            <span class="account-access-name"><?php echo htmlspecialchars($accessUser['username'], ENT_QUOTES, 'UTF-8'); ?></span>
                            <?php if (empty($accessUser['active'])): ?>
                                <span class="account-access-state"><?php echo t_h('multiuser.admin.inactive', [], 'Inactive'); ?></span>
                            <?php endif; ?>
                            <span class="account-access-own-label"><?php echo t_h('multiuser.admin.account_access.own_account', [], 'Own account'); ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('accessModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-primary"><?php echo t_h('common.save', [], 'Save'); ?></button>
                </div>
            </form>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal" id="deleteModal">
        <div class="modal-content">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.delete_user', [], 'Delete User Profile'); ?></h2>
            <p id="delete_message"></p>
            <form method="POST">
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($adminUsersCsrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="user_id" id="delete_user_id">

                <div class="delete-warning-box">
                    <p class="delete-warning">
                        <i class="lucide-alert-triangle"></i>
                        <?php echo t_h('multiuser.admin.delete_warning_everything', [], 'Everything belonging to this account will be deleted immediately and permanently.'); ?>
                    </p>
                    <ul class="delete-warning-list">
                        <li><?php echo t_h('multiuser.admin.delete_warning_item_data', [], 'Its notes, folders, tags and attachments'); ?></li>
                        <li><?php echo t_h('multiuser.admin.delete_warning_item_s3', [], 'Its attachments and backup archives stored in the S3 buckets'); ?></li>
                    </ul>
                    <p class="delete-warning-recovery">
                        <?php echo t_h('multiuser.admin.delete_warning_no_recovery', [], 'There is no recovery: nothing is kept, and no backup is created beforehand. If this data still matters, download a complete backup ZIP before deleting.'); ?>
                    </p>
                </div>

                <div class="form-group delete-confirm-group">
                    <label for="delete_confirm_username" id="delete_confirm_label"></label>
                    <input type="text" id="delete_confirm_username" name="confirm_username"
                           autocomplete="off" spellcheck="false" autocapitalize="none"
                           placeholder="<?php echo t_h('multiuser.admin.delete_confirm_placeholder', [], 'Type the username to confirm'); ?>">
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('deleteModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                    <button type="submit" class="btn btn-danger" id="delete_submit_btn" disabled><?php echo t_h('common.delete', [], 'Delete'); ?></button>
                </div>
            </form>
        </div>
    </div>

    <!-- Admin Promotion Confirmation Modal -->
    <div class="modal" id="adminConfirmModal">
        <div class="modal-content" style="max-width: 600px;">
            <h2 class="modal-title"><?php echo t_h('multiuser.admin.confirm_admin.title', [], 'Confirm Promotion to Administrator'); ?></h2>
            <p id="admin_confirm_message"></p>

            <div class="admin-privileges-box" style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid var(--border-color);">
                <p style="font-weight: bold; margin-bottom: 10px; color: var(--text-primary);">
                    <?php echo t_h('multiuser.admin.confirm_admin.privileges_title', [], 'The administrator will be able to:'); ?>
                </p>
                <ul style="margin-left: 20px; color: var(--text-secondary); line-height: 1.6;">
                    <li><i class="lucide-download" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_notes', [], 'Export notes from any user into a ZIP file'); ?></li>
                    <li><i class="lucide-key" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_passwords', [], 'Change passwords of all other users'); ?></li>
                    <li><i class="lucide-users" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 5px;"></i> <?php echo t_h('multiuser.admin.confirm_admin.privilege_admin_panel', [], 'Access this user management panel'); ?></li>
                </ul>
            </div>

            <div class="form-actions">
                <input type="hidden" id="admin_confirm_user_id">
                <button type="button" class="btn btn-secondary btn-cancel-admin" onclick="closeModal('adminConfirmModal'); location.reload();"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-primary" onclick="confirmAdminPromotion()"><?php echo t_h('multiuser.admin.confirm_admin.confirm_button', [], 'Confirm admin promotion'); ?></button>
            </div>
        </div>
    </div>

    <!-- Password Management Modal -->
    <div class="modal" id="passwordModal">
        <div class="modal-content password-modal-content">
            <div class="password-modal-header">
                <div class="password-modal-heading">
                    <h2 class="modal-title"><?php echo t_h('multiuser.admin.password_management.manage_password', [], 'Password'); ?> : <span id="pw_title_user"></span></h2>
                    <p id="pw_status_summary" class="password-status-summary"><?php echo t_h('common.loading', [], 'Loading...'); ?></p>
                </div>
            </div>
            <input type="hidden" id="pw_user_id">
            <div class="password-meta-row">
                <div id="pw_status" class="password-status-text"></div>
            </div>

            <div class="form-group password-form-group">
                <input type="password" id="pw_new_password" placeholder="<?php echo t_h('multiuser.admin.new_password', [], 'New password'); ?>" autocomplete="new-password">
            </div>

            <div id="pw_error" class="password-feedback password-feedback-error" style="display: none;"></div>
            <div id="pw_success" class="password-feedback password-feedback-success" style="display: none;"></div>

            <div class="form-actions password-modal-actions">
                <button type="button" class="btn btn-danger" onclick="closeModal('passwordModal')"><?php echo t_h('common.cancel', [], 'Cancel'); ?></button>
                <button type="button" class="btn btn-secondary" id="pw_reset_btn" onclick="resetPasswordToDefault()"><?php echo t_h('multiuser.admin.password_management.reset_to_default', [], 'Reset to default'); ?></button>
                <button type="button" class="btn btn-primary" id="pw_save_btn" onclick="setNewPassword()"><?php echo t_h('common.save', [], 'Save'); ?></button>
            </div>
        </div>
    </div>

    <!-- ========================================
         JAVASCRIPT - Modal & Form Handlers
         ======================================== -->
    <script>
        // === Modal Management ===

        /**
         * Open the create user modal
         */
        function openCreateModal() {
            document.getElementById('createModal').classList.add('active');

        }

        /**
         * Username the delete form is currently armed for. The modal is shared
         * by every row, so this is re-set on each open and the typed
         * confirmation is checked against it.
         */
        let deleteExpectedUsername = '';

        /**
         * Enable the delete button only once the exact username is typed.
         */
        function refreshDeleteConfirmState() {
            const input = document.getElementById('delete_confirm_username');
            const button = document.getElementById('delete_submit_btn');
            if (!input || !button) return;
            button.disabled = input.value.trim() !== deleteExpectedUsername;
        }

        /**
         * Open the delete user confirmation modal
         */
        function openDeleteModal(userId, username) {
            // Trimmed on both sides (with the server check) so accounts
            // created before usernames were normalized stay deletable.
            deleteExpectedUsername = String(username).trim();

            document.getElementById('delete_user_id').value = userId;
            // Function replacement: a plain string would let $-sequences in
            // the username ($&, $$) expand as replacement patterns.
            const messageTemplate = <?php echo json_encode(t('multiuser.admin.confirm_delete', ['username' => 'NAME_HOLDER'], 'Are you sure you want to delete user "NAME_HOLDER"?')); ?>;
            document.getElementById('delete_message').textContent = messageTemplate.replace('NAME_HOLDER', function () { return username; });

            const labelTemplate = <?php echo json_encode(t('multiuser.admin.delete_confirm_label', ['username' => 'NAME_HOLDER'], 'Type "NAME_HOLDER" to confirm:')); ?>;
            document.getElementById('delete_confirm_label').textContent = labelTemplate.replace('NAME_HOLDER', function () { return username; });

            // Never carry a previous confirmation over to the next account.
            const input = document.getElementById('delete_confirm_username');
            input.value = '';
            refreshDeleteConfirmState();

            document.getElementById('deleteModal').classList.add('active');
            input.focus();
        }

        document.addEventListener('DOMContentLoaded', function () {
            const input = document.getElementById('delete_confirm_username');
            if (!input) return;

            input.addEventListener('input', refreshDeleteConfirmState);

            // No Enter handler on purpose: the browser's implicit submission
            // already routes through the default submit button and does
            // nothing while that button is disabled, i.e. exactly the gating
            // wanted here (and requestSubmit is missing on older WebKit).

            // Last line of defence: a re-enabled button in devtools must not be
            // enough to delete an account without typing its name.
            input.form.addEventListener('submit', function (e) {
                if (input.value.trim() !== deleteExpectedUsername) {
                    e.preventDefault();
                    refreshDeleteConfirmState();
                }
            });
        });

        /**
         * Close a modal by ID
         */
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
        }

        // === Password Management ===

        function setPasswordStatusDisplay(data) {
            var statusEl = document.getElementById('pw_status');
            var statusSummary = document.getElementById('pw_status_summary');
            var resetBtn = document.getElementById('pw_reset_btn');
            var statusRow = statusEl ? statusEl.parentElement : null;
            if (!statusEl || !statusSummary || !statusRow) return;

            if (data && data.has_custom_password) {
                statusSummary.textContent = <?php echo json_encode(t('multiuser.admin.password_management.status_custom_detail', [], 'This user uses a custom password.')); ?>;
                statusEl.textContent = data.password_changed_at
                    ? <?php echo json_encode(t('multiuser.admin.password_management.changed_at_prefix', [], 'Updated:')); ?> + ' ' + data.password_changed_at
                    : '';
                if (resetBtn) resetBtn.style.display = 'inline-block';
            } else if (data && data.password_login_available === false) {
                // Provisioned through SSO without a credential: there is no
                // default password to hand over, so saying there is one would
                // send the admin looking for a password that does not work.
                statusSummary.textContent = <?php echo json_encode(t('multiuser.admin.password_management.status_sso_only_detail', [], 'This user signs in through SSO and has no password. Set one below if password login is needed.')); ?>;
                statusEl.textContent = '';
                if (resetBtn) resetBtn.style.display = 'none';
            } else {
                statusSummary.textContent = <?php echo json_encode(t('multiuser.admin.password_management.status_default_detail', [], 'This user uses the default password.')); ?>;
                statusEl.textContent = '';
                if (resetBtn) resetBtn.style.display = 'none';
            }

            statusRow.style.display = statusEl.textContent.trim() === '' ? 'none' : 'flex';
        }

        function loadPasswordStatus(userId) {
            var statusEl = document.getElementById('pw_status');
            var statusSummary = document.getElementById('pw_status_summary');
            var statusRow = statusEl ? statusEl.parentElement : null;
            if (statusEl) statusEl.textContent = <?php echo json_encode(t('common.loading', [], 'Loading...')); ?>;
            if (statusSummary) {
                statusSummary.textContent = <?php echo json_encode(t('common.loading', [], 'Loading...')); ?>;
            }
            if (statusRow) {
                statusRow.style.display = 'none';
            }

            return fetch('/api/v1/admin/users/' + userId + '/password-status', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            })
            .then(r => r.json())
            .then(data => {
                setPasswordStatusDisplay(data);
                return data;
            })
            .catch(() => {
                if (statusEl) statusEl.textContent = '';
                if (statusRow) statusRow.style.display = 'none';
            });
        }

        function openPasswordModal(userId, username) {
            document.getElementById('pw_user_id').value = userId;
            document.getElementById('pw_title_user').textContent = username;
            document.getElementById('pw_new_password').value = '';
            document.getElementById('pw_error').style.display = 'none';
            document.getElementById('pw_success').style.display = 'none';
            document.getElementById('passwordModal').classList.add('active');
            loadPasswordStatus(userId);
        }

        function setNewPassword() {
            var userId = document.getElementById('pw_user_id').value;
            var newPw = document.getElementById('pw_new_password').value;
            var errorEl = document.getElementById('pw_error');
            var successEl = document.getElementById('pw_success');

            errorEl.style.display = 'none';
            successEl.style.display = 'none';

            if (!newPw || newPw.length < 4) {
                errorEl.textContent = <?php echo json_encode(t('password.errors.too_short', [], 'Password must be at least 4 characters')); ?>;
                errorEl.style.display = 'block';
                return;
            }

            fetch('/api/v1/admin/users/' + userId + '/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'set_password', new_password: newPw })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    closeModal('passwordModal');
                } else {
                    errorEl.textContent = data.error || 'Error';
                    errorEl.style.display = 'block';
                }
            })
            .catch(() => {
                errorEl.textContent = 'Error';
                errorEl.style.display = 'block';
            });
        }

        function resetPasswordToDefault() {
            var userId = document.getElementById('pw_user_id').value;
            var errorEl = document.getElementById('pw_error');
            var successEl = document.getElementById('pw_success');

            errorEl.style.display = 'none';
            successEl.style.display = 'none';

            fetch('/api/v1/admin/users/' + userId + '/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'reset_to_default' })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    // Clearing the hash does not always restore access: on an
                    // SSO-provisioned profile there is no default to fall back
                    // on. The server explains what actually happened, so keep
                    // the modal open to show it instead of silently closing.
                    if (data.needs_attention && data.message) {
                        successEl.textContent = data.message;
                        successEl.style.display = 'block';
                        loadPasswordStatus(userId);
                    } else {
                        closeModal('passwordModal');
                    }
                } else {
                    errorEl.textContent = data.error || 'Error';
                    errorEl.style.display = 'block';
                }
            })
            .catch(() => {
                errorEl.textContent = 'Error';
                errorEl.style.display = 'block';
            });
        }

        // === Event Listeners ===

        // Close modal when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        });

        document.querySelectorAll('.password-action-btn').forEach(function(button) {
            button.addEventListener('click', function () {
                openPasswordModal(this.getAttribute('data-user-id'), this.getAttribute('data-username'));
            });
        });

        // Close modal when pressing Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    </script>
</body>
</html>

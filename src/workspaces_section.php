<?php
/**
 * The Workspaces section of settings.php: the list of the account's
 * workspaces with their actions (share, rename, tags, color, background,
 * move notes, delete), and the choice of the workspace Poznote opens on.
 *
 * It was a page of its own, workspaces.php, reached from a card of the
 * Actions section. That file still answers the actions of the list (its POST
 * handler is what js/workspaces-*.js call); what it displayed is drawn here,
 * so the list sits in Settings next to the settings that concern it. A
 * workspace is not created here: that is the "Create a new workspace" dialog
 * of modals.php, opened from the workspace menu and the create (+) menu.
 *
 * settings.php calls, in this order: poznoteWorkspacesSectionData() before
 * the page starts, poznoteWorkspacesSectionBodyAttributes() on <body> (the
 * scripts read their texts and the workspace names from there),
 * poznoteRenderWorkspacesList() and poznoteRenderDefaultWorkspaceOptions()
 * inside the section, poznoteRenderWorkspaceInfoModal() with the dialogs.
 * Styles: css/workspaces-list.css.
 */

/**
 * The workspaces of the active account, in the order the user arranged them,
 * each with its tags, its color, the accounts it is shared with and its note
 * and folder counts.
 *
 * @return array{names:string[],rows:array<int,array<string,mixed>>,can_share:bool}
 */
function poznoteWorkspacesSectionData(PDO $con): array
{
    require_once __DIR__ . '/users/db_master.php';

    $ownerUserId = (int)($_SESSION['user_id'] ?? 0);
    $sharedUserIdsByWorkspace = getWorkspaceShareGranteesByWorkspace($ownerUserId);

    $usernamesById = [];
    try {
        foreach (getMasterConnection()->query('SELECT id, username FROM users')->fetchAll(PDO::FETCH_ASSOC) as $masterUser) {
            $usernamesById[(int)$masterUser['id']] = (string)$masterUser['username'];
        }
    } catch (Exception $e) {
        // The list stays usable without the names of the accounts
        error_log('workspaces section: cannot list usernames: ' . $e->getMessage());
    }

    // Trashed notes are not counted
    $noteCounts = [];
    $folderCounts = [];
    try {
        foreach ($con->query('SELECT workspace, COUNT(*) AS cnt FROM entries WHERE trash = 0 AND workspace IS NOT NULL GROUP BY workspace') as $row) {
            $noteCounts[$row['workspace']] = (int)$row['cnt'];
        }
        foreach ($con->query('SELECT workspace, COUNT(*) AS cnt FROM folders WHERE workspace IS NOT NULL GROUP BY workspace') as $row) {
            $folderCounts[$row['workspace']] = (int)$row['cnt'];
        }
    } catch (Exception $e) {
        error_log('workspaces section: cannot count notes and folders: ' . $e->getMessage());
    }

    $names = [];
    $rows = [];
    $stmt = $con->query('SELECT name, tags, color FROM workspaces ORDER BY ' . poznoteWorkspaceOrderBy($con));
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $name = (string)$row['name'];
        $sharedUserIds = $sharedUserIdsByWorkspace[$name] ?? [];
        $sharedWith = [];
        foreach ($sharedUserIds as $sharedUserId) {
            $sharedWith[] = $usernamesById[(int)$sharedUserId] ?? ('User #' . (int)$sharedUserId);
        }

        $names[] = $name;
        $rows[] = [
            'name' => $name,
            'tags' => poznoteParseWorkspaceTags($row['tags'] ?? ''),
            'color' => (string)($row['color'] ?? ''),
            'color_hex' => ($row['color'] ?? '') !== '' ? resolveNoteColorHex((string)$row['color']) : '',
            'shared_user_ids' => array_values($sharedUserIds),
            'shared_with' => $sharedWith,
            'notes' => $noteCounts[$name] ?? 0,
            'folders' => $folderCounts[$name] ?? 0,
        ];
    }

    return [
        'names' => $names,
        'rows' => $rows,
        'can_share' => poznoteCanTargetOtherUsers(),
    ];
}

/** A value for a data attribute holding JSON. */
function poznoteWorkspacesSectionJsonAttribute($value): string
{
    return htmlspecialchars(json_encode($value, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP), ENT_QUOTES, 'UTF-8');
}

/**
 * Attributes of <body> the workspace scripts read: the workspace names
 * (targets of "Move notes") and the texts of the share dialog and of the
 * information dialog (js/workspaces-share.js, js/workspaces-page.js).
 */
function poznoteWorkspacesSectionBodyAttributes(array $data): string
{
    $attributes = [
        'data-workspaces' => poznoteWorkspacesSectionJsonAttribute($data['names']),
        'data-current-user-id' => (string)(int)($_SESSION['user_id'] ?? 0),
        'data-can-share' => $data['can_share'] ? '1' : '0',
        'data-txt-workspace-share-enable-btn' => t_h('workspaces.share.actions.enable', [], 'Share'),
        'data-txt-workspace-share-edit-btn' => t_h('workspaces.share.actions.edit', [], 'Edit share'),
        'data-txt-workspace-share-disable-btn' => t_h('workspaces.share.actions.disable', [], 'Unshare'),
        'data-txt-workspace-share-users-loading' => t_h('workspaces.share.options.users_loading', [], 'Loading users...'),
        'data-txt-workspace-share-no-users' => t_h('workspaces.share.options.no_users_found', [], 'No other users found'),
        'data-txt-workspace-share-cancel' => t_h('common.cancel', [], 'Cancel'),
        'data-txt-workspace-info-not-shared' => t_h('workspaces.share.status.not_shared', [], 'Not shared'),
        'data-txt-yes' => t_h('common.yes', [], 'Yes'),
        'data-txt-no' => t_h('common.no', [], 'No'),
        'data-txt-none' => t_h('common.none', [], 'None'),
    ];

    $html = '';
    foreach ($attributes as $name => $value) {
        $html .= ' ' . $name . '="' . $value . '"';
    }

    return $html;
}

/**
 * The list: a filter once there are several rows, then one row per
 * workspace. Share stays on the row; the other actions sit behind its "..."
 * button (js/workspaces-page.js).
 */
function poznoteRenderWorkspacesList(array $data): void
{
    $rows = $data['rows'];
    $several = count($rows) > 1;
    $dragHandleLabel = t_h('workspaces.order.handle', [], 'Drag to reorder');
    $filterLabel = t_h('workspaces.filter.placeholder', [], 'Filter by name or tag...');
    $renameLabel = t_h('common.rename', [], 'Rename');
    $tagsLabel = t_h('workspaces.tags.action', [], 'Tags');
    $colorLabel = t_h('workspaces.color.action', [], 'Color');
    $backgroundLabel = t_h('workspaces.actions.background', [], 'Background');
    $moveLabel = t_h('workspaces.actions.move_notes', [], 'Move notes');
    $deleteLabel = t_h('common.delete', [], 'Delete');
    $infoLabel = t_h('common.information', [], 'Information');
    $actionsMenuLabel = t_h('workspaces.actions.menu', [], 'Workspace actions');
    ?>
                <div class="settings-workspaces-list workspace-list" id="settings-workspaces-list">
                    <!-- Messages of the list's actions (showTopAlert() in js/workspaces-create.js) -->
                    <div id="topAlert" class="initially-hidden alert-with-margin"></div>

                    <?php if ($several): ?>
                    <!-- Filters the rows below by name and tag (js/workspaces-page.js) -->
                    <div class="home-search-wrapper ws-filter">
                        <i class="lucide lucide-search home-search-icon"></i>
                        <input type="text" id="workspace-filter-input" class="home-search-input" autocomplete="off" placeholder="<?php echo $filterLabel; ?>" aria-label="<?php echo $filterLabel; ?>">
                        <button type="button" id="workspace-filter-clear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
                            <i class="lucide lucide-x"></i>
                        </button>
                    </div>
                    <?php endif; ?>

                    <?php if (empty($rows)): ?>
                    <div class="ws-list-empty"><?php echo t_h('workspaces.sections.existing.empty', [], 'No workspaces defined.'); ?></div>
                    <?php else: ?>
                    <ul>
                        <?php foreach ($rows as $row):
                            $ws = htmlspecialchars($row['name'], ENT_QUOTES, 'UTF-8');
                            $shared = !empty($row['shared_user_ids']);
                            $shareLabel = $shared
                                ? t_h('workspaces.share.actions.edit', [], 'Edit share')
                                : t_h('workspaces.share.actions.enable', [], 'Share');
                            $sharedWithAttr = poznoteWorkspacesSectionJsonAttribute($row['shared_with']);
                        ?>
                        <li class="ws-row" data-ws="<?php echo $ws; ?>">
                            <?php if ($several): ?>
                            <div class="ws-col ws-col-order">
                                <!-- A button rather than a plain span: the handle is
                                     also the keyboard way in, with the up and down
                                     arrow keys. Dragging only means something with
                                     another row to drag past. -->
                                <button type="button" class="ws-drag-handle" title="<?php echo $dragHandleLabel; ?>" aria-label="<?php echo $dragHandleLabel; ?>">
                                    <i class="lucide lucide-grip-vertical"></i>
                                </button>
                            </div>
                            <?php endif; ?>
                            <div class="ws-col ws-col-name">
                                <div class="ws-name-block">
                                    <div class="ws-name-row">
                                        <?php if ($row['color_hex'] !== ''): ?>
                                        <span class="ws-color-dot" style="background-color: <?php echo htmlspecialchars($row['color_hex'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $colorLabel; ?>"></span>
                                        <?php endif; ?>
                                        <a class="workspace-name-item workspace-name-link" href="index.php?workspace=<?php echo rawurlencode($row['name']); ?>" data-ws="<?php echo $ws; ?>" title="<?php echo t_h('workspaces.actions.select', [], 'Select'); ?>"><?php echo $ws; ?></a>
                                        <?php if (!empty($row['tags'])): ?>
                                        <div class="ws-tags-row">
                                            <?php foreach ($row['tags'] as $tag): ?>
                                            <span class="ws-tag-chip"><i class="lucide lucide-tag"></i><?php echo htmlspecialchars($tag, ENT_QUOTES, 'UTF-8'); ?></span>
                                            <?php endforeach; ?>
                                        </div>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                            <div class="ws-col ws-col-actions">
                                <div class="ws-icon-actions">
                                    <?php if ($data['can_share']): ?>
                                    <button type="button"
                                            class="ws-icon-btn btn-share-toggle<?php echo $shared ? ' is-shared' : ''; ?>"
                                            data-ws="<?php echo $ws; ?>"
                                            data-shared="<?php echo $shared ? '1' : '0'; ?>"
                                            data-allowed-users="<?php echo poznoteWorkspacesSectionJsonAttribute($row['shared_user_ids']); ?>"
                                            data-shared-with="<?php echo $sharedWithAttr; ?>"
                                            title="<?php echo $shareLabel; ?>" aria-label="<?php echo $shareLabel; ?>">
                                        <i class="lucide lucide-share-2"></i><span class="ws-icon-btn-text"><?php echo $shareLabel; ?></span>
                                    </button>
                                    <?php endif; ?>
                                </div>
                                <button type="button" class="ws-actions-toggle" aria-haspopup="true" aria-expanded="false" title="<?php echo $actionsMenuLabel; ?>" aria-label="<?php echo $actionsMenuLabel; ?>">
                                    <i class="lucide lucide-more-horizontal"></i>
                                </button>
                                <div class="ws-actions-menu">
                                    <button type="button" class="ws-icon-btn workspace-rename-action" data-ws="<?php echo $ws; ?>" title="<?php echo $renameLabel; ?>" aria-label="<?php echo $renameLabel; ?>">
                                        <i class="lucide lucide-pencil"></i><span class="ws-icon-btn-text"><?php echo $renameLabel; ?></span>
                                    </button>
                                    <button type="button" class="ws-icon-btn workspace-tags-action" data-ws="<?php echo $ws; ?>" data-tags="<?php echo htmlspecialchars(implode(', ', $row['tags']), ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $tagsLabel; ?>" aria-label="<?php echo $tagsLabel; ?>">
                                        <i class="lucide lucide-tag"></i><span class="ws-icon-btn-text"><?php echo $tagsLabel; ?></span>
                                    </button>
                                    <button type="button" class="ws-icon-btn workspace-color-action" data-ws="<?php echo $ws; ?>" data-color="<?php echo htmlspecialchars($row['color'], ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $colorLabel; ?>" aria-label="<?php echo $colorLabel; ?>">
                                        <i class="lucide lucide-palette"></i><span class="ws-icon-btn-text"><?php echo $colorLabel; ?></span>
                                    </button>
                                    <button type="button" class="ws-icon-btn workspace-background-action" data-ws="<?php echo $ws; ?>" title="<?php echo $backgroundLabel; ?>" aria-label="<?php echo $backgroundLabel; ?>">
                                        <i class="lucide lucide-image"></i><span class="ws-icon-btn-text"><?php echo $backgroundLabel; ?></span>
                                    </button>
                                    <button type="button" class="ws-icon-btn btn-move" data-ws="<?php echo $ws; ?>" title="<?php echo $moveLabel; ?>" aria-label="<?php echo $moveLabel; ?>" <?php echo ($row['notes'] === 0 || !$several) ? 'disabled' : ''; ?>>
                                        <i class="lucide lucide-folder-output"></i><span class="ws-icon-btn-text"><?php echo $moveLabel; ?></span>
                                    </button>
                                    <button type="button" class="ws-icon-btn workspace-info-action"
                                            data-ws="<?php echo $ws; ?>"
                                            data-notes-count="<?php echo (int)$row['notes']; ?>"
                                            data-folders-count="<?php echo (int)$row['folders']; ?>"
                                            data-tags="<?php echo poznoteWorkspacesSectionJsonAttribute($row['tags']); ?>"
                                            data-shared="<?php echo $shared ? '1' : '0'; ?>"
                                            data-shared-with="<?php echo $sharedWithAttr; ?>"
                                            title="<?php echo $infoLabel; ?>" aria-label="<?php echo $infoLabel; ?>">
                                        <i class="lucide lucide-info"></i><span class="ws-icon-btn-text"><?php echo $infoLabel; ?></span>
                                    </button>
                                    <?php if ($several): ?>
                                    <!-- The last workspace cannot be deleted -->
                                    <button type="button" class="ws-icon-btn ws-icon-btn-danger btn-delete" data-ws="<?php echo $ws; ?>" title="<?php echo $deleteLabel; ?>" aria-label="<?php echo $deleteLabel; ?>">
                                        <i class="lucide lucide-trash-2"></i><span class="ws-icon-btn-text"><?php echo $deleteLabel; ?></span>
                                    </button>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                    <p class="ws-filter-empty" id="workspace-filter-empty" hidden><?php echo t_h('workspaces.filter.no_results', [], 'No workspace matches this filter.'); ?></p>
                    <?php endif; ?>

                    <div id="ajaxAlert" class="initially-hidden alert-with-margin"></div>
                </div>
    <?php
}

/**
 * Options of the "Default workspace" list: the last workspace opened, on any
 * device or on this one (a cookie per browser, lib/workspaces.php), then each
 * workspace. js/settings-page.js selects the stored one.
 */
function poznoteRenderDefaultWorkspaceOptions(array $data): void
{
    ?>
                            <option value="__last_opened__"><?php echo t_h('workspaces.default.last_opened', [], 'Last workspace opened (all devices)'); ?></option>
                            <option value="__last_opened_device__"><?php echo t_h('workspaces.default.last_opened_device', [], 'Last workspace opened on this device'); ?></option>
                            <?php foreach ($data['names'] as $name): ?>
                            <option value="<?php echo htmlspecialchars($name, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($name, ENT_QUOTES, 'UTF-8'); ?></option>
                            <?php endforeach; ?>
    <?php
}

/** "Information" entry of a row's menu (js/workspaces-share.js fills it). */
function poznoteRenderWorkspaceInfoModal(): void
{
    ?>
    <div id="workspaceInfoModal" class="modal initially-hidden">
        <div class="modal-content workspace-info-modal-content">
            <h3><i class="lucide lucide-info"></i> <span id="workspaceInfoTitle"></span></h3>
            <dl class="workspace-info-list">
                <div><dt><?php echo t_h('workspaces.info.notes', [], 'Notes'); ?></dt><dd id="workspaceInfoNotes"></dd></div>
                <div><dt><?php echo t_h('workspaces.info.folders', [], 'Folders'); ?></dt><dd id="workspaceInfoFolders"></dd></div>
                <div><dt><?php echo t_h('workspaces.info.tags', [], 'Tags'); ?></dt><dd id="workspaceInfoTags"></dd></div>
                <div><dt><?php echo t_h('workspaces.info.shared', [], 'Shared'); ?></dt><dd id="workspaceInfoShared"></dd></div>
                <div><dt><?php echo t_h('workspaces.info.shared_with', [], 'Shared with'); ?></dt><dd id="workspaceInfoSharedWith"></dd></div>
            </dl>
            <div class="modal-buttons">
                <button type="button" class="btn-cancel" data-action="close-workspace-info-modal"><?php echo t_h('common.close', [], 'Close'); ?></button>
            </div>
        </div>
    </div>
    <?php
}

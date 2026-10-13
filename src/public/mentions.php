<?php
/**
 * Mentions (discussion #1621): the notes of the shared workspaces that name
 * the person signed in with "@username", and the place where they say they
 * have dealt with one. The list is the login's, whichever account is open,
 * so the page is also reachable from inside a workspace shared with them.
 */
require_once __DIR__ . '/../page_bootstrap.php';
require_once __DIR__ . '/../lib/mentions.php';
require_once __DIR__ . '/../WorkspaceActivityEmailService.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

$mentionUserId = (int)(getAuthenticatedUserId() ?? 0);
$mentionUser = getAuthenticatedUser();
$mentionUsername = is_array($mentionUser) ? (string)($mentionUser['username'] ?? '') : '';
$showHandled = ($_GET['handled'] ?? '') === '1';
$mentions = poznoteCollectMentions($mentionUserId, $showHandled);
$hasSharedWorkspaces = !empty(poznoteMentionWorkspaces($mentionUserId));

// One card per workspace, in the order the mentions came in
$mentionGroups = [];
foreach ($mentions as $mention) {
    $groupKey = $mention['owner_user_id'] . "\n" . $mention['workspace'];
    if (!isset($mentionGroups[$groupKey])) {
        $mentionGroups[$groupKey] = [
            'workspace' => $mention['workspace'],
            'owner_user_id' => $mention['owner_user_id'],
            'owner_username' => $mention['owner_username'],
            'mentions' => [],
        ];
    }
    $mentionGroups[$groupKey]['mentions'][] = $mention;
}

// A note id means nothing without its account: the link opens the owner's
// account or the shared workspace first (open_shared.php, signed for this
// reader), as the links of the shared workspace emails do.
$mentionLinkKey = WorkspaceActivityEmailService::linkKey();
$mentionNoteUrl = static function (array $mention) use ($mentionLinkKey, $mentionUserId): string {
    return 'open_shared.php?' . poznoteWorkspaceActivityLinkQuery(
        $mentionLinkKey,
        $mentionUserId,
        (int)$mention['owner_user_id'],
        (string)$mention['workspace'],
        (int)$mention['note_id']
    );
};

$mentionToggleParams = $pageWorkspace !== '' ? ['workspace' => $pageWorkspace] : [];
if (!$showHandled) {
    $mentionToggleParams['handled'] = '1';
}
$mentionToggleUrl = 'mentions.php' . ($mentionToggleParams ? '?' . http_build_query($mentionToggleParams) : '');

$esc = static function ($value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
};

$cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo $esc($currentLang); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<script src="js/session-guard.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderStylesheets('mentions'); ?>
	<script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="tasks-page mentions-page has-icon-sidebar"
      data-workspace="<?php echo $esc($pageWorkspace); ?>"
      data-show-handled="<?php echo $showHandled ? '1' : '0'; ?>"
      data-txt-error="<?php echo t_h('common.error', [], 'Error'); ?>"
      data-txt-mark-handled="<?php echo t_h('mentions.mark_handled', [], 'Mark as handled'); ?>"
      data-txt-reopen="<?php echo t_h('mentions.reopen', [], 'Mark as not handled'); ?>">
	<?php include __DIR__ . '/../icon_sidebar.php'; ?>
	<div class="tasks-container">

		<h1 class="poznote-page-title"><span class="poznote-page-title-name"><i class="lucide lucide-at-sign"></i> <?php echo t_h('mentions.title', [], 'Mentions'); ?></span></h1>

		<div class="mentions-toolbar">
			<p class="mentions-intro"><?php echo t_h('mentions.intro', ['username' => $mentionUsername], 'Notes of shared workspaces that mention you with @{{username}}.'); ?></p>
			<a class="mentions-toggle-handled<?php echo $showHandled ? ' active' : ''; ?>" href="<?php echo $esc($mentionToggleUrl); ?>" aria-pressed="<?php echo $showHandled ? 'true' : 'false'; ?>">
				<i class="lucide <?php echo $showHandled ? 'lucide-eye-off' : 'lucide-eye'; ?>"></i>
				<span><?php echo $showHandled ? t_h('mentions.hide_handled', [], 'Hide handled') : t_h('mentions.show_handled', [], 'Show handled'); ?></span>
			</a>
		</div>

		<div class="tasks-content" id="mentionsContent">
			<?php foreach ($mentionGroups as $group): ?>
			<section class="tasks-note-group mentions-group">
				<header class="mentions-group-header">
					<i class="lucide lucide-layers"></i>
					<span class="mentions-group-workspace"><?php echo $esc($group['workspace']); ?></span>
					<?php if ((int)$group['owner_user_id'] !== $mentionUserId && $group['owner_username'] !== ''): ?>
					<span class="mentions-group-owner"><?php echo t_h('mentions.shared_by', ['owner' => $group['owner_username']], 'shared by {{owner}}'); ?></span>
					<?php endif; ?>
				</header>
				<ul class="mentions-list">
					<?php foreach ($group['mentions'] as $mention): ?>
					<?php
					$mentionTitle = trim((string)$mention['title']) !== '' ? (string)$mention['title'] : t('common.untitled', [], 'Untitled');
					$mentionMeta = [];
					if ($mention['updated_by'] !== '') {
						$mentionMeta[] = t('mentions.modified_by', ['user' => $mention['updated_by']], 'Last modified by {{user}}');
					}
					if ($mention['updated'] !== '') {
						$mentionMeta[] = formatUtcDateTimeForDisplay($mention['updated']);
					}
					?>
					<li class="mentions-item<?php echo $mention['handled'] ? ' handled' : ''; ?>"
					    data-owner-id="<?php echo (int)$mention['owner_user_id']; ?>"
					    data-note-id="<?php echo (int)$mention['note_id']; ?>"
					    data-handled="<?php echo $mention['handled'] ? '1' : '0'; ?>">
						<div class="mentions-item-body">
							<a class="mentions-item-title" href="<?php echo $esc($mentionNoteUrl($mention)); ?>"><?php echo $esc($mentionTitle); ?></a>
							<?php if ($mention['excerpt'] !== ''): ?>
							<p class="mentions-item-excerpt"><?php echo $esc($mention['excerpt']); ?></p>
							<?php endif; ?>
							<?php if ($mentionMeta): ?>
							<p class="mentions-item-meta"><?php echo $esc(implode(' · ', $mentionMeta)); ?></p>
							<?php endif; ?>
						</div>
						<button type="button" class="mentions-handled-btn"
						        title="<?php echo $mention['handled'] ? t_h('mentions.reopen', [], 'Mark as not handled') : t_h('mentions.mark_handled', [], 'Mark as handled'); ?>"
						        aria-label="<?php echo $mention['handled'] ? t_h('mentions.reopen', [], 'Mark as not handled') : t_h('mentions.mark_handled', [], 'Mark as handled'); ?>">
							<i class="lucide <?php echo $mention['handled'] ? 'lucide-rotate-ccw' : 'lucide-check'; ?>"></i>
						</button>
					</li>
					<?php endforeach; ?>
				</ul>
			</section>
			<?php endforeach; ?>

			<div id="mentionsEmpty" class="empty-message<?php echo $mentionGroups ? ' initially-hidden' : ''; ?>">
				<p><?php
				if (!$hasSharedWorkspaces) {
					echo t_h('mentions.empty_no_workspace', [], 'Mentions work in shared workspaces: write @ followed by a username in a note to draw that person\'s attention to it.');
				} else {
					echo t_h('mentions.empty', [], 'No note is waiting for you.');
				}
				?></p>
			</div>
		</div>
	</div>

	<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
	<script src="js/request-errors.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/mentions-page.js'); ?>"></script>
</body>
</html>

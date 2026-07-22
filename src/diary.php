<?php
/**
 * Diary - daily notes board. Shows the notes stored under the Diary folder
 * (Diary/YYYY/MM) as cards grouped by month, newest first, with a one-click
 * "Today's entry" button that opens (or creates) the note titled with
 * today's date.
 */
require 'auth.php';
requireAuth();

ob_start();
require_once 'functions.php';
require_once 'config.php';
require_once 'db_connect.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// Workspace used for the diary folder lookup/creation: never empty so the
// "Today's entry" call always lands in a real workspace.
$diaryWorkspace = $pageWorkspace !== '' ? $pageWorkspace : getFirstWorkspaceName();

$diaryRootName = getDiaryRootFolderName(isset($con) ? $con : null, $diaryWorkspace);

function diaryBuildPageUrl(string $page, string $pageWorkspace): string {
    return $page . ($pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : '');
}

/**
 * The day a diary entry belongs to: its YYYY-MM-DD title when valid (so
 * renaming an entry re-dates it), otherwise its creation date.
 */
function diaryEntryDate(string $heading, string $created): string {
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $heading, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        return $heading;
    }
    return $created;
}

function diaryBuildNoteData(array $note, string $pageWorkspace): array {
    $noteId  = (int)$note['id'];
    $preview = buildNoteCardPreview($noteId, (string)($note['type'] ?? 'note'));
    $heading = trim((string)($note['heading'] ?? ''));
    if ($heading === '') $heading = t('common.untitled', [], 'Untitled');
    $tags = array_values(array_filter(array_map('trim', explode(',', (string)($note['tags'] ?? '')))));
    $iconRaw = !empty($note['icon']) ? convertFontAwesomeToLucide($note['icon']) : '';
    $iconColor = !empty($note['icon_color']) ? (string)$note['icon_color'] : '';
    $created = convertUtcToUserTimezone((string)($note['created'] ?? ''), 'Y-m-d');
    return [
        'id'        => $noteId,
        'heading'   => $heading,
        'entryDate' => diaryEntryDate(trim((string)($note['heading'] ?? '')), $created),
        // newtab=1 tells tabs.js to open the note as a new internal tab (see js/tabs.js).
        'url'       => 'index.php?note=' . $noteId . '&newtab=1' . ($pageWorkspace !== '' ? '&workspace=' . urlencode($pageWorkspace) : ''),
        'text'      => $preview['text'],
        'tasks'     => $preview['tasks'],
        'image'     => $preview['image'] ?? null,
        'tags'      => $tags,
        'search'    => trim($heading . ' ' . implode(' ', $tags) . ' ' . ($preview['search'] ?? '')),
        'created'   => $created,
        'updated'   => convertUtcToUserTimezone((string)($note['updated'] ?? ''), 'Y-m-d'),
        'icon'      => $iconRaw,
        'iconColor' => $iconColor,
    ];
}

$diaryNotes = [];
$todayNoteId = null;

try {
    $userNow = new DateTime('now', new DateTimeZone(getUserTimezone()));
} catch (Exception $e) {
    $userNow = new DateTime('now', new DateTimeZone('UTC'));
}
$todayTitle = $userNow->format('Y-m-d');
$diaryFolderPath = $diaryRootName . '/' . $userNow->format('Y') . '/' . $userNow->format('m');

try {
    if (isset($con)) {
        $diaryFolderIds = getDiaryFolderIds($con, $diaryWorkspace);

        if (!empty($diaryFolderIds)) {
            $placeholders = implode(',', array_fill(0, count($diaryFolderIds), '?'));
            $stmt = $con->prepare(
                "SELECT id, heading, type, tags, created, updated, icon, icon_color FROM entries" .
                " WHERE trash = 0 AND folder_id IN ($placeholders) AND workspace = ?" .
                " ORDER BY created DESC, id DESC"
            );
            $stmt->execute(array_merge($diaryFolderIds, [$diaryWorkspace]));

            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $noteData = diaryBuildNoteData($row, $pageWorkspace);
                if ($todayNoteId === null && trim((string)$row['heading']) === $todayTitle) {
                    $todayNoteId = (int)$row['id'];
                }
                $diaryNotes[] = $noteData;
            }

            // Display order follows the entry date (title-based), not creation
            // order, so re-dated entries land on their day of happening.
            usort($diaryNotes, function ($a, $b) {
                return strcmp($b['entryDate'], $a['entryDate']) ?: ($b['id'] <=> $a['id']);
            });
        }
    }
} catch (Exception $e) {
    $diaryNotes = [];
    $todayNoteId = null;
}

$isEmpty = empty($diaryNotes);

$rawVersion = @file_get_contents('version.txt');
if ($rawVersion === false) $rawVersion = '0.0.0';
$rawVersion = trim($rawVersion);
$cache_v = urlencode(poznoteBuildAssetCacheVersion($rawVersion));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
	<meta charset="utf-8"/>
	<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
	<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
	<link type="text/css" rel="stylesheet" href="css/lucide.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modals/base.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/modal-alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/favorites.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/home/alerts.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dashboard.css?v=<?php echo file_exists(__DIR__ . '/css/dashboard.css') ? filemtime(__DIR__ . '/css/dashboard.css') : $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/diary.css?v=<?php echo file_exists(__DIR__ . '/css/diary.css') ? filemtime(__DIR__ . '/css/diary.css') : $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/variables.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/layout.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/modals.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/components.css?v=<?php echo $cache_v; ?>"/>
	<link type="text/css" rel="stylesheet" href="css/dark-mode/pages.css?v=<?php echo $cache_v; ?>"/>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="favorites-page dashboard-page diary-page"
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">

	<div class="favorites-container dashboard-container">
		<header class="dashboard-topbar">
			<div class="diary-actions">
				<a href="<?php echo htmlspecialchars(diaryBuildPageUrl('index.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
					<i class="lucide lucide-sticky-note"></i>
					<?php echo t_h('common.back_to_notes', [], 'Notes'); ?>
				</a>
				<a href="<?php echo htmlspecialchars(diaryBuildPageUrl('dashboard.php', $pageWorkspace), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary">
					<i class="lucide lucide-layout-dashboard"></i>
					<?php echo t_h('home.dashboard', [], 'Dashboard'); ?>
				</a>
				<button type="button" id="diaryTodayBtn" class="btn btn-primary" title="<?php echo t_h('diary.today_button_title', [], "Open today's entry (create it if needed)"); ?>">
					<i class="lucide lucide-calendar-plus"></i>
					<?php echo t_h('diary.today_button', [], "Today's entry"); ?>
				</button>
			</div>
			<div class="board-filter-row">
			<?php renderBoardViewMenu('diary'); ?>
			<div id="dashboardTopbarFilter" class="dashboard-topbar-filter">
				<i class="lucide lucide-search dashboard-filter-icon"></i>
				<input
					type="text"
					id="filterInput"
					class="dashboard-filter-input"
					placeholder="<?php echo t_h('dashboard.filter_placeholder', [], 'Filter by title, content or tag...'); ?>"
					autocomplete="off"
				/>
				<button type="button" id="clearFilterBtn" class="dashboard-filter-clear initially-hidden" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
			</div>
		</header>

		<?php if ($isEmpty): ?>
		<div class="dashboard-empty diary-empty">
			<i class="lucide lucide-book-open"></i>
			<p><?php echo t_h('diary.empty', ['folder' => $diaryFolderPath], "No diary entries yet. Click \"Today's entry\" to write your first one. It will be stored in {{folder}}."); ?></p>
		</div>
		<?php endif; ?>
		<div id="diaryNoResults" class="empty-message initially-hidden">
			<p><?php echo t_h('public.no_filter_results', [], 'No notes match your search.'); ?></p>
		</div>
		<div id="diaryContent" class="diary-content"></div>
	</div>

	<script>
	window.DIARY_DATA = {
		notes: <?php echo json_encode($diaryNotes, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>,
		todayNoteId: <?php echo json_encode($todayNoteId); ?>,
		todayTitle: <?php echo json_encode($todayTitle); ?>,
		folderPath: <?php echo json_encode($diaryFolderPath); ?>,
		workspace: <?php echo json_encode($diaryWorkspace); ?>,
		pageWorkspace: <?php echo json_encode($pageWorkspace); ?>,
		lang: <?php echo json_encode($currentLang); ?>,
		txt: {
			createError: <?php echo json_encode(t('diary.create_error', [], 'Could not create the diary entry.')); ?>,
			today: <?php echo json_encode(t('diary.today_badge', [], 'Today')); ?>
		}
	};
	</script>
	<script src="js/pwa-helpers.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js"></script>
	<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/diary-page.js?v=<?php echo file_exists(__DIR__ . '/js/diary-page.js') ? filemtime(__DIR__ . '/js/diary-page.js') : $cache_v; ?>"></script>
	<script src="js/board-view-menu.js?v=<?php echo file_exists(__DIR__ . '/js/board-view-menu.js') ? filemtime(__DIR__ . '/js/board-view-menu.js') : $cache_v; ?>"></script>
</body>
</html>

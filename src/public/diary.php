<?php
/**
 * Diary - daily notes board. Shows the notes stored under the Diary folder
 * (Diary/YYYY/MM) as cards grouped by month, newest first, with a one-click
 * "Today's entry" button that opens (or creates) the note titled with
 * today's date. The journal toggle swaps the board for one reading column of
 * full entries (js/diary-page.js, bodies from api/v1/diary/entries.php),
 * each editable in place through the notes API.
 */
require_once __DIR__ . '/../page_bootstrap.php';

$pageWorkspace = trim(getWorkspaceFilter());
$currentLang = getUserLanguage();

// Workspace used for the diary folder lookup/creation: never empty so the
// "Today's entry" call always lands in a real workspace.
$diaryWorkspace = $pageWorkspace !== '' ? $pageWorkspace : getFirstWorkspaceName();

// All diaries of the workspace; ?diary=<root folder id> selects one, the
// first (sidebar order) is the default. With no diary yet, the board is empty
// and the "Today's entry" button creates the default-named one.
$diaryRoots = isset($con) ? getDiaryRoots($con, $diaryWorkspace) : [];
$selectedDiary = null;
$diaryParam = isset($_GET['diary']) ? (int)$_GET['diary'] : 0;
foreach ($diaryRoots as $root) {
    if ($root['id'] === $diaryParam) { $selectedDiary = $root; break; }
}
if ($selectedDiary === null && !empty($diaryRoots)) {
    $selectedDiary = $diaryRoots[0];
}

// ?date=YYYY-MM-DD (the slash menu's "Link to diary entry"): go to that day's
// entry. When it does not exist yet, the board loads and diary-page.js creates
// it (DIARY_DATA.openDate), so a plain GET never writes. Inside the editor
// these links are intercepted and handled without this round trip
// (openDiaryEntryForDate() in js/utils-export-create.js).
$openDate = null;
if (isset($_GET['date']) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string)$_GET['date'], $dateParts)
    && checkdate((int)$dateParts[2], (int)$dateParts[3], (int)$dateParts[1])) {
    $existingEntryId = ($selectedDiary !== null && isset($con))
        ? findDiaryEntryIdForDate($con, $diaryWorkspace, (string)$_GET['date'], $selectedDiary['id'])
        : null;
    if ($existingEntryId !== null) {
        header('Location: index.php?note=' . $existingEntryId . '&newtab=1&workspace=' . urlencode($diaryWorkspace));
        exit;
    }
    $openDate = (string)$_GET['date'];
}

$diaryRootName = $selectedDiary !== null
    ? $selectedDiary['name']
    : getDiaryRootFolderName(isset($con) ? $con : null, $diaryWorkspace);

function diaryBuildPageUrl(string $page, string $pageWorkspace): string {
    return $page . ($pageWorkspace !== '' ? '?workspace=' . urlencode($pageWorkspace) : '');
}

function diaryBuildSwitchUrl(string $pageWorkspace, int $diaryId): string {
    $url = 'diary.php?diary=' . $diaryId;
    if ($pageWorkspace !== '') $url .= '&workspace=' . urlencode($pageWorkspace);
    return $url;
}

function diaryBuildNoteData(array $note, string $pageWorkspace): array {
    $noteId  = (int)$note['id'];
    $preview = buildNoteCardPreview($noteId, (string)($note['type'] ?? 'note'));
    $heading = trim((string)($note['heading'] ?? ''));
    if ($heading === '') $heading = t('common.untitled', [], 'Untitled');
    $tags = array_values(array_filter(array_map('trim', explode(',', (string)($note['tags'] ?? '')))));
    $iconRaw = !empty($note['icon']) ? convertFontAwesomeToLucide($note['icon']) : '';
    $iconColor = poznoteIconColorCss($note['icon_color'] ?? '');
    $created = convertUtcToUserTimezone((string)($note['created'] ?? ''), 'Y-m-d');
    $titleDate = parseDiaryEntryTitle(trim((string)($note['heading'] ?? '')));
    return [
        'id'        => $noteId,
        'heading'   => $heading,
        'type'      => (string)($note['type'] ?? 'note'),
        // The day the entry belongs to: the one its title designates when the
        // title is a date in a supported format (so renaming an entry re-dates
        // it), otherwise its creation date.
        'entryDate' => $titleDate ?? $created,
        // The journal view spells the day out beside an undated title only.
        'dated'     => $titleDate !== null,
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
$todayIso   = $userNow->format('Y-m-d');
$todayTitle = formatDiaryEntryTitle($userNow);
$diaryFolderPath = $diaryRootName . '/' . $userNow->format('Y') . '/' . $userNow->format('m');

try {
    if (isset($con)) {
        $diaryFolderIds = $selectedDiary !== null
            ? getDiaryFolderIds($con, $diaryWorkspace, $selectedDiary['id'])
            : [];

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
                // Compare the parsed day, not the raw title: an entry written
                // before the title format changed must still count as today's.
                // Only dated titles qualify, so a note merely created today
                // does not take the place of the day's entry.
                if ($todayNoteId === null && parseDiaryEntryTitle((string)$row['heading']) === $todayIso) {
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

// getAppVersion() reads version.txt through an absolute path. Reading it
// relatively broke when the entry points moved into src/public/: the file
// stayed one level up, so this fell back to time() and changed the asset
// URL on every single page load.
$cache_v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));

// The "Colored markdown" setting reaches the journal view the way it reaches
// the note preview: body.markdown-colored plus the --mdc-* colours inlined on
// <body> (lib/markdown-colored.php, painted by css/diary.css).
$bodyClasses = 'favorites-page dashboard-page diary-page has-icon-sidebar';
$bodyStyle = '';
$markdownColoredTheme = getSetting('markdown_colored', '0');
if (poznoteMarkdownColoredEnabled($markdownColoredTheme)) {
    $bodyClasses .= ' markdown-colored';
    $bodyStyle = poznoteMarkdownColoredStyle($markdownColoredTheme, getSetting('markdown_colored_custom', ''));
}
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
	<script src="js/session-guard.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderStylesheets('diary'); ?>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="<?php echo htmlspecialchars($bodyClasses, ENT_QUOTES, 'UTF-8'); ?>"<?php echo $bodyStyle !== '' ? ' style="' . htmlspecialchars($bodyStyle, ENT_QUOTES, 'UTF-8') . '"' : ''; ?>
      data-workspace="<?php echo htmlspecialchars($pageWorkspace, ENT_QUOTES, 'UTF-8'); ?>">
	<script>
	// Journal mode and the dates panel's state before the first paint, so the
	// page does not render the board's layout and then jump (js/diary-page.js
	// takes over on DOMContentLoaded).
	(function () {
		try {
			var store = window.__poznoteUserStorage || window.localStorage;
			if (store.getItem('diaryViewMode') === 'journal') document.body.classList.add('diary-journal-active');
			// Open by default (unlike the note outline): closed only once the reader closed it.
			if (window.innerWidth > 800 && store.getItem('diaryOutlineCollapsed') === 'true') document.body.classList.add('outline-collapsed');
			var width = parseInt(window.localStorage.getItem('outlineWidth'), 10);
			if (width >= 200 && width <= 500) document.documentElement.style.setProperty('--outline-width', width + 'px');
		} catch (e) { /* storage unavailable */ }
	})();
	</script>

	<?php include __DIR__ . '/../icon_sidebar.php'; ?>

	<div class="favorites-container dashboard-container">
		<h1 class="poznote-page-title"><i class="lucide lucide-book-open"></i> <?php echo t_h('diary.title', [], 'Diary'); ?> <?php echo poznoteRenderPageTitleWorkspace($diaryWorkspace); ?></h1>

		<header class="dashboard-topbar">
			<div class="diary-actions">
				<button type="button" id="diaryNewBtn" class="btn btn-primary" title="<?php echo t_h('diary.new_modal_title', [], 'Create a new diary'); ?>">
					<i class="lucide lucide-plus"></i>
					<?php echo t_h('diary.new_button', [], 'New diary'); ?>
				</button>
				<?php // Named after what it will do: open the day's entry, or create it. js/diary-page.js renames it when that entry is trashed. ?>
				<button type="button" id="diaryTodayBtn" class="btn btn-primary">
					<i class="lucide <?php echo $todayNoteId !== null ? 'lucide-calendar' : 'lucide-calendar-plus'; ?>"></i>
					<span class="diary-today-label"><?php echo $todayNoteId !== null
						? t_h('diary.today_button_go', [], "Go to today's entry")
						: t_h('diary.today_button_create', [], "Create today's entry"); ?></span>
				</button>
			</div>
			<?php if (!empty($diaryRoots)): ?>
			<?php // One pill per diary, even a lone one, so its name is always shown. Right-click (desktop) renames or deletes it. ?>
			<nav class="diary-switcher">
				<?php foreach ($diaryRoots as $root): ?>
				<?php $rootNameAttr = htmlspecialchars($root['name'], ENT_QUOTES, 'UTF-8'); ?>
				<div class="diary-switch-btn<?php echo ($selectedDiary !== null && $root['id'] === $selectedDiary['id']) ? ' diary-switch-active' : ''; ?>"
					data-diary-id="<?php echo (int)$root['id']; ?>" data-diary-name="<?php echo $rootNameAttr; ?>">
					<a class="diary-switch-link" href="<?php echo htmlspecialchars(diaryBuildSwitchUrl($pageWorkspace, $root['id']), ENT_QUOTES, 'UTF-8'); ?>">
						<i class="lucide lucide-book-open"></i>
						<?php echo $rootNameAttr; ?>
					</a>
					<button type="button" class="diary-switch-delete" data-diary-id="<?php echo (int)$root['id']; ?>" data-diary-name="<?php echo $rootNameAttr; ?>"
						title="<?php echo t_h('diary.delete_title', [], 'Delete diary'); ?>" aria-label="<?php echo t_h('diary.delete_title', [], 'Delete diary'); ?>">
						<i class="lucide lucide-trash-2"></i>
					</button>
				</div>
				<?php endforeach; ?>
			</nav>
			<?php endif; ?>
			<div class="board-filter-row">
			<button type="button" id="diaryJournalToggle" class="board-view-btn diary-journal-toggle" aria-pressed="false" title="<?php echo t_h('diary.journal_view', [], 'Journal view'); ?>">
				<i class="lucide lucide-scroll"></i>
			</button>
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

	<?php // Dates of the journal view, same panel as the note outline (css/outline.css). ?>
	<div class="outline-mobile-backdrop" id="outlineMobileBackdrop"></div>
	<div class="outline-resize-handle diary-outline-handle" id="outlineResizeHandle">
		<button type="button" id="toggleOutlineBtn" class="toggle-outline-btn"
			aria-label="<?php echo t_h('common.outline.title', [], 'Outline'); ?>"
			title="<?php echo t_h('common.outline.title', [], 'Outline'); ?>">
			<i class="lucide lucide-chevron-right"></i>
		</button>
	</div>
	<aside id="outline-panel" class="diary-outline">
		<div class="outline-header">
			<h2 class="outline-title"><?php echo t_h('common.outline.title', [], 'Outline'); ?></h2>
			<button type="button" class="outline-close-btn" aria-label="<?php echo t_h('common.close', [], 'Close'); ?>" title="<?php echo t_h('common.close', [], 'Close'); ?>">
				<i class="lucide lucide-x"></i>
			</button>
		</div>
		<ul class="outline-nav" id="diaryOutlineNav"></ul>
	</aside>

	<script>
	window.DIARY_DATA = {
		notes: <?php echo json_encode($diaryNotes, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>,
		todayNoteId: <?php echo json_encode($todayNoteId); ?>,
		todayTitle: <?php echo json_encode($todayTitle); ?>,
		todayIso: <?php echo json_encode($todayIso); ?>,
		openDate: <?php echo json_encode($openDate !== null ? [
			'iso'    => $openDate,
			'title'  => formatDiaryEntryTitle($openDate),
			'folder' => $diaryRootName . '/' . substr($openDate, 0, 4) . '/' . substr($openDate, 5, 2),
		] : null, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>,
		folderPath: <?php echo json_encode($diaryFolderPath); ?>,
		workspace: <?php echo json_encode($diaryWorkspace); ?>,
		noteType: <?php echo json_encode(getDiaryDefaultNoteType()); ?>,
		pageWorkspace: <?php echo json_encode($pageWorkspace); ?>,
		diaryId: <?php echo json_encode($selectedDiary !== null ? $selectedDiary['id'] : null); ?>,
		diaries: <?php echo json_encode($diaryRoots, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>,
		lang: <?php echo json_encode($currentLang); ?>,
		txt: {
			createError: <?php echo json_encode(t('diary.create_error', [], 'Could not create the diary entry.')); ?>,
			today: <?php echo json_encode(t('diary.today_badge', [], 'Today')); ?>,
			todayCreate: <?php echo json_encode(t('diary.today_button_create', [], "Create today's entry")); ?>,
			newDiaryTitle: <?php echo json_encode(t('diary.new_modal_title', [], 'Create a new diary')); ?>,
			newDiaryPlaceholder: <?php echo json_encode(t('diary.new_name_placeholder', [], 'Diary name')); ?>,
			newDiaryError: <?php echo json_encode(t('diary.new_create_error', [], 'Could not create the diary.')); ?>,
			deleteDiaryTitle: <?php echo json_encode(t('diary.delete_title', [], 'Delete diary')); ?>,
			deleteDiaryConfirm: <?php echo json_encode(t('diary.delete_confirm', [], 'Delete the diary "{{name}}"? Its folders are removed and all its entries are moved to the trash.')); ?>,
			deleteDiaryError: <?php echo json_encode(t('diary.delete_error', [], 'Could not delete the diary.')); ?>,
			deleteLabel: <?php echo json_encode(t('common.delete', [], 'Delete')); ?>,
			renameLabel: <?php echo json_encode(t('common.rename', [], 'Rename')); ?>,
			renameDiaryTitle: <?php echo json_encode(t('diary.rename_title', [], 'Rename diary')); ?>,
			renameDiaryError: <?php echo json_encode(t('diary.rename_error', [], 'Could not rename the diary.')); ?>,
			journalEdit: <?php echo json_encode(t('diary.journal_edit', [], 'Edit here')); ?>,
			journalEditDone: <?php echo json_encode(t('diary.journal_edit_done', [], 'Done editing')); ?>,
			journalEditPlaceholder: <?php echo json_encode(t('diary.journal_edit_placeholder', [], 'Write here...')); ?>,
			journalSaving: <?php echo json_encode(t('diary.journal_saving', [], 'Saving...')); ?>,
			journalSaved: <?php echo json_encode(t('diary.journal_saved', [], 'Saved')); ?>,
			journalSaveError: <?php echo json_encode(t('diary.journal_save_error', [], 'Could not save this entry.')); ?>,
			journalConflict: <?php echo json_encode(t('diary.journal_conflict', [], 'This entry was changed elsewhere. Your latest changes here were not saved: reload the page to see the current version.')); ?>,
			journalEmptyEntry: <?php echo json_encode(t('diary.journal_empty_entry', [], 'This entry is empty.')); ?>,
			journalLoadError: <?php echo json_encode(t('diary.journal_load_error', [], 'Could not load this entry.')); ?>,
			create: <?php echo json_encode(t('common.create', [], 'Create')); ?>,
			cancel: <?php echo json_encode(t('common.cancel', [], 'Cancel')); ?>
		}
	};
	</script>
	<script src="js/pwa-helpers.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/navigation.js'); ?>"></script>
	<script src="js/icon-sidebar-toggle.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/diary-page.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/board-view-menu.js'); ?>"></script>
</body>
</html>

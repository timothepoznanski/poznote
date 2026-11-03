<?php
/**
 * Speed dial (issue #1714): the notes of a workspace tagged "speed-dial", as a
 * launcher. A note with one web link, or none, is a tile: it opens that link or
 * the note itself, and shows the note's first image, else the favicon of the
 * link's site, else the first letter of the title. A note with several links is
 * a group: its title as a label (a click opens the note, a right click sets its
 * colour), then a tile per link, with the horizontal rules of the note drawn
 * where they are written.
 * Tiles and groups are dragged like the dashboard's cards
 * (js/speed-dial.js), ranked in entries.speed_dial_order.
 */
require_once __DIR__ . '/../page_bootstrap.php';
require_once __DIR__ . '/../lib/note-sort.php';
require_once __DIR__ . '/../lib/speed-dial.php';

function speedDialLetter(string $text): string {
    return mb_strtoupper(mb_substr($text, 0, 1, 'UTF-8'), 'UTF-8');
}

/** The tile of one link of a group, named after the link or its site. */
function speedDialBuildLinkTile(array $link): array {
    $label = $link['label'] !== '' ? $link['label'] : (string)parse_url($link['url'], PHP_URL_HOST);
    return [
        'label'  => $label,
        'letter' => speedDialLetter($label),
        'link'   => $link['url'],
        'image'  => $link['image'] ?? poznoteSpeedDialFavicon($link['url']),
    ];
}

function speedDialBuildItem(array $note, string $workspace): array {
    $noteId = (int)$note['id'];
    $type = (string)($note['type'] ?? 'note');
    $heading = trim((string)($note['heading'] ?? ''));
    if ($heading === '') $heading = t('common.untitled', [], 'Untitled');
    $noteUrl = 'index.php?note=' . $noteId . '&newtab=1' . ($workspace !== '' ? '&workspace=' . urlencode($workspace) : '');

    $raw = (string)@file_get_contents(getEntryFilename($noteId, $type));
    $rows = [];
    if ($type === 'markdown') {
        $rows = poznoteSpeedDialParseMarkdown($raw);
    } elseif ($type !== 'tasklist') {
        $rows = poznoteSpeedDialParseHtml($raw);
    }
    $links = array_merge(...($rows ?: [[]]));

    if (count($links) > 1) {
        return [
            'id'      => $noteId,
            'heading' => $heading,
            'noteUrl' => $noteUrl,
            'rows'    => array_map(static fn($row) => array_map('speedDialBuildLinkTile', $row), $rows),
        ];
    }

    $preview = buildNoteCardPreview($noteId, $type, false);
    $link = $links[0]['url'] ?? null;
    $image = $links[0]['image'] ?? $preview['image'] ?? null;
    return [
        'id'      => $noteId,
        'noteUrl' => $noteUrl,
        'tile'    => [
            'label'  => $heading,
            'letter' => speedDialLetter($heading),
            'link'   => $link,
            'image'  => $image ?? ($link !== null ? poznoteSpeedDialFavicon($link) : null),
        ],
    ];
}

/** A tile's link, icon and name: the same on its own or in a group. */
function speedDialRenderLink(array $tile, string $fallbackUrl): void {
    $esc = static fn($value) => htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    ?>
    <a class="speed-dial-link" draggable="false" href="<?php echo $esc($tile['link'] ?? $fallbackUrl); ?>"<?php echo $tile['link'] !== null ? ' target="_blank" rel="noopener" data-url="' . $esc($tile['link']) . '"' : ''; ?>>
        <span class="speed-dial-icon">
            <span class="speed-dial-letter"><?php echo $esc($tile['letter']); ?></span>
            <?php if ($tile['image'] !== null): ?>
            <img data-src="<?php echo $esc($tile['image']); ?>" alt="" draggable="false" referrerpolicy="no-referrer">
            <?php endif; ?>
        </span>
        <span class="speed-dial-label"><?php echo $esc($tile['label']); ?></span>
    </a>
    <?php
}

$workspace = trim((string)getWorkspaceFilter());
if ($workspace === '__last_opened__') {
    $workspace = '';
}

// Which speed dial: ?board=<tag>, the default one otherwise
$boards = $workspace !== '' ? poznoteSpeedDialBoards($con, $workspace) : [POZNOTE_SPEED_DIAL_TAG];
$board = POZNOTE_SPEED_DIAL_TAG;
foreach ($boards as $candidate) {
    if (mb_strtolower($candidate, 'UTF-8') === mb_strtolower((string)($_GET['board'] ?? ''), 'UTF-8')) $board = $candidate;
}
$boardKey = poznoteSpeedDialBackgroundKey($board);
$canEditBoards = $workspace !== '' && isActiveAccountOwnedByAuthenticatedUser();

$query = "SELECT id, heading, type, tags, updated, speed_dial_order FROM entries WHERE trash = 0 AND tags LIKE ?";
$params = ['%' . POZNOTE_SPEED_DIAL_TAG . '%'];
if ($workspace !== '') {
    $query .= " AND workspace = ?";
    $params[] = $workspace;
}
$stmt = $con->prepare($query);
$stmt->execute($params);

// LIKE also matches "my-speed-dial-notes": the whole tag has to be there
$rows = array_filter($stmt->fetchAll(PDO::FETCH_ASSOC), static fn($note) => poznoteHasSpeedDialTag((string)$note['tags'], $board));
usort($rows, static fn($a, $b) => poznoteComparePlacedOrder($a, $b, 'speed_dial_order'));
$items = array_map(static fn($note) => speedDialBuildItem($note, $workspace), $rows);
$tileSize = poznoteSpeedDialTileSize(getSetting('speed_dial_tile_size', POZNOTE_SPEED_DIAL_TILE_DEFAULT));
$labelColors = poznoteSpeedDialNormalizeLabelColors((array)json_decode((string)getSetting('speed_dial_label_colors', '{}'), true));

// The view's own image, api_upload_background.php?scope=speed_dial. In the page
// rather than fetched, so that it is there from the first paint.
$backgroundUrl = null;
$backgroundUserId = (int)(getCurrentUser()['id'] ?? 0);
$backgroundSegment = getWorkspaceBackgroundSegment($workspace);
$backgroundPrefix = $boardKey !== '' ? 'speed-dial-' . $boardKey : 'speed-dial';
$backgroundFiles = glob(__DIR__ . '/../data/users/' . $backgroundUserId . '/backgrounds/' . $backgroundSegment . '/' . $backgroundPrefix . '.*');
if (!empty($backgroundFiles)) {
    $backgroundUrl = '/data/users/' . $backgroundUserId . '/backgrounds/' . rawurlencode($backgroundSegment) . '/' . basename($backgroundFiles[0]) . '?v=' . filemtime($backgroundFiles[0]);
}
$backgroundOpacity = max(5, min(100, (int)getSetting('speed_dial_background_opacity_' . $workspace . ($boardKey !== '' ? '_' . $boardKey : ''), 100)));

$currentLang = getUserLanguage();
$cache_v = rawurlencode(poznoteBuildAssetCacheVersion(getAppVersion()));
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" class="speed-dial-page">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title><?php echo getPageTitle(); ?></title>
	<meta name="color-scheme" content="dark light">
	<script src="js/theme-init.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/session-guard.js?v=<?php echo $cache_v; ?>"></script>
	<?php poznoteRenderStylesheets('speed_dial'); ?>
	<script src="js/theme-manager.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/speed-dial.js'); ?>"></script>
	<?php poznoteRenderBrandIcons(); ?>
	<?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="speed-dial-page has-icon-sidebar<?php echo $backgroundUrl !== null ? ' has-speed-dial-background' : ''; ?>" data-board="<?php echo htmlspecialchars($board, ENT_QUOTES, 'UTF-8'); ?>" data-board-key="<?php echo $boardKey; ?>" style="--speed-dial-tile-width: <?php echo $tileSize; ?>px" data-workspace="<?php echo htmlspecialchars($workspace, ENT_QUOTES, 'UTF-8'); ?>">
	<?php if ($backgroundUrl !== null): ?>
	<div class="speed-dial-background" style="background-image: url('<?php echo htmlspecialchars($backgroundUrl, ENT_QUOTES, 'UTF-8'); ?>'); opacity: <?php echo $backgroundOpacity / 100; ?>;"></div>
	<?php endif; ?>
	<?php
	$iconSidebarWorkspace = $workspace;
	include __DIR__ . '/../icon_sidebar.php';
	?>
	<div class="speed-dial-container">
		<h1 class="poznote-page-title"><span id="speedDialTitle" class="poznote-page-title-name"><i class="lucide lucide-zap"></i> <?php echo t_h('speed_dial.title', [], 'Speed dial'); ?></span> <?php echo poznoteRenderPageTitleWorkspace($workspace); ?></h1>

		<?php if (count($boards) > 1 || $canEditBoards): ?>
		<?php // One pill per speed dial once there are several. Right-click or a long press renames or deletes one. ?>
		<div id="speedDialBoards" class="speed-dial-boards"<?php echo $canEditBoards ? ' data-can-edit="1"' : ''; ?>
			data-txt-new-title="<?php echo t_h('speed_dial.new_modal_title', [], 'Create a new speed dial'); ?>"
			data-txt-placeholder="<?php echo t_h('speed_dial.name_placeholder', [], 'Speed dial name'); ?>"
			data-txt-create="<?php echo t_h('common.create', [], 'Create'); ?>"
			data-txt-cancel="<?php echo t_h('common.cancel', [], 'Cancel'); ?>"
			data-txt-rename="<?php echo t_h('common.rename', [], 'Rename'); ?>"
			data-txt-rename-title="<?php echo t_h('speed_dial.rename_title', [], 'Rename speed dial'); ?>"
			data-txt-delete="<?php echo t_h('common.delete', [], 'Delete'); ?>"
			data-txt-delete-confirm="<?php echo t_h('speed_dial.delete_confirm', [], 'Delete this speed dial? Its notes stay, they only lose its tag.'); ?>"
			data-txt-error="<?php echo t_h('speed_dial.board_error', [], 'Could not save the speed dial.'); ?>"
			data-txt-exists="<?php echo t_h('speed_dial.board_exists', [], 'A speed dial with this name already exists.'); ?>"
			data-txt-invalid="<?php echo t_h('speed_dial.board_invalid', [], 'This name cannot be used.'); ?>">
			<?php if (count($boards) > 1): ?>
			<nav id="speedDialSwitcher" class="speed-dial-switcher">
				<?php foreach ($boards as $candidate):
					$candidateName = poznoteSpeedDialBoardName($candidate) ?? t('speed_dial.default_name', [], 'Default');
					$candidateUrl = 'speed_dial.php?workspace=' . urlencode($workspace) . (poznoteSpeedDialBoardName($candidate) !== null ? '&board=' . urlencode($candidate) : '');
				?>
				<a class="speed-dial-board<?php echo $candidate === $board ? ' is-active' : ''; ?>" href="<?php echo htmlspecialchars($candidateUrl, ENT_QUOTES, 'UTF-8'); ?>"<?php if (poznoteSpeedDialBoardName($candidate) !== null): ?> data-tag="<?php echo htmlspecialchars($candidate, ENT_QUOTES, 'UTF-8'); ?>" data-name="<?php echo htmlspecialchars($candidateName, ENT_QUOTES, 'UTF-8'); ?>"<?php endif; ?>><?php echo htmlspecialchars($candidateName, ENT_QUOTES, 'UTF-8'); ?></a>
				<?php endforeach; ?>
			</nav>
			<?php endif; ?>
		</div>
		<?php endif; ?>
		<?php ob_start(); ?>
		<?php // Created from the default speed dial only ?>
		<?php if ($canEditBoards && $boardKey === ''): ?><button type="button" id="speedDialNewBtn" class="speed-dial-board-new" title="<?php echo t_h('speed_dial.new_button', [], 'New speed dial'); ?>" aria-label="<?php echo t_h('speed_dial.new_button', [], 'New speed dial'); ?>"><i class="lucide lucide-plus"></i></button><?php endif; ?>
		<?php $newBoardButton = trim((string)ob_get_clean()); ?>

		<?php if (empty($items)): ?>
		<?php if ($newBoardButton !== ''): ?>
		<div class="speed-dial-toolbar is-empty"><?php echo $newBoardButton; ?></div>
		<?php endif; ?>
		<p class="speed-dial-empty"><?php echo t_h('speed_dial.empty', ['tag' => $board], 'Your speed dial is empty.'); ?></p>
		<?php else: ?>
		<div class="speed-dial-toolbar">
		<div class="speed-dial-toolbar-actions">
		<?php echo $newBoardButton; ?>
		<?php // The setting belongs to the account: not for someone only looking at it ?>
		<?php if (isActiveAccountOwnedByAuthenticatedUser()): ?>
		<div id="speedDialSize" class="speed-dial-size">
			<button type="button" id="speedDialSizeBtn" class="speed-dial-size-btn" aria-expanded="false" aria-controls="speedDialSizePopover" title="<?php echo t_h('speed_dial.tile_size', [], 'Tile size'); ?>" aria-label="<?php echo t_h('speed_dial.tile_size', [], 'Tile size'); ?>">
				<i class="lucide lucide-zoom-in"></i>
			</button>
			<div id="speedDialSizePopover" class="speed-dial-size-popover" hidden>
				<label for="speedDialSizeInput"><?php echo t_h('speed_dial.tile_size', [], 'Tile size'); ?>: <span id="speedDialSizeValue"><?php echo $tileSize; ?></span> px</label>
				<input type="range" id="speedDialSizeInput" min="<?php echo POZNOTE_SPEED_DIAL_TILE_MIN; ?>" max="<?php echo POZNOTE_SPEED_DIAL_TILE_MAX; ?>" step="10" value="<?php echo $tileSize; ?>">
			</div>
		</div>
		<?php endif; ?>
		</div>
		<div id="speedDialFilter" class="home-search-container">
			<div class="home-search-wrapper">
				<input type="text" id="speedDialFilterInput" class="home-search-input" placeholder="<?php echo t_h('public.filter_placeholder', [], 'Filter by name or link...'); ?>" autocomplete="off">
				<button type="button" id="speedDialFilterClear" class="home-search-clear" aria-label="<?php echo t_h('search.clear', [], 'Clear search'); ?>" title="<?php echo t_h('search.clear', [], 'Clear search'); ?>">
					<i class="lucide lucide-x"></i>
				</button>
			</div>
		</div>
		</div>
		<div id="speedDialGrid" class="speed-dial-grid" data-label-colors="<?php echo htmlspecialchars((string)json_encode($labelColors, JSON_FORCE_OBJECT), ENT_QUOTES, 'UTF-8'); ?>" data-txt-reorder-error="<?php echo t_h('dashboard.reorder_error', [], 'Could not save the card order.'); ?>">
			<?php foreach ($items as $item):
				$noteUrl = htmlspecialchars($item['noteUrl'], ENT_QUOTES, 'UTF-8');
				$editLabel = t_h('speed_dial.edit_note', [], 'Open the note');
				$editLink = '<a class="speed-dial-edit" draggable="false" href="' . $noteUrl . '" aria-label="' . $editLabel . '" title="' . $editLabel . '"><i class="lucide lucide-pencil"></i></a>';
			?>
			<?php if (isset($item['rows'])):
				$heading = htmlspecialchars($item['heading'], ENT_QUOTES, 'UTF-8');
				$labelColor = poznoteIconColorCss($labelColors[$item['id']] ?? '');
			?>
			<div class="speed-dial-item speed-dial-group" data-note-id="<?php echo (int)$item['id']; ?>" data-filter="<?php echo $heading; ?>">
				<div class="speed-dial-group-title"><a class="speed-dial-group-name" draggable="false" href="<?php echo $noteUrl; ?>"<?php if ($labelColor !== ''): ?> style="--speed-dial-label-color: <?php echo htmlspecialchars($labelColor, ENT_QUOTES, 'UTF-8'); ?>"<?php endif; ?>><?php echo $heading; ?></a></div>
				<?php foreach ($item['rows'] as $rowIndex => $row): ?>
				<?php if ($rowIndex > 0): ?><hr class="speed-dial-group-rule"><?php endif; ?>
				<?php if (!empty($row)): ?>
				<div class="speed-dial-group-row">
					<?php foreach ($row as $tile): ?>
					<div class="speed-dial-tile" data-filter="<?php echo htmlspecialchars($tile['label'] . ' ' . $tile['link'], ENT_QUOTES, 'UTF-8'); ?>">
						<?php speedDialRenderLink($tile, $item['noteUrl']); ?>
					</div>
					<?php endforeach; ?>
				</div>
				<?php endif; ?>
				<?php endforeach; ?>
			</div>
			<?php else: $tile = $item['tile']; ?>
			<div class="speed-dial-item speed-dial-tile" data-note-id="<?php echo (int)$item['id']; ?>" data-filter="<?php echo htmlspecialchars($tile['label'] . ' ' . $tile['link'], ENT_QUOTES, 'UTF-8'); ?>">
				<?php speedDialRenderLink($tile, $item['noteUrl']); ?>
				<?php if ($tile['link'] !== null) echo $editLink; ?>
			</div>
			<?php endif; ?>
			<?php endforeach; ?>
		</div>
		<p id="speedDialNoResults" class="speed-dial-empty" hidden><?php echo t_h('public.no_filter_results', [], 'No items match your search.'); ?></p>
		<?php // Right click on a label. Under the id of the note title's menu for its look (css/notes/title-menu.css). ?>
		<div id="noteTitleMenu" role="dialog" aria-label="<?php echo t_h('speed_dial.label_color', [], 'Label color'); ?>" hidden>
			<div class="note-title-menu-label"><?php echo t_h('speed_dial.label_color', [], 'Label color'); ?></div>
			<div class="note-title-menu-swatches">
				<button type="button" class="note-title-menu-swatch is-default" data-color="" title="<?php echo t_h('colors.default', [], 'Default'); ?>" aria-label="<?php echo t_h('colors.default', [], 'Default'); ?>"></button>
				<?php foreach (poznoteColorPalette() as $colorId => $color):
					$colorName = htmlspecialchars(poznoteColorPaletteName($colorId), ENT_QUOTES, 'UTF-8');
				?>
				<button type="button" class="note-title-menu-swatch" data-color="<?php echo $color['hex']; ?>" style="background-color: <?php echo htmlspecialchars(poznoteIconColorCss($color['hex']), ENT_QUOTES, 'UTF-8'); ?>" title="<?php echo $colorName; ?>" aria-label="<?php echo $colorName; ?>"></button>
				<?php endforeach; ?>
			</div>
		</div>
		<?php endif; ?>
	</div>

	<?php
	// Contextual UI Customization: floating button + docked column listing the
	// hideable elements of this page (see ui_customization_panel.php)
	$uiCustomizationPanelPage = 'speed-dial';
	include __DIR__ . '/../ui_customization_panel.php';
	?>
	<?php include __DIR__ . '/../modals/background_image_modal.php'; ?>

	<script src="js/globals.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/navigation.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/color-palette.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/request-errors.js?v=<?php echo $cache_v; ?>"></script>
	<script src="js/modal-alerts.js?v=<?php echo $cache_v; ?>"></script>
	<script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/workspace-background.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/ui-customization.js'); ?>"></script>
	<script src="<?php echo poznoteAsset('js/ui-customization-panel.js'); ?>"></script>
</body>
</html>

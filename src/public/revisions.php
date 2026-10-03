<?php
/**
 * Revisions of one note: the earlier versions Poznote kept (stored and served
 * by the API as "snapshots", see SnapshotsController), what changed between
 * any two of them or against the current note, and restore / delete / copy.
 *
 * A page rather than the dialog it replaces (discussion #1547): comparing two
 * versions of a long note needs the whole window, and a page can be linked,
 * reloaded on the same revision (?revision=) and left with the Back button.
 */
require_once __DIR__ . '/../auth.php';
requireAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/../db_connect.php';

$note_id = isset($_GET['note_id']) ? (int) $_GET['note_id'] : 0;
$workspace = isset($_GET['workspace']) ? trim((string) $_GET['workspace']) : '';

if ($note_id <= 0) {
    header('Location: index.php');
    exit;
}

if ($workspace !== '') {
    $stmt = $con->prepare('SELECT heading, type FROM entries WHERE id = ? AND trash = 0 AND workspace = ?');
    $stmt->execute([$note_id, $workspace]);
} else {
    $stmt = $con->prepare('SELECT heading, type FROM entries WHERE id = ? AND trash = 0');
    $stmt->execute([$note_id]);
}
$note = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$note) {
    header('Location: index.php');
    exit;
}

$noteType = (string) ($note['type'] ?? 'note');
$noteHeading = (string) ($note['heading'] ?? '');
if ($noteHeading === '') {
    $noteHeading = t('note_reference.untitled', [], 'Untitled');
}

$currentLang = getUserLanguage();
$v = urlencode(poznoteBuildAssetCacheVersion(getAppVersion()));

$backParams = ['note' => $note_id];
if ($workspace !== '') {
    $backParams['workspace'] = $workspace;
}
$backToNoteUrl = 'index.php?' . http_build_query($backParams);

// Today and yesterday in the user's timezone, so the history groups
// revisions by the same days the server dated them with
try {
    $userNow = new DateTimeImmutable('now', new DateTimeZone(getUserTimezone()));
} catch (Exception $e) {
    $userNow = new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

// The strings js/revisions-page.js builds its interface with, merged over
// English the way t() falls back. js/globals.js later replaces this with
// the full dictionary.
$revisionsStrings = loadI18nDictionary('en')['revisions'] ?? [];
if ($currentLang !== 'en') {
    $localized = loadI18nDictionary($currentLang)['revisions'] ?? [];
    if (is_array($localized)) {
        $revisionsStrings = array_replace_recursive($revisionsStrings, $localized);
    }
}

$pageConfig = [
    'noteId' => $note_id,
    'noteType' => $noteType,
    'noteHeading' => $noteHeading,
    'workspace' => $workspace,
    'backUrl' => $backToNoteUrl,
    'lang' => $currentLang,
    'today' => $userNow->format('Y-m-d'),
    'yesterday' => $userNow->modify('-1 day')->format('Y-m-d'),
    'initialRevision' => isset($_GET['revision']) ? (string) $_GET['revision'] : '',
];

$keepCountLink = '<a href="settings.php?open=snapshots#snapshots-card" class="revisions-keep-count-link" title="'
    . t_h('revisions.keep_count_link_title', [], 'Change for how many days one revision per day is kept') . '">'
    . getSnapshotsKeepCount() . '</a>';
$description = str_replace('%%COUNT%%', $keepCountLink, t_h('revisions.description', [
    'count' => '%%COUNT%%',
    'days' => POZNOTE_SNAPSHOTS_MAX_AGE_DAYS,
    'minutes' => (int) round(POZNOTE_SNAPSHOTS_AUTO_INTERVAL_SECONDS / 60),
    'hours' => POZNOTE_SNAPSHOTS_DENSE_HOURS,
], 'A revision is saved automatically when you change a note, at most one every {{minutes}} minutes: it holds the note as it was just before the change. You can also save one yourself (Ctrl + Alt + S), and one is saved right before the AI assistant or the MCP server replaces the content. Automatic revisions are all kept for {{hours}} hours, then one per day for {{count}} days. Revisions expire after {{days}} days. Attachments are not versioned.'));
// Keep the shortcut on one line
$description = preg_replace('/(?:Ctrl|Strg) \+ Alt \+ S/u', '<span class="revisions-nowrap">$0</span>', $description);
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="dark light">
    <title><?php echo t_h('revisions.title', [], 'Revisions'); ?> · <?php echo htmlspecialchars($noteHeading, ENT_QUOTES, 'UTF-8'); ?> - Poznote</title>
    <script src="js/theme-init.js?v=<?php echo $v; ?>"></script>
    <script src="js/session-guard.js?v=<?php echo $v; ?>"></script>
    <?php poznoteRenderStylesheets('revisions'); ?>
    <script src="js/theme-manager.js?v=<?php echo rawurlencode(poznoteGetThemeAssetVersion()); ?>"></script>
    <?php poznoteRenderUiCustomizationBootstrap(); ?>
</head>
<body class="revisions-page has-icon-sidebar" data-note-type="<?php echo htmlspecialchars($noteType, ENT_QUOTES, 'UTF-8'); ?>">
    <?php include __DIR__ . '/../icon_sidebar.php'; ?>

    <script type="application/json" id="revisions-config"><?php
        echo json_encode($pageConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?: '{}';
    ?></script>
    <script>
        window.POZNOTE_I18N = {
            lang: <?php echo json_encode($currentLang, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP); ?>,
            strings: { revisions: <?php echo json_encode($revisionsStrings ?: new stdClass(), JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE); ?> }
        };
    </script>

    <div class="revisions-shell">
        <header class="revisions-header">
            <div class="revisions-heading">
                <h1 class="revisions-title">
                    <i class="lucide lucide-history"></i>
                    <span><?php echo t_h('revisions.title', [], 'Revisions'); ?></span>
                </h1>
            </div>
        </header>
        <p class="revisions-description"><?php echo $description; ?></p>

        <div class="revisions-layout">
            <aside class="revisions-sidebar" aria-label="<?php echo t_h('revisions.history', [], 'History'); ?>">
                <div class="revisions-sidebar-title"><?php echo t_h('revisions.history', [], 'History'); ?></div>
                <div id="revisionsList" class="revisions-list" role="listbox" tabindex="0" aria-label="<?php echo t_h('revisions.history', [], 'History'); ?>"></div>
            </aside>

            <main class="revisions-main">
                <div id="revisionsLoading" class="revisions-state">
                    <i class="lucide lucide-loader-2 revisions-spinner"></i>
                    <p><?php echo t_h('revisions.loading', [], 'Loading...'); ?></p>
                </div>

                <div id="revisionsEmpty" class="revisions-state" hidden>
                    <i class="lucide lucide-history"></i>
                    <p class="revisions-state-title"><?php echo t_h('revisions.empty_title', [], 'No revision yet'); ?></p>
                    <p class="revisions-state-hint"><?php echo t_h('revisions.empty_hint', [], 'A revision is saved automatically when you change the note. You can also save one now.'); ?></p>
                    <button type="button" class="revisions-btn revisions-btn-secondary revisions-new-btn revisions-empty-new">
                        <i class="lucide lucide-plus"></i>
                        <span><?php echo t_h('revisions.actions.new', [], 'Save a revision'); ?></span>
                    </button>
                </div>

                <div id="revisionsPanel" class="revisions-panel" hidden>
                    <div class="revisions-panel-head">
                        <div class="revisions-selected">
                            <h2 class="revisions-selected-title" id="revisionsSelectedWhen"><?php echo htmlspecialchars($noteHeading, ENT_QUOTES, 'UTF-8'); ?></h2>
                        </div>
                        <div class="revisions-panel-actions">
                            <div class="revisions-tabs" role="tablist">
                                <button type="button" class="revisions-tab" role="tab" data-view="content" id="revisionsTabContent"><?php echo t_h('revisions.tabs.content', [], 'Content'); ?></button>
                                <button type="button" class="revisions-tab" role="tab" data-view="changes" id="revisionsTabChanges"><?php echo t_h('revisions.tabs.changes', [], 'Changes'); ?></button>
                            </div>
                            <div class="revisions-segmented" id="revisionsMdMode" role="group" hidden>
                                <button type="button" data-md-mode="preview"><?php echo t_h('revisions.markdown_preview', [], 'Preview'); ?></button>
                                <button type="button" data-md-mode="source"><?php echo t_h('revisions.markdown_source', [], 'Source'); ?></button>
                            </div>
                            <div class="revisions-menu-wrap">
                                <button type="button" class="revisions-btn revisions-btn-secondary" id="revisionsActionsBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="revisionsActionsMenu">
                                    <span><?php echo t_h('revisions.actions.menu', [], 'Actions'); ?></span>
                                    <i class="lucide lucide-chevron-down"></i>
                                </button>
                                <div class="revisions-menu" id="revisionsActionsMenu" role="menu" hidden>
                                    <button type="button" class="revisions-menu-item" role="menuitem" id="revisionsRestoreBtn">
                                        <i class="lucide lucide-rotate-ccw"></i>
                                        <span><?php echo t_h('revisions.actions.restore', [], 'Restore this revision'); ?></span>
                                    </button>
                                    <button type="button" class="revisions-menu-item revisions-new-btn" role="menuitem">
                                        <i class="lucide lucide-plus"></i>
                                        <span><?php echo t_h('revisions.actions.new', [], 'Save a revision'); ?></span>
                                    </button>
                                    <button type="button" class="revisions-menu-item" role="menuitem" id="revisionsCopyBtn">
                                        <i class="lucide lucide-copy"></i>
                                        <span><?php echo t_h('revisions.actions.copy', [], 'Copy content'); ?></span>
                                    </button>
                                    <div class="revisions-menu-separator" role="separator"></div>
                                    <button type="button" class="revisions-menu-item revisions-menu-danger" role="menuitem" id="revisionsDeleteBtn">
                                        <i class="lucide lucide-trash-2"></i>
                                        <span><?php echo t_h('revisions.actions.delete', [], 'Delete this revision'); ?></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="revisions-toolbar" id="revisionsToolbar">
                        <div class="revisions-toolbar-group" data-for-view="changes">
                            <label class="revisions-compare">
                                <span><?php echo t_h('revisions.compare_with', [], 'Compare with'); ?></span>
                                <select id="revisionsCompare"></select>
                            </label>
                            <div class="revisions-segmented" role="group" aria-label="<?php echo t_h('revisions.layout.label', [], 'Layout'); ?>">
                                <button type="button" data-layout="unified" title="<?php echo t_h('revisions.layout.unified', [], 'Unified'); ?>"><i class="lucide lucide-rows-2"></i><span><?php echo t_h('revisions.layout.unified', [], 'Unified'); ?></span></button>
                                <button type="button" data-layout="split" title="<?php echo t_h('revisions.layout.split', [], 'Side by side'); ?>"><i class="lucide lucide-columns-2"></i><span><?php echo t_h('revisions.layout.split', [], 'Side by side'); ?></span></button>
                            </div>
                        </div>
                    </div>

                    <div class="revisions-diff-bar" id="revisionsDiffBar" data-for-view="changes">
                        <div class="revisions-diff-direction" id="revisionsDiffDirection"></div>
                        <div class="revisions-diff-stats" id="revisionsDiffStats"></div>
                        <div class="revisions-diff-nav">
                            <button type="button" class="revisions-btn revisions-btn-icon" id="revisionsPrevChange" title="<?php echo t_h('revisions.prev_change', [], 'Previous change'); ?>" aria-label="<?php echo t_h('revisions.prev_change', [], 'Previous change'); ?>"><i class="lucide lucide-chevron-up"></i></button>
                            <button type="button" class="revisions-btn revisions-btn-icon" id="revisionsNextChange" title="<?php echo t_h('revisions.next_change', [], 'Next change'); ?>" aria-label="<?php echo t_h('revisions.next_change', [], 'Next change'); ?>"><i class="lucide lucide-chevron-down"></i></button>
                        </div>
                    </div>

                    <div class="revisions-body" id="revisionsBody"></div>
                </div>
            </main>
        </div>
    </div>

    <script src="<?php echo poznoteAsset('js/globals.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/modal-alerts.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/revisions-diff.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/revisions-page.js'); ?>"></script>
    <script src="<?php echo poznoteAsset('js/icon-sidebar-toggle.js'); ?>"></script>
</body>
</html>

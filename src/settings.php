<?php
require 'auth.php';
requireAuth();

require_once 'config.php';
include 'db_connect.php';
include 'functions.php';

// Include page initialization
require_once 'page_init.php';

// Initialize search parameters
$search_params = initializeSearchParams();
extract($search_params); // Extracts variables: $search, $tags_search, $note, etc.

// Preserve note parameter if provided (now using ID)
$note_id = isset($_GET['note']) ? intval($_GET['note']) : null;

$currentLang = getUserLanguage();

?>

<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($currentLang, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1"/>
    <title><?php echo t_h('settings.title'); ?> - <?php echo t_h('app.name'); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/all.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/settings.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
</head>
<body data-txt-enabled="<?php echo t_h('common.enabled'); ?>"
      data-txt-disabled="<?php echo t_h('common.disabled'); ?>"
      data-txt-not-defined="<?php echo t_h('common.not_defined'); ?>"
      data-workspace="<?php echo htmlspecialchars(getWorkspaceFilter(), ENT_QUOTES, 'UTF-8'); ?>">
    <div class="settings-container">
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>

        <!-- Version Display (mobile top) -->
        <div class="version-display version-display-mobile-top" style="text-align: center; padding: 12px 6px; margin-bottom: 12px; color: var(--text-secondary);">
            <small>Poznote <?php echo htmlspecialchars(trim(file_get_contents('version.txt')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></small><br>
            <small><a href="https://poznote.com/releases.html" target="_blank" style="color: var(--link-color); text-decoration: underline; opacity: 1;"><?php echo t_h('settings.cards.release_notes'); ?></a></small>
        </div>

        <div class="settings-two-columns">
            <!-- Left Column: Actions (without badges) -->
            <div class="settings-column settings-column-left">
                <!-- Back to Notes -->
                <div class="settings-card" id="backToNotesLink" data-href="<?php echo $back_href; ?>" style="cursor: pointer;">
                    <div class="settings-card-icon">
                        <i class="fa-arrow-left"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('common.back_to_notes'); ?></h3>
                    </div>
                </div>

                <!-- Workspaces -->
                <div class="settings-card" id="workspaces-card">
                    <div class="settings-card-icon">
                        <i class="fa-layer-group"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.workspaces'); ?></h3>
                    </div>
                </div>

                <!-- Backup / Export -->
                <div class="settings-card" id="backup-export-card">
                    <div class="settings-card-icon">
                        <i class="fa-upload"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.backup_export'); ?></h3>
                    </div>
                </div>

                <!-- Restore / Import -->
                <div class="settings-card" id="restore-import-card">
                    <div class="settings-card-icon">
                        <i class="fa-download"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.restore_import'); ?></h3>
                    </div>
                </div>

                <!-- Check for Updates -->
                <div class="settings-card" id="check-updates-card">
                    <div class="settings-card-icon">
                        <i class="fa-sync-alt"></i>
                        <span class="update-badge" style="display: none;"></span>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.check_updates'); ?></h3>
                    </div>
                </div>

                <!-- API Documentation -->
                <div class="settings-card" id="api-docs-card">
                    <div class="settings-card-icon">
                        <i class="fa-code"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.api_docs'); ?></h3>
                    </div>
                </div>

                <!-- Github repository -->
                <div class="settings-card" id="github-card">
                    <div class="settings-card-icon">
                        <i class="fa-code-branch"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.documentation'); ?></h3>
                    </div>
                </div>

                <!-- News -->
                <div class="settings-card" id="news-card">
                    <div class="settings-card-icon">
                        <i class="fa-newspaper"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.news'); ?></h3>
                    </div>
                </div>

                <!-- Poznote Website -->
                <div class="settings-card" id="website-card">
                    <div class="settings-card-icon">
                        <i class="fa-globe"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.website'); ?></h3>
                    </div>
                </div>

                <!-- Support Developer -->
                <div class="settings-card" id="support-card">
                    <div class="settings-card-icon">
                        <i class="fa-heart heart-blink"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.cards.support'); ?></h3>
                    </div>
                </div>
            </div>

            <!-- Right Column: Settings with badges -->
            <div class="settings-column settings-column-right">
                <!-- Mobile Separator -->
                <div class="settings-sep settings-sep-mobile"></div>
                
                <!-- Login Display -->
                <div class="settings-card" id="login-display-card">
                    <div class="settings-card-icon">
                        <i class="fa-user"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.login_display'); ?> <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Language -->
                <div class="settings-card" id="language-card">
                    <div class="settings-card-icon">
                        <i class="fal fa-flag"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('settings.language.label'); ?> <span id="language-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Theme Mode -->
                <div class="settings-card" id="theme-mode-card">
                    <div class="settings-card-icon">
                        <i class="fa fa-sun"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.theme_mode'); ?> <span id="theme-mode-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Font Size -->
                <div class="settings-card" id="font-size-card">
                    <div class="settings-card-icon">
                        <i class="fa-text-height"></i>
                    </div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_font_size'); ?> <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Timezone -->
                <div class="settings-card" id="timezone-card">
                    <div class="settings-card-icon"><i class="fal fa-clock"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.timezone'); ?> <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Note Sort Order -->
                <div class="settings-card" id="note-sort-card">
                    <div class="settings-card-icon"><i class="fa-sort-amount-down"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.note_sort_order'); ?> <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Note Created -->
                <div class="settings-card" id="show-created-card">
                    <div class="settings-card-icon"><i class="fa-calendar-alt"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_note_created'); ?> <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Note Subheading -->
                <div class="settings-card" id="show-subheading-card">
                    <div class="settings-card-icon"><i class="fa-map-marker-alt"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_note_subheading'); ?> <span id="show-subheading-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Show Folder Counts -->
                <div class="settings-card" id="folder-counts-card">
                    <div class="settings-card-icon"><i class="fa-hashtag"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.show_folder_counts'); ?> <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span></h3>
                    </div>
                </div>

                <!-- Notes Without Folders Position -->
                <div class="settings-card" id="notes-without-folders-card">
                    <div class="settings-card-icon"><i class="fa-folder-tree"></i></div>
                    <div class="settings-card-content">
                        <h3><?php echo t_h('display.cards.notes_without_folders_after'); ?> <span id="notes-without-folders-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                    </div>
                </div>
            </div>
        </div>

        <!-- Version Display (desktop bottom) -->
        <div class="version-display version-display-desktop-bottom" style="text-align: center; padding: 20px; margin-top: 30px; border-top: 1px solid var(--border-color); color: var(--text-secondary);">
            <small>Poznote <?php echo htmlspecialchars(trim(file_get_contents('version.txt')), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></small><br>
            <small><a href="https://poznote.com/releases.html" target="_blank" style="color: var(--link-color); text-decoration: underline; opacity: 1;"><?php echo t_h('settings.cards.release_notes'); ?></a></small>
        </div>
    </div>

    <?php include 'modals.php'; ?>
    <script src="js/modal-alerts.js"></script>
    <script src="js/theme-manager.js"></script>
    <script src="js/globals.js"></script>
    <script src="js/ui.js"></script>
    <script src="js/utils.js"></script>
    <script src="js/font-size-settings.js"></script>
    <script src="js/copy-code-on-focus.js"></script>
    <script src="js/modals-events.js"></script>
    <script src="js/settings-page.js"></script>
</body>
</html>

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
    <title><?php echo t_h('display.title'); ?> - <?php echo t_h('app.name'); ?></title>
    <meta name="color-scheme" content="dark light">
    <script src="js/theme-init.js"></script>
    <link rel="stylesheet" href="css/fontawesome.min.css">
    <link rel="stylesheet" href="css/all.css">
    <link rel="stylesheet" href="css/modal-alerts.css">
    <link rel="stylesheet" href="css/light.min.css">
    <link rel="stylesheet" href="css/display.css">
    <link rel="stylesheet" href="css/modals.css">
    <link rel="stylesheet" href="css/dark-mode.css">
</head>
<body data-txt-enabled="<?php echo t_h('common.enabled'); ?>"
      data-txt-disabled="<?php echo t_h('common.disabled'); ?>"
      data-txt-saved="<?php echo t_h('common.saved'); ?>"
      data-txt-error="<?php echo t_h('common.error'); ?>"
      data-txt-not-defined="<?php echo t_h('common.not_defined'); ?>">
    <div class="settings-container">
        <br>
        <?php 
            // Build basic URL - workspace will be handled by JavaScript
            $back_params = [];
            if ($note_id) {
                $back_params[] = 'note=' . intval($note_id);
            }
            $back_href = 'index.php' . (!empty($back_params) ? '?' . implode('&', $back_params) : '');
        ?>
        <a id="backToNotesLink" href="<?php echo $back_href; ?>" class="btn btn-secondary">
            <?php echo t_h('common.back_to_notes'); ?>
        </a>
        <br><br>

        <div class="settings-grid">
            <!-- Language Selection -->
            <div class="settings-card" id="language-card" onclick="showLanguageModal();">
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

            <!-- Moved from settings.php: user preferences -->
            <div class="settings-card" id="login-display-card">
                <div class="settings-card-icon">
                    <i class="fa-user"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.login_display'); ?> <span id="login-display-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="font-size-card">
                <div class="settings-card-icon">
                    <i class="fa-text-height"></i>
                </div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.note_font_size'); ?> <span id="font-size-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="note-sort-card">
                <div class="settings-card-icon"><i class="fa-list-ol"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.note_sort_order'); ?> <span id="note-sort-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="timezone-card">
                <div class="settings-card-icon"><i class="fal fa-clock"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.timezone'); ?> <span id="timezone-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-created-card">
                <div class="settings-card-icon"><i class="fa-calendar-alt"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.show_note_created'); ?> <span id="show-created-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="show-subheading-card">
                <div class="settings-card-icon"><i class="fa-map-marker-alt"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.show_note_subheading'); ?> <span id="show-subheading-status" class="setting-status disabled"><?php echo t_h('common.disabled'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-counts-card">
                <div class="settings-card-icon"><i class="fa-hashtag"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.show_folder_counts'); ?> <span id="folder-counts-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span></h3>
                </div>
            </div>

            <div class="settings-card" id="folder-actions-card">
                <div class="settings-card-icon"><i class="fa-folder-open"></i></div>
                <div class="settings-card-content">
                    <h3><?php echo t_h('display.cards.show_folder_actions'); ?> <span id="folder-actions-status" class="setting-status enabled"><?php echo t_h('common.enabled'); ?></span></h3>
                </div>
            </div>

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
    <script src="js/display-page.js"></script>
</body>
</html>

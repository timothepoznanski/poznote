<?php
/**
 * Contextual UI Customization panel: a floating button at the bottom-right of
 * the page opens a column docked on the right (same arrangement as the AI
 * chat panel, and included right after it as the last flex child of <body>)
 * listing only the hideable elements of the page it is opened on. Ticking a
 * box applies at once and is saved automatically, so the effect of each
 * option is seen where it happens instead of from the settings page.
 *
 * The including page sets $uiCustomizationPanelPage ('notes' for index.php,
 * 'dashboard' for dashboard.php, 'settings' for settings.php):
 * js/ui-customization-panel.js keeps the sections of
 * modals/ui_customization_sections.php whose data-ui-pages lists it. It needs js/ui-customization.js (the runtime that applies the keys) and
 * css/ui-customization-panel.css plus css/modals/ui-customization.css for the
 * checklist itself.
 *
 * The panel only edits the user's own preference. The instance-wide "Users"
 * column administrators get stays in the settings page modal, which the
 * header link opens (settings.php?open=ui-customization).
 */
$uiCustomizationPanelPage = isset($uiCustomizationPanelPage) ? (string)$uiCustomizationPanelPage : 'notes';
$uiCustomizationPanelTitle = t_h('modals.ui_customization.panel_title', [], 'Customize this page');
// The including page resolves $aiChatEnabled before including the AI chat
// panel; the stack repeats its toggle so the assistant is one tap away.
$uiCustomizationPanelAiChat = !empty($aiChatEnabled);
$uiCustomizationPanelAiLabel = t_h('ai_chat.toolbar_button', [], 'AI assistant');
?>
    <!-- Floating stack at the bottom-right of the page: AI assistant, then
         this panel's toggle. On the notes page the note's scroll-to-edge
         arrows (note_display.php) sit under it, see css/ui-customization-panel.css. -->
    <div class="pz-edge-stack">
        <?php if ($uiCustomizationPanelAiChat): ?>
        <button type="button" id="edgeAiChatBtn" class="pz-edge-btn" data-action="toggle-ai-chat"
            title="<?php echo $uiCustomizationPanelAiLabel; ?>" aria-label="<?php echo $uiCustomizationPanelAiLabel; ?>">
            <i class="lucide lucide-bot"></i>
        </button>
        <?php endif; ?>
        <button type="button" id="uiCustomizationPanelToggle" class="pz-edge-btn ui-custom-panel-toggle" data-action="toggle-ui-customization-panel"
            aria-controls="uiCustomizationPanel" aria-expanded="false"
            title="<?php echo t_h('modals.ui_customization.panel_button', [], 'Customize the interface'); ?>"
            aria-label="<?php echo t_h('modals.ui_customization.panel_button', [], 'Customize the interface'); ?>">
            <i class="lucide lucide-eye-off"></i>
        </button>
    </div>
    <!-- UI CUSTOMIZATION PANEL -->
    <aside id="uiCustomizationPanel" class="ui-custom-panel" data-ui-page="<?php echo htmlspecialchars($uiCustomizationPanelPage, ENT_QUOTES, 'UTF-8'); ?>"
        aria-labelledby="uiCustomizationPanelTitle" aria-hidden="true"
        data-status-saving="<?php echo t_h('modals.ui_customization.panel_saving', [], 'Saving…'); ?>"
        data-status-saved="<?php echo t_h('modals.ui_customization.panel_saved', [], 'Saved'); ?>"
        data-status-error="<?php echo t_h('modals.ui_customization.panel_save_error', [], 'Could not save, try again.'); ?>"
        data-locked-title="<?php echo t_h('modals.ui_customization.locked_by_admin', [], 'Hidden for all users by the administrator'); ?>">
        <div class="ui-custom-panel-header">
            <h2 class="ui-custom-panel-title" id="uiCustomizationPanelTitle"><i class="lucide lucide-eye-off"></i> <span><?php echo $uiCustomizationPanelTitle; ?></span></h2>
            <a class="ui-custom-panel-header-btn" href="settings.php?open=ui-customization"
                title="<?php echo t_h('modals.ui_customization.panel_all_options', [], 'All options'); ?>"
                aria-label="<?php echo t_h('modals.ui_customization.panel_all_options', [], 'All options'); ?>">
                <i class="lucide lucide-settings"></i>
            </a>
            <button type="button" class="ui-custom-panel-header-btn" data-action="toggle-ui-customization-panel"
                title="<?php echo t_h('common.close'); ?>" aria-label="<?php echo t_h('common.close'); ?>">
                <i class="lucide lucide-x"></i>
            </button>
        </div>
        <div class="ui-custom-panel-body">
            <p class="ui-custom-description ui-custom-panel-hint"><?php echo t_h('modals.ui_customization.panel_hint', [], 'Only the elements of this page are listed. Changes apply immediately and are saved automatically.'); ?></p>
            <div class="ui-custom-filter ui-custom-panel-filter">
                <input type="search" id="uiCustomizationPanelFilter" class="ui-custom-filter-input"
                    placeholder="<?php echo t_h('modals.ui_customization.filter_placeholder', [], 'Filter items...'); ?>" autocomplete="off">
            </div>
            <div class="ui-custom-empty" id="uiCustomizationPanelEmpty" hidden><?php echo t_h('modals.ui_customization.no_results', [], 'No matching items found.'); ?></div>
            <div class="ui-custom-panel-sections">
                <?php include __DIR__ . '/modals/ui_customization_sections.php'; ?>
            </div>
        </div>
        <div class="ui-custom-panel-status" id="uiCustomizationPanelStatus" aria-live="polite"></div>
    </aside>

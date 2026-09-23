<?php
/**
 * The "Element visibility" section of settings.php: the full UI Customization
 * checklist (modals/ui_customization_sections.php) shown in the page, where
 * it used to open in a modal. The contextual panel on the
 * notes page (ui_customization_panel.php) keeps its own, per-page copy and
 * links here with settings.php?open=ui-customization.
 *
 * Administrators get a second checkbox column ("Users") editing the
 * instance-wide set next to their own ("Me"), added by
 * initUiCustomizationAdminColumns() in js/settings-page.js, which also loads
 * the saved state (loadUiCustomizationSettings) and binds the Save button.
 * Styles: css/modals/ui-customization.css.
 */
// settings.php resolves $isAdmin before including this file; the guard keeps
// the fragment self-contained (and PHPStan quiet) when analysed on its own.
$isAdmin = !empty($isAdmin);
?>
<div id="uiCustomizationSettings" class="ui-custom-settings"<?php echo $isAdmin ? ' data-ui-admin="1"' : ''; ?>>
    <p class="ui-custom-description" id="uiCustomizationSettingsDescription"
        data-description-user="<?php echo t_h('modals.ui_customization.description', [], 'Show or hide interface elements. Unchecked items will be hidden.'); ?>"
        data-description-admin="<?php echo t_h('modals.ui_customization.description_admin', [], 'Show or hide interface elements. Unchecked items will be hidden. The "Me" column applies to your own interface, the "Users" column to every user of this instance except administrators.'); ?>"
        data-description-admin-highlight="<?php echo t_h('modals.ui_customization.description_global_highlight', [], 'except administrators'); ?>"
        data-column-me="<?php echo t_h('modals.ui_customization.column_me', [], 'Me'); ?>"
        data-column-users="<?php echo t_h('modals.ui_customization.column_users', [], 'Users'); ?>"><?php echo t_h('modals.ui_customization.description', [], 'Show or hide interface elements. Unchecked items will be hidden.'); ?></p>
    <p class="ui-custom-summary"><span id="ui-customization-badge" class="setting-status"><?php echo t_h('common.loading'); ?></span></p>
    <div class="ui-custom-filter">
        <button type="button" id="uiCustomizationToggleAll" class="ui-custom-toggle-all ui-custom-toggle-all-global" data-label-check="<?php echo t_h('modals.ui_customization.check_all', [], 'Check all'); ?>" data-label-uncheck="<?php echo t_h('modals.ui_customization.uncheck_all', [], 'Uncheck all'); ?>"></button>
        <button type="button" id="uiCustomizationCollapseAll" class="ui-custom-collapse-all"
            data-label-collapse="<?php echo t_h('modals.ui_customization.collapse_all', [], 'Collapse all'); ?>"
            data-label-expand="<?php echo t_h('modals.ui_customization.expand_all', [], 'Expand all'); ?>"><i class="lucide lucide-chevron-down"></i></button>
        <input
            type="search"
            id="uiCustomizationFilterInput"
            class="ui-custom-filter-input"
            placeholder="<?php echo t_h('modals.ui_customization.filter_placeholder', [], 'Filter items...'); ?>"
            autocomplete="off">
    </div>
    <label class="ui-custom-hidden-only">
        <input type="checkbox" id="uiCustomizationHiddenOnly">
        <span><?php echo t_h('modals.ui_customization.show_unchecked_only', [], 'Show only unchecked items'); ?></span>
    </label>
    <div class="ui-custom-sections">
        <div class="ui-custom-empty" id="uiCustomizationFilterEmpty" hidden
            data-empty-default="<?php echo t_h('modals.ui_customization.no_results', [], 'No matching items found.'); ?>"
            data-empty-unchecked="<?php echo t_h('modals.ui_customization.no_unchecked_results', [], 'No unchecked items.'); ?>"><?php echo t_h('modals.ui_customization.no_results', [], 'No matching items found.'); ?></div>

        <?php include __DIR__ . '/modals/ui_customization_sections.php'; ?>
    </div>
    <div class="ui-custom-settings-footer">
        <button type="button" class="btn btn-primary ui-custom-save-btn" id="saveUiCustomizationBtn"><?php echo t_h('common.save'); ?></button>
    </div>
</div>

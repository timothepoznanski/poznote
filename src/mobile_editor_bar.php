<?php
/**
 * Mobile editor bar (discussion #1465): a row of editing buttons pinned above
 * the on-screen keyboard while the body of a note is being edited.
 *
 * A touch keyboard has no Tab, no Ctrl+Z and makes the "/" of the slash menu
 * hard to reach, so the bar carries those first. The Insert button opens that
 * menu whatever the mobile "Command menu shortcut" setting says. The
 * formatting buttons reuse the data-action values of the note toolbar
 * (js/index-events.js); the others
 * are handled by js/mobile-editor-bar.js, which also decides when the bar
 * shows. Styled in css/index-mobile.css, hidden everywhere else by
 * css/toolbar.css.
 *
 * Each button has an id so the UI Customization list can hide it with a
 * plain card: key (modals/ui_customization_sections.php).
 */
?>
<div id="mobileEditorBar" class="mobile-editor-bar" role="toolbar" aria-label="<?php echo t_h('modals.ui_customization.sections.mobile_editor_bar', [], 'Mobile editor bar'); ?>">
    <div class="mobile-editor-bar-scroll">
        <button type="button" id="mobileBarInsert" class="mobile-editor-bar-btn mobile-editor-bar-insert" data-mobile-bar-action="slash-menu" title="<?php echo t_h('mobile_editor_bar.insert', [], 'Insert (slash menu)'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.insert', [], 'Insert (slash menu)'); ?>"><i class="lucide lucide-plus"></i></button>
        <?php // Record, then insert the audio or transcribe it; the dialog opens with the keyboard closed (js/speech-to-text.js) ?>
        <button type="button" id="mobileBarRecordAudio" class="mobile-editor-bar-btn" data-mobile-bar-action="record-audio" title="<?php echo t_h('slash_menu.record_audio', [], 'Record audio'); ?>" aria-label="<?php echo t_h('slash_menu.record_audio', [], 'Record audio'); ?>"><i class="lucide lucide-mic"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarUndo" class="mobile-editor-bar-btn" data-mobile-bar-action="undo" title="<?php echo t_h('mobile_editor_bar.undo', [], 'Undo'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.undo', [], 'Undo'); ?>"><i class="lucide lucide-undo-2"></i></button>
        <button type="button" id="mobileBarRedo" class="mobile-editor-bar-btn" data-mobile-bar-action="redo" title="<?php echo t_h('mobile_editor_bar.redo', [], 'Redo'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.redo', [], 'Redo'); ?>"><i class="lucide lucide-redo-2"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarBold" class="mobile-editor-bar-btn" data-action="exec-bold" title="<?php echo t_h('editor.toolbar.bold'); ?>" aria-label="<?php echo t_h('editor.toolbar.bold'); ?>"><i class="lucide lucide-bold"></i></button>
        <button type="button" id="mobileBarItalic" class="mobile-editor-bar-btn" data-action="exec-italic" title="<?php echo t_h('editor.toolbar.italic'); ?>" aria-label="<?php echo t_h('editor.toolbar.italic'); ?>"><i class="lucide lucide-italic"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarListUl" class="mobile-editor-bar-btn" data-action="exec-unordered-list" title="<?php echo t_h('editor.toolbar.bullet_list'); ?>" aria-label="<?php echo t_h('editor.toolbar.bullet_list'); ?>"><i class="lucide lucide-list-ul"></i></button>
        <button type="button" id="mobileBarListOl" class="mobile-editor-bar-btn" data-action="exec-ordered-list" title="<?php echo t_h('editor.toolbar.numbered_list'); ?>" aria-label="<?php echo t_h('editor.toolbar.numbered_list'); ?>"><i class="lucide lucide-list-ol"></i></button>
        <button type="button" id="mobileBarChecklist" class="mobile-editor-bar-btn" data-action="exec-task-list" title="<?php echo t_h('editor.toolbar.toggle_checklist', [], 'Toggle checklist'); ?>" aria-label="<?php echo t_h('editor.toolbar.toggle_checklist', [], 'Toggle checklist'); ?>"><i class="lucide lucide-list-check"></i></button>
        <button type="button" id="mobileBarOutdent" class="mobile-editor-bar-btn" data-mobile-bar-action="outdent" title="<?php echo t_h('mobile_editor_bar.outdent', [], 'Outdent'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.outdent', [], 'Outdent'); ?>"><i class="lucide lucide-indent-decrease"></i></button>
        <button type="button" id="mobileBarIndent" class="mobile-editor-bar-btn" data-mobile-bar-action="indent" title="<?php echo t_h('mobile_editor_bar.indent', [], 'Indent'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.indent', [], 'Indent'); ?>"><i class="lucide lucide-indent-increase"></i></button>
    </div>
    <div class="mobile-editor-bar-pinned">
    <button type="button" id="mobileBarHideKeyboard" class="mobile-editor-bar-btn mobile-editor-bar-dismiss" data-mobile-bar-action="hide-keyboard" title="<?php echo t_h('mobile_editor_bar.hide_keyboard', [], 'Hide keyboard'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.hide_keyboard', [], 'Hide keyboard'); ?>"><i class="lucide lucide-keyboard"></i></button>
    <?php
    // Straight to "Element visibility" with the section of this bar unfolded
    // (data-ui-section, js/ui-customization-panel.js): the "..." menu that
    // normally leads there is hidden while the bar shows.
    $pzMobileBarCustomizeLabel = isset($uiCustomizationPanelTitle) ? $uiCustomizationPanelTitle : t_h('modals.ui_customization.panel_title', [], 'Element visibility');
    ?>
    <?php // The panel it opens is for the owner of the account on screen ?>
    <?php if ((!function_exists('isActiveAccountOwnedByAuthenticatedUser') || isActiveAccountOwnedByAuthenticatedUser())): ?>
    <button type="button" id="mobileBarCustomize" class="mobile-editor-bar-btn" data-mobile-bar-action="customize" data-action="toggle-ui-customization-panel" data-ui-section="mobile-editor-bar" aria-controls="uiCustomizationPanel" title="<?php echo $pzMobileBarCustomizeLabel; ?>" aria-label="<?php echo $pzMobileBarCustomizeLabel; ?>"><i class="lucide lucide-eye-off"></i></button>
    <?php endif; ?>
    </div>
</div>

<?php
/**
 * Mobile editor bar (discussion #1465): a row of editing buttons pinned above
 * the on-screen keyboard while the body of a note is being edited.
 *
 * A touch keyboard has no Tab, no Ctrl+Z and makes the "/" of the slash menu
 * hard to reach, so the bar carries those first. The Insert button opens that
 * menu whatever the mobile "Command menu shortcut" setting says. The
 * formatting buttons are every formatting button of the note toolbar, which
 * no longer switches to them on a phone when text is selected: they reuse its
 * data-action values (js/index-events.js), and show only when the toolbar of
 * the note being edited has that button and the selection takes it
 * (js/mobile-editor-bar.js). data-mobile-bar-note-id gets the id of the note
 * being edited before the click reaches the document. The others are handled by
 * js/mobile-editor-bar.js, which also decides when the bar shows. Styled in css/index-mobile.css, hidden everywhere else by
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
        <button type="button" id="mobileBarUnderline" class="mobile-editor-bar-btn" data-action="exec-underline" title="<?php echo t_h('editor.toolbar.underline'); ?>" aria-label="<?php echo t_h('editor.toolbar.underline'); ?>"><i class="lucide lucide-underline"></i></button>
        <button type="button" id="mobileBarStrikethrough" class="mobile-editor-bar-btn" data-action="exec-strikethrough" title="<?php echo t_h('editor.toolbar.strikethrough'); ?>" aria-label="<?php echo t_h('editor.toolbar.strikethrough'); ?>"><i class="lucide lucide-strikethrough"></i></button>
        <button type="button" id="mobileBarLink" class="mobile-editor-bar-btn" data-action="add-link" title="<?php echo t_h('editor.toolbar.link'); ?>" aria-label="<?php echo t_h('editor.toolbar.link'); ?>"><i class="lucide lucide-link"></i></button>
        <button type="button" id="mobileBarColor" class="mobile-editor-bar-btn" data-action="toggle-red-color" title="<?php echo t_h('editor.toolbar.text_color'); ?>" aria-label="<?php echo t_h('editor.toolbar.text_color'); ?>"><i class="lucide lucide-palette"></i></button>
        <button type="button" id="mobileBarHighlight" class="mobile-editor-bar-btn" data-action="toggle-yellow-highlight" title="<?php echo t_h('editor.toolbar.highlight'); ?>" aria-label="<?php echo t_h('editor.toolbar.highlight'); ?>"><i class="lucide lucide-paintbrush"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarTitle" class="mobile-editor-bar-btn" data-action="change-font-size" title="<?php echo t_h('slash_menu.title', [], 'Title'); ?>" aria-label="<?php echo t_h('slash_menu.title', [], 'Title'); ?>"><i class="lucide lucide-type-height"></i></button>
        <button type="button" id="mobileBarAlign" class="mobile-editor-bar-btn" data-action="change-alignment" title="<?php echo t_h('slash_menu.align', [], 'Align'); ?>" aria-label="<?php echo t_h('slash_menu.align', [], 'Align'); ?>"><i class="lucide lucide-align-center"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarListUl" class="mobile-editor-bar-btn" data-action="exec-unordered-list" title="<?php echo t_h('editor.toolbar.bullet_list'); ?>" aria-label="<?php echo t_h('editor.toolbar.bullet_list'); ?>"><i class="lucide lucide-list-ul"></i></button>
        <button type="button" id="mobileBarListOl" class="mobile-editor-bar-btn" data-action="exec-ordered-list" title="<?php echo t_h('editor.toolbar.numbered_list'); ?>" aria-label="<?php echo t_h('editor.toolbar.numbered_list'); ?>"><i class="lucide lucide-list-ol"></i></button>
        <button type="button" id="mobileBarChecklist" class="mobile-editor-bar-btn" data-action="exec-task-list" title="<?php echo t_h('editor.toolbar.toggle_checklist', [], 'Toggle checklist'); ?>" aria-label="<?php echo t_h('editor.toolbar.toggle_checklist', [], 'Toggle checklist'); ?>"><i class="lucide lucide-list-check"></i></button>
        <button type="button" id="mobileBarOutdent" class="mobile-editor-bar-btn" data-mobile-bar-action="outdent" title="<?php echo t_h('mobile_editor_bar.outdent', [], 'Outdent'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.outdent', [], 'Outdent'); ?>"><i class="lucide lucide-indent-decrease"></i></button>
        <button type="button" id="mobileBarIndent" class="mobile-editor-bar-btn" data-mobile-bar-action="indent" title="<?php echo t_h('mobile_editor_bar.indent', [], 'Indent'); ?>" aria-label="<?php echo t_h('mobile_editor_bar.indent', [], 'Indent'); ?>"><i class="lucide lucide-indent-increase"></i></button>
        <span class="mobile-editor-bar-sep" aria-hidden="true"></span>
        <button type="button" id="mobileBarCodeBlock" class="mobile-editor-bar-btn" data-action="toggle-code-block" title="<?php echo t_h('editor.toolbar.code_block'); ?>" aria-label="<?php echo t_h('editor.toolbar.code_block'); ?>"><i class="lucide lucide-code"></i></button>
        <button type="button" id="mobileBarInlineCode" class="mobile-editor-bar-btn" data-action="toggle-inline-code" title="<?php echo t_h('editor.toolbar.inline_code'); ?>" aria-label="<?php echo t_h('editor.toolbar.inline_code'); ?>"><i class="lucide lucide-terminal"></i></button>
        <button type="button" id="mobileBarClearFormat" class="mobile-editor-bar-btn" data-action="exec-remove-format" title="<?php echo t_h('editor.toolbar.clear_formatting'); ?>" aria-label="<?php echo t_h('editor.toolbar.clear_formatting'); ?>"><i class="lucide lucide-eraser"></i></button>
        <button type="button" id="mobileBarSearchReplace" class="mobile-editor-bar-btn" data-action="open-search-replace-modal" data-mobile-bar-note-id title="<?php echo t_h('editor.toolbar.search_replace', [], 'Search and replace'); ?>" aria-label="<?php echo t_h('editor.toolbar.search_replace', [], 'Search and replace'); ?>"><i class="lucide lucide-search"></i></button>
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

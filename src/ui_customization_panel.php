<?php
/**
 * Contextual UI Customization panel: the "..." menu at the bottom-right of the
 * page (its "Customize this page" entry) opens a column docked on the right (same arrangement as the AI
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

/*
 * Keyboard shortcuts listed by the "..." menu's modal, grouped by where they
 * act. Each combination is a list of keys; "mod" is Ctrl (⌘ on macOS) and
 * "alt" Alt (⌥ on macOS), swapped by js/ui-customization-panel.js on open.
 * The handlers live in js/keyboard-shortcuts.js (general), js/events-rte-notes.js
 * plus build/markdown-editor/src/main.js (editor), js/checklist.js, js/slash-command.js,
 * js/emoji-autocomplete.js and js/tree-undo-clipboard.js (tree).
 */
$pzShortcutSettingHint = t_h('keyboard_shortcuts.setting_hint', [], 'Option to enable in Settings');
$pzShortcutGroups = [
    [
        'title' => t_h('keyboard_shortcuts.sections.general', [], 'General'),
        'items' => [
            ['keys' => [['mod', 'S']], 'label' => t_h('keyboard_shortcuts.save_note', [], 'Save the note'), 'hint' => $pzShortcutSettingHint],
            ['keys' => [['mod', 'alt', 'S']], 'label' => t_h('keyboard_shortcuts.snapshot', [], 'Take a snapshot of the note')],
            ['keys' => [['alt', '↑'], ['alt', '↓']], 'label' => t_h('keyboard_shortcuts.note_nav', [], 'Previous or next note in the folder'), 'hint' => $pzShortcutSettingHint],
            ['keys' => [['Esc']], 'label' => t_h('keyboard_shortcuts.close', [], 'Close a menu, panel or window')],
        ],
    ],
    [
        'title' => t_h('keyboard_shortcuts.sections.editor', [], 'Note editor'),
        'items' => [
            ['keys' => [['mod', 'B']], 'label' => t_h('keyboard_shortcuts.bold', [], 'Bold')],
            ['keys' => [['mod', 'I']], 'label' => t_h('keyboard_shortcuts.italic', [], 'Italic')],
            ['keys' => [['mod', 'U']], 'label' => t_h('keyboard_shortcuts.underline', [], 'Underline')],
            ['keys' => [['mod', 'Shift', 'S']], 'label' => t_h('keyboard_shortcuts.strikethrough', [], 'Strikethrough')],
            ['keys' => [['mod', 'K']], 'label' => t_h('keyboard_shortcuts.link', [], 'Insert a link')],
            ['keys' => [['mod', 'Shift', 'B']], 'label' => t_h('keyboard_shortcuts.code_block', [], 'Code block')],
            ['keys' => [['/']], 'label' => t_h('keyboard_shortcuts.slash_menu', [], 'Open the command menu'), 'hint' => t_h('keyboard_shortcuts.slash_menu_hint', [], 'Alt + / when the option is enabled in Settings')],
            ['keys' => [[':']], 'label' => t_h('keyboard_shortcuts.emoji', [], 'Insert an emoji by its name')],
            ['keys' => [['Tab'], ['Shift', 'Tab']], 'label' => t_h('keyboard_shortcuts.indent', [], 'Indent or outdent a list item')],
            ['keys' => [['mod', 'Enter']], 'label' => t_h('keyboard_shortcuts.checklist_toggle', [], 'Check or uncheck a checklist item')],
        ],
    ],
    [
        'title' => t_h('keyboard_shortcuts.sections.tree', [], 'Notes and folders tree'),
        'items' => [
            ['keys' => [['mod', 'Z']], 'label' => t_h('keyboard_shortcuts.tree_undo', [], 'Undo the last change')],
            ['keys' => [['mod', 'Shift', 'Z'], ['mod', 'Y']], 'label' => t_h('keyboard_shortcuts.tree_redo', [], 'Redo')],
            ['keys' => [['mod', 'C']], 'label' => t_h('keyboard_shortcuts.tree_copy', [], 'Copy the selected note or folder')],
            ['keys' => [['mod', 'X']], 'label' => t_h('keyboard_shortcuts.tree_cut', [], 'Cut the selected note or folder')],
            ['keys' => [['mod', 'V']], 'label' => t_h('keyboard_shortcuts.tree_paste', [], 'Paste')],
        ],
    ],
];
// Keys named by a word: translated (Maj, Entrée, Échap in French). "mod" and
// "alt" carry data-key so the macOS symbols can replace them.
$pzShortcutKeyLabels = [
    'mod' => 'Ctrl',
    'alt' => 'Alt',
    'Shift' => t_h('keyboard_shortcuts.keys.shift', [], 'Shift'),
    'Enter' => t_h('keyboard_shortcuts.keys.enter', [], 'Enter'),
    'Esc' => t_h('keyboard_shortcuts.keys.escape', [], 'Esc'),
    'Tab' => t_h('keyboard_shortcuts.keys.tab', [], 'Tab'),
];
$pzMoreMenuLabel = t_h('page_menu.button', [], 'More options');
require_once __DIR__ . '/markdown_syntax_content.php';
?>
    <!-- Floating stack at the bottom-right of the page: AI assistant, then
         the "..." menu (customize this page, keyboard shortcuts, Markdown
         syntax). On the notes page the note's scroll-to-edge arrows
         (note_display.php) sit under it, see css/ui-customization-panel.css. -->
    <div class="pz-edge-stack">
        <?php if ($uiCustomizationPanelAiChat): ?>
        <button type="button" id="edgeAiChatBtn" class="pz-edge-btn" data-action="toggle-ai-chat"
            title="<?php echo $uiCustomizationPanelAiLabel; ?>" aria-label="<?php echo $uiCustomizationPanelAiLabel; ?>">
            <i class="lucide lucide-bot"></i>
        </button>
        <?php endif; ?>
        <div class="pz-edge-menu-anchor">
            <button type="button" id="pageMoreMenuBtn" class="pz-edge-btn page-more-menu-btn" data-action="toggle-page-more-menu"
                aria-haspopup="true" aria-controls="pageMoreMenu" aria-expanded="false"
                title="<?php echo $pzMoreMenuLabel; ?>" aria-label="<?php echo $pzMoreMenuLabel; ?>">
                <i class="lucide lucide-more-horizontal"></i>
            </button>
            <div id="pageMoreMenu" class="page-more-menu" role="menu" hidden>
                <button type="button" class="page-more-menu-item" role="menuitem" data-action="toggle-ui-customization-panel">
                    <i class="lucide lucide-eye-off"></i>
                    <span><?php echo $uiCustomizationPanelTitle; ?></span>
                </button>
                <button type="button" id="edgeMenuShortcuts" class="page-more-menu-item" role="menuitem" data-action="open-keyboard-shortcuts" aria-controls="keyboardShortcutsModal">
                    <i class="lucide lucide-keyboard"></i>
                    <span><?php echo t_h('keyboard_shortcuts.menu_item', [], 'Keyboard shortcuts'); ?></span>
                </button>
                <button type="button" id="edgeMenuMarkdownSyntax" class="page-more-menu-item" role="menuitem" data-action="open-markdown-syntax" aria-controls="markdownSyntaxModal">
                    <i class="lucide lucide-book-open"></i>
                    <span><?php echo t_h('markdown_syntax.menu_item', [], 'Markdown syntax'); ?></span>
                </button>
            </div>
        </div>
    </div>
    <!-- KEYBOARD SHORTCUTS MODAL -->
    <!-- Help modals of the "..." menu: a title that stays in view over a body
         that scrolls (.pz-help-modal, css/ui-customization-panel.css) -->
    <div id="keyboardShortcutsModal" class="modal pz-help-modal" role="dialog" aria-modal="true" aria-labelledby="keyboardShortcutsTitle">
        <div class="modal-content pz-help-modal-content">
            <div class="pz-help-modal-header">
                <h3 id="keyboardShortcutsTitle"><?php echo t_h('keyboard_shortcuts.title', [], 'Keyboard shortcuts'); ?></h3>
                <button type="button" class="ui-custom-panel-header-btn" data-action="close-help-modal"
                    title="<?php echo t_h('common.close'); ?>" aria-label="<?php echo t_h('common.close'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
            <div class="pz-help-modal-body">
                <?php foreach ($pzShortcutGroups as $group): ?>
                <section class="keyboard-shortcuts-group">
                    <h4 class="keyboard-shortcuts-group-title"><?php echo $group['title']; ?></h4>
                    <ul class="keyboard-shortcuts-list">
                        <?php foreach ($group['items'] as $item): ?>
                        <li class="keyboard-shortcuts-item">
                            <span class="keyboard-shortcuts-label"><?php echo $item['label']; ?><?php if (!empty($item['hint'])): ?><span class="keyboard-shortcuts-hint"><?php echo $item['hint']; ?></span><?php endif; ?></span>
                            <span class="keyboard-shortcuts-keys">
                                <?php foreach ($item['keys'] as $comboIndex => $combo): ?>
                                <?php if ($comboIndex > 0): ?><span class="keyboard-shortcuts-or">/</span><?php endif; ?>
                                <span class="keyboard-shortcuts-combo"><?php
                                    foreach ($combo as $keyIndex => $key) {
                                        if ($keyIndex > 0) {
                                            echo '<span class="keyboard-shortcuts-plus">+</span>';
                                        }
                                        if ($key === 'mod' || $key === 'alt') {
                                            echo '<kbd data-key="' . $key . '">' . $pzShortcutKeyLabels[$key] . '</kbd>';
                                        } elseif (isset($pzShortcutKeyLabels[$key])) {
                                            echo '<kbd>' . $pzShortcutKeyLabels[$key] . '</kbd>';
                                        } else {
                                            echo '<kbd>' . htmlspecialchars($key, ENT_QUOTES, 'UTF-8') . '</kbd>';
                                        }
                                    }
                                ?></span>
                                <?php endforeach; ?>
                            </span>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </section>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
    <!-- MARKDOWN SYNTAX MODAL -->
    <div id="markdownSyntaxModal" class="modal pz-help-modal markdown-syntax-modal" role="dialog" aria-modal="true" aria-labelledby="markdownSyntaxTitle">
        <div class="modal-content pz-help-modal-content">
            <div class="pz-help-modal-header">
                <h3 id="markdownSyntaxTitle"><?php echo t_h('markdown_syntax.page_title', [], 'Markdown syntax'); ?></h3>
                <button type="button" class="ui-custom-panel-header-btn" data-action="close-help-modal"
                    title="<?php echo t_h('common.close'); ?>" aria-label="<?php echo t_h('common.close'); ?>">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>
            <div class="pz-help-modal-body">
<?php poznoteRenderMarkdownSyntaxContent(); ?>
            </div>
        </div>
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

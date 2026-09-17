<?php
/**
 * The icon colour palette: one .folder-color-option per swatch, the first one
 * clearing the colour. Shared by the folder/note icon modal
 * (modals/folder_icon_modal.php, driven by js/folder-icon.js) and the icon rail
 * colour modal (icon_sidebar.php, driven by js/icon-sidebar-colors.js), so both
 * offer exactly the same colours.
 *
 * The swatches come from lib/color-palette.php: data-color is the hex that gets
 * stored, the swatch itself is painted with the theme token.
 */
?>
            <div class="folder-color-picker">
                <div class="folder-color-option" data-color="" title="<?php echo t_h('modals.folder_icon.default_color', [], 'Default'); ?>">
                    <div class="folder-color-swatch folder-color-default"></div>
                </div>
<?php foreach (poznoteColorPalette() as $iconColorId => $iconColorEntry): ?>
                <div class="folder-color-option" data-color="<?php echo $iconColorEntry['hex']; ?>" title="<?php echo htmlspecialchars(poznoteColorPaletteName($iconColorId), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
                    <div class="folder-color-swatch" style="background-color: <?php echo poznoteIconColorCss($iconColorEntry['hex']); ?>;"></div>
                </div>
<?php endforeach; ?>
            </div>

<?php
/**
 * Width of the column of the speed dial and of the dashboard, set from the
 * slider of their "..." menu (ui_customization_panel.php, js/page-width.js):
 * a percentage of the room beside the icon rail, in the account settings
 * speed_dial_width and dashboard_width. Empty, the page keeps its own layout:
 * the speed dial's 1200px column, the dashboard's full width (until the
 * slider is first moved, the dashboard's 100 being stored as empty again).
 */

const POZNOTE_PAGE_WIDTH_MIN = 10;
const POZNOTE_PAGE_WIDTH_MAX = 100;

// Per page: the setting, the CSS variable the page reads on <body>, the
// column it sizes, and the width it has without a setting (null: a layout of
// its own, which no percentage matches).
const POZNOTE_PAGE_WIDTH_PAGES = [
    'speed-dial' => ['setting' => 'speed_dial_width', 'var' => '--speed-dial-width', 'column' => '.speed-dial-container', 'default' => null],
    'dashboard' => ['setting' => 'dashboard_width', 'var' => '--dashboard-width', 'column' => '.dashboard-container', 'default' => 100],
];

/** A stored width as a whole percentage, null for the page's own layout. */
function poznotePageWidth($value): ?int {
    $value = trim((string)$value);
    if ($value === '' || !ctype_digit($value)) {
        return null;
    }
    return max(POZNOTE_PAGE_WIDTH_MIN, min(POZNOTE_PAGE_WIDTH_MAX, (int)$value));
}

/** The stored width of a page of POZNOTE_PAGE_WIDTH_PAGES. */
function poznotePageWidthSetting(string $page): ?int {
    return poznotePageWidth(getSetting(POZNOTE_PAGE_WIDTH_PAGES[$page]['setting'], ''));
}

/** The declaration the page puts on <body>, empty without a setting. */
function poznotePageWidthStyle(string $page): string {
    $width = poznotePageWidthSetting($page);
    return $width === null ? '' : POZNOTE_PAGE_WIDTH_PAGES[$page]['var'] . ': ' . $width . '%';
}

/**
 * The slider itself (js/page-width.js): its name and its value, then the
 * range. No reset button, unlike the note's: the slider is the way back. In
 * the "..." menu of the speed dial (ui_customization_panel.php) and in a
 * popover of the dashboard's toolbar. $class adds the menu's entry classes
 * where it is one.
 */
function poznoteRenderPageWidthSlider(string $page, string $id, string $class = ''): void {
    $config = POZNOTE_PAGE_WIDTH_PAGES[$page];
    $value = poznotePageWidthSetting($page);
    ?>
    <div id="<?php echo $id; ?>" class="page-more-menu-slider<?php echo $class !== '' ? ' ' . $class : ''; ?>" role="group" aria-labelledby="<?php echo $id; ?>Label" data-page-width
        data-setting="<?php echo $config['setting']; ?>"
        data-css-var="<?php echo $config['var']; ?>"
        data-column="<?php echo $config['column']; ?>"
        data-value="<?php echo $value === null ? '' : $value; ?>"
        data-default-width="<?php echo $config['default'] === null ? '' : (int)$config['default']; ?>"
        data-label-default="<?php echo t_h('page_menu.width_default', [], 'Default'); ?>"
        data-label-full="<?php echo t_h('modals.note_width.full_width', [], 'Full Width'); ?>"
        data-txt-error="<?php echo t_h('page_menu.width_error', [], 'Could not save the width.'); ?>">
        <div class="page-more-menu-slider-head">
            <?php if ($class !== ''): ?><i class="lucide lucide-move-horizontal"></i><?php endif; ?>
            <span id="<?php echo $id; ?>Label" class="page-more-menu-label"><?php echo t_h('page_menu.page_width', [], 'Page width'); ?></span>
            <output class="page-more-menu-slider-value" for="<?php echo $id; ?>Input"></output>
        </div>
        <input type="range" id="<?php echo $id; ?>Input" class="page-more-menu-slider-input" min="<?php echo POZNOTE_PAGE_WIDTH_MIN; ?>" max="<?php echo POZNOTE_PAGE_WIDTH_MAX; ?>" step="5" value="100" aria-labelledby="<?php echo $id; ?>Label">
    </div>
    <?php
}

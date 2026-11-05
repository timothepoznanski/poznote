<?php
/**
 * Magnifier button of a folded search field (js/search-toggle.js,
 * css/components/search-toggle.css), as on graph.php: first on the row of
 * buttons, it unfolds the field whose wrapper id it names.
 *
 * @param string $controlsId Id of the field's wrapper (.pz-search-collapsible).
 * @param string $label      Plain text for the tooltip and the screen readers.
 * @param string $extraClass The page's own icon-button class, for its look.
 * @return string The button's HTML.
 */
function poznoteRenderSearchToggle(string $controlsId, string $label, string $extraClass = ''): string {
    $label = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');
    $class = trim('pz-search-toggle ' . $extraClass);
    return '<button type="button" class="' . htmlspecialchars($class, ENT_QUOTES, 'UTF-8') . '"'
        . ' aria-controls="' . htmlspecialchars($controlsId, ENT_QUOTES, 'UTF-8') . '" aria-expanded="false"'
        . ' title="' . $label . '" aria-label="' . $label . '">'
        . '<i class="lucide lucide-search"></i></button>';
}

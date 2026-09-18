<?php
/**
 * What an Excalidraw preview file may contain.
 *
 * The note shows a diagram through one <img> pointing at an attachment, and
 * that attachment is the SVG Excalidraw exported: crisp at any pixel density
 * (issue #1434). Two rules decide what lands on disk, and both are pure
 * string work, which is why they live here rather than in the endpoint.
 *
 * The first is a security rule. An SVG is a document, so it only stays inert
 * while it holds nothing that could run or reach outside itself.
 *
 * The second is a theme rule. Excalidraw bakes the look of the current theme
 * into an export, and a preview that carries one shows that theme forever,
 * whatever the note around it is painted in (issue #1445). The file stored
 * here carries none: the page paints the ground behind the preview and
 * inverts it in CSS, so a theme change reaches the diagram straight away.
 */

/**
 * Take whatever theme the client baked into the preview back out of it.
 *
 * Excalidraw writes the canvas colour as a <rect> covering the whole file, and
 * a dark theme as an invert filter on the root <svg> plus the counter filter
 * that keeps an embedded photo upright underneath it. Removing the two filters
 * together leaves every colour as it was authored, which is the light-mode
 * rendering and the one the page can invert for itself.
 *
 * A tab holding older cached JS still posts a baked SVG, so this is also what
 * upgrades an existing diagram on its next save.
 */
function poznoteStripExcalidrawPreviewTheme(string $svg): string
{
    // Both filters name invert(), which no other attribute of an exported
    // diagram does.
    $svg = (string) preg_replace('/\s+filter="invert\([^"]*"/i', '', $svg);
    // The background is the only <rect> in an exported diagram: element
    // rectangles are drawn as rough.js <path>s. Excalidraw appends it to the
    // root before the drawing, so the first match is the one.
    return (string) preg_replace(
        '/<rect x="0" y="0" width="[^"]*" height="[^"]*" fill="[^"]*"\s*\/>/i',
        '',
        $svg,
        1
    );
}

/**
 * The SVG is only ever displayed through <img>, where nothing in it can run,
 * and is served with the sandbox headers every SVG attachment gets. These
 * checks refuse what Excalidraw never produces (scripts, handlers, HTML
 * islands, references outside the file) so the file cannot be repurposed.
 */
function poznoteIsAcceptableExcalidrawPreviewSvg(string $svg): bool
{
    $trimmed = ltrim($svg);
    if (stripos($trimmed, '<svg') !== 0 && stripos($trimmed, '<?xml') !== 0) {
        return false;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = $finfo ? finfo_buffer($finfo, $svg) : false;
    if ($finfo) {
        finfo_close($finfo);
    }
    if ($mimeType !== 'image/svg+xml') {
        return false;
    }

    if (preg_match('/<\s*(script|foreignObject|iframe|embed|object)\b/i', $svg)) {
        return false;
    }
    // Event handler attributes. Text content is entity-escaped in the
    // serialized SVG, so a raw "<" only ever opens a real tag here.
    if (preg_match('/<[^>]*\son[a-z]+\s*=/i', $svg)) {
        return false;
    }
    // Excalidraw only references its embedded images (data:) and its own
    // <symbol> definitions (#).
    if (preg_match('/\b(?:xlink:)?href\s*=\s*["\'](?!data:image\/|#)/i', $svg)) {
        return false;
    }

    return true;
}

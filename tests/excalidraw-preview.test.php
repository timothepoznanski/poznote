<?php
lib('excalidraw-preview');

// Excalidraw's own export: the background rect, the dark-theme invert filter
// on the root <svg>, and the counter filter it puts on an embedded photo so
// the photo survives that inversion.
function excalidrawExport(array $parts = []): string
{
    $rootFilter = !empty($parts['dark']) ? ' filter="invert(93%) hue-rotate(180deg)"' : '';
    $imageFilter = !empty($parts['dark']) ? ' filter="invert(100%) hue-rotate(180deg) saturate(1.25)"' : '';
    $background = isset($parts['background'])
        ? '<rect x="0" y="0" width="580.5" height="227.9" fill="' . $parts['background'] . '"/>'
        : '';
    $image = !empty($parts['image'])
        ? '<symbol id="image-a"><image width="100%" height="100%" href="data:image/png;base64,AAAA"/></symbol>'
            . '<use href="#image-a"' . $imageFilter . ' width="10" height="10" opacity="1"/>'
        : '';

    return '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580.5 227.9"'
        . ' width="580.5" height="227.9"' . $rootFilter . '>'
        . $image
        . $background
        . '<g stroke-linecap="round"><path d="M1 2" stroke="#1e1e1e" fill="none"/></g>'
        . '</svg>';
}

test('a light export loses its background and nothing else', function () {
    $svg = poznoteStripExcalidrawPreviewTheme(excalidrawExport(['background' => '#ffffff']));
    assertNotContains('<rect', $svg);
    assertContains('stroke="#1e1e1e"', $svg);
    assertContains('viewBox="0 0 580.5 227.9"', $svg);
});

test('a dark export loses its background and both invert filters', function () {
    $svg = poznoteStripExcalidrawPreviewTheme(
        excalidrawExport(['dark' => true, 'background' => '#e9e9ea', 'image' => true])
    );
    assertNotContains('<rect', $svg);
    assertNotContains('filter=', $svg);
    // The photo and the drawing stay, with the colours Excalidraw authored.
    assertContains('href="data:image/png;base64,AAAA"', $svg);
    assertContains('stroke="#1e1e1e"', $svg);
});

test('a preview that carries no theme is left untouched', function () {
    $bare = excalidrawExport();
    assertSame($bare, poznoteStripExcalidrawPreviewTheme($bare));
});

test('only the first background-shaped rect goes', function () {
    // Element rectangles are rough.js <path>s, so a second one can only come
    // from note content that is not an Excalidraw export: leave it alone.
    $svg = '<svg xmlns="http://www.w3.org/2000/svg">'
        . '<rect x="0" y="0" width="5" height="5" fill="#ffffff"/>'
        . '<rect x="0" y="0" width="5" height="5" fill="#000000"/></svg>';
    $stripped = poznoteStripExcalidrawPreviewTheme($svg);
    assertSame(1, substr_count($stripped, '<rect'));
    assertContains('fill="#000000"', $stripped);
});

test('a stripped export is still a valid SVG to the validator', function () {
    foreach ([['background' => '#ffffff'], ['dark' => true, 'background' => '#f2f7ff', 'image' => true]] as $parts) {
        $svg = poznoteStripExcalidrawPreviewTheme(excalidrawExport($parts));
        assertTrue(poznoteIsAcceptableExcalidrawPreviewSvg($svg), 'stripped export rejected');
    }
});

test('the validator refuses what Excalidraw never exports', function () {
    assertFalse(poznoteIsAcceptableExcalidrawPreviewSvg('not an svg at all'));
    assertFalse(poznoteIsAcceptableExcalidrawPreviewSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    ));
    assertFalse(poznoteIsAcceptableExcalidrawPreviewSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="1" height="1"/></svg>'
    ));
    assertFalse(poznoteIsAcceptableExcalidrawPreviewSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>'
    ));
    assertFalse(poznoteIsAcceptableExcalidrawPreviewSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><b>x</b></foreignObject></svg>'
    ));
});

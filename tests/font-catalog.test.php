<?php
require_once dirname(__DIR__) . '/src/font_catalog.php';

// A custom font is several files that have to end up as one family with the
// right weight on each face (discussion #1562). For a WOFF2 file the only
// thing that says which face it is, is its name, and the three places fonts
// are downloaded from each name them their own way.

test('a Google Fonts static file name gives the family, the weight and the style', function () {
    assertSame(
        ['family' => 'Open Sans', 'weight' => 600, 'style' => 'italic', 'variable' => false],
        poznoteFontFaceFromFilename('OpenSans-SemiBoldItalic.ttf')
    );
    assertSame(400, poznoteFontFaceFromFilename('Roboto-Regular.ttf')['weight']);
    assertSame(200, poznoteFontFaceFromFilename('Roboto-ExtraLight.ttf')['weight']);
    assertSame(800, poznoteFontFaceFromFilename('Roboto-ExtraBold.ttf')['weight']);
    assertSame(900, poznoteFontFaceFromFilename('Roboto-Black.ttf')['weight']);
    assertSame('italic', poznoteFontFaceFromFilename('Roboto-Italic.ttf')['style']);
});

test('a Google Fonts variable file name is recognised, as stored after upload', function () {
    $face = poznoteFontFaceFromFilename('OpenSans-Italic-VariableFont_wdth_wght.ttf');
    assertSame('Open Sans', $face['family']);
    assertSame('italic', $face['style']);
    assertTrue($face['variable']);
    assertTrue(poznoteFontFaceFromFilename('Inter[opsz,wght].woff2')['variable']);
});

test('google-webfonts-helper and Fontsource names are read the same way', function () {
    assertSame(
        ['family' => 'Open Sans', 'weight' => 600, 'style' => 'italic', 'variable' => false],
        poznoteFontFaceFromFilename('open-sans-v40-latin_latin-ext-600italic.woff2')
    );
    assertSame(
        ['family' => 'Open Sans', 'weight' => 400, 'style' => 'normal', 'variable' => false],
        poznoteFontFaceFromFilename('open-sans-v40-latin-regular.woff2')
    );
    assertSame(
        ['family' => 'Open Sans', 'weight' => 400, 'style' => 'italic', 'variable' => false],
        poznoteFontFaceFromFilename('open-sans-latin-400-italic.woff2')
    );
    assertTrue(poznoteFontFaceFromFilename('open-sans-latin-wght-normal.woff2')['variable']);
    // "normal" is the style here, not a weight
    assertSame(700, poznoteFontFaceFromFilename('caveat-latin-700-normal.woff2')['weight']);
});

test('a name that is only a family keeps it whole', function () {
    assertSame('Bebas Neue', poznoteFontFaceFromFilename('BebasNeue.woff2')['family']);
    // A style word is only taken off the end, never out of the family.
    assertSame('Black Ops One', poznoteFontFaceFromFilename('Black-Ops-One-Regular.ttf')['family']);
    assertSame('Regular', poznoteFontFaceFromFilename('Regular.ttf')['family']);
});

test('every spelling of a family lands on the same id', function () {
    assertSame('custom:open-sans', poznoteCustomFontId('Open Sans'));
    assertSame('custom:open-sans', poznoteCustomFontId('open  sans'));
    assertSame('custom:font', poznoteCustomFontId('***'));
});

test('the faces of a family share out the scale, split at 600', function () {
    // Regular and bold: the bundled Inter is left no weight at all.
    assertSame([400 => [1, 599], 700 => [600, 1000]], poznoteFontWeightRanges([400 => 400, 700 => 700]));
    assertSame(
        [300 => [1, 350], 400 => [351, 450], 500 => [451, 599], 600 => [600, 650], 700 => [651, 1000]],
        poznoteFontWeightRanges([300 => 300, 400 => 400, 500 => 500, 600 => 600, 700 => 700])
    );
});

test('a family with no bold file never claims the bold weights', function () {
    // A range reaching 600 would stop the browser from emboldening anything.
    assertSame([400 => [1, 599]], poznoteFontWeightRanges([400 => 400]));
    assertSame([400 => [1, 450], 500 => [451, 599]], poznoteFontWeightRanges([400 => 400, 500 => 500]));
});

function fontCatalogTestFile(string $file, string $family, int $weight, string $style = 'normal', bool $variable = false, ?array $range = null): array
{
    return [
        'file' => $file, 'url' => '/data/fonts/' . $file . '?v=1', 'family' => $family,
        'weight' => $weight, 'style' => $style, 'variable' => $variable, 'range' => $range,
    ];
}

test('files are grouped into families, whatever the spelling of the family', function () {
    $catalog = poznoteBuildFontCatalog([
        fontCatalogTestFile('Lora-Regular.ttf', 'Lora', 400),
        fontCatalogTestFile('Lora-Bold.ttf', 'Lora', 700),
        fontCatalogTestFile('Lora-Italic.ttf', 'Lora', 400, 'italic'),
        fontCatalogTestFile('open-sans-v40-latin-regular.woff2', 'Open Sans', 400),
    ]);

    assertSame(['custom:lora', 'custom:open-sans'], array_column($catalog, 'id'));
    assertSame(
        [['normal', '1 599'], ['normal', '600 1000'], ['italic', '1 599']],
        array_map(function ($face) {
            return [$face['style'], $face['weight']];
        }, $catalog[0]['faces'])
    );
    assertSame('truetype', $catalog[0]['faces'][0]['format']);
    assertSame('woff2', $catalog[1]['faces'][0]['format']);
});

test('a variable font answers every weight and replaces the static files of its style', function () {
    $catalog = poznoteBuildFontCatalog([
        fontCatalogTestFile('Inter-Regular.ttf', 'Inter', 400),
        fontCatalogTestFile('Inter-VariableFont_wght.ttf', 'Inter', 400, 'normal', true, [100, 900]),
    ]);

    assertSame(1, count($catalog[0]['faces']));
    assertSame('Inter-VariableFont_wght.ttf', $catalog[0]['faces'][0]['file']);
    assertSame('1 1000', $catalog[0]['faces'][0]['weight']);
    assertSame('100-900', $catalog[0]['faces'][0]['label']);
    // Deleting the family removes both files.
    assertSame(2, count($catalog[0]['files']));
});

test('the same face in two formats is declared once, in the compact one', function () {
    $catalog = poznoteBuildFontCatalog([
        fontCatalogTestFile('Lora-Regular.ttf', 'Lora', 400),
        fontCatalogTestFile('lora-regular.woff2', 'Lora', 400),
    ]);
    assertSame(['lora-regular.woff2'], array_column($catalog[0]['faces'], 'file'));
});

test('a real TrueType file is read for its family, weight and style', function () {
    // The Inter SemiBold the app ships: its name table says "Inter 24pt",
    // which no file name could tell.
    $path = dirname(__DIR__) . '/src/public/webfonts/Inter/static/Inter_24pt-SemiBold.ttf';
    if (!is_file($path)) {
        return;
    }
    $face = poznoteFontFaceFromSfnt($path);
    assertTrue(is_array($face), 'the file is parsed');
    assertSame(600, $face['weight']);
    assertSame('normal', $face['style']);
    assertFalse($face['variable']);
    assertTrue(stripos($face['family'], 'Inter') === 0, 'family is ' . $face['family']);
});

test('a file that is not a TrueType font is left to its name', function () {
    assertSame(null, poznoteFontFaceFromSfnt(__FILE__));
});

test('the signature has to match the extension', function () {
    assertTrue(poznoteCustomFontSignatureMatches('woff2', 'wOF2'));
    assertTrue(poznoteCustomFontSignatureMatches('TTF', "\x00\x01\x00\x00"));
    assertTrue(poznoteCustomFontSignatureMatches('otf', 'OTTO'));
    assertFalse(poznoteCustomFontSignatureMatches('woff2', '<?ph'));
    assertFalse(poznoteCustomFontSignatureMatches('css', 'wOF2'));
});

test('only font file names are accepted', function () {
    assertTrue(poznoteCustomFontNameIsValid('Lora-Regular.ttf'));
    assertFalse(poznoteCustomFontNameIsValid('../Lora-Regular.ttf'));
    assertFalse(poznoteCustomFontNameIsValid('evil.php'));
    assertFalse(poznoteCustomFontNameIsValid('Lora Regular.ttf'));
});

test('a stored catalog is checked before it reaches a page', function () {
    $good = [
        'id' => 'custom:lora', 'name' => 'Lora',
        'faces' => [[
            'file' => 'Lora-Regular.ttf', 'url' => '/data/fonts/Lora-Regular.ttf?v=12', 'format' => 'truetype',
            'style' => 'normal', 'weight' => '1 599', 'label' => '400',
        ]],
        'files' => ['Lora-Regular.ttf'],
    ];
    $evil = $good;
    $evil['id'] = 'custom:evil';
    $evil['faces'][0]['url'] = "https://example.com/x.ttf') format('truetype'); } body { display: none } /*";

    assertSame([$good], poznoteNormalizeFontCatalog(json_encode([$good, $evil, 'nope'])));
    assertSame([], poznoteNormalizeFontCatalog('not json'));
    assertSame([], poznoteNormalizeFontCatalog(''));
});

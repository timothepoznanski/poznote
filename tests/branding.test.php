<?php
// The instance logo (discussion #1336, src/lib/branding.php). An admin uploads
// two PNG files drawn in the browser; every page then shows them instead of
// Poznote's mark, and goes back to it the moment either file is missing.

if (!defined('POZNOTE_BRANDING_DIR')) {
    define('POZNOTE_BRANDING_DIR', sys_get_temp_dir() . '/poznote-branding-test-' . getmypid());
}
lib('branding');

/** A real, minimal PNG of $width x $height pixels, written without GD. */
function brandingTestPng(int $width, int $height): string
{
    $chunk = static function (string $type, string $data): string {
        return pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
    };
    $rows = str_repeat("\0" . str_repeat("\0\0\0\0", $width), $height);
    return "\x89PNG\r\n\x1a\n"
        . $chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 6, 0, 0, 0))
        . $chunk('IDAT', (string)gzcompress($rows))
        . $chunk('IEND', '');
}

function brandingTestFile(string $name, string $bytes): string
{
    $path = sys_get_temp_dir() . '/poznote-branding-upload-' . getmypid() . '-' . $name;
    file_put_contents($path, $bytes);
    return $path;
}

function brandingTestReset(): void
{
    poznoteRemoveCustomLogo();
    @rmdir(POZNOTE_BRANDING_DIR);
    poznoteCustomLogoVersion(true);
}

function brandingTestStoreValid(): void
{
    $stored = poznoteStoreCustomLogo([
        512 => brandingTestFile('512.png', brandingTestPng(512, 512)),
        192 => brandingTestFile('192.png', brandingTestPng(192, 192)),
    ]);
    assertTrue($stored, 'a valid pair is stored');
}

test('without a custom logo every page keeps Poznote\'s own icons and mark', function () {
    brandingTestReset();
    assertFalse(poznoteHasCustomLogo());
    assertSame(
        '<link rel="icon" href="../favicon.ico" sizes="512x512" type="image/png">' . "\n"
        . '<link rel="icon" href="../favicon.svg" type="image/svg+xml">' . "\n"
        . '<link rel="apple-touch-icon" href="../pwa/poznote.png?v=6.1">' . "\n",
        poznoteBrandIconTags('../', '6.1')
    );
    assertSame('<span class="poznote-logo" aria-hidden="true"></span>', poznoteLogoMark());
    assertSame('pwa/manifest.webmanifest?v=1', poznoteManifestHref('pwa/manifest.webmanifest?v=1'));
    assertSame('pwa/poznote-192.png', poznoteNotificationIconPath());
    $manifest = ['name' => 'Poznote', 'icons' => [['src' => './poznote-192.png']]];
    assertSame($manifest, poznoteManifestWithCustomLogo($manifest));
});

test('a stored logo replaces the icons, the mark and the manifest icons, never the name', function () {
    brandingTestReset();
    brandingTestStoreValid();
    $version = poznoteCustomLogoVersion();
    assertTrue($version !== '', 'a version for the ?v= of the URLs');

    $tags = poznoteBrandIconTags('../');
    assertContains('href="../data/branding/logo-512.png?v=' . $version . '" sizes="512x512"', $tags);
    assertContains('href="../data/branding/logo-192.png?v=' . $version . '" sizes="192x192"', $tags);
    assertNotContains('favicon', $tags, 'Poznote\'s icons are not offered next to it');

    $mark = poznoteLogoMark('logo-favicon', 'My "notes"');
    assertContains('class="poznote-logo logo-favicon poznote-logo-custom"', $mark);
    assertContains('aria-label="My &quot;notes&quot;"', $mark, 'the label is escaped');
    assertContains('background-image: url(&quot;data/branding/logo-512.png?v=', $mark);

    assertSame('pwa/manifest.php?v=' . $version, poznoteManifestHref('pwa/manifest.webmanifest'));
    $manifest = poznoteManifestWithCustomLogo(['name' => 'Poznote', 'short_name' => 'Poznote', 'icons' => []]);
    assertSame('Poznote', $manifest['name']);
    assertSame('Poznote', $manifest['short_name']);
    assertSame('../data/branding/logo-192.png?v=' . $version, $manifest['icons'][0]['src']);
    assertSame('512x512', $manifest['icons'][1]['sizes']);
    assertSame('data/branding/logo-192.png?v=' . $version, poznoteNotificationIconPath());
});

test('a logo with one of its two files missing counts as no logo', function () {
    brandingTestReset();
    brandingTestStoreValid();
    unlink(poznoteLogoPath(192));
    poznoteCustomLogoVersion(true);
    assertFalse(poznoteHasCustomLogo());
    assertContains('favicon.svg', poznoteBrandIconTags());
});

test('only a real PNG of the exact size is accepted', function () {
    assertTrue(poznoteLogoFileIsValid(brandingTestFile('ok.png', brandingTestPng(192, 192)), 192));
    assertFalse(poznoteLogoFileIsValid(brandingTestFile('small.png', brandingTestPng(192, 192)), 512), 'wrong size');
    assertFalse(poznoteLogoFileIsValid(brandingTestFile('wide.png', brandingTestPng(512, 256)), 512), 'not square');
    assertFalse(poznoteLogoFileIsValid(brandingTestFile('ok2.png', brandingTestPng(64, 64)), 64), 'a size that is not stored');
    assertFalse(poznoteLogoFileIsValid(brandingTestFile('fake.png', "\x89PNG\r\n\x1a\n<?php echo 1;"), 192), 'a PNG signature alone');
    assertFalse(poznoteLogoFileIsValid(brandingTestFile('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'), 192), 'SVG is drawn in the browser, never stored');
    assertFalse(poznoteLogoFileIsValid(sys_get_temp_dir() . '/poznote-branding-missing.png', 192));
});

test('a refused file leaves the current logo untouched', function () {
    brandingTestReset();
    brandingTestStoreValid();
    $before = poznoteCustomLogoVersion();
    $stored = poznoteStoreCustomLogo([
        512 => brandingTestFile('bad.png', brandingTestPng(256, 256)),
        192 => brandingTestFile('192b.png', brandingTestPng(192, 192)),
    ]);
    assertFalse($stored);
    assertSame($before, poznoteCustomLogoVersion(true));
    assertFalse(is_file(poznoteLogoPath(512) . '.tmp'), 'no temporary file left behind');
});

test('removing the logo brings Poznote\'s back', function () {
    brandingTestReset();
    brandingTestStoreValid();
    assertTrue(poznoteRemoveCustomLogo());
    assertFalse(poznoteHasCustomLogo());
    assertSame('<span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>', poznoteLogoMark('offline-logo', 'Poznote'));
    brandingTestReset();
    foreach (glob(sys_get_temp_dir() . '/poznote-branding-upload-' . getmypid() . '-*') ?: [] as $file) {
        @unlink($file);
    }
});

<?php
lib('ui-customization');

// A key in poznoteGetDefaultHiddenUiKeys() is written into every account's
// hidden set by the schema bootstrap, so if nobody turned it into a CSS rule
// the element stays visible and the account carries a preference that does
// nothing — a default that silently does not apply, with no error anywhere.
test('every default-hidden key actually hides something', function () {
    foreach (poznoteGetDefaultHiddenUiKeys() as $key) {
        $rules = poznoteBuildUiCustomizationRules([$key]);
        if (trim($rules) === '') {
            fail("'{$key}' is hidden by default but poznoteBuildUiCustomizationRules() emits nothing for it");
        }
    }
});

// js/ui-customization.js builds the same rules again, to re-apply them without
// a reload when the contextual panel saves. The PHP copy runs in <head> so the
// page paints hidden from the first frame; a key added to one copy only either
// flashes visible on load or stops hiding the moment the panel is touched.
test('the JS runtime knows every default-hidden key too', function () {
    $js = file_get_contents(dirname(__DIR__) . '/src/public/js/ui-customization.js');

    foreach (poznoteGetDefaultHiddenUiKeys() as $key) {
        foreach (explode("\n", poznoteBuildUiCustomizationRules([$key])) as $rule) {
            $selector = trim(strstr($rule, '{', true));
            if ($selector === '') {
                continue;
            }
            assertContains($selector, $js);
        }
    }
});

// The bin button of a code block in the markdown preview (issue #1406). Its two
// neighbours are absolutely positioned at fixed offsets, so hiding it without
// moving them leaves a 32px hole at the right edge of every code block.
test('hiding the preview bin button closes the gap it leaves', function () {
    $rules = poznoteBuildUiCustomizationRules(['panel:preview-code-block-delete']);
    assertContains('.markdown-preview .code-block-delete-btn { display: none !important; }', $rules);
    assertContains('.markdown-preview .code-block-copy-btn { right: 8px !important; }', $rules);
    assertContains('.markdown-preview .code-block-line-numbers-btn { right: 40px !important; }', $rules);
});

// The preference stores hidden keys only, so a key that is non-hideable can
// never be the thing a default-hidden key names: it would be stripped straight
// back out of the account's set on read.
test('a default-hidden key is not also listed as non-hideable', function () {
    $nonHideable = poznoteGetNonHideableUiKeys();
    foreach (poznoteGetDefaultHiddenUiKeys() as $key) {
        if (isset($nonHideable[$key])) {
            fail("'{$key}' is hidden by default and non-hideable at the same time");
        }
    }
});

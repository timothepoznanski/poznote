<?php
lib('i18n');

// This file exists because of a bug I shipped: rewriting a path dropped a
// trailing slash, loadI18nDictionary() started reading a file that does not
// exist, and every page kept answering HTTP 200 with no translations at all.
// A status-code sweep cannot see that. A count can.

test('every shipped language loads a non-empty dictionary', function () {
    foreach (poznoteSupportedLanguages() as $lang) {
        $dict = loadI18nDictionary($lang);
        if (count($dict) < 20) {
            fail("dictionary for '{$lang}' has " . count($dict) . ' entries, expected a real one');
        }
    }
});

test('an unknown language yields an empty dictionary rather than an error', function () {
    assertSame([], loadI18nDictionary('klingon'));
});

test('language codes are normalised, and unknown ones refused', function () {
    assertSame('fr', poznoteNormalizeLanguageCode('FR'));
    assertSame('zh-cn', poznoteNormalizeLanguageCode('zh-cn'));
    assertSame(null, poznoteNormalizeLanguageCode('klingon'));
});

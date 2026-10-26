<?php
lib('i18n', 'datetime', 'diary', 'note-titles');

function japaneseI18nLeaves(array $dictionary, string $prefix = ''): array {
    $leaves = [];
    foreach ($dictionary as $key => $value) {
        $path = $prefix === '' ? $key : $prefix . '.' . $key;
        if (is_array($value)) {
            $leaves += japaneseI18nLeaves($value, $path);
        } else {
            $leaves[$path] = $value;
        }
    }
    return $leaves;
}

// A key missing from ja.json falls back to English at runtime, so a new English
// string does not have to wait for its Japanese translation. Only stale keys fail.
test('Japanese has no key unknown to English and preserves runtime placeholders and HTML', function () {
    $english = japaneseI18nLeaves(loadI18nDictionary('en'));
    $japanese = japaneseI18nLeaves(loadI18nDictionary('ja'));
    assertSame([], array_values(array_diff(array_keys($japanese), array_keys($english))), 'keys unknown to English');
    foreach ($japanese as $key => $translated) {
        $source = $english[$key];
        assertTrue(is_string($translated) && trim($translated) !== '' || $key === 'common.at', $key);
        foreach (['/\{\{[^}]+\}\}/', '/<[^>]+>/', '/<code>.*?<\/code>/s'] as $pattern) {
            preg_match_all($pattern, $source, $original);
            preg_match_all($pattern, $translated, $localized);
            sort($original[0]);
            sort($localized[0]);
            assertSame($original[0], $localized[0], $key);
        }
        assertFalse((bool) preg_match('/<a\b[^>]*>\s*<\/a>/i', $translated), $key . ' has an empty link label');
    }
});

test('Japanese browsers and explicit Japanese settings select the Japanese dictionary', function () {
    assertSame('ja', poznoteNormalizeLanguageCode('JA'));
    assertSame('ja', poznoteDetectBrowserLanguage('ja-JP,ja;q=0.9,en;q=0.8', poznoteSupportedLanguages()));
    assertSame('en', poznoteDetectBrowserLanguage('en;q=1,ja;q=0.7', poznoteSupportedLanguages()));
    assertSame('エラー：接続失敗', t('folders.errors.generic_prefix', ['error' => '接続失敗'], null, 'ja'));
});

test('Japanese long dates use Japanese names and year-month-day order', function () {
    $date = new DateTime('2026-09-05 14:07:00');
    $long = getDateTimeFormatPatterns()['long'];
    assertSame('2026年9月5日 土曜日 14:07', applyDateNameTokens($date->format($long), $date, 'ja'));
    $custom = customDateTimePatternToPhpFormat('ddd DD MMM YYYY');
    assertSame('土 05 9月 2026', applyDateNameTokens($date->format($custom), $date, 'ja'));
});

test('a Japanese long diary title gives its day back', function () {
    assertSame('2026-09-05', parseDiaryLongDateTitle('2026年9月5日 土曜日'));
});

test('Japanese messages preserve webhook field paths', function () {
    foreach (['webhooks_user.app_url_unset', 'webhooks_user.app_url_unset_admin', 'webhooks_admin.hints.app_url_unset', 'webhooks_admin.app_url_description'] as $key) {
        assertContains('data.note.url', t($key, [], null, 'ja'), $key);
    }
});

// The numbered title keeps the " (n)" suffix of every language: with full-width
// brackets the note would no longer be recognized as untitled.
test('the numbered Japanese default title is still a default title', function () {
    $match = matchDefaultNoteTitle(t('index.note.new_note_numbered', ['number' => 3], null, 'ja'));
    assertSame('新規ノート', $match['title'] ?? null);
    assertSame('3', $match['number'] ?? null);
});

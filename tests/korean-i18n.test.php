<?php
lib('i18n', 'datetime');

function koreanI18nLeaves(array $dictionary, string $prefix = ''): array {
    $leaves = [];
    foreach ($dictionary as $key => $value) {
        $path = $prefix === '' ? $key : $prefix . '.' . $key;
        if (is_array($value)) {
            $leaves += koreanI18nLeaves($value, $path);
        } else {
            $leaves[$path] = $value;
        }
    }
    return $leaves;
}

// A key missing from ko.json falls back to English at runtime, so a new English
// string does not have to wait for its Korean translation. Only stale keys fail.
test('Korean has no key unknown to English and preserves runtime placeholders and HTML', function () {
    $english = koreanI18nLeaves(loadI18nDictionary('en'));
    $korean = koreanI18nLeaves(loadI18nDictionary('ko'));
    assertSame([], array_values(array_diff(array_keys($korean), array_keys($english))), 'keys unknown to English');
    foreach ($korean as $key => $translated) {
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
        assertNotContains('ZXQ', $translated, $key);
        assertNotContains('QJX', $translated, $key);
    }
});

test('Korean browsers and explicit Korean settings select the Korean dictionary', function () {
    assertSame('ko', poznoteNormalizeLanguageCode('KO'));
    assertSame('ko', poznoteDetectBrowserLanguage('ko-KR,ko;q=0.9,en;q=0.8', poznoteSupportedLanguages()));
    assertSame('en', poznoteDetectBrowserLanguage('en;q=1,ko;q=0.7', poznoteSupportedLanguages()));
    assertSame('오류: 연결 실패', t('workspaces.alerts.error_prefix', ['error' => '연결 실패'], null, 'ko'));
});

test('Korean long dates use Korean names and year-month-day order', function () {
    $date = new DateTime('2026-09-05 14:07:00');
    $long = getDateTimeFormatPatterns()['long'];
    assertSame('2026년 9월 5일 토요일 14:07', applyDateNameTokens($date->format($long), $date, 'ko'));
    $custom = customDateTimePatternToPhpFormat('ddd DD MMM YYYY');
    assertSame('토 05 9월 2026', applyDateNameTokens($date->format($custom), $date, 'ko'));
});

test('Korean messages preserve webhook field paths and interpolate new errors', function () {
    foreach (['webhooks_user.app_url_unset', 'webhooks_user.app_url_unset_admin', 'webhooks_admin.hints.app_url_unset', 'webhooks_admin.app_url_description'] as $key) {
        assertContains('data.note.url', t($key, [], null, 'ko'), $key);
    }
    assertSame('공개 폴더 링크를 만들지 못했습니다: 연결 실패', t('share_errors.public_folder_create_error', ['error' => '연결 실패'], null, 'ko'));
    assertSame('모두 바꾸기', t('search_replace.replace_all', [], 'All', 'ko'));
});

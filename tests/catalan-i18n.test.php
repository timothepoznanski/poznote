<?php
lib('i18n', 'datetime', 'diary', 'note-titles');

function catalanI18nLeaves(array $dictionary, string $prefix = ''): array {
    $leaves = [];
    foreach ($dictionary as $key => $value) {
        $path = $prefix === '' ? $key : $prefix . '.' . $key;
        if (is_array($value)) {
            $leaves += catalanI18nLeaves($value, $path);
        } else {
            $leaves[$path] = $value;
        }
    }
    return $leaves;
}

// A key missing from ca.json falls back to English at runtime, so a new English
// string does not have to wait for its Catalan translation. Only stale keys fail.
test('Catalan has no key unknown to English and preserves runtime placeholders and HTML', function () {
    $english = catalanI18nLeaves(loadI18nDictionary('en'));
    $catalan = catalanI18nLeaves(loadI18nDictionary('ca'));
    assertSame([], array_values(array_diff(array_keys($catalan), array_keys($english))), 'keys unknown to English');
    foreach ($catalan as $key => $translated) {
        $source = $english[$key];
        assertTrue(is_string($translated) && trim($translated) !== '', $key);
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

test('Catalan browsers and explicit Catalan settings select the Catalan dictionary', function () {
    assertSame('ca', poznoteNormalizeLanguageCode('CA'));
    assertSame('ca', poznoteDetectBrowserLanguage('ca-ES,ca;q=0.9,es;q=0.8,en;q=0.7', poznoteSupportedLanguages()));
    assertSame('ca', poznoteDetectBrowserLanguage('ca-ES-valencia', poznoteSupportedLanguages()));
    assertSame('ca', poznoteDetectBrowserLanguage('ca-AD', poznoteSupportedLanguages()));
    assertSame('es', poznoteDetectBrowserLanguage('es-ES,ca;q=0.5', poznoteSupportedLanguages()));
    assertSame('Error: connexió fallida', t('folders.errors.generic_prefix', ['error' => 'connexió fallida'], null, 'ca'));
    assertSame('Català', t('settings.language.catalan', [], null, 'ca'));
});

test('Catalan long dates elide the month preposition, bare month names stay bare', function () {
    $long = getDateTimeFormatPatterns()['long'];
    $september = new DateTime('2026-09-05 14:07:00');
    $october = new DateTime('2026-10-10 09:30:00');
    assertSame('Dissabte, 5 de setembre de 2026 14:07', applyDateNameTokens($september->format($long), $september, 'ca'));
    assertSame("Dissabte, 10 d'octubre de 2026 09:30", applyDateNameTokens($october->format($long), $october, 'ca'));

    $custom = customDateTimePatternToPhpFormat('D MMMM YYYY');
    assertSame('10 octubre 2026', applyDateNameTokens($october->format($custom), $october, 'ca'));
    $short = customDateTimePatternToPhpFormat('ddd DD MMM YYYY');
    assertSame('Ds. 05 set. 2026', applyDateNameTokens($september->format($short), $september, 'ca'));
});

test('Catalan long diary titles give their day back, elided or not', function () {
    assertSame('2026-10-10', parseDiaryLongDateTitle("Dissabte, 10 d'octubre de 2026"));
    assertSame('2026-09-05', parseDiaryLongDateTitle('Dissabte, 5 de setembre de 2026'));
    assertSame('2026-04-01', parseDiaryLongDateTitle("dimecres, 1 d'abril de 2026"));
    $day = new DateTime('2026-01-01');
    for ($i = 0; $i < 365; $i++) {
        assertSame($day->format('Y-m-d'), parseDiaryLongDateTitle(formatLongDate($day, 'ca')), $day->format('Y-m-d'));
        $day->modify('+1 day');
    }
});

test('the months_in_date list only changes the languages that define it', function () {
    $date = new DateTime('2026-09-05 14:07:00');
    $long = getDateTimeFormatPatterns()['long'];
    assertSame('Sábado, 5 de septiembre de 2026 14:07', applyDateNameTokens($date->format($long), $date, 'es'));
    assertSame('Samedi 5 septembre 2026 14:07', applyDateNameTokens($date->format($long), $date, 'fr'));
    assertSame(12, count(getDateNameLocales()['ca']['months_in_date']));
});

test('Catalan messages preserve webhook field paths', function () {
    foreach (['webhooks_user.app_url_unset', 'webhooks_user.app_url_unset_admin', 'webhooks_admin.hints.app_url_unset', 'webhooks_admin.app_url_description'] as $key) {
        assertContains('data.note.url', t($key, [], null, 'ca'), $key);
    }
});

test('the numbered Catalan default title is still a default title', function () {
    $match = matchDefaultNoteTitle(t('index.note.new_note_numbered', ['number' => 3], null, 'ca'));
    assertSame('Nota nova', $match['title'] ?? null);
    assertSame('3', $match['number'] ?? null);
});

// getDiaryRootFolderName() finds an existing diary by its localized default
// name, so a user who switches language keeps their diary. Every language's
// diary.folder_name must therefore be in its candidate list.
test('every language diary folder name is a diary root candidate', function () {
    $source = file_get_contents(dirname(__DIR__) . '/src/lib/diary.php');
    assertTrue((bool) preg_match("/\\[\\s*'Diary',[^\\]]*\\]/u", $source, $list), 'candidate list found');
    foreach (poznoteSupportedLanguages() as $language) {
        $name = t('diary.folder_name', [], null, $language);
        assertContains("'" . $name . "'", $list[0], $language . ' diary folder name');
    }
});

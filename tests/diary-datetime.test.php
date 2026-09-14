<?php
lib('diary', 'datetime');

test('a display pattern compiles to a PHP date format', function () {
    assertSame('Y-m-d', customDateTimePatternToPhpFormat('YYYY-MM-DD'));
    assertSame('d/m/Y H:i', customDateTimePatternToPhpFormat('DD/MM/YYYY HH:mm'));
});

test('month names map to their number', function () {
    assertSame(1, diaryMonthNameToNumber('January'));
    assertSame(12, diaryMonthNameToNumber('December'));
});

test('a custom diary format compiles to a pattern and a matching regex', function () {
    $spec = compileDiaryDateCustomFormat('DD/MM/YYYY');
    assertSame('d/m/Y', $spec['pattern']);
    assertTrue((bool) preg_match($spec['regex'], '08/09/2026'), 'the regex must match a date it formats');
    assertFalse((bool) preg_match($spec['regex'], 'pas une date'));
});

test('the long diary format is written in each language and parsed back in any', function () {
    $expected = [
        'en'    => 'Saturday, September 12, 2026',
        'fr'    => 'Samedi 12 septembre 2026',
        'de'    => 'Samstag, 12. September 2026',
        'es'    => 'Sábado, 12 de septiembre de 2026',
        'pt'    => 'Sábado, 12 de setembro de 2026',
        'ru'    => 'Суббота, 12 сентября 2026 г.',
        'zh-cn' => '2026年9月12日星期六',
    ];
    $day = new DateTime('2026-09-12');
    foreach ($expected as $lang => $title) {
        assertSame($title, formatLongDate($day, $lang));
        assertSame('2026-09-12', parseDiaryLongDateTitle($title), $lang . ' must parse back');
    }
    assertSame('Lundi 5 janvier 2026', formatLongDate(new DateTime('2026-01-05'), 'fr'));
    assertSame('Monday, January 5, 2026', formatLongDate(new DateTime('2026-01-05'), 'it'));
    assertSame('2026-01-05', parseDiaryLongDateTitle('lundi 5 JANVIER 2026'));
    assertSame(null, parseDiaryLongDateTitle('Samedi 31 février 2026'));
    assertSame(null, parseDiaryLongDateTitle('Réunion 12 septembre 2026'));
    assertSame('2026-09-12', parseDiaryEntryTitle('Samstag, 12. September 2026'));
});

test('custom name tokens are written in the user language and parsed back in any', function () {
    $spec = compileDiaryDateCustomFormat('dddd D MMMM YYYY');
    $day = new DateTime('2026-09-05');
    assertSame('Samedi 5 septembre 2026', formatDiaryDateWithSpec($day, $spec, 'fr'));
    assertSame('Saturday 5 September 2026', formatDiaryDateWithSpec($day, $spec, 'en'));
    assertSame('Суббота 5 сентября 2026', formatDiaryDateWithSpec($day, $spec, 'ru'));
    foreach (['fr', 'en', 'de', 'es', 'pt', 'ru', 'zh-cn'] as $lang) {
        $title = formatDiaryDateWithSpec($day, $spec, $lang);
        assertTrue((bool) preg_match($spec['regex'], $title, $m), $lang . ' title must match its regex');
        assertSame(9, diaryMonthNameToNumber($m['mn']), $lang);
    }
    assertTrue((bool) preg_match($spec['regex'], 'samedi 5 SEPTEMBRE 2026'), 'names ignore case');
    assertFalse((bool) preg_match($spec['regex'], 'Réunion 5 septembre 2026'), 'the weekday must be a day name');

    $short = compileDiaryDateCustomFormat('DD MMM YYYY');
    assertSame('05 sept. 2026', formatDiaryDateWithSpec($day, $short, 'fr'));
    assertTrue((bool) preg_match($short['regex'], '05 sept. 2026', $m));
    assertSame(9, diaryMonthNameToNumber($m['ms']));

    assertSame(null, compileDiaryDateCustomFormat('D DD MM YYYY'), 'D and DD are the same part');
    assertSame(null, compileDiaryDateCustomFormat('dddd MM YYYY'), 'the weekday is not a day');
    assertSame('d/m/Y', compileDiaryDateCustomFormat('DD/MM/YYYY')['pattern']);
});

test('month names of every language map to one number each', function () {
    $seen = [];
    foreach (getDateNameLocales() as $lang => $locale) {
        foreach (['months', 'short'] as $kind) {
            foreach ($locale[$kind] as $index => $name) {
                $key = mb_strtolower($name);
                if (isset($seen[$key])) assertSame($seen[$key], $index + 1, $lang . ' ' . $name);
                $seen[$key] = $index + 1;
            }
        }
    }
    assertSame(9, diaryMonthNameToNumber('Sep'));
    assertSame(8, diaryMonthNameToNumber('août'));
});

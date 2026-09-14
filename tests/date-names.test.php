<?php
lib('datetime', 'i18n');

test('every shipped language has day and month names', function () {
    $locales = getDateNameLocales();
    foreach (poznoteSupportedLanguages() as $lang) {
        assertTrue(isset($locales[$lang]), "no date names for '{$lang}'");
        assertSame(7, count($locales[$lang]['days']), $lang);
        assertSame(12, count($locales[$lang]['months']), $lang);
        assertSame(12, count($locales[$lang]['short']), $lang);
    }
});

test('js/date-time-format.js carries the same names as the PHP table', function () {
    $js = file_get_contents(dirname(__DIR__) . '/src/public/js/date-time-format.js');
    assertTrue((bool) preg_match('#/\* date-names:start \*/(.*?)/\* date-names:end \*/#s', $js, $m), 'markers not found');
    assertSame(getDateNameLocales(), json_decode($m[1], true));
});

test('date & time name tokens and the long format use the given language', function () {
    $date = new DateTime('2026-09-05 14:07:00');
    $format = customDateTimePatternToPhpFormat('dddd D MMMM YYYY, HH:mm');
    assertSame('Samedi 5 septembre 2026, 14:07', applyDateNameTokens($date->format($format), $date, 'fr'));
    assertSame('Saturday 5 September 2026, 14:07', applyDateNameTokens($date->format($format), $date, 'en'));
    assertSame('05 Sep 2026', applyDateNameTokens($date->format(customDateTimePatternToPhpFormat('DD MMM YYYY')), $date, 'en'));

    $long = getDateTimeFormatPatterns()['long'];
    assertSame('Samstag, 5. September 2026 14:07', applyDateNameTokens($date->format($long), $date, 'de'));
    assertSame('2026年9月5日星期六 14:07', applyDateNameTokens($date->format($long), $date, 'zh-cn'));

    // Built-in patterns carry no placeholder and come back untouched
    assertSame('2026-09-05 14:07', applyDateNameTokens($date->format('Y-m-d H:i'), $date, 'fr'));
    assertSame('d/m/Y H:i', customDateTimePatternToPhpFormat('DD/MM/YYYY HH:mm'));
});

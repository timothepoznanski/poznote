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

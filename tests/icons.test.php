<?php
lib('icons');

test('Font Awesome class names are translated to Lucide', function () {
    assertSame('lucide-star', convertFontAwesomeToLucide('fa-star'));
    assertContains('lucide-', convertFontAwesomeToLucide('fa-solid fa-star'));
});

test('a name that is already Lucide is left alone', function () {
    assertSame('lucide-star', convertFontAwesomeToLucide('lucide-star'));
});

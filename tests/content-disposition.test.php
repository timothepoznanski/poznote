<?php
lib('content-disposition');

// #1653: a raw UTF-8 name in filename="" was shown garbled by the browser's
// PDF viewer. The real name travels in filename*, an ASCII one in filename.

test('a Korean name goes in filename* with an ASCII fallback', function () {
    assertSame(
        "inline; filename=\"download.pdf\"; filename*=UTF-8''%ED%95%9C%EA%B8%80.pdf",
        poznoteContentDisposition('inline', '한글.pdf')
    );
});

test('mixed names keep their ASCII parts in the fallback', function () {
    assertSame(
        "attachment; filename=\"report _ 2026.pdf\"; filename*=UTF-8''report%20%ED%95%9C%EA%B8%80%202026.pdf",
        poznoteContentDisposition('attachment', 'report 한글 2026.pdf')
    );
    assertSame(
        "attachment; filename=\"r_sum_.docx\"; filename*=UTF-8''r%C3%A9sum%C3%A9.docx",
        poznoteContentDisposition('attachment', 'résumé.docx')
    );
});

test('a plain ASCII name is sent once, as before', function () {
    assertSame('inline; filename="my file.pdf"', poznoteContentDisposition('inline', 'my file.pdf'));
    assertSame('attachment; filename="notes.tar.gz"', poznoteContentDisposition('attachment', 'notes.tar.gz'));
});

test('quotes, backslashes and line breaks never reach the header', function () {
    $value = poznoteContentDisposition('attachment', "a\"b\r\nSet-Cookie: x.pdf");
    assertFalse(strpbrk($value, "\r\n") !== false, 'no line break');
    assertSame('attachment; filename="abSet-Cookie: x.pdf"', $value);

    // A backslash is a separator, so only the last segment is kept
    assertSame('attachment; filename="b.txt"', poznoteContentDisposition('attachment', 'a\\b.txt'));
    assertSame('attachment; filename="passwd"', poznoteContentDisposition('attachment', '../../etc/passwd'));
});

test('the disposition type is only ever inline or attachment', function () {
    assertSame('attachment; filename="x.pdf"', poznoteContentDisposition("inline\r\nX: y", 'x.pdf'));
});

test('an empty or unusable name falls back', function () {
    assertSame('attachment; filename="download"', poznoteContentDisposition('attachment', ''));
    assertSame('attachment; filename="folder"', poznoteContentDisposition('attachment', '"""', 'folder'));
    // A non-ASCII extension is dropped from the fallback but kept in filename*
    assertSame(
        "attachment; filename=\"download\"; filename*=UTF-8''%ED%95%9C.%EA%B8%80",
        poznoteContentDisposition('attachment', '한.글')
    );
});

test('invalid UTF-8 is scrubbed before it is labelled UTF-8', function () {
    assertSame('attachment; filename="bad?name.pdf"', poznoteContentDisposition('attachment', "bad\xFFname.pdf"));
    $value = poznoteContentDisposition('attachment', "한\xFF.pdf");
    assertContains("filename*=UTF-8''", $value);
    $encoded = substr($value, strpos($value, "UTF-8''") + 7);
    assertTrue(mb_check_encoding(rawurldecode($encoded), 'UTF-8'), $value);
});

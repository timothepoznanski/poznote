<?php
lib('attachments');

// The upload validation is the last line of defence before a file lands in the
// data volume, which nginx also refuses to execute. Both layers matter.

test('executable extensions are refused', function () {
    foreach (['php', 'PHP', 'phtml', 'phar', 'sh', 'cgi'] as $ext) {
        assertTrue(poznoteAttachmentExtensionIsBlocked($ext), "extension {$ext}");
    }
});

test('ordinary document extensions are accepted', function () {
    foreach (['png', 'pdf', 'md', 'txt', 'jpg'] as $ext) {
        assertFalse(poznoteAttachmentExtensionIsBlocked($ext), "extension {$ext}");
    }
});

test('a filename can never carry a path out of the attachments directory', function () {
    // The validator sanitises rather than rejects, which is fine as long as what
    // comes back is a bare filename. That is the invariant worth pinning.
    foreach (['../evil.png', 'a/b.png', '..\\evil.png', '....//evil.png'] as $hostile) {
        $r = poznoteValidateAttachmentFilename($hostile);
        assertTrue($r['success'], $hostile);
        assertSame(basename($r['filename']), $r['filename'], "{$hostile} must reduce to a bare name");
        assertNotContains('..', $r['filename'], $hostile);
    }
});

test('an empty or executable filename is refused', function () {
    assertFalse(poznoteValidateAttachmentFilename('')['success']);
    assertFalse(poznoteValidateAttachmentFilename('shell.php')['success']);
});

test('a plain filename is accepted unchanged', function () {
    $r = poznoteValidateAttachmentFilename('photo.png');
    assertTrue($r['success']);
    assertSame('photo.png', $r['filename']);
});

test('sizes are formatted with a unit, megabytes without one', function () {
    assertSame('2 KB', poznoteFormatAttachmentSize(2048));
    assertSame('1.00', poznoteFormatMb(1048576));
    assertSame('', poznoteFormatAttachmentSize(0), 'zero renders as nothing, not "0 B"');
});

test('the extension is read from the stored attachment record', function () {
    assertSame('png', poznoteAttachmentExtension(['filename' => 'a.png']));
});

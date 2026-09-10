<?php
lib('attachments');

// The upload validation is the last line of defence before a file lands in the
// data volume, which nginx also refuses to execute. Both layers matter.

test('executable extensions are refused', function () {
    foreach (['php', 'PHP', 'phtml', 'phar', 'sh', 'cgi'] as $ext) {
        assertTrue(poznoteAttachmentExtensionIsBlocked($ext), "extension {$ext}");
    }
});

test('server-executable types are separated from merely executable ones', function () {
    foreach (['php', 'php7', 'phtml', 'phar', 'cgi', 'jsp', 'shtml'] as $ext) {
        assertSame(POZNOTE_ATTACHMENT_BLOCK_SERVER, poznoteAttachmentExtensionBlockLevel($ext), "extension {$ext}");
    }
    foreach (['sh', 'ps1', 'bat', 'exe', 'py', 'jar'] as $ext) {
        assertSame(POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE, poznoteAttachmentExtensionBlockLevel($ext), "extension {$ext}");
    }
    assertSame(null, poznoteAttachmentExtensionBlockLevel('png'));

    assertSame(POZNOTE_ATTACHMENT_BLOCK_SERVER, poznoteAttachmentMimeTypeBlockLevel('text/x-php'));
    assertSame(POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE, poznoteAttachmentMimeTypeBlockLevel('text/x-shellscript'));
    assertSame(null, poznoteAttachmentMimeTypeBlockLevel('image/png'));
});

test('the setting lifts the executable block but never the server one', function () {
    // The suite has no database, so the decision is exercised against an
    // explicit state rather than through the settings table.
    assertFalse(poznoteAttachmentExtensionIsBlocked('ps1', true), 'ps1 must be allowed once unblocked');
    assertFalse(poznoteAttachmentMimeTypeIsBlocked('text/x-shellscript', true), 'shell scripts must be allowed once unblocked');
    assertTrue(poznoteAttachmentExtensionIsBlocked('ps1', false), 'ps1 must be refused while blocked');

    assertTrue(poznoteAttachmentExtensionIsBlocked('php', true), 'php can never be unblocked');
    assertTrue(poznoteAttachmentMimeTypeIsBlocked('application/x-httpd-php', true), 'php content can never be unblocked');

    assertFalse(poznoteAttachmentBlockLevelApplies(null, false), 'an unrestricted type is never refused');
});

test('executables stay blocked when no settings layer is available', function () {
    // CLI workers and this suite load the lib on its own: the missing setting
    // must read as blocked, never as allowed.
    assertTrue(poznoteAttachmentExtensionIsBlocked('exe'), 'default must be blocked');
    assertFalse(poznoteValidateAttachmentFilename('deploy.ps1')['success']);
});

test('a blocked filename reports what was refused and whether it can be lifted', function () {
    $executable = poznoteValidateAttachmentFilename('deploy.ps1');
    assertFalse($executable['success']);
    assertSame('ps1', $executable['blocked_extension']);
    assertSame(POZNOTE_ATTACHMENT_BLOCK_EXECUTABLE, $executable['block_level']);

    $server = poznoteValidateAttachmentFilename('shell.php');
    assertFalse($server['success']);
    assertSame('php', $server['blocked_extension']);
    assertSame(POZNOTE_ATTACHMENT_BLOCK_SERVER, $server['block_level']);
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

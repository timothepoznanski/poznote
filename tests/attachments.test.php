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

// finfo reads the container, so audio recorded by a browser (WebM) or by the
// Windows Voice Recorder (M4A) was stored as video and shown as a video. These
// are the real first bytes of such files.
$webmAudioHeader = "\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\xf3\x81\x08\x42\x82\x84\x77\x65\x62\x6d\x42\x87\x81\x04\x42\x85\x81\x02\x18\x53\x80\x67\x01\x00\x00\x00\x00\x00\x37\x6e\x11\x4d\x9b\x74\xba\x4d\xbb\x8b\x53\xab\x84\x15\x49\xa9\x66\x53";
$m4aHeader = "\x00\x00\x00\x18\x66\x74\x79\x70\x6d\x70\x34\x32\x00\x00\x00\x00\x6d\x70\x34\x31\x69\x73\x6f\x6d\x00\x00\x00\x28\x75\x75\x69\x64\x5c\xa7\x08\xfb\x32\x8e\x42\x05\xa8\x61\x65\x0e\xca\x0a\x95\x96\x00\x00\x00\x0c\x31\x30\x2e\x30\x2e\x32\x36\x32\x30\x30\x2e\x30";

test('an audio-only extension stores an audio type over the container finfo sees', function () {
    assertSame('audio/webm', poznoteResolveAttachmentMimeType('recording.weba', 'video/webm'));
    assertSame('audio/mp4', poznoteResolveAttachmentMimeType('Enregistrement.m4a', 'video/mp4'));
    assertSame('audio/mpeg', poznoteResolveAttachmentMimeType('memo.MP3', 'application/octet-stream'));
    assertSame('audio/ogg', poznoteResolveAttachmentMimeType('note.opus', null), 'no finfo at all');
});

test('a real video or a file finfo recognised as something else keeps its type', function () {
    assertSame('video/webm', poznoteResolveAttachmentMimeType('film.webm', 'video/webm'), '.webm can be a film');
    assertSame('video/mp4', poznoteResolveAttachmentMimeType('clip.mp4', 'video/mp4'));
    assertSame('video/ogg', poznoteResolveAttachmentMimeType('clip.ogg', 'video/ogg'), '.ogg is also a video container');
    assertSame('text/plain', poznoteResolveAttachmentMimeType('fake.mp3', 'text/plain'), 'not a container, not ours to relabel');
    assertSame('application/pdf', poznoteResolveAttachmentMimeType('document.pdf', 'application/pdf'));
});

test('uploading browser and Windows recordings stores them as audio', function () use ($webmAudioHeader, $m4aHeader) {
    if (!class_exists('finfo')) {
        return;
    }
    $webm = poznoteValidateAttachmentFile('recording-2026-09-12.weba', null, $webmAudioHeader);
    assertTrue($webm['success'], 'webm accepted');
    assertSame('audio/webm', $webm['mime_type']);

    $m4a = poznoteValidateAttachmentFile('Enregistrement.m4a', null, $m4aHeader);
    assertTrue($m4a['success'], 'm4a accepted');
    assertSame('audio/mp4', $m4a['mime_type']);

    // The same WebM bytes under a video name stay a video
    assertSame('video/webm', poznoteValidateAttachmentFile('film.webm', null, $webmAudioHeader)['mime_type']);
});

// Moving an attachment to another note. The record always leaves, the file
// only follows when nothing in the note it leaves still points at it: an
// address is /api/v1/notes/<note>/attachments/<id> and resolves only while
// that note holds that id.

test('an attachment nothing points at moves whole', function () {
    $plan = poznotePlanAttachmentMove(['id' => 'abc123', 'filename' => 'abc.pdf'], '<p>Nothing here</p>', false);

    assertFalse($plan['keep_in_source'], 'the note keeps nothing');
    assertFalse($plan['duplicate_file'], 'no second copy of the file');
    assertFalse($plan['snapshot_only']);
});

test('an attachment the note still shows leaves a visible copy behind', function () {
    $content = '<p><a href="/api/v1/notes/12/attachments/abc123">report.pdf</a></p>';
    $plan = poznotePlanAttachmentMove(['id' => 'abc123', 'filename' => 'abc.pdf'], $content, false);

    assertTrue($plan['keep_in_source'], 'the link would 404 otherwise');
    assertTrue($plan['duplicate_file'], 'each note must own its own file');
    assertFalse($plan['snapshot_only'], 'the content uses it, so it stays visible');
});

test('an attachment only a snapshot needs is kept hidden', function () {
    $plan = poznotePlanAttachmentMove(['id' => 'abc123', 'filename' => 'abc.pdf'], '<p>Rewritten since</p>', true);

    assertTrue($plan['keep_in_source']);
    assertTrue($plan['duplicate_file']);
    assertTrue($plan['snapshot_only'], 'gone from the note, still there for a restore');
});

test('a markdown image counts as a reference too', function () {
    $content = "Before\n\n![shot](/api/v1/notes/12/attachments/abc123)\n";
    assertTrue(poznotePlanAttachmentMove(['id' => 'abc123'], $content, false)['keep_in_source']);
});

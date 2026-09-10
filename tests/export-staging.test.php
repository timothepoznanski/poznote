<?php
require_once dirname(__DIR__) . '/src/lib/export-staging.php';

// ZipArchive::addFromString() keeps its data until close(), so an export that
// rewrites note bodies used to hold all of them at once and the peak grew with
// the account. Rewritten bodies are staged on disk and added by path instead.
// These tests cover the staging itself and, at the end, measure that the
// difference is real: the reason for the whole mechanism.

function exportStagingTempDir(): string
{
    $dir = sys_get_temp_dir() . '/poznote_staging_test_' . bin2hex(random_bytes(6));
    mkdir($dir, 0700, true);
    return $dir;
}

test('a staged file holds exactly the content it was given', function () {
    $dir = exportStagingTempDir();
    try {
        $content = "line one\nline two\n" . str_repeat('x', 5000);
        $path = poznoteExportStageFile($dir, 'notes/42.md', $content);
        assertTrue($path !== null, 'staging returned a path');
        assertSame($content, (string)file_get_contents($path));
        assertSame($dir . '/notes/42.md', $path, 'the staged path mirrors the archive path');
    } finally {
        poznoteExportRemoveStaging($dir);
    }
});

test('staging creates the directories an archive path implies', function () {
    $dir = exportStagingTempDir();
    try {
        $path = poznoteExportStageFile($dir, 'Work/Projects/Deep/note.html', '<p>hi</p>');
        assertTrue($path !== null, 'nested path staged');
        assertTrue(is_file($path), 'file written');
    } finally {
        poznoteExportRemoveStaging($dir);
    }
});

test('staging into a directory that does not exist fails instead of throwing', function () {
    $missing = sys_get_temp_dir() . '/poznote_staging_absent_' . bin2hex(random_bytes(6)) . '/x';
    // A path under a file, not a directory: mkdir cannot succeed.
    $blocker = sys_get_temp_dir() . '/poznote_staging_file_' . bin2hex(random_bytes(6));
    file_put_contents($blocker, 'not a directory');
    try {
        assertSame(null, poznoteExportStageFile($blocker, 'sub/note.md', 'body'));
    } finally {
        @unlink($blocker);
        poznoteExportRemoveStaging(dirname($missing));
    }
});

test('removing a staging directory takes everything under it', function () {
    $dir = exportStagingTempDir();
    poznoteExportStageFile($dir, 'a/b/c/one.md', 'one');
    poznoteExportStageFile($dir, 'a/b/two.md', 'two');
    poznoteExportStageFile($dir, 'three.md', 'three');
    poznoteExportRemoveStaging($dir);
    assertFalse(is_dir($dir), 'staging directory gone');
    // Called again, or on nothing at all, it stays quiet.
    poznoteExportRemoveStaging($dir);
    poznoteExportRemoveStaging(null);
    poznoteExportRemoveStaging('');
});

test('a rewritten file is added by path when staging works, by string when it does not', function () {
    if (!class_exists('ZipArchive')) {
        return;
    }
    $dir = exportStagingTempDir();
    $zipPath = $dir . '/out.zip';
    try {
        $zip = new ZipArchive();
        assertTrue($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 'archive opened');
        assertTrue(poznoteExportAddRewrittenFile($zip, $dir . '/staging', 'staged.md', 'staged body'));
        // No staging directory: the archive must still be correct.
        assertTrue(poznoteExportAddRewrittenFile($zip, null, 'inline.md', 'inline body'));
        $zip->close();

        $read = new ZipArchive();
        $read->open($zipPath);
        assertSame('staged body', $read->getFromName('staged.md'));
        assertSame('inline body', $read->getFromName('inline.md'));
        $read->close();
    } finally {
        poznoteExportRemoveStaging($dir);
    }
});

test('staging keeps the peak at one file while addFromString keeps them all', function () {
    if (!class_exists('ZipArchive')) {
        return;
    }
    $dir = exportStagingTempDir();
    // Incompressible, so ZipArchive cannot shrink what it is holding.
    $bodies = [];
    for ($i = 0; $i < 6; $i++) {
        $bodies[] = random_bytes(2 * 1024 * 1024);
    }

    $build = function (bool $staged) use ($dir, $bodies) {
        $zipPath = $dir . '/measure_' . ($staged ? 'staged' : 'inline') . '.zip';
        $stagingDir = $staged ? $dir . '/staging_' . bin2hex(random_bytes(4)) : null;
        if ($stagingDir !== null) {
            mkdir($stagingDir, 0700, true);
        }
        $before = memory_get_usage();
        $zip = new ZipArchive();
        $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $peak = 0;
        foreach ($bodies as $i => $body) {
            poznoteExportAddRewrittenFile($zip, $stagingDir, 'note' . $i . '.bin', $body);
            $peak = max($peak, memory_get_usage() - $before);
        }
        $zip->close();
        @unlink($zipPath);
        poznoteExportRemoveStaging($stagingDir);
        return $peak;
    };

    $inline = $build(false);
    $stagedPeak = $build(true);
    poznoteExportRemoveStaging($dir);

    $total = 12 * 1024 * 1024;
    assertTrue($inline > $total * 0.8, 'addFromString holds the whole export, saw ' . $inline);
    assertTrue($stagedPeak < 3 * 1024 * 1024, 'staging holds about one file, saw ' . $stagedPeak);
});

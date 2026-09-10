<?php
/**
 * Staging for files an export rewrites before archiving them.
 *
 * ZipArchive::addFromString() keeps its data in memory until close(), so an
 * export that rewrote every note body held all of them at once: the peak grew
 * with the account, not with the largest note, and a big account exhausted
 * memory_limit or got the container OOM-killed. Writing each rewritten body to
 * a staging file and handing the archive a path instead means ZipArchive
 * streams it at close() time and the peak is one note.
 *
 * These functions were part of backup_zip.php, where the complete backup was
 * fixed first. They live here because the per-folder and per-workspace ZIP
 * exports need exactly the same thing, and because they need nothing else:
 * no database, no session, no config.
 */

/**
 * Write every byte of $data to $stream, looping over short writes (a full
 * disk can accept part of a buffer and report success for that part only).
 */
function poznoteExportWriteAll($stream, string $data): bool {
    $length = strlen($data);
    $offset = 0;
    while ($offset < $length) {
        $written = fwrite($stream, $offset === 0 ? $data : substr($data, $offset));
        if ($written === false || $written === 0) {
            return false;
        }
        $offset += $written;
    }
    return true;
}

/**
 * Write a rewritten file for the archive into the build's staging directory
 * and return its path, or null if it could not be written in full.
 */
function poznoteExportStageFile(string $stagingDir, string $relativePath, string $content): ?string {
    $path = $stagingDir . '/' . $relativePath;
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return null;
    }
    $stream = @fopen($path, 'wb');
    if ($stream === false) {
        return null;
    }
    $ok = poznoteExportWriteAll($stream, $content);
    fclose($stream);
    if (!$ok) {
        @unlink($path);
        return null;
    }
    return $path;
}

/**
 * Remove a build's staging directory (SQL dump, rewritten note bodies).
 */
function poznoteExportRemoveStaging(?string $dir): void {
    if ($dir === null || $dir === '' || !is_dir($dir)) {
        return;
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        if ($item->isDir()) {
            @rmdir($item->getPathname());
        } else {
            @unlink($item->getPathname());
        }
    }
    @rmdir($dir);
}

/**
 * Open a staging directory for the request currently building an archive, and
 * have it removed when the request ends.
 *
 * The export endpoints leave through a dozen die() calls and end with an exit
 * after streaming the ZIP, so cleanup is registered at shutdown rather than
 * written on each path: a forgotten branch would leave a copy of the exported
 * notes in the temp directory. Returns null when no staging directory can be
 * created, which callers treat as "archive in memory as before".
 */
function poznoteExportOpenStagingDir(string $prefix): ?string {
    try {
        $suffix = bin2hex(random_bytes(6));
    } catch (Exception $e) {
        $suffix = (string)mt_rand();
    }

    $dir = sys_get_temp_dir() . '/' . $prefix . '_' . $suffix;
    if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return null;
    }

    register_shutdown_function(function () use ($dir) {
        poznoteExportRemoveStaging($dir);
    });

    return $dir;
}

/**
 * Add a file the export rewrote to the archive, through the staging directory
 * when there is one.
 *
 * The fallback keeps the archive correct on an instance with no writable temp
 * directory; it only costs the memory this staging exists to save.
 */
function poznoteExportAddRewrittenFile(ZipArchive $zip, ?string $stagingDir, string $zipPath, string $content): bool {
    if ($stagingDir !== null) {
        $staged = poznoteExportStageFile($stagingDir, $zipPath, $content);
        if ($staged !== null) {
            return $zip->addFile($staged, $zipPath);
        }
    }

    return $zip->addFromString($zipPath, $content);
}

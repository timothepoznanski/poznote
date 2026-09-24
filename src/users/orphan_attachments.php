<?php
/**
 * Orphan attachments scanner
 *
 * Lists, per account, the files of data/users/<id>/attachments that no note of
 * that account references any more, and deletes them on request. Behind
 * GET / DELETE /api/v1/admin/orphan-attachments, which the Orphan attachments
 * scanner dialog of the settings page calls (it used to be a page of its own,
 * admin/orphan-scanner.php).
 *
 * Only the local attachment folders are read: files kept in S3 storage are
 * not listed on disk, so they are never reported (nor deleted) here.
 *
 * @return array one row per account folder:
 *   user_id, total_files, orphans_found, orphans_deleted, files (names), error
 */
function poznoteScanOrphanAttachments(bool $delete): array
{
    $usersDir = dirname(SQLITE_DATABASE, 2) . '/users';
    // Fallback when the database lives outside the data folder
    if (!is_dir($usersDir)) {
        $usersDir = dirname(__DIR__) . '/data/users';
    }
    if (!is_dir($usersDir)) {
        return [];
    }

    $userIds = array_values(array_filter(scandir($usersDir), static function ($dir) use ($usersDir) {
        return ctype_digit($dir) && is_dir($usersDir . '/' . $dir);
    }));
    sort($userIds, SORT_NUMERIC);

    $rows = [];
    foreach ($userIds as $userId) {
        $attachmentsDir = $usersDir . '/' . $userId . '/attachments';
        $dbPath = $usersDir . '/' . $userId . '/database/poznote.db';

        $row = [
            'user_id' => (int)$userId,
            'total_files' => 0,
            'orphans_found' => 0,
            'orphans_deleted' => 0,
            'files' => [],
            'error' => null,
        ];

        if (!is_dir($attachmentsDir) || !file_exists($dbPath)) {
            $rows[] = $row;
            continue;
        }

        try {
            $db = new PDO('sqlite:' . $dbPath);
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            $filesOnDisk = [];
            foreach (new DirectoryIterator($attachmentsDir) as $file) {
                if ($file->isFile() && $file->getFilename() !== '.gitignore') {
                    $filesOnDisk[] = $file->getFilename();
                }
            }
            $row['total_files'] = count($filesOnDisk);

            $referenced = [];
            $stmt = $db->query("SELECT attachments FROM entries WHERE attachments IS NOT NULL AND attachments != ''");
            while ($entry = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $attachments = json_decode($entry['attachments'], true);
                if (!is_array($attachments)) {
                    continue;
                }
                foreach ($attachments as $attachment) {
                    if (isset($attachment['filename'])) {
                        $referenced[$attachment['filename']] = true;
                    }
                }
            }

            $orphans = array_values(array_filter($filesOnDisk, static function ($name) use ($referenced) {
                return !isset($referenced[$name]);
            }));
            sort($orphans);
            $row['orphans_found'] = count($orphans);
            $row['files'] = $orphans;

            if ($delete) {
                foreach ($orphans as $name) {
                    if (@unlink($attachmentsDir . '/' . $name)) {
                        $row['orphans_deleted']++;
                    }
                }
            }
        } catch (Throwable $e) {
            $row['error'] = $e->getMessage();
        }
        $rows[] = $row;
    }
    return $rows;
}

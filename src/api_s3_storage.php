<?php
/**
 * S3 attachment storage admin endpoint (admin only).
 *
 * Actions:
 *   POST ?action=test              Test a connection with the submitted (or saved) config
 *   GET  ?action=status            Local/bucket file counts and sizes across all users
 *   POST ?action=migrate_to_s3     Move a batch of local attachment files to the bucket
 *   POST ?action=migrate_to_local  Move a batch of bucket objects back to local disk
 *
 * Migration is batched (MIGRATION_BATCH files per call): the settings page
 * loops until "remaining" reaches 0, which also makes an interrupted
 * migration trivially resumable.
 */
require 'auth.php';
requireAuth();

require_once 'config.php';
require_once 'functions.php';
require_once 'users/db_master.php';
require_once 'users/UserDataManager.php';
require_once 'storage/AttachmentStorage.php';

header('Content-Type: application/json');
ini_set('display_errors', 0);
ini_set('log_errors', 1);

if (!isCurrentUserAdmin()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Admin access required']);
    exit;
}

const MIGRATION_BATCH = 20;

$action = $_GET['action'] ?? $_POST['action'] ?? '';

/** Active user ids from the master database. */
function s3AllUserIds(): array {
    try {
        $stmt = getMasterConnection()->query('SELECT id FROM users ORDER BY id');
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    } catch (Exception $e) {
        return [];
    }
}

/** Non-hidden files in a user's local attachments directory. */
function s3LocalAttachmentFiles(int $userId): array {
    $dir = (new UserDataManager($userId))->getUserAttachmentsPath();
    if (!is_dir($dir)) {
        return [];
    }
    $files = [];
    foreach (scandir($dir) as $entry) {
        if ($entry[0] === '.' || !is_file($dir . '/' . $entry)) {
            continue;
        }
        $files[] = ['dir' => $dir, 'filename' => $entry, 'size' => (int)(@filesize($dir . '/' . $entry) ?: 0)];
    }
    return $files;
}

function s3ClientFromSavedConfig(): S3Client {
    return AttachmentStorage::makeClient(AttachmentStorage::getConfig());
}

switch ($action) {
    case 'test': {
        // Test with submitted values; a masked secret means "use the saved one"
        $saved = AttachmentStorage::getConfig();
        $secret = (string)($_POST['secret_key'] ?? '');
        if ($secret === '' || $secret === '••••••••') {
            $secret = $saved['secret_key'];
        }
        $config = [
            'endpoint' => trim((string)($_POST['endpoint'] ?? $saved['endpoint'])),
            'region' => trim((string)($_POST['region'] ?? $saved['region'])) ?: 'us-east-1',
            'bucket' => trim((string)($_POST['bucket'] ?? $saved['bucket'])),
            'access_key' => trim((string)($_POST['access_key'] ?? $saved['access_key'])),
            'secret_key' => $secret,
            'path_style' => (($_POST['path_style'] ?? ($saved['path_style'] ? '1' : '0')) === '1'),
        ];
        try {
            $client = AttachmentStorage::makeClient($config);
            $result = $client->testConnection();
            echo json_encode($result);
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    }

    case 'status': {
        $localCount = 0; $localBytes = 0;
        foreach (s3AllUserIds() as $userId) {
            foreach (s3LocalAttachmentFiles($userId) as $file) {
                $localCount++;
                $localBytes += $file['size'];
            }
        }

        $remoteCount = null; $remoteBytes = null; $remoteError = null;
        $config = AttachmentStorage::getConfig();
        if ($config['endpoint'] !== '' && $config['bucket'] !== '' && $config['access_key'] !== '' && $config['secret_key'] !== '') {
            try {
                $client = s3ClientFromSavedConfig();
                $remoteCount = 0; $remoteBytes = 0;
                foreach ($client->listObjects('attachments/') as $object) {
                    $remoteCount++;
                    $remoteBytes += $object['size'];
                }
            } catch (Exception $e) {
                $remoteCount = null; $remoteBytes = null;
                $remoteError = $e->getMessage();
            }
        }

        echo json_encode([
            'success' => true,
            'enabled' => AttachmentStorage::isEnabled(),
            'local' => ['count' => $localCount, 'bytes' => $localBytes],
            'remote' => ['count' => $remoteCount, 'bytes' => $remoteBytes, 'error' => $remoteError],
        ]);
        break;
    }

    case 'migrate_to_s3': {
        try {
            $client = s3ClientFromSavedConfig();
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            break;
        }

        $moved = 0; $errors = []; $remaining = 0;
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        foreach (s3AllUserIds() as $userId) {
            foreach (s3LocalAttachmentFiles($userId) as $file) {
                if ($moved >= MIGRATION_BATCH) {
                    $remaining++;
                    continue;
                }
                $path = $file['dir'] . '/' . $file['filename'];
                $key = AttachmentStorage::keyPrefixForUser($userId) . $file['filename'];
                try {
                    $contentType = ($finfo ? finfo_file($finfo, $path) : false) ?: 'application/octet-stream';
                    $client->putObject($key, $path, $contentType);
                    // Only remove the local copy once the object is confirmed
                    // in the bucket with the expected size
                    $head = $client->headObject($key);
                    if ($head === null || $head['size'] !== $file['size']) {
                        throw new S3StorageException('Uploaded object size mismatch for ' . $key);
                    }
                    @unlink($path);
                    $moved++;
                } catch (Exception $e) {
                    $errors[] = $file['filename'] . ': ' . $e->getMessage();
                    $remaining++;
                    if (count($errors) >= 5) {
                        break 2;
                    }
                }
            }
        }
        if ($finfo) {
            finfo_close($finfo);
        }

        echo json_encode([
            'success' => empty($errors),
            'moved' => $moved,
            'remaining' => $remaining,
            'errors' => $errors,
        ]);
        break;
    }

    case 'migrate_to_local': {
        try {
            $client = s3ClientFromSavedConfig();
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            break;
        }

        $moved = 0; $errors = []; $remaining = 0;
        try {
            $objects = $client->listObjects('attachments/');
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            break;
        }

        foreach ($objects as $object) {
            // Keys look like attachments/{userId}/{filename}
            if (!preg_match('#^attachments/(\d+)/([^/]+)$#', $object['key'], $matches)) {
                continue;
            }
            if ($moved >= MIGRATION_BATCH) {
                $remaining++;
                continue;
            }
            $userId = (int)$matches[1];
            $filename = $matches[2];
            $dir = (new UserDataManager($userId))->getUserAttachmentsPath();
            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
                $errors[] = $object['key'] . ': cannot create local directory';
                $remaining++;
                continue;
            }
            $destination = $dir . '/' . basename($filename);
            try {
                $client->getObjectToFile($object['key'], $destination);
                if ((int)(@filesize($destination) ?: -1) !== $object['size']) {
                    @unlink($destination);
                    throw new S3StorageException('Downloaded file size mismatch for ' . $object['key']);
                }
                @chmod($destination, 0644);
                $client->deleteObject($object['key']);
                $moved++;
            } catch (Exception $e) {
                $errors[] = $object['key'] . ': ' . $e->getMessage();
                $remaining++;
                if (count($errors) >= 5) {
                    break;
                }
            }
        }

        echo json_encode([
            'success' => empty($errors),
            'moved' => $moved,
            'remaining' => $remaining,
            'errors' => $errors,
        ]);
        break;
    }

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid action']);
}

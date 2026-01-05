<?php
/**
 * Chunked Upload Handler for Poznote
 * Allows uploading very large files by splitting them into smaller chunks
 */

// Disable error display to prevent HTML output in JSON responses
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

require_once 'auth.php';
require_once 'config.php';
require_once 'functions.php';
require_once 'db_connect.php';

header('Content-Type: application/json');

// Check if user is logged in
if (!isset($_SESSION['authenticated']) || $_SESSION['authenticated'] !== true) {
    http_response_code(401);
    echo json_encode(['error' => t('auth.api.authentication_required', [], 'Authentication required')]);
    exit;
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => t('api.errors.method_not_allowed', [], 'Method not allowed')]);
    exit;
}

$action = $_POST['action'] ?? '';

try {
    switch ($action) {
        case 'upload_chunk':
            handleChunkUpload();
            break;
        case 'assemble_chunks':
            assembleChunks();
            break;
        case 'cleanup_chunks':
            cleanupChunks();
            break;
        default:
            http_response_code(400);
            echo json_encode(['error' => t('api.errors.invalid_action', [], 'Invalid action')]);
            break;
    }
} catch (Exception $e) {
    error_log('Chunked restore error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => t('api.errors.internal_server_error', [], 'Internal server error')]);
}

function handleChunkUpload() {
    try {
        $fileId = $_POST['file_id'] ?? '';
        $chunkIndex = (int)($_POST['chunk_index'] ?? 0);
        $totalChunks = (int)($_POST['total_chunks'] ?? 0);
        $fileName = $_POST['file_name'] ?? '';
        $chunkSize = (int)($_POST['chunk_size'] ?? 0);

        if (!$fileId || !$fileName || $totalChunks <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required parameters']);
            return;
        }

        // Validate file type (only ZIP files for restoration)
        if (!preg_match('/\.zip$/i', $fileName)) {
            http_response_code(400);
            echo json_encode(['error' => 'Only ZIP files are allowed']);
            return;
        }

        // Check if chunk file was uploaded
        if (!isset($_FILES['chunk']) || $_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['error' => 'No chunk file uploaded']);
            return;
        }

        $chunkFile = $_FILES['chunk']['tmp_name'];
        $chunkData = file_get_contents($chunkFile);

        if ($chunkData === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to read chunk data']);
            return;
        }

        // Create chunks directory if it doesn't exist
        $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;
        if (!is_dir($chunksDir)) {
            if (!mkdir($chunksDir, 0755, true)) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to create chunks directory']);
                return;
            }
        }

        // Save chunk to file
        $chunkFilePath = $chunksDir . '/chunk_' . str_pad($chunkIndex, 6, '0', STR_PAD_LEFT);
        if (file_put_contents($chunkFilePath, $chunkData) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save chunk']);
            return;
        }

        // Save metadata
        $metadataFile = $chunksDir . '/metadata.json';
        $metadata = [
            'file_name' => $fileName,
            'file_id' => $fileId,
            'total_chunks' => $totalChunks,
            'chunk_size' => $chunkSize,
            'uploaded_chunks' => [],
            'upload_start_time' => time()
        ];

        if (file_exists($metadataFile)) {
            $existingMetadata = json_decode(file_get_contents($metadataFile), true);
            if ($existingMetadata) {
                $metadata = array_merge($metadata, $existingMetadata);
            }
        }

        $metadata['uploaded_chunks'][] = $chunkIndex;
        $metadata['uploaded_chunks'] = array_unique($metadata['uploaded_chunks']);
        sort($metadata['uploaded_chunks']);

        if (file_put_contents($metadataFile, json_encode($metadata)) === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save metadata']);
            return;
        }

        // Check if all chunks are uploaded
        $allChunksUploaded = count($metadata['uploaded_chunks']) === $totalChunks;

        echo json_encode([
            'success' => true,
            'chunk_index' => $chunkIndex,
            'uploaded_chunks' => count($metadata['uploaded_chunks']),
            'total_chunks' => $totalChunks,
            'all_chunks_uploaded' => $allChunksUploaded
        ]);
    } catch (Exception $e) {
        error_log('handleChunkUpload error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Internal server error during chunk upload']);
    }
}

function assembleChunks() {
    $fileId = $_POST['file_id'] ?? '';

    if (!$fileId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing file_id']);
        return;
    }

    $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;
    $metadataFile = $chunksDir . '/metadata.json';
    $finalFile = null;

    try {
        if (!file_exists($metadataFile)) {
            http_response_code(404);
            echo json_encode(['error' => 'Upload session not found']);
            return;
        }

        $metadata = json_decode(file_get_contents($metadataFile), true);
        if (!$metadata) {
            http_response_code(500);
            echo json_encode(['error' => 'Invalid metadata']);
            return;
        }

        // Check if all chunks are present
        if (count($metadata['uploaded_chunks']) !== $metadata['total_chunks']) {
            http_response_code(400);
            echo json_encode([
                'error' => 'Not all chunks uploaded',
                'uploaded' => count($metadata['uploaded_chunks']),
                'total' => $metadata['total_chunks']
            ]);
            return;
        }

        // Create final file
        $finalFile = tempnam(sys_get_temp_dir(), 'poznote_restore_') . '.zip';
        $finalHandle = fopen($finalFile, 'wb');
        if (!$finalHandle) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create final file']);
            return;
        }

        // Assemble chunks in order
        for ($i = 0; $i < $metadata['total_chunks']; $i++) {
            $chunkFile = $chunksDir . '/chunk_' . str_pad($i, 6, '0', STR_PAD_LEFT);
            if (!file_exists($chunkFile)) {
                fclose($finalHandle);
                unlink($finalFile);
                http_response_code(500);
                echo json_encode(['error' => 'Missing chunk file: ' . $i]);
                return;
            }

            $chunkData = file_get_contents($chunkFile);
            if ($chunkData === false || fwrite($finalHandle, $chunkData) === false) {
                fclose($finalHandle);
                unlink($finalFile);
                http_response_code(500);
                echo json_encode(['error' => 'Failed to write chunk data']);
                return;
            }
        }

        fclose($finalHandle);

        // Verify the assembled file
        if (!file_exists($finalFile) || filesize($finalFile) === 0) {
            unlink($finalFile);
            http_response_code(500);
            echo json_encode(['error' => 'Assembled file is invalid']);
            return;
        }

        // Clean up chunks directory
        deleteDirectory($chunksDir);

        // Now perform the restoration
        $uploadedFile = [
            'tmp_name' => $finalFile,
            'name' => $metadata['file_name'],
            'error' => UPLOAD_ERR_OK
        ];

        $result = restoreCompleteBackup($uploadedFile, true);

        // Clean up final file
        if (file_exists($finalFile)) {
            unlink($finalFile);
        }
        $finalFile = null; // Mark as cleaned

        if ($result['success']) {
            echo json_encode([
                'success' => true,
                'message' => $result['message']
            ]);
        } else {
            http_response_code(500);
            echo json_encode([
                'error' => $result['error'],
                'details' => $result['message'] ?? ''
            ]);
        }
        
    } catch (Exception $e) {
        // Clean up on error
        if ($finalFile && file_exists($finalFile)) {
            unlink($finalFile);
        }
        if (is_dir($chunksDir)) {
            deleteDirectory($chunksDir);
        }
        
        error_log('assembleChunks error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Internal server error during chunk assembly']);
    }
}

function cleanupChunks() {
    try {
        $fileId = $_POST['file_id'] ?? '';

        if (!$fileId) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing file_id']);
            return;
        }

        $chunksDir = sys_get_temp_dir() . '/poznote_chunks_' . $fileId;

        if (is_dir($chunksDir)) {
            deleteDirectory($chunksDir);
        }

        echo json_encode(['success' => true]);
    } catch (Exception $e) {
        error_log('cleanupChunks error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Internal server error during cleanup']);
    }
}

?>
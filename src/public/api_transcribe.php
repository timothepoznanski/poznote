<?php
/**
 * Transcription endpoint — proxies audio to a speech-to-text server exposing
 * the OpenAI audio API (Speaches, whisper.cpp, LocalAI, OpenAI, ...) configured
 * in the Transcription settings.
 *
 * The audio is posted to Poznote and forwarded from the server, never from the
 * browser, for the same reasons as the AI chat: the transcription server is
 * usually on a private network the browser cannot reach, and its API key has
 * no business being handed to a page.
 *
 * Nothing is written to disk here. The uploaded part lives in PHP's temp file
 * for the length of the request; keeping the recording is a separate, explicit
 * step that goes through the normal attachment endpoint.
 *
 * Actions:
 *   POST ?action=transcribe             multipart {audio: file, language?}
 *                                       (language: two-letter code, or "auto")
 *                                       → JSON {success, text}
 *   POST ?action=transcribe_attachment  {note_id, attachment_id, language?}
 *                                       → JSON {success, text, filename}
 *   POST ?action=test                   → JSON {success, models?: [...], error?}
 *                                       (admins, and any user when personal
 *                                       servers are allowed)
 */
require_once __DIR__ . '/../auth.php';
requireApiAuth();

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../db_connect.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../stt_config.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);

$action = $_GET['action'] ?? $_POST['action'] ?? 'transcribe';

function sttJsonError($httpCode, $message) {
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

/**
 * Auth headers for the configured server. Local Whisper servers usually take
 * no key at all; the ones that do, and OpenAI, use a Bearer token.
 */
function sttAuthHeaders(string $apiKey): array {
    return $apiKey === '' ? [] : ['Authorization: Bearer ' . $apiKey];
}

/**
 * Turn an upstream failure into something the user can act on. "HTTP 422:
 * model not found" beats a bare status code, and a curl-level failure is
 * usually the real problem (wrong host, server down).
 */
function sttUpstreamError($body, string $curlError, int $status): string {
    if ($curlError !== '') {
        return $curlError;
    }
    $detail = 'HTTP ' . $status;
    $decoded = json_decode((string)$body, true);
    if (isset($decoded['error']['message']) && is_string($decoded['error']['message'])) {
        $detail .= ': ' . $decoded['error']['message'];
    } elseif (isset($decoded['error']) && is_string($decoded['error'])) {
        $detail .= ': ' . $decoded['error'];
    } elseif (isset($decoded['detail']) && is_string($decoded['detail'])) {
        // FastAPI, which is what Speaches and most Python servers answer with
        $detail .= ': ' . $decoded['detail'];
    }
    return $detail;
}

/**
 * Send one audio file to the transcription server and return its text.
 * Returns ['ok' => true, 'text' => string] or ['ok' => false, 'error' => string].
 */
function sttTranscribeFile(array $config, string $path, string $filename, string $mimeType, string $language): array {
    $url = poznoteSttTranscriptionsUrl((string)$config['url']);
    if ($url === '') {
        return ['ok' => false, 'error' => t('stt.server_errors.no_server', [], 'No transcription server configured')];
    }

    $post = [
        'file' => new CURLFile($path, $mimeType, $filename),
        'model' => (string)$config['model'],
        'response_format' => 'json',
    ];
    // Empty means "let the server detect it", which is what Whisper is good at
    if ($language !== '') {
        $post['language'] = $language;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], sttAuthHeaders((string)$config['api_key'])),
        CURLOPT_CONNECTTIMEOUT => 10,
        // Whisper on CPU is slow: a few minutes of audio can take longer than
        // the audio itself, so this waits as long as the stack in front lets
        // it. docker/nginx/default.conf gives PHP 600 seconds
        // (fastcgi_read_timeout); giving up 30 seconds earlier returns a message
        // the dialog can show, instead of nginx's bare 504 page.
        CURLOPT_TIMEOUT => POZNOTE_STT_UPSTREAM_TIMEOUT_SECONDS,
    ]);
    $body = curl_exec($ch);
    $curlError = curl_error($ch);
    $curlErrno = curl_errno($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($curlErrno === CURLE_OPERATION_TIMEDOUT) {
        return ['ok' => false, 'error' => t('stt.server_errors.timeout', ['seconds' => POZNOTE_STT_UPSTREAM_TIMEOUT_SECONDS],
            'The transcription server did not answer within {{seconds}} seconds. Try a shorter recording or a smaller model.')];
    }
    if ($body === false || $curlError !== '' || $status < 200 || $status >= 300) {
        return ['ok' => false, 'error' => sttUpstreamError($body, $curlError, $status)];
    }

    $decoded = json_decode((string)$body, true);
    if (is_array($decoded) && isset($decoded['text']) && is_string($decoded['text'])) {
        return ['ok' => true, 'text' => trim($decoded['text'])];
    }
    // response_format=text, or a server that answers plain text anyway
    if (is_string($body) && $decoded === null && trim((string)$body) !== '') {
        return ['ok' => true, 'text' => trim((string)$body)];
    }
    return ['ok' => false, 'error' => t('stt.server_errors.empty_result', [], 'The server returned no transcription')];
}

// Either the instance configuration (master.db, managed by an admin and
// granted per user) or the user's own server when the admin allows personal
// ones. See poznoteResolveSttConfig() in stt_config.php.
$sttUserId = (int)(getAuthenticatedUserId() ?? 0);
$sttConfig = poznoteResolveSttConfig($con, $sttUserId);

if ($action === 'test') {
    // Probing arbitrary URLs from the server is reserved for admins, plus
    // regular users when personal servers are on: listing the models of their
    // own server is what makes stt_settings_user.php usable.
    if (!isCurrentUserAdmin() && !poznoteSttUserKeysAllowed()) {
        sttJsonError(403, t('stt.server_errors.admin_required', [], 'Admin access required'));
    }
    $testUrl = trim((string)($_POST['url'] ?? $sttConfig['url']));
    if ($testUrl === '') {
        sttJsonError(400, t('stt.server_errors.no_url', [], 'No server URL configured'));
    }
    // The settings pages only post the key when the user typed one; a field
    // still showing the mask posts nothing. Fall back to the stored key of the
    // configuration being edited ('scope'), not to the resolved one.
    $testKey = trim((string)($_POST['api_key'] ?? ''));
    if ($testKey === '') {
        $testScope = (string)($_POST['scope'] ?? '');
        if ($testScope === 'user' && poznoteSttUserKeysAllowed()) {
            $testKey = poznoteSttUserConfig($con)['api_key'];
        } elseif ($testScope === 'instance' && isCurrentUserAdmin()) {
            $testKey = poznoteSttInstanceConfig()['api_key'];
        } else {
            $testKey = (string)$sttConfig['api_key'];
        }
    }

    $testProvider = (string)($_POST['provider'] ?? '');
    $modelsUrl = poznoteSttModelsUrl($testUrl);
    // Speaches lists its text-to-speech voices alongside the Whisper models;
    // only the latter belong in the suggestions of a transcription setting
    if ($testProvider === 'speaches') {
        $modelsUrl .= '?task=automatic-speech-recognition';
    }

    $ch = curl_init($modelsUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], sttAuthHeaders($testKey)),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    $curlError = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    header('Content-Type: application/json');
    // whisper.cpp has no /v1/models at all: its 404 is a server answering, which
    // is all this check can learn from it. Every other provider does list
    // models, so a 404 there still means the URL is wrong.
    if ($testProvider === 'whispercpp' && $body !== false && $curlError === '' && $status === 404) {
        echo json_encode(['success' => true, 'models' => []]);
        exit;
    }
    if ($body === false || $curlError !== '' || $status < 200 || $status >= 300) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => sttUpstreamError($body, $curlError, $status)]);
        exit;
    }

    $models = [];
    $decoded = json_decode((string)$body, true);
    foreach (($decoded['data'] ?? []) as $m) {
        if (!empty($m['id'])) $models[] = (string)$m['id'];
    }
    echo json_encode(['success' => true, 'models' => $models]);
    exit;
}

if ($action !== 'transcribe' && $action !== 'transcribe_attachment') {
    sttJsonError(400, t('stt.server_errors.unknown_action', [], 'Unknown action'));
}

// Hiding the menu entry is not enough: the endpoint itself must refuse users
// who have neither a personal configuration nor access to the instance one.
if (empty($sttConfig['available'])) {
    sttJsonError(403, t('stt.server_errors.not_configured', [], 'Transcription is not configured for this account'));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sttJsonError(405, t('stt.server_errors.post_required', [], 'POST required'));
}

// A language posted with the request overrides the configured one, so a user
// who normally dictates in French can transcribe an English recording without
// going through the settings page. "auto" lets the server detect it even when
// the configuration fixes one (the recording dialog's language menu).
$rawRequestLanguage = strtolower(trim((string)($_POST['language'] ?? '')));
if ($rawRequestLanguage === 'auto') {
    $language = '';
} else {
    $requestLanguage = poznoteSttNormalizeLanguage($rawRequestLanguage);
    $language = $requestLanguage !== '' ? $requestLanguage : (string)$sttConfig['language'];
}

if ($action === 'transcribe') {
    $upload = $_FILES['audio'] ?? null;
    if (!is_array($upload) || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = is_array($upload) ? (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
        // A POST over post_max_size is discarded by PHP before this file runs:
        // $_POST and $_FILES both arrive empty and no upload error is set, so
        // the body length is the only thing left that tells the two cases
        // apart. Without it a long recording reports "no audio received",
        // which sends the user looking in the wrong place entirely.
        $declaredLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        $postLimit = poznoteSttPostMaxBytes();
        $bodyWasDropped = empty($_FILES) && empty($_POST)
            && $postLimit > 0 && $declaredLength > $postLimit;
        if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE || $bodyWasDropped) {
            sttJsonError(413, t('stt.server_errors.too_large_for_server', [], 'The recording is too large for this server to accept'));
        }
        sttJsonError(400, t('stt.server_errors.no_audio', [], 'No audio received'));
    }
    if (!is_uploaded_file($upload['tmp_name'])) {
        sttJsonError(400, t('stt.server_errors.no_audio', [], 'No audio received'));
    }
    if ((int)$upload['size'] <= 0) {
        sttJsonError(400, t('stt.server_errors.empty_recording', [], 'The recording is empty'));
    }
    if ((int)$upload['size'] > poznoteSttMaxUploadBytes()) {
        sttJsonError(413, t('stt.server_errors.too_large', [], 'The recording is too large'));
    }

    // Trust the sniffed type, not the one the browser claims
    $mimeType = 'application/octet-stream';
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mimeType = (string)finfo_file($finfo, $upload['tmp_name']);
            finfo_close($finfo);
        }
    }
    // finfo reports a bare WebM container as video/webm whatever it holds, and
    // that is exactly what MediaRecorder produces for audio-only recordings.
    if (!in_array(strtolower(explode(';', $mimeType)[0]), poznoteSttAllowedMimeTypes(), true)) {
        sttJsonError(415, t('stt.server_errors.not_audio_file', [], 'That file is not audio Poznote can send for transcription'));
    }

    $filename = 'recording.' . poznoteSttExtensionForMimeType($mimeType);
    $result = sttTranscribeFile($sttConfig, $upload['tmp_name'], $filename, $mimeType, $language);

    header('Content-Type: application/json');
    if (!$result['ok']) {
        http_response_code(502);
        echo json_encode(['success' => false, 'error' => $result['error']]);
        exit;
    }
    echo json_encode(['success' => true, 'text' => $result['text']]);
    exit;
}

// action=transcribe_attachment: an audio file already stored on a note
$noteId = (int)($_POST['note_id'] ?? 0);
$attachmentId = trim((string)($_POST['attachment_id'] ?? ''));
if ($noteId <= 0 || $attachmentId === '') {
    sttJsonError(400, t('stt.server_errors.ids_required', [], 'Note id and attachment id are required'));
}

$row = null;
try {
    $stmt = $con->prepare('SELECT attachments, linked_note_id FROM entries WHERE id = ?');
    $stmt->execute([$noteId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Exception $e) {
    error_log('api_transcribe: reading the note failed: ' . $e->getMessage());
    sttJsonError(500, t('stt.server_errors.note_read_failed', [], 'Could not read the note'));
}

if (!$row) {
    sttJsonError(404, t('stt.server_errors.note_not_found', [], 'Note not found'));
}

// A shortcut note carries no attachments of its own, it borrows the original's
if (!empty($row['linked_note_id'])) {
    $stmtLinked = $con->prepare('SELECT attachments FROM entries WHERE id = ? AND trash = 0');
    $stmtLinked->execute([(int)$row['linked_note_id']]);
    $linked = $stmtLinked->fetch(PDO::FETCH_ASSOC);
    if ($linked) {
        $row = $linked;
    }
}

$attachments = poznoteDecodeAttachments($row['attachments'] ?? null);
$attachment = null;
foreach ($attachments as $candidate) {
    if (($candidate['id'] ?? null) === $attachmentId) {
        $attachment = $candidate;
        break;
    }
}

if ($attachment === null) {
    sttJsonError(404, t('stt.server_errors.attachment_not_found', [], 'Attachment not found'));
}
if (!poznoteSttAttachmentIsTranscribable($attachment)) {
    sttJsonError(415, t('stt.server_errors.attachment_not_audio', [], 'That attachment is not an audio file'));
}

$storedName = (string)($attachment['filename'] ?? '');
$localPath = $storedName !== '' ? poznoteAttachmentLocalFile($storedName) : null;
if ($localPath === null) {
    sttJsonError(404, t('stt.server_errors.attachment_missing', [], 'The attached file is missing from storage'));
}
if ((int)@filesize($localPath) > poznoteSttMaxUploadBytes()) {
    sttJsonError(413, t('stt.server_errors.attachment_too_large', [], 'That recording is too large to transcribe'));
}

$originalName = poznoteAttachmentOriginalFilename($attachment);
$mimeType = poznoteSttAttachmentMimeType($attachment);
$result = sttTranscribeFile($sttConfig, $localPath, $originalName, $mimeType, $language);

header('Content-Type: application/json');
if (!$result['ok']) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => $result['error']]);
    exit;
}
echo json_encode(['success' => true, 'text' => $result['text'], 'filename' => $originalName]);
exit;

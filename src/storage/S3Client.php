<?php
/**
 * Minimal S3-compatible client (AWS Signature V4) built on curl.
 *
 * Works with any S3-compatible endpoint: AWS S3, MinIO, Garage, Cloudflare R2,
 * Backblaze B2, Scaleway, OVH, Wasabi... No SDK dependency, in line with the
 * rest of the codebase.
 *
 * Path-style addressing (https://endpoint/bucket/key) is the default because
 * self-hosted servers (MinIO, Garage) require it; virtual-host style is
 * available for providers that need it.
 */

class S3StorageException extends Exception {}

class S3Client {
    private $scheme;
    private $host;
    private $port;
    private $region;
    private $bucket;
    private $accessKey;
    private $secretKey;
    private $pathStyle;

    /**
     * @param array $config Keys: endpoint, region, bucket, access_key, secret_key, path_style (bool)
     */
    public function __construct(array $config) {
        $endpoint = trim((string)($config['endpoint'] ?? ''));
        $parts = parse_url($endpoint);
        if ($endpoint === '' || $parts === false || empty($parts['host'])) {
            throw new S3StorageException('Invalid S3 endpoint URL');
        }

        $this->scheme = strtolower($parts['scheme'] ?? 'https');
        if (!in_array($this->scheme, ['http', 'https'], true)) {
            throw new S3StorageException('S3 endpoint must use http or https');
        }
        $this->host = strtolower($parts['host']);
        $this->port = isset($parts['port']) ? (int)$parts['port'] : null;
        $this->region = trim((string)($config['region'] ?? '')) ?: 'us-east-1';
        $this->bucket = trim((string)($config['bucket'] ?? ''));
        $this->accessKey = (string)($config['access_key'] ?? '');
        $this->secretKey = (string)($config['secret_key'] ?? '');
        $this->pathStyle = !isset($config['path_style']) || (bool)$config['path_style'];

        if ($this->bucket === '' || $this->accessKey === '' || $this->secretKey === '') {
            throw new S3StorageException('S3 bucket and credentials are required');
        }
    }

    /**
     * Upload a local file. Streams from disk, no full in-memory copy.
     */
    public function putObject(string $key, string $filePath, string $contentType = 'application/octet-stream'): void {
        $size = @filesize($filePath);
        if ($size === false) {
            throw new S3StorageException('Cannot read source file: ' . $filePath);
        }
        $payloadHash = hash_file('sha256', $filePath);
        if ($payloadHash === false) {
            throw new S3StorageException('Cannot hash source file: ' . $filePath);
        }

        $fh = fopen($filePath, 'rb');
        if ($fh === false) {
            throw new S3StorageException('Cannot open source file: ' . $filePath);
        }

        try {
            $this->request('PUT', $key, [], [
                'payload_hash' => $payloadHash,
                'headers' => ['content-type' => $contentType],
                'curl' => [
                    CURLOPT_UPLOAD => true,
                    CURLOPT_INFILE => $fh,
                    CURLOPT_INFILESIZE => $size,
                ],
            ]);
        } finally {
            fclose($fh);
        }
    }

    /**
     * Upload from an in-memory string (small generated files such as
     * Excalidraw previews or base64-converted images).
     */
    public function putObjectContent(string $key, string $content, string $contentType = 'application/octet-stream'): void {
        $this->request('PUT', $key, [], [
            'payload_hash' => hash('sha256', $content),
            'headers' => ['content-type' => $contentType],
            'body' => $content,
        ]);
    }

    /**
     * Download an object into a local file.
     */
    public function getObjectToFile(string $key, string $destPath): void {
        $fh = fopen($destPath, 'wb');
        if ($fh === false) {
            throw new S3StorageException('Cannot open destination file: ' . $destPath);
        }

        try {
            $this->request('GET', $key, [], ['curl' => [CURLOPT_FILE => $fh]]);
        } catch (Exception $e) {
            fclose($fh);
            @unlink($destPath);
            throw $e;
        }
        fclose($fh);
    }

    /**
     * Stream an object straight to the PHP output (attachment downloads).
     * Headers must have been sent by the caller before this runs.
     */
    public function streamObject(string $key): void {
        $errorBody = '';
        $this->request('GET', $key, [], [
            'curl' => [
                CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$errorBody) {
                    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                    if ($status >= 200 && $status < 300) {
                        echo $chunk;
                    } else {
                        // Buffer the S3 error XML instead of leaking it to the client
                        $errorBody .= $chunk;
                    }
                    return strlen($chunk);
                },
            ],
            'error_body' => &$errorBody,
        ]);
    }

    public function deleteObject(string $key): void {
        $this->request('DELETE', $key);
    }

    /**
     * @return array|null ['size' => int, 'mtime' => int] or null when the object is absent
     */
    public function headObject(string $key): ?array {
        try {
            $result = $this->request('HEAD', $key, [], ['curl' => [CURLOPT_NOBODY => true]]);
        } catch (S3StorageException $e) {
            if ($e->getCode() === 404) {
                return null;
            }
            throw $e;
        }

        return [
            'size' => (int)($result['headers']['content-length'] ?? 0),
            'mtime' => isset($result['headers']['last-modified']) ? (strtotime($result['headers']['last-modified']) ?: 0) : 0,
        ];
    }

    /**
     * List every object under a prefix (paginates through ListObjectsV2).
     * @return array List of ['key' => string, 'size' => int]
     */
    public function listObjects(string $prefix, int $maxTotal = 0): array {
        $objects = [];
        $continuationToken = null;

        do {
            $query = ['list-type' => '2', 'prefix' => $prefix, 'max-keys' => '1000'];
            if ($continuationToken !== null) {
                $query['continuation-token'] = $continuationToken;
            }

            $result = $this->request('GET', '', $query);
            $xml = @simplexml_load_string($result['body']);
            if ($xml === false) {
                throw new S3StorageException('Unreadable ListObjectsV2 response');
            }

            foreach ($xml->Contents as $item) {
                $objects[] = ['key' => (string)$item->Key, 'size' => (int)$item->Size];
                if ($maxTotal > 0 && count($objects) >= $maxTotal) {
                    return $objects;
                }
            }

            $continuationToken = ((string)$xml->IsTruncated === 'true' && isset($xml->NextContinuationToken))
                ? (string)$xml->NextContinuationToken
                : null;
        } while ($continuationToken !== null);

        return $objects;
    }

    /**
     * Cheap connectivity + credentials + bucket check.
     * @return array ['success' => bool, 'error' => string|null]
     */
    public function testConnection(): array {
        try {
            $this->listObjects('', 1);
            return ['success' => true, 'error' => null];
        } catch (Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    // ------------------------------------------------------------------
    // Signature V4 plumbing
    // ------------------------------------------------------------------

    private function hostHeader(): string {
        $host = $this->pathStyle ? $this->host : ($this->bucket . '.' . $this->host);
        if ($this->port !== null && $this->port !== ($this->scheme === 'https' ? 443 : 80)) {
            $host .= ':' . $this->port;
        }
        return $host;
    }

    private function canonicalUri(string $key): string {
        $path = $this->pathStyle ? '/' . $this->bucket : '';
        if ($key !== '') {
            $segments = array_map('rawurlencode', explode('/', $key));
            $path .= '/' . implode('/', $segments);
        }
        return $path === '' ? '/' : ($path . ($key === '' ? '/' : ''));
    }

    private function request(string $method, string $key, array $query = [], array $options = []): array {
        $amzDate = gmdate('Ymd\THis\Z');
        $dateStamp = gmdate('Ymd');
        $payloadHash = $options['payload_hash'] ?? hash('sha256', $options['body'] ?? '');

        $canonicalUri = $this->canonicalUri($key);

        ksort($query);
        $canonicalQuery = [];
        foreach ($query as $k => $v) {
            $canonicalQuery[] = rawurlencode($k) . '=' . rawurlencode($v);
        }
        $canonicalQuery = implode('&', $canonicalQuery);

        $headers = [
            'host' => $this->hostHeader(),
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $amzDate,
        ];
        foreach (($options['headers'] ?? []) as $k => $v) {
            $headers[strtolower($k)] = $v;
        }
        ksort($headers);

        $canonicalHeaders = '';
        foreach ($headers as $k => $v) {
            $canonicalHeaders .= $k . ':' . trim($v) . "\n";
        }
        $signedHeaders = implode(';', array_keys($headers));

        $canonicalRequest = implode("\n", [
            $method,
            $canonicalUri,
            $canonicalQuery,
            $canonicalHeaders,
            $signedHeaders,
            $payloadHash,
        ]);

        $scope = $dateStamp . '/' . $this->region . '/s3/aws4_request';
        $stringToSign = implode("\n", [
            'AWS4-HMAC-SHA256',
            $amzDate,
            $scope,
            hash('sha256', $canonicalRequest),
        ]);

        $kDate = hash_hmac('sha256', $dateStamp, 'AWS4' . $this->secretKey, true);
        $kRegion = hash_hmac('sha256', $this->region, $kDate, true);
        $kService = hash_hmac('sha256', 's3', $kRegion, true);
        $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
        $signature = hash_hmac('sha256', $stringToSign, $kSigning);

        $authorization = 'AWS4-HMAC-SHA256 Credential=' . $this->accessKey . '/' . $scope
            . ', SignedHeaders=' . $signedHeaders
            . ', Signature=' . $signature;

        $requestHeaders = ['Authorization: ' . $authorization];
        foreach ($headers as $k => $v) {
            if ($k !== 'host') {
                $requestHeaders[] = $k . ': ' . $v;
            }
        }

        $url = $this->scheme . '://' . $headers['host'] . $canonicalUri
            . ($canonicalQuery !== '' ? '?' . $canonicalQuery : '');

        $ch = curl_init($url);
        $responseHeaders = [];
        $baseOptions = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $requestHeaders,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 900,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$responseHeaders) {
                $pos = strpos($line, ':');
                if ($pos !== false) {
                    $responseHeaders[strtolower(trim(substr($line, 0, $pos)))] = trim(substr($line, $pos + 1));
                }
                return strlen($line);
            },
        ];
        if (isset($options['body'])) {
            $baseOptions[CURLOPT_POSTFIELDS] = $options['body'];
        }
        foreach (($options['curl'] ?? []) as $opt => $value) {
            $baseOptions[$opt] = $value;
        }
        curl_setopt_array($ch, $baseOptions);

        $body = curl_exec($ch);
        $curlError = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($body === false && $curlError !== '') {
            throw new S3StorageException('S3 connection failed: ' . $curlError);
        }

        if ($status < 200 || $status >= 300) {
            $errorBody = is_string($body) ? $body : '';
            if ($errorBody === '' && isset($options['error_body'])) {
                $errorBody = (string)$options['error_body'];
            }
            $message = 'HTTP ' . $status;
            if ($errorBody !== '' && ($xml = @simplexml_load_string($errorBody)) !== false) {
                $code = (string)($xml->Code ?? '');
                $msg = (string)($xml->Message ?? '');
                if ($code !== '' || $msg !== '') {
                    $message .= ' ' . trim($code . ': ' . $msg, ': ');
                }
            }
            throw new S3StorageException('S3 request failed (' . $message . ')', $status);
        }

        return [
            'status' => $status,
            'headers' => $responseHeaders,
            'body' => is_string($body) ? $body : '',
        ];
    }
}

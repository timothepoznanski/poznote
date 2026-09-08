<?php
/**
 * Bootstrap for the integration suite.
 *
 * Unlike tests/*.test.php, these tests need a running Poznote: they speak HTTP
 * to a real instance, create throwaway accounts through the admin API, and put
 * real rows in real per-user databases. That is the point. The isolation
 * guarantees this suite checks - one account cannot read or write another
 * account's notes, folders, attachments, shares - live in the router, in
 * auth.php and in the controllers' WHERE clauses, none of which a pure unit
 * test can reach.
 *
 * Because it needs a server it is NOT picked up by tests/run.php and does not
 * run in CI. Run it by hand against the dev instance:
 *
 *   POZNOTE_TEST_PASSWORD=<admin password> php tests/integration/run.php
 *
 * Point it elsewhere with POZNOTE_TEST_URL / POZNOTE_TEST_USER. Never point it
 * at an instance holding real data: it creates and deletes accounts, and the
 * replay pass deliberately fires destructive requests.
 */

require_once dirname(__DIR__) . '/bootstrap.php';

/** Reads a setting from the environment, with a default for local dev. */
function env(string $name, ?string $default = null): string
{
    $value = getenv($name);
    if ($value === false || $value === '') {
        if ($default === null) {
            fwrite(STDERR, "Missing required environment variable $name\n");
            exit(2);
        }
        return $default;
    }
    return $value;
}

/** One HTTP response, decoded far enough to assert on. */
final class Response
{
    public function __construct(
        public readonly int $status,
        public readonly string $body,
        public readonly ?array $json,
    ) {}

    /** True when the payload mentions the needle anywhere, key or value. */
    public function mentions(string $needle): bool
    {
        return $needle !== '' && stripos($this->body, $needle) !== false;
    }

    public function summary(int $max = 160): string
    {
        $body = preg_replace('/\s+/', ' ', trim($this->body));
        return $this->status . ' ' . (strlen($body) > $max ? substr($body, 0, $max) . '…' : $body);
    }
}

/**
 * A Poznote API v1 client, one instance per identity under test.
 *
 * Deliberately cookie-less: every request carries its own Basic credentials
 * and X-User-ID. A cookie jar would let a session pin the request to whatever
 * profile authenticated first, which is exactly the confusion this suite is
 * supposed to detect rather than inherit.
 */
final class ApiClient
{
    public function __construct(
        private string $baseUrl,
        private string $username,
        private string $password,
        private ?int $userId = null,
    ) {}

    public function withUserId(?int $userId): self
    {
        return new self($this->baseUrl, $this->username, $this->password, $userId);
    }

    public function userId(): ?int
    {
        return $this->userId;
    }

    public function username(): string
    {
        return $this->username;
    }

    /**
     * @param array{query?:array,json?:array,form?:array,upload?:array{name:string,type:string,content:string},raw?:string} $options
     */
    public function request(string $method, string $path, array $options = []): Response
    {
        $url = $this->baseUrl . '/api/v1' . $path;
        if (!empty($options['query'])) {
            $url .= (strpos($url, '?') === false ? '?' : '&') . http_build_query($options['query']);
        }

        $headers = ['Accept: application/json'];
        if ($this->userId !== null) {
            $headers[] = 'X-User-ID: ' . $this->userId;
        }

        $body = null;
        if (isset($options['json'])) {
            $body = json_encode($options['json']);
            $headers[] = 'Content-Type: application/json';
        } elseif (isset($options['form'])) {
            $body = http_build_query($options['form']);
            $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        } elseif (isset($options['upload'])) {
            [$body, $contentType] = self::multipart($options['upload']);
            $headers[] = 'Content-Type: ' . $contentType;
        } elseif (isset($options['raw'])) {
            $body = $options['raw'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_USERPWD => $this->username . ':' . $this->password,
            CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CONNECTTIMEOUT => 5,
            // Downloads (attachments, backup archives) can be large and we only
            // ever assert on the status and the first kilobytes.
            CURLOPT_BUFFERSIZE => 65536,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new RuntimeException("$method $path failed: $error");
        }
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = json_decode($raw, true);
        return new Response($status, $raw, is_array($decoded) ? $decoded : null);
    }

    public function get(string $path, array $options = []): Response
    {
        return $this->request('GET', $path, $options);
    }

    public function post(string $path, array $options = []): Response
    {
        return $this->request('POST', $path, $options);
    }

    /** @param array{name:string,type:string,content:string} $file */
    private static function multipart(array $file): array
    {
        $boundary = '----poznote' . bin2hex(random_bytes(8));
        $body = "--$boundary\r\n"
            . 'Content-Disposition: form-data; name="file"; filename="' . $file['name'] . "\"\r\n"
            . 'Content-Type: ' . $file['type'] . "\r\n\r\n"
            . $file['content'] . "\r\n"
            . "--$boundary--\r\n";
        return [$body, 'multipart/form-data; boundary=' . $boundary];
    }
}

/** Asserts a response status is one of the allowed codes. */
function assertStatusIn(array $allowed, Response $response, string $what): void
{
    if (!in_array($response->status, $allowed, true)) {
        fail(sprintf('%s: expected %s, got %s', $what, implode('/', $allowed), $response->summary()));
    }
}

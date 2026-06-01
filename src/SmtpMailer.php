<?php

class SmtpMailer {
    private array $config;
    /** @var resource|null */
    private $socket = null;
    private string $lastResponse = '';

    public function __construct(array $config) {
        $this->config = $config;
    }

    public function send(string $toEmail, string $toName, string $subject, string $textBody, ?string $htmlBody = null): void {
        $fromEmail = trim((string)($this->config['from_email'] ?? ''));
        $fromName = trim((string)($this->config['from_name'] ?? 'Poznote'));
        $toEmail = trim($toEmail);
        $toName = trim($toName);

        if (!filter_var($fromEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid SMTP from email');
        }
        if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Invalid recipient email');
        }

        $message = $this->buildMessage($toEmail, $toName, $subject, $textBody, $htmlBody);

        $this->connect();
        try {
            $this->sendCommand('MAIL FROM:<' . $fromEmail . '>', [250]);
            $this->sendCommand('RCPT TO:<' . $toEmail . '>', [250, 251]);
            $this->sendCommand('DATA', [354]);
            $this->sendData($message);
            $this->expect([250]);
            $this->sendCommand('QUIT', [221]);
        } finally {
            $this->disconnect();
        }
    }

    private function connect(): void {
        $host = trim((string)($this->config['host'] ?? ''));
        $port = (int)($this->config['port'] ?? 587);
        $security = strtolower(trim((string)($this->config['security'] ?? 'tls')));
        $timeout = max(3, min(60, (int)($this->config['timeout'] ?? 15)));

        if ($host === '') {
            throw new InvalidArgumentException('SMTP host is required');
        }
        if ($port < 1 || $port > 65535) {
            throw new InvalidArgumentException('Invalid SMTP port');
        }

        $remote = ($security === 'ssl' ? 'ssl://' : '') . $host . ':' . $port;
        $errno = 0;
        $errstr = '';
        $this->socket = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
        if (!$this->socket) {
            throw new RuntimeException('SMTP connection failed: ' . ($errstr ?: ('error ' . $errno)));
        }

        stream_set_timeout($this->socket, $timeout);
        $this->expect([220]);

        $this->sendCommand('EHLO ' . $this->getHelloName(), [250]);

        if ($security === 'tls') {
            $this->sendCommand('STARTTLS', [220]);
            $enabled = @stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($enabled !== true) {
                throw new RuntimeException('SMTP STARTTLS negotiation failed');
            }
            $this->sendCommand('EHLO ' . $this->getHelloName(), [250]);
        }

        $username = (string)($this->config['username'] ?? '');
        $password = (string)($this->config['password'] ?? '');
        if ($username !== '') {
            $this->sendCommand('AUTH LOGIN', [334]);
            $this->sendCommand(base64_encode($username), [334]);
            $this->sendCommand(base64_encode($password), [235]);
        }
    }

    private function disconnect(): void {
        if (is_resource($this->socket)) {
            fclose($this->socket);
        }
        $this->socket = null;
    }

    private function sendCommand(string $command, array $expectedCodes): void {
        if (!is_resource($this->socket)) {
            throw new RuntimeException('SMTP socket is not connected');
        }

        if (@fwrite($this->socket, $command . "\r\n") === false) {
            throw new RuntimeException('SMTP write failed');
        }

        $this->expect($expectedCodes);
    }

    private function sendData(string $message): void {
        if (!is_resource($this->socket)) {
            throw new RuntimeException('SMTP socket is not connected');
        }

        $message = preg_replace("/\r\n|\r|\n/", "\r\n", $message);
        $message = preg_replace('/^\./m', '..', $message);

        if (@fwrite($this->socket, $message . "\r\n.\r\n") === false) {
            throw new RuntimeException('SMTP DATA write failed');
        }
    }

    private function expect(array $expectedCodes): void {
        $code = $this->readResponseCode();
        if (!in_array($code, $expectedCodes, true)) {
            throw new RuntimeException('Unexpected SMTP response ' . $code . ': ' . trim($this->lastResponse));
        }
    }

    private function readResponseCode(): int {
        if (!is_resource($this->socket)) {
            throw new RuntimeException('SMTP socket is not connected');
        }

        $this->lastResponse = '';
        $code = 0;

        while (($line = fgets($this->socket, 515)) !== false) {
            $this->lastResponse .= $line;
            if (preg_match('/^(\d{3})([ -])/', $line, $m)) {
                $code = (int)$m[1];
                if ($m[2] === ' ') {
                    return $code;
                }
            }
        }

        $meta = stream_get_meta_data($this->socket);
        if (!empty($meta['timed_out'])) {
            throw new RuntimeException('SMTP response timeout');
        }

        throw new RuntimeException('SMTP connection closed unexpectedly');
    }

    private function buildMessage(string $toEmail, string $toName, string $subject, string $textBody, ?string $htmlBody): string {
        $fromEmail = trim((string)$this->config['from_email']);
        $fromName = trim((string)($this->config['from_name'] ?? 'Poznote'));
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $this->formatAddress($fromEmail, $fromName),
            'To: ' . $this->formatAddress($toEmail, $toName),
            'Subject: ' . $this->encodeHeader($subject),
            'MIME-Version: 1.0',
        ];

        if ($htmlBody !== null && trim($htmlBody) !== '') {
            $boundary = 'poznote_' . bin2hex(random_bytes(16));
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';

            return implode("\r\n", $headers) . "\r\n\r\n"
                . '--' . $boundary . "\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n"
                . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
                . quoted_printable_encode($textBody) . "\r\n\r\n"
                . '--' . $boundary . "\r\n"
                . "Content-Type: text/html; charset=UTF-8\r\n"
                . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
                . quoted_printable_encode($htmlBody) . "\r\n\r\n"
                . '--' . $boundary . '--';
        }

        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: quoted-printable';

        return implode("\r\n", $headers) . "\r\n\r\n" . quoted_printable_encode($textBody);
    }

    private function formatAddress(string $email, string $name): string {
        $name = trim($name);
        if ($name === '') {
            return '<' . $email . '>';
        }
        return $this->encodeHeader($name) . ' <' . $email . '>';
    }

    private function encodeHeader(string $value): string {
        $value = str_replace(["\r", "\n"], '', $value);
        if ($value === '') {
            return '';
        }
        if (preg_match('/[^\x20-\x7E]/', $value)) {
            return '=?UTF-8?B?' . base64_encode($value) . '?=';
        }
        return $value;
    }

    private function getHelloName(): string {
        $host = gethostname() ?: 'poznote.local';
        $host = preg_replace('/[^A-Za-z0-9.-]/', '-', $host);
        return $host ?: 'poznote.local';
    }
}

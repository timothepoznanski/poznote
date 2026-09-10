<?php
require_once dirname(__DIR__) . '/src/config.php';

// config.php wraps every HTTP response in an output handler that writes the
// theme list and the custom stylesheet into the document head. Two things keep
// that buffer from swallowing a download: the handler is given a chunk size,
// so a body written in small pieces is flushed as it grows, and files go out
// through poznoteSendFile(), which closes every buffer first, because
// readfile() is one single write that no chunk size can split. In 6.84.0,
// with a theme list configured, a 900 MB complete backup died on memory_limit
// before its first byte reached the browser. These tests pin both mechanisms
// and what chunking means for the injection itself.

$injectedScript = '<script>window.__poznoteThemeList=[{"id":"light"}];</script>';
$injectedLink = '<link rel="stylesheet" id="poznote-custom-css" data-poznote-custom-css="1">';
$htmlPage = "<!DOCTYPE html>\n<html lang=\"en\"><head><title>x</title></head><body>hello</body></html>";

test('the head of an HTML page gets the theme list after <head> and the stylesheet before </head>', function () use ($injectedScript, $injectedLink, $htmlPage) {
    assertSame(
        "<!DOCTYPE html>\n<html lang=\"en\"><head>\n" . $injectedScript . '<title>x</title>' . $injectedLink . "\n</head><body>hello</body></html>",
        poznoteInjectIntoHtmlHead($htmlPage, $injectedScript, $injectedLink)
    );
});

test('a page that already carries both snippets is left alone', function () use ($injectedScript, $injectedLink, $htmlPage) {
    $done = poznoteInjectIntoHtmlHead($htmlPage, $injectedScript, $injectedLink);
    assertSame($done, poznoteInjectIntoHtmlHead($done, $injectedScript, $injectedLink));
});

test('with nothing configured the page is returned byte for byte', function () use ($htmlPage) {
    assertSame($htmlPage, poznoteInjectIntoHtmlHead($htmlPage, '', ''));
});

test('only the first chunk of an HTML response is a candidate for the head', function () use ($htmlPage) {
    assertTrue(poznoteOutputChunkCanCarryHead($htmlPage, PHP_OUTPUT_HANDLER_START | PHP_OUTPUT_HANDLER_FINAL), 'whole page');
    assertTrue(poznoteOutputChunkCanCarryHead($htmlPage, PHP_OUTPUT_HANDLER_START | PHP_OUTPUT_HANDLER_WRITE), 'first chunk of a big page');
    // A later chunk that happens to contain head tags, say a note showing
    // HTML source, is not the document head.
    $decoy = str_repeat('.', 100) . '<head><title>decoy</title></head>' . str_repeat('.', 100);
    assertFalse(poznoteOutputChunkCanCarryHead($decoy, PHP_OUTPUT_HANDLER_WRITE), 'middle chunk');
    assertFalse(poznoteOutputChunkCanCarryHead($decoy, PHP_OUTPUT_HANDLER_FINAL), 'last chunk');
});

test('a binary chunk is never touched', function () {
    $zip = "PK\x03\x04" . str_repeat("\x00\x01\xff<h", 700);
    assertFalse(poznoteOutputChunkCanCarryHead($zip, PHP_OUTPUT_HANDLER_START | PHP_OUTPUT_HANDLER_FINAL));
    assertSame($zip, poznoteInjectCustomCssIntoHtml($zip, PHP_OUTPUT_HANDLER_START | PHP_OUTPUT_HANDLER_FINAL));
});

test('through a real chunked buffer the head is rewritten once and decoys survive', function () use ($injectedScript, $injectedLink) {
    $calls = 0;
    $handler = function ($buffer, $phase) use (&$calls, $injectedScript, $injectedLink) {
        $calls++;
        if (!poznoteOutputChunkCanCarryHead($buffer, $phase)) {
            return $buffer;
        }
        return poznoteInjectIntoHtmlHead($buffer, $injectedScript, $injectedLink);
    };

    ob_start();
    ob_start($handler, 4096);
    try {
        echo "<!DOCTYPE html>\n<html><head><title>x</title></head><body>";
        for ($i = 0; $i < 500; $i++) {
            echo str_repeat('.', 1000), '<head></head>';
        }
        echo '</body></html>';
    } finally {
        ob_end_flush();
        $out = ob_get_clean();
    }

    assertTrue($calls > 50, 'handler called per chunk, got ' . $calls);
    assertSame(1, substr_count($out, $injectedScript), 'theme list once');
    assertSame(1, substr_count($out, $injectedLink), 'stylesheet once');
    assertContains("<html><head>\n" . $injectedScript . '<title>x</title>' . $injectedLink . "\n</head><body>", $out);
    assertSame(500, substr_count($out, '<head></head>'), 'decoys untouched');
});

test('a chunked buffer never holds more than one chunk of a body written in pieces', function () {
    $measure = function (int $chunkSize) {
        $peak = 0;
        $base = memory_get_usage();
        // Discard everything: the outer capture buffer then stays empty and
        // the usage seen from inside the handler is the handler's own buffer.
        $handler = function ($buffer) use (&$peak) {
            $peak = max($peak, memory_get_usage());
            return '';
        };
        ob_start();
        ob_start($handler, $chunkSize);
        try {
            $piece = str_repeat('z', 8192);
            for ($i = 0; $i < 4096; $i++) { // 32 MB in 8 KB writes
                echo $piece;
            }
        } finally {
            ob_end_flush();
            ob_end_clean();
        }
        return $peak - $base;
    };

    $unbounded = $measure(0);
    $bounded = $measure(POZNOTE_OUTPUT_CHUNK_BYTES);
    assertTrue($unbounded >= 32 * 1024 * 1024, 'without a chunk size the whole body sits in memory, saw ' . $unbounded);
    assertTrue($bounded < 3 * POZNOTE_OUTPUT_CHUNK_BYTES, 'with one it stays around a chunk, saw ' . $bounded);
});

test('poznoteSendFile() streams a file larger than memory_limit through every buffer', function () {
    if (!function_exists('exec') || PHP_BINARY === '') {
        return;
    }
    $dir = sys_get_temp_dir();
    $file = tempnam($dir, 'pz-send-');
    $script = tempnam($dir, 'pz-send-');
    $errFile = tempnam($dir, 'pz-send-');
    try {
        $fh = fopen($file, 'wb');
        $piece = str_repeat("PK\x03\x04", 256 * 1024); // 1 MB
        for ($i = 0; $i < 64; $i++) {
            fwrite($fh, $piece);
        }
        fclose($fh);
        $size = filesize($file);

        // The request as php-fpm runs it: config.php's injection buffer with
        // a page-level ob_start() on top (what api_export_*.php do), then the
        // download, under a memory limit well below the file size.
        file_put_contents($script, '<?php
            require ' . var_export(dirname(__DIR__) . '/src/config.php', true) . ';
            ob_start(\'poznoteInjectCustomCssIntoHtml\', POZNOTE_OUTPUT_CHUNK_BYTES);
            ob_start();
            $sent = poznoteSendFile(' . var_export($file, true) . ');
            fwrite(STDERR, json_encode([\'sent\' => $sent, \'levels\' => ob_get_level()]));
        ');
        $cmd = escapeshellarg(PHP_BINARY) . ' -d memory_limit=32M -d display_errors=stderr '
            . escapeshellarg($script) . ' 2>' . escapeshellarg($errFile) . ' | wc -c';
        exec($cmd, $lines);
        $report = json_decode((string)file_get_contents($errFile), true);
        assertTrue(is_array($report), 'subprocess died: ' . trim((string)file_get_contents($errFile)));
        assertSame($size, $report['sent'], 'bytes readfile() reported');
        assertSame($size, (int)trim(implode('', $lines)), 'bytes that reached stdout');
        assertSame(0, $report['levels'], 'buffers left open');
    } finally {
        @unlink($file);
        @unlink($script);
        @unlink($errFile);
    }
});

test('a response carrying a Content-Disposition header is a file, never a page', function () {
    assertTrue(poznoteResponseIsFileDownload(['Content-Type: text/html', 'Content-Disposition: attachment; filename="note.html"']));
    assertTrue(poznoteResponseIsFileDownload(['content-disposition: inline; filename="a.txt"']), 'header names are case insensitive');
    assertFalse(poznoteResponseIsFileDownload(['Content-Type: text/html; charset=UTF-8']));
    assertFalse(poznoteResponseIsFileDownload([]));
    // A page mentioning the header name in its body is still a page.
    assertFalse(poznoteResponseIsFileDownload(['X-Note: Content-Disposition: attachment']));
});

test('every endpoint that sends a file closes the output buffers first', function () {
    // The injection buffer holds whatever a request writes until the response
    // ends, so a download that does not close it is copied into memory in full
    // and, when it is served as text/html, gets page markup written into it.
    // Endpoints are found by the header they must send, so a new download
    // cannot be added without answering this.
    $closers = ['poznoteSendFile(', 'poznoteEndOutputBuffers(', 'ob_end_clean('];
    $offenders = [];
    $seen = 0;
    $root = dirname(__DIR__) . '/src';
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        if ($file->getExtension() !== 'php') {
            continue;
        }
        $code = (string)file_get_contents($file->getPathname());
        if (!preg_match('/header\s*\(\s*[\'"]Content-Disposition:/i', $code)) {
            continue;
        }
        $seen++;
        foreach ($closers as $closer) {
            if (strpos($code, $closer) !== false) {
                continue 2;
            }
        }
        $offenders[] = substr($file->getPathname(), strlen($root) + 1);
    }

    assertTrue($seen >= 12, 'download endpoints found: ' . $seen);
    assertSame([], $offenders, 'endpoints sending a file through the output buffers');
});

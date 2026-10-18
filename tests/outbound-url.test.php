<?php
lib('outbound-url');

// GHSA-mr2c-9992-59wx: URLs typed by an account (webhooks, personal AI and
// speech servers, MCP servers, Git Sync API base) made the server call its own
// loopback, its LAN and the cloud metadata address. A restricted URL must end
// up on a public address, however the host is spelled. DNS is replaced by a
// fixed table so these cases do not depend on the network.

function outboundTestResolver(): callable
{
    return function (string $host): array {
        $table = [
            'example.com' => ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
            'internal.example' => ['10.1.2.3'],
            'split.example' => ['93.184.215.14', '127.0.0.1'],
            'ollama.lan' => ['192.168.1.20'],
            'nas.home.arpa' => ['192.168.1.30'],
            'metadata.example' => ['169.254.169.254'],
            'mapped.example' => ['::ffff:127.0.0.1'],
        ];
        return $table[$host] ?? [];
    };
}

function outboundTestCheck(string $url, string $allow = ''): array
{
    return poznoteOutboundCheckUrl($url, true, poznoteOutboundAllowList($allow), outboundTestResolver());
}

test('loopback, private, link-local and reserved addresses are not public', function () {
    foreach ([
        '127.0.0.1', '127.255.0.9', '0.0.0.0', '10.0.0.1', '172.16.0.1', '172.31.255.255',
        '192.168.1.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
        '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
        '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', '2002:a9fe:a9fe::',
        '::127.0.0.1', '2001:db8::1',
    ] as $ip) {
        assertFalse(poznoteOutboundIpIsPublic($ip), $ip);
    }
});

test('public addresses stay public, including the IPv6 forms that carry one', function () {
    foreach (['93.184.215.14', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::'] as $ip) {
        assertTrue(poznoteOutboundIpIsPublic($ip), $ip);
    }
    assertFalse(poznoteOutboundIpIsPublic('not-an-ip'));
});

test('a restricted URL is refused when it names a local address in any spelling', function () {
    foreach ([
        'http://127.0.0.1/',
        'http://127.0.0.1:9/',
        'http://169.254.169.254/latest/meta-data/',
        'http://[::1]/',
        'http://[::ffff:127.0.0.1]/',
        'http://[fe80::1%25eth0]/',
        'http://2130706433/',
        'http://0x7f000001/',
        'http://0x7f.1/',
        'http://127.1/',
        'http://0177.0.0.1/',
        'http://127.0.0.%31/',
        'http://localhost./',
        'http://internal.example/',
        'http://metadata.example/',
        'http://mapped.example/',
        'http://split.example/',
        'http://unknown.example/',
    ] as $url) {
        $check = outboundTestCheck($url);
        assertFalse($check['ok'], $url);
        assertSame(POZNOTE_OUTBOUND_BLOCKED_MESSAGE, $check['error'], $url);
    }
});

test('an unresolvable name and a private one get the same answer', function () {
    assertSame(outboundTestCheck('http://unknown.example/')['error'], outboundTestCheck('http://internal.example/')['error']);
});

test('a public host passes and the connection is pinned to the checked addresses', function () {
    $check = outboundTestCheck('https://example.com/hook');
    assertTrue($check['ok']);
    assertSame(['example.com:443:93.184.215.14,[2606:2800:21f:cb07:6820:80da:af6b:8b2c]'], $check['resolve']);

    $check = outboundTestCheck('http://example.com:8080/hook');
    assertSame(['example.com:8080:93.184.215.14,[2606:2800:21f:cb07:6820:80da:af6b:8b2c]'], $check['resolve']);

    $check = outboundTestCheck('http://93.184.215.14/hook');
    assertTrue($check['ok']);
    assertSame([], $check['resolve']);
});

test('the administrator allow-list opens hosts and networks, nothing more', function () {
    assertTrue(outboundTestCheck('http://ollama.lan:11434/v1', 'ollama.lan')['ok']);
    assertTrue(outboundTestCheck('http://nas.home.arpa/', '*.home.arpa')['ok']);
    assertTrue(outboundTestCheck('http://ollama.lan/', '192.168.1.0/24')['ok']);
    assertTrue(outboundTestCheck('http://192.168.1.20:5678/webhook', '192.168.1.0/24')['ok']);
    assertTrue(outboundTestCheck('http://[fd00::5]/', 'fd00::/8')['ok']);

    assertFalse(outboundTestCheck('http://internal.example/', 'ollama.lan, 192.168.1.0/24')['ok']);
    assertFalse(outboundTestCheck('http://127.0.0.1/', '192.168.1.0/24')['ok']);
    assertFalse(outboundTestCheck('http://ollama.lan/', '192.168.2.0/24')['ok']);
    assertFalse(outboundTestCheck('http://evil-ollama.lan/', 'ollama.lan')['ok']);
});

test('the allow-list reader keeps hosts, wildcards and networks', function () {
    $list = poznoteOutboundAllowList(" Ollama.LAN, *.home.arpa;10.0.0.0/8\n[fd00::1] ,, bad/host ");
    assertSame(['ollama.lan', '.home.arpa'], $list['hosts']);
    assertSame(['10.0.0.0/8', 'fd00::1'], $list['networks']);
});

test('the settings page stores canonical entries and names the unreadable ones', function () {
    $parsed = poznoteOutboundParseAllowList("Ollama.LAN\n.home.arpa\n*.Home.Arpa\n192.168.1.0/24\n[FD00::0001]\n10.0.0.0/33\nhttp://x\n::1/129\nollama.lan");
    assertSame(['ollama.lan', '*.home.arpa', '192.168.1.0/24', 'fd00::1'], $parsed['entries']);
    assertSame(['10.0.0.0/33', 'http://x', '::1/129'], $parsed['invalid']);
    assertSame(['entries' => [], 'invalid' => []], poznoteOutboundParseAllowList(" \n\n "));
});

test('an unrestricted URL only needs an http(s) scheme', function () {
    $check = poznoteOutboundCheckUrl('http://127.0.0.1:11434/v1', false);
    assertTrue($check['ok']);
    assertSame([], $check['resolve']);
    foreach (['file:///etc/passwd', 'gopher://127.0.0.1/', 'http:///nohost', ''] as $url) {
        assertFalse(poznoteOutboundCheckUrl($url, false)['ok'], $url);
    }
});

test('CIDR matching handles prefix lengths that do not end on a byte', function () {
    assertTrue(poznoteOutboundIpInCidr('172.31.0.1', '172.16.0.0/12'));
    assertFalse(poznoteOutboundIpInCidr('172.32.0.1', '172.16.0.0/12'));
    assertTrue(poznoteOutboundIpInCidr('100.127.255.255', '100.64.0.0/10'));
    assertFalse(poznoteOutboundIpInCidr('10.0.0.1', '::/0'));
    assertFalse(poznoteOutboundIpInCidr('10.0.0.1', '10.0.0.0/33'));
});

test('without a known admin account, URLs are restricted', function () {
    assertTrue(poznoteOutboundRestrictedForUser(null));
    assertTrue(poznoteOutboundRestrictedForUser(0));
});

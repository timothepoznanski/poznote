<?php
/**
 * May the server send a request to this URL on this account's word?
 *
 * Several features make the server itself call a URL that an account typed:
 * user webhooks, the personal AI and speech-to-text servers, the user's own
 * MCP servers, the Git Sync API base. Without a check, any account on a
 * multi-user instance can point one of them at the server's loopback, its
 * Docker network, the LAN or a cloud metadata service, and read the answer or
 * at least tell open ports from closed ones (GHSA-mr2c-9992-59wx).
 *
 * Reaching local addresses is also what most self-hosters want: Ollama on the
 * same box, Forgejo or n8n on the LAN. So the rule depends on who typed the
 * URL. An administrator already controls the server, their URLs go anywhere.
 * Any other account is limited to public internet addresses, plus the hosts
 * and networks the administrator lists in Settings > Local network access
 * (global setting outbound_allowed_hosts, one entry per line: "ollama.lan",
 * "*.home.arpa", "192.168.1.0/24", "fd00::/8").
 *
 * The check runs on the addresses the name resolves to, and the request is
 * then pinned to those very addresses (CURLOPT_RESOLVE), so a DNS answer that
 * changes between the check and the connection cannot slip through (a proxy
 * set in the environment resolves names itself: that one is the
 * administrator's to restrict). Redirects
 * are not followed by curl for a restricted request: a caller that needs them
 * follows them itself and checks every hop.
 *
 * Every refusal reads the same, whether the name points at a private address
 * or does not resolve at all, so the answer tells nothing about the internal
 * network.
 *
 * No database, no session: tests/outbound-url.test.php loads it on its own.
 * The setting and the account are looked up only when the functions that
 * read them exist.
 */

/** The one answer a refused URL gets, whatever the reason. */
const POZNOTE_OUTBOUND_BLOCKED_MESSAGE = 'This address is not allowed: it must be a public internet host. An administrator can allow local hosts in Settings, Local network access.';

/** Most entries the allow-list keeps. */
const POZNOTE_OUTBOUND_ALLOW_LIST_MAX = 100;

/**
 * Networks that are not the public internet: loopback, private, link-local
 * (cloud metadata lives there), carrier-grade NAT, documentation, benchmark,
 * multicast and reserved ranges. IPv6 forms that carry an IPv4 address
 * (mapped, 6to4, NAT64) are checked on that address instead, see below.
 */
function poznoteOutboundNonPublicNetworks(): array
{
    return [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
        '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
        '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
        '::/96', '100::/64', '2001::/23', '2001:db8::/32', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
    ];
}

/** True when $ip (textual, v4 or v6) lies in $cidr. False on any malformed input. */
function poznoteOutboundIpInCidr(string $ip, string $cidr): bool
{
    $slash = strpos($cidr, '/');
    $net = $slash === false ? $cidr : substr($cidr, 0, $slash);
    $ipBin = @inet_pton($ip);
    $netBin = @inet_pton(trim($net, '[]'));
    if ($ipBin === false || $netBin === false || strlen($ipBin) !== strlen($netBin)) {
        return false;
    }
    $maxBits = strlen($ipBin) * 8;
    $bits = $slash === false ? $maxBits : substr($cidr, $slash + 1);
    if (!is_int($bits) && !ctype_digit((string)$bits)) {
        return false;
    }
    $bits = (int)$bits;
    if ($bits < 0 || $bits > $maxBits) {
        return false;
    }
    $whole = intdiv($bits, 8);
    if (substr($ipBin, 0, $whole) !== substr($netBin, 0, $whole)) {
        return false;
    }
    $rest = $bits % 8;
    if ($rest === 0) {
        return true;
    }
    $mask = (0xFF << (8 - $rest)) & 0xFF;
    return (ord($ipBin[$whole]) & $mask) === (ord($netBin[$whole]) & $mask);
}

/**
 * The IPv4 address an IPv6 one stands for, when it is one of the forms that
 * route to IPv4: mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::a.b.c.d) and 6to4
 * (2002:aabb:ccdd::). Null otherwise.
 */
function poznoteOutboundEmbeddedIpv4(string $ip): ?string
{
    $bin = @inet_pton($ip);
    if ($bin === false || strlen($bin) !== 16) {
        return null;
    }
    if (poznoteOutboundIpInCidr($ip, '::ffff:0:0/96') || poznoteOutboundIpInCidr($ip, '64:ff9b::/96')) {
        return inet_ntop(substr($bin, 12, 4));
    }
    if (poznoteOutboundIpInCidr($ip, '64:ff9b:1::/48')) {
        // Local-use NAT64 prefix: the IPv4 address is not at a fixed place
        return '0.0.0.0';
    }
    if (poznoteOutboundIpInCidr($ip, '2002::/16')) {
        return inet_ntop(substr($bin, 2, 4));
    }
    return null;
}

/** True when $ip is a public internet address. */
function poznoteOutboundIpIsPublic(string $ip): bool
{
    if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
        return false;
    }
    $embedded = poznoteOutboundEmbeddedIpv4($ip);
    if ($embedded !== null) {
        return poznoteOutboundIpIsPublic($embedded);
    }
    foreach (poznoteOutboundNonPublicNetworks() as $cidr) {
        if (poznoteOutboundIpInCidr($ip, $cidr)) {
            return false;
        }
    }
    return true;
}

/**
 * Read an allow-list as typed by an administrator: entries separated by
 * commas, semicolons, spaces or new lines. A host name ("ollama.lan"), any
 * subdomain ("*.home.arpa" or ".home.arpa"), an address ("192.168.1.20",
 * "fd00::1", "[fd00::1]") or a network ("192.168.1.0/24", "fd00::/8").
 *
 * Returns ['entries' => canonical entries as stored and shown, 'invalid' =>
 * the entries that are none of these].
 */
function poznoteOutboundParseAllowList(string $raw): array
{
    $entries = [];
    $invalid = [];
    foreach (preg_split('/[\s,;]+/', strtolower($raw)) ?: [] as $entry) {
        if ($entry === '') {
            continue;
        }
        $canonical = null;
        $slash = strpos($entry, '/');
        $address = trim($slash === false ? $entry : substr($entry, 0, $slash), '[]');
        if (filter_var($address, FILTER_VALIDATE_IP) !== false) {
            $address = (string)inet_ntop((string)inet_pton($address));
            if ($slash === false) {
                $canonical = $address;
            } else {
                $bits = substr($entry, $slash + 1);
                $max = strpos($address, ':') !== false ? 128 : 32;
                if (ctype_digit($bits) && (int)$bits <= $max) {
                    $canonical = $address . '/' . (int)$bits;
                }
            }
        } else {
            $name = strpos($entry, '*.') === 0 ? substr($entry, 1) : $entry;
            if (preg_match('/^\.?[a-z0-9_-]+(\.[a-z0-9_-]+)*$/', $name) === 1) {
                $canonical = $name[0] === '.' ? '*' . $name : $name;
            }
        }
        if ($canonical === null) {
            $invalid[] = $entry;
        } elseif (!in_array($canonical, $entries, true)) {
            $entries[] = $canonical;
        }
    }
    return ['entries' => array_slice($entries, 0, POZNOTE_OUTBOUND_ALLOW_LIST_MAX), 'invalid' => $invalid];
}

/**
 * The administrator's exceptions, from the outbound_allowed_hosts global
 * setting unless $raw is given. Returns ['hosts' => [...], 'networks' =>
 * [...]]: host names in lowercase, a "*.example" wildcard kept as ".example"
 * (any subdomain), networks as CIDR strings (a bare address is its own /32 or
 * /128). Invalid entries are ignored.
 */
function poznoteOutboundAllowList(?string $raw = null): array
{
    if ($raw === null) {
        $raw = function_exists('getGlobalSetting') ? (string)getGlobalSetting('outbound_allowed_hosts', '') : '';
    }
    $list = ['hosts' => [], 'networks' => []];
    foreach (poznoteOutboundParseAllowList($raw)['entries'] as $entry) {
        $address = explode('/', $entry, 2)[0];
        if (filter_var($address, FILTER_VALIDATE_IP) !== false) {
            $list['networks'][] = $entry;
        } else {
            $list['hosts'][] = strpos($entry, '*.') === 0 ? substr($entry, 1) : $entry;
        }
    }
    return $list;
}

function poznoteOutboundHostAllowed(string $host, array $allowList): bool
{
    foreach ($allowList['hosts'] as $allowed) {
        if ($allowed[0] === '.' ? str_ends_with($host, $allowed) : $host === $allowed) {
            return true;
        }
    }
    return false;
}

function poznoteOutboundIpAllowed(string $ip, array $allowList): bool
{
    if (poznoteOutboundIpIsPublic($ip)) {
        return true;
    }
    foreach ($allowList['networks'] as $cidr) {
        if (poznoteOutboundIpInCidr($ip, $cidr)) {
            return true;
        }
    }
    return false;
}

/**
 * Every address a host name resolves to, IPv4 through the system resolver
 * (so /etc/hosts counts, as it does for curl), IPv6 through DNS.
 */
function poznoteOutboundResolve(string $host): array
{
    $ips = @gethostbynamel($host) ?: [];
    if (function_exists('dns_get_record')) {
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $record) {
            if (!empty($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }
    }
    return array_values(array_unique($ips));
}

/**
 * Check a URL before a request. $restricted is false for an administrator's
 * URL, which only gets the scheme check.
 *
 * Returns ['ok' => bool, 'error' => string, 'resolve' => string[]]: on success
 * 'resolve' holds the CURLOPT_RESOLVE entries that pin the connection to the
 * checked addresses (empty when the host is a literal address or the request
 * is not restricted). $resolver replaces DNS in tests.
 */
function poznoteOutboundCheckUrl(string $url, bool $restricted, ?array $allowList = null, ?callable $resolver = null): array
{
    $refuse = ['ok' => false, 'error' => POZNOTE_OUTBOUND_BLOCKED_MESSAGE, 'resolve' => []];
    $parts = preg_match('/[\x00-\x20\x7F]/', $url) === 1 ? false : parse_url($url);
    $scheme = is_array($parts) ? strtolower((string)($parts['scheme'] ?? '')) : '';
    if (!in_array($scheme, ['http', 'https'], true) || (string)($parts['host'] ?? '') === '') {
        return ['ok' => false, 'error' => 'The URL must start with http:// or https://.', 'resolve' => []];
    }
    if (!$restricted) {
        return ['ok' => true, 'error' => '', 'resolve' => []];
    }

    $allowList = $allowList ?? poznoteOutboundAllowList();
    $host = strtolower((string)$parts['host']);
    $port = isset($parts['port']) ? (int)$parts['port'] : ($scheme === 'https' ? 443 : 80);

    if ($host[0] === '[') {
        $literal = substr($host, 1, -1);
        if (substr($host, -1) !== ']' || filter_var($literal, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) === false) {
            return $refuse;
        }
        return poznoteOutboundIpAllowed($literal, $allowList) ? ['ok' => true, 'error' => '', 'resolve' => []] : $refuse;
    }

    // Letters, digits, dots, dashes and underscores only: curl decodes "%31" in a host,
    // and a trailing dot or an IDN would be looked up differently from here.
    if (preg_match('/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/', $host) !== 1) {
        return $refuse;
    }

    // A last label made of digits (or 0x...) makes the whole host an IPv4
    // address to curl and browsers: "2130706433", "0x7f.1" and "127.1" are all
    // 127.0.0.1. Only the canonical dotted form is taken.
    $labels = explode('.', $host);
    if (preg_match('/^(0x[0-9a-f]*|[0-9]+)$/', (string)end($labels)) === 1) {
        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
            return $refuse;
        }
        return poznoteOutboundIpAllowed($host, $allowList) ? ['ok' => true, 'error' => '', 'resolve' => []] : $refuse;
    }

    $ips = $resolver ? $resolver($host) : poznoteOutboundResolve($host);
    if (empty($ips)) {
        return $refuse;
    }
    if (!poznoteOutboundHostAllowed($host, $allowList)) {
        foreach ($ips as $ip) {
            if (!poznoteOutboundIpAllowed($ip, $allowList)) {
                return $refuse;
            }
        }
    }

    $addresses = array_map(function (string $ip): string {
        return strpos($ip, ':') !== false ? '[' . $ip . ']' : $ip;
    }, $ips);
    return ['ok' => true, 'error' => '', 'resolve' => [$host . ':' . $port . ':' . implode(',', $addresses)]];
}

/**
 * Check $url and set up curl handle $ch for it: http(s) only, no redirect
 * followed by curl, connection pinned to the checked addresses. Returns ''
 * when the request may go, the message to show otherwise (then $ch must not
 * be executed). An unrestricted request keeps the handle's own redirect
 * setting, only the protocols are limited.
 */
function poznoteOutboundPrepareCurl($ch, string $url, bool $restricted): string
{
    $check = poznoteOutboundCheckUrl($url, $restricted);
    if (!$check['ok']) {
        return $check['error'];
    }
    $options = [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
    ];
    if ($restricted) {
        $options[CURLOPT_FOLLOWLOCATION] = false;
        if (!empty($check['resolve'])) {
            $options[CURLOPT_RESOLVE] = $check['resolve'];
        }
    }
    curl_setopt_array($ch, $options);
    return '';
}

/**
 * True when URLs this account chose are limited to public hosts, which is
 * every account but an administrator's. An unknown account is limited too.
 */
function poznoteOutboundRestrictedForUser(?int $userId): bool
{
    if ($userId === null || $userId <= 0 || !function_exists('getUserProfileById')) {
        return true;
    }
    $user = getUserProfileById($userId);
    return !($user && !empty($user['is_admin']));
}

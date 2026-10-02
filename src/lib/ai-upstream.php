<?php
/**
 * Which failures of a call to the AI server are worth a second attempt.
 *
 * Issue #1388: a chat request sometimes dies with "Could not resolve host:
 * api.openai.com (Timeout while contacting DNS servers)" and works when the
 * user pastes the same message again. Failures of that kind happen before
 * the server has answered anything, so the same request can be sent again
 * without the user seeing anything but a short pause. This module only
 * decides whether a failure is transient; the callers in api_ai_chat.php do
 * the retrying, because the streaming one has to keep its SSE connection
 * alive meanwhile.
 *
 * No database, no session, no config: tests/ai-upstream.test.php loads it
 * on its own. The curl error numbers are written as literals so that the
 * file also loads where the curl extension is missing.
 */

/** Attempts in total, the first one included. */
const AI_UPSTREAM_MAX_ATTEMPTS = 3;

/**
 * True when the request never reached the point where the server started
 * answering and the reason is a network hiccup rather than a configuration
 * error. $connected says whether the TCP connection had been established
 * (CURLINFO_CONNECT_TIME > 0): a timeout before that is a flaky route or an
 * overloaded resolver, a timeout after it is a server that took the request
 * and never answered, which another 600 second wait would not fix.
 */
function aiUpstreamIsTransientCurlError(int $errno, bool $connected): bool
{
    switch ($errno) {
        case 5:  // CURLE_COULDNT_RESOLVE_PROXY
        case 6:  // CURLE_COULDNT_RESOLVE_HOST
        case 7:  // CURLE_COULDNT_CONNECT
        case 35: // CURLE_SSL_CONNECT_ERROR
        case 52: // CURLE_GOT_NOTHING
        case 55: // CURLE_SEND_ERROR
        case 56: // CURLE_RECV_ERROR
            return true;
        case 28: // CURLE_OPERATION_TIMEDOUT
            return !$connected;
        default:
            return false;
    }
}

/**
 * Pause before the next attempt, in seconds, given how many attempts have
 * been made: 1 s after the first failure, 2 s after the second. Long enough
 * for a resolver hiccup to clear, short enough that the user does not wonder.
 */
function aiUpstreamRetryDelaySeconds(int $attemptsMade): int
{
    return max(1, min($attemptsMade, 5));
}

/**
 * True when two server URLs are the same one, give or take surrounding
 * whitespace and a trailing slash.
 *
 * The connection test of the AI and speech-to-text settings sends a stored
 * API key along when the form still shows the mask. That is right for the
 * owner of the configuration, who may be trying another URL with the key
 * already saved. For anyone else, and for a request that names no
 * configuration at all, the stored key only ever travels to the server it is
 * stored with: this is the comparison that decides it.
 */
function aiUpstreamSameServer(string $a, string $b): bool
{
    $a = rtrim(trim($a), '/');
    $b = rtrim(trim($b), '/');

    return $a !== '' && $a === $b;
}

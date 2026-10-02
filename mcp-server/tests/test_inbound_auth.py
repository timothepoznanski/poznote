import asyncio

import pytest

from poznote_mcp.server import (
    AUTH_TOKEN_ENV,
    DEFAULT_HOST,
    StaticBearerTokenVerifier,
    _build_auth_provider,
    _is_loopback_host,
    _load_inbound_auth_token,
    create_parser,
)


def test_default_host_is_loopback():
    assert DEFAULT_HOST == "127.0.0.1"
    args = create_parser().parse_args(["serve"])
    assert args.host == "127.0.0.1"
    assert args.port == 8045


def test_host_can_still_be_overridden():
    args = create_parser().parse_args(["serve", "--host=0.0.0.0", "--port=9000"])
    assert args.host == "0.0.0.0"
    assert args.port == 9000


@pytest.mark.parametrize("host", ["127.0.0.1", "127.0.0.2", "localhost", "LOCALHOST", "::1", "[::1]"])
def test_is_loopback_host_accepts_local_addresses(host):
    assert _is_loopback_host(host) is True


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.10", "10.0.0.1", "example.com", ""])
def test_is_loopback_host_rejects_network_addresses(host):
    assert _is_loopback_host(host) is False


@pytest.mark.parametrize("value", [None, "", "   ", "\n"])
def test_missing_or_blank_token_disables_auth(monkeypatch, value):
    if value is None:
        monkeypatch.delenv(AUTH_TOKEN_ENV, raising=False)
    else:
        monkeypatch.setenv(AUTH_TOKEN_ENV, value)

    assert _load_inbound_auth_token() is None
    assert _build_auth_provider(_load_inbound_auth_token()) is None


def test_token_is_read_from_env_and_stripped(monkeypatch):
    monkeypatch.setenv(AUTH_TOKEN_ENV, "  abc123\n")

    assert _load_inbound_auth_token() == "abc123"
    assert isinstance(_build_auth_provider("abc123"), StaticBearerTokenVerifier)


def test_verifier_accepts_only_the_exact_token():
    verifier = StaticBearerTokenVerifier("abc123")

    assert asyncio.run(verifier.verify_token("abc123")) is not None
    assert asyncio.run(verifier.verify_token("abc124")) is None
    assert asyncio.run(verifier.verify_token("abc123 ")) is None
    assert asyncio.run(verifier.verify_token("")) is None


def test_verifier_rejects_empty_token():
    with pytest.raises(ValueError):
        StaticBearerTokenVerifier("")


# Without a token, the only thing between a web page the user happens to open
# and this server is the browser's same-origin rule, which DNS rebinding
# defeats. Such a request always names the page's own http(s) origin.

from poznote_mcp.server import (  # noqa: E402
    LocalOriginGuard,
    _build_http_middleware,
    _origin_allowed_without_token,
)


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:8045",
        "http://127.0.0.1:8045",
        "http://LOCALHOST:6274",
        "https://localhost",
        "http://[::1]:8045",
        "http://127.0.0.2:8045",
        "http://app.localhost:3000",
        # Not a web address: a desktop application, an extension, a sandboxed frame
        "null",
        "app://obsidian.md",
        "vscode-webview://abc",
        "chrome-extension://abcdef",
        "file://",
    ],
)
def test_local_and_non_web_origins_are_served(origin):
    assert _origin_allowed_without_token(origin) is True


@pytest.mark.parametrize(
    "origin",
    [
        "http://rebind.example.net:8045",
        "https://example.com",
        "http://192.168.1.10:8045",
        "http://localhost.example.com:8045",
        "http://127.0.0.1.example.com",
        "http://127.example.com",
        "http://localhost.example.com.",
        "http://notlocalhost",
        "http://[invalid",
    ],
)
def test_web_pages_from_elsewhere_are_refused(origin):
    assert _origin_allowed_without_token(origin) is False


def test_guard_is_only_installed_without_a_token():
    assert [m.cls for m in _build_http_middleware(None)] == [LocalOriginGuard]
    assert _build_http_middleware("abc123") == []


def _run_guard(headers):
    """Send one request through the guard; report its status and whether the app ran."""
    seen = {"app_called": False, "status": None}

    async def app(scope, receive, send):
        seen["app_called"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            seen["status"] = message["status"]

    scope = {"type": "http", "method": "POST", "path": "/mcp", "headers": headers}
    asyncio.run(LocalOriginGuard(app)(scope, receive, send))
    return seen


def test_a_client_that_sends_no_origin_is_untouched():
    # Every MCP client that is a program rather than a web page
    assert _run_guard([(b"host", b"mcp-server:8045"), (b"content-type", b"application/json")]) == {
        "app_called": True,
        "status": 200,
    }


def test_a_local_page_is_served_and_a_remote_one_gets_403():
    assert _run_guard([(b"host", b"localhost:8045"), (b"origin", b"http://localhost:8045")])["status"] == 200
    refused = _run_guard([(b"host", b"rebind.example.net:8045"), (b"origin", b"http://rebind.example.net:8045")])
    assert refused == {"app_called": False, "status": 403}

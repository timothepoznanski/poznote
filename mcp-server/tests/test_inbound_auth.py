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

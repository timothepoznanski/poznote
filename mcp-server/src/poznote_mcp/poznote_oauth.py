"""OAuth sign-in through Poznote, for chat apps (issue #1681).

ChatGPT, Claude Desktop and claude.ai, Gemini and the other apps that connect
to a remote MCP server do not take a pasted bearer token: they follow the MCP
authorization spec. On a 401 they read this server's protected resource
metadata (RFC 9728), find the authorization server there, read its metadata
(RFC 8414), register themselves (RFC 7591) and send the person to sign in.

Here Poznote is that authorization server (src/public/oauth/ in the PHP app):
the person signs in to Poznote as usual, password, two-factor or SSO, picks
the account and the access level, and the app receives a token bound to that
account. This module is the MCP server's half:

- the protected resource metadata, through FastMCP's RemoteAuthProvider;
- the authorization server metadata, served HERE rather than by Poznote. Its
  issuer is this server and its endpoints point at Poznote's public URL. That
  keeps the whole discovery on the one address the app was given, needs no
  change to Poznote's web server, and also serves the apps that still look
  for the metadata at the MCP server's own origin (MCP spec 2025-03-26);
- token checks, by ExternalTokenVerifier with Poznote's introspection
  endpoint (auth_external.PoznoteIntrospectionProvider).

Enabled by POZNOTE_MCP_AUTH_PROVIDER=poznote, with POZNOTE_MCP_PUBLIC_URL.
Poznote's public URL is the instance URL set in Poznote's own settings, with
POZNOTE_APP_URL as the fallback (AppUrlResolver), so it is configured in one
place.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from typing import Any

import httpx
from fastmcp.server.auth import RemoteAuthProvider
from mcp.server.auth.routes import cors_middleware
from mcp.shared.auth import OAuthMetadata
from pydantic import AnyHttpUrl
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .auth_external import APP_URL_ENV, ExternalAuthConfig, _http_url, read_service_token

logger = logging.getLogger(__name__)

# The one scope apps are told about. What a token may do is the access level
# the person chose on Poznote's consent page, carried in the token itself.
OAUTH_SCOPE = "mcp"

TOKEN_AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"]

WELL_KNOWN_PATHS = (
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-authorization-server/",
    "/.well-known/openid-configuration",
    "/.well-known/openid-configuration/",
)
DOCUMENTATION_URL = "https://github.com/timothepoznanski/poznote/blob/main/docs/MCP-SERVER.md"

# How long Poznote's answer about its own URL is kept: a change in the settings
# shows up within a minute, a missing value is asked again sooner.
APP_URL_CACHE_TTL = 60.0
APP_URL_RETRY_TTL = 10.0


class AppUrlResolver:
    """Poznote's public URL, where the consent page and the token endpoint live.

    The instance URL from Poznote's settings (smtp_app_url, the one the
    reminder emails and webhooks use), read through the API with the service
    token; POZNOTE_APP_URL while that setting is empty or cannot be read. Same
    order as the PHP side, so the emails and the sign-in never disagree on the
    address. The settings store it
    only from an administrator: the API refuses everyone else, and the
    automatic first guess is taken from an administrator's browser only
    (RemindersController::rememberDetectedAppUrl), so this address cannot be
    pointed elsewhere by an ordinary account.
    """

    def __init__(self, config: ExternalAuthConfig) -> None:
        self.config = config
        self._lock = threading.Lock()
        self._value = ""
        self._expires = 0.0

    def _fetch(self) -> str:
        api = (os.getenv("POZNOTE_API_URL") or "http://localhost:8040/api/v1").strip().rstrip("/")
        token = read_service_token()
        if not token:
            logger.warning("Cannot read Poznote's instance URL yet: the service token is not readable")
            return ""
        user_id = (os.getenv("POZNOTE_USER_ID") or "").strip()
        try:
            response = httpx.get(
                api + "/settings/smtp_app_url",
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {token}",
                    "X-User-ID": user_id if user_id.isdigit() else "1",
                },
                timeout=self.config.timeout,
            )
            if response.status_code != 200:
                # Say what Poznote answered rather than "not set": a 404 means
                # POZNOTE_USER_ID names no active profile, a 401 a service token
                # that does not match data/.mcp_token.
                logger.warning(
                    "Cannot read Poznote's instance URL: GET %s answered %s",
                    api + "/settings/smtp_app_url", response.status_code,
                )
                return ""
            value = response.json().get("value")
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            logger.warning("Cannot read Poznote's instance URL: %s", exc)
            return ""
        url = _http_url(value if isinstance(value, str) else "")
        return url

    def get(self) -> str:
        now = time.monotonic()
        with self._lock:
            if now < self._expires:
                return self._value
        value = self._fetch() or self.config.app_url
        if not value:
            logger.warning(
                "Poznote's instance URL is not set: chat apps cannot sign in until it is. "
                "Set it in Settings > Admin Tools > Admin Webhooks, or set %s.", APP_URL_ENV,
            )
        with self._lock:
            if value and value != self._value:
                # Said once per change, so an operator can check where people
                # are sent to sign in (an instance upgraded from a version that
                # let any account rewrite this setting may hold a wrong value).
                logger.info("Chat apps are sent to sign in at %s/oauth/authorize.php", value)
            self._value = value
            self._expires = now + (APP_URL_CACHE_TTL if value else APP_URL_RETRY_TTL)
        return value


def build_authorization_server_metadata(config: ExternalAuthConfig, app_url: str | None = None) -> OAuthMetadata:
    """RFC 8414 metadata: this server as issuer, Poznote's endpoints.

    The issuer is spelled the way pydantic spells the URL listed in the
    protected resource metadata (with its trailing slash), because an app
    checks that the two are identical. Introspection is not advertised: it is
    reserved to this server.
    """
    endpoint = (app_url or config.app_url) + "/oauth/{}.php"
    return OAuthMetadata(
        issuer=AnyHttpUrl(config.public_url),
        authorization_endpoint=AnyHttpUrl(endpoint.format("authorize")),
        token_endpoint=AnyHttpUrl(endpoint.format("token")),
        registration_endpoint=AnyHttpUrl(endpoint.format("register")),
        revocation_endpoint=AnyHttpUrl(endpoint.format("revoke")),
        revocation_endpoint_auth_methods_supported=TOKEN_AUTH_METHODS,
        scopes_supported=[OAUTH_SCOPE],
        response_types_supported=["code"],
        grant_types_supported=["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported=TOKEN_AUTH_METHODS,
        code_challenge_methods_supported=["S256"],
        service_documentation=AnyHttpUrl(DOCUMENTATION_URL),
    )


class PoznoteOAuthProvider(RemoteAuthProvider):
    """Resource server whose authorization server is Poznote."""

    def __init__(self, config: ExternalAuthConfig, token_verifier: Any) -> None:
        super().__init__(
            token_verifier=token_verifier,
            authorization_servers=[AnyHttpUrl(config.public_url)],
            base_url=config.public_url,
            scopes_supported=[OAUTH_SCOPE],
            resource_name="Poznote",
            resource_documentation=AnyHttpUrl(DOCUMENTATION_URL),
        )
        self.config = config
        self.app_url = AppUrlResolver(config)

    async def authorization_server_metadata(self, request: Request) -> Response:
        app_url = await asyncio.to_thread(self.app_url.get)
        if not app_url:
            return JSONResponse(
                {
                    "error": "temporarily_unavailable",
                    "error_description": "Poznote's public URL is not configured: set the instance URL "
                                         f"in Settings > Admin Tools > Admin Webhooks, or {APP_URL_ENV}.",
                },
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        metadata = build_authorization_server_metadata(self.config, app_url)
        return JSONResponse(
            metadata.model_dump(mode="json", exclude_none=True),
            headers={"Cache-Control": f"public, max-age={int(APP_URL_CACHE_TTL)}"},
        )

    def get_routes(self, mcp_path: str | None = None) -> list[Route]:
        routes = super().get_routes(mcp_path)
        endpoint = cors_middleware(self.authorization_server_metadata, ["GET", "OPTIONS"])
        # Both spellings: the issuer ends with a slash, and apps differ on
        # whether they keep it when they build the well-known URL. The OpenID
        # discovery path serves the same document, for the apps that try it
        # when the OAuth one fails: they only read the endpoints from it, and
        # this server issues no ID token, so it claims nothing OpenID-specific.
        for path in WELL_KNOWN_PATHS:
            routes.append(Route(path, endpoint=endpoint, methods=["GET", "OPTIONS"]))
        return routes

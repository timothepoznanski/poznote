"""Per-caller authentication for the Poznote MCP server.

Upstream resolves a caller to a Poznote profile in exactly two ways: one shared
inbound token (POZNOTE_MCP_AUTH_TOKEN), and a target profile taken from
POZNOTE_USER_ID or an explicit ``user_id`` argument. One MCP instance is
therefore one identity.

This module adds an optional third mode. Each caller presents its own token, the
server resolves that token against an external identity provider, and the
resolved identity is mapped to that caller's Poznote profile. A single MCP
instance then serves many callers, each correctly identified, with no
per-caller static token list to maintain.

It is deliberately provider-agnostic: anything that can answer "which subject
does this token belong to" works, provided it exposes an OIDC UserInfo endpoint
or an RFC 7662 introspection endpoint. No provider-specific code lives here.

DISABLED BY DEFAULT. With POZNOTE_MCP_AUTH_PROVIDER unset the server behaves
exactly as upstream: one optional shared token, or open.

Providers
---------
``userinfo``
    ``GET <url>`` with ``Authorization: Bearer <token>``. The OpenID Connect
    UserInfo endpoint. Works for OIDC providers and for opaque tokens alike --
    the token is never verified locally, so there is no JWKS or key-rotation
    surface to maintain.

``introspection``
    ``POST <url>`` with ``token=<token>`` (RFC 7662). Used when the provider
    offers introspection instead of UserInfo. Optional client credentials are
    sent as HTTP Basic when configured.

Identity mapping
----------------
``POZNOTE_MCP_IDENTITY_MATCH`` is an ordered, comma-separated list of
``<poznote-field>:<claim-name>`` pairs. The first claim that is present and
matches exactly one profile wins. The default is the subject alone::

    oidc_subject:sub

Matching on ``preferred_username`` or ``email`` is available but is NOT the
default, because both are weaker than the sign-in this server sits beside.
Poznote's own OIDC login matches an email only when it is verified, and a
provider that lets users edit their own username or address would let one of
them claim another profile. Opt in deliberately::

    oidc_subject:sub,username:preferred_username,email:email

Fields available on a Poznote profile are those returned by
``GET /api/v1/admin/users``: ``id``, ``username``, ``email``, ``oidc_subject``.

SECURITY: an identity that matches no profile is refused. It never falls back to
a default profile, because the upstream default is profile 1 -- the first
administrator. A revoked or unrecognised token must not silently become admin.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)

try:
    # FastMCP is the server's own dependency. Imported defensively so this
    # module stays importable standalone (for tests) without FastMCP present.
    from fastmcp.server.auth import AccessToken, TokenVerifier
except Exception:  # pragma: no cover
    AccessToken = None  # type: ignore[assignment]
    TokenVerifier = object  # type: ignore[assignment]


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

PROVIDER_ENV = "POZNOTE_MCP_AUTH_PROVIDER"
URL_ENV = "POZNOTE_MCP_AUTH_URL"
CLIENT_ID_ENV = "POZNOTE_MCP_AUTH_CLIENT_ID"
CLIENT_SECRET_ENV = "POZNOTE_MCP_AUTH_CLIENT_SECRET"
TIMEOUT_ENV = "POZNOTE_MCP_AUTH_TIMEOUT"
CACHE_TTL_ENV = "POZNOTE_MCP_AUTH_CACHE_TTL"
MATCH_ENV = "POZNOTE_MCP_IDENTITY_MATCH"
AUDIENCE_ENV = "POZNOTE_MCP_AUTH_AUDIENCE"
HEADER_ENV = "POZNOTE_MCP_AUTH_HEADER"

DEFAULT_MATCH = "oidc_subject:sub"
DEFAULT_TIMEOUT = 5.0
DEFAULT_CACHE_TTL = 60.0
DEFAULT_HEADER = "Authorization"

SUPPORTED_PROVIDERS = ("userinfo", "introspection")


@dataclass(frozen=True)
class MatchRule:
    """One ``<poznote-field>:<claim>`` pair."""

    field: str
    claim: str


@dataclass
class ExternalAuthConfig:
    """Resolved configuration for the external-auth mode."""

    provider: str
    url: str
    match: list[MatchRule] = field(default_factory=list)
    header: str = DEFAULT_HEADER
    client_id: str | None = None
    client_secret: str | None = None
    audience: list[str] = field(default_factory=list)
    timeout: float = DEFAULT_TIMEOUT
    cache_ttl: float = DEFAULT_CACHE_TTL

    @staticmethod
    def _float(name: str, default: float) -> float:
        raw = (os.getenv(name) or "").strip()
        if not raw:
            return default
        try:
            value = float(raw)
        except ValueError:
            logger.warning("Ignoring non-numeric %s=%r", name, raw)
            return default
        return value if value > 0 else default

    @staticmethod
    def _csv(raw: str | None) -> list[str]:
        return [item.strip() for item in (raw or "").split(",") if item.strip()]

    @staticmethod
    def parse_match(raw: str) -> list[MatchRule]:
        rules: list[MatchRule] = []
        for item in (raw or "").split(","):
            item = item.strip()
            if not item:
                continue
            if ":" not in item:
                logger.warning("Ignoring malformed %s entry %r (want field:claim)", MATCH_ENV, item)
                continue
            profile_field, claim = item.split(":", 1)
            profile_field, claim = profile_field.strip(), claim.strip()
            if profile_field and claim:
                rules.append(MatchRule(profile_field, claim))
        return rules

    @classmethod
    def from_env(cls) -> "ExternalAuthConfig | None":
        """Build a config, or None when the feature is not configured."""

        provider = (os.getenv(PROVIDER_ENV) or "").strip().lower()
        if not provider:
            return None

        if provider not in SUPPORTED_PROVIDERS:
            raise ValueError(
                f"{PROVIDER_ENV}={provider!r} is not supported; "
                f"expected one of {', '.join(SUPPORTED_PROVIDERS)}"
            )

        url = (os.getenv(URL_ENV) or "").strip()
        if not url:
            raise ValueError(f"{PROVIDER_ENV} is set but {URL_ENV} is empty")
        if not url.lower().startswith(("http://", "https://")):
            raise ValueError(f"{URL_ENV} must be an http(s) URL, got {url!r}")

        rules = cls.parse_match(os.getenv(MATCH_ENV, DEFAULT_MATCH))
        if not rules:
            raise ValueError(
                f"{MATCH_ENV} resolved to no usable rules; expected e.g. {DEFAULT_MATCH!r}"
            )

        client_id = (os.getenv(CLIENT_ID_ENV) or "").strip() or None
        client_secret = (os.getenv(CLIENT_SECRET_ENV) or "").strip() or None

        # These apply to 'introspection' only: 'userinfo' sends the caller's
        # token and nothing else. Say so rather than reading them and quietly
        # ignoring the value, which is indistinguishable from a typo.
        if provider != "introspection" and (client_id or client_secret):
            logger.warning(
                "%s / %s are set but ignored by the %r provider; they apply to "
                "'introspection' only.",
                CLIENT_ID_ENV,
                CLIENT_SECRET_ENV,
                provider,
            )

        return cls(
            provider=provider,
            url=url,
            match=rules,
            audience=cls._csv(os.getenv(AUDIENCE_ENV)),
            header=(os.getenv(HEADER_ENV) or DEFAULT_HEADER).strip() or DEFAULT_HEADER,
            client_id=client_id,
            client_secret=client_secret,
            timeout=cls._float(TIMEOUT_ENV, DEFAULT_TIMEOUT),
            cache_ttl=cls._float(CACHE_TTL_ENV, DEFAULT_CACHE_TTL),
        )


_active_config: "ExternalAuthConfig | None" = None
_config_loaded = False


def get_config() -> "ExternalAuthConfig | None":
    """Return the active config, loading it once from the environment."""

    global _active_config, _config_loaded
    if not _config_loaded:
        _active_config = ExternalAuthConfig.from_env()
        _config_loaded = True
        if _active_config:
            logger.info(
                "Per-caller authentication enabled: provider=%s url=%s match=%s",
                _active_config.provider,
                _active_config.url,
                ",".join(f"{r.field}:{r.claim}" for r in _active_config.match),
            )
    return _active_config


def reset_config_cache() -> None:
    """Test hook: forget the cached environment configuration."""

    global _active_config, _config_loaded
    _active_config = None
    _config_loaded = False


def external_auth_enabled() -> bool:
    """True when per-caller authentication is configured."""

    return get_config() is not None


# --------------------------------------------------------------------------- #
# TTL cache
# --------------------------------------------------------------------------- #


class TtlCache:
    """Small thread-safe TTL cache. Bounded so callers cannot grow it freely."""

    def __init__(self, ttl: float, maxsize: int = 4096) -> None:
        self._ttl = ttl
        self._maxsize = maxsize
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires, value = entry
            if expires <= now:
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._data) >= self._maxsize:
                # Drop the soonest-to-expire entry; no LRU bookkeeping needed.
                oldest = min(self._data.items(), key=lambda kv: kv[1][0])[0]
                self._data.pop(oldest, None)
            self._data[key] = (now + self._ttl, value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class IdentityProviderUnavailable(RuntimeError):
    """The provider could not be reached -- distinct from 'token is invalid'."""


class IdentityUnmapped(RuntimeError):
    """A verified caller has no Poznote profile linked to their identity."""


class IdentityMismatch(RuntimeError):
    """A caller asked for a profile that is not the one its token resolves to.

    Raised when a tool call passes an explicit ``user_id``. Most tools accept
    that argument, so honouring it blindly would let any authenticated caller
    act as any profile, the administrator included, and the per-caller mode
    would provide no isolation at all.
    """


# --------------------------------------------------------------------------- #
# Provider clients
# --------------------------------------------------------------------------- #


class IdentityProvider:
    """Resolves a bearer token to a claims mapping. Provider-agnostic."""

    def __init__(self, config: ExternalAuthConfig) -> None:
        self.config = config

    def resolve(self, token: str) -> "dict[str, Any] | None":
        raise NotImplementedError

    def _auth_header(self, token: str) -> dict[str, str]:
        return {self.config.header: f"Bearer {token}"}

    def _extract_claims(self, payload: Any) -> "dict[str, Any] | None":
        """Normalise a provider response to a claims mapping."""
        if not isinstance(payload, dict) or not payload:
            return None
        # RFC 7662 introspection carries an `active` flag; OIDC UserInfo does
        # not. Treat `active: false` as an invalid token.
        if "active" in payload and payload.get("active") is not True:
            return None
        return payload


class UserInfoProvider(IdentityProvider):
    """OIDC UserInfo: GET <url> with the caller's bearer token."""

    def resolve(self, token: str) -> "dict[str, Any] | None":
        try:
            response = httpx.get(
                self.config.url,
                headers=self._auth_header(token),
                timeout=self.config.timeout,
            )
        except httpx.HTTPError as exc:
            raise IdentityProviderUnavailable(str(exc)) from exc

        if response.status_code in (401, 403):
            return None
        if response.status_code >= 500:
            raise IdentityProviderUnavailable(f"provider returned {response.status_code}")
        if response.status_code != 200:
            logger.warning("Identity provider returned %s", response.status_code)
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.warning("Identity provider returned a non-JSON body")
            return None
        return self._extract_claims(payload)


class IntrospectionProvider(IdentityProvider):
    """RFC 7662: POST <url> with token=<token>."""

    def resolve(self, token: str) -> "dict[str, Any] | None":
        data = {"token": token, "token_type_hint": "access_token"}
        auth: "httpx.BasicAuth | None" = None
        if self.config.client_id and self.config.client_secret:
            auth = httpx.BasicAuth(self.config.client_id, self.config.client_secret)

        try:
            response = httpx.post(
                self.config.url,
                data=data,
                auth=auth,
                headers={"Accept": "application/json"},
                timeout=self.config.timeout,
            )
        except httpx.HTTPError as exc:
            raise IdentityProviderUnavailable(str(exc)) from exc

        if response.status_code in (401, 403):
            return None
        if response.status_code >= 500:
            raise IdentityProviderUnavailable(f"provider returned {response.status_code}")
        if response.status_code != 200:
            logger.warning("Identity provider returned %s", response.status_code)
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.warning("Identity provider returned a non-JSON body")
            return None
        return self._extract_claims(payload)


def build_provider(config: ExternalAuthConfig) -> IdentityProvider:
    if config.provider == "userinfo":
        return UserInfoProvider(config)
    if config.provider == "introspection":
        return IntrospectionProvider(config)
    raise ValueError(f"Unsupported provider {config.provider!r}")


# --------------------------------------------------------------------------- #
# Token verifier
# --------------------------------------------------------------------------- #


if AccessToken is not None:

    class ExternalTokenVerifier(TokenVerifier):  # type: ignore[misc]
        """Accept any token the configured provider recognises.

        Unlike upstream's single-token verifier this accepts a set of callers
        and returns the claims that identify each one.
        """

        def __init__(
            self,
            config: ExternalAuthConfig,
            provider: "IdentityProvider | None" = None,
        ) -> None:
            super().__init__()
            self.config = config
            self.provider = provider or build_provider(config)
            self._cache = TtlCache(config.cache_ttl)

        @staticmethod
        def _cache_key(token: str) -> str:
            # Tokens are secrets: never store them raw as cache keys.
            return hashlib.sha256(token.encode("utf-8")).hexdigest()

        async def verify_token(self, token: str) -> Any:
            if not token:
                return None

            key = self._cache_key(token)
            cached = self._cache.get(key)
            if cached is not None:
                return cached

            try:
                # to_thread, not a direct call: verify_token is async, and httpx
                # here is synchronous, so a slow provider would otherwise block
                # the event loop for the whole timeout.
                claims = await asyncio.to_thread(self.provider.resolve, token)
            except IdentityProviderUnavailable as exc:
                logger.error("Identity provider unavailable: %s", exc)
                return None

            if not claims:
                return None

            # A token the same provider issued for a different application is
            # otherwise accepted here. Optional, because not every provider puts
            # an audience on a UserInfo response.
            if self.config.audience:
                presented = set(claim_values(claims, "aud"))
                if not presented.intersection(self.config.audience):
                    logger.warning(
                        "Rejecting a token whose audience %s does not include %s",
                        sorted(presented) or "(none)",
                        self.config.audience,
                    )
                    return None

            subject = str(claims.get("sub") or claims.get("username") or "")
            access = AccessToken(
                token=token,
                client_id=subject or "external",
                scopes=[],
                claims=dict(claims),
            )
            self._cache.set(key, access)
            return access

else:  # pragma: no cover

    class ExternalTokenVerifier:  # type: ignore[no-redef]
        def __init__(self, *_: Any, **__: Any) -> None:
            raise RuntimeError("FastMCP is required for the server-side verifier")


def build_external_auth_provider() -> "Any | None":
    """Return a verifier when configured, else None (upstream behaviour)."""
    try:
        config = get_config()
    except ValueError as exc:
        raise ValueError(
            f"Per-caller authentication is misconfigured: {exc}. "
            f"Fix the environment or unset {PROVIDER_ENV}."
        ) from exc
    if config is None:
        return None
    return ExternalTokenVerifier(config)


# --------------------------------------------------------------------------- #
# Identity -> Poznote profile
# --------------------------------------------------------------------------- #


def claim_values(claims: dict[str, Any], claim: str) -> list[str]:
    """Read a claim as candidate strings (handles list-valued claims)."""
    raw = claims.get(claim)
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        return [str(v).strip() for v in raw if str(v).strip()]
    text = str(raw).strip()
    return [text] if text else []


def profile_is_active(profile: dict[str, Any]) -> bool:
    """True unless the profile is explicitly disabled.

    A disabled account must not be a match candidate. Poznote rejects its
    requests anyway ("User profile is disabled"), but resolving it first means
    the caller sees an opaque API error instead of a clear refusal, and every
    tool call pays for a doomed round trip. A profile without the field counts
    as active: missing data is not evidence of disablement.
    """
    if "active" not in profile:
        return True
    value = profile.get("active")
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def match_profile(
    claims: dict[str, Any],
    users: "list[dict[str, Any]]",
    rules: "list[MatchRule]",
) -> "dict[str, Any] | None":
    """Return exactly one matching profile, or None.

    Only active profiles are candidates. Ambiguity is refused rather than
    guessed: if two profiles share the value, the caller gets no profile instead
    of somebody else's.
    """
    candidates = [u for u in users if profile_is_active(u)]
    for rule in rules:
        for value in claim_values(claims, rule.claim):
            hits = [u for u in candidates if str(u.get(rule.field) or "").strip() == value]
            if len(hits) == 1:
                return hits[0]
            if len(hits) > 1:
                logger.error(
                    "Identity claim %s=%r matches %d profiles; refusing (ambiguous)",
                    rule.claim,
                    value,
                    len(hits),
                )
                return None
    return None


class ProfileResolver:
    """Maps resolved claims to a Poznote profile id, with caching."""

    def __init__(self, ttl: float = DEFAULT_CACHE_TTL) -> None:
        self._users_cache = TtlCache(ttl)
        self._match_cache = TtlCache(ttl)

    def list_users(self, fetch: "Callable[[], list[dict[str, Any]]]") -> "list[dict[str, Any]]":
        cached = self._users_cache.get("users")
        if cached is not None:
            return cached
        users = fetch()
        self._users_cache.set("users", users)
        return users

    def resolve_profile(
        self,
        claims: dict[str, Any],
        rules: "list[MatchRule]",
        fetch_users: "Callable[[], list[dict[str, Any]]]",
    ) -> "dict[str, Any] | None":
        cache_key = "|".join(
            f"{r.field}={v}" for r in rules for v in claim_values(claims, r.claim)
        )
        if not cache_key:
            return None

        cached = self._match_cache.get(cache_key)
        if cached is not None:
            return cached

        users = self.list_users(fetch_users)
        profile = match_profile(claims, users, rules)
        if profile is None:
            return None

        self._match_cache.set(cache_key, profile)
        return profile

    def clear(self) -> None:
        self._users_cache.clear()
        self._match_cache.clear()


_resolver = ProfileResolver()


def get_resolver() -> ProfileResolver:
    return _resolver


# --------------------------------------------------------------------------- #
# Bridge into the Poznote client
# --------------------------------------------------------------------------- #


def _current_claims() -> "dict[str, Any] | None":
    """Read the verified caller's claims from the FastMCP request context."""
    try:
        from fastmcp.server.dependencies import get_access_token
    except Exception:  # pragma: no cover
        return None
    try:
        token = get_access_token()
    except Exception:
        return None
    if token is None:
        return None
    claims = getattr(token, "claims", None)
    return dict(claims) if claims else None


def describe_identity(claims: dict[str, Any], rules: "list[MatchRule]") -> str:
    """Human-readable identity summary, for logs and error messages."""
    parts = []
    for rule in rules:
        values = claim_values(claims, rule.claim)
        if values:
            parts.append(f"{rule.claim}={values}")
    return ", ".join(parts) or "(no configured claim present)"


def resolve_caller_profile(fetch_users: "Callable[[], list[dict[str, Any]]]") -> "dict[str, Any] | None":
    """Return the Poznote profile for the current caller, or None.

    None means per-caller authentication is off, so the caller falls back to
    upstream behaviour unchanged. Raises IdentityUnmapped when it is on and the
    caller cannot be resolved.
    """
    config = get_config()
    if config is None:
        return None

    claims = _current_claims()
    if not claims:
        # Auth is enabled but no claims: refuse rather than default.
        logger.error("Per-caller auth is enabled but the request carried no resolved identity")
        raise IdentityUnmapped("No verified identity on this request")

    profile = get_resolver().resolve_profile(claims, config.match, fetch_users)
    if profile is None:
        logger.error(
            "No Poznote profile matches the verified identity (%s)",
            describe_identity(claims, config.match),
        )
        raise IdentityUnmapped(
            "Verified identity is not linked to an active Poznote profile. "
            "The profile may be missing or disabled -- ask an administrator."
        )
    return profile


def resolve_caller_profile_id(fetch_users: "Callable[[], list[dict[str, Any]]]") -> "int | None":
    """Return the Poznote profile id for the current caller, or None."""
    profile = resolve_caller_profile(fetch_users)
    return None if profile is None else int(profile["id"])



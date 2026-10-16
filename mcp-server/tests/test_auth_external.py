"""Tests for the per-caller authentication extension.

Run with either:

    python -m unittest discover -s tests -v
    python tests/test_auth_external.py

Standard library only, so they run inside the MCP virtualenv (which has no
pytest) and against a bare checkout.
"""

from __future__ import annotations

import asyncio
import os
import time
import unittest
from unittest import mock

from poznote_mcp import auth_external as mod  # noqa: E402
from poznote_mcp import server  # noqa: E402


def _response(status=200, payload=None, raise_json=False):
    response = mock.Mock()
    response.status_code = status
    if raise_json:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = payload if payload is not None else {}
    return response


USERS = [
    {"id": 1, "username": "admin", "email": "admin@example.test", "oidc_subject": "", "is_admin": 1},
    {"id": 11, "username": "alpha", "email": "alpha@example.test", "oidc_subject": "11", "is_admin": 0},
    {"id": 12, "username": "beta", "email": "beta@example.test", "oidc_subject": "12", "is_admin": 0},
]


class ConfigTests(unittest.TestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def test_unset_means_disabled(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(mod.ExternalAuthConfig.from_env())
            self.assertFalse(mod.external_auth_enabled())

    def test_userinfo_config_parses(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/userinfo",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        self.assertEqual(cfg.provider, "userinfo")
        self.assertEqual(cfg.url, "https://idp.example.com/userinfo")
        # Subject only. Matching on username or email is weaker than Poznote's
        # own sign-in and has to be opted into.
        self.assertEqual([(r.field, r.claim) for r in cfg.match], [("oidc_subject", "sub")])

    def test_unknown_provider_is_rejected(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "carrier-pigeon", "POZNOTE_MCP_AUTH_URL": "https://x/y"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                mod.ExternalAuthConfig.from_env()

    def test_missing_url_is_rejected(self):
        with mock.patch.dict(os.environ, {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo"}, clear=True):
            with self.assertRaises(ValueError):
                mod.ExternalAuthConfig.from_env()

    def test_non_http_url_is_rejected(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "ftp://x/y"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ValueError):
                mod.ExternalAuthConfig.from_env()

    def test_malformed_match_entries_are_dropped(self):
        rules = mod.ExternalAuthConfig.parse_match("oidc_subject:sub, nonsense , :, ok:claim")
        self.assertEqual([(r.field, r.claim) for r in rules], [("oidc_subject", "sub"), ("ok", "claim")])

    def test_introspection_only_settings_warn_when_the_provider_is_userinfo(self, caplog=None):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://x/y",
            "POZNOTE_MCP_AUTH_CLIENT_ID": "rs",
            "POZNOTE_MCP_AUTH_CLIENT_SECRET": "s3cret",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(mod.logger, "warning") as warned:
                cfg = mod.ExternalAuthConfig.from_env()
        # still parsed and carried, but the operator is told it does nothing here
        self.assertEqual(cfg.client_id, "rs")
        self.assertTrue(any("introspection" in str(c.args) for c in warned.call_args_list))

    def test_no_warning_when_introspection_actually_uses_them(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "introspection",
            "POZNOTE_MCP_AUTH_URL": "https://x/y",
            "POZNOTE_MCP_AUTH_CLIENT_ID": "rs",
            "POZNOTE_MCP_AUTH_CLIENT_SECRET": "s3cret",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(mod.logger, "warning") as warned:
                mod.ExternalAuthConfig.from_env()
        self.assertEqual(
            [c for c in warned.call_args_list if "introspection" in str(c.args)], []
        )

    def test_cache_ttl_must_be_positive(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://x/y",
            "POZNOTE_MCP_AUTH_CACHE_TTL": "0",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertGreater(mod.ExternalAuthConfig.from_env().cache_ttl, 0)


class ProviderTests(unittest.TestCase):
    def _cfg(self, provider="userinfo", **extra):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": provider, "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u"}
        env.update(extra)
        mod.reset_config_cache()
        with mock.patch.dict(os.environ, env, clear=True):
            return mod.ExternalAuthConfig.from_env()

    def test_userinfo_returns_claims(self):
        provider = mod.build_provider(self._cfg())
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11"})) as g:
            self.assertEqual(provider.resolve("tok"), {"sub": "11"})
        self.assertEqual(g.call_args.kwargs["headers"], {"Authorization": "Bearer tok"})

    def test_userinfo_401_is_invalid_not_unavailable(self):
        provider = mod.build_provider(self._cfg())
        with mock.patch.object(mod.httpx, "get", return_value=_response(401)):
            self.assertIsNone(provider.resolve("tok"))

    def test_userinfo_500_is_unavailable(self):
        provider = mod.build_provider(self._cfg())
        with mock.patch.object(mod.httpx, "get", return_value=_response(503)):
            with self.assertRaises(mod.IdentityProviderUnavailable):
                provider.resolve("tok")

    def test_userinfo_network_error_is_unavailable(self):
        provider = mod.build_provider(self._cfg())
        with mock.patch.object(mod.httpx, "get", side_effect=mod.httpx.ConnectError("nope")):
            with self.assertRaises(mod.IdentityProviderUnavailable):
                provider.resolve("tok")

    def test_userinfo_non_json_is_invalid(self):
        provider = mod.build_provider(self._cfg())
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, raise_json=True)):
            self.assertIsNone(provider.resolve("tok"))

    def test_custom_header_is_used(self):
        provider = mod.build_provider(self._cfg(POZNOTE_MCP_AUTH_HEADER="X-Caller-Token"))
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "1"})) as g:
            provider.resolve("tok")
        self.assertEqual(g.call_args.kwargs["headers"], {"X-Caller-Token": "Bearer tok"})

    def test_introspection_inactive_token_is_rejected(self):
        provider = mod.build_provider(self._cfg(provider="introspection"))
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, {"active": False})):
            self.assertIsNone(provider.resolve("tok"))

    def test_introspection_active_token_returns_claims(self):
        provider = mod.build_provider(self._cfg(provider="introspection"))
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, {"active": True, "sub": "11"})) as p:
            self.assertEqual(provider.resolve("tok")["sub"], "11")
        self.assertEqual(p.call_args.kwargs["data"]["token"], "tok")

    def test_introspection_sends_basic_auth_when_configured(self):
        provider = mod.build_provider(
            self._cfg(
                provider="introspection",
                POZNOTE_MCP_AUTH_CLIENT_ID="rs",
                POZNOTE_MCP_AUTH_CLIENT_SECRET="s3cret",
            )
        )
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, {"active": True})) as p:
            provider.resolve("tok")
        self.assertIsInstance(p.call_args.kwargs["auth"], mod.httpx.BasicAuth)


class MatchingTests(unittest.TestCase):
    RULES = [
        mod.MatchRule("oidc_subject", "sub"),
        mod.MatchRule("username", "preferred_username"),
        mod.MatchRule("email", "email"),
    ]

    def test_matches_on_subject_first(self):
        found = mod.match_profile({"sub": "11", "preferred_username": "beta"}, USERS, self.RULES)
        self.assertEqual(found["id"], 11)

    def test_falls_back_to_username_when_sub_absent(self):
        found = mod.match_profile({"preferred_username": "beta"}, USERS, self.RULES)
        self.assertEqual(found["id"], 12)

    def test_an_empty_subject_does_not_match_an_unlinked_profile(self):
        # profile 1 has oidc_subject "" -- an empty claim must not capture it
        found = mod.match_profile({"sub": "", "username": "nobody"}, USERS, self.RULES)
        self.assertIsNone(found)

    def test_no_match_returns_none(self):
        self.assertIsNone(mod.match_profile({"sub": "999"}, USERS, self.RULES))

    def test_disabled_profile_is_not_matched(self):
        users = [dict(u, active=0) for u in USERS]
        self.assertIsNone(mod.match_profile({"sub": "11"}, users, self.RULES))

    def test_enabled_profile_still_matches(self):
        users = [dict(u, active=1) for u in USERS]
        found = mod.match_profile({"sub": "11"}, users, self.RULES)
        self.assertEqual(found["id"], 11)

    def test_profile_is_active_treats_missing_field_as_active(self):
        self.assertTrue(mod.profile_is_active({"id": 1}))
        self.assertTrue(mod.profile_is_active({"id": 1, "active": 1}))
        self.assertTrue(mod.profile_is_active({"id": 1, "active": "true"}))
        self.assertFalse(mod.profile_is_active({"id": 1, "active": 0}))
        self.assertFalse(mod.profile_is_active({"id": 1, "active": "0"}))
        self.assertFalse(mod.profile_is_active({"id": 1, "active": False}))

    def test_ambiguous_match_is_refused(self):
        users = USERS + [{"id": 99, "username": "alpha-clone", "email": "x@y", "oidc_subject": "11"}]
        self.assertIsNone(mod.match_profile({"sub": "11"}, users, self.RULES))

    def test_list_valued_claims_are_handled(self):
        users = USERS + [{"id": 5, "username": "five", "email": "five@x", "oidc_subject": "5"}]
        found = mod.match_profile({"sub": ["999", "5"]}, users, self.RULES)
        self.assertEqual(found["id"], 5)

    def test_claim_values_normalises(self):
        self.assertEqual(mod.claim_values({"a": ["x", "", " y "]}, "a"), ["x", "y"])
        self.assertEqual(mod.claim_values({"a": 12}, "a"), ["12"])
        self.assertEqual(mod.claim_values({}, "a"), [])


class CacheTests(unittest.TestCase):
    def test_set_and_get(self):
        cache = mod.TtlCache(ttl=60)
        cache.set("k", "v")
        self.assertEqual(cache.get("k"), "v")

    def test_expiry(self):
        cache = mod.TtlCache(ttl=0.05)
        cache.set("k", "v")
        time.sleep(0.08)
        self.assertIsNone(cache.get("k"))

    def test_bounded(self):
        cache = mod.TtlCache(ttl=60, maxsize=3)
        for i in range(10):
            cache.set(f"k{i}", i)
        self.assertLessEqual(len(cache._data), 3)


class ResolverTests(unittest.TestCase):
    def setUp(self):
        mod.reset_config_cache()
        mod.get_resolver().clear()
        self.addCleanup(mod.reset_config_cache)

    def _enable(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u",
        }
        patcher = mock.patch.dict(os.environ, env, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)
        mod.reset_config_cache()

    def test_disabled_returns_none_so_upstream_behaviour_stands(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(mod.resolve_caller_profile_id(lambda: USERS))

    def test_enabled_maps_identity_to_profile(self):
        self._enable()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "11"}):
            self.assertEqual(mod.resolve_caller_profile_id(lambda: USERS), 11)

    def test_enabled_without_identity_refuses(self):
        self._enable()
        with mock.patch.object(mod, "_current_claims", return_value=None):
            with self.assertRaises(mod.IdentityUnmapped):
                mod.resolve_caller_profile_id(lambda: USERS)

    def test_unmapped_identity_refuses_rather_than_defaulting(self):
        self._enable()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "does-not-exist"}):
            with self.assertRaises(mod.IdentityUnmapped):
                mod.resolve_caller_profile_id(lambda: USERS)

    def test_users_are_fetched_once_within_the_ttl(self):
        self._enable()
        calls = []

        def fetch():
            calls.append(1)
            return USERS

        with mock.patch.object(mod, "_current_claims", side_effect=[{"sub": "11"}, {"sub": "12"}]):
            mod.resolve_caller_profile_id(fetch)
            mod.resolve_caller_profile_id(fetch)
        self.assertEqual(len(calls), 1)


@unittest.skipIf(mod.AccessToken is None, "fastmcp not installed")
class VerifierTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def _verifier(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        return mod.ExternalTokenVerifier(cfg)

    async def test_valid_token_yields_claims(self):
        verifier = self._verifier()
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11", "preferred_username": "alpha"})):
            token = await verifier.verify_token("secret-token")
        self.assertIsNotNone(token)
        self.assertEqual(token.claims["sub"], "11")
        self.assertEqual(token.client_id, "11")

    async def test_invalid_token_yields_none(self):
        verifier = self._verifier()
        with mock.patch.object(mod.httpx, "get", return_value=_response(401)):
            self.assertIsNone(await verifier.verify_token("bad"))

    async def test_unavailable_provider_is_not_a_silent_pass(self):
        verifier = self._verifier()
        with mock.patch.object(mod.httpx, "get", return_value=_response(503)):
            self.assertIsNone(await verifier.verify_token("tok"))

    async def test_empty_token_yields_none(self):
        verifier = self._verifier()
        self.assertIsNone(await verifier.verify_token(""))

    async def test_resolution_is_cached(self):
        verifier = self._verifier()
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11"})) as g:
            await verifier.verify_token("tok")
            await verifier.verify_token("tok")
        self.assertEqual(g.call_count, 1)

    async def test_cache_key_never_contains_the_token(self):
        verifier = self._verifier()
        key = verifier._cache_key("super-secret")
        self.assertNotIn("super-secret", key)
        self.assertEqual(len(key), 64)


class HeadersForUserTests(unittest.TestCase):
    """_headers_for_user must refuse an explicit user_id that disagrees with the
    caller's verified identity. Without this the mode gives no isolation at all:
    a caller could pass any profile id, the administrator included.

    Stubs the same hook the existing resolver tests use, `_current_claims`, so the
    real resolve_caller_profile() path runs rather than being mocked out.
    """

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)
        self.env = mock.patch.dict(os.environ, {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/userinfo",
        }, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        mod.reset_config_cache()

    def _client(self):
        from poznote_mcp.client import PoznoteClient
        client = PoznoteClient.__new__(PoznoteClient)
        client._list_profiles = lambda: USERS
        client._base_headers = {"Authorization": "Bearer service-token"}
        return client

    def test_explicit_user_id_for_another_profile_is_refused(self):
        client = self._client()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "11"}):
            with self.assertRaises(mod.IdentityMismatch):
                client._headers_for_user(1)

    def test_matching_user_id_is_allowed_and_stamped(self):
        client = self._client()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "11"}):
            headers = client._headers_for_user(11)
        self.assertEqual(headers.get("X-User-ID"), "11")

    def test_no_explicit_user_id_resolves_to_the_callers_own_profile(self):
        client = self._client()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "11"}):
            headers = client._headers_for_user(None)
        self.assertEqual(headers.get("X-User-ID"), "11")


class AdminGuardTests(unittest.TestCase):
    """The four system tools take no user_id, and restore_backup plus the global
    settings keys reach instance-wide data. All of them must refuse a
    non-administrator, and caller_is_admin() is the only check that resolves the
    CALLER rather than the service token.

    The client mock returns JSON-serializable values, so that if the guard were
    absent these tests fail on the missing refusal text rather than on a
    TypeError from serializing a Mock. Every refusal test also asserts that the
    guarded call never reached the client.
    """

    def _client(self, is_admin):
        client = mock.Mock()
        client.caller_is_admin.return_value = is_admin
        client.get_system_version.return_value = {"version": "test"}
        client.restore_backup.return_value = {"ok": True}
        client.get_setting.return_value = {"key": "tasklist_insert_order", "value": "top"}
        client.update_setting.return_value = {"ok": True}
        return client

    def _patched(self, client):
        return mock.patch.object(server, "_get_client_or_error", return_value=(client, None))

    def test_system_tool_refuses_a_non_admin(self):
        client = self._client(False)
        with self._patched(client):
            out = server.get_system_info()
        self.assertIn("limited to administrator callers", out)
        client.get_system_version.assert_not_called()

    def test_system_tool_allows_an_admin(self):
        client = self._client(True)
        with self._patched(client):
            out = server.get_system_info()
        self.assertNotIn("limited to administrator callers", out)
        client.get_system_version.assert_called_once()

    def test_restore_backup_refuses_a_non_admin(self):
        client = self._client(False)
        with self._patched(client):
            out = server.restore_backup("poznote_backup_test.zip", user_id=11)
        self.assertIn("limited to administrator callers", out)
        client.restore_backup.assert_not_called()

    def test_global_setting_is_refused_for_a_non_admin(self):
        client = self._client(False)
        with self._patched(client):
            out = server.get_app_setting("smtp_host", user_id=11)
        self.assertIn("limited to administrator callers", out)
        client.get_setting.assert_not_called()

    def test_global_setting_write_is_refused_for_a_non_admin(self):
        client = self._client(False)
        with self._patched(client):
            out = server.update_app_setting("mcp_user_id", "1", user_id=11)
        self.assertIn("limited to administrator callers", out)
        client.update_setting.assert_not_called()

    def test_per_profile_setting_is_NOT_refused_for_a_non_admin(self):
        """The guard must not break a caller reading its own display preferences."""
        client = self._client(False)
        with self._patched(client):
            out = server.get_app_setting("tasklist_insert_order", user_id=11)
        self.assertNotIn("limited to administrator callers", out)
        client.get_setting.assert_called_once()

    def test_guard_fails_closed_when_admin_lookup_raises(self):
        """If we cannot tell whether the caller is an admin, refuse. Failing open
        here would hand a non-admin exactly what the guard protects."""
        client = self._client(False)
        client.caller_is_admin.side_effect = RuntimeError("boom")
        with self._patched(client):
            out = server.restore_backup("poznote_backup_test.zip", user_id=11)
        self.assertIn("error", out)
        client.restore_backup.assert_not_called()

    def test_admin_may_write_a_global_setting(self):
        """The guard must not block an administrator from the tools it protects."""
        client = self._client(True)
        with self._patched(client):
            out = server.update_app_setting("smtp_host", "mail.example.test", user_id=1)
        self.assertNotIn("limited to administrator callers", out)
        client.update_setting.assert_called_once()

    def test_admin_may_restore_a_backup(self):
        client = self._client(True)
        with self._patched(client):
            out = server.restore_backup("poznote_backup_test.zip", user_id=1)
        self.assertNotIn("limited to administrator callers", out)
        client.restore_backup.assert_called_once()

    def test_guard_is_inert_when_per_caller_auth_is_off(self):
        """caller_is_admin() returns None when the mode is off, so nothing changes."""
        client = self._client(None)
        with self._patched(client):
            out = server.restore_backup("poznote_backup_test.zip", user_id=11)
        self.assertNotIn("limited to administrator callers", out)
        self.assertIn('"ok": true', out)
        client.restore_backup.assert_called_once()


class ErrorAttributionTests(unittest.TestCase):
    """A refusal raised by the MCP server must not be reported as a Poznote API
    error. The maintainer asked for this: the per-caller refusals surfaced as
    "Poznote API error: IdentityMismatch" although the API never saw the request.
    """

    def _raising(self, exc):
        client = mock.Mock()
        client.get_note.side_effect = exc
        return mock.patch.object(server, "_get_client_or_error", return_value=(client, None))

    def test_identity_mismatch_is_attributed_to_the_mcp_server(self):
        from poznote_mcp.auth_external import IdentityMismatch
        exc = IdentityMismatch(
            "user_id=1 is not the profile this token is linked to (profile 11)."
        )
        with self._raising(exc):
            out = server.get_note(1, user_id=1)
        self.assertNotIn("Poznote API error", out)
        self.assertIn("MCP server refused this request", out)
        self.assertIn("not the profile this token is linked to", out)

    def test_an_unmapped_identity_is_attributed_to_the_mcp_server(self):
        from poznote_mcp.auth_external import IdentityUnmapped
        with self._raising(IdentityUnmapped("No verified identity on this request")):
            out = server.get_note(1)
        self.assertNotIn("Poznote API error", out)
        self.assertIn("MCP server", out)

    def test_a_provider_outage_is_not_reported_as_a_refusal(self):
        """The provider being unreachable is not the caller being refused."""
        from poznote_mcp.auth_external import IdentityProviderUnavailable
        with self._raising(IdentityProviderUnavailable("provider returned 503")):
            out = server.get_note(1)
        self.assertNotIn("Poznote API error", out)
        self.assertIn("could not verify", out)


class DefaultMatchTests(unittest.TestCase):
    """The default must not be weaker than the sign-in it sits beside."""

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def test_default_is_subject_only(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "https://x/y"}
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        self.assertEqual([(r.field, r.claim) for r in cfg.match], [("oidc_subject", "sub")])

    def test_username_and_email_are_opt_in(self):
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://x/y",
            "POZNOTE_MCP_IDENTITY_MATCH": "oidc_subject:sub,email:email",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        self.assertIn(("email", "email"), [(r.field, r.claim) for r in cfg.match])


class AudienceTests(unittest.TestCase):
    """A token the same provider issued for another application must not pass."""

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def _verifier(self, audience=None):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "https://x/y"}
        if audience:
            env["POZNOTE_MCP_AUTH_AUDIENCE"] = audience
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        return mod.ExternalTokenVerifier(cfg)

    def test_no_audience_configured_accepts_any(self):
        verifier = self._verifier()
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11", "aud": "other"})):
            self.assertIsNotNone(asyncio.run(verifier.verify_token("tok")))

    def test_matching_audience_is_accepted(self):
        verifier = self._verifier("this-app")
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11", "aud": "this-app"})):
            self.assertIsNotNone(asyncio.run(verifier.verify_token("tok")))

    def test_foreign_audience_is_refused(self):
        verifier = self._verifier("this-app")
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11", "aud": "other-app"})):
            self.assertIsNone(asyncio.run(verifier.verify_token("tok")))

    def test_absent_audience_is_refused_when_one_is_expected(self):
        verifier = self._verifier("this-app")
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11"})):
            self.assertIsNone(asyncio.run(verifier.verify_token("tok")))


class ProfileResolutionTests(unittest.TestCase):
    """resolve_caller_profile returns the profile, so is_admin is available."""

    def setUp(self):
        mod.reset_config_cache()
        mod.get_resolver().clear()
        self.addCleanup(mod.reset_config_cache)

    def _enable(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "https://x/y"}
        p = mock.patch.dict(os.environ, env, clear=True)
        p.start()
        self.addCleanup(p.stop)
        mod.reset_config_cache()

    def test_returns_the_whole_profile(self):
        self._enable()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "11"}):
            profile = mod.resolve_caller_profile(lambda: USERS)
        self.assertEqual(profile["id"], 11)
        self.assertFalse(profile["is_admin"])

    def test_id_helper_still_works(self):
        self._enable()
        with mock.patch.object(mod, "_current_claims", return_value={"sub": "12"}):
            self.assertEqual(mod.resolve_caller_profile_id(lambda: USERS), 12)


if __name__ == "__main__":
    unittest.main(verbosity=2)

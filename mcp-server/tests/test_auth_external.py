"""Tests for the per-caller authentication extension.

Run with either:

    python -m unittest discover -s tests -v
    python tests/test_auth_external.py

Standard library only, so they run inside the MCP virtualenv (which has no
pytest) and against a bare checkout.
"""

from __future__ import annotations

import time
import unittest
from unittest import mock

from poznote_mcp import auth_external as mod  # noqa: E402


def _response(status=200, payload=None, raise_json=False):
    response = mock.Mock()
    response.status_code = status
    if raise_json:
        response.json.side_effect = ValueError("not json")
    else:
        response.json.return_value = payload if payload is not None else {}
    return response


USERS = [
    {"id": 1, "username": "agipson33", "email": "agipson@gmail.com", "oidc_subject": ""},
    {"id": 11, "username": "grep", "email": "grep@ankh-labs.com", "oidc_subject": "11"},
    {"id": 12, "username": "meridian", "email": "meridian@ankh-labs.com", "oidc_subject": "12"},
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
        self.assertEqual(
            [(r.field, r.claim) for r in cfg.match],
            [("oidc_subject", "sub"), ("username", "preferred_username"), ("email", "email")],
        )

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
        found = mod.match_profile({"sub": "11", "preferred_username": "meridian"}, USERS, self.RULES)
        self.assertEqual(found["id"], 11)

    def test_falls_back_to_username_when_sub_absent(self):
        found = mod.match_profile({"preferred_username": "meridian"}, USERS, self.RULES)
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
        users = USERS + [{"id": 99, "username": "grep-clone", "email": "x@y", "oidc_subject": "11"}]
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
        with mock.patch.object(mod.httpx, "get", return_value=_response(200, {"sub": "11", "preferred_username": "grep"})):
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


if __name__ == "__main__":
    unittest.main(verbosity=2)



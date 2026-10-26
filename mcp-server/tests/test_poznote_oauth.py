"""Tests for sign-in through Poznote (POZNOTE_MCP_AUTH_PROVIDER=poznote, #1681).

Chat apps discover the OAuth endpoints from this server, sign in on Poznote's
consent page, and send the token here; this server asks Poznote's
introspection endpoint what it stands for. Standard library only, like
test_auth_external.py.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from unittest import mock

from starlette.applications import Starlette
from starlette.testclient import TestClient

from poznote_mcp import auth_external as mod  # noqa: E402
from poznote_mcp import poznote_oauth  # noqa: E402
from poznote_mcp.poznote_oauth import AppUrlResolver, PoznoteOAuthProvider, build_authorization_server_metadata  # noqa: E402

ENV = {
    "POZNOTE_MCP_AUTH_PROVIDER": "poznote",
    "POZNOTE_MCP_PUBLIC_URL": "https://mcp.example.com/",
    "POZNOTE_APP_URL": "https://notes.example.com",
    "POZNOTE_API_URL": "http://webserver:80/api/v1",
}


def _response(status=200, payload=None):
    response = mock.Mock()
    response.status_code = status
    response.json.return_value = payload if payload is not None else {}
    return response


def _config(**overrides):
    env = dict(ENV, **overrides)
    env = {k: v for k, v in env.items() if v is not None}
    with mock.patch.dict(os.environ, env, clear=True):
        return mod.ExternalAuthConfig.from_env()


class ConfigTests(unittest.TestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def test_config_parses(self):
        cfg = _config()
        self.assertEqual(cfg.provider, "poznote")
        self.assertEqual(cfg.public_url, "https://mcp.example.com")
        self.assertEqual(cfg.resource_url, "https://mcp.example.com/mcp")
        self.assertEqual(cfg.app_url, "https://notes.example.com")
        # Introspection stays on the internal address the API calls already use
        self.assertEqual(cfg.url, "http://webserver:80/oauth/introspect.php")

    def test_the_token_names_the_profile_and_the_level(self):
        cfg = _config()
        self.assertEqual([(r.field, r.claim) for r in cfg.match], [("id", "sub")])
        self.assertEqual(cfg.scope_claim, "poznote_level")
        self.assertEqual(cfg.scope_map, {"read": "read", "write": "write", "admin": "admin"})

    def test_match_and_scope_settings_are_ignored_not_applied(self):
        cfg = _config(POZNOTE_MCP_IDENTITY_MATCH="email:email", POZNOTE_MCP_SCOPE_MAP="x=admin")
        self.assertEqual([(r.field, r.claim) for r in cfg.match], [("id", "sub")])
        self.assertEqual(cfg.scope_map, {"read": "read", "write": "write", "admin": "admin"})

    def test_public_url_is_required(self):
        with self.assertRaises(ValueError):
            _config(POZNOTE_MCP_PUBLIC_URL=None)

    def test_app_url_is_optional(self):
        # Without it, the instance URL from Poznote's settings is used
        self.assertEqual(_config(POZNOTE_APP_URL="").app_url, "")

    def test_malformed_app_url_is_refused(self):
        with self.assertRaises(ValueError):
            _config(POZNOTE_APP_URL="notes.example.com")

    def test_auth_url_overrides_the_introspection_endpoint(self):
        cfg = _config(POZNOTE_MCP_AUTH_URL="http://127.0.0.1:8040/oauth/introspect.php")
        self.assertEqual(cfg.url, "http://127.0.0.1:8040/oauth/introspect.php")

    def test_introspection_url_without_api_suffix(self):
        self.assertEqual(mod.poznote_introspection_url("http://host:8080/"), "http://host:8080/oauth/introspect.php")

    def test_empty_identity_match_keeps_the_default_for_other_providers(self):
        # docker-compose passes the variable through empty when it is unset
        env = {
            "POZNOTE_MCP_AUTH_PROVIDER": "userinfo",
            "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u",
            "POZNOTE_MCP_IDENTITY_MATCH": "",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            cfg = mod.ExternalAuthConfig.from_env()
        self.assertEqual([(r.field, r.claim) for r in cfg.match], [("oidc_subject", "sub")])


class MetadataTests(unittest.TestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)
        self.cfg = _config()
        provider = PoznoteOAuthProvider(self.cfg, mod.ExternalTokenVerifier(self.cfg))
        self.client = TestClient(Starlette(routes=provider.get_routes("/mcp")))

    def test_protected_resource_points_at_this_server(self):
        prm = self.client.get("/.well-known/oauth-protected-resource/mcp").json()
        self.assertEqual(prm["resource"], "https://mcp.example.com/mcp")
        self.assertEqual(prm["authorization_servers"], ["https://mcp.example.com/"])

    def test_authorization_server_issuer_matches_the_resource_metadata(self):
        prm = self.client.get("/.well-known/oauth-protected-resource/mcp").json()
        asm = self.client.get("/.well-known/oauth-authorization-server").json()
        # An app refuses metadata whose issuer differs from the server it was sent to
        self.assertEqual(asm["issuer"], prm["authorization_servers"][0])

    def test_endpoints_are_poznote_pages(self):
        asm = self.client.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(asm["authorization_endpoint"], "https://notes.example.com/oauth/authorize.php")
        self.assertEqual(asm["token_endpoint"], "https://notes.example.com/oauth/token.php")
        self.assertEqual(asm["registration_endpoint"], "https://notes.example.com/oauth/register.php")
        self.assertEqual(asm["code_challenge_methods_supported"], ["S256"])
        self.assertNotIn("introspection_endpoint", asm)

    def test_trailing_slash_spelling_is_served_too(self):
        response = self.client.get("/.well-known/oauth-authorization-server/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["issuer"], "https://mcp.example.com/")

    def test_openid_discovery_path_serves_the_same_document(self):
        oauth = self.client.get("/.well-known/oauth-authorization-server").json()
        for path in ("/.well-known/openid-configuration", "/.well-known/openid-configuration/"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertEqual(response.json(), oauth, path)

    def test_metadata_answers_cors_preflight(self):
        response = self.client.options(
            "/.well-known/oauth-authorization-server",
            headers={"Origin": "https://claude.ai", "Access-Control-Request-Method": "GET"},
        )
        self.assertIn(response.status_code, (200, 204))

    def test_metadata_builder_needs_no_server(self):
        self.assertEqual(str(build_authorization_server_metadata(self.cfg).revocation_endpoint),
                         "https://notes.example.com/oauth/revoke.php")


class AppUrlFromSettingsTests(unittest.TestCase):
    """POZNOTE_APP_URL left empty: the instance URL comes from Poznote's settings."""

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)
        handle = tempfile.NamedTemporaryFile("w", delete=False)
        handle.write("service-token\n")
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        self.cfg = _config(POZNOTE_APP_URL="")
        env = mock.patch.dict(os.environ, {
            "POZNOTE_SERVICE_TOKEN_FILE": handle.name,
            "POZNOTE_API_URL": "http://webserver:80/api/v1",
            "POZNOTE_USER_ID": "1",
        })
        env.start()
        self.addCleanup(env.stop)

    def _client(self):
        provider = PoznoteOAuthProvider(self.cfg, mod.ExternalTokenVerifier(self.cfg))
        return TestClient(Starlette(routes=provider.get_routes("/mcp")))

    def test_metadata_uses_the_instance_url_from_settings(self):
        reply = _response(200, {"success": True, "key": "smtp_app_url", "value": "https://notes.example.org/"})
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=reply) as get:
            asm = self._client().get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(asm["authorization_endpoint"], "https://notes.example.org/oauth/authorize.php")
        self.assertEqual(get.call_args.args[0], "http://webserver:80/api/v1/settings/smtp_app_url")
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer service-token")

    def test_unset_instance_url_answers_503_not_a_broken_document(self):
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=_response(200, {"value": ""})):
            response = self._client().get("/.well-known/oauth-authorization-server")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"], "temporarily_unavailable")

    def test_a_value_that_is_not_a_web_address_is_not_used(self):
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=_response(200, {"value": "javascript:alert(1)"})):
            self.assertEqual(AppUrlResolver(self.cfg).get(), "")

    def test_unreachable_poznote_answers_503(self):
        with mock.patch.object(poznote_oauth.httpx, "get", side_effect=mod.httpx.ConnectError("down")):
            self.assertEqual(self._client().get("/.well-known/oauth-authorization-server").status_code, 503)

    def test_the_answer_is_cached(self):
        resolver = AppUrlResolver(self.cfg)
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=_response(200, {"value": "https://n.example"})) as get:
            resolver.get()
            resolver.get()
        self.assertEqual(get.call_count, 1)

    def test_the_setting_wins_over_the_environment_like_on_the_php_side(self):
        resolver = AppUrlResolver(_config(POZNOTE_APP_URL="https://env.example"))
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=_response(200, {"value": "https://set.example"})):
            self.assertEqual(resolver.get(), "https://set.example")

    def test_the_environment_is_the_fallback(self):
        cfg = _config(POZNOTE_APP_URL="https://env.example")
        with mock.patch.object(poznote_oauth.httpx, "get", return_value=_response(200, {"value": ""})):
            self.assertEqual(AppUrlResolver(cfg).get(), "https://env.example")
        with mock.patch.object(poznote_oauth.httpx, "get", side_effect=mod.httpx.ConnectError("down")):
            self.assertEqual(AppUrlResolver(cfg).get(), "https://env.example")


class IntrospectionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)
        handle = tempfile.NamedTemporaryFile("w", delete=False)
        handle.write("service-token\n")
        handle.close()
        self.addCleanup(os.unlink, handle.name)
        self.cfg = _config()
        self.env = mock.patch.dict(os.environ, {"POZNOTE_SERVICE_TOKEN_FILE": handle.name})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.verifier = mod.ExternalTokenVerifier(self.cfg)

    async def test_introspection_sends_the_service_token(self):
        claims = {"active": True, "sub": "11", "poznote_level": "read", "aud": "https://mcp.example.com/mcp"}
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, claims)) as post:
            token = await self.verifier.verify_token("pzo_abc")
        self.assertIsNotNone(token)
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer service-token")
        self.assertEqual(post.call_args.kwargs["data"]["token"], "pzo_abc")
        self.assertEqual(post.call_args.args[0], "http://webserver:80/oauth/introspect.php")
        # The level chosen on the consent page becomes the caller's tool level
        self.assertEqual(token.scopes, ["read"])

    async def test_inactive_token_is_refused(self):
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, {"active": False})):
            self.assertIsNone(await self.verifier.verify_token("pzo_abc"))

    async def test_token_for_another_resource_is_refused(self):
        claims = {"active": True, "sub": "11", "poznote_level": "write", "aud": "https://elsewhere.example/mcp"}
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, claims)):
            self.assertIsNone(await self.verifier.verify_token("pzo_abc"))

    async def test_token_without_audience_is_accepted(self):
        claims = {"active": True, "sub": "11", "poznote_level": "write"}
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, claims)):
            token = await self.verifier.verify_token("pzo_abc")
        self.assertEqual(token.scopes, ["write"])

    async def test_token_without_a_level_is_refused(self):
        with mock.patch.object(mod.httpx, "post", return_value=_response(200, {"active": True, "sub": "11"})):
            self.assertIsNone(await self.verifier.verify_token("pzo_abc"))

    async def test_rejected_service_token_is_an_outage_not_a_bad_token(self):
        provider = mod.PoznoteIntrospectionProvider(self.cfg)
        with mock.patch.object(mod.httpx, "post", return_value=_response(401)):
            with self.assertRaises(mod.IdentityProviderUnavailable):
                provider.resolve("pzo_abc")

    async def test_missing_service_token_file_is_an_outage(self):
        with mock.patch.dict(os.environ, {"POZNOTE_SERVICE_TOKEN_FILE": "/nonexistent/.mcp_token"}):
            with self.assertRaises(mod.IdentityProviderUnavailable):
                mod.PoznoteIntrospectionProvider(self.cfg).resolve("pzo_abc")

    def test_profile_is_matched_by_id(self):
        users = [{"id": 1, "username": "admin"}, {"id": 11, "username": "alpha"}]
        self.assertEqual(mod.match_profile({"sub": "11"}, users, self.cfg.match)["username"], "alpha")
        self.assertIsNone(mod.match_profile({"sub": "99"}, users, self.cfg.match))


class BuildTests(unittest.TestCase):
    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def test_build_returns_the_oauth_provider(self):
        with mock.patch.dict(os.environ, ENV, clear=True):
            provider = mod.build_external_auth_provider()
        self.assertIsInstance(provider, PoznoteOAuthProvider)

    def test_missing_urls_stop_the_server(self):
        with mock.patch.dict(os.environ, {"POZNOTE_MCP_AUTH_PROVIDER": "poznote"}, clear=True):
            with self.assertRaises(ValueError):
                mod.build_external_auth_provider()


if __name__ == "__main__":
    unittest.main()


class AdminClaimTests(unittest.TestCase):
    """Administrator rights over MCP follow the person who approved the token."""

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def _admin(self, env, claims):
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(mod, "_current_claims", return_value=claims):
            return mod.caller_admin_claim()

    def test_approver_admin_claim_is_used(self):
        self.assertTrue(self._admin(ENV, {"sub": "1", "poznote_admin": True}))

    def test_borrowed_admin_account_is_not_admin(self):
        # sub is the administrator's account, but the approver is not one
        self.assertFalse(self._admin(ENV, {"sub": "1", "poznote_admin": False, "poznote_login_user_id": 7}))

    def test_missing_claim_fails_closed(self):
        self.assertFalse(self._admin(ENV, {"sub": "1"}))

    def test_a_truthy_non_boolean_is_not_trusted(self):
        self.assertFalse(self._admin(ENV, {"sub": "1", "poznote_admin": "yes"}))

    def test_other_providers_never_read_the_claim(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u"}
        self.assertIsNone(self._admin(env, {"sub": "1", "poznote_admin": True}))

    def test_client_uses_the_claim_over_the_profile_flag(self):
        from poznote_mcp.client import PoznoteClient

        client = PoznoteClient.__new__(PoznoteClient)
        with mock.patch("poznote_mcp.client.resolve_caller_profile", return_value={"id": 1, "is_admin": 1}), \
             mock.patch("poznote_mcp.client.caller_admin_claim", return_value=False):
            self.assertFalse(client.caller_is_admin())


class TrailingSlashTests(unittest.TestCase):
    """A connector URL pasted as .../mcp/ must reach the endpoint, not a redirect."""

    def test_trailing_slash_is_served_as_mcp(self):
        from starlette.responses import PlainTextResponse
        from starlette.routing import Route as R
        from poznote_mcp.server import McpTrailingSlashAlias

        app = Starlette(routes=[R("/mcp", lambda request: PlainTextResponse(request.url.path), methods=["POST"])])
        client = TestClient(McpTrailingSlashAlias(app))
        response = client.post("/mcp/", follow_redirects=False)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.text, "/mcp")
        self.assertEqual(client.post("/mcpx", follow_redirects=False).status_code, 404)


class DestinationSettingTests(unittest.TestCase):
    """A connected app may not change where the account's data is sent."""

    def setUp(self):
        mod.reset_config_cache()
        self.addCleanup(mod.reset_config_cache)

    def _call(self, env, key, value="https://attacker.example/repo"):
        from poznote_mcp import server

        client = mock.Mock()
        client.caller_is_admin.return_value = True
        client.update_setting.return_value = {"success": True}
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(server, "_get_client_or_error", return_value=(client, None)):
            out = server.update_app_setting(key, value)
        return out, client

    def test_destination_keys_are_refused_to_a_connected_app(self):
        for key in ("git_repo", "git_api_base", "git_provider", "git_token",
                    "ai_user_url", "ai_user_provider", "ai_user_api_key", "ai_user_headers", "ai_user_mcp_servers",
                    "stt_user_url", "stt_user_provider", "stt_user_api_key"):
            out, client = self._call(ENV, key)
            self.assertIn("cannot be changed through a connected app", out, key)
            client.update_setting.assert_not_called()

    def test_other_personal_settings_still_work_for_a_connected_app(self):
        for key in ("note_list_sort", "mcp_default_workspace", "git_branch", "git_sync_auto_push", "ai_user_model"):
            out, client = self._call(ENV, key, "x")
            self.assertNotIn("cannot be changed", out, key)
            client.update_setting.assert_called_once()

    def test_the_operator_keeps_every_key_without_per_caller_auth(self):
        out, client = self._call({"POZNOTE_MCP_AUTH_TOKEN": "shared"}, "git_repo")
        self.assertNotIn("cannot be changed", out)
        client.update_setting.assert_called_once()

    def test_the_external_provider_mode_is_covered_too(self):
        env = {"POZNOTE_MCP_AUTH_PROVIDER": "userinfo", "POZNOTE_MCP_AUTH_URL": "https://idp.example.com/u"}
        out, client = self._call(env, "ai_user_url")
        self.assertIn("cannot be changed through a connected app", out)
        client.update_setting.assert_not_called()

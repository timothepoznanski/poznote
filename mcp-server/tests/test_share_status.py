"""Regression tests for reading share status off the API.

The client used to unwrap a "share" key from the share endpoints. Neither
ShareController nor FolderShareController ever sends one: they echo the share
fields at the top level. So data.get("share") was always None and
get_note_share_status reported "Note is not shared publicly" for a note that
was in fact shared, while share_note reported a failure for a share it had
just created.

The response bodies below are copied from ShareController::show / ::store and
FolderShareController::show.
"""

import json
from unittest.mock import MagicMock, patch

from poznote_mcp.client import PoznoteClient
from poznote_mcp import server


def _mock_response(payload, status=200):
    response = MagicMock()
    response.status_code = status
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


NOTE_SHARED = {
    "success": True,
    "public": True,
    "url": "//host/a1d57400ab6ee28f0819bc1f4d983821",
    "url_query": "//host/public_note.php?token=a1d57400ab6ee28f0819bc1f4d983821",
    "url_workspace": "//host/workspace/a1d57400ab6ee28f0819bc1f4d983821",
    "indexable": 0,
    "hasPassword": False,
    "passwordValue": "",
    "noteType": "note",
    "accessMode": "read_only",
    "workspace": "Demo",
    "allowed_users": None,
}

NOTE_NOT_SHARED = {
    "success": True,
    "public": False,
    "noteType": "note",
    "accessMode": "full",
}

FOLDER_SHARED = {
    "success": True,
    "public": True,
    "url": "//host/tok",
    "url_query": "//host/public_folder.php?token=tok",
    "indexable": 1,
    "hasPassword": True,
    "passwordValue": "hunter2",
    "workspace": "Demo",
    "allowed_users": None,
    "accessMode": "read_only",
}

FOLDER_NOT_SHARED = {"success": True, "public": False}


def _client(http_client):
    with patch("poznote_mcp.client.httpx.Client", return_value=http_client):
        return PoznoteClient(base_url="http://example.test/api/v1", service_token="t")


class TestNoteShareStatus:

    def test_a_shared_note_is_reported_as_shared(self):
        http = MagicMock()
        http.get.return_value = _mock_response(NOTE_SHARED)
        share = _client(http).get_note_share_status(14)

        assert share is not None, "a shared note must not read as unshared"
        assert share["public"] is True
        assert share["url"].endswith("a1d57400ab6ee28f0819bc1f4d983821")
        assert share["accessMode"] == "read_only"
        # 'success' is transport-level bookkeeping, not part of the share.
        assert "success" not in share

    def test_an_unshared_note_reads_as_none(self):
        http = MagicMock()
        http.get.return_value = _mock_response(NOTE_NOT_SHARED)
        assert _client(http).get_note_share_status(14) is None

    def test_creating_a_share_returns_the_new_link(self):
        http = MagicMock()
        http.post.return_value = _mock_response(NOTE_SHARED, status=201)
        share = _client(http).create_note_share(14)

        assert share is not None, "a share that was created must not read as a failure"
        assert share["url_query"].startswith("//host/public_note.php")


class TestFolderShareStatus:

    def test_a_shared_folder_is_reported_as_shared(self):
        http = MagicMock()
        http.get.return_value = _mock_response(FOLDER_SHARED)
        share = _client(http).get_folder_share_status(3)

        assert share is not None
        assert share["hasPassword"] is True
        assert share["indexable"] == 1

    def test_an_unshared_folder_reads_as_none(self):
        http = MagicMock()
        http.get.return_value = _mock_response(FOLDER_NOT_SHARED)
        assert _client(http).get_folder_share_status(3) is None


class TestToolsSeeTheShare:
    """End of the chain: the tool output the model reads."""

    def test_get_note_share_status_tool_shows_a_shared_note(self):
        fake = MagicMock()
        fake.get_note_share_status.return_value = {"public": True, "url": "//host/tok"}
        with patch.object(server, "_get_client_or_error", return_value=(fake, None)):
            out = json.loads(server.get_note_share_status(note_id=14))
        assert out["success"] is True
        assert out["share"]["url"] == "//host/tok"

    def test_share_note_tool_reports_the_created_link(self):
        fake = MagicMock()
        fake.create_note_share.return_value = {"public": True, "url": "//host/tok"}
        with patch.object(server, "_get_client_or_error", return_value=(fake, None)):
            out = json.loads(server.share_note(note_id=14))
        assert out["success"] is True
        assert out["share"]["url"] == "//host/tok"

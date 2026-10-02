"""Names, keys and ids handed to a tool end up in the URL of an API call.

Each one must stay a single path segment: with a slash or a dot-segment in
it, a call meant for one route (delete this backup) would be sent to another
one of the API, with the service token's rights.
"""

import httpx
import pytest

from poznote_mcp.client import PoznoteClient, _path_segment


def _client_recording_requests(seen):
    def handler(request):
        seen.append((request.method, request.url.raw_path.decode("ascii")))
        return httpx.Response(200, json={"success": True})

    client = PoznoteClient(base_url="http://example.test/api/v1", service_token="secret-token")
    client.client._transport = httpx.MockTransport(handler)
    return client


def test_ordinary_values_are_sent_unchanged():
    assert _path_segment("poznote_backup_2026-02-02_15-30-00.zip") == "poznote_backup_2026-02-02_15-30-00.zip"
    assert _path_segment("note_font_size") == "note_font_size"
    assert _path_segment("1727890123456.789") == "1727890123456.789"
    assert _path_segment(42) == "42"


def test_names_with_spaces_and_accents_stay_one_segment():
    assert _path_segment("My Workspace") == "My%20Workspace"
    assert _path_segment("Équipe R&D") == "%C3%89quipe%20R%26D"
    assert _path_segment("50% done") == "50%25%20done"


@pytest.mark.parametrize("value", ["", ".", ".."])
def test_values_that_cannot_be_a_segment_are_refused(value):
    with pytest.raises(ValueError):
        _path_segment(value)


def test_a_backup_name_cannot_reach_another_route():
    seen = []
    client = _client_recording_requests(seen)
    try:
        client.delete_backup("poznote_backup_2026-02-02_15-30-00.zip")
        client.delete_backup("../admin/users/3")
        client.restore_backup("../../notes/7")
        with pytest.raises(ValueError):
            client.delete_backup("..")
    finally:
        client.close()

    assert seen == [
        ("DELETE", "/api/v1/backups/poznote_backup_2026-02-02_15-30-00.zip"),
        ("DELETE", "/api/v1/backups/..%2Fadmin%2Fusers%2F3"),
        ("POST", "/api/v1/backups/..%2F..%2Fnotes%2F7/restore"),
    ]


def test_setting_keys_workspace_names_and_task_ids_are_encoded_too():
    seen = []
    client = _client_recording_requests(seen)
    try:
        client.get_setting("../admin/stats")
        client.delete_workspace("Team/../../admin/users/3")
        client.delete_task(5, "../../../admin/users/3")
        client.rename_workspace("My Workspace", "Renamed")
    finally:
        client.close()

    assert [path for _, path in seen] == [
        "/api/v1/settings/..%2Fadmin%2Fstats",
        "/api/v1/workspaces/Team%2F..%2F..%2Fadmin%2Fusers%2F3",
        "/api/v1/notes/5/tasks/..%2F..%2F..%2Fadmin%2Fusers%2F3",
        "/api/v1/workspaces/My%20Workspace",
    ]

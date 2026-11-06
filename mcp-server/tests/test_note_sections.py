"""Section addressing by heading (issue #1736, second half).

The risk here is not that a section is missed, it is that the wrong range of
a long note gets overwritten: a heading inside a code fence, a heading that
appears twice, a subsection swallowed or cut short, an HTML heading whose
section has no clean boundary. Each of those has a test.
"""

import json
from unittest.mock import MagicMock, patch

from poznote_mcp import note_sections, server


MD = (
    "# Project\n"
    "\n"
    "Intro line.\n"
    "\n"
    "## Status\n"
    "\n"
    "Running.\n"
    "\n"
    "### Detail\n"
    "\n"
    "Deeper.\n"
    "\n"
    "## Notes\n"
    "\n"
    "Last words.\n"
)


def _by_heading(sections, text):
    return next(s for s in sections if s["heading"] == text)


# =============================================================================
# Markdown outline
# =============================================================================

def test_markdown_headings_are_listed_with_their_levels():
    sections = note_sections.outline(MD, "markdown")

    assert [(s["level"], s["heading"]) for s in sections] == [
        (1, "Project"),
        (2, "Status"),
        (3, "Detail"),
        (2, "Notes"),
    ]


def test_an_offset_points_at_the_heading_line():
    sections = note_sections.outline(MD, "markdown")
    status = _by_heading(sections, "Status")

    assert MD[status["offset"]:].startswith("## Status\n")
    assert MD[status["body_offset"]:].startswith("\nRunning.")


def test_a_section_stops_at_the_next_heading_of_its_level_or_above():
    sections = note_sections.outline(MD, "markdown")
    status = _by_heading(sections, "Status")

    # Its subsection travels with it; the next "##" ends it.
    body = MD[status["offset"]:status["end"]]
    assert "Running." in body and "Deeper." in body
    assert "Last words." not in body
    assert MD[status["end"]:].startswith("## Notes")


def test_the_last_section_runs_to_the_end_of_the_note():
    sections = note_sections.outline(MD, "markdown")

    assert _by_heading(sections, "Notes")["end"] == len(MD)


def test_a_heading_inside_a_code_fence_is_not_a_heading():
    content = "# Real\n\n```\n# Not a heading\n```\n\n## Also real\n"
    sections = note_sections.outline(content, "markdown")

    assert [s["heading"] for s in sections] == ["Real", "Also real"]


def test_closing_hashes_are_decoration():
    sections = note_sections.outline("## Tidy ##\n", "markdown")

    assert sections[0]["heading"] == "Tidy"


def test_four_spaces_of_indentation_is_code_not_a_heading():
    sections = note_sections.outline("   ### Three\n    #### Four\n", "markdown")

    assert [s["heading"] for s in sections] == ["Three"]


def test_a_hash_without_a_space_is_not_a_heading():
    assert note_sections.outline("#NotAHeading\n", "markdown") == []


# =============================================================================
# Markdown edits
# =============================================================================

def test_replacing_a_section_keeps_its_heading_and_its_neighbours():
    new, failure = note_sections.replace_section(MD, "markdown", "Status", "Stalled.")

    assert failure is None
    assert "## Status\n\nStalled.\n\n## Notes" in new
    assert "# Project\n\nIntro line." in new
    assert "Last words." in new
    # The subsection belonged to the section, so it went with it.
    assert "Deeper." not in new


def test_appending_to_a_section_lands_before_the_next_heading():
    new, failure = note_sections.replace_section(
        MD, "markdown", "Status", "- 12:40 still running", mode="append"
    )

    assert failure is None
    assert "Deeper.\n\n- 12:40 still running\n\n## Notes" in new
    assert "Running." in new


def test_replacing_the_last_section_keeps_the_file_tidy():
    new, _ = note_sections.replace_section(MD, "markdown", "Notes", "Nothing to add.")

    assert new.endswith("## Notes\n\nNothing to add.\n")


def test_an_empty_body_empties_the_section_without_eating_the_next_heading():
    new, _ = note_sections.replace_section(MD, "markdown", "Status", "")

    assert "## Status\n\n## Notes" in new


def test_a_missing_heading_is_refused_and_the_real_ones_are_listed():
    new, failure = note_sections.replace_section(MD, "markdown", "Budget", "x")

    assert new is None
    assert failure["error"] == "heading_not_found"
    assert [h["heading"] for h in failure["headings"]] == [
        "Project", "Status", "Detail", "Notes",
    ]


def test_create_if_missing_opens_the_section_at_the_end():
    new, failure = note_sections.replace_section(
        MD, "markdown", "Budget", "Nothing spent.", create_if_missing=True, level=2
    )

    assert failure is None
    assert new.endswith("## Budget\n\nNothing spent.\n")
    assert "Last words." in new


def test_two_headings_with_the_same_text_are_refused_not_guessed():
    content = "## Notes\n\nfirst\n\n# Other\n\n## Notes\n\nsecond\n"
    new, failure = note_sections.replace_section(content, "markdown", "Notes", "x")

    assert new is None
    assert failure["error"] == "heading_ambiguous"
    assert [c["occurrence"] for c in failure["candidates"]] == [1, 2]


def test_occurrence_picks_one_of_them():
    content = "## Notes\n\nfirst\n\n# Other\n\n## Notes\n\nsecond\n"
    new, failure = note_sections.replace_section(
        content, "markdown", "Notes", "replaced", occurrence=2
    )

    assert failure is None
    assert "## Notes\n\nfirst\n" in new
    assert new.endswith("## Notes\n\nreplaced\n")


def test_matching_ignores_case_and_extra_spaces():
    new, failure = note_sections.replace_section(MD, "markdown", "  stATUS  ", "Fine.")

    assert failure is None
    assert "## Status\n\nFine." in new


def test_an_unknown_mode_is_refused():
    new, failure = note_sections.replace_section(MD, "markdown", "Status", "x", mode="prepend")

    assert new is None
    assert failure["error"] == "bad_mode"


# =============================================================================
# HTML
# =============================================================================

HTML = (
    "<h1>Project</h1><p>Intro.</p>"
    "<h2>Status</h2><p>Running.</p>"
    "<h2>Notes</h2><p>Last words.</p>"
)


def test_html_headings_are_listed_and_addressable_at_the_top_level():
    sections = note_sections.outline(HTML, "note")

    assert [(s["level"], s["heading"], s["addressable"]) for s in sections] == [
        (1, "Project", True),
        (2, "Status", True),
        (2, "Notes", True),
    ]


def test_an_html_section_stops_at_the_next_heading():
    sections = note_sections.outline(HTML, "note")
    status = _by_heading(sections, "Status")

    assert HTML[status["body_offset"]:status["end"]] == "<p>Running.</p>"


def test_replacing_an_html_section_leaves_its_neighbours_alone():
    new, failure = note_sections.replace_section(HTML, "note", "Status", "Stalled.")

    assert failure is None
    assert new == (
        "<h1>Project</h1><p>Intro.</p>"
        "<h2>Status</h2><p>Stalled.</p>"
        "<h2>Notes</h2><p>Last words.</p>"
    )


def test_appending_to_an_html_section_lands_before_the_next_heading():
    new, _ = note_sections.replace_section(HTML, "note", "Status", "Still up.", mode="append")

    assert "<p>Running.</p><p>Still up.</p><h2>Notes</h2>" in new


def test_a_heading_inside_another_element_is_listed_but_refused():
    content = "<h2>Top</h2><div><h3>Buried</h3><p>text</p></div>"
    sections = note_sections.outline(content, "note")

    assert [(s["heading"], s["addressable"]) for s in sections] == [
        ("Top", True),
        ("Buried", False),
    ]

    new, failure = note_sections.replace_section(content, "note", "Buried", "x")
    assert new is None
    assert failure["error"] == "heading_not_addressable"
    assert "replace_in_note" in failure["message"]


def test_replacing_a_section_takes_the_boxes_sitting_under_it():
    """As wide as the section, exactly as a Markdown subsection would be."""
    content = "<h2>Status</h2><p>Running.</p><div><h3>Buried</h3><p>inside</p></div><h2>Notes</h2><p>n</p>"
    new, _ = note_sections.replace_section(content, "note", "Status", "Stalled.")

    assert new == "<h2>Status</h2><p>Stalled.</p><h2>Notes</h2><p>n</p>"


def test_a_buried_heading_does_not_cut_the_section_that_contains_it():
    content = "<h2>Top</h2><div><h2>Buried</h2></div><p>still Top</p><h2>Next</h2><p>n</p>"
    sections = note_sections.outline(content, "note")
    top = _by_heading(sections, "Top")

    assert "still Top" in content[top["body_offset"]:top["end"]]
    assert content[top["end"]:].startswith("<h2>Next</h2>")


def test_an_unclosed_paragraph_does_not_make_later_headings_unreachable():
    """Pasted HTML often carries them, and depth counting alone would be fooled."""
    content = "<p>loose<h2>Status</h2><p>Running.</p>"
    sections = note_sections.outline(content, "note")

    assert [(s["heading"], s["addressable"]) for s in sections] == [("Status", True)]


def test_html_heading_text_ignores_inline_markup():
    sections = note_sections.outline("<h2>Status <em>now</em></h2><p>x</p>", "note")

    assert sections[0]["heading"] == "Status now"


def test_create_if_missing_adds_an_html_section_at_the_end():
    new, failure = note_sections.replace_section(
        HTML, "note", "Budget & co", "Nothing spent.", create_if_missing=True, level=3
    )

    assert failure is None
    assert new.endswith("<h3>Budget &amp; co</h3><p>Nothing spent.</p>")


# =============================================================================
# The tools
# =============================================================================

def _note(content, note_type="markdown", version="v1"):
    return {
        "id": 7,
        "heading": "Project",
        "type": note_type,
        "content": content,
        "tags": "",
        "folder": None,
        "updated": "2026-11-06 10:00:00",
        "created": "2026-01-01 10:00:00",
        "version": version,
    }


def test_get_note_outline_returns_the_plan_and_the_version_its_offsets_belong_to():
    client = MagicMock()
    client.get_note.return_value = _note(MD)

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note_outline(7))

    assert payload["count"] == 4
    assert payload["version"] == "v1"
    assert payload["length"] == len(MD)
    assert payload["headings"][1]["heading"] == "Status"
    # The plan is cheap on purpose: no content comes back with it.
    assert "content" not in payload


def test_get_note_outline_refuses_a_task_list():
    client = MagicMock()
    client.get_note.return_value = _note("[]", note_type="tasklist")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.get_note_outline(7))

    assert payload["error"] == "unsupported_note_type"


def test_replace_section_writes_the_whole_note_back_once():
    client = MagicMock()
    client.get_note.return_value = _note(MD)
    client.update_note.return_value = {"id": 7, "version": "v2"}

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.replace_section(7, "Status", "Stalled."))

    _, kwargs = client.update_note.call_args
    assert "## Status\n\nStalled.\n\n## Notes" in kwargs["content"]
    assert kwargs["if_version"] == "v1"
    assert payload["success"] is True


def test_replace_section_finds_the_heading_again_after_a_conflict():
    """The offsets read before the conflict are void; the retry must re-locate."""
    client = MagicMock()
    client.get_note.return_value = _note("## Status\n\nold\n")
    moved = "# Added by someone else\n\nlots of new text\n\n## Status\n\nold\n"
    client.update_note.side_effect = [
        {"code": "version_conflict", "current": {"version": "v9", "content": moved}},
        {"id": 7, "version": "v10"},
    ]

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.replace_section(7, "Status", "new"))

    _, kwargs = client.update_note.call_args
    assert kwargs["content"] == "# Added by someone else\n\nlots of new text\n\n## Status\n\nnew\n"
    assert payload["attempts"] == 2


def test_an_ambiguous_heading_stops_before_the_write():
    client = MagicMock()
    client.get_note.return_value = _note("## Notes\n\na\n\n# X\n\n## Notes\n\nb\n")

    with patch.object(server, "_get_client_or_error", return_value=(client, None)):
        payload = json.loads(server.replace_section(7, "Notes", "x"))

    assert payload["error"] == "heading_ambiguous"
    client.update_note.assert_not_called()


def test_replace_section_is_classified_as_a_write_that_overwrites():
    assert server.TOOL_SCOPES["replace_section"] == "write"
    assert server.TOOL_SCOPES["get_note_outline"] == "read"
    assert "replace_section" in server.DESTRUCTIVE_TOOLS
    assert "get_note_outline" not in server.DESTRUCTIVE_TOOLS

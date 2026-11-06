"""Addressing a note's sections by heading, for issue #1736.

Pure text work, like note_text: the tools in server.py do the HTTP around it.

Markdown follows what Poznote's own parser renders and nothing more
(src/public/js/markdown-parser.js): ATX headings, up to three spaces of
indentation, a space after the hashes, and ``` fences whose contents are not
scanned. No setext headings, because the app does not render them either, and
an outline must not promise a section the user cannot see.

HTML is addressed only where it can be addressed honestly. A heading that sits
at the top level of the note's markup has a section that runs to the next such
heading; one buried in a <div> or a <details> has no boundary that can be cut
without breaking the markup around it, so it is listed as not addressable and
refused, with replace_in_note as the way through.
"""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser
from typing import Any, Optional

from .note_text import merge_append, wrap_html_chunk

# Poznote's own heading and fence rules, kept identical on purpose.
_MD_HEADING = re.compile(r"^ {0,3}(#{1,6})\s+(.+)$")
_MD_FENCE = re.compile(r"^\s*```")

_HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})

_VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
})

# An open element that a new start tag closes by itself. Without this, one
# unclosed <p>, which a pasted note can easily carry, would make every heading
# after it look nested and therefore unaddressable.
_CLOSED_BY_START = {
    "p": frozenset({"p", "div", "ul", "ol", "table", "blockquote", "pre", "hr",
                    "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"}),
    "li": frozenset({"li"}),
    "dt": frozenset({"dt", "dd"}),
    "dd": frozenset({"dt", "dd"}),
    "td": frozenset({"td", "th", "tr"}),
    "th": frozenset({"td", "th", "tr"}),
    "tr": frozenset({"tr"}),
    "option": frozenset({"option"}),
}

# How many headings an error message lists before it stops.
_MAX_LISTED = 30


def normalize_heading(text: str) -> str:
    """The form two headings are compared in: case and spacing do not count."""
    return re.sub(r"\s+", " ", (text or "").strip()).casefold()


# =============================================================================
# Markdown
# =============================================================================

def _outline_markdown(content: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    offset = 0
    in_fence = False

    for line in content.splitlines(keepends=True):
        bare = line.rstrip("\n")
        if _MD_FENCE.match(bare):
            in_fence = not in_fence
        elif not in_fence:
            match = _MD_HEADING.match(bare)
            if match:
                title = match.group(2).strip()
                # A closing run of hashes is decoration, not part of the title.
                title = re.sub(r"\s*#+$", "", title).strip()
                sections.append({
                    "level": len(match.group(1)),
                    "heading": title,
                    "offset": offset,
                    "body_offset": offset + len(line),
                    "addressable": True,
                })
        offset += len(line)

    return sections


def _replace_markdown(content: str, section: dict[str, Any], body: str, mode: str) -> str:
    head = content[: section["body_offset"]]
    if head and not head.endswith("\n"):
        head += "\n"
    tail = content[section["end"]:]

    if mode == "append":
        existing = content[section["body_offset"]:section["end"]]
        middle = merge_append(existing, body, "markdown")
    else:
        text = body.strip("\n")
        middle = ("\n" + text + "\n") if text.strip() else ""

    if tail and not middle.endswith("\n\n"):
        middle = middle.rstrip("\n") + "\n\n" if middle.strip() else "\n"
    return head + middle + tail


def _create_markdown(content: str, heading: str, body: str, level: int) -> str:
    block = "#" * level + " " + heading.strip()
    text = body.strip("\n")
    if text.strip():
        block += "\n\n" + text
    return merge_append(content, block, "markdown")


# =============================================================================
# HTML
# =============================================================================

class _HeadingReader(HTMLParser):
    """Collects every <h1>-<h6> of a note body with its character offsets."""

    def __init__(self, content: str) -> None:
        super().__init__(convert_charrefs=True)
        self._content = content
        self._line_starts = [0]
        for index, char in enumerate(content):
            if char == "\n":
                self._line_starts.append(index + 1)
        self._stack: list[str] = []
        self._open: Optional[dict[str, Any]] = None
        self.sections: list[dict[str, Any]] = []

    def _offset(self) -> int:
        line, column = self.getpos()
        if line - 1 >= len(self._line_starts):
            return len(self._content)
        return min(self._line_starts[line - 1] + column, len(self._content))

    def _tag_end(self, start: int) -> int:
        closing = self._content.find(">", start)
        return len(self._content) if closing == -1 else closing + 1

    def handle_starttag(self, tag, attrs):
        if tag in _VOID_TAGS:
            return
        while self._stack and tag in _CLOSED_BY_START.get(self._stack[-1], ()):
            self._stack.pop()
        if tag in _HEADING_TAGS and self._open is None:
            self._open = {
                "level": int(tag[1]),
                "tag": tag,
                "heading_parts": [],
                "offset": self._offset(),
                "addressable": not self._stack,
                "depth": len(self._stack),
            }
            self.sections.append(self._open)
        self._stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        return

    def handle_endtag(self, tag):
        if tag in _VOID_TAGS:
            return
        if tag in self._stack:
            while self._stack:
                closed = self._stack.pop()
                if closed == tag:
                    break
        if self._open is not None and tag == self._open["tag"] and len(self._stack) == self._open["depth"]:
            self._open["body_offset"] = self._tag_end(self._offset())
            self._open = None

    def handle_data(self, data):
        if self._open is not None:
            self._open["heading_parts"].append(data)


def _outline_html(content: str) -> list[dict[str, Any]]:
    reader = _HeadingReader(content)
    try:
        reader.feed(content)
        reader.close()
    except Exception:
        # Markup html.parser cannot get through is markup we must not cut up.
        return []

    sections = []
    for raw in reader.sections:
        if "body_offset" not in raw:
            # A heading that is never closed has no body we can delimit.
            continue
        sections.append({
            "level": raw["level"],
            "heading": re.sub(r"\s+", " ", "".join(raw["heading_parts"])).strip(),
            "offset": raw["offset"],
            "body_offset": raw["body_offset"],
            "addressable": raw["addressable"],
        })
    return sections


def _replace_html(content: str, section: dict[str, Any], body: str, mode: str) -> str:
    block = wrap_html_chunk(body)
    if mode == "append":
        return content[: section["end"]] + block + content[section["end"]:]
    return content[: section["body_offset"]] + block + content[section["end"]:]


def _create_html(content: str, heading: str, body: str, level: int) -> str:
    title = html.escape(heading.strip(), quote=False)
    block = f"<h{level}>{title}</h{level}>" + wrap_html_chunk(body)
    return content + block


# =============================================================================
# Shared
# =============================================================================

def outline(content: str, note_type: str) -> list[dict[str, Any]]:
    """Every heading of the note, each with where its section ends.

    A section runs from its heading to the next heading of the same level or
    higher, so a subsection stays inside its parent instead of cutting it
    short. In HTML only top-level headings close one another, since a heading
    inside a box belongs to that box.
    """
    kind = (note_type or "note").strip().lower()
    sections = _outline_markdown(content) if kind == "markdown" else _outline_html(content)

    total = len(content)
    for index, section in enumerate(sections):
        end = total
        for other in sections[index + 1:]:
            if not other.get("addressable", True) and section.get("addressable", True):
                continue
            if other["level"] <= section["level"]:
                end = other["offset"]
                break
        section["end"] = end
        section["length"] = end - section["offset"]
    return sections


def locate_section(
    sections: list[dict[str, Any]],
    heading: str,
    occurrence: Optional[int] = None,
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    """The one section that heading names, or an error payload saying why not.

    Several headings of the same name are never resolved by taking the first:
    in a note of a thousand lines, "Notes" can appear six times, and the
    caller is the only one who knows which one it meant.
    """
    wanted = normalize_heading(heading)
    if not wanted:
        return None, {
            "success": False,
            "error": "heading_required",
            "message": "heading must be the text of a heading in the note.",
        }

    matches = [s for s in sections if normalize_heading(s["heading"]) == wanted]

    if not matches:
        return None, {
            "success": False,
            "error": "heading_not_found",
            "message": (
                f"No heading reads {heading!r} in this note. Headings are matched on "
                "their text, ignoring case and extra spaces."
            ),
            "headings": [
                {"level": s["level"], "heading": s["heading"], "offset": s["offset"]}
                for s in sections[:_MAX_LISTED]
            ],
            "headings_total": len(sections),
        }

    if len(matches) > 1 and occurrence is None:
        return None, {
            "success": False,
            "error": "heading_ambiguous",
            "message": (
                f"{len(matches)} headings read {heading!r} in this note. Pass occurrence "
                "(1 for the first) to say which one, or edit it with replace_in_note."
            ),
            "candidates": [
                {
                    "occurrence": i + 1,
                    "level": s["level"],
                    "offset": s["offset"],
                    "length": s["length"],
                    "addressable": s["addressable"],
                }
                for i, s in enumerate(matches)
            ],
        }

    index = 0 if occurrence is None else int(occurrence) - 1
    if index < 0 or index >= len(matches):
        return None, {
            "success": False,
            "error": "occurrence_out_of_range",
            "message": f"occurrence must be between 1 and {len(matches)} for this heading.",
        }

    section = matches[index]
    if not section.get("addressable", True):
        return None, {
            "success": False,
            "error": "heading_not_addressable",
            "message": (
                f"The heading {heading!r} sits inside another element of this HTML note, "
                "so its section has no boundary that can be replaced without breaking "
                "the markup around it. Use replace_in_note on its text instead."
            ),
            "offset": section["offset"],
        }

    return section, None


def replace_section(
    content: str,
    note_type: str,
    heading: str,
    body: str,
    mode: str = "replace",
    occurrence: Optional[int] = None,
    create_if_missing: bool = False,
    level: int = 2,
) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    """The note's new content with one section replaced or added to.

    The heading line itself always survives a replace: an agent that picks the
    wrong mode loses the text under a heading, never the heading, and the
    section it was aiming at is still there to correct.
    """
    if mode not in {"replace", "append"}:
        return None, {
            "success": False,
            "error": "bad_mode",
            "message": "mode must be 'replace' or 'append'.",
        }

    kind = (note_type or "note").strip().lower()
    sections = outline(content, kind)
    section, failure = locate_section(sections, heading, occurrence)

    if failure is not None:
        if failure["error"] == "heading_not_found" and create_if_missing:
            wanted_level = max(1, min(6, int(level or 2)))
            if kind == "markdown":
                return _create_markdown(content, heading, body, wanted_level), None
            return _create_html(content, heading, body, wanted_level), None
        return None, failure

    assert section is not None
    if kind == "markdown":
        return _replace_markdown(content, section, body, mode), None
    return _replace_html(content, section, body, mode), None

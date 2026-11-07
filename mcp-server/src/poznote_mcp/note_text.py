"""Pure text work behind the partial note edits of issue #1736.

Nothing here does I/O or imports the rest of the package: the tools in
server.py do the HTTP around these functions, and the tests call them
directly.

Offsets count characters, not bytes. The PHP side of the same idea
(src/lib/ai-note-edit.php, issue #1710) counts bytes, because there the limit
exists to bound what is sent to a model and a character of Korean weighs more
than one of English. Here a Python str is addressed by character, so counting
bytes would only invite an off-by-a-few on every note that is not ASCII.
"""

from __future__ import annotations

import re
from typing import Any, Optional

# A note whose body is text an agent can append to or patch. A tasklist holds a
# JSON array of task objects (add_task and friends own it) and an excalidraw
# note a drawing, so both are refused rather than silently corrupted.
EDITABLE_TYPES = frozenset({"note", "markdown"})

# Most replacements one replace_in_note call may carry, as in the PHP.
REPLACEMENTS_MAX = 200

# Block-level HTML an appended chunk may already open with. Anything else is
# wrapped, or it lands inside the last element of the note instead of after it.
_HTML_BLOCK_START = re.compile(
    r"<\s*(?:p|div|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|code"
    r"|figure|figcaption|section|article|details|summary|hr|br|img|iframe|canvas"
    r"|video|audio|form|fieldset|dl|dt|dd|address|main|aside|nav|header|footer)\b",
    re.IGNORECASE,
)


def refuse_type(note_type: Optional[str], operation: str) -> Optional[str]:
    """Why this operation cannot touch a note of this type, or None.

    The message names what to use instead: an agent that only reads "refused"
    retries the same call, and an unattended one retries it forever.
    """
    kind = (note_type or "note").strip().lower() or "note"
    if kind in EDITABLE_TYPES:
        return None
    if kind == "tasklist":
        return (
            f"Note is a task list, whose content is a JSON array of tasks: {operation} "
            "would corrupt it. Use add_task, update_task, complete_task or delete_task."
        )
    if kind == "excalidraw":
        return (
            f"Note is a drawing, whose content is an Excalidraw scene: {operation} "
            "would corrupt it. Drawings are edited in the Poznote UI."
        )
    return (
        f"Note type {kind!r} does not hold text that {operation} can address. "
        "Use update_note if you really mean to replace its whole content."
    )


def page_content(
    content: str,
    offset: int = 0,
    max_chars: Optional[int] = None,
) -> dict[str, Any]:
    """One part of a note's content, at most max_chars characters from offset.

    Without max_chars the whole of the rest is returned, so a caller that
    passes neither argument gets exactly what it got before this existed.

    A part that would stop mid-line is cut back to the last line end when that
    end lies in its final quarter, so a table row or a sentence is not split
    for nothing. next_offset is None on the last part.
    """
    total = len(content)
    start = max(0, min(int(offset or 0), total))

    if max_chars is None:
        return {
            "content": content[start:],
            "offset": start,
            "next_offset": None,
            "length": total,
        }

    limit = max(1, int(max_chars))
    if total - start <= limit:
        return {
            "content": content[start:],
            "offset": start,
            "next_offset": None,
            "length": total,
        }

    end = start + limit
    part = content[start:end]
    last_newline = part.rfind("\n")
    if last_newline != -1 and (last_newline + 1) * 4 >= len(part) * 3:
        part = part[: last_newline + 1]
        end = start + last_newline + 1

    return {
        "content": part,
        "offset": start,
        "next_offset": end if end < total else None,
        "length": total,
    }


def wrap_html_chunk(addition: str) -> str:
    """Appended text as something that lands after the note's last element.

    A chunk that already opens with block-level HTML goes in untouched. A bare
    string becomes a paragraph, with its blank lines kept as paragraph breaks,
    because concatenated as-is it would be swallowed by whatever element the
    note ends with (a list item, a heading, a table cell).
    """
    chunk = addition.strip()
    if not chunk:
        return ""
    if _HTML_BLOCK_START.match(chunk):
        return chunk
    paragraphs = re.split(r"\n[ \t]*\n+", chunk)
    return "".join(
        "<p>" + para.strip().replace("\n", "<br>") + "</p>"
        for para in paragraphs
        if para.strip()
    )


def merge_append(content: str, addition: str, note_type: str) -> str:
    """The note's new content, with addition after what is already there.

    Markdown follows the rule the Chrome extension already uses when it
    appends a page to a note (poznote-chrome-extension/background.js): the
    trailing whitespace goes, a blank line separates the two, and the file
    ends with one newline. Without that blank line the addition is read as a
    continuation of the last paragraph, or worse of the last list item.

    HTML is concatenated, the addition wrapped when it is not already a block.
    """
    kind = (note_type or "note").strip().lower()
    if kind == "markdown":
        block = addition.strip("\n")
        if not block.strip():
            return content
        base = content.rstrip()
        return (base + "\n\n" if base else "") + block + "\n"

    block = wrap_html_chunk(addition)
    if not block:
        return content
    return content + block


def apply_replacements(content: str, replacements: Any) -> dict[str, Any]:
    """Apply a list of exact-text replacements in order, all or nothing.

    Ported from aiApplyNoteReplacements() in src/lib/ai-note-edit.php, same
    rules: a text that is not there, or that is there several times without
    "all", is an error rather than a guess. In a note of a million characters a
    three-word find can match in fifty places, and an agent that meant one of
    them would never know.

    Returns {"content": str, "replaced": int} or {"error": str}.
    """
    if not isinstance(replacements, list) or not replacements:
        return {"error": "replacements must be a non-empty list of {find, replace}."}
    if len(replacements) > REPLACEMENTS_MAX:
        return {
            "error": (
                f"Too many replacements in one call ({REPLACEMENTS_MAX} max): nothing "
                "was changed. Send them in several calls."
            )
        }

    replaced = 0
    for index, item in enumerate(replacements):
        where = f"Replacement {index + 1}: "
        find = item.get("find") if isinstance(item, dict) else None
        replace = item.get("replace") if isinstance(item, dict) else None
        if not isinstance(find, str) or find == "" or not isinstance(replace, str):
            return {
                "error": where + "find must be a non-empty text and replace a text. "
                "Nothing was changed."
            }
        count = content.count(find)
        if count == 0:
            return {
                "error": where + "find was not found, it must match the text of "
                "get_note exactly. Nothing was changed."
            }
        if count > 1 and not _truthy(item.get("all")):
            return {
                "error": where + f"find matches {count} places. Include more of the "
                "surrounding text to match one, or set all to true. Nothing was changed."
            }
        content = content.replace(find, replace)
        replaced += count

    return {"content": content, "replaced": replaced}


def _truthy(value: Any) -> bool:
    """A client that cannot send a real boolean sends "true" or 1 instead."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False

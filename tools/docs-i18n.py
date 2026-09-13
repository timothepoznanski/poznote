#!/usr/bin/env python3
"""Keep the translated README and docs pages in step with the English ones.

Usage:
    python3 tools/docs-i18n.py check        # report problems, exit 1 if any
    python3 tools/docs-i18n.py fix          # selectors, links and anchors

Every page in PAGES has one translation per language in LANGUAGES, stored
next to it as <name>.<lang>.md (README.fr.md, docs/MCP-SERVER.fr.md), so the
relative image paths are the same in both.

Translators keep every link target and #anchor exactly as in English. `fix`
then does three things on every page:

  1. writes the language selector between the lang-selector markers at the
     top of the page, English included;
  2. points relative links to a translated page at the same language
     (docs/MCP-SERVER.md -> docs/MCP-SERVER.fr.md); API-REST.md and the other
     untranslated pages keep their English link;
  3. rewrites #anchors that come from a heading. A translated heading gets a
     different GitHub slug, so the anchor is resolved to the Nth heading of
     the English target page and replaced by the slug of the Nth heading of
     the translated one. Explicit <a id="..."> anchors are left alone.

Step 3 needs the same headings, in the same order, on both sides, and `check`
verifies that along with images, code blocks and external links. After
editing an English page, update its translations the same way, then run
`fix` and `check`.
"""

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PAGES = [
    "README.md",
    "docs/AI-ASSISTANT.md",
    "docs/CHROME-EXTENSION.md",
    "docs/CLAUDE-CLI.md",
    "docs/MCP-SERVER.md",
    "docs/TRANSCRIPTION.md",
    "docs/TROUBLESHOOTING.md",
    "docs/VSCODE-COPILOT.md",
    "docs/WEBHOOKS.md",
]

# Same order and names as the language picker in src/public/welcome.php.
LANGUAGES = {
    "en": "English",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "pt": "Português",
    "ru": "Русский",
    "zh-cn": "简体中文",
}

SELECTOR_START = "<!-- lang-selector -->"
SELECTOR_END = "<!-- /lang-selector -->"

FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$")
EXPLICIT_ANCHOR_RE = re.compile(r"<a\s+(?:id|name)=\"([^\"]+)\"")
MD_LINK_RE = re.compile(r"(!?)\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
HTML_ATTR_RE = re.compile(r"\b(href|src)=\"([^\"]+)\"")
INLINE_CODE_RE = re.compile(r"(`+)(.+?)\1")
EM_DASH_RE = re.compile(r"\s—\s|—")


def translated_path(page, lang):
    if lang == "en":
        return page
    stem = page[:-3]
    return f"{stem}.{lang}.md"


def english_path(path):
    """docs/MCP-SERVER.fr.md -> (docs/MCP-SERVER.md, "fr")."""
    for lang in LANGUAGES:
        if lang != "en" and path.endswith(f".{lang}.md"):
            return path[: -len(f".{lang}.md")] + ".md", lang
    return path, "en"


def slugify(text):
    """github-slugger: lower-case, drop everything that is not a letter, mark,
    number, connector punctuation, hyphen or plain space, spaces to hyphens."""
    out = []
    for ch in text.lower():
        if ch == " " or ch == "-":
            out.append(ch)
        elif unicodedata.category(ch)[0] in "LMN" or unicodedata.category(ch) == "Pc":
            out.append(ch)
    return "".join(out).replace(" ", "-")


def heading_text(raw):
    """The text GitHub slugs: the rendered heading, without markup."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", raw)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = INLINE_CODE_RE.sub(lambda m: m.group(2), text)
    text = re.sub(r"(\*\*|__)(.+?)\1", r"\2", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"\1", text)
    return text.strip()


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.path = ROOT / rel
        self.text = self.path.read_text(encoding="utf-8")
        self.lines = self.text.split("\n")
        self.headings = []        # (level, slug) in document order
        self.explicit = set()     # <a id="..."> anchors
        self.code_blocks = []     # (info string, lines)
        self.prose = []           # (line index, line) outside fenced code
        self._parse()

    def _parse(self):
        seen = {}
        fence = None
        tag = ""
        block = []
        in_selector = False
        for i, line in enumerate(self.lines):
            if SELECTOR_START in line:
                in_selector = True
            if in_selector:
                in_selector = SELECTOR_END not in line
                continue
            m = FENCE_RE.match(line)
            if fence:
                if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence) and line.strip() == m.group(1):
                    self.code_blocks.append((tag, block))
                    fence, block = None, []
                else:
                    block.append(line)
                continue
            if m:
                fence = m.group(1)
                tag = line.strip()[len(fence):].strip()
                continue
            self.prose.append((i, line))
            h = HEADING_RE.match(line)
            if h:
                base = slugify(heading_text(h.group(2)))
                n = seen.get(base, 0)
                seen[base] = n + 1
                self.headings.append((len(h.group(1)), base if n == 0 else f"{base}-{n}"))
            for a in EXPLICIT_ANCHOR_RE.findall(line):
                self.explicit.add(a)

    def anchors(self):
        return {s for _, s in self.headings} | self.explicit

    def links(self):
        """(line index, kind, target) for every link and image outside code."""
        found = []
        for i, line in self.prose:
            stripped = INLINE_CODE_RE.sub("", line)
            for m in MD_LINK_RE.finditer(stripped):
                found.append((i, "image" if m.group(1) else "link", m.group(3)))
            for m in HTML_ATTR_RE.finditer(stripped):
                found.append((i, "image" if m.group(1) == "src" else "link", m.group(2)))
        return found


def is_external(target):
    return bool(re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I))


def resolve(doc_rel, target):
    """Relative link target -> (repo-relative path, anchor or None)."""
    path, _, anchor = target.partition("#")
    if not path:
        return doc_rel, anchor or None
    base = Path(doc_rel).parent
    joined = (base / path).as_posix()
    parts = []
    for p in joined.split("/"):
        if p == "..":
            if parts:
                parts.pop()
        elif p and p != ".":
            parts.append(p)
    return "/".join(parts), anchor or None


def relative(from_rel, to_rel):
    from_parts = Path(from_rel).parent.parts
    to_parts = Path(to_rel).parts
    common = 0
    while common < len(from_parts) and common < len(to_parts) - 1 and from_parts[common] == to_parts[common]:
        common += 1
    return "/".join([".."] * (len(from_parts) - common) + list(to_parts[common:]))


def selector_block(page, lang):
    """A centred line of language names, the current one in bold."""
    items = []
    for code, name in LANGUAGES.items():
        if code == lang:
            items.append(f"<b>{name}</b>")
        else:
            target = relative(translated_path(page, lang), translated_path(page, code))
            items.append(f"<a href=\"{target}\">{name}</a>")
    return "\n".join([
        SELECTOR_START,
        "<p align=\"center\">",
        "  " + " ·\n  ".join(items),
        "</p>",
        SELECTOR_END,
    ])


def all_files():
    for page in PAGES:
        for lang in LANGUAGES:
            yield page, lang, translated_path(page, lang)


_docs = {}


def load(rel):
    if rel not in _docs:
        _docs[rel] = Doc(rel) if (ROOT / rel).is_file() else None
    return _docs[rel]


# ---------------------------------------------------------------------------
# fix
# ---------------------------------------------------------------------------

def fix_selector(text, page, lang):
    block = selector_block(page, lang)
    pattern = re.compile(re.escape(SELECTOR_START) + r".*?" + re.escape(SELECTOR_END), re.S)
    if pattern.search(text):
        return pattern.sub(lambda _: block, text, count=1)
    return block + "\n\n" + text


def fix_link_target(doc_rel, lang, target):
    if is_external(target) or target.startswith("#") and lang == "en":
        return target
    path, anchor = resolve(doc_rel, target)
    if not path.endswith(".md"):
        return target
    en_target, _ = english_path(path)
    new_path = path
    if lang != "en" and en_target in PAGES and (ROOT / translated_path(en_target, lang)).is_file():
        new_path = translated_path(en_target, lang)
    if anchor:
        anchor = map_anchor(en_target, new_path, anchor)
    if path == doc_rel and not target.split("#")[0]:
        rebuilt = ""
    else:
        rebuilt = relative(doc_rel, new_path)
    return rebuilt + (f"#{anchor}" if anchor else "")


def map_anchor(en_rel, target_rel, anchor):
    """English heading slug -> slug of the same heading in target_rel."""
    en = load(en_rel)
    target = load(target_rel)
    if en is None or target is None or target_rel == en_rel:
        return anchor
    if anchor in target.explicit:
        return anchor
    en_slugs = [s for _, s in en.headings]
    if anchor not in en_slugs or len(en.headings) != len(target.headings):
        return anchor
    return target.headings[en_slugs.index(anchor)][1]


def fix():
    changed = 0
    for page, lang, rel in all_files():
        doc = load(rel)
        if doc is None:
            continue
        text = doc.text
        if lang != "en":
            text = rewrite_links(rel, lang, text)
        text = fix_selector(text, page, lang)
        if text != doc.text:
            doc.path.write_text(text, encoding="utf-8")
            changed += 1
            print(f"updated {rel}")
    print(f"{changed} file(s) updated")


def rewrite_links(rel, lang, text):
    out = []
    fence = None
    for line in text.split("\n"):
        m = FENCE_RE.match(line)
        if fence:
            if m and m.group(1)[0] == fence[0] and line.strip() == m.group(1):
                fence = None
            out.append(line)
            continue
        if m:
            fence = m.group(1)
            out.append(line)
            continue
        out.append(rewrite_line_links(rel, lang, line))
    return "\n".join(out)


def rewrite_line_links(rel, lang, line):
    # Leave inline code untouched: split around it.
    pieces = re.split(r"(`+[^`]*`+)", line)
    for k, piece in enumerate(pieces):
        if piece.startswith("`"):
            continue
        piece = MD_LINK_RE.sub(
            lambda m: m.group(0) if m.group(1) else
            f"[{m.group(2)}]({fix_link_target(rel, lang, m.group(3))})",
            piece,
        )
        piece = re.sub(
            r"\bhref=\"([^\"]+)\"",
            lambda m: f"href=\"{fix_link_target(rel, lang, m.group(1))}\"",
            piece,
        )
        pieces[k] = piece
    return "".join(pieces)


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

def normalize_code(tag, block):
    """What must stay identical in a translated code block.

    Translators may translate full-line comments and the natural-language
    prompts given to an assistant (claude "...", @poznote ...). An untagged
    block holds sample prompts, output or a diagram, so only its line count
    is compared."""
    if tag == "":
        return len([l for l in block if l.strip()])
    out = []
    for l in block:
        if re.match(r"^\s*(#(?!!)|//)", l):
            continue
        l = re.sub(r"^(\s*claude\s+)\".*\"\s*$", r"\1\"…\"", l)
        l = re.sub(r"^(\s*@poznote[\w-]*\s).*$", r"\1…", l)
        out.append(l)
    return out


def check():
    problems = []

    def report(rel, msg):
        problems.append(f"{rel}: {msg}")

    for page, lang, rel in all_files():
        doc = load(rel)
        if doc is None:
            report(rel, "missing")
            continue

        if selector_block(page, lang) not in doc.text:
            report(rel, "language selector missing or stale, run fix")

        for i, kind, target in doc.links():
            if is_external(target) or kind == "image" and target.startswith("data:"):
                continue
            path, anchor = resolve(rel, target)
            if not (ROOT / path).exists():
                report(rel, f"line {i + 1}: broken {kind} {target}")
                continue
            if lang != "en" and path.endswith(".md"):
                en_target, target_lang = english_path(path)
                if en_target in PAGES and target_lang != lang:
                    report(rel, f"line {i + 1}: links to the {target_lang} version {target}")
            if anchor and path.endswith(".md"):
                target_doc = load(path)
                if target_doc and anchor not in target_doc.anchors():
                    report(rel, f"line {i + 1}: anchor #{anchor} not found in {path}")

        if lang == "en":
            continue
        en = load(page)

        en_levels = [lvl for lvl, _ in en.headings]
        tr_levels = [lvl for lvl, _ in doc.headings]
        if en_levels != tr_levels:
            report(rel, f"headings differ from English ({len(tr_levels)} vs {len(en_levels)}), "
                        f"first mismatch at heading {first_mismatch(en_levels, tr_levels) + 1}")

        if doc.explicit != en.explicit:
            report(rel, f"explicit anchors differ: missing {sorted(en.explicit - doc.explicit)}, "
                        f"extra {sorted(doc.explicit - en.explicit)}")

        en_images = [t for _, k, t in en.links() if k == "image"]
        tr_images = [t for _, k, t in doc.links() if k == "image"]
        if en_images != tr_images:
            report(rel, "images differ from English")

        if len(en.code_blocks) != len(doc.code_blocks):
            report(rel, f"{len(doc.code_blocks)} code blocks, English has {len(en.code_blocks)}")
        else:
            for n, ((tag, a), (tr_tag, b)) in enumerate(zip(en.code_blocks, doc.code_blocks)):
                if tag != tr_tag or normalize_code(tag, a) != normalize_code(tag, b):
                    report(rel, f"code block {n + 1} ({tag or 'untagged'}) differs from English "
                                f"beyond comments and prompts")

        en_urls = sorted(t for _, k, t in en.links() if k == "link" and is_external(t))
        tr_urls = sorted(t for _, k, t in doc.links() if k == "link" and is_external(t))
        if en_urls != tr_urls:
            missing = sorted(set(en_urls) - set(tr_urls))
            extra = sorted(set(tr_urls) - set(en_urls))
            report(rel, f"external links differ: missing {missing}, extra {extra}")

        for i, line in doc.prose:
            if EM_DASH_RE.search(INLINE_CODE_RE.sub("", line)):
                report(rel, f"line {i + 1}: em dash in prose")

    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


def first_mismatch(a, b):
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return min(len(a), len(b))


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("check", "fix"):
        print(__doc__)
        return 2
    if sys.argv[1] == "fix":
        fix()
        return 0
    return check()


if __name__ == "__main__":
    sys.exit(main())

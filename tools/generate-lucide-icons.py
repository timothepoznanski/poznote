#!/usr/bin/env python3
"""Generate CSS mask blocks for src/css/lucide.css from lucide-static SVGs.

Usage:
    python3 tools/generate-lucide-icons.py cat dog fish > blocks.css
    python3 tools/generate-lucide-icons.py --from-file names.txt >> src/css/lucide.css

Each name is fetched from unpkg (lucide-static, pinned to the same version as
the existing bundle) and emitted as a .lucide-<name> block in the same format
as the rest of the file. After appending blocks, add the names to FOLDER_ICONS
in src/js/folder-icon.js and (optionally) icon_names.* in src/i18n/*.json.
"""

import argparse
import re
import sys
import urllib.parse
import urllib.request

LUCIDE_VERSION = "0.575.0"
URL = "https://unpkg.com/lucide-static@{version}/icons/{name}.svg"

BLOCK = """.lucide-{name} {{
  -webkit-mask-image: url("data:image/svg+xml,{data}");
  mask-image: url("data:image/svg+xml,{data}");
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  background-color: currentColor;
  background-image: none;
}}
"""


def encode_svg(svg: str) -> str:
    svg = svg.replace('"', "'")
    svg = re.sub(r"\s+", " ", svg).strip()
    return urllib.parse.quote(svg, safe="")


def fetch(name: str, version: str) -> str:
    with urllib.request.urlopen(URL.format(version=version, name=name), timeout=30) as r:
        return r.read().decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="lucide icon names (without the lucide- prefix)")
    parser.add_argument("--from-file", help="file with one icon name per line")
    parser.add_argument("--version", default=LUCIDE_VERSION)
    args = parser.parse_args()

    names = list(args.names)
    if args.from_file:
        with open(args.from_file) as f:
            names += [line.strip() for line in f if line.strip()]
    if not names:
        parser.error("no icon names given")

    failed = []
    for name in names:
        try:
            svg = fetch(name, args.version)
        except Exception as e:
            print(f"FAILED {name}: {e}", file=sys.stderr)
            failed.append(name)
            continue
        print(BLOCK.format(name=name, data=encode_svg(svg)))

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

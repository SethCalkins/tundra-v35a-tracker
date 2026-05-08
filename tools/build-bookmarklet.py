#!/usr/bin/env python3
"""Compile tools/carvana-scrape.js into a bookmarklet URL.

Usage:
    python3 tools/build-bookmarklet.py

Prints the `javascript:...` URL to stdout AND writes it to
tools/carvana-scrape.bookmarklet.txt for easy copy-paste.

Drag the URL into your Bookmarks Bar (or right-click bookmarks bar →
Add Page → paste the URL) to install. To run: visit a Carvana search
results page, click the bookmark.
"""
from __future__ import annotations

import re
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
SOURCE = HERE / "carvana-scrape.js"
OUTPUT = HERE / "carvana-scrape.bookmarklet.txt"


def minify(js: str) -> str:
    # Strip line comments (// ...) but leave URLs intact (// after :)
    js = re.sub(r"(^|[^:])//[^\n]*", r"\1", js)
    # Strip block comments
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    # Collapse whitespace runs to a single space, except inside strings
    parts: list[str] = []
    in_str: str | None = None
    i = 0
    while i < len(js):
        c = js[i]
        if in_str:
            parts.append(c)
            if c == "\\":
                if i + 1 < len(js):
                    parts.append(js[i + 1])
                    i += 2
                    continue
            elif c == in_str:
                in_str = None
            i += 1
        else:
            if c in ("'", '"', "`"):
                in_str = c
                parts.append(c)
                i += 1
            elif c.isspace():
                # collapse runs of whitespace
                while i < len(js) and js[i].isspace():
                    i += 1
                parts.append(" ")
            else:
                parts.append(c)
                i += 1
    return "".join(parts).strip()


def main() -> int:
    if not SOURCE.exists():
        print(f"missing source: {SOURCE}", file=sys.stderr)
        return 1
    js = SOURCE.read_text()
    minified = minify(js)
    encoded = urllib.parse.quote(minified, safe="")
    bookmarklet = f"javascript:{encoded}"
    OUTPUT.write_text(bookmarklet + "\n")
    print(f"Written: {OUTPUT}")
    print(f"Length: {len(bookmarklet)} chars (browsers cap ~64k)")
    print()
    print("To install:")
    print("  1. Open Chrome bookmarks (⌘⌥B)")
    print("  2. Right-click bookmarks bar → Add Page")
    print(f"  3. Name: 'Scrape Carvana'  URL: paste contents of {OUTPUT}")
    print()
    print("To run: visit any Carvana search results page, click 'Scrape Carvana'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Create the GitHub Pages version from the static Canopée source."""

import base64
import os
import re
from pathlib import Path
from shutil import copytree


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "site"
PAGES = ROOT / "_site"
BASE = "/" + os.environ.get("PAGES_REPOSITORY", "canopee-svt").strip("/")
FAVICON = "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"
ICON_LINK = f'<link rel="icon" type="image/png" sizes="64x64" href="{BASE}/favicon.png">'

root_entries = sorted((re.escape(entry.name) for entry in SOURCE.iterdir()))
root_path = re.compile(
    r"""(?P<start>["'`(=]|&quot;)/(?=(?:"""
    + "|".join(root_entries)
    + r""")(?:[/#?"'`&)\s]|$))"""
)
home_path = re.compile(r"""(?P<start>(?:href\s*=\s*|\.href\s*=\s*)["'])/(?=[#?"'])""")


def add_base(text):
    text = root_path.sub(lambda match: match["start"] + BASE + "/", text)
    return home_path.sub(lambda match: match["start"] + BASE + "/", text)


def build():
    copytree(SOURCE, PAGES)
    (PAGES / "favicon.png").write_bytes(base64.b64decode(FAVICON))
    for file in PAGES.rglob("*"):
        if not file.is_file() or file.relative_to(PAGES).parts[0] == "vendor":
            continue
        if file.suffix not in {".html", ".js", ".css", ".json"}:
            continue
        content = file.read_text(encoding="utf-8")
        updated = add_base(content)
        if file.suffix == ".html" and re.search(r"<head\b[^>]*>", updated, re.IGNORECASE):
            updated = re.sub(r"<head\b[^>]*>", lambda match: match[0] + ICON_LINK, updated, count=1, flags=re.IGNORECASE)
        if updated != content:
            file.write_text(updated, encoding="utf-8")
    (PAGES / ".nojekyll").touch()


if __name__ == "__main__":
    build()

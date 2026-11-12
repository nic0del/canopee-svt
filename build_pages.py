"""Create the GitHub Pages version from the static Canopée source."""

import os
import re
from pathlib import Path
from shutil import copytree
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "site"
PAGES = ROOT / "_site"
BASE = "/" + os.environ.get("PAGES_REPOSITORY", "canopee-svt").strip("/")

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
    for file in PAGES.rglob("*"):
        if not file.is_file() or file.relative_to(PAGES).parts[0] == "vendor":
            continue
        if file.suffix not in {".html", ".js", ".css", ".json"}:
            continue
        content = file.read_text(encoding="utf-8")
        updated = add_base(content)
        if updated != content:
            file.write_text(updated, encoding="utf-8")
    (PAGES / ".nojekyll").touch()


if __name__ == "__main__":
    build()

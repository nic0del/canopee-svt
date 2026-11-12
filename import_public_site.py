"""Restore the initial site snapshot from its public assets and local overlay."""

import hashlib
import json
import tarfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ORIGIN = "https://canopee-svt.loftybow5.chatgpt.site/"
SITE = Path("site")


def restore(entry):
    path, expected = entry
    target = SITE / path
    for attempt in range(3):
        try:
            with urlopen(ORIGIN + quote(path), timeout=30) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != expected:
                return path, "unexpected content"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            return None
        except OSError as error:
            if attempt == 2:
                return path, str(error)
            time.sleep(attempt + 1)


if __name__ == "__main__":
    with tarfile.open("canopee-overlay.tar.gz") as overlay:
        overlay.extractall(filter="data")
    entries = json.loads(Path("canopee-assets.json").read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=12) as pool:
        errors = [result for result in pool.map(restore, entries) if result]
    if errors:
        for path, reason in errors:
            print(f"{path}: {reason}")
        raise SystemExit(f"{len(errors)} assets did not match the Canopée snapshot")
    print(f"Verified {len(entries)} public assets against the local snapshot")

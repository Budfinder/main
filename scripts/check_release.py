#!/usr/bin/env python3
"""Verify generated pages, public data and assets against one release.

Run locally before uploading, or use --url https://budfinder.org after upload.
The live check compares the manifest, homepage data, city and strain directories,
an Amsterdam page and an Amnesia Haze page to the prepared local release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
RELEASE = "database/release.json"


def ssl_context() -> ssl.SSLContext:
    """Verified HTTPS, including with the python.org macOS Python, which ships
    without certificate authorities. Certificates are always checked."""
    try:
        import certifi  # type: ignore
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    context = ssl.create_default_context()
    if not context.cert_store_stats().get("x509_ca"):
        for bundle in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt"):
            if Path(bundle).is_file():
                context.load_verify_locations(bundle)
                break
    return context


def verify(root: Path, url: str = "") -> list[str]:
    release = json.loads((root / RELEASE).read_text(encoding="utf-8"))
    errors = []
    if url:
        def read(path):
            request = Request(f"{url.rstrip('/')}/{path}?release_check={release['release_id']}",
                              headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"})
            with urlopen(request, timeout=15, context=ssl_context()) as response:
                return response.read()

        remote = json.loads(read(RELEASE))
        if remote != release:
            errors.append("The live release manifest differs from the prepared local release.")
        sample = ["index.html", "database/manifest.json", "database/home_summary.json",
                  "coffeeshops/index.html", "strains/index.html",
                  "coffeeshops/amsterdam/index.html", "strains/amnesia-haze/index.html"]
        paths = [path for path in sample if path in release["files"]]
    else:
        def read(path):
            return (root / path).read_bytes()
        paths = release["files"]
    for path in paths:
        try:
            if hashlib.sha256(read(path)).hexdigest() != release["files"][path]:
                errors.append(f"{path} differs from release {release['release_id']}.")
        except (OSError, URLError) as error:
            errors.append(f"{path} could not be checked ({error}).")
    summary = json.loads(read("database/home_summary.json"))
    manifest = json.loads(read("database/manifest.json"))
    for name, data in (("home summary", summary), ("manifest", manifest)):
        if data.get("exported_at_utc") != release["exported_at_utc"]:
            errors.append(f"The {name} belongs to a different data snapshot.")
    for key, expected in (("shops", summary["network"]["active_shops"]),
                          ("listings", summary["network"]["active_listings"])):
        if release["counts"][key] != expected:
            errors.append(f"The generated {key} count differs from the homepage.")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="", help="Live origin to verify after publishing")
    args = parser.parse_args()
    try:
        errors = verify(ROOT, args.url)
    except (OSError, ValueError, KeyError, URLError) as error:
        errors = [str(error)]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Release files and data counts agree.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

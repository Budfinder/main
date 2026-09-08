#!/usr/bin/env python3
"""Run the static website checks with Python and Node.js; no packages required."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PAGES = ("index.html", "map.html", "database.html")


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.assets = []
        self.scripts = []
        self.current_script = None

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if attrs.get("src"):
            self.assets.append(attrs["src"])
        if tag in {"link", "a"} and attrs.get("href"):
            self.assets.append(attrs["href"])
        if tag == "script" and not attrs.get("src"):
            self.current_script = [attrs.get("type", "text/javascript"), []]

    def handle_data(self, data):
        if self.current_script is not None:
            self.current_script[1].append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.current_script is not None:
            kind, chunks = self.current_script
            self.scripts.append((kind, "".join(chunks)))
            self.current_script = None


def local_asset(reference: str, owner: Path) -> Path | None:
    parsed = urlsplit(reference.strip())
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    relative = unquote(parsed.path)
    return (ROOT / relative.lstrip("/") if relative.startswith("/") else owner.parent / relative).resolve()


def static_checks(node: str) -> list[str]:
    errors = []
    stylesheets = set()
    inline_scripts = []
    for name in PAGES:
        page = ROOT / name
        if not page.is_file():
            errors.append(f"Missing public page: {name}")
            continue
        parser = PageParser()
        parser.feed(page.read_text(encoding="utf-8"))
        duplicates = [identity for identity, count in Counter(parser.ids).items() if count > 1]
        if duplicates:
            errors.append(f"{name}: duplicate IDs: {', '.join(duplicates)}")
        for reference in parser.assets:
            asset = local_asset(reference, page)
            if asset is None:
                continue
            if not asset.exists():
                errors.append(f"{name}: missing local asset {reference}")
            elif asset.suffix == ".css":
                stylesheets.add(asset)
        for number, (kind, source) in enumerate(parser.scripts, 1):
            label = f"{name} inline script {number}"
            if kind in {"application/ld+json", "application/json"}:
                try:
                    json.loads(source)
                except json.JSONDecodeError as error:
                    errors.append(f"{label}: invalid JSON: {error}")
            elif kind in {"text/javascript", "application/javascript", "module", ""}:
                inline_scripts.append((label, source, ".mjs" if kind == "module" else ".js"))
        print(f"{name}: {len(parser.ids)} IDs and local asset references checked", flush=True)

    for sheet in sorted(stylesheets):
        # External CSS is now published separately, so resolve its URLs from the
        # stylesheet directory rather than from the HTML document.
        for match in re.finditer(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*))\s*\)", sheet.read_text(encoding="utf-8")):
            reference = next(value for value in match.groups() if value is not None).strip()
            asset = local_asset(reference, sheet)
            if asset is not None and not asset.exists():
                errors.append(f"{sheet.relative_to(ROOT)}: missing CSS asset {reference}")

    scripts = sorted(set((ROOT / "scripts").glob("*.js")) | set(ROOT.glob("*.js")))
    with tempfile.TemporaryDirectory(prefix="budfinder-script-check-") as directory:
        to_check = [(str(script.relative_to(ROOT)), script) for script in scripts]
        for index, (label, source, suffix) in enumerate(inline_scripts):
            path = Path(directory) / f"inline-{index}{suffix}"
            path.write_text(source, encoding="utf-8")
            to_check.append((label, path))
        for label, script in to_check:
            result = subprocess.run([node, "--check", str(script)], capture_output=True, text=True, timeout=30)
            if result.returncode:
                errors.append(f"{label}: {result.stderr.strip() or result.stdout.strip()}")
        print(f"JavaScript syntax: {len(to_check)} files/scripts checked", flush=True)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", default="node", help="Node.js 18+ executable name or path (default: node on PATH)")
    args = parser.parse_args()
    node = shutil.which(args.node)
    if not node:
        parser.error("Node.js was not found. Install Node.js 18+ or pass --node /path/to/node.")

    errors = static_checks(node)
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    node_tests = sorted(path for path in (ROOT / "tests").rglob("*") if path.suffix in {".cjs", ".mjs", ".js"})
    checks = []
    if node_tests:
        checks.append(("Node regression tests", [node, "--test", *(str(path) for path in node_tests)]))
    else:
        errors.append("No Node regression tests found")
    checks.extend([
        ("Python regression tests", [sys.executable, "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]),
        ("Static data QA", [sys.executable, "-B", "data_quality_report.py"]),
    ])
    for label, command in checks:
        print(f"\n{label}", flush=True)
        try:
            result = subprocess.run(command, cwd=ROOT, timeout=120)
            if result.returncode:
                errors.append(f"{label} failed (exit {result.returncode})")
        except subprocess.TimeoutExpired:
            errors.append(f"{label} did not finish within 120 seconds")
    if errors:
        print(f"\nWebsite checks failed: {len(errors)} issue(s).", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("\nAll website checks passed. Data freshness warnings are informational.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

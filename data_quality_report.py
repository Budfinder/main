#!/usr/bin/env python3
"""Budfinder static-data QA report.

Run before publishing static files:

    python3 data_quality_report.py
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DATABASE_DIR = ROOT / "database"
REQUIRED_JSON = [
    "shops.json",
    "shop_lookup.json",
    "strains.json",
    "active_offerings.json",
    "menu_entries.json",
    "strain_index.json",
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_location_csv(path: Path):
    with path.open("r", encoding="latin-1", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def count_json_items(value) -> int:
    if isinstance(value, list):
        return len(value)
    if isinstance(value, dict):
        return len(value)
    return 0


def parse_iso(value: str) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    manifest_path = DATABASE_DIR / "manifest.json"
    manifest = load_json(manifest_path) if manifest_path.exists() else {}
    manifest_counts = manifest.get("counts") if isinstance(manifest, dict) else {}

    print("Budfinder data QA")
    print("=================")

    for name in REQUIRED_JSON:
        path = DATABASE_DIR / name
        if not path.exists():
            errors.append(f"Missing {name}")
            continue
        data = load_json(path)
        actual = count_json_items(data)
        key = Path(name).stem
        expected = manifest_counts.get(key) if isinstance(manifest_counts, dict) else None
        suffix = f" (manifest {expected})" if isinstance(expected, int) else ""
        print(f"{name}: {actual:,}{suffix}")
        if isinstance(expected, int) and expected != actual:
            errors.append(f"{name} count is {actual:,}, manifest says {expected:,}")

    locations_index = DATABASE_DIR / "locations" / "index.json"
    if not locations_index.exists():
        errors.append("Missing database/locations/index.json")
        location_files = []
    else:
        locations_data = load_json(locations_index)
        location_files = locations_data.get("files", []) if isinstance(locations_data, dict) else []

    print("")
    print("Location CSVs")
    print("-------------")
    for filename in location_files:
        path = DATABASE_DIR / "locations" / filename
        if not path.exists():
            errors.append(f"database/locations/index.json references missing {filename}")
            continue

        headers, rows = read_location_csv(path)
        missing_keys = [
            row for row in rows
            if (row.get("Coffeeshop") or "").strip().lower() == "y"
            and (row.get("Closed") or "").strip().lower() != "y"
            and not (row.get("shop_key") or "").strip()
        ]
        duplicate_headers = [name for name, count in Counter(headers).items() if name and count > 1]
        blank_headers = headers.count("")
        print(f"{filename}: {len(rows):,} rows, {len(missing_keys):,} missing live shop keys")

        if missing_keys:
            errors.append(f"{filename} has {len(missing_keys)} live coffeeshop rows without shop_key")
        if duplicate_headers:
            warnings.append(f"{filename} has duplicate columns: {', '.join(duplicate_headers)}")
        if blank_headers:
            warnings.append(f"{filename} has {blank_headers} blank column header(s)")

    active_path = DATABASE_DIR / "active_offerings.json"
    if active_path.exists():
        active = load_json(active_path)
        dates = [
            dt for dt in (
                parse_iso(str(row.get("updated_at") or row.get("last_seen_at_utc") or ""))
                for row in active if isinstance(row, dict)
            )
            if dt is not None
        ]
        if dates:
            latest = max(dates)
            age_days = (datetime.now(timezone.utc) - latest).days
            print("")
            print(f"Newest active offering update: {latest.date().isoformat()} ({age_days} day(s) ago)")
            if age_days > 14:
                warnings.append("Newest active offering is more than two weeks old")

    if warnings:
        print("")
        print("Warnings")
        print("--------")
        for item in warnings:
            print(f"- {item}")

    if errors:
        print("")
        print("Errors")
        print("------")
        for item in errors:
            print(f"- {item}")
        return 1

    print("")
    print("No blocking data issues found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

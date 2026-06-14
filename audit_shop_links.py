#!/usr/bin/env python3
"""Audit drift between the menu catalog and map CSVs."""

from __future__ import annotations

import csv
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"
CATALOG_PATH = DATABASE_DIR / "csd.csv"
LOCATIONS_DIR = DATABASE_DIR / "locations"
LOCATION_FILES = ("amsterdamLoc.csv", "utrechtLoc.csv")


def parse_bool(raw: object, default: bool = False) -> bool:
    text = str(raw or "").strip().lower()
    if not text:
        return default
    return text in {"1", "true", "t", "yes", "y", "on"}


def url_key(url: object) -> str:
    return (urlparse(str(url or "").strip()).path or "").rstrip("/").lower()


def read_rows(path: Path, *, encoding: str) -> list[dict[str, str]]:
    with path.open("r", encoding=encoding, newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    catalog = read_rows(CATALOG_PATH, encoding="utf-8-sig")
    map_rows: list[dict[str, str]] = []
    for filename in LOCATION_FILES:
        map_rows.extend(read_rows(LOCATIONS_DIR / filename, encoding="latin-1"))

    active_catalog = [
        row
        for row in catalog
        if parse_bool(row.get("show_in_admin"), default=True)
        and not parse_bool(row.get("is_closed"), default=False)
    ]
    closed_catalog = [row for row in catalog if parse_bool(row.get("is_closed"), default=False)]

    open_map_coffeeshops = [
        row
        for row in map_rows
        if parse_bool(row.get("Coffeeshop"), default=False)
        and not parse_bool(row.get("Closed"), default=False)
    ]
    closed_map_coffeeshops = [
        row
        for row in map_rows
        if parse_bool(row.get("Coffeeshop"), default=False)
        and parse_bool(row.get("Closed"), default=False)
    ]

    active_by_url = {url_key(row.get("shop_url")): row for row in active_catalog}
    open_map_by_url = {url_key(row.get("website")): row for row in open_map_coffeeshops}

    active_missing_from_map = [
        row for key, row in active_by_url.items() if key not in open_map_by_url
    ]
    open_map_not_active = [
        row for key, row in open_map_by_url.items() if key not in active_by_url
    ]

    print("Shop link audit")
    print("===============")
    print(f"Active catalog shops:         {len(active_catalog)}")
    print(f"Closed catalog shops:         {len(closed_catalog)}")
    print(f"Open map coffeeshops:         {len(open_map_coffeeshops)}")
    print(f"Closed map coffeeshops:       {len(closed_map_coffeeshops)}")
    print(f"Active shops missing on map:  {len(active_missing_from_map)}")
    print(f"Open map shops not active:    {len(open_map_not_active)}")

    if active_missing_from_map:
        print("\nActive catalog shops missing from the map")
        print("-----------------------------------------")
        for row in active_missing_from_map:
            print(f"- {row['name']} ({row['city']})")

    if open_map_not_active:
        print("\nOpen map coffeeshops not in the active catalog")
        print("----------------------------------------------")
        for row in open_map_not_active:
            print(f"- {row['name']}")

    if closed_map_coffeeshops:
        print("\nClosed map coffeeshops")
        print("----------------------")
        for row in closed_map_coffeeshops:
            print(f"- {row['name']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Audit drift between the menu catalog and map CSVs."""

from __future__ import annotations

import csv
import re
from pathlib import Path
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"
CATALOG_PATH = DATABASE_DIR / "csd.csv"
LOCATIONS_DIR = DATABASE_DIR / "locations"
LOCATION_FILES = ("amsterdamLoc.csv", "utrechtLoc.csv")
AUDITED_CITIES = {"amsterdam", "utrecht"}


def parse_bool(raw: object, default: bool = False) -> bool:
    text = str(raw or "").strip().lower()
    if not text:
        return default
    return text in {"1", "true", "t", "yes", "y", "on"}


def menu_link_key(row: dict[str, str]) -> str:
    explicit = (row.get("menu_shop_key") or "").strip()
    if explicit:
        return explicit
    legacy = (row.get("shop_key") or "").strip()
    return legacy if legacy.startswith("cs-") else ""


def url_key(url: object) -> str:
    parsed = urlparse(str(url or "").strip())
    host = (parsed.hostname or "").lower().removeprefix("www.")
    path = (parsed.path or "").rstrip("/").lower()
    return f"{host}{path}" if host else path


def slug_token(value: object) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return re.sub(r"-+", "-", text).strip("-") or "unknown"


def catalog_shop_key(row: dict[str, str]) -> str:
    path = (urlparse(str(row.get("shop_url") or "").strip()).path or "")
    basename = Path(path).name.lower()
    if basename.endswith(".html"):
        basename = basename[:-5]
    return slug_token(basename or f"{row.get('name', '')}-{row.get('city', '')}")


def read_rows(path: Path, *, encoding: str) -> list[dict[str, str]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    except UnicodeDecodeError:
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
        if (row.get("city") or "").strip().lower() in AUDITED_CITIES
        and parse_bool(row.get("show_in_admin"), default=True)
        and not parse_bool(row.get("is_closed"), default=False)
    ]
    closed_catalog = [
        row for row in catalog
        if (row.get("city") or "").strip().lower() in AUDITED_CITIES
        and parse_bool(row.get("is_closed"), default=False)
    ]

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
    linked_map_coffeeshops = [row for row in open_map_coffeeshops if menu_link_key(row)]
    location_only_coffeeshops = [row for row in open_map_coffeeshops if not menu_link_key(row)]

    active_by_key = {catalog_shop_key(row): row for row in active_catalog}
    open_map_by_key = {menu_link_key(row): row for row in linked_map_coffeeshops}

    active_missing_from_map = [
        row for key, row in active_by_key.items() if key not in open_map_by_key
    ]
    open_map_not_active = [
        row for key, row in open_map_by_key.items() if key not in active_by_key
    ]

    print("Shop link audit")
    print("===============")
    print(f"Active catalog shops:         {len(active_catalog)}")
    print(f"Closed catalog shops:         {len(closed_catalog)}")
    print(f"Open map coffeeshops:         {len(open_map_coffeeshops)}")
    print(f"Menu-linked map shops:        {len(linked_map_coffeeshops)}")
    print(f"Location-only map shops:      {len(location_only_coffeeshops)}")
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

    if location_only_coffeeshops:
        print("\nOfficial/location-only map coffeeshops")
        print("--------------------------------------")
        for row in location_only_coffeeshops:
            print(f"- {row['name']}")

    if closed_map_coffeeshops:
        print("\nClosed map coffeeshops")
        print("----------------------")
        for row in closed_map_coffeeshops:
            print(f"- {row['name']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

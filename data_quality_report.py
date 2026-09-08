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
    "search_index.json",
    "home_summary.json",
    "updates.json",
]

# Keep the same source-date precedence as the map and menu explorer. Export and
# bulk check timestamps describe the dataset, not when a menu was observed.
SOURCE_DATE_FIELDS = (
    "source_menu_date", "menu_date", "listing_date", "menu_changed_at_utc",
    "checked_at", "checked_at_utc", "source_checked_at", "source_updated_at",
    "source_seen_at", "scraped_at", "scraped_at_utc", "fetched_at_utc", "created_at",
)
BATCH_DATE_FIELDS = ("menu_checked_at_utc", "last_seen_at_utc", "last_seen_at", "updated_at")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_location_csv(path: Path):
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            return list(reader.fieldnames or []), list(reader)
    except UnicodeDecodeError:
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
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        # A date without a timezone is a UTC calendar date, independent of the
        # computer running the publication check.
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def source_date(row: dict) -> tuple[str, datetime | None]:
    for field in SOURCE_DATE_FIELDS:
        parsed = parse_iso(row.get(field))
        if parsed is not None:
            return field, parsed
    return "", None


def freshness_summary(rows: list[dict], now: datetime | None = None) -> dict:
    reference = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).date()
    buckets = Counter({"fresh": 0, "ageing": 0, "stale": 0, "unknown": 0})
    fields: Counter = Counter()
    latest_by_shop: dict[str, datetime | None] = {}
    latest = None
    batch_only = future_dates = total = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        total += 1
        field, date = source_date(row)
        if date and date.date() > reference:
            future_dates += 1
            date = None
        if date:
            days = (reference - date.date()).days
            bucket = "fresh" if days <= 14 else "ageing" if days <= 60 else "stale"
            fields[field] += 1
            latest = max(latest, date) if latest else date
        else:
            bucket = "unknown"
            if not field and any(parse_iso(row.get(key)) for key in BATCH_DATE_FIELDS):
                batch_only += 1
        buckets[bucket] += 1
        identity = row.get("shop_id") or row.get("shop_key")
        if identity is None and row.get("shop_name"):
            identity = f"{row['shop_name']}|{row.get('shop_city', '')}"
        if identity is not None:
            key = str(identity)
            previous = latest_by_shop.get(key)
            latest_by_shop[key] = max(previous, date) if previous and date else previous or date

    shop_buckets = Counter({"fresh": 0, "ageing": 0, "stale": 0, "unknown": 0})
    for date in latest_by_shop.values():
        days = (reference - date.date()).days if date else None
        bucket = "unknown" if days is None else "fresh" if days <= 14 else "ageing" if days <= 60 else "stale"
        shop_buckets[bucket] += 1
    return {
        "total": total, "buckets": dict(buckets), "source_fields": dict(fields),
        "batch_only": batch_only, "future_dates": future_dates, "latest": latest,
        "shop_total": len(latest_by_shop), "shop_buckets": dict(shop_buckets),
    }


def report_freshness(rows: list[dict], warnings: list[str], now: datetime | None = None) -> None:
    current = now or datetime.now(timezone.utc)
    report = freshness_summary(rows, current)
    total = report["total"]
    print("\nMenu source-date coverage")
    print("-------------------------")
    print("Source/observed dates only; bulk menu checks, last-seen and export updates do not reset menu age.")
    print("Age is measured by UTC calendar day; source age does not guarantee current stock.")
    for bucket, label in (("fresh", "0–14 days"), ("ageing", "15–60 days"), ("stale", "Over 60 days"), ("unknown", "Unknown date")):
        count = report["buckets"][bucket]
        percentage = count / total * 100 if total else 0
        print(f"{label}: {count:,} of {total:,} listings ({percentage:.1f}%)")
    shop_counts = report["shop_buckets"]
    print(
        f"Shops with active listings: {report['shop_total']:,}; newest usable source date per shop: "
        f"{shop_counts['fresh']:,} within 14 days, {shop_counts['ageing']:,} 15–60 days, "
        f"{shop_counts['stale']:,} over 60 days, {shop_counts['unknown']:,} unknown."
    )
    if report["batch_only"]:
        print(f"Bulk timestamps only: {report['batch_only']:,} listings (included in unknown, not fresh).")
    if report["source_fields"]:
        print("Usable date fields: " + ", ".join(f"{field} ({count:,})" for field, count in sorted(report["source_fields"].items())))
    latest = report["latest"]
    if latest:
        age_days = (current.astimezone(timezone.utc).date() - latest.date()).days
        print(f"Newest active offering source date: {latest.date().isoformat()} ({age_days} day(s) ago)")
        if age_days > 14:
            warnings.append("Newest dated active offering source is more than two weeks old")
    older = report["buckets"]["ageing"] + report["buckets"]["stale"]
    if older:
        warnings.append(f"{older:,} of {total:,} active listings ({older / total:.1%}) have source dates older than 14 days; {report['buckets']['stale']:,} are over 60 days old")
    unknown = report["buckets"]["unknown"]
    if unknown:
        warnings.append(f"{unknown:,} of {total:,} active listings ({unknown / total:.1%}) have unknown source age; bulk refresh dates are not menu verification")
    if report["future_dates"]:
        warnings.append(f"{report['future_dates']:,} listings have future source dates and are counted as unknown")


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

    search_index_path = DATABASE_DIR / "search_index.json"
    if search_index_path.exists():
        search_index = load_json(search_index_path)
        for key in ("shops", "strains", "growers", "cities", "intents"):
            if not isinstance(search_index.get(key), list):
                errors.append(f"search_index.json is missing its {key} list")

    locations_index = DATABASE_DIR / "locations" / "index.json"
    locations_data = {}
    if not locations_index.exists():
        errors.append("Missing database/locations/index.json")
        location_files = []
    else:
        locations_data = load_json(locations_index)
        location_files = locations_data.get("files", []) if isinstance(locations_data, dict) else []

    print("")
    print("Location CSVs")
    print("-------------")
    master_filename = str(locations_data.get("master") or "").strip()
    master_rows: list[dict[str, str]] = []
    if not master_filename:
        errors.append("database/locations/index.json does not define a master coffeeshop catalogue")
    else:
        master_path = DATABASE_DIR / "locations" / master_filename
        if not master_path.exists():
            errors.append(f"database/locations/index.json references missing master {master_filename}")
        else:
            master_headers, master_rows = read_location_csv(master_path)
            required_master_headers = {
                "shop_id", "name", "lat", "lng", "city", "city_slug",
                "province", "shop_key", "status",
            }
            missing_headers = sorted(required_master_headers.difference(master_headers))
            if missing_headers:
                errors.append(
                    f"{master_filename} is missing required columns: {', '.join(missing_headers)}"
                )

            master_keys = [(row.get("shop_key") or "").strip() for row in master_rows]
            blank_keys = sum(not key for key in master_keys)
            duplicate_keys = sorted(key for key, count in Counter(master_keys).items() if key and count > 1)
            invalid_identity = [
                row for row in master_rows
                if (row.get("shop_id") or "").strip() != (row.get("shop_key") or "").strip()
            ]
            missing_place = [
                row for row in master_rows
                if not (row.get("name") or "").strip()
                or not (row.get("city") or "").strip()
                or not (row.get("city_slug") or "").strip()
                or not (row.get("province") or "").strip()
            ]
            invalid_status = [
                row for row in master_rows
                if (row.get("status") or "").strip().lower() not in {"open", "closed"}
            ]
            invalid_coords = []
            for row in master_rows:
                try:
                    lat = float((row.get("lat") or "").strip())
                    lng = float((row.get("lng") or "").strip())
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        invalid_coords.append(row)
                except ValueError:
                    invalid_coords.append(row)

            master_city_counts = Counter(
                (row.get("city_slug") or "").strip()
                for row in master_rows
                if (row.get("status") or "").strip().lower() != "closed"
            )
            city_entries = locations_data.get("cities", []) if isinstance(locations_data, dict) else []
            registered_city_slugs = {
                str(city.get("slug") or "").strip()
                for city in city_entries
                if isinstance(city, dict)
            }
            unregistered_cities = sorted(set(master_city_counts).difference(registered_city_slugs))

            print(
                f"{master_filename}: {len(master_rows):,} shops across "
                f"{len(master_city_counts):,} registered towns and cities"
            )
            if blank_keys:
                errors.append(f"{master_filename} has {blank_keys} row(s) without shop_key")
            if duplicate_keys:
                errors.append(f"{master_filename} has duplicate shop keys: {', '.join(duplicate_keys)}")
            if invalid_identity:
                errors.append(
                    f"{master_filename} has {len(invalid_identity)} row(s) where shop_id and shop_key differ"
                )
            if missing_place:
                errors.append(
                    f"{master_filename} has {len(missing_place)} row(s) missing name, city, city_slug, or province"
                )
            if invalid_status:
                errors.append(f"{master_filename} has {len(invalid_status)} row(s) with invalid status")
            if invalid_coords:
                errors.append(f"{master_filename} has {len(invalid_coords)} row(s) with invalid coordinates")
            if unregistered_cities:
                errors.append(
                    f"{master_filename} contains unregistered city slugs: {', '.join(unregistered_cities)}"
                )

            for city in city_entries:
                if not isinstance(city, dict):
                    continue
                slug = str(city.get("slug") or "").strip()
                expected_count = city.get("shop_count")
                actual_count = master_city_counts.get(slug, 0)
                if isinstance(expected_count, int) and expected_count != actual_count:
                    errors.append(
                        f"{city.get('name') or slug} shop_count is {expected_count:,}, "
                        f"but {master_filename} has {actual_count:,} open shops"
                    )

    for filename in location_files:
        path = DATABASE_DIR / "locations" / filename
        if not path.exists():
            errors.append(f"database/locations/index.json references missing {filename}")
            continue

        headers, rows = read_location_csv(path)
        duplicate_headers = [name for name, count in Counter(headers).items() if name and count > 1]
        blank_headers = headers.count("")
        local_place_count = sum(
            (row.get("Coffeeshop") or "").strip().lower() != "y"
            for row in rows
        )
        print(f"{filename}: {len(rows):,} rows, {local_place_count:,} local map places")

        if duplicate_headers:
            warnings.append(f"{filename} has duplicate columns: {', '.join(duplicate_headers)}")
        if blank_headers:
            warnings.append(f"{filename} has {blank_headers} blank column header(s)")

    active_path = DATABASE_DIR / "active_offerings.json"
    if active_path.exists():
        active = load_json(active_path)
        report_freshness(active, warnings)

        summary_path = DATABASE_DIR / "home_summary.json"
        if summary_path.exists():
            summary = load_json(summary_path)
            network = summary.get("network", {}) if isinstance(summary, dict) else {}
            amsterdam = summary.get("amsterdam", {}) if isinstance(summary, dict) else {}
            network_total = int(network.get("active_listings") or 0) + int(network.get("excluded_listings") or 0)
            amsterdam_rows = [
                row for row in active
                if isinstance(row, dict)
                and str(row.get("shop_city") or "").strip().lower() == "amsterdam"
            ]
            amsterdam_total = int(amsterdam.get("active_listings") or 0) + int(amsterdam.get("excluded_listings") or 0)
            if network_total != len(active):
                errors.append(
                    "home_summary network listings do not reconcile with active_offerings.json "
                    f"({network_total:,} versus {len(active):,})"
                )
            if amsterdam_total != len(amsterdam_rows):
                errors.append(
                    "home_summary Amsterdam listings do not reconcile with active_offerings.json "
                    f"({amsterdam_total:,} versus {len(amsterdam_rows):,})"
                )
            if summary.get("exported_at_utc") != manifest.get("exported_at_utc"):
                errors.append("home_summary export timestamp does not match manifest.json")

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

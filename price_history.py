"""Read-only reconstruction of recorded menu averages for the static homepage.

History timestamps describe database observations, never original menu dates.
Complete menu observations replace a shop's prior snapshot; archive events retire
rows even though the archive stores their outgoing status as 'active'.
"""
from __future__ import annotations

import math
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from itertools import groupby


SNAPSHOT_EVENTS = {"seen_on_menu", "seen_on_unchanged_menu"}
REMOVE_EVENTS = {
    "superseded_by_new_menu", "missing_from_latest_menu", "repair_pending_rebuild",
    "repair_missing_from_menu", "recovered_duplicate",
}
UPDATE_EVENTS = {"package_correction", "repair_preserved_entry"}


def utc_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return None


def positive_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def _identity(row):
    weight = positive_number(row["package_weight_g"]) or 1.0
    return int(row["strain_id"]), weight, int(row["is_legal"] or 0)


def _listing(row):
    if str(row["price_currency"] or "").strip() != "€" or str(row["price_unit"] or "").strip() != "g":
        return None
    pack = positive_number(row["package_price_amount"])
    weight = positive_number(row["package_weight_g"])
    price = pack / weight if pack and weight else positive_number(row["price_amount"])
    name = " ".join(str(row["strain_name_normalised"] or "").lower().split())
    if not name or price is None or not math.isfinite(price):
        return None
    return name, price


def _averages(state, cities, eligible_shop_ids):
    """Match the homepage: round each strain's mean, then average those means."""
    groups = defaultdict(lambda: defaultdict(list))
    shops = defaultdict(set)
    for shop_id, listings in state.items():
        if shop_id not in eligible_shop_ids:
            continue
        for name, price in listings.values():
            for scope in ("netherlands", cities.get(shop_id, "")):
                if scope:
                    groups[scope][name].append(price)
                    shops[scope].add(shop_id)
    output = {}
    for scope in {"netherlands", *cities.values()} - {""}:
        strains = groups[scope]
        means = [round(sum(values) / len(values), 2) for values in strains.values()]
        output[scope] = {
            "average_price": round(sum(means) / len(means), 2) if means else None,
            "shop_count": len(shops[scope]),
            "strain_count": len(strains),
            "listing_count": sum(len(values) for values in strains.values()),
        }
    return output


def _shop_average(listings):
    strains = defaultdict(list)
    for name, price in listings.values():
        strains[name].append(price)
    means = [round(sum(prices) / len(prices), 2) for prices in strains.values()]
    return round(sum(means) / len(means), 2) if means else None


def build_price_history(conn: sqlite3.Connection, shops, current_offerings, exported_at_utc, excluded_shop_ids=(), benchmark_shop_ids=(), extra_shop_ids=()):
    """Build small daily aggregates without writing to, migrating or committing SQLite.

    Only days with recorded events are emitted. Current catalogue identities,
    locations and publication exclusions apply throughout the series. The export
    day's point comes from the actual current snapshot, including manual edits
    that have not yet produced a historical event.
    """
    exported = utc_time(exported_at_utc)
    if exported is None:
        raise ValueError("Price history needs a valid export timestamp")
    excluded = {str(value) for value in excluded_shop_ids}
    all_shops = {int(shop["shop_id"]): shop for shop in shops}
    eligible = {shop_id for shop_id in all_shops if str(shop_id) not in excluded}
    tracked = list(dict.fromkeys(int(shop_id) for shop_id in benchmark_shop_ids))
    # Optional individual histories let each visitor choose a fixed sample.
    individual_ids = list(dict.fromkeys([*tracked, *(int(shop_id) for shop_id in extra_shop_ids if int(shop_id) in eligible)]))
    individual_set = set(individual_ids)
    included = {shop_id: shop for shop_id, shop in all_shops.items() if shop_id in eligible or shop_id in tracked}
    city_labels = {}
    cities = {}
    for shop_id, shop in included.items():
        label = " ".join(str(shop.get("city") or "").split())
        key = label.casefold()
        cities[shop_id] = key
        if key:
            city_labels.setdefault(key, label[:1].upper() + label[1:])
    series = {scope: [] for scope in {"netherlands", *city_labels}}
    if tracked:
        series["benchmark"] = []
    series.update({f"shop-{shop_id}": [] for shop_id in individual_ids})
    state = {}
    day = None
    observations = 0
    observed_today = set()

    def append_day(date, kind="recorded"):
        values_by_scope = _averages(state, cities, eligible)
        if tracked:
            means = []
            names = set()
            listing_count = 0
            for shop_id in tracked:
                listings = state.get(shop_id, {})
                mean = _shop_average(listings)
                if mean is not None:
                    means.append(mean)
                shop_names = {name for name, _price in listings.values()}
                names.update(shop_names)
                listing_count += len(listings)
                values_by_scope[f"shop-{shop_id}"] = {
                    "average_price": mean, "shop_count": int(mean is not None),
                    "strain_count": len(shop_names), "listing_count": len(listings),
                }
            values_by_scope["benchmark"] = {
                "average_price": round(sum(means) / len(means), 2) if len(means) == len(tracked) else None,
                "shop_count": len(means), "strain_count": len(names), "listing_count": listing_count,
            }
        # For untracked shops, record only genuine observation days (and the
        # export snapshot). This preserves gaps and keeps the export compact.
        extra_for_day = individual_set - set(tracked) if kind == "current" else (individual_set - set(tracked)) & observed_today
        for shop_id in extra_for_day:
            listings = state.get(shop_id, {})
            mean = _shop_average(listings)
            values_by_scope[f"shop-{shop_id}"] = {
                "average_price": mean, "shop_count": int(mean is not None),
                "strain_count": len({name for name, _price in listings.values()}), "listing_count": len(listings),
            }
        for scope, values in values_by_scope.items():
            if kind != "current" and scope == "benchmark" and not observed_today.intersection(tracked):
                continue
            if kind != "current" and scope.startswith("shop-") and int(scope[5:]) not in observed_today:
                continue
            point = {"date": date, **values, "kind": kind}
            if series[scope] and series[scope][-1]["date"] == date:
                series[scope][-1] = point
            else:
                series[scope].append(point)

    events = sorted(SNAPSHOT_EVENTS | REMOVE_EVENTS | UPDATE_EVENTS)
    cursor = conn.execute(
        f"""SELECT h.id, h.shop_id, h.strain_id, h.observed_at_utc, h.event_type,
                   h.status, h.is_legal, h.price_currency, h.price_unit, h.price_amount,
                   h.package_price_amount, h.package_weight_g, st.name_normalised AS strain_name_normalised
            FROM offering_history h JOIN strains st ON st.id = h.strain_id
            WHERE h.event_type IN ({','.join('?' for _ in events)})
              AND julianday(h.observed_at_utc) <= julianday(?)
            ORDER BY julianday(h.observed_at_utc), h.shop_id, h.event_type, h.id""",
        (*events, exported_at_utc),
    )
    for (timestamp, shop_id, event), rows in groupby(cursor, lambda row: (row["observed_at_utc"], int(row["shop_id"]), row["event_type"])):
        if shop_id not in included:
            continue
        observed = utc_time(timestamp)
        if observed is None or observed > exported:
            continue
        next_day = observed.date().isoformat()
        if day and day != next_day:
            append_day(day)
            observed_today.clear()
        day = next_day
        observed_today.add(shop_id)
        if event in SNAPSHOT_EVENTS:
            state[shop_id] = {}
        listings = state.setdefault(shop_id, {})
        for row in rows:
            observations += 1
            identity = _identity(row)
            value = _listing(row)
            if event == "superseded_by_new_menu":
                # Legacy scraper archives omitted the legal flag. Retire all
                # recorded legal variants of the outgoing strain/pack pair.
                for key in list(listings):
                    if key[:2] == identity[:2]:
                        listings.pop(key)
            elif event in REMOVE_EVENTS or row["status"] != "active" or value is None:
                listings.pop(identity, None)
            else:
                listings[identity] = value
    if day:
        append_day(day)

    # Do not infer earlier existence from today's inventory. Use it only at the
    # export date so the final value agrees with the homepage's current average.
    state = {}
    for row in current_offerings:
        shop_id = int(row["shop_id"])
        if shop_id not in included:
            continue
        value = _listing(row)
        if value is not None:
            state.setdefault(shop_id, {})[_identity(row)] = value
    append_day(exported.date().isoformat(), "current")

    # Earlier empty dates do not imply a city's menus were observed then.
    for scope, points in series.items():
        first = next((index for index, point in enumerate(points) if point["average_price"] is not None), len(points) - 1)
        series[scope] = points[first:]

    tracked_cities = sorted({str(all_shops[shop_id].get("city") or "").strip() for shop_id in tracked if shop_id in all_shops})
    benchmark_name = f"{tracked_cities[0]} · {len(tracked)}-shop benchmark" if len(tracked_cities) == 1 else f"Fixed {len(tracked)}-shop benchmark"
    tracked_shops = [{"shop_id": shop_id, "name": str(all_shops.get(shop_id, {}).get("name") or f"Unavailable shop #{shop_id}"),
                      "city": str(all_shops.get(shop_id, {}).get("city") or "")} for shop_id in tracked]
    order = (["benchmark"] if tracked else []) + ["netherlands", *sorted(city_labels)] + [f"shop-{shop_id}" for shop_id in individual_ids]

    def series_metadata(scope):
        if scope == "benchmark":
            return {"name": benchmark_name, "kind": "benchmark"}
        if scope.startswith("shop-"):
            shop_id = int(scope[5:])
            shop = all_shops.get(shop_id, {})
            return {"name": str(shop.get("name") or f"Unavailable shop #{shop_id}"), "kind": "shop", "shop_id": shop_id}
        return {"name": "Netherlands" if scope == "netherlands" else city_labels[scope], "kind": "location"}

    return {
        "version": 1,
        "exported_at_utc": exported_at_utc,
        "currency": "€",
        "unit": "g",
        "date_basis": "recorded_observation",
        "method": "Locations use the mean of strain averages. The fixed benchmark uses the mean of shop averages, with each configured shop given equal weight. Intermediate means are rounded to two decimal places.",
        "coverage_note": "Shop and strain coverage changes. This is a recorded database average, not a like-for-like market price index.",
        "history_note": "Dates are when Budfinder recorded listings, not original menu publication dates. Last known listings are carried forward until a replacement or removal is recorded. Current shop eligibility applies to location series; fixed benchmark membership is preserved throughout. Current strain identities apply, and unrecorded edits cannot be reconstructed.",
        "line_interpolation": "connect_recorded_points",
        "benchmark": {"shop_count": len(tracked), "shops": tracked_shops,
                      "method": "Same configured shops throughout, with each shop contributing its mean strain price once. Points require usable prices at every tracked shop; missing shops are never silently replaced."},
        "observations_processed": observations,
        "series": [
            {"id": scope, **series_metadata(scope), "points": series[scope]}
            for scope in order
        ],
    }


def price_history_errors(history, summary, manifest):
    """Publication checks for aggregate history, independent of the admin app."""
    errors = []
    if not isinstance(history, dict) or history.get("version") != 1:
        return ["price_history.json has an unsupported format"]
    if history.get("exported_at_utc") != manifest.get("exported_at_utc"):
        errors.append("price_history export timestamp does not match manifest.json")
    exported = utc_time(history.get("exported_at_utc"))
    if exported is None:
        return errors + ["price_history export timestamp is invalid"]
    if (history.get("currency"), history.get("unit"), history.get("date_basis")) != ("€", "g", "recorded_observation"):
        errors.append("price_history currency, units or date basis is invalid")
    expected = {"netherlands": summary.get("network", {}).get("average_strain_price")}
    expected.update({str(row.get("name", "")).casefold(): row.get("average_strain_price") for row in summary.get("locations", [])})
    seen = set()
    benchmark = history.get("benchmark", {})
    tracked = [shop.get("shop_id") for shop in benchmark.get("shops", [])]
    if len(tracked) != benchmark.get("shop_count", 0) or len(set(tracked)) != len(tracked):
        errors.append("price_history benchmark membership is inconsistent")
    for series in history.get("series", []):
        scope = series.get("id")
        if not scope or scope in seen:
            errors.append("price_history contains a missing or duplicate location")
        seen.add(scope)
        points = series.get("points", [])
        dates = [point.get("date", "") for point in points]
        if not dates or dates != sorted(set(dates)):
            errors.append(f"price_history {scope}: dates must be present, unique and ordered")
        for point in points:
            observed = utc_time(point.get("date"))
            price = point.get("average_price")
            if observed is None or observed.date().isoformat() != point.get("date") or observed.date() > exported.date():
                errors.append(f"price_history {scope}: invalid or future date")
            if price is not None and positive_number(price) is None:
                errors.append(f"price_history {scope}: invalid price")
            if scope == "benchmark" and price is not None and point.get("shop_count") != len(tracked):
                errors.append("price_history benchmark point does not include every tracked shop")
            if any(not isinstance(point.get(key), int) or point[key] < 0 for key in ("shop_count", "strain_count", "listing_count")):
                errors.append(f"price_history {scope}: invalid coverage counts")
        if points and (points[-1].get("kind") != "current" or dates[-1] != exported.date().isoformat()):
            errors.append(f"price_history {scope}: final point must be the current snapshot")
        if points and scope in expected and points[-1].get("average_price") != expected[scope]:
            errors.append(f"price_history {scope}: current average does not match home_summary.json")
    if "netherlands" not in seen:
        errors.append("price_history is missing its Netherlands series")
    return errors


def shop_price_history_errors(history, manifest):
    """Check that personalised benchmarks use a complete matching export."""
    if not isinstance(history, dict) or history.get("version") != 1:
        return ["price_history_shops.json has an unsupported format"]
    errors = []
    if history.get("exported_at_utc") != manifest.get("exported_at_utc"):
        errors.append("price_history_shops export timestamp does not match manifest.json")
    exported = utc_time(history.get("exported_at_utc"))
    if exported is None:
        return errors + ["price_history_shops export timestamp is invalid"]
    if (history.get("currency"), history.get("unit"), history.get("date_basis")) != ("€", "g", "recorded_observation"):
        errors.append("price_history_shops currency, units or date basis is invalid")
    shops = history.get("shops")
    if not isinstance(shops, list):
        return errors + ["price_history_shops is missing its shop list"]
    seen = set()
    for shop in shops:
        if not isinstance(shop, dict) or type(shop.get("shop_id")) is not int or shop["shop_id"] <= 0 or shop["shop_id"] in seen:
            errors.append("price_history_shops contains an invalid or duplicate shop ID")
            continue
        shop_id = shop["shop_id"]
        seen.add(shop_id)
        points = shop.get("points")
        if not isinstance(points, list) or not points or any(not isinstance(point, dict) for point in points):
            errors.append(f"price_history_shops {shop_id}: observations are missing")
            continue
        dates = [point.get("date", "") for point in points]
        if any(not isinstance(date, str) for date in dates) or dates != sorted(set(dates)):
            errors.append(f"price_history_shops {shop_id}: dates must be unique and ordered")
        for point in points:
            date = utc_time(point.get("date"))
            if date is None or date.date().isoformat() != point.get("date") or date.date() > exported.date():
                errors.append(f"price_history_shops {shop_id}: invalid or future date")
            if point.get("average_price") is not None and positive_number(point["average_price"]) is None:
                errors.append(f"price_history_shops {shop_id}: invalid price")
        if dates[-1] != exported.date().isoformat() or points[-1].get("kind") != "current":
            errors.append(f"price_history_shops {shop_id}: current snapshot is missing")
    return errors

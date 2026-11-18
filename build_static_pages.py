#!/usr/bin/env python3
"""Generate crawlable HTML pages for cities, coffeeshops and strains.

The interactive pages (map.html, database.html) build everything in the
browser, so search engines only see three URLs. This script reads the exported
public JSON in database/ and writes plain HTML that needs no JavaScript:

    coffeeshops/index.html                 every city with menu data
    coffeeshops/<city>/index.html          shops, prices and popular strains
    coffeeshops/<city>/<shop>/index.html   one shop's current menu
    strains/index.html                     A–Z of strains listed by 2+ shops
    strains/<strain>/index.html            prices for one strain across shops
    sitemap.xml                            all of the above plus the main pages

Every page links back into the live map and Menus & prices views. Run it after
each JSON export (the admin's Export JSON button also runs it):

    python3 build_static_pages.py

It only reads database/ and updates the three outputs above in place: pages
that did not change are left alone, and pages for shops or strains that have
left the menus are removed.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote, urlencode

SITE = "https://budfinder.org"
STYLESHEET = "/styles/budfinder-static.css?v=20261118-static2"
BRAND_MARK = "/images/budfinder-badge-v3-96.webp"
SOCIAL_IMAGE = f"{SITE}/static/images/budfinder-social.png"
MIN_STRAIN_SHOPS = 2  # single-shop strains stay in the live explorer only
UNAVAILABLE_STATUSES = {"closed", "archived", "archive", "previous", "old", "error", "failed"}
TRUSTED_DATE_FIELDS = (
    "source_menu_date", "menu_date", "listing_date", "menu_changed_at_utc", "checked_at",
    "checked_at_utc", "source_checked_at", "source_updated_at", "source_seen_at",
    "scraped_at", "scraped_at_utc", "fetched_at_utc", "created_at",
)
TYPE_ORDER = ["sativa", "indica", "hybrid", "hash"]
GENERATED_DIRS = ("coffeeshops", "strains")
CHECK_NOTE = '<small class="warn" title="This looks like a menu typo, so it is left out of typical and lowest prices.">Check price</small>'
OLD_NOTE = '<small class="warn" title="This menu is over a year old, so its prices are left out of typical and lowest prices.">Old menu</small>'
HOURS_FILE = "opening_hours.json"  # written once by scripts/fetch_opening_hours.py
MARKER_FILE = ".generated-by-build_static_pages"


# ---------------------------------------------------------------- helpers

def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    text = text.lower().replace("&", " and ").replace("'", "")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "item"


def unique_slug(base: str, taken: set) -> str:
    slug, n = base, 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    taken.add(slug)
    return slug


def display_city(name: str) -> str:
    name = str(name or "").strip()
    return name[:1].upper() + name[1:] if name else ""


def display_strain(name: str) -> str:
    """Title-case lower-case names, leave deliberate capitals alone."""
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    if name and name == name.lower():
        return " ".join(part[:1].upper() + part[1:] for part in name.split(" "))
    return name


def money(value: Optional[float]) -> str:
    if value is None:
        return "–"
    rounded = round(float(value) + 1e-9, 2)
    return f"€{rounded:.0f}" if rounded == int(rounded) else f"€{rounded:.2f}"


def per_gram(value: Optional[float]) -> str:
    return f"{money(value)}/g" if value is not None else "–"


def parse_time(value: Any) -> Optional[datetime]:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            moment = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment


def listing_date(row: Dict[str, Any], now: datetime) -> Optional[datetime]:
    """Same precedence as the explorer: bulk refresh times never count as a menu date."""
    for field in TRUSTED_DATE_FIELDS:
        moment = parse_time(row.get(field))
        if moment:
            return moment if moment <= now else None
    return None


def fmt_date(moment: Optional[datetime]) -> str:
    return f"{moment.day} {moment.strftime('%b %Y')}" if moment else "Unknown"


def fmt_long_date(moment: Optional[datetime]) -> str:
    return f"{moment.day} {moment.strftime('%B %Y')}" if moment else "Unknown"


def clean_address(value: Any, name: str = "") -> str:
    """An address line without the shop name some sources put in front."""
    text = " ".join(str(value or "").split())
    if name and text.lower().startswith(name.strip().lower() + ","):
        text = text[len(name.strip()) + 1:].strip()
    return text


def median(values: Iterable[float]) -> Optional[float]:
    items = [v for v in values if v is not None]
    return statistics.median(items) if items else None


def pack_label(row: Dict[str, Any]) -> str:
    try:
        price = float(row.get("package_price_amount"))
        weight = float(row.get("package_weight_g"))
    except (TypeError, ValueError):
        return ""
    if price <= 0 or weight <= 0 or weight == 1:
        return ""
    weight_text = f"{weight:g}g"
    return f"{money(price)} / {weight_text}"


def gram_price(row: Dict[str, Any]) -> Optional[float]:
    if str(row.get("price_currency") or "€") != "€":
        return None
    if str(row.get("price_unit") or "g").strip().lower() not in {"g", "gram", ""}:
        return None
    try:
        value = float(row.get("price_amount"))
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


# ---------------------------------------------------------------- data

def _source_token(value: Any) -> str:
    from urllib.parse import unquote
    decoded = unquote(str(value or "")).lower().removeprefix("cs-").replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "", decoded)


def unavailable_shop_ids(shops: List[Dict[str, Any]]) -> set:
    """Mirror coffeeshop_menu_app._home_unavailable_shop_ids so page counts match the homepage.

    Kept as a copy because the admin module needs Flask to import.
    """
    def own_tokens(shop: Dict[str, Any]) -> set:
        return {
            token for token in (
                _source_token(shop.get("name")),
                _source_token(str(shop.get("shop_key") or "").removeprefix("cs-")),
            ) if len(token) >= 5
        }

    closed_tokens = set().union(*(own_tokens(s) for s in shops if int(s.get("is_closed") or 0) == 1)) if shops else set()

    def source_conflicts(shop: Dict[str, Any]) -> bool:
        source = _source_token(shop.get("image_url"))
        if not source:
            return False
        mine = own_tokens(shop)
        return any(token not in mine and token in source for token in closed_tokens)

    return {
        str(shop.get("shop_id") or "")
        for shop in shops
        if int(shop.get("is_closed") or 0) == 1
        or int(shop.get("show_in_admin") or 0) == 0
        or str(shop.get("menu_status") or "").strip().lower() in UNAVAILABLE_STATUSES
        or source_conflicts(shop)
    }


class Dataset:
    def __init__(self, root: Path):
        db = root / "database"
        self.root = root
        self.now = datetime.now(timezone.utc)
        self.summary = json.loads((db / "home_summary.json").read_text(encoding="utf-8"))
        self.exported = parse_time(self.summary.get("exported_at_utc")) or self.now
        shops = json.loads((db / "shops.json").read_text(encoding="utf-8"))
        offerings = json.loads((db / "active_offerings.json").read_text(encoding="utf-8"))
        catalogue = {}
        catalogue_path = db / "locations" / "coffeeshops.csv"
        if catalogue_path.exists():
            with catalogue_path.open(encoding="utf-8-sig", newline="") as handle:
                catalogue = {row.get("shop_key", ""): row for row in csv.DictReader(handle)}

        unavailable = unavailable_shop_ids(shops) | {
            str(shop.get("shop_id"))
            for shop in shops
            if str((catalogue.get(shop.get("shop_key")) or {}).get("status") or "open").strip().lower() in {"closed", "permanently closed"}
        }
        self.shop_meta = {str(shop.get("shop_id")): shop for shop in shops}
        self.catalogue = catalogue
        hours_path = db / HOURS_FILE
        self.hours = json.loads(hours_path.read_text(encoding="utf-8")) if hours_path.exists() else {}

        self.rows: List[Dict[str, Any]] = []
        for row in offerings:
            if str(row.get("shop_id")) in unavailable:
                continue
            price = gram_price(row)
            item = dict(row)
            item["_price"] = price
            # Likely typos (price_checks.py) are shown but never compared.
            item["_checked"] = bool(str(row.get("price_check") or "").strip())
            # So are listings from menus over a year old (the export sets old_menu).
            item["_old"] = int(row.get("old_menu") or 0) == 1
            item["_cmp"] = None if item["_checked"] or item["_old"] else price
            item["_date"] = listing_date(row, self.now)
            item["_strain_key"] = re.sub(r"\s+", " ", str(row.get("strain_name_normalised") or row.get("strain_name") or "").strip().lower())
            if item["_strain_key"]:
                self.rows.append(item)

        self._build_shops()
        self._build_strains()
        self._build_cities()

    def _build_shops(self) -> None:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in self.rows:
            grouped[str(row.get("shop_id"))].append(row)
        city_taken: Dict[str, set] = defaultdict(set)
        self.shops: Dict[str, Dict[str, Any]] = {}
        for shop_id, rows in sorted(grouped.items(), key=lambda item: str(item[1][0].get("shop_name") or "").lower()):
            first = rows[0]
            meta = self.shop_meta.get(shop_id, {})
            shop_key = str(first.get("shop_key") or meta.get("shop_key") or "")
            cat = self.catalogue.get(shop_key, {})
            city = display_city(first.get("shop_city") or meta.get("city") or cat.get("city") or "")
            city_slug = slugify(cat.get("city_slug") or city)
            name = str(first.get("shop_name") or meta.get("name") or "Coffeeshop").strip()
            prices = [r["_cmp"] for r in rows if r["_cmp"] is not None]
            own_prices = [r["_price"] for r in rows if r["_price"] is not None and not r["_checked"]]
            dates = [r["_date"] for r in rows if r["_date"]]
            address = clean_address(meta.get("address"), name) or " ".join(
                part for part in (cat.get("address"), cat.get("postcode")) if part).strip()
            self.shops[shop_id] = {
                "id": shop_id,
                "key": shop_key,
                "name": name,
                "city": city,
                "city_slug": city_slug,
                "slug": unique_slug(slugify(name), city_taken[city_slug]),
                "rows": rows,
                "strain_count": len({r["_strain_key"] for r in rows}),
                "median": median(prices),
                "low": min(prices) if prices else None,
                # The shop's own figures, shown on its page even for an old menu.
                "own_median": median(own_prices),
                "own_low": min(own_prices) if own_prices else None,
                "old_menu": any(r["_old"] for r in rows),
                "dated": bool(parse_time(meta.get("source_menu_date"))),
                "latest": max(dates) if dates else None,
                "address": address,
                "lat": cat.get("lat"),
                "lng": cat.get("lng"),
                "logo": self._logo_src(str(cat.get("logo") or "").strip()),
                "source_url": str(meta.get("shop_url") or cat.get("website") or "").strip(),
            }
        for shop in self.shops.values():
            shop["path"] = f"/coffeeshops/{shop['city_slug']}/{shop['slug']}/"

    def _logo_src(self, logo: str) -> str:
        """Prefer the small WebP copy; skip logos whose files are missing."""
        if not logo:
            return ""
        stem = re.sub(r"\.[a-z0-9]+$", "", logo, flags=re.I)
        if (self.root / "images" / "logos" / "thumbs" / f"{stem}.webp").exists():
            return f"/images/logos/thumbs/{quote(stem)}.webp"
        if (self.root / "images" / "logos" / logo).exists():
            return f"/images/logos/{quote(logo)}"
        return ""

    def _build_strains(self) -> None:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for row in self.rows:
            grouped[row["_strain_key"]].append(row)
        taken: set = {"index"}
        self.strains: Dict[str, Dict[str, Any]] = {}
        for key, rows in sorted(grouped.items()):
            shop_ids = {str(r.get("shop_id")) for r in rows}
            names = Counter(str(r.get("strain_name") or "").strip() for r in rows if r.get("strain_name"))
            name = display_strain(names.most_common(1)[0][0] if names else key)
            prices = [r["_cmp"] for r in rows if r["_cmp"] is not None]
            types = Counter(str(r.get("base_type") or "").lower() for r in rows if r.get("base_type"))
            strain = {
                "key": key,
                "name": name,
                "rows": rows,
                "shop_ids": shop_ids,
                "median": median(prices),
                "low": min(prices) if prices else None,
                "high": max(prices) if prices else None,
                "type": types.most_common(1)[0][0] if types else "",
                "cities": sorted({self.shops[s]["city"] for s in shop_ids if s in self.shops}),
                "published": len(shop_ids) >= MIN_STRAIN_SHOPS and bool(prices),
            }
            if strain["published"]:
                strain["slug"] = unique_slug(slugify(name), taken)
                strain["path"] = f"/strains/{strain['slug']}/"
            self.strains[key] = strain

    def _build_cities(self) -> None:
        grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for shop in self.shops.values():
            grouped[shop["city_slug"]].append(shop)
        self.cities: Dict[str, Dict[str, Any]] = {}
        for slug, shops in grouped.items():
            rows = [row for shop in shops for row in shop["rows"]]
            prices = [r["_cmp"] for r in rows if r["_cmp"] is not None]
            strain_shops: Dict[str, set] = defaultdict(set)
            for row in rows:
                strain_shops[row["_strain_key"]].add(str(row.get("shop_id")))
            self.cities[slug] = {
                "slug": slug,
                "name": shops[0]["city"],
                "path": f"/coffeeshops/{slug}/",
                "shops": sorted(shops, key=lambda s: s["name"].lower()),
                "listing_count": len(rows),
                "strain_count": len(strain_shops),
                "median": median(prices),
                "low": min(prices) if prices else None,
                "top_strains": sorted(strain_shops.items(), key=lambda item: (-len(item[1]), item[0]))[:12],
            }

    def strain_link(self, key: str, label: Optional[str] = None) -> str:
        strain = self.strains.get(key)
        text = esc(label or (strain["name"] if strain else key))
        if strain and strain.get("published"):
            return f'<a href="{strain["path"]}">{text}</a>'
        return text


# ---------------------------------------------------------------- layout

def live_url(page: str, **params: str) -> str:
    query = urlencode({k: v for k, v in params.items() if v})
    return f"/{page}" + (f"?{query}" if query else "")


def logo_html(shop: Dict[str, Any], size: int = 48) -> str:
    src = shop.get("logo") or ""
    if src:
        return f'<img class="logo" src="{src}" width="{size}" height="{size}" alt="" loading="lazy" decoding="async">'
    initials = "".join(part[:1] for part in shop["name"].split()[:2]).upper() or "CS"
    return f'<span class="logo logo-initials" aria-hidden="true">{esc(initials)}</span>'


def page(*, path: str, title: str, description: str, crumbs: List[Tuple[str, str]],
         body: str, dataset: Dataset, extra_ld: Optional[Dict[str, Any]] = None) -> str:
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": f"{SITE}{href}"}
            for i, (name, href) in enumerate(crumbs)
        ],
    }
    ld = [breadcrumb] + ([extra_ld] if extra_ld else [])
    crumb_html = " <span aria-hidden=\"true\">›</span> ".join(
        f'<a href="{href}">{esc(name)}</a>' if i < len(crumbs) - 1 else f'<span aria-current="page">{esc(name)}</span>'
        for i, (name, href) in enumerate(crumbs)
    )
    snapshot = fmt_long_date(dataset.exported)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}" />
  <link rel="canonical" href="{SITE}{path}" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE}{path}" />
  <meta property="og:image" content="{SOCIAL_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/x-icon" href="/images/budfinder-badge-v3.ico" />
  <link rel="stylesheet" href="{STYLESHEET}" />
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/"><img src="{BRAND_MARK}" width="36" height="36" alt="" /> Budfinder</a>
    <nav aria-label="Main navigation">
      <a href="/">Home</a>
      <a href="/map.html">Map</a>
      <a href="/database.html">Menus &amp; prices</a>
    </nav>
  </header>
  <main>
    <nav class="crumbs" aria-label="Breadcrumb">{crumb_html}</nav>
{body}
  </main>
  <footer class="site-footer">
    <p>Prices come from published coffeeshop menus (snapshot {esc(snapshot)}) and can change. Check with the shop before you travel.</p>
    <p>For adults 18+. Follow local laws and coffeeshop rules. <a href="/coffeeshops/">All cities</a> · <a href="/strains/">All strains</a></p>
  </footer>
</body>
</html>
"""


def stat(label: str, value: str, note: str = "") -> str:
    return f'<div class="stat"><span>{esc(label)}</span><strong>{esc(value)}</strong>{f"<small>{esc(note)}</small>" if note else ""}</div>'


def plural(count: int, word: str, many: Optional[str] = None) -> str:
    return f"{count:,} {word if count == 1 else (many or word + 's')}"


# ---------------------------------------------------------------- pages

def strain_page(ds: Dataset, strain: Dict[str, Any]) -> str:
    rows = sorted(strain["rows"], key=lambda r: (r["_cmp"] if r["_cmp"] is not None else 1e9,
                                                ds.shops[str(r["shop_id"])]["name"].lower()))
    shop_count = len(strain["shop_ids"])
    by_city: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        shop = ds.shops[str(row["shop_id"])]
        by_city[shop["city_slug"]].append(row)
    city_rows = []
    for slug, items in sorted(by_city.items(), key=lambda item: (-len({str(r["shop_id"]) for r in item[1]}), item[0])):
        city = ds.cities[slug]
        prices = [r["_cmp"] for r in items if r["_cmp"] is not None]
        city_rows.append(
            f'<tr><td><a href="{city["path"]}">{esc(city["name"])}</a></td>'
            f'<td class="num">{len({str(r["shop_id"]) for r in items})}</td>'
            f'<td class="num">{per_gram(median(prices))}</td><td class="num">{per_gram(min(prices) if prices else None)}</td></tr>'
        )
    listing_rows = []
    for row in rows:
        shop = ds.shops[str(row["shop_id"])]
        notes = " · ".join(filter(None, [
            "Cali" if int(row.get("is_cali") or 0) == 1 else "",
            "Legal project" if int(row.get("is_legal") or 0) == 1 else "",
            f"Grower: {row['grower']}" if row.get("grower") else "",
        ]))
        listing_rows.append(
            f'<tr><td><a href="{shop["path"]}">{esc(shop["name"])}</a>{f"<small>{esc(notes)}</small>" if notes else ""}</td>'
            f'<td><a href="{ds.cities[shop["city_slug"]]["path"]}">{esc(shop["city"])}</a></td>'
            f'<td class="num"><strong>{per_gram(row["_price"])}</strong>{f"<small>{esc(pack_label(row))}</small>" if pack_label(row) else ""}{CHECK_NOTE if row["_checked"] else OLD_NOTE if row["_old"] else ""}</td>'
            f'<td class="num">{esc(fmt_date(row["_date"]))}</td></tr>'
        )
    type_chip = f'<span class="chip type-{esc(strain["type"])}">{esc(strain["type"])}</span>' if strain["type"] else ""
    cities_text = ", ".join(strain["cities"][:4]) + (" and more" if len(strain["cities"]) > 4 else "")
    body = f"""
    <header class="hero">
      <p class="eyebrow">Strain prices {type_chip}</p>
      <h1>{esc(strain["name"])}</h1>
      <p class="lead">Listed by {plural(shop_count, "coffeeshop")} in {plural(len(strain["cities"]), "city", "cities")}. Typical price {per_gram(strain["median"])}, from {per_gram(strain["low"])}.</p>
      <div class="stats">
        {stat("Typical price", per_gram(strain["median"]), "Median listing")}
        {stat("Lowest", per_gram(strain["low"]))}
        {stat("Highest", per_gram(strain["high"]))}
        {stat("Coffeeshops", f"{shop_count:,}")}
      </div>
      <div class="actions">
        <a class="button primary" href="{esc(live_url("database.html", explore="1", detail="strain", strain=strain["name"]))}">Compare with filters</a>
        <a class="button" href="{esc(live_url("map.html", search=strain["name"], source="static"))}">Show on map</a>
      </div>
    </header>
    <section>
      <h2>{esc(strain["name"])} prices by city</h2>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">City</th><th scope="col" class="num">Shops</th><th scope="col" class="num">Typical</th><th scope="col" class="num">Lowest</th></tr></thead>
        <tbody>{"".join(city_rows)}</tbody>
      </table></div>
    </section>
    <section>
      <h2>Where to buy {esc(strain["name"])}</h2>
      <p class="muted">Cheapest first. Menu date is when Budfinder last recorded a change to that menu.</p>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Coffeeshop</th><th scope="col">City</th><th scope="col" class="num">Price</th><th scope="col" class="num">Menu date</th></tr></thead>
        <tbody>{"".join(listing_rows)}</tbody>
      </table></div>
    </section>"""
    return page(
        path=strain["path"],
        title=f"{strain['name']} price in the Netherlands – {shop_count} coffeeshops | Budfinder",
        description=(f"{strain['name']} is on the menu at {shop_count} Dutch coffeeshops in {cities_text}. "
                     f"Typical price {per_gram(strain['median'])}, from {per_gram(strain['low'])}. Updated {fmt_long_date(ds.exported)}."),
        crumbs=[("Home", "/"), ("Strains", "/strains/"), (strain["name"], strain["path"])],
        body=body, dataset=ds,
    )


def shop_page(ds: Dataset, shop: Dict[str, Any]) -> str:
    city = ds.cities[shop["city_slug"]]
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in shop["rows"]:
        groups[str(row.get("base_type") or "other").lower()].append(row)
    ordered = sorted(groups.items(), key=lambda item: (TYPE_ORDER.index(item[0]) if item[0] in TYPE_ORDER else 9, item[0]))
    sections = []
    for kind, rows in ordered:
        rows.sort(key=lambda r: str(r.get("strain_name") or "").lower())
        trs = []
        for row in rows:
            notes = " · ".join(filter(None, [
                "Cali" if int(row.get("is_cali") or 0) == 1 else "",
                "Legal project" if int(row.get("is_legal") or 0) == 1 else "",
                f"Grower: {row['grower']}" if row.get("grower") else "",
            ]))
            strain = ds.strains.get(row["_strain_key"]) or {}
            compare = ""
            if row["_checked"]:
                compare = CHECK_NOTE
            elif strain.get("median") and row["_cmp"] is not None and len(strain.get("shop_ids", ())) >= 2:
                diff = (row["_cmp"] - strain["median"]) / strain["median"]
                if diff <= -0.1:
                    compare = '<small class="good">Below typical</small>'
                elif diff >= 0.1:
                    compare = '<small class="warn">Above typical</small>'
            trs.append(
                f'<tr><td>{ds.strain_link(row["_strain_key"], display_strain(row.get("strain_name")))}{f"<small>{esc(notes)}</small>" if notes else ""}</td>'
                f'<td class="num"><strong>{per_gram(row["_price"])}</strong>{f"<small>{esc(pack_label(row))}</small>" if pack_label(row) else ""}{compare}</td></tr>'
            )
        label = kind.capitalize()
        sections.append(f"""
    <section>
      <h2>{esc(label)} <span class="count">{len(rows)}</span></h2>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Strain</th><th scope="col" class="num">Price</th></tr></thead>
        <tbody>{"".join(trs)}</tbody>
      </table></div>
    </section>""")
    source = (f'<a class="button" href="{esc(shop["source_url"])}" rel="nofollow noopener" target="_blank">Menu source</a>'
              if shop["source_url"] else "")
    address = f'<p class="muted">{esc(shop["address"])}</p>' if shop["address"] else ""
    date_words = "Menu dated" if shop["dated"] else "Menu last changed"
    old_notice = (f'<p class="notice">This menu is from {esc(fmt_long_date(shop["latest"]))}. It is over a year old, '
                  "so its prices are left out of typical and lowest prices on Budfinder.</p>"
                  if shop["old_menu"] else "")
    body = f"""
    <header class="hero hero-shop">
      <div class="identity">{logo_html(shop, 64)}<div>
        <p class="eyebrow">Coffeeshop in <a href="{city["path"]}">{esc(shop["city"])}</a></p>
        <h1>{esc(shop["name"])}</h1>
      </div></div>
      {address}
      <p class="lead">{plural(shop["strain_count"], "strain")} on the menu, from {per_gram(shop["own_low"])}. {date_words} {esc(fmt_long_date(shop["latest"]))}.</p>
      {old_notice}
      <div class="stats">
        {stat("Typical price", per_gram(shop["own_median"]), "Median listing")}
        {stat("Cheapest", per_gram(shop["own_low"]))}
        {stat("Menu items", f"{len(shop['rows']):,}")}
        {stat("City typical", per_gram(city["median"]), city["name"])}
      </div>
      <div class="actions">
        <a class="button primary" href="{esc(live_url("map.html", shops=shop["id"], city=shop["city"], source="static"))}">Open on map</a>
        <a class="button" href="{esc(live_url("database.html", explore="1", detail="shop", shop_id=shop["id"]))}">Full menu tools</a>
        {source}
      </div>
    </header>{hours_section(ds, shop)}{"".join(sections)}"""
    extra = None
    if shop.get("lat") and shop.get("lng"):
        extra = {
            "@context": "https://schema.org",
            "@type": "Place",
            "name": shop["name"],
            "address": {"@type": "PostalAddress", "addressLocality": shop["city"], "addressCountry": "NL",
                        **({"streetAddress": shop["address"]} if shop["address"] else {})},
            "geo": {"@type": "GeoCoordinates", "latitude": shop["lat"], "longitude": shop["lng"]},
        }
    return page(
        path=shop["path"],
        title=f"{shop['name']}, {shop['city']} – menu and prices | Budfinder",
        description=(f"{shop['name']} coffeeshop in {shop['city']}: {plural(shop['strain_count'], 'strain')} on the menu, "
                     f"from {per_gram(shop['own_low'])}, typical {per_gram(shop['own_median'])}. {date_words} {fmt_long_date(shop['latest'])}."),
        crumbs=[("Home", "/"), ("Coffeeshops", "/coffeeshops/"), (shop["city"], city["path"]), (shop["name"], shop["path"])],
        body=body, dataset=ds, extra_ld=extra,
    )


def hours_section(ds: Dataset, shop: Dict[str, Any]) -> str:
    """Opening hours from the one-off coffeeshopdirect.com fetch, if we have them."""
    entry = (ds.hours.get("shops") or {}).get(str(shop["id"])) or {}
    days = [day for day in entry.get("days") or [] if day.get("day") and day.get("hours")]
    if not days and not entry.get("summary"):
        return ""
    checked = fmt_long_date(parse_time(entry.get("checked_at_utc") or ds.hours.get("fetched_at_utc")))
    if days:
        table = "".join(f'<tr><th scope="row">{esc(day["day"])}</th><td>{esc(day["hours"])}</td></tr>' for day in days)
        content = f'<div class="table-wrap hours"><table><tbody>{table}</tbody></table></div>'
    else:
        content = f'<p>{esc(entry["summary"])}</p>'
    source = esc(entry.get("info_url") or "https://www.coffeeshopdirect.com/")
    return f"""
    <section>
      <h2>Opening hours</h2>
      {content}
      <p class="muted">From <a href="{source}" rel="nofollow noopener" target="_blank">coffeeshopdirect.com</a>, checked {esc(checked)}. Hours change, so check before you go.</p>
    </section>"""


def city_page(ds: Dataset, city: Dict[str, Any]) -> str:
    shop_rows = []
    for shop in city["shops"]:
        shop_rows.append(
            f'<tr><td><span class="shop-cell">{logo_html(shop, 32)}<a href="{shop["path"]}">{esc(shop["name"])}</a></span></td>'
            f'<td class="num">{shop["strain_count"]}</td><td class="num">{per_gram(shop["median"])}</td>'
            f'<td class="num">{per_gram(shop["low"])}</td><td class="num">{esc(fmt_date(shop["latest"]))}{OLD_NOTE if shop["old_menu"] else ""}</td></tr>'
        )
    top = []
    for key, shop_ids in city["top_strains"]:
        prices = [r["_cmp"] for r in ds.strains[key]["rows"]
                  if r["_cmp"] is not None and ds.shops[str(r["shop_id"])]["city_slug"] == city["slug"]]
        top.append(f'<li>{ds.strain_link(key)} <span>{plural(len(shop_ids), "shop")} · typical {per_gram(median(prices))}</span></li>')
    body = f"""
    <header class="hero">
      <p class="eyebrow">Coffeeshop menus</p>
      <h1>Coffeeshops in {esc(city["name"])}</h1>
      <p class="lead">{plural(len(city["shops"]), "coffeeshop")} with published menus, {city["listing_count"]:,} listings and {city["strain_count"]:,} different strains. Typical price {per_gram(city["median"])}.</p>
      <div class="stats">
        {stat("Coffeeshops", f"{len(city['shops']):,}", "With menus")}
        {stat("Typical price", per_gram(city["median"]), "Median listing")}
        {stat("Cheapest listing", per_gram(city["low"]))}
        {stat("Strains", f"{city['strain_count']:,}")}
      </div>
      <div class="actions">
        <a class="button primary" href="{esc(live_url("map.html", city=city["name"], source="static"))}">Open the {esc(city["name"])} map</a>
        <a class="button" href="{esc(live_url("database.html", explore="1", filter_city=city["name"], browser="shops"))}">Browse menus</a>
      </div>
    </header>
    <section>
      <h2>Most listed strains in {esc(city["name"])}</h2>
      <ol class="pill-list">{"".join(top)}</ol>
    </section>
    <section>
      <h2>All {esc(city["name"])} coffeeshops with menus</h2>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Coffeeshop</th><th scope="col" class="num">Strains</th><th scope="col" class="num">Typical</th><th scope="col" class="num">Cheapest</th><th scope="col" class="num">Menu date</th></tr></thead>
        <tbody>{"".join(shop_rows)}</tbody>
      </table></div>
    </section>"""
    return page(
        path=city["path"],
        title=f"Coffeeshops in {city['name']} – menus and prices | Budfinder",
        description=(f"Compare {len(city['shops'])} coffeeshops in {city['name']}: {city['strain_count']:,} strains, "
                     f"typical price {per_gram(city['median'])}. Menus and prices updated {fmt_long_date(ds.exported)}."),
        crumbs=[("Home", "/"), ("Coffeeshops", "/coffeeshops/"), (city["name"], city["path"])],
        body=body, dataset=ds,
    )


def cities_index(ds: Dataset) -> str:
    cards = []
    for city in sorted(ds.cities.values(), key=lambda c: (-len(c["shops"]), c["name"].lower())):
        cards.append(
            f'<li><a href="{city["path"]}"><strong>{esc(city["name"])}</strong>'
            f'<span>{plural(len(city["shops"]), "shop")} · typical {per_gram(city["median"])}</span></a></li>'
        )
    body = f"""
    <header class="hero">
      <p class="eyebrow">Coffeeshop menus</p>
      <h1>Coffeeshops in the Netherlands</h1>
      <p class="lead">Menus and prices for {plural(len(ds.shops), "coffeeshop")} in {plural(len(ds.cities), "city", "cities")}.</p>
    </header>
    <section><ul class="card-list">{"".join(cards)}</ul></section>"""
    return page(
        path="/coffeeshops/",
        title="Coffeeshops in the Netherlands by city – menus and prices | Budfinder",
        description=f"Browse menus and prices for {len(ds.shops)} Dutch coffeeshops in {len(ds.cities)} cities, including Amsterdam, Rotterdam and Den Haag.",
        crumbs=[("Home", "/"), ("Coffeeshops", "/coffeeshops/")],
        body=body, dataset=ds,
    )


def strains_index(ds: Dataset) -> str:
    published = sorted((s for s in ds.strains.values() if s["published"]), key=lambda s: s["name"].lower())
    letters: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for strain in published:
        first = strain["name"][:1].upper()
        letters[first if first.isalpha() else "#"].append(strain)
    order = sorted(letters, key=lambda k: (k != "#", k))
    jump = " ".join(f'<a href="#letter-{esc(k if k != "#" else "num")}">{esc(k)}</a>' for k in order)
    groups = []
    for letter in order:
        items = "".join(
            f'<li><a href="{s["path"]}">{esc(s["name"])}</a> <span>{len(s["shop_ids"])} shops · {per_gram(s["median"])}</span></li>'
            for s in letters[letter]
        )
        groups.append(f'<section id="letter-{esc(letter if letter != "#" else "num")}"><h2>{esc(letter)}</h2><ul class="az-list">{items}</ul></section>')
    popular = sorted(published, key=lambda s: (-len(s["shop_ids"]), s["name"].lower()))[:10]
    popular_html = "".join(
        f'<li><a href="{s["path"]}">{esc(s["name"])}</a> <span>{len(s["shop_ids"])} shops · typical {per_gram(s["median"])}</span></li>'
        for s in popular
    )
    body = f"""
    <header class="hero">
      <p class="eyebrow">Strain prices</p>
      <h1>Cannabis strains in Dutch coffeeshops</h1>
      <p class="lead">Prices for {plural(len(published), "strain")} listed by at least {MIN_STRAIN_SHOPS} coffeeshops.</p>
      <nav class="jump" aria-label="Jump to letter">{jump}</nav>
    </header>
    <section><h2>Most widely listed</h2><ol class="pill-list">{popular_html}</ol></section>
    {"".join(groups)}"""
    return page(
        path="/strains/",
        title="Strain prices in Dutch coffeeshops, A–Z | Budfinder",
        description=f"Compare prices for {len(published)} strains across Dutch coffeeshop menus, from Amnesia Haze to White Widow.",
        crumbs=[("Home", "/"), ("Strains", "/strains/")],
        body=body, dataset=ds,
    )


# ---------------------------------------------------------------- output

class Output:
    """Update the generated pages in place.

    Unchanged pages are left untouched (so they keep their dates and need no
    upload), changed ones are overwritten, and only pages that are no longer
    produced are removed. The folders themselves are never deleted and made
    again: doing that made iCloud Drive leave empty "name 2" copies behind.
    Any other leftover empty folder inside the generated folders is removed too.
    """

    def __init__(self, root: Path):
        self.root = root
        self.expected: set = set()
        self.written = 0
        self.unchanged = 0
        for name in GENERATED_DIRS:
            target = root / name
            if target.exists() and any(target.iterdir()) and not (target / MARKER_FILE).exists():
                raise SystemExit(f"{target} exists but was not created by this script; refusing to replace it.")
            target.mkdir(parents=True, exist_ok=True)
            self.write(target / MARKER_FILE, "Generated by build_static_pages.py; safe to delete.\n")

    def write(self, path: Path, content: str) -> None:
        self.expected.add(path)
        data = content.encode("utf-8")
        if path.is_file() and path.read_bytes() == data:
            self.unchanged += 1
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.written += 1

    def remove_stale(self) -> int:
        """Delete files this run did not write, then any empty folders, deepest first."""
        removed = 0
        for name in GENERATED_DIRS:
            for path in sorted((self.root / name).rglob("*"), key=lambda p: len(p.parts), reverse=True):
                try:
                    if path.is_dir() and not path.is_symlink():
                        if not any(path.iterdir()):
                            path.rmdir()
                    elif path not in self.expected:
                        path.unlink()
                        removed += 1
                except OSError:
                    continue  # a sync tool may be busy with it; the next run tidies it up
        return removed


def sitemap(ds: Dataset, out: Output) -> int:
    lastmod = ds.exported.strftime("%Y-%m-%d")
    urls = [("/", "daily"), ("/map.html", "weekly"), ("/database.html", "daily"),
            ("/coffeeshops/", "weekly"), ("/strains/", "weekly")]
    urls += [(c["path"], "weekly") for c in sorted(ds.cities.values(), key=lambda c: c["path"])]
    urls += [(s["path"], "weekly") for s in sorted(ds.shops.values(), key=lambda s: s["path"])]
    urls += [(s["path"], "weekly") for s in sorted(ds.strains.values(), key=lambda s: s.get("path", "")) if s["published"]]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    lines += [f"  <url><loc>{SITE}{esc(path)}</loc><lastmod>{lastmod}</lastmod><changefreq>{freq}</changefreq></url>"
              for path, freq in urls]
    lines.append("</urlset>")
    out.write(out.root / "sitemap.xml", "\n".join(lines) + "\n")
    return len(urls)


def build(root: Path) -> Dict[str, int]:
    ds = Dataset(root)
    out = Output(root)
    out.write(root / "coffeeshops" / "index.html", cities_index(ds))
    for city in ds.cities.values():
        out.write(root / city["path"].strip("/") / "index.html", city_page(ds, city))
    for shop in ds.shops.values():
        out.write(root / shop["path"].strip("/") / "index.html", shop_page(ds, shop))
    out.write(root / "strains" / "index.html", strains_index(ds))
    published = [s for s in ds.strains.values() if s["published"]]
    for strain in published:
        out.write(root / strain["path"].strip("/") / "index.html", strain_page(ds, strain))
    urls = sitemap(ds, out)
    removed = out.remove_stale()
    return {"cities": len(ds.cities), "shops": len(ds.shops), "strains": len(published), "sitemap_urls": urls,
            "files_written": out.written, "files_unchanged": out.unchanged, "files_removed": removed}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent), help="website root (default: this folder)")
    args = parser.parse_args()
    counts = build(Path(args.root))
    print("Static pages written: " + ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())

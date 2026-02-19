#!/usr/bin/env python3
"""
scrape_update_menus.py

Purpose
-------
Checks coffeeshopmenus.org shop pages (from your csd.csv) and keeps ONE most-recent
menu image per shop in a local folder + SQLite DB.

How "new menus" are detected
----------------------------
We download the menu image and compute sha256. If sha256 differs from the sha256
already stored for that shop in the DB, we consider it a NEW menu.

What happens when a menu changes
--------------------------------
- The menu record for that shop is updated (image_url/local_path/sha256/bytes/fetched_at).
- Its status is set to 'new' (so the data-entry app queues it up).
- Any existing "current menu entries" for that shop are cleared so you start fresh.

Inputs
------
- csd.csv with at least: shop, city, shop_url
  (Your file likely contains more columns - that's fine.)
- DB path (SQLite)
- output folder for images

Run
---
  pip install requests beautifulsoup4
  python scrape_update_menus.py --shops /path/to/csd.csv --db coffeeshops.sqlite --out-dir menus_downloaded
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


# -----------------------------
# Configuration
# -----------------------------

HTTP_TIMEOUT = 30
SLEEP_BETWEEN_SHOPS_SEC = 0.3  # polite delay; increase if you get blocked
USER_AGENT = "Mozilla/5.0 (compatible; CoffeeShopMenuTracker/1.0)"
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
# Only allow images from coffeeshopmenus.org and coffeeshopmenus.info style domains (adjust if needed)
ALLOWED_DOMAINS = {"www.coffeeshopmenus.org", "coffeeshopmenus.org"}

# Prefer menu images that live in /Menus/ (common on coffeeshopmenus)
MENU_PATH_HINT = "/Menus/"


# -----------------------------
# Data models
# -----------------------------

@dataclass
class ShopRow:
    """Represents one shop row from csd.csv"""
    shop: str
    city: str
    shop_url: str


# -----------------------------
# DB helpers (schema is shared with the Flask app)
# -----------------------------

def db_connect(db_path: str) -> sqlite3.Connection:
    """Connect to SQLite with foreign keys enabled."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def db_init(conn: sqlite3.Connection) -> None:
    """Create required tables (from scratch design)."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            shop_url TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(name, city)
        );

        -- ONE most recent menu per shop: unique(shop_id)
        CREATE TABLE IF NOT EXISTS menus (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL UNIQUE,
            fetched_at_utc TEXT NOT NULL,
            source_page_url TEXT NOT NULL,
            image_url TEXT NOT NULL,
            local_path TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            bytes INTEGER NOT NULL,
            status TEXT NOT NULL,   -- 'new' | 'processed' | 'error'
            error TEXT DEFAULT '',
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE
        );

        -- Global strain dictionary
        CREATE TABLE IF NOT EXISTS strains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_normalised TEXT NOT NULL UNIQUE,
            name_display TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        -- Current menu entries for the *current* menu (per shop)
        -- This is what you type while processing a menu.
        CREATE TABLE IF NOT EXISTS menu_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            strain_id INTEGER NOT NULL,

            base_type TEXT NOT NULL,        -- sativa/indica/hybrid/hash
            is_cali INTEGER NOT NULL DEFAULT 0,

            price_currency TEXT NOT NULL,   -- €, £, $
            price_amount REAL NOT NULL,
            price_unit TEXT NOT NULL,       -- 'g'

            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,

            UNIQUE(shop_id, strain_id),
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE,
            FOREIGN KEY(strain_id) REFERENCES strains(id) ON DELETE CASCADE
        );

        -- Offerings are the "catalogue memory": remembers strains even when discontinued.
        CREATE TABLE IF NOT EXISTS shop_offerings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            strain_id INTEGER NOT NULL,

            base_type TEXT NOT NULL,
            is_cali INTEGER NOT NULL DEFAULT 0,

            price_currency TEXT NOT NULL,
            price_amount REAL NOT NULL,
            price_unit TEXT NOT NULL,

            notes TEXT DEFAULT '',

            status TEXT NOT NULL,                   -- 'active' | 'discontinued'
            discontinued_reason TEXT DEFAULT '',
            discontinued_since_utc TEXT DEFAULT '',
            discontinued_until_utc TEXT DEFAULT '',  -- optional future date/time

            last_seen_at_utc TEXT NOT NULL,
            manual_status_lock INTEGER NOT NULL DEFAULT 0,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,

            UNIQUE(shop_id, strain_id),
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE,
            FOREIGN KEY(strain_id) REFERENCES strains(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_menus_status ON menus(status);
        CREATE INDEX IF NOT EXISTS idx_menu_entries_shop ON menu_entries(shop_id);
        CREATE INDEX IF NOT EXISTS idx_offerings_shop ON shop_offerings(shop_id);
        CREATE INDEX IF NOT EXISTS idx_offerings_status ON shop_offerings(status);
        """
    )
    conn.commit()


def utc_now_iso() -> str:
    """UTC timestamp in ISO-8601."""
    return datetime.now(timezone.utc).isoformat()


def upsert_shop(conn: sqlite3.Connection, name: str, city: str, shop_url: str) -> int:
    """Create shop if missing, return shop_id."""
    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO shops(name, city, shop_url, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(name, city) DO UPDATE SET
            shop_url = excluded.shop_url,
            updated_at = excluded.updated_at;
        """,
        (name.strip(), city.strip(), shop_url.strip(), now, now),
    )
    row = conn.execute(
        "SELECT id FROM shops WHERE name = ? AND city = ?;",
        (name.strip(), city.strip()),
    ).fetchone()
    assert row is not None
    conn.commit()
    return int(row["id"])


def get_existing_menu_sha(conn: sqlite3.Connection, shop_id: int) -> Optional[str]:
    """Return stored sha256 for current menu (if any)."""
    row = conn.execute("SELECT sha256 FROM menus WHERE shop_id = ?;", (shop_id,)).fetchone()
    return str(row["sha256"]) if row else None


def clear_menu_entries(conn: sqlite3.Connection, shop_id: int) -> None:
    """When a new menu arrives, wipe any previous current entries for that shop."""
    conn.execute("DELETE FROM menu_entries WHERE shop_id = ?;", (shop_id,))
    conn.commit()


def upsert_menu(
    conn: sqlite3.Connection,
    shop_id: int,
    source_page_url: str,
    image_url: str,
    local_path: str,
    sha256: str,
    num_bytes: int,
    status: str,
    error: str = "",
) -> None:
    """Upsert the ONE current menu row per shop."""
    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO menus(
            shop_id, fetched_at_utc, source_page_url, image_url, local_path, sha256, bytes, status, error
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_id) DO UPDATE SET
            fetched_at_utc = excluded.fetched_at_utc,
            source_page_url = excluded.source_page_url,
            image_url = excluded.image_url,
            local_path = excluded.local_path,
            sha256 = excluded.sha256,
            bytes = excluded.bytes,
            status = excluded.status,
            error = excluded.error;
        """,
        (shop_id, now, source_page_url, image_url, local_path, sha256, num_bytes, status, error),
    )
    conn.commit()


# -----------------------------
# CSV reading
# -----------------------------

def read_shops_csv(path: str) -> List[ShopRow]:
    """
    Reads csd.csv.

    Supported headers:
      - shop name: either `shop` OR `name`
      - city: `city`
      - shop page url: `shop_url`

    Extra columns (e.g. `address`) are ignored.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    out: List[ShopRow] = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = [h.strip().lower() for h in (reader.fieldnames or [])]
        header_set = set(headers)

        # Accept either `shop` or `name` for the shop name column
        has_shop_name = ("shop" in header_set) or ("name" in header_set)
        needed = {"city", "shop_url"}

        if (not has_shop_name) or (not needed.issubset(header_set)):
            raise ValueError(
                "csd.csv must contain headers: city, shop_url, and either shop or name. "
                f"Found: {headers}"
            )

        for r in reader:
            # Support either column name for shop name
            shop = (r.get("shop") or r.get("name") or "").strip()
            city = (r.get("city") or "").strip()
            shop_url = (r.get("shop_url") or "").strip()

            if not shop_url or not shop:
                continue

            out.append(ShopRow(shop=shop, city=city or "Unknown", shop_url=shop_url))

    return out

# -----------------------------
# Scraping / downloading helpers
# -----------------------------

def restrict_domain_ok(url: str) -> bool:
    """Allow only known domains to avoid pulling random tracking images."""
    host = urlparse(url).netloc.lower()
    return host in ALLOWED_DOMAINS


def is_allowed_image_url(url: str) -> bool:
    """True if url ends with an allowed image extension."""
    path = urlparse(url).path.lower()
    _, ext = os.path.splitext(path)
    return ext in ALLOWED_IMAGE_EXTS


def download_text(session: requests.Session, url: str) -> str:
    """Download HTML."""
    r = session.get(url, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    return r.text


def download_image_bytes(session: requests.Session, url: str) -> bytes:
    """
    Download bytes of an image URL with a safety Content-Type check.
    If the server returns HTML (e.g. blocked page), we raise ValueError.
    """
    r = session.get(url, timeout=HTTP_TIMEOUT)
    r.raise_for_status()
    ctype = (r.headers.get("Content-Type") or "").lower().strip()
    if ctype and not ctype.startswith("image/"):
        raise ValueError(f"Non-image response (Content-Type={ctype}) for {url}")
    return r.content


def sha256_bytes(data: bytes) -> str:
    """Compute sha256 hex digest."""
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def slugify(text: str) -> str:
    """Simple filename-safe slug."""
    t = text.lower().strip()
    t = re.sub(r"[^a-z0-9]+", "_", t)
    t = re.sub(r"_+", "_", t).strip("_")
    return t or "unknown"


def extract_menu_image_urls(page_url: str, html: str) -> List[str]:
    """
    Extract candidate menu image URLs from coffeeshopmenus shop page HTML.

    Strategy:
    - Prefer <a href="...jpg"> links
    - Also consider <img src> *only* if path contains /Menus/
    - De-duplicate, preserve order
    - Sort so /Menus/ URLs come first
    """
    soup = BeautifulSoup(html, "html.parser")
    candidates: List[str] = []

    # Prefer anchors that link to an image file
    for a in soup.find_all("a"):
        href = a.get("href")
        if not href:
            continue
        abs_url = urljoin(page_url, href)
        if not restrict_domain_ok(abs_url):
            continue
        if not is_allowed_image_url(abs_url):
            continue
        candidates.append(abs_url)

    # Add img tags that look like actual menus (avoid logos/buttons)
    for img in soup.find_all("img"):
        src = img.get("src")
        if not src:
            continue
        abs_url = urljoin(page_url, src)
        if not restrict_domain_ok(abs_url):
            continue
        if not is_allowed_image_url(abs_url):
            continue
        path = urlparse(abs_url).path
        if MENU_PATH_HINT.lower() not in path.lower():
            continue
        candidates.append(abs_url)

    # Dedup
    seen = set()
    deduped: List[str] = []
    for u in candidates:
        if u not in seen:
            seen.add(u)
            deduped.append(u)

    # Prefer /Menus/ first
    deduped.sort(key=lambda u: (MENU_PATH_HINT.lower() not in urlparse(u).path.lower(),))
    return deduped


def choose_latest_menu_url(urls: List[str]) -> Optional[str]:
    """
    With coffeeshopmenus pages, the first /Menus/ image is typically the best guess.
    If multiple exist, we take the first.
    """
    return urls[0] if urls else None


def save_image(out_dir: str, city: str, shop: str, sha: str, image_url: str, data: bytes) -> str:
    """
    Save the menu image bytes with a logical filename.
    Returns local path.
    """
    os.makedirs(out_dir, exist_ok=True)
    path = urlparse(image_url).path
    base = os.path.basename(path) or "menu.jpg"
    city_slug = slugify(city)
    shop_slug = slugify(shop)
    sha8 = sha[:8]
    filename = f"{city_slug}__{shop_slug}__{sha8}__{base}"
    local_path = os.path.join(out_dir, filename)
    with open(local_path, "wb") as f:
        f.write(data)
    return local_path


# -----------------------------
# Main routine
# -----------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Update most recent menu image per shop.")
    ap.add_argument("--shops", required=True, help="Path to csd.csv containing shops.")
    ap.add_argument("--db", required=True, help="SQLite DB path (shared with app).")
    ap.add_argument("--out-dir", default="menus_downloaded", help="Folder to store downloaded images.")
    args = ap.parse_args()

    shops = read_shops_csv(args.shops)
    print(f"[INFO] Loaded {len(shops)} shops from {args.shops}")

    conn = db_connect(args.db)
    db_init(conn)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    new_count = 0
    unchanged = 0
    errors = 0

    for i, s in enumerate(shops, start=1):
        print(f"[{i}/{len(shops)}] {s.city} - {s.shop}")

        # Normalise shop_url to absolute
        shop_url = s.shop_url
        if shop_url.startswith("/"):
            shop_url = urljoin("https://www.coffeeshopmenus.org/", shop_url)

        shop_id = upsert_shop(conn, s.shop, s.city, shop_url)

        try:
            html = download_text(session, shop_url)
            urls = extract_menu_image_urls(shop_url, html)
            menu_url = choose_latest_menu_url(urls)
            if not menu_url:
                upsert_menu(
                    conn,
                    shop_id=shop_id,
                    source_page_url=shop_url,
                    image_url="",
                    local_path="",
                    sha256="",
                    num_bytes=0,
                    status="error",
                    error="No menu image URL found on page.",
                )
                errors += 1
                print("  [WARN] No menu image URL found.")
                time.sleep(SLEEP_BETWEEN_SHOPS_SEC)
                continue

            data = download_image_bytes(session, menu_url)
            sha = sha256_bytes(data)
            prev_sha = get_existing_menu_sha(conn, shop_id)

            if prev_sha == sha:
                # Menu unchanged; keep status as-is (do not re-trigger)
                unchanged += 1
                # Still update fetched_at and paths if you want; we keep it stable here
                print("  [OK] Unchanged.")
                time.sleep(SLEEP_BETWEEN_SHOPS_SEC)
                continue

            # New menu discovered
            local_path = save_image(args.out_dir, s.city, s.shop, sha, menu_url, data)

            # Update DB menu record and mark NEW
            upsert_menu(
                conn,
                shop_id=shop_id,
                source_page_url=shop_url,
                image_url=menu_url,
                local_path=local_path,
                sha256=sha,
                num_bytes=len(data),
                status="new",
                error="",
            )

            # Clear previous menu entries so you start fresh for this shop
            clear_menu_entries(conn, shop_id)

            new_count += 1
            print(f"  [NEW] {menu_url}")
            print(f"       saved -> {local_path}")

        except Exception as e:
            errors += 1
            upsert_menu(
                conn,
                shop_id=shop_id,
                source_page_url=shop_url,
                image_url="",
                local_path="",
                sha256="",
                num_bytes=0,
                status="error",
                error=str(e),
            )
            print(f"  [ERROR] {e}")

        time.sleep(SLEEP_BETWEEN_SHOPS_SEC)

    conn.close()

    print("\n[SUMMARY]")
    print(f"  New menus:      {new_count}")
    print(f"  Unchanged:      {unchanged}")
    print(f"  Errors:         {errors}")
    print(f"  DB:             {os.path.abspath(args.db)}")
    print(f"  Images folder:  {os.path.abspath(args.out_dir)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
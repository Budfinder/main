#!/usr/bin/env python3
"""
coffeeshop_menu_app.py

A keyboard-friendly Flask app for building and maintaining a coffeeshop strain database
from menu images.

You run a separate scraper that:
- discovers shops
- downloads the latest menu image per shop
- updates the shared SQLite database tables `shops` and `menus`
You can also trigger this scraper from the in-app main menu (Check for new menus).

This app then lets you:
- View the menu image for a shop
- Rapidly enter strains on the current menu into `menu_entries`
- Edit / delete current menu entries
- Browse the current database via a read-only browser page

IMPORTANT BEHAVIOUR (fix for “can't rename incorrect strain”)
-------------------------------------------------------------
When you edit the strain name for an entry, this app now performs a *true rename* of the
existing `strains` record (or a merge into an existing strain), rather than creating a
new strain and leaving the old incorrect one behind.

That means: if you correct “Tropicana Chery” → “Tropicana Cherry”, the incorrect strain
disappears everywhere once merged/renamed.

- Finish a menu to reconcile the long-term `shop_offerings` catalogue
  (set active, auto-discontinue missing, and mark menu processed)
- Manually discontinue/resume offerings with an optional “until” text, and
  optionally lock the status to prevent auto-changes

Run
---
  pip install flask
  python coffeeshop_menu_app.py --db coffeeshops.sqlite
  open http://127.0.0.1:5000

Hotkeys
-------
While NOT typing in a field:
- 1 / 2 / 3 / 4 : set type (sativa / indica / hybrid / hash)
- 5             : toggle Cali
- Enter         : save current entry (submits the form)
- N / P         : next / previous *new* menu in the queue
- /             : focus strain input

Notes
-----
- Price is stored as (currency, amount, unit). Unit is fixed to 'g'.
- This file is intentionally self-contained: HTML templates are embedded.

Version
-------
v5-full-ui-edit-by-id+true-rename-or-merge-strains
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse

from flask import Flask, Response, jsonify, redirect, render_template_string, request, send_file, url_for

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

VALID_BASE_TYPES = ["sativa", "indica", "hybrid", "hash"]

DEFAULT_CURRENCY = "€"
DEFAULT_UNIT = "g"  # Unit fixed to grams
SUPPORTED_CURRENCIES = ["€", "£", "$"]
DEFAULT_SHOPS_CSV = "csd.csv"
DEFAULT_MENUS_DIR = "menus_downloaded"
DEFAULT_SCRAPER_SCRIPT = "scrape_update_menus.py"


# -----------------------------------------------------------------------------
# Time helpers
# -----------------------------------------------------------------------------

def utc_now_iso() -> str:
    """Return current UTC time as an ISO8601 string."""
    return datetime.now(timezone.utc).isoformat()


# -----------------------------------------------------------------------------
# Scraper helpers
# -----------------------------------------------------------------------------

def parse_scrape_summary(text: str) -> Dict[str, int]:
    """Parse summary counts from scrape_update_menus.py output."""
    summary = {"new": 0, "unchanged": 0, "errors": 0}
    for raw in (text or "").splitlines():
        line = raw.strip()
        m = re.match(r"New menus:\s*(\d+)", line)
        if m:
            summary["new"] = int(m.group(1))
            continue
        m = re.match(r"Unchanged:\s*(\d+)", line)
        if m:
            summary["unchanged"] = int(m.group(1))
            continue
        m = re.match(r"Errors:\s*(\d+)", line)
        if m:
            summary["errors"] = int(m.group(1))
    return summary


def run_scrape_update(
    scraper_path: str,
    shops_csv: str,
    db_path: str,
    out_dir: str,
    cwd: Optional[str] = None,
) -> Dict[str, object]:
    """Run scrape_update_menus.py and return a structured result."""
    start = time.monotonic()
    try:
        proc = subprocess.run(
            [sys.executable, scraper_path, "--shops", shops_csv, "--db", db_path, "--out-dir", out_dir],
            cwd=cwd,
            capture_output=True,
            text=True,
        )
    except Exception as exc:
        return {
            "ok": False,
            "returncode": None,
            "stdout": "",
            "stderr": str(exc),
            "duration_s": time.monotonic() - start,
            "summary": {"new": 0, "unchanged": 0, "errors": 0},
        }

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    return {
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "duration_s": time.monotonic() - start,
        "summary": parse_scrape_summary(stdout),
    }


# -----------------------------------------------------------------------------
# JSON export helpers (for static frontends / GitHub Pages)
# -----------------------------------------------------------------------------

def slug_token(text: str) -> str:
    """Return a lowercase URL/file-safe token."""
    t = (text or "").strip().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t)
    t = re.sub(r"-+", "-", t).strip("-")
    return t or "unknown"


def derive_shop_key(name: str, city: str, shop_url: str) -> str:
    """Derive a stable key for linking CSV rows to DB shops.

    Priority:
    1) shop_url path basename (best stable identifier for this dataset)
    2) name+city slug fallback
    """
    path = urlparse(shop_url or "").path or ""
    base = os.path.basename(path).strip().lower()
    if base.endswith(".html"):
        base = base[:-5]
    if base:
        return slug_token(base)
    return slug_token(f"{name}-{city}")


def json_dump(path: str, data: Any) -> None:
    """Write pretty JSON with UTF-8 encoding."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def export_json_snapshot(conn: sqlite3.Connection, out_dir: str) -> Dict[str, Any]:
    """Export DB snapshots as JSON files for static clients.

    Files written:
    - shops.json
    - shop_lookup.json
    - strains.json
    - active_offerings.json
    - menu_entries.json
    - strain_index.json
    - manifest.json
    """
    os.makedirs(out_dir, exist_ok=True)
    exported_at_utc = utc_now_iso()

    shop_rows = conn.execute(
        """
        SELECT s.id AS shop_id,
               s.name,
               s.city,
               s.shop_url,
               s.created_at,
               s.updated_at,
               COALESCE(m.status, '') AS menu_status,
               COALESCE(m.fetched_at_utc, '') AS fetched_at_utc,
               COALESCE(m.image_url, '') AS image_url,
               COALESCE(m.sha256, '') AS menu_sha256,
               COALESCE(m.bytes, 0) AS menu_bytes
        FROM shops s
        LEFT JOIN menus m ON m.shop_id = s.id
        ORDER BY s.city, s.name;
        """
    ).fetchall()

    shop_key_by_id: Dict[int, str] = {}
    used_keys: Dict[str, int] = {}
    shops: List[Dict[str, Any]] = []

    for r in shop_rows:
        sid = int(r["shop_id"])
        base_key = derive_shop_key(r["name"], r["city"], r["shop_url"])
        key = base_key
        n = 2
        while key in used_keys and used_keys[key] != sid:
            key = f"{base_key}-{n}"
            n += 1
        used_keys[key] = sid
        shop_key_by_id[sid] = key

        shops.append(
            {
                "shop_id": sid,
                "shop_key": key,
                "name": r["name"],
                "city": r["city"],
                "shop_url": r["shop_url"],
                "menu_status": r["menu_status"],
                "fetched_at_utc": r["fetched_at_utc"],
                "image_url": r["image_url"],
                "menu_sha256": r["menu_sha256"],
                "menu_bytes": int(r["menu_bytes"] or 0),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
        )

    strains = [
        {
            "strain_id": int(r["strain_id"]),
            "name_display": r["name_display"],
            "name_normalised": r["name_normalised"],
            "created_at": r["created_at"],
        }
        for r in conn.execute(
            """
            SELECT id AS strain_id, name_display, name_normalised, created_at
            FROM strains
            ORDER BY name_display;
            """
        ).fetchall()
    ]

    active_offerings_rows = conn.execute(
        """
        SELECT so.shop_id,
               s.name AS shop_name,
               s.city AS shop_city,
               st.id AS strain_id,
               st.name_display AS strain_name,
               st.name_normalised AS strain_name_normalised,
               so.base_type,
               so.is_cali,
               so.price_currency,
               so.price_amount,
               so.price_unit,
               so.notes,
               so.last_seen_at_utc,
               so.updated_at
        FROM shop_offerings so
        JOIN shops s ON s.id = so.shop_id
        JOIN strains st ON st.id = so.strain_id
        WHERE so.status = 'active'
        ORDER BY st.name_display, s.city, s.name;
        """
    ).fetchall()

    active_offerings: List[Dict[str, Any]] = []
    strain_index_map: Dict[str, Dict[str, Any]] = {}

    for r in active_offerings_rows:
        sid = int(r["shop_id"])
        item = {
            "shop_id": sid,
            "shop_key": shop_key_by_id.get(sid, ""),
            "shop_name": r["shop_name"],
            "shop_city": r["shop_city"],
            "strain_id": int(r["strain_id"]),
            "strain_name": r["strain_name"],
            "strain_name_normalised": r["strain_name_normalised"],
            "base_type": r["base_type"],
            "is_cali": int(r["is_cali"] or 0),
            "price_currency": r["price_currency"],
            "price_amount": float(r["price_amount"]),
            "price_unit": r["price_unit"],
            "notes": r["notes"] or "",
            "last_seen_at_utc": r["last_seen_at_utc"],
            "updated_at": r["updated_at"],
        }
        active_offerings.append(item)

        skey = item["strain_name_normalised"]
        if skey not in strain_index_map:
            strain_index_map[skey] = {
                "strain_name_normalised": skey,
                "strain_name_display": item["strain_name"],
                "shops": [],
            }
        strain_index_map[skey]["shops"].append(
            {
                "shop_id": item["shop_id"],
                "shop_key": item["shop_key"],
                "shop_name": item["shop_name"],
                "shop_city": item["shop_city"],
            }
        )

    menu_entries = [
        {
            "entry_id": int(r["entry_id"]),
            "shop_id": int(r["shop_id"]),
            "shop_key": shop_key_by_id.get(int(r["shop_id"]), ""),
            "strain_id": int(r["strain_id"]),
            "strain_name": r["strain_name"],
            "strain_name_normalised": r["strain_name_normalised"],
            "base_type": r["base_type"],
            "is_cali": int(r["is_cali"] or 0),
            "price_currency": r["price_currency"],
            "price_amount": float(r["price_amount"]),
            "price_unit": r["price_unit"],
            "notes": r["notes"] or "",
            "created_at": r["created_at"],
        }
        for r in conn.execute(
            """
            SELECT me.id AS entry_id,
                   me.shop_id,
                   me.strain_id,
                   st.name_display AS strain_name,
                   st.name_normalised AS strain_name_normalised,
                   me.base_type,
                   me.is_cali,
                   me.price_currency,
                   me.price_amount,
                   me.price_unit,
                   me.notes,
                   me.created_at
            FROM menu_entries me
            JOIN strains st ON st.id = me.strain_id
            ORDER BY me.shop_id, st.name_display;
            """
        ).fetchall()
    ]

    shop_lookup = {
        s["shop_key"]: {
            "shop_id": s["shop_id"],
            "name": s["name"],
            "city": s["city"],
            "shop_url": s["shop_url"],
        }
        for s in shops
    }

    strain_index = list(strain_index_map.values())
    strain_index.sort(key=lambda x: x["strain_name_normalised"])

    json_dump(os.path.join(out_dir, "shops.json"), shops)
    json_dump(os.path.join(out_dir, "shop_lookup.json"), shop_lookup)
    json_dump(os.path.join(out_dir, "strains.json"), strains)
    json_dump(os.path.join(out_dir, "active_offerings.json"), active_offerings)
    json_dump(os.path.join(out_dir, "menu_entries.json"), menu_entries)
    json_dump(os.path.join(out_dir, "strain_index.json"), strain_index)

    manifest = {
        "exported_at_utc": exported_at_utc,
        "counts": {
            "shops": len(shops),
            "strains": len(strains),
            "active_offerings": len(active_offerings),
            "menu_entries": len(menu_entries),
            "strain_index": len(strain_index),
        },
        "files": [
            "shops.json",
            "shop_lookup.json",
            "strains.json",
            "active_offerings.json",
            "menu_entries.json",
            "strain_index.json",
        ],
        "linking": {
            "shop_key_note": "Use shops.shop_key as the stable CSV link key.",
            "recommended_csv_column": "shop_key",
        },
    }
    json_dump(os.path.join(out_dir, "manifest.json"), manifest)
    return manifest


# -----------------------------------------------------------------------------
# DB helpers
# -----------------------------------------------------------------------------

def db_connect(db_path: str) -> sqlite3.Connection:
    """Connect to SQLite with foreign keys enabled and Row dict-like access."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def db_init(conn: sqlite3.Connection) -> None:
    """Create schema if missing.

    Since you're rebuilding the database from scratch, we create the full schema
    here (compatible with scraper + this app).
    """
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

        CREATE TABLE IF NOT EXISTS strains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name_normalised TEXT NOT NULL UNIQUE,
            name_display TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS menu_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            strain_id INTEGER NOT NULL,
            base_type TEXT NOT NULL,
            is_cali INTEGER NOT NULL DEFAULT 0,
            price_currency TEXT NOT NULL,
            price_amount REAL NOT NULL,
            price_unit TEXT NOT NULL,
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(shop_id, strain_id),
            FOREIGN KEY(shop_id) REFERENCES shops(id) ON DELETE CASCADE,
            FOREIGN KEY(strain_id) REFERENCES strains(id) ON DELETE CASCADE
        );

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
            discontinued_until_utc TEXT DEFAULT '',
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


# -----------------------------------------------------------------------------
# Normalisation and parsing
# -----------------------------------------------------------------------------

def normalise_strain_name(name: str) -> Tuple[str, str]:
    """Return (normalised, display) names.

    - Normalised: stable for uniqueness / matching.
    - Display: preserves well-known letter+digit codes (e.g. AK47, G13).
    """
    raw = (name or "").strip()
    if not raw:
        return "", ""

    # Collapse internal whitespace but otherwise preserve the user's intended capitalisation.
    # This is important for names like "Kosher OG" which should not be coerced to "Kosher Og".
    s = re.sub(r"\s+", " ", raw).strip()

    # Codes like AK47 / G13 (contains digits, short, safe chars)
    # For these, we prefer an uppercase normalised key and a display that keeps letters uppercase.
    if re.search(r"\d", s) and re.fullmatch(r"[A-Za-z0-9\- ]+", s) and len(s) <= 24:
        display = " ".join("".join(ch.upper() if ch.isalpha() else ch for ch in tok) for tok in s.split(" "))
        return display.upper(), display

    # Default behaviour:
    # - display: preserve the user's formatting (after whitespace collapse)
    # - normalised: lower-case key for stable uniqueness/matching
    display = s
    normalised = s.lower()
    return normalised, display


def parse_price_amount(text: str) -> float:
    """Parse a numeric price amount.

    Accepts: 12 / 12.5 / 12,5
    """
    t = (text or "").strip()
    if not t:
        raise ValueError("Price amount is required.")
    t = t.replace(",", ".")
    if not re.fullmatch(r"\d+(?:\.\d+)?", t):
        raise ValueError("Price amount must be a number (e.g. 12 or 12.5).")
    return float(t)


# -----------------------------------------------------------------------------
# CRUD helpers
# -----------------------------------------------------------------------------

def upsert_strain(conn: sqlite3.Connection, name: str) -> int:
    """Insert a strain if missing; return strain_id.

    NOTE:
    This is used when adding new menu entries.
    For correcting mistakes while editing, we now prefer a true rename/merge,
    implemented in `rename_or_merge_strain_id(...)`.
    """
    norm, disp = normalise_strain_name(name)
    if not norm:
        raise ValueError("Strain name cannot be blank.")

    now = utc_now_iso()
    conn.execute(
        """
        INSERT INTO strains(name_normalised, name_display, created_at)
        VALUES(?, ?, ?)
        ON CONFLICT(name_normalised) DO UPDATE SET
            name_display = excluded.name_display;
        """,
        (norm, disp, now),
    )
    row = conn.execute("SELECT id FROM strains WHERE name_normalised = ?;", (norm,)).fetchone()
    assert row is not None
    conn.commit()
    return int(row["id"])


def rename_or_merge_strain_id(
    conn: sqlite3.Connection,
    current_strain_id: int,
    new_name: str,
) -> Tuple[bool, int, str]:
    """Rename a strain in-place, or merge it into an existing strain.

    Why:
    - If OCR produced a wrong strain name, you don't want to create a second strain.
      You want to *correct* the existing strain.
    - The strains table uses UNIQUE(name_normalised). If the corrected name already exists,
      we should MERGE: repoint references and delete the old strain row.

    Returns:
      (ok, resulting_strain_id, message)
    """
    new_norm, new_disp = normalise_strain_name(new_name)
    if not new_norm:
        return False, current_strain_id, "Strain name cannot be blank."

    # Fetch current
    cur_row = conn.execute(
        "SELECT id, name_normalised, name_display FROM strains WHERE id = ?;",
        (current_strain_id,),
    ).fetchone()
    if not cur_row:
        return False, current_strain_id, "Strain not found."

    current_norm = str(cur_row["name_normalised"])
    current_disp = str(cur_row["name_display"])

    # If nothing materially changes, still allow display update (e.g. user fixes casing)
    if new_norm == current_norm and new_disp == current_disp:
        return True, current_strain_id, (
            f"No changes to strain name (submitted='{new_disp}', stored='{current_disp}')."
        )

    # Does another strain already use the target normalised name?
    existing = conn.execute(
        "SELECT id FROM strains WHERE name_normalised = ?;",
        (new_norm,),
    ).fetchone()

    # Wrap rename/merge in a transaction so we don't leave partial state
    try:
        conn.execute("BEGIN;")

        if existing and int(existing["id"]) != current_strain_id:
            # MERGE: move all references from current_strain_id -> existing_id
            target_id = int(existing["id"])

            # Resolve UNIQUE(shop_id, strain_id) collisions in menu_entries
            conn.execute(
                """
                DELETE FROM menu_entries
                WHERE strain_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM menu_entries me2
                      WHERE me2.shop_id = menu_entries.shop_id
                        AND me2.strain_id = ?
                  );
                """,
                (current_strain_id, target_id),
            )
            conn.execute(
                "UPDATE menu_entries SET strain_id = ? WHERE strain_id = ?;",
                (target_id, current_strain_id),
            )

            # Resolve UNIQUE(shop_id, strain_id) collisions in shop_offerings
            conn.execute(
                """
                DELETE FROM shop_offerings
                WHERE strain_id = ?
                  AND EXISTS (
                      SELECT 1
                      FROM shop_offerings so2
                      WHERE so2.shop_id = shop_offerings.shop_id
                        AND so2.strain_id = ?
                  );
                """,
                (current_strain_id, target_id),
            )
            conn.execute(
                "UPDATE shop_offerings SET strain_id = ? WHERE strain_id = ?;",
                (target_id, current_strain_id),
            )

            # Delete the old strain row
            conn.execute("DELETE FROM strains WHERE id = ?;", (current_strain_id,))

            # Also update the target display name to the canonical "corrected" display
            # (useful if the target exists but has a slightly different display string)
            conn.execute(
                "UPDATE strains SET name_display = ? WHERE id = ?;",
                (new_disp, target_id),
            )

            conn.execute("COMMIT;")
            return True, target_id, f"Merged into existing strain: {new_disp}"

        # RENAME in-place (no conflict)
        conn.execute(
            """
            UPDATE strains
            SET name_normalised = ?,
                name_display = ?
            WHERE id = ?;
            """,
            (new_norm, new_disp, current_strain_id),
        )
        conn.execute("COMMIT;")
        return True, current_strain_id, f"Renamed strain to: {new_disp}"

    except Exception as e:
        conn.execute("ROLLBACK;")
        return False, current_strain_id, f"Rename/merge failed: {e}"


def sync_offering_from_menu_entry(
    conn: sqlite3.Connection,
    shop_id: int,
    strain_id: int,
    base_type: str,
    is_cali: bool,
    price_currency: str,
    price_amount: float,
    notes: str,
) -> None:
    """Upsert into shop_offerings using the latest values from a menu entry."""
    now = utc_now_iso()
    is_cali_int = 1 if bool(is_cali) else 0

    conn.execute(
        """
        INSERT INTO shop_offerings(
            shop_id, strain_id,
            base_type, is_cali,
            price_currency, price_amount, price_unit,
            notes,
            status,
            discontinued_reason, discontinued_since_utc, discontinued_until_utc,
            last_seen_at_utc,
            manual_status_lock,
            created_at, updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'active', '', '', '', ?, 0, ?, ?)
        ON CONFLICT(shop_id, strain_id) DO UPDATE SET
            base_type = excluded.base_type,
            is_cali = excluded.is_cali,
            price_currency = excluded.price_currency,
            price_amount = excluded.price_amount,
            price_unit = excluded.price_unit,
            notes = excluded.notes,
            last_seen_at_utc = excluded.last_seen_at_utc,
            updated_at = excluded.updated_at,
            status = CASE
                WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.status
                ELSE 'active'
            END,
            discontinued_reason = CASE
                WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_reason
                ELSE ''
            END,
            discontinued_since_utc = CASE
                WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_since_utc
                ELSE ''
            END,
            discontinued_until_utc = CASE
                WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_until_utc
                ELSE ''
            END;
        """,
        (
            shop_id,
            strain_id,
            base_type,
            is_cali_int,
            price_currency,
            float(price_amount),
            DEFAULT_UNIT,
            (notes or "").strip(),
            now,
            now,
            now,
        ),
    )


def add_or_update_menu_entry(
    conn: sqlite3.Connection,
    shop_id: int,
    strain_name: str,
    base_type: str,
    is_cali: bool,
    price_currency: str,
    price_amount_text: str,
    notes: str,
) -> Tuple[bool, str]:
    """Upsert a row in menu_entries for this shop/strain (add flow)."""
    base_type = (base_type or "").strip().lower()
    if base_type not in VALID_BASE_TYPES:
        return False, f"Base type must be one of: {', '.join(VALID_BASE_TYPES)}"

    price_currency = (price_currency or DEFAULT_CURRENCY).strip()
    if price_currency not in SUPPORTED_CURRENCIES:
        return False, f"Currency must be one of: {', '.join(SUPPORTED_CURRENCIES)}"

    try:
        price_amount = parse_price_amount(price_amount_text)
    except ValueError as e:
        return False, str(e)

    try:
        strain_id = upsert_strain(conn, strain_name)
    except ValueError as e:
        return False, str(e)

    now = utc_now_iso()
    is_cali_int = 1 if bool(is_cali) else 0

    conn.execute(
        """
        INSERT INTO menu_entries(
            shop_id, strain_id, base_type, is_cali,
            price_currency, price_amount, price_unit,
            notes, created_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_id, strain_id) DO UPDATE SET
            base_type = excluded.base_type,
            is_cali = excluded.is_cali,
            price_currency = excluded.price_currency,
            price_amount = excluded.price_amount,
            price_unit = excluded.price_unit,
            notes = excluded.notes,
            created_at = excluded.created_at;
        """,
        (
            shop_id,
            strain_id,
            base_type,
            is_cali_int,
            price_currency,
            price_amount,
            DEFAULT_UNIT,
            (notes or "").strip(),
            now,
        ),
    )

    # Keep catalogue in sync so entries are visible immediately.
    sync_offering_from_menu_entry(
        conn,
        shop_id=shop_id,
        strain_id=strain_id,
        base_type=base_type,
        is_cali=bool(is_cali_int),
        price_currency=price_currency,
        price_amount=price_amount,
        notes=(notes or "").strip(),
    )

    conn.commit()
    return True, "Saved."


def update_menu_entry_by_id(
    conn: sqlite3.Connection,
    shop_id: int,
    entry_id: int,
    new_strain_name: str,
    base_type: str,
    is_cali: bool,
    price_currency: str,
    price_amount_text: str,
    notes: str,
) -> Tuple[bool, str]:
    """Update an existing current-menu entry by menu_entries.id.

    KEY FIX:
    - If the user edits the strain name, we now RENAME or MERGE the *existing* strain,
      rather than creating a new strain_id and leaving the wrong one behind.
    """
    base_type = (base_type or "").strip().lower()
    if base_type not in VALID_BASE_TYPES:
        return False, f"Base type must be one of: {', '.join(VALID_BASE_TYPES)}"

    price_currency = (price_currency or DEFAULT_CURRENCY).strip()
    if price_currency not in SUPPORTED_CURRENCIES:
        return False, f"Currency must be one of: {', '.join(SUPPORTED_CURRENCIES)}"

    try:
        price_amount = parse_price_amount(price_amount_text)
    except ValueError as e:
        return False, str(e)

    # Ensure entry exists and belongs to this shop
    existing = conn.execute(
        """
        SELECT me.id, me.shop_id, me.strain_id,
               st.name_normalised AS strain_norm,
               st.name_display AS strain_display
        FROM menu_entries me
        JOIN strains st ON st.id = me.strain_id
        WHERE me.id = ? AND me.shop_id = ?;
        """,
        (entry_id, shop_id),
    ).fetchone()
    if not existing:
        return False, "Entry not found."

    current_strain_id = int(existing["strain_id"])
    current_norm = str(existing["strain_norm"])

    # Decide if the strain name is changing (based on normalised form)
    new_norm, _new_disp = normalise_strain_name(new_strain_name)
    if not new_norm:
        return False, "Strain name cannot be blank."

    # If normalised differs, do a rename/merge of the *existing* strain_id
    resulting_strain_id = current_strain_id
    rename_msg = ""
    if new_norm != current_norm:
        ok, resulting_strain_id, rename_msg = rename_or_merge_strain_id(
            conn, current_strain_id=current_strain_id, new_name=new_strain_name
        )
        if not ok:
            return False, rename_msg
    else:
        # Same normalised name: still allow updating display string (fix casing)
        ok, resulting_strain_id, rename_msg = rename_or_merge_strain_id(
            conn, current_strain_id=current_strain_id, new_name=new_strain_name
        )
        if not ok:
            return False, rename_msg

    now = utc_now_iso()
    is_cali_int = 1 if bool(is_cali) else 0

    # If the rename resulted in a different strain_id (merge), we might have collided
    # with an existing entry for this shop. Resolve: keep the target one, delete this one.
    if resulting_strain_id != current_strain_id:
        clash = conn.execute(
            """
            SELECT id FROM menu_entries
            WHERE shop_id = ? AND strain_id = ? AND id != ?;
            """,
            (shop_id, resulting_strain_id, entry_id),
        ).fetchone()
        if clash:
            # Delete this entry, because the shop already has the merged strain entry.
            conn.execute("DELETE FROM menu_entries WHERE id = ? AND shop_id = ?;", (entry_id, shop_id))
            conn.commit()
            return True, f"{rename_msg}. Note: merged with existing shop entry; duplicate removed."

    # Update the menu entry row values (strain_id may have changed if merged)
    conn.execute(
        """
        UPDATE menu_entries
        SET strain_id = ?,
            base_type = ?,
            is_cali = ?,
            price_currency = ?,
            price_amount = ?,
            price_unit = ?,
            notes = ?,
            created_at = ?
        WHERE id = ? AND shop_id = ?;
        """,
        (
            resulting_strain_id,
            base_type,
            is_cali_int,
            price_currency,
            price_amount,
            DEFAULT_UNIT,
            (notes or "").strip(),
            now,
            entry_id,
            shop_id,
        ),
    )

    # Sync catalogue so changes are visible immediately.
    sync_offering_from_menu_entry(
        conn,
        shop_id=shop_id,
        strain_id=resulting_strain_id,
        base_type=base_type,
        is_cali=bool(is_cali_int),
        price_currency=price_currency,
        price_amount=price_amount,
        notes=(notes or "").strip(),
    )

    conn.commit()

    # Read back saved state
    saved = conn.execute(
        """
        SELECT me.id AS entry_id,
               st.name_display AS strain_name,
               me.base_type, me.is_cali,
               me.price_currency, me.price_amount, me.price_unit,
               me.notes
        FROM menu_entries me
        JOIN strains st ON st.id = me.strain_id
        WHERE me.id = ? AND me.shop_id = ?;
        """,
        (entry_id, shop_id),
    ).fetchone()

    if not saved:
        return False, "Save failed: could not re-load saved entry."

    prefix = (rename_msg + ". ") if rename_msg else ""
    return True, (
        f"{prefix}Updated. Now: {saved['strain_name']} · {saved['base_type']}"
        f"{' (cali)' if int(saved['is_cali']) else ''}, "
        f"{saved['price_currency']}{float(saved['price_amount']):.2f}/{saved['price_unit']}"
    )


def delete_menu_entry_by_id(conn: sqlite3.Connection, shop_id: int, entry_id: int) -> None:
    """Delete a current menu entry by id (entry_id)."""
    conn.execute("DELETE FROM menu_entries WHERE id = ? AND shop_id = ?;", (entry_id, shop_id))
    conn.commit()


def normalise_entry_ids(entry_ids: Iterable[Any]) -> List[int]:
    """Convert submitted entry IDs to a sorted unique integer list."""
    clean_ids: List[int] = []
    for raw in entry_ids:
        try:
            entry_id = int(raw)
        except (TypeError, ValueError):
            continue
        if entry_id > 0:
            clean_ids.append(entry_id)
    return sorted(set(clean_ids))


def delete_menu_entries_by_ids(
    conn: sqlite3.Connection,
    shop_id: int,
    entry_ids: Iterable[Any],
) -> int:
    """Delete multiple current menu entries for one shop; returns rows removed."""
    clean_ids = normalise_entry_ids(entry_ids)
    if not clean_ids:
        return 0

    placeholders = ", ".join(["?"] * len(clean_ids))
    cur = conn.execute(
        f"DELETE FROM menu_entries WHERE shop_id = ? AND id IN ({placeholders});",
        (shop_id, *clean_ids),
    )
    conn.commit()
    return max(int(cur.rowcount or 0), 0)


def keep_only_menu_entries_by_ids(conn: sqlite3.Connection, shop_id: int, entry_ids: Iterable[Any]) -> Dict[str, int]:
    """Keep only selected current menu entries for one shop."""
    keep_ids = normalise_entry_ids(entry_ids)
    before = count_menu_entries_for_shop(conn, shop_id)
    if before <= 0:
        return {"before": 0, "after": 0, "removed": 0}

    if not keep_ids:
        conn.execute("DELETE FROM menu_entries WHERE shop_id = ?;", (shop_id,))
    else:
        placeholders = ", ".join(["?"] * len(keep_ids))
        conn.execute(
            f"DELETE FROM menu_entries WHERE shop_id = ? AND id NOT IN ({placeholders});",
            (shop_id, *keep_ids),
        )
    conn.commit()

    after = count_menu_entries_for_shop(conn, shop_id)
    return {"before": before, "after": after, "removed": max(before - after, 0)}


def count_menu_entries_for_shop(conn: sqlite3.Connection, shop_id: int) -> int:
    """Count current menu_entries rows for one shop."""
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM menu_entries WHERE shop_id = ?;",
        (shop_id,),
    ).fetchone()
    return int(row["n"] if row else 0)


def count_active_offerings_for_shop(conn: sqlite3.Connection, shop_id: int) -> int:
    """Count active shop_offerings rows for one shop."""
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM shop_offerings WHERE shop_id = ? AND status = 'active';",
        (shop_id,),
    ).fetchone()
    return int(row["n"] if row else 0)


def count_active_unlocked_offerings_for_shop(conn: sqlite3.Connection, shop_id: int) -> int:
    """Count active offerings that can be auto-discontinued (manual lock = 0)."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM shop_offerings
        WHERE shop_id = ?
          AND status = 'active'
          AND manual_status_lock = 0;
        """,
        (shop_id,),
    ).fetchone()
    return int(row["n"] if row else 0)


def count_would_auto_discontinue_for_shop(conn: sqlite3.Connection, shop_id: int) -> int:
    """Count active unlocked offerings that are absent from current menu_entries."""
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM shop_offerings
        WHERE shop_id = ?
          AND status = 'active'
          AND manual_status_lock = 0
          AND strain_id NOT IN (
              SELECT strain_id FROM menu_entries WHERE shop_id = ?
          );
        """,
        (shop_id, shop_id),
    ).fetchone()
    return int(row["n"] if row else 0)


def load_menu_entries_from_active_offerings(
    conn: sqlite3.Connection,
    shop_id: int,
    replace: bool = True,
) -> int:
    """Populate current menu_entries from active offerings for a shop.

    This is a convenience helper for menu refreshes: clone active offerings into
    current entries, then remove/edit what changed on the newly published menu.
    """
    now = utc_now_iso()
    if replace:
        conn.execute("DELETE FROM menu_entries WHERE shop_id = ?;", (shop_id,))

    rows = conn.execute(
        """
        SELECT strain_id, base_type, is_cali,
               price_currency, price_amount, price_unit, notes
        FROM shop_offerings
        WHERE shop_id = ? AND status = 'active'
        ORDER BY id;
        """,
        (shop_id,),
    ).fetchall()

    for r in rows:
        conn.execute(
            """
            INSERT INTO menu_entries(
                shop_id, strain_id, base_type, is_cali,
                price_currency, price_amount, price_unit,
                notes, created_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(shop_id, strain_id) DO UPDATE SET
                base_type = excluded.base_type,
                is_cali = excluded.is_cali,
                price_currency = excluded.price_currency,
                price_amount = excluded.price_amount,
                price_unit = excluded.price_unit,
                notes = excluded.notes,
                created_at = excluded.created_at;
            """,
            (
                shop_id,
                int(r["strain_id"]),
                r["base_type"],
                int(r["is_cali"]),
                r["price_currency"],
                float(r["price_amount"]),
                r["price_unit"] or DEFAULT_UNIT,
                (r["notes"] or "").strip(),
                now,
            ),
        )

    conn.commit()
    return len(rows)


def reconcile_offerings_for_shop(conn: sqlite3.Connection, shop_id: int) -> None:
    """Reconcile shop_offerings with current menu_entries."""
    now = utc_now_iso()

    current = conn.execute(
        """
        SELECT me.strain_id, me.base_type, me.is_cali,
               me.price_currency, me.price_amount, me.price_unit, me.notes
        FROM menu_entries me
        WHERE me.shop_id = ?;
        """,
        (shop_id,),
    ).fetchall()

    for r in current:
        strain_id = int(r["strain_id"])
        conn.execute(
            """
            INSERT INTO shop_offerings(
                shop_id, strain_id,
                base_type, is_cali,
                price_currency, price_amount, price_unit,
                notes,
                status,
                discontinued_reason, discontinued_since_utc, discontinued_until_utc,
                last_seen_at_utc,
                manual_status_lock,
                created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'active', '', '', '', ?, 0, ?, ?)
            ON CONFLICT(shop_id, strain_id) DO UPDATE SET
                base_type = excluded.base_type,
                is_cali = excluded.is_cali,
                price_currency = excluded.price_currency,
                price_amount = excluded.price_amount,
                price_unit = excluded.price_unit,
                notes = excluded.notes,
                last_seen_at_utc = excluded.last_seen_at_utc,
                updated_at = excluded.updated_at,
                status = CASE
                    WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.status
                    ELSE 'active'
                END,
                discontinued_reason = CASE
                    WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_reason
                    ELSE ''
                END,
                discontinued_since_utc = CASE
                    WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_since_utc
                    ELSE ''
                END,
                discontinued_until_utc = CASE
                    WHEN shop_offerings.manual_status_lock = 1 THEN shop_offerings.discontinued_until_utc
                    ELSE ''
                END;
            """,
            (
                shop_id,
                strain_id,
                r["base_type"],
                int(r["is_cali"]),
                r["price_currency"],
                float(r["price_amount"]),
                r["price_unit"],
                r["notes"] or "",
                now,
                now,
                now,
            ),
        )

    conn.execute(
        """
        UPDATE shop_offerings
        SET
            status = 'discontinued',
            discontinued_reason = 'missing from latest menu',
            discontinued_since_utc = ?,
            discontinued_until_utc = '',
            updated_at = ?
        WHERE shop_id = ?
          AND status = 'active'
          AND manual_status_lock = 0
          AND strain_id NOT IN (
              SELECT strain_id FROM menu_entries WHERE shop_id = ?
          );
        """,
        (now, now, shop_id, shop_id),
    )

    conn.commit()


def mark_menu_processed(conn: sqlite3.Connection, shop_id: int) -> None:
    """Mark menu processed so it leaves the queue."""
    conn.execute("UPDATE menus SET status = 'processed', error = '' WHERE shop_id = ?;", (shop_id,))
    conn.commit()


def set_offering_status(
    conn: sqlite3.Connection,
    shop_id: int,
    strain_id: int,
    status: str,
    reason: str = "",
    until_utc: str = "",
    lock: bool = True,
) -> None:
    """Manually set offering status and optional lock."""
    now = utc_now_iso()
    lock_int = 1 if bool(lock) else 0

    if status not in ("active", "discontinued"):
        raise ValueError("status must be active or discontinued")

    if status == "active":
        conn.execute(
            """
            UPDATE shop_offerings
            SET status = 'active',
                discontinued_reason = '',
                discontinued_since_utc = '',
                discontinued_until_utc = '',
                manual_status_lock = ?,
                updated_at = ?
            WHERE shop_id = ? AND strain_id = ?;
            """,
            (lock_int, now, shop_id, strain_id),
        )
    else:
        conn.execute(
            """
            UPDATE shop_offerings
            SET status = 'discontinued',
                discontinued_reason = ?,
                discontinued_since_utc = ?,
                discontinued_until_utc = ?,
                manual_status_lock = ?,
                updated_at = ?
            WHERE shop_id = ? AND strain_id = ?;
            """,
            (reason or "manual", now, until_utc or "", lock_int, now, shop_id, strain_id),
        )

    conn.commit()


# -----------------------------------------------------------------------------
# Templates (professional dark UI)
# -----------------------------------------------------------------------------

BASE_CSS = """
:root {
  --bg: #0b0f17;
  --card: #0f1724;
  --text: #e7edf5;
  --muted: #9fb0c6;
  --border: rgba(255,255,255,.08);
  --accent: #4fd1c5;
  --warn: #f6ad55;
  --good: #68d391;
  --bad: #fc8181;
  --add-entry-h: 290px;
  --entries-h: 260px;
  --catalogue-h: 320px;
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  background:
    radial-gradient(1200px 600px at 30% -10%, rgba(79,209,197,.18), transparent 60%),
    radial-gradient(900px 500px at 90% 0%, rgba(99,102,241,.14), transparent 60%),
    var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  display:flex;
  gap: 12px;
  align-items:center;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: rgba(10,14,22,.85);
  backdrop-filter: blur(8px);
  flex: 0 0 auto;
}

.brand { display:flex; align-items:center; gap:10px; font-weight:800; }
.logo {
  width: 30px; height: 30px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(79,209,197,.9), rgba(99,102,241,.75));
  box-shadow: 0 10px 30px rgba(0,0,0,.25);
}

.pill {
  display:inline-flex; align-items:center; gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.04);
  color: var(--text);
  font-size: 12px;
  text-decoration: none;
}
.pill.bad  { border-color: rgba(252,129,129,.45); color: var(--bad); }
.pill.good { border-color: rgba(104,211,145,.45); color: var(--good); }
.pill.warn { border-color: rgba(246,173,85,.45); color: var(--warn); }

.container {
  display: grid;
  grid-template-columns: 1.25fr .75fr;
  gap: 14px;
  padding: 14px;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  align-content: start;
}

.card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));
  overflow: hidden;
}
.cardHeader {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,.02);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.cardBody { padding: 14px; }

.grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }

label { display:block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }

input:not([type="radio"]):not([type="checkbox"]):not([type="range"]),
textarea,
select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(5,7,10,.55);
  color: var(--text);
  outline: none;
}

textarea { min-height: 90px; resize: vertical; }
.small { font-size: 12px; color: var(--muted); }

.btnrow { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
button {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.05);
  color: var(--text);
  cursor: pointer;
}
button.primary {
  background: linear-gradient(135deg, rgba(79,209,197,.85), rgba(99,102,241,.75));
  border-color: rgba(79,209,197,.35);
}
button.ghost { background: rgba(255,255,255,.02); }
button.danger { border-color: rgba(252,129,129,.45); color: var(--bad); }

.tableWrap { overflow:auto; border-top: 1px solid var(--border); }
.tableWrap.entries {
  height: var(--entries-h);
  min-height: 140px;
  max-height: 75vh;
  resize: vertical;
}
.tableWrap.catalogue {
  height: var(--catalogue-h);
  min-height: 140px;
  max-height: 75vh;
  resize: vertical;
}
.tableWrap.browse { max-height: 70vh; }
.tableWrap.browse td { word-break: break-word; }

.panelSizer {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255,255,255,.02);
}
.panelSizerGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
.panelSizerGrid input[type="range"] { width: 100%; }

.addEntryPanel {
  height: var(--add-entry-h);
  min-height: 180px;
  max-height: 75vh;
  overflow: auto;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}

table { width:100%; border-collapse: collapse; }
th, td { text-align:left; font-size: 12px; padding: 8px 8px; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
th { color: var(--muted); font-weight: 700; position: sticky; top: 0; background: rgba(10,14,22,.92); backdrop-filter: blur(6px); }

.kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 2px 7px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.18);
  background: rgba(0,0,0,.25);
  font-size: 12px;
}

.radioGroup {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}

.radioOption {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.2;
}

.radioOption input[type="radio"],
.radioOption input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  padding: 0;
  flex: 0 0 auto;
}

.menuImg {
  width: 100%;
  height: min(calc(100vh - 190px), 76vh);
  object-fit: contain;
  background: rgba(0,0,0,.35);
}

.msg {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255,255,255,.03);
}

.toast {
  position: fixed;
  right: 14px;
  top: 78px;
  z-index: 999;
  max-width: min(520px, calc(100vw - 28px));
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(15,23,36,.92);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 50px rgba(0,0,0,.35);
  font-size: 13px;
}
.toast.good { border-color: rgba(104,211,145,.45); }
.toast.bad  { border-color: rgba(252,129,129,.45); }

.menuGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

pre.log {
  margin: 0;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(0,0,0,.35);
  font-size: 12px;
  line-height: 1.4;
  max-height: 55vh;
  overflow: auto;
  white-space: pre-wrap;
}

@media (max-width: 980px) {
  .container { grid-template-columns: 1fr; }
  .menuImg { height: 60vh; }
  .menuGrid { grid-template-columns: 1fr; }
  .panelSizerGrid { grid-template-columns: 1fr; }
}

@media (max-height: 820px) {
  .cardBody { padding: 10px; }
  .cardHeader { padding: 10px 12px; }
  .container { padding: 10px; gap: 10px; }
  .menuImg { height: min(calc(100vh - 220px), 56vh); }
}
"""

PAGE_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Coffeeshop Menu Entry</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Coffeeshop Menu Entry
        <div class="small">Fast data entry · current menu → catalogue · <b>v5</b></div>
      </div>
    </div>

    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
      <select id="shopSelect" style="max-width: 420px;">
        {% for s in shop_choices %}
          <option value="{{ s['shop_id'] }}" {% if s['shop_id'] == current_shop_id %}selected{% endif %}>
            {{ s['city'] }} — {{ s['name'] }} ({{ s['status'] }})
          </option>
        {% endfor %}
      </select>
      <span class="pill">{{ city }}</span>
      <span class="pill {{ 'warn' if menu_status=='new' else 'good' }}">menu: {{ menu_status }}</span>
      <a class="pill" href="{{ url_for('queue') }}">Queue <span class="kbd">{{ new_count }}</span></a>
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('browse') }}">Browse</a>
    </div>

    <div class="pill">
      Hotkeys:
      <span class="kbd">1</span> S
      <span class="kbd">2</span> I
      <span class="kbd">3</span> H
      <span class="kbd">4</span> Hash
      <span class="kbd">5</span> Cali
      <span class="kbd">Enter</span> Save
      <span class="kbd">N</span>/<span class="kbd">P</span> Next/Prev
      <span class="kbd">/</span> Focus
    </div>
  </div>

  {% if message %}
    <div id="toast" class="toast good">{{ message }}</div>
  {% endif %}

  <script>
    const toast = document.getElementById('toast');
    if (toast) setTimeout(() => { toast.style.display = 'none'; }, 3500);
  </script>

  <div class="container">
    <div class="card">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Menu image</div>
          <div class="small">{{ shop_name }}</div>
        </div>
        <div class="btnrow">
          <button class="ghost" type="button" onclick="navTo('{{ url_for('prev_shop', shop_id=shop_id) }}')">Prev</button>
          <button class="ghost" type="button" onclick="navTo('{{ url_for('next_shop', shop_id=shop_id) }}')">Next</button>
        </div>
      </div>

      {% if menu_local_path and menu_file_exists %}
        <img class="menuImg" src="{{ url_for('serve_menu_file', shop_id=shop_id) }}" alt="menu">
      {% else %}
        <div class="cardBody">
          <div class="msg">
            <div style="font-weight:800; margin-bottom:6px;">Could not display the menu automatically.</div>
            <div class="small">Local path: <code>{{ menu_local_path }}</code></div>
            <div class="small">Image URL: <a href="{{ menu_image_url }}" target="_blank" rel="noreferrer">open</a></div>
          </div>
        </div>
      {% endif %}
    </div>

    <div class="card">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Add entry</div>
          <div class="small">Price shown as currency/amount/{{ unit }}</div>
        </div>
        <div class="btnrow">
          <form method="post" action="{{ url_for('load_active_to_entries', shop_id=shop_id) }}"
                onsubmit="return confirm('Replace current menu entries with this shop\\'s active offerings?');"
                style="display:inline;">
            <button class="ghost" type="submit">Load active offerings</button>
          </form>
          <button class="primary" type="button" onclick="document.getElementById('entryForm').requestSubmit();">Save</button>
          {% if finish_requires_mass_confirm %}
            <button class="danger" type="button"
                    onclick="if (confirm('Finish now will discontinue all active offerings for this shop. Continue?')) navTo('{{ url_for('finish_menu', shop_id=shop_id, allow_mass=1) }}');">
              Confirm finish all-discontinue
            </button>
          {% else %}
            <button class="ghost" type="button" onclick="navTo('{{ url_for('finish_menu', shop_id=shop_id) }}')">Finish menu</button>
          {% endif %}
          {% if not menu_entries and offerings %}
            <button class="danger" type="button"
                    onclick="if (confirm('Finish with an empty menu? This will discontinue all currently active offerings for this shop.')) navTo('{{ url_for('finish_menu', shop_id=shop_id, allow_empty=1) }}');">
              Finish empty
            </button>
          {% endif %}
        </div>
      </div>

      <div class="cardBody">
        {% if finish_requires_mass_confirm %}
          <div class="msg" style="margin-bottom:10px;">
            <b>Safety check:</b> finishing now will auto-discontinue
            <b>{{ would_auto_discontinue }}</b> active offerings.
            Verify current entries before finishing.
          </div>
        {% endif %}
        <div class="panelSizer">
          <div class="small"><b>Panel sizes</b> (saved in this browser)</div>
          <div class="panelSizerGrid">
            <label for="size_add">Add entry (px)
              <input id="size_add" type="range" min="180" max="760" step="10" value="290">
            </label>
            <label for="size_entries">Current entries (px)
              <input id="size_entries" type="range" min="140" max="760" step="10" value="260">
            </label>
            <label for="size_catalogue">Offerings catalogue (px)
              <input id="size_catalogue" type="range" min="140" max="760" step="10" value="320">
            </label>
          </div>
          <div class="btnrow" style="margin-top:8px;">
            <button class="ghost" type="button" onclick="resetSectionSizes();">Reset sizes</button>
          </div>
        </div>

        <div id="addEntryPanel" class="addEntryPanel">
          <form id="entryForm" method="post" action="{{ url_for('add_entry', shop_id=shop_id) }}">
            <div>
              <label for="strain_name">Strain name</label>
              <input id="strain_name" name="strain_name" list="strain_suggestions" autocomplete="off"
         autocapitalize="none" autocorrect="off" spellcheck="false"
         placeholder="e.g. Gelato, Amnesia Haze, AK47" required>
              <datalist id="strain_suggestions"></datalist>
            </div>

            <div class="grid2" style="margin-top:10px;">
              <div>
                <label>Type</label>
                <div class="radioGroup">
                  <label class="radioOption"><input type="radio" name="base_type" value="sativa" required><span>Sativa</span></label>
                  <label class="radioOption"><input type="radio" name="base_type" value="indica" required><span>Indica</span></label>
                  <label class="radioOption"><input type="radio" name="base_type" value="hybrid" required><span>Hybrid</span></label>
                  <label class="radioOption"><input type="radio" name="base_type" value="hash" required><span>Hash</span></label>
                  <span style="width:1px; height:18px; background: rgba(255,255,255,.18); display:inline-block; margin:0 6px;"></span>
                  <label class="radioOption"><input type="checkbox" name="is_cali" value="1"><span>Cali</span></label>
                </div>
                <div class="small">Type is one-of; Cali is an overlay.</div>
              </div>

              <div>
                <label>Price per {{ unit }}</label>
                <div style="display:grid; grid-template-columns: 110px 1fr; gap:10px; align-items:center;">
                  <select name="price_currency" aria-label="currency">
                    <option value="€" selected>€ EUR</option>
                    <option value="£">£ GBP</option>
                    <option value="$">$ USD</option>
                  </select>
                  <input id="price_amount" name="price_amount" inputmode="decimal" placeholder="e.g. 12 or 12.5" required>
                </div>
                <div class="small" style="margin-top:6px;">Stored as <b>currency/amount/{{ unit }}</b>.</div>
              </div>
            </div>

            <div style="margin-top:10px;">
              <label for="notes">Notes</label>
              <textarea id="notes" name="notes" placeholder="e.g. top shelf, citrus, 25%"></textarea>
            </div>

            <div class="btnrow" style="margin-top:10px;">
              <button class="primary" type="submit">Save</button>
              <button class="ghost" type="button" onclick="clearForm();">Clear</button>
            </div>
          </form>
        </div>

        <div style="margin-top:14px;">
          <div style="display:flex; align-items:baseline; justify-content: space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:800;">Current menu entries</div>
            <div class="small">Load active offerings, then keep/remove/edit what changed.</div>
          </div>
          <div class="btnrow" style="margin-top:8px;">
            <button class="ghost" type="button" onclick="setAllEntryChecks(true);">Select all</button>
            <button class="ghost" type="button" onclick="setAllEntryChecks(false);">Clear selection</button>
            <button class="ghost" type="button" onclick="keepSelectedEntries();">Keep selected only</button>
            <button class="danger" type="button" onclick="removeSelectedEntries();">Remove selected</button>
          </div>
          <form id="bulkKeepForm" method="post" action="{{ url_for('keep_selected_entries', shop_id=shop_id) }}" style="display:none;"></form>
          <form id="bulkRemoveForm" method="post" action="{{ url_for('delete_selected_entries', shop_id=shop_id) }}" style="display:none;"></form>
          <div id="entriesWrap" class="tableWrap entries" style="margin-top:10px;">
            <table>
              <thead>
                <tr>
                  <th>Pick</th><th>Strain</th><th>Type</th><th>Price</th><th>Notes</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {% for it in menu_entries %}
                  <tr>
                    <td><input type="checkbox" class="entryCheck" value="{{ it['entry_id'] }}" aria-label="select {{ it['strain_name'] }}"></td>
                    <td>{{ it['strain_name'] }}</td>
                    <td>{{ it['base_type'] }}{% if it['is_cali'] %} (cali){% endif %}</td>
                    <td>{{ it['price_currency'] }}{{ '%.2f'|format(it['price_amount']) }}/{{ it['price_unit'] }}</td>
                    <td>{{ it['notes'] }}</td>
                    <td>
                      <div class="btnrow">
                        <a class="pill" href="{{ url_for('edit_entry_get', shop_id=shop_id, entry_id=it['entry_id']) }}">Edit</a>
                        <form method="post"
                              action="{{ url_for('delete_entry_route', shop_id=shop_id, entry_id=it['entry_id']) }}"
                              onsubmit="return confirm('Remove this strain from current menu entries?');"
                              style="display:inline;">
                          <button class="danger" type="submit">Remove</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                {% endfor %}
                {% if not menu_entries %}
                  <tr><td colspan="6" class="small">No entries yet.</td></tr>
                {% endif %}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:16px;">
          <div style="display:flex; align-items:baseline; justify-content: space-between; gap:10px; flex-wrap:wrap;">
            <div style="font-weight:800;">Offerings catalogue</div>
            <div class="small">Active / discontinued · manual lock</div>
          </div>

          <div id="catalogueWrap" class="tableWrap catalogue" style="margin-top:10px;">
            <table>
              <thead>
                <tr>
                  <th>Strain</th><th>Status</th><th>Last seen</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {% for off in offerings %}
                  <tr>
                    <td>{{ off['strain_name'] }}</td>
                    <td>
                      {% if off['status'] == 'active' %}
                        <span class="pill good">active</span>
                      {% else %}
                        <span class="pill bad">discontinued</span>
                      {% endif %}
                      {% if off['manual_status_lock'] %}
                        <span class="pill" style="margin-left:6px;">locked</span>
                      {% endif %}
                      {% if off['status'] == 'discontinued' and off['discontinued_until_utc'] %}
                        <div class="small" style="margin-top:4px;">until {{ off['discontinued_until_utc'] }}</div>
                      {% endif %}
                    </td>
                    <td class="small">{{ off['last_seen_at_utc'] }}</td>
                    <td>
                      {% if off['status'] == 'active' %}
                        <form method="post" action="{{ url_for('discontinue_offering', shop_id=shop_id, strain_id=off['strain_id']) }}"
                              style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                          <input name="reason" placeholder="reason" style="max-width:140px;">
                          <input name="until_utc" placeholder="until (optional)" style="max-width:160px;">
                          <button class="danger" type="submit">Discontinue</button>
                        </form>
                      {% else %}
                        <form method="post" action="{{ url_for('resume_offering', shop_id=shop_id, strain_id=off['strain_id']) }}">
                          <button class="ghost" type="submit">Resume</button>
                        </form>
                      {% endif %}
                    </td>
                  </tr>
                {% endfor %}
                {% if not offerings %}
                  <tr><td colspan="4" class="small">No offerings yet (finish a menu to create them).</td></tr>
                {% endif %}
              </tbody>
            </table>
          </div>

          <div class="small" style="margin-top:8px;">
            Tip: “until” is stored as free text (e.g. <code>2026-03-01</code> or <code>next week</code>).
          </div>
        </div>

      </div>
    </div>
  </div>

<script>
  function navTo(url) { window.location.href = url; }

  function clearForm() {
    const f = document.getElementById('entryForm');
    if (!f) return;
    f.reset();
    const s = document.getElementById('strain_name');
    if (s) s.focus();
  }

  const SECTION_SIZE_KEY = 'shop_view_section_sizes_v1';
  const SECTION_SIZE_DEFAULTS = { add: 290, entries: 260, catalogue: 320 };
  const SECTION_SIZE_LIMITS = {
    add: [180, 760],
    entries: [140, 760],
    catalogue: [140, 760],
  };

  function clampSize(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function parseSize(val, fallback, min, max) {
    const n = Number.parseInt(String(val || ''), 10);
    if (Number.isNaN(n)) return fallback;
    return clampSize(n, min, max);
  }

  function getSectionElements() {
    return {
      add: document.getElementById('addEntryPanel'),
      entries: document.getElementById('entriesWrap'),
      catalogue: document.getElementById('catalogueWrap'),
    };
  }

  function getSectionInputs() {
    return {
      add: document.getElementById('size_add'),
      entries: document.getElementById('size_entries'),
      catalogue: document.getElementById('size_catalogue'),
    };
  }

  function saveSectionSizes(sizes) {
    try {
      localStorage.setItem(SECTION_SIZE_KEY, JSON.stringify(sizes));
    } catch (_err) {
      // no-op
    }
  }

  function loadSectionSizes() {
    try {
      const raw = localStorage.getItem(SECTION_SIZE_KEY);
      if (!raw) return { ...SECTION_SIZE_DEFAULTS };
      const parsed = JSON.parse(raw);
      return {
        add: parseSize(parsed.add, SECTION_SIZE_DEFAULTS.add, ...SECTION_SIZE_LIMITS.add),
        entries: parseSize(parsed.entries, SECTION_SIZE_DEFAULTS.entries, ...SECTION_SIZE_LIMITS.entries),
        catalogue: parseSize(parsed.catalogue, SECTION_SIZE_DEFAULTS.catalogue, ...SECTION_SIZE_LIMITS.catalogue),
      };
    } catch (_err) {
      return { ...SECTION_SIZE_DEFAULTS };
    }
  }

  function applySectionSizes(sizes, persist = true) {
    const elements = getSectionElements();
    const inputs = getSectionInputs();

    const safe = {
      add: parseSize(sizes.add, SECTION_SIZE_DEFAULTS.add, ...SECTION_SIZE_LIMITS.add),
      entries: parseSize(sizes.entries, SECTION_SIZE_DEFAULTS.entries, ...SECTION_SIZE_LIMITS.entries),
      catalogue: parseSize(sizes.catalogue, SECTION_SIZE_DEFAULTS.catalogue, ...SECTION_SIZE_LIMITS.catalogue),
    };

    if (elements.add) elements.add.style.height = `${safe.add}px`;
    if (elements.entries) elements.entries.style.height = `${safe.entries}px`;
    if (elements.catalogue) elements.catalogue.style.height = `${safe.catalogue}px`;

    if (inputs.add) inputs.add.value = String(safe.add);
    if (inputs.entries) inputs.entries.value = String(safe.entries);
    if (inputs.catalogue) inputs.catalogue.value = String(safe.catalogue);

    if (persist) saveSectionSizes(safe);
  }

  function sizesFromInputs() {
    const inputs = getSectionInputs();
    return {
      add: parseSize(inputs.add ? inputs.add.value : null, SECTION_SIZE_DEFAULTS.add, ...SECTION_SIZE_LIMITS.add),
      entries: parseSize(inputs.entries ? inputs.entries.value : null, SECTION_SIZE_DEFAULTS.entries, ...SECTION_SIZE_LIMITS.entries),
      catalogue: parseSize(inputs.catalogue ? inputs.catalogue.value : null, SECTION_SIZE_DEFAULTS.catalogue, ...SECTION_SIZE_LIMITS.catalogue),
    };
  }

  function sizesFromPanels() {
    const elements = getSectionElements();
    return {
      add: parseSize(elements.add ? Math.round(elements.add.getBoundingClientRect().height) : null, SECTION_SIZE_DEFAULTS.add, ...SECTION_SIZE_LIMITS.add),
      entries: parseSize(elements.entries ? Math.round(elements.entries.getBoundingClientRect().height) : null, SECTION_SIZE_DEFAULTS.entries, ...SECTION_SIZE_LIMITS.entries),
      catalogue: parseSize(elements.catalogue ? Math.round(elements.catalogue.getBoundingClientRect().height) : null, SECTION_SIZE_DEFAULTS.catalogue, ...SECTION_SIZE_LIMITS.catalogue),
    };
  }

  function resetSectionSizes() {
    applySectionSizes({ ...SECTION_SIZE_DEFAULTS }, true);
  }

  function initSectionSizes() {
    applySectionSizes(loadSectionSizes(), false);

    const inputs = getSectionInputs();
    [inputs.add, inputs.entries, inputs.catalogue].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => {
        applySectionSizes(sizesFromInputs(), true);
      });
    });

    const elements = getSectionElements();
    [elements.add, elements.entries, elements.catalogue].forEach((el) => {
      if (!el) return;
      el.addEventListener('mouseup', () => applySectionSizes(sizesFromPanels(), true));
      el.addEventListener('touchend', () => applySectionSizes(sizesFromPanels(), true));
    });
  }

  initSectionSizes();

  function setAllEntryChecks(checked) {
    document.querySelectorAll('.entryCheck').forEach((el) => {
      el.checked = !!checked;
    });
  }

  function getSelectedEntryIds() {
    return Array.from(document.querySelectorAll('.entryCheck:checked'))
      .map((el) => el.value)
      .filter((v) => v);
  }

  function submitEntrySelection(formId, ids) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.innerHTML = '';
    ids.forEach((id) => {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'entry_ids';
      hidden.value = id;
      form.appendChild(hidden);
    });
    form.requestSubmit();
  }

  function keepSelectedEntries() {
    const selected = getSelectedEntryIds();
    if (!selected.length) {
      alert('Select at least one entry to keep.');
      return;
    }
    if (!confirm(`Keep ${selected.length} selected entr${selected.length === 1 ? 'y' : 'ies'} and remove all others from current menu entries?`)) {
      return;
    }
    submitEntrySelection('bulkKeepForm', selected);
  }

  function removeSelectedEntries() {
    const selected = getSelectedEntryIds();
    if (!selected.length) {
      alert('Select at least one entry to remove.');
      return;
    }
    if (!confirm(`Remove ${selected.length} selected entr${selected.length === 1 ? 'y' : 'ies'} from current menu entries?`)) {
      return;
    }
    submitEntrySelection('bulkRemoveForm', selected);
  }

  const shopSelect = document.getElementById('shopSelect');
  if (shopSelect) {
    shopSelect.addEventListener('change', () => {
      const id = shopSelect.value;
      if (id) navTo(`/shop/${id}`);
    });
  }

  const strain = document.getElementById('strain_name');
  const priceAmount = document.getElementById('price_amount');
  if (strain) strain.focus();

  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const isTyping = (tag === 'input' || tag === 'textarea' || tag === 'select');

    if (!isTyping && e.key === '/') {
      e.preventDefault();
      if (strain) strain.focus();
      return;
    }
    if (isTyping) return;

    function setBaseType(val) {
      const el = document.querySelector(`input[name="base_type"][value="${val}"]`);
      if (el) el.checked = true;
    }
    const caliBox = document.querySelector('input[name="is_cali"]');

    if (e.key === '1') { setBaseType('sativa'); if (priceAmount) priceAmount.focus(); }
    if (e.key === '2') { setBaseType('indica'); if (priceAmount) priceAmount.focus(); }
    if (e.key === '3') { setBaseType('hybrid'); if (priceAmount) priceAmount.focus(); }
    if (e.key === '4') { setBaseType('hash'); if (priceAmount) priceAmount.focus(); }
    if (e.key === '5') { if (caliBox) caliBox.checked = !caliBox.checked; }

    const k = e.key.toLowerCase();
    if (k === 'n') { navTo("{{ url_for('next_shop', shop_id=shop_id) }}"); }
    if (k === 'p') { navTo("{{ url_for('prev_shop', shop_id=shop_id) }}"); }

    if (e.key === 'Enter') {
      const activeTag = (document.activeElement && document.activeElement.tagName)
        ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag !== 'button') {
        e.preventDefault();
        const form = document.getElementById('entryForm');
        if (form) form.requestSubmit();
      }
    }
  });

  let debounceTimer = null;
  if (strain) {
    strain.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const q = strain.value || '';
        const res = await fetch(`/api/strain_suggest?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const dl = document.getElementById('strain_suggestions');
        if (!dl) return;
        dl.innerHTML = '';
        (data.suggestions || []).forEach((s) => {
          const opt = document.createElement('option');
          opt.value = s;
          dl.appendChild(opt);
        });
      }, 120);
    });
  }
</script>
</body>
</html>
"""

EDIT_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Edit Entry</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Edit entry
        <div class="small">{{ city }} — {{ shop_name }}</div>
      </div>
    </div>

    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('shop_view', shop_id=shop_id) }}">Back</a>
    </div>
  </div>

  {% if message %}
    <div id="toast" class="toast bad">{{ message }}</div>
  {% endif %}
  <script>
    const toast = document.getElementById('toast');
    if (toast) setTimeout(() => { toast.style.display = 'none'; }, 4500);
  </script>

  <div style="padding:14px; overflow:auto;">
    <div class="card" style="max-width: 900px; margin: 0 auto;">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Edit current menu entry</div>
          <div class="small">Edits save by entry_id (menu_entries.id) · renames merge globally</div>
        </div>
      </div>

      <div class="cardBody">
        <form method="post" action="{{ url_for('edit_entry_post', shop_id=shop_id, entry_id=entry['entry_id']) }}">
          <div>
            <label for="strain_name">Strain name</label>
            <input id="strain_name" name="strain_name" value="{{ entry['strain_name'] }}" required
       autocapitalize="none" autocorrect="off" spellcheck="false">
          </div>

          <div class="grid2" style="margin-top:10px;">
            <div>
              <label>Type</label>
              <div class="radioGroup">
                <label class="radioOption"><input type="radio" name="base_type" value="sativa" {% if entry['base_type']=='sativa' %}checked{% endif %} required><span>Sativa</span></label>
                <label class="radioOption"><input type="radio" name="base_type" value="indica" {% if entry['base_type']=='indica' %}checked{% endif %} required><span>Indica</span></label>
                <label class="radioOption"><input type="radio" name="base_type" value="hybrid" {% if entry['base_type']=='hybrid' %}checked{% endif %} required><span>Hybrid</span></label>
                <label class="radioOption"><input type="radio" name="base_type" value="hash" {% if entry['base_type']=='hash' %}checked{% endif %} required><span>Hash</span></label>
                <span style="width:1px; height:18px; background: rgba(255,255,255,.18); display:inline-block; margin:0 6px;"></span>
                <label class="radioOption"><input type="checkbox" name="is_cali" value="1" {% if entry['is_cali'] %}checked{% endif %}><span>Cali</span></label>
              </div>
            </div>

            <div>
              <label>Price per {{ unit }}</label>
              <div style="display:grid; grid-template-columns: 110px 1fr; gap:10px; align-items:center;">
                <select name="price_currency" aria-label="currency">
                  <option value="€" {% if entry['price_currency']=='€' %}selected{% endif %}>€ EUR</option>
                  <option value="£" {% if entry['price_currency']=='£' %}selected{% endif %}>£ GBP</option>
                  <option value="$" {% if entry['price_currency']=='$' %}selected{% endif %}>$ USD</option>
                </select>
                <input name="price_amount" inputmode="decimal" value="{{ '%.2f'|format(entry['price_amount']) }}" required>
              </div>
            </div>
          </div>

          <div style="margin-top:10px;">
            <label for="notes">Notes</label>
            <textarea id="notes" name="notes">{{ entry['notes'] }}</textarea>
          </div>

          <div class="btnrow" style="margin-top:10px;">
            <button class="primary" type="submit">Save changes</button>
            <a class="pill" href="{{ url_for('shop_view', shop_id=shop_id) }}">Cancel</a>
          </div>
        </form>

        <form method="post" action="{{ url_for('delete_entry_route', shop_id=shop_id, entry_id=entry['entry_id']) }}"
              onsubmit="return confirm('Delete this entry from current menu entries?');" style="margin-top:12px;">
          <button class="danger" type="submit">Delete entry</button>
        </form>

      </div>
    </div>
  </div>
</body>
</html>
"""

QUEUE_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Menu Queue</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Menu queue
        <div class="small">New menus to process, plus scraper errors</div>
      </div>
    </div>
    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('start') }}">Go to first new</a>
    </div>
  </div>

  <div style="padding: 14px; overflow:auto;">
    <div class="card" style="max-width: 1100px; margin: 0 auto;">
      <div class="cardBody">
        <div class="msg">
          <div style="font-weight:800; margin-bottom:6px;">What is this page?</div>
          <div class="small">
            <b>new</b> = the scraper detected a changed menu image you haven't processed yet.<br>
            <b>error</b> = the scraper couldn't find or download a menu image for that shop.
          </div>
        </div>

        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
          <span class="pill warn">new: {{ counts.new }}</span>
          <span class="pill bad">error: {{ counts.error }}</span>
          <span class="pill good">processed: {{ counts.processed }}</span>
        </div>

        <div class="tableWrap" style="margin-top:12px; max-height: 70vh;">
          <table>
            <thead>
              <tr><th>Shop</th><th>Status</th><th>Fetched</th></tr>
            </thead>
            <tbody>
              {% for r in rows %}
                <tr>
                  <td><a class="pill" href="{{ url_for('shop_view', shop_id=r['id']) }}">{{ r['city'] }} — {{ r['name'] }}</a></td>
                  <td>
                    {% if r['status']=='new' %}<span class="pill warn">new</span>{% endif %}
                    {% if r['status']=='error' %}<span class="pill bad">error</span>{% endif %}
                    {% if r['status']=='processed' %}<span class="pill good">processed</span>{% endif %}
                  </td>
                  <td class="small">{{ r['fetched_at_utc'] }}</td>
                </tr>
              {% endfor %}
              {% if not rows %}
                <tr><td colspan="3" class="small">No menus found. Run the scraper first.</td></tr>
              {% endif %}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
</body>
</html>
"""

MAIN_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Coffeeshop Menu Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Coffeeshop Menu Admin
        <div class="small">Check for new menus · Update current menus · Browse the database</div>
      </div>
    </div>

    <div class="btnrow">
      <a class="pill" href="{{ url_for('start') }}">Go to first new</a>
      <a class="pill" href="{{ url_for('queue') }}">Menu queue</a>
      <a class="pill" href="{{ url_for('browse') }}">Browse DB</a>
    </div>
  </div>

  {% if message %}
    <div id="toast" class="toast good">{{ message }}</div>
  {% endif %}
  <script>
    const toast = document.getElementById('toast');
    if (toast) setTimeout(() => { toast.style.display = 'none'; }, 3500);
  </script>

  <div style="padding:14px; overflow:auto;">
    <div class="menuGrid">

      <div class="card">
        <div class="cardHeader">
          <div>
            <div style="font-weight:800;">Check for new menus</div>
            <div class="small">Downloads new menus and marks them unprocessed.</div>
          </div>
        </div>
        <div class="cardBody">
          <form method="post" action="{{ url_for('check_menus') }}">
            <div class="btnrow">
              <button class="primary" type="submit">Check now</button>
              <a class="pill" href="{{ url_for('queue') }}">View queue</a>
            </div>
          </form>
          <div class="small" style="margin-top:10px;">
            Shops CSV: <code>{{ shops_csv }}</code>
            {% if not shops_csv_exists %}<span class="pill bad" style="margin-left:6px;">missing</span>{% endif %}
          </div>
          <div class="small">
            Images folder: <code>{{ menus_dir }}</code>
          </div>
          <div class="small">
            Scraper: <code>{{ scraper_path }}</code>
            {% if not scraper_exists %}<span class="pill bad" style="margin-left:6px;">missing</span>{% endif %}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="cardHeader">
          <div>
            <div style="font-weight:800;">Update current menus</div>
            <div class="small">Open the data-entry flow and finish menus.</div>
          </div>
        </div>
        <div class="cardBody">
          <div class="btnrow">
            <a class="pill" href="{{ url_for('start') }}">Start data entry</a>
            <a class="pill" href="{{ url_for('queue') }}">Open queue</a>
          </div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <span class="pill warn">new: {{ menu_counts.new }}</span>
            <span class="pill bad">error: {{ menu_counts.error }}</span>
            <span class="pill good">processed: {{ menu_counts.processed }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="cardHeader">
          <div>
            <div style="font-weight:800;">Browse the database</div>
            <div class="small">Search shops, menus, strains, entries, offerings.</div>
          </div>
        </div>
        <div class="cardBody">
          <div class="btnrow">
            <a class="pill" href="{{ url_for('browse') }}">Open browser</a>
          </div>
          <div class="small" style="margin-top:10px;">DB path: <code>{{ db_path }}</code></div>
        </div>
      </div>

      <div class="card">
        <div class="cardHeader">
          <div>
            <div style="font-weight:800;">Export JSON</div>
            <div class="small">Generate static JSON files for locate.html / GitHub Pages.</div>
          </div>
        </div>
        <div class="cardBody">
          <form method="post" action="{{ url_for('export_json_route') }}">
            <div class="btnrow">
              <button class="primary" type="submit">Export now</button>
            </div>
          </form>
          <div class="small" style="margin-top:10px;">Output folder: <code>{{ json_export_dir }}</code></div>
          <div class="small">Files: <code>manifest.json</code>, <code>shops.json</code>, <code>shop_lookup.json</code>, <code>strains.json</code>, <code>active_offerings.json</code>, <code>menu_entries.json</code>, <code>strain_index.json</code></div>
          <div class="small" style="margin-top:8px;">
            Note: these JSON files are export snapshots only; editing them does not update the database.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="cardHeader">
          <div>
            <div style="font-weight:800;">Database stats</div>
            <div class="small">Current record counts.</div>
          </div>
        </div>
        <div class="cardBody">
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <span class="pill">shops: {{ db_counts.shops }}</span>
            <span class="pill">menus: {{ db_counts.menus }}</span>
            <span class="pill">strains: {{ db_counts.strains }}</span>
            <span class="pill">menu entries: {{ db_counts.menu_entries }}</span>
            <span class="pill">offerings: {{ db_counts.shop_offerings }}</span>
          </div>
        </div>
      </div>

    </div>
  </div>
</body>
</html>
"""

CHECK_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Menu Check Results</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Menu check results
        <div class="small">Scrape update + downloads</div>
      </div>
    </div>

    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('queue') }}">Menu queue</a>
      <a class="pill" href="{{ url_for('start') }}">Go to first new</a>
    </div>
  </div>

  <div style="padding:14px; overflow:auto;">
    <div class="card" style="max-width: 1100px; margin: 0 auto;">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Run summary</div>
          <div class="small">Duration: {{ '%.1f'|format(result.duration_s or 0) }}s</div>
        </div>
        <div>
          {% if result.ok %}
            <span class="pill good">completed</span>
          {% else %}
            <span class="pill bad">failed{% if result.returncode is not none %} (code {{ result.returncode }}){% endif %}</span>
          {% endif %}
        </div>
      </div>
      <div class="cardBody">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <span class="pill warn">new: {{ result.summary.new }}</span>
          <span class="pill">unchanged: {{ result.summary.unchanged }}</span>
          <span class="pill bad">errors: {{ result.summary.errors }}</span>
          <span class="pill">queue new: {{ menu_counts.new }}</span>
        </div>

        <div class="small" style="margin-top:10px;">
          Shops CSV: <code>{{ shops_csv }}</code>
        </div>
        <div class="small">
          Images folder: <code>{{ menus_dir }}</code>
        </div>
        <div class="small">
          DB path: <code>{{ db_path }}</code>
        </div>

        {% if result.stderr %}
          <div class="msg" style="margin-top:12px;">
            <div style="font-weight:800; margin-bottom:6px;">Errors / warnings</div>
            <pre class="log">{{ result.stderr }}</pre>
          </div>
        {% endif %}

        <div style="margin-top:12px;">
          <div style="font-weight:800; margin-bottom:6px;">Output</div>
          <pre class="log">{{ result.stdout or '(no output)' }}</pre>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""

BROWSE_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Database Browser</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Database browser
        <div class="small">Quick search across core tables</div>
      </div>
    </div>

    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('queue') }}">Menu queue</a>
      <a class="pill" href="{{ url_for('start') }}">Go to first new</a>
    </div>
  </div>

  <div style="padding:14px; overflow:auto;">
    <div class="card">
      <div class="cardHeader">
        <form method="get" action="{{ url_for('browse') }}" class="btnrow" style="width:100%;">
          <div style="min-width: 160px;">
            <label for="table">Table</label>
            <select id="table" name="table">
              {% for t in tables %}
                <option value="{{ t.key }}" {% if t.key == table_key %}selected{% endif %}>{{ t.label }}</option>
              {% endfor %}
            </select>
          </div>
          <div style="min-width: 200px; flex:1;">
            <label for="q">Search</label>
            <input id="q" name="q" placeholder="Search text" value="{{ q }}">
          </div>
          <div style="min-width: 120px;">
            <label for="limit">Limit</label>
            <input id="limit" name="limit" inputmode="numeric" value="{{ limit }}">
          </div>
          <div style="align-self:flex-end;">
            <button class="primary" type="submit">Apply</button>
          </div>
        </form>
      </div>
      <div class="cardBody">
        <div class="small">Showing {{ row_count }} row(s) from <b>{{ table_label }}</b>.</div>
        <div class="btnrow" style="margin-top:10px;">
          <form method="get" action="{{ url_for('strain_lookup') }}" class="btnrow">
            <input name="q" placeholder="Find shops carrying strain (e.g. amnesia haze)" value="{{ q if table_key=='strains' else '' }}" style="min-width:320px;">
            <button class="ghost" type="submit">Find shops by strain</button>
          </form>
        </div>
      </div>
      <div class="tableWrap browse">
        <table>
          <thead>
            <tr>
              {% for col in columns %}
                <th>{{ col }}</th>
              {% endfor %}
              {% if table_key == 'shops' %}
                <th>action</th>
              {% endif %}
            </tr>
          </thead>
          <tbody>
            {% for r in rows %}
              <tr>
                {% for col in columns %}
                  <td>{{ r[col] }}</td>
                {% endfor %}
                {% if table_key == 'shops' %}
                  <td><a class="pill" href="{{ url_for('digitised_shop_menu', shop_id=r['id']) }}">Digitised menu</a></td>
                {% endif %}
              </tr>
            {% endfor %}
            {% if not rows %}
              <tr><td colspan="{{ columns|length + (1 if table_key=='shops' else 0) }}" class="small">No results.</td></tr>
            {% endif %}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
"""

STRAIN_LOOKUP_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Shops By Strain</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Shops carrying strain
        <div class="small">Search active offerings across shops</div>
      </div>
    </div>
    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('browse') }}">Browse DB</a>
      <a class="pill" href="{{ url_for('queue') }}">Menu queue</a>
    </div>
  </div>

  <div style="padding:14px; overflow:auto;">
    <div class="card" style="max-width: 1100px; margin: 0 auto;">
      <div class="cardHeader">
        <form method="get" action="{{ url_for('strain_lookup') }}" class="btnrow" style="width:100%;">
          <div style="min-width:280px; flex:1;">
            <label for="q">Strain search</label>
            <input id="q" name="q" value="{{ q }}" placeholder="e.g. amnesia haze" autofocus>
          </div>
          <div style="min-width:120px;">
            <label for="limit">Limit</label>
            <input id="limit" name="limit" value="{{ limit }}" inputmode="numeric">
          </div>
          <div style="align-self:flex-end;">
            <button class="primary" type="submit">Search</button>
          </div>
        </form>
      </div>
      <div class="cardBody">
        <div class="small">
          {% if q %}
            {{ row_count }} result(s), {{ unique_shops }} unique shop(s).
          {% else %}
            Enter a strain name to search active offerings.
          {% endif %}
        </div>
      </div>

      <div class="tableWrap browse">
        <table>
          <thead>
            <tr>
              <th>strain</th>
              <th>shop</th>
              <th>city</th>
              <th>price</th>
              <th>type</th>
              <th>last seen</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {% for r in rows %}
              <tr>
                <td>{{ r['strain'] }}</td>
                <td>{{ r['shop'] }}</td>
                <td>{{ r['city'] }}</td>
                <td>{{ r['price_currency'] }}{{ '%.2f'|format(r['price_amount']) }}/{{ r['price_unit'] }}</td>
                <td>{{ r['base_type'] }}{% if r['is_cali'] %} (cali){% endif %}</td>
                <td>{{ r['last_seen_at_utc'] }}</td>
                <td>
                  <a class="pill" href="{{ url_for('digitised_shop_menu', shop_id=r['shop_id']) }}">Digitised menu</a>
                  <a class="pill" href="{{ url_for('shop_view', shop_id=r['shop_id']) }}">Open shop</a>
                </td>
              </tr>
            {% endfor %}
            {% if not rows and q %}
              <tr><td colspan="7" class="small">No active offerings found.</td></tr>
            {% endif %}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
"""

SHOP_DIGITISED_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Digitised Shop Menu</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>{{ css }}</style>
</head>
<body>
  <div class="topbar">
    <div class="brand">
      <div class="logo"></div>
      <div>
        Digitised menu
        <div class="small">{{ city }} - {{ shop_name }}</div>
      </div>
    </div>
    <div class="btnrow">
      <a class="pill" href="{{ url_for('main_menu') }}">Main menu</a>
      <a class="pill" href="{{ url_for('browse') }}">Browse DB</a>
      <a class="pill" href="{{ url_for('shop_view', shop_id=shop_id) }}">Open data entry</a>
    </div>
  </div>

  <div style="padding:14px; overflow:auto;">
    <div class="card" style="max-width: 1200px; margin: 0 auto;">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Current menu entries</div>
          <div class="small">These are the currently digitised entries in `menu_entries`.</div>
        </div>
      </div>
      <div class="tableWrap browse">
        <table>
          <thead>
            <tr><th>strain</th><th>type</th><th>price</th><th>notes</th></tr>
          </thead>
          <tbody>
            {% for r in menu_rows %}
              <tr>
                <td>{{ r['strain'] }}</td>
                <td>{{ r['base_type'] }}{% if r['is_cali'] %} (cali){% endif %}</td>
                <td>{{ r['price_currency'] }}{{ '%.2f'|format(r['price_amount']) }}/{{ r['price_unit'] }}</td>
                <td>{{ r['notes'] }}</td>
              </tr>
            {% endfor %}
            {% if not menu_rows %}
              <tr><td colspan="4" class="small">No digitised menu entries yet for this shop.</td></tr>
            {% endif %}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="max-width: 1200px; margin: 14px auto 0;">
      <div class="cardHeader">
        <div>
          <div style="font-weight:800;">Offerings catalogue</div>
          <div class="small">Long-term offering state from `shop_offerings`.</div>
        </div>
      </div>
      <div class="tableWrap browse">
        <table>
          <thead>
            <tr><th>strain</th><th>status</th><th>type</th><th>price</th><th>last seen</th><th>notes</th></tr>
          </thead>
          <tbody>
            {% for r in offering_rows %}
              <tr>
                <td>{{ r['strain'] }}</td>
                <td>{{ r['status'] }}</td>
                <td>{{ r['base_type'] }}{% if r['is_cali'] %} (cali){% endif %}</td>
                <td>{{ r['price_currency'] }}{{ '%.2f'|format(r['price_amount']) }}/{{ r['price_unit'] }}</td>
                <td>{{ r['last_seen_at_utc'] }}</td>
                <td>{{ r['notes'] }}</td>
              </tr>
            {% endfor %}
            {% if not offering_rows %}
              <tr><td colspan="6" class="small">No offerings recorded yet.</td></tr>
            {% endif %}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
"""


# -----------------------------------------------------------------------------
# Flask app
# -----------------------------------------------------------------------------

def create_app(
    db_path: str,
    shops_csv: str,
    menus_dir: str,
    scraper_path: Optional[str] = None,
    json_export_dir: Optional[str] = None,
) -> Flask:
    """Create the Flask app."""
    app = Flask(__name__)
    app.config["DB_PATH"] = db_path
    app.config["SHOPS_CSV"] = shops_csv
    app.config["MENUS_DIR"] = menus_dir
    app.config["BASE_DIR"] = os.path.dirname(os.path.abspath(__file__))
    app.config["SCRAPER_PATH"] = scraper_path or os.path.join(app.config["BASE_DIR"], DEFAULT_SCRAPER_SCRIPT)
    app.config["JSON_EXPORT_DIR"] = json_export_dir or app.config["BASE_DIR"]

    def conn() -> sqlite3.Connection:
        """Get a connection and ensure schema exists."""
        c = db_connect(app.config["DB_PATH"])
        db_init(c)
        return c

    # -------------------------------------------------------------------------
    # Query helpers
    # -------------------------------------------------------------------------

    def get_menu_counts(c: sqlite3.Connection) -> Dict[str, int]:
        """Counts of menus by status."""
        return {
            "new": int(c.execute("SELECT COUNT(*) AS n FROM menus WHERE status='new';").fetchone()["n"]),
            "error": int(c.execute("SELECT COUNT(*) AS n FROM menus WHERE status='error';").fetchone()["n"]),
            "processed": int(c.execute("SELECT COUNT(*) AS n FROM menus WHERE status='processed';").fetchone()["n"]),
        }

    def get_db_counts(c: sqlite3.Connection) -> Dict[str, int]:
        """Counts of core tables."""
        return {
            "shops": int(c.execute("SELECT COUNT(*) AS n FROM shops;").fetchone()["n"]),
            "menus": int(c.execute("SELECT COUNT(*) AS n FROM menus;").fetchone()["n"]),
            "strains": int(c.execute("SELECT COUNT(*) AS n FROM strains;").fetchone()["n"]),
            "menu_entries": int(c.execute("SELECT COUNT(*) AS n FROM menu_entries;").fetchone()["n"]),
            "shop_offerings": int(c.execute("SELECT COUNT(*) AS n FROM shop_offerings;").fetchone()["n"]),
        }

    def get_shop_choices(c: sqlite3.Connection) -> List[sqlite3.Row]:
        """All shops that have a menu record, showing the current menu status."""
        return c.execute(
            """
            SELECT s.id AS shop_id, s.name, s.city, m.status
            FROM shops s
            JOIN menus m ON m.shop_id = s.id
            ORDER BY s.city, s.name;
            """
        ).fetchall()

    def get_queue_ids(c: sqlite3.Connection) -> List[int]:
        """Shop IDs that are currently 'new' (the processing queue)."""
        rows = c.execute(
            """
            SELECT s.id
            FROM shops s
            JOIN menus m ON m.shop_id = s.id
            WHERE m.status = 'new'
            ORDER BY s.city, s.name;
            """
        ).fetchall()
        return [int(r["id"]) for r in rows]

    def get_prev_next_new(c: sqlite3.Connection, shop_id: int) -> Tuple[Optional[int], Optional[int]]:
        """Return (prev_id, next_id) within the 'new' queue."""
        ids = get_queue_ids(c)
        if not ids:
            return None, None
        if shop_id not in ids:
            return None, ids[0]
        i = ids.index(shop_id)
        prev_id = ids[i - 1] if i > 0 else None
        next_id = ids[i + 1] if i < len(ids) - 1 else None
        return prev_id, next_id

    def get_menu_entry_row(c: sqlite3.Connection, shop_id: int, entry_id: int) -> Optional[sqlite3.Row]:
        """Fetch a single menu entry for edit by entry_id."""
        return c.execute(
            """
            SELECT me.id AS entry_id,
                   me.shop_id, me.strain_id,
                   st.name_display AS strain_name,
                   me.base_type, me.is_cali,
                   me.price_currency, me.price_amount, me.price_unit,
                   me.notes
            FROM menu_entries me
            JOIN strains st ON st.id = me.strain_id
            WHERE me.shop_id = ? AND me.id = ?;
            """,
            (shop_id, entry_id),
        ).fetchone()

    def get_shop_page_context(c: sqlite3.Connection, shop_id: int) -> Dict:
        """Build the full page context dict for the main shop view."""
        row = c.execute(
            """
            SELECT s.id AS shop_id, s.name, s.city,
                   m.local_path, m.image_url, m.status
            FROM shops s
            JOIN menus m ON m.shop_id = s.id
            WHERE s.id = ?;
            """,
            (shop_id,),
        ).fetchone()
        if not row:
            return {}

        menu_entries = c.execute(
            """
            SELECT me.id AS entry_id,
                   me.strain_id,
                   st.name_display AS strain_name,
                   me.base_type, me.is_cali,
                   me.price_currency, me.price_amount, me.price_unit,
                   me.notes
            FROM menu_entries me
            JOIN strains st ON st.id = me.strain_id
            WHERE me.shop_id = ?
            ORDER BY st.name_display;
            """,
            (shop_id,),
        ).fetchall()

        offerings = c.execute(
            """
            SELECT so.strain_id,
                   st.name_display AS strain_name,
                   so.status, so.last_seen_at_utc, so.manual_status_lock,
                   so.discontinued_until_utc
            FROM shop_offerings so
            JOIN strains st ON st.id = so.strain_id
            WHERE so.shop_id = ?
            ORDER BY
                CASE so.status WHEN 'active' THEN 0 ELSE 1 END,
                st.name_display;
            """,
            (shop_id,),
        ).fetchall()

        menu_entry_count = len(menu_entries)
        active_unlocked_count = count_active_unlocked_offerings_for_shop(c, shop_id)
        would_auto_discontinue = count_would_auto_discontinue_for_shop(c, shop_id)
        finish_requires_mass_confirm = (
            menu_entry_count > 0
            and active_unlocked_count >= 5
            and would_auto_discontinue == active_unlocked_count
        )

        counts = get_menu_counts(c)

        local_path = row["local_path"] or ""
        file_exists = bool(local_path and os.path.exists(local_path))

        return {
            "shop_id": int(row["shop_id"]),
            "shop_name": row["name"],
            "city": row["city"],
            "menu_local_path": local_path,
            "menu_image_url": row["image_url"] or "",
            "menu_status": row["status"],
            "menu_file_exists": file_exists,
            "menu_entries": menu_entries,
            "offerings": offerings,
            "menu_entry_count": menu_entry_count,
            "active_unlocked_count": active_unlocked_count,
            "would_auto_discontinue": would_auto_discontinue,
            "finish_requires_mass_confirm": finish_requires_mass_confirm,
            "new_count": counts["new"],
            "shop_choices": get_shop_choices(c),
            "current_shop_id": int(row["shop_id"]),
            "unit": DEFAULT_UNIT,
        }

    browse_specs = {
        "shops": {
            "label": "Shops",
            "sql": (
                "SELECT id, name, city, shop_url, created_at, updated_at "
                "FROM shops"
            ),
            "columns": ["id", "name", "city", "shop_url", "created_at", "updated_at"],
            "search_cols": ["name", "city", "shop_url", "CAST(id AS TEXT)"],
            "order_by": "city, name",
        },
        "menus": {
            "label": "Menus",
            "sql": (
                "SELECT m.id AS menu_id, s.city AS city, s.name AS shop, "
                "m.status, m.fetched_at_utc, m.image_url, m.local_path, m.sha256, m.bytes "
                "FROM menus m JOIN shops s ON s.id = m.shop_id"
            ),
            "columns": [
                "menu_id",
                "city",
                "shop",
                "status",
                "fetched_at_utc",
                "image_url",
                "local_path",
                "sha256",
                "bytes",
            ],
            "search_cols": [
                "s.name",
                "s.city",
                "m.status",
                "m.image_url",
                "m.local_path",
                "m.sha256",
                "CAST(m.id AS TEXT)",
            ],
            "order_by": "m.fetched_at_utc DESC",
        },
        "strains": {
            "label": "Strains",
            "sql": "SELECT id, name_display, name_normalised, created_at FROM strains",
            "columns": ["id", "name_display", "name_normalised", "created_at"],
            "search_cols": ["name_display", "name_normalised", "CAST(id AS TEXT)"],
            "order_by": "name_display",
        },
        "menu_entries": {
            "label": "Menu entries",
            "sql": (
                "SELECT me.id AS entry_id, s.city AS city, s.name AS shop, "
                "st.name_display AS strain, me.base_type, me.is_cali, "
                "me.price_currency, me.price_amount, me.price_unit, me.notes, me.created_at "
                "FROM menu_entries me "
                "JOIN shops s ON s.id = me.shop_id "
                "JOIN strains st ON st.id = me.strain_id"
            ),
            "columns": [
                "entry_id",
                "city",
                "shop",
                "strain",
                "base_type",
                "is_cali",
                "price_currency",
                "price_amount",
                "price_unit",
                "notes",
                "created_at",
            ],
            "search_cols": [
                "s.name",
                "s.city",
                "st.name_display",
                "me.base_type",
                "me.notes",
                "CAST(me.id AS TEXT)",
            ],
            "order_by": "me.created_at DESC",
        },
        "shop_offerings": {
            "label": "Offerings",
            "sql": (
                "SELECT so.id AS offering_id, s.city AS city, s.name AS shop, "
                "st.name_display AS strain, so.status, so.last_seen_at_utc, "
                "so.manual_status_lock, so.discontinued_until_utc, "
                "so.base_type, so.is_cali, so.price_currency, so.price_amount, "
                "so.price_unit, so.notes, so.updated_at "
                "FROM shop_offerings so "
                "JOIN shops s ON s.id = so.shop_id "
                "JOIN strains st ON st.id = so.strain_id"
            ),
            "columns": [
                "offering_id",
                "city",
                "shop",
                "strain",
                "status",
                "last_seen_at_utc",
                "manual_status_lock",
                "discontinued_until_utc",
                "base_type",
                "is_cali",
                "price_currency",
                "price_amount",
                "price_unit",
                "notes",
                "updated_at",
            ],
            "search_cols": [
                "s.name",
                "s.city",
                "st.name_display",
                "so.status",
                "so.notes",
                "CAST(so.id AS TEXT)",
            ],
            "order_by": "so.updated_at DESC",
        },
    }

    # -------------------------------------------------------------------------
    # Routes
    # -------------------------------------------------------------------------

    @app.get("/")
    def main_menu() -> Response:
        """Main menu landing page."""
        message = request.args.get("msg", "")
        c = conn()
        menu_counts = get_menu_counts(c)
        db_counts = get_db_counts(c)
        c.close()

        shops_csv = app.config["SHOPS_CSV"]
        menus_dir = app.config["MENUS_DIR"]
        scraper_path = app.config["SCRAPER_PATH"]

        return Response(
            render_template_string(
                MAIN_TMPL,
                css=BASE_CSS,
                message=message,
                menu_counts=menu_counts,
                db_counts=db_counts,
                db_path=app.config["DB_PATH"],
                json_export_dir=app.config["JSON_EXPORT_DIR"],
                shops_csv=shops_csv,
                menus_dir=menus_dir,
                scraper_path=scraper_path,
                shops_csv_exists=os.path.exists(shops_csv),
                scraper_exists=os.path.exists(scraper_path),
            )
        )

    @app.get("/start")
    def start() -> Response:
        """Go to first new menu, or queue if none."""
        c = conn()
        ids = get_queue_ids(c)
        c.close()
        if not ids:
            return redirect(url_for("queue"))
        return redirect(url_for("shop_view", shop_id=ids[0]))

    @app.post("/check_menus")
    def check_menus() -> Response:
        """Run the scraper to check for new menus."""
        shops_csv = app.config["SHOPS_CSV"]
        menus_dir = app.config["MENUS_DIR"]
        scraper_path = app.config["SCRAPER_PATH"]

        if not os.path.exists(shops_csv):
            result = {
                "ok": False,
                "returncode": None,
                "stdout": "",
                "stderr": f"Shops CSV not found: {shops_csv}",
                "duration_s": 0.0,
                "summary": {"new": 0, "unchanged": 0, "errors": 1},
            }
        elif not os.path.exists(scraper_path):
            result = {
                "ok": False,
                "returncode": None,
                "stdout": "",
                "stderr": f"Scraper script not found: {scraper_path}",
                "duration_s": 0.0,
                "summary": {"new": 0, "unchanged": 0, "errors": 1},
            }
        else:
            result = run_scrape_update(
                scraper_path=scraper_path,
                shops_csv=shops_csv,
                db_path=app.config["DB_PATH"],
                out_dir=menus_dir,
                cwd=app.config["BASE_DIR"],
            )

        c = conn()
        menu_counts = get_menu_counts(c)
        c.close()

        return Response(
            render_template_string(
                CHECK_TMPL,
                css=BASE_CSS,
                result=result,
                menu_counts=menu_counts,
                shops_csv=shops_csv,
                menus_dir=menus_dir,
                db_path=app.config["DB_PATH"],
            )
        )

    @app.post("/export_json")
    def export_json_route() -> Response:
        """Export JSON snapshots to disk for static clients."""
        out_dir = app.config["JSON_EXPORT_DIR"]
        c = conn()
        try:
            manifest = export_json_snapshot(c, out_dir)
        finally:
            c.close()

        counts = manifest.get("counts", {})
        msg = (
            f"JSON exported to {out_dir} "
            f"(shops={counts.get('shops', 0)}, strains={counts.get('strains', 0)}, "
            f"active_offerings={counts.get('active_offerings', 0)})."
        )
        return redirect(url_for("main_menu", msg=msg))

    @app.get("/queue")
    def queue() -> Response:
        """Queue page."""
        c = conn()
        rows = c.execute(
            """
            SELECT s.id, s.name, s.city, m.fetched_at_utc, m.status
            FROM shops s
            JOIN menus m ON m.shop_id = s.id
            WHERE m.status IN ('new', 'error', 'processed')
            ORDER BY
              CASE m.status WHEN 'new' THEN 0 WHEN 'error' THEN 1 ELSE 2 END,
              s.city, s.name;
            """
        ).fetchall()
        counts = get_menu_counts(c)
        c.close()
        return Response(render_template_string(QUEUE_TMPL, css=BASE_CSS, rows=rows, counts=counts))

    @app.get("/browse")
    def browse() -> Response:
        """Browse core database tables."""
        table_key = (request.args.get("table") or "shops").strip()
        if table_key not in browse_specs:
            table_key = "shops"

        q = (request.args.get("q") or "").strip()
        limit_raw = (request.args.get("limit") or "200").strip()
        try:
            limit = int(limit_raw)
        except ValueError:
            limit = 200
        limit = max(1, min(limit, 1000))

        spec = browse_specs[table_key]
        sql = spec["sql"]
        params: List[object] = []
        if q:
            like = f"%{q}%"
            where = " OR ".join([f"{col} LIKE ?" for col in spec["search_cols"]])
            sql = f"{sql} WHERE {where}"
            params.extend([like] * len(spec["search_cols"]))

        sql = f"{sql} ORDER BY {spec['order_by']} LIMIT ?"
        params.append(limit)

        c = conn()
        rows = c.execute(sql, params).fetchall()
        c.close()

        table_list = [{"key": k, "label": v["label"]} for k, v in browse_specs.items()]

        return Response(
            render_template_string(
                BROWSE_TMPL,
                css=BASE_CSS,
                tables=table_list,
                table_key=table_key,
                table_label=spec["label"],
                q=q,
                limit=limit,
                columns=spec["columns"],
                rows=rows,
                row_count=len(rows),
            )
        )

    @app.get("/strain_lookup")
    def strain_lookup() -> Response:
        """Find shops carrying a given strain (active offerings)."""
        q = (request.args.get("q") or "").strip()
        limit_raw = (request.args.get("limit") or "300").strip()
        try:
            limit = int(limit_raw)
        except ValueError:
            limit = 300
        limit = max(1, min(limit, 1500))

        rows: List[sqlite3.Row] = []
        if q:
            like = f"%{q.lower()}%"
            c = conn()
            rows = c.execute(
                """
                SELECT so.shop_id,
                       st.name_display AS strain,
                       s.name AS shop,
                       s.city AS city,
                       so.price_currency, so.price_amount, so.price_unit,
                       so.base_type, so.is_cali,
                       so.last_seen_at_utc
                FROM shop_offerings so
                JOIN strains st ON st.id = so.strain_id
                JOIN shops s ON s.id = so.shop_id
                WHERE so.status = 'active'
                  AND LOWER(st.name_display) LIKE ?
                ORDER BY st.name_display, s.city, s.name
                LIMIT ?;
                """,
                (like, limit),
            ).fetchall()
            c.close()

        unique_shops = len({int(r["shop_id"]) for r in rows}) if rows else 0
        return Response(
            render_template_string(
                STRAIN_LOOKUP_TMPL,
                css=BASE_CSS,
                q=q,
                limit=limit,
                rows=rows,
                row_count=len(rows),
                unique_shops=unique_shops,
            )
        )

    @app.get("/shop/<int:shop_id>/digitised")
    def digitised_shop_menu(shop_id: int) -> Response:
        """Read-only digitised menu and offerings for a shop."""
        c = conn()
        shop = c.execute("SELECT id, name, city FROM shops WHERE id = ?;", (shop_id,)).fetchone()
        if not shop:
            c.close()
            return Response("Shop not found.", status=404)

        menu_rows = c.execute(
            """
            SELECT st.name_display AS strain,
                   me.base_type, me.is_cali,
                   me.price_currency, me.price_amount, me.price_unit,
                   me.notes
            FROM menu_entries me
            JOIN strains st ON st.id = me.strain_id
            WHERE me.shop_id = ?
            ORDER BY st.name_display;
            """,
            (shop_id,),
        ).fetchall()

        offering_rows = c.execute(
            """
            SELECT st.name_display AS strain,
                   so.status,
                   so.base_type, so.is_cali,
                   so.price_currency, so.price_amount, so.price_unit,
                   so.last_seen_at_utc,
                   so.notes
            FROM shop_offerings so
            JOIN strains st ON st.id = so.strain_id
            WHERE so.shop_id = ?
            ORDER BY
                CASE so.status WHEN 'active' THEN 0 ELSE 1 END,
                st.name_display;
            """,
            (shop_id,),
        ).fetchall()
        c.close()

        return Response(
            render_template_string(
                SHOP_DIGITISED_TMPL,
                css=BASE_CSS,
                shop_id=shop_id,
                shop_name=shop["name"],
                city=shop["city"],
                menu_rows=menu_rows,
                offering_rows=offering_rows,
            )
        )

    @app.get("/shop/<int:shop_id>")
    def shop_view(shop_id: int) -> Response:
        """Main shop view."""
        message = request.args.get("msg", "")
        c = conn()
        ctx = get_shop_page_context(c, shop_id)
        c.close()
        if not ctx:
            return Response("Shop not found (or no menu record).", status=404)
        ctx["message"] = message
        return Response(render_template_string(PAGE_TMPL, css=BASE_CSS, **ctx))

    @app.get("/shop/<int:shop_id>/menu_file")
    def serve_menu_file(shop_id: int) -> Response:
        """Serve the locally-downloaded menu image."""
        c = conn()
        row = c.execute("SELECT local_path FROM menus WHERE shop_id = ?;", (shop_id,)).fetchone()
        c.close()
        if not row:
            return Response("Not found", status=404)
        path = row["local_path"] or ""
        if not path or not os.path.exists(path):
            return Response("File not found", status=404)
        return send_file(path, mimetype="image/jpeg", as_attachment=False, download_name=os.path.basename(path))

    @app.post("/shop/<int:shop_id>/add")
    def add_entry(shop_id: int) -> Response:
        """Add or update a current menu entry."""
        strain_name = request.form.get("strain_name", "")
        base_type = request.form.get("base_type", "")
        is_cali = (request.form.get("is_cali") == "1")
        price_currency = request.form.get("price_currency", DEFAULT_CURRENCY)
        price_amount = request.form.get("price_amount", "")
        notes = request.form.get("notes", "")

        c = conn()
        _ok, msg = add_or_update_menu_entry(
            c, shop_id, strain_name, base_type, is_cali, price_currency, price_amount, notes
        )
        c.close()
        return redirect(url_for("shop_view", shop_id=shop_id, msg=msg))

    @app.get("/shop/<int:shop_id>/finish")
    def finish_menu(shop_id: int) -> Response:
        """Finish menu: reconcile offerings + mark menu processed + go next."""
        allow_empty = (request.args.get("allow_empty", "0") == "1")
        allow_mass = (request.args.get("allow_mass", "0") == "1")
        c = conn()

        menu_entry_count = count_menu_entries_for_shop(c, shop_id)
        active_offering_count = count_active_offerings_for_shop(c, shop_id)
        active_unlocked_count = count_active_unlocked_offerings_for_shop(c, shop_id)
        would_auto_discontinue = count_would_auto_discontinue_for_shop(c, shop_id)

        if menu_entry_count == 0 and active_offering_count > 0 and not allow_empty:
            c.close()
            return redirect(
                url_for(
                    "shop_view",
                    shop_id=shop_id,
                    msg=(
                        "No current menu entries yet. Finishing now would discontinue all active offerings. "
                        "Use 'Load active offerings' first, or use 'Finish empty' to confirm."
                    ),
                )
            )

        if (
            menu_entry_count > 0
            and active_unlocked_count >= 5
            and would_auto_discontinue == active_unlocked_count
            and not allow_mass
        ):
            c.close()
            return redirect(
                url_for(
                    "shop_view",
                    shop_id=shop_id,
                    msg=(
                        f"Safety stop: finishing now would auto-discontinue all {would_auto_discontinue} active offerings. "
                        "Review entries, then use the confirm finish button."
                    ),
                )
            )

        reconcile_offerings_for_shop(c, shop_id)
        mark_menu_processed(c, shop_id)
        _prev_id, next_id = get_prev_next_new(c, shop_id)
        c.close()

        if next_id is None:
            return redirect(url_for("queue"))
        if menu_entry_count == 0 and active_offering_count > 0 and allow_empty:
            return redirect(
                url_for(
                    "shop_view",
                    shop_id=next_id,
                    msg="Menu processed as empty. All previously active offerings were discontinued. Next →",
                )
            )
        return redirect(url_for("shop_view", shop_id=next_id, msg="Menu processed. Next →"))

    @app.get("/shop/<int:shop_id>/next")
    def next_shop(shop_id: int) -> Response:
        """Go to next shop in the NEW queue."""
        c = conn()
        _prev_id, next_id = get_prev_next_new(c, shop_id)
        c.close()
        if next_id is None:
            return redirect(url_for("queue"))
        return redirect(url_for("shop_view", shop_id=next_id))

    @app.get("/shop/<int:shop_id>/prev")
    def prev_shop(shop_id: int) -> Response:
        """Go to previous shop in the NEW queue."""
        c = conn()
        prev_id, _next_id = get_prev_next_new(c, shop_id)
        c.close()
        if prev_id is None:
            return redirect(url_for("shop_view", shop_id=shop_id, msg="Already at first new menu (or not in queue)."))
        return redirect(url_for("shop_view", shop_id=prev_id))

    @app.get("/shop/<int:shop_id>/entry/<int:entry_id>/edit")
    def edit_entry_get(shop_id: int, entry_id: int) -> Response:
        """Render edit page for a current menu entry (by entry_id)."""
        message = request.args.get("msg", "")
        c = conn()
        shop_row = c.execute("SELECT id, name, city FROM shops WHERE id = ?;", (shop_id,)).fetchone()
        entry = get_menu_entry_row(c, shop_id, entry_id)
        c.close()
        if not shop_row or not entry:
            return Response("Entry not found", status=404)

        return Response(
            render_template_string(
                EDIT_TMPL,
                css=BASE_CSS,
                shop_id=shop_id,
                shop_name=shop_row["name"],
                city=shop_row["city"],
                entry=entry,
                unit=DEFAULT_UNIT,
                message=message,
            )
        )

    @app.post("/shop/<int:shop_id>/entry/<int:entry_id>/edit")
    def edit_entry_post(shop_id: int, entry_id: int) -> Response:
        """Apply edits to a current menu entry (by entry_id).

        If save fails, we re-render the edit page with the user's submitted values
        preserved (so it doesn't "snap back" to DB state).
        """
        strain_name = request.form.get("strain_name", "")
        base_type = request.form.get("base_type", "")
        is_cali = (request.form.get("is_cali") == "1")
        price_currency = request.form.get("price_currency", DEFAULT_CURRENCY)
        price_amount = request.form.get("price_amount", "")
        notes = request.form.get("notes", "")

        c = conn()
        shop_row = c.execute("SELECT id, name, city FROM shops WHERE id = ?;", (shop_id,)).fetchone()

        try:
            ok, msg = update_menu_entry_by_id(
                c,
                shop_id=shop_id,
                entry_id=entry_id,
                new_strain_name=strain_name,
                base_type=base_type,
                is_cali=is_cali,
                price_currency=price_currency,
                price_amount_text=price_amount,
                notes=notes,
            )
        except Exception as e:
            ok, msg = False, f"Save failed: {e}"

        if not shop_row:
            c.close()
            return Response("Shop not found.", status=404)

        if not ok:
            # Preserve user inputs in the edit form
            try:
                price_amount_float = parse_price_amount(price_amount)
            except Exception:
                price_amount_float = 0.0

            attempted_entry = {
                "entry_id": entry_id,
                "strain_name": strain_name,
                "base_type": base_type,
                "is_cali": 1 if is_cali else 0,
                "price_currency": price_currency,
                "price_amount": price_amount_float,
                "price_unit": DEFAULT_UNIT,
                "notes": notes,
            }
            c.close()
            return Response(
                render_template_string(
                    EDIT_TMPL,
                    css=BASE_CSS,
                    shop_id=shop_id,
                    shop_name=shop_row["name"],
                    city=shop_row["city"],
                    entry=attempted_entry,
                    unit=DEFAULT_UNIT,
                    message=msg,
                )
            )

        c.close()
        return redirect(url_for("shop_view", shop_id=shop_id, msg=msg))

    @app.post("/shop/<int:shop_id>/load_active")
    def load_active_to_entries(shop_id: int) -> Response:
        """Replace current menu entries with active offerings for this shop."""
        c = conn()
        active_count = count_active_offerings_for_shop(c, shop_id)
        if active_count == 0:
            c.close()
            return redirect(url_for("shop_view", shop_id=shop_id, msg="No active offerings found to load."))

        replaced = count_menu_entries_for_shop(c, shop_id)
        loaded = load_menu_entries_from_active_offerings(c, shop_id, replace=True)
        c.close()
        return redirect(
            url_for(
                "shop_view",
                shop_id=shop_id,
                msg=(
                    f"Loaded {loaded} active offerings into current entries (replaced {replaced}). "
                    "Now remove/edit what changed, then finish menu."
                ),
            )
        )

    @app.post("/shop/<int:shop_id>/entry/<int:entry_id>/delete")
    def delete_entry_route(shop_id: int, entry_id: int) -> Response:
        """Delete a current menu entry (by entry_id)."""
        c = conn()
        delete_menu_entry_by_id(c, shop_id, entry_id)
        c.close()
        return redirect(url_for("shop_view", shop_id=shop_id, msg="Entry deleted."))

    @app.post("/shop/<int:shop_id>/entries/delete_selected")
    def delete_selected_entries(shop_id: int) -> Response:
        """Bulk-delete selected current menu entries."""
        ids = request.form.getlist("entry_ids")
        c = conn()
        removed = delete_menu_entries_by_ids(c, shop_id, ids)
        c.close()
        if removed <= 0:
            msg = "No entries selected."
        elif removed == 1:
            msg = "Removed 1 entry."
        else:
            msg = f"Removed {removed} entries."
        return redirect(url_for("shop_view", shop_id=shop_id, msg=msg))

    @app.post("/shop/<int:shop_id>/entries/keep_selected")
    def keep_selected_entries(shop_id: int) -> Response:
        """Keep only selected current menu entries for this shop."""
        ids = request.form.getlist("entry_ids")
        c = conn()
        summary = keep_only_menu_entries_by_ids(c, shop_id, ids)
        c.close()

        if summary["before"] <= 0:
            msg = "No entries to update."
        elif summary["after"] <= 0:
            msg = "Kept none. Removed all current entries."
        elif summary["removed"] <= 0:
            msg = f"Kept all {summary['after']} selected entries (nothing removed)."
        else:
            msg = f"Kept {summary['after']} selected entries. Removed {summary['removed']}."
        return redirect(url_for("shop_view", shop_id=shop_id, msg=msg))

    @app.post("/shop/<int:shop_id>/offering/<int:strain_id>/discontinue")
    def discontinue_offering(shop_id: int, strain_id: int) -> Response:
        """Manually discontinue an offering (locked)."""
        reason = request.form.get("reason", "") or "manual"
        until_utc = request.form.get("until_utc", "") or ""
        c = conn()
        set_offering_status(c, shop_id, strain_id, status="discontinued", reason=reason, until_utc=until_utc, lock=True)
        c.close()
        return redirect(url_for("shop_view", shop_id=shop_id, msg="Marked discontinued (locked)."))

    @app.post("/shop/<int:shop_id>/offering/<int:strain_id>/resume")
    def resume_offering(shop_id: int, strain_id: int) -> Response:
        """Resume an offering (unlocked)."""
        c = conn()
        set_offering_status(c, shop_id, strain_id, status="active", lock=False)
        c.close()
        return redirect(url_for("shop_view", shop_id=shop_id, msg="Resumed (unlocked)."))

    @app.get("/api/strain_suggest")
    def api_strain_suggest() -> Response:
        """Autocomplete suggestions for strain names."""
        q = (request.args.get("q", "") or "").strip()
        c = conn()
        if q:
            like = q + "%"
            rows = c.execute(
                "SELECT name_display FROM strains WHERE name_display LIKE ? ORDER BY name_display LIMIT 30;",
                (like,),
            ).fetchall()
        else:
            rows = c.execute("SELECT name_display FROM strains ORDER BY id DESC LIMIT 30;").fetchall()
        c.close()
        return jsonify({"suggestions": [r["name_display"] for r in rows]})

    return app


# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Coffeeshop menu entry app.")
    ap.add_argument("--db", required=True, help="SQLite DB path (shared with scraper).")
    ap.add_argument("--shops", default=DEFAULT_SHOPS_CSV, help="Path to csd.csv for menu checks.")
    ap.add_argument("--menus-dir", default=DEFAULT_MENUS_DIR, help="Folder to store downloaded menus.")
    ap.add_argument("--scraper", default="", help="Path to scrape_update_menus.py (optional).")
    ap.add_argument(
        "--export-json-dir",
        default="",
        help="Folder for JSON exports. Default for UI/export-only is the app folder.",
    )
    ap.add_argument(
        "--export-json-only",
        action="store_true",
        help="Export JSON and exit (do not start Flask server).",
    )
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    args = ap.parse_args()

    db_path = os.path.abspath(args.db)
    app_base_dir = os.path.dirname(os.path.abspath(__file__))
    shops_csv = os.path.abspath(args.shops)
    menus_dir = os.path.abspath(args.menus_dir)
    scraper_path = os.path.abspath(args.scraper) if args.scraper else ""
    json_export_dir = os.path.abspath(args.export_json_dir) if args.export_json_dir else app_base_dir

    c = db_connect(db_path)
    db_init(c)

    if args.export_json_dir or args.export_json_only:
        manifest = export_json_snapshot(c, json_export_dir)
        print(f"[JSON] Exported to: {json_export_dir}")
        counts = manifest.get("counts", {})
        print(
            "[JSON] Counts:",
            f"shops={counts.get('shops', 0)}",
            f"strains={counts.get('strains', 0)}",
            f"active_offerings={counts.get('active_offerings', 0)}",
            f"menu_entries={counts.get('menu_entries', 0)}",
            f"strain_index={counts.get('strain_index', 0)}",
        )

    c.close()

    if args.export_json_only:
        return 0

    app = create_app(
        db_path=db_path,
        shops_csv=shops_csv,
        menus_dir=menus_dir,
        scraper_path=scraper_path or None,
        json_export_dir=json_export_dir,
    )
    app.run(host=args.host, port=args.port, debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

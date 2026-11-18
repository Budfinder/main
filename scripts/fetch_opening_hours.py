#!/usr/bin/env python3
"""Fetch opening hours once from coffeeshopdirect.com.

Every coffeeshopmenus shop page links to the shop's coffeeshopdirect.com page
("More general info"). scrape_update_menus.py saves that link as
shops.info_url. This script reads those pages and writes
database/opening_hours.json, which build_static_pages.py shows on each shop
page with a "check before you go" note.

It is meant to be run by hand, not on every scrape: hours change rarely and
the other site's data is not always current.

  python3 scripts/fetch_opening_hours.py
  python3 scripts/fetch_opening_hours.py --db database/coffeeshops.sqlite --out database/opening_hours.json
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scrape_update_menus import _page_text, download_text  # noqa: E402  (shared HTTP + TLS handling)

DELAY_SEC = 1.0
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_NAMES = {name[:3].lower(): name for name in DAY_ORDER}


TIME_TOKEN = re.compile(r"(?i)\b(noon|midday|midnight|\d{1,2}(?:[.:]\d{2})?\s*[ap]\.?\s*m\b\.?)")


def to_24h(text: str) -> Optional[str]:
    """'10 a.m.' -> '10:00', '9.30 p.m.' -> '21:30', 'midnight' -> '00:00'."""
    t = " ".join(text.lower().split())
    t = re.sub(r"\b([ap])\.?\s*m\b\.?", r"\1m", t)
    if t == "midnight":
        return "00:00"
    if t in {"noon", "midday"}:
        return "12:00"
    m = re.fullmatch(r"(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?", t)
    if not m:
        return None
    hour, minute, half = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if half == "pm" and hour != 12:
        hour += 12
    if half == "am" and hour == 12:
        hour = 0
    if hour > 24 or minute > 59:
        return None
    return f"{hour % 24:02d}:{minute:02d}"


def format_hours(text: str) -> str:
    """'9.30 a.m. 1 a.m.' -> '09:30–01:00'; anything else is kept as written."""
    times = [to_24h(token) for token in TIME_TOKEN.findall(text)]
    if len(times) == 2 and all(times):
        return f"{times[0]}–{times[1]}"
    text = " ".join(text.split()) or "Closed"
    return text[:1].upper() + text[1:]


def parse_hours(html: str) -> Dict[str, object]:
    """The summary line and one row per day from a coffeeshopdirect.com shop page."""
    block = re.search(r'(?is)<div class="itemLabel">\s*Opening Hours\s*</div>(.*?)(?=<div class="item"|$)', html)
    if not block:
        return {"summary": "", "days": []}
    content = block.group(1)
    table = re.search(r"(?is)<table>(.*?)</table>", content)
    summary = _page_text(content[: table.start()] if table else content)
    days: List[Dict[str, str]] = []
    for row in re.findall(r"(?is)<tr>(.*?)</tr>", table.group(1) if table else ""):
        cells = [_page_text(cell) for cell in re.findall(r"(?is)<td[^>]*>(.*?)</td>", row)]
        if not cells:
            continue
        day = DAY_NAMES.get(cells[0].replace(" ", "")[:3].lower())
        if not day:
            continue
        rest = [cell for cell in cells[1:] if cell and cell != "-"]
        days.append({"day": day, "hours": format_hours(" ".join(rest))})
    days.sort(key=lambda item: DAY_ORDER.index(item["day"]))
    return {"summary": summary, "days": days}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", default=str(ROOT / "database" / "coffeeshops.sqlite"))
    ap.add_argument("--out", default=str(ROOT / "database" / "opening_hours.json"))
    args = ap.parse_args()

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    shops = conn.execute(
        """
        SELECT id, name, city, COALESCE(info_url, '') AS info_url
        FROM shops
        WHERE COALESCE(is_closed, 0) = 0 AND COALESCE(show_in_admin, 1) = 1
        ORDER BY city, name;
        """
    ).fetchall()
    conn.close()

    out: Dict[str, object] = {}
    found = missing = errors = 0
    for i, shop in enumerate(shops, start=1):
        label = f"[{i}/{len(shops)}] {shop['city']} - {shop['name']}"
        if not shop["info_url"]:
            missing += 1
            print(f"{label}: no coffeeshopdirect link saved")
            continue
        try:
            hours = parse_hours(download_text(shop["info_url"]))
        except Exception as exc:  # keep going; one bad page should not stop the run
            errors += 1
            print(f"{label}: [ERROR] {exc}")
            time.sleep(DELAY_SEC)
            continue
        if hours["days"] or hours["summary"]:
            found += 1
            out[str(shop["id"])] = {
                "name": shop["name"],
                "city": shop["city"],
                "info_url": shop["info_url"],
                "checked_at_utc": datetime.now(timezone.utc).isoformat(),
                **hours,
            }
            print(f"{label}: {hours['summary'] or len(hours['days'])}")
        else:
            missing += 1
            print(f"{label}: no hours on page")
        time.sleep(DELAY_SEC)

    Path(args.out).write_text(json.dumps({
        "source": "coffeeshopdirect.com",
        "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
        "note": "Fetched once by scripts/fetch_opening_hours.py. Hours change; shown with a check-before-you-go note.",
        "shops": out,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")  # compact: the website loads it
    print(f"\n[SUMMARY] hours for {found} shops, none for {missing}, errors {errors} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

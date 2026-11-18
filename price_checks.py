"""Flag menu prices that are probably typos.

Each active listing's euro price per gram is compared with two things:

1. Fixed limits: under MIN_PER_GRAM or over MAX_PER_GRAM. This also catches
   a pack size entered wrongly (1g prices saved as 3.5g come out at €2-4/g).
2. The same strain at other shops: under STRAIN_LOW_RATIO or over
   STRAIN_HIGH_RATIO times that strain's median, once at least
   STRAIN_MIN_SHOPS shops list it. Cali and regular listings are compared
   separately, because cali versions legitimately cost two to three times more.

A third rule, comparing a price with the rest of the shop's own menu, was
tried and dropped: on real menus it mostly flagged ordinary €10/g strains at
shops whose cali shelf is €30/g.

The JSON export stores the result on every listing as ``price_check`` (a
comma-separated list of reason codes, empty when the price looks fine). The
website still shows a flagged price on the shop's menu, but leaves it out of
lowest, typical and "great price" figures. A price confirmed in the admin is
never flagged again until it changes.

Old menus are handled the same way. A listing whose menu was posted on
coffeeshopmenus more than OLD_MENU_DAYS ago is exported with ``old_menu`` = 1:
it stays on the shop's menu with its date, but its price is left out of
comparisons, including the strain medians used above. Old menus are not
price-checked either: they are already left out, so a flag would only add work.

This module only reads the rows it is given; it never changes the database.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

MIN_PER_GRAM = 4.0
MAX_PER_GRAM = 40.0
STRAIN_LOW_RATIO = 0.4
STRAIN_HIGH_RATIO = 2.5
STRAIN_MIN_SHOPS = 4
OLD_MENU_DAYS = 365

REASONS: Dict[str, str] = {
    "below_floor": f"Under €{MIN_PER_GRAM:g}/g",
    "above_ceiling": f"Over €{MAX_PER_GRAM:g}/g",
    "below_strain": f"Under {STRAIN_LOW_RATIO:.0%} of this strain's typical price",
    "above_strain": f"Over {STRAIN_HIGH_RATIO:g}× this strain's typical price",
}

ConfirmationKey = Tuple[int, str, float, int, float]


def per_gram(row: Dict[str, Any]) -> Optional[float]:
    """Euro price per gram, or None when the row can't be compared."""
    if str(row.get("price_currency") or "€").strip() != "€":
        return None
    if str(row.get("price_unit") or "g").strip().lower() not in {"g", "gram", "grams"}:
        return None
    try:
        value = float(row.get("price_amount"))
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _as_date(value: Any) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value or "").strip()[:10])
    except ValueError:
        return None


def is_old_menu(menu_date: Any, today: Any) -> bool:
    """True when a menu posted on ``menu_date`` is more than OLD_MENU_DAYS old."""
    posted, now = _as_date(menu_date), _as_date(today)
    return bool(posted and now and (now - posted).days > OLD_MENU_DAYS)


def is_comparable(row: Dict[str, Any]) -> bool:
    """False for flagged prices and old menus: shown, but never compared."""
    return not str(row.get("price_check") or "").strip() and not int(row.get("old_menu") or 0)


def _strain_key(row: Dict[str, Any]) -> str:
    """The strain identity, used for confirmations."""
    strain_id = row.get("strain_id")
    if strain_id not in (None, ""):
        return f"id:{strain_id}"
    name = str(row.get("strain_name_normalised") or row.get("strain_name") or "")
    return "name:" + " ".join(name.lower().split())


def confirmation_key(row: Dict[str, Any], price: Optional[float] = None) -> ConfirmationKey:
    """Identify one pack option at one price. A changed price no longer matches."""
    amount = per_gram(row) if price is None else price
    return (
        int(row.get("shop_id") or 0),
        _strain_key(row),
        round(float(row.get("package_weight_g") or 1), 3),
        int(row.get("is_legal") or 0),
        round(float(amount or 0), 4),
    )


def check_prices(rows: Sequence[Dict[str, Any]],
                 confirmed: Iterable[ConfirmationKey] = ()) -> List[List[str]]:
    """Return the reason codes for each row, in the same order as ``rows``."""
    confirmed_keys: Set[ConfirmationKey] = set(confirmed)
    prices = [per_gram(row) for row in rows]

    def group(row: Dict[str, Any]) -> Tuple[str, int]:
        return _strain_key(row), 1 if int(row.get("is_cali") or 0) == 1 else 0

    strain_prices: Dict[Tuple[str, int], List[float]] = defaultdict(list)
    strain_shops: Dict[Tuple[str, int], Set[int]] = defaultdict(set)
    for row, price in zip(rows, prices):
        if price is None or int(row.get("old_menu") or 0):
            continue
        strain_prices[group(row)].append(price)
        strain_shops[group(row)].add(int(row.get("shop_id") or 0))

    strain_median = {
        key: statistics.median(values)
        for key, values in strain_prices.items()
        if len(strain_shops[key]) >= STRAIN_MIN_SHOPS
    }

    results: List[List[str]] = []
    for row, price in zip(rows, prices):
        reasons: List[str] = []
        old = int(row.get("old_menu") or 0) == 1
        if price is not None and not old and confirmation_key(row, price) not in confirmed_keys:
            if price < MIN_PER_GRAM:
                reasons.append("below_floor")
            if price > MAX_PER_GRAM:
                reasons.append("above_ceiling")
            typical = strain_median.get(group(row))
            if typical:
                if price < STRAIN_LOW_RATIO * typical:
                    reasons.append("below_strain")
                if price > STRAIN_HIGH_RATIO * typical:
                    reasons.append("above_strain")
        results.append(reasons)
    return results


def describe(codes: Iterable[str]) -> str:
    """Readable reasons for the admin and the data report."""
    return "; ".join(REASONS.get(code, code) for code in codes if code)


def flagged_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Rows whose exported ``price_check`` field is set, cheapest first."""
    out = [row for row in rows if str(row.get("price_check") or "").strip()]
    return sorted(out, key=lambda row: (str(row.get("shop_city") or "").lower(),
                                        str(row.get("shop_name") or "").lower(),
                                        per_gram(row) or 0))

"""Source-age regression fixtures; no production database is modified."""

import contextlib
import io
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_quality_report import freshness_summary, parse_iso, report_freshness


NOW = datetime(2026, 9, 5, 12, tzinfo=timezone.utc)


def observed(days_ago, **extra):
    return {"menu_changed_at_utc": (NOW - timedelta(days=days_ago)).isoformat(), **extra}


class FreshnessTests(unittest.TestCase):
    def test_one_new_menu_does_not_hide_mostly_stale_data(self):
        rows = [observed(90, shop_id=shop) for shop in range(1, 10)]
        rows.append(observed(0, shop_id=10))
        result = freshness_summary(rows, NOW)
        self.assertEqual(result["buckets"], {"fresh": 1, "ageing": 0, "stale": 9, "unknown": 0})
        self.assertEqual(result["shop_buckets"], result["buckets"])
        warnings = []
        with contextlib.redirect_stdout(io.StringIO()) as output:
            report_freshness(rows, warnings, NOW)
        self.assertIn("9 of 10 listings (90.0%)", output.getvalue())
        self.assertTrue(any("90.0%" in warning and "over 60 days" in warning for warning in warnings))

    def test_undated_and_invalid_rows_are_unknown_in_the_denominator(self):
        rows = [{"shop_id": 1}, {"shop_id": 2, "source_menu_date": "not a date"}, observed(3, shop_id=3)]
        result = freshness_summary(rows, NOW)
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["buckets"]["unknown"], 2)
        self.assertEqual(result["shop_buckets"]["unknown"], 2)
        warnings = []
        with contextlib.redirect_stdout(io.StringIO()):
            report_freshness(rows, warnings, NOW)
        self.assertTrue(any("66.7%" in warning and "unknown" in warning for warning in warnings))

    def test_bulk_refresh_neither_rejuvenates_old_menus_nor_dates_unknown_menus(self):
        batch = {
            "menu_checked_at_utc": NOW.isoformat(),
            "last_seen_at_utc": NOW.isoformat(),
            "updated_at": NOW.isoformat(),
        }
        rows = [observed(80, shop_id=shop, **batch) for shop in range(1, 9)]
        rows += [{"shop_id": shop, **batch} for shop in range(9, 17)]
        result = freshness_summary(rows, NOW)
        self.assertEqual(result["buckets"], {"fresh": 0, "ageing": 0, "stale": 8, "unknown": 8})
        self.assertEqual(result["batch_only"], 8)
        self.assertEqual(result["latest"], NOW - timedelta(days=80))

    def test_a_real_source_observation_is_retained_during_a_shared_refresh(self):
        rows = [{"shop_id": shop, "updated_at": NOW.isoformat()} for shop in range(1, 11)]
        rows[0]["source_checked_at"] = (NOW - timedelta(days=1)).isoformat()
        result = freshness_summary(rows, NOW)
        self.assertEqual(result["buckets"]["fresh"], 1)
        self.assertEqual(result["buckets"]["unknown"], 9)
        self.assertEqual(result["source_fields"], {"source_checked_at": 1})

    def test_source_menu_date_takes_precedence_over_later_observation_and_export(self):
        row = observed(3, source_menu_date="2026-01-01", updated_at=NOW.isoformat())
        result = freshness_summary([row], NOW)
        self.assertEqual(result["buckets"]["stale"], 1)
        self.assertEqual(result["source_fields"], {"source_menu_date": 1})

    def test_age_boundaries_use_utc_calendar_days(self):
        rows = [observed(days) for days in (0, 14, 15, 60, 61)]
        self.assertEqual(freshness_summary(rows, NOW)["buckets"], {"fresh": 2, "ageing": 2, "stale": 1, "unknown": 0})
        self.assertEqual(parse_iso("2026-09-05").tzinfo, timezone.utc)
        self.assertEqual(parse_iso("2026-09-05T01:00:00+02:00").date().isoformat(), "2026-09-04")

    def test_future_dates_cannot_make_listings_look_fresh(self):
        result = freshness_summary([observed(-2)], NOW)
        self.assertEqual(result["buckets"]["unknown"], 1)
        self.assertEqual(result["future_dates"], 1)
        self.assertIsNone(result["latest"])

    def test_shop_coverage_does_not_hide_older_rows_at_a_mixed_age_shop(self):
        rows = [observed(90, shop_id=1), observed(2, shop_id=1), {"shop_id": 2}]
        result = freshness_summary(rows, NOW)
        self.assertEqual(result["shop_total"], 2)
        self.assertEqual(result["shop_buckets"]["fresh"], 1)
        self.assertEqual(result["buckets"]["stale"], 1)
        self.assertEqual(result["buckets"]["unknown"], 1)

    def test_empty_dataset_produces_no_division_errors(self):
        warnings = []
        with contextlib.redirect_stdout(io.StringIO()):
            report_freshness([], warnings, NOW)
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()

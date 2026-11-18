"""Generated shop and strain pages show menu dates, addresses, hours and old menus."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_static_pages as pages
import check_release


def listing(shop_id, name, price, menu_date, old=0):
    return {"shop_id": shop_id, "shop_key": f"cs-{shop_id}", "shop_name": name, "shop_city": "Utrecht",
            "strain_id": 1, "strain_name": "Same Strain", "strain_name_normalised": "same strain",
            "base_type": "hybrid", "price_amount": price, "price_currency": "€", "price_unit": "g",
            "package_weight_g": 1, "price_check": "", "old_menu": old, "source_menu_date": menu_date}


class StaticPageTests(unittest.TestCase):
    def build(self, hours=None):
        root = Path(self.directory.name)
        db = root / "database"
        db.mkdir()
        shops = [
            {"shop_id": 1, "shop_key": "cs-1", "name": "New Shop", "city": "Utrecht", "shop_url": "https://x/1",
             "show_in_admin": 1, "is_closed": 0, "menu_status": "processed", "address": "New Shop, Street 1, Utrecht",
             "source_menu_date": "2026-10-01"},
            {"shop_id": 2, "shop_key": "cs-2", "name": "Old Shop", "city": "Utrecht", "shop_url": "https://x/2",
             "show_in_admin": 1, "is_closed": 0, "menu_status": "processed", "address": "Street 2, Utrecht",
             "source_menu_date": "2016-01-28"},
        ]
        offerings = [listing(1, "New Shop", 10, "2026-10-01"), listing(2, "Old Shop", 6, "2016-01-28", old=1)]
        (db / "shops.json").write_text(json.dumps(shops))
        (db / "active_offerings.json").write_text(json.dumps(offerings))
        snapshot = "2026-11-18T09:00:00+00:00"
        (db / "home_summary.json").write_text(json.dumps({
            "exported_at_utc": snapshot, "network": {"active_shops": 2, "active_listings": 2}
        }))
        (db / "manifest.json").write_text(json.dumps({"exported_at_utc": snapshot}))
        if hours:
            (db / "opening_hours.json").write_text(json.dumps(hours))
        pages.build(root)
        return root

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.directory.cleanup()

    def read(self, root, path):
        return (root / path / "index.html").read_text(encoding="utf-8")

    def test_release_detects_a_partial_upload_and_rebuilds_consistently(self):
        root = self.build()
        self.assertEqual(check_release.verify(root), [])
        directory = root / "coffeeshops" / "index.html"
        directory.write_text(directory.read_text() + "stale page")
        self.assertTrue(any("coffeeshops/index.html" in error for error in check_release.verify(root)))
        pages.build(root)
        self.assertEqual(check_release.verify(root), [])

    def test_city_strain_links_keep_the_city_in_the_comparison(self):
        root = self.build()
        city = self.read(root, "coffeeshops/utrecht")
        self.assertIn("detail=strain&amp;strain=Same+Strain&amp;filter_city=Utrecht", city)
        self.assertIn("Compare in Utrecht", city)

    def test_old_menu_is_shown_with_its_date_but_not_compared(self):
        root = self.build()
        old = self.read(root, "coffeeshops/utrecht/old-shop")
        self.assertIn("Menu dated 28 January 2016", old)
        self.assertIn("over a year old", old)
        self.assertIn("from €6/g", old, "the shop's own page still shows its own prices")
        self.assertIn("Street 2, Utrecht", old)
        new = self.read(root, "coffeeshops/utrecht/new-shop")
        self.assertIn("Street 1, Utrecht", new)
        self.assertNotIn("New Shop, Street 1", new, "the shop name is not repeated in the address")
        self.assertNotIn("over a year old", new)
        strain = self.read(root, "strains/same-strain")
        self.assertIn("Old menu", strain)
        self.assertNotIn("from €6/g", strain, "the old €6 menu never becomes the lowest price")

    def test_opening_hours_appear_with_source_and_warning(self):
        hours = {"fetched_at_utc": "2026-11-18T10:00:00+00:00", "shops": {"1": {
            "info_url": "https://www.coffeeshopdirect.com/new.html", "summary": "Mon-Sun 10:00-23:00",
            "checked_at_utc": "2026-11-18T10:00:00+00:00",
            "days": [{"day": "Monday", "hours": "10:00–23:00"}, {"day": "Sunday", "hours": "Closed"}]}}}
        root = self.build(hours)
        new = self.read(root, "coffeeshops/utrecht/new-shop")
        self.assertIn("Opening hours", new)
        self.assertIn("<th scope=\"row\">Monday</th><td>10:00–23:00</td>", new)
        self.assertIn("checked 18 November 2026. Hours change, so check before you go.", new)
        self.assertIn("https://www.coffeeshopdirect.com/new.html", new)
        self.assertNotIn("Opening hours", self.read(root, "coffeeshops/utrecht/old-shop"))


class InPlaceRebuildTests(unittest.TestCase):
    """Rebuilds update pages in place, so sync tools never see folders vanish."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        StaticPageTests.build(self)

    def tearDown(self):
        self.directory.cleanup()

    def test_second_run_leaves_unchanged_pages_alone_and_tidies_leftovers(self):
        page = self.root / "coffeeshops/utrecht/new-shop/index.html"
        os_times = (1_000_000_000, 1_000_000_000)
        import os
        os.utime(page, os_times)
        stale = self.root / "strains/gone-strain/index.html"
        stale.parent.mkdir(parents=True)
        stale.write_text("old page")
        (self.root / "strains/same-strain 2").mkdir()  # what iCloud leaves behind

        counts = pages.build(self.root)

        self.assertEqual(counts["files_written"], 0)
        self.assertEqual(counts["files_removed"], 1)
        self.assertEqual(page.stat().st_mtime, os_times[1], "an unchanged page is not rewritten")
        self.assertFalse(stale.parent.exists(), "a page that is no longer produced is removed")
        self.assertFalse((self.root / "strains/same-strain 2").exists(), "empty leftover folders are removed")
        self.assertTrue((self.root / "strains/same-strain/index.html").exists())

    def test_refuses_a_folder_it_did_not_create(self):
        (self.root / "strains" / pages.MARKER_FILE).unlink()
        with self.assertRaises(SystemExit):
            pages.build(self.root)


if __name__ == "__main__":
    unittest.main()

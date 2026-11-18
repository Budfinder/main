"""Menu dates, addresses and info links are read from coffeeshopmenus shop pages."""
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scrape_update_menus as scraper

PAGE = """
<h1><img src="border/GFX/logo.png" alt="The Border logo" class="ShopPageLogo"></h1>
<b>The Border</b>, Amstelveenseweg 1160, Amsterdam 1081 JW<br>
<br>
<a href="https://www.coffeeshopdirect.com/border.html" target="_blank">More general info on the <b>ACD</b> page</a>
<br><br><hr><br>
    22 January 2025
<br>
by Bruce van Dam
<br><br>
<img class="MenuPic" src="border/Menus/220125a.jpg" width="953" height="589">
<br>
<img class="MenuPic" src="border/Menus/220125b.jpg" width="1103" height="368">
"""


class ShopPageDetailTests(unittest.TestCase):
    def test_reads_date_address_and_info_link(self):
        details = scraper.parse_shop_page_details("https://www.coffeeshopmenus.org/cs-border.html", PAGE)
        self.assertEqual(details, {
            "menu_date": "2025-01-22",
            "address": "Amstelveenseweg 1160, Amsterdam 1081 JW",
            "info_url": "https://www.coffeeshopdirect.com/border.html",
        })

    def test_contributor_name_is_not_kept(self):
        details = scraper.parse_shop_page_details("https://www.coffeeshopmenus.org/cs-border.html", PAGE)
        self.assertNotIn("Bruce", " ".join(details.values()))

    def test_missing_or_odd_dates_give_nothing(self):
        self.assertEqual(scraper.parse_menu_date('<hr><img class="MenuPic" src="a.jpg">'), "")
        self.assertEqual(scraper.parse_menu_date('<hr> 31 February 2026 <img class="MenuPic" src="a.jpg">'), "")
        self.assertEqual(scraper.parse_menu_date('<hr> 3 Sept 2025 <img class="MenuPic" src="a.jpg">'), "2025-09-03")
        # A date further down, after the menu picture, is not the menu's date.
        self.assertEqual(scraper.parse_menu_date('<hr><img class="MenuPic" src="a.jpg"> 1 May 2020'), "")

    def test_details_are_saved_without_touching_the_menu(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        scraper.db_init(conn)
        shop_id = scraper.upsert_shop(conn, "The Border", "Amsterdam", "https://x/cs-border.html", True, False)
        scraper.upsert_menu(conn, shop_id, "https://x", "https://x/a.jpg", "a.jpg", "abc", 10, "processed")
        scraper.save_shop_details(conn, shop_id, {"address": "", "info_url": "https://www.coffeeshopdirect.com/border.html"},
                                  fallback_address="From the CSV 1")
        scraper.save_menu_date(conn, shop_id, "2025-01-22")
        shop = conn.execute("SELECT address, info_url FROM shops WHERE id = ?", (shop_id,)).fetchone()
        menu = conn.execute("SELECT source_menu_date, sha256, status FROM menus WHERE shop_id = ?", (shop_id,)).fetchone()
        self.assertEqual(tuple(shop), ("From the CSV 1", "https://www.coffeeshopdirect.com/border.html"))
        self.assertEqual(tuple(menu), ("2025-01-22", "abc", "processed"))


class OpeningHoursTests(unittest.TestCase):
    def test_hours_table_becomes_24_hour_times_from_monday(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import fetch_opening_hours as hours
        page = """
        <div class="item"><div class="itemLabel">Opening Hours</div>
          <div class="itemContent openHrsHover"> Sun-Wed 10:00-23:00; Thu-Sat 10:00-00:00
            <div id="hoursBox"><table>
              <tr><td>Sun<span class="longVer">day</span></td><td>Noon</td><td>-</td><td>9.30 p.m.</td></tr>
              <tr><td>Mon<span class="longVer">day</span></td><td>9.30 a.m.</td><td>-</td><td>1 a.m.</td></tr>
              <tr><td>Wed<span class="longVer">nesday</span></td><td>closed</td></tr>
            </table></div></div></div>
        <div class="item"><div class="itemLabel">Telephone</div></div>
        """
        self.assertEqual(hours.parse_hours(page), {
            "summary": "Sun-Wed 10:00-23:00; Thu-Sat 10:00-00:00",
            "days": [
                {"day": "Monday", "hours": "09:30–01:00"},
                {"day": "Wednesday", "hours": "Closed"},
                {"day": "Sunday", "hours": "12:00–21:30"},
            ],
        })
        self.assertEqual(hours.format_hours("10 a.m. midnight"), "10:00–00:00")


if __name__ == "__main__":
    unittest.main()

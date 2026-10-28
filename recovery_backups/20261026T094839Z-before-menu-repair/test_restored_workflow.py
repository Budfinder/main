"""Regression checks for the restored workflow; only temporary databases."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import coffeeshop_menu_app as admin
import scrape_update_menus as scraper


class RestoredWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / 'shops.sqlite'
        self.c = admin.db_connect(str(self.db))
        self.addCleanup(self.c.close)
        admin.db_init(self.c)
        self.shop = scraper.ShopRow('Test shop', 'Amsterdam', 'https://www.coffeeshopmenus.org/Test.html', True, False)
        self.sid = scraper.upsert_shop(self.c, self.shop.shop, self.shop.city, self.shop.shop_url, True, False)
        sha = scraper.menu_set_sha([scraper.sha256_bytes(b'old')])
        scraper.upsert_menu(self.c, self.sid, self.shop.shop_url, 'old.jpg', 'old.jpg', sha, 3, 'processed')
        scraper.record_menu_history(self.c, self.sid, self.shop.shop_url, 'old.jpg', 'old.jpg', sha, 3, 'new_menu', 'processed')
        ok, message = admin.add_or_update_menu_entry(self.c, self.sid, 'Old strain', 'hybrid', False, False, '', '', '€', '10', '1', '', '')
        self.assertTrue(ok, message)

    def changed_menu(self):
        args = ['scrape', '--shops', 'fixture.csv', '--db', str(self.db), '--out-dir', str(self.root / 'images')]
        with patch.object(sys, 'argv', args), patch.object(scraper, 'read_shops_csv', return_value=[self.shop]), \
             patch.object(scraper, 'download_text', return_value='<img src="/Menus/latest.jpg">'), \
             patch.object(scraper, 'download_image_bytes', return_value=b'changed'), \
             patch.object(scraper.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(scraper.main(), 0)

    def test_new_image_clears_old_entries_and_archives_old_stock(self):
        self.changed_menu()
        self.assertEqual(admin.count_menu_entries_for_shop(self.c, self.sid), 0)
        self.assertEqual(admin.count_active_offerings_for_shop(self.c, self.sid), 0)
        row = self.c.execute('SELECT status,discontinued_reason FROM shop_offerings').fetchone()
        self.assertEqual(tuple(row), ('discontinued', 'new menu pending rebuild'))
        self.assertEqual(self.c.execute('SELECT status FROM menus').fetchone()[0], 'new')
        self.assertGreater(self.c.execute('SELECT COUNT(*) FROM offering_history').fetchone()[0], 0)

    def test_entering_then_finishing_only_publishes_new_menu(self):
        self.changed_menu()
        ok, message = admin.add_or_update_menu_entry(self.c, self.sid, 'Fresh strain', 'hybrid', True, True, '', '', '€', '35', '3.5', '', '')
        self.assertTrue(ok, message)
        active = self.c.execute("SELECT price_amount,package_weight_g,is_legal FROM shop_offerings WHERE status='active'").fetchall()
        self.assertEqual([tuple(r) for r in active], [(10, 3.5, 1)])
        app = admin.create_app(str(self.db), 'fixture.csv', str(self.root / 'images'), json_export_dir=str(self.root / 'export'))
        app.config['TESTING'] = True
        self.assertEqual(app.test_client().get(f'/shop/{self.sid}/finish').status_code, 302)
        active = self.c.execute("SELECT st.name_display FROM shop_offerings so JOIN strains st ON st.id=so.strain_id WHERE so.status='active'").fetchall()
        self.assertEqual([r[0] for r in active], ['Fresh strain'])
        self.assertEqual(self.c.execute('SELECT status FROM menus').fetchone()[0], 'processed')

    def test_restored_admin_has_no_new_city_or_shop_selection_controls(self):
        app = admin.create_app(str(self.db), 'fixture.csv', str(self.root / 'images'), json_export_dir=str(self.root / 'export'))
        app.config['TESTING'] = True
        response = app.test_client().get('/')
        self.assertEqual(response.status_code, 200)
        page = response.get_data(as_text=True)
        self.assertNotIn('checkCity', page)
        self.assertNotIn('menuCheckForm', page)
        self.assertIn('Check now', page)


if __name__ == '__main__':
    unittest.main(verbosity=2)

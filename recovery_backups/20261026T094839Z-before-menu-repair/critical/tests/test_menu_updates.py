"""Scoped menu checks and review publishing, using disposable databases only."""

import contextlib
import csv
import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import coffeeshop_menu_app as admin
except ModuleNotFoundError as exc:
    if exc.name == 'flask':
        raise unittest.SkipTest('Menu admin tests require Flask (see README).') from exc
    raise
import scrape_update_menus as scraper


class MenuUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='budfinder-menu-tests-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'database').mkdir()
        self.db = self.root / 'database/coffeeshops.sqlite'
        self.csv = self.root / 'database/csd.csv'
        self.images = self.root / 'images'
        self.rows = [
            scraper.ShopRow('Amsterdam One', 'Amsterdam', '/shops/one.html', True, False),
            scraper.ShopRow('Amsterdam Pending', 'Amsterdam', '/shops/pending.html', True, False),
            scraper.ShopRow('Haarlem One', 'Haarlem', '/shops/haarlem.html', True, False),
            scraper.ShopRow('Closed', 'Amsterdam', '/shops/closed.html', True, True),
            scraper.ShopRow('Hidden', 'Amsterdam', '/shops/hidden.html', False, False),
        ]
        with self.csv.open('w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['shop', 'city', 'shop_url', 'show_in_admin', 'is_closed'])
            for row in self.rows:
                writer.writerow([row.shop, row.city, row.shop_url, int(row.show_in_admin), int(row.is_closed)])
        self.conn = admin.db_connect(str(self.db))
        self.addCleanup(self.conn.close)
        admin.db_init(self.conn)
        self.ids = []
        old_hash = scraper.menu_set_sha([scraper.sha256_bytes(b'old')])
        for row in self.rows[:3]:
            sid = scraper.upsert_shop(self.conn, row.shop, row.city, row.shop_url, True, False)
            self.ids.append(sid)
            scraper.upsert_menu(self.conn, sid, row.shop_url, 'https://www.coffeeshopmenus.org/Menus/old.jpg',
                                str(self.root / 'old.jpg'), old_hash, 3, 'processed')
            scraper.record_menu_history(self.conn, sid, row.shop_url, 'old.jpg', 'old.jpg', old_hash,
                                        3, 'new_menu', 'processed', '')
            ok, message = admin.add_or_update_menu_entry(
                self.conn, sid, 'Original', 'hybrid', False, False, '', '', '€', '10', '1', '', '')
            self.assertTrue(ok, message)
        self.conn.execute("UPDATE menu_history SET fetched_at_utc='2026-01-02T00:00:00+00:00'")
        self.conn.execute("UPDATE menus SET status='new' WHERE shop_id=?", (self.ids[1],))
        self.conn.commit()
        self.app = admin.create_app(str(self.db), str(self.csv), str(self.images),
                                    scraper_path=str(Path(scraper.__file__)),
                                    json_export_dir=str(self.root / 'export'))
        self.app.config.update(TESTING=True, BASE_DIR=str(self.root))
        self.client = self.app.test_client()

    def run_scrape(self, *filters):
        args = ['scrape', '--shops', str(self.csv), '--db', str(self.db), '--out-dir', str(self.images), *filters]
        with patch.object(sys, 'argv', args), \
             patch.object(scraper, 'download_text', return_value='<img src="/Menus/current.jpg">') as download, \
             patch.object(scraper, 'download_image_bytes', return_value=b'new'), \
             patch.object(scraper.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
            code = scraper.main()
        return code, download

    def test_city_and_individual_filters_validate_before_changes(self):
        self.assertEqual(len(scraper.select_shops(self.rows, [' amSTerdam '])), 2)
        selected = scraper.select_shops(self.rows, ['Amsterdam'], ['https://www.coffeeshopmenus.org/shops/one.html'])
        self.assertEqual([r.shop for r in selected], ['Amsterdam One'])
        self.assertEqual(len(scraper.select_shops(self.rows, ['Amsterdam', 'Haarlem'])), 3)
        for cities, urls in [(['Missing'], []), (['Amsterdam'], ['/shops/haarlem.html']),
                             ([], ['/shops/closed.html']), ([], ['/shops/hidden.html']), ([], ['https://example.com/'])]:
            with self.subTest(cities=cities, urls=urls), self.assertRaises(ValueError):
                scraper.select_shops(self.rows, cities, urls)

    def test_amsterdam_check_preserves_other_city_and_pending_draft(self):
        def snapshot(sid):
            return {table: [tuple(r) for r in self.conn.execute(f'SELECT * FROM {table} WHERE shop_id=?', (sid,))]
                    for table in ['menus', 'menu_entries', 'shop_offerings', 'menu_history', 'offering_history']}
        other_before = snapshot(self.ids[2])
        pending_before = snapshot(self.ids[1])
        old_offering = tuple(self.conn.execute('SELECT * FROM shop_offerings WHERE shop_id=?', (self.ids[0],)).fetchone())
        code, download = self.run_scrape('--city', 'Amsterdam')
        self.assertEqual(code, 0)
        self.assertEqual(download.call_count, 1)
        self.assertEqual(snapshot(self.ids[2]), other_before)
        self.assertEqual(snapshot(self.ids[1]), pending_before)
        self.assertEqual(tuple(self.conn.execute('SELECT * FROM shop_offerings WHERE shop_id=?', (self.ids[0],)).fetchone()), old_offering)
        self.assertEqual(admin.count_menu_entries_for_shop(self.conn, self.ids[0]), 1)

    def test_individual_check_only_downloads_selected_shop(self):
        code, download = self.run_scrape('--shop-url', '/shops/haarlem.html')
        self.assertEqual(code, 0)
        self.assertEqual(download.call_args.args, ('https://www.coffeeshopmenus.org/shops/haarlem.html',))
        self.assertEqual(self.conn.execute('SELECT status FROM menus WHERE shop_id=?', (self.ids[0],)).fetchone()[0], 'processed')

    def test_invalid_cli_scope_stops_before_opening_database_or_downloading(self):
        args = ['scrape', '--shops', str(self.csv), '--db', str(self.root / 'must-not-exist.sqlite'), '--city', 'Missing']
        with patch.object(sys, 'argv', args), patch.object(scraper, 'download_text') as download, \
             contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            scraper.main()
        download.assert_not_called()
        self.assertFalse((self.root / 'must-not-exist.sqlite').exists())

    def test_pending_queue_does_not_block_preflight_but_integrity_checks_remain(self):
        with self.csv.open('a', newline='') as handle:
            writer = csv.writer(handle)
            for i in range(100):
                writer.writerow([f'Hidden {i}', 'Amsterdam', f'/shops/hidden{i}.html', 0, 0])
        with patch.object(admin, 'MIN_KNOWN_MENU_HASHES_BEFORE_SCRAPE', 0), \
             patch.object(admin, 'MIN_ACTIVE_OFFERINGS_BEFORE_SCRAPE', 0):
            self.assertEqual(admin.scrape_preflight_errors(str(self.db), str(self.csv), str(self.root)), [])
            self.assertTrue(admin.scrape_preflight_errors(str(self.db), str(self.csv), str(self.root / 'wrong')))

    def test_pending_addition_and_removal_do_not_change_live_offerings(self):
        self.run_scrape('--city', 'Amsterdam')
        sid = self.ids[0]
        entry = self.conn.execute('SELECT id FROM menu_entries WHERE shop_id=?', (sid,)).fetchone()[0]
        admin.delete_menu_entry_by_id(self.conn, sid, entry)
        ok, message = admin.add_or_update_menu_entry(
            self.conn, sid, 'New addition', 'hybrid', False, True, '', '', '€', '35', '3.5', '', '')
        self.assertTrue(ok, message)
        rows = self.conn.execute('SELECT price_amount, package_weight_g, is_legal FROM shop_offerings WHERE shop_id=?', (sid,)).fetchall()
        self.assertEqual([tuple(r) for r in rows], [(10, 1, 0)])
        admin.reconcile_offerings_for_shop(self.conn, sid)
        admin.mark_menu_processed(self.conn, sid)
        rows = self.conn.execute("SELECT package_price_amount, package_weight_g, is_legal FROM shop_offerings WHERE shop_id=? AND status='active'", (sid,)).fetchall()
        self.assertEqual([tuple(r) for r in rows], [(35, 3.5, 1)])

    def test_pending_edits_publish_only_after_finish_with_original_source_date(self):
        self.run_scrape('--city', 'Amsterdam')
        sid = self.ids[0]
        entry = self.conn.execute('SELECT id FROM menu_entries WHERE shop_id=?', (sid,)).fetchone()[0]
        ok, message = admin.update_menu_entry_by_id(
            self.conn, sid, entry, 'Replacement', 'hybrid', False, False, '', '', '€', '12', '1', '', '')
        self.assertTrue(ok, message)
        self.assertEqual(self.conn.execute('SELECT price_amount FROM shop_offerings WHERE shop_id=?', (sid,)).fetchone()[0], 10)
        output = self.root / 'snapshot'
        admin.export_json_snapshot(self.conn, str(output))
        listings = json.loads((output / 'active_offerings.json').read_text())
        old = next(r for r in listings if r['shop_id'] == sid)
        self.assertEqual(old['strain_name'], 'Original')
        self.assertEqual(old['menu_changed_at_utc'], '2026-01-02T00:00:00+00:00')
        self.assertTrue(old['menu_update_pending'])
        self.assertFalse(any(r['shop_id'] == sid for r in json.loads((output / 'menu_entries.json').read_text())))
        response = self.client.get(f'/shop/{sid}/finish?city=Amsterdam')
        self.assertEqual(response.status_code, 302)
        self.assertIn('city=Amsterdam', response.location)
        listings = json.loads((self.root / 'export/active_offerings.json').read_text())
        new = next(r for r in listings if r['shop_id'] == sid)
        self.assertEqual((new['strain_name'], new['price_amount'], new['menu_update_pending']), ('Replacement', 12, False))
        self.assertEqual(self.conn.execute("SELECT status FROM shop_offerings WHERE shop_id=? AND price_amount=10", (sid,)).fetchone()[0], 'discontinued')

    def test_queue_and_navigation_remain_in_city(self):
        page = self.client.get('/queue?city=Amsterdam').get_data(as_text=True)
        self.assertIn(f'/shop/{self.ids[1]}?city=Amsterdam', page)
        self.assertNotIn(f'/shop/{self.ids[2]}?', page)
        response = self.client.get('/start?city=Amsterdam')
        self.assertIn(f'/shop/{self.ids[1]}?city=Amsterdam', response.location)
        page = self.client.get(response.location).get_data(as_text=True)
        self.assertIn(f'/shop/{self.ids[1]}/load_active?city=Amsterdam', page)
        self.assertNotIn('Haarlem One', page)

    def test_admin_validates_scope_and_passes_exact_selection(self):
        result = dict(ok=True, returncode=0, stdout='', stderr='', duration_s=0,
                      summary=dict(new=0, unchanged=1, errors=0, skipped=0))
        with patch.object(admin, 'scrape_preflight_errors', return_value=[]), \
             patch.object(admin, 'run_scrape_update', return_value=result) as run:
            response = self.client.post('/check_menus', data={'city': 'Amsterdam', 'shop_url': '/shops/one.html'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(run.call_args.kwargs['cities'], ['Amsterdam'])
            self.assertEqual(run.call_args.kwargs['shop_urls'], ['https://www.coffeeshopmenus.org/shops/one.html'])
            self.assertIn('city=Amsterdam', response.get_data(as_text=True))
            run.reset_mock()
            response = self.client.post('/check_menus', data={'city': 'Amsterdam', 'shop_url': '/shops/haarlem.html'})
            self.assertIn('outside the selected city', response.get_data(as_text=True))
            run.assert_not_called()

    def test_menu_selector_renders_only_available_shops(self):
        page = self.client.get('/?city=Amsterdam').get_data(as_text=True)
        self.assertIn('id="checkCity"', page)
        self.assertIn('value="Amsterdam" selected', page)
        self.assertIn('name="shop_url" value="/shops/one.html"', page)
        self.assertNotIn('value="/shops/closed.html"', page)
        self.assertNotIn('value="/shops/hidden.html"', page)


if __name__ == '__main__':
    unittest.main()

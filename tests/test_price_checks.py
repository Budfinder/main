"""Price checks flag likely typos without hiding real menus or comparing unlike prices."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import price_checks as pc


def row(shop, price, strain=1, weight=1, legal=0, currency='€', unit='g'):
    return {'shop_id': shop, 'strain_id': strain, 'price_amount': price, 'price_currency': currency,
            'price_unit': unit, 'package_weight_g': weight, 'is_legal': legal}


class PriceCheckTests(unittest.TestCase):
    def test_fixed_limits_flag_impossible_prices(self):
        rows = [row(1, 1.0, strain=1), row(2, 46.0, strain=2), row(3, 4.0, strain=3), row(4, 40.0, strain=4)]
        self.assertEqual(pc.check_prices(rows), [['below_floor'], ['above_ceiling'], [], []])

    def test_strain_comparison_needs_enough_shops(self):
        few = [row(1, 10), row(2, 10), row(3, 3.5)]
        self.assertEqual(pc.check_prices(few)[2], ['below_floor'])
        many = [row(shop, 12) for shop in range(1, 5)] + [row(5, 4.5), row(6, 31)]
        result = pc.check_prices(many)
        self.assertEqual(result[4], ['below_strain'])
        self.assertEqual(result[5], ['above_strain'])
        self.assertEqual(result[:4], [[], [], [], []])

    def test_cali_and_regular_listings_are_compared_separately(self):
        regular = [row(shop, 10) for shop in range(1, 5)]
        cali = [dict(row(shop, 30), is_cali=1) for shop in range(5, 9)]
        self.assertEqual(pc.check_prices(regular + cali), [[]] * 8)
        cheap_cali = dict(row(9, 9), is_cali=1)
        self.assertEqual(pc.check_prices(regular + cali + [cheap_cali])[-1], ['below_strain'])

    def test_a_pack_size_typo_is_caught_by_the_floor(self):
        typo = row(1, 12 / 3.5, weight=3.5)  # a 1g price saved as a 3.5g pack
        self.assertEqual(pc.check_prices([typo]), [['below_floor']])

    def test_confirmed_price_is_trusted_until_it_changes(self):
        cheap = row(1, 2.5)
        confirmed = [pc.confirmation_key(cheap)]
        self.assertEqual(pc.check_prices([cheap], confirmed), [[]])
        self.assertEqual(pc.check_prices([row(1, 2.0)], confirmed), [['below_floor']])
        self.assertEqual(pc.check_prices([row(1, 2.5, weight=3.5)], confirmed), [['below_floor']])

    def test_other_currencies_units_and_missing_prices_are_ignored(self):
        rows = [row(1, 1.0, currency='$'), row(2, 1.0, unit='each'), row(3, None), row(4, 0)]
        self.assertEqual(pc.check_prices(rows), [[], [], [], []])

    def test_old_menus_never_set_the_strain_median(self):
        current = [row(shop, 10) for shop in range(1, 5)]
        old = [dict(row(shop, 30), old_menu=1) for shop in range(5, 9)]
        # Four old €30 menus would make €10 look cheap; they are left out.
        self.assertEqual(pc.check_prices(current + old)[:4], [[]] * 4)
        # An old menu is already left out, so it is not flagged either.
        self.assertEqual(pc.check_prices([dict(row(1, 1.0), old_menu=1)]), [[]])

    def test_a_menu_is_old_after_a_year(self):
        self.assertFalse(pc.is_old_menu('2025-11-18', '2026-11-18T09:00:00+00:00'))
        self.assertTrue(pc.is_old_menu('2025-11-17', '2026-11-18T09:00:00+00:00'))
        self.assertFalse(pc.is_old_menu('', '2026-11-18'))
        self.assertFalse(pc.is_old_menu('not a date', '2026-11-18'))
        self.assertFalse(pc.is_comparable({'old_menu': 1}))
        self.assertFalse(pc.is_comparable({'price_check': 'below_floor'}))
        self.assertTrue(pc.is_comparable({'old_menu': 0, 'price_check': ''}))

    def test_descriptions_and_flagged_rows(self):
        self.assertIn('€4/g', pc.describe(['below_floor']))
        rows = [{'shop_name': 'B', 'shop_city': 'X', 'price_check': 'below_floor', 'price_amount': 2},
                {'shop_name': 'A', 'shop_city': 'X', 'price_check': '', 'price_amount': 9},
                {'shop_name': 'A', 'shop_city': 'X', 'price_check': 'above_ceiling', 'price_amount': 50}]
        self.assertEqual([r['shop_name'] for r in pc.flagged_rows(rows)], ['A', 'B'])



class AdminPriceCheckTests(unittest.TestCase):
    """Export flags a typo; the admin can confirm it and undo the confirmation."""

    def test_export_flag_confirm_and_undo(self):
        import json
        import tempfile
        try:
            import coffeeshop_menu_app as admin
        except ModuleNotFoundError as exc:
            if exc.name == 'flask':
                self.skipTest('Admin integration fixture requires Flask')
            raise
        with tempfile.TemporaryDirectory() as directory:
            db = str(Path(directory) / 'fixture.sqlite')
            conn = admin.db_connect(db)
            try:
                admin.db_init(conn)
                conn.execute('INSERT INTO shops(id,name,city,shop_url,created_at,updated_at) VALUES(1,?,?,?,?,?)',
                             ('Fixture Shop', 'Amsterdam', '', '2026-01-01', '2026-01-01'))
                for strain, price in (('Normal Strain', '12'), ('Typo Strain', '1')):
                    ok, message = admin.add_or_update_menu_entry(conn, 1, strain, 'hybrid', False, False,
                                                                 '', '', '€', price, '1', '', '')
                    self.assertTrue(ok, message)
                admin.reconcile_offerings_for_shop(conn, 1)
                manifest = admin.export_json_snapshot(conn, directory)
            finally:
                conn.close()
            self.assertEqual(manifest['counts']['price_checks'], 1)
            self.assertIn('skipped', manifest['static_pages'])

            def flags():
                rows = json.loads((Path(directory) / 'active_offerings.json').read_text())
                return {row['strain_name']: row['price_check'] for row in rows}

            self.assertEqual(flags(), {'Normal Strain': '', 'Typo Strain': 'below_floor'})
            summary = json.loads((Path(directory) / 'home_summary.json').read_text())
            self.assertEqual(summary['network']['median_listing_price'], 12)

            app = admin.create_app(db, 'fixture.csv', directory, json_export_dir=directory)
            app.config['TESTING'] = True
            with app.test_client() as client:
                page = client.get('/price-checks').get_data(as_text=True)
                self.assertIn('1 price to check', page)
                self.assertIn('Typo Strain', page)
                self.assertIn('Price checks (1)', client.get('/').get_data(as_text=True))
                typo = next(row for row in json.loads((Path(directory) / 'active_offerings.json').read_text())
                            if row['strain_name'] == 'Typo Strain')
                form = {key: str(typo[key]) for key in ('shop_id', 'strain_id', 'package_weight_g', 'is_legal', 'price_amount')}
                self.assertEqual(client.post('/price-checks/confirm', data=form).status_code, 302)
                self.assertEqual(flags()['Typo Strain'], '')
                self.assertIn('Prices marked correct', client.get('/price-checks').get_data(as_text=True))
                self.assertEqual(client.post('/price-checks/undo', data=form).status_code, 302)
                self.assertEqual(flags()['Typo Strain'], 'below_floor')

    def test_export_marks_old_menus_and_keeps_their_dates(self):
        import json
        import tempfile
        try:
            import coffeeshop_menu_app as admin
        except ModuleNotFoundError as exc:
            if exc.name == 'flask':
                self.skipTest('Admin integration fixture requires Flask')
            raise
        with tempfile.TemporaryDirectory() as directory:
            conn = admin.db_connect(str(Path(directory) / 'fixture.sqlite'))
            try:
                admin.db_init(conn)
                for shop_id, name, menu_date, price in ((1, 'New Shop', '2026-10-01', '10'), (2, 'Old Shop', '2016-01-28', '6')):
                    conn.execute('INSERT INTO shops(id,name,city,shop_url,created_at,updated_at,address) VALUES(?,?,?,?,?,?,?)',
                                 (shop_id, name, 'Utrecht', '', '2026-01-01', '2026-01-01', f'{name} Street 1'))
                    conn.execute("INSERT INTO menus(shop_id,fetched_at_utc,source_page_url,image_url,local_path,sha256,bytes,status,error,source_menu_date)"
                                 " VALUES(?,?,?,?,?,?,?,?,?,?)",
                                 (shop_id, '2026-11-18', '', '', '', 'x', 1, 'processed', '', menu_date))
                    ok, message = admin.add_or_update_menu_entry(conn, shop_id, 'Same Strain', 'hybrid', False, False,
                                                                 '', '', '€', price, '1', '', '')
                    self.assertTrue(ok, message)
                    admin.reconcile_offerings_for_shop(conn, shop_id)
                manifest = admin.export_json_snapshot(conn, directory)
            finally:
                conn.close()
            rows = {r['shop_name']: r for r in json.loads((Path(directory) / 'active_offerings.json').read_text())}
            self.assertEqual((rows['Old Shop']['old_menu'], rows['Old Shop']['source_menu_date']), (1, '2016-01-28'))
            self.assertEqual((rows['New Shop']['old_menu'], rows['New Shop']['source_menu_date']), (0, '2026-10-01'))
            self.assertEqual(manifest['counts']['old_menu_listings'], 1)
            shops = {s['name']: s for s in json.loads((Path(directory) / 'shops.json').read_text())}
            self.assertEqual(shops['Old Shop']['address'], 'Old Shop Street 1')
            summary = json.loads((Path(directory) / 'home_summary.json').read_text())
            self.assertEqual(summary['network']['median_listing_price'], 10, 'the old €6 menu is left out')
            self.assertEqual(summary['network']['median_listing_count'], 1)
            top = summary['top_strains'][0]
            self.assertEqual((top['shop_count'], top['average_price']), (2, 10),
                             'both shops count as listing it, but only the current price sets the average')


if __name__ == '__main__':
    unittest.main()

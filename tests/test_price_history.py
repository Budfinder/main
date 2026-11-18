"""Price timelines must reconstruct snapshots without altering source records."""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from price_history import build_price_history, price_history_errors, shop_price_history_errors


class PriceHistoryTests(unittest.TestCase):
    def setUp(self):
        self.c = sqlite3.connect(':memory:')
        self.c.row_factory = sqlite3.Row
        self.addCleanup(self.c.close)
        self.c.executescript('''
            CREATE TABLE strains (id INTEGER PRIMARY KEY, name_normalised TEXT);
            CREATE TABLE offering_history (
                id INTEGER PRIMARY KEY, shop_id INTEGER, strain_id INTEGER,
                observed_at_utc TEXT, event_type TEXT, status TEXT, is_legal INTEGER,
                price_currency TEXT, price_unit TEXT, price_amount REAL,
                package_price_amount REAL, package_weight_g REAL);
        ''')
        self.c.executemany('INSERT INTO strains VALUES (?,?)', [(1, 'one'), (2, 'two'), (3, 'three')])
        self.shops = [{'shop_id': 1, 'city': 'Amsterdam'}, {'shop_id': 2, 'city': 'Rotterdam'}, {'shop_id': 3, 'city': 'Amsterdam'}]

    def event(self, date, shop=1, strain=1, price=10, event='seen_on_menu', status='active', weight=1, legal=0, currency='€'):
        self.c.execute('INSERT INTO offering_history VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?)',
                       (shop, strain, date, event, status, legal, currency, 'g', price / weight, price, weight))

    def current(self, shop=1, strain=1, name='one', price=10, weight=1, legal=0, currency='€'):
        return dict(shop_id=shop, strain_id=strain, strain_name_normalised=name, price_amount=price / weight,
                    price_currency=currency, price_unit='g', package_price_amount=price, package_weight_g=weight, is_legal=legal)

    def build(self, current=None, excluded=(), exported='2026-10-28T12:00:00Z', tracked=()):
        return build_price_history(self.c, self.shops, current or [], exported, excluded, tracked)

    def points(self, result, scope='netherlands'):
        return {point['date']: point for row in result['series'] if row['id'] == scope for point in row['points']}

    def test_repeat_checks_replace_snapshot_without_weighting_prices_again(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-01', shop=2, price=20)
        for date in ['2026-10-02', '2026-10-03', '2026-10-04']:
            self.event(date, shop=1, price=10, event='seen_on_unchanged_menu')
        points = self.points(self.build())
        for date in ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']:
            self.assertEqual(points[date]['average_price'], 15)
            self.assertEqual(points[date]['listing_count'], 2)

    def test_replacement_removes_absent_strains_and_keeps_other_shops(self):
        self.event('2026-10-01', price=10)
        self.event('2026-10-01', strain=2, price=30)
        self.event('2026-10-01', shop=2, strain=3, price=20)
        self.event('2026-10-02', price=12)
        point = self.points(self.build())['2026-10-02']
        self.assertEqual((point['average_price'], point['listing_count'], point['shop_count']), (16, 2, 2))

    def test_archive_status_active_does_not_reintroduce_outgoing_prices(self):
        self.event('2026-10-01', price=100, event='superseded_by_new_menu')
        self.event('2026-10-02', price=10)
        self.event('2026-10-03', price=10, event='superseded_by_new_menu')
        points = self.points(self.build())
        self.assertNotIn('2026-10-01', points)
        self.assertEqual(points['2026-10-02']['average_price'], 10)
        self.assertIsNone(points['2026-10-03']['average_price'])

    def test_pack_and_legal_options_are_separate_and_strains_have_equal_weight(self):
        self.event('2026-10-01', price=10)
        self.event('2026-10-01', price=70, weight=3.5)
        self.event('2026-10-01', price=30, legal=1)
        self.event('2026-10-01', strain=2, price=40)
        point = self.points(self.build())['2026-10-01']
        self.assertEqual((point['average_price'], point['strain_count'], point['listing_count']), (30, 2, 4))

    def test_partial_removal_and_correction_affect_only_matching_option(self):
        self.event('2026-10-01', price=10)
        self.event('2026-10-01', price=70, weight=3.5)
        self.event('2026-10-02', price=10, status='discontinued', event='missing_from_latest_menu')
        self.event('2026-10-03', price=35, weight=3.5, event='package_correction')
        points = self.points(self.build())
        self.assertEqual(points['2026-10-02']['average_price'], 20)
        self.assertEqual(points['2026-10-03']['average_price'], 10)

    def test_future_malformed_and_unknown_events_do_not_enter_the_timeline(self):
        self.event('2026-10-01', price=10)
        self.event('2026-10-29', price=100)
        self.event('not a date', price=100)
        self.event('2026-10-02', price=100, event='unrecognised_import')
        points = self.points(self.build())
        self.assertEqual(list(points), ['2026-10-01', '2026-10-28'])
        self.assertEqual(points['2026-10-01']['average_price'], 10)

    def test_utc_boundaries_and_export_cutoff_use_actual_instant(self):
        self.event('2026-10-01T23:30:00-02:00', price=10)
        self.event('2026-10-28T14:00:00+01:00', price=100)
        points = self.points(self.build())
        self.assertIn('2026-10-02', points)
        self.assertEqual(points['2026-10-02']['average_price'], 10)

    def test_current_snapshot_matches_current_inventory_without_backdating_edits(self):
        self.event('2026-10-01', price=10)
        result = self.build([self.current(price=20), self.current(shop=2, strain=2, name='two', price=40)])
        points = self.points(result)
        self.assertEqual(points['2026-10-01']['average_price'], 10)
        self.assertEqual(points['2026-10-28']['average_price'], 30)
        self.assertEqual(points['2026-10-28']['kind'], 'current')
        self.assertEqual(self.points(result, 'rotterdam')['2026-10-28']['average_price'], 40)

    def test_current_point_replaces_same_day_history_and_export_is_read_only(self):
        self.event('2026-10-28T10:00:00Z', price=10)
        before = '\n'.join(self.c.iterdump())
        changes = self.c.total_changes
        result = self.build([self.current(price=12)])
        self.assertEqual(list(self.points(result)), ['2026-10-28'])
        self.assertEqual(self.points(result)['2026-10-28']['average_price'], 12)
        self.assertEqual(self.c.total_changes, changes)
        self.assertEqual('\n'.join(self.c.iterdump()), before)
        json.dumps(result, allow_nan=False)

    def test_excluded_shops_and_non_euro_or_invalid_prices_do_not_contribute(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-01', shop=2, price=100)
        self.event('2026-10-01', shop=3, price=90, currency='£')
        self.event('2026-10-02', shop=1, price=0)
        points = self.points(self.build(excluded={'2'}))
        self.assertEqual(points['2026-10-01']['average_price'], 10)
        self.assertIsNone(points['2026-10-02']['average_price'])

    def test_no_history_produces_one_current_point_without_fabricating_a_line(self):
        points = self.points(self.build([self.current(price=10)]))
        self.assertEqual(len(points), 1)
        self.assertEqual(points['2026-10-28']['average_price'], 10)

    def test_legacy_archive_without_legal_metadata_retires_the_outgoing_pack(self):
        self.event('2026-10-01', price=10, legal=1)
        self.event('2026-10-02', price=10, legal=0, event='superseded_by_new_menu')
        self.assertIsNone(self.points(self.build())['2026-10-02']['average_price'])

    def test_publication_checks_reject_timestamp_average_and_date_mismatches(self):
        result = self.build([self.current(price=10)])
        summary = {'network': {'average_strain_price': 10}, 'locations': []}
        manifest = {'exported_at_utc': result['exported_at_utc']}
        self.assertEqual(price_history_errors(result, summary, manifest), [])
        self.assertTrue(price_history_errors(result, summary, {'exported_at_utc': 'other'}))
        summary['network']['average_strain_price'] = 20
        self.assertTrue(any('current average' in error for error in price_history_errors(result, summary, manifest)))
        result['series'][0]['points'][0]['date'] = '2099-01-01'
        self.assertTrue(any('future date' in error for error in price_history_errors(result, summary, manifest)))

    def test_fixed_benchmark_gives_each_shop_equal_weight_despite_different_menu_sizes(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-01', shop=2, strain=2, price=20)
        self.event('2026-10-01', shop=2, strain=3, price=40)
        self.event('2026-10-01', shop=3, price=100)
        result = self.build(tracked=[1, 2])
        point = self.points(result, 'benchmark')['2026-10-01']
        self.assertEqual((point['average_price'], point['shop_count'], point['listing_count']), (20, 2, 3))
        self.assertEqual(self.points(result, 'shop-2')['2026-10-01']['average_price'], 30)
        self.assertEqual([shop['shop_id'] for shop in result['benchmark']['shops']], [1, 2])

    def test_incomplete_benchmark_is_missing_instead_of_averaging_a_smaller_sample(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-02', shop=2, price=20)
        self.event('2026-10-03', shop=1, price=10, event='superseded_by_new_menu')
        self.event('2026-10-04', shop=3, price=1)
        points = self.points(self.build(tracked=[1, 2]), 'benchmark')
        self.assertNotIn('2026-10-01', points)
        self.assertEqual(points['2026-10-02']['average_price'], 15)
        self.assertIsNone(points['2026-10-03']['average_price'])
        self.assertNotIn('2026-10-04', points, 'An untracked shop must neither replace a tracked shop nor create a new benchmark marker')
        self.assertIsNone(points['2026-10-28']['average_price'])

    def test_closed_tracked_shop_keeps_its_history_without_entering_the_current_average(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-01', shop=2, price=20)
        result = self.build(current=[self.current(shop=2, price=20)], excluded=['1'], tracked=[1, 2])
        points = self.points(result, 'benchmark')
        self.assertEqual(points['2026-10-01']['average_price'], 15)
        self.assertIsNone(points['2026-10-28']['average_price'])
        self.assertEqual(self.points(result)['2026-10-01']['average_price'], 20)

    def test_extra_shop_histories_keep_observation_days_and_do_not_change_public_benchmark(self):
        self.event('2026-10-01', shop=1, price=10)
        self.event('2026-10-01', shop=2, price=20)
        self.event('2026-10-02', shop=3, price=30)
        self.event('2026-10-03', shop=2, price=20, event='superseded_by_new_menu')
        current = [self.current(shop=1, price=10), self.current(shop=3, price=30)]
        ordinary = self.build(current=current, tracked=[1])
        expanded = build_price_history(self.c, self.shops, current, '2026-10-28T12:00:00Z',
                                       benchmark_shop_ids=[1], extra_shop_ids=[1, 2, 3])
        self.assertEqual(self.points(ordinary, 'benchmark'), self.points(expanded, 'benchmark'))
        self.assertEqual(self.points(expanded, 'shop-2')['2026-10-01']['average_price'], 20)
        self.assertIsNone(self.points(expanded, 'shop-2')['2026-10-03']['average_price'])
        self.assertIsNone(self.points(expanded, 'shop-2')['2026-10-28']['average_price'])
        self.assertNotIn('2026-10-01', self.points(expanded, 'shop-3'))
        self.assertEqual(self.points(expanded, 'shop-3')['2026-10-02']['average_price'], 30)

    def test_individual_history_quality_checks_snapshot_and_current_points(self):
        self.event('2026-10-01', shop=1, price=10)
        result = self.build(current=[self.current(price=12)], tracked=[1])
        shop = next(row for row in result['series'] if row['id'] == 'shop-1')
        history = {key: result[key] for key in ('version', 'exported_at_utc', 'currency', 'unit', 'date_basis')}
        history['shops'] = [{'shop_id': 1, 'name': shop['name'], 'points': shop['points']}]
        manifest = {'exported_at_utc': result['exported_at_utc']}
        self.assertEqual(shop_price_history_errors(history, manifest), [])
        self.assertTrue(shop_price_history_errors(history, {'exported_at_utc': 'other'}))
        history['shops'][0]['points'].pop()
        self.assertTrue(any('current snapshot' in error for error in shop_price_history_errors(history, manifest)))


class PriceHistoryExportTests(unittest.TestCase):
    def test_normal_export_builds_and_serves_history_without_changing_inventory(self):
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
                ok, message = admin.add_or_update_menu_entry(conn, 1, 'Fixture Strain', 'hybrid', False, False,
                                                             '', '', '€', '35', '3.5', '', '')
                self.assertTrue(ok, message)
                admin.reconcile_offerings_for_shop(conn, 1)
                before = '\n'.join(conn.iterdump())
                (Path(directory) / 'price_benchmark.json').write_text(json.dumps({'version': 1, 'shop_ids': [1]}))
                manifest = admin.export_json_snapshot(conn, directory)
                self.assertEqual('\n'.join(conn.iterdump()), before)
                history = json.loads((Path(directory) / 'price_history.json').read_text())
                individual = json.loads((Path(directory) / 'price_history_shops.json').read_text())
                summary = json.loads((Path(directory) / 'home_summary.json').read_text())
                self.assertIn('price_history.json', manifest['files'])
                self.assertIn('price_history_shops.json', manifest['files'])
                self.assertEqual(individual['exported_at_utc'], manifest['exported_at_utc'])
                self.assertEqual(individual['shops'][0]['shop_id'], 1)
                self.assertEqual(history['benchmark']['shops'][0]['shop_id'], 1)
                self.assertEqual(price_history_errors(history, summary, manifest), [])
                self.assertEqual(history['series'][0]['points'][-1]['average_price'], 10)
            finally:
                conn.close()
            app = admin.create_app(db, 'fixture.csv', directory, json_export_dir=directory)
            app.config['TESTING'] = True
            with app.test_client() as client:
                response = client.get('/database/price_history.json')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()['exported_at_utc'], manifest['exported_at_utc'])
                response.close()
                response = client.get('/database/price_history_shops.json')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.get_json()['exported_at_utc'], manifest['exported_at_utc'])
                response.close()


if __name__ == '__main__':
    unittest.main()

"""Strain search ranking and read-only suggestion regression fixtures."""
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import coffeeshop_menu_app as admin
except ModuleNotFoundError as exc:
    if exc.name == 'flask':
        raise unittest.SkipTest('Admin suggestion tests require Flask.') from exc
    raise


class StrainPickerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name) / 'fixture.sqlite')
        self.c = admin.db_connect(self.db)
        self.addCleanup(self.c.close)
        admin.db_init(self.c)
        for shop in range(1, 7):
            self.c.execute('INSERT INTO shops(id,name,city,shop_url,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                           (shop, f'Shop {shop}', 'Amsterdam', f'https://example.com/{shop}', '2026-01-01', '2026-01-01'))
        for name, count in [('Amnesia Haze', 4), ('AMNESIA G-13', 2), ('Amnesia Haze Master Cut', 1),
                            ('Blue Amnesia Haze', 5), ('Other Flower', 6), ('AK-47', 1), ("O'Brien", 1)]:
            for shop in range(1, count + 1):
                ok, message = admin.add_or_update_menu_entry(self.c, shop, name, 'sativa', False, False,
                                                            '', '', '€', '10', '1', '', '')
                self.assertTrue(ok, message)

    def names(self, query):
        return [r['name_display'] for r in admin.strain_suggestion_items(self.c, query)]

    def test_exact_match_beats_popular_longer_names(self):
        self.assertEqual(self.names('Amnesia Haze')[0], 'Amnesia Haze')
        self.assertEqual(self.names('amnesia haze master cut')[0], 'Amnesia Haze Master Cut')

    def test_common_prefix_match_precedes_alphabetical_variants(self):
        self.assertEqual(self.names('amnesia')[0], 'Amnesia Haze')
        self.assertEqual(self.names('amnesia')[-1], 'Blue Amnesia Haze')

    def test_short_words_match_across_the_name_in_either_order(self):
        self.assertEqual(self.names('am haze')[0], 'Blue Amnesia Haze')
        self.assertIn('Amnesia Haze', self.names('am haze'))
        self.assertEqual(self.names('am haze'), self.names('haze am'))

    def test_punctuation_codes_and_case(self):
        self.assertEqual(self.names('ak47'), ['AK-47'])
        self.assertEqual(self.names("o'brien"), ["O'Brien"])
        self.assertEqual(self.names('AMNESIA HAZE')[0], 'Amnesia Haze')
        self.assertEqual(self.names('%'), [])
        self.assertEqual(self.names("%' OR 1=1--"), [])

    def test_empty_search_uses_popularity_and_limits_results(self):
        self.assertEqual(self.names('')[0], 'Other Flower')
        self.assertEqual(len(admin.strain_suggestion_items(self.c, '', limit=2)), 2)
        self.assertEqual(self.names('No such strain at all'), [])

    def test_suggestion_api_preserves_every_database_record(self):
        app = admin.create_app(self.db, 'fixture.csv', self.tmp.name, json_export_dir=self.tmp.name)
        app.config['TESTING'] = True
        before = '\n'.join(self.c.iterdump())
        response = app.test_client().get('/api/strain_suggest?q=Amnesia%20Haze')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['suggestions'][0], 'Amnesia Haze')
        self.assertEqual(payload['items'][0], {'name_display': 'Amnesia Haze', 'base_type': 'sativa'})
        self.assertEqual('\n'.join(self.c.iterdump()), before)
        asset = app.test_client().get('/static/strain-picker.js')
        self.assertEqual(asset.status_code, 200)
        asset.close()

    def test_add_and_edit_screens_render_the_shared_search_controls(self):
        self.c.execute("""INSERT INTO menus(shop_id,fetched_at_utc,source_page_url,image_url,local_path,sha256,bytes,status)
                          VALUES(1,'2026-01-01','','','','fixture-menu',0,'processed')""")
        self.c.commit()
        app = admin.create_app(self.db, 'fixture.csv', self.tmp.name, json_export_dir=self.tmp.name)
        app.config['TESTING'] = True
        client = app.test_client()
        page = client.get('/shop/1').get_data(as_text=True)
        for marker in ['id="keep_entry_type"', 'id="remember_entry_settings"', 'id="new_entry_section"',
                       'id="grower_suggestions"', '/static/entry-helpers.js', 'fixture-menu', 'data-entry-weight="3.5"']:
            self.assertIn(marker, page)
        entry_id = self.c.execute('SELECT id FROM menu_entries WHERE shop_id=1 ORDER BY id LIMIT 1').fetchone()[0]
        response = client.get(f'/shop/1/entry/{entry_id}/edit')
        self.assertEqual(response.status_code, 200)
        edit = response.get_data(as_text=True)
        for marker in ['id="entryEditForm"', 'id="grower_suggestions"', 'aria-controls="strain_suggestions"',
                       'name="grower_choice" value="custom"', '/static/entry-helpers.js']:
            self.assertIn(marker, edit)
        self.assertNotIn('id="remember_entry_settings"', edit)

    def test_new_grower_and_pack_option_use_the_existing_entry_fields(self):
        app = admin.create_app(self.db, 'fixture.csv', self.tmp.name, json_export_dir=self.tmp.name)
        app.config['TESTING'] = True
        response = app.test_client().post('/shop/1/add', data={
            'strain_name': 'Fixture new flower', 'base_type': 'hybrid', 'is_cali': '1',
            'grower_choice': 'custom', 'grower_custom': 'Fixture New Grower', 'price_currency': '€',
            'package_price_amount': '35', 'package_weight_choice': '3.5g', 'notes': '',
        })
        self.assertEqual(response.status_code, 302)
        row = self.c.execute("""SELECT me.* FROM menu_entries me JOIN strains st ON st.id=me.strain_id
                                WHERE me.shop_id=1 AND st.name_display='Fixture new flower'""").fetchone()
        self.assertIsNotNone(row)
        self.assertEqual((row['grower'], row['is_cali'], row['package_price_amount'], row['package_weight_g'], row['price_amount']),
                         ('Fixture New Grower', 1, 35, 3.5, 10))


if __name__ == '__main__':
    unittest.main()

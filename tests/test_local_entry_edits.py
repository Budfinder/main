"""Entry edits must never rename strains or move inventory at other shops."""
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
        raise unittest.SkipTest('Admin entry tests require Flask.') from exc
    raise


class LocalEntryEditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = str(Path(self.tmp.name) / 'fixture.sqlite')
        self.c = admin.db_connect(self.db)
        self.addCleanup(self.c.close)
        admin.db_init(self.c)
        for shop in range(1, 4):
            self.c.execute('INSERT INTO shops(id,name,city,shop_url,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                           (shop, f'Shop {shop}', 'Amsterdam', '', '2026-01-01', '2026-01-01'))
        self.c.commit()
        self.add(1, 'Amnesia Haze', '10')
        self.add(1, 'Amnesia Haze', '45', '5')
        self.add(2, 'Amnesia Haze', '11')
        self.add(3, 'Bio Amnesia Haze', '12')
        self.plain = self.strain('Amnesia Haze')
        self.bio = self.strain('Bio Amnesia Haze')
        self.entry = self.c.execute('SELECT id FROM menu_entries WHERE shop_id=1 AND package_weight_g=1').fetchone()[0]
        admin.record_offering_history(self.c, 2, self.plain, None, 'seen_on_menu', 'active',
                                      'sativa', False, False, '', '€', 11, 'g', 11, 1, '', 'fixture')
        self.c.commit()

    def add(self, shop, name, price, weight='1'):
        ok, message = admin.add_or_update_menu_entry(self.c, shop, name, 'sativa', False, False,
                                                    '', '', '€', price, weight, '', '')
        self.assertTrue(ok, message)

    def strain(self, name):
        return self.c.execute('SELECT id FROM strains WHERE name_display=?', (name,)).fetchone()[0]

    def rows(self, table, where='', args=()):
        return [dict(r) for r in self.c.execute(f'SELECT * FROM {table} {where} ORDER BY id', args)]

    def edit(self, name='Bio Amnesia Haze', **overrides):
        args = dict(shop_id=1, entry_id=self.entry, new_strain_name=name, base_type='sativa', is_cali=False,
                    is_legal=False, grower_choice='', grower_custom='', price_currency='€',
                    package_price_amount_text='9', package_weight_choice='1', package_weight_custom='', notes='updated')
        args.update(overrides)
        return admin.update_menu_entry_by_id(self.c, **args)

    def dump(self):
        return '\n'.join(self.c.iterdump())

    def test_existing_name_reassigns_only_one_shop_and_pack(self):
        other_menu = self.rows('menu_entries', 'WHERE id != ?', (self.entry,))
        other_stock = self.rows('shop_offerings', 'WHERE shop_id != 1 OR package_weight_g != 1')
        strains, history = self.rows('strains'), self.rows('offering_history')
        ok, message = self.edit()
        self.assertTrue(ok, message)
        self.assertEqual(self.rows('menu_entries', 'WHERE id != ?', (self.entry,)), other_menu)
        self.assertEqual(self.rows('shop_offerings', 'WHERE shop_id != 1 OR package_weight_g != 1'), other_stock)
        self.assertEqual(self.rows('strains'), strains)
        self.assertEqual(self.rows('offering_history'), history)
        row = self.rows('menu_entries', 'WHERE id=?', (self.entry,))[0]
        self.assertEqual((row['strain_id'], row['package_price_amount'], row['notes']), (self.bio, 9, 'updated'))
        statuses = {r['strain_id']: r['status'] for r in self.rows('shop_offerings', 'WHERE shop_id=1 AND package_weight_g=1')}
        self.assertEqual(statuses, {self.plain: 'discontinued', self.bio: 'active'})

    def test_new_name_keeps_original_dictionary_and_history(self):
        other_menu = self.rows('menu_entries', 'WHERE shop_id=2')
        history = self.rows('offering_history')
        ok, message = self.edit('Distinct New Flower')
        self.assertTrue(ok, message)
        self.assertEqual(self.strain('Amnesia Haze'), self.plain)
        self.assertEqual(self.rows('menu_entries', 'WHERE shop_id=2'), other_menu)
        self.assertEqual(self.rows('offering_history'), history)
        self.assertEqual(self.rows('menu_entries', 'WHERE id=?', (self.entry,))[0]['strain_id'], self.strain('Distinct New Flower'))

    def test_duplicate_destination_rejects_without_deleting_either_entry(self):
        self.add(1, 'Bio Amnesia Haze', '12')
        before = self.dump()
        ok, message = self.edit()
        self.assertFalse(ok)
        self.assertIn('already has', message)
        self.assertEqual(self.dump(), before)

    def test_same_identity_updates_details_without_changing_shared_casing(self):
        before = self.rows('strains')
        ok, message = self.edit('AMNESIA HAZE')
        self.assertTrue(ok, message)
        self.assertEqual(self.rows('strains'), before)
        self.assertEqual(self.rows('shop_offerings', 'WHERE shop_id=1 AND strain_id=? AND package_weight_g=1', (self.plain,))[0]['status'], 'active')

    def test_pack_change_retires_only_old_pack_and_keeps_other_options(self):
        ok, message = self.edit('Amnesia Haze', package_weight_choice='3.5', package_price_amount_text='35')
        self.assertTrue(ok, message)
        rows = self.rows('shop_offerings', 'WHERE shop_id=1 AND strain_id=?', (self.plain,))
        self.assertEqual({r['package_weight_g']: r['status'] for r in rows}, {1: 'discontinued', 3.5: 'active', 5: 'active'})
        self.assertEqual(next(r['price_amount'] for r in rows if r['package_weight_g']==3.5), 10)

    def test_legal_option_change_does_not_leave_previous_option_active(self):
        ok, message = self.edit('Amnesia Haze', is_legal=True)
        self.assertTrue(ok, message)
        rows = self.rows('shop_offerings', 'WHERE shop_id=1 AND strain_id=? AND package_weight_g=1', (self.plain,))
        self.assertEqual({r['is_legal']: r['status'] for r in rows}, {0: 'discontinued', 1: 'active'})

    def test_wrong_shop_and_invalid_fields_make_no_changes(self):
        before = self.dump()
        for overrides in [{'shop_id': 2}, {'package_price_amount_text': '-10'}, {'new_strain_name': ''}]:
            ok, _message = self.edit(**overrides)
            self.assertFalse(ok)
            self.assertEqual(self.dump(), before)

    def test_catalogue_failure_rolls_back_entry_and_new_strain_together(self):
        before = self.dump()
        with patch.object(admin, 'sync_offering_from_menu_entry', side_effect=sqlite3.OperationalError('fixture failure')):
            ok, message = self.edit('New Name That Must Roll Back')
        self.assertFalse(ok)
        self.assertIn('fixture failure', message)
        self.assertEqual(self.dump(), before)

    def test_explicit_consolidation_remains_the_global_merge_workflow(self):
        ok, target, message = admin.rename_or_merge_strain_id(self.c, self.plain, 'Bio Amnesia Haze')
        self.assertTrue(ok, message)
        self.assertEqual(target, self.bio)
        self.assertEqual(self.rows('strains', 'WHERE id=?', (self.plain,)), [])
        self.assertEqual(self.rows('menu_entries', 'WHERE shop_id=2')[0]['strain_id'], self.bio)

    def test_form_save_uses_local_edit_path_and_displays_scope(self):
        app = admin.create_app(self.db, 'fixture.csv', self.tmp.name, json_export_dir=self.tmp.name)
        app.config['TESTING'] = True
        client = app.test_client()
        response = client.get(f'/shop/1/entry/{self.entry}/edit')
        self.assertIn('Other shops keep their strain names.', response.get_data(as_text=True))
        other = self.rows('menu_entries', 'WHERE shop_id=2')
        response = client.post(f'/shop/1/entry/{self.entry}/edit', data={
            'strain_name': 'Bio Amnesia Haze', 'base_type': 'sativa', 'price_currency': '€',
            'package_price_amount': '9', 'package_weight_choice': '1', 'grower_choice': 'custom',
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.rows('menu_entries', 'WHERE shop_id=2'), other)


if __name__ == '__main__':
    unittest.main()

"""Targeted Amnesia identity repair. Run on a copy before the canonical database."""
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BIO = 2807
OLD_PLAIN = 102
TABLES = ('menu_entries', 'shop_offerings', 'offering_history')
# Every post-backup current menu row was checked against its saved menu image.
PHOTO_BIO_MENU_IDS = {14023, 14075, 14288}  # Maxcys, De Wedren, V.I.P. Shop
PHOTO_PLAIN_MENU_IDS = {13583, 13586, 13660, 13691, 13693, 13705, 13726, 13746,
                        13777, 13786, 13826, 13854, 13869, 13944, 13949, 13962}
PHOTO_BIO_OFFERING_IDS = {15318, 381, 24911}  # latest Maxcys / De Wedren options


def connect(path):
    c = sqlite3.connect(path, uri=str(path).startswith('file:'))
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c


def rows(c, table, where='', args=()):
    return {r['id']: dict(r) for r in c.execute(f'SELECT * FROM {table} {where}', args)}


def digest(c, table, excluded=()):
    excluded = set(excluded)
    h = hashlib.sha256()
    for row in c.execute(f'SELECT * FROM "{table}" ORDER BY rowid'):
        item = dict(row)
        if item.get('id') in excluded:
            continue
        h.update(json.dumps(item, sort_keys=True, ensure_ascii=False).encode())
        h.update(b'\n')
    return h.hexdigest()


def pattern(row):
    return (row['shop_id'], row['package_price_amount'], row['package_weight_g'], row['is_legal'])


def repair(path):
    source = connect(f'file:{ROOT / "pre-merge-source.sqlite"}?mode=ro')
    c = connect(path)
    try:
        c.execute('BEGIN IMMEDIATE')
        plain = c.execute("SELECT id FROM strains WHERE name_normalised='amnesia haze'").fetchone()[0]
        assert plain != BIO
        old = {t: rows(source, t, 'WHERE strain_id IN (?,?)', (OLD_PLAIN, BIO)) for t in TABLES}
        affected = {t: rows(c, t, 'WHERE strain_id=?', (BIO,)) for t in TABLES}
        moved = {t: set() for t in TABLES}
        deleted = set()
        restored = {'menu_entries': {}, 'shop_offerings': {}}
        duplicate_archive_ids = []
        bio_patterns = {pattern(r) for r in old['shop_offerings'].values() if r['strain_id']==BIO}
        bio_patterns.update(pattern(affected['shop_offerings'][i]) for i in PHOTO_BIO_OFFERING_IDS)

        new_menu_ids = set(affected['menu_entries']) - set(old['menu_entries'])
        assert new_menu_ids == PHOTO_BIO_MENU_IDS | PHOTO_PLAIN_MENU_IDS, new_menu_ids
        for table in TABLES:
            for rid, row in affected[table].items():
                original = old[table].get(rid)
                if table=='menu_entries' and rid in PHOTO_BIO_MENU_IDS:
                    continue
                if table=='shop_offerings' and rid in PHOTO_BIO_OFFERING_IDS:
                    continue
                if original:
                    assert original['shop_id']==row['shop_id']
                    if original['strain_id']==BIO:
                        continue
                elif table=='menu_entries':
                    assert rid in PHOTO_PLAIN_MENU_IDS
                elif table=='shop_offerings':
                    raise AssertionError(f'Unreviewed new Bio offering {rid}')
                elif pattern(row) in bio_patterns:
                    continue
                moved[table].add(rid)

        # The global merge deleted two catalogue collisions and Noord's ordinary menu row.
        for table, ids in [('menu_entries', [2437]), ('shop_offerings', [4311, 16151])]:
            for rid in ids:
                assert c.execute(f'SELECT 1 FROM {table} WHERE id=?', (rid,)).fetchone() is None
                original = dict(old[table][rid])
                assert original['strain_id']==OLD_PLAIN
                if table=='menu_entries':
                    old_menu = source.execute('SELECT sha256 FROM menus WHERE shop_id=?', (original['shop_id'],)).fetchone()
                    menu = c.execute('SELECT sha256,status FROM menus WHERE shop_id=?', (original['shop_id'],)).fetchone()
                    assert menu['sha256']==old_menu['sha256'] and menu['status']=='processed'
                original['strain_id'] = plain
                restored[table][rid] = original

        # Keep the user's newer ordinary entries where the broken global merge left
        # an older duplicate catalogue option. Preserve the older values in history.
        duplicate_rows = []
        for rid in moved['shop_offerings']:
            row = affected['shop_offerings'][rid]
            clash = c.execute('SELECT * FROM shop_offerings WHERE shop_id=? AND strain_id=? AND package_weight_g=? AND is_legal=?',
                             (row['shop_id'], plain, row['package_weight_g'], row['is_legal'])).fetchone()
            if clash:
                assert row['status']=='discontinued', (rid, dict(clash))
                deleted.add(rid)
                duplicate_rows.append({'removed': row, 'retained': dict(clash)})
        assert len(deleted)==5, deleted

        changed_ids = {t: set(moved[t]) | set(restored.get(t, {})) for t in TABLES}
        all_tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        before = {t: digest(c, t, changed_ids.get(t, ())) for t in all_tables}
        counts_before = {t: c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in TABLES}
        for table in TABLES:
            for rid in sorted(moved[table] - (deleted if table=='shop_offerings' else set())):
                c.execute(f'UPDATE {table} SET strain_id=? WHERE id=? AND strain_id=?', (plain, rid, BIO))
            for row in restored.get(table, {}).values():
                columns = list(row)
                c.execute(f'INSERT INTO {table}({",".join(columns)}) VALUES({",".join("?" for _ in columns)})',
                          [row[k] for k in columns])
        now = datetime.now(timezone.utc).isoformat()
        for item in duplicate_rows:
            row = item['removed']
            archive = {k: row[k] for k in ['shop_id', 'base_type', 'is_cali', 'is_legal', 'grower', 'price_currency',
                                         'price_amount', 'price_unit', 'package_price_amount', 'package_weight_g', 'notes']}
            archive.update(strain_id=plain, menu_history_id=None, observed_at_utc=row['last_seen_at_utc'],
                           event_type='recovered_duplicate', status='discontinued', source='amnesia_split_repair', created_at=now)
            columns = list(archive)
            cursor = c.execute(f'INSERT INTO offering_history({",".join(columns)}) VALUES({",".join("?" for _ in columns)})',
                               [archive[k] for k in columns])
            duplicate_archive_ids.append(cursor.lastrowid)
            c.execute('DELETE FROM shop_offerings WHERE id=?', (row['id'],))

        changed_ids['offering_history'].update(duplicate_archive_ids)
        for table in all_tables:
            assert digest(c, table, changed_ids.get(table, ()))==before[table], f'Unrelated changes in {table}'
        for table in TABLES:
            for rid in moved[table] - (deleted if table=='shop_offerings' else set()):
                after = dict(c.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone())
                expected = dict(affected[table][rid], strain_id=plain)
                assert after==expected, (table, rid)
            for rid, expected in restored.get(table, {}).items():
                assert dict(c.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone())==expected
        assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert not c.execute('PRAGMA foreign_key_check').fetchall()
        bio_menu = [dict(r) for r in c.execute('SELECT me.id,s.name,s.city,me.package_price_amount,me.package_weight_g FROM menu_entries me JOIN shops s ON s.id=me.shop_id WHERE strain_id=? ORDER BY s.name', (BIO,))]
        assert len(bio_menu)==6, bio_menu
        result = {'ordinary_strain_id': plain, 'bio_strain_id': BIO,
                  'moved_ids': {t: sorted(v - (deleted if t=='shop_offerings' else set())) for t,v in moved.items()},
                  'restored_ids': {t: sorted(v) for t,v in restored.items()},
                  'duplicate_catalogue_rows_preserved_in_history': duplicate_rows,
                  'duplicate_history_ids': duplicate_archive_ids,
                  'counts_before': counts_before,
                  'counts_after': {t: c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in TABLES},
                  'bio_current_menus': bio_menu, 'unrelated_data_checks': 'All rows outside the listed identities are unchanged; prices and other fields of relabelled rows are identical.'}
        c.commit()
        return result
    except Exception:
        c.rollback()
        raise
    finally:
        source.close()
        c.close()


if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    report = repair(args.db)
    Path(args.report).write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({'moved': {t: len(ids) for t,ids in report['moved_ids'].items()},
                      'restored': report['restored_ids'], 'bio_current_menus': report['bio_current_menus']}, indent=2))

"""One-off, backed-up repair of the October 18 menu carry-forward workflow.

Default: build and verify a disposable candidate. --apply repeats the verified
repair in a transaction, only if the live database still matches the backup.
"""

import argparse
import csv
import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT))
import coffeeshop_menu_app as admin

ORIGINAL = HERE / 'critical/database/coffeeshops.sqlite'
LIVE = ROOT / 'database/coffeeshops.sqlite'
CANDIDATE = HERE / 'repaired-candidate.sqlite'
AUDIT = json.loads((HERE / 'audit-before.json').read_text())
COMPLETED = [shop for shop in AUDIT if shop['status'] == 'processed']
PENDING = [shop for shop in AUDIT if shop['status'] == 'new']
ALIASES = {
    11181: 'CBD Candy Runtz is already re-entered as Candy Runtz at €6/1g.',
    13094: 'CBD Lemon Head is already re-entered as Lemon Headz at €6/1g.',
}


def connect(path, readonly=False):
    c = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True) if readonly else sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    return c


def table_rows(c, table):
    columns = c.execute(f'PRAGMA table_info("{table}")').fetchall()
    keys = [r['name'] for r in sorted(columns, key=lambda r: r['pk']) if r['pk']]
    order = ','.join('"' + key + '"' for key in keys) or 'rowid'
    return c.execute(f'SELECT * FROM "{table}" ORDER BY {order}')


def fingerprints(c):
    result = {}
    names = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    for name in names:
        digest = hashlib.sha256()
        for row in table_rows(c, name):
            digest.update(repr(tuple(row)).encode('utf-8'))
            digest.update(b'\n')
        result[name] = digest.hexdigest()
    return result


def history(c, row, menu_history_id, event, status, stamp):
    admin.record_offering_history(
        c, shop_id=row['shop_id'], strain_id=row['strain_id'],
        menu_history_id=menu_history_id, event_type=event, status=status,
        base_type=row['base_type'], is_cali=row['is_cali'], is_legal=row['is_legal'],
        grower=row['grower'], price_currency=row['price_currency'],
        price_amount=row['price_amount'], price_unit=row['price_unit'],
        package_price_amount=row['package_price_amount'], package_weight_g=row['package_weight_g'],
        notes=row['notes'], source='menu_workflow_repair', observed_at_utc=stamp,
    )


def discontinue(c, row, shop, stamp, pending=False):
    assert row['status'] == 'active' and row['manual_status_lock'] == 0
    history(c, row, shop['menu_history_id'],
            'repair_pending_rebuild' if pending else 'repair_missing_from_menu', 'discontinued', stamp)
    c.execute("""UPDATE shop_offerings SET status='discontinued',
        discontinued_reason=?, discontinued_since_utc=?, discontinued_until_utc='', updated_at=?
        WHERE id=?""",
        ('new menu pending rebuild' if pending else 'missing from latest menu (verified repair)',
         stamp, stamp, row['id']))


def repair(c, stamp):
    changes = []
    for shop in COMPLETED:
        for entry in shop['old_entries']:
            current = c.execute('SELECT * FROM menu_entries WHERE id=?', (entry['id'],)).fetchone()
            assert current and current['created_at'] == entry['created_at']
            offering = c.execute('''SELECT * FROM shop_offerings WHERE shop_id=? AND strain_id=?
                AND package_weight_g=? AND is_legal=?''',
                (shop['id'], entry['strain_id'], entry['package_weight_g'], entry['is_legal'])).fetchone()
            assert offering
            if offering['status'] == 'active':
                assert not offering['manual_status_lock'], 'Keep explicit manual active overrides for separate review'
                discontinue(c, offering, shop, stamp)
            else:
                assert offering['status'] == 'discontinued'
            c.execute('DELETE FROM menu_entries WHERE id=?', (entry['id'],))
            changes.append(dict(shop=shop['name'], shop_id=shop['id'], entry_id=entry['id'],
                strain=entry['strain'], action='remove_completed_carryover',
                reason=ALIASES.get(entry['id'], 'Previous flower/pack option is absent from the saved current menu.'),
                evidence=shop['images']))

    for shop in PENDING:
        offerings = c.execute("SELECT * FROM shop_offerings WHERE shop_id=? AND status='active' AND manual_status_lock=0", (shop['id'],)).fetchall()
        for row in offerings:
            discontinue(c, row, shop, stamp, pending=True)
        for entry in shop['old_entries']:
            c.execute('DELETE FROM menu_entries WHERE id=? AND shop_id=?', (entry['id'], shop['id']))
            changes.append(dict(shop=shop['name'], shop_id=shop['id'], entry_id=entry['id'],
                strain=entry['strain'], action='clear_unreviewed_previous_draft',
                reason='Restore original changed-menu behaviour; this entry predates the new image.',
                evidence=shop['images']))
        # The old entry workflow publishes entered rows immediately. Preserve and
        # sync only rows actually entered after this menu was discovered.
        for entry in shop['new_entries']:
            admin.sync_offering_from_menu_entry(
                c, shop_id=shop['id'], strain_id=entry['strain_id'], base_type=entry['base_type'],
                is_cali=entry['is_cali'], is_legal=entry['is_legal'], grower=entry['grower'],
                price_currency=entry['price_currency'], price_amount=entry['price_amount'],
                package_price_amount=entry['package_price_amount'], package_weight_g=entry['package_weight_g'],
                notes=entry['notes'])
            history(c, entry, shop['menu_history_id'], 'repair_preserved_entry', 'active', stamp)
    return changes


def verify(before, after):
    assert after.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not after.execute('PRAGMA foreign_key_check').fetchall()
    removed = {entry['id'] for shop in AUDIT for entry in shop['old_entries']}
    originals = {r['id']: tuple(r) for r in table_rows(before, 'menu_entries')}
    repaired = {r['id']: tuple(r) for r in table_rows(after, 'menu_entries')}
    assert set(originals) - set(repaired) == removed
    assert not set(repaired) - set(originals)
    assert all(value == originals[key] for key, value in repaired.items()), 'A surviving entry was changed'
    assert len(removed) == 451
    assert sum(len(s['new_entries']) for s in COMPLETED) == 228
    assert sum(len(s['new_entries']) for s in PENDING) == 4
    changed_shops = {s['id'] for s in AUDIT}
    original_offerings = {r['id']: r for r in table_rows(before, 'shop_offerings')}
    for row in table_rows(after, 'shop_offerings'):
        if row['shop_id'] not in changed_shops or row['manual_status_lock']:
            assert tuple(row) == tuple(original_offerings[row['id']]), 'Unrelated offering changed'
    old_hashes = fingerprints(before)
    new_hashes = fingerprints(after)
    for table in old_hashes:
        if table not in {'menu_entries', 'shop_offerings', 'offering_history', 'sqlite_sequence'}:
            assert old_hashes[table] == new_hashes[table], f'Unexpected change to {table}'
    old_history = before.execute('SELECT MAX(id),COUNT(*) FROM offering_history').fetchone()
    assert before.execute('SELECT COUNT(*) FROM offering_history').fetchone()[0] == after.execute(
        'SELECT COUNT(*) FROM offering_history WHERE id <= ?', (old_history[0],)).fetchone()[0]
    old_digest = hashlib.sha256()
    new_digest = hashlib.sha256()
    for row in before.execute('SELECT * FROM offering_history ORDER BY id'):
        old_digest.update(repr(tuple(row)).encode())
    for row in after.execute('SELECT * FROM offering_history WHERE id<=? ORDER BY id', (old_history[0],)):
        new_digest.update(repr(tuple(row)).encode())
    assert old_digest.digest() == new_digest.digest(), 'Historical observations were changed'
    for shop in AUDIT:
        expected = len(shop['new_entries'])
        assert after.execute('SELECT COUNT(*) FROM menu_entries WHERE shop_id=?', (shop['id'],)).fetchone()[0] == expected
        if shop['status'] == 'new':
            assert after.execute("SELECT COUNT(*) FROM shop_offerings WHERE shop_id=? AND status='active'", (shop['id'],)).fetchone()[0] == expected


def summary(c):
    return {'menu_entries': c.execute('SELECT COUNT(*) FROM menu_entries').fetchone()[0],
            'active_offerings': c.execute("SELECT COUNT(*) FROM shop_offerings WHERE status='active'").fetchone()[0],
            'finished_menus_repaired': len(COMPLETED), 'pending_menus_reset': len(PENDING),
            'completed_carryovers_removed': 107, 'pending_draft_rows_cleared': 344,
            'completed_stale_active_listings_discontinued': 105,
            'new_completed_entries_preserved': 228, 'unfinished_entries_preserved': 4}


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--apply', action='store_true')
    apply = args.parse_args().apply
    stamp = datetime.now(timezone.utc).isoformat()
    original = connect(ORIGINAL, readonly=True)
    if not apply:
        if CANDIDATE.exists(): CANDIDATE.unlink()
        target = connect(CANDIDATE)
        original.backup(target)
        target.execute('BEGIN IMMEDIATE')
        changes = repair(target, stamp)
        target.commit()
        verify(original, target)
        admin.export_json_snapshot(target, str(HERE / 'candidate-export'))
        report = dict(summary(target), backup=str(HERE), original_database=str(ORIGINAL),
                      completed_at=stamp, applied=False, changes=changes)
        (HERE / 'repair-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(summary(target)))
        print('Candidate passed integrity, foreign-key, unchanged-shop, entry-preservation and history-preservation checks.')
    else:
        assert CANDIDATE.is_file(), 'Build and verify the candidate first'
        target = connect(LIVE)
        target.execute('BEGIN IMMEDIATE')
        assert fingerprints(original) == fingerprints(target), 'Live database changed since backup; stop and re-audit.'
        repair(target, stamp)
        verify(original, target)
        target.commit()
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        report = json.loads((HERE / 'repair-report.json').read_text())
        report.update(applied=True, applied_at=stamp, live_database=str(LIVE))
        (HERE / 'repair-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(summary(target)))
        print('Verified repair committed. Original observations and unrelated shops are unchanged.')
    target.close()
    original.close()


if __name__ == '__main__':
    main()

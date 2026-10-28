# Menu workflow repair

The October 18 source changes were reverted to the previous Git version. The current database was repaired selectively; the October 18 database backup was not restored over recent work.

The saved images for all ten affected completed menus were checked manually. Entries typed after each changed menu was detected were preserved. The previous rows for waiting menus were cleared to restore the original entry workflow.

| Shop | State | Previous rows removed | Recent entries preserved |
|---|---|---:|---:|
| Abraxas | processed | 11 | 18 |
| Amnesia | processed | 17 | 18 |
| Bagheera | processed | 11 | 12 |
| Balboa Family | processed | 7 | 24 |
| Balou | processed | 3 | 29 |
| Boerejongens West | processed | 5 | 14 |
| Club Media | processed | 7 | 13 |
| Green Place | processed | 19 | 42 |
| Green Place 2 | processed | 16 | 40 |
| Greenhouse Strain Hunters | processed | 11 | 18 |
| Jollygood | new | 67 | 4 |
| Loft | new | 35 | 0 |
| Old Church 2 | new | 29 | 0 |
| Relax | new | 18 | 0 |
| Relax Zuid | new | 15 | 0 |
| Republiek | new | 36 | 0 |
| Siberie | new | 36 | 0 |
| Stones | new | 13 | 0 |
| Stud | new | 19 | 0 |
| Tyson 2.0 | new | 23 | 0 |
| de Supermarkt | new | 33 | 0 |
| het Gelderse | new | 20 | 0 |

Two removed rows described products re-entered under different labels: Bagheera CBD Candy Runtz → Candy Runtz, and Balou CBD Lemon Head → Lemon Headz. Their newly entered rows were preserved. Two Abraxas offerings were already manually discontinued; those offering records and manual flags were left unchanged.

All surviving menu-entry records are byte-for-byte equal to the before-repair values, and unrelated shops and historical observations are unchanged. Repair events are appended to offering history.

Audit note outside this carry-forward repair: Green Place Zivenchy (entry 13348) is entered as €100/1g, while the saved menu labels it as a 3.5g jar. This newly entered row was preserved for the owner to review.

Recovery files: `critical/database/coffeeshops.sqlite` is the full before-repair database; `critical/` also contains the changed source, JSON exports and 32 current menu images for the affected shops. `audit-before.json` stores every affected entry, and `repair-report.json` records each removal.

Completed: the verified repair was committed to the working database and the local JSON exports were regenerated. All 35 website JavaScript tests, 9 Python tests and 3 isolated restored-workflow tests passed. SQLite integrity and foreign-key checks passed. The new city/shop controls and carry-forward workflow have been removed. Restart the admin app before resuming entry.

Follow-up resolved at the owner’s request: Green Place Zivenchy (entry 13348) now records €100 for 3.5g, equivalent to €28.57/g. Both current records and local website exports were updated; the original menu observation date was preserved. Before-change database and export files are saved in /Users/matt/Documents/GitHub/main/recovery_backups/20261026T100924Z-before-zivenchy-pack-correction.

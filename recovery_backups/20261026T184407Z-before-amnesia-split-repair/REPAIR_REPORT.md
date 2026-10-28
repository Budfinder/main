# Amnesia split repair — 26 October 2026

The shared Amnesia Haze identity (old strain 102) had been merged into Bio Amnesia
Haze (2807). This repair uses the saved pre-merge database to identify the original
rows. It retains the current ordinary Amnesia Haze identity (11938), including all
entries created under that identity today.

## Applied changes

- Relabelled 219 current menu entries, 256 catalogue offerings and 8,316 historical
  observations from the mistaken Bio identity to ordinary Amnesia Haze.
- Recovered Noord's deleted ordinary Amnesia menu entry and two catalogue records
  that the global merge had removed because they collided with Bio records.
- Kept five newer ordinary catalogue records unchanged. Their older duplicate
  records were preserved as historical observations before removing the duplicate
  catalogue rows. Full before/after payloads are in applied-report.json.
- Preserved all existing prices, weights, types, origin/legal flags, notes, dates
  and manual offering states on relabelled rows. All unrelated records are unchanged.

## Genuine Bio entries retained

Bio Amnesia Haze now has six current shops: Katsu, Noord, Fly'n'Hy, Maxcys,
De Wedren and V.I.P. Shop. The three newly entered Bio menus (Maxcys, De Wedren,
V.I.P. Shop) and all sixteen other new Amnesia entries were checked against their
saved menu images. Noord's image separately confirms ordinary Amnesia at EUR11/g
and Am-Bio at EUR10/g.

## Editor correction

Editing a name now reassigns only that shop's menu entry and retires its replaced
catalogue option. It does not rename shared strain records or rewrite history.
A collision with an existing destination entry rejects the save with both entries
preserved. Saves are atomic, including rollback if catalogue synchronisation fails.
The separate Consolidate strains tool remains the explicit global merge workflow.

## Verification and recovery

- All 82 regression tests passed (55 JavaScript, 27 Python), including ten new
  tests for shop-local editing, duplicate protection and transaction rollback.
- SQLite integrity and foreign-key checks passed.
- Static data QA passed, and the local JSON export was regenerated and verified.
- The running local app was restarted with the corrected editor. Browser checks
  confirmed six Bio shops and Noord's recovered ordinary entry.
- Shop records, menu status/image/history records, growers, published posts and
  settings were compared with the immediate pre-apply backup and are unchanged.

coffeeshops.sqlite is the initial repair backup. immediately-before-apply.sqlite
is the canonical database immediately before the transaction. pre-merge-source.sqlite
holds the provenance used for the split. applied-report.json records every changed
ID and recovered row. repair_amnesia_split.py contains the guarded repair routine;
its assertions intentionally prevent applying it a second time to repaired data.
The candidate database and candidate export were validated before applying changes.
The website data files are updated locally; no remote publication was performed.

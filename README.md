# Budfinder

Static Budfinder map and strain explorer backed by exported coffeeshop menu data.

## Local Preview

Serve the directory from a local web server so the bundled JSON and CSV files can load:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Data Workflow

- `index.html` is the public homepage and map app.
- `database.html` is the strain explorer and comparison view.
- `coffeeshop_menu_app.py` maintains the SQLite/menu-entry workflow and exports the static JSON snapshot.
- `database/*.json`, `database/*.csv`, and `database/*.sqlite` hold the menu data assets.
- `database/locations/*.csv` controls the city map rows. Live coffeeshop rows should have a stable Budfinder `shop_key`.
- A map location does not need a CoffeeshopMenus record. Use a local key such as `ams-shop-name`, leave `menu_shop_key` blank, and populate `address`, `source`, and `source_url`.
- For menu-backed locations, `menu_shop_key` optionally links the location to `database/shops.json`. Existing `cs-*` values in `shop_key` remain supported as legacy menu links.
- In **Shop coverage**, **Create + enter menu** promotes a map-only venue into
  `csd.csv`, creates its SQLite shop and manual menu record, preserves its local
  map key, and opens the normal menu-entry screen.

Run the admin app against the canonical database and shop CSV:

```sh
python3 coffeeshop_menu_app.py --db database/coffeeshops.sqlite --shops database/csd.csv
```

The in-app menu scrape now runs a preflight before it can mutate data. It blocks if the
DB/CSV paths are not the canonical `database/` paths, if visible menus are already queued
as `new`, or if the DB looks too empty to be the established menu database. Each scrape
also creates a timestamped SQLite backup under `recovery_backups/`.

Before publishing, run:

```sh
python3 data_quality_report.py
```

The report checks required JSON files, manifest counts, city CSV link keys, and menu freshness.

The JSON export also writes `database/home_summary.json`. The homepage loads only this
small aggregate; the full offerings dataset is reserved for map and menu exploration.
If the manifest completion marker is briefly stale or unavailable during publishing,
the homepage keeps the summary visible and adds a publication note instead of hiding
all coverage and price figures.

When uploading a refreshed snapshot, upload the generated data files first and
`database/manifest.json` last. The manifest is the completion marker for one export.
Always include `database/home_summary.json`; its `exported_at_utc` must match the
manifest. Running `data_quality_report.py` before upload checks this.

## BUD//WATCH workflow

The admin homepage can build the watch data package from the canonical Budfinder
database and Amsterdam location CSV. **Build + update watch** then sends the complete
menu package over the existing BFWatch USB protocol without replacing the offline map
or logos. Configure a non-default project location with `--watch-dir` or `BFWATCH_DIR`.

Map-only shops remain available on the watch with an empty menu. When a location has a
separate `menu_shop_key`, the watch uses it to find menu data while retaining the stable
local `shop_key` used for favourites and map identity. A changed shop/location list is
also written to `bfwatch_data.h` and takes effect after the next firmware upload; menu
and price changes can be uploaded immediately with the in-app watch updater.

## HTTPS and response headers

The Apache `.htaccess` file redirects the public `budfinder.org` and
`www.budfinder.org` hosts to the canonical HTTPS origin. It also enables HSTS, a
Content Security Policy, other browser security headers, and JSON/text compression.
Changing JSON snapshots are stored by the browser but revalidated on every page load;
unchanged files return a small `304 Not Modified` response instead of downloading again.

After publishing, verify the host configuration:

```sh
curl -I http://budfinder.org/
curl -I https://budfinder.org/
curl -I --compressed https://budfinder.org/database/home_summary.json
```

The first response should redirect to HTTPS. The HTTPS response should include the
security headers. JSON responses should be compressed and include
`Cache-Control: public, max-age=0, must-revalidate`.

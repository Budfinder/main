# Budfinder

Static Budfinder map and strain explorer backed by exported coffeeshop menu data.

## Local Preview

Serve the directory from a local web server so the bundled JSON and CSV files can load:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Data Workflow

- `index.html` is the public homepage; `map.html` is the interactive map app.
- `database.html` is the strain explorer and comparison view.
- Homepage behaviour lives in `scripts/budfinder-home.js`; map behaviour lives in
  `scripts/budfinder-map.js` and its marker positioning helper,
  `scripts/budfinder-marker-layout.js`; explorer behaviour lives in
  `scripts/budfinder-database.js`.
- Page styles live in `styles/budfinder-home-{base,search,layout}.css`,
  `styles/budfinder-map-{base,layout,refinements}.css`, and
  `styles/budfinder-database.css` plus `styles/budfinder-database-refinements.css`.
  `styles/budfinder-polish.css` supplies shared improvements. Keep stylesheet and
  script order in each HTML page when editing or publishing these assets.
- `coffeeshop_menu_app.py` maintains the SQLite/menu-entry workflow and exports the static JSON snapshot.
- `database/*.json`, `database/*.csv`, and `database/*.sqlite` hold the menu data assets.
- `database/locations/coffeeshops.csv` is the nationwide coffeeshop catalogue. Every shop needs a stable `shop_id`/`shop_key`, a canonical `city` and `city_slug`, valid coordinates, and a `status`.
- `database/locations/index.json` registers the master catalogue plus each available city map. Add a city there when its local map file is ready.
- The individual city CSVs now supply local non-shop places such as areas and landmarks. Coffeeshop markers come from the master catalogue so the database and every map use the same identity, city, coordinates, logo, and status.
- The map keeps the nationwide catalogue loaded. Its town selector changes the camera and opening view rather than replacing the coffeeshop dataset; Amsterdam remains the default opening view.
- A local map place does not need a CoffeeshopMenus record. Use a stable local `shop_key`, leave `menu_shop_key` blank, and populate `address`, `source`, and `source_url`.
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

The report checks required JSON files, manifest counts, the nationwide coffeeshop
catalogue, city CSV references and headers, and menu source-date coverage. Freshness
is reported for every active listing: 0–14 days, 15–60 days, over 60 days, or unknown.
It also reports each shop's newest usable source date. A recent menu at one shop
does not hide old or undated rows elsewhere in the listing distribution.

Source/menu observation dates follow the map and explorer's date precedence.
`menu_checked_at_utc`, `last_seen_at_utc`, `last_seen_at`, and `updated_at` are bulk
refresh context and never make an undated menu look fresh. Future source dates count
as unknown. Age and missing-date warnings are informational; structural errors and
manifest mismatches still fail QA. The report never changes the data.

The JSON export also writes `database/home_summary.json`. The homepage loads only this
small aggregate; the full offerings dataset is reserved for map and menu exploration.
If the manifest completion marker is briefly stale or unavailable during publishing,
the homepage keeps the summary visible and adds a publication note instead of hiding
all coverage and price figures.

When uploading a refreshed snapshot, upload the generated data files first and
`database/manifest.json` last. The manifest is the completion marker for one export.
Always include `database/home_summary.json`; its `exported_at_utc` must match the
manifest. Running `data_quality_report.py` before upload checks this.

Homepage posts are managed from **Homepage updates** in the admin. Published posts are
exported to `database/updates.json` and appear in the “From Budfinder” panel on the
homepage. Menu entries can keep more than one pack size for the same shop and strain;
enter the pack price and weight for each option. Use **Legal project** for products that
are part of the regulated project so the map and database can label and filter them.

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

## Website regression checks

Run the complete publication check with Python 3.10+ and Node.js 18+ (no packages
required):

```sh
python3 scripts/check_website.py
```

If Node.js is not on your PATH, pass its executable explicitly:

```sh
python3 scripts/check_website.py --node /path/to/node
```

The runner checks the homepage, map, and explorer for duplicate HTML IDs and missing
local assets, resolves image URLs from the external stylesheets, validates inline
JSON and JavaScript syntax, and checks scripts in `scripts/` and the project root.
It discovers Node regression tests in `tests/`, runs Python `test_*.py` fixtures, and
finishes with the existing static data QA. It returns a failing exit code for a
failed check; freshness warnings remain informational. It does not install tools,
fetch remote assets, modify data, or deploy files.

To run the homepage checks separately:

```sh
node --test tests/home-regressions.cjs
```

They exercise the shipped homepage and search scripts, including price formatting,
keyboard suggestions, fast edits, failed requests, and loading timeouts.
`tests/test_data_quality.py` covers mostly stale data, undated menus, bulk refreshes,
source-date precedence, and UTC age boundaries using isolated fixtures. For UI
changes, also preview the homepage, map, and explorer at desktop and mobile widths;
check Settings with Tab/Escape, profile navigation with browser Back, and loading
more listings. Run the data quality report above before publishing.

For a website code release, upload the new or changed files in `styles/` and
`scripts/` **before** uploading `index.html`, `map.html`, and `database.html` that
reference them. Preserve the script/stylesheet ordering and update the `?v=` cache
version on changed assets. Keep earlier assets available while cached pages may
still reference them. Then verify the live homepage, map search and marker clicks,
route building, and explorer navigation. Data snapshot uploads still use
`database/manifest.json` last, as described above.

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

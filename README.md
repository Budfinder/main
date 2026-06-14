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
- `database/locations/*.csv` controls the city map rows. Live coffeeshop rows should have a stable `shop_key`.

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

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
  `styles/budfinder-menu.css` supplies the compact shop menus after those explorer
  styles. It is shared by the shop detail page and the Shop Menu Browser.
  `styles/budfinder-polish.css` supplies shared improvements. Keep stylesheet and
  script order in each HTML page when editing or publishing these assets.
- `scripts/budfinder-explore.js` and `styles/budfinder-explore.css` provide the shared
  menu filters and map/menu navigation. Upload these assets with both page scripts
  and `index.html`, `map.html`, and `database.html` for this release.
  Location, type, price per gram, source menu age, Cali and legal-project filters
  apply to the same offering. Active chips can be removed separately or cleared
  while retaining the typed search. Filter state is encoded in shareable URLs and
  carried between map results, menu results and strain profiles. Shop detail
  always displays its full menu; result filters remain available when returning.
  The map's camera selector remains separate from the Location result filter.
- `styles/budfinder-map-controls.css` is the final map-only stylesheet. Publish it
  with `scripts/budfinder-map.js` before the updated `map.html`. The compact action
  bar opens Search, Saved strains and Your route; route planning has its own panel
  view. Close and Escape retain the search and itinerary and return keyboard focus
  to the relevant action. Background search results do not take over the route view.
  Marker artwork, placement, visibility rules and spacing are unchanged.
  Searches entered on the map fit matches in the current city. A zoomed-in,
  panned map supplies the city context; otherwise the selected city view is used.
  Generic map links reopen the last city; explicit Show all cities links retain nationwide framing.
  Local searches keep other-city matches available through **Show all cities**,
  with **Back to [city]** returning to the local view. With no local matches, the
  camera stays in that city and offers the wider results explicitly. The URL's
  `search_city` / `search_view` parameters remember camera context independently
  of the `filter_city` result filter. Search framing never clusters or removes pins.
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
Its headline "typical price" is `median_listing_price` (the middle per-gram price of
all active listings), which matches what visitors see on menus; the older
strain-weighted `average_strain_price` is kept as a fallback for earlier snapshots.
The large public JSON files are written compactly (no indentation) to cut download
and parse time; `home_summary.json`, `updates.json` and `manifest.json` stay indented.
The map draws markers from `shops.json` first and loads `active_offerings.json`
once the first view is on screen, unless a search or menu filter needs it sooner.
If the manifest completion marker is briefly stale or unavailable during publishing,
the homepage keeps the summary visible and adds a publication note instead of hiding
all coverage and price figures.

When uploading a refreshed snapshot, upload the generated data files first and
`database/manifest.json` last. The manifest is the completion marker for one export.
Always include `database/home_summary.json`; its `exported_at_utc` must match the
manifest. Running `data_quality_report.py` before upload checks this.

## Average price history

The normal JSON export also builds `database/price_history.json` and
`database/price_history_shops.json` using the read-only
reconstruction in `price_history.py`. Publish this file with the other snapshot
files, before `manifest.json`. The additional file contains individual shop
histories used for optional device-local benchmarks; it does not change the
public default. The homepage chart lives in
`scripts/budfinder-price-history.js` and `styles/budfinder-price-history.css`; it
loads independently so a failed history request cannot block search or current
prices. Include `price_history.py` when updating the local admin application.

Dates are UTC recording dates, not original menu publication dates. Complete
observations replace a shop's previous snapshot; outgoing archive events remove
rows, despite their legacy `active` status. Pack and legal variants stay distinct,
repeated checks add no extra weight, and valid euro pack prices are converted to
prices per gram. The calculation matches the homepage: average each strain first,
round that mean to two decimals, then average the strain means. The export day's
point uses current inventory, including edits without historical events.

The default view is a fixed benchmark of 20 Amsterdam shops. Membership is stored
in `database/price_benchmark.json` beside SQLite and remains unchanged between
exports. The initial sample uses currently listed shops with the earliest archived
observations and at least 10 recorded days. Each shop's mean strain price contributes
once to the benchmark, so larger menus do not receive extra weight. A benchmark
point requires usable prices for every configured shop; missing shops are never
silently replaced or averaged as a smaller group. Individual shop series and full
location averages remain available from the Track selector.
Changing `price_benchmark.json` is an intentional change of sample and recomputes
that group's full history; normal exports never edit the membership file.
Visitors can choose a separate 20-shop benchmark in Skunkworks. That selection
is stored on their device, does not edit the published membership, and is
recalculated from the individual shop histories. When any selected shop has no
recorded price, that date has no benchmark average.
The main benchmark line is prominent, with the 20 individual shop traces shown
faintly behind it on the same euro-per-gram scale. Hovering a trace reveals its
shop name. The trace switch hides those lines and rescales to the benchmark alone
when a closer view is useful; it does not change the underlying averages.

Current shop eligibility applies to the full location series; historical records
of fixed benchmark members are retained even if a member is later unavailable.
Current strain identities apply throughout. Earlier coverage is partial, and menu
mix changes and unrecorded edits prevent this from being a like-for-like market
price index. The continuous line joins actual recorded markers, including across
gaps; prices between markers are unknown. The table retains missing observations,
and no intermediate daily prices are invented. Neither reconstruction nor export
changes SQLite or the menu completion/replacement workflow.

The history export takes about a second on the current dataset. Python fixtures
cover replay, removals, currencies, pack options, UTC boundaries, read-only export,
fixed membership, equal shop weighting and current-summary agreement. Node fixtures
cover continuous connections, ranges, keyboard and pointer inspection, single points,
incomplete benchmark coverage and failed, stalled or mismatched publications.

Homepage posts are managed from **Homepage updates** in the admin. Published posts are
exported to `database/updates.json` and appear in the “From Budfinder” panel on the
homepage. Menu entries can keep more than one pack size for the same shop and strain;
enter the pack price and weight for each option. Use **Legal project** for products that
are part of the regulated project so the map and database can label and filter them.

## Faster menu entry

Both **Add entry** and **Edit entry** have searchable strain and grower dropdowns.
Strain matches put exact names first, then prefixes and partial words, with common
strains ahead of less-used variants. For example, type `am haze` to find Amnesia
Haze. Press **Down** to highlight the first match, then **Up/Down** to move through
the list and **Return** to select and move to price. Return also accepts the first
match directly. Use **Escape** to keep a new name exactly as typed.
**Tab** also keeps the typed name. Selecting
or typing a grower ticks **Cali**; untick it when the origin is different.

On Add entry, **Keep settings for the next entry** remembers grower, Cali/legal
flags, currency and pack size for the current shop and menu image in that browser
tab. Names, prices and notes start blank. **Keep type for this section** also keeps
the chosen sativa/indica/hybrid/hash category; otherwise known strains suggest
their existing category. **New section** resets those shared settings without
discarding a name or price already being entered. Editing opens with the entry's
saved values rather than these add-entry defaults.

Changing an entry's strain name affects only that shop and pack option. The old
option becomes discontinued at that shop, and other shops and historical records
keep their original strain identity. If the destination option already exists,
the save is rejected with both entries preserved. Database-wide typo corrections
and merges belong to the separate **Consolidate strains** tool.

Use the **1g / 3.5g / 5g** buttons for common pack sizes, or type another weight.
**⌘/Ctrl+Enter** saves through the normal form validation. Entry helpers live in
`static/strain-picker.js` and `static/entry-helpers.js`; include these files when
updating the local admin app. Menu completion and replacement rules are unchanged.

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

The updater reports success only after the watch confirms `menus=1`. Older firmware
can reject a valid menu package when its shop list changes and continue showing
built-in menus. The repaired firmware joins menus and logos by stable shop hashes;
shops absent from a valid menu package have empty menus. Install that firmware once
to support subsequent menu updates with a changed shop count.

## Website usability refinements

Exact city, area and shop searches retain their intent when the map's delayed
menu lookup finishes. Homepage suggestions put exact names ahead of popularity
bonuses on partial names. Discovery links now precede coverage statistics and
site updates. Menu search results use a compact header with filters collapsed
by default; active filter chips remain visible. The map keeps one results scroll
area and reserves route planning for the Your route action.

Menu and strain-profile price labels expand to show the mean or median, priced
listing and shop counts, source-date age distribution and comparison scope.
Comparisons use the same currency and per-gram unit; pack options each count once.
Fewer than two distinct shops is labelled limited data. Map price help explains
its existing, separate lowest-price-per-shop calculation. Supporting text and
control borders have stronger contrast in the shared and map-specific themes.

Publish the changed home/map/database scripts, shared theme script and referenced
stylesheets before the three HTML pages. Their updated cache versions are already
included. These changes do not require a data export.

## Consistent search across the public pages

`budfinder-search.js` supplies common normalization and typed suggestion ranking.
Short codes such as G13, G-13 and G 13 (also AK47 / AK-47 and RS11 / RS-11)
share a search spelling. Suffixes and crosses remain distinct; source names and
stored strain IDs are never rewritten. Exact names lead partial and fuzzy matches.

The homepage passes the selected entity kind to the map. The map shows labelled,
keyboard-accessible suggestions, a visible Search button, and an exact selected
strain summary with a link to its price profile. Its lightweight search index has
an eight-second timeout; ordinary Search remains available if suggestions fail.
Explicit submission supports two-character strains such as K2. Menu search and
the strain browser mark exact results and distinguish related strains; profile
URLs accept the same aliases. Map, menu and profile filters remain in their URLs.

Publish the shared search script with the page scripts, map controls and database
refinement styles before the three HTML pages. The `20261028-search3` references
must be uploaded together. The complete upload archive also includes the preceding
usability release, so no earlier partial upload needs to be reconstructed.

## Map opening view and clear filters

The map remembers a useful viewport separately from its search/filter session.
Returning through generic menu links restores that view, or the last city if the
saved zoom is too wide; Amsterdam is the fallback for a new browser. Explicit city
and Show all cities links still take priority. Low-zoom legacy sessions cannot
restore the world overview, and startup cannot overwrite the last useful camera.

The visible **Clear all filters** button clears search, strain/grower, menu and
category filters and the selected destination, while retaining the camera and
planned route stops. Pending search callbacks are invalidated so they cannot
reapply a cleared filter. Publish `budfinder-map.js` and `budfinder-map-controls.css`
before `map.html`; these references use cache version `20261029-map4`.

## Map logos: full and small

Every place always shows its own logo, at its real spot
(`scripts/budfinder-marker-layout.js`). Where a full-size logo has room it
gets one; otherwise the place shows a small copy of the same logo (about 40% of
the size, with a larger invisible tap area). Logos move at most half their own
size to make room, and nothing is grouped, hidden or connected by lines.
Zooming in gives more places full logos.

Who gets a full logo when it is crowded, in order: the selected place, search
matches showing a price (the cheapest first), saved places, visited places,
coffeeshops with a menu dated within the last year (newest first), then
everything else. A fixed tie-breaker per shop spreads full logos evenly rather
than alphabetically (`markerLayoutPriority` in `budfinder-map.js`). While a
search shows prices, small logos fade slightly so the matches stand out.

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

Admin-entry fixtures also run when Flask is installed in the selected Python
environment; they use temporary databases and are skipped when Flask is absent.

To run the homepage checks separately:

```sh
node --test tests/home-regressions.cjs
```

They exercise the shipped homepage and search scripts, including price formatting,
keyboard suggestions, fast edits, failed requests, and loading timeouts.
The database fixtures also check compact menu prices, pack options, category
navigation, safe rendering and shared versus mixed menu dates. Shop menus retain
all entries and metadata; Menu details exposes the full statistics on demand.
The homepage updates panel fits three complete posts at desktop and phone widths,
with all older published posts available by scrolling inside the panel. Its height
adapts to wrapping and content changes; the scrollable region supports keyboard
navigation and describes how to reach older posts. Homepage fixtures cover long
and short feeds, resizing, escaped update text and optional web links.
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

## Public website pages

The interactive site has three pages: Home (`index.html`), Map (`map.html`), and
Price & Menus (`database.html`). Search and price help are available within
those pages.

### Crawlable city, shop and strain pages

Search engines cannot see results that the interactive pages build in the
browser, so `build_static_pages.py` writes plain HTML from the exported JSON:

- `coffeeshops/` – an index of cities, one page per city
  (`coffeeshops/amsterdam/`) and one per shop with a menu
  (`coffeeshops/amsterdam/barneys/`).
- `strains/` – an A–Z index and one page per strain listed by at least two shops.
- `sitemap.xml` – the main pages plus every generated page.

The pages use `styles/budfinder-static.css` and
`images/budfinder-badge-v3-96.webp`, need no JavaScript, and link back into the
map and Menus & prices. Shop exclusions match the homepage summary. **Export
JSON** in the admin, the automatic export after menu edits and scrapes, and
`--export-json-only` all rebuild them;
to rebuild by hand:

```sh
python3 build_static_pages.py
```

The script updates `coffeeshops/` and `strains/` in place: unchanged pages
keep their dates, changed pages are overwritten, and pages for shops or
strains that left the menus are deleted (so delete them on the server too, or
let your upload tool mirror deletions). It never deletes and recreates the
folders, because that made iCloud Drive leave empty "name 2" copies behind;
empty leftover folders inside them are removed on each run. Upload both
folders and `sitemap.xml` after the data snapshot. `404.html` is the branded
not-found page used by `.htaccess`.

### Logo thumbnails

Logos display at 34–76px, so the site loads 128px WebP copies from
`images/logos/thumbs/` and falls back to the original PNG. After adding or
replacing logos, rebuild them (needs Pillow: `python3 -m pip install pillow`)
and upload the `thumbs` folder:

```sh
python3 scripts/build_logo_thumbs.py
```

### Price checks

Every JSON export runs `price_checks.py` over the active listings and stores
the result on each one as `price_check` (empty when the price looks fine).
A listing is flagged when its euro price per gram is:

- under €4/g or over €40/g (this also catches a 1g price saved as a 3.5g pack), or
- under 40% or over 2.5× that strain's median price, once at least four shops
  list it. Cali and regular listings are compared separately.

Flagged prices stay on the shop's menu with a "Check price" note, but are left
out of lowest, typical and median prices, "great price" badges, map price
labels and the generated pages. The price history is unchanged.

There is no extra step. The admin's main menu shows **Price checks (N)** after
each export, and `python3 data_quality_report.py` lists them. Fix a typo by
editing the entry; the next export clears the flag. If a price is real, press
**Price is correct** on the Price checks page. That confirmation is tied to
the price, so the listing is checked again if the price changes, and it can be
undone on the same page. Thresholds live at the top of `price_checks.py`.

### Menu dates, addresses and opening hours

Each coffeeshopmenus shop page shows when its current menu was posted. The
scraper saves that date as `menus.source_menu_date` (and the page's address
and coffeeshopdirect.com link on the shop row), and the export puts it on
every listing as `source_menu_date`. The website shows that date instead of
the day the scraper first saw the menu. Contributor names are not kept.

A menu posted more than a year ago is exported with `old_menu` = 1. It stays
on the shop's page with its date and an "Old menu" note, but its prices are
left out of comparisons, exactly like flagged prices. The limit is
`OLD_MENU_DAYS` in `price_checks.py`.

Normal scrapes keep the dates current. To fill them in without downloading
menus, run:

```bash
python3 scrape_update_menus.py --shops database/csd.csv --db database/coffeeshops.sqlite --details-only
```

A date is only saved when the page still shows the menu already in the
database; otherwise the next normal scrape picks up the new menu and its date.

Opening hours come from coffeeshopdirect.com and were fetched once with
`python3 scripts/fetch_opening_hours.py`, which writes
`database/opening_hours.json`. Generated shop pages show them with the date
they were checked and a "check before you go" note. Run it again only if you
want to refresh them.

### Files kept off the public site

`.htaccess` answers 404 for the SQLite database, `database/csd.csv`, Markdown,
Python and test files, and hidden files such as `.DS_Store`, even if they are
uploaded by mistake. The pages never load them.

Skunkworks (`skunkworks.html`) is an unlisted personalisation page. It has a
`noindex` instruction and is not in the public navigation or sitemap. It is not
password-protected. Favourites and preferences use browser storage, and the map
shows “What’s around?” when that storage is populated. Nearby distances are
straight-line estimates; location is requested only when the visitor chooses it.

Trip guides, the city and shop directories, About, and the old `locate*.html`
pages have been retired. The hosting rules in `.htaccess` return HTTP 410 for
their old URLs. Remove the retired files from the website root when uploading
this change.

Database exports now write data files only. Restart an already-running local
admin application before the next export so it loads the updated code.

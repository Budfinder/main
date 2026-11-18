# BFWatch V2 setup

The sketch targets **LILYGO T-Watch S3 Plus** using the current
`Xinyuan-LilyGO/LilyGoLib` API and LVGL 9.

## Install and select

1. Install Arduino-ESP32 **3.3.0 or newer**.
2. Install `Xinyuan-LilyGO/LilyGoLib` and the matching
   `LilyGoLib-ThirdParty` dependencies.
3. Install **Arduino-IRremote 4.7.1 or newer**. Do not use
   `IRremoteESP8266` 2.8.6 with ESP32 core 3.3; its receiver code uses removed
   ESP32 timer APIs.
4. Select **LilyGo T-Watch-S3** as the board.
5. Select the radio revision fitted to the watch.
6. Select **16M Flash (3MB APP / 9.9MB FATFS)**.
7. Enable USB CDC on boot and OPI PSRAM.
8. Compile and upload `bfwatch.ino`.

The sketch has been compile-checked with Arduino-ESP32 3.3.10, LilyGoLib
0.2.0, LVGL 9.4.0 and Arduino-IRremote 4.7.1. The complete smartwatch build,
including the embedded MP3 and decoder, uses 68% of the 3 MB application
partition and 17% of internal global RAM.

## First run

- The display sleeps after 7 seconds by default. **Settings** can change this
  to 7, 15 or 30 seconds, or 1, 3 or 5 minutes.
- Touch, the power key or the programmable GPIO0 button wakes it.
- Pressing the GPIO0 button opposite **RESET** returns to BUD//WATCH from any
  screen and immediately chooses another random coffeeshop.
- Swipe left from the watch face to open the vertical **Apps** menu.
- The launcher order is **Map**, **Menus**, **Strains**, **Stopwatch**,
  **Countdown**, **Interval Timer**, **Alarm**, **Steps**, **Speedometer**,
  **Torch**, **TV Power**, **Wi-Fi Advertising**, **Battery**, then
  **Settings**.
- Swipe right from an app or menu to return to the watch.
- The interface uses an espresso, walnut, copper and parchment theme throughout.
- Swipe anywhere on a long list to move it naturally up or down. Lists use
  touch momentum, have no separate thumb or rail, and stop exactly at their
  first and final rows. LVGL distinguishes a drag from a tap, preventing the
  row beneath a scrolling finger from being selected accidentally. The final
  position is captured before navigation, including during momentum, so Apps,
  coffeeshop and strain lists return to the same place.
- **Menus** opens with an A-Z index showing the number of coffeeshops under
  each populated letter. **All Shops** retains the complete 156-shop view and
  **Favourites** provides a direct saved-shops list. Within a chosen group,
  favourites lead; inside Amsterdam the remainder is distance-sorted and
  elsewhere it is A-Z, so a distant GPS fix does not produce a misleading
  distance order. The `#` group contains names that do not begin with A-Z.
- When the logo package is installed, every Menus row includes a 24 x 24
  rendering scaled from its 48 x 48 master logo. Rows with an Amsterdam fix
  place the distance on a second line for easier scanning.
- Tap a shop to view its full current menu and prices. Tap any strain to make
  it the active strain and see every current stockist. **View Map**
  opens the map centred on that coffeeshop at the closest available zoom.
- The shop-detail header renders the 48 x 48 master logo at 38 x 38 inside its
  existing 42 x 42 frame, beside the shop name and compact distance/menu count.
- The **BUD//WATCH** face always chooses a random coffeeshop on every wake and
  every 5 seconds while the display remains awake. Tapping its logo/name row
  opens the map at that shop. The face uses the master 48 x 48 logo natively
  near the bottom, without an additional frame. Rotation does not reset the
  screen-off timer.
- Time, date and shop information float directly over the Dampkring artwork
  without containing boxes. The 48 x 48 logo has no adjacent accent bar or
  caption; the smaller one-line shop name and separately aligned distance are
  vertically centred against the logo. The complete shop row sits near the
  bottom while retaining a clear gap above the swipe hint. Names that exceed
  their allotted width scroll horizontally in a continuous loop; shorter names
  remain still and the distance stays fixed.
- The native-resolution Dampkring background persists across the watch face,
  app launcher and utility screens. The full-screen offline map and white
  torch are the intentional exceptions.
- Shop menus use a larger reading area. Strain types are represented by the
  colour of each strain name rather than additional type text.
- **Strains** contains an alphabetic catalogue deduplicated from all current
  menu entries. It opens with A-Z letter sections showing the number of strains
  in each section; tap a letter to browse only that letter's complete list.
  The `#` section contains names that do not begin with A-Z, and **A-Z** returns
  to the letter index. Selecting a strain is saved across restarts. Its
  stockist list shows current price, favourites first, then nearest in
  Amsterdam or A-Z elsewhere. **Map** hides non-stockists and shows only shops
  carrying the active strain.
- Shop favourites are stored in Preferences and survive sleep, restart and
  regenerated data because stable `shop_key` hashes are used rather than array
  positions. Selections saved by older firmware are removed.
- The countdown starts at zero and has 30-second and 1-minute increments. It
  wakes light sleep and repeats the configured sound/vibration alert until
  cleared.
- Alarm supports once, daily, weekday and weekend schedules plus a five-minute
  snooze. The PCF8563 RTC interrupt wakes light sleep; a complete hardware
  shutdown cannot sound an alarm.
- Settings provides **Silent**, **Vibrate**, **Sound** and **Sound + Vibe**
  alert modes, persistent alert volume from 20% to 100% in 20% steps, and a
  **Test** button. Test becomes **Stop** while the song is playing. The
  speaker rail is powered only while audio is active.
- Speedometer starts a dedicated continuous-GNSS session and reports current,
  maximum and average speed plus trip distance in km/h or mph. Its display and
  GPS remain awake until **Stop** or until the screen is left.
- Interval Timer alternates configurable work and break periods, counts
  completed rounds and wakes light sleep for each transition.
- Stopwatch retains the five most recent lap splits.
- Steps uses the BMA423 hardware pedometer and can be reset from its app.
- Battery reports charge percentage, voltage, charging state, free heap and
  free PSRAM. Torch temporarily uses a white screen at maximum brightness.
- **Settings > Set clock** writes the selected date and time to the watch RTC.
- GNSS defaults to **Manual**. **Settings** also provides **Constant**,
  **Every 2.5 min**, **Every 5 min** and **Amsterdam** modes.
- Automatic GNSS starts only after the watch has a saved fix inside the
  Amsterdam map. Obtain that first arrival fix manually.
- Automatic tracking runs while the display is awake and pauses when it
  sleeps. Constant mode refreshes a usable fix about every 3 seconds. Use the
  3- or 5-minute screen timeout when you want periodic updates while walking.
- Amsterdam mode also refreshes a usable fix about every 3 seconds while the
  watch is awake. When the display sleeps it keeps the receiver's main rail
  warm for up to ten minutes, while the display, radio, speaker and processor
  still sleep. A GPS-only timeout silently switches that rail off without
  lighting the screen. The warm hold is skipped below 20% battery unless USB
  power is connected. On the next real wake, automatic tracking resumes.
- On the map, **Centre** enables position-following. Manually dragging the map
  disables following so later GPS updates do not pull the view away from the
  area being inspected.
- A GNSS attempt times out after 75 seconds.
- Every GNSS session now performs a clean receiver power cycle while preserving
  the baud rate detected by LilyGoLib; its generic power helper otherwise
  reopens every receiver at 38,400 baud. If the UART produces no NMEA data for
  10 seconds, BFWatch retries twice and re-probes the receiver on the second
  attempt. The speedometer continues recovery attempts; manual location
  requests still stop after 75 seconds. Serial diagnostics use the
  `BFWatch GNSS:` prefix.
- Brightness is adjustable from approximately 12% to 90% and, like the other
  settings, survives restart.
- Settings uses full-width cards with large controls at both edges and a
  centred value, replacing the narrow layout formerly reserved for the
  removed scroll rail. The three utility actions are evenly spaced below.
- Button labels are clipped to their rounded controls and use an ellipsis when
  a name cannot fit. Panels and scrollable lists also clip their children, so
  text and controls cannot paint over their borders.
- **Settings > Raise** enables or disables raise-to-wake for the current
  session and starts off after every reboot while the feature is being tested.
  The BMA423 uses an active-low tilt interrupt in the same light-sleep wake
  group as touch and the power key. A wrist wake opens the watch face; touch
  and power-key wakes resume the current page. If the motion line is not idle
  before sleep, BFWatch omits it for that sleep cycle so touch and power remain
  available.
- Stopwatch, countdown and interval sessions continue through light sleep.
- Wi-Fi remains off except during the explicitly started
  **Wi-Fi Advertising** app. LoRa remains disabled. The accelerometer runs the
  hardware pedometer; Raise controls only the additional tilt-wake feature.

## Alert audio

The supplied 10.03-second `totakas_song.mp3` is embedded in the application as
`alert_audio.h`. Countdown and clock alarms loop it, with a short pause between
plays, until stopped or snoozed. Interval transitions play it once. Decoding is
performed one MP3 frame at a time so touch, timers and the rest of the UI remain
responsive.

To replace the sound later, run this from the sketch directory:

```bash
python3 generate_alert_audio.py "/path/to/replacement.mp3"
```

The generator reads the MP3 without changing it and replaces only the generated
header. The current embedded file is 160,913 bytes with SHA-256
`9f35b91ccdada069e4093ce075a25f02893b053dbd2c7894617c3fdcc00da4fc`.
Compile and upload the sketch after regenerating the header; the FFat map,
menus and logos do not need to be uploaded again.

The fixed-point Helix decoder is vendored under `src/libhelix-mp3`, including
its licence files. No extra Arduino audio library needs to be installed.

## Wi-Fi Advertising

The **Wi-Fi Advertising** app offers two selectable SSIDs:

- `Budfinder_Bestfinder`
- `Dont_Sleep_On_Budfinder`

Selecting one starts a normal, open ESP32 access point for 60 seconds. Only
one SSID is broadcast at a time; selecting the other switches to it. The
screen shows the active name and remaining time, and **Stop Wi-Fi** ends it
immediately. Pressing the power key also stops it. The screen remains awake
during the short broadcast so automatic shutdown is not postponed by light
sleep, and Wi-Fi returns fully off afterward.

## TV remote

The **TV power** screen contains common LG, Samsung and Sony power-toggle
codes. Choose a brand, point the top of the watch at the television, and hold
the red button for about half a second.

These are power toggles, not guaranteed discrete-off commands: pressing one
while the TV is already off may turn it on. IR codes vary between models, and
the watch's single built-in IR LED has a much shorter range than a dedicated
multi-LED TV-B-Gone transmitter.

The TV-B-Gone V2 European code database is a practical future fallback. It
would add a cancellable scan of approximately 145 codes, stored in flash, for
TVs that do not respond to a known model-specific command.

## Refresh coffeeshops and strains

`generate_watch_data.py` joins `amsterdamLoc.csv` to the latest active
offerings in `coffeeshops.sqlite`, then creates:

- `bfwatch_data.h`, the compact flash-resident data compiled into the watch;
- `bfwatch_data.json`, a readable snapshot for checking the result;
- `watch_menus/menus.bin`, a CRC-checked menu update for FFat.

The generator uses `menu_shop_key` when a map location has a separate Budfinder
menu identity, while keeping `shop_key` as the stable watch/map/favourite identity.
Open map-only shops are retained with an empty menu instead of being dropped.

The Budfinder menu admin can run this workflow from **Update BUD//WATCH**. **Build
package** regenerates the files, **Validate upload** performs a menu-package dry run,
and **Build + update watch** regenerates and sends `menus.bin` over USB. Newly added
shop locations are written to `bfwatch_data.h` and require the next normal firmware
upload; menu and price changes can be sent immediately without replacing the map.

Run it from the sketch directory whenever either source is updated:

```bash
python3 generate_watch_data.py
```

`menus.bin` always contains every active offering for every included shop.
Generation fails if its packaged count does not exactly equal the active
source count. The flash-resident C++ header remains a compact emergency
fallback with up to 12 useful strains per shop; it prioritises requested
strains, retains a mixture of regular/Cali menu types, and fills remaining
slots with the lowest prices. Fallback options include:

```bash
python3 generate_watch_data.py \
  --wanted-strain "Permanent Marker" \
  --wanted-strain "White Choco" \
  --max-strains-per-shop 16
```

Use `--max-strains-per-shop 0` only if the compiled fallback must also contain
every active offering. This does not change `menus.bin`, which is already
complete. An optional `--favourites-file favourites.txt` accepts one shop name
or `shop_key` per line. The source database and CSV are opened read-only and
are never modified.

The header remains a built-in fallback. After the first firmware upload,
future menu and price refreshes do not require recompiling the sketch:

```bash
python3 generate_watch_data.py
python3 upload_watch_map.py --menus-only
```

The current full menu package contains 156 shops, all 2,521 active
strain/price records and 1,150 distinct case-insensitive strain names in
36,327 bytes. The watch matches records by stable `shop_key` hash, loads the
package into PSRAM and validates its structure, completeness and CRC. Shop
detail screens can fall back to the compact compiled snapshot if the file is
missing or invalid, but strain-wide search is deliberately disabled because
a partial result would be misleading.

The generator also calculates the default Amsterdam map centre using the
median latitude and longitude of the open location rows, matching the
BudFinder.org fallback method. The current data produces approximately
`52.370075, 4.892154`. This point is a map viewport fallback only; it is never
presented as the user's physical position.

Distances are straight-line distances. Directions are true bearings such as
`SE - 127 deg true`; they do not pretend that the watch has a compass.

## Regenerate the watch-face background

The project includes the generated square source artwork at
`assets/dampkring_watchface_source.png`. Convert it to the native 240 x 240
preview and the flash-resident RGB565 firmware asset with:

```bash
python3 generate_watchface_background.py
```

This produces:

- `assets/dampkring_watchface_240.png`, the exact desktop preview;
- `watchface_background.h`, the LVGL image declaration;
- `watchface_background.cpp`, 115,200 bytes of RGB565 pixel data plus its
  descriptor.

The default conversion applies a 70% brightness treatment so live gold and
parchment text remains readable. Use `--brightness` to tune it if required.
The asset is compiled into the normal sketch and does not use or replace the
offline map partition.

## Build the offline map

`convert_mbtiles.py` opens the OpenMapTiles MBTiles database read-only,
decodes its gzip-compressed vector PBF tiles, draws a purpose-made watch map,
and creates baseline JPEG tiles using standard XYZ addressing.

Inspect the source without writing anything:

```bash
python3 convert_mbtiles.py --inspect-only
```

Create the production package, including the bounded central z16 detail layer:

```bash
python3 convert_mbtiles.py \
  --zooms 14,15,16 \
  --detail-bounds 4.850463868,52.352118574,4.905395507,52.382305627
```

Regenerate an existing package:

```bash
python3 convert_mbtiles.py \
  --zooms 14,15,16 \
  --detail-bounds 4.850463868,52.352118574,4.905395507,52.382305627 \
  --overwrite
```

By default, the bounds contain every shop in `bfwatch_data.json` plus a 1 km
margin. The production command renders zooms 14 and 15 across that full area,
then applies the smaller bounds only to zoom 16. The MBTiles source ends at
zoom 14, so zoom 15 is rendered at double resolution and zoom 16 at quadruple
resolution before being divided into crisp child tiles. The current package
has 460 tiles: 81 at zoom 14, 289 at zoom 15 and 90 at zoom 16. The z16 area
contains 120 of the 156 coffeeshops in the dense centre without consuming the
space a city-wide z16 layer would require.

The `watch_map` output contains:

- `map/`, individual JPEGs retained for desktop inspection;
- `map.idx` and `mapNN.bin`, the compact FFat upload payload;
- `map_index.json`, package metadata and XYZ ranges;
- `map_config.h`, matching firmware constants;
- `conversion_report.txt`, source and storage diagnostics;
- `preview_z16.jpg`, a desktop QA image that does not go on the watch.

Opening a shop from the map and pressing **Back** restores the same map centre
and zoom level.

Useful alternatives include:

```bash
python3 convert_mbtiles.py --quality 70 --zooms 14,15 --output watch_map_small
python3 convert_mbtiles.py --bounds 4.79,52.30,4.98,52.42 --output watch_map_custom
```

Pillow is the only non-standard Python dependency. The converter never writes
to the source MBTiles file, converts TMS rows to XYZ correctly, and refuses to
overwrite an output directory unless it contains the converter's safety
marker.

## Upload the offline map, logos and menus

Upload the normal `bfwatch.ino` sketch first. Leave **Erase All Flash Before
Sketch Upload** disabled so later firmware uploads preserve the map.

Wake the watch, connect its USB cable, then run:

```bash
python3 upload_watch_map.py
```

The uploader uses Python's standard library and automatically detects a single
`/dev/cu.usbmodem*` or `/dev/cu.usbserial*` device. If necessary, specify it:

```bash
python3 upload_watch_map.py --port /dev/cu.usbmodem1101
```

It reformats the dedicated map partition, then uploads 15 packed map segments,
the menu pack, logo data and logo index, and the map index through BFWatch's
serial protocol: 19 files in total. Every file is verified with CRC-32. Favourites
and other settings are stored separately and are not affected. The watch
acknowledges every 128-byte USB block before the next one is sent, and the
uploader automatically retries a segment after a transient USB serial
timeout. No reboot is required.

The firmware loads the 156 master logos into one approximately 1.37 MiB PSRAM
cache the first time Menus or a shop detail is opened. Menu and detail
thumbnails are scaled at draw time. This avoids using the smaller internal
heap and avoids repeatedly reading the logo file while scrolling.

If the upload process itself stops, resume at the file number shown in the
error without deleting the files already received. For example:

```bash
python3 upload_watch_map.py --resume-from 7
```

Only resume with the same generated `watch_map`, `watch_logos` and
`watch_menus` packages. A normal upload without `--resume-from` intentionally
clears the old package first. Check the package without touching the watch with:

```bash
python3 upload_watch_map.py --dry-run
```

The current packed map, 48 x 48 logo master and full menu pack have a raw
upload payload of approximately 8.29 MiB. Their estimated FAT allocation is
approximately 8.64 MiB, leaving about 1.13 MiB free in the watch's measured
9.76 MiB FFat partition.

The upload protocol disables automatic display sleep while a transfer is
active. Wake the watch before starting because USB serial input is not a
configured wake source.

## Generate coffeeshop logo markers

`generate_watch_logos.py` joins active coffeeshops in `amsterdamLoc.csv` to
the filenames in its `logo` column and reads source artwork from `logos/`.
Neither source is modified.

Generate the watch logo pack with:

```bash
python3 generate_watch_logos.py
```

Regenerate an existing output with:

```bash
python3 generate_watch_logos.py --overwrite
```

The default output is `watch_logos/`:

- `logos.bin`: deduplicated 48 x 48 BGRA8888 master sprites;
- `logos.idx`: stable `shop_key` hashes and binary offsets;
- `logos_config.h`: generated firmware constants;
- `logos.json`: coverage, missing references and diagnostics;
- `preview_logos.png`: labelled visual QA contact sheet.

The current source set contains 156 active coffeeshops and resolves all 156
CSV logo references. Deduplication produces 140 unique sprites: 1,290,240
bytes of image data plus a 1,900-byte index.

Useful size overrides are available for testing:

```bash
python3 generate_watch_logos.py --size 32 --inner-size 28 --output watch_logos_small
```

The standard `upload_watch_map.py` command includes these generated logo
assets automatically.

After changing logos without changing the map, replace only the two logo files:

```bash
python3 upload_watch_map.py --logos-only
```

This preserves the installed map and transfers approximately 1.23 MiB instead
of clearing and resending the complete package.

## Use the offline map

- Open **Apps > Map**.
- Opening Map from Apps always starts at the Amsterdam fallback centre at zoom
  14, providing the complete overview rather than retaining an earlier pan.
- Drag the map to pan.
- Use **+** and **-** for zooms 14, 15 and 16.
- Zoom 16 is intentionally limited to the dense central detail zone. The watch
  prevents entry from outside that zone and automatically returns to zoom 15
  if GPS-following moves beyond it, so no blank tile area is exposed.
- **Centre** returns to the saved position when it lies inside the map;
  otherwise it uses BudFinder's Amsterdam fallback centre.
- **GPS** starts the existing manual, timeout-limited location flow.
- Zooms 15 and 16 display logos for every visible coffeeshop.
- Opening **Map** from a selected strain's stockist list starts at zoom 14 and
  shows only current stockists. That filter persists while viewing a marker's
  shop menu and returning to the map; opening Map normally clears it.
- Map logos are alpha-aware downscales from the 48 x 48 master to 24 x 24.
- Zoom 14 retains small green dots for ordinary shops and displays logos for
  favourites and a shop opened with **View Map** to limit clutter.
- Favourites have a pink surround and the currently focused shop has a yellow
  surround.
- A generated initials marker is used when the CSV logo file is unavailable.
- At any zoom, tap a shop marker to open its menu summary.
- A blue marker with a white edge is the saved GNSS position.

GNSS remains off until requested. Map panning and zooming read local JPEGs and
do not activate Wi-Fi, Bluetooth or GPS.

BFWatch explicitly gives Arduino's `loopTask` a 20 KiB stack. LVGL's streaming
JPEG decoder and draw chain overflow the ESP32 Arduino default of 8 KiB when
four clipped map tiles meet at the viewport. The extra stack is internal RAM;
the decoded map and marker overlay use PSRAM.

## Power note

This first version uses touch/button-wake **light sleep** to preserve UI and
timer state. After hardware testing, it can be upgraded to deep sleep with
persisted state for substantially lower idle current.

Raise-to-wake is still a hardware-test feature: real-world sensitivity depends
on wrist orientation and ordinary arm movement. **Raise Off** disables the
tilt interrupt while leaving the pedometer active. If wake inputs ever become
unresponsive, click the physical **RESET** button; Raise returns off rather
than being restored from Preferences. Once verified on the watch, it can
safely become a persistent setting.

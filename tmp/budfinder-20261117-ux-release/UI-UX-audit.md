# Budfinder UI and UX audit

17 November 2026 · Local release preview using the 16 November 2026 menu snapshot

## Comparing a strain in one city

A visitor can now open a featured strain, choose a city, compare its prices, open a shop’s menu and return to the same city. Each city choice shows the number of distinct shops. Other active filters still apply, and the URL carries the city when copied or reloaded. Selecting **All cities** restores nationwide coverage.

In the preview, Amnesia Haze had 243 shops nationwide. Choosing **Nijmegen · 8 shops** showed eight listings, an average of €8.31/g and a range of €8–€9.50/g. Selecting the De Wedren name or logo opened its menu. Browser Back restored the same eight listings. The separate **View on map** action opened De Wedren’s marker and shop details with **1 matching shop · Nijmegen**.

## Sweep findings

| Area | What changed or was checked |
| --- | --- |
| Homepage discovery | Featured strains open their exact profile. The all-strains link opens the directory. The link for 2–3 shop finds previously opened the generic search landing page. It now opens 376 qualifying strains. A city filter narrows that list while preserving the nationwide definition. Returning from a rare strain restores the directory. |
| Homepage search | Checked typing, matching suggestions and Escape at phone width. Keyboard dismissal survives delayed search updates. Empty submissions and unmatched queries give feedback. Enlarged action targets and bottom spacing improve phone navigation. |
| Strain listings | The shop name and logo share one menu link, and each card has one map action. The price sits below the shop identity so longer names have room. One-gram prices appear once. A missing price reads “Price unknown”. Larger packs keep their total and per-gram prices where available. |
| Long results and keyboard navigation | The database skip link now goes to the visible search field or profile. On the nationwide Amnesia Haze profile, **Show 12 more** increased the visible listings from 12 to 24 and moved keyboard focus to the first newly added shop. |
| Map search | On a phone, **Show results** opens at **Best matches**. With zero matches it focuses the count and leaves the filters available. Verified a city-filtered shop link, the marker details, the saved-strains empty state and the route planner. Escape closed map settings, returned focus to Settings and removed the settings fragment from the URL. |
| Price history and settings | Opened the history table at 320 pixels. Dates, prices, shop counts and strain counts remained available without page-wide horizontal scrolling. Checked the shared Settings panel, its appearance disclosure, keyboard focus and Escape. |
| Skunkworks | Checked the unlisted page at phone and desktop widths, including shop search, zero-match feedback, radius options and the 20-shop benchmark selection status. |

## Remaining priorities

1. **Make longer map result lists browsable.** Best matches currently lists up to six shops on phones and ten on desktop. The summary gives the total, but a visitor scanning shops by name cannot continue through the list. A **Show more** control beneath the last card would help, especially when many markers share a small area.
2. **Prioritise source-date coverage.** Of 6,544 active records in the data audit, 2,302 had a source date over 60 days old and 1,419 had no usable source date. Keep the date attached to each price and prioritise source checks for frequently compared shops. A newer site export alone cannot establish when a menu price was observed.

## Verification and release

The browser walkthrough covered Home, Menus & prices, Map, shared Settings and the unlisted Skunkworks page. Spot checks used 320, 390, 768 and 1,280 pixel viewport settings. The journeys checked included direct entry, reload, Back, opening a menu and a map marker, loading more, switching panels, keyboard focus and empty results.

The project checks passed all 228 JavaScript tests and 51 Python tests, alongside script syntax, referenced assets and data integrity checks. Device coverage used browser emulation. Physical iOS and Android devices, screen-reader speech output, GPS accuracy and production load times remain unverified.

The upload archive contains nine website files. Upload its three stylesheets and three scripts first, followed by the three HTML pages. Preserve the folder structure. The screenshots show the local release preview.

- [Upload archive](Budfinder-UI-UX-update.zip)
- [Desktop city profile](city-profile-desktop.jpg)
- [Phone shop listings](city-profile-phone.jpg)

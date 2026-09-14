# MCU Tracker

A standalone MCU movie/show checklist using IndexedDB for persistent progress.

## Files
- `index.html` — page markup
- `styles.css` — visual design
- `data.js` — editable MCU catalog
- `app.js` — IndexedDB, filters, progress UI

## Sorting
The UI supports three sort modes:
- **Release date** — theatrical/streaming premiere date.
- **Chronological / story order** — editable `storyOrder` for in-universe viewing order.
- **Phase order** — MCU phase followed by the item's release-list order within the phase.

The story-order values are intentionally stored as data rather than hard-coded in the UI, so they can be corrected as Marvel updates its official chronology.

## Updating the catalog
Edit `data.js`. Each entry has:
- `id`: permanent unique identifier. Keep an existing ID unchanged so saved progress survives updates.
- `title`
- `year`
- `phase`
- `type`: `movie` or `show`
- `status`: `Released` or `Upcoming`
- `order`: stable catalog order
- `releaseDate`: ISO date (`YYYY-MM-DD`) used by Release Date sorting
- `storyOrder`: numeric in-universe ordering used by Chronological / Story sorting
- `phaseOrder`: generated from phase + catalog order for Phase sorting

Add future titles by appending an object with a new ID.

## Storage
Progress is stored in the browser's IndexedDB database named `mcu-tracker`, in the `progress` object store. It is local to the browser/origin and requires no account or server.

## Scope
This version treats the MCU checklist at the feature-film + season/series level. Marvel Studios shorts, One-Shots and Special Presentations are intentionally omitted because the requested UI has Movie/Show filters. The catalog can be extended later if desired.

The catalog was assembled against Marvel's current MCU movie/TV listings and the current MCU timeline landscape as of September 2026. Release dates and MCU continuity can change; `data.js` is deliberately separated so the list can be maintained without touching the UI.

## App icon

The site includes a custom icon in `favicon.svg` for browser tabs and `apple-touch-icon.png`
(180×180) for iPhone/iPad Home Screen bookmarks. The Apple touch icon is explicitly linked
so iOS uses it instead of falling back to the first letter of the page title.

## Expanded show coverage

The show catalog includes Agent Carter, Agents of SHIELD, the Netflix/Defenders Saga (Daredevil, Jessica Jones, Luke Cage, Iron Fist, The Defenders, and The Punisher), Inhumans, Runaways, Cloak & Dagger, and I Am Groot in addition to the Marvel Studios/Disney+ series. These legacy Marvel Television entries are labeled **Legacy** rather than assigned a numbered MCU Phase.

### Chronological sorting note
Legacy television seasons often span multiple MCU film events, so their story-order positions are intentionally approximate at the season level. For an episode-by-episode viewing order, the catalog would need to split seasons into episode ranges around the relevant films.

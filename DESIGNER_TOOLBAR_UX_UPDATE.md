# Designer toolbar UX update

Changelog for Warehouse Designer toolbar improvements.

## Building dimensions removed from toolbar

- The toolbar no longer displays building dimensions (e.g. "Budynek: 24 × 16 × 5 m") or the "Ustaw wymiary budynku" button.
- Building dimensions remain available in the sidebar "Budynek" section in **Layout i szablony**.
- Layout data (`layout.building_width_m`, `layout.building_depth_m`, `layout.building_height_m`) is unchanged; only the toolbar UI was removed.

## Occupancy replaced with progress bar

- The previous text "Zajętość: X%" was replaced with a small visual progress bar.
- The toolbar now shows:
  - Label: "Zajętość"
  - A narrow bar (128px / `w-32`) with slate-200 track and emerald-500 fill
  - Percentage value to the right (e.g. "7%")
- The bar is subtle, uses Tailwind classes, and matches the toolbar style. Occupancy is still only shown when building dimensions are set and usage percent is available.

## Verification

- Toolbar shows: **Magazyn | Projektant Layoutu | Zajętość [progress bar] | warehouse selector | save status**
- Toolbar no longer shows: **Budynek: 24 × 16 × 5 m**

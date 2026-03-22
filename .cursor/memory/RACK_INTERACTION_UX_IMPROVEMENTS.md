# Rack interaction UX improvements

Changelog for Warehouse Designer rack interaction updates (frontend only).

## Copy moved to rack toolbar

- **Kopiuj**, **Wklej**, and **Odznacz** were removed from the Rack Properties sidebar.
- A **Copy rack** action was added to the floating rack toolbar (SelectionOverlay).
- Toolbar button uses a copy-style icon and tooltip: "Kopiuj regał".
- Clicking it calls `onCopyRack(selectedRack)` and enters copy placement mode.

## Copy placement mode

- **Copy** from the toolbar stores the rack in clipboard and immediately enters placement mode.
- A ghost rack follows the cursor and snaps to grid cells (same behaviour as template placement).
- **Click** on the canvas places a duplicate at the cursor cell and exits placement mode.
- **Escape** cancels copy placement and clears the ghost.

## Properties panel simplified

- The Rack Properties panel now contains only rack information and editable parameters.
- Unused props were removed: `setClipboard`, `clipboard`, `getPastePosition`.

## Locations grouped by level

- The location list in Rack Properties is now grouped by level.
- Each section is titled **Poziom 1**, **Poziom 2**, etc.
- Under each level, positions show `locationAddress`, or fallback to `locationUUID`, or position index.

## Shared rack duplication helper

- **`duplicateRacksAtPosition(racks, cellPosition, nextRackIndexBase)`** was added in `warehouseUtils.ts`.
- It is used by:
  - **Ctrl+V** (paste)
  - **Ctrl+D** (duplicate)
  - Copy-placement click (placing the copied rack)
- Duplication logic is no longer duplicated in multiple places.

## Verification

- Selecting a rack shows the floating toolbar with the Copy button.
- Copy → ghost follows cursor → click places copy; Escape cancels.
- Ctrl+D still duplicates the selected rack(s).
- Rack properties panel and location list (grouped by level) work as described.

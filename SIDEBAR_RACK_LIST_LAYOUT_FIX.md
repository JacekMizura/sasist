# Sidebar rack list layout and visibility fix

Changelog for Warehouse Designer sidebar UX improvements.

## FIX 1 — Rack list item layout (3 lines)

**File:** `frontend/src/components/warehouse/RackSidebar.tsx`

- Rack list items were previously a single line: **name · dimensions · volume**.
- Each rack button now uses a vertical layout:
  - **Line 1** — rack name (`getRackDisplayId(r)`)
  - **Line 2** — dimensions (`width×length×height cm`)
  - **Line 3** — volume (`dm³`)

Example display:

```
A1
150×60×210 cm
1890 dm³
```

- The rack button wrapper and click behavior (select / Ctrl+click multi-select) are unchanged.

## FIX 2 — Hide rack list in "Elementy wizualne"

**File:** `frontend/src/components/warehouse/RackSidebar.tsx`

- The "Lista regałów" section (rack list, search, usage summary, Save button) was shown for both sidebar tabs.
- The section now renders only when the **"Layout i szablony"** tab is active.
- Condition changed from `!showOnlyCatalog` to `!showOnlyCatalog && activeTab === "catalog"`.
- On the **"Elementy wizualne"** tab, the rack list is hidden; only the visual elements (columns, walls, doors, etc.) are shown.

## Verification

- **Layout i szablony tab:** rack list visible; each rack item shows name, dimensions, and volume on three lines.
- **Elementy wizualne tab:** rack list hidden.

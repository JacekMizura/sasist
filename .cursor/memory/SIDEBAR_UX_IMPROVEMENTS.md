# Sidebar UX improvements

Summary of UX changes in the Warehouse Designer sidebar. Layout logic and backend APIs were not changed; only UI behavior and labels were updated.

---

## 1. Renamed catalog tab

- **File:** `frontend/src/constants/uiStrings.ts`
- **Change:** `UI_STRINGS.warehouse.rackSidebar.catalog` updated from **"Katalog"** to **"Layout i szablony"**.
- The same key is used for the tab and the collapsible section header, so both now show the new label.

---

## 2. Added rack list search

- **File:** `frontend/src/components/warehouse/RackSidebar.tsx`
- **State:** `const [rackSearch, setRackSearch] = useState("")`.
- **Filtering:** `filteredRacks` filters `layout.racks` by normalizing and matching:
  - `getRackDisplayId(r)`
  - `r.name`
  - `r.label`
  - `r.rowPrefix`
  using a `normalize()` helper (trim, toLowerCase, NFD accent strip).
- **UI:** Search input with placeholder **"Szukaj regału..."** (from `UI_STRINGS.warehouse.rackSidebar.rackSearchPlaceholder`) and `aria-label="Szukaj w liście regałów"`, placed above the **"Lista regałów"** header. The list renders `filteredRacks`; when there are no matches but racks exist, the message **"Brak wyników wyszukiwania"** is shown.

---

## 3. Moved Export button above Building section

- **File:** `frontend/src/components/warehouse/RackSidebar.tsx`
- **Change:** A new block was added **above** the "Budynek" section, visible when `!showOnlyCatalog` and any of `onExportPdf`, `onExportCsv`, `onExportJson`, or `onExportLocationsMapCsv` is provided.
- **Button:** Primary green button **"Eksportuj"** with `className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs font-semibold ..."` and the same dropdown icon (▾). Click toggles the same export dropdown (locations CSV, PDF, CSV, JSON).
- The previous export dropdown and the standalone "Pobierz Mapę Lokalizacji (CSV)" button were **removed** from the rack list section; all export actions are now in this single block above Budynek.

---

## 4. Renamed CSV download

- **File:** `frontend/src/constants/uiStrings.ts` and `frontend/src/components/warehouse/RackSidebar.tsx`
- **Change:** New key `UI_STRINGS.warehouse.rackSidebar.exportLocationsCsv` = **"Pobierz lokalizacje"**.
- The export dropdown option that was labeled **"Pobierz Mapę Lokalizacji (CSV)"** now uses this string (and appears as the first option in the moved Export dropdown).

---

## 5. Rack list metrics updated

- **File:** `frontend/src/components/warehouse/RackSidebar.tsx`
- **Removed:** Percentage occupancy display (`{formatVolume(pct)}%`) and the `pct` (and `used`) calculation for the rack list.
- **Added:** For each rack in the list:
  - **Dimensions:** `width_cm × length_cm × height_cm` (using `r.length_cm ?? r.depth_cm` for depth).
  - **Total volume:** `total_capacity_dm3` (or sum of bin volumes), shown as e.g. **12000 dm³** (with `toLocaleString()`).
- **Format:** `A-01 · 600×1200×2000 cm · 12000 dm³` (display ID · dimensions · volume).

---

## 6. Building edit icon unified

- **File:** `frontend/src/components/warehouse/RackSidebar.tsx`
- **Change:** The building section **"Edytuj"** text link was replaced with the same pencil SVG icon used for template editing:
  - `<svg className="w-3.5 h-3.5" ... path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />`
  - `title="Edytuj budynek"` and `aria-label="Edytuj budynek"`.
  - Same styling pattern as template edit: `p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700`.

---

## Verification checklist

- [ ] Rack search filters by display ID, name, label, rowPrefix.
- [ ] Export dropdown (above Budynek) opens and all options work (locations CSV, PDF, CSV, JSON).
- [ ] CSV download (Pobierz lokalizacje) works.
- [ ] Rack list shows dimensions and volume; no percentage.
- [ ] Building edit (pencil icon) opens the building editor.

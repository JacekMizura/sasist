# Raport: usunięcie segmentacji ABC/XYZ (Zakupy i planowanie)

Data: 2026-06-08

## 1. Pliki usunięte

### Frontend
- `frontend/src/api/purchasingSegmentsApi.ts`
- `frontend/src/pages/purchasing/PurchasingSegmentsPage.tsx`
- `frontend/src/pages/purchasing/plan/PlanSegmentHeatmap.tsx`
- `frontend/src/modules/purchasing/views/InventoryPriorityView.tsx`

### Backend
- `backend/services/purchasing_segments_service.py`
- `backend/schemas/purchasing_segments.py`

## 2. Endpointy usunięte

| Endpoint | Opis |
|----------|------|
| `GET /purchasing/segments` | Główny endpoint ABC/XYZ (heatmapa, priorytety, segmenty AX–CZ) |

### Parametry usunięte z istniejących endpointów
- `GET /purchasing/replenishment` — parametr `segment_abc`
- `GET /purchasing/replenishment/export` — parametr `segment_abc`

**Uwaga:** Endpoint `/purchasing/priorities` nigdy nie istniał — „Priorytety asortymentu” były aliasem UI dla `/purchasing/segments`.

## 3. Modele / DTO uproszczone

| Warstwa | Zmiana |
|---------|--------|
| `ReplenishmentSummaryOut` | Dodano `low_stock_count`; usunięto zależność od ABC |
| `PurchaseAutoReorderPreviewRowOut` | Usunięto pole `segment` |
| `PurchaseAutoRule.config_json` | Usunięto klucze `only_segments`, `segment_range_days` z domyślnej konfiguracji |
| `InventoryDocumentFilters` | Usunięto `abc_class` (filtr nigdy nie miał kolumny produktu) |

**Brak kolumn DB do DROP:** `abc_class`, `xyz_class`, `abc_xyz_segment`, `priority_segment`, `inventory_segment` nie były persystowane na `Product` — segmentacja była liczona w locie.

## 4. Potencjalne miejsca wymagające migracji danych

Opcjonalny skrypt SQL (nie uruchamiany automatycznie):

`backend/db/migrations/optional/2026-06-08_drop_abc_xyz_purchasing.sql`

- `purchase_auto_rules.config_json` — legacy klucze `only_segments`, `segment_range_days`
- `inventory_documents.filters_json` — legacy klucz `abc_class`
- Brak `DROP COLUMN` — brak kolumn do usunięcia

## 5. Kod martwy / poza zakresem (świadomie zachowane)

| Obszar | Powód |
|--------|--------|
| `backend/services/slotting_service.py` — `abc_class` | Osobny algorytm slottingu (velocity percentile), nie purchasing ABC/XYZ |
| `frontend/src/pages/Analysis/SlottingPage.tsx` | Jak wyżej |
| `RackSegment`, `rack_segments` | Segmenty fizyczne regałów konsolidacyjnych — inna domena |
| `analysisApi.ts` — `SlottingProduct.abc_class` | Slotting, nie zakupy |

## 6. Zamiennik funkcjonalny w Planie zakupów

Nowy pasek **`PlanCategoryStrip`** z 5 kategoriami (liczone bez ABC/XYZ):

1. **Hity sprzedaży** — alerty `rising_demand`
2. **Niski zapas** — filtr `low_stock_only` + KPI `low_stock_count`
3. **Martwy stock** — alerty `dead_stock`
4. **Ryzyko braku** — alerty `low_cover_days`
5. **Wysoka wartość magazynu** — alerty `high_capital_locked`

Usunięto: heatmapę AX–CZ, kolumnę „Seg.”, filtr „Klasa ABC”, panel segmentu w drawerze produktu.

## 7. Pliki zmodyfikowane (skrót)

**Frontend:** `PurchasingReplenishmentPage.tsx`, `PlanProductDetailPanel.tsx`, `PlanCategoryStrip.tsx` (nowy), `PurchasingAutoReorderPage.tsx`, `purchasingReplenishmentApi.ts`, `purchasingAutoReorderApi.ts`, `lazyViews.ts`, `App.tsx`, `navActive.ts`, `uiStrings.ts`, inventory count wizard/presets

**Backend:** `api/purchasing.py`, `purchasing_replenishment_service.py`, `purchasing_auto_reorder_service.py`, `purchasing_price_opportunities_service.py`, `purchasing_replenishment.py` (schema), `purchasing_auto_reorder.py` (schema), inventory count ABC filter cleanup

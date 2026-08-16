# Audyt: PZ WMS ↔ OMS (StockDocument 136)

Data: 2026-08-16  
Zakres: read-only (bez implementacji fixa, bez mutacji danych produkcyjnych).  
Uwaga: brak `DATABASE_URL` / auth do prod API w tej sesji — punkty inventory/movements dla id=136 oparte o **model kodu** + opis operatora; weryfikacja SQL na prod = follow-up.

## A. Lifecycle krok po kroku (WMS PZ)

1. **Utworzenie PZ (WMS Przyjęcie)**  
   `status=draft`, `receiving_status=IN_PROGRESS` (lub NEW→IN_PROGRESS), `putaway_status=NOT_STARTED`, `relocation_status=OPEN`.

2. **Przyjęcie rzeczywistej ilości** (`wms_receiving_service`)  
   - `StockDocumentItem.received_quantity` += delta  
   - `StockOperation` type **RECEIPT** (`append_receipt_operation`, często `skip_inventory_movement=True` + osobny ledger)  
   - **Inventory na lokacji przyjęcia (DOCK / `doc.location_id`)** via `_apply_dock_inventory_for_receipt`  
   - `warehouse_product_operation` movement_type **RECEIVING**  
   - Dokument **pozostaje `status=draft`**.

3. **Finish receiving** (`finish_wms_receiving_pz`)  
   - wymaga nadal `status=draft`  
   - `receiving_status=DONE`  
   - nadal **`status=draft`** (nie finalizuje dokumentu magazynowo).

4. **Rozlokowanie** (`wms_putaway_service`)  
   - pobór z DOCK → lokalizacja docelowa (`_transfer_from_dock_to_location`)  
   - Inventory: −DOCK, +target (np. S1-A-1)  
   - ops: MOVE_OUT / MOVE_IN / **PUTAWAY** + warehouse movement **PUTAWAY**  
   - `quantity_putaway` na linii; `putaway_status` → IN_PROGRESS / DONE (recompute).

5. **Finalize rozlokowania** (`finalize_wms_relocation_pz`)  
   - **nie modyfikuje inventory**  
   - `relocation_status=DONE`, `putaway_status=DONE`  
   - jeśli `receiving_status=DONE` i `status` in (`draft`,`CLOSED`) → **`status=zakonczone`**.

6. **Opcjonalna ścieżka OMS** (`accept_stock_document`)  
   - dozwolone dla `draft` **lub** `zakonczone`  
   - ustawia `status=posted`  
   - inventarz dokłada tylko `to_dock = received − putaway` (przy pełnym putaway = **0** → bez nowego stocku na DOCK).

## B. Status PZ na etapach

| Etap | `status` | `receiving_status` | `putaway_status` | `relocation_status` | Badge OMS (`businessDocStatus`) |
|------|----------|--------------------|------------------|---------------------|----------------------------------|
| Utworzenie | draft | NEW/IN_PROGRESS | NOT_STARTED | OPEN | NOWE / W TRAKCIE |
| W trakcie przyjęcia | **draft** | IN_PROGRESS | NOT_STARTED | OPEN | W TRAKCIE |
| Po finish receiving | **draft** | DONE | NOT_STARTED… | OPEN | GOTOWE (często) |
| W trakcie putaway | **draft** | DONE | IN_PROGRESS | OPEN | W TRAKCIE / GOTOWE |
| Po finalize WMS | **zakonczone** | DONE | DONE | DONE | **ZAKOŃCZONE** |
| Po OMS accept | **posted** | DONE | (recompute) | DONE | ZAKOŃCZONE |

**Wniosek:** „Finalny” status WMS to **`zakonczone`**, nie `posted`. `posted` = osobna ścieżka biurowa OMS.

## C. Inventory / movements (model dla pełnego WMS 2001 szt.)

Oczekiwany ledger przy poprawnym flow (bez podwójnego księgowania):

1. **RECEIPT** ×2001 → DOCK (`doc.location_id`)  
2. Inventory DOCK +2001  
3. **PUTAWAY/MOVE** ×2001 → DOCK −2001, S1-A-1 +2001  
4. Finalize: **0** zmian inventory  

**Live PZ 136:** nie zweryfikowano w tej sesji (prod API 401, brak DB).  
Jeśli operator widzi 2001 na S1-A-1 po WMS — stock **już istnieje**; OMS accept nie jest potrzebny do wejścia na stan.

`accept` przy pełnym putaway **nie powinien** dodać 2001 drugi raz (gałąź `to_dock<=0` → `continue`), ale nadal może zmienić status na `posted` i ewentualnie podbić `DeliveryItem.quantity_received` — ryzyko side-effectów poza Inventory.

## D. Root cause 400 `"Only draft documents can be edited"`

Call chain FE:

1. Footer: `showPzActions = (isDraft || isWmsCompleteDraft) && isPz`  
   `isWmsCompleteDraft = status === "zakonczone"`  
2. Przycisk **„Zaksięguj”** (`canPostAccept` true dla zakonczone)  
3. `accept()` w `useWarehouseStockDocumentDetail.tsx`:  
   - `skipLinePatch` tylko gdy `edit_mode === "metadata"`  
   - dla `zakonczone` BE zwraca `edit_mode: "none"`  
   - więc **zawsze** wywołuje `PATCH /stock-documents/{id}` (items)  
4. BE `patch_stock_document_items`: `if doc.status != "draft": raise "Only draft documents can be edited"`

Czyli 400 to **oczekiwana ochrona BE** przeciw edycji linii na nie-draft; FE błędnie próbuje PATCH przed „Zaksięguj” na dokumencie już `zakonczone`.

## E. Bug FE / BE / lifecycle?

| Warstwa | Ocena |
|---------|--------|
| **FE** | **Główny bug projekcji:** traktuje `zakonczone` jak wymagający akceptacji OMS; pokazuje akcje PZ; `accept()` robi PATCH mimo `edit_mode=none`. |
| **BE PATCH** | Poprawny (blokuje non-draft). |
| **BE lifecycle WMS** | Spójny: stock przy receive+putaway; finalize → `zakonczone` bez inventory. |
| **BE accept + FE „Zaksięguj”** | **Legacy dual-path:** OMS nadal zakłada drugie domknięcie (`posted`) po WMS — sprzeczne z regułą biznesową „WMS kończy lifecycle”. |

## F. Docelowe zachowanie

Po pełnym WMS (przyjęcie + rozlokowanie + finalize):

- OMS: dokument **read-only**, badge ZAKOŃCZONE, wynik realizacji (qty, lokalizacje, dokumenty).  
- **Brak** Przyjmij wszystko / Zapisz ilości / Zatwierdź / Zaksięguj.  
- **Brak** ponownego PATCH linii i ponownego księgowania.  
- `zakonczone` = terminal magazynowy; `posted` opcjonalnie tylko jako legacy/finansowe (jeśli w ogóle nadal potrzebne) — **nie** jako warunek wejścia stocku.

## G. Minimalny zakres poprawki (później, nie w tym audycie)

1. **FE:** `canPostAccept` / `showPzActions` — wyłączyć dla `zakonczone` (i `posted`) gdy WMS domknięty (`relocation_status=DONE` / fully putaway).  
2. **FE:** `accept()` — nigdy nie PATCH-ować linii gdy `edit_mode !== "full"` (nie tylko `"metadata"`).  
3. **Opcjonalnie BE:** `accept_stock_document` odrzucać `zakonczone` z pełnym putaway jako „już zrealizowane w WMS” (albo no-op → `posted` bez side-effectów delivery).  
4. **Nie:** reopen draft, allow PATCH na zakonczone, re-post 2001.

## Odpowiedzi punktowe 1–9

1. **DRAFT → final WMS:** w `finalize_wms_relocation_pz` → `status=zakonczone`. (`posted` dopiero przy OMS accept.)  
2. **2001 → Inventory:** przy **WMS przyjęciu** (DOCK), nie przy finalize.  
3. **Staging:** tak — receive tworzy stock na DOCK; putaway **przenosi** na S1-A-1.  
4. **Po WMS:** nie powinno wymagać akceptacji OMS do stocku.  
5. **UI akcje:** `isWmsCompleteDraft` + `showPzActions` + `canPostAccept` dla `zakonczone`; „Przyjmij/Zapisz” disabled (`lineEditEnabled=false`), ale **Zaksięguj** enabled.  
6. **PATCH:** `accept()` → `patchStockDocumentItems` przed `acceptStockDocument`.  
7–8. **Live 136:** niepotwierdzone w sesji; wg modelu stock powinien być na S1-A-1 po putaway.  
9. **Powiązanie:** StockDocument → Items → RECEIPT ops + dock Inventory → PUTAWAY ops + target Inventory → finalize flags; OMS accept poza ścieżką stocku przy full putaway.

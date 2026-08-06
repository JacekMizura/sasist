## Active

**Logi z WMS na karcie produktu (2026-08-05).**

- Zakładka „Logi z WMS” (`warehouseOps`) — podpięty istniejący `ProductWarehouseMovementsPanel` + `GET /products/{id}/movements`
- Kolumny: data, akcja, dokument, użytkownik, lokalizacja, przed/zmiana/po; podzakładka Historia dostaw

**Pola dodatkowe produktów (2026-08-05).**

- Asortyment → Pola dodatkowe: TEXT / NUMBER / FILES / LIST / GPSR / ATTACHMENTS (+ typy załączników Sellasist)
- Karta produktu → Podstawowe: sekcja nad historią; wartości osobno od zapisu karty
- BE: `product_custom_fields` + options + values; upload `/uploads/product_custom_fields/...`

**Warianty produktów (2026-08-05).**

- Słownik: Asortyment → Warianty (`/variants`) — grupy → osie → wartości (czytelniejsze niż Sellasist)
- Karta produktu → zakładka Warianty: przypisz grupę, generuj brakujące SKU (osobne produkty, ukryte na liście)
- BE: `variant_groups` / `variant_axes` / `variant_values` + `product_variant_selections`; `products.variant_group_id` / `variant_parent_id`

**Przekształć produkt ↔ zestaw (2026-08-05).**

- BE: `assortment_convert_service` + `POST /products/{id}/convert-to-bundle`, `POST /bundles/{id}/convert-to-product`
- Soft-delete źródła; EAN przenoszony; BOM nie jest wymyślany (pusty zestaw)
- FE: ikona Shapes w nagłówku karty — „Przekształć w zestaw” / „Przekształć w produkt”

**SKU / numer katalogowy z kategorii (2026-08-05).**

- Centralny serwis `product_codes` + liczniki `product_code_sequences` (osobno na szablon/prefiks)
- Kategorie: `sku_code`, `catalog_code`, `sku_template`, `catalog_template` (domyślnie `{CODE}-{NNNNN}`)
- API: `POST /product-codes/preview` + `/allocate` (nie zapisuje produktu)
- Podstawowe: Generuj ⚡ z podglądem; reguły: kategoria wymagana, szablon wymagany, confirm przy nadpisaniu

**Moduł Kategorie produktów (2026-08-05).**

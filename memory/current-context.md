## Active

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

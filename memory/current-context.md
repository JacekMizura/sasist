## Active

**Edycja produktu — Oferty: DOM 1:1 z `oferrty karta produktu.html` (2026-08-04).**

- `ProductSalesOffersSection`: nagłówek Oferty + Dodaj integrację, karta z Zwiń/Rozwiń, tabela jak marketplace
- Kolumny/API ofert sprzedażowych bez zmian; SASIST Button/Input/Select/Badge

**Edycja produktu — Zdjęcia: DOM 1:1 z `zdjecia karta produktu.html` (2026-08-04).**

- `ProductEditImagesTab`: Galeria, dodawanie URL/plik, rekordy miniatur+akcje jak mock
- SASIST Input/Button/Radio; upload / main / order / delete bez zmian logiki

**Edycja produktu — Produkcja: DOM 1:1 z `produkcja karta produktu.html` (2026-08-04).**

- `ProductManufacturingPanel` + `CompositionVisualEditor`: banner, 2+1 grid, składniki bez DataTable, BOM, sidebar
- SASIST Input/Checkbox/Button/Badge; logika receptur/API bez zmian

**Edycja produktu — Magazyn: DOM 1:1 z `magazyn karta produktu.html` (2026-08-04).**

- `ProductEditWarehouseTab`: Stan i lokalizacje (grid 4) + Parametry logistyczne (2+1)
- Kafle lokalizacji z pojemnością API; magazyny z breakdown; SASIST Input/Select/Checkbox/Button
- Wire w `ProductEditModal` (tylko body taba); logika/API bez zmian

**Edycja produktu — Ceny: DOM 1:1 z `ceny karta produktu.html` (2026-08-04).**

- `ProductEditPricesTab` only: 2/3+1/3, HTML table dostawców, podsumowanie z szarym footerem
- SASIST MoneyInput/Input/Textarea/Select/SecondaryButton/GhostButton/Radio; bez DataTable/MetricCard
- Logika marży / dostawców / API bez zmian

**Edycja produktu — Podstawowe v2: DOM 1:1 z HTML (2026-08-04).**

- Spec: `Downloads/podstawowy karta produckut v2.html`
- `ProductEditBasicTab` only: grid 7/5, flat left sections, orange carton card
- Producent + GPSR osobno; walidacja grupowana Produkt/Partie/Opakowanie
- Szablon: search dopiero po „Szukaj po nazwie…”; historia = `ActivityLogPanel` jak Orders
- Gabaryty jednostkowe (nie „Opakowanie”); logika/API bez zmian

**Edycja produktu — Ceny: DOM 1:1 z mock HTML (2026-08-04).**

- `ProductEditPricesTab` = hierarchia section/div jak w mocku (bez ProductLikeSection / DataTable / własnego layoutu)
- MoneyInput/Input tylko w slotach inputów; handlery bez zmian
- Uwaga: parent `ProductLikePageLayout` + `PageContainer` nadal dodają gutter/padding wokół taba

**Edycja produktu — redesign UX jak HTML (2026-08-04).**

- FE only: ProductLikePageLayout hero/stats/tabs + basic tab 65/35 Cards
- Historia = `ActivityLogPanel` (jak Zamówienia), nie mock HTML
- Backend / API / formularze / hooki — bez zmian

**Pulpit: TabsNav zamiast accordionów (2026-08-04).**

- Zakładki: Decyzja · Alerty · Operatorzy · Kolejki · Dostawy · Historia
- Domyślna: Decyzja (`/zarzadzanie-magazynem/pulpit`)
- Backend / API / logika Centrum — bez zmian

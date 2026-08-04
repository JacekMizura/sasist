## Active

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

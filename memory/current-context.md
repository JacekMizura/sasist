## Active

**Edycja produktu — Podstawowe: DOM 1:1 z HTML (2026-08-04).**

- Spec: `Downloads/podstawowe karta produktu.html`
- `ProductEditBasicTab` — plain section/div jak mock; SASIST Input/Select; bez ProductLikeSection
- Wire w `ProductEditModal` gdy `activeTab === "basic"`
- Historia: chrome z mocka + `ActivityLogPanel` (nie fake lista Magazynowe)
- Extra (nie w mocku, zachowane): Producent/GPSR, Walidacja
- Bez commita

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

## Active

**Edycja produktu — Ceny 1:1 do mock HTML (2026-08-04).**

- Wzorzec = wyłącznie `edycja_produktu_nowy_widok (1).html` (nie zakładka Podstawowe)
- Układ: left 2/3 · right 1/3; Ostatni zakup + Podsumowanie w `sm:flex-row xl:flex-col`
- Footer podsumowania = emerald rows jak w mocku (bez MetricCard)
- Logika / API — bez zmian

**Edycja produktu — redesign UX jak HTML (2026-08-04).**

- FE only: ProductLikePageLayout hero/stats/tabs + basic tab 65/35 Cards
- Historia = `ActivityLogPanel` (jak Zamówienia), nie mock HTML
- Backend / API / formularze / hooki — bez zmian

**Pulpit: TabsNav zamiast accordionów (2026-08-04).**

- Zakładki: Decyzja · Alerty · Operatorzy · Kolejki · Dostawy · Historia
- Domyślna: Decyzja (`/zarzadzanie-magazynem/pulpit`)
- Backend / API / logika Centrum — bez zmian

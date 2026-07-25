# current-context

## Active

**Rack occupancy bar** — czytelny pasek % w dolnej części regału (lokalizacje, nie produkty).

### Occupancy
- SSOT: `buildRackOccupancyStats` (memo w WarehouseDesigner)
- `occupancy = zajęte / wszystkie lokalizacje × 100`
- Kolory: 0–60 zieleń · 60–85 żółty · 85–95 pomarańcz · >95 czerwień
- Pasek 5px, pełna szerokość wewnątrz regału; tooltip bez liczenia produktów

### Constraints
Bez commit/push (dopóki user nie poprosi).

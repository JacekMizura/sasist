# Authored Warehouse Routing Graph — Runtime SSOT

Dokument architektury po **Etapie 3** + **3.1** (SSOT) + **3.2** (Putaway) + **3.3** (cleanup).  
Cel: jeden model trasy w runtime WMS — bez ukrytych heurystyk i surrogate’ów.

---

## 1. Single Source of Truth (SSOT)

**Źródło prawdy o trasie:** Authored Warehouse Routing Graph (węzły, krawędzie, Location Access / Access Points, reguły procesu/transportu), publikowany z Projektanta (tryb TRASY).

**Jedyny reader dla runtime WMS:**

`backend/services/warehouse_routing/runtime_graph_reader.py`

Oficjalne API (re-eksport w `warehouse_routing.__init__`):

| Funkcja | Rola |
|--------|------|
| `graph_ready` | Czy magazyn ma skonfigurowany graf |
| `hop_cost_m` | Koszt lokalizacja → lokalizacja |
| `order_location_ids_by_graph` | Kolejność odwiedzania (NN po koszcie grafu) |
| `chain_distance_m` / `runtime_chain_distance_m` | Długość łańcucha lokalizacji (+ opcjonalnie START / PACKING) |
| `visit_index_map` | Mapa `location_id → indeks` do sortowania list |

Warstwa silnika (nie drugi reader): `engine.route_a_to_b` / `route_via_virtual_entries`, `access_resolution.*` — **INTERNAL** (pakiet, Designer adapters, testy).  
Konsumenci WMS **nie** wywołują `access_resolution.chain_distance_*` / `route_between_*` bezpośrednio.

---

## 2. Routing Surrogates

**Routing surrogate** = każde źródło kolejności / kosztu przejścia inne niż Runtime Graph Reader.

### `pick_sequence` ≠ routing

`Location.pick_sequence` is a **legacy metadata column** kept for DB / migration compatibility.

It is **not** used by any active WMS routing, visit-order, putaway-nearest, or analytics path algorithm.

**Nie wolno** używać go jako:

- kosztu przejścia,
- kolejności visit order listy pick,
- sortu operatora „wzdłuż trasy”,
- surrogate’a dla `order_location_ids_by_graph` / `visit_index_map`.

### `location_code` ≠ routing

Kod / nazwa lokalizacji (`A-01-02`, sort alfabetyczny, `route_sort_key = code`) **nie** jest trasą.

- Wyświetlanie: tak.
- Sort przejścia operatora: **nie** — tylko `visit_index_map` / `order_location_ids_by_graph`.

### Graph Reader = jedyne źródło kolejności przejścia

W runtime WMS:

```
kolejność przejścia  →  order_location_ids_by_graph / visit_index_map
koszt przejścia      →  hop_cost_m / chain_distance_m
```

Zakazane surrogaty: Manhattan, Euclidean visit order, nearest XY, sort po nazwie, `pick_sequence` jako path.

---

## 3. Authoring

- Projektant magazynu (frontend) edytuje layout + sieć tras.
- Dane: `WarehouseRoutingNode`, edges, Location Access, Access Points, process/transport constraints.
- Geometry (`geometry.distance_m_between_cm`, Location Access projection) służy **budowie długości krawędzi / podejścia**, nie heurystyce przejścia operatora w runtime.

---

## 4. Publication

Zapis layoutu / TRASY materializuje graf i Location Access (resolver).  
Runtime czyta opublikowany stan z DB — bez regeneracji grafu „w locie” przez WMS.

---

## 5. Runtime Graph Reader

```
                    ┌─────────────────────────┐
                    │  Projektant (TRASY)     │
                    │  authoring + publish    │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ Authored Routing Graph  │
                    │ (DB: nodes/edges/LA)    │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 ▼                 │
              │   runtime_graph_reader (SSOT)     │
              │   hop / order / chain / visit     │
              │                 │                 │
              │     engine + access_resolution    │
              │     (internal Dijkstra / LA)      │
              └─────────────────┬─────────────────┘
                                │
        ┌───────────┬───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   Picking     Wave       Simulation   Analytics    Braki
   Routing     metrics    pick helpers walking_cost (via picking)
```

---

## 6. Konsumenci

| Konsument | Użycie readera |
|-----------|----------------|
| `picking_routing_service` | `visit_index_map` → kolejność `pick_list` |
| `wms_picking_product_list_service` | `route_sort_key` = visit index (nie `location_code`) |
| `wave_service` | metrics + alokacja FEFO z `visit_index_map` |
| `domain/picking_simulation/_pick_helpers` | `order_location_ids_by_graph` + `chain_distance_m` |
| Strategie basket/cart/zone + simulation engine | przez `compute_route_for_pick_nodes` |
| `analytics_service.walking_cost` | `order_location_ids_by_graph` → `chain_distance_m` |
| `braki_order_state_service.nearest_pick_location_for_product` | przez `PickingRoutingService` |
| `wms_product_view` / incomplete / recovery groups | `visit_index_map` dla kolejności UI |
| Putaway (`NEAREST` + WMS fallback ranking) | `hop_cost_m` / `cost_from_node_to_location` od DOCK (Etap 3.2) |

---

## 7. Zakaz heurystyk w runtime WMS

W **runtime WMS** (kolejność zbierania, koszt przejścia, path cost listy pick) **nie wolno**:

- Manhattan / Euclidean jako trasa operatora
- „nearest XY” / sort po współrzędnych lokalizacji
- własnego grafu / A* / BFS poza pakietem `warehouse_routing`
- label/coords / `location_code` / `pick_sequence` jako surrogate trasy
- cichego fallbacku geometrycznego gdy brak grafu → `ROUTING_GRAPH_NOT_CONFIGURED`

**Dozwolone wyjątki (Projektant / legacy):**

- testy
- `/route/path` — snap Euclidean do węzła authored + engine (`route_between_points_cm`)
- `warehouse_map` A* (mapa Designer)
- frontend Projektanta (wizualizacja Manhattan)
- geometria **budowy** krawędzi / collision / service face

---

## 8. Jak podłączyć nowego konsumenta

1. Import wyłącznie z `warehouse_routing.runtime_graph_reader` (lub nazw z `__init__`).
2. Sprawdź `graph_ready` / obsłuż `ERROR_ROUTING_GRAPH_NOT_CONFIGURED` — bez Euclidean fallback.
3. Kolejność lokalizacji: `order_location_ids_by_graph` lub `visit_index_map`.
4. Koszt: `hop_cost_m` / `chain_distance_m`.
5. Nie dodawaj drugiego readera ani lokalnego A*.
6. Nie używaj `pick_sequence` / `location_code` jako trasy.
7. Dodaj test w `backend/tests/warehouse_routing/`.

---

## 9. Warstwy pakietu

| Moduł | Rola |
|-------|------|
| `runtime_graph_reader` | **Publiczny** kontrakt WMS |
| `access_resolution` | INTERNAL: mapowanie lokalizacja ↔ węzeł, łańcuchy, adaptery punktów |
| `engine` | Dijkstra / virtual entries |
| `graph_service` / `validation` | CRUD / walidacja authored graph |
| `location_access_*` | Authoring Location Access |
| `geometry` / `physical_collision` | Budowa / kolizje layoutu |

---

## 10. Powiązane dokumenty / pamięć

- Etap 1–3.3: `memory/change-log.md`, `memory/current-context.md`
- Stabilizacja WMS (braki / recovery): `memory/wms-stabilization.md` — osobny SSOT lifecycle; routing grafu go nie zastępuje.

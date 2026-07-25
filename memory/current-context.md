# current-context

## Active

**Etap 3.3 — Routing Graph Architecture Cleanup** — local.

- Runtime Graph Reader = jedyny silnik routingu (distance / hop / visit order)
- `Location.pick_sequence` = legacy DB column only (nie usuwać)
- Usunięto martwy `route_engine.py` (Euclidean visit order) oraz nieużywane `LocationCapacityProfile.pick_sequence`

### Constraints
Bez push (dopóki user nie poprosi). Bez deploy.

from backend.services.warehouse_operation_policy import list_operation_policies

rows = list_operation_policies()
lines = [
    "# Warehouse operation policy — raport",
    "",
    "Wygenerowano z `backend.services.warehouse_operation_policy`.",
    "",
    "## Tabela polityk",
    "",
    "| Operacja | Context | Requires Warehouse | Powód |",
    "|---|---|---|---|",
]
for r in rows:
    rw = "tak" if r["requires_warehouse"] else "nie"
    lines.append(f"| `{r['operation']}` | {r['context']} | {rw} | {r['reason']} |")

lines.extend(
    [
        "",
        "## Reguły",
        "",
        "- Magazyn jest wymagany **tylko** gdy operacja zmienia stany, dokumenty magazynowe,",
        "  rezerwacje, lokalizacje lub proces WMS/produkcji.",
        "- „Wszystkie z filtra” / `filtered_query` **nie** wymusza magazynu dla `ORDER_WORKFLOW`.",
        "- Usuwanie zamówień (`order.delete_orders`) = OMS, **bez** wymogu magazynu.",
        "- Usuwanie zbioru zbierania / lokalizacji / rezerwacji = WMS, **z** wymogiem magazynu.",
        "",
        "## Null / multiwarehouse",
        "",
        "- `warehouse_id` query opcjonalny na bulk-status / bulk-patch / bulk-delete (explicit).",
        "- Status panelu: walidacja per `orders.warehouse_id`; przy braku dopasowania → skip, nie 500.",
        "- Zamówienie bez magazynu (przyszły routing): lookup statusu tenant-scoped.",
        "",
        "## Migracja ręcznych checków",
        "",
        "Zamienić ad-hoc `if (!selectedWarehouse)` na:",
        "",
        "```ts",
        "const policy = getOperationPolicy('wms.picking');",
        "if (policy.requiresWarehouse && warehouseId == null) { /* banner */ }",
        "```",
        "",
        "lub `requireWarehouseFor(operation)` z `useActiveWarehouseContext`.",
        "",
        "### Kolejka migracji (priorytet)",
        "",
        "1. **OMS / Orders** — już: OrderList + executeOrderBulkActions.",
        "2. **WMS screens** — `ActiveWarehouseRequiredBanner` OK (WMS), ale spiąć z `getOperationPolicy('wms.*')`.",
        "3. **Production / inventory / BDO** — `requiresWarehouse` true; migrować komunikaty na policy.reason.",
        "4. **Settings per warehouse** — `admin.warehouse_settings` / picking settings — zostawić WH.",
        "5. **Automation / custom fields pages** z „Wybierz magazyn w nagłówku” — ocenić czy to konfiguracja per WH",
        "   (zostawić) czy przypadkowy gate OMS (usunąć).",
        "",
    ]
)

out = "memory/warehouse-operation-policy-report.md"
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("wrote", out, "rows", len(rows))

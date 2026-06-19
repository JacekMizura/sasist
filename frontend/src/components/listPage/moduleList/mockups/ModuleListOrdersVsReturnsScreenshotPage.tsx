/**
 * Porównanie list modułu — wiersze tabeli (dev / screenshot).
 * /dev/module-list-orders-vs-returns
 */
import { useMemo } from "react";

import { OrderListDenseTable, type OrderListDenseOrder } from "../../../orders/orderList/OrderListDenseTable";
import { ReturnsListTable } from "../../../returns/returnList/ReturnsListTable";
import { ModuleTableCard } from "../index";
import type { WmsReturnListItem } from "../../../../types/wmsReturn";

const MOCK_PRODUCTS = [
  { quantity: 1, name: "Produkt A — LEGO City", ean: "5901234123457", sku: "LC-001" },
  { quantity: 1, name: "Produkt B — Klocki Creator", ean: "5901234123458", sku: "CR-002" },
  { quantity: 1, name: "Produkt C — Minifigurka", ean: "5901234123459", sku: "MF-003" },
  { quantity: 1, name: "Produkt D — Pojazd policyjny", ean: "5901234123460", sku: "PV-004" },
  { quantity: 1, name: "Produkt E — Helikopter", ean: "5901234123461", sku: "HL-005" },
  { quantity: 1, name: "Produkt F — Baza strażacka", ean: "5901234123462", sku: "BS-006" },
];

const MOCK_ORDER: OrderListDenseOrder = {
  id: 10042,
  number: "10042",
  order_date: "2026-06-08T10:30:00Z",
  value: 1249.99,
  currency: "PLN",
  first_name: "Anna",
  last_name: "Kowalska",
  city: "Warszawa",
  shipping_method: "InPost Paczkomaty",
  panel_payment_status: "paid",
  order_ui_status: {
    id: 4,
    name: "Pakowanie",
    main_group: "IN_PROGRESS",
    color: "#64748b",
    badge_color: "#64748b",
    is_active: true,
  },
  items_display_lines: MOCK_PRODUCTS,
};

const MOCK_ORDER_EXPANDED: OrderListDenseOrder = {
  ...MOCK_ORDER,
  id: 10043,
  number: "10043",
};

const MOCK_RETURN: WmsReturnListItem = {
  id: 501,
  rmz_number: "RMZ-2026-0501",
  status: { id: 1, type: "in_progress", name: "W toku", color: "#3b82f6" },
  order_id: 10042,
  order_number: "10042",
  first_name: "Anna",
  last_name: "Kowalska",
  source: "allegro",
  created_at: "2026-06-07T14:20:00Z",
  return_type: "RMA",
  total_refund_amount: 249.99,
  lines_preview: MOCK_PRODUCTS,
  ui_status: {
    id: 2,
    name: "Weryfikacja",
    main_group: "IN_PROGRESS",
    color: "#3b82f6",
    badge_color: "#3b82f6",
    is_active: true,
  },
};

const EXPANDED_ORDER_IDS = new Set([10043]);

function noop() {
  /* screenshot fixture */
}

export default function ModuleListOrdersVsReturnsScreenshotPage() {
  const columnOrder = useMemo(
    () => ["order_core", "products", "customer", "value"],
    [],
  );

  return (
    <div id="module-list-orders-vs-returns" className="module-list-screenshot-page min-h-screen bg-slate-100 p-6">
      <h1 className="mb-2 text-lg font-semibold text-slate-900">Module list — Orders vs Returns (wiersze)</h1>
      <p className="mb-6 text-sm text-slate-500">
        Porównanie układu kolumn, akcji (ostatnia kolumna, pionowy stos) i rozwijania produktów.
      </p>

      <div className="mx-auto flex max-w-[1180px] flex-col gap-10">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Zamówienia</h2>
          <ModuleTableCard>
            <OrderListDenseTable
              orders={[MOCK_ORDER, MOCK_ORDER_EXPANDED]}
              columnOrder={columnOrder}
              sortBy="order_date"
              sortDir="desc"
              onToggleSort={noop}
              formatOrderDate={(iso) =>
                iso
                  ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
                  : "—"
              }
              formatMoney={(v, cur) =>
                v != null
                  ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: cur ?? "PLN" }).format(v)
                  : "—"
              }
              customerLabel={(o) => `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "—"}
              deriveOrderListPaymentBadgeRow={() => ({ label: "Opłacone", style: { color: "#15803d" } })}
              isRowSelected={() => false}
              toggleOne={noop}
              bulkBusy={false}
              openOrder={noop}
              onRowQuickAction={noop}
              initialExpandedProductOrderIds={EXPANDED_ORDER_IDS}
            />
          </ModuleTableCard>
          <p className="mt-2 text-xs text-slate-500">Wiersz #10043 — produkty rozwinięte</p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Zwroty (wzorzec)</h2>
          <ReturnsListTable
            rows={[MOCK_RETURN]}
            loading={false}
            effectiveWarehouseId={1}
            panelSummary={null}
            bulkBusy={false}
            bulkToolbarDisabled={false}
            bulkSelectMenuKey={0}
            effectiveSelectionCount={0}
            bulkSelectionMode="none"
            headerChecked={false}
            headerIndeterminate={false}
            isRowSelected={() => false}
            selectAllOnPage={noop}
            toggleOne={noop}
            clearSelection={noop}
            onBulkSelectMenuKeyBump={noop}
            onBulkStatusConfirm={noop}
            onBulkDelete={noop}
            onOpenDetail={noop}
            onDeleteSingle={noop}
            resolveBulkReturnStatusLabel={(v) => v}
          />
        </section>
      </div>
    </div>
  );
}

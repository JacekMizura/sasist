/**
 * Podgląd wdrożenia v3 — produkcyjne komponenty + przykładowe dane (tylko dev/screenshot).
 * /dev/panel-status-v3-screenshots
 */
import { useState } from "react";

import { ComplaintsListStatusSidebar } from "../../complaints/ComplaintsListStatusSidebar";
import { OrdersPanelStatusSidebar } from "../../orders/OrdersPanelStatusSidebar";
import { PanelSidebarOperationalRow } from "../PanelSidebarOperationalRow";
import { PanelStatusHierarchyPicker } from "../PanelStatusHierarchyPicker";
import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";

const MOCK_SUMMARY: OrderUiStatusPanelSummary = {
  unassigned_count: 0,
  groups: [
    {
      main_group: "NEW",
      total_count: 5,
      sub_statuses: [
        { id: 1, name: "Braki — oczekuje na uzupełnienie", count: 5, color: "#ef4444", badge_color: "#ef4444" },
      ],
    },
    {
      main_group: "IN_PROGRESS",
      total_count: 1227,
      sub_statuses: [
        { id: 2, name: "Pakowanie", count: 16, color: "#64748b", badge_color: "#64748b" },
        { id: 3, name: "Spakowane — oczekuje na kuriera", count: 3, color: "#64748b", badge_color: "#64748b" },
        { id: 4, name: "Wózki z koszykami", count: 1202, color: "#22c55e", badge_color: "#22c55e" },
        { id: 5, name: "Pilne — priorytet operacyjny", count: 6, color: "#ef4444", badge_color: "#ef4444" },
      ],
    },
    {
      main_group: "DONE",
      total_count: 2,
      sub_statuses: [
        { id: 6, name: "Przyjęte do dekretacji księgowej", count: 2, color: "#10b981", badge_color: "#10b981" },
      ],
    },
  ],
};

const OPERATIONAL_ROWS = [
  { key: "do_decyzji", label: "Do decyzji", count: 0 },
  { key: "uszkodzone", label: "Uszkodzone", count: 2 },
  { key: "przyjete", label: "Przyjęte", count: 14 },
  { key: "weryfikacja", label: "W trakcie weryfikacji towaru", count: 3 },
  { key: "refundacje", label: "Refundacje oczekujące", count: 0 },
  { key: "reklamacje", label: "Reklamacje powiązane", count: 0 },
  { key: "odrzucone", label: "Odrzucone", count: 1 },
  { key: "rozliczone", label: "Rozliczone", count: 6 },
] as const;

function ScreenshotFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{children}</div>
    </div>
  );
}

export function PanelStatusV3ScreenshotsPage() {
  const [ordersFilter, setOrdersFilter] = useState<"all" | { kind: "sub"; id: number }>({ kind: "sub", id: 4 });
  const [returnsOp, setReturnsOp] = useState("uszkodzone");
  const [complaintFilter, setComplaintFilter] = useState<"all" | { kind: "status"; status: "WERYFIKACJA" }>({
    kind: "status",
    status: "WERYFIKACJA",
  });

  const operationalSlot = (
    <>
      {OPERATIONAL_ROWS.map((row) => (
        <PanelSidebarOperationalRow
          key={row.key}
          active={returnsOp === row.key}
          label={row.label}
          count={row.count}
          onClick={() => setReturnsOp(row.key)}
        />
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans">
      <h1 className="mb-6 text-lg font-bold text-slate-800">Panel statusów — wdrożenie v3 (przykładowe dane)</h1>
      <div className="grid gap-8 xl:grid-cols-2">
        <ScreenshotFrame title="1. Zamówienia">
          <OrdersPanelStatusSidebar
            panelSummary={MOCK_SUMMARY}
            panelFilter={ordersFilter}
            onPanelFilterChange={setOrdersFilter}
            chromeVariant="sellasist"
          />
        </ScreenshotFrame>

        <ScreenshotFrame title="2. Zwroty (statusy + operacyjne)">
          <OrdersPanelStatusSidebar
            panelSummary={MOCK_SUMMARY}
            panelFilter={ordersFilter}
            onPanelFilterChange={setOrdersFilter}
            chromeVariant="sellasist"
            returnsOperationalQueuesSlot={operationalSlot}
          />
        </ScreenshotFrame>

        <ScreenshotFrame title="3. Reklamacje">
          <ComplaintsListStatusSidebar
            warehouseId={1}
            totalCount={42}
            countFor={(code) => {
              const m: Record<string, number> = {
                NOWE: 8,
                OCZEKIWANIE_NA_PRODUKT: 3,
                WERYFIKACJA: 12,
                DECYZJA: 5,
                ZAAKCEPTOWANA: 9,
                ODRZUCONA: 5,
              };
              return m[code] ?? 0;
            }}
            panelFilter={complaintFilter}
            onPanelFilterChange={setComplaintFilter}
            chromeVariant="sellasist"
          />
        </ScreenshotFrame>

        <ScreenshotFrame title="4. Dropdown masowej zmiany statusu">
          <div className="p-4">
            <button
              type="button"
              className="mb-2 inline-flex h-9 min-w-[10rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm"
            >
              <span className="text-slate-600">Zmień status panelu</span>
            </button>
            <div className="w-[19.5rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <PanelStatusHierarchyPicker
                panelSummary={MOCK_SUMMARY}
                selectedStatusId={4}
                onPick={() => undefined}
                listMaxHeightClass="max-h-[28rem]"
              />
            </div>
          </div>
        </ScreenshotFrame>
      </div>
    </div>
  );
}

export default PanelStatusV3ScreenshotsPage;

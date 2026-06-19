/**
 * Statyczny podgląd sekcji konfiguratora (mock data) — do screenshotów UX.
 * Otwórz: /dev/returns-statuses-configurator-screenshots
 */
import type { ReactNode } from "react";
import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import type { ReturnUiPanelSubgroupRead, ReturnUiStatusPanelSummary } from "../../../types/wmsReturn";
import { DamageCardsSection } from "../DamageCardsSection";
import { ListLabelsSection } from "../ListLabelsSection";
import { ProductDecisionsCardsSection } from "../ProductDecisionsCardsSection";

const MOCK_CFG: ReturnModuleConfigDto = {
  product_decisions: [
    { category: "ACCEPTED", code: "accepted", label: "Zaakceptowany", visible_wms: true, sort_order: 10, is_active: true },
    { category: "ACCEPTED", code: "refund", label: "Zwrot środków", visible_wms: true, sort_order: 20, is_active: true },
    { category: "ACCEPTED", code: "exchange", label: "Wymiana", visible_wms: true, sort_order: 30, is_active: true },
    { category: "REJECTED", code: "damaged", label: "Produkt uszkodzony", visible_wms: true, sort_order: 10, is_active: true, creates_stock_document: true },
    { category: "REJECTED", code: "mismatch", label: "Niezgodny zwrot", visible_wms: false, sort_order: 20, is_active: true },
    { category: "REJECTED", code: "rejected", label: "Odrzucony", visible_wms: true, sort_order: 30, is_active: true, creates_stock_document: false },
  ],
  damage_classes: [
    { code: "B", label: "Klasa B", color_hex: "#f59e0b", description: null, warehouse_behavior: null, resale_allowed: true, visible_wms: true, sort_order: 10, is_active: true },
    { code: "C", label: "Klasa C", color_hex: "#ef4444", description: null, warehouse_behavior: null, resale_allowed: false, visible_wms: true, sort_order: 20, is_active: true },
  ],
  damage_reasons: [
    { class_code: "B", code: "scratches", label: "Rysy", visible_wms: true, sort_order: 10, is_active: true },
    { class_code: "B", code: "no_label", label: "Brak metki", visible_wms: true, sort_order: 20, is_active: true },
    { class_code: "B", code: "no_box", label: "Brak opakowania", visible_wms: true, sort_order: 30, is_active: true },
    { class_code: "C", code: "broken", label: "Produkt uszkodzony", visible_wms: true, sort_order: 10, is_active: true },
    { class_code: "C", code: "wet", label: "Produkt zalany", visible_wms: true, sort_order: 20, is_active: true },
  ],
  customer_return_types: [],
  order_sources: [],
  detail_layout: { left_column: [], right_column: [] },
};

const MOCK_SUMMARY: ReturnUiStatusPanelSummary = {
  groups: [
    {
      main_group: "NEW",
      total_count: 24,
      sub_statuses: [
        { id: 1, name: "Nowy zwrot", count: 12, main_group: "NEW", subgroup_name: "Sklep", color: "#3b82f6", sort_order: 10, tenant_id: 1, warehouse_id: 1, is_active: true },
        { id: 2, name: "Oczekuje na paczkę", count: 8, main_group: "NEW", subgroup_name: "Allegro", color: "#f97316", sort_order: 20, tenant_id: 1, warehouse_id: 1, is_active: true },
        { id: 3, name: "Weryfikacja", count: 4, main_group: "NEW", subgroup_name: "Marketplace", color: "#8b5cf6", sort_order: 30, tenant_id: 1, warehouse_id: 1, is_active: true },
      ],
    },
    {
      main_group: "IN_PROGRESS",
      total_count: 18,
      sub_statuses: [
        { id: 4, name: "W trakcie obsługi", count: 10, main_group: "IN_PROGRESS", subgroup_name: "Sklep", color: "#f97316", sort_order: 10, tenant_id: 1, warehouse_id: 1, is_active: true },
        { id: 5, name: "Kontrola jakości", count: 8, main_group: "IN_PROGRESS", subgroup_name: null, color: "#eab308", sort_order: 20, tenant_id: 1, warehouse_id: 1, is_active: true },
      ],
    },
    {
      main_group: "DONE",
      total_count: 42,
      sub_statuses: [
        { id: 6, name: "Rozliczony", count: 30, main_group: "DONE", subgroup_name: null, color: "#10b981", sort_order: 10, tenant_id: 1, warehouse_id: 1, is_active: true },
        { id: 7, name: "Odrzucony", count: 12, main_group: "DONE", subgroup_name: null, color: "#ef4444", sort_order: 20, tenant_id: 1, warehouse_id: 1, is_active: true },
      ],
    },
  ],
};

const MOCK_SUBGROUPS: ReturnUiPanelSubgroupRead[] = [
  { id: 1, tenant_id: 1, warehouse_id: 1, main_group: "NEW", name: "Sklep", sort_order: 10 },
  { id: 2, tenant_id: 1, warehouse_id: 1, main_group: "NEW", name: "Allegro", sort_order: 20 },
  { id: 3, tenant_id: 1, warehouse_id: 1, main_group: "NEW", name: "Marketplace", sort_order: 30 },
  { id: 4, tenant_id: 1, warehouse_id: 1, main_group: "IN_PROGRESS", name: "Sklep", sort_order: 10 },
];

export default function ReturnsStatusesConfiguratorScreenshotPage() {
  const noop = () => {};
  const setDraft = () => {};

  return (
    <div className="min-h-screen bg-slate-100/80 p-6 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="rounded-xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Konfigurator statusów zwrotów — podgląd UX</h1>
          <p className="mt-2 text-sm text-slate-600">Mock data dla screenshotów sekcji 1–4.</p>
        </header>

        <ScreenshotBlock title="Sekcja 1 — Etykiety listy">
          <ListLabelsSection
            summary={MOCK_SUMMARY}
            panelSubgroups={MOCK_SUBGROUPS}
            onAddSubgroup={noop}
            onAddStatus={noop}
            onEditStatus={noop}
          />
        </ScreenshotBlock>

        <ScreenshotBlock title="Sekcja 2 — Decyzje produktowe">
          <ProductDecisionsCardsSection cfg={MOCK_CFG} setDraft={setDraft} />
        </ScreenshotBlock>

        <ScreenshotBlock title="Sekcja 3 — Statusy RMZ">
          <RmzWorkflowMock />
        </ScreenshotBlock>

        <ScreenshotBlock title="Sekcja 4 — Uszkodzenia">
          <DamageCardsSection cfg={MOCK_CFG} setDraft={setDraft} />
        </ScreenshotBlock>
      </div>
    </div>
  );
}

function ScreenshotBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="rounded-xl border border-slate-200/80 bg-white/50 p-1 shadow-sm">{children}</div>
    </div>
  );
}

/** RMZ sekcja z mockiem procesu (bez API). */
function RmzWorkflowMock() {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sekcja 3</p>
        <h2 className="text-lg font-semibold text-slate-900">Statusy RMZ</h2>
        <p className="mt-1 text-sm text-slate-500">Proces obsługi dokumentu zwrotu — od przyjęcia do zamknięcia.</p>
      </header>
      <div className="p-5">
        <div className="mx-auto max-w-md space-y-2">
          {[
            { name: "Przyjęty", color: "blue" },
            { name: "Weryfikacja", color: "amber" },
            { name: "Kontrola jakości", color: "orange" },
            { name: "Rozliczenie", color: "violet" },
            { name: "Zakończony", color: "emerald" },
          ].map((stage, i, arr) => (
            <div key={stage.name} className="flex flex-col items-center">
              <div className="w-full rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200 capitalize">
                    {stage.color}
                  </span>
                  <span className="text-base font-semibold text-slate-900">{stage.name}</span>
                </div>
              </div>
              {i < arr.length - 1 ? <span className="my-2 text-slate-300">↓</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

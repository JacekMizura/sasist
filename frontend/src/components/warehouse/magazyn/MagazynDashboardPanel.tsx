import type { CustomRackTemplate, LayoutState, RackType } from "../../../types/warehouse";
import { formatWarehouseLocationTypeLabel } from "../../../utils/warehouseLocationTypeLabels";
import { buildTemplateUsageData } from "../templateUsage";

export interface MagazynDashboardPanelProps {
  layout: LayoutState;
  customTemplates: CustomRackTemplate[];
  rackTypeFilter: RackType;
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onClearTemplateSelection?: () => void;
  productsAssignedVolumeDm3: number;
  totalCapacity: number;
  utilizationPct: number;
  primaryUsedDm3: number;
  reserveUsedDm3: number;
  damagedUsedDm3: number;
  locationStats: {
    primary: number;
    reserve: number;
    damaged: number;
  };
  formatVolume: (n: number) => string;
  onOpenReports?: () => void;
  onOpenDamageReports?: () => void;
}

export function MagazynDashboardPanel({
  layout,
  customTemplates,
  rackTypeFilter,
  selectedTemplateId,
  onSelectTemplate,
  onClearTemplateSelection,
  productsAssignedVolumeDm3,
  totalCapacity,
  utilizationPct,
  primaryUsedDm3,
  reserveUsedDm3,
  damagedUsedDm3,
  locationStats,
  formatVolume,
  onOpenReports,
  onOpenDamageReports,
}: MagazynDashboardPanelProps) {
  const { usedTemplates, usageCountById } = buildTemplateUsageData(layout, customTemplates, true, rackTypeFilter);

  return (
    <div
      className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      onClick={() => onClearTemplateSelection?.()}
    >
      <h2 className="text-xs font-black uppercase text-slate-500 mb-3">Pulpit magazynu</h2>
      {onOpenReports && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenReports();
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
        >
          <svg className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M7 15v-5m5 5V7m5 8V4" />
          </svg>
          Raporty
        </button>
      )}
      {onOpenDamageReports && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDamageReports();
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
        >
          <span aria-hidden>⚠️</span>
          Szkody
        </button>
      )}
      <div className="space-y-3">
        <div className="border-t border-slate-100 pt-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Całkowita zajętość</div>
          <div className="mt-1.5 text-2xl font-black text-slate-900 leading-none">
            {utilizationPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="font-mono text-slate-700">{formatVolume(productsAssignedVolumeDm3)}</span>
            {" / "}
            <span className="font-mono text-slate-700">{formatVolume(totalCapacity)}</span>
            {" dm³"}
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${utilizationPct <= 50 ? "bg-emerald-500" : utilizationPct <= 80 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-500">{formatWarehouseLocationTypeLabel("PRIMARY")}</span>
              <span className="font-mono text-slate-700">{formatVolume(primaryUsedDm3)} dm³</span>
            </div>
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-500">{formatWarehouseLocationTypeLabel("RESERVE")}</span>
              <span className="font-mono text-slate-700">{formatVolume(reserveUsedDm3)} dm³</span>
            </div>
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-500">Uszkodzone</span>
              <span className="font-mono text-slate-700">{formatVolume(damagedUsedDm3)} dm³</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide opacity-80 mb-2">LOKALIZACJE</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[14px] leading-tight text-slate-700">
              <span aria-hidden className="text-[16px]">📦</span>
              <span className="font-semibold text-slate-900 min-w-[30px]">{locationStats.primary}</span>
              <span className="text-slate-500">Podstawowe</span>
            </div>
            <div className="flex items-center gap-2 text-[14px] leading-tight text-slate-700">
              <span aria-hidden className="text-[16px]">🔒</span>
              <span className="font-semibold text-slate-900 min-w-[30px]">{locationStats.reserve}</span>
              <span className="text-slate-500">Zapasowe</span>
            </div>
            <div className="flex items-center gap-2 text-[14px] leading-tight text-slate-700">
              <span aria-hidden className="text-[16px]">⚠️</span>
              <span className="font-semibold text-slate-900 min-w-[30px]">{locationStats.damaged}</span>
              <span className="text-slate-500">Uszkodzone</span>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Użyte w układzie</div>
          {usedTemplates.length === 0 ? (
            <p className="text-[10px] text-slate-500">Brak użytych szablonów</p>
          ) : (
            <div className="space-y-1.5">
              {usedTemplates.map((t) => {
                const count = usageCountById.get(t.id) ?? 0;
                const isSelected = selectedTemplateId === t.id;
                const representativeRack = layout.racks.find((r) => r.templateId === t.id);
                const locationsPerRack = representativeRack?.bins?.length ?? 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTemplate(t.id);
                    }}
                    className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                      isSelected ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="truncate text-slate-700">{t.name}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-700">({count})</span>
                    </div>
                    <div className={`mt-1 text-[11px] ${isSelected ? "text-slate-700" : "text-slate-600"}`}>
                      Lokalizacje: <span className="font-mono font-semibold text-slate-700">{locationsPerRack}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

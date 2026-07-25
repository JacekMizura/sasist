import type { CustomRackTemplate, LayoutState, RackType } from "../../../types/warehouse";
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

function volumeOrDash(formatVolume: (n: number) => string, n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${formatVolume(n)} dm³`;
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

  const occupancyRows = [
    {
      key: "primary",
      label: "Podstawowe",
      count: locationStats.primary,
      volumeLabel: volumeOrDash(formatVolume, primaryUsedDm3),
      countDot: "bg-sky-500",
    },
    {
      key: "reserve",
      label: "Zapasowe",
      count: locationStats.reserve,
      volumeLabel: volumeOrDash(formatVolume, reserveUsedDm3),
      countDot: "bg-amber-500",
    },
    {
      key: "damaged",
      label: "Uszkodzone",
      count: locationStats.damaged,
      volumeLabel: volumeOrDash(formatVolume, damagedUsedDm3),
      countDot: "bg-rose-500",
    },
  ] as const;

  return (
    <div
      className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      onClick={() => onClearTemplateSelection?.()}
    >
      <h2 className="mb-2.5 text-xs font-black uppercase tracking-wide text-slate-500">Pulpit magazynu</h2>

      {(onOpenReports || onOpenDamageReports) && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {onOpenReports && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReports();
              }}
              className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <svg className="h-4 w-4 shrink-0 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
              className="flex items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              <span aria-hidden>⚠️</span>
              Szkody
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="border-t border-slate-100 pt-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Całkowita zajętość</div>
          <div className="mt-1.5 text-2xl font-black leading-none text-slate-900">{utilizationPct.toFixed(1)}%</div>
          <div className="mt-1 text-xs text-slate-500">
            <span className="font-mono text-slate-700">{formatVolume(productsAssignedVolumeDm3)}</span>
            {" / "}
            <span className="font-mono text-slate-700">{formatVolume(totalCapacity)}</span>
            {" dm³"}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                utilizationPct <= 50 ? "bg-emerald-500" : utilizationPct <= 80 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, utilizationPct)}%` }}
            />
          </div>

          <div className="mt-3 space-y-1.5">
            {occupancyRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.countDot}`} aria-hidden />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="min-w-[2rem] text-right font-mono font-semibold tabular-nums text-slate-900">
                  {row.count}
                </span>
                <span className="min-w-[5.5rem] text-right font-mono tabular-nums text-slate-500">{row.volumeLabel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-2.5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Użyte w układzie</div>
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="truncate text-slate-700">{t.name}</span>
                      </div>
                      <span className="shrink-0 font-mono font-semibold text-slate-700">({count})</span>
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

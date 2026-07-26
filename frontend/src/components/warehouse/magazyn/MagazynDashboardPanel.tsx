import type { CustomRackTemplate, LayoutState, RackType } from "../../../types/warehouse";
import { buildTemplateUsageData } from "../templateUsage";
import { CardButton } from "../../../design-system";
import {
  listPanelMapVisualizationModes,
  type MapVisualizationModeId,
} from "./mapVisualization";

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
  /** Occupied / free location slot counts (additional to type breakdown). */
  locationFill?: {
    occupied: number;
    free: number;
  };
  /** Active map visualization mode (Lokalizacje radio). */
  visualizationMode?: MapVisualizationModeId;
  onVisualizationModeChange?: (mode: MapVisualizationModeId) => void;
  formatVolume: (n: number) => string;
  onOpenReports?: () => void;
  onOpenDamageReports?: () => void;
}

function volumeOrDash(formatVolume: (n: number) => string, n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${formatVolume(n)} dm³`;
}

/**
 * Magazyn operational left rail — one continuous panel, minimal borders.
 */
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
  locationFill,
  visualizationMode = "all",
  onVisualizationModeChange,
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
      tone: "text-sky-600",
      bar: "bg-sky-500",
    },
    {
      key: "reserve",
      label: "Zapasowe",
      count: locationStats.reserve,
      volumeLabel: volumeOrDash(formatVolume, reserveUsedDm3),
      tone: "text-amber-600",
      bar: "bg-amber-500",
    },
    {
      key: "damaged",
      label: "Uszkodzone",
      count: locationStats.damaged,
      volumeLabel: volumeOrDash(formatVolume, damagedUsedDm3),
      tone: "text-rose-600",
      bar: "bg-rose-500",
    },
  ] as const;

  const progressTone =
    utilizationPct <= 50 ? "bg-emerald-500" : utilizationPct <= 80 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="flex h-full min-h-0 flex-col" onClick={() => onClearTemplateSelection?.()}>
      {(onOpenReports || onOpenDamageReports) && (
        <div className="mb-6 grid min-w-0 grid-cols-2 gap-2 px-1">
          {onOpenReports && (
            <CardButton
              className="min-w-0 w-full"
              tone="emerald"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReports();
              }}
            >
              <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M7 15v-5m5 5V7m5 8V4" />
              </svg>
              Raporty
            </CardButton>
          )}
          {onOpenDamageReports && (
            <CardButton
              className="min-w-0 w-full"
              tone="rose"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDamageReports();
              }}
            >
              <span aria-hidden className="text-[13px] leading-none">
                ⚠
              </span>
              Szkody
            </CardButton>
          )}
        </div>
      )}

      <section className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Całkowita zajętość</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-4xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
            {utilizationPct.toFixed(1)}
          </span>
          <span className="pb-1 text-lg font-medium text-slate-400">%</span>
        </div>
        <p className="mt-2 text-[13px] text-slate-500">
          <span className="font-medium tabular-nums text-slate-700">{formatVolume(productsAssignedVolumeDm3)}</span>
          <span className="mx-1 text-slate-300">/</span>
          <span className="tabular-nums text-slate-500">{formatVolume(totalCapacity)} dm³</span>
        </p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressTone}`}
            style={{ width: `${Math.min(100, Math.max(0, utilizationPct))}%` }}
          />
        </div>

        <ul className="mt-6 space-y-3.5">
          {occupancyRows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.bar}`} aria-hidden />
                <span className="truncate text-[13px] text-slate-600">{row.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className={`text-base font-semibold tabular-nums ${row.tone}`}>{row.count}</span>
                <span className="min-w-[4.75rem] text-right text-[11px] tabular-nums text-slate-400">
                  {row.volumeLabel}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {locationFill != null && (
        <>
          <div className="mx-1 my-7 h-px bg-slate-200/70" aria-hidden />
          <section className="px-1" aria-label="Tryby wizualizacji lokalizacji">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Lokalizacje</p>
            <ul className="mt-4 space-y-1" role="radiogroup" aria-label="Tryb wizualizacji mapy">
              {listPanelMapVisualizationModes().map((m) => {
                const count =
                  m.countKey === "occupied"
                    ? locationFill.occupied
                    : m.countKey === "free"
                      ? locationFill.free
                      : locationFill.occupied + locationFill.free;
                const selected = visualizationMode === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onVisualizationModeChange?.(m.id);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-1.5 py-2 text-left transition-colors ${
                        selected ? "bg-slate-900/5" : "hover:bg-slate-100/70"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-slate-800" : "border-slate-300"
                          }`}
                          aria-hidden
                        >
                          {selected ? <span className="h-2 w-2 rounded-full bg-slate-800" /> : null}
                        </span>
                        <span className={`truncate text-[13px] ${selected ? "font-medium text-slate-900" : "text-slate-600"}`}>
                          {m.label}
                        </span>
                      </span>
                      {m.id !== "all" ? (
                        <span
                          className={`text-base font-semibold tabular-nums ${
                            m.id === "free" ? "text-emerald-700" : "text-slate-900"
                          }`}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <div className="mx-1 my-7 h-px bg-slate-200/70" aria-hidden />

      <section className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Użyte typy układu
        </p>
        {usedTemplates.length === 0 ? (
          <p className="text-[13px] text-slate-400">Brak użytych szablonów</p>
        ) : (
          <ul className="space-y-1">
            {usedTemplates.map((t) => {
              const count = usageCountById.get(t.id) ?? 0;
              const isSelected = selectedTemplateId === t.id;
              const representativeRack = layout.racks.find((r) => r.templateId === t.id);
              const locationsPerRack = representativeRack?.bins?.length ?? 0;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTemplate(t.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-100/80"
                    }`}
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-lg shadow-sm ring-1 ring-black/5"
                      style={{ backgroundColor: t.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-medium ${isSelected ? "text-white" : "text-slate-800"}`}>
                        {t.name}
                      </span>
                      <span className={`mt-0.5 block text-[11px] ${isSelected ? "text-slate-300" : "text-slate-400"}`}>
                        {locationsPerRack} lok. / regał
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        isSelected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

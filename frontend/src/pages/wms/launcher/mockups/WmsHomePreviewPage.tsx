/**
 * Podgląd dashboardu WMS (desktop + kolektor) — mock KPI.
 * Otwórz: /dev/wms-home-preview
 */
import { useMemo, useState } from "react";
import { Menu } from "lucide-react";

import { WMS_MODULES, type WmsTabConfigItem } from "../../wmsTabConfig";
import type { WmsHomeKpiCounts } from "../useWmsLauncherBadges";
import type { WmsLauncherMetricsMap } from "../wmsLauncherTypes";
import { WMS_HOME_BG, WMS_HOME_BORDER, WMS_HOME_PRIMARY } from "../wmsHomeSections";
import { WmsCollectorHome } from "../WmsCollectorHome";
import { WmsDesktopHome } from "../WmsDesktopHome";

const MOCK_KPI: WmsHomeKpiCounts = {
  picking: 18,
  packing: 24,
  issues: 5,
  putaway: 6,
  receiving: 2,
  mm: 3,
  consolidations: 0,
  inventory_count: 1,
};

function buildMockMetrics(kpi: WmsHomeKpiCounts): WmsLauncherMetricsMap {
  const map: WmsLauncherMetricsMap = {};
  (Object.keys(kpi) as Array<keyof WmsHomeKpiCounts>).forEach((key) => {
    const count = kpi[key];
    if (count > 0 && key !== "mm" && key !== "consolidations" && key !== "inventory_count") {
      map[key] = { stats: [], count };
    }
  });
  map.mm = { stats: [], count: kpi.mm };
  map.inventory_count = { stats: [], count: kpi.inventory_count };
  map.consolidations = { stats: [], count: kpi.consolidations };
  return map;
}

const PREVIEW_MODULE_IDS = [
  "receiving",
  "picking",
  "putaway",
  "packing",
  "issues",
  "inventory_count",
  "product_preview",
  "returns",
  "direct_sales",
  "production",
  "consolidations",
  "mm",
] as const;

const PREVIEW_PINNED = ["picking", "packing", "issues", "receiving"] as const;

function Frame({
  title,
  width,
  children,
}: {
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div
        className="overflow-hidden rounded-xl border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
        style={{ borderColor: WMS_HOME_BORDER, width: width ? `${width}px` : "100%", maxWidth: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}

function PreviewTopBar() {
  return (
    <div
      className="flex items-center border-b bg-white"
      style={{ height: 56, borderColor: WMS_HOME_BORDER }}
    >
      <div
        className="flex h-full items-center border-r px-3"
        style={{ borderColor: WMS_HOME_BORDER }}
      >
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: "#f5f8ff", color: WMS_HOME_PRIMARY }}
        >
          <Menu size={22} strokeWidth={2} aria-hidden />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
        {PREVIEW_PINNED.map((id, i) => {
          const mod = WMS_MODULES.find((m) => m.id === id);
          if (!mod) return null;
          const Icon = mod.icon;
          const active = i === 0;
          return (
            <span
              key={id}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-3 text-sm font-medium"
              style={
                active
                  ? { backgroundColor: "#f5f8ff", color: WMS_HOME_PRIMARY }
                  : { color: "#475569" }
              }
            >
              <Icon size={18} strokeWidth={2} aria-hidden />
              {mod.label}
            </span>
          );
        })}
      </div>
      <div
        className="flex h-full shrink-0 items-center border-l px-3 text-xs font-medium text-slate-500"
        style={{ borderColor: WMS_HOME_BORDER }}
      >
        Magazyn główny
      </div>
    </div>
  );
}

export default function WmsHomePreviewPage() {
  const [log, setLog] = useState<string[]>([]);
  const tiles: WmsTabConfigItem[] = useMemo(
    () =>
      PREVIEW_MODULE_IDS.map((id) => {
        const mod = WMS_MODULES.find((m) => m.id === id);
        if (!mod) return null;
        return { id: mod.id, path: mod.path, label: mod.label, icon: mod.icon };
      }).filter((t): t is WmsTabConfigItem => Boolean(t)),
    [],
  );
  const metrics = useMemo(() => buildMockMetrics(MOCK_KPI), []);

  const onOpen = (path: string) => {
    setLog((prev) => [`→ ${path}`, ...prev].slice(0, 8));
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8" style={{ backgroundColor: WMS_HOME_BG }}>
      <div className="mx-auto max-w-[1800px]">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: WMS_HOME_PRIMARY }}>
            Dev preview
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">WMS Home — iteracja UI</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Desktop + kolektor z mock KPI. Klik loguje ścieżkę — bez nawigacji.
          </p>
          {log.length > 0 ? (
            <ul className="mt-3 space-y-0.5 font-mono text-xs text-slate-500">
              {log.map((line, i) => (
                <li key={`${line}-${i}`}>{line}</li>
              ))}
            </ul>
          ) : null}
        </header>

        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
          <Frame title="Desktop">
            <div className="max-h-[920px] overflow-y-auto">
              <PreviewTopBar />
              <WmsDesktopHome tiles={tiles} metrics={metrics} kpi={MOCK_KPI} onOpenModule={onOpen} />
            </div>
          </Frame>

          <Frame title="Mobile / kolektor" width={360}>
            <div className="max-h-[920px] overflow-y-auto">
              <div
                className="flex h-12 items-center justify-between border-b px-3"
                style={{ borderColor: WMS_HOME_BORDER }}
              >
                <span className="text-sm font-bold text-slate-800">Start</span>
                <span
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: WMS_HOME_PRIMARY }}
                >
                  3
                </span>
              </div>
              <WmsCollectorHome tiles={tiles} metrics={metrics} onOpenModule={onOpen} />
              <div
                className="flex h-14 items-center justify-around border-t text-[11px] font-semibold text-slate-400"
                style={{ borderColor: WMS_HOME_BORDER }}
              >
                <span style={{ color: WMS_HOME_PRIMARY }}>Start</span>
                <span>Skaner</span>
                <span>Więcej</span>
              </div>
            </div>
          </Frame>
        </div>
      </div>
    </div>
  );
}

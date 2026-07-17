import { useMemo } from "react";

import { getWmsModule, type WmsTabConfigItem, type WmsTabId } from "../wmsTabConfig";
import type { WmsLauncherMetricsMap } from "./wmsLauncherTypes";
import {
  WMS_HOME_BG,
  WMS_HOME_BORDER,
  WMS_HOME_COLLECTOR_OTHER_IDS,
  WMS_HOME_COLLECTOR_TODO_IDS,
} from "./wmsHomeSections";
import { WmsHomeCollectorRow } from "./WmsHomeCollectorRow";

/** Shorter labels for handheld list density. */
const COLLECTOR_LABEL: Partial<Record<WmsTabId, string>> = {
  putaway: "Rozlokowanie",
  mm: "Przesunięcia",
  returns: "Zwroty",
  production: "Produkcja",
  consolidations: "Kompletacja",
  receiving: "Przyjęcia",
};

export type WmsCollectorHomeProps = {
  tiles: WmsTabConfigItem[];
  metrics: WmsLauncherMetricsMap;
  onOpenModule: (path: string) => void;
};

function resolveRows(
  ids: WmsTabId[],
  tilesById: Map<WmsTabId, WmsTabConfigItem>,
): WmsTabConfigItem[] {
  return ids.map((id) => tilesById.get(id)).filter((t): t is WmsTabConfigItem => Boolean(t));
}

export function WmsCollectorHome({ tiles, metrics, onOpenModule }: WmsCollectorHomeProps) {
  const tilesById = useMemo(() => {
    const map = new Map<WmsTabId, WmsTabConfigItem>();
    tiles.forEach((t) => map.set(t.id, t));
    return map;
  }, [tiles]);

  const todoRows = useMemo(
    () => resolveRows(WMS_HOME_COLLECTOR_TODO_IDS, tilesById),
    [tilesById],
  );
  const otherRows = useMemo(
    () => resolveRows(WMS_HOME_COLLECTOR_OTHER_IDS, tilesById),
    [tilesById],
  );

  const renderGroup = (title: string, rows: WmsTabConfigItem[]) => {
    if (rows.length === 0) return null;
    return (
      <section className="mb-6">
        <h2
          className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500"
        >
          {title}
        </h2>
        <div
          className="overflow-hidden rounded-xl border bg-white [&_button:last-child]:border-b-0"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          {rows.map((tab) => {
            const moduleDef = getWmsModule(tab.id);
            return (
              <WmsHomeCollectorRow
                key={tab.id}
                moduleId={tab.id}
                label={COLLECTOR_LABEL[tab.id] ?? tab.label}
                description={moduleDef?.shortDescription}
                icon={tab.icon}
                count={metrics[tab.id]?.count ?? 0}
                onActivate={() => onOpenModule(tab.path)}
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: WMS_HOME_BG }}>
      <div className="px-3 pb-8 pt-3">
        {todoRows.length === 0 && otherRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            Brak modułów WMS dla tego użytkownika.
          </div>
        ) : (
          <>
            {renderGroup("Do zrobienia", todoRows)}
            {renderGroup("Pozostałe", otherRows)}
          </>
        )}
      </div>
    </div>
  );
}

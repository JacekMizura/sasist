import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";

import { getWmsModule, type WmsTabConfigItem, type WmsTabId } from "../wmsTabConfig";
import type { WmsHomeKpiCounts } from "./useWmsLauncherBadges";
import type { WmsLauncherMetricsMap } from "./wmsLauncherTypes";
import {
  WMS_HOME_BG,
  WMS_HOME_BORDER,
  WMS_HOME_DESKTOP_SECTIONS,
  WMS_HOME_DISPLAY_LABEL,
  WMS_HOME_PRIMARY,
} from "./wmsHomeSections";
import { WmsHomeDesktopTile } from "./WmsHomeDesktopTile";
import { WmsHomeKpiStrip } from "./WmsHomeKpiStrip";

const DEFAULT_DESCRIPTION = "Moduł operacyjny";

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function greetingForHour(hour: number): string {
  if (hour < 18) return "Dzień dobry!";
  return "Dobry wieczór!";
}

export type WmsDesktopHomeProps = {
  tiles: WmsTabConfigItem[];
  metrics: WmsLauncherMetricsMap;
  kpi: WmsHomeKpiCounts;
  onOpenModule: (path: string) => void;
};

export function WmsDesktopHome({ tiles, metrics, kpi, onOpenModule }: WmsDesktopHomeProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const tilesById = useMemo(() => {
    const map = new Map<WmsTabId, WmsTabConfigItem>();
    tiles.forEach((t) => map.set(t.id, t));
    return map;
  }, [tiles]);

  const q = normalizeSearch(query);

  const sections = useMemo(() => {
    return WMS_HOME_DESKTOP_SECTIONS.map((section) => {
      const items = section.moduleIds
        .map((id) => tilesById.get(id))
        .filter((t): t is WmsTabConfigItem => Boolean(t))
        .filter((tab) => {
          if (!q) return true;
          const moduleDef = getWmsModule(tab.id);
          const haystack = [tab.label, moduleDef?.shortDescription ?? ""].join(" ").toLowerCase();
          return haystack.includes(q);
        });
      return { ...section, items };
    }).filter((s) => s.items.length > 0);
  }, [tilesById, q]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [flatItems.length, query]);

  useEffect(() => {
    const onGlobalKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = target?.closest("input, textarea, select, [contenteditable=true]");
      if (inField) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const idx = Number(event.key) - 1;
        const item = flatItems[idx];
        if (item) {
          event.preventDefault();
          onOpenModule(item.path);
        }
      }
    };
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [flatItems, onOpenModule]);

  const onShellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const count = flatItems.length;
      if (count === 0) return;
      let next = focusedIndex;
      switch (event.key) {
        case "ArrowRight":
          next = Math.min(count - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          next = Math.max(0, focusedIndex - 1);
          break;
        case "ArrowDown":
          next = Math.min(count - 1, focusedIndex + 4);
          break;
        case "ArrowUp":
          next = Math.max(0, focusedIndex - 4);
          break;
        case "Enter":
          event.preventDefault();
          onOpenModule(flatItems[focusedIndex].path);
          return;
        case "Escape":
          if (query) {
            event.preventDefault();
            setQuery("");
            searchRef.current?.blur();
          }
          return;
        default:
          return;
      }
      event.preventDefault();
      setFocusedIndex(next);
    },
    [flatItems, focusedIndex, onOpenModule, query],
  );

  const openByModuleId = useCallback(
    (moduleId: string) => {
      const tab = tilesById.get(moduleId as WmsTabId);
      if (tab) onOpenModule(tab.path);
    },
    [tilesById, onOpenModule],
  );

  let shortcutCounter = 0;

  return (
    <div className="min-h-full" style={{ backgroundColor: WMS_HOME_BG }}>
      <div
        className="mx-auto w-full max-w-[1800px] px-6 py-6"
        tabIndex={0}
        onKeyDown={onShellKeyDown}
        role="region"
        aria-label="Start WMS"
      >
        <header className="mb-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {greetingForHour(new Date().getHours())}
          </h1>
        </header>

        <div className="mb-4">
          <WmsHomeKpiStrip kpi={kpi} onOpenModule={openByModuleId} />
        </div>

        <div className="mb-5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 max-w-xl flex-1">
            <Search
              size={18}
              strokeWidth={2}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj modułu…"
              aria-label="Szukaj modułu WMS"
              className="h-10 w-full rounded-xl border bg-white pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 transition-shadow focus:outline-none focus:ring-2 focus:ring-[#5a4fcf]/20"
              style={{ borderColor: WMS_HOME_BORDER }}
            />
          </div>
          <p className="shrink-0 text-xs text-slate-400">Skróty: 1-9 • Enter - otwórz</p>
        </div>

        {flatItems.length === 0 ? (
          <div
            className="rounded-xl border border-dashed bg-white px-6 py-10 text-center"
            style={{ borderColor: WMS_HOME_BORDER }}
          >
            <p className="text-sm font-medium text-slate-600">
              {tiles.length === 0 ? "Brak modułów WMS dla tego użytkownika." : "Brak wyników wyszukiwania."}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={`wms-home-${section.id}`}>
                <div className="mb-2 border-b pb-1.5" style={{ borderColor: WMS_HOME_BORDER }}>
                  <h2
                    id={`wms-home-${section.id}`}
                    className="text-xs font-bold uppercase tracking-wide text-slate-800"
                  >
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">{section.description}</p>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
                  {section.items.map((tab) => {
                    shortcutCounter += 1;
                    const shortcut = shortcutCounter <= 9 ? shortcutCounter : undefined;
                    const moduleDef = getWmsModule(tab.id);
                    const description = moduleDef?.shortDescription?.trim() || DEFAULT_DESCRIPTION;
                    const flatIdx = flatItems.findIndex((t) => t.id === tab.id);
                    return (
                      <WmsHomeDesktopTile
                        key={tab.id}
                        moduleId={tab.id}
                        label={WMS_HOME_DISPLAY_LABEL[tab.id] ?? tab.label}
                        description={description}
                        icon={tab.icon}
                        count={metrics[tab.id]?.count ?? 0}
                        shortcut={shortcut}
                        focused={flatIdx === focusedIndex}
                        onActivate={() => onOpenModule(tab.path)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <footer
          className="mt-6 flex flex-col gap-1 border-t pt-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <p>
            <span className="font-semibold text-slate-500">Wskazówka: </span>
            Naciśnij 1–9, aby otworzyć moduł, lub / aby wyszukać.
          </p>
          <p style={{ color: WMS_HOME_PRIMARY }} className="font-medium opacity-70">
            Sasist WMS
          </p>
        </footer>
      </div>
    </div>
  );
}

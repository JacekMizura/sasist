import { useMemo, useState, type ReactNode } from "react";
import { RotateCcw, Save, Search } from "lucide-react";

import { brandOutlineButtonClass, brandPrimaryButtonClass } from "../../design-system/brandUi";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WmsSettingsSearchContext } from "./WmsSettingsSearchContext";

export type WmsSettingsTabFrameProps = {
  title: string;
  description: string;
  sections: WmsSettingsSectionConfig[];
  asideLabel?: string;
  observeSections?: boolean;
  /** @deprecated Unused — retained for call-site compatibility. */
  observeRevision?: unknown;
  /** Dirty / save wiring from page host (same as sticky footer). */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onRestoreDefaults?: () => void;
  restoreDisabled?: boolean;
  children: ReactNode;
};

/**
 * Canonical WMS process-tab chrome: title + description + search/actions, then left nav + content.
 * Matches the accepted Pakowanie layout used across all WMS settings tabs.
 */
export function WmsSettingsTabFrame({
  title,
  description,
  sections,
  asideLabel,
  observeSections = true,
  observeRevision,
  dirty = false,
  saving = false,
  onSave,
  onRestoreDefaults,
  restoreDisabled,
  children,
}: WmsSettingsTabFrameProps) {
  const [query, setQuery] = useState("");
  const searchValue = useMemo(() => ({ query: query.trim().toLowerCase() }), [query]);

  const filteredSections = useMemo(() => {
    const q = searchValue.query;
    if (!q) return sections;
    return sections.filter((s) => {
      const hay = `${s.label} ${s.searchText ?? ""} ${s.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sections, searchValue.query]);

  return (
    <WmsSettingsSearchContext.Provider value={searchValue}>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-slate-200/90 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
            <label className="relative min-w-0 flex-1 sm:max-w-xs lg:w-64">
              <span className="sr-only">Szukaj ustawień</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Szukaj ustawień…"
                className={`${listSellasistInputClass} !h-10 w-full pl-9 pr-3`}
              />
            </label>
            {onRestoreDefaults ? (
              <button
                type="button"
                disabled={restoreDisabled || saving}
                onClick={onRestoreDefaults}
                className={`${brandOutlineButtonClass} !h-10 shrink-0 gap-1.5 px-3`}
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
                Przywróć domyślne
              </button>
            ) : null}
            {onSave ? (
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={onSave}
                className={`${brandPrimaryButtonClass} !h-10 shrink-0 gap-1.5`}
              >
                <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
                {saving ? "Zapisywanie…" : "Zapisz zmiany"}
              </button>
            ) : null}
          </div>
        </div>

        {searchValue.query && filteredSections.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            Brak sekcji pasujących do „{query.trim()}”.
          </p>
        ) : (
          <WmsSettingsLayout
            sections={filteredSections.length > 0 ? filteredSections : sections}
            asideLabel={asideLabel ?? `Sekcje: ${title}`}
            observeSections={observeSections}
            observeRevision={observeRevision}
          >
            {children}
          </WmsSettingsLayout>
        )}
      </div>
    </WmsSettingsSearchContext.Provider>
  );
}

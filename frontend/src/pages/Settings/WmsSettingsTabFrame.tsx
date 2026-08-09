import { useMemo, type ReactNode } from "react";
import { RotateCcw, Save } from "lucide-react";

import { brandOutlineButtonClass, brandPrimaryButtonClass } from "../../design-system/brandUi";
import { WmsSettingsLayout } from "./WmsSettingsLayout";
import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WmsSettingsSearchContext } from "./WmsSettingsSearchContext";

export type WmsSettingsTabFrameProps = {
  title: string;
  /** Optional blurb under the tab title — omit to avoid empty spacing. */
  description?: string;
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
 * Canonical WMS process-tab chrome: title + description + save actions, then left nav + content.
 * Module-wide settings search lives in {@link WmsSettingsChrome} (global combobox).
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
  const searchValue = useMemo(() => ({ query: "" }), []);
  const blurb = (description ?? "").trim();

  return (
    <WmsSettingsSearchContext.Provider value={searchValue}>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-slate-200/90 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>
            {blurb ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{blurb}</p> : null}
          </div>
          {(onRestoreDefaults || onSave) && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
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
          )}
        </div>

        <WmsSettingsLayout
          sections={sections}
          asideLabel={asideLabel ?? `Sekcje: ${title}`}
          observeSections={observeSections}
          observeRevision={observeRevision}
        >
          {children}
        </WmsSettingsLayout>
      </div>
    </WmsSettingsSearchContext.Provider>
  );
}

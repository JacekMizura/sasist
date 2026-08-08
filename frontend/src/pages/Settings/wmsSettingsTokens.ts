/** Shared spacing / typography for all WMS settings modules.
 * Form rows: label column LEFT + control column RIGHT via {@link ./wmsSettingRow}.
 */
export const wmsSettingsTokens = {
  mainStack: "space-y-6",
  sectionTitle: "text-base font-semibold text-slate-900",
  sectionSummary: "mt-1 text-sm text-slate-500",
  card: "rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm",
  cardInner: "rounded-lg border border-slate-200/90 bg-slate-50/50 p-4",
  cardTitle: "text-sm font-semibold text-slate-900",
  cardDescription: "mt-1 text-xs leading-relaxed text-slate-500",
  fieldStack: "space-y-4",
  /** Prefer single-column Sellasist rows ({@link ./wmsSettingRow}); not a 2-col grid. */
  fieldGrid: "space-y-1",
  help: "mt-1 text-xs leading-relaxed text-slate-500",
  /** Prefer {@link ./wmsSettingRow} `wmsSettingControlSelectClass` for horizontal rows. */
  select:
    "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
  input:
    "w-full max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
  checkbox: "h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500",
} as const;

/** Canonical section labels for WMS settings side nav. */
export const WMS_SETTINGS_CANONICAL_SECTION = {
  general: "Ogólne",
  workflow: "Workflow",
  view: "Widok",
  automation: "Automatyzacja",
  integrations: "Integracje",
  printing: "Drukowanie",
  advanced: "Zaawansowane",
} as const;

export type WmsSettingsCanonicalSectionKey = keyof typeof WMS_SETTINGS_CANONICAL_SECTION;

export function cnParts(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

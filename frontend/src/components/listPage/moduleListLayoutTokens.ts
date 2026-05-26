/**
 * Shared vertical rhythm inside tab modules — parent route applies the slate page canvas
 * via `WmsModuleLayout` / `PageCanvasBody`.
 */

export const moduleListPageShellClass = "flex w-full flex-col gap-4";

/** Flex child variant for routes inside a fill-height layout (e.g. warehouse materials). */
export const moduleListPageShellFlexClass = `${moduleListPageShellClass} min-h-0 min-w-0 flex-1`;

export const moduleListHeaderRowClass =
  "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";

export const moduleListTitleClass = "text-xl font-semibold text-slate-900";

export const moduleListDescriptionClass = "mt-1 text-sm text-slate-500";

export const moduleListHeaderActionsClass =
  "flex shrink-0 flex-wrap items-center justify-end gap-2";

/** Filters block inside unified {@link ../ui/PageCard} — no nested card chrome. */
export const moduleListFiltersWrapClass = "space-y-3";

/** Neutralize FilterPanel default chrome when nested in {@link moduleListFiltersWrapClass}. */
export const moduleListFilterPanelBareClass =
  "rounded-none border-0 bg-transparent p-0 shadow-none";

/** Fields block below FilterToolbar (toolbar sits flush top of card). */
export const moduleListFilterBodyClass = "space-y-3 border-t border-slate-100 pt-4";

/** Primary table block — inherits outer PageCard; no nested card chrome. */
export const moduleListDataCardClass = "min-w-0 overflow-hidden";

/** Table block inside unified {@link ../ui/PageCard} — no nested card chrome. */
export const moduleListTableInteriorClass = "min-w-0 overflow-x-auto";

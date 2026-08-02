/**
 * Wspólne tokeny UI hubu Analizy — nagłówki, CTA, KPI, stany.
 * Brand orange = Primary CTA (design-system).
 */

import {
  brandOutlineButtonClass,
  brandPrimaryButtonClass,
  brandSoftButtonClass,
} from "../../design-system/brandUi";
import {
  dashboardCardPadding,
  dashboardKpiGridGap,
  dashboardSurfaceCard,
} from "../../components/dashboard/dashboardDensityPrimitives";

export const analizyPageTitleClass = "text-xl font-semibold text-slate-800";
export const analizyPageSubtitleClass = "mt-1 text-sm text-slate-600";

/** Manifest / landing page header stack. */
export const analizyHeaderStackClass = "mb-6 space-y-3";

/** Pytanie → Decyzja box. */
export const analizyDecisionBoxClass =
  "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-2";

export const analizyCtaPrimaryClass = brandPrimaryButtonClass;
export const analizyCtaSecondaryClass = brandOutlineButtonClass;
export const analizyCtaSoftClass = brandSoftButtonClass;

export const analizyKpiCardClass = `${dashboardSurfaceCard} ${dashboardCardPadding}`;
export const analizyKpiGridClass = `grid ${dashboardKpiGridGap} sm:grid-cols-2 lg:grid-cols-4`;

export const analizyEmptyStateClass =
  "rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center";

export const analizyErrorClass =
  "rounded-lg border border-red-200 bg-red-50 p-4 text-red-800";

export const analizyLoadingClass = "text-sm text-slate-500";

/** Active item in Raporty / Optymalizacja side nav. */
export const analizySideNavActiveClass = "bg-orange-500 text-white";
export const analizySideNavIdleClass = "text-slate-600 hover:bg-slate-100";

/** Map technical / import placeholder product names to Polish UI copy. */
export function displayProductName(name: string | null | undefined, fallback = "—"): string {
  const raw = String(name ?? "").trim();
  if (!raw) return fallback;
  if (/^unknown product$/i.test(raw)) return "Nieznany produkt";
  return raw;
}

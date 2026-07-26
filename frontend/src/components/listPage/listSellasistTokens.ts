/**
 * Dense list / CRUD styling — facade over Sasist UI Kit where possible.
 * @deprecated Prefer `Input`, `IconButton`, `Toolbar`, `PageHeader` from `design-system`.
 */

import { iconButtonClass, iconButtonDangerClass, inputClassName } from "../../design-system";
import { sizes, typography } from "../../design-system/tokens";

/** Comfortable control height for ERP-style lists */
export const listSellasistControlH = sizes.controlLg;

export const listSellasistInputClass = inputClassName("default", "neutral");

export const listSellasistLabelClass = `mb-1 block ${typography.label}`;

/** 4–6 fields per row on wide screens */
export const listSellasistFilterGridClass =
  "grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";

/** Products benchmark: at most 4 filter controls per row (no overstretched single row). */
export const listSellasistFilterGridClass4 =
  "grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2 lg:grid-cols-4";

export const listSellasistTableHeaderCellClass =
  "whitespace-nowrap border-b border-slate-200/90 bg-slate-50/95 px-2 py-1.5 text-left align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500";

export const listSellasistTableBodyCellClass =
  "border-b border-slate-100 px-2 py-1.5 align-top text-[12px] leading-snug text-slate-800";

export const listSellasistTableBodyCellClassDense =
  "border-b border-slate-200/80 px-2 py-1 align-top text-[12px] leading-tight text-slate-800";

export const listSellasistTableHeaderCellClassDense =
  "whitespace-nowrap border-b border-slate-200/90 bg-slate-50/95 px-2 py-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500";

/** Products list: readable ERP-style headers (not microscopic). */
export const listSellasistTableHeaderCellGrid =
  "border-b border-slate-200/20 px-3 py-2.5 align-middle text-sm leading-normal text-slate-800";

/** Body cells: comfortable padding + default readable size (overridable per cell). */
export const listSellasistTableBodyCellGrid =
  "border-b border-slate-200/40 px-3 py-2.5 align-middle text-sm leading-normal text-slate-800";

export const listSellasistIconBtn = iconButtonClass;

/** Row actions — unified with `OperationalActionButton` / `operationalActionButtonTokens`. */
export {
  operationalActionButtonClass as listSellasistRowActionBtn,
  operationalActionButtonDangerClass as listSellasistRowActionBtnDanger,
} from "../operational/operationalActionButtonTokens";

export const listSellasistIconBtnDanger = iconButtonDangerClass;

export const listSellasistBreadcrumbClass = "text-[11px] font-medium text-slate-400 hover:text-slate-600";

export const listSellasistPageTitleClass = "text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl";

/** Products list page title — modern ERP scale. */
export const listSellasistProductListTitleClass =
  "text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl";

export const listSellasistUtilityIconBtn = iconButtonClass;

/** Top toolbar — readable control height. Prefer SecondaryButton / IconButton. */
export const listSellasistToolbarToggleBtn =
  "inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

export const listSellasistToolbarSquareBtn = iconButtonClass;

/** „Dodaj” next to list title. */
export const listSellasistTitleAddBtn = iconButtonClass;

/** Orders / Returns panel status sidebar @ lg — mockup v3 (~312px). */
export const panelListStatusSidebarWidthLg = "lg:w-[18rem]";

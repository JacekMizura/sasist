/** Shared form tokens — must match ProductEditModal (catalog entity pages). */

export const productLikeFieldLabelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export const productLikeInputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm leading-tight text-slate-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/** Text/numeric field bez natywnych spinnerów (receptury, ilości wpisywane z klawiatury). */
export const productLikeNumericInputNoSpinnerClass =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export const productLikeTabPanelPaddingClass = "w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8";

/** Odstęp między hero nagłówka a poziomym paskiem zakładek (16–24px). */
export const productLikeTabsNavClass =
  "flex gap-1 overflow-x-auto border-t border-slate-100 px-4 pt-4 pb-2 sm:px-6 sm:pt-5 lg:px-8 lg:pt-6 [-webkit-overflow-scrolling:touch]";

export const productLikeSectionTitleClass = "mb-5 text-lg font-bold text-slate-900 border-b border-slate-200 pb-2";

export const productLikeFormNumberReset =
  "[&_input[type=number]]:appearance-[textfield] [&_input[type=number]]:[&::-webkit-inner-spin-button]:appearance-none [&_input[type=number]]:[&::-webkit-outer-spin-button]:appearance-none";

export const productLikeThreeColClass = "flex flex-col 2xl:flex-row items-start gap-10 lg:gap-12";

export const productLikeSideColClass = "w-full 2xl:w-[420px] shrink-0 space-y-12";

export const productLikeMainAsideClass = "w-full flex-1 min-w-0";

export function productLikeMetaChipClass(variant: "default" | "blue" | "emerald" | "amber" = "default"): string {
  switch (variant) {
    case "blue":
      return "flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-1";
    case "emerald":
      return "flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-1";
    case "amber":
      return "flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-1";
    default:
      return "flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-1";
  }
}

export function productLikeMetaChipLabelClass(variant: "default" | "blue" | "emerald" | "amber" = "default"): string {
  switch (variant) {
    case "blue":
      return "text-blue-600 mr-1.5";
    case "emerald":
      return "text-emerald-600 mr-1.5";
    case "amber":
      return "text-amber-700 mr-1.5";
    default:
      return "text-slate-500 mr-1.5";
  }
}

export function productLikeMetaChipValueClass(variant: "default" | "blue" | "emerald" | "amber" = "default"): string {
  switch (variant) {
    case "blue":
      return "font-bold text-blue-900 tabular-nums";
    case "emerald":
      return "font-bold text-emerald-900 tabular-nums";
    case "amber":
      return "font-bold text-amber-900 tabular-nums";
    default:
      return "font-semibold text-slate-800";
  }
}

export function productLikeRailBtnClass(active: boolean): string {
  return `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors duration-200 focus-visible:outline focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? "border-slate-700 bg-slate-50 text-slate-900 ring-1 ring-slate-200/80 shadow-sm"
      : "border-transparent bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
  }`;
}

export function productLikeTabBtnClass(active: boolean, withIcon = false): string {
  const layout = withIcon ? "inline-flex items-center gap-2" : "";
  return `${layout} shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors -mb-px ${
    active
      ? "border-blue-600 bg-blue-50/40 text-blue-700"
      : "border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
  }`;
}

export function productLikeStatCardClass(variant: "slate" | "blue" | "green" | "orange" = "slate"): string {
  switch (variant) {
    case "blue":
      return "rounded-xl border border-slate-200 bg-slate-50 p-3 min-w-[100px]";
    case "green":
      return "rounded-xl border border-green-100 bg-green-50 p-3 min-w-[120px]";
    case "orange":
      return "rounded-xl border border-orange-100 bg-orange-50 p-3 min-w-[100px]";
    default:
      return "rounded-xl border border-slate-200 bg-white p-3 min-w-[100px]";
  }
}

export function productLikeStatCardLabelClass(variant: "slate" | "blue" | "green" | "orange" = "slate"): string {
  switch (variant) {
    case "green":
      return "text-xs font-medium text-green-700 mb-1";
    case "orange":
      return "text-xs font-medium text-orange-700 mb-1";
    default:
      return "text-xs font-medium text-slate-500 mb-1";
  }
}

export function productLikeStatCardValueClass(variant: "slate" | "blue" | "green" | "orange" = "slate"): string {
  switch (variant) {
    case "blue":
      return "text-lg font-bold tabular-nums text-blue-600";
    case "green":
      return "text-lg font-bold tabular-nums text-green-700";
    case "orange":
      return "text-lg font-bold tabular-nums text-orange-700";
    default:
      return "text-lg font-bold tabular-nums text-slate-900";
  }
}

export function productLikeStatCardSubClass(variant: "slate" | "blue" | "green" | "orange" = "slate"): string {
  void variant;
  return "text-xs mt-0.5 text-green-600";
}

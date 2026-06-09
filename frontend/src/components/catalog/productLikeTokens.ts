/** Shared form tokens — must match ProductEditModal (catalog entity pages). */

export const productLikeFieldLabelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export const productLikeInputClass =
  "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm leading-tight text-slate-900 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export const productLikeTabPanelPaddingClass = "py-8 px-4 sm:px-6 lg:px-8 w-full";

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

export function productLikeTabBtnClass(active: boolean): string {
  return `shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors -mb-px ${
    active ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
  }`;
}

import { listSellasistControlH, listSellasistInputClass, listSellasistToolbarToggleBtn } from "../../components/listPage/listSellasistTokens";
import { productLikeNumericInputNoSpinnerClass } from "../../components/catalog/productLikeTokens";

/** Jednolita wysokość kontrolek paska projektanta (zgodna z listami ERP). */
export const labelDesignerToolbarControlH = listSellasistControlH;

export const labelDesignerToolbarInputClass = `${listSellasistInputClass} !h-10`;

export const labelDesignerToolbarNumericClass = `${labelDesignerToolbarInputClass} ${productLikeNumericInputNoSpinnerClass} tabular-nums`;

export const labelDesignerToolbarSecondaryBtnClass = listSellasistToolbarToggleBtn;

/** Primary — identyczny jak Produkty / Zamówienia / Szablony wydruków. */
export const labelDesignerToolbarPrimaryBtnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

export const labelDesignerMoreMenuPanelClass =
  "z-[8000] min-w-[15.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5";

export const labelDesignerMoreMenuItemClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";

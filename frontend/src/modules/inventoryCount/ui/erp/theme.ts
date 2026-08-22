/** ERP inventory admin panel — dense WMS-aligned tokens. */

import { brandPrimaryButtonClass } from "../../../../design-system/brandUi";

export const erpSurfaceCard = "rounded-lg border border-slate-200/90 bg-white";

export const erpPageShell = "flex w-full flex-col gap-4";

export const erpKpiCard = `${erpSurfaceCard} flex flex-col justify-center p-3`;

export const erpKpiLabel = "mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400";

export const erpKpiValue = "text-xl font-bold tabular-nums text-slate-900";

export const erpSectionCard = `${erpSurfaceCard} flex flex-col overflow-hidden`;

export const erpSectionHeader =
  "border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

export const erpTableWrap = `${erpSurfaceCard} overflow-hidden`;

export const erpTableScroll = "overflow-x-auto";

export const erpTable = "w-full text-left text-sm text-slate-700";

export const erpThead = "border-b border-slate-200/90 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

export const erpTh = "px-4 py-2";

export const erpThActions = "w-10 px-2 py-2 text-center";

export const erpTd = "whitespace-nowrap px-4 py-2";

export const erpTdActions = "px-2 py-2 text-center";

export const erpTr = "transition-colors hover:bg-slate-50/60";

export const erpTbody = "divide-y divide-slate-100/90";

export const erpDocLink =
  "font-medium text-slate-900 underline-offset-2 transition-colors hover:text-orange-600 hover:underline";

/** @deprecated Prefer CardButton (active) + title/hint from @/design-system. */
export const erpSelectCard = (selected: boolean) =>
  `cursor-pointer rounded-lg border p-3 transition-all ${
    selected
      ? "border-orange-500/80 bg-orange-50/40 ring-1 ring-orange-500/30"
      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
  }`;

/** @deprecated Prefer CardButton children typography from @/design-system. */
export const erpSelectCardTitle = (selected: boolean) =>
  `mb-0.5 text-sm font-semibold ${selected ? "text-orange-900" : "text-slate-900"}`;

/** @deprecated Prefer CardButton children typography from @/design-system. */
export const erpSelectCardHint = (selected: boolean) =>
  `text-xs ${selected ? "text-orange-800/80" : "text-slate-500"}`;

/** @deprecated Prefer FormLabel / FormField from @/design-system. */
export const erpFieldLabel = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

/** @deprecated Prefer Input / SearchInput density={FORM_FIELD_DENSITY} from @/design-system. */
export const erpFieldInput =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300/50";

/** @deprecated Prefer Stepper from @/design-system. */
export const erpWizardStepNav = "mb-6 flex w-full border-b border-slate-200/90";

/** @deprecated Prefer Stepper from @/design-system. */
export const erpWizardStepItem = (active: boolean) =>
  `flex-1 pb-2.5 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors ${
    active ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-400"
  }`;

/** @deprecated Prefer FormActions from @/design-system. */
export const erpWizardFooter = "mt-8 flex items-center justify-between border-t border-slate-200/90 pt-4";

export const erpBtnPrimary = brandPrimaryButtonClass;

/** @deprecated Prefer GhostButton / secondaryButtonClassName from design-system. */
export { ghostButtonClass as erpBtnGhost } from "../../../../design-system";

export const erpScopeBox = "rounded-lg border border-slate-200/90 bg-slate-50/50 p-3";

export const erpTabLink = (active: boolean) =>
  `relative pb-2.5 text-sm font-medium transition-colors ${
    active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
  }`;

export const erpTabIndicator = "absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900";

/** @deprecated Use erpTable* tokens. */
export const ERP_INV = {
  table: erpTable,
  th: erpTh,
  td: erpTd,
  row: erpTr,
} as const;

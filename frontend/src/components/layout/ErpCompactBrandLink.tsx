import { Link } from "react-router-dom";

import { UI_STRINGS } from "../../constants/uiStrings";

/**
 * Kompaktowa marka ERP: ikona „S” + SELLASIST / ERP (bez chipa środowiska).
 * Używana w nagłówku lewego sidebaru szkieletu ERP.
 */
export default function ErpCompactBrandLink() {
  return (
    <Link
      to="/dashboard"
      className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      title={`${UI_STRINGS.app.brandMark} — panel`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold leading-none text-white shadow-sm shadow-slate-900/10">
        S
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-extrabold leading-none tracking-tight text-slate-900">
          {UI_STRINGS.app.brandMark}
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          {UI_STRINGS.app.erpSubtitle}
        </span>
      </span>
    </Link>
  );
}

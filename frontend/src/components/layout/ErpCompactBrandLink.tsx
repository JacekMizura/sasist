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
      className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      title={`${UI_STRINGS.app.brandMark} — panel`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-bold leading-none text-white shadow-md shadow-slate-900/15">
        S
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-extrabold leading-none tracking-tight text-slate-900">
          {UI_STRINGS.app.brandMark}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {UI_STRINGS.app.erpSubtitle}
        </span>
      </span>
    </Link>
  );
}

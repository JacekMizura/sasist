import { Link } from "react-router-dom";

import { UI_STRINGS } from "../../constants/uiStrings";

// Unowocześniony styl kontenera: delikatniejsze obramowanie, większe zaokrąglenie (rounded-xl) i subtelny hover
const linkClass =
  "flex min-h-0 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-2.5 py-2 shadow-sm transition hover:border-slate-300 hover:bg-slate-50";

/**
 * Kompaktowa marka ERP: ikona „S” + SELLASIST / ERP (bez chipa środowiska).
 * Używana w nagłówku lewego sidebaru szkieletu ERP.
 */
export default function ErpCompactBrandLink() {
  return (
    <Link
      to="/dashboard"
      className={linkClass}
      title={`${UI_STRINGS.app.brandMark} — panel`}
    >
      {/* Nowy sygnet "S" - ciemny granat (slate-900), lekko zaokrąglony (rounded-lg) */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold leading-none text-white shadow-sm">
        S
      </span>
      
      {/* Tekst logotypu ułożony poziomo (baseline), z wyraźnym zróżnicowaniem wagi i koloru */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate">
        <span className="truncate text-[15px] font-bold tracking-tight text-slate-900">
          {UI_STRINGS.app.brandMark}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {UI_STRINGS.app.erpSubtitle}
        </span>
      </span>
    </Link>
  );
}
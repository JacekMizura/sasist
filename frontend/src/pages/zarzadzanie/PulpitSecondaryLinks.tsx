import { Link } from "react-router-dom";
import {
  PLAN_ZMIAN_PATH,
  ZARZADZANIE_REPORTS_ENTRY,
} from "../../modules/analizy/analizyModuleNav";

/** Wejścia drugorzędne — na dole Pulpitu, nie na pierwszym planie. */
export function PulpitSecondaryLinks() {
  return (
    <nav
      className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-5 text-sm"
      aria-label="Dalsze narzędzia"
    >
      <Link
        to={ZARZADZANIE_REPORTS_ENTRY}
        className="font-semibold text-slate-600 hover:text-orange-700 hover:underline"
      >
        Raporty
      </Link>
      <Link
        to={PLAN_ZMIAN_PATH}
        className="font-semibold text-slate-600 hover:text-orange-700 hover:underline"
      >
        Plan zmian
      </Link>
    </nav>
  );
}

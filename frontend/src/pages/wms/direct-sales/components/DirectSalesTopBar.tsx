import { useAuth } from "../../../../context/AuthContext";
import type { RuntimeHealth } from "../../../../hooks/runtime/useOperationalRuntime";
import type { DirectSaleSession } from "../services/directSalesApi";

type Props = {
  session: DirectSaleSession | null;
  runtimeHealth: RuntimeHealth;
};

// Podmienione kolory kropek, aby usunąć ciemne szarości i nadać nowoczesny wygląd
const HEALTH_DOT: Record<RuntimeHealth, string> = {
  live: "bg-emerald-400 animate-pulse",
  polling: "bg-amber-400",
  offline: "bg-red-500",
  disabled: "bg-blue-200", 
};

export function DirectSalesTopBar({ session, runtimeHealth }: Props) {
  const { user } = useAuth();
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.login || "Operator";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-blue-50 bg-white px-4 py-4 lg:px-6 z-20">
      
      {/* Lewa strona: Tytuł, Sesja i Operator */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Terminal sprzedaży
        </h1>
        
        <div className="hidden sm:block h-6 w-px bg-blue-50"></div>

        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="text-blue-800 bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg font-bold tracking-wide">
            Sesja {session ? `#${session.id}` : "—"}
          </span>
          <span className="flex items-center gap-2 text-slate-600">
            {/* Ozdobny inicjał zamiast samej kropki */}
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
              {name.charAt(0).toUpperCase()}
            </div>
            {name}
          </span>
        </div>
      </div>

      {/* Prawa strona: Runtime Health */}
      <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-50 px-3 py-1.5 rounded-xl shadow-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[runtimeHealth]}`} />
        <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">
          Runtime: {runtimeHealth}
        </span>
      </div>
      
    </header>
  );
}
import { useAuth } from "../../../../context/AuthContext";
import type { RuntimeHealth } from "../../../../hooks/runtime/useOperationalRuntime";
import type { DirectSaleSession } from "../services/directSalesApi";

type Props = {
  session: DirectSaleSession | null;
  runtimeHealth: RuntimeHealth;
};

const HEALTH_DOT: Record<RuntimeHealth, string> = {
  live: "bg-emerald-500",
  polling: "bg-amber-400",
  offline: "bg-red-400",
  disabled: "bg-slate-300",
};

export function DirectSalesTopBar({ session, runtimeHealth }: Props) {
  const { user } = useAuth();
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.login || "Operator";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-slate-900">Terminal sprzedaży</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-700">{name}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">Sesja {session ? `#${session.id}` : "—"}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[runtimeHealth]}`} />
        <span>Runtime: {runtimeHealth}</span>
      </div>
    </header>
  );
}

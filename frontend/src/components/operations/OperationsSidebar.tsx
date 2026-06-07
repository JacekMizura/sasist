import { Link } from "react-router-dom";

type Props = {
  replenishmentCount: number;
  alertCount: number;
};

export function OperationsSidebar({ replenishmentCount, alertCount }: Props) {
  const items = [
    { to: "/wms/operations/tasks", label: "Kolejki zadań", badge: null },
    { to: "/wms/operations/replenishment", label: "Uzupełnienia", badge: replenishmentCount },
    { to: "/wms/operations/alerts", label: "Alerty", badge: alertCount },
    { to: "/wms/operations/operators", label: "Operatorzy", badge: null },
    { to: "/wms/direct-sales", label: "Sprzedaż stacjonarna", badge: null },
  ];
  return (
    <aside className="w-full shrink-0 space-y-1 md:w-44">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Operacje</div>
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-sm text-slate-700 hover:border-slate-200 hover:bg-slate-50"
        >
          <span>{it.label}</span>
          {it.badge != null && it.badge > 0 ? (
            <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-semibold text-white">
              {it.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </aside>
  );
}

import { NavLink } from "react-router-dom";

import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavItemClassName,
} from "../../design-system/brandUi";

type Props = {
  replenishmentCount: number;
  alertCount: number;
};

export function OperationsSidebar({ replenishmentCount, alertCount }: Props) {
  const items = [
    { to: "/wms/operations/tasks", label: "Kolejki zadań", badge: null as number | null },
    { to: "/wms/operations/replenishment", label: "Uzupełnienia", badge: replenishmentCount },
    { to: "/wms/operations/alerts", label: "Alerty", badge: alertCount },
    { to: "/wms/operations/operators", label: "Operatorzy", badge: null },
    { to: "/wms/direct-sales", label: "Sprzedaż stacjonarna", badge: null },
  ];
  return (
    <aside className="w-full shrink-0 space-y-0.5 md:w-44">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Operacje</div>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            `${brandSidebarNavItemClassName(isActive, { compact: true })} justify-between`
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
              <span className="min-w-0 truncate">{it.label}</span>
              {it.badge != null && it.badge > 0 ? (
                <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-semibold text-white">
                  {it.badge}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </aside>
  );
}

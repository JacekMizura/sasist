import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/wms/operations", end: true, label: "Pulpit" },
  { to: "/wms/operations/replenishment", label: "Uzupełnienia" },
  { to: "/wms/operations/tasks", label: "Zadania" },
  { to: "/wms/operations/operators", label: "Operatorzy" },
  { to: "/wms/operations/alerts", label: "Alerty" },
] as const;

export function OperationsSubNav() {
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            `whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium ${
              isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}

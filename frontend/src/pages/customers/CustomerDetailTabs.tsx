import { NavLink, useParams } from "react-router-dom";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-[36px] items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200/80"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");

export function CustomerDetailTabs() {
  const { id } = useParams<{ id: string }>();
  if (!id || !/^\d+$/.test(id)) return null;

  const base = `/customers/${id}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-100 pb-3" aria-label="Sekcje klienta">
      <NavLink to={base} end className={tabClass}>
        Dane klienta
      </NavLink>
      <NavLink to={`${base}/historia-zakupow`} className={tabClass}>
        Historia zakupów
      </NavLink>
    </nav>
  );
}

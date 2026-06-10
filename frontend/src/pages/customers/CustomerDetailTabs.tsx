import { NavLink, useParams } from "react-router-dom";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-[36px] items-center border-b-2 px-1 pb-2 pt-1 text-sm font-medium transition-colors -mb-px",
    isActive
      ? "border-blue-600 text-blue-700"
      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
  ].join(" ");

export function CustomerDetailTabs() {
  const { id } = useParams<{ id: string }>();
  if (!id || !/^\d+$/.test(id)) return null;

  const base = `/customers/${id}`;

  return (
    <nav className="flex flex-wrap gap-6 border-b border-slate-200" aria-label="Sekcje klienta">
      <NavLink to={base} end className={tabClass}>
        Dane klienta
      </NavLink>
      <NavLink to={`${base}/historia-zakupow`} className={tabClass}>
        Historia zakupów
      </NavLink>
      <NavLink to={`${base}/aktywnosc`} className={tabClass}>
        Aktywność
      </NavLink>
    </nav>
  );
}

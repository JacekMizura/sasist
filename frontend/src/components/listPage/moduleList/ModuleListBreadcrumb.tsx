import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router-dom";

export type ModuleListBreadcrumbItem = {
  label: string;
  to?: string;
};

type Props = {
  items: ModuleListBreadcrumbItem[];
};

/** Spójna ścieżka nawigacji list modułu (wzorzec zwrotów). */
export function ModuleListBreadcrumb({ items }: Props) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-400" aria-label="Ścieżka nawigacji">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 transition hover:text-slate-900"
        aria-label="Panel"
      >
        <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-2">
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {isLast || !item.to ? (
              <span className="font-medium text-slate-900">{item.label}</span>
            ) : (
              <Link to={item.to} className="transition hover:text-slate-900">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

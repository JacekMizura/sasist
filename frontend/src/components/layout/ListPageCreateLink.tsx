import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

/** Primary “create” control for list pages — matches compact filter toolbar height. */
export const listPageCreateActionClass =
  "inline-flex h-[2.375rem] shrink-0 items-center gap-2 rounded-md bg-slate-800 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50";

export function ListPageCreateLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className={listPageCreateActionClass}>
      <Plus className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.25} aria-hidden />
      <span className="whitespace-nowrap">{children}</span>
    </Link>
  );
}

export function ListPageCreateButton({
  onClick,
  children,
  disabled,
  type = "button",
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={listPageCreateActionClass}>
      <Plus className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2.25} aria-hidden />
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

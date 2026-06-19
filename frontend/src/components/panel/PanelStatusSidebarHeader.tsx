import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

export function PanelStatusSidebarCollapseButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      aria-label={collapsed ? "Rozwiń panel statusów" : "Zwiń panel statusów"}
    >
      <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
    </button>
  );
}

export type PanelStatusSidebarHeaderProps = {
  title: string;
  collapsed?: boolean;
  titleTrailing?: ReactNode;
  onToggleCollapsed?: () => void;
};

export function PanelStatusSidebarHeader({
  title,
  collapsed,
  titleTrailing,
  onToggleCollapsed,
}: PanelStatusSidebarHeaderProps) {
  return (
    <div className={`mb-2 flex items-center gap-2 ${collapsed ? "justify-end" : "justify-between"}`}>
      {!collapsed ? (
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h2>
      ) : (
        <span className="sr-only">{title}</span>
      )}
      {(titleTrailing != null || onToggleCollapsed != null) && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {titleTrailing}
          {onToggleCollapsed ? (
            <PanelStatusSidebarCollapseButton collapsed={!!collapsed} onToggle={onToggleCollapsed} />
          ) : null}
        </div>
      )}
    </div>
  );
}

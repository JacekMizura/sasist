import type { ReactNode } from "react";
import { PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS } from "../../panel/panelStatusTreeStyles";
import { flatListSidebarDividerClass } from "../../layout/flatSectionTokens";

type ModuleStatusSidebarShellProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpenLabel?: string;
  sidebar: ReactNode;
  mobileDrawerSidebar: ReactNode;
  statusDrawerOpen: boolean;
  onStatusDrawerOpenChange: (open: boolean) => void;
};

export function ModuleStatusSidebarShell({
  collapsed,
  onToggleCollapsed: _onToggleCollapsed,
  mobileOpenLabel = "Statusy panelu",
  sidebar,
  mobileDrawerSidebar,
  statusDrawerOpen,
  onStatusDrawerOpenChange,
}: ModuleStatusSidebarShellProps) {
  void _onToggleCollapsed;

  return (
    <>
      <button
        type="button"
        className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 lg:hidden"
        onClick={() => onStatusDrawerOpenChange(true)}
      >
        {mobileOpenLabel}
      </button>
      <aside
        className={`${PANEL_STATUS_SIDEBAR_PAGE_SHELL_CLASS} ${flatListSidebarDividerClass} ${collapsed ? "lg:w-14" : "lg:w-[18rem]"}`}
      >
        {sidebar}
      </aside>
      {statusDrawerOpen ? (
        <div className="fixed inset-0 z-[420] flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45"
            aria-label="Zamknij panel statusów"
            onClick={() => onStatusDrawerOpenChange(false)}
          />
          <div className="relative w-[min(20rem,92vw)] overflow-y-auto border-r border-slate-100 bg-white p-3 shadow-xl">
            {mobileDrawerSidebar}
          </div>
        </div>
      ) : null}
    </>
  );
}

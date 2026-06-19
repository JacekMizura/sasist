import type { CSSProperties, ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { panelSidebarSubRowStyleRich } from "../../../utils/panelSidebarHierarchy";
import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import { moduleListRowActionsRevealClass, moduleListTdClass } from "./moduleListTableTokens";

export function moduleListStatusPillStyle(brief: PanelConfigurableUiStatusBrief): CSSProperties {
  const base = panelSidebarSubRowStyleRich(brief, brief.main_group, false, {
    barWidthPx: 0,
    inlineLabel: true,
  });
  return { ...base, borderLeft: "none" };
}

type ModuleListStatusPillProps = {
  status: PanelConfigurableUiStatusBrief | null;
  /** Etykieta gdy brak statusu. */
  emptyLabel?: string;
  /** Opcjonalna ikona ✓ dla statusów terminalnych. */
  terminal?: boolean;
  terminalPositive?: boolean;
};

export function ModuleListStatusPill({
  status,
  emptyLabel = "Bez etykiety",
  terminal = false,
  terminalPositive = true,
}: ModuleListStatusPillProps) {
  if (!status) {
    return (
      <span className="inline-flex rounded-full border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400">
        {emptyLabel}
      </span>
    );
  }

  const label = status.name.trim().toUpperCase();

  return (
    <span
      className="inline-flex max-w-[min(100%,14rem)] items-center gap-0.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      style={moduleListStatusPillStyle(status)}
      title={status.name}
    >
      {terminal ? (
        <span
          className={`shrink-0 ${terminalPositive ? "text-emerald-800/80" : "text-slate-600/85"}`}
          aria-hidden
        >
          ✓
        </span>
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

type ModuleListRowActionsCellProps = {
  children: ReactNode;
  ariaLabel?: string;
};

/** Ostatnia kolumna — akcje ujawniane po najechaniu na wiersz (wzorzec zwrotów). */
export function ModuleListRowActionsCell({ children, ariaLabel = "Akcje" }: ModuleListRowActionsCellProps) {
  return (
    <td className={`${moduleListTdClass} text-center`} onClick={(e) => e.stopPropagation()}>
      <div className={`module-list-row-actions ${moduleListRowActionsRevealClass} inline-flex justify-center`} aria-label={ariaLabel}>
        {children}
      </div>
      <button
        type="button"
        className="ml-1 inline-flex rounded-md p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100 lg:hidden"
        aria-label="Więcej akcji"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </td>
  );
}

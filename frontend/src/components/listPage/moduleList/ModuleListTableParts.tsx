import type { CSSProperties, ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import { PanelTreeStatusItem } from "../../panel/PanelTreeStatusItem";
import { getPanelStatusWmsMarkers } from "../../orders/panelStatusWmsChips";
import type { OrderUiStatusWithCount } from "../../../types/orderUiStatus";
import { moduleListRowActionsRevealClass, moduleListTdClass } from "./moduleListTableTokens";

/** @deprecated Prefer {@link PanelTreeStatusItem}. */
export function moduleListStatusPillStyle(_brief: PanelConfigurableUiStatusBrief): CSSProperties {
  return {};
}

type ModuleListStatusPillProps = {
  status: PanelConfigurableUiStatusBrief | null;
  emptyLabel?: string;
  terminal?: boolean;
  terminalPositive?: boolean;
};

/**
 * Kolumna Status na listach — ten sam komponent co lewy Panel Statusów ({@link PanelTreeStatusItem}).
 */
export function ModuleListStatusPill({ status, emptyLabel = "Bez etykiety" }: ModuleListStatusPillProps) {
  if (!status) {
    return (
      <span className="inline-flex rounded-lg border border-dashed border-slate-200 bg-white px-2.5 py-2 text-[12px] font-medium text-slate-400">
        {emptyLabel}
      </span>
    );
  }

  const markers = getPanelStatusWmsMarkers(
    { name: status.name } as OrderUiStatusWithCount,
    status.main_group,
  );

  return (
    <PanelTreeStatusItem
      compact
      name={status.name}
      mainGroup={status.main_group}
      colors={{
        color: status.color,
        badge_color: status.badge_color,
        background_color: status.background_color,
        text_color: status.text_color,
      }}
      imageUrl={status.image_url}
      markers={markers}
    />
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
